/**
 * Calendar days, in the company's timezone.
 *
 * "Due today" is a calendar question, not an instant. A task stored as a
 * timestamp and compared in UTC shows as due yesterday for a user in
 * Asia/Kolkata every evening after 18:30, which is exactly when somebody
 * checks what is left to do.
 *
 * So a due date is a `YYYY-MM-DD` string, and "today" is whatever day it is
 * where the company is. The helpers here are the only place that conversion
 * happens.
 *
 * No date library, matching the existing projects. `shiftDay` is the same
 * primitive as Unifloe's `shiftDate` in lib/email-worker.ts.
 */

/** A calendar day as `YYYY-MM-DD`. */
type Day = string;

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isDay(value: unknown): value is Day {
  return typeof value === "string" && DAY_PATTERN.test(value);
}

/**
 * Today where the company is.
 *
 * en-CA formats as YYYY-MM-DD, which is the one locale that gives the shape we
 * store without reassembling parts by hand.
 */
export function today(timezone: string, now: Date = new Date()): Day {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  } catch {
    // An unknown timezone must not stop the app telling you what is due. The
    // machine's own day is a better answer than an error.
    return new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
  }
}

/**
 * Moves a day by a number of days.
 *
 * Deliberately arithmetic in UTC. Doing this in local time lands on the wrong
 * date twice a year wherever daylight saving applies, because one day is not
 * always 24 hours.
 */
export function shiftDay(day: Day, days: number): Day {
  const at = Date.parse(`${day}T00:00:00Z`);
  return new Date(at + days * 86_400_000).toISOString().slice(0, 10);
}

/** Whole days from `from` to `to`. Negative when `to` is earlier. */
export function daysBetween(from: Day, to: Day): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000,
  );
}

/**
 * Which day of the week a day is, Monday 1 through Sunday 7.
 *
 * ISO numbering rather than JavaScript's, where Sunday is 0 and the week
 * therefore starts on the wrong day for everyone outside the United States. A
 * timetable is read Monday first.
 */
export function weekdayOf(day: Day): number {
  const js = new Date(`${day}T00:00:00Z`).getUTCDay();
  return js === 0 ? 7 : js;
}

/**
 * The Monday of the week a day falls in.
 *
 * Monday rather than Sunday for the same reason `weekdayOf` numbers that way:
 * a timetable is read Monday first, and a week that puts the weekend at both
 * ends is a week nobody can scan.
 */
export function startOfWeek(day: Day): Day {
  return shiftDay(day, -(weekdayOf(day) - 1));
}

/**
 * The first day of the month, quarter or year a day falls in.
 *
 * What a target "per quarter" is measured from. Without it a quarterly goal is
 * compared against everything ever won, which flatters harder every year the
 * business survives — the number goes up whatever you do this quarter, which
 * is the opposite of what a target is for.
 *
 * Arithmetic on the string rather than on a Date, like everything else here:
 * a month has no fixed length and a quarter has no fixed start, and neither
 * fact is one a timezone should be allowed to move.
 */
export function periodStart(day: Day, period: "month" | "quarter" | "year"): Day {
  const year = day.slice(0, 4);
  if (period === "year") return `${year}-01-01`;

  const month = Number(day.slice(5, 7));
  if (period === "month") return `${year}-${String(month).padStart(2, "0")}-01`;

  const first = Math.floor((month - 1) / 3) * 3 + 1;
  return `${year}-${String(first).padStart(2, "0")}-01`;
}

/** The calendar day an instant fell on, where the company is. */
export function dayOf(iso: string, timezone: string): Day {
  return today(timezone, new Date(iso));
}

/* ---- Times of day -------------------------------------------------------
 *
 * A day plan needs a clock as well as a calendar, and the same rule applies:
 * `HH:MM` is a string, not an instant. A block at 09:00 is at nine o'clock
 * wherever you are - it does not move because the machine's timezone did, and
 * it has no business being a Date with a year in it.
 *
 * Everything here is arithmetic on minutes since midnight, and everything
 * clamps to the day rather than wrapping. A meeting dragged past midnight
 * should stop at midnight, not reappear at the top of the same morning.
 * ------------------------------------------------------------------------ */

/** A time of day as `HH:MM`, 00:00 to 23:59. */
type Time = string;

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Minutes in a day. The clamp for everything below. */
export const DAY_MINUTES = 24 * 60;

export function isTime(value: unknown): value is Time {
  return typeof value === "string" && TIME_PATTERN.test(value);
}

/**
 * The time of day where the company is, as `HH:MM`.
 *
 * The clock half of `today()`, and the same reasoning: what matters is what
 * time it is *there*, not on this machine. en-GB with hour12 off gives 24-hour
 * zero-padded parts, and an unknown timezone falls back to the machine rather
 * than throwing - being an hour out is recoverable, a blank day plan is not.
 */
export function timeNow(timezone: string, now: Date = new Date()): Time {
  const options: Intl.DateTimeFormatOptions = {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  };
  try {
    return new Intl.DateTimeFormat("en-GB", { ...options, timeZone: timezone }).format(now);
  } catch {
    return new Intl.DateTimeFormat("en-GB", options).format(now);
  }
}

/** Minutes since midnight. Returns 0 for anything unparseable. */
export function minutesOf(time: Time): number {
  const match = TIME_PATTERN.exec(time);
  if (!match) return 0;
  return Number(match[1]) * 60 + Number(match[2]);
}

/** The inverse, clamped into the day at both ends. */
export function timeOf(minutes: number): Time {
  const clamped = Math.max(0, Math.min(DAY_MINUTES - 1, Math.round(minutes)));
  const hour = Math.floor(clamped / 60);
  const minute = clamped % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/** Moves a time, stopping at either end of the day rather than wrapping. */
export function shiftTime(time: Time, minutes: number): Time {
  return timeOf(minutesOf(time) + minutes);
}

/**
 * How long there is between a start and the end of the day.
 *
 * What a new block's length is capped to, so dropping one at 23:30 gives half
 * an hour rather than a block that claims to end tomorrow.
 */
export function minutesLeftInDay(time: Time): number {
  return DAY_MINUTES - minutesOf(time);
}

/**
 * Whether two spans share any minute.
 *
 * Touching is not overlapping: a block ending at 10:00 and one starting at
 * 10:00 are back to back, which is the most ordinary thing in a day plan.
 */
export function overlaps(
  startA: Time,
  minutesA: number,
  startB: Time,
  minutesB: number,
): boolean {
  const a = minutesOf(startA);
  const b = minutesOf(startB);
  return a < b + minutesB && b < a + minutesA;
}

/**
 * How a due date reads to a person. "Today" and "Tomorrow" are what the eye
 * looks for; past that, a count is easier to judge than a date.
 */
export function describeDue(due: Day, todayDay: Day): string {
  const delta = daysBetween(todayDay, due);

  if (delta === 0) return "Today";
  if (delta === 1) return "Tomorrow";
  if (delta === -1) return "Yesterday";
  if (delta < 0) return `${Math.abs(delta)} days ago`;
  if (delta < 7) return `In ${delta} days`;

  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    ...(due.slice(0, 4) === todayDay.slice(0, 4) ? {} : { year: "numeric" }),
  }).format(new Date(`${due}T00:00:00Z`));
}
