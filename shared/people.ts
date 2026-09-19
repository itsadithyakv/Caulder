import { z } from "zod";
import { addMonths, isDay, shiftDay } from "./dates";
import { pageSteps } from "./steps";

/**
 * People: who works here and on what terms, and who might. See PLAN.md,
 * phase 10.
 *
 * One table for everybody - a founder, an employee, an intern, a freelancer,
 * an advisor, a candidate - because a candidate who is hired becomes one of
 * the others without being written out again, and a freelancer who joins is
 * the same person with new terms. What differs is which fields matter: equity
 * and vesting for a founder or an advisor, pay for the rest, a stage for a
 * candidate.
 */

export const PERSON_KINDS = ["founder", "employee", "intern", "freelancer", "advisor", "candidate"] as const;
export type PersonKind = (typeof PERSON_KINDS)[number];

export const PERSON_KIND_LABEL: Record<PersonKind, string> = {
  founder: "Founder",
  employee: "Employee",
  intern: "Intern",
  freelancer: "Freelancer",
  advisor: "Advisor",
  candidate: "Candidate",
};

/** What a candidate can be hired as. */
export const HIRED_KINDS = ["employee", "intern", "freelancer", "advisor"] as const;
export type HiredKind = (typeof HIRED_KINDS)[number];

export const PAY_PERIODS = ["month", "hour", "day", "project", "year"] as const;
export type PayPeriod = (typeof PAY_PERIODS)[number];

export const PAY_PERIOD_LABEL: Record<PayPeriod, string> = {
  month: "a month",
  hour: "an hour",
  day: "a day",
  project: "a project",
  year: "a year",
};

export const CANDIDATE_STAGES = ["applied", "talking", "interview", "offer", "hired", "declined"] as const;
export type CandidateStage = (typeof CANDIDATE_STAGES)[number];

export const CANDIDATE_STAGE_LABEL: Record<CandidateStage, string> = {
  applied: "Applied",
  talking: "Talking",
  interview: "Interviewing",
  offer: "Offer made",
  hired: "Hired",
  declined: "Not this time",
};

export const OPENING_STATUSES = ["open", "paused", "filled"] as const;
export type OpeningStatus = (typeof OPENING_STATUSES)[number];

export const OPENING_STATUS_LABEL: Record<OpeningStatus, string> = {
  open: "Open",
  paused: "Paused",
  filled: "Filled",
};

/* ---- A person ------------------------------------------------------------- */

const day = z
  .string()
  .refine((value) => isDay(value) && addMonths(value, 0) === value, "Pick a date.")
  .nullable()
  .default(null);

const text = (max: number) => z.string().trim().max(max).nullable().default(null);

export const personInput = z
  .object({
    name: z.string().trim().min(1, "Give their name.").max(120, "Keep the name under 120 characters."),
    kind: z.enum(PERSON_KINDS).default("employee"),
    role: text(120),
    email: z
      .string()
      .trim()
      .max(200)
      .refine((value) => value === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value), "That email does not look right.")
      .nullable()
      .default(null),
    phone: text(40),
    leadId: z.string().nullable().default(null),
    startsOn: day,
    endsOn: day,
    pay: z.number().int("Pay is a whole number.").min(0).nullable().default(null),
    payPer: z.enum(PAY_PERIODS).nullable().default(null),
    equity: z.number().min(0).max(100, "Equity is a percentage, 100 at most.").nullable().default(null),
    /** Over how long the equity is earned, from the start date. None: all at once. */
    vestingMonths: z.number().int().min(1).max(120, "Ten years is the longest vesting.").nullable().default(null),
    cliffMonths: z.number().int().min(0).max(60).nullable().default(null),
    owns: text(2000),
    openingId: z.string().nullable().default(null),
    stage: z.enum(CANDIDATE_STAGES).nullable().default(null),
    notes: text(4000),
  })
  .refine((input) => !input.startsOn || !input.endsOn || input.endsOn >= input.startsOn, {
    message: "They cannot finish before they start.",
    path: ["endsOn"],
  })
  .refine((input) => input.cliffMonths === null || input.vestingMonths === null || input.cliffMonths <= input.vestingMonths, {
    message: "The cliff cannot be longer than the vesting.",
    path: ["cliffMonths"],
  });
export type PersonInput = z.input<typeof personInput>;

/** Where somebody is: not yet started, here, gone, or not hired. */
export type PersonStatus = "candidate" | "starting" | "current" | "past";

export type Vesting = {
  equity: number;
  /** How much of it is earned on the day asked about. */
  vested: number;
  /** When the first part is earned, when there is a cliff. */
  cliffOn: string | null;
  /** When all of it is. */
  fullyOn: string;
};

export type Person = {
  id: string;
  companyId: string;
  name: string;
  kind: PersonKind;
  role: string | null;
  email: string | null;
  phone: string | null;
  leadId: string | null;
  leadName: string | null;
  startsOn: string | null;
  endsOn: string | null;
  pay: number | null;
  payPer: PayPeriod | null;
  equity: number | null;
  vestingMonths: number | null;
  cliffMonths: number | null;
  owns: string | null;
  openingId: string | null;
  openingTitle: string | null;
  stage: CandidateStage | null;
  notes: string | null;
  /** The day onboarding was started, if it has been. */
  onboardedOn: string | null;
  createdAt: string;
  updatedAt: string;
  status: PersonStatus;
  vesting: Vesting | null;
  /** Onboarding tasks: how many there are and how many are done. */
  onboarding: { total: number; done: number } | null;
};

export function statusOf(
  person: Pick<Person, "kind" | "startsOn" | "endsOn">,
  today: string,
): PersonStatus {
  if (person.kind === "candidate") return "candidate";
  if (person.endsOn && person.endsOn < today) return "past";
  if (person.startsOn && person.startsOn > today) return "starting";
  return "current";
}

/** Whole months from one day to another: 15 Jan to 14 Feb is none, to 15 Feb is one. */
export function wholeMonths(from: string, to: string): number {
  if (to < from) return 0;
  let months = (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 + (Number(to.slice(5, 7)) - Number(from.slice(5, 7)));
  if (addMonths(from, months) > to) months -= 1;
  return Math.max(0, months);
}

/**
 * How much of somebody's equity they have earned on a day. It vests monthly
 * from their start date over `vestingMonths`, and nothing before the cliff -
 * at the cliff, the months it held back all arrive at once. With no vesting
 * written down it is all theirs from the start.
 */
export function vestingOf(
  person: Pick<Person, "equity" | "vestingMonths" | "cliffMonths" | "startsOn">,
  today: string,
): Vesting | null {
  const { equity, vestingMonths, startsOn } = person;
  if (!equity || !startsOn) return null;
  if (!vestingMonths) return { equity, vested: startsOn <= today ? equity : 0, cliffOn: null, fullyOn: startsOn };
  const cliff = person.cliffMonths ?? 0;
  const months = wholeMonths(startsOn, today);
  const earned = startsOn > today || months < cliff ? 0 : Math.min(months, vestingMonths);
  return {
    equity,
    vested: Math.round(((equity * earned) / vestingMonths) * 100) / 100,
    cliffOn: cliff > 0 ? addMonths(startsOn, cliff) : null,
    fullyOn: addMonths(startsOn, vestingMonths),
  };
}

/** "4 years, 1-year cliff", "18 months, no cliff". */
export function describeVesting(vestingMonths: number | null, cliffMonths: number | null): string {
  if (!vestingMonths) return "no vesting";
  const span = (months: number) =>
    months % 12 === 0 ? `${months / 12} ${months === 12 ? "year" : "years"}` : `${months} ${months === 1 ? "month" : "months"}`;
  const cliff = cliffMonths ? `${span(cliffMonths).replace(/ years?$/, "-year").replace(/ months?$/, "-month")} cliff` : "no cliff";
  return `${span(vestingMonths)}, ${cliff}`;
}

/* ---- An open role ---------------------------------------------------------- */

export const openingInput = z.object({
  title: z.string().trim().min(1, "Name the role.").max(120),
  status: z.enum(OPENING_STATUSES).default("open"),
  pay: text(120),
  notes: text(4000),
});
export type OpeningInput = z.input<typeof openingInput>;

export type Opening = {
  id: string;
  companyId: string;
  title: string;
  status: OpeningStatus;
  pay: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  /** Candidates still in play for it. */
  inPlay: number;
};

/* ---- Hiring ----------------------------------------------------------------- */

export const hireInput = z.object({
  kind: z.enum(HIRED_KINDS),
  startsOn: day,
  /** Mark the role filled, when there is one. */
  fillOpening: z.boolean().default(true),
});
export type HireInput = z.input<typeof hireInput>;

/* ---- Onboarding ------------------------------------------------------------- */

export type ChecklistStep = {
  title: string;
  /** Days after the start it is due; 0 is the first day. */
  day: number;
};

/**
 * The steps of a checklist written in a page: every `- [ ]` line, in order,
 * with "(day 7)" at the end of one saying how many days after the start it
 * is due. A step already ticked in the page is still a step: the page is the
 * list to run, not a record of one run. The reading is `pageSteps`'s.
 */
export function checklistSteps(body: string): ChecklistStep[] {
  return pageSteps(body).map((step) => ({ title: step.title, day: step.day ?? 0 }));
}

const step = (title: string, onDay = 0): ChecklistStep => ({ title, day: onDay });

/**
 * What joining looks like for each kind of person, as a starting point. The
 * paperwork first, then access, then the check-ins people forget. Written for
 * a small Indian company; a playbook page with its own `- [ ]` steps can be
 * run instead.
 */
export const ONBOARDING: Record<Exclude<PersonKind, "candidate">, readonly ChecklistStep[]> = {
  founder: [
    step("Founders' agreement signed, with vesting"),
    step("Access to the bank, email and tools"),
    step("Share certificate or partnership deed updated", 7),
    step("Added as a director or designated partner, if they will be one", 14),
  ],
  employee: [
    step("Offer letter signed"),
    step("Employment agreement and NDA signed"),
    step("PAN, bank details and address collected"),
    step("Laptop, email and the tools they need"),
    step("Added to payroll, and TDS worked out", 1),
    step("First week planned with them", 1),
    step("Check in after two weeks", 14),
    step("30-day review", 30),
  ],
  intern: [
    step("Offer letter signed"),
    step("Internship agreement and NDA signed"),
    step("Email and the tools they need"),
    step("A project, and who they report to", 1),
    step("Check in after the first week", 7),
    step("Mid-way review", 30),
  ],
  freelancer: [
    step("Agreement signed: scope, rate, and who owns the work"),
    step("NDA signed"),
    step("Access to what they need"),
    step("How they invoice, and when they are paid", 1),
    step("First piece of work reviewed", 7),
  ],
  advisor: [
    step("Advisor agreement signed"),
    step("Equity or fee written down"),
    step("First call planned", 7),
  ],
};

/** Which day each step falls due: its day after the start, never before today. */
export function stepDueOn(startsOn: string | null, stepDay: number, today: string): string {
  const due = shiftDay(startsOn ?? today, stepDay);
  return due < today ? today : due;
}

/* ---- The whole section ------------------------------------------------------ */

/** A playbook page that can be run as an onboarding checklist. */
export type RunnableChecklist = { pageId: string; title: string; steps: number };

export type PeopleOverview = {
  day: string;
  currency: string;
  people: Person[];
  openings: Opening[];
  /** Playbook pages with steps, which onboarding can run instead of the defaults. */
  checklists: RunnableChecklist[];
};

export type PersonTask = { id: string; title: string; dueOn: string; done: boolean };

export type PersonDetail = {
  day: string;
  currency: string;
  person: Person;
  tasks: PersonTask[];
  openings: Opening[];
  checklists: RunnableChecklist[];
};

/**
 * The equity split: who holds what, and what is left. Candidates hold
 * nothing yet and people who have left keep what they vested, which is a
 * cap-table question the page in Money plan answers; this is the split among
 * the people here.
 */
export function equitySplit(people: readonly Pick<Person, "name" | "equity" | "status">[]): {
  given: number;
  holders: { name: string; equity: number }[];
} {
  const holders = people
    .filter((person) => person.status !== "candidate" && person.status !== "past" && (person.equity ?? 0) > 0)
    .map((person) => ({ name: person.name, equity: person.equity ?? 0 }))
    .sort((a, b) => b.equity - a.equity);
  return { given: Math.round(holders.reduce((sum, holder) => sum + holder.equity, 0) * 100) / 100, holders };
}
