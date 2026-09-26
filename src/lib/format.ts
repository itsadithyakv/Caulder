/**
 * Display formatting.
 *
 * No date library. Both existing projects use native Intl and a couple of
 * small helpers, and the arithmetic here is day differences, which does not
 * justify a dependency.
 *
 * **Money and dates read the way they do where the company is** (phase 24),
 * not the way this computer's language setting says: ₹1,85,000 and 26 Sept
 * for a company in India, $185,000 and Sep 26 in the United States, 13:05 in
 * Germany. The words stay English. `setRegion` is called by the workspace
 * before anything draws; every formatter here, and `numberText` and
 * `dateFormatter` for the screens that build their own, read it.
 */

let locale: string | undefined;

/** Every formatter made, by locale and options: Intl formatters are not cheap. */
const made = new Map<string, Intl.NumberFormat | Intl.DateTimeFormat>();

/**
 * The locale everything is formatted in: `en-IN` for a company in India
 * (`localeFor` in shared/countries.ts), or undefined - this computer's own -
 * when no country has been said. Cheap to call on every draw.
 */
export function setRegion(next: string | undefined): void {
  locale = next;
}

/** The region's locale, for a formatter in shared/ that takes one (`describeDue`). */
export function region(): string | undefined {
  return locale;
}

function numberFormatter(options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = `n|${locale ?? ""}|${JSON.stringify(options)}`;
  let format = made.get(key) as Intl.NumberFormat | undefined;
  if (!format) {
    format = new Intl.NumberFormat(locale, options);
    made.set(key, format);
  }
  return format;
}

/** A date formatter in the company's region, for a screen that needs its own options. */
export function dateFormatter(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `d|${locale ?? ""}|${JSON.stringify(options)}`;
  let format = made.get(key) as Intl.DateTimeFormat | undefined;
  if (!format) {
    format = new Intl.DateTimeFormat(locale, options);
    made.set(key, format);
  }
  return format;
}

/** A count or an amount, grouped the region's way: 1,85,000 in India, 185,000 elsewhere. */
export function numberText(value: number, maximumFractionDigits = 0): string {
  return numberFormatter({ maximumFractionDigits }).format(value);
}

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
  if (!currency) return numberText(value);
  try {
    return numberFormatter({ style: "currency", currency, maximumFractionDigits: 0 }).format(value);
  } catch {
    // An unknown code is not a reason to show nothing.
    return numberText(value);
  }
}

/**
 * `HH:MM` as the region's clock, so 13:00 shows as 1 pm where that is what
 * people say and stays 13:00 where it is not. The stored value never changes.
 */
export function formatTime(time: string): string {
  return dateFormatter({ hour: "numeric", minute: "2-digit" }).format(new Date(`2000-01-01T${time}:00`));
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

const DATE: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" };

export function formatDate(iso: string): string {
  return dateFormatter(DATE).format(new Date(iso));
}

/**
 * A calendar day ("2026-09-26") as a date. Built from its parts, because
 * `new Date("2026-09-26")` is midnight UTC and shows the day before anywhere
 * west of Greenwich.
 */
export function formatDay(day: string): string {
  const [year, month, date] = day.split("-").map(Number);
  return dateFormatter(DATE).format(new Date(year ?? 1970, (month ?? 1) - 1, date ?? 1));
}

/** A calendar day's month and year: "July 2027". Built from parts, like formatDay. */
export function formatMonth(day: string): string {
  const [year, month] = day.split("-").map(Number);
  return dateFormatter({ month: "long", year: "numeric" }).format(new Date(year ?? 1970, (month ?? 1) - 1, 1));
}

export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  return `${dateFormatter(DATE).format(date)} at ${dateFormatter({ hour: "numeric", minute: "2-digit" }).format(date)}`;
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
