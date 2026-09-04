/**
 * Display formatting.
 *
 * No date library. Both existing projects use native Intl and a couple of
 * small helpers, and the arithmetic here is day differences, which does not
 * justify a dependency.
 */

const numberFormat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });

/** Whole currency units, grouped. No symbol: the company sets its own currency later. */
export function formatValue(value: number): string {
  return numberFormat.format(value);
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
