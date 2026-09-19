import { randomUUID } from "node:crypto";
import type { Db } from "../db/connection";
import { shiftDay, startOfWeek, today as todayIn, weekdayOf } from "@shared/dates";
import { bestStreak, habitInput, habitStreak, type Habit, type HabitsOverview } from "@shared/habits";

/**
 * Habits (PLAN.md, part four): stored as a name, an area and its days, and a
 * row for each day ticked. Everything else - the streak, the best run, the
 * twelve weeks, how often - is worked out here when asked.
 */

type HabitRow = {
  id: string;
  company_id: string;
  name: string;
  area: string | null;
  weekdays: string;
  position: number;
  archived_at: string | null;
  created_at: string;
};

/** How far back a day can still be ticked: a week, for the evening you forgot. */
const TICK_BACK = 7;

function companyDay(db: Db, companyId: string, now: Date): string {
  const row = db.prepare(`SELECT timezone FROM companies WHERE id = ?`).get(companyId) as { timezone: string } | undefined;
  if (!row) throw new Error("That company no longer exists.");
  return todayIn(row.timezone, now);
}

function rowOf(db: Db, id: string): HabitRow {
  const row = db.prepare(`SELECT * FROM habits WHERE id = ?`).get(id) as HabitRow | undefined;
  if (!row) throw new Error("That habit no longer exists.");
  return row;
}

function daysOf(value: string): number[] {
  return value
    .split(",")
    .map(Number)
    .filter((day) => day >= 1 && day <= 7);
}

function toHabit(db: Db, row: HabitRow, today: string, timezone: string): Habit {
  const weekdays = new Set(daysOf(row.weekdays));
  const done = new Set(
    (db.prepare(`SELECT day FROM habit_checks WHERE habit_id = ?`).all(row.id) as { day: string }[]).map((check) => check.day),
  );
  // It began the day it was made, in the company's own day - but a tick from before that still counts.
  const made = todayIn(timezone, new Date(row.created_at));
  const earliest = [...done].sort()[0];
  const since = earliest && earliest < made ? earliest : made;

  const firstMonday = shiftDay(startOfWeek(today), -7 * 11);
  const weeks: (boolean | null)[][] = [];
  for (let week = 0; week < 12; week += 1) {
    const days: (boolean | null)[] = [];
    for (let offset = 0; offset < 7; offset += 1) {
      const day = shiftDay(firstMonday, week * 7 + offset);
      days.push(day > today || day < since || !weekdays.has(weekdayOf(day)) ? null : done.has(day));
    }
    weeks.push(days);
  }

  // How often, over the four weeks before today and today if ticked: a day not over yet is not a miss.
  let due = 0;
  let kept = 0;
  for (let back = 0; back < 28; back += 1) {
    const day = shiftDay(today, -back);
    if (day < since || !weekdays.has(weekdayOf(day))) continue;
    if (day === today && !done.has(day)) continue;
    due += 1;
    if (done.has(day)) kept += 1;
  }

  return {
    id: row.id,
    name: row.name,
    area: row.area,
    weekdays: [...weekdays].sort((a, b) => a - b),
    dueToday: weekdays.has(weekdayOf(today)),
    doneToday: done.has(today),
    streak: habitStreak(weekdays, done, today, since, shiftDay, weekdayOf),
    best: bestStreak(weekdays, done, today, since, shiftDay, weekdayOf),
    weeks,
    rate: due > 0 ? Math.round((kept / due) * 100) : null,
    archived: row.archived_at !== null,
  };
}

export function listHabits(db: Db, companyId: string, now: Date = new Date(), archived = false): HabitsOverview {
  const timezone = (db.prepare(`SELECT timezone FROM companies WHERE id = ?`).get(companyId) as { timezone: string } | undefined)
    ?.timezone;
  if (!timezone) throw new Error("That company no longer exists.");
  const today = todayIn(timezone, now);
  const rows = db
    .prepare(
      `SELECT * FROM habits WHERE company_id = ? AND (archived_at IS NULL OR ?) ORDER BY archived_at IS NOT NULL, position, created_at`,
    )
    .all(companyId, archived ? 1 : 0) as HabitRow[];
  return { today, habits: rows.map((row) => toHabit(db, row, today, timezone)) };
}

export function addHabit(db: Db, companyId: string, raw: unknown, now: Date = new Date()): HabitsOverview {
  const input = habitInput.parse(raw);
  companyDay(db, companyId, now);
  const position = (db.prepare(`SELECT COALESCE(MAX(position), -1) + 1 AS n FROM habits WHERE company_id = ?`).get(companyId) as {
    n: number;
  }).n;
  db.prepare(
    `INSERT INTO habits (id, company_id, name, area, weekdays, position, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(randomUUID(), companyId, input.name, input.area, [...new Set(input.weekdays)].sort().join(","), position, now.toISOString());
  return listHabits(db, companyId, now);
}

export function editHabit(db: Db, id: string, raw: unknown, now: Date = new Date()): HabitsOverview {
  const input = habitInput.parse(raw);
  const row = rowOf(db, id);
  db.prepare(`UPDATE habits SET name = ?, area = ?, weekdays = ? WHERE id = ?`).run(
    input.name,
    input.area,
    [...new Set(input.weekdays)].sort().join(","),
    id,
  );
  return listHabits(db, row.company_id, now, true);
}

export function archiveHabit(db: Db, id: string, archived: boolean, now: Date = new Date()): HabitsOverview {
  const row = rowOf(db, id);
  db.prepare(`UPDATE habits SET archived_at = ? WHERE id = ?`).run(archived ? now.toISOString() : null, id);
  return listHabits(db, row.company_id, now, true);
}

export function removeHabit(db: Db, id: string, now: Date = new Date()): HabitsOverview {
  const row = rowOf(db, id);
  db.prepare(`DELETE FROM habits WHERE id = ?`).run(id);
  return listHabits(db, row.company_id, now, true);
}

/**
 * Ticks a day, or takes the tick back. Today or the week before it: a habit
 * is kept on the day, and a week is long enough for the evening forgotten.
 */
export function tickHabit(db: Db, id: string, day: unknown, done: unknown, now: Date = new Date()): HabitsOverview {
  const row = rowOf(db, id);
  const today = companyDay(db, row.company_id, now);
  const on = typeof day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : today;
  if (on > today) throw new Error("A day still to come cannot be ticked yet.");
  if (on < shiftDay(today, -TICK_BACK)) throw new Error("Only the last week can be ticked.");
  if (done === false) db.prepare(`DELETE FROM habit_checks WHERE habit_id = ? AND day = ?`).run(id, on);
  else db.prepare(`INSERT OR IGNORE INTO habit_checks (habit_id, day, created_at) VALUES (?, ?, ?)`).run(id, on, now.toISOString());
  return listHabits(db, row.company_id, now);
}
