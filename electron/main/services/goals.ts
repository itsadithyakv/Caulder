import { randomUUID } from "node:crypto";
import type { Db } from "../db/connection";
import { dayOf, isDay, today as todayIn } from "@shared/dates";
import { daysLeftOf } from "@shared/deadlines";
import {
  checkInInput,
  dayThemeInput,
  goalPace,
  type DayTheme,
  type GoalCheckin,
  type GoalDetail,
} from "@shared/goals";
import { findPageRow, savePageRow } from "../repositories/brain";

/**
 * Your own goals as they move, and your week (after 0.4; shared/goals.ts).
 *
 * A check-in is kept with its day, and the goal page's *So far* is saved as
 * where it now stands - an edit of the page like any other, merged with the
 * page's other edits of the same few minutes, so the page, its history and
 * your level agree. Marking a goal reached is an edit too, which is what
 * counts it towards your level.
 */

const GOAL = "life-goal";

type GoalPageRow = {
  id: string;
  company_id: string;
  title: string;
  template: string;
  section: string;
  fields: string;
  created_at: string;
};

type CheckinRow = { id: string; on_day: string; value: number; note: string | null; is_start: number };

const number = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);
const text = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value.trim() : null);

function fieldsOf(raw: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function timezoneOf(db: Db, companyId: string): string {
  const row = db.prepare(`SELECT timezone FROM companies WHERE id = ?`).get(companyId) as { timezone: string } | undefined;
  if (!row) throw new Error("That workspace no longer exists.");
  return row.timezone;
}

function goalRow(db: Db, pageId: string): GoalPageRow {
  const row = db
    .prepare(`SELECT id, company_id, title, template, section, fields, created_at FROM brain_pages WHERE id = ?`)
    .get(pageId) as GoalPageRow | undefined;
  if (!row || row.template !== GOAL) throw new Error("That is not one of your goals.");
  return row;
}

function checkinsOf(db: Db, pageId: string): GoalCheckin[] {
  return (
    db
      .prepare(`SELECT id, on_day, value, note, is_start FROM goal_checkins WHERE page_id = ? ORDER BY on_day, created_at, rowid`)
      .all(pageId) as CheckinRow[]
  ).map((row) => ({ id: row.id, day: row.on_day, value: row.value, note: row.note, start: row.is_start === 1 }));
}

function detailOf(db: Db, row: GoalPageRow, now: Date): GoalDetail {
  const timezone = timezoneOf(db, row.company_id);
  const today = todayIn(timezone, now);
  const fields = fieldsOf(row.fields);
  const all = checkinsOf(db, row.id);
  const target = number(fields["target"]);
  const done = fields["done"] === true;
  const byOn = isDay(fields["byOn"]) ? fields["byOn"] : null;
  const start = all.find((checkin) => checkin.start) ?? null;
  const value = all.length > 0 ? (all[all.length - 1]?.value ?? 0) : (number(fields["progress"]) ?? 0);
  const startedOn = start?.day ?? dayOf(row.created_at, timezone);
  const startValue = start?.value ?? 0;
  const direction = target !== null ? Math.sign(target - startValue) || 1 : 1;
  const reached = target !== null && (value - target) * direction >= 0;
  // How far along, the way the line reads: from where it started, so a weight
  // to lose is as far along as a number of books to read.
  const percent = done
    ? 100
    : target === null || target === startValue
      ? null
      : Math.max(0, Math.min(100, Math.round(((value - startValue) / (target - startValue)) * 100)));
  return {
    id: row.id,
    title: row.title,
    area: text(fields["area"]),
    byOn,
    daysLeft: byOn ? daysLeftOf(byOn, today) : null,
    target,
    progress: value,
    unit: text(fields["unit"]),
    done,
    percent,
    startedOn,
    startValue,
    checkins: all.filter((checkin) => !checkin.start),
    pace: goalPace({ startedOn, startValue, target, byOn, value, today, done }),
    reached: reached && !done,
    today,
  };
}

/** Every goal of yours, with its line: not done first, soonest first. */
export function goalDetails(db: Db, companyId: string, now: Date = new Date()): GoalDetail[] {
  const rows = db
    .prepare(
      `SELECT id, company_id, title, template, section, fields, created_at FROM brain_pages
       WHERE company_id = ? AND section = 'goals' AND template = ? AND is_archived = 0`,
    )
    .all(companyId, GOAL) as GoalPageRow[];
  return rows
    .map((row) => detailOf(db, row, now))
    .sort(
      (a, b) =>
        Number(a.done) - Number(b.done) ||
        (a.byOn ?? "9999").localeCompare(b.byOn ?? "9999") ||
        a.title.localeCompare(b.title),
    );
}

function goalDetail(db: Db, pageId: string, now: Date = new Date()): GoalDetail {
  return detailOf(db, goalRow(db, pageId), now);
}

/** The page's *So far*, saved as an edit of the page. */
function writeProgress(db: Db, pageId: string, value: number, now: Date): void {
  const page = findPageRow(db, pageId);
  if (!page) throw new Error("That goal no longer exists.");
  savePageRow(db, pageId, { title: page.title, body: page.body, fields: { ...page.stored, progress: value } }, page.revision, now.toISOString());
}

/**
 * A goal moved: "+1", or where it stands now, and a word about it. The first
 * one also keeps where the goal stood before, on the day it was set.
 */
export function checkIn(db: Db, pageId: string, raw: unknown, now: Date = new Date()): GoalDetail {
  const input = checkInInput.parse(raw);
  const before = detailOf(db, goalRow(db, pageId), now);
  const current = before.progress ?? 0;
  const value = Math.round((input.setTo ?? current + (input.add ?? 0)) * 1000) / 1000;
  const at = now.toISOString();
  const insert = db.prepare(
    `INSERT INTO goal_checkins (id, page_id, on_day, value, note, is_start, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  db.transaction(() => {
    const any = db.prepare(`SELECT 1 FROM goal_checkins WHERE page_id = ? LIMIT 1`).get(pageId);
    if (!any) insert.run(randomUUID(), pageId, before.startedOn, current, null, 1, at);
    insert.run(randomUUID(), pageId, before.today, value, input.note ? input.note : null, 0, at);
    writeProgress(db, pageId, value, now);
  })();
  return goalDetail(db, pageId, now);
}

/** The latest check-in taken back; the goal stands where it did before it. */
export function undoCheckIn(db: Db, checkinId: unknown, now: Date = new Date()): GoalDetail {
  const row =
    typeof checkinId === "string"
      ? (db.prepare(`SELECT id, page_id, is_start FROM goal_checkins WHERE id = ?`).get(checkinId) as
          | { id: string; page_id: string; is_start: number }
          | undefined)
      : undefined;
  if (!row || row.is_start === 1) throw new Error("That check-in cannot be taken back.");
  const newest = (
    db
      .prepare(`SELECT id FROM goal_checkins WHERE page_id = ? ORDER BY on_day DESC, created_at DESC, rowid DESC LIMIT 1`)
      .get(row.page_id) as { id: string }
  ).id;
  if (newest !== row.id) throw new Error("Only the latest check-in can be taken back.");
  db.transaction(() => {
    db.prepare(`DELETE FROM goal_checkins WHERE id = ?`).run(row.id);
    const left = db
      .prepare(`SELECT id, value, is_start FROM goal_checkins WHERE page_id = ? ORDER BY on_day DESC, created_at DESC, rowid DESC`)
      .all(row.page_id) as { id: string; value: number; is_start: number }[];
    const previous = left[0];
    // Only the start left: the goal is as it was before it was ever checked in.
    if (previous && previous.is_start === 1 && left.length === 1) {
      db.prepare(`DELETE FROM goal_checkins WHERE id = ?`).run(previous.id);
    }
    writeProgress(db, row.page_id, previous?.value ?? 0, now);
  })();
  return goalDetail(db, row.page_id, now);
}

/** Reached, or not: an edit of the page, which is what counts it towards your level. */
export function setGoalDone(db: Db, pageId: string, done: unknown, now: Date = new Date()): GoalDetail {
  goalRow(db, pageId);
  const page = findPageRow(db, pageId);
  if (!page) throw new Error("That goal no longer exists.");
  savePageRow(db, pageId, { title: page.title, body: page.body, fields: { ...page.stored, done: done === true } }, page.revision, now.toISOString());
  return goalDetail(db, pageId, now);
}

/* ---- Your week ------------------------------------------------------------- */

/** The week's themes, Monday first; a theme for a page reads as the page's name now. */
export function dayThemes(db: Db, companyId: string): DayTheme[] {
  return (
    db
      .prepare(
        `SELECT t.weekday, t.label, t.page_id, t.area, p.title
           FROM day_themes t
           LEFT JOIN brain_pages p ON p.id = t.page_id AND p.is_archived = 0
          WHERE t.company_id = ?
          ORDER BY t.weekday`,
      )
      .all(companyId) as { weekday: number; label: string; page_id: string | null; area: string | null; title: string | null }[]
  ).map((row) => ({
    weekday: row.weekday,
    label: row.title ?? row.label,
    pageId: row.title !== null ? row.page_id : null,
    area: row.area,
  }));
}

/** A weekday given a theme, or - with null - its theme taken off. */
export function setDayTheme(db: Db, companyId: string, weekday: unknown, raw: unknown): DayTheme[] {
  if (typeof weekday !== "number" || !Number.isInteger(weekday) || weekday < 1 || weekday > 7) {
    throw new Error("That is not a day of the week.");
  }
  timezoneOf(db, companyId);
  if (raw === null) {
    db.prepare(`DELETE FROM day_themes WHERE company_id = ? AND weekday = ?`).run(companyId, weekday);
    return dayThemes(db, companyId);
  }
  const input = dayThemeInput.parse(raw);
  if (input.pageId && !db.prepare(`SELECT 1 FROM brain_pages WHERE id = ? AND company_id = ?`).get(input.pageId, companyId)) {
    throw new Error("That page is not in this workspace.");
  }
  db.prepare(
    `INSERT INTO day_themes (company_id, weekday, label, page_id, area) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (company_id, weekday) DO UPDATE SET label = excluded.label, page_id = excluded.page_id, area = excluded.area`,
  ).run(companyId, weekday, input.label, input.pageId, input.area);
  return dayThemes(db, companyId);
}
