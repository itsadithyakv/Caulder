import { net } from "electron";
import { randomUUID } from "node:crypto";
import type { Db } from "../db/connection";
import { readConnection } from "./credentials";
import {
  forgetTombstones,
  listTombstones,
  readSync,
  writeSync,
  writeSyncError,
} from "../repositories/google";
import { planEvents, planTasks } from "@shared/gsync";
import type { LocalBlock, LocalTask, RemoteEvent, RemoteTask } from "@shared/gsync";
import { shiftDay, today as todayIn } from "@shared/dates";
import type { GoogleSync } from "@shared/domain";

/**
 * Talking to the script in the user's own Google account.
 *
 * This is the first and only outbound request Caulder makes, so it is hedged
 * accordingly:
 *
 *  - **Nothing happens unless it is switched on.** No connection, no calls.
 *  - **It cannot hang the app.** Every request has a deadline, and a sync is
 *    something you ask for, never something a screen waits on to render.
 *  - **The renderer never sees the URL.** It sends one once and afterwards can
 *    only ask whether a connection exists; the same rule as attachments, where
 *    the renderer passes an id and main derives the path.
 *  - **A failure is recorded and shown**, not swallowed. A sync that quietly
 *    stopped working is worse than one that never worked, because the stale
 *    data still looks current.
 *
 * The reconciling itself is in shared/gsync.ts, which has no network in it and
 * is where the cases that can lose work are written down as tests.
 */

/** Long enough for a cold Apps Script start, short enough to give up on. */
const TIMEOUT_MS = 45_000;

/**
 * How far either side of today a sync looks.
 *
 * The window is the whole safety story. Google is asked about these days and
 * no others, so its silence about anything else means nothing - and a block
 * next March is never touched by a sync run this week.
 */
const BEHIND_DAYS = 14;
const AHEAD_DAYS = 45;

type Reply<T> = { ok: true; data: T } | { ok: false; error: string };

async function call<T>(action: string, payload: Record<string, unknown>): Promise<T> {
  const connection = readConnection();
  if (!connection) throw new Error("Caulder is not connected to Google yet.");

  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), TIMEOUT_MS);

  try {
    const response = await net.fetch(connection.url, {
      method: "POST",
      // Apps Script answers a POST with a redirect to a second host, and the
      // body it returns comes from following it. text/plain rather than JSON
      // is deliberate: a JSON content type makes the browser stack send a
      // CORS preflight that Apps Script does not answer.
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ ...payload, action, secret: connection.secret }),
      signal: stop.signal,
      redirect: "follow",
    });

    if (!response.ok) {
      throw new Error(
        `Google answered ${response.status}. If that is 401 or 403, the deployment is probably not set to "Anyone".`,
      );
    }

    const text = await response.text();

    let parsed: Reply<T>;
    try {
      parsed = JSON.parse(text) as Reply<T>;
    } catch {
      // Almost always Google's sign-in page, served because the deployment is
      // set to "Only myself". Saying so beats printing HTML at somebody.
      throw new Error(
        "Google returned a web page rather than an answer. Check the deployment is set to run as you, with access set to Anyone.",
      );
    }

    if (!parsed.ok) throw new Error(parsed.error);
    return parsed.data;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Google did not answer in time. It may be slow rather than broken.");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export type Hello = {
  email: string;
  calendars: { id: string; name: string }[];
  taskLists: { id: string; name: string }[];
};

/** The connection test, and where the calendar and list choices come from. */
export async function hello(): Promise<Hello> {
  return call<Hello>("hello", {});
}

/* ---- Reading the two sides ---------------------------------------------- */

type BlockRow = {
  id: string;
  day: string;
  starts_at: string;
  minutes: number;
  title: string;
  notes: string | null;
  source: string;
  external_id: string | null;
  etag: string | null;
  is_dirty: number;
};

type TaskRow = {
  id: string;
  title: string;
  due_on: string;
  notes: string | null;
  status: string;
  external_id: string | null;
  is_dirty: number;
};

function companyFor(db: Db, companyId: string) {
  const row = db
    .prepare(
      `SELECT timezone, google_calendar_id, google_tasklist_id
         FROM companies WHERE id = ?`,
    )
    .get(companyId) as
    | { timezone: string; google_calendar_id: string | null; google_tasklist_id: string | null }
    | undefined;
  if (!row) throw new Error("That workspace no longer exists.");
  return row;
}

/* ---- The sync ------------------------------------------------------------ */

type SyncOutcome = GoogleSync & { ran: boolean };

/**
 * One round trip each way, for the calendar and then the task list.
 *
 * The order matters in one place only: tombstones are cleared *after* Google
 * has been told, never before. Dropping them first and then failing would
 * leave the event in the calendar with nothing left to say it should go.
 */
export async function syncNow(db: Db, companyId: string, now = new Date()): Promise<SyncOutcome> {
  const company = companyFor(db, companyId);
  const day = todayIn(company.timezone, now);
  const from = shiftDay(day, -BEHIND_DAYS);
  const to = shiftDay(day, AHEAD_DAYS);

  let pushed = 0;
  let pulled = 0;
  let conflicts = 0;

  try {
    if (company.google_calendar_id) {
      const counts = await syncCalendar(db, companyId, company, { from, to });
      pushed += counts.pushed;
      pulled += counts.pulled;
      conflicts += counts.conflicts;
    }

    if (company.google_tasklist_id) {
      const counts = await syncTasks(db, companyId, company.google_tasklist_id);
      pushed += counts.pushed;
      pulled += counts.pulled;
      conflicts += counts.conflicts;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    writeSyncError(db, companyId, message);
    throw error;
  }

  const state: GoogleSync = {
    lastSyncedAt: now.toISOString(),
    syncedFrom: from,
    syncedTo: to,
    pushed,
    pulled,
    conflicts,
    lastError: null,
  };
  writeSync(db, companyId, state);

  return { ...state, ran: true };
}

async function syncCalendar(
  db: Db,
  companyId: string,
  company: { timezone: string; google_calendar_id: string | null },
  window: { from: string; to: string },
) {
  const calendarId = company.google_calendar_id;
  if (!calendarId) return { pushed: 0, pulled: 0, conflicts: 0 };

  const rows = db
    .prepare(
      `SELECT id, day, starts_at, minutes, title, notes, source, external_id, etag, is_dirty
         FROM blocks WHERE company_id = ?`,
    )
    .all(companyId) as BlockRow[];

  const local: LocalBlock[] = rows.map((row) => ({
    id: row.id,
    day: row.day,
    startsAt: row.starts_at,
    minutes: row.minutes,
    title: row.title,
    source: row.source === "google" ? "google" : "caulder",
    externalId: row.external_id,
    etag: row.etag,
    isDirty: row.is_dirty === 1,
  }));

  const { events } = await call<{ events: RemoteEvent[] }>("pullEvents", {
    calendarId,
    timeZone: company.timezone,
    from: window.from,
    to: window.to,
  });

  const tombstones = listTombstones(db, companyId, "event");
  const plan = planEvents(local, events, tombstones, window);

  const notesById = new Map(rows.map((row) => [row.id, row.notes]));
  const withNotes = (block: LocalBlock) => ({
    ...block,
    notes: notesById.get(block.id) ?? null,
  });

  const result = await call<{
    created: { blockId: string; eventId: string; etag: string | null }[];
    updated: { blockId: string; eventId: string; etag: string | null }[];
    failures: { blockId: string; error: string }[];
  }>("pushEvents", {
    calendarId,
    timeZone: company.timezone,
    create: [...plan.create, ...plan.restore].map(withNotes),
    update: plan.update.map(withNotes),
    remove: plan.remove,
  });

  const apply = db.transaction(() => {
    for (const made of [...result.created, ...result.updated]) {
      db.prepare(
        `UPDATE blocks SET external_id = ?, etag = ?, is_dirty = 0 WHERE id = ?`,
      ).run(made.eventId, made.etag, made.blockId);
    }

    for (const event of plan.adopt) {
      db.prepare(
        `INSERT INTO blocks
           (id, company_id, day, starts_at, minutes, title, kind, notes, task_id,
            source, external_id, etag, is_dirty, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'meeting', NULL, NULL, 'google', ?, ?, 0, ?, ?)`,
      ).run(
        randomUUID(),
        companyId,
        event.day,
        event.startsAt,
        event.minutes,
        event.title,
        event.id,
        event.etag,
        new Date().toISOString(),
        new Date().toISOString(),
      );
    }

    for (const { block, from } of plan.refresh) {
      db.prepare(
        `UPDATE blocks SET day = ?, starts_at = ?, minutes = ?, title = ?, etag = ?,
                           -- Moved in Calendar is moved, so the reminder is
                           -- owed again. Same rule as dragging it here.
                           reminded_at = NULL,
                           is_dirty = 0, updated_at = ?
           WHERE id = ?`,
      ).run(
        from.day,
        from.startsAt,
        from.minutes,
        from.title,
        from.etag,
        new Date().toISOString(),
        block.id,
      );
    }

    for (const block of plan.drop) {
      db.prepare(`DELETE FROM blocks WHERE id = ?`).run(block.id);
    }

    // Only now. Google has been told.
    forgetTombstones(db, companyId, "event");
  });
  apply();

  return {
    pushed: result.created.length + result.updated.length + plan.remove.length,
    pulled: plan.adopt.length + plan.refresh.length + plan.drop.length,
    conflicts: plan.conflicts,
  };
}

async function syncTasks(db: Db, companyId: string, taskListId: string) {
  const rows = db
    .prepare(
      `SELECT id, title, due_on, notes, status, external_id, is_dirty
         FROM tasks WHERE company_id = ?`,
    )
    .all(companyId) as TaskRow[];

  const local: LocalTask[] = rows.map((row) => ({
    id: row.id,
    title: row.title,
    dueOn: row.due_on,
    notes: row.notes,
    done: row.status === "done",
    externalId: row.external_id,
    isDirty: row.is_dirty === 1,
  }));

  const { tasks, complete } = await call<{ tasks: RemoteTask[]; complete: boolean }>(
    "pullTasks",
    { taskListId },
  );

  const tombstones = listTombstones(db, companyId, "task");
  // `complete` is the script saying whether it read to the end of the list.
  // Nothing is deleted here on the strength of a page that stopped early.
  const plan = planTasks(local, tasks, tombstones, complete);

  const result = await call<{
    created: { taskId: string; externalId: string }[];
    failures: { taskId: string; error: string }[];
  }>("pushTasks", {
    taskListId,
    create: plan.create,
    update: plan.update,
    remove: plan.remove,
  });

  const apply = db.transaction(() => {
    for (const made of result.created) {
      db.prepare(`UPDATE tasks SET external_id = ?, is_dirty = 0 WHERE id = ?`).run(
        made.externalId,
        made.taskId,
      );
    }

    for (const task of plan.update) {
      db.prepare(`UPDATE tasks SET is_dirty = 0 WHERE id = ?`).run(task.id);
    }

    for (const entry of plan.adopt) {
      db.prepare(
        `INSERT INTO tasks
           (id, company_id, lead_id, title, kind, status, due_on, notes,
            completed_at, external_id, is_dirty, created_at, updated_at)
         VALUES (?, ?, NULL, ?, 'todo', ?, ?, ?, ?, ?, 0, ?, ?)`,
      ).run(
        randomUUID(),
        companyId,
        entry.title,
        entry.done ? "done" : "open",
        // Google allows a task with no date; Caulder does not. Today is the
        // least surprising place to put one that arrives without a day.
        entry.due ?? todayIn("UTC"),
        entry.notes,
        entry.done ? new Date().toISOString() : null,
        entry.id,
        new Date().toISOString(),
        new Date().toISOString(),
      );
    }

    for (const { task, from } of plan.refresh) {
      db.prepare(
        `UPDATE tasks SET title = ?, notes = ?, status = ?, due_on = ?,
                          completed_at = ?, is_dirty = 0, updated_at = ?
           WHERE id = ?`,
      ).run(
        from.title,
        from.notes,
        from.done ? "done" : "open",
        from.due ?? task.dueOn,
        from.done ? new Date().toISOString() : null,
        new Date().toISOString(),
        task.id,
      );
    }

    for (const task of plan.drop) {
      db.prepare(`DELETE FROM tasks WHERE id = ?`).run(task.id);
    }

    forgetTombstones(db, companyId, "task");
  });
  apply();

  return {
    pushed: result.created.length + plan.update.length + plan.remove.length,
    pulled: plan.adopt.length + plan.refresh.length + plan.drop.length,
    conflicts: plan.conflicts,
  };
}

export { readSync };
