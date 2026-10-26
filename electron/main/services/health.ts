import type { Db } from "../db/connection";
import { today as todayIn } from "@shared/dates";
import { healthOf, type Health } from "@shared/health";
import { listInvoices } from "../repositories/money";
import { companyBilling } from "../repositories/billing";
import { listObligations } from "../repositories/obligations";

/**
 * How the company is doing with money (part fourteen; shared/health.ts),
 * read from what Money and Deadlines already hold. Money in is what came in,
 * not what was withheld; spend is the spend list, running costs paid on it.
 */
export function buildHealth(db: Db, companyId: string, now: Date = new Date()): Health {
  const company = db.prepare(`SELECT timezone FROM companies WHERE id = ?`).get(companyId) as { timezone: string } | undefined;
  if (!company) throw new Error("That company no longer exists.");
  const day = todayIn(company.timezone, now);
  const byMonth = (sql: string) =>
    new Map((db.prepare(sql).all(companyId) as { month: string; total: number }[]).map((row) => [row.month, row.total]));
  const billing = companyBilling(db, companyId);
  const invoices = listInvoices(db, companyId)
    .filter((invoice) => invoice.status === "sent" || invoice.status === "paid")
    .map((invoice) => ({ issuedOn: invoice.issuedOn, subtotal: invoice.subtotal, tax: invoice.tax.reduce((sum, line) => sum + line.amount, 0) }));
  return healthOf({
    day,
    yearStarts: billing.rules.yearStarts,
    paidByMonth: byMonth(`SELECT substr(paid_on, 1, 7) AS month, SUM(amount) AS total FROM payments WHERE company_id = ? GROUP BY month`),
    spentByMonth: byMonth(`SELECT substr(spent_on, 1, 7) AS month, SUM(amount) AS total FROM spend WHERE company_id = ? GROUP BY month`),
    invoices,
    withheld: db.prepare(`SELECT paid_on AS paidOn, withheld AS amount FROM payments WHERE company_id = ? AND withheld > 0`).all(companyId) as {
      paidOn: string;
      amount: number;
    }[],
    // On composition a business is registered: the line it must not cross is another, and its own to watch.
    registered: billing.taxOn || billing.composition,
    thresholdAmount: billing.rules.thresholdAmount,
    threshold: billing.rules.threshold,
    withheldName: billing.rules.withholding?.name ?? null,
    filings: listObligations(db, companyId, day)
      .filter((obligation) => obligation.active && obligation.kind === "filing")
      .map((obligation) => ({ title: obligation.title, dueOn: obligation.nextDue })),
  });
}
