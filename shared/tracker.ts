import { z } from "zod";
import type { Measure } from "./subjects";
import type { ShelfStatus } from "./books";

/**
 * What was measured and what is on the shelf, as the screens read them.
 *
 * The memories in the brain are the words; these are the numbers under them -
 * the twenty push ups, the five kilometres, the book finished - kept where
 * they can be added up. One log for every hobby rather than a table each,
 * because "how far did I run this year" and "how many push ups" are the same
 * question about different rows, and a hobby nobody thought of needs no
 * migration to be counted.
 */

const measureInput = z.object({
  topic: z.string().trim().min(1).max(80),
  metric: z.enum(["reps", "weight", "distance", "pace", "bodyweight", "change", "pages", "count"]),
  value: z.number().finite(),
  unit: z.string().trim().min(1).max(12),
  reps: z.number().int().positive().max(100000).nullable().default(null),
  best: z.boolean().default(false),
});
export const measuresInput = z.array(measureInput).max(12);

export const shelfInput = z.object({
  titles: z.array(z.string().trim().min(1).max(200)).min(1).max(30),
  series: z.string().trim().max(120).nullable().default(null),
  status: z.enum(["to-read", "reading", "read"]),
});
export type ShelfInput = z.input<typeof shelfInput>;

export type ShelfBook = {
  id: string;
  title: string;
  series: string | null;
  status: ShelfStatus;
  finishedOn: string | null;
  /** The cover as a picture, when one was found at Open Library; otherwise Caulder draws one. */
  cover: string | null;
};
export type Shelf = { reading: ShelfBook[]; toRead: ShelfBook[]; read: ShelfBook[] };

/** One thing counted over a year, already put the way it is said. */
export type YearLine = { topic: string; says: string };

export type YearInNumbers = {
  year: number;
  /** Days with anything measured on them. */
  activeDays: number;
  /** The most-logged things first, each in a sentence. */
  lines: YearLine[];
  /** Hours on each hobby, from the Calendar. */
  hours: { title: string; minutes: number }[];
  booksRead: string[];
  journalDays: number;
  /** The month most was logged in: "March". Null in a year with nothing. */
  busiest: string | null;
};

const paceOf = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, "0")}`;
const round = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(1));

/**
 * A year of one thing, in a sentence. Pure, and here rather than in the
 * service, because what is worth saying about a year of push ups - the total -
 * is not what is worth saying about a year of bench press - the best.
 */
export function sayYear(rows: readonly (Pick<Measure, "metric" | "value" | "unit" | "reps"> & { day: string })[]): string | null {
  const of = (metric: Measure["metric"]) => rows.filter((row) => row.metric === metric);
  const days = new Set(rows.map((row) => row.day)).size;
  const on = `${days} ${days === 1 ? "day" : "days"}`;

  const distance = of("distance");
  if (distance.length > 0) {
    const total = distance.reduce((sum, row) => sum + row.value, 0);
    const longest = Math.max(...distance.map((row) => row.value));
    const pace = of("pace");
    const fastest = pace.length > 0 ? Math.min(...pace.map((row) => row.value)) : null;
    const unit = distance[0]?.unit ?? "km";
    return `${round(total)} ${unit} over ${on}; the longest was ${round(longest)} ${unit}${fastest !== null ? `, the fastest ${paceOf(fastest)} /${unit}` : ""}.`;
  }
  const weight = of("weight");
  if (weight.length > 0) {
    const first = weight[0];
    const best = weight.reduce((top, row) => (row.value > top.value ? row : top), weight[0] as (typeof weight)[number]);
    const gained = first && best.value > first.value ? `, up from ${round(first.value)}` : "";
    return `Best ${round(best.value)} ${best.unit}${best.reps ? ` × ${best.reps}` : ""}${gained}, over ${on}.`;
  }
  const reps = of("reps");
  if (reps.length > 0) {
    const total = reps.reduce((sum, row) => sum + row.value, 0);
    const most = Math.max(...reps.map((row) => row.value));
    return `${total.toLocaleString("en")} in all over ${on}; the most in one go was ${most}.`;
  }
  const counted = of("count");
  if (counted.length > 0) return `${counted.reduce((sum, row) => sum + row.value, 0).toLocaleString("en")} ${counted[0]?.unit ?? ""} over ${on}.`;
  const pages = of("pages");
  if (pages.length > 0) return `${pages.reduce((sum, row) => sum + row.value, 0).toLocaleString("en")} pages over ${on}.`;

  const scale = of("bodyweight");
  const change = of("change");
  if (scale.length >= 2) {
    const moved = (scale[scale.length - 1]?.value ?? 0) - (scale[0]?.value ?? 0);
    return `${round(scale[0]?.value ?? 0)} to ${round(scale[scale.length - 1]?.value ?? 0)} ${scale[0]?.unit ?? "kg"}: ${moved === 0 ? "level" : `${moved > 0 ? "up" : "down"} ${round(Math.abs(moved))}`}.`;
  }
  if (change.length > 0) {
    const moved = change.reduce((sum, row) => sum + row.value, 0);
    return `${moved > 0 ? "Up" : "Down"} ${round(Math.abs(moved))} ${change[0]?.unit ?? "kg"} in all.`;
  }
  if (scale.length === 1) return `${round(scale[0]?.value ?? 0)} ${scale[0]?.unit ?? "kg"}.`;
  return null;
}
