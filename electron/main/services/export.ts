import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import ExcelJS from "exceljs";
import type { Db } from "../db/connection";
import { databasePath } from "../db/connection";
import type { ExportEverything } from "@shared/data";

/**
 * Getting everything out.
 *
 * This is a local app with no cloud behind it, so the honest answer to "what
 * if I stop using this" has to be a folder of files anybody can open. Both
 * halves are written: CSVs for reading, and a copy of the database for putting
 * back.
 */

/** One CSV per table, named after what it holds rather than after the table. */
const SHEETS: { file: string; sql: string }[] = [
  {
    file: "leads.csv",
    sql: `
      SELECT l.name AS "Name", l.contact_person AS "Contact Person",
             l.email AS "Email", l.phone AS "Phone", l.alt_phone AS "Alt Phone",
             l.city AS "City", l.location AS "Location", l.pin AS "PIN",
             l.source AS "Source", l.website AS "Website", l.value AS "Value",
             s.name AS "Stage", l.notes AS "Notes", c.name AS "Campaign",
             l.do_not_contact AS "Do Not Contact",
             l.last_contacted_at AS "Last Contacted", l.created_at AS "Added"
      FROM leads l
      LEFT JOIN pipeline_stages s ON s.id = l.stage_id
      LEFT JOIN campaigns c ON c.id = l.campaign_id
      WHERE l.company_id = ?
      ORDER BY l.name COLLATE NOCASE`,
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
             q.issued_on AS "Issued", ql.description AS "Line",
             ql.quantity AS "Quantity", ql.unit_price AS "Unit Price",
             ROUND(ql.quantity * ql.unit_price) AS "Amount", q.notes AS "Notes"
      FROM quotes q
      JOIN leads l ON l.id = q.lead_id
      LEFT JOIN quote_lines ql ON ql.quote_id = q.id
      WHERE q.company_id = ?
      ORDER BY q.number, ql.position`,
  },
  {
    file: "invoices.csv",
    sql: `
      SELECT i.number AS "Number", l.name AS "Contact", i.status AS "Status",
             i.issued_on AS "Issued", i.due_on AS "Due", i.paid_on AS "Paid On",
             il.description AS "Line", il.quantity AS "Quantity",
             il.unit_price AS "Unit Price",
             ROUND(il.quantity * il.unit_price) AS "Amount", i.notes AS "Notes"
      FROM invoices i
      JOIN leads l ON l.id = i.lead_id
      LEFT JOIN invoice_lines il ON il.invoice_id = i.id
      WHERE i.company_id = ?
      ORDER BY i.number, il.position`,
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
    const data = db.prepare(sheet.sql).all(companyId) as Record<string, unknown>[];
    const path = join(folder, sheet.file);
    writeFileSync(path, await toCsv(data), "utf8");
    files.push(sheet.file);
    rows += data.length;
  }

  // The whole thing, exactly as the app holds it.
  const copy = join(folder, "caulder.db");
  copyFileSync(databasePath(), copy);
  files.push("caulder.db");

  writeFileSync(join(folder, "README.txt"), readme(companyName, now), "utf8");
  files.push("README.txt");

  return { folder, files, rows };
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
  for (const row of rows) sheet.addRow(headers.map((key) => row[key] ?? ""));

  const buffer = await workbook.csv.writeBuffer();
  return buffer.toString();
}

function readme(companyName: string, now: Date): string {
  return [
    `Caulder export — ${companyName}`,
    `Taken ${now.toISOString()}`,
    "",
    "leads.csv      Every lead, with its stage.",
    "history.csv    Everything that has happened to them.",
    "tasks.csv      Follow-ups, done and outstanding.",
    "quotes.csv     Every quote, one row per line.",
    "invoices.csv   Every invoice, one row per line.",
    "payments.csv   What came in, against which invoice.",
    "spend.csv      What went out.",
    "templates.csv  The messages worth writing once.",
    "caulder.db     The database itself.",
    "",
    "The CSVs are for reading. caulder.db is the one to keep if you ever want",
    "the app back exactly as it was: copy it over the database Caulder uses,",
    "with Caulder closed. Settings shows where that lives.",
  ].join("\n");
}

/** Windows rejects these in a folder name, and a failed export is a bad answer. */
function safeName(value: string): string {
  return value.replace(/[<>:"/\\|?*]+/g, "-").trim() || "Caulder";
}

function stamp(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
    ` ${pad(now.getHours())}${pad(now.getMinutes())}`
  );
}
