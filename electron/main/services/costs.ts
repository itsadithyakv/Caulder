import type { Db } from "../db/connection";
import {
  nextAfter,
  nextField,
  renewalsDue,
  runwayOf,
  type CostsOverview,
  type RunningCost,
} from "@shared/costs";
import { addMonths, dayOf, today as todayIn } from "@shared/dates";
import { addBalance, deleteBalance, listBalances, listCosts, monthTotals, recordCostPaid } from "../repositories/costs";
import { getPage, savePage } from "./brain";

/**
 * Running costs and runway, as Money and Today see them.
 */

function companyOf(db: Db, companyId: string): { timezone: string; currency: string; created_at: string } {
  const row = db
    .prepare(`SELECT timezone, currency, created_at FROM companies WHERE id = ?`)
    .get(companyId) as { timezone: string; currency: string; created_at: string } | undefined;
  if (!row) throw new Error("That company no longer exists.");
  return row;
}

/**
 * The months the averages are taken over: the last three whole months, but
 * none from before the company existed. A company started this month has
 * only this month so far, and that is what it is judged on.
 */
export function basisMonths(day: string, createdOn: string): string[] {
  const thisMonth = day.slice(0, 7);
  const first = createdOn.slice(0, 7);
  const months = [1, 2, 3]
    .map((back) => addMonths(`${thisMonth}-01`, -back).slice(0, 7))
    .filter((month) => month >= first)
    .reverse();
  return months.length > 0 ? months : [thisMonth];
}

export function buildCosts(db: Db, companyId: string, now: Date = new Date()): CostsOverview {
  const company = companyOf(db, companyId);
  const day = todayIn(company.timezone, now);
  const costs = listCosts(db, companyId);
  const balances = listBalances(db, companyId);
  const latest = balances[0] ?? null;
  const months = basisMonths(day, dayOf(company.created_at, company.timezone));
  const totals = monthTotals(db, companyId, months);
  const monthly = costs.reduce((sum, cost) => sum + cost.monthly, 0);

  return {
    currency: company.currency,
    day,
    costs,
    monthly,
    renewals: renewalsDue(costs, day),
    runway: runwayOf({
      cash: latest?.amount ?? null,
      cashOn: latest?.asOf ?? null,
      running: monthly,
      oneOffByMonth: totals.spent,
      incomeByMonth: totals.paid,
    }),
    balances,
  };
}

/** What renews soon, for Today. */
export function renewalsFor(db: Db, companyId: string, day: string) {
  return renewalsDue(listCosts(db, companyId), day);
}

/**
 * A running cost was paid: it goes on the spend list, marked as that cost so
 * the burn does not count it twice, and its date moves on a cycle. A one-off
 * loses its date, since there is nothing further to remind about. The page
 * keeps a version for the move, like any other edit.
 */
export function renewCost(db: Db, companyId: string, pageId: string, now: Date = new Date()): CostsOverview {
  const company = companyOf(db, companyId);
  const day = todayIn(company.timezone, now);
  const cost: RunningCost | undefined = listCosts(db, companyId).find((candidate) => candidate.pageId === pageId);
  if (!cost) throw new Error("That is not one of this company's running costs.");
  if (!cost.nextOn) throw new Error(`${cost.title} has no date to move on.`);
  const field = nextField(cost.template);
  if (!field) throw new Error(`${cost.title} has no date to move on.`);

  db.transaction(() => {
    if (cost.amount !== null && cost.amount > 0) {
      recordCostPaid(db, companyId, { pageId, title: cost.title, amount: cost.amount }, day, now);
    }
    const page = getPage(db, pageId);
    savePage(
      db,
      pageId,
      {
        title: page.title,
        body: page.body,
        fields: { ...page.fields, [field]: nextAfter(cost.nextOn as string, cost.cycle) },
        baseRevision: page.revision,
      },
      now,
    );
  })();

  return buildCosts(db, companyId, now);
}

export function recordBalance(db: Db, companyId: string, raw: unknown, now: Date = new Date()): CostsOverview {
  companyOf(db, companyId);
  addBalance(db, companyId, raw, now);
  return buildCosts(db, companyId, now);
}

export function forgetBalance(db: Db, companyId: string, id: string, now: Date = new Date()): CostsOverview {
  deleteBalance(db, companyId, id);
  return buildCosts(db, companyId, now);
}
