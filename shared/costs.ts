import { z } from "zod";
import { addMonths, daysBetween, describeDue, isDay } from "./dates";
import type { BrainSectionId, FieldValue } from "./brain";

/**
 * Running costs and runway. See PLAN.md, part three.
 *
 * A running cost is not a table of its own: it is read off the brain pages
 * that already say what something costs and when it renews - a tool, a
 * domain - and a Running cost page for whatever is neither. So a server bill
 * is written down once, where its login and its notes already are.
 */

export const RUNNING_COST_TEMPLATE = "running-cost";

/** The templates a running cost is read from, and the field holding each part. */
const SOURCES: Record<string, { amount: string; cycle: string | null; next: string; category: string | null }> = {
  tool: { amount: "cost", cycle: "cycle", next: "renewsOn", category: null },
  domain: { amount: "cost", cycle: null, next: "renewsOn", category: null },
  [RUNNING_COST_TEMPLATE]: { amount: "amount", cycle: "cycle", next: "dueOn", category: "category" },
};

export const COST_TEMPLATES: readonly string[] = Object.keys(SOURCES);

const COST_CYCLES = ["monthly", "quarterly", "yearly", "once", "free"] as const;
export type CostCycle = (typeof COST_CYCLES)[number];

export const COST_CYCLE_LABEL: Record<CostCycle, string> = {
  monthly: "Monthly",
  quarterly: "Quarterly",
  yearly: "Yearly",
  once: "Once",
  free: "Free",
};

const MONTHS_IN: Record<CostCycle, number | null> = {
  monthly: 1,
  quarterly: 3,
  yearly: 12,
  once: null,
  free: null,
};

function isCycle(value: unknown): value is CostCycle {
  return typeof value === "string" && (COST_CYCLES as readonly string[]).includes(value);
}

export type RunningCost = {
  pageId: string;
  title: string;
  template: string;
  section: BrainSectionId;
  /** Per cycle, in whole units. Null when nobody has said. */
  amount: number | null;
  cycle: CostCycle | null;
  /** When it renews or is next due. */
  nextOn: string | null;
  category: string | null;
  /** What it costs a month, rounded; nothing for a one-off or an unknown. */
  monthly: number;
};

type PageLike = {
  id: string;
  title: string;
  template: string;
  section: BrainSectionId;
  fields: Readonly<Record<string, FieldValue>>;
};

export function monthlyOf(amount: number | null, cycle: CostCycle | null): number {
  if (amount === null || cycle === null) return 0;
  const months = MONTHS_IN[cycle];
  return months === null ? 0 : Math.round(amount / months);
}

/** The running cost a page describes, or null for a page that is not one. */
export function costOf(page: PageLike): RunningCost | null {
  const source = SOURCES[page.template];
  if (!source) return null;
  const raw = page.fields[source.amount];
  const amount = typeof raw === "number" && Number.isFinite(raw) ? raw : null;
  const cycleRaw = source.cycle === null ? "yearly" : page.fields[source.cycle];
  const cycle = isCycle(cycleRaw) ? cycleRaw : null;
  const next = page.fields[source.next];
  const category = source.category ? page.fields[source.category] : page.template;
  return {
    pageId: page.id,
    title: page.title,
    template: page.template,
    section: page.section,
    amount: cycle === "free" ? 0 : amount,
    cycle,
    nextOn: typeof next === "string" && next.length > 0 ? next : null,
    category: typeof category === "string" && category.length > 0 ? category : null,
    monthly: monthlyOf(cycle === "free" ? 0 : amount, cycle),
  };
}

/** The field a renewal date lives in, for a page that has one. */
export function nextField(template: string): string | null {
  return SOURCES[template]?.next ?? null;
}

/** The date after this one, a cycle on. A one-off has none. */
export function nextAfter(day: string, cycle: CostCycle | null): string | null {
  const months = cycle === null ? null : MONTHS_IN[cycle];
  return months === null ? null : addMonths(day, months);
}

/**
 * How far ahead a renewal is worth seeing. A monthly bill a month ahead would
 * sit on Today for ever; a domain a year apart needs weeks.
 */
function noticeDays(cycle: CostCycle | null): number {
  switch (cycle) {
    case "monthly":
      return 3;
    case "quarterly":
      return 14;
    default:
      return 30;
  }
}

export type Renewal = RunningCost & { nextOn: string; daysLeft: number };

/**
 * When a cost falls, as the end of a sentence: "renews tomorrow", "renews in 3
 * days", "renews on 14 Jul", "was due 2 days ago".
 */
export function describeRenewal(cost: { nextOn: string; cycle: CostCycle | null }, day: string): string {
  const when = describeDue(cost.nextOn, day);
  const late = cost.nextOn < day;
  const verb = late ? "was due" : cost.cycle === "once" ? "due" : "renews";
  const relative = /^(Today|Tomorrow|Yesterday|In \d+ days|\d+ days ago)$/.test(when);
  return `${verb} ${relative ? when.toLowerCase() : `on ${when}`}`;
}

/** What renews soon, or should already have, soonest first. Free things are left out. */
export function renewalsDue(costs: readonly RunningCost[], day: string): Renewal[] {
  return costs
    .filter((cost): cost is RunningCost & { nextOn: string } => cost.nextOn !== null && cost.cycle !== "free")
    .map((cost) => ({ ...cost, daysLeft: daysBetween(day, cost.nextOn) }))
    .filter((cost) => cost.daysLeft <= noticeDays(cost.cycle))
    .sort((a, b) => a.nextOn.localeCompare(b.nextOn) || a.title.localeCompare(b.title));
}

export type Runway = {
  /** The last balance typed, and the day it was true. */
  cash: number | null;
  cashOn: string | null;
  /** Monthly running costs. */
  running: number;
  /** Average monthly spend that is not a running cost's renewal. */
  oneOff: number;
  /** Average monthly money paid in. */
  income: number;
  /** running + oneOff - income. Zero or less is not burning. */
  burn: number;
  /** Whole and part months the cash lasts; null when not burning or no cash is known. */
  months: number | null;
  /** The day the cash would run out at this burn. */
  runsOutOn: string | null;
  /** How many months the averages are over. */
  basis: number;
};

function average(values: readonly number[]): number {
  return values.length === 0 ? 0 : Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

/**
 * How long the money lasts.
 *
 * Burn is what goes out in a month - the running costs, plus the average of
 * everything else spent - less the average paid in. The averages are over the
 * months given, which the caller picks: the last three whole months, or fewer
 * for a young company. Runway is counted from the day the balance was true,
 * not from today, because that is the cash it describes.
 */
export function runwayOf(input: {
  cash: number | null;
  cashOn: string | null;
  running: number;
  oneOffByMonth: readonly number[];
  incomeByMonth: readonly number[];
}): Runway {
  const oneOff = average(input.oneOffByMonth);
  const income = average(input.incomeByMonth);
  const burn = input.running + oneOff - income;
  const known = input.cash !== null && input.cashOn !== null;
  const months = known && burn > 0 ? Math.max(0, (input.cash as number) / burn) : null;
  let runsOutOn: string | null = null;
  if (months !== null && input.cashOn) {
    const whole = Math.floor(months);
    const rest = Math.round((months - whole) * 30);
    const base = addMonths(input.cashOn, whole);
    runsOutOn = new Date(Date.parse(`${base}T00:00:00Z`) + rest * 86_400_000).toISOString().slice(0, 10);
  }
  return {
    cash: input.cash,
    cashOn: input.cashOn,
    running: input.running,
    oneOff,
    income,
    burn,
    months,
    runsOutOn,
    basis: Math.max(input.oneOffByMonth.length, input.incomeByMonth.length),
  };
}

/** "about 7 months", "about 3 weeks", "under a week". */
export function describeRunway(months: number): string {
  if (months >= 120) return "more than ten years";
  if (months >= 1.5) return `about ${Math.round(months)} months`;
  if (months >= 0.95) return "about a month";
  const weeks = Math.round(months * 4.3);
  if (weeks >= 2) return `about ${weeks} weeks`;
  return weeks === 1 ? "about a week" : "under a week";
}

export const cashBalanceInput = z.object({
  amount: z
    .number({ message: "Say how much is in the bank." })
    .int("Whole units only.")
    .min(-1_000_000_000_000)
    .max(1_000_000_000_000),
  // A day the calendar has: moving it by no months changes nothing.
  asOf: z.string().refine((value) => isDay(value) && addMonths(value, 0) === value, "Pick the day it was true."),
  note: z
    .string()
    .trim()
    .max(200)
    .transform((value) => (value.length === 0 ? null : value))
    .nullable()
    .default(null),
});
export type CashBalanceInput = z.input<typeof cashBalanceInput>;

export type CashBalance = {
  id: string;
  amount: number;
  asOf: string;
  note: string | null;
  createdAt: string;
};

export type CostsOverview = {
  currency: string;
  day: string;
  costs: RunningCost[];
  /** The monthly total of everything recurring. */
  monthly: number;
  renewals: Renewal[];
  runway: Runway;
  /** Newest first. */
  balances: CashBalance[];
};
