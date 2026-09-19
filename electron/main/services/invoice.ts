import { randomUUID } from "node:crypto";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { shell } from "electron";
import { printToPdf } from "./print";
import type { Db } from "../db/connection";
import { findInvoice } from "../repositories/money";
import { recordDocument } from "../repositories/documents";
import { attachmentsDir } from "./files";
import { documentNumber } from "@shared/domain";
import { invoiceHtml, money } from "./invoice-html";
import { invoiceIssuer } from "./brain";

/**
 * An invoice as a file.
 *
 * One HTML template, printed to PDF by a window nobody sees, saved into the
 * attachment store and pinned to the contact - so the invoice you sent is on
 * the contact's page beside the proposal you sent, and both survive a tidied
 * Downloads folder. Then it is opened, because the next thing anybody does
 * with an invoice is send it.
 *
 * The page itself is in invoice-html.ts.
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

  const html = invoiceHtml({
    // The legal name, address, GSTIN and bank account come from the brain's
    // company profile, when it has them; the workspace name otherwise.
    from: invoiceIssuer(db, companyId, company.name),
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

  const pdf = await printToPdf(html);

  const directory = attachmentsDir();
  await mkdir(directory, { recursive: true });
  const stored = `${randomUUID()}.pdf`;
  const path = join(directory, stored);
  await writeFile(path, pdf);
  const info = await stat(path);

  recordDocument(
    db,
    companyId,
    { name: `${documentNumber("invoice", invoice.number)}.pdf`, category: "invoice-sent", leadId: invoice.leadId },
    { stored, bytes: info.size },
  );

  void shell.openPath(path);
}
