import type { Db } from "../db/connection";
import { createTask, deleteTask, findTask, rescheduleTask, updateTask } from "../repositories/tasks";
import { createBlock, deleteBlock, moveBlock } from "../repositories/blocks";
import { search } from "./brain";
import { allMemories } from "./memories";
import { askedStems, fuseRecall, recall, type Memory } from "@shared/memories";
import { addReminder } from "./nudges";
import { blockKindFor } from "@shared/quickadd";
import { blockInput, taskInput, type Task, type TaskKind } from "@shared/domain";
import { shiftDay, today as todayIn } from "@shared/dates";
import { localeFor } from "@shared/countries";
import { withHome } from "../repositories/companies";
import {
  moveInput,
  question,
  taskSnapshot,
  type Answer,
  type Busy,
  type LineContext,
  type OpenTask,
  type Question,
  type Said,
  type TaskSnapshot,
  type Timed,
} from "@shared/lines";

/**
 * What the quick line needs to mean what is already there (shared/lines.ts),
 * and the edits it asks for: a task moved, cancelled and put back, renamed -
 * and the answer to a question about the day, a contact or the money.
 *
 * A task and its hour on the Calendar are two rows (services/quickadd.ts), so
 * every edit here moves both, in one transaction: a task moved to Friday with
 * its hour left on Tuesday is the half nobody asked for.
 */

const DAYS_AHEAD = 30;
const DAYS_BACK = 180;

export function lineContext(db: Db, companyId: string, today: unknown): LineContext {
  const day = typeof today === "string" && /^\d{4}-\d{2}-\d{2}$/.test(today) ? today : new Date().toISOString().slice(0, 10);

  const open = (
    db
      .prepare(
        `SELECT t.id, t.title, t.due_on, t.lead_id, l.name AS lead_name, b.starts_at, b.minutes
         FROM tasks t
         LEFT JOIN leads l ON l.id = t.lead_id
         LEFT JOIN blocks b ON b.id = (SELECT id FROM blocks WHERE task_id = t.id ORDER BY day, starts_at LIMIT 1)
         WHERE t.company_id = ? AND t.status = 'open'
         ORDER BY t.due_on ASC, t.created_at ASC
         LIMIT 400`,
      )
      .all(companyId) as {
      id: string;
      title: string;
      due_on: string;
      lead_id: string | null;
      lead_name: string | null;
      starts_at: string | null;
      minutes: number | null;
    }[]
  ).map(
    (row): OpenTask => ({
      id: row.id,
      title: row.title,
      dueOn: row.due_on,
      time: row.starts_at,
      minutes: row.minutes,
      leadId: row.lead_id,
      leadName: row.lead_name,
    }),
  );

  const busy = (
    db
      .prepare(
        `SELECT day, starts_at, minutes, title, task_id FROM blocks
         WHERE company_id = ? AND day BETWEEN ? AND ?
         ORDER BY day, starts_at`,
      )
      .all(companyId, day, shiftDay(day, DAYS_AHEAD)) as {
      day: string;
      starts_at: string;
      minutes: number;
      title: string;
      task_id: string | null;
    }[]
  ).map((row): Busy => ({ day: row.day, startsAt: row.starts_at, minutes: row.minutes, title: row.title, taskId: row.task_id }));

  // What was typed before, tasks and hours alike, the most said first.
  const counted = new Map<string, Said>();
  const rows = db
    .prepare(
      `SELECT title, COUNT(*) AS n, MAX(created_at) AS last FROM tasks
       WHERE company_id = ? AND created_at >= ? GROUP BY lower(title)
       UNION ALL
       SELECT title, COUNT(*) AS n, MAX(day) AS last FROM blocks
       WHERE company_id = ? AND day >= ? GROUP BY lower(title)`,
    )
    .all(companyId, shiftDay(day, -365), companyId, shiftDay(day, -365)) as { title: string; n: number; last: string }[];
  for (const row of rows) {
    const key = row.title.trim().toLowerCase();
    const before = counted.get(key);
    counted.set(key, {
      title: before?.title ?? row.title.trim(),
      count: (before?.count ?? 0) + row.n,
      last: before && before.last > row.last ? before.last : row.last,
    });
  }
  const said = [...counted.values()].sort((a, b) => b.count - a.count || b.last.localeCompare(a.last)).slice(0, 400);

  const timed = (
    db
      .prepare(
        `SELECT title, starts_at, minutes, day FROM blocks
         WHERE company_id = ? AND day BETWEEN ? AND ?
         ORDER BY day DESC LIMIT 1000`,
      )
      .all(companyId, shiftDay(day, -DAYS_BACK), day) as { title: string; starts_at: string; minutes: number; day: string }[]
  ).map((row): Timed => ({ title: row.title, startsAt: row.starts_at, minutes: row.minutes, day: row.day }));

  return { open, busy, said, timed };
}

function openTask(db: Db, id: unknown): Task {
  if (typeof id !== "string" || id.length === 0) throw new Error("Missing task id.");
  const task = findTask(db, id);
  if (!task) throw new Error("That task no longer exists.");
  return task;
}

function blockOf(db: Db, taskId: string): { id: string; day: string; starts_at: string; minutes: number } | null {
  return (
    (db
      .prepare(`SELECT id, day, starts_at, minutes FROM blocks WHERE task_id = ? ORDER BY day, starts_at LIMIT 1`)
      .get(taskId) as { id: string; day: string; starts_at: string; minutes: number } | undefined) ?? null
  );
}

/**
 * "Push gym to tomorrow", "move dentist to 5": the task to its new day, and
 * its hour with it. Said with only a day, the hour stays the hour it was; said
 * with a time and no hour yet, the hour is set aside now. A reminder asked for
 * goes with it, owed again.
 */
export function moveTask(db: Db, id: unknown, raw: unknown): { task: Task; time: string | null } {
  const to = moveInput.parse(raw);
  return db.transaction(() => {
    const task = openTask(db, id);
    const moved = rescheduleTask(db, task.id, to.day);
    const block = blockOf(db, task.id);
    let time: string | null = to.time;
    if (block) {
      time = to.time ?? block.starts_at;
      moveBlock(db, block.id, { day: to.day, startsAt: time, minutes: to.minutes ?? block.minutes });
    } else if (to.time) {
      createBlock(
        db,
        task.companyId,
        blockInput.parse({
          day: to.day,
          startsAt: to.time,
          minutes: to.minutes ?? 60,
          title: task.title,
          kind: blockKindFor({ kind: task.kind, area: task.area }),
          notes: null,
          taskId: task.id,
          priority: task.priority,
          remindMinutes: null,
          repeat: null,
        }),
      );
    }
    db.prepare(`UPDATE reminders SET day = ?, time = COALESCE(?, time), told_at = NULL WHERE task_id = ?`).run(to.day, to.time, task.id);
    return { task: moved, time };
  })();
}

/**
 * "Cancel the dentist": the task and its hour both go, and what they were
 * comes back, so Undo can put them back as they were.
 */
export function cancelTask(db: Db, id: unknown): TaskSnapshot {
  return db.transaction(() => {
    const task = openTask(db, id);
    const block = blockOf(db, task.id);
    const reminder = db.prepare(`SELECT day, time FROM reminders WHERE task_id = ? AND told_at IS NULL LIMIT 1`).get(task.id) as
      | { day: string; time: string | null }
      | undefined;
    const snapshot = taskSnapshot.parse({
      title: task.title,
      kind: task.kind,
      area: task.area,
      priority: task.priority,
      dueOn: task.dueOn,
      leadId: task.leadId,
      notes: task.notes,
      block: block ? { day: block.day, startsAt: block.starts_at, minutes: block.minutes } : null,
      reminder: reminder ? { day: reminder.day, time: reminder.time } : null,
    });
    const hours = db.prepare(`SELECT id FROM blocks WHERE task_id = ?`).all(task.id) as { id: string }[];
    for (const hour of hours) deleteBlock(db, hour.id);
    deleteTask(db, task.id);
    return snapshot;
  })();
}

/** Undo: what was cancelled, back as it was - a new task, since the old one may already have left Google. */
export function restoreTask(db: Db, companyId: string, raw: unknown): Task {
  const was = taskSnapshot.parse(raw);
  return db.transaction(() => {
    if (was.leadId && !db.prepare(`SELECT 1 FROM leads WHERE id = ? AND company_id = ?`).get(was.leadId, companyId)) {
      was.leadId = null;
    }
    const task = createTask(
      db,
      companyId,
      taskInput.parse({
        title: was.title,
        kind: was.kind as TaskKind,
        area: was.area,
        priority: was.priority,
        dueOn: was.dueOn,
        leadId: was.leadId,
        notes: was.notes,
      }),
    );
    if (was.block) {
      createBlock(
        db,
        companyId,
        blockInput.parse({
          day: was.block.day,
          startsAt: was.block.startsAt,
          minutes: was.block.minutes,
          title: was.title,
          kind: blockKindFor({ kind: was.kind as TaskKind, area: was.area }),
          notes: null,
          taskId: task.id,
          priority: was.priority,
          remindMinutes: null,
          repeat: null,
        }),
      );
    }
    if (was.reminder) addReminder(db, { companyId, taskId: task.id, title: was.title, day: was.reminder.day, time: was.reminder.time });
    return task;
  })();
}

/** "Rename deck to pitch deck": the task, and its hour on the Calendar, called the new thing. */
export function renameTask(db: Db, id: unknown, title: unknown): Task {
  if (typeof title !== "string" || title.trim().length === 0) throw new Error("Say what to call it.");
  return db.transaction(() => {
    const task = openTask(db, id);
    const renamed = updateTask(
      db,
      task.id,
      taskInput.parse({
        title: title.trim(),
        kind: task.kind,
        area: task.area,
        priority: task.priority,
        dueOn: task.dueOn,
        leadId: task.leadId,
        notes: task.notes,
      }),
    );
    db.prepare(`UPDATE blocks SET title = ?, is_dirty = 1, updated_at = ? WHERE task_id = ?`).run(
      renamed.title,
      new Date().toISOString(),
      task.id,
    );
    return renamed;
  })();
}

const hhmm = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
const minutesOf = (time: string) => {
  const [hour = 0, minute = 0] = time.split(":").map(Number);
  return hour * 60 + minute;
};
/** A 24-hour time the way it is said: "5:30 PM". */
function said(time: string): string {
  const [hour = 0, minute = 0] = time.split(":").map(Number);
  const half = hour >= 12 ? "PM" : "AM";
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve}${minute ? `:${String(minute).padStart(2, "0")}` : ""} ${half}`;
}

/** A memory as an answer: "Mummy · Birthday: 15 March", or what it says when nothing leads it. */
function sayMemory(memory: Memory): string {
  const whose = memory.pageTitle === "About me" || memory.pageTitle === "Where things are" || memory.pageTitle === "Lent and borrowed" ? "" : `${memory.pageTitle} · `;
  return memory.fact ? `${whose}${memory.fact}` : memory.says;
}

function memoryItem(memory: Memory): { label: string; detail: string | null } {
  return { label: memory.fact ?? memory.says, detail: `${memory.pageTitle}, ${memory.day}${memory.current ? "" : " - said before, since changed"}` };
}

/** A question, answered from what is kept. Nothing leaves the machine and nothing is guessed. */
export function answerQuestion(
  db: Db,
  companyId: string,
  raw: unknown,
  /** For recall: the memories nearest in meaning, when the model on this machine found any (phase 21). */
  meant: readonly Memory[] = [],
): Answer {
  const asked = question.parse(raw);
  switch (asked.ask) {
    case "day": {
      const tasks = db
        .prepare(
          `SELECT t.title, b.starts_at FROM tasks t
           LEFT JOIN blocks b ON b.id = (SELECT id FROM blocks WHERE task_id = t.id ORDER BY starts_at LIMIT 1)
           WHERE t.company_id = ? AND t.status = 'open' AND t.due_on = ?`,
        )
        .all(companyId, asked.day) as { title: string; starts_at: string | null }[];
      const hours = db
        .prepare(`SELECT title, starts_at, minutes FROM blocks WHERE company_id = ? AND day = ? AND task_id IS NULL ORDER BY starts_at`)
        .all(companyId, asked.day) as { title: string; starts_at: string; minutes: number }[];
      const items = [
        ...hours.map((hour) => ({ at: hour.starts_at, label: hour.title, detail: `${said(hour.starts_at)} – ${said(hhmm(minutesOf(hour.starts_at) + hour.minutes))}` })),
        ...tasks.map((task) => ({ at: task.starts_at ?? "99:99", label: task.title, detail: task.starts_at ? said(task.starts_at) : "any time" })),
      ].sort((a, b) => a.at.localeCompare(b.at));
      return {
        say: items.length === 0 ? `Nothing on ${asked.label.toLowerCase()} yet.` : `${asked.label}: ${items.length === 1 ? "one thing" : `${items.length} things`}.`,
        items: items.map(({ label, detail }) => ({ label, detail })),
      };
    }
    case "free": {
      const hours = db
        .prepare(`SELECT title, starts_at, minutes FROM blocks WHERE company_id = ? AND day = ? ORDER BY starts_at`)
        .all(companyId, asked.day) as { title: string; starts_at: string; minutes: number }[];
      if (asked.time === null) {
        return {
          say: hours.length === 0 ? `${asked.label} is free, all of it.` : `${asked.label}: ${hours.length === 1 ? "one hour taken" : `${hours.length} hours taken`}.`,
          items: hours.map((hour) => ({ label: hour.title, detail: `${said(hour.starts_at)} – ${said(hhmm(minutesOf(hour.starts_at) + hour.minutes))}` })),
        };
      }
      const start = minutesOf(asked.time);
      const clash = hours.filter((hour) => minutesOf(hour.starts_at) < start + 60 && start < minutesOf(hour.starts_at) + hour.minutes);
      return {
        say:
          clash.length === 0
            ? `Free at ${said(asked.time)}, ${asked.label.toLowerCase()}.`
            : `Not free at ${said(asked.time)}: ${clash.map((hour) => hour.title).join(", ")}.`,
        items: clash.map((hour) => ({ label: hour.title, detail: `${said(hour.starts_at)} – ${said(hhmm(minutesOf(hour.starts_at) + hour.minutes))}` })),
      };
    }
    case "contact": {
      const like = `%${asked.name.replace(/[%_]/g, "")}%`;
      const found = db
        .prepare(
          `SELECT name, contact_person, phone, email FROM leads
           WHERE company_id = ? AND (name LIKE ? OR contact_person LIKE ?)
           ORDER BY (lower(name) = lower(?)) DESC, name LIMIT 3`,
        )
        .all(companyId, like, like, asked.name) as { name: string; contact_person: string | null; phone: string | null; email: string | null }[];
      if (found.length === 0) return { say: `No contact called ${asked.name}.`, items: [] };
      const first = found[0]!;
      const want = asked.want === "email" ? first.email : asked.want === "phone" ? first.phone : (first.phone ?? first.email);
      return {
        say: want ? `${first.contact_person ?? first.name}: ${want}` : `${first.name} has no ${asked.want === "email" ? "email" : "number"} saved.`,
        items: found.map((lead) => ({
          label: lead.contact_person ? `${lead.contact_person}, ${lead.name}` : lead.name,
          detail: [lead.phone, lead.email].filter(Boolean).join(" · ") || null,
        })),
      };
    }
    case "recall": {
      const found = fuseRecall(recall(allMemories(db).memories, asked.about), meant).slice(0, 5);
      if (found.length === 0) return { say: `Nothing remembered about ${asked.label} yet.`, items: [] };
      return { say: sayMemory(found[0]!), items: found.map(memoryItem) };
    }
    case "when": {
      // What you told it about them comes first: "when's mummy's birthday" is on Mummy's page.
      const remembered = recall(allMemories(db).memories, asked.about).filter((memory) => memory.current && memory.fact);
      if (remembered[0]) return { say: sayMemory(remembered[0]), items: remembered.slice(0, 5).map(memoryItem) };
      const like = `%${asked.about.replace(/[%_]/g, "")}%`;
      const due = db
        .prepare(`SELECT title, due_on FROM tasks WHERE company_id = ? AND title LIKE ? ORDER BY (status = 'open') DESC, due_on ASC LIMIT 3`)
        .all(companyId, like) as { title: string; due_on: string }[];
      const pages = search(db, companyId, asked.about).filter((hit) => hit.kind === "page").slice(0, 3);
      const items = [
        ...due.map((task) => ({ label: task.title, detail: task.due_on })),
        ...pages.map((hit) => ({ label: hit.title, detail: hit.detail || null })),
      ];
      return {
        say: due[0] ? `“${due[0].title}” is on ${due[0].due_on}.` : pages[0] ? `From your brain: ${pages[0].title}.` : `Nothing kept about ${asked.about} yet.`,
        items,
      };
    }
    case "spent": {
      const like = asked.on ? `%${asked.on.replace(/[%_]/g, "")}%` : "%";
      const total = db
        .prepare(`SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS n FROM spend WHERE company_id = ? AND amount > 0 AND spent_on BETWEEN ? AND ? AND what LIKE ?`)
        .get(companyId, asked.from, asked.to, like) as { total: number; n: number };
      const biggest = db
        .prepare(`SELECT what, SUM(amount) AS amount FROM spend WHERE company_id = ? AND amount > 0 AND spent_on BETWEEN ? AND ? AND what LIKE ? GROUP BY lower(what) ORDER BY amount DESC LIMIT 3`)
        .all(companyId, asked.from, asked.to, like) as { what: string; amount: number }[];
      const place = db.prepare(`SELECT currency, country FROM companies WHERE id = ?`).get(companyId) as { currency: string; country: string | null } | undefined;
      const currency = place?.currency ?? "INR";
      const locale = localeFor(place?.country) ?? (currency === "INR" ? "en-IN" : undefined);
      const money = (amount: number) => new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
      return {
        say:
          total.n === 0
            ? `Nothing spent${asked.on ? ` on ${asked.on}` : ""} ${asked.label.toLowerCase()}.`
            : `${money(total.total)} ${asked.on ? `on ${asked.on} ` : ""}${asked.label.toLowerCase()}, over ${total.n === 1 ? "one thing" : `${total.n} things`}.`,
        items: biggest.map((row) => ({ label: row.what, detail: money(row.amount) })),
      };
    }
    case "find": {
      const hits = search(db, companyId, asked.topic).slice(0, 5);
      return {
        say: hits.length === 0 ? `Nothing kept about ${asked.topic} yet.` : `${hits.length === 1 ? "One place" : `${hits.length} places`} with ${asked.topic}.`,
        items: hits.map((hit) => ({ label: hit.title, detail: hit.detail || null })),
      };
    }
    case "due": {
      const late = db
        .prepare(`SELECT title, due_on FROM tasks WHERE company_id = ? AND status = 'open' AND due_on < ? ORDER BY due_on LIMIT 20`)
        .all(companyId, asked.day) as { title: string; due_on: string }[];
      const now = db
        .prepare(`SELECT title FROM tasks WHERE company_id = ? AND status = 'open' AND due_on = ? ORDER BY priority = 'must' DESC, created_at LIMIT 20`)
        .all(companyId, asked.day) as { title: string }[];
      const parts = [now.length > 0 ? `${now.length} due today` : "nothing due today", late.length > 0 ? `${late.length} late` : null].filter(Boolean);
      return {
        say: `${parts.join(", ")}.`.replace(/^./, (c) => c.toUpperCase()),
        items: [
          ...now.map((task) => ({ label: task.title, detail: "today" })),
          ...late.map((task) => ({ label: task.title, detail: `late, from ${task.due_on}` })),
        ],
      };
    }
    case "did":
      return whatWasDone(db, companyId, asked);
  }
}

/**
 * "Did i go to gym this week": looked for in everything that says a thing was
 * done - a habit ticked, an hour on the calendar, time on a hobby, a task
 * finished - in your home and the company both, since the gym is yours and
 * the call to Rahul the company's. Something counts when it shares a word
 * that means something with the question. Nothing is ticked by asking.
 */
function whatWasDone(db: Db, companyId: string, asked: Extract<Question, { ask: "did" }>): Answer {
  const stems = askedStems(asked.about).filter((stem) => !/^(?:go|went|gone|been|get|got|make|made)$/.test(stem));
  const span = asked.label.toLowerCase();
  if (stems.length === 0) return { say: `Nothing to look for ${span}.`, items: [] };
  const ids = withHome(db, companyId);
  const list = ids.map(() => "?").join(", ");
  const zone = (db.prepare(`SELECT timezone FROM companies WHERE id = ?`).get(ids[0]) as { timezone: string } | undefined)?.timezone ?? "UTC";

  const done: { label: string; day: string }[] = [
    ...(db
      .prepare(
        `SELECT h.name AS label, c.day FROM habit_checks c JOIN habits h ON h.id = c.habit_id
          WHERE h.company_id IN (${list}) AND c.day BETWEEN ? AND ?`,
      )
      .all(...ids, asked.from, asked.to) as { label: string; day: string }[]),
    ...(db
      .prepare(`SELECT title AS label, day FROM blocks WHERE company_id IN (${list}) AND day BETWEEN ? AND ?`)
      .all(...ids, asked.from, asked.to) as { label: string; day: string }[]),
    ...(db
      .prepare(`SELECT topic AS label, day FROM hobby_logs WHERE company_id IN (${list}) AND day BETWEEN ? AND ?`)
      .all(...ids, asked.from, asked.to) as { label: string; day: string }[]),
    // Finished is an instant; the day it fell on is the day in your timezone.
    ...(db
      .prepare(`SELECT title AS label, completed_at FROM tasks WHERE company_id IN (${list}) AND status = 'done' AND completed_at IS NOT NULL`)
      .all(...ids) as { label: string; completed_at: string }[])
      .map((task) => ({ label: task.label, day: todayIn(zone, new Date(task.completed_at)) }))
      .filter((task) => task.day >= asked.from && task.day <= asked.to),
  ];

  const found = new Map<string, { label: string; day: string }>();
  for (const each of done) {
    const title = each.label.toLowerCase();
    if (!stems.some((stem) => title.includes(stem))) continue;
    found.set(`${each.day} ${title}`, each);
  }
  const items = [...found.values()].sort((a, b) => a.day.localeCompare(b.day));
  const days = new Set(items.map((item) => item.day)).size;
  return {
    say:
      days === 0
        ? `Not that Caulder can see, ${span}.`
        : asked.from === asked.to
          ? `Yes, ${span}.`
          : `Yes - ${days === 1 ? "one day" : `${days} days`} ${span}.`,
    items: items.map((item) => ({ label: item.label, detail: item.day })),
  };
}
