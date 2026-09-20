import { z } from "zod";
import { daysBetween, shiftDay, weekdayOf } from "./dates";
import type { GoalRow } from "./life";

/**
 * Keeping up with your own goals and your week (after 0.4).
 *
 * **A goal moves by check-ins.** "+1 book", or "set to 79 kg", with a word
 * about it if you like; each is kept with its day, so a goal has a line to
 * draw - where it has been, where it should be by now, and when it will be
 * reached at the rate so far. The page's *So far* follows the latest one.
 *
 * **A week can have themes**: Monday for studies, Tuesday for guitar. A theme
 * is a focus, not a lock - the Calendar and Today say what the day is for,
 * and a hobby counts how many of its days it actually got.
 */

/* ---- Goals ----------------------------------------------------------------- */

export type GoalCheckin = {
  id: string;
  day: string;
  /** Where the goal stood after it. */
  value: number;
  note: string | null;
  /** The start of the line: where it stood before the first check-in. Not undone, not listed. */
  start: boolean;
};

export type GoalPace = {
  /** Where the line from the start to the target says it should be today. */
  expected: number;
  /** Ahead (more than 0) or behind, in days of the pace it needs. */
  aheadDays: number;
  /** When it will be reached at the rate so far; null when it is not moving towards it. */
  projectedOn: string | null;
  /** `new`: set today - a day of it is too little to be ahead or behind of anything. */
  status: "done" | "new" | "ahead" | "behind" | "on-pace" | "no-date" | "not-moving";
};

export type GoalDetail = GoalRow & {
  /** Where the line starts: the day the goal was set, and where it stood. */
  startedOn: string;
  startValue: number;
  checkins: GoalCheckin[];
  /** Null for a goal with no number to reach. */
  pace: GoalPace | null;
  /** Reached, and not marked done yet: it can be. */
  reached: boolean;
  today: string;
};

export const checkInInput = z
  .object({
    add: z.number().finite().optional(),
    setTo: z.number().finite().optional(),
    note: z.string().trim().max(200, "Keep the note under 200 characters.").optional(),
  })
  .refine((input) => (input.add === undefined) !== (input.setTo === undefined), {
    message: "Add to it, or say where it stands now.",
  })
  .refine((input) => input.add !== 0, { message: "Add something other than nothing." });

export type CheckInInput = z.input<typeof checkInInput>;

/**
 * How a goal is doing against its day. The pace line runs straight from where
 * it started to the target on its day; ahead or behind is measured in days of
 * that pace, which is how a person thinks of it ("two weeks ahead") rather
 * than in books. A goal can count down as well as up - a weight to lose - and
 * both read the same way.
 */
export function goalPace(goal: {
  startedOn: string;
  startValue: number;
  target: number | null;
  byOn: string | null;
  value: number;
  today: string;
  done: boolean;
}): GoalPace | null {
  const { startedOn, startValue, target, byOn, value, today, done } = goal;
  if (target === null) return null;
  const direction = Math.sign(target - startValue) || 1;
  const reached = (value - target) * direction >= 0;
  if (done || reached) return { expected: target, aheadDays: 0, projectedOn: null, status: "done" };

  const elapsed = Math.max(0, daysBetween(startedOn, today));
  if (elapsed === 0) return { expected: startValue, aheadDays: 0, projectedOn: null, status: "new" };
  const moved = (value - startValue) * direction;
  let projectedOn: string | null = null;
  if (elapsed >= 1 && moved > 0) {
    const perDay = moved / elapsed;
    const days = Math.ceil(((target - value) * direction) / perDay);
    if (days <= 3650) projectedOn = shiftDay(today, days);
  }

  if (!byOn) return { expected: value, aheadDays: 0, projectedOn, status: moved > 0 ? "no-date" : "not-moving" };
  const span = Math.max(1, daysBetween(startedOn, byOn));
  const needed = (target - startValue) / span;
  const expected = startValue + needed * Math.min(elapsed, span);
  const aheadDays = Math.round(((value - expected) * direction) / Math.abs(needed || 1));
  const status = Math.abs(aheadDays) <= 1 ? "on-pace" : aheadDays > 0 ? "ahead" : "behind";
  return { expected, aheadDays, projectedOn, status };
}

/** "2 weeks", "5 days", "1 day": a stretch of days the way it is said. */
export function daysInWords(days: number): string {
  const n = Math.abs(days);
  if (n >= 14 && n % 7 <= 1) return `${Math.round(n / 7)} weeks`;
  if (n >= 60) return `${Math.round(n / 30)} months`;
  return n === 1 ? "1 day" : `${n} days`;
}

/* ---- Your week ------------------------------------------------------------- */

export type DayTheme = {
  /** 1 is Monday, 7 is Sunday. */
  weekday: number;
  /** What the day is for: a hobby's or a course's name, an area, or words. */
  label: string;
  /** The hobby, course or goal it is for, when it is one. */
  pageId: string | null;
  area: string | null;
};

export const dayThemeInput = z.object({
  label: z.string().trim().min(1, "Say what the day is for.").max(40, "Keep it under 40 characters."),
  pageId: z.string().nullable().default(null),
  area: z.string().trim().max(40).nullable().default(null),
});

export type DayThemeInput = z.input<typeof dayThemeInput>;

/** The theme on a day, if its weekday has one. */
export function themeOn(themes: readonly DayTheme[], day: string): DayTheme | null {
  return themes.find((theme) => theme.weekday === weekdayOf(day)) ?? null;
}

/* ---- A hobby's weeks --------------------------------------------------------- */

/**
 * Week totals from a hobby's days (HobbyRow.weeks: Monday first, oldest week
 * first, null for a day not come yet), the newest `count` of them, each with
 * the Monday it began and whether it is still going.
 */
export function weeklyTotals(
  weeks: readonly (readonly (number | null)[])[],
  thisMonday: string,
  count: number,
): { monday: string; minutes: number; partial: boolean }[] {
  const recent = weeks.slice(-count);
  return recent.map((week, index) => ({
    monday: shiftDay(thisMonday, -(recent.length - 1 - index) * 7),
    minutes: week.reduce<number>((sum, minutes) => sum + (minutes ?? 0), 0),
    partial: week.some((minutes) => minutes === null),
  }));
}

/**
 * Of a hobby's theme days in the last four weeks - the ones already come,
 * today included - how many it got any time on.
 */
export function themeDaysKept(
  weeks: readonly (readonly (number | null)[])[],
  weekdays: readonly number[],
): { kept: number; of: number } {
  let kept = 0;
  let of = 0;
  for (const week of weeks.slice(-4)) {
    for (const weekday of weekdays) {
      const minutes = week[weekday - 1];
      if (minutes === null || minutes === undefined) continue;
      of += 1;
      if (minutes > 0) kept += 1;
    }
  }
  return { kept, of };
}
