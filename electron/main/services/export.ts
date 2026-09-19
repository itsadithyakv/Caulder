import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import ExcelJS from "exceljs";
import type { Db } from "../db/connection";
import type { ExportEverything } from "@shared/data";
import { safeName, stamp } from "./names";
import { MAIN_DEAL } from "../repositories/main-deal";
import { CALL_OUTCOMES, CALL_OUTCOME_LABEL } from "@shared/calls";
import { writeBrain } from "./brain-export";
import { writeDossier } from "./dossier";
import { buildMetrics } from "./metrics";
import { METRIC_KIND_LABEL } from "@shared/metrics";
import {
  DOCUMENT_CATEGORY_LABEL,
  PERIOD_LABEL,
  dueRule,
  describeRule,
  isPeriodShape,
  periodOf,
  type DocumentCategory,
} from "@shared/deadlines";
import {
  CANDIDATE_STAGE_LABEL,
  OPENING_STATUS_LABEL,
  PERSON_KIND_LABEL,
  type CandidateStage,
  type OpeningStatus,
  type PersonKind,
} from "@shared/people";

/**
 * Getting everything out.
 *
 * This is a local app with no cloud behind it, so the honest answer to "what
 * if I stop using this" has to be a folder of files anybody can open. Both
 * halves are written: CSVs for reading, and a copy of the database for putting
 * back.
 */

/** A call's outcome in words, in SQL. The labels are this module's own constants. */
const OUTCOME_WORDS = `CASE c.outcome ${CALL_OUTCOMES.map(
  (outcome) => `WHEN '${outcome}' THEN '${CALL_OUTCOME_LABEL[outcome].replace(/'/g, "''")}'`,
).join(" ")} END`;

type Row = Record<string, unknown>;

/**
 * One CSV per table, named after what it holds rather than after the table.
 * `shape` puts into words what SQL cannot: a due-date rule stored as JSON, or
 * which period a filing was for.
 */
const SHEETS: { file: string; sql: string; shape?: (row: Row) => Row }[] = [
  {
    file: "leads.csv",
    sql: `
      SELECT l.name AS "Name", l.contact_person AS "Contact Person",
             l.email AS "Email", l.phone AS "Phone", l.alt_phone AS "Alt Phone",
             l.city AS "City", l.location AS "Location", l.pin AS "PIN",
             l.source AS "Source", l.website AS "Website", md.value AS "Value",
             s.name AS "Stage", l.notes AS "Notes", c.name AS "Campaign",
             l.relationship AS "Relationship", l.do_not_contact AS "Do Not Contact",
             l.last_contacted_at AS "Last Contacted", l.created_at AS "Added"
      FROM leads l
      LEFT JOIN deals md ON md.id = ${MAIN_DEAL("l.id")}
      LEFT JOIN pipeline_stages s ON s.id = md.stage_id
      LEFT JOIN campaigns c ON c.id = l.campaign_id
      WHERE l.company_id = ?
      ORDER BY l.name COLLATE NOCASE`,
  },
  {
    file: "deals.csv",
    sql: `
      SELECT l.name AS "Contact", d.title AS "Deal", s.name AS "Stage", d.value AS "Value",
             d.loss_reason AS "Lost Because", d.closed_at AS "Closed", d.created_at AS "Added"
      FROM deals d
      JOIN leads l ON l.id = d.lead_id
      LEFT JOIN pipeline_stages s ON s.id = d.stage_id
      WHERE d.company_id = ?
      ORDER BY l.name COLLATE NOCASE, d.created_at`,
  },
  {
    file: "history.csv",
    sql: `
      SELECT l.name AS "Lead", a.kind AS "What", a.body AS "Detail",
             a.occurred_at AS "When"
      FROM activities a
      JOIN leads l ON l.id = a.lead_id
      WHERE a.company_id = ?
      ORDER BY a.occurred_at DESC`,
  },
  {
    file: "calls.csv",
    sql: `
      SELECT l.name AS "Contact", d.title AS "Deal", ${OUTCOME_WORDS} AS "How it went",
             c.interest AS "Interest (1-5)", c.notes AS "Notes", c.answers AS "Answers",
             c.seconds AS "Seconds", p.title AS "Script", c.created_at AS "When"
      FROM calls c
      JOIN leads l ON l.id = c.lead_id
      LEFT JOIN deals d ON d.id = c.deal_id
      LEFT JOIN brain_pages p ON p.id = c.script_id
      WHERE c.company_id = ?
      ORDER BY c.created_at DESC`,
  },
  {
    file: "tasks.csv",
    sql: `
      SELECT t.title AS "Task", t.kind AS "Kind", t.status AS "Status",
             t.due_on AS "Due", l.name AS "Lead", t.completed_at AS "Completed"
      FROM tasks t
      LEFT JOIN leads l ON l.id = t.lead_id
      WHERE t.company_id = ?
      ORDER BY t.due_on DESC`,
  },
  {
    file: "quotes.csv",
    sql: `
      SELECT q.number AS "Number", l.name AS "Contact", q.status AS "Status",
             q.issued_on AS "Issued", ql.description AS "Line", qp.name AS "Product",
             ql.quantity AS "Quantity", ql.unit_price AS "Unit Price",
             ROUND(ql.quantity * ql.unit_price) AS "Amount", q.notes AS "Notes"
      FROM quotes q
      JOIN leads l ON l.id = q.lead_id
      LEFT JOIN quote_lines ql ON ql.quote_id = q.id
      LEFT JOIN products qp ON qp.id = ql.product_id
      WHERE q.company_id = ?
      ORDER BY q.number, ql.position`,
  },
  {
    file: "invoices.csv",
    sql: `
      SELECT i.number AS "Number", l.name AS "Contact", i.status AS "Status",
             i.issued_on AS "Issued", i.due_on AS "Due", i.paid_on AS "Paid On",
             il.description AS "Line", ip.name AS "Product", il.quantity AS "Quantity",
             il.unit_price AS "Unit Price",
             ROUND(il.quantity * il.unit_price) AS "Amount", i.notes AS "Notes"
      FROM invoices i
      JOIN leads l ON l.id = i.lead_id
      LEFT JOIN invoice_lines il ON il.invoice_id = i.id
      LEFT JOIN products ip ON ip.id = il.product_id
      WHERE i.company_id = ?
      ORDER BY i.number, il.position`,
  },
  {
    file: "products.csv",
    sql: `
      SELECT p.name AS "Product", p.kind AS "Kind", p.unit AS "Sold Per", p.status AS "Status",
             p.cost AS "Costs Us", p.tax_rate AS "Tax %", p.code AS "Tax code",
             r.name AS "Price", r.amount AS "Amount", r.recurrence AS "Charged",
             r.valid_from AS "From", r.valid_to AS "Until", p.notes AS "Notes"
      FROM products p
      LEFT JOIN prices r ON r.product_id = p.id
      WHERE p.company_id = ?
      ORDER BY p.name COLLATE NOCASE, r.valid_from`,
  },
  {
    file: "payments.csv",
    sql: `
      SELECT i.number AS "Invoice", l.name AS "Contact", p.amount AS "Amount",
             p.paid_on AS "Paid On", p.note AS "Note"
      FROM payments p
      JOIN invoices i ON i.id = p.invoice_id
      JOIN leads l ON l.id = i.lead_id
      WHERE p.company_id = ?
      ORDER BY p.paid_on DESC`,
  },
  {
    file: "spend.csv",
    sql: `
      SELECT s.spent_on AS "Date", s.what AS "What", s.amount AS "Amount",
             c.name AS "Campaign"
      FROM spend s
      LEFT JOIN campaigns c ON c.id = s.campaign_id
      WHERE s.company_id = ?
      ORDER BY s.spent_on DESC`,
  },
  {
    file: "cash.csv",
    sql: `
      SELECT as_of AS "On", amount AS "In the bank", note AS "Note"
      FROM cash_balances
      WHERE company_id = ?
      ORDER BY as_of DESC, created_at DESC`,
  },
  {
    file: "obligations.csv",
    sql: `
      SELECT title AS "Obligation", kind AS "Kind", rule AS "When", period AS "Each One Is For",
             remind_days AS "Days Notice", amount AS "Usually", starts_on AS "From", ends_on AS "Until",
             CASE is_active WHEN 1 THEN 'Yes' ELSE 'No' END AS "Still Needed", notes AS "Notes"
      FROM obligations
      WHERE company_id = ?
      ORDER BY is_active DESC, title COLLATE NOCASE`,
    shape: (row) => {
      const rule = dueRule.safeParse(parsed(row["When"]));
      const period = row["Each One Is For"];
      return {
        ...row,
        When: rule.success ? describeRule(rule.data) : row["When"],
        "Each One Is For": isPeriodShape(period) && period !== "none" ? PERIOD_LABEL[period] : "",
      };
    },
  },
  {
    file: "filings.csv",
    sql: `
      SELECT o.title AS "Obligation", d.due_on AS "Due", o.period AS "For", d.done_on AS "Done On",
             d.amount AS "Amount", d.note AS "Note"
      FROM obligation_done d
      JOIN obligations o ON o.id = d.obligation_id
      WHERE o.company_id = ?
      ORDER BY d.due_on DESC, o.title COLLATE NOCASE`,
    shape: (row) => {
      const period = row["For"];
      const due = row["Due"];
      return { ...row, For: isPeriodShape(period) && typeof due === "string" ? (periodOf(period, due) ?? "") : "" };
    },
  },
  {
    file: "documents.csv",
    sql: `
      SELECT d.name AS "Document", d.category AS "Kind",
             CASE WHEN d.file IS NULL THEN d.location ELSE 'Stored in Caulder' END AS "Where",
             d.bytes AS "Bytes", d.expires_on AS "Expires", l.name AS "Contact", p.title AS "Page",
             d.notes AS "Notes", substr(d.created_at, 1, 10) AS "Added"
      FROM documents d
      LEFT JOIN leads l ON l.id = d.lead_id
      LEFT JOIN brain_pages p ON p.id = d.page_id
      WHERE d.company_id = ?
      ORDER BY d.created_at DESC`,
    shape: (row) => ({
      ...row,
      Kind: DOCUMENT_CATEGORY_LABEL[row["Kind"] as DocumentCategory] ?? row["Kind"],
    }),
  },
  {
    file: "people.csv",
    sql: `
      SELECT p.name AS "Name", p.kind AS "Here As", p.role AS "Role", p.email AS "Email", p.phone AS "Phone",
             l.name AS "Contact", p.starts_on AS "From", p.ends_on AS "Until", p.pay AS "Pay", p.pay_per AS "Per",
             p.equity AS "Equity %", p.vesting_months AS "Vesting Months", p.cliff_months AS "Cliff Months",
             p.owns AS "What They Own", o.title AS "For The Role", p.stage AS "Stage", p.notes AS "Notes"
      FROM people p
      LEFT JOIN leads l ON l.id = p.lead_id
      LEFT JOIN openings o ON o.id = p.opening_id
      WHERE p.company_id = ?
      ORDER BY p.kind = 'candidate', p.name COLLATE NOCASE`,
    shape: (row) => ({
      ...row,
      "Here As": PERSON_KIND_LABEL[row["Here As"] as PersonKind] ?? row["Here As"],
      Stage: row["Stage"] ? (CANDIDATE_STAGE_LABEL[row["Stage"] as CandidateStage] ?? row["Stage"]) : "",
    }),
  },
  {
    file: "roles.csv",
    sql: `
      SELECT o.title AS "Role", o.status AS "Status", o.pay AS "Pay", o.notes AS "Notes",
             (SELECT COUNT(*) FROM people p WHERE p.opening_id = o.id) AS "Candidates"
      FROM openings o
      WHERE o.company_id = ?
      ORDER BY o.title COLLATE NOCASE`,
    shape: (row) => ({ ...row, Status: OPENING_STATUS_LABEL[row["Status"] as OpeningStatus] ?? row["Status"] }),
  },
  {
    file: "templates.csv",
    sql: `
      SELECT name AS "Name", channel AS "Goes out by", subject AS "Subject",
             body AS "Message"
      FROM email_templates WHERE company_id = ? ORDER BY name COLLATE NOCASE`,
  },
];

/**
 * Writes every CSV plus a copy of the database into a folder.
 *
 * The database copy is the part that matters if something goes wrong: CSVs
 * lose the links between records, and putting a spreadsheet back is not the
 * same as putting the app back.
 */
export async function exportEverything(
  db: Db,
  companyId: string,
  companyName: string,
  parent: string,
  now: Date = new Date(),
): Promise<ExportEverything> {
  const folder = join(parent, `${safeName(companyName)} export ${stamp(now)}`);
  mkdirSync(folder, { recursive: true });

  const files: string[] = [];
  let rows = 0;

  for (const sheet of SHEETS) {
    const read = db.prepare(sheet.sql).all(companyId) as Row[];
    const data = sheet.shape ? read.map(sheet.shape) : read;
    const path = join(folder, sheet.file);
    writeFileSync(path, await toCsv(data), "utf8");
    files.push(sheet.file);
    rows += data.length;
  }

  // Metrics are worked out, not stored, so their sheet is written from the
  // service: every metric, a row a month for the last year.
  const metrics = buildMetrics(db, companyId, now);
  const metricRows: Row[] = metrics.metrics.flatMap((metric) =>
    metric.history.map((point) => ({
      Metric: metric.name,
      "Measured As": METRIC_KIND_LABEL[metric.kind],
      How: metric.source === "manual" ? "Written down" : "Worked out",
      Month: point.month,
      Value: point.value ?? "",
      Target: metric.target ?? "",
    })),
  );
  writeFileSync(join(folder, "metrics.csv"), await toCsv(metricRows), "utf8");
  files.push("metrics.csv");
  rows += metricRows.length;

  // The whole thing, exactly as the app holds it.
  const copy = join(folder, "caulder.db");
  // SQLite's own online backup rather than a file copy: the newest commits
  // are still in the write-ahead log, and a copy of the main file alone would
  // leave them out.
  await db.backup(copy);
  files.push("caulder.db");

  // The brain, as Markdown. Numbers masked: this folder is the one that gets
  // handed to people.
  if (writeBrain(db, companyId, companyName, join(folder, "brain"), { secrets: false }, now) > 0) {
    files.push("brain");
  }

  // The same, as a few long documents for reading in one go.
  writeDossier(db, companyId, join(folder, "dossier"), { secrets: false }, now);
  files.push("dossier");

  writeFileSync(join(folder, "README.txt"), readme(companyName, now), "utf8");
  files.push("README.txt");

  return { folder, files, rows };
}

function parsed(value: unknown): unknown {
  try {
    return typeof value === "string" ? JSON.parse(value) : value;
  } catch {
    return null;
  }
}

/**
 * A cell a spreadsheet would run as a formula, made inert.
 *
 * Excel and Sheets treat a cell starting with `=`, `+`, `-` or `@` as a
 * formula, and a contact's notes are text somebody else may have written. So
 * such a cell is written with a leading apostrophe. A signed number or a phone
 * number - `+91 98450 98450`, `-500` - has no letters or brackets in it,
 * cannot call anything, and is left alone.
 */
export function csvCell(value: unknown): unknown {
  if (typeof value !== "string") return value;
  if (/^[=@\t\r]/.test(value)) return `'${value}`;
  if (/^[+-]/.test(value) && /[A-Za-z(|!]/.test(value)) return `'${value}`;
  return value;
}

/**
 * Builds a CSV through exceljs, the same writer the outbox uses.
 *
 * Notes and email bodies routinely contain commas, quotes and newlines, and
 * hand-rolled CSV gets those wrong in a way nobody notices until a spreadsheet
 * opens shifted by one column.
 */
async function toCsv(rows: Record<string, unknown>[]): Promise<string> {
  const workbook = new ExcelJS.Workbook();
  // A fixed name: a CSV has no sheet names, and exceljs reserves several -
  // "History" among them - so naming the sheet after the data crashed the
  // export rather than labelling anything.
  const sheet = workbook.addWorksheet("Data");

  const headers = rows[0] ? Object.keys(rows[0]) : [];
  if (headers.length > 0) sheet.addRow(headers);
  for (const row of rows) sheet.addRow(headers.map((key) => csvCell(row[key] ?? "")));

  const buffer = await workbook.csv.writeBuffer();
  return buffer.toString();
}

function readme(companyName: string, now: Date): string {
  return [
    `Caulder export — ${companyName}`,
    `Taken ${now.toISOString()}`,
    "",
    "leads.csv      Every contact, with its main deal's stage and value.",
    "deals.csv      Every deal, with its contact, stage and value.",
    "history.csv    Everything that has happened to them.",
    "calls.csv      Every call made from the prompter: how it went, how interested.",
    "tasks.csv      Follow-ups, done and outstanding.",
    "quotes.csv     Every quote, one row per line, with the product it was.",
    "invoices.csv   Every invoice, one row per line, with the product it was.",
    "products.csv   What the company sells, one row per price.",
    "payments.csv   What came in, against which invoice.",
    "spend.csv      What went out, including running costs paid.",
    "cash.csv       What was in the bank, and when.",
    "obligations.csv  What the company files and pays, and when.",
    "filings.csv    Each one done: which, for what period, and when.",
    "documents.csv  Every document, stored here or written down with where it is.",
    "people.csv     The team, with pay, equity and vesting, and the candidates.",
    "roles.csv      The roles being hired for.",
    "metrics.csv    Every metric, a row a month for the last year.",
    "templates.csv  The messages worth writing once.",
    "brain/         The company brain, one Markdown file per page -",
    "               call scripts and running costs among them.",
    "               Registration and account numbers are masked.",
    "dossier/       All of it as four long documents, to read in one go or to",
    "               give an AI assistant. Numbers masked.",
    "caulder.db     The database itself.",
    "",
    "The CSVs are for reading. caulder.db is the one to keep if you ever want",
    "the app back exactly as it was: copy it over the database Caulder uses,",
    "with Caulder closed. Settings shows where that lives.",
  ].join("\n");
}
