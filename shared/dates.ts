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

/** The calendar day an instant fell on, where the company is. */
export function dayOf(iso: string, timezone: string): Day {
  return today(timezone, new Date(iso));
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
