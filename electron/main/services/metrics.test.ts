import { beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { MIGRATIONS, migrate } from "../db/migrations";
import { createCompany, listStages } from "../repositories/companies";
import { createLead } from "../repositories/leads";
import { addPayment, addSpend, saveInvoice, setInvoiceStatus } from "../repositories/money";
import { createDeal } from "../repositories/deals";
import { logCall } from "../repositories/calls";
import { recordBalance } from "./costs";
import { addDerivedMetric, addMetric, buildMetrics, metricDetail, record, removeMetric, unrecord } from "./metrics";
import { brainHome } from "./brain";
import { leadInput, type Company } from "@shared/domain";

/**
 * Metrics: the derived ones read by month off the tables that hold them, the
 * written-down ones as readings, and the move from metric pages.
 */

let db: Database.Database;
let company: Company;
// 18 September 2026, late morning in Bengaluru.
const now = new Date("2026-09-18T06:00:00.000Z");

beforeEach(() => {
  db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrate(db);
  company = createCompany(db, { name: "Unifloe", accent: "blue", timezone: "Asia/Kolkata" });
});

const metric = (source: string) => buildMetrics(db, company.id, now).metrics.find((each) => each.source === source);

describe("derived metrics", () => {
  it("are money in, invoiced, spent and what was left, by month, with this month so far", () => {
    const school = createLead(db, company.id, leadInput.parse({ name: "Oakridge" }));
    const invoice = saveInvoice(db, company.id, null, {
      leadId: school.id,
      issuedOn: "2026-08-05",
      dueOn: "2026-08-20",
      notes: null,
      lines: [{ description: "Workshop", quantity: 2, unitPrice: 15000 }],
    });
    setInvoiceStatus(db, company.id, invoice.id, "sent");
    addPayment(db, company.id, invoice.id, { amount: 20000, paidOn: "2026-08-25", note: null });
    addPayment(db, company.id, invoice.id, { amount: 10000, paidOn: "2026-09-02", note: null });
    addSpend(db, company.id, { spentOn: "2026-09-03", amount: 4000, what: "Ads", campaignId: null });
    // A draft is not money.
    saveInvoice(db, company.id, null, {
      leadId: school.id,
      issuedOn: "2026-09-01",
      dueOn: "2026-09-20",
      notes: null,
      lines: [{ description: "Draft", quantity: 1, unitPrice: 99999 }],
    });

    for (const source of ["paid-in", "invoiced", "spent", "net"]) addDerivedMetric(db, company.id, source, now);

    expect(metric("paid-in")).toMatchObject({ flow: true, now: 10000, previous: 20000, kind: "money" });
    expect(metric("invoiced")).toMatchObject({ now: 0, previous: 30000 });
    expect(metric("spent")).toMatchObject({ now: 4000, previous: 0, direction: "down" });
    expect(metric("net")).toMatchObject({ now: 6000, previous: 20000 });
    const history = metric("paid-in")?.history ?? [];
    expect(history).toHaveLength(12);
    expect(history.slice(-2)).toEqual([
      { month: "2026-08", value: 20000 },
      { month: "2026-09", value: 10000 },
    ]);
    expect(history[0]).toEqual({ month: "2025-10", value: 0 });
  });

  it("count deals won, what they were worth, new contacts and calls", () => {
    const won = listStages(db, company.id).find((stage) => stage.kind === "won");
    const school = createLead(db, company.id, leadInput.parse({ name: "Oakridge" }));
    createDeal(db, school.id, { title: "Workshop", value: 50000, stageId: won?.id ?? null }, "2026-09-10T10:00:00.000Z");
    logCall(db, company.id, { leadId: school.id, outcome: "no_answer" }, now);
    logCall(db, company.id, { leadId: school.id, outcome: "spoke", interest: 4 }, now);

    for (const source of ["deals-won", "won-value", "calls"]) addDerivedMetric(db, company.id, source, now);
    expect(metric("deals-won")?.now).toBe(1);
    expect(metric("won-value")?.now).toBe(50000);
    expect(metric("calls")?.now).toBe(2);
  });

  it("read the bank balance as a level, carried from month to month until a new one", () => {
    recordBalance(db, company.id, { amount: 100000, asOf: "2026-06-30" }, now);
    recordBalance(db, company.id, { amount: 80000, asOf: "2026-08-31" }, now);
    addDerivedMetric(db, company.id, "cash", now);
    const cash = metric("cash");
    expect(cash).toMatchObject({ flow: false, now: 80000, nowOn: "2026-08-31", previous: 100000 });
    expect(cash?.history.slice(-4).map((point) => point.value)).toEqual([100000, 100000, 80000, 80000]);
    expect(cash?.history[0]?.value).toBeNull();
  });

  it("are each added once, and have nothing to write down", () => {
    const overview = addDerivedMetric(db, company.id, "paid-in", now);
    expect(overview.available.some((each) => each.source === "paid-in")).toBe(false);
    expect(() => addDerivedMetric(db, company.id, "paid-in", now)).toThrow("already on the list");
    expect(() => addDerivedMetric(db, company.id, "made-up", now)).toThrow();
    const id = overview.metrics[0]?.id ?? "";
    expect(() => record(db, id, { onDay: "2026-09-18", value: 5 }, now)).toThrow("worked out");
  });
});

describe("metrics written down", () => {
  it("are readings: the latest against the one before, a day's second replacing its first", () => {
    const made = addMetric(db, company.id, { name: "Schools signed", unitLabel: "schools", target: 20 }, now).metrics[0];
    const id = made?.id ?? "";
    record(db, id, { onDay: "2026-07-31", value: 4 }, now);
    record(db, id, { onDay: "2026-09-10", value: 6 }, now);
    const detail = record(db, id, { onDay: "2026-09-10", value: 7, note: "Greenwood signed" }, now);

    expect(detail.metric).toMatchObject({ now: 7, nowOn: "2026-09-10", previous: 4, unitLabel: "schools", target: 20 });
    expect(detail.values.map((value) => [value.onDay, value.value])).toEqual([
      ["2026-09-10", 7],
      ["2026-07-31", 4],
    ]);
    expect(detail.metric.history.slice(-3).map((point) => point.value)).toEqual([4, null, 7]);

    const after = unrecord(db, detail.values[0]?.id ?? "", now);
    expect(after.metric.now).toBe(4);
    expect(metricDetail(db, id, now).values).toHaveLength(1);
    expect(brainHome(db, company.id, now).counts.metrics).toBe(1);
    expect(removeMetric(db, id, now).metrics).toEqual([]);
  });
});

describe("migration 28", () => {
  it("turns metric pages into metrics, their number the first reading, and takes the pages away", () => {
    const old = new Database(":memory:");
    old.pragma("foreign_keys = ON");
    for (const migration of MIGRATIONS.filter((m) => m.version <= 27)) {
      old.exec(migration.sql);
      old.pragma(`user_version = ${migration.version}`);
    }
    const theirs = createCompany(old, { name: "Unifloe", accent: "blue", timezone: "Asia/Kolkata" });
    const at = "2026-04-01T00:00:00.000Z";
    const insert = old.prepare(
      `INSERT INTO brain_pages (id, company_id, section, template, title, body, fields, created_at, updated_at)
       VALUES (?, ?, 'metrics', 'metric', ?, ?, ?, ?, ?)`,
    );
    insert.run("m1", theirs.id, "Monthly revenue", "", JSON.stringify({ unit: "₹", current: 42000, asOf: "2026-08-31", target: 100000 }), at, at);
    insert.run("m2", theirs.id, "Churn", "Counted at month end.", JSON.stringify({ unit: "%", current: 3.5 }), at, at);
    insert.run("m3", theirs.id, "Schools", "## Why it matters\n\n\n## How it is counted\n\n", JSON.stringify({ unit: "schools" }), at, at);

    migrate(old);

    const rows = old
      .prepare(`SELECT id, name, kind, unit_label, target, notes FROM metrics WHERE company_id = ? ORDER BY name`)
      .all(theirs.id);
    expect(rows).toEqual([
      { id: "m2", name: "Churn", kind: "percent", unit_label: null, target: null, notes: "Counted at month end." },
      { id: "m1", name: "Monthly revenue", kind: "money", unit_label: null, target: 100000, notes: null },
      { id: "m3", name: "Schools", kind: "count", unit_label: "schools", target: null, notes: null },
    ]);
    const values = old.prepare(`SELECT metric_id, on_day, value FROM metric_values ORDER BY metric_id`).all();
    expect(values).toEqual([
      { metric_id: "m1", on_day: "2026-08-31", value: 42000 },
      { metric_id: "m2", on_day: "2026-04-01", value: 3.5 },
    ]);
    expect(old.prepare(`SELECT COUNT(*) AS n FROM brain_pages WHERE template = 'metric'`).get()).toEqual({ n: 0 });
  });
});
