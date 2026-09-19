import { randomUUID } from "node:crypto";
import type { Db } from "../db/connection";
import { isSection, type FieldValue } from "@shared/brain";
import { COST_TEMPLATES, cashBalanceInput, costOf, type CashBalance, type RunningCost } from "@shared/costs";

/**
 * What running costs and runway read and write: the pages that are costs,
 * the balances typed in, and a month's spending and takings.
 */

type PageRow = { id: string; title: string; template: string; section: string; fields: string };

function plainFields(text: string): Record<string, FieldValue> {
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== "object" || parsed === null) return {};
    const out: Record<string, FieldValue> = {};
    for (const [key, value] of Object.entries(parsed)) {
      // A sealed secret is an object; nothing a cost reads is one.
      if (value === null || ["string", "number", "boolean"].includes(typeof value)) {
        out[key] = value as FieldValue;
      }
    }
    return out;
  } catch {
    return {};
  }
}

/** Every page in the company that describes something it pays for, cheapest last. */
export function listCosts(db: Db, companyId: string): RunningCost[] {
  const rows = db
    .prepare(
      `SELECT id, title, template, section, fields FROM brain_pages
        WHERE company_id = ? AND is_archived = 0
          AND template IN (${COST_TEMPLATES.map(() => "?").join(", ")})`,
    )
    .all(companyId, ...COST_TEMPLATES) as PageRow[];

  const costs: RunningCost[] = [];
  for (const row of rows) {
    if (!isSection(row.section)) continue;
    const cost = costOf({ ...row, section: row.section, fields: plainFields(row.fields) });
    if (cost) costs.push(cost);
  }
  return costs.sort((a, b) => b.monthly - a.monthly || a.title.localeCompare(b.title));
}

/* ---- Cash in the bank ---------------------------------------------------- */

type BalanceRow = { id: string; amount: number; as_of: string; note: string | null; created_at: string };

export function listBalances(db: Db, companyId: string, limit = 12): CashBalance[] {
  const rows = db
    .prepare(
      `SELECT id, amount, as_of, note, created_at FROM cash_balances
        WHERE company_id = ? ORDER BY as_of DESC, created_at DESC LIMIT ?`,
    )
    .all(companyId, limit) as BalanceRow[];
  return rows.map((row) => ({
    id: row.id,
    amount: row.amount,
    asOf: row.as_of,
    note: row.note,
    createdAt: row.created_at,
  }));
}

export function addBalance(db: Db, companyId: string, raw: unknown, now: Date = new Date()): CashBalance {
  const input = cashBalanceInput.parse(raw);
  const id = randomUUID();
  db.prepare(
    `INSERT INTO cash_balances (id, company_id, amount, as_of, note, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, companyId, input.amount, input.asOf, input.note, now.toISOString());
  return { id, amount: input.amount, asOf: input.asOf, note: input.note, createdAt: now.toISOString() };
}

export function deleteBalance(db: Db, companyId: string, id: string): void {
  db.prepare(`DELETE FROM cash_balances WHERE id = ? AND company_id = ?`).run(id, companyId);
}

/* ---- A month's money ------------------------------------------------------ */

/**
 * Spending and takings for each of the given months ("YYYY-MM"), in order.
 * Spending leaves out what paid a running cost, which the running costs
 * already count.
 */
export function monthTotals(
  db: Db,
  companyId: string,
  months: readonly string[],
): { spent: number[]; paid: number[] } {
  if (months.length === 0) return { spent: [], paid: [] };
  const from = `${[...months].sort()[0]}-01`;
  const spentRows = db
    .prepare(
      `SELECT substr(spent_on, 1, 7) AS month, SUM(amount) AS total FROM spend
        WHERE company_id = ? AND cost_page_id IS NULL AND spent_on >= ?
        GROUP BY month`,
    )
    .all(companyId, from) as { month: string; total: number }[];
  const paidRows = db
    .prepare(
      `SELECT substr(paid_on, 1, 7) AS month, SUM(amount) AS total FROM payments
        WHERE company_id = ? AND paid_on >= ?
        GROUP BY month`,
    )
    .all(companyId, from) as { month: string; total: number }[];

  const spent = new Map(spentRows.map((row) => [row.month, row.total]));
  const paid = new Map(paidRows.map((row) => [row.month, row.total]));
  return {
    spent: months.map((month) => spent.get(month) ?? 0),
    paid: months.map((month) => paid.get(month) ?? 0),
  };
}

/** Records a running cost being paid, pointing back at its page. */
export function recordCostPaid(
  db: Db,
  companyId: string,
  cost: { pageId: string; title: string; amount: number },
  day: string,
  now: Date,
): void {
  db.prepare(
    `INSERT INTO spend (id, company_id, spent_on, amount, what, campaign_id, cost_page_id, created_at)
     VALUES (?, ?, ?, ?, ?, NULL, ?, ?)`,
  ).run(randomUUID(), companyId, day, cost.amount, cost.title, cost.pageId, now.toISOString());
}
