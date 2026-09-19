import { beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { MIGRATIONS, migrate } from "../db/migrations";
import { createCompany } from "../repositories/companies";
import { createLead } from "../repositories/leads";
import { addPayment, addSpend, buildMoney, saveInvoice, setInvoiceStatus } from "../repositories/money";
import { logCall } from "../repositories/calls";
import { getPage, newPage, savePage } from "./brain";
import { basisMonths, buildCosts, forgetBalance, recordBalance, renewCost } from "./costs";
import { buildToday } from "./today";
import { leadInput, type Company } from "@shared/domain";

/**
 * Running costs read off the brain, a renewal paid, and the runway worked out
 * from what the database holds.
 */

let db: Database.Database;
let company: Company;
const now = new Date("2026-09-17T06:00:00.000Z");

function costPage(template: "tool" | "domain" | "running-cost", title: string, fields: Record<string, string | number>) {
  const section = template === "running-cost" ? "money" : "tools";
  const page = newPage(db, company.id, section, template, now);
  return savePage(db, page.id, { title, body: "", fields, baseRevision: page.revision }, now);
}

beforeEach(() => {
  db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrate(db);
  company = createCompany(db, { name: "Unifloe", accent: "blue", timezone: "Asia/Kolkata" });
  // Old enough for three whole months to count.
  db.prepare(`UPDATE companies SET created_at = '2026-01-10T00:00:00.000Z' WHERE id = ?`).run(company.id);
});

describe("running costs", () => {
  it("are the tools, domains and running-cost pages, with a monthly total", () => {
    costPage("tool", "Hetzner server", { cost: 2000, cycle: "monthly", renewsOn: "2026-09-19" });
    costPage("domain", "unifloe.in", { cost: 1200, renewsOn: "2027-07-14" });
    costPage("running-cost", "Office rent", { amount: 45000, cycle: "quarterly", dueOn: "2026-10-01", category: "rent" });
    const archived = costPage("tool", "Old CRM", { cost: 5000, cycle: "monthly" });
    savePage(db, archived.id, { title: archived.title, body: "", fields: archived.fields, baseRevision: archived.revision }, now);
    db.prepare(`UPDATE brain_pages SET is_archived = 1 WHERE id = ?`).run(archived.id);

    const overview = buildCosts(db, company.id, now);
    expect(overview.costs.map((cost) => [cost.title, cost.monthly])).toEqual([
      ["Office rent", 15000],
      ["Hetzner server", 2000],
      ["unifloe.in", 100],
    ]);
    expect(overview.monthly).toBe(17100);
    expect(overview.renewals.map((renewal) => renewal.title)).toEqual(["Hetzner server", "Office rent"]);
    expect(buildToday(db, company.id, now).renewals.map((renewal) => renewal.title)).toEqual([
      "Hetzner server",
      "Office rent",
    ]);
  });

  it("move on a cycle when paid, and the payment is spend that the burn does not count twice", () => {
    const server = costPage("tool", "Hetzner server", { cost: 2000, cycle: "monthly", renewsOn: "2026-09-19" });
    const domain = costPage("domain", "unifloe.in", { cost: 1200, renewsOn: "2026-09-30" });

    const after = renewCost(db, company.id, server.id, now);
    expect(getPage(db, server.id).fields.renewsOn).toBe("2026-10-19");
    expect(after.renewals.map((renewal) => renewal.title)).toEqual(["unifloe.in"]);
    renewCost(db, company.id, domain.id, now);
    expect(getPage(db, domain.id).fields.renewsOn).toBe("2027-09-30");

    // On Money's spend list, as this month's spending...
    const money = buildMoney(db, company.id, now);
    expect(money.spend.map((entry) => [entry.what, entry.amount]).sort()).toEqual([
      ["Hetzner server", 2000],
      ["unifloe.in", 1200],
    ]);
    expect(money.spent).toBe(3200);
    // ...but not in the one-off average, which the running costs already cover.
    db.prepare(`UPDATE spend SET spent_on = '2026-08-19'`).run();
    expect(buildCosts(db, company.id, now).runway.oneOff).toBe(0);
    // And the page kept a version from before the move.
    const versions = db.prepare(`SELECT COUNT(*) AS n FROM brain_revisions WHERE page_id = ?`).get(server.id) as {
      n: number;
    };
    expect(versions.n).toBeGreaterThanOrEqual(1);
  });

  it("refuses to renew what has no date, or is not a cost of this company", () => {
    const undated = costPage("tool", "Figma", { cost: 1000, cycle: "monthly" });
    expect(() => renewCost(db, company.id, undated.id, now)).toThrow("no date to move on");
    const playbook = newPage(db, company.id, "playbooks", "playbook", now);
    expect(() => renewCost(db, company.id, playbook.id, now)).toThrow("not one of this company's running costs");
    const other = createCompany(db, { name: "PaperKite", accent: "teal", timezone: "Asia/Kolkata" });
    const theirs = newPage(db, other.id, "tools", "domain", now);
    expect(() => renewCost(db, company.id, theirs.id, now)).toThrow("not one of");
  });

  it("clears a one-off's date once it is paid", () => {
    const setup = costPage("running-cost", "Company registration", { amount: 8000, cycle: "once", dueOn: "2026-09-20" });
    renewCost(db, company.id, setup.id, now);
    expect(getPage(db, setup.id).fields.dueOn ?? null).toBeNull();
  });
});

describe("runway", () => {
  it("averages the last three whole months of spending and takings, from the latest balance", () => {
    costPage("tool", "Hetzner server", { cost: 20000, cycle: "monthly" });
    for (const [spentOn, amount] of [
      ["2026-06-10", 10000],
      ["2026-07-10", 20000],
      ["2026-08-10", 30000],
      ["2026-05-10", 999999], // too old to count
      ["2026-09-10", 999999], // this month, not whole yet
    ] as const) {
      addSpend(db, company.id, { spentOn, amount, what: "Ads", campaignId: null });
    }
    const school = createLead(db, company.id, leadInput.parse({ name: "Oakridge" }));
    const invoice = saveInvoice(db, company.id, null, {
      leadId: school.id,
      issuedOn: "2026-07-01",
      dueOn: "2026-07-15",
      notes: null,
      lines: [{ description: "Workshop", quantity: 1, unitPrice: 30000 }],
    });
    setInvoiceStatus(db, company.id, invoice.id, "sent");
    addPayment(db, company.id, invoice.id, { amount: 30000, paidOn: "2026-07-20", note: null });

    expect(buildCosts(db, company.id, now).runway).toMatchObject({ cash: null, months: null, burn: 30000, basis: 3 });

    recordBalance(db, company.id, { amount: 100000, asOf: "2026-08-01" }, now);
    const overview = recordBalance(db, company.id, { amount: 300000, asOf: "2026-09-15", note: "After the grant" }, now);
    expect(overview.runway).toMatchObject({
      cash: 300000,
      cashOn: "2026-09-15",
      running: 20000,
      oneOff: 20000,
      income: 10000,
      burn: 30000,
      months: 10,
      runsOutOn: "2027-07-15",
    });
    expect(overview.balances.map((balance) => balance.note)).toEqual(["After the grant", null]);

    const back = forgetBalance(db, company.id, overview.balances[0]!.id, now);
    expect(back.runway.cash).toBe(100000);
  });

  it("judges a young company on the months it has had", () => {
    expect(basisMonths("2026-09-17", "2026-01-10")).toEqual(["2026-06", "2026-07", "2026-08"]);
    expect(basisMonths("2026-09-17", "2026-08-02")).toEqual(["2026-08"]);
    expect(basisMonths("2026-09-17", "2026-09-01")).toEqual(["2026-09"]);
    expect(basisMonths("2026-01-05", "2025-01-01")).toEqual(["2025-10", "2025-11", "2025-12"]);
  });
});

describe("going quiet, and calls nobody answered", () => {
  it("does not count ringing as hearing from them", () => {
    const school = createLead(db, company.id, leadInput.parse({ name: "Oakridge" }));
    const old = "2026-08-01T00:00:00.000Z";
    db.prepare(`UPDATE leads SET created_at = ?, updated_at = ? WHERE id = ?`).run(old, old, school.id);
    db.prepare(`UPDATE activities SET occurred_at = ?`).run(old);

    logCall(db, company.id, { leadId: school.id, outcome: "no_answer" }, now);
    expect(buildToday(db, company.id, now).cold.map((lead) => lead.name)).toEqual(["Oakridge"]);

    logCall(db, company.id, { leadId: school.id, outcome: "spoke", interest: 3 }, now);
    expect(buildToday(db, company.id, now).cold).toEqual([]);
  });
});

describe("the runway migration", () => {
  it("adds balances and marks spend on a database from before it", () => {
    const old = new Database(":memory:");
    old.pragma("foreign_keys = ON");
    for (const migration of MIGRATIONS.filter((m) => m.version <= 23)) {
      old.exec(migration.sql);
      old.pragma(`user_version = ${migration.version}`);
    }
    migrate(old);
    const spend = (old.prepare(`PRAGMA table_info(spend)`).all() as { name: string }[]).map((c) => c.name);
    expect(spend).toContain("cost_page_id");
    const balances = (old.prepare(`PRAGMA table_info(cash_balances)`).all() as { name: string }[]).map((c) => c.name);
    expect(balances).toEqual(["id", "company_id", "amount", "as_of", "note", "created_at"]);
  });
});
