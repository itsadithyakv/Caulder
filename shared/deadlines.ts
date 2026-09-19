import { z } from "zod";
import { addMonths, daysBetween, isDay, shiftDay } from "./dates";

/**
 * Deadlines: what the company has to do by a date, again and again - a GST
 * return on the 11th, advance tax four times a year, the annual return in
 * May - and the dated things already written in the brain: a contract's
 * notice date, a registration's renewal, a document's expiry. See PLAN.md,
 * phase 9.
 *
 * An obligation is stored with a rule, and its occurrences are worked out
 * here rather than written as rows: a monthly filing is one row, not twelve a
 * year. What has been done is stored, one row per occurrence, keyed by the
 * date it was due - which is also how "for which period" is answered.
 */

export const OBLIGATION_KINDS = ["filing", "payment", "renewal", "other"] as const;
export type ObligationKind = (typeof OBLIGATION_KINDS)[number];

export const OBLIGATION_KIND_LABEL: Record<ObligationKind, string> = {
  filing: "Filing",
  payment: "Payment",
  renewal: "Renewal",
  other: "Other",
};

/* ---- When something falls due -------------------------------------------- */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/** A real calendar day: the right shape, and one the calendar has. */
function isRealDay(value: string): boolean {
  return isDay(value) && addMonths(value, 0) === value;
}

const monthDay = z.object({
  month: z.number().int().min(1).max(12),
  day: z.number().int().min(1).max(31),
});

export const dueRule = z.discriminatedUnion("every", [
  z.object({ every: z.literal("once"), on: z.string().refine(isRealDay, "Pick a date.") }),
  z.object({ every: z.literal("month"), day: z.number().int().min(1).max(31) }),
  z.object({ every: z.literal("year"), dates: z.array(monthDay).min(1).max(12) }),
]);
export type DueRule = z.infer<typeof dueRule>;

/** The day asked for in a month, or its last day when the month is short: the 31st of February is the 28th. */
function dayIn(year: number, month: number, day: number): string {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(Math.min(day, last)).padStart(2, "0")}`;
}

/** Every day a rule falls on from `from` to `until`, both included, in order. */
export function occurrences(rule: DueRule, from: string, until: string): string[] {
  if (until < from) return [];
  if (rule.every === "once") return rule.on >= from && rule.on <= until ? [rule.on] : [];

  const out: string[] = [];
  const firstYear = Number(from.slice(0, 4));
  const lastYear = Number(until.slice(0, 4));
  for (let year = firstYear; year <= lastYear; year += 1) {
    if (rule.every === "month") {
      for (let month = 1; month <= 12; month += 1) out.push(dayIn(year, month, rule.day));
    } else {
      for (const date of rule.dates) out.push(dayIn(year, date.month, date.day));
    }
  }
  return [...new Set(out)].filter((day) => day >= from && day <= until).sort();
}

/** The first day a rule falls on from `onOrAfter`, looking two years ahead at most. */
export function nextOccurrence(rule: DueRule, onOrAfter: string): string | null {
  return occurrences(rule, onOrAfter, shiftDay(onOrAfter, 731))[0] ?? null;
}

function ordinal(day: number): string {
  const tens = day % 100;
  if (tens >= 11 && tens <= 13) return `${day}th`;
  return `${day}${day % 10 === 1 ? "st" : day % 10 === 2 ? "nd" : day % 10 === 3 ? "rd" : "th"}`;
}

/** "30 May 2027", without a locale deciding the order. */
export function spellDay(day: string): string {
  const [year, month, date] = day.split("-").map(Number) as [number, number, number];
  return `${date} ${MONTHS[month - 1]} ${year}`;
}

function list(parts: readonly string[]): string {
  return parts.length <= 1 ? (parts[0] ?? "") : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
}

/** A rule in words: "the 11th of every month", "every year on 15 Jun, 15 Sep, 15 Dec and 15 Mar". */
export function describeRule(rule: DueRule): string {
  if (rule.every === "once") return `once, on ${spellDay(rule.on)}`;
  if (rule.every === "month") return `the ${ordinal(rule.day)} of every month`;
  return `every year on ${list(rule.dates.map((date) => `${date.day} ${MONTHS[date.month - 1]}`))}`;
}

/* ---- Which period an occurrence is for ---------------------------------- */

export const PERIOD_SHAPES = ["none", "month-before", "quarter-before", "fy-before", "year-before"] as const;
export type PeriodShape = (typeof PERIOD_SHAPES)[number];

export function isPeriodShape(value: unknown): value is PeriodShape {
  return typeof value === "string" && (PERIOD_SHAPES as readonly string[]).includes(value);
}

export const PERIOD_LABEL: Record<PeriodShape, string> = {
  none: "No period",
  "month-before": "The month before",
  "quarter-before": "The quarter before",
  "fy-before": "The financial year before (April to March)",
  "year-before": "The calendar year before",
};

/**
 * What an occurrence due on a day is for: GSTR-1 due on 11 October is for
 * September, a TDS return due on 31 May is for January to March, an annual
 * return due on 30 May 2026 is for 2025-26.
 */
export function periodOf(shape: PeriodShape, dueOn: string): string | null {
  const year = Number(dueOn.slice(0, 4));
  const month = Number(dueOn.slice(5, 7));
  switch (shape) {
    case "none":
      return null;
    case "month-before": {
      const before = addMonths(`${dueOn.slice(0, 7)}-01`, -1);
      return `${MONTHS[Number(before.slice(5, 7)) - 1]} ${before.slice(0, 4)}`;
    }
    case "quarter-before": {
      // The latest calendar quarter that had ended before the day.
      const ends = [3, 6, 9, 12];
      let endYear = year;
      let endMonth = [...ends].reverse().find((end) => dayIn(year, end, 31) < dueOn);
      if (endMonth === undefined) {
        endYear = year - 1;
        endMonth = 12;
      }
      return `${MONTHS[endMonth - 3]}–${MONTHS[endMonth - 1]} ${endYear}`;
    }
    case "fy-before": {
      // The April-to-March year that ended before the day.
      const endsIn = month >= 4 ? year : year - 1;
      return `${endsIn - 1}-${String(endsIn).slice(-2)}`;
    }
    case "year-before":
      return String(year - 1);
  }
}

/* ---- An obligation --------------------------------------------------------- */

const day = z
  .string()
  .refine(isRealDay, "Pick a date.")
  .nullable()
  .default(null);

export const obligationInput = z
  .object({
    title: z.string().trim().min(1, "Say what has to be done.").max(160, "Keep it under 160 characters."),
    kind: z.enum(OBLIGATION_KINDS).default("filing"),
    rule: dueRule,
    period: z.enum(PERIOD_SHAPES).default("none"),
    remindDays: z.number().int().min(0).max(90, "Ninety days' notice is the most.").default(7),
    amount: z.number().int().min(0).nullable().default(null),
    notes: z.string().trim().max(2000).nullable().default(null),
    /** Nothing before this counts as missed; a new filing starts from today, not from years ago. */
    startsOn: day,
    endsOn: day,
    pageId: z.string().nullable().default(null),
    leadId: z.string().nullable().default(null),
    documentId: z.string().nullable().default(null),
    active: z.boolean().default(true),
  })
  .refine((input) => !input.startsOn || !input.endsOn || input.endsOn >= input.startsOn, {
    message: "It cannot stop before it starts.",
    path: ["endsOn"],
  });
export type ObligationInput = z.input<typeof obligationInput>;

export type Obligation = {
  id: string;
  companyId: string;
  title: string;
  kind: ObligationKind;
  rule: DueRule;
  period: PeriodShape;
  remindDays: number;
  amount: number | null;
  notes: string | null;
  presetId: string | null;
  startsOn: string;
  endsOn: string | null;
  pageId: string | null;
  leadId: string | null;
  documentId: string | null;
  active: boolean;
  /** The next day it falls due that is not done, if any. */
  nextDue: string | null;
  /** When it was last done, and for which occurrence. */
  lastDone: { dueOn: string; doneOn: string } | null;
};

export type ObligationDone = {
  id: string;
  obligationId: string;
  dueOn: string;
  doneOn: string;
  note: string | null;
  amount: number | null;
};

/**
 * The occurrences of an obligation still to do, up to a day: every one since
 * it started that has not been done, and not past its end. `through` is
 * usually today plus its notice, so what is coming shows before it arrives.
 */
export function openOccurrences(
  obligation: Pick<Obligation, "rule" | "startsOn" | "endsOn" | "active">,
  done: ReadonlySet<string>,
  through: string,
): string[] {
  if (!obligation.active) return [];
  const until = obligation.endsOn && obligation.endsOn < through ? obligation.endsOn : through;
  return occurrences(obligation.rule, obligation.startsOn, until).filter((due) => !done.has(due));
}

/* ---- Deadlines: everything with a date, in one list --------------------------- */

export type DeadlineSource = "obligation" | "page" | "document" | "person";

export type Deadline = {
  /** Unique across sources: "obligation:<id>:<due>", "page:<id>:<field>", "document:<id>", "person:<id>:<what>". */
  key: string;
  source: DeadlineSource;
  /** The obligation, page, document or person it comes from. */
  id: string;
  title: string;
  /** What falls due, in a word or two: "Filing", "Give notice", "Expires". */
  what: string;
  dueOn: string;
  /** Negative once it has passed. */
  daysLeft: number;
  /** "Aug 2026", "Jan–Mar 2026", "2025-26", for an obligation with a period. */
  period: string | null;
  amount: number | null;
  /** For an obligation's occurrence that is done: when. */
  doneOn: string | null;
};

/** The brain section a deadline opens, for one that is not a page of its own. */
export function sectionForDeadline(source: Exclude<DeadlineSource, "page">): "tax" | "documents" | "people" {
  return source === "obligation" ? "tax" : source === "document" ? "documents" : "people";
}

/** "due today", "due in 3 days", "due tomorrow", "2 days late". */
export function describeDeadline(deadline: Pick<Deadline, "daysLeft" | "doneOn">): string {
  if (deadline.doneOn) return "done";
  const left = deadline.daysLeft;
  if (left === 0) return "due today";
  if (left === 1) return "due tomorrow";
  if (left > 1) return `due in ${left} days`;
  return left === -1 ? "a day late" : `${-left} days late`;
}

export function daysLeftOf(dueOn: string, today: string): number {
  return daysBetween(today, dueOn);
}

/* ---- Presets --------------------------------------------------------------- */

export type Preset = {
  id: string;
  title: string;
  kind: ObligationKind;
  rule: DueRule;
  period: PeriodShape;
  remindDays: number;
  /** A line on what it is and the catch, where there is one. */
  note: string;
  /** Offered, not assumed: only some companies have it. */
  optional?: boolean;
  applies: { entity?: readonly string[]; gst?: readonly string[] };
};

const quarterly = (day: number, months: readonly number[] = [1, 4, 7, 10]): DueRule => ({
  every: "year",
  dates: months.map((month) => ({ month, day })),
});
const yearly = (month: number, day: number): DueRule => ({ every: "year", dates: [{ month, day }] });
const monthly = (day: number): DueRule => ({ every: "month", day });

const COMPANIES = ["private-limited-company", "one-person-company", "public-limited-company"] as const;

/**
 * India, as written in September 2026. Dates move - the government extends
 * them often, and some are counted from a meeting rather than the calendar -
 * which is why every one is editable and the section says to check with an
 * accountant.
 */
const INDIA: readonly Preset[] = [
  {
    id: "in-gstr1-monthly",
    title: "GSTR-1",
    kind: "filing",
    rule: monthly(11),
    period: "month-before",
    remindDays: 5,
    note: "Outward supplies for the month before.",
    applies: { gst: ["regular-monthly-returns"] },
  },
  {
    id: "in-gstr3b-monthly",
    title: "GSTR-3B, and the GST it says is due",
    kind: "filing",
    rule: monthly(20),
    period: "month-before",
    remindDays: 5,
    note: "The summary return, and the tax paid with it.",
    applies: { gst: ["regular-monthly-returns"] },
  },
  {
    id: "in-gstr1-qrmp",
    title: "GSTR-1 (quarterly)",
    kind: "filing",
    rule: quarterly(13),
    period: "quarter-before",
    remindDays: 7,
    note: "Under QRMP. Invoices to other businesses can go up monthly through IFF.",
    applies: { gst: ["regular-quarterly-returns-qrmp"] },
  },
  {
    id: "in-gstr3b-qrmp",
    title: "GSTR-3B (quarterly)",
    kind: "filing",
    rule: quarterly(22),
    period: "quarter-before",
    remindDays: 7,
    note: "The 22nd in most states and the 24th in the rest; check which yours is.",
    applies: { gst: ["regular-quarterly-returns-qrmp"] },
  },
  {
    id: "in-pmt06",
    title: "GST payment (PMT-06)",
    kind: "payment",
    rule: { every: "year", dates: [2, 3, 5, 6, 8, 9, 11, 12].map((month) => ({ month, day: 25 })) },
    period: "month-before",
    remindDays: 5,
    note: "Under QRMP, the tax for the first two months of each quarter.",
    applies: { gst: ["regular-quarterly-returns-qrmp"] },
  },
  {
    id: "in-cmp08",
    title: "CMP-08",
    kind: "filing",
    rule: quarterly(18),
    period: "quarter-before",
    remindDays: 7,
    note: "The composition scheme's quarterly statement and payment.",
    applies: { gst: ["composition-scheme"] },
  },
  {
    id: "in-gstr4",
    title: "GSTR-4 (annual)",
    kind: "filing",
    rule: yearly(4, 30),
    period: "fy-before",
    remindDays: 14,
    note: "The composition scheme's annual return.",
    applies: { gst: ["composition-scheme"] },
  },
  {
    id: "in-gstr9",
    title: "GSTR-9 (annual return)",
    kind: "filing",
    rule: yearly(12, 31),
    period: "fy-before",
    remindDays: 21,
    note: "Compulsory above ₹2 crore of turnover in the year; optional below it.",
    optional: true,
    applies: { gst: ["regular-monthly-returns", "regular-quarterly-returns-qrmp"] },
  },
  {
    id: "in-advance-tax",
    title: "Advance tax",
    kind: "payment",
    rule: { every: "year", dates: [{ month: 6, day: 15 }, { month: 9, day: 15 }, { month: 12, day: 15 }, { month: 3, day: 15 }] },
    period: "none",
    remindDays: 10,
    note: "15%, 45%, 75% and 100% of the year's tax, by these days. Only if the year's tax will be ₹10,000 or more.",
    applies: {},
  },
  {
    id: "in-itr-company",
    title: "Income tax return (ITR-6)",
    kind: "filing",
    rule: yearly(10, 31),
    period: "fy-before",
    remindDays: 30,
    note: "A company's accounts are audited, so its return is due at the end of October.",
    applies: { entity: COMPANIES },
  },
  {
    id: "in-itr-firm",
    title: "Income tax return (ITR-5)",
    kind: "filing",
    rule: yearly(7, 31),
    period: "fy-before",
    remindDays: 30,
    note: "31 July without an audit; 31 October with one.",
    applies: { entity: ["llp", "partnership"] },
  },
  {
    id: "in-itr-proprietor",
    title: "Income tax return",
    kind: "filing",
    rule: yearly(7, 31),
    period: "fy-before",
    remindDays: 30,
    note: "The proprietor's own return, with the business in it. 31 October if the accounts are audited.",
    applies: { entity: ["sole-proprietorship"] },
  },
  {
    id: "in-tds-deposit",
    title: "TDS deposit",
    kind: "payment",
    rule: monthly(7),
    period: "month-before",
    remindDays: 4,
    note: "Tax deducted from payments to staff, freelancers or rent. March's is due on 30 April instead.",
    optional: true,
    applies: {},
  },
  {
    id: "in-tds-returns",
    title: "TDS returns (24Q, 26Q)",
    kind: "filing",
    rule: { every: "year", dates: [{ month: 7, day: 31 }, { month: 10, day: 31 }, { month: 1, day: 31 }, { month: 5, day: 31 }] },
    period: "quarter-before",
    remindDays: 10,
    note: "Only if TDS was deducted in the quarter.",
    optional: true,
    applies: {},
  },
  {
    id: "in-agm",
    title: "Annual general meeting",
    kind: "other",
    rule: yearly(9, 30),
    period: "fy-before",
    remindDays: 30,
    note: "Within six months of the year's end. The filings after it are counted from its date.",
    applies: { entity: ["private-limited-company", "public-limited-company"] },
  },
  {
    id: "in-aoc4",
    title: "AOC-4 (financial statements)",
    kind: "filing",
    rule: yearly(10, 30),
    period: "fy-before",
    remindDays: 21,
    note: "30 days after the AGM; this date assumes the AGM is on 30 September.",
    applies: { entity: COMPANIES },
  },
  {
    id: "in-mgt7",
    title: "MGT-7 (annual return)",
    kind: "filing",
    rule: yearly(11, 29),
    period: "fy-before",
    remindDays: 21,
    note: "60 days after the AGM; this date assumes the AGM is on 30 September. A one person company files MGT-7A.",
    applies: { entity: COMPANIES },
  },
  {
    id: "in-dir3-kyc",
    title: "DIR-3 KYC for each director",
    kind: "filing",
    rule: yearly(9, 30),
    period: "none",
    remindDays: 21,
    note: "Every director, or designated partner, with a DIN.",
    applies: { entity: [...COMPANIES, "llp"] },
  },
  {
    id: "in-dpt3",
    title: "DPT-3 (return of deposits)",
    kind: "filing",
    rule: yearly(6, 30),
    period: "fy-before",
    remindDays: 14,
    note: "Money the company received that is not share capital, including loans from directors.",
    optional: true,
    applies: { entity: COMPANIES },
  },
  {
    id: "in-msme1",
    title: "MSME-1 (dues to small suppliers)",
    kind: "filing",
    rule: { every: "year", dates: [{ month: 4, day: 30 }, { month: 10, day: 31 }] },
    period: "none",
    remindDays: 14,
    note: "Only if payments to a registered micro or small supplier are more than 45 days late.",
    optional: true,
    applies: { entity: COMPANIES },
  },
  {
    id: "in-llp-form11",
    title: "Form 11 (LLP annual return)",
    kind: "filing",
    rule: yearly(5, 30),
    period: "fy-before",
    remindDays: 21,
    note: "Partners and contributions, as they stood at the end of March.",
    applies: { entity: ["llp"] },
  },
  {
    id: "in-llp-form8",
    title: "Form 8 (accounts and solvency)",
    kind: "filing",
    rule: yearly(10, 30),
    period: "fy-before",
    remindDays: 21,
    note: "The LLP's accounts for the year, and a statement that it can pay its debts.",
    applies: { entity: ["llp"] },
  },
  {
    id: "in-professional-tax",
    title: "Professional tax",
    kind: "payment",
    rule: monthly(15),
    period: "month-before",
    remindDays: 5,
    note: "Set by the state: whether it applies, how much and which day differ. Check yours before relying on this date.",
    optional: true,
    applies: {},
  },
];

/** For anywhere else: the shape of a year, with dates to set for where the company is. */
const GENERIC: readonly Preset[] = [
  {
    id: "gen-income-tax",
    title: "Income tax return",
    kind: "filing",
    rule: yearly(12, 31),
    period: "year-before",
    remindDays: 30,
    note: "Set the day your country uses.",
    applies: {},
  },
  {
    id: "gen-sales-tax",
    title: "Sales tax or VAT return",
    kind: "filing",
    rule: quarterly(30),
    period: "quarter-before",
    remindDays: 10,
    note: "Only if the company is registered for it. Set the day your country uses.",
    optional: true,
    applies: {},
  },
  {
    id: "gen-annual-accounts",
    title: "Annual accounts",
    kind: "filing",
    rule: yearly(6, 30),
    period: "year-before",
    remindDays: 30,
    note: "Set the day your country uses.",
    applies: {},
  },
  {
    id: "gen-payroll",
    title: "Payroll taxes",
    kind: "payment",
    rule: monthly(15),
    period: "month-before",
    remindDays: 5,
    note: "Only with employees. Set the day your country uses.",
    optional: true,
    applies: {},
  },
];

export const PRESET_SETS = [
  { id: "india", label: "India", presets: INDIA },
  { id: "generic", label: "Anywhere else", presets: GENERIC },
] as const;
export type PresetSetId = (typeof PRESET_SETS)[number]["id"];

export function presetById(id: string): Preset | null {
  for (const set of PRESET_SETS) {
    const found = set.presets.find((preset) => preset.id === id);
    if (found) return found;
  }
  return null;
}

export type PresetOffer = {
  preset: Preset;
  /** Whether it fits the company as the profile describes it. */
  fits: boolean;
  /** Whether the company already has it. */
  added: boolean;
};

/**
 * A set's presets as they apply to one company: the ones that fit its entity
 * type and GST scheme, and the optional ones it might need. A preset that
 * names neither applies to everybody. Without a profile, everything that is
 * not specific to a kind of company fits, and the rest is shown to choose.
 */
export function offerPresets(
  set: PresetSetId,
  profile: { entityType: string | null; gstStatus: string | null },
  added: ReadonlySet<string>,
): PresetOffer[] {
  const presets = PRESET_SETS.find((candidate) => candidate.id === set)?.presets ?? [];
  return presets.map((preset) => {
    const entityOk = !preset.applies.entity || (profile.entityType !== null && preset.applies.entity.includes(profile.entityType));
    const gstOk = !preset.applies.gst || (profile.gstStatus !== null && preset.applies.gst.includes(profile.gstStatus));
    return { preset, fits: entityOk && gstOk, added: added.has(preset.id) };
  });
}

/* ---- Documents ------------------------------------------------------------- */

export const DOCUMENT_CATEGORIES = [
  "certificate",
  "contract",
  "agreement",
  "invoice-sent",
  "invoice-received",
  "statement",
  "pitch-deck",
  "identity",
  "other",
] as const;
export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];

export const DOCUMENT_CATEGORY_LABEL: Record<DocumentCategory, string> = {
  certificate: "Certificate",
  contract: "Contract",
  agreement: "Agreement",
  "invoice-sent": "Invoice sent",
  "invoice-received": "Invoice received",
  statement: "Statement",
  "pitch-deck": "Pitch deck",
  identity: "Identity",
  other: "Other",
};

export type CompanyDocument = {
  id: string;
  companyId: string;
  name: string;
  category: DocumentCategory;
  /** Stored in the app's folder, or null when only where it is has been written down. */
  hasFile: boolean;
  bytes: number | null;
  /** Where the file is, for one that is not stored here. */
  location: string | null;
  expiresOn: string | null;
  leadId: string | null;
  leadName: string | null;
  pageId: string | null;
  pageTitle: string | null;
  notes: string | null;
  createdAt: string;
};

export const documentInput = z.object({
  name: z.string().trim().min(1, "Name the document.").max(200),
  category: z.enum(DOCUMENT_CATEGORIES).default("other"),
  location: z.string().trim().max(300).nullable().default(null),
  expiresOn: day,
  leadId: z.string().nullable().default(null),
  pageId: z.string().nullable().default(null),
  notes: z.string().trim().max(2000).nullable().default(null),
});
export type DocumentInput = z.input<typeof documentInput>;

export type DeadlinesOverview = {
  day: string;
  currency: string;
  /** Overdue and coming up, soonest first. */
  deadlines: Deadline[];
  obligations: Obligation[];
  /** The profile the presets read, so the screen can say what it assumed. */
  profile: { entityType: string | null; gstStatus: string | null };
  /** The preset set suited to the company: India for a rupee company, else the generic one. */
  presetSet: PresetSetId;
  offers: Record<PresetSetId, PresetOffer[]>;
};
