import { randomUUID } from "node:crypto";
import type { Db } from "../db/connection";
import type { Block, BlockDraft, BlockSource } from "@shared/domain";
import { rememberDeleted } from "./google";
import { occurrencesOf, checkRepeat } from "@shared/repeat";

/**
 * Blocks: the parts of a day.
 *
 * Plain rows. What overlaps what, and how much of the day is accounted for,
 * is worked out in shared/day.ts - this only reads and writes.
 */

type BlockRow = {
  id: string;
  company_id: string;
  day: string;
  starts_at: string;
  minutes: number;
  title: string;
  kind: string | null;
  notes: string | null;
  task_id: string | null;
  task_title: string | null;
  page_id: string | null;
  page_title: string | null;
  series_id: string | null;
  priority: string | null;
  outcome: string | null;
  remind_minutes: number | null;
  reminded_at: string | null;
  source: string;
  external_id: string | null;
  is_dirty: number;
  created_at: string;
  updated_at: string;
};

function toBlock(row: BlockRow): Block {
  return {
    id: row.id,
    companyId: row.company_id,
    day: row.day,
    startsAt: row.starts_at,
    minutes: row.minutes,
    title: row.title,
    kind: row.kind,
    notes: row.notes,
    taskId: row.task_id,
    taskTitle: row.task_title,
    pageId: row.page_id,
    pageTitle: row.page_title,
    seriesId: row.series_id,
    priority: row.priority,
    outcome: row.outcome,
    remindMinutes: row.remind_minutes,
    remindedAt: row.reminded_at,
    source: row.source === "google" ? "google" : "caulder",
    externalId: row.external_id,
    isDirty: row.is_dirty === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Every read joins the task and the page, so a block can say what it is set aside for. */
const SELECT = `
  SELECT b.*, t.title AS task_title, p.title AS page_title
    FROM blocks b
    LEFT JOIN tasks t ON t.id = b.task_id
    LEFT JOIN brain_pages p ON p.id = b.page_id
`;

export function listBlocks(db: Db, companyId: string, day: string): Block[] {
  const rows = db
    .prepare(`${SELECT} WHERE b.company_id = ? AND b.day = ? ORDER BY b.starts_at, b.minutes DESC`)
    .all(companyId, day) as BlockRow[];
  return rows.map(toBlock);
}

/**
 * A span of days in one read.
 *
 * A week is seven days, and seven round trips to fetch it would be six more
 * than the question needs. `to` is inclusive, because a week that runs to
 * Sunday should be asked for as ending on Sunday.
 */
export function listBlocksBetween(db: Db, companyId: string, from: string, to: string): Block[] {
  const rows = db
    .prepare(
      `${SELECT} WHERE b.company_id = ? AND b.day >= ? AND b.day <= ?
        ORDER BY b.day, b.starts_at, b.minutes DESC`,
    )
    .all(companyId, from, to) as BlockRow[];
  return rows.map(toBlock);
}

export function findBlock(db: Db, id: string): Block | null {
  const row = db.prepare(`${SELECT} WHERE b.id = ?`).get(id) as BlockRow | undefined;
  return row ? toBlock(row) : null;
}

/** One row. The repeat, if any, is handled by createBlock around it. */
function insertBlock(
  db: Db,
  companyId: string,
  input: BlockDraft,
  day: string,
  source: BlockSource,
  seriesId: string | null,
): string {
  const now = new Date().toISOString();
  const id = randomUUID();

  db.prepare(
    `INSERT INTO blocks
       (id, company_id, day, starts_at, minutes, title, kind, notes, task_id,
        series_id, priority, remind_minutes, source, is_dirty, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    companyId,
    day,
    input.startsAt,
    input.minutes,
    input.title,
    input.kind ?? null,
    input.notes ?? null,
    // A repeated block is not for one task. Twelve lectures pointing at a
    // single to-do would tick it off eleven times too often.
    seriesId ? null : (input.taskId ?? null),
    seriesId,
    input.priority ?? null,
    input.remindMinutes ?? null,
    source,
    // A block we made has never been pushed, so it is dirty from birth. One we
    // mirrored from Google is already in step with it.
    source === "caulder" ? 1 : 0,
    now,
    now,
  );

  return id;
}

/**
 * Creates one block, or a whole term of them.
 *
 * A repeat writes every occurrence up front. The trade is rows for
 * predictability: editing one Tuesday is editing a block, and nothing else in
 * the app - the grid, Today, the Google sync - needs to know repeats exist.
 */
export function createBlock(
  db: Db,
  companyId: string,
  input: BlockDraft,
  source: BlockSource = "caulder",
): Block {
  const repeat = input.repeat ?? null;

  if (!repeat) {
    const id = insertBlock(db, companyId, input, input.day, source, null);
    const created = findBlock(db, id);
    if (!created) throw new Error("The block vanished immediately after being created.");
    return created;
  }

  const rule = { weekdays: repeat.weekdays, from: input.day, until: repeat.until };
  const problem = checkRepeat(rule);
  if (!problem.ok) throw new Error(problem.reason);

  const days = occurrencesOf(rule);
  if (days.length === 0) {
    throw new Error("That repeat does not land on any day between those dates.");
  }

  const seriesId = randomUUID();
  const now = new Date().toISOString();
  let firstId = "";

  db.transaction(() => {
    db.prepare(
      `INSERT INTO block_series
         (id, company_id, title, kind, notes, starts_at, minutes, weekdays,
          from_day, until_day, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      seriesId,
      companyId,
      input.title,
      input.kind ?? null,
      input.notes ?? null,
      input.startsAt,
      input.minutes,
      repeat.weekdays.join(","),
      input.day,
      repeat.until,
      now,
    );

    days.forEach((day, index) => {
      const id = insertBlock(db, companyId, input, day, source, seriesId);
      if (index === 0) firstId = id;
    });
  })();

  const created = findBlock(db, firstId);
  if (!created) throw new Error("The block vanished immediately after being created.");
  return created;
}

/**
 * Ends a repeat from a given day onwards.
 *
 * What already happened stays. The Tuesdays you sat through are history rather
 * than part of a rule you have since cancelled, and deleting them would leave
 * a week that says you did nothing.
 */
export function endSeries(db: Db, seriesId: string, fromDay: string): number {
  let removed = 0;

  db.transaction(() => {
    const doomed = db
      .prepare(`SELECT id FROM blocks WHERE series_id = ? AND day >= ?`)
      .all(seriesId, fromDay) as { id: string }[];

    for (const row of doomed) deleteBlock(db, row.id);
    removed = doomed.length;

    db.prepare(`UPDATE block_series SET until_day = ? WHERE id = ?`).run(fromDay, seriesId);
  })();

  return removed;
}

/**
 * Applies the whole record, the way updateLead does. A partial write here
 * would mean a form that omits a field silently clears it.
 */
export function updateBlock(db: Db, id: string, input: BlockDraft): Block {
  const result = db
    .prepare(
      `UPDATE blocks SET
         day = @day, starts_at = @startsAt, minutes = @minutes, title = @title,
         kind = @kind, notes = @notes, task_id = @taskId, priority = @priority,
         remind_minutes = @remindMinutes,
         -- Owed again. The reminder that was already given was about a time
         -- that may no longer be when this happens.
         reminded_at = NULL,
         is_dirty = 1, updated_at = @now
       WHERE id = @id`,
    )
    .run({
      id,
      day: input.day,
      startsAt: input.startsAt,
      minutes: input.minutes,
      title: input.title,
      kind: input.kind ?? null,
      notes: input.notes ?? null,
      taskId: input.taskId ?? null,
      priority: input.priority ?? null,
      remindMinutes: input.remindMinutes ?? null,
      now: new Date().toISOString(),
    });

  if (result.changes === 0) throw new Error("That block no longer exists.");

  const updated = findBlock(db, id);
  if (!updated) throw new Error("That block no longer exists.");
  return updated;
}

/**
 * Moving or resizing, which is the common edit and the one a drag makes.
 * Separate from updateBlock so the screen does not have to send a whole
 * record to shift something by fifteen minutes.
 */
export function moveBlock(
  db: Db,
  id: string,
  where: { day: string; startsAt: string; minutes: number },
): Block {
  const result = db
    .prepare(
      `UPDATE blocks SET day = ?, starts_at = ?, minutes = ?,
         reminded_at = NULL, is_dirty = 1, updated_at = ?
       WHERE id = ?`,
    )
    .run(where.day, where.startsAt, where.minutes, new Date().toISOString(), id);

  if (result.changes === 0) throw new Error("That block no longer exists.");

  const updated = findBlock(db, id);
  if (!updated) throw new Error("That block no longer exists.");
  return updated;
}

/**
 * Deleting one, and remembering that it went.
 *
 * If the block had reached Google, the row disappearing is the only record
 * that it ever existed - so nothing would be left to say the event should go
 * too, and it would sit in the calendar forever. The tombstone is that record.
 */
/**
 * What became of one. Null puts it back to "nobody said", which past its day
 * counts as kept.
 */
export function setOutcome(db: Db, id: string, outcome: string | null): void {
  db.prepare(`UPDATE blocks SET outcome = ?, updated_at = ? WHERE id = ?`).run(
    outcome,
    new Date().toISOString(),
    id,
  );
}

/**
 * Records that a block has been mentioned, so it is mentioned once.
 *
 * Stored rather than held in memory because the alternative is a restart
 * being a reason to hear about the same lecture again, and the thing that
 * makes a reminder worth having is that it is not noise. Deliberately not an
 * `updated_at` bump: being told about a block is not a change to it, and
 * bumping it would mark the row dirty and push a meaningless edit to Google.
 */
export function markReminded(db: Db, ids: readonly string[], at: string): void {
  if (ids.length === 0) return;
  const mark = db.prepare(`UPDATE blocks SET reminded_at = ? WHERE id = ?`);
  db.transaction(() => {
    for (const id of ids) mark.run(at, id);
  })();
}

/**
 * Changes a whole run from a day forward.
 *
 * Past occurrences are never rewritten. "The lecture moved to ten" is a fact
 * about the future; the nine o'clocks you already sat through happened at
 * nine, and editing them would be falsifying a record to tidy a rule.
 */
export function updateSeries(
  db: Db,
  seriesId: string,
  fromDay: string,
  change: { title: string; startsAt: string; minutes: number; kind: string | null },
): number {
  let touched = 0;

  db.transaction(() => {
    const result = db
      .prepare(
        `UPDATE blocks
            SET title = ?, starts_at = ?, minutes = ?, kind = ?,
                reminded_at = NULL, is_dirty = 1, updated_at = ?
          WHERE series_id = ? AND day >= ?`,
      )
      .run(
        change.title,
        change.startsAt,
        change.minutes,
        change.kind,
        new Date().toISOString(),
        seriesId,
        fromDay,
      );
    touched = result.changes;

    db.prepare(
      `UPDATE block_series SET title = ?, starts_at = ?, minutes = ?, kind = ? WHERE id = ?`,
    ).run(change.title, change.startsAt, change.minutes, change.kind, seriesId);
  })();

  return touched;
}

export function deleteBlock(db: Db, id: string): void {
  const block = findBlock(db, id);
  if (!block) return;

  db.transaction(() => {
    if (block.externalId) {
      rememberDeleted(db, block.companyId, "event", block.externalId);
    }
    db.prepare(`DELETE FROM blocks WHERE id = ?`).run(id);
  })();
}
