import { z } from "zod";
import { TASK_AREAS } from "./domain";

/**
 * Habits (PLAN.md, part four): the small things done most days, ticked on
 * Today. The streak is worked out from the ticks, counting only the days a
 * habit is for, so a Monday-Wednesday-Friday habit is not broken by a
 * Tuesday, and today not ticked yet does not break anything: the day is not
 * over.
 */

export const habitInput = z.object({
  name: z.string().trim().min(1, "Say what the habit is.").max(80, "Keep it under 80 characters."),
  area: z.enum(TASK_AREAS).nullable().default(null),
  weekdays: z
    .array(z.number().int().min(1).max(7))
    .min(1, "Pick at least one day.")
    .max(7)
    .default([1, 2, 3, 4, 5, 6, 7]),
});

export type HabitInput = z.input<typeof habitInput>;

export type Habit = {
  id: string;
  name: string;
  area: string | null;
  weekdays: number[];
  /** Whether today is one of its days, and whether it is ticked. */
  dueToday: boolean;
  doneToday: boolean;
  /** Its days in a row, done, up to today. */
  streak: number;
  best: number;
  /** The last twelve weeks, Monday first, oldest first: null for a day it is not for. */
  weeks: (boolean | null)[][];
  /** Done out of its days, over the last four weeks, as a percentage; null before it has had any. */
  rate: number | null;
  archived: boolean;
};

export type HabitsOverview = { today: string; habits: Habit[] };

type Shift = (day: string, by: number) => string;
type Weekday = (day: string) => number;

/**
 * Its days in a row, done, counting back from today - or from yesterday
 * while today is not ticked yet. Days it is not for are stepped over.
 */
export function habitStreak(
  weekdays: ReadonlySet<number>,
  done: ReadonlySet<string>,
  today: string,
  since: string,
  shift: Shift,
  weekdayOf: Weekday,
): number {
  let at = done.has(today) ? today : shift(today, -1);
  let run = 0;
  // A year back at most: the loop needs an end even for a habit ticked every day since it began.
  for (let step = 0; step < 400 && at >= since; step += 1) {
    if (weekdays.has(weekdayOf(at))) {
      if (!done.has(at)) break;
      run += 1;
    }
    at = shift(at, -1);
  }
  return run;
}

/** The longest run it has had, the same way: its own days, in a row. */
export function bestStreak(
  weekdays: ReadonlySet<number>,
  done: ReadonlySet<string>,
  today: string,
  since: string,
  shift: Shift,
  weekdayOf: Weekday,
): number {
  let best = 0;
  let run = 0;
  for (let at = since; at <= today; at = shift(at, 1)) {
    if (!weekdays.has(weekdayOf(at))) continue;
    if (done.has(at)) {
      run += 1;
      best = Math.max(best, run);
    } else if (at !== today) {
      run = 0;
    }
  }
  return best;
}
