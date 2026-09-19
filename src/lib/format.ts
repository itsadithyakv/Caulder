/**
 * Display formatting.
 *
 * No date library. Both existing projects use native Intl and a couple of
 * small helpers, and the arithmetic here is day differences, which does not
 * justify a dependency.
 */

const numberFormat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });

/** One formatter per currency, built once. Intl formatters are not cheap. */
const currencyFormats = new Map<string, Intl.NumberFormat>();

/**
 * Whole currency units, grouped.
 *
 * With a currency it is symbolled, which matters on the marketing screen where
 * money out and money in sit in the same table and an unmarked number is one
 * more thing to hold in your head. Without one it is a bare number, which is
 * what every other screen has always shown.
 *
 * Nothing is ever converted. The currency is the workspace's own, so a total
 * is a total of one thing — mixing rates in would mean choosing a date to have
 * converted on, and being wrong about it forever after.
 */
export function formatValue(value: number, currency?: string): string {
  if (!currency) return numberFormat.format(value);

  let format = currencyFormats.get(currency);
  if (!format) {
    try {
      format = new Intl.NumberFormat(undefined, {
        style: "currency",
        currency,
        maximumFractionDigits: 0,
      });
    } catch {
      // An unknown code is not a reason to show nothing.
      format = numberFormat;
    }
    currencyFormats.set(currency, format);
  }

  return format.format(value);
}

const clockFormat = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
});

/**
 * `HH:MM` as the reader's own clock, so 13:00 shows as 1 pm where that is what
 * people say and stays 13:00 where it is not. The stored value never changes.
 */
export function formatTime(time: string): string {
  return clockFormat.format(new Date(`2000-01-01T${time}:00`));
}

/**
 * A length of time in words. "1h 30m", not "90 minutes" and not "1.5 hours".
 *
 * Hours and minutes are how a day is read off a grid, and a decimal hour makes
 * you do arithmetic to find out when something ends.
 */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

const dateFormat = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
  year: "numeric",
});

const timeFormat = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
});

export function formatDate(iso: string): string {
  return dateFormat.format(new Date(iso));
}

/**
 * A calendar day ("2026-09-26") as a date. Built from its parts, because
 * `new Date("2026-09-26")` is midnight UTC and shows the day before anywhere
 * west of Greenwich.
 */
export function formatDay(day: string): string {
  const [year, month, date] = day.split("-").map(Number);
  return dateFormat.format(new Date(year ?? 1970, (month ?? 1) - 1, date ?? 1));
}

const monthFormat = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" });

/** A calendar day's month and year: "July 2027". Built from parts, like formatDay. */
export function formatMonth(day: string): string {
  const [year, month] = day.split("-").map(Number);
  return monthFormat.format(new Date(year ?? 1970, (month ?? 1) - 1, 1));
}

export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  return `${dateFormat.format(date)} at ${timeFormat.format(date)}`;
}

/** Whole days between two instants, counted by local calendar day. */
function daysBetween(from: Date, to: Date): number {
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const b = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/**
 * "Today", "Yesterday", "5 days ago", then a date once that stops being the
 * useful way to say it.
 */
export function relativeDay(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  const days = daysBetween(then, now);

  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days} days ago`;
  return formatDate(iso);
}
