import { z } from "zod";
import { isDay } from "./dates";
import type { LinkedName } from "./links";
import {
  CALL_SCRIPT_TEMPLATE,
  CALL_TONES,
  CALL_TONE_HINT,
  CALL_TONE_LABEL,
  isCallTone,
  scriptPreset,
} from "./calls";
import { RUNNING_COST_TEMPLATE } from "./costs";

/**
 * The brain: what it is made of. See PLAN.md, parts two and four.
 *
 * Fifteen sections about the company, and four that are the founder's own -
 * studies, hobbies, goals and a journal. Each holds pages; a page is a title,
 * a few fields on top that its template defines, and free text under them.
 * Everything here is data and pure functions, so the screens, the service and
 * the tests all read the same definitions.
 *
 * Fields are few on purpose. A value gets a field only when something will
 * read it - the invoice, the checklist, a later phase's reminders - and
 * everything else is the text under them.
 */

export const BRAIN_SECTIONS = [
  "company",
  "plan",
  "products",
  "money",
  "tax",
  "people",
  "customers",
  "playbooks",
  "legal",
  "tools",
  "decisions",
  "meetings",
  "metrics",
  "documents",
  "ideas",
  "studies",
  "hobbies",
  "goals",
  "journal",
] as const;

export type BrainSectionId = (typeof BRAIN_SECTIONS)[number];

export type BrainFieldKind =
  | "text"
  | "long"
  | "date"
  | "number"
  | "money"
  | "choice"
  | "secret"
  | "url"
  | "email"
  | "check"
  | "quarter";

type Option = { value: string; label: string };

export type BrainField = {
  key: string;
  label: string;
  kind: BrainFieldKind;
  hint?: string;
  options?: readonly Option[];
};

export type BrainTemplate = {
  id: string;
  section: BrainSectionId;
  name: string;
  /** What the button that makes one says. */
  adds: string;
  /** Only one per company: opening it again opens the one that exists. */
  single?: boolean;
  /** The title a new page starts with. */
  title: string;
  fields: readonly BrainField[];
  /** Headings and prompts a new page starts from. */
  body: string;
  /** Other places to start from, offered when the page is made. */
  presets?: readonly { id: string; label: string; hint: string }[];
};

type BrainSection = {
  id: BrainSectionId;
  label: string;
  /** The prompt at the top of the section, written to be read once. */
  prompt: string;
  templates: readonly string[];
};

/** A stored field value. Secrets never travel as one of these. */
export type FieldValue = string | number | boolean | null;

const options = (...labels: string[]): Option[] =>
  labels.map((label) => ({ value: slug(label), label }));

function slug(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * A choice whose stored value stays put while its words change: the values
 * are in pages already written and in the filing calendar's rules, and the
 * words had to stop assuming India.
 */
const kept = (...pairs: [value: string, label: string][]): Option[] => pairs.map(([value, label]) => ({ value, label }));

export const ENTITY_TYPES = kept(
  ["sole-proprietorship", "Sole proprietorship or sole trader"],
  ["partnership", "Partnership"],
  ["llp", "LLP"],
  ["private-limited-company", "Private limited company (Ltd, LLC, GmbH and the like)"],
  ["one-person-company", "One person company"],
  ["public-limited-company", "Public limited company or corporation"],
  ["other", "Other"],
);

export const GST_STATUSES = kept(
  ["not-registered", "Not registered"],
  ["regular-monthly-returns", "Registered, monthly returns"],
  ["regular-quarterly-returns-qrmp", "Registered, quarterly returns (QRMP in India)"],
  ["composition-scheme", "A small-business scheme (Composition in India)"],
);

const LEVELS = options("Low", "Medium", "High");

/** How a day felt, worst to best: a word, never a colour alone. */
export const MOODS = options("Rough", "Low", "Okay", "Good", "Great");
export type Mood = "rough" | "low" | "okay" | "good" | "great";

export function isMood(value: unknown): value is Mood {
  return typeof value === "string" && MOODS.some((mood) => mood.value === value);
}

/** The four areas a life goal can be in, the same four a task has. */
const AREAS = [
  { value: "college", label: "College" },
  { value: "company", label: "Company" },
  { value: "personal", label: "Personal" },
  { value: "health", label: "Health" },
];

/** The journal's own template: one a day. */
export const ENTRY_TEMPLATE = "entry";

/* ---- Templates ------------------------------------------------------------ */

const PAGE_BODY = "";

export const BRAIN_TEMPLATES: readonly BrainTemplate[] = [
  // Company
  {
    id: "profile",
    section: "company",
    name: "Company profile",
    adds: "Open the company profile",
    single: true,
    title: "Company profile",
    fields: [
      { key: "legalName", label: "Legal name", kind: "text", hint: "As registered. Printed on invoices." },
      { key: "tradingName", label: "Trading name", kind: "text" },
      { key: "oneLiner", label: "One-liner", kind: "text", hint: "What the company does, in one sentence." },
      { key: "entityType", label: "Entity type", kind: "choice", options: ENTITY_TYPES },
      { key: "incorporatedOn", label: "Incorporated on", kind: "date" },
      { key: "registeredAddress", label: "Registered address", kind: "long", hint: "Printed on invoices." },
      { key: "workingAddress", label: "Working address", kind: "long" },
      { key: "website", label: "Website", kind: "url" },
      { key: "email", label: "Email", kind: "email" },
      { key: "phone", label: "Phone", kind: "text" },
      { key: "cin", label: "Company number", kind: "text", hint: "As registered: CIN or LLPIN in India, the company number elsewhere." },
      { key: "pan", label: "Tax ID", kind: "secret", hint: "PAN in India, EIN in the US, UTR in the UK." },
      { key: "tan", label: "Tax withholding number", kind: "secret", hint: "TAN in India. Leave it empty if there is no such thing where you are." },
      { key: "gstStatus", label: "Sales tax, VAT or GST", kind: "choice", options: GST_STATUSES },
      { key: "gstin", label: "Sales tax, VAT or GST number", kind: "text", hint: "GSTIN in India. Printed on invoices." },
      { key: "udyam", label: "Small-business registration", kind: "text", hint: "Udyam in India." },
    ],
    body: "## The pitch\n\n\n## What makes us different\n\n",
  },
  {
    id: "bank",
    section: "company",
    name: "Bank account",
    adds: "Add a bank account",
    title: "Bank account",
    fields: [
      { key: "bankName", label: "Bank", kind: "text" },
      { key: "holder", label: "Account name", kind: "text" },
      { key: "number", label: "Account number", kind: "secret", hint: "Or the IBAN." },
      { key: "ifsc", label: "Bank code", kind: "text", hint: "IFSC in India; SWIFT or BIC, sort code or routing number elsewhere." },
      { key: "branch", label: "Branch", kind: "text" },
      { key: "upi", label: "Payment ID", kind: "text", hint: "A UPI ID, or wherever else you are paid." },
      { key: "onInvoices", label: "Print on invoices", kind: "check" },
    ],
    body: PAGE_BODY,
  },
  {
    id: "brand",
    section: "company",
    name: "Brand kit",
    adds: "Write the brand kit",
    single: true,
    title: "Brand kit",
    fields: [
      { key: "colours", label: "Colours", kind: "text", hint: "Hex codes, main one first." },
      { key: "fonts", label: "Fonts", kind: "text" },
      { key: "files", label: "Where the logo files are", kind: "text" },
    ],
    body: "## Voice\n\nHow we sound, in three words and one example.\n",
  },
  // Plan
  {
    id: "lean-plan",
    section: "plan",
    name: "One-page plan",
    adds: "Write the one-page plan",
    single: true,
    title: "One-page plan",
    fields: [],
    body: [
      "## Problem",
      "",
      "## Customer",
      "",
      "## Solution",
      "",
      "## Channels",
      "",
      "## Revenue",
      "",
      "## Costs",
      "",
      "## Unfair advantage",
      "",
    ].join("\n"),
  },
  {
    id: "goal",
    section: "plan",
    name: "Goal",
    adds: "Add a goal",
    title: "Goal",
    fields: [
      { key: "quarter", label: "Quarter", kind: "quarter" },
      { key: "measure", label: "How we will know", kind: "text" },
      { key: "done", label: "Done", kind: "check" },
    ],
    body: PAGE_BODY,
  },
  {
    id: "milestone",
    section: "plan",
    name: "Milestone",
    adds: "Add a milestone",
    title: "Milestone",
    fields: [
      { key: "dueOn", label: "By", kind: "date" },
      { key: "done", label: "Done", kind: "check" },
    ],
    body: PAGE_BODY,
  },
  {
    id: "risk",
    section: "plan",
    name: "Risk",
    adds: "Add a risk",
    title: "Risk",
    fields: [
      { key: "likelihood", label: "Likelihood", kind: "choice", options: LEVELS },
      { key: "impact", label: "Impact", kind: "choice", options: LEVELS },
      { key: "owner", label: "Who watches it", kind: "text" },
    ],
    body: "## What would happen\n\n\n## What we are doing about it\n\n",
  },
  {
    id: "competitor",
    section: "plan",
    name: "Competitor",
    adds: "Add a competitor",
    title: "Competitor",
    fields: [
      { key: "website", label: "Website", kind: "url" },
      { key: "pricing", label: "Their pricing", kind: "text" },
    ],
    body: "## What they do well\n\n\n## Where they are weak\n\n",
  },
  // Money plan
  {
    id: "budget",
    section: "money",
    name: "Budget",
    adds: "Write a budget",
    title: "Budget",
    fields: [
      { key: "period", label: "For", kind: "text", hint: "A month, a quarter, a year." },
      { key: "total", label: "Total", kind: "money" },
    ],
    body: "## By category\n\n- Tools: \n- Marketing: \n- People: \n",
  },
  {
    id: RUNNING_COST_TEMPLATE,
    section: "money",
    name: "Running cost",
    adds: "Add a running cost",
    title: "Running cost",
    fields: [
      { key: "amount", label: "Amount", kind: "money", hint: "Each time it is paid." },
      { key: "cycle", label: "Paid", kind: "choice", options: options("Monthly", "Quarterly", "Yearly", "Once") },
      { key: "dueOn", label: "Next due", kind: "date" },
      {
        key: "category",
        label: "Kind",
        kind: "choice",
        options: options("Hosting", "Software", "Rent", "People", "Marketing", "Travel", "Other"),
      },
      { key: "payee", label: "Paid to", kind: "text" },
    ],
    body: "## What it is for\n\n\n## How to stop it\n\n",
  },
  {
    id: "fundraise",
    section: "money",
    name: "Fundraise",
    adds: "Add a fundraise",
    title: "Fundraise",
    fields: [
      {
        key: "instrument",
        label: "Instrument",
        kind: "choice",
        options: options("Equity", "SAFE", "Convertible note", "Grant", "Loan", "Other"),
      },
      { key: "amount", label: "Amount", kind: "money" },
      {
        key: "status",
        label: "Where it is",
        kind: "choice",
        options: options("Thinking", "Talking", "Committed", "Closed"),
      },
      { key: "closeBy", label: "Close by", kind: "date" },
    ],
    body: "## Terms\n\n\n## Who we are talking to\n\n",
  },
  {
    id: "cap-table",
    section: "money",
    name: "Cap table",
    adds: "Write the cap table",
    single: true,
    title: "Cap table",
    fields: [],
    body: "| Holder | Shares | % |\n| --- | --- | --- |\n",
  },
  // Tax and compliance
  {
    id: "registration",
    section: "tax",
    name: "Registration",
    adds: "Add a registration",
    title: "Registration",
    fields: [
      { key: "authority", label: "With", kind: "text" },
      { key: "number", label: "Number", kind: "text" },
      { key: "registeredOn", label: "Registered on", kind: "date" },
      { key: "renewsOn", label: "Renews on", kind: "date" },
    ],
    body: PAGE_BODY,
  },
  {
    id: "accountant",
    section: "tax",
    name: "Accountant",
    adds: "Add the accountant",
    single: true,
    title: "Accountant",
    fields: [
      { key: "name", label: "Name", kind: "text" },
      { key: "firm", label: "Firm", kind: "text" },
      { key: "email", label: "Email", kind: "email" },
      { key: "phone", label: "Phone", kind: "text" },
      { key: "fee", label: "Fee", kind: "money" },
    ],
    body: "## What they handle\n\n",
  },
  // People
  // Customers and market
  {
    id: "persona",
    section: "customers",
    name: "Persona",
    adds: "Add a persona",
    title: "Persona",
    fields: [],
    body: "## Who they are\n\n\n## What they need\n\n\n## Where they hang out\n\n",
  },
  {
    id: "objection",
    section: "customers",
    name: "Objection",
    adds: "Add an objection",
    title: "Objection",
    fields: [],
    body: "## What they say\n\n\n## The answer that worked\n\n",
  },
  {
    id: "case-study",
    section: "customers",
    name: "Case study",
    adds: "Add a case study",
    title: "Case study",
    fields: [{ key: "customer", label: "Customer", kind: "text" }],
    body: "## Before\n\n\n## What we did\n\n\n## After\n\n\n## In their words\n\n",
  },
  // Playbooks
  {
    id: "playbook",
    section: "playbooks",
    name: "Playbook",
    adds: "Add a playbook",
    title: "Playbook",
    fields: [],
    body: "## When to use it\n\n\n## Steps\n\n- [ ] \n- [ ] \n- [ ] \n",
  },
  {
    id: CALL_SCRIPT_TEMPLATE,
    section: "playbooks",
    name: "Call script",
    adds: "Add a call script",
    title: "Call script",
    fields: [
      {
        key: "tone",
        label: "Tone",
        kind: "choice",
        options: CALL_TONES.map((tone) => ({ value: tone, label: CALL_TONE_LABEL[tone] })),
      },
      {
        key: "caller",
        label: "Who is calling",
        kind: "text",
        hint: "Your name as you say it on the phone. Fills in {{me.name}}.",
      },
      { key: "audience", label: "For", kind: "text", hint: "Who it is for: new customers, past customers." },
    ],
    body: scriptPreset("professional").body,
    presets: CALL_TONES.map((tone) => ({ id: tone, label: CALL_TONE_LABEL[tone], hint: CALL_TONE_HINT[tone] })),
  },
  // Legal and contracts
  {
    id: "contract",
    section: "legal",
    name: "Contract",
    adds: "Add a contract",
    title: "Contract",
    fields: [
      { key: "party", label: "With", kind: "text" },
      {
        key: "kind",
        label: "Kind",
        kind: "choice",
        options: options("Client", "Vendor", "Employment", "NDA", "Other"),
      },
      { key: "startsOn", label: "Starts", kind: "date" },
      { key: "endsOn", label: "Ends", kind: "date" },
      { key: "noticeDays", label: "Notice, days", kind: "number" },
      { key: "value", label: "Value", kind: "money" },
    ],
    body: "## What we agreed\n\n",
  },
  {
    id: "trademark",
    section: "legal",
    name: "Trademark",
    adds: "Add a trademark",
    title: "Trademark",
    fields: [
      { key: "number", label: "Application number", kind: "text" },
      { key: "classes", label: "Classes", kind: "text" },
      {
        key: "status",
        label: "Status",
        kind: "choice",
        options: options("Filed", "Objected", "Registered", "Abandoned"),
      },
      { key: "renewsOn", label: "Renews on", kind: "date" },
    ],
    body: PAGE_BODY,
  },
  {
    id: "policy",
    section: "legal",
    name: "Policy",
    adds: "Add a policy",
    title: "Privacy policy",
    fields: [
      { key: "url", label: "Published at", kind: "url" },
      { key: "updatedOn", label: "Last updated", kind: "date" },
    ],
    body: PAGE_BODY,
  },
  // Tools and accounts
  {
    id: "tool",
    section: "tools",
    name: "Tool",
    adds: "Add a tool",
    title: "Tool",
    fields: [
      { key: "cost", label: "Cost", kind: "money" },
      { key: "cycle", label: "Billed", kind: "choice", options: options("Monthly", "Yearly", "Once", "Free") },
      { key: "renewsOn", label: "Renews on", kind: "date" },
      { key: "owner", label: "Whose card", kind: "text" },
      {
        key: "login",
        label: "Where the login lives",
        kind: "text",
        hint: "The password manager and the entry's name. Never the password itself.",
      },
      { key: "url", label: "Address", kind: "url" },
    ],
    body: PAGE_BODY,
  },
  {
    id: "domain",
    section: "tools",
    name: "Domain",
    adds: "Add a domain",
    title: "example.com",
    fields: [
      { key: "registrar", label: "Registrar", kind: "text" },
      { key: "renewsOn", label: "Renews on", kind: "date" },
      { key: "cost", label: "Cost a year", kind: "money" },
    ],
    body: PAGE_BODY,
  },
  // Decisions
  {
    id: "decision",
    section: "decisions",
    name: "Decision",
    adds: "Write down a decision",
    title: "Decision",
    fields: [
      { key: "decidedOn", label: "Decided on", kind: "date" },
      { key: "decidedBy", label: "Decided by", kind: "text" },
      {
        key: "revisitOn",
        label: "Look at it again on",
        kind: "date",
        hint: "For a decision made for now. It comes up on Today a month before.",
      },
    ],
    body: "## Context\n\n\n## What we decided\n\n\n## What else we considered\n\n",
  },
  // Meetings
  {
    id: "meeting",
    section: "meetings",
    name: "Meeting",
    adds: "Add meeting notes",
    title: "Founder check-in",
    fields: [
      { key: "heldOn", label: "Held on", kind: "date" },
      { key: "who", label: "Who was there", kind: "text" },
    ],
    body: "## Agenda\n\n\n## Notes\n\n\n## Action items\n\n- [ ] \n",
  },
  // Metrics
  // Documents
  // Ideas
  {
    id: "idea",
    section: "ideas",
    name: "Idea",
    adds: "Add an idea",
    title: "Idea",
    fields: [
      {
        key: "status",
        label: "Status",
        kind: "choice",
        options: options("Parked", "Trying", "Done", "Dropped"),
      },
    ],
    body: PAGE_BODY,
  },
  {
    id: "experiment",
    section: "ideas",
    name: "Experiment",
    adds: "Plan an experiment",
    title: "Experiment",
    fields: [
      { key: "startsOn", label: "Starts", kind: "date" },
      { key: "endsOn", label: "Ends", kind: "date" },
    ],
    body: "## What we think\n\n\n## How we will test it\n\n\n## What happened\n\n",
  },
  // Studies
  {
    id: "course",
    section: "studies",
    name: "Course",
    adds: "Add a course",
    title: "Course",
    fields: [
      { key: "code", label: "Code", kind: "text", hint: "As the timetable writes it: CS2101." },
      { key: "term", label: "Term", kind: "text", hint: "Semester 3, or Autumn 2026." },
      { key: "teacher", label: "Taught by", kind: "text" },
      { key: "credits", label: "Credits", kind: "number" },
      { key: "status", label: "Status", kind: "choice", options: options("Taking", "Planned", "Done", "Dropped") },
      { key: "grade", label: "Grade", kind: "text", hint: "As the university writes it: A, 8.5, First." },
      {
        key: "gradePoints",
        label: "Grade points",
        kind: "number",
        hint: "The grade as a number on your university's scale - 10, 4 or 100 - so the average works itself out.",
      },
    ],
    body: "## What it covers\n\n\n## Assignments\n\n- [ ] \n\n## How it is marked\n\n",
  },
  {
    id: "exam",
    section: "studies",
    name: "Exam",
    adds: "Add an exam",
    title: "Exam",
    fields: [
      { key: "examOn", label: "On", kind: "date", hint: "It comes up on Today and the Calendar a month before." },
      { key: "at", label: "At", kind: "text", hint: "The time, and the room." },
      { key: "countsFor", label: "Counts for", kind: "text", hint: "40% of the grade." },
      { key: "result", label: "Result", kind: "text" },
    ],
    body: "## What it covers\n\n\n## To revise\n\n- [ ] \n",
  },
  {
    id: "class-notes",
    section: "studies",
    name: "Class notes",
    adds: "Write class notes",
    title: "Class notes",
    fields: [{ key: "heldOn", label: "On", kind: "date" }],
    body: "## Key ideas\n\n\n## Questions\n\n\n## To revise\n\n- [ ] \n",
  },
  // Hobbies
  {
    id: "hobby",
    section: "hobbies",
    name: "Hobby",
    adds: "Add a hobby",
    title: "Hobby",
    fields: [
      { key: "status", label: "Status", kind: "choice", options: options("Doing it", "Paused", "Someday") },
      {
        key: "hoursWanted",
        label: "Hours a week",
        kind: "number",
        hint: "What you want to give it. Make time for it and the page says what it actually got.",
      },
      { key: "goal", label: "Working towards", kind: "text", hint: "Grade 5 piano, a 10 km run, a finished sketchbook." },
    ],
    body: "## Why I do it\n\n\n## What I am working on\n\n- [ ] \n\n## What I have learned\n\n",
  },
  // Goals
  {
    id: "life-goal",
    section: "goals",
    name: "Goal",
    adds: "Add a goal",
    title: "Goal",
    fields: [
      { key: "area", label: "Area", kind: "choice", options: AREAS },
      { key: "byOn", label: "By", kind: "date" },
      { key: "target", label: "Target", kind: "number", hint: "A number to reach, if it has one: 12 books, 5 km, a 9.0 average." },
      { key: "progress", label: "So far", kind: "number" },
      { key: "unit", label: "Of what", kind: "text", hint: "books, km, points." },
      { key: "done", label: "Done", kind: "check" },
    ],
    body: "## Why it matters\n\n\n## How I will get there\n\n- [ ] \n",
  },
  // Journal
  {
    id: ENTRY_TEMPLATE,
    section: "journal",
    name: "Journal entry",
    adds: "Write today's entry",
    title: "Today",
    // The day an entry is for is kept beside the fields rather than among
    // them: it is set when the entry is made, and never edited.
    fields: [{ key: "mood", label: "How it felt", kind: "choice", options: MOODS }],
    body: "## Today\n\n\n## Grateful for\n\n\n## Tomorrow\n\n",
  },
  // Any section
  {
    id: "page",
    section: "ideas",
    name: "Page",
    adds: "Add a blank page",
    title: "Untitled",
    fields: [],
    body: PAGE_BODY,
  },
];

export const BRAIN_SECTION_LIST: readonly BrainSection[] = [
  {
    id: "company",
    label: "Company",
    prompt:
      "What the company is on paper: names, numbers, addresses, and the account invoices are paid into. The profile's legal name, address and tax number print on every invoice.",
    templates: ["profile", "bank", "brand"],
  },
  {
    id: "plan",
    label: "Plan",
    prompt:
      "Where the company is going and why: the one-page plan, this quarter's goals, the milestones on the way, and the risks you are watching.",
    templates: ["lean-plan", "goal", "milestone", "risk", "competitor"],
  },
  {
    id: "products",
    label: "Products and pricing",
    prompt:
      "What you sell is on Money, under Products, with its prices and what it has actually brought in. This is the thinking around it: how you price, who it is for, what you will not build.",
    templates: [],
  },
  {
    id: "money",
    label: "Money plan",
    prompt:
      "The budget, what the company pays for every month, fundraising and who owns what. Cash in and out is already on the Money screen; this is the plan around it.",
    templates: ["budget", RUNNING_COST_TEMPLATE, "fundraise", "cap-table"],
  },
  {
    id: "tax",
    label: "Tax and compliance",
    prompt:
      "What the company has to file and pay, and when - set up from the presets for your kind of company - with the registrations and the accountant. Every date is a starting point: check them with your accountant, because the rules change.",
    templates: ["registration", "accountant"],
  },
  {
    id: "people",
    label: "People",
    prompt:
      "Who works here and on what terms - the founders with what each owns and their equity, the team, interns and freelancers - and who you are hiring. Somebody new gets an onboarding checklist that becomes tasks.",
    templates: [],
  },
  {
    id: "customers",
    label: "Customers and market",
    prompt:
      "What you have learned from the people you sell to: who they are, what they object to and what answered it, and the stories worth retelling.",
    templates: ["persona", "objection", "case-study"],
  },
  {
    id: "playbooks",
    label: "Playbooks",
    prompt:
      "How things are done here, written once: onboarding a client, sending an invoice, running a demo. Steps written as - [ ] can be ticked while you work, or run as tasks - (day 3) for when.",
    templates: ["playbook", CALL_SCRIPT_TEMPLATE],
  },
  {
    id: "legal",
    label: "Legal and contracts",
    prompt:
      "Contracts, NDAs, trademarks and the policies on your website - with the dates that matter.",
    templates: ["contract", "trademark", "policy"],
  },
  {
    id: "tools",
    label: "Tools and accounts",
    prompt:
      "What you pay for, when it renews, and where each login lives. Never a password: say which password manager has it.",
    templates: ["tool", "domain"],
  },
  {
    id: "decisions",
    label: "Decisions",
    prompt:
      "Why things went the way they did, as a log. A decision written down on the day is one nobody has to re-argue in six months.",
    templates: ["decision"],
  },
  {
    id: "meetings",
    label: "Meetings",
    prompt:
      "Founder check-ins and advisor calls: the agenda, what was said, and who does what next. Action items written as - [ ] become tasks - @Asha for who, (by 2026-10-02) for when.",
    templates: ["meeting"],
  },
  {
    id: "metrics",
    label: "Metrics",
    prompt:
      "The handful of numbers that say how the company is doing, with a year of history each. Most are worked out from what Caulder already holds; the rest you write down as you count them.",
    templates: [],
  },
  {
    id: "documents",
    label: "Documents",
    prompt:
      "Every paper the company has to be able to find: kept here as a file, or written down with where it is. One that expires says so on Today before it does.",
    templates: [],
  },
  {
    id: "ideas",
    label: "Ideas",
    prompt:
      "The parking lot. Notes caught with the quick key can be filed here from Today, and an idea worth testing becomes an experiment.",
    templates: ["idea", "experiment"],
  },
  {
    id: "studies",
    label: "Studies",
    prompt:
      "Your courses, exams and class notes. An exam's day reaches Today and the Calendar; assignments written as - [ ] with (by 2026-10-02) become college tasks. Give a course its grade points and the average works itself out, on whatever scale your university uses.",
    templates: ["course", "exam", "class-notes"],
  },
  {
    id: "hobbies",
    label: "Hobbies",
    prompt:
      "What you do because you want to. Say how many hours a week you want to give each, make time for it on the Calendar, and see what it actually got.",
    templates: ["hobby"],
  },
  {
    id: "goals",
    label: "Goals",
    prompt:
      "What you want from the next year of your life, not only the company's: a grade, a distance, a skill, money saved. Each with a day, and a number to reach if it has one.",
    templates: ["life-goal"],
  },
  {
    id: "journal",
    label: "Journal",
    prompt:
      "A few lines a day, and how the day felt. Beside each entry Caulder puts what happened - tasks done, calls made, hours kept - so the entry is only what you made of it.",
    templates: [ENTRY_TEMPLATE],
  },
];

export function sectionOf(id: BrainSectionId): BrainSection {
  const found = BRAIN_SECTION_LIST.find((section) => section.id === id);
  if (!found) throw new Error(`Unknown section: ${id}`);
  return found;
}

export function isSection(value: unknown): value is BrainSectionId {
  return typeof value === "string" && (BRAIN_SECTIONS as readonly string[]).includes(value);
}

/**
 * The founder's own sections, as against the company's. They stay on this
 * machine: never sent to a co-founder, never in a data room, a handbook or
 * the dossier an assistant reads.
 */
const PERSONAL_SECTIONS: readonly BrainSectionId[] = ["studies", "hobbies", "goals", "journal"];

/** The same, as a list SQL can test against. The ids are this file's own constants, never input. */
export const PERSONAL_SQL = PERSONAL_SECTIONS.map((section) => `'${section}'`).join(", ");

export function isPersonalSection(section: BrainSectionId): boolean {
  return PERSONAL_SECTIONS.includes(section);
}

/** A template by id, or the blank page for anything unknown. */
export function templateOf(id: string | null | undefined): BrainTemplate {
  return (
    BRAIN_TEMPLATES.find((template) => template.id === id) ??
    (BRAIN_TEMPLATES.find((template) => template.id === "page") as BrainTemplate)
  );
}

/**
 * What a new page starts as: the template's own title and text, or one of its
 * presets when one was picked.
 */
export function templateStart(
  templateId: string,
  presetId: string | null | undefined,
): { title: string; body: string; fields: Record<string, string> } {
  const template = templateOf(templateId);
  if (template.id === CALL_SCRIPT_TEMPLATE && isCallTone(presetId)) return scriptPreset(presetId);
  return { title: template.title, body: template.body, fields: {} };
}

/** Whether a template may be made in a section: its own, or the blank page anywhere. */
export function templateFits(templateId: string, section: BrainSectionId): boolean {
  if (templateId === "page") return true;
  return BRAIN_TEMPLATES.some((template) => template.id === templateId && template.section === section);
}

/* ---- What a page looks like on the way in and out -------------------------- */

export type BrainPage = {
  id: string;
  companyId: string;
  section: BrainSectionId;
  template: string;
  title: string;
  body: string;
  /** Every field but the secrets. */
  fields: Record<string, FieldValue>;
  /** The secret fields that hold something, masked: "•••• 4821". */
  secrets: Record<string, string>;
  /** Every link in the text whose target still exists, by "kind:id". */
  links: Record<string, LinkedName>;
  isPinned: boolean;
  isArchived: boolean;
  revision: number;
  createdAt: string;
  updatedAt: string;
  /** Who wrote it last: the "This is me" name of whichever Caulder saved it. */
  updatedBy: string | null;
  /**
   * The latest version was written at the same time as another, by the two
   * founders: the other is in History, and nobody has saved since.
   */
  editedTogether: boolean;
  /** A journal entry sealed behind the passcode, read while the journal is locked: its words are not here. */
  locked?: boolean;
};

export type BrainPageSummary = {
  id: string;
  section: BrainSectionId;
  template: string;
  title: string;
  isPinned: boolean;
  isArchived: boolean;
  updatedAt: string;
  /** The first words of the text, for a list. */
  excerpt: string;
};

export type BrainRevision = {
  revision: number;
  title: string;
  body: string;
  fields: Record<string, FieldValue>;
  secrets: Record<string, string>;
  editedAt: string;
  /** Who wrote this version. */
  editedBy: string | null;
  /** Written at the same time as the version before or after it, by the other founder. */
  concurrent: boolean;
};

export type ChecklistItem = {
  id: string;
  label: string;
  done: boolean;
  section: BrainSectionId;
  /** The template the item opens: its single page, or a new one. */
  template: string;
  /** A short word on how far along it is, when it is more than yes or no. */
  progress: string | null;
  /**
   * Where pressing it goes: the page that answers it, the catalogue on
   * Money, which is where products live since phase 8, or a section that
   * holds more than pages - People, since phase 10.
   */
  goes: "page" | "catalogue" | "section";
};

export type BrainHome = {
  company: {
    name: string;
    profileId: string | null;
    oneLiner: string | null;
    entityType: string | null;
    numbers: { label: string; value: string }[];
  };
  checklist: ChecklistItem[];
  recent: BrainPageSummary[];
  pinned: BrainPageSummary[];
  counts: Record<BrainSectionId, number>;
};

export type BrainExport = { folder: string; files: number };

/** One decision in the log: the page, when and by whom, and what was decided in a sentence or two. */
export type DecisionEntry = {
  id: string;
  title: string;
  decidedOn: string | null;
  decidedBy: string | null;
  /** When to look at it again, if that was written down. It reaches Today like a contract's dates. */
  revisitOn: string | null;
  /** The text under "What we decided", or the page's first words. */
  summary: string;
};

const MAX_TEXT = 500;
const MAX_LONG = 4000;
const MAX_BODY = 100_000;

/**
 * A secret on its way in: a new value, or null to clear it. A secret the
 * window did not touch is simply absent - the window never has it to send.
 */
export const pageSaveInput = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Give the page a title.")
    .max(160, "Keep the title under 160 characters."),
  body: z.string().max(MAX_BODY, "That page is too long to keep in one piece. Split it in two."),
  fields: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
  secrets: z.record(z.string(), z.union([z.string(), z.null()])).default({}),
  /** The revision the edit started from, so an edit on top of a stale copy is refused. */
  baseRevision: z.number().int().nonnegative(),
});

export type PageSaveInput = z.input<typeof pageSaveInput>;

/** Quarters as "2026-Q3", calendar quarters, labelled by their months. */
export function quarterOf(day: string): string {
  const year = Number(day.slice(0, 4));
  const month = Number(day.slice(5, 7));
  return `${year}-Q${Math.ceil(month / 3)}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function quarterLabel(quarter: string): string {
  const match = /^(\d{4})-Q([1-4])$/.exec(quarter);
  if (!match) return quarter;
  const first = (Number(match[2]) - 1) * 3;
  return `${MONTHS[first]}–${MONTHS[first + 2]} ${match[1]}`;
}

/** This quarter and the three after it, for the picker. */
export function quartersFrom(day: string): string[] {
  const out: string[] = [];
  let year = Number(day.slice(0, 4));
  let q = Math.ceil(Number(day.slice(5, 7)) / 3);
  for (let i = 0; i < 4; i += 1) {
    out.push(`${year}-Q${q}`);
    q += 1;
    if (q > 4) {
      q = 1;
      year += 1;
    }
  }
  return out;
}

/**
 * The fields a template defines, checked one by one. Anything the template
 * does not define is dropped rather than kept, so a field removed from a
 * template stops being written the next time the page is saved.
 */
export function cleanFields(
  template: BrainTemplate,
  raw: Record<string, FieldValue>,
): Record<string, FieldValue> {
  const out: Record<string, FieldValue> = {};
  for (const field of template.fields) {
    if (field.kind === "secret") continue;
    const value = cleanValue(field, raw[field.key] ?? null);
    if (value !== null && value !== "" && value !== false) out[field.key] = value;
  }
  return out;
}

function cleanValue(field: BrainField, value: FieldValue): FieldValue {
  if (value === null) return null;
  switch (field.kind) {
    case "check":
      return value === true;
    case "number":
    case "money": {
      const number = typeof value === "number" ? value : Number(String(value).replace(/[,\s]/g, ""));
      if (String(value).trim() === "") return null;
      if (!Number.isFinite(number)) throw new Error(`${field.label} has to be a number.`);
      if (field.kind === "money" && number < 0) throw new Error(`${field.label} cannot be negative.`);
      return field.kind === "money" ? Math.round(number) : number;
    }
    case "date": {
      const text = String(value).trim();
      if (text === "") return null;
      if (!isDay(text)) throw new Error(`${field.label} has to be a date.`);
      return text;
    }
    case "choice": {
      const text = String(value);
      if (text === "") return null;
      if (!field.options?.some((option) => option.value === text)) {
        throw new Error(`${field.label} has to be one of its choices.`);
      }
      return text;
    }
    case "quarter": {
      const text = String(value);
      if (text === "") return null;
      if (!/^\d{4}-Q[1-4]$/.test(text)) throw new Error(`${field.label} has to be a quarter.`);
      return text;
    }
    case "url": {
      const text = String(value).trim();
      if (text === "") return null;
      if (text.length > MAX_TEXT) throw new Error(`${field.label} is too long.`);
      // Stored with a scheme so it can be opened; only the web is allowed.
      const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`;
      if (!/^https?:\/\//i.test(withScheme)) throw new Error(`${field.label} has to be a web address.`);
      return withScheme;
    }
    case "email": {
      const text = String(value).trim();
      if (text === "") return null;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) throw new Error(`${field.label} does not look like an email address.`);
      return text.slice(0, 200);
    }
    case "long": {
      const text = String(value).trim();
      if (text.length > MAX_LONG) throw new Error(`${field.label} is too long.`);
      return text;
    }
    case "text":
    case "secret": {
      const text = String(value).trim();
      if (text.length > MAX_TEXT) throw new Error(`${field.label} is too long.`);
      return text;
    }
  }
}

/** A secret's new value, checked: trimmed, bounded, and empty means cleared. */
export function cleanSecret(field: BrainField, value: string | null): string | null {
  if (value === null) return null;
  const text = value.trim();
  if (text.length === 0) return null;
  if (text.length > 200) throw new Error(`${field.label} is too long.`);
  return text;
}

/**
 * The last four characters, kept beside an encrypted value so it can be
 * recognised without being decrypted. Nothing for a value that short.
 */
export function lastFour(value: string): string {
  const compact = value.replace(/\s+/g, "");
  return compact.length > 4 ? compact.slice(-4) : "";
}

/** "•••• 4821": enough to recognise, not enough to use. */
export function maskSecret(last4: string): string {
  return last4 ? `•••• ${last4}` : "••••";
}

/* ---- Write these down first ------------------------------------------------- */

/** What the checklist needs to know about a page. Secrets only as "has one". */
export type ChecklistPage = {
  template: string;
  fields: Record<string, FieldValue>;
  secretKeys: readonly string[];
};

const has = (page: ChecklistPage | undefined, key: string): boolean => {
  if (!page) return false;
  if (page.secretKeys.includes(key)) return true;
  const value = page.fields[key];
  return value !== undefined && value !== null && value !== "" && value !== false;
};

/**
 * The twelve things worth writing down first, and whether each is.
 *
 * Each is answered from the pages alone, so ticking one means writing the
 * thing down rather than pressing a box.
 */
export function evaluateChecklist(
  pages: readonly ChecklistPage[],
  day: string,
  /** What only the tables know: products live on Money, and people in their own table. */
  elsewhere: { pricedProducts: number; founders: { count: number; withOwns: number; withEquity: number } },
): ChecklistItem[] {
  const all = (template: string) => pages.filter((page) => page.template === template);
  const profile = all("profile")[0];
  const { founders } = elsewhere;
  const goals = all("goal").filter((page) => page.fields["quarter"] === quarterOf(day));

  const item = (
    id: string,
    label: string,
    done: boolean,
    section: BrainSectionId,
    template: string,
    progress: string | null = null,
    goes: ChecklistItem["goes"] = "page",
  ): ChecklistItem => ({ id, label, done, section, template, progress, goes });

  return [
    item("one-liner", "The one-liner", has(profile, "oneLiner"), "company", "profile"),
    item(
      "entity",
      "Entity type and incorporation date",
      has(profile, "entityType") && has(profile, "incorporatedOn"),
      "company",
      "profile",
    ),
    item(
      "numbers",
      "Registration numbers",
      ["cin", "pan", "gstin", "udyam"].some((key) => has(profile, key)),
      "company",
      "profile",
    ),
    item(
      "founders",
      "Founders, and who owns what",
      founders.count > 0 && founders.withOwns === founders.count,
      "people",
      "page",
      founders.count > 0 ? `${founders.count} written` : null,
      "section",
    ),
    item(
      "equity",
      "The equity split",
      founders.count > 0 && founders.withEquity === founders.count,
      "people",
      "page",
      null,
      "section",
    ),
    item(
      "product",
      "The first product and its price",
      elsewhere.pricedProducts > 0,
      "products",
      "page",
      null,
      "catalogue",
    ),
    item("gst", "Sales tax, VAT or GST", has(profile, "gstStatus"), "company", "profile"),
    item(
      "bank",
      "The bank account invoices print",
      all("bank").some((page) => has(page, "onInvoices") && has(page, "number")),
      "company",
      "bank",
    ),
    item("accountant", "The accountant", has(all("accountant")[0], "name"), "tax", "accountant"),
    item("tools", "The tools you pay for", all("tool").length > 0, "tools", "tool"),
    item(
      "goals",
      "This quarter's three goals",
      goals.length >= 3,
      "plan",
      "goal",
      goals.length > 0 && goals.length < 3 ? `${goals.length} of 3` : null,
    ),
    item("risk", "The biggest risk", all("risk").length > 0, "plan", "risk"),
  ];
}
