import { daysBetween, shiftDay, weekdayOf } from "./dates";

/**
 * Working out which days a repeating block falls on.
 *
 * The one kind of repeat a student actually needs: **some days of the week,
 * between two dates**. A Tuesday lecture, the gym on Monday, Wednesday and
 * Friday, a club that meets on Thursdays until the end of term. Full calendar
 * recurrence — monthly by ordinal, yearly, exceptions to the rule — is a
 * standard nobody asked for here and would be most of the code.
 *
 * Occurrences are worked out here and then written as ordinary blocks, rather
 * than being computed at read time. That is a deliberate trade:
 *
 *  - Editing one Tuesday because a lecture moved is just editing a block.
 *  - The Google sync needs no idea that repeats exist; each occurrence is a
 *    real block and becomes a real event.
 *  - Today, the day grid and the breakdown all work unchanged.
 *
 * The cost is rows, and a term of three lectures a week is about forty-five of
 * them. That is nothing, and it buys a feature that cannot surprise anybody.
 */

/** Monday through Sunday, ISO numbering. */
export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;

export const WEEKDAY_LABEL: Record<number, string> = {
  1: "Mon",
  2: "Tue",
  3: "Wed",
  4: "Thu",
  5: "Fri",
  6: "Sat",
  7: "Sun",
};

/**
 * The ceiling on one repeat.
 *
 * A year is longer than any term, and four hundred occurrences is more than
 * daily for a year. Both exist so that a mistyped end date costs a refusal
 * rather than fifty thousand rows.
 */
const MAX_SPAN_DAYS = 366;
export const MAX_OCCURRENCES = 400;

type Repeat = {
  /** ISO weekday numbers. Empty means it does not repeat at all. */
  weekdays: readonly number[];
  from: string;
  until: string;
};

type RepeatProblem =
  | { ok: true }
  | { ok: false; reason: string };

export function checkRepeat(repeat: Repeat): RepeatProblem {
  if (repeat.weekdays.length === 0) {
    return { ok: false, reason: "Pick at least one day of the week." };
  }
  if (repeat.until < repeat.from) {
    return { ok: false, reason: "The last day is before the first one." };
  }

  const span = daysBetween(repeat.from, repeat.until);
  if (span > MAX_SPAN_DAYS) {
    return { ok: false, reason: "Repeat for a year at most." };
  }

  return { ok: true };
}

/**
 * Every day the repeat lands on, in order.
 *
 * Inclusive at both ends: a repeat that runs to the last Friday of term should
 * include that Friday, and an off-by-one here is a lecture nobody was told
 * about.
 */
export function occurrencesOf(repeat: Repeat): string[] {
  if (checkRepeat(repeat).ok === false) return [];

  const wanted = new Set(repeat.weekdays);
  const days: string[] = [];

  let day = repeat.from;
  while (day <= repeat.until && days.length < MAX_OCCURRENCES) {
    if (wanted.has(weekdayOf(day))) days.push(day);
    day = shiftDay(day, 1);
  }

  return days;
}

/** How a repeat reads back to a person, for the block that carries it. */
export function describeRepeat(repeat: Repeat): string {
  if (repeat.weekdays.length === 0) return "Does not repeat";
  if (repeat.weekdays.length === 7) return `Every day until ${repeat.until}`;

  const names = [...repeat.weekdays]
    .sort((a, b) => a - b)
    .map((day) => WEEKDAY_LABEL[day] ?? "")
    .join(", ");

  return `${names} until ${repeat.until}`;
}
