import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import ExcelJS from "exceljs";
import type { Db } from "../db/connection";
import { INVOICE_STATUS_LABEL } from "@shared/domain";
import { periodDays, type AccountantPeriod, type AccountantPack } from "@shared/accountant";
import { listInvoices } from "../repositories/money";
import { clientBilling, companyBilling } from "../repositories/billing";
import { fileSafe, invoiceHtmlFor } from "./invoice";
import { printToPdf } from "./print";

/**
 * The accountant's pack (PLAN.md, part thirteen, phase 56): a quarter or a
 * year in one folder - a spreadsheet of the invoices with their tax, the
 * payments, the spend and the tax charged, and every invoice as the PDF that
 * was sent. Export everything is the whole company; this is what an
 * accountant asks for at the end of a period. A year is the country's
 * financial year (`periodDays`).
 */

const safe = (name: string) => name.replace(/[<>:"/\\|?*]+/g, "").trim() || "Caulder";

export async function writeAccountantPack(db: Db, companyId: string, period: AccountantPeriod, day: string, parent: string): Promise<AccountantPack> {
  const company = db.prepare(`SELECT name, currency, country FROM companies WHERE id = ?`).get(companyId) as
    | { name: string; currency: string; country: string | null }
    | undefined;
  if (!company) throw new Error("That company no longer exists.");
  // The company's own rules: when its year starts, what its tax and number are called.
  const system = companyBilling(db, companyId).rules;
  const { from, to, label } = periodDays(period, day, system.yearStarts);
  const within = (date: string) => date >= from && date <= to;

  const invoices = listInvoices(db, companyId)
    .filter((invoice) => invoice.status !== "draft" && invoice.status !== "void" && within(invoice.issuedOn))
    .sort((a, b) => a.number - b.number);
  const allInvoices = listInvoices(db, companyId);
  const payments = allInvoices.flatMap((invoice) =>
    invoice.payments.filter((payment) => within(payment.paidOn)).map((payment) => ({ ...payment, label: invoice.label, client: invoice.leadName })),
  );
  const spend = db
    .prepare(`SELECT spent_on, what, amount FROM spend WHERE company_id = ? AND spent_on BETWEEN ? AND ? ORDER BY spent_on`)
    .all(companyId, from, to) as { spent_on: string; what: string; amount: number }[];

  // Every component and rate charged in the period, as its own column.
  const labels = [...new Set(invoices.flatMap((invoice) => invoice.tax.map((line) => line.label)))];
  const taxTotals = new Map<string, number>();

  const book = new ExcelJS.Workbook();
  book.creator = "Caulder";
  const sheet = book.addWorksheet("Invoices");
  sheet.addRow(["Number", "Client", `Client ${system.numberLabel}`, "Issued", "Due", "Status", "Before tax", ...labels, "Total", "Paid", "Note"]);
  for (const invoice of invoices) {
    const client = clientBilling(db, invoice.leadId);
    const byLabel = new Map(invoice.tax.map((line) => [line.label, line.amount]));
    for (const line of invoice.tax) taxTotals.set(line.label, (taxTotals.get(line.label) ?? 0) + line.amount);
    sheet.addRow([
      invoice.label,
      invoice.leadName,
      client.taxNumber ?? "",
      invoice.issuedOn,
      invoice.dueOn,
      INVOICE_STATUS_LABEL[invoice.status],
      invoice.subtotal,
      ...labels.map((each) => byLabel.get(each) ?? 0),
      invoice.total,
      invoice.paid,
      invoice.taxNote ?? "",
    ]);
  }

  const paid = book.addWorksheet("Payments");
  const withheldName = system.withholding?.name ?? "Tax withheld";
  paid.addRow(["Paid on", "Invoice", "Client", "Received", withheldName, "Note"]);
  for (const payment of payments) paid.addRow([payment.paidOn, payment.label, payment.client, payment.amount, payment.withheld, payment.note ?? ""]);

  const spent = book.addWorksheet("Spend");
  spent.addRow(["Spent on", "What", "Amount"]);
  for (const row of spend) spent.addRow([row.spent_on, row.what, row.amount]);

  const tax = book.addWorksheet("Tax");
  tax.addRow(["Tax", "Charged"]);
  for (const [each, amount] of taxTotals) tax.addRow([each, amount]);

  const summary = book.addWorksheet("Summary");
  const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
  summary.addRows([
    ["Company", company.name],
    ["Period", `${from} to ${to}`],
    ["Currency", company.currency],
    ["Invoiced, before tax", sum(invoices.map((invoice) => invoice.subtotal))],
    [`${system.name} charged`, sum([...taxTotals.values()])],
    ["Invoiced, with tax", sum(invoices.map((invoice) => invoice.total))],
    ["Paid in", sum(payments.map((payment) => payment.amount))],
    // Withheld by clients and paid in the company's name: claimed back against its own tax.
    [`${withheldName} withheld by clients`, sum(payments.map((payment) => payment.withheld))],
    ["Spent", sum(spend.map((row) => row.amount))],
  ]);
  for (const each of [sheet, paid, spent, tax, summary]) {
    each.getRow(1).font = { bold: true };
    each.columns.forEach((column) => {
      column.width = 18;
    });
  }

  const folder = join(parent, `${safe(company.name)} accounts ${label}`);
  mkdirSync(join(folder, "Invoices"), { recursive: true });
  writeFileSync(join(folder, "accounts.xlsx"), Buffer.from(await book.xlsx.writeBuffer()));
  for (const invoice of invoices) {
    const pdf = await printToPdf(invoiceHtmlFor(db, companyId, invoice.id));
    writeFileSync(join(folder, "Invoices", `${fileSafe(invoice.label)}.pdf`), pdf);
  }
  return { folder, invoices: invoices.length, label };
}
