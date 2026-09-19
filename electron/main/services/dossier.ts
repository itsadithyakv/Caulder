import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Db } from "../db/connection";
import {
  BRAIN_SECTION_LIST,
  templateOf,
  type BrainExport,
  type BrainSectionId,
} from "@shared/brain";
import { parseLinks } from "@shared/links";
import { CALL_OUTCOMES, INTEREST_LABEL, isInterest, type CallOutcome } from "@shared/calls";
import { COST_CYCLE_LABEL, describeRunway } from "@shared/costs";
import {
  ACTIVITY_LABEL,
  INVOICE_STATUS_LABEL,
  QUOTE_STATUS_LABEL,
  RELATIONSHIP_LABEL,
  TASK_KIND_LABEL,
  documentNumber,
  type Activity,
  type Invoice,
  type Quote,
  type TaskKind,
} from "@shared/domain";
import { pagesOf } from "../repositories/brain";
import { listActivities, listLeads } from "../repositories/leads";
import { listCalls } from "../repositories/calls";
import { listNotes } from "../repositories/notes";
import { buildMoney } from "../repositories/money";
import { buildBoard } from "./pipeline";
import { buildCosts } from "./costs";
import { listProducts } from "../repositories/products";
import { PRODUCT_KIND_LABEL, PRODUCT_STATUS_LABEL, describeRecurrence, marginOf } from "@shared/products";
import { describeValue } from "./brain";
import { deadlinesBetween, dueSoon } from "./deadlines";
import { listObligations } from "../repositories/obligations";
import { listDocuments } from "../repositories/documents";
import {
  DOCUMENT_CATEGORY_LABEL,
  OBLIGATION_KIND_LABEL,
  PERIOD_LABEL,
  describeDeadline,
  describeRule,
  periodOf,
} from "@shared/deadlines";
import { shiftDay } from "@shared/dates";
import { listOpenings, listPeople } from "../repositories/people";
import { buildMetrics } from "./metrics";
import {
  CANDIDATE_STAGE_LABEL,
  OPENING_STATUS_LABEL,
  PAY_PERIOD_LABEL,
  PERSON_KIND_LABEL,
  describeVesting,
  equitySplit,
} from "@shared/people";
import { safeName, stamp } from "./names";

/**
 * The dossier: everything Caulder knows about a company, as a few long
 * Markdown documents rather than a folder of small files - written to be read
 * in one go, by a person joining or by an assistant given all of it.
 *
 * Built in memory first, so the same documents can be written to a folder or
 * handed to Ask the brain. Registration and account numbers are masked unless
 * asked for.
 */

export type DossierDocument = { file: string; title: string; text: string };

type Page = ReturnType<typeof pagesOf>[number];

/** Which document each section of the brain goes in. */
const COMPANY_SECTIONS: readonly BrainSectionId[] = ["company", "plan", "products", "money", "tax", "legal", "tools"];
const SALES_SECTIONS: readonly BrainSectionId[] = ["customers", "playbooks"];
const RUNNING_SECTIONS: readonly BrainSectionId[] = ["people", "decisions", "meetings", "metrics", "documents", "ideas"];

/** How much of each contact's history is written out; older entries are counted, not listed. */
const HISTORY_PER_CONTACT = 25;
/** How far ahead the dossier lists deadlines. */
const DEADLINES_AHEAD = 90;

const OUTCOME_WORDS: Record<CallOutcome, string> = {
  no_answer: "no answer",
  busy: "busy",
  voicemail: "voicemail",
  wrong_number: "wrong number",
  spoke: "spoke",
};

function moneyIn(currency: string): (value: number) => string {
  const format = new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", { maximumFractionDigits: 0 });
  return (value) => `${currency} ${format.format(value)}`;
}

/** A page's headings moved down, so its "## Steps" sits under the page's own heading. */
function shiftHeadings(body: string, by: number): string {
  let fenced = false;
  return body
    .split("\n")
    .map((line) => {
      if (/^\s*```/.test(line)) fenced = !fenced;
      if (fenced) return line;
      const heading = /^(#{1,6})(\s+.*)$/.exec(line);
      if (!heading) return line;
      return `${"#".repeat(Math.min(6, (heading[1] ?? "#").length + by))}${heading[2]}`;
    })
    .join("\n");
}

type Names = { titles: Map<string, string>; contacts: Map<string, string> };

/** Links as the names they point at: a page in italics, a contact in bold. */
function plainLinks(body: string, names: Names): string {
  let out = "";
  let at = 0;
  for (const link of parseLinks(body)) {
    out += body.slice(at, link.start);
    const name = link.kind === "page" ? names.titles.get(link.id) : names.contacts.get(link.id);
    out += name ? (link.kind === "page" ? `*${name}*` : `**${name}**`) : link.label;
    at = link.end;
  }
  return out + body.slice(at);
}

function pageBlock(page: Page, level: number, secrets: boolean, names: Names): string[] {
  const template = templateOf(page.template);
  const lines = [`${"#".repeat(level)} ${page.title}`, "", `*${template.name}, updated ${page.updated_at.slice(0, 10)}*`, ""];
  for (const field of template.fields) {
    const value = describeValue(field.kind, page.stored[field.key], field.options, secrets);
    if (value !== null) lines.push(`- **${field.label}:** ${value.replace(/\n/g, ", ")}`);
  }
  if (lines[lines.length - 1] !== "") lines.push("");
  const body = plainLinks(page.body, names).trim();
  if (body.length > 0) lines.push(shiftHeadings(body, level - 1), "");
  return lines;
}

function sectionBlocks(
  pages: readonly Page[],
  sections: readonly BrainSectionId[],
  secrets: boolean,
  names: Names,
  /** What a section holds besides pages - the filing calendar, the documents - written before them. */
  extra: Partial<Record<BrainSectionId, readonly string[]>> = {},
): string[] {
  const lines: string[] = [];
  for (const section of BRAIN_SECTION_LIST.filter((candidate) => sections.includes(candidate.id))) {
    const mine = pages.filter((page) => page.section === section.id);
    const more = extra[section.id] ?? [];
    lines.push(`## ${section.label}`, "", ...more);
    if (mine.length === 0) {
      if (more.length === 0) lines.push("*Nothing written here yet.*", "");
      continue;
    }
    for (const page of mine) lines.push(...pageBlock(page, 3, secrets, names));
  }
  return lines;
}

function table(head: readonly string[], rows: readonly (readonly string[])[]): string[] {
  const cell = (text: string) => text.replace(/\|/g, "\\|").replace(/\n/g, " ");
  return [
    `| ${head.map(cell).join(" | ")} |`,
    `| ${head.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map(cell).join(" | ")} |`),
    "",
  ];
}

type DossierOptions = {
  secrets: boolean;
  /**
   * Only these contacts, when given - for a copy that has to fit somewhere,
   * such as a question to Claude. The rest are counted, not written.
   */
  contacts?: ReadonlySet<string>;
};

export function buildDossier(
  db: Db,
  companyId: string,
  options: DossierOptions,
  now: Date = new Date(),
): DossierDocument[] {
  const company = db.prepare(`SELECT name, currency, timezone FROM companies WHERE id = ?`).get(companyId) as
    | { name: string; currency: string; timezone: string }
    | undefined;
  if (!company) throw new Error("That company no longer exists.");

  const money = moneyIn(company.currency);
  const pages = pagesOf(db, companyId).filter((page) => page.is_archived === 0);
  const leads = listLeads(db, { companyId, sort: "name", direction: "asc" });
  const names: Names = {
    titles: new Map(pages.map((page) => [page.id, page.title])),
    contacts: new Map(leads.map((lead) => [lead.id, lead.name])),
  };
  const overview = buildMoney(db, companyId, now);
  const costs = buildCosts(db, companyId, now);
  const board = buildBoard(db, companyId);
  const exported = costs.day;
  const masked = options.secrets
    ? "Registration and account numbers are written in full: keep this folder safe."
    : "Registration and account numbers are masked.";

  type DealRow = {
    id: string;
    lead_id: string;
    title: string;
    value: number | null;
    loss_reason: string | null;
    stage_name: string | null;
    stage_kind: string | null;
    lead_name: string;
    updated_at: string;
  };
  const deals = db
    .prepare(
      `SELECT d.id, d.lead_id, d.title, d.value, d.loss_reason, d.updated_at,
              s.name AS stage_name, s.kind AS stage_kind, l.name AS lead_name
         FROM deals d
         JOIN leads l ON l.id = d.lead_id
         LEFT JOIN pipeline_stages s ON s.id = d.stage_id
        WHERE d.company_id = ?
        ORDER BY (COALESCE(s.kind, 'open') = 'open') DESC, d.updated_at DESC`,
    )
    .all(companyId) as DealRow[];
  const openDeals = deals.filter((deal) => (deal.stage_kind ?? "open") === "open");
  const openValue = openDeals.reduce((sum, deal) => sum + (deal.value ?? 0), 0);

  type TaskRow = { title: string; kind: TaskKind; due_on: string; lead_id: string | null; lead_name: string | null };
  const openTasks = db
    .prepare(
      `SELECT t.title, t.kind, t.due_on, t.lead_id, l.name AS lead_name
         FROM tasks t LEFT JOIN leads l ON l.id = t.lead_id
        WHERE t.company_id = ? AND t.status = 'open'
        ORDER BY t.due_on, t.title COLLATE NOCASE`,
    )
    .all(companyId) as TaskRow[];

  // Deadlines: what is late, and the next ninety days of everything with a date.
  const late = dueSoon(db, companyId, exported).filter((deadline) => deadline.daysLeft < 0);
  const ahead = deadlinesBetween(db, companyId, exported, shiftDay(exported, DEADLINES_AHEAD), exported);
  const upcoming = [...late, ...ahead.filter((deadline) => !late.some((other) => other.key === deadline.key))];
  const obligations = listObligations(db, companyId, exported);
  const documents = listDocuments(db, companyId);

  const taxExtra: string[] = [
    `### Deadlines: anything late, and the next ${DEADLINES_AHEAD} days`,
    "",
    ...(upcoming.length === 0
      ? ["*Nothing falls due.*", ""]
      : table(
          ["Due", "What", "For", "Where it comes from", "Where it is up to"],
          upcoming.map((deadline) => [
            deadline.dueOn,
            `${deadline.title} (${deadline.what.toLowerCase()})`,
            deadline.period ?? "",
            deadline.source === "obligation"
              ? "The filing calendar"
              : deadline.source === "page"
                ? "Its page"
                : deadline.source === "person"
                  ? "People"
                  : "Documents",
            deadline.doneOn ? `Done ${deadline.doneOn}` : describeDeadline(deadline),
          ]),
        )),
    "### The filing calendar",
    "",
    ...(obligations.length === 0
      ? ["*Not set up.*", ""]
      : table(
          ["Obligation", "Kind", "When", "Each one is for", "Usually", "Last done", "Next due", "Notes"],
          obligations.map((obligation) => [
            `${obligation.title}${obligation.active ? "" : " (no longer needed)"}`,
            OBLIGATION_KIND_LABEL[obligation.kind],
            describeRule(obligation.rule),
            obligation.period === "none" ? "" : PERIOD_LABEL[obligation.period].toLowerCase(),
            obligation.amount === null ? "" : money(obligation.amount),
            obligation.lastDone
              ? `${obligation.lastDone.doneOn}${
                  periodOf(obligation.period, obligation.lastDone.dueOn)
                    ? `, for ${periodOf(obligation.period, obligation.lastDone.dueOn)}`
                    : ""
                }`
              : "",
            obligation.active ? (obligation.nextDue ?? "") : "",
            obligation.notes ?? "",
          ]),
        )),
  ];

  const documentsExtra: string[] = [
    "### On file",
    "",
    ...(documents.length === 0
      ? ["*No documents kept or written down.*", ""]
      : table(
          ["Document", "Kind", "Where it is", "Expires", "Contact", "Notes"],
          documents.map((document) => [
            document.name,
            DOCUMENT_CATEGORY_LABEL[document.category],
            document.hasFile ? "Stored in Caulder" : (document.location ?? ""),
            document.expiresOn ?? "",
            document.leadName ?? "",
            document.notes ?? "",
          ]),
        )),
  ];

  // People: the team with their terms, the equity split, hiring, and who has left.
  const people = listPeople(db, companyId, exported);
  const openings = listOpenings(db, companyId);
  const team = people.filter((person) => person.status === "current" || person.status === "starting");
  const left = people.filter((person) => person.status === "past");
  const candidates = people.filter((person) => person.status === "candidate");
  const split = equitySplit(people);
  const termsOf = (person: (typeof people)[number]) =>
    [
      person.pay !== null ? `${money(person.pay)}${person.payPer ? ` ${PAY_PERIOD_LABEL[person.payPer]}` : ""}` : null,
      person.equity !== null
        ? `${person.equity}% equity (${describeVesting(person.vestingMonths, person.cliffMonths)}${
            person.vesting && person.vesting.vested < person.vesting.equity ? `; ${person.vesting.vested}% vested` : ""
          })`
        : null,
    ]
      .filter(Boolean)
      .join("; ");

  const peopleExtra: string[] = [
    "### The team",
    "",
    ...(team.length === 0
      ? ["*Nobody written down.*", ""]
      : table(
          ["Name", "Here as", "Role", "From", "Until", "Terms", "What they own"],
          team.map((person) => [
            person.name,
            PERSON_KIND_LABEL[person.kind],
            person.role ?? "",
            person.startsOn ?? "",
            person.endsOn ?? "",
            termsOf(person),
            person.owns ?? "",
          ]),
        )),
    ...(split.holders.length === 0
      ? []
      : [
          `**Equity given: ${split.given}%** - ${split.holders.map((holder) => `${holder.name} ${holder.equity}%`).join(", ")}.`,
          "",
        ]),
    "### Hiring",
    "",
    ...(openings.length === 0 && candidates.length === 0
      ? ["*Nobody being hired.*", ""]
      : [
          ...openings.flatMap((opening) => {
            const theirs = candidates.filter((person) => person.openingId === opening.id);
            return [
              `- **${opening.title}** (${OPENING_STATUS_LABEL[opening.status].toLowerCase()}${opening.pay ? `, ${opening.pay}` : ""})${
                theirs.length > 0
                  ? `: ${theirs.map((person) => `${person.name} - ${CANDIDATE_STAGE_LABEL[person.stage ?? "applied"].toLowerCase()}`).join("; ")}`
                  : ": no candidates yet"
              }`,
            ];
          }),
          ...candidates
            .filter((person) => !openings.some((opening) => opening.id === person.openingId))
            .map((person) => `- ${person.name}, not for a particular role - ${CANDIDATE_STAGE_LABEL[person.stage ?? "applied"].toLowerCase()}`),
          "",
        ]),
    ...(left.length === 0
      ? []
      : [
          "### People who have left",
          "",
          ...table(
            ["Name", "Was", "Role", "From", "Until"],
            left.map((person) => [person.name, PERSON_KIND_LABEL[person.kind], person.role ?? "", person.startsOn ?? "", person.endsOn ?? ""]),
          ),
        ]),
    ...people
      .filter((person) => person.notes)
      .flatMap((person) => [`### Notes on ${person.name}`, "", shiftHeadings(person.notes ?? "", 3), ""]),
  ];

  // Metrics: each with where it is now, what it is compared with, and its year.
  const metrics = buildMetrics(db, companyId, now);
  const metricText = (kind: string, unit: string | null, value: number | null) =>
    value === null
      ? "-"
      : kind === "money"
        ? money(Math.round(value))
        : kind === "percent"
          ? `${Math.round(value * 10) / 10}%`
          : `${Math.round(value * 10) / 10}${unit ? ` ${unit}` : ""}`;
  const metricsExtra: string[] =
    metrics.metrics.length === 0
      ? []
      : [
          "### The numbers",
          "",
          ...table(
            ["Metric", "Now", "Compared with", "Target", "How"],
            metrics.metrics.map((metric) => [
              metric.name,
              `${metricText(metric.kind, metric.unitLabel, metric.now)}${
                metric.flow ? " (this month so far)" : metric.nowOn ? ` (on ${metric.nowOn})` : ""
              }`,
              metric.previous === null
                ? ""
                : `${metricText(metric.kind, metric.unitLabel, metric.previous)} ${metric.flow ? "last month" : "the reading before"}`,
              metric.target === null ? "" : metricText(metric.kind, metric.unitLabel, metric.target),
              metric.source === "manual" ? "written down" : "worked out by Caulder",
            ]),
          ),
          "### The last twelve months",
          "",
          ...table(
            ["Month", ...metrics.metrics.map((metric) => metric.name)],
            (metrics.metrics[0]?.history ?? []).map((point, index) => [
              point.month,
              ...metrics.metrics.map((metric) => metricText(metric.kind, metric.unitLabel, metric.history[index]?.value ?? null)),
            ]),
          ),
        ];

  const runway = costs.runway;
  const runwayLine =
    runway.cash === null
      ? "Runway: not known - no bank balance has been given."
      : runway.months === null
        ? `Runway: not burning. ${money(runway.cash)} in the bank on ${runway.cashOn}, and more comes in than goes out.`
        : `Runway: ${describeRunway(runway.months)} (to ${runway.runsOutOn}). ${money(runway.cash)} in the bank on ${runway.cashOn}; burn ${money(runway.burn)} a month.`;

  const glance = [
    "## At a glance",
    "",
    `- This month (${overview.month}): quoted ${money(overview.quoted)}, invoiced ${money(overview.invoiced)}, paid in ${money(overview.paid)}, spent ${money(overview.spent)}.`,
    `- ${runwayLine}`,
    `- Running costs: ${money(costs.monthly)} a month across ${costs.costs.length} ${costs.costs.length === 1 ? "cost" : "costs"}.`,
    `- Contacts: ${leads.length}. Open deals: ${openDeals.length}, worth ${money(openValue)}.`,
    `- People: ${team.length} on the team, ${openings.filter((opening) => opening.status === "open").length} open ${
      openings.filter((opening) => opening.status === "open").length === 1 ? "role" : "roles"
    }, ${candidates.filter((person) => person.stage !== "declined").length} candidates in play.`,
    `- Unpaid and overdue invoices: ${overview.overdue.length}. Open tasks: ${openTasks.length}.`,
    `- Deadlines: ${late.length} late, ${ahead.filter((deadline) => !deadline.doneOn && deadline.daysLeft <= 30).length} in the next 30 days.`,
    "",
  ];

  /* ---- 00 Read me first ---- */

  const readme: string[] = [
    `# ${company.name}: read me first`,
    "",
    `Everything Caulder knows about ${company.name}, exported on ${exported}, written to be read in one go - by a person joining, or by an AI assistant given all four documents.`,
    "",
    "1. **The company** - who the company is, its plan, what it sells and for how much, its money: this month, running costs, runway, the budget; tax and what it files when, legal and the tools it pays for.",
    "2. **Customers and sales** - the funnel, every deal, every contact with its notes, calls and history, what customers have taught us, and the playbooks and call scripts.",
    "3. **People and running the company** - the team with their terms and equity, hiring, decisions and why, meetings, metrics, documents, ideas, open tasks and loose notes.",
    "",
    `Money is in ${company.currency}, in whole units. Dates are year-month-day. The company's timezone is ${company.timezone}. ${masked}`,
    "",
    ...glance,
    "## Using it with an assistant",
    "",
    "Give it all the documents at once, then ask. For example:",
    "",
    "- *Which deals should I chase this week, and what should I say to each?*",
    "- *What objections come up most on calls, and how well are we answering them?*",
    "- *How long does our money last, and what could we cut?*",
    "- *Write a one-page update for an investor.*",
    "- *What have we decided about pricing, and why?*",
    "",
  ];

  /* ---- 01 The company ---- */

  const company1: string[] = [
    `# ${company.name}: the company`,
    "",
    `*Part of the ${company.name} dossier, exported ${exported}. ${masked}*`,
    "",
    ...glance,
    "## Money now",
    "",
    `### This month (${overview.month})`,
    "",
    ...table(
      ["Quoted", "Invoiced", "Paid in", "Spent", "Target"],
      [
        [
          money(overview.quoted),
          money(overview.invoiced),
          money(overview.paid),
          money(overview.spent),
          overview.target === null ? "None set" : money(overview.target),
        ],
      ],
    ),
    "### Runway",
    "",
    runwayLine,
    "",
    ...(runway.cash === null
      ? []
      : [
          `- Running costs: ${money(runway.running)} a month.`,
          `- Other spending: ${money(runway.oneOff)} a month on average, over ${runway.basis} ${runway.basis === 1 ? "month" : "months"}.`,
          `- Paid in: ${money(runway.income)} a month on average.`,
          "",
        ]),
    "### Running costs",
    "",
    ...(costs.costs.length === 0
      ? ["*None written down.*", ""]
      : table(
          ["Cost", "What", "Paid", "Amount", "A month", "Next due"],
          costs.costs.map((cost) => [
            cost.title,
            templateOf(cost.template).name,
            cost.cycle ? COST_CYCLE_LABEL[cost.cycle] : "Not said",
            cost.amount === null ? "Not priced" : money(cost.amount),
            money(cost.monthly),
            cost.nextOn ?? "",
          ]),
        )),
    "## What we sell",
    "",
    ...(() => {
      const products = listProducts(db, companyId, exported);
      if (products.length === 0) return ["*No products in the catalogue yet.*", ""];
      const rows = table(
        ["Product", "Kind", "Where it is", "Price now", "Costs us", "Margin", "Invoiced so far"],
        products.map((product) => {
          const margin = marginOf(product.current?.amount ?? null, product.cost);
          return [
            product.name,
            `${PRODUCT_KIND_LABEL[product.kind]}${product.unit ? `, per ${product.unit}` : ""}`,
            PRODUCT_STATUS_LABEL[product.status],
            product.current
              ? `${money(product.current.amount)} ${describeRecurrence(product.current.recurrence)} (${product.current.name})`
              : "No price",
            product.cost === null ? "" : money(product.cost),
            margin ? `${margin.percent}%` : "",
            product.sales.invoices === 0 ? "Nothing" : `${money(product.sales.value)} on ${product.sales.invoices}`,
          ];
        }),
      );
      const books = products
        .filter((product) => product.prices.length > 1 || product.notes)
        .flatMap((product) => [
          `### ${product.name}`,
          "",
          ...product.prices.map(
            (price) =>
              `- ${price.name}: ${money(price.amount)} ${describeRecurrence(price.recurrence)}${
                price.validFrom || price.validTo
                  ? ` (${price.validFrom ? `from ${price.validFrom}` : ""}${price.validTo ? ` to ${price.validTo}` : ""})`
                  : ""
              }`,
          ),
          ...(product.prices.length > 0 ? [""] : []),
          ...(product.notes ? [shiftHeadings(product.notes, 3), ""] : []),
        ]);
      return [...rows, ...books];
    })(),
    "### Invoices not yet paid",
    "",
    ...(() => {
      const unpaid = overview.invoices.filter((invoice) => invoice.status === "sent");
      if (unpaid.length === 0) return ["*None.*", ""];
      return table(
        ["Invoice", "Contact", "Deal", "Issued", "Due", "Total", "Paid"],
        unpaid.map((invoice) => [
          documentNumber("invoice", invoice.number),
          invoice.leadName,
          invoice.dealTitle ?? "",
          invoice.issuedOn,
          `${invoice.dueOn}${invoice.dueOn < exported ? " (overdue)" : ""}`,
          money(invoice.total),
          money(invoice.paid),
        ]),
      );
    })(),
    "### Spending in the last three months",
    "",
    ...(() => {
      const since = new Date(now.getTime() - 92 * 86_400_000).toISOString().slice(0, 10);
      const recent = overview.spend.filter((entry) => entry.spentOn >= since);
      if (recent.length === 0) return ["*Nothing recorded.*", ""];
      return table(
        ["Date", "What", "Amount"],
        recent.map((entry) => [entry.spentOn, entry.what, money(entry.amount)]),
      );
    })(),
    ...sectionBlocks(pages, COMPANY_SECTIONS, options.secrets, names, { tax: taxExtra }),
  ];

  /* ---- 02 Customers and sales ---- */

  const lost = db
    .prepare(
      `SELECT loss_reason AS reason, COUNT(*) AS n FROM deals
        WHERE company_id = ? AND loss_reason IS NOT NULL
        GROUP BY loss_reason ORDER BY n DESC, loss_reason`,
    )
    .all(companyId) as { reason: string; n: number }[];

  const since30 = new Date(now.getTime() - 30 * 86_400_000).toISOString();
  const calls30 = db
    .prepare(`SELECT outcome, interest FROM calls WHERE company_id = ? AND created_at >= ?`)
    .all(companyId, since30) as { outcome: string; interest: number | null }[];
  const spoke = calls30.filter((call) => call.outcome === "spoke");
  const byInterest = new Map<number, number>();
  for (const call of spoke) {
    if (isInterest(call.interest)) byInterest.set(call.interest, (byInterest.get(call.interest) ?? 0) + 1);
  }

  const dealsByLead = new Map<string, DealRow[]>();
  for (const deal of deals) dealsByLead.set(deal.lead_id, [...(dealsByLead.get(deal.lead_id) ?? []), deal]);
  const tasksByLead = new Map<string, TaskRow[]>();
  for (const task of openTasks) {
    if (task.lead_id) tasksByLead.set(task.lead_id, [...(tasksByLead.get(task.lead_id) ?? []), task]);
  }
  const docsByLead = new Map<string, (Invoice | Quote)[]>();
  for (const doc of [...overview.invoices, ...overview.quotes]) {
    docsByLead.set(doc.leadId, [...(docsByLead.get(doc.leadId) ?? []), doc]);
  }

  const QUIET: readonly Activity["kind"][] = ["created", "imported", "import_undone"];
  const inPlay: string[] = [];
  const everyoneElse: string[][] = [];

  let leftOut = 0;
  for (const lead of leads) {
    if (options.contacts && !options.contacts.has(lead.id)) {
      leftOut += 1;
      continue;
    }
    const history = listActivities(db, lead.id).filter((entry) => !QUIET.includes(entry.kind));
    const meaningful = history.filter((entry) => entry.kind !== "field_change");
    const mine = dealsByLead.get(lead.id) ?? [];
    const tasks = tasksByLead.get(lead.id) ?? [];
    const docs = docsByLead.get(lead.id) ?? [];

    if (mine.length === 0 && tasks.length === 0 && docs.length === 0 && meaningful.length === 0 && !lead.notes) {
      everyoneElse.push([lead.name, RELATIONSHIP_LABEL[lead.relationship], lead.city ?? "", lead.contactPerson ?? ""]);
      continue;
    }

    const calls = listCalls(db, lead.id, 50);
    const facts = [
      ["Relationship", RELATIONSHIP_LABEL[lead.relationship]],
      ["Contact person", lead.contactPerson],
      ["Email", lead.email],
      ["Phone", [lead.phone, lead.altPhone].filter(Boolean).join(", ") || null],
      ["City", [lead.city, lead.location].filter(Boolean).join(", ") || null],
      ["Source", lead.source],
      ["Website", lead.website],
      ["Last spoke", lead.lastContactedAt?.slice(0, 10) ?? "Never"],
      ["Do not contact", lead.doNotContact ? "Yes" : null],
    ].filter((pair): pair is [string, string] => typeof pair[1] === "string" && pair[1].length > 0);

    inPlay.push(`### ${lead.name}`, "", ...facts.map(([label, value]) => `- **${label}:** ${value}`), "");
    if (lead.notes) inPlay.push("**Keep in mind:**", "", ...lead.notes.split("\n").map((line) => `> ${line}`), "");
    if (mine.length > 0) {
      inPlay.push("**Deals:**", "");
      for (const deal of mine) {
        inPlay.push(
          `- ${deal.title} - ${deal.stage_name ?? "no stage"}${deal.value !== null ? `, ${money(deal.value)}` : ""}${
            deal.loss_reason ? ` (lost because: ${deal.loss_reason})` : ""
          }`,
        );
      }
      inPlay.push("");
    }
    if (calls.length > 0) {
      const answered = calls.filter((call) => call.outcome === "spoke");
      const last = answered.find((call) => call.interest !== null);
      inPlay.push(
        `**Calls:** ${calls.length} from the prompter, ${answered.length} answered${
          last?.interest ? `; interest when last spoken to: ${INTEREST_LABEL[last.interest]} (${last.interest} of 5)` : ""
        }.`,
        "",
      );
    }
    if (docs.length > 0) {
      inPlay.push("**Money:**", "");
      for (const doc of docs) {
        const invoice = "dueOn" in doc;
        inPlay.push(
          `- ${documentNumber(invoice ? "invoice" : "quote", doc.number)}, ${doc.issuedOn}: ${money(doc.total)}, ${
            invoice ? INVOICE_STATUS_LABEL[(doc as Invoice).status] : QUOTE_STATUS_LABEL[(doc as Quote).status]
          }${doc.dealTitle && doc.dealTitle !== lead.name ? ` (${doc.dealTitle})` : ""}`,
        );
      }
      inPlay.push("");
    }
    if (tasks.length > 0) {
      inPlay.push("**Next steps:**", "", ...tasks.map((task) => `- ${task.due_on}: ${task.title} (${TASK_KIND_LABEL[task.kind]})`), "");
    }
    if (history.length > 0) {
      inPlay.push("**History, newest first:**", "");
      for (const entry of history.slice(0, HISTORY_PER_CONTACT)) {
        const body = (entry.body ?? "").trim();
        const [first, ...rest] = body.split("\n");
        inPlay.push(`- ${entry.occurredAt.slice(0, 10)} - ${ACTIVITY_LABEL[entry.kind]}${first ? `: ${first}` : ""}`);
        for (const line of rest) if (line.trim()) inPlay.push(`  ${line.trim()}`);
      }
      if (history.length > HISTORY_PER_CONTACT) inPlay.push(`- ...and ${history.length - HISTORY_PER_CONTACT} earlier entries.`);
      inPlay.push("");
    }
  }

  const sales: string[] = [
    `# ${company.name}: customers and sales`,
    "",
    `*Part of the ${company.name} dossier, exported ${exported}.*`,
    "",
    "## The funnel",
    "",
    ...table(
      ["Stage", "Deals", "Value"],
      board.columns.map((column) => [column.name, String(column.total), money(column.value)]),
    ),
    "## Why deals were lost",
    "",
    ...(lost.length === 0 ? ["*No reasons recorded.*", ""] : [...lost.map((row) => `- ${row.reason}: ${row.n}`), ""]),
    "## Calls in the last 30 days",
    "",
    ...(calls30.length === 0
      ? ["*No calls made from the prompter.*", ""]
      : [
          `- ${calls30.length} ${calls30.length === 1 ? "call" : "calls"}; ${spoke.length} answered (${Math.round((spoke.length / calls30.length) * 100)}%).`,
          `- How they went: ${CALL_OUTCOMES.map((outcome) => [outcome, calls30.filter((call) => call.outcome === outcome).length] as const)
            .filter(([, n]) => n > 0)
            .map(([outcome, n]) => `${OUTCOME_WORDS[outcome]} ${n}`)
            .join(", ")}.`,
          ...(byInterest.size > 0
            ? [
                `- Interest when answered: ${[...byInterest.entries()]
                  .sort((a, b) => b[0] - a[0])
                  .map(([level, n]) => `${INTEREST_LABEL[level as 1]} ${n}`)
                  .join(", ")}.`,
              ]
            : []),
          "",
        ]),
    "## Every deal",
    "",
    ...(deals.length === 0
      ? ["*No deals yet.*", ""]
      : table(
          ["Deal", "Contact", "Stage", "Value", "Lost because", "Last touched"],
          deals.map((deal) => [
            deal.title,
            deal.lead_name,
            deal.stage_name ?? "No stage",
            deal.value === null ? "" : money(deal.value),
            deal.loss_reason ?? "",
            deal.updated_at.slice(0, 10),
          ]),
        )),
    "## Contacts",
    "",
    `${leads.length} in all. The ones with something going on come first, each with what is known; the rest are listed after them.${
      leftOut > 0 ? ` ${leftOut} of them are left out of this copy to keep it short; the ones here are those that bear on the question.` : ""
    }`,
    "",
    ...inPlay,
    ...(everyoneElse.length > 0
      ? ["### Everyone else", "", ...table(["Name", "Relationship", "City", "Contact person"], everyoneElse)]
      : []),
    ...sectionBlocks(pages, SALES_SECTIONS, options.secrets, names),
  ];

  /* ---- 03 People and running the company ---- */

  const notes = listNotes(db, companyId, "", 500);
  const running: string[] = [
    `# ${company.name}: people and running the company`,
    "",
    `*Part of the ${company.name} dossier, exported ${exported}. ${masked}*`,
    "",
    ...sectionBlocks(pages, RUNNING_SECTIONS, options.secrets, names, {
      people: peopleExtra,
      metrics: metricsExtra,
      documents: documentsExtra,
    }),
    "## Open tasks",
    "",
    ...(openTasks.length === 0
      ? ["*Nothing open.*", ""]
      : table(
          ["Due", "Task", "Kind", "Contact"],
          openTasks.map((task) => [task.due_on, task.title, TASK_KIND_LABEL[task.kind], task.lead_name ?? ""]),
        )),
    "## Loose notes",
    "",
    ...(notes.length === 0
      ? ["*None.*", ""]
      : [...notes.map((note) => `- ${note.day}${note.isPinned ? " (pinned)" : ""}: ${plainLinks(note.body, names).replace(/\n/g, " ")}`), ""]),
  ];

  const stem = safeName(company.name);
  return [
    { file: `00 ${stem} - read me first.md`, title: "Read me first", text: readme.join("\n") },
    { file: `01 ${stem} - the company.md`, title: "The company", text: company1.join("\n") },
    { file: `02 ${stem} - customers and sales.md`, title: "Customers and sales", text: sales.join("\n") },
    { file: `03 ${stem} - people and running the company.md`, title: "People and running the company", text: running.join("\n") },
  ];
}

/** Writes the dossier into a folder, and says how many files. */
export function writeDossier(
  db: Db,
  companyId: string,
  folder: string,
  options: { secrets: boolean },
  now: Date = new Date(),
): number {
  const documents = buildDossier(db, companyId, options, now);
  mkdirSync(folder, { recursive: true });
  for (const document of documents) writeFileSync(join(folder, document.file), document.text, "utf8");
  return documents.length;
}

export function exportDossier(
  db: Db,
  companyId: string,
  companyName: string,
  parent: string,
  options: { secrets: boolean },
  now: Date = new Date(),
): BrainExport {
  const folder = join(parent, `${safeName(companyName)} dossier ${stamp(now)}`);
  return { folder, files: writeDossier(db, companyId, folder, options, now) };
}
