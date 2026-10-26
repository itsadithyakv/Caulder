import { randomUUID } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { shell } from "electron";
import { printToPdf } from "./print";
import type { Db } from "../db/connection";
import { findInvoice, findQuote } from "../repositories/money";
import { recordDocument } from "../repositories/documents";
import { attachmentsDir } from "./files";
import { type Invoice } from "@shared/domain";
import { invoiceHtml, money } from "./invoice-html";
import { invoiceIssuer } from "./brain";
import { localeFor } from "@shared/countries";
import { clientBilling, companyBilling, invoiceLook } from "../repositories/billing";
import { amountInWords } from "@shared/words";
import { INVOICE_INKS, invoiceFilePath, type InvoiceLook } from "@shared/invoicelook";

/**
 * An invoice as a file.
 *
 * One HTML template, printed to PDF by a window nobody sees, saved into the
 * attachment store and pinned to the contact - so the invoice you sent is on
 * the contact's page beside the proposal you sent, and both survive a tidied
 * Downloads folder. Then it is opened, because the next thing anybody does
 * with an invoice is send it.
 *
 * The page itself is in invoice-html.ts; how it looks, and the folder of the
 * person's own a copy goes into, is the company's (shared/invoicelook.ts).
 */
export async function writeInvoicePdf(db: Db, companyId: string, invoiceId: string): Promise<void> {
  const invoice = findInvoice(db, invoiceId);
  if (!invoice || invoice.companyId !== companyId) throw new Error("That invoice no longer exists.");
  if (invoice.status === "void") throw new Error("A void invoice is not worth a file.");
  const pdf = await printToPdf(invoiceHtmlFor(db, companyId, invoiceId));
  await keepInvoicePdf(db, companyId, invoice, pdf);
}

/** The invoice as a page of HTML, as it is printed: for its file, and for the accountant's pack. */
export function invoiceHtmlFor(db: Db, companyId: string, invoiceId: string): string {
  const invoice = findInvoice(db, invoiceId);
  if (!invoice || invoice.companyId !== companyId) throw new Error("That invoice no longer exists.");

  const company = db
    .prepare(`SELECT name, currency, country FROM companies WHERE id = ?`)
    .get(companyId) as { name: string; currency: string; country: string | null } | undefined;
  if (!company) throw new Error("That company no longer exists.");
  // Written the way money is where the company is: ₹1,85,000 in India, $185,000 in the US.
  const locale = localeFor(company.country);

  const lead = db
    .prepare(`SELECT name, contact_person, email, location, city FROM leads WHERE id = ?`)
    .get(invoice.leadId) as
    | { name: string; contact_person: string | null; email: string | null; location: string | null; city: string | null }
    | undefined;

  // The company's own rules (shared/taxrules.ts): what its documents are called and must say.
  const billing = companyBilling(db, companyId);
  const rules = billing.rules;
  const look = invoiceLook(db, companyId);
  const client = clientBilling(db, invoice.leadId);
  const charged = invoice.tax.length > 0;
  const composition = !charged && billing.composition && rules.composition !== null;
  // Why none is charged, when it is the company and not the client: a composition scheme, or not registered.
  const standing = charged || invoice.taxNote ? null : composition ? (rules.composition?.note ?? null) : billing.taxOn ? null : rules.exemptNote;
  const codes = new Map(
    (db.prepare(`SELECT id, code FROM products WHERE company_id = ?`).all(companyId) as { id: string; code: string | null }[]).map((row) => [row.id, row.code]),
  );
  return invoiceHtml({
    // "Tax invoice" where the law asks for the words, when tax is charged; a bill of supply on composition.
    title: charged ? rules.title : composition ? (rules.composition?.title ?? rules.plainTitle) : rules.plainTitle,
    toTax: client.taxNumber ? `${rules.numberLabel} ${client.taxNumber}` : null,
    subtotal: charged ? money(invoice.subtotal, company.currency, locale) : null,
    tax: invoice.tax.map((line) => ({ label: line.label, amount: money(line.amount, company.currency, locale) })),
    taxNote: invoice.taxNote ?? standing,
    ids: look.ids.map((each) => `${each.label} ${each.value}`),
    words: (look.words ?? company.country === "IN") ? amountInWords(invoice.total - invoice.paid, company.currency) : null,
    // The legal name, address, GSTIN and bank account come from the brain's
    // company profile, when it has them; the workspace name otherwise.
    from: invoiceIssuer(db, companyId, company.name),
    number: invoice.label,
    issuedOn: invoice.issuedOn,
    dueOn: invoice.dueOn,
    to: [lead?.name, lead?.contact_person, lead?.location, lead?.city, lead?.email].filter(
      (part): part is string => typeof part === "string" && part.length > 0,
    ),
    lines: invoice.lines.map((line) => ({
      description: line.description,
      quantity: line.quantity,
      unitPrice: money(line.unitPrice, company.currency, locale),
      total: money(Math.round(line.quantity * line.unitPrice), company.currency, locale),
      taxRate: charged && line.taxRate ? `${line.taxRate}%` : null,
      // India asks for the HSN or SAC code of what was sold; it is the product's code when it has one.
      code: company.country === "IN" && line.productId ? (codes.get(line.productId) ?? null) : null,
    })),
    total: money(invoice.total, company.currency, locale),
    paid: invoice.paid > 0 ? money(invoice.paid, company.currency, locale) : null,
    owed: money(invoice.total - invoice.paid, company.currency, locale),
    notes: invoice.notes,
    look: printedLook(companyId, invoiceLook(db, companyId)),
  });
}

/**
 * A quote as a file, in the company's look: its lines and tax as the invoice
 * would have them, valid until its day. Filed on the contact and opened, the
 * way an invoice is.
 */
export async function writeQuotePdf(db: Db, companyId: string, quoteId: string): Promise<void> {
  const quote = findQuote(db, quoteId);
  if (!quote || quote.companyId !== companyId) throw new Error("That quote no longer exists.");
  const pdf = await printToPdf(quoteHtmlFor(db, companyId, quoteId));
  const directory = attachmentsDir();
  await mkdir(directory, { recursive: true });
  const stored = `${randomUUID()}.pdf`;
  const path = join(directory, stored);
  await writeFile(path, pdf);
  const info = await stat(path);
  // Documents are kept by kind; a quote is not one of the kinds a document is checked against, so it is filed as other.
  recordDocument(db, companyId, { name: `${fileSafe(quote.label)}.pdf`, category: "other", leadId: quote.leadId }, { stored, bytes: info.size });
  void shell.openPath(path);
}

/** An invoice's or a quote's PDF, to go with an email (part fourteen): its file name and its bytes. */
export async function documentPdf(db: Db, companyId: string, attach: { kind: "invoice" | "quote"; id: string }): Promise<{ name: string; bytes: Buffer; leadId: string }> {
  if (attach.kind === "invoice") {
    const invoice = findInvoice(db, attach.id);
    if (!invoice || invoice.companyId !== companyId) throw new Error("That invoice no longer exists.");
    if (invoice.status === "void") throw new Error("A void invoice is not worth sending.");
    return { name: `${fileSafe(invoice.label)}.pdf`, bytes: await printToPdf(invoiceHtmlFor(db, companyId, invoice.id)), leadId: invoice.leadId };
  }
  const quote = findQuote(db, attach.id);
  if (!quote || quote.companyId !== companyId) throw new Error("That quote no longer exists.");
  return { name: `${fileSafe(quote.label)}.pdf`, bytes: await printToPdf(quoteHtmlFor(db, companyId, quote.id)), leadId: quote.leadId };
}

/** A quote as a page of HTML, in the company's look. */
function quoteHtmlFor(db: Db, companyId: string, quoteId: string): string {
  const quote = findQuote(db, quoteId);
  if (!quote || quote.companyId !== companyId) throw new Error("That quote no longer exists.");
  const company = db.prepare(`SELECT name, currency, country FROM companies WHERE id = ?`).get(companyId) as
    | { name: string; currency: string; country: string | null }
    | undefined;
  if (!company) throw new Error("That company no longer exists.");
  const locale = localeFor(company.country);
  const say = (value: number) => money(value, company.currency, locale);
  const billing = companyBilling(db, companyId);
  const look = invoiceLook(db, companyId);
  const lead = db.prepare(`SELECT name, contact_person, email, location, city FROM leads WHERE id = ?`).get(quote.leadId) as
    | { name: string; contact_person: string | null; email: string | null; location: string | null; city: string | null }
    | undefined;
  const client = clientBilling(db, quote.leadId);
  const charged = quote.tax.length > 0;
  return invoiceHtml({
    title: "Quote",
    from: invoiceIssuer(db, companyId, company.name),
    number: quote.label,
    issuedOn: quote.issuedOn,
    dueOn: quote.validUntil ?? "",
    dueLabel: "Valid until",
    owedLabel: "Quoted",
    to: [lead?.name, lead?.contact_person, lead?.location, lead?.city, lead?.email].filter((part): part is string => typeof part === "string" && part.length > 0),
    toTax: client.taxNumber ? `${billing.rules.numberLabel} ${client.taxNumber}` : null,
    lines: quote.lines.map((line) => ({
      description: line.description,
      quantity: line.quantity,
      unitPrice: say(line.unitPrice),
      total: say(Math.round(line.quantity * line.unitPrice)),
      taxRate: charged && line.taxRate ? `${line.taxRate}%` : null,
    })),
    subtotal: charged ? say(quote.subtotal) : null,
    tax: quote.tax.map((line) => ({ label: line.label, amount: say(line.amount) })),
    taxNote: quote.taxNote,
    ids: look.ids.map((each) => `${each.label} ${each.value}`),
    total: say(quote.total),
    paid: null,
    owed: say(quote.total),
    notes: quote.notes,
    look: printedLook(companyId, look),
  });
}

/** A number as a file's name: "PK/26-27/0042" is "PK-26-27-0042.pdf", since a slash is a folder. */
export function fileSafe(label: string): string {
  return label.replace(/[\\/]+/g, "-");
}

/** The company's logo for its invoices, kept beside the attachments under one name. */
export function invoiceLogoPath(companyId: string): string {
  return join(attachmentsDir(), `invoice-logo-${companyId}`);
}

/** A PNG or a JPEG, by its first bytes; null for anything else. */
export function imageType(bytes: Buffer): "png" | "jpeg" | null {
  if (bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "png";
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  return null;
}

/** The look as the page prints it: the ink as a colour, the logo read into the page. */
function printedLook(companyId: string, look: InvoiceLook) {
  let logo: string | null = null;
  if (look.logo) {
    try {
      const bytes = readFileSync(invoiceLogoPath(companyId));
      const type = imageType(bytes);
      logo = type ? `data:image/${type};base64,${bytes.toString("base64")}` : null;
    } catch {
      // Gone from the folder: the invoice is printed without it rather than not at all.
      logo = null;
    }
  }
  return { layout: look.layout, ink: INVOICE_INKS[look.ink].hex, logo, footer: look.footer };
}

/**
 * A made-up invoice in the company's own name and look, printed and opened:
 * what Settings shows when a layout or an ink is chosen.
 */
export async function writeInvoiceSample(db: Db, companyId: string, folder: string): Promise<string> {
  const company = db.prepare(`SELECT name, currency, country FROM companies WHERE id = ?`).get(companyId) as
    | { name: string; currency: string; country: string | null }
    | undefined;
  if (!company) throw new Error("That company no longer exists.");
  const locale = localeFor(company.country);
  const say = (value: number) => money(value, company.currency, locale);
  const html = invoiceHtml({
    from: invoiceIssuer(db, companyId, company.name),
    number: "INV-0000",
    issuedOn: "2026-10-01",
    dueOn: "2026-10-15",
    to: ["A client", "Their address"],
    lines: [
      { description: "Brand identity", quantity: 1, unitPrice: say(40000), total: say(40000) },
      { description: "Two days of design", quantity: 2, unitPrice: say(8000), total: say(16000) },
    ],
    total: say(56000),
    paid: null,
    owed: say(56000),
    notes: "A sample: nothing here is sent or kept.",
    look: printedLook(companyId, invoiceLook(db, companyId)),
  });
  const path = join(folder, `Caulder invoice sample ${companyId.slice(0, 8)}.pdf`);
  await writeFile(path, await printToPdf(html));
  void shell.openPath(path);
  return path;
}

/**
 * Writes the file, files it on the contact, and opens it - the copy in the
 * person's own folder, when they keep one (by year, month or client).
 */
async function keepInvoicePdf(db: Db, companyId: string, invoice: Invoice, pdf: Buffer): Promise<void> {
  const directory = attachmentsDir();
  await mkdir(directory, { recursive: true });
  const stored = `${randomUUID()}.pdf`;
  const path = join(directory, stored);
  await writeFile(path, pdf);
  const info = await stat(path);

  recordDocument(
    db,
    companyId,
    { name: `${fileSafe(invoice.label)}.pdf`, category: "invoice-sent", leadId: invoice.leadId },
    { stored, bytes: info.size },
  );

  const look = invoiceLook(db, companyId);
  if (!look.folder) {
    void shell.openPath(path);
    return;
  }
  const parts = invoiceFilePath(look, { number: fileSafe(invoice.label), issuedOn: invoice.issuedOn, client: invoice.leadName });
  const copy = join(look.folder, ...parts);
  try {
    await mkdir(join(look.folder, ...parts.slice(0, -1)), { recursive: true });
    await writeFile(copy, await readFile(path));
  } catch {
    void shell.openPath(path);
    throw new Error(`The invoice is on ${invoice.leadName ?? "the contact"}'s page, but its copy could not be written to ${look.folder}. The folder may have moved: choose it again in Settings.`);
  }
  void shell.openPath(copy);
}
