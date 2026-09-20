import { randomUUID } from "node:crypto";
import type { Db } from "../db/connection";
import { today as todayIn } from "@shared/dates";
import { measuresInput, sayYear, shelfInput, type Shelf, type ShelfBook, type YearInNumbers, type YearLine } from "@shared/tracker";
import type { ShelfStatus } from "@shared/books";
import type { Measure } from "@shared/subjects";
import { buildBoard, type HobbyBoard, type LogRow } from "@shared/hobbies";

/**
 * What was measured, the reading shelf, and the year in numbers
 * (shared/tracker.ts says what each is). Plain rows; the adding up is here.
 */

function timezoneOf(db: Db, companyId: string): string {
  const row = db.prepare(`SELECT timezone FROM companies WHERE id = ?`).get(companyId) as { timezone: string } | undefined;
  if (!row) throw new Error("That workspace no longer exists.");
  return row.timezone;
}

/** What a line measured, kept on the day it was said. Nothing measured is nothing written. */
export function logMeasures(db: Db, companyId: string, raw: unknown, now: Date = new Date()): number {
  const parsed = measuresInput.safeParse(raw);
  if (!parsed.success || parsed.data.length === 0) return 0;
  const day = todayIn(timezoneOf(db, companyId), now);
  const insert = db.prepare(
    `INSERT INTO hobby_logs (id, company_id, day, topic, metric, value, unit, reps, best, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  db.transaction(() => {
    for (const measure of parsed.data) {
      insert.run(randomUUID(), companyId, day, measure.topic, measure.metric, measure.value, measure.unit, measure.reps, measure.best ? 1 : 0, now.toISOString());
    }
  })();
  return parsed.data.length;
}

/* ---- The shelf ------------------------------------------------------------- */

type BookRow = { id: string; title: string; series: string | null; status: ShelfStatus; finished_on: string | null; cover: string | null };
const toBook = (row: BookRow): ShelfBook => ({
  id: row.id,
  title: row.title,
  series: row.series,
  status: row.status,
  finishedOn: row.finished_on,
  // 'none' is "looked for, and there is not one": to the screen that is no cover.
  cover: row.cover?.startsWith("data:image/") ? row.cover : null,
});

export function shelf(db: Db, companyId: string): Shelf {
  const rows = db
    .prepare(`SELECT id, title, series, status, finished_on, cover FROM shelf_books WHERE company_id = ? ORDER BY series IS NULL, series COLLATE NOCASE, position, created_at`)
    .all(companyId) as BookRow[];
  const pile = (status: ShelfStatus) => rows.filter((row) => row.status === status).map(toBook);
  return { reading: pile("reading"), toRead: pile("to-read"), read: pile("read") };
}

/**
 * Books onto a pile. A book already on the shelf is moved rather than added
 * again - "i am reading dune", said of a book that was to be read, is that
 * book being started - and never moved backwards by a series being added: a
 * book already read stays read when the rest of its series goes on the pile.
 */
export function shelfAdd(db: Db, companyId: string, raw: unknown, now: Date = new Date()): Shelf {
  const parsed = shelfInput.safeParse(raw);
  if (!parsed.success) throw new Error("Say which book.");
  const { titles, series, status } = parsed.data;
  const day = todayIn(timezoneOf(db, companyId), now);
  const rank: Record<ShelfStatus, number> = { "to-read": 0, reading: 1, read: 2 };

  db.transaction(() => {
    titles.forEach((title, position) => {
      const existing = db
        .prepare(`SELECT id, status FROM shelf_books WHERE company_id = ? AND title = ? COLLATE NOCASE`)
        .get(companyId, title) as { id: string; status: ShelfStatus } | undefined;
      if (existing) {
        if (titles.length > 1 && rank[existing.status] >= rank[status]) return;
        db.prepare(`UPDATE shelf_books SET status = ?, series = COALESCE(?, series), finished_on = ? WHERE id = ?`).run(
          status,
          series,
          status === "read" ? day : null,
          existing.id,
        );
        return;
      }
      db.prepare(
        `INSERT INTO shelf_books (id, company_id, title, series, position, status, finished_on, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(randomUUID(), companyId, title, series, position, status, status === "read" ? day : null, now.toISOString());
    });
  })();
  return shelf(db, companyId);
}

export function shelfMove(db: Db, id: string, status: unknown, now: Date = new Date()): Shelf {
  if (status !== "to-read" && status !== "reading" && status !== "read") throw new Error("That is not a pile.");
  const row = db.prepare(`SELECT company_id FROM shelf_books WHERE id = ?`).get(id) as { company_id: string } | undefined;
  if (!row) throw new Error("That book is no longer on the shelf.");
  const day = todayIn(timezoneOf(db, row.company_id), now);
  db.prepare(`UPDATE shelf_books SET status = ?, finished_on = ? WHERE id = ?`).run(status, status === "read" ? day : null, id);
  return shelf(db, row.company_id);
}

export function shelfRemove(db: Db, id: string): Shelf {
  const row = db.prepare(`SELECT company_id FROM shelf_books WHERE id = ?`).get(id) as { company_id: string } | undefined;
  if (!row) throw new Error("That book is no longer on the shelf.");
  db.prepare(`DELETE FROM shelf_books WHERE id = ?`).run(id);
  return shelf(db, row.company_id);
}

/* ---- The year ------------------------------------------------------------ */

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/**
 * A year in numbers: what was counted, the hours each hobby got, the books
 * finished, the days written about. Read from what is already there - nothing
 * is kept for this - so it is right for last year too, and for a year that
 * is only half over.
 */
export function yearInNumbers(db: Db, companyId: string, year: number): YearInNumbers {
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;
  const logs = db
    .prepare(`SELECT day, topic, metric, value, unit, reps FROM hobby_logs WHERE company_id = ? AND day BETWEEN ? AND ? ORDER BY day, created_at`)
    .all(companyId, from, to) as (Pick<Measure, "topic" | "metric" | "value" | "unit" | "reps"> & { day: string })[];

  const byTopic = new Map<string, typeof logs>();
  for (const row of logs) byTopic.set(row.topic, [...(byTopic.get(row.topic) ?? []), row]);
  const lines: YearLine[] = [...byTopic.entries()]
    // By the days it was done on, not the numbers written: a run is a distance and a pace, and is still one run.
    .sort((a, b) => new Set(b[1].map((row) => row.day)).size - new Set(a[1].map((row) => row.day)).size || b[1].length - a[1].length)
    .flatMap(([topic, rows]) => {
      const says = sayYear(rows);
      return says ? [{ topic, says }] : [];
    });

  const perMonth = new Array<number>(12).fill(0);
  for (const row of logs) perMonth[Number(row.day.slice(5, 7)) - 1] = (perMonth[Number(row.day.slice(5, 7)) - 1] ?? 0) + 1;
  const most = Math.max(...perMonth);

  const hours = db
    .prepare(
      `SELECT p.title AS title, SUM(b.minutes) AS minutes FROM blocks b JOIN brain_pages p ON p.id = b.page_id
        WHERE b.company_id = ? AND b.day BETWEEN ? AND ? AND b.outcome IS NULL AND p.section = 'hobbies'
        GROUP BY p.id HAVING minutes > 0 ORDER BY minutes DESC`,
    )
    .all(companyId, from, todayIn(timezoneOf(db, companyId)) < to ? todayIn(timezoneOf(db, companyId)) : to) as { title: string; minutes: number }[];

  const books = db
    .prepare(`SELECT title FROM shelf_books WHERE company_id = ? AND status = 'read' AND finished_on BETWEEN ? AND ? ORDER BY finished_on`)
    .all(companyId, from, to) as { title: string }[];
  const journal = db
    .prepare(`SELECT COUNT(*) AS n FROM brain_pages WHERE company_id = ? AND section = 'journal' AND json_extract(fields, '$.day') BETWEEN ? AND ?`)
    .get(companyId, from, to) as { n: number };

  return {
    year,
    activeDays: new Set(logs.map((row) => row.day)).size,
    lines,
    hours,
    booksRead: books.map((book) => book.title),
    journalDays: journal.n,
    busiest: most > 0 ? (MONTHS[perMonth.indexOf(most)] ?? null) : null,
  };
}


/* ---- A page for each hobby ------------------------------------------------ */

/**
 * Every hobby's board, for this year so far: what was logged that belongs to
 * it, the hours it got on the Calendar, and the pages in the brain that hang
 * off its own - the memories the quick line filed under it, found by the link
 * back to it that each was started with.
 */
export function hobbyBoards(db: Db, companyId: string, now: Date = new Date()): HobbyBoard[] {
  const today = todayIn(timezoneOf(db, companyId), now);
  const from = `${today.slice(0, 4)}-01-01`;
  const hobbies = db
    .prepare(`SELECT id, title FROM brain_pages WHERE company_id = ? AND section = 'hobbies' AND template = 'hobby' AND is_archived = 0 ORDER BY title COLLATE NOCASE`)
    .all(companyId) as { id: string; title: string }[];
  if (hobbies.length === 0) return [];

  const logs = (
    db
      .prepare(`SELECT day, topic, metric, value, unit, reps, best FROM hobby_logs WHERE company_id = ? AND day BETWEEN ? AND ? ORDER BY day, created_at`)
      .all(companyId, from, today) as (Omit<LogRow, "best"> & { best: number })[]
  ).map((row): LogRow => ({ ...row, best: row.best === 1 }));

  const blocks = db
    .prepare(`SELECT page_id, day, SUM(minutes) AS minutes FROM blocks WHERE company_id = ? AND page_id IS NOT NULL AND day BETWEEN ? AND ? AND outcome IS NULL GROUP BY page_id, day`)
    .all(companyId, from, today) as { page_id: string; day: string; minutes: number }[];
  const piles = shelf(db, companyId);

  return hobbies.map((hobby) => {
    const minutes = new Map(blocks.filter((block) => block.page_id === hobby.id).map((block) => [block.day, block.minutes] as const));
    // A memory page says what it is part of in its first line, as a link: that link is how it is found again.
    const pages = db
      .prepare(`SELECT id, title FROM brain_pages WHERE company_id = ? AND is_archived = 0 AND id <> ? AND body LIKE ? ORDER BY title COLLATE NOCASE`)
      .all(companyId, hobby.id, `%|page:${hobby.id}]]%`) as { id: string; title: string }[];
    return buildBoard(hobby, logs, minutes, pages, `${today.slice(0, 7)}-01`, {
      reading: piles.reading.length,
      toRead: piles.toRead.length,
      read: piles.read.length,
    });
  });
}
