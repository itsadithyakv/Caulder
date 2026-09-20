import type { Db } from "../db/connection";
import { dayOf, shiftDay, today as todayIn } from "@shared/dates";
import { CHECKINS, readPulse, type Checkin, type DayFacts, type Pulse } from "@shared/pulse";
import { getSetting, setSetting } from "../repositories/settings";

/**
 * How somebody has been: the days gathered for shared/pulse.ts to read.
 *
 * The load is everything, across every workspace - a person does not have one
 * amount of energy per company - while the mood, the habits and what was
 * logged are their own, from the workspace they are kept in.
 *
 * Read from what is already there: the Calendar, the tasks, the journal's
 * mood, the habits, what the line logged. **Never the private lines.** They
 * are sealed, this has no key to them, and it does not ask for one: not the
 * words, not who they were about, not even how many there were.
 */

const DAYS_BACK = 7 * 12;
const MOOD: Record<string, number> = { rough: 1, low: 2, okay: 3, good: 4, great: 5 };

function pulseOn(db: Db): boolean {
  return getSetting(db, "pulseOff") !== "off";
}

export function setPulse(db: Db, on: unknown): boolean {
  setSetting(db, "pulseOff", on === true ? "" : "off");
  return pulseOn(db);
}

function timezoneOf(db: Db, companyId: string): string {
  const row = db.prepare(`SELECT timezone FROM companies WHERE id = ?`).get(companyId) as { timezone: string } | undefined;
  if (!row) throw new Error("That workspace no longer exists.");
  return row.timezone;
}

export function pulse(db: Db, companyId: string, now: Date = new Date()): { on: boolean; pulse: Pulse | null } {
  if (!pulseOn(db)) return { on: false, pulse: null };
  const timezone = timezoneOf(db, companyId);
  const today = todayIn(timezone, now);
  const from = shiftDay(today, -(DAYS_BACK - 1));

  const tally = (rows: { day: string; n: number }[]) => new Map(rows.map((row) => [row.day, row.n]));
  const minutes = tally(
    db.prepare(`SELECT day, SUM(minutes) AS n FROM blocks WHERE day BETWEEN ? AND ? AND outcome IS NULL GROUP BY day`).all(from, today) as { day: string; n: number }[],
  );
  // Finished when, where they are: a task ticked at one in the morning belongs to the night it was done on.
  const done = new Map<string, number>();
  const finished = db
    .prepare(`SELECT completed_at FROM tasks WHERE completed_at IS NOT NULL AND completed_at >= ?`)
    .all(`${shiftDay(from, -1)}T00:00:00.000Z`) as { completed_at: string }[];
  for (const task of finished) {
    const day = dayOf(task.completed_at, timezone);
    done.set(day, (done.get(day) ?? 0) + 1);
  }

  const entries = db
    .prepare(
      `SELECT json_extract(fields, '$.day') AS day, json_extract(fields, '$.mood') AS mood FROM brain_pages
        WHERE company_id = ? AND section = 'journal' AND json_extract(fields, '$.day') BETWEEN ? AND ?`,
    )
    .all(companyId, from, today) as { day: string; mood: string | null }[];
  const mood = new Map(entries.flatMap((entry) => (entry.mood && MOOD[entry.mood] ? [[entry.day, MOOD[entry.mood] as number] as const] : [])));
  const wrote = new Set(entries.map((entry) => entry.day));

  const ticks = tally(
    db
      .prepare(`SELECT c.day AS day, COUNT(*) AS n FROM habit_checks c JOIN habits h ON h.id = c.habit_id WHERE h.company_id = ? AND c.day BETWEEN ? AND ? GROUP BY c.day`)
      .all(companyId, from, today) as { day: string; n: number }[],
  );
  const logged = tally(
    db.prepare(`SELECT day, COUNT(*) AS n FROM hobby_logs WHERE company_id = ? AND day BETWEEN ? AND ? GROUP BY day`).all(companyId, from, today) as { day: string; n: number }[],
  );
  const answers = new Map(
    (db.prepare(`SELECT day, answer FROM day_checkins WHERE company_id = ? AND day BETWEEN ? AND ?`).all(companyId, from, today) as { day: string; answer: string }[]).map(
      (row) => [row.day, row.answer] as const,
    ),
  );

  const days: DayFacts[] = Array.from({ length: DAYS_BACK }, (_each, index) => {
    const day = shiftDay(from, index);
    const answer = answers.get(day);
    return {
      day,
      minutes: minutes.get(day) ?? 0,
      done: done.get(day) ?? 0,
      mood: mood.get(day) ?? null,
      other: (ticks.get(day) ?? 0) + (logged.get(day) ?? 0) + (wrote.has(day) ? 1 : 0),
      checkin: (CHECKINS as readonly string[]).includes(answer ?? "") ? (answer as Checkin) : null,
    };
  });

  const hobbies = new Map<string, string[]>();
  const given = db
    .prepare(
      `SELECT p.title AS title, b.day AS day FROM blocks b JOIN brain_pages p ON p.id = b.page_id
        WHERE b.company_id = ? AND p.section = 'hobbies' AND b.day BETWEEN ? AND ? AND b.outcome IS NULL GROUP BY p.id, b.day`,
    )
    .all(companyId, from, today) as { title: string; day: string }[];
  for (const row of given) hobbies.set(row.title, [...(hobbies.get(row.title) ?? []), row.day]);

  return { on: true, pulse: readPulse(days, hobbies) };
}

/** What a quiet day was, said the day after. Said again, it is the newer answer that is kept. */
export function answerQuietDay(db: Db, companyId: string, day: unknown, answer: unknown, now: Date = new Date()): { on: boolean; pulse: Pulse | null } {
  if (typeof day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error("That is not a day.");
  if (!(CHECKINS as readonly unknown[]).includes(answer)) throw new Error("That is not one of the answers.");
  db.prepare(
    `INSERT INTO day_checkins (company_id, day, answer, created_at) VALUES (?, ?, ?, ?)
     ON CONFLICT (company_id, day) DO UPDATE SET answer = excluded.answer`,
  ).run(companyId, day, answer, now.toISOString());
  return pulse(db, companyId, now);
}
