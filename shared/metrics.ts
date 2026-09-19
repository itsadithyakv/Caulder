import { z } from "zod";
import { addMonths, isDay } from "./dates";

/**
 * Metrics: the handful of numbers that say how the company is doing, with
 * their history. See PLAN.md, phase 11.
 *
 * Two kinds. Most of what a small company would chart is already in Caulder
 * with a date on it - payments, invoices, spending, deals won, calls, the
 * bank balance - so those are worked out by month and never typed. The rest
 * (schools signed, weekly active users, NPS) are written down as readings,
 * each on a day.
 */

export const METRIC_KINDS = ["count", "money", "percent"] as const;
export type MetricKind = (typeof METRIC_KINDS)[number];

export const METRIC_KIND_LABEL: Record<MetricKind, string> = {
  count: "A number",
  money: "Money",
  percent: "A percentage",
};

export type MetricDirection = "up" | "down";

export type DerivedMetric = {
  source: string;
  name: string;
  kind: MetricKind;
  direction: MetricDirection;
  /**
   * A flow is counted over each month - money in, calls made - so this month
   * is so far and is set beside last month. A level is read at a moment -
   * the bank balance - so it is the latest against the one before.
   */
  flow: boolean;
  hint: string;
};

export const DERIVED_METRICS: readonly DerivedMetric[] = [
  { source: "paid-in", name: "Paid in", kind: "money", direction: "up", flow: true, hint: "Payments recorded against invoices." },
  { source: "invoiced", name: "Invoiced", kind: "money", direction: "up", flow: true, hint: "Invoices sent: not drafts, not voids." },
  { source: "spent", name: "Spent", kind: "money", direction: "down", flow: true, hint: "The spend ledger, running costs paid included." },
  { source: "net", name: "Paid in less spent", kind: "money", direction: "up", flow: true, hint: "What the month added to the bank." },
  { source: "deals-won", name: "Deals won", kind: "count", direction: "up", flow: true, hint: "Deals moved to a won stage." },
  { source: "won-value", name: "Value won", kind: "money", direction: "up", flow: true, hint: "What the deals won were worth." },
  { source: "new-contacts", name: "New contacts", kind: "count", direction: "up", flow: true, hint: "Contacts added, imported ones included." },
  { source: "calls", name: "Calls made", kind: "count", direction: "up", flow: true, hint: "Calls logged from the prompter." },
  { source: "cash", name: "Cash in the bank", kind: "money", direction: "up", flow: false, hint: "The last balance written down in each month." },
];

export function derivedMetric(source: string): DerivedMetric | null {
  return DERIVED_METRICS.find((metric) => metric.source === source) ?? null;
}

const text = (max: number) => z.string().trim().max(max).nullable().default(null);

export const metricInput = z.object({
  name: z.string().trim().min(1, "Name the metric.").max(80, "Keep the name under 80 characters."),
  kind: z.enum(METRIC_KINDS).default("count"),
  /** What a count counts: "schools", "users". */
  unitLabel: text(40),
  target: z.number().finite("The target is a number.").nullable().default(null),
  direction: z.enum(["up", "down"]).default("up"),
  notes: text(2000),
});
export type MetricInput = z.input<typeof metricInput>;

export const valueInput = z.object({
  onDay: z.string().refine((value) => isDay(value) && addMonths(value, 0) === value, "Pick a date."),
  value: z.number({ message: "The value is a number." }).finite("The value is a number."),
  note: text(200),
});
export type ValueInput = z.input<typeof valueInput>;

/** One month of a metric: its total for a flow, its last reading for a level. Null when nothing is known. */
export type MetricPoint = { month: string; value: number | null };

export type Metric = {
  id: string;
  companyId: string;
  name: string;
  kind: MetricKind;
  unitLabel: string | null;
  /** "manual", or which derived metric it is. */
  source: string;
  target: number | null;
  direction: MetricDirection;
  notes: string | null;
  flow: boolean;
  /** This month so far for a flow; the latest reading for a level. */
  now: number | null;
  /** The day of the latest reading, for a level. */
  nowOn: string | null;
  /** Last month for a flow; the reading before the latest for a level. */
  previous: number | null;
  /** Twelve months, oldest first, ending with this one. */
  history: MetricPoint[];
};

export type MetricValue = { id: string; metricId: string; onDay: string; value: number; note: string | null };

export type MetricsOverview = {
  day: string;
  currency: string;
  metrics: Metric[];
  /** The derived metrics not added yet. */
  available: DerivedMetric[];
};

export type MetricDetail = {
  day: string;
  currency: string;
  metric: Metric;
  /** A manual metric's readings, newest first. */
  values: MetricValue[];
};

/** The months ending with the one a day is in, oldest first: "2025-10" … "2026-09". */
export function monthsEnding(day: string, count = 12): string[] {
  const first = `${day.slice(0, 7)}-01`;
  return Array.from({ length: count }, (_, index) => addMonths(first, index - count + 1).slice(0, 7));
}

/** How far a number moved, and whether that is the good way for this metric. */
export function changeOf(
  now: number | null,
  previous: number | null,
  direction: MetricDirection,
): { delta: number; percent: number | null; good: boolean } | null {
  if (now === null || previous === null) return null;
  const delta = now - previous;
  return {
    delta,
    percent: previous === 0 ? null : Math.round((delta / Math.abs(previous)) * 1000) / 10,
    good: delta === 0 || (direction === "up" ? delta > 0 : delta < 0),
  };
}

/** How near the target, as a share: 0.62 is 62% of the way. Past it for a "down" metric is how far under. */
export function towardTarget(now: number | null, target: number | null, direction: MetricDirection): number | null {
  if (now === null || target === null || target === 0) return null;
  const share = direction === "up" ? now / target : target / Math.max(now, Number.EPSILON);
  return Math.max(0, Math.round(share * 100) / 100);
}
