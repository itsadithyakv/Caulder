import type { Db } from "../db/connection";
import { ENTRY_TEMPLATE, isMood, type BrainPage, type Mood } from "@shared/brain";
import { addMonths, dayOf, isDay, shiftDay, timeNow, today as todayIn, weekdayOf } from "@shared/dates";
import { daysLeftOf } from "@shared/deadlines";
import { plainText } from "@shared/markdown";
import {
  goalPercent,
  gradeAverage,
  journalRun,
  timeInput,
  type CourseRow,
  type DayRecord,
  type ExamRow,
  type GoalRow,
  type HobbyRow,
  type JournalDay,
  type JournalMonth,
  type PageTime,
  type StudiesOverview,
} from "@shared/life";
import { addToEntry } from "@shared/capture";
import { createPage, findPage, findPageRow, savePageRow } from "../repositories/brain";
import { createBlock, endSeries } from "../repositories/blocks";

/**
 * The founder's own half of the brain (PLAN.md, part four, phase 14): the
 * journal and what happened on each day, studies, hobbies and goals as the
 * sections show them, and the time set aside on the Calendar for a page.
 *
 * Nothing here is stored beyond the pages and the blocks: the average, the
 * hours a hobby got, the day's record are all worked out when asked, so they
 * cannot disagree with what the pages and the Calendar say.
 */

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** How far back "what it actually got" looks. */
const LOOK_BACK = 28;

function companyOf(db: Db, companyId: string): { timezone: string; currency: string } {
  const row = db.prepare(`SELECT timezone, currency FROM companies WHERE id = ?`).get(companyId) as
    | { timezone: string; currency: string }
    | undefined;
  if (!row) throw new Error("That company no longer exists.");
  return row;
}

function fieldsOf(raw: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

const text = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value.trim() : null);
const number = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);
const day = (value: unknown): string | null => (isDay(value) ? value : null);

/** The first words written, headings and empty prompts left out. */
function excerptOf(body: string): string {
  return plainText(
    body
      .split("\n")
      .filter((line) => !/^#{1,6}\s/.test(line))
      .join("\n"),
  ).slice(0, 160);
}

/* ---- The journal ---------------------------------------------------------- */

/** "Friday 18 September 2026". */
export function entryTitle(of: string): string {
  const [year, month, date] = of.split("-").map(Number) as [number, number, number];
  return `${WEEKDAYS[weekdayOf(of) - 1]} ${date} ${MONTHS[month - 1]} ${year}`;
}

function entryId(db: Db, companyId: string, of: string): string | null {
  const row = db
    .prepare(
      `SELECT id FROM brain_pages WHERE company_id = ? AND template = ? AND json_extract(fields, '$.day') = ?`,
    )
    .get(companyId, ENTRY_TEMPLATE, of) as { id: string } | undefined;
  return row?.id ?? null;
}

/**
 * The entry for a day: the one there is, or a new one. One a day, which the
 * database holds to as well. A day that has not happened yet has no entry.
 */
export function journalEntry(db: Db, companyId: string, of: unknown, now: Date = new Date()): BrainPage {
  const today = todayIn(companyOf(db, companyId).timezone, now);
  const wanted = of === undefined || of === null ? today : of;
  if (!isDay(wanted)) throw new Error("That is not a day.");
  if (wanted > today) throw new Error("The journal is for days that have happened. Come back that evening.");

  let id = entryId(db, companyId, wanted);
  if (!id) {
    id = createPage(
      db,
      companyId,
      {
        section: "journal",
        template: ENTRY_TEMPLATE,
        title: entryTitle(wanted),
        body: "## Today\n\n\n## Grateful for\n\n\n## Tomorrow\n\n",
        fields: { day: wanted },
      },
      now.toISOString(),
    );
  }
  const page = findPage(db, id);
  if (!page) throw new Error("That entry vanished as it was written.");
  return page;
}

/** The entry for a day if one has been written, without making one: opening the journal is not writing in it. */
export function findEntry(db: Db, companyId: string, of: unknown): BrainPage | null {
  if (!isDay(of)) throw new Error("That is not a day.");
  const id = entryId(db, companyId, of);
  return id ? findPage(db, id) : null;
}

/** How a day felt, saved at once - the one thing asked of an entry without opening it. */
export function setMood(db: Db, pageId: string, mood: unknown, now: Date = new Date()): BrainPage {
  if (mood !== null && !isMood(mood)) throw new Error("That is not one of the moods.");
  const row = findPageRow(db, pageId);
  if (!row || row.template !== ENTRY_TEMPLATE) throw new Error("That is not a journal entry.");
  const fields = { ...row.stored };
  if (mood === null) delete fields["mood"];
  else fields["mood"] = mood;
  savePageRow(db, pageId, { title: row.title, body: row.body, fields }, row.revision, now.toISOString());
  const page = findPage(db, pageId);
  if (!page) throw new Error("That entry no longer exists.");
  return page;
}

type EntryRow = { id: string; body: string; fields: string };

function toJournalDay(row: EntryRow): JournalDay | null {
  const fields = fieldsOf(row.fields);
  const on = day(fields["day"]);
  if (!on) return null;
  const mood = fields["mood"];
  return { day: on, pageId: row.id, mood: isMood(mood) ? (mood as Mood) : null, excerpt: excerptOf(row.body) };
}

function entriesOf(db: Db, companyId: string): JournalDay[] {
  const rows = db
    .prepare(`SELECT id, body, fields FROM brain_pages WHERE company_id = ? AND template = ? AND is_archived = 0`)
    .all(companyId, ENTRY_TEMPLATE) as EntryRow[];
  return rows
    .map(toJournalDay)
    .filter((entry): entry is JournalDay => entry !== null)
    .sort((a, b) => a.day.localeCompare(b.day));
}

/** A month of the journal, with the run of days written and the same day in earlier times. */
export function journalMonth(db: Db, companyId: string, month: unknown, now: Date = new Date()): JournalMonth {
  const today = todayIn(companyOf(db, companyId).timezone, now);
  const wanted = typeof month === "string" && /^\d{4}-\d{2}$/.test(month) ? month : today.slice(0, 7);
  const all = entriesOf(db, companyId);
  const byDay = new Map(all.map((entry) => [entry.day, entry]));

  const onThisDay: JournalMonth["onThisDay"] = [];
  for (const [label, then] of [
    ["A week ago", shiftDay(today, -7)],
    ["A month ago", addMonths(today, -1)],
    ["A year ago", addMonths(today, -12)],
  ] as const) {
    const entry = byDay.get(then);
    if (entry) onThisDay.push({ label, entry });
  }

  return {
    month: wanted,
    today,
    entries: all.filter((entry) => entry.day.startsWith(`${wanted}-`)),
    run: journalRun(new Set(byDay.keys()), today, shiftDay),
    onThisDay,
  };
}

/** Today's entry for the card on Today, if there is one. */
export function journalToday(db: Db, companyId: string, now: Date = new Date()): { day: string; entry: JournalDay | null } {
  const today = todayIn(companyOf(db, companyId).timezone, now);
  const id = entryId(db, companyId, today);
  const row = id
    ? (db.prepare(`SELECT id, body, fields FROM brain_pages WHERE id = ?`).get(id) as EntryRow | undefined)
    : undefined;
  return { day: today, entry: row ? toJournalDay(row) : null };
}

/**
 * What Caulder saw happen on a day: the tasks done, the calls, the hours
 * kept, the notes caught, the money that came in, the pages written, the
 * contacts added. Beside a journal entry, so the entry is what was made of it.
 */
export function dayRecord(db: Db, companyId: string, of: unknown, now: Date = new Date()): DayRecord {
  if (!isDay(of)) throw new Error("That is not a day.");
  const { timezone, currency } = companyOf(db, companyId);
  const today = todayIn(timezone, now);
  // Instants are kept in UTC: a window a day either side, then each checked in the company's own day.
  const from = `${shiftDay(of, -1)}T00:00:00.000Z`;
  const to = `${shiftDay(of, 2)}T00:00:00.000Z`;
  const onThe = (iso: string) => dayOf(iso, timezone) === of;

  const tasksDone = (
    db
      .prepare(
        `SELECT id, title, area, completed_at FROM tasks
          WHERE company_id = ? AND status = 'done' AND completed_at >= ? AND completed_at < ?
          ORDER BY completed_at`,
      )
      .all(companyId, from, to) as { id: string; title: string; area: string | null; completed_at: string }[]
  )
    .filter((row) => onThe(row.completed_at))
    .map(({ id, title, area }) => ({ id, title, area }));

  const calls = (
    db
      .prepare(
        `SELECT c.lead_id, l.name, c.outcome, c.created_at FROM calls c JOIN leads l ON l.id = c.lead_id
          WHERE c.company_id = ? AND c.created_at >= ? AND c.created_at < ? ORDER BY c.created_at`,
      )
      .all(companyId, from, to) as { lead_id: string; name: string; outcome: string; created_at: string }[]
  )
    .filter((row) => onThe(row.created_at))
    .map((row) => ({ leadId: row.lead_id, name: row.name, spoke: row.outcome === "spoke" }));

  // A block kept is one not skipped - and, today, one that has already ended.
  const clock = of === today ? timeNow(timezone, now) : null;
  const blocks = of > today
    ? []
    : (db
        .prepare(`SELECT kind, starts_at, minutes FROM blocks WHERE company_id = ? AND day = ? AND outcome IS NULL`)
        .all(companyId, of) as { kind: string | null; starts_at: string; minutes: number }[]);
  const byKind = new Map<string, number>();
  for (const block of blocks) {
    if (clock) {
      const [h, m] = block.starts_at.split(":").map(Number) as [number, number];
      const [ch, cm] = clock.split(":").map(Number) as [number, number];
      if (h * 60 + m + block.minutes > ch * 60 + cm) continue;
    }
    const kind = block.kind ?? "other";
    byKind.set(kind, (byKind.get(kind) ?? 0) + block.minutes);
  }

  const notes = db
    .prepare(`SELECT id, body FROM notes WHERE company_id = ? AND day = ? ORDER BY created_at`)
    .all(companyId, of) as { id: string; body: string }[];

  const paidIn = (
    db
      .prepare(
        `SELECT p.amount, l.name FROM payments p
           JOIN invoices i ON i.id = p.invoice_id JOIN leads l ON l.id = i.lead_id
          WHERE p.company_id = ? AND p.paid_on = ? ORDER BY p.created_at`,
      )
      .all(companyId, of) as { amount: number; name: string }[]
  ).map((row) => ({ amount: row.amount, from: row.name }));

  const written = db
    .prepare(
      `SELECT p.id, p.title, p.section, r.edited_at FROM brain_revisions r JOIN brain_pages p ON p.id = r.page_id
        WHERE p.company_id = ? AND p.template != ? AND r.edited_at >= ? AND r.edited_at < ?
        ORDER BY r.edited_at`,
    )
    .all(companyId, ENTRY_TEMPLATE, from, to) as { id: string; title: string; section: string; edited_at: string }[];
  const pages: DayRecord["pages"] = [];
  for (const row of written) {
    if (onThe(row.edited_at) && !pages.some((page) => page.id === row.id)) {
      pages.push({ id: row.id, title: row.title, section: row.section });
    }
  }

  const contactsAdded = (
    db
      .prepare(`SELECT created_at FROM leads WHERE company_id = ? AND created_at >= ? AND created_at < ?`)
      .all(companyId, from, to) as { created_at: string }[]
  ).filter((row) => onThe(row.created_at)).length;

  return {
    day: of,
    currency,
    tasksDone,
    calls,
    kept: [...byKind.entries()].map(([kind, minutes]) => ({ kind, minutes })).sort((a, b) => b.minutes - a.minutes),
    notes,
    paidIn,
    pages,
    contactsAdded,
  };
}

/** A caught note, added to its day's entry under its Today heading rather than made a page of its own. */
export function appendToEntry(db: Db, companyId: string, of: string, words: string, now: Date = new Date()): BrainPage {
  const entry = journalEntry(db, companyId, of, now);
  const row = findPageRow(db, entry.id);
  if (!row) throw new Error("That entry no longer exists.");
  const body = addToEntry(row.body, words);
  savePageRow(db, entry.id, { title: row.title, body, fields: row.stored }, row.revision, now.toISOString());
  const page = findPage(db, entry.id);
  if (!page) throw new Error("That entry no longer exists.");
  return page;
}

/** A line from Today's line into today's entry. */
export function jot(db: Db, companyId: string, text: unknown, now: Date = new Date()): BrainPage {
  if (typeof text !== "string" || !text.trim()) throw new Error("Write something first.");
  if (text.length > 4000) throw new Error("That is a page, not a line: write it in the journal.");
  const today = todayIn(companyOf(db, companyId).timezone, now);
  return appendToEntry(db, companyId, today, text, now);
}

/* ---- Time kept for a page ---------------------------------------------------- */

/** Minutes of blocks tied to each page, in a span, not skipped. */
function minutesByPage(db: Db, companyId: string, from: string, through: string): Map<string, number> {
  const rows = db
    .prepare(
      `SELECT page_id, SUM(minutes) AS minutes FROM blocks
        WHERE company_id = ? AND page_id IS NOT NULL AND day BETWEEN ? AND ? AND outcome IS NULL
        GROUP BY page_id`,
    )
    .all(companyId, from, through) as { page_id: string; minutes: number }[];
  return new Map(rows.map((row) => [row.page_id, row.minutes]));
}

type PageRow = { id: string; company_id: string; section: string; template: string; title: string; fields: string };

function pageRowOf(db: Db, pageId: string): PageRow {
  const row = db
    .prepare(`SELECT id, company_id, section, template, title, fields FROM brain_pages WHERE id = ?`)
    .get(pageId) as PageRow | undefined;
  if (!row) throw new Error("That page no longer exists.");
  return row;
}

export function pageTime(db: Db, pageId: string, now: Date = new Date()): PageTime {
  const page = pageRowOf(db, pageId);
  const { timezone } = companyOf(db, page.company_id);
  const today = todayIn(timezone, now);
  const clock = timeNow(timezone, now);

  // A repeat is still going while it has a session that has not started.
  const toCome = db.prepare(
    `SELECT 1 FROM blocks WHERE series_id = ? AND (day > ? OR (day = ? AND starts_at > ?)) LIMIT 1`,
  );
  const series = (
    db
      .prepare(
        `SELECT id, weekdays, starts_at, minutes, from_day, until_day FROM block_series
          WHERE page_id = ? ORDER BY from_day DESC`,
      )
      .all(pageId) as { id: string; weekdays: string; starts_at: string; minutes: number; from_day: string; until_day: string }[]
  ).map((row) => ({
    id: row.id,
    weekdays: row.weekdays.split(",").map(Number).filter((n) => n >= 1 && n <= 7),
    startsAt: row.starts_at,
    minutes: row.minutes,
    fromDay: row.from_day,
    untilDay: row.until_day,
    active: toCome.get(row.id, today, today, clock) !== undefined,
  }));

  const next = db
    .prepare(
      `SELECT day, starts_at, minutes FROM blocks
        WHERE page_id = ? AND outcome IS NULL AND (day > ? OR (day = ? AND starts_at >= ?))
        ORDER BY day, starts_at LIMIT 1`,
    )
    .get(pageId, today, today, clock) as { day: string; starts_at: string; minutes: number } | undefined;

  const past = db
    .prepare(
      `SELECT COALESCE(SUM(minutes), 0) AS planned,
              COALESCE(SUM(CASE WHEN outcome IS NULL THEN minutes END), 0) AS kept
         FROM blocks WHERE page_id = ? AND day BETWEEN ? AND ?`,
    )
    .get(pageId, shiftDay(today, -LOOK_BACK), shiftDay(today, -1)) as { planned: number; kept: number };

  const wanted = page.template === "hobby" ? number(fieldsOf(page.fields)["hoursWanted"]) : null;

  return {
    today,
    series,
    next: next ? { day: next.day, startsAt: next.starts_at, minutes: next.minutes } : null,
    planned: past.planned,
    kept: past.kept,
    wantedWeekly: wanted !== null && wanted > 0 ? Math.round(wanted * 60) : null,
  };
}

/** What kind of block a page's time is, so the day's breakdown adds it up where it belongs. */
function kindFor(page: PageRow): string {
  if (page.section === "studies") return "study";
  if (page.section === "goals") {
    const area = fieldsOf(page.fields)["area"];
    return area === "college" ? "study" : area === "company" ? "focus" : "personal";
  }
  return "personal";
}

/**
 * Time set aside for a page: a repeat on the Calendar, tied to the page, so
 * the page can say what it got and each block can open the page. It starts
 * today if today's time is still to come, tomorrow otherwise - a block made
 * in the past would count as kept without ever happening.
 */
export function makeTime(db: Db, pageId: string, raw: unknown, now: Date = new Date()): PageTime {
  const input = timeInput.parse(raw);
  const page = pageRowOf(db, pageId);
  const { timezone } = companyOf(db, page.company_id);
  const today = todayIn(timezone, now);
  const start = input.startsAt > timeNow(timezone, now) ? today : shiftDay(today, 1);
  if (input.until < start) throw new Error("The last day has to be after the first.");

  db.transaction(() => {
    const block = createBlock(db, page.company_id, {
      day: start,
      startsAt: input.startsAt,
      minutes: input.minutes,
      title: page.title,
      kind: kindFor(page),
      repeat: { weekdays: input.weekdays, until: input.until },
    });
    if (!block.seriesId) throw new Error("The time could not be set aside.");
    db.prepare(`UPDATE block_series SET page_id = ? WHERE id = ?`).run(pageId, block.seriesId);
    db.prepare(`UPDATE blocks SET page_id = ? WHERE series_id = ?`).run(pageId, block.seriesId);
  })();
  return pageTime(db, pageId, now);
}

/**
 * Time just given to a page - "guitar 40 min" - kept as a block that ended
 * now, so it counts the way time set aside and kept does, and shows on the
 * day it was given.
 */
export function logTime(db: Db, pageId: string, rawMinutes: unknown, now: Date = new Date()): PageTime {
  const minutes = typeof rawMinutes === "number" && Number.isInteger(rawMinutes) ? rawMinutes : NaN;
  if (!(minutes >= 5 && minutes <= 12 * 60)) throw new Error("Between five minutes and twelve hours.");
  const page = pageRowOf(db, pageId);
  const { timezone } = companyOf(db, page.company_id);
  const today = todayIn(timezone, now);
  const [hours, mins] = timeNow(timezone, now).split(":").map(Number) as [number, number];
  const endedAt = hours * 60 + mins;
  // Ended now, started that long before - or at midnight, for more time than the day has had.
  const start = Math.max(0, endedAt - minutes);
  const pad = (n: number) => String(n).padStart(2, "0");
  db.transaction(() => {
    const block = createBlock(db, page.company_id, {
      day: today,
      startsAt: `${pad(Math.floor(start / 60))}:${pad(start % 60)}`,
      minutes: Math.min(minutes, 24 * 60 - start),
      title: page.title,
      kind: kindFor(page),
    });
    db.prepare(`UPDATE blocks SET page_id = ? WHERE id = ?`).run(pageId, block.id);
  })();
  return pageTime(db, pageId, now);
}

/**
 * Stops a page's repeat from now on. What already happened stays - it was
 * time given - and a session today that has not started goes with the rest.
 */
export function stopTime(db: Db, seriesId: unknown, now: Date = new Date()): PageTime {
  if (typeof seriesId !== "string") throw new Error("Missing the repeat.");
  const series = db.prepare(`SELECT company_id, page_id FROM block_series WHERE id = ?`).get(seriesId) as
    | { company_id: string; page_id: string | null }
    | undefined;
  if (!series?.page_id) throw new Error("That time is no longer set aside.");
  const { timezone } = companyOf(db, series.company_id);
  const today = todayIn(timezone, now);
  const later = db
    .prepare(`SELECT 1 FROM blocks WHERE series_id = ? AND day = ? AND starts_at > ?`)
    .get(seriesId, today, timeNow(timezone, now));
  endSeries(db, seriesId, later ? today : shiftDay(today, 1));
  return pageTime(db, series.page_id, now);
}

/* ---- The sections ------------------------------------------------------------ */

type SectionRow = { id: string; template: string; title: string; fields: string };

function sectionRows(db: Db, companyId: string, section: string): SectionRow[] {
  return db
    .prepare(
      `SELECT id, template, title, fields FROM brain_pages
        WHERE company_id = ? AND section = ? AND is_archived = 0 ORDER BY title COLLATE NOCASE`,
    )
    .all(companyId, section) as SectionRow[];
}

const STATUS_ORDER = ["taking", "planned", "done", "dropped"];

export function studiesOverview(db: Db, companyId: string, now: Date = new Date()): StudiesOverview {
  const { timezone } = companyOf(db, companyId);
  const today = todayIn(timezone, now);
  const rows = sectionRows(db, companyId, "studies");
  const kept = minutesByPage(db, companyId, shiftDay(today, -LOOK_BACK), shiftDay(today, -1));

  const courses = rows.filter((row) => row.template === "course");
  // An exam belongs to the course its page links to, or whose code its title names.
  const links = db
    .prepare(
      `SELECT from_page, to_id FROM brain_links WHERE company_id = ? AND to_kind = 'page'`,
    )
    .all(companyId) as { from_page: string; to_id: string }[];
  const courseOf = (exam: SectionRow): { id: string; title: string } | null => {
    const linked = links.find((link) => link.from_page === exam.id && courses.some((course) => course.id === link.to_id));
    const found =
      courses.find((course) => course.id === linked?.to_id) ??
      courses.find((course) => {
        const code = text(fieldsOf(course.fields)["code"]);
        return code !== null && exam.title.toLowerCase().includes(code.toLowerCase());
      });
    return found ? { id: found.id, title: found.title } : null;
  };

  const exams: ExamRow[] = rows
    .filter((row) => row.template === "exam")
    .flatMap((row) => {
      const fields = fieldsOf(row.fields);
      const on = day(fields["examOn"]);
      if (!on || on < today) return [];
      return [{ id: row.id, title: row.title, on, at: text(fields["at"]), daysLeft: daysLeftOf(on, today), course: courseOf(row) }];
    })
    .sort((a, b) => a.on.localeCompare(b.on));

  const courseRows: CourseRow[] = courses
    .map((row) => {
      const fields = fieldsOf(row.fields);
      const next = exams.find((exam) => exam.course?.id === row.id);
      return {
        id: row.id,
        title: row.title,
        code: text(fields["code"]),
        term: text(fields["term"]),
        credits: number(fields["credits"]),
        status: text(fields["status"]),
        grade: text(fields["grade"]),
        gradePoints: number(fields["gradePoints"]),
        nextExam: next ? { id: next.id, title: next.title, on: next.on, daysLeft: next.daysLeft } : null,
        keptMinutes: kept.get(row.id) ?? 0,
      };
    })
    .sort((a, b) => {
      const rank = (status: string | null) => (status ? STATUS_ORDER.indexOf(status) : 0);
      return rank(a.status) - rank(b.status) || a.title.localeCompare(b.title);
    });

  return {
    today,
    courses: courseRows,
    exams,
    average: gradeAverage(courseRows.filter((course) => course.status !== "dropped")),
  };
}

export function hobbiesOverview(db: Db, companyId: string, now: Date = new Date()): HobbyRow[] {
  const today = todayIn(companyOf(db, companyId).timezone, now);
  const kept = minutesByPage(db, companyId, shiftDay(today, -LOOK_BACK), shiftDay(today, -1));
  const planned = minutesByPage(db, companyId, today, shiftDay(today, 6));
  const order = ["doing-it", "paused", "someday"];
  return sectionRows(db, companyId, "hobbies")
    .filter((row) => row.template === "hobby")
    .map((row) => {
      const fields = fieldsOf(row.fields);
      return {
        id: row.id,
        title: row.title,
        status: text(fields["status"]),
        goal: text(fields["goal"]),
        hoursWanted: number(fields["hoursWanted"]),
        keptMinutes: kept.get(row.id) ?? 0,
        plannedMinutes: planned.get(row.id) ?? 0,
      };
    })
    .sort((a, b) => {
      const rank = (status: string | null) => (status ? order.indexOf(status) : 0);
      return rank(a.status) - rank(b.status) || a.title.localeCompare(b.title);
    });
}

export function goalsOverview(db: Db, companyId: string, now: Date = new Date()): GoalRow[] {
  const today = todayIn(companyOf(db, companyId).timezone, now);
  return sectionRows(db, companyId, "goals")
    .filter((row) => row.template === "life-goal")
    .map((row) => {
      const fields = fieldsOf(row.fields);
      const byOn = day(fields["byOn"]);
      const goal = {
        target: number(fields["target"]),
        progress: number(fields["progress"]),
        done: fields["done"] === true,
      };
      return {
        id: row.id,
        title: row.title,
        area: text(fields["area"]),
        byOn,
        daysLeft: byOn ? daysLeftOf(byOn, today) : null,
        unit: text(fields["unit"]),
        ...goal,
        percent: goalPercent(goal),
      };
    })
    .sort(
      (a, b) =>
        Number(a.done) - Number(b.done) ||
        (a.byOn ?? "9999").localeCompare(b.byOn ?? "9999") ||
        a.title.localeCompare(b.title),
    );
}
