import { randomUUID } from "node:crypto";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { BrowserWindow, shell } from "electron";
import type { Db } from "../db/connection";
import { findInvoice } from "../repositories/money";
import { recordAttachment } from "../repositories/workbench";
import { attachmentsDir } from "./files";
import { documentNumber } from "@shared/domain";

/**
 * An invoice as a file.
 *
 * One HTML template, printed to PDF by a window nobody sees, saved into the
 * attachment store and pinned to the contact - so the invoice you sent is on
 * the contact's page beside the proposal you sent, and both survive a tidied
 * Downloads folder. Then it is opened, because the next thing anybody does
 * with an invoice is send it.
 *
 * No template engine: the document is a table and an address, and a string
 * with the values escaped in is the whole of it.
 */
export async function writeInvoicePdf(db: Db, companyId: string, invoiceId: string): Promise<void> {
  const invoice = findInvoice(db, invoiceId);
  if (!invoice || invoice.companyId !== companyId) throw new Error("That invoice no longer exists.");
  if (invoice.status === "void") throw new Error("A void invoice is not worth a file.");

  const company = db
    .prepare(`SELECT name, currency FROM companies WHERE id = ?`)
    .get(companyId) as { name: string; currency: string } | undefined;
  if (!company) throw new Error("That company no longer exists.");

  const lead = db
    .prepare(`SELECT name, contact_person, email, location, city FROM leads WHERE id = ?`)
    .get(invoice.leadId) as
    | { name: string; contact_person: string | null; email: string | null; location: string | null; city: string | null }
    | undefined;

  const html = render({
    company: company.name,
    number: documentNumber("invoice", invoice.number),
    issuedOn: invoice.issuedOn,
    dueOn: invoice.dueOn,
    to: [lead?.name, lead?.contact_person, lead?.location, lead?.city, lead?.email].filter(
      (part): part is string => typeof part === "string" && part.length > 0,
    ),
    lines: invoice.lines.map((line) => ({
      description: line.description,
      quantity: line.quantity,
      unitPrice: money(line.unitPrice, company.currency),
      total: money(Math.round(line.quantity * line.unitPrice), company.currency),
    })),
    total: money(invoice.total, company.currency),
    paid: invoice.paid > 0 ? money(invoice.paid, company.currency) : null,
    owed: money(invoice.total - invoice.paid, company.currency),
    notes: invoice.notes,
  });

  const window = new BrowserWindow({
    show: false,
    webPreferences: { sandbox: true, contextIsolation: true },
  });
  let pdf: Buffer;
  try {
    await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    pdf = await window.webContents.printToPDF({ pageSize: "A4", printBackground: true });
  } finally {
    window.destroy();
  }

  const directory = attachmentsDir();
  await mkdir(directory, { recursive: true });
  const stored = `${randomUUID()}.pdf`;
  const path = join(directory, stored);
  await writeFile(path, pdf);
  const info = await stat(path);

  recordAttachment(db, companyId, invoice.leadId, {
    name: `${documentNumber("invoice", invoice.number)}.pdf`,
    stored,
    bytes: info.size,
  });

  void shell.openPath(path);
}

function money(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
  } catch {
    return `${currency} ${value.toLocaleString()}`;
  }
}

function escape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function render(doc: {
  company: string;
  number: string;
  issuedOn: string;
  dueOn: string;
  to: string[];
  lines: { description: string; quantity: number; unitPrice: string; total: string }[];
  total: string;
  paid: string | null;
  owed: string;
  notes: string | null;
}): string {
  const rows = doc.lines
    .map(
      (line) => `<tr>
        <td>${escape(line.description)}</td>
        <td class="n">${line.quantity}</td>
        <td class="n">${escape(line.unitPrice)}</td>
        <td class="n">${escape(line.total)}</td>
      </tr>`,
    )
    .join("");

  return `<!doctype html><html><head><meta charset="utf-8"><title>${escape(doc.number)}</title>
<style>
  body { font: 13px/1.5 -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; color: #1a1f2b; margin: 48px; }
  h1 { font-size: 28px; margin: 0 0 4px; letter-spacing: 0.02em; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; }
  .meta { text-align: right; color: #555; }
  .meta strong { color: #1a1f2b; }
  .to { margin-bottom: 32px; }
  .to h2 { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #777; margin: 0 0 6px; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #777; padding: 8px 6px; border-bottom: 1px solid #ccd; }
  td { padding: 10px 6px; border-bottom: 1px solid #e6e8ee; vertical-align: top; }
  .n { text-align: right; white-space: nowrap; }
  .totals { margin-top: 16px; margin-left: auto; width: 320px; }
  .totals td { border: none; padding: 4px 6px; }
  .totals .owed td { font-size: 18px; font-weight: 700; border-top: 2px solid #1a1f2b; padding-top: 10px; }
  .notes { margin-top: 40px; color: #555; white-space: pre-wrap; }
</style></head><body>
  <div class="head">
    <div><h1>Invoice</h1><div>${escape(doc.company)}</div></div>
    <div class="meta">
      <div><strong>${escape(doc.number)}</strong></div>
      <div>Issued ${escape(doc.issuedOn)}</div>
      <div>Due ${escape(doc.dueOn)}</div>
    </div>
  </div>
  <div class="to"><h2>To</h2>${doc.to.map((line) => `<div>${escape(line)}</div>`).join("")}</div>
  <table>
    <thead><tr><th>Description</th><th class="n">Qty</th><th class="n">Unit price</th><th class="n">Amount</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <table class="totals">
    <tr><td>Total</td><td class="n">${escape(doc.total)}</td></tr>
    ${doc.paid ? `<tr><td>Paid</td><td class="n">${escape(doc.paid)}</td></tr>` : ""}
    <tr class="owed"><td>Amount due</td><td class="n">${escape(doc.owed)}</td></tr>
  </table>
  ${doc.notes ? `<div class="notes">${escape(doc.notes)}</div>` : ""}
</body></html>`;
}
