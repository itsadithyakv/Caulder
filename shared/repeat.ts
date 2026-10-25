import { addMonths, daysBetween, shiftDay, weekdayOf } from "./dates";

/**
 * Working out which days a repeating block falls on.
 *
 * The one kind of repeat a week actually needs: **some days of the week,
 * between two dates**. A Tuesday standup, the gym on Monday, Wednesday and
 * Friday, a club that meets on Thursdays until the end of the quarter. Full calendar
 * recurrence — monthly by ordinal, yearly, exceptions to the rule — is a
 * standard nobody asked for here and would be most of the code.
 *
 * Occurrences are worked out here and then written as ordinary blocks, rather
 * than being computed at read time. That is a deliberate trade:
 *
 *  - Editing one Tuesday because a call moved is just editing a block.
 *  - The Google sync needs no idea that repeats exist; each occurrence is a
 *    real block and becomes a real event.
 *  - Today, the day grid and the breakdown all work unchanged.
 *
 * The cost is rows, and a quarter of three calls a week is about forty of
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
 * A year is longer than any plan, and four hundred occurrences is more than
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
  /** Every week, or every other week counted from the week of `from` (PLAN.md, part twelve, phase 47). */
  every?: 1 | 2;
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
 * Inclusive at both ends: a repeat that runs to the last Friday of the quarter should
 * include that Friday, and an off-by-one here is a call nobody was told
 * about.
 */
export function occurrencesOf(repeat: Repeat): string[] {
  if (checkRepeat(repeat).ok === false) return [];

  const wanted = new Set(repeat.weekdays);
  const days: string[] = [];
  // Every other week: the weeks counted from the one `from` is in, the even ones.
  const firstWeek = shiftDay(repeat.from, 1 - weekdayOf(repeat.from));
  const onWeek = (day: string) => repeat.every !== 2 || Math.floor(daysBetween(firstWeek, day) / 7) % 2 === 0;

  let day = repeat.from;
  while (day <= repeat.until && days.length < MAX_OCCURRENCES) {
    if (wanted.has(weekdayOf(day)) && onWeek(day)) days.push(day);
    day = shiftDay(day, 1);
  }

  return days;
}

/**
 * When a task that comes back is due next, from the day the last one was due
 * (PLAN.md, part twelve, phase 47): a fortnight on, or the same day of the
 * next month or year - the last day of a shorter month, as `addMonths` keeps it.
 */
export function nextDue(day: string, repeats: "fortnightly" | "monthly" | "yearly", onDay?: number | null): string {
  if (repeats === "fortnightly") return shiftDay(day, 14);
  return onTheDay(addMonths(day, repeats === "monthly" ? 1 : 12), onDay);
}

/**
 * A day moved onto the day of the month its run was set on, or the month's
 * last day when the month is shorter. Without it a run on the 31st was
 * clamped to the 28th in February and stayed there.
 */
function onTheDay(day: string, onDay?: number | null): string {
  if (!onDay) return day;
  const [year = 2000, month = 1] = day.split("-").map(Number);
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${day.slice(0, 8)}${String(Math.min(onDay, last)).padStart(2, "0")}`;
}

/** How a repeat reads back to a person, for the block that carries it. */
export function describeRepeat(repeat: Repeat): string {
  if (repeat.weekdays.length === 0) return "Does not repeat";
  if (repeat.weekdays.length === 7 && repeat.every !== 2) return `Every day until ${repeat.until}`;

  const names = [...repeat.weekdays]
    .sort((a, b) => a - b)
    .map((day) => WEEKDAY_LABEL[day] ?? "")
    .join(", ");

  return `${repeat.every === 2 ? "Every other " : ""}${names} until ${repeat.until}`;
}
