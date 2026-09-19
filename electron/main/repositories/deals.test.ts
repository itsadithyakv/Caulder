import { beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { MIGRATIONS, migrate } from "../db/migrations";
import { createCompany, listStages } from "./companies";
import { createLead, findLead, listActivities, listLeads, updateLead } from "./leads";
import {
  createDeal,
  deleteDeal,
  listDeals,
  mainDeal,
  setDealLoss,
  setDealStage,
  updateDeal,
} from "./deals";
import { acceptQuote, findInvoice, saveInvoice, saveQuote } from "./money";
import { buildBoard } from "../services/pipeline";
import { buildToday } from "../services/today";
import { leadInput, type Company } from "@shared/domain";

/**
 * Deals apart from contacts: a contact with more than one, the one it is
 * summed up by, money that belongs to a deal, and the move from the old model.
 */

let db: Database.Database;
let company: Company;

const stage = (name: string) => {
  const found = listStages(db, company.id).find((s) => s.name === name);
  if (!found) throw new Error(`No stage called ${name}`);
  return found.id;
};

const lines = [{ description: "Workshop", quantity: 1, unitPrice: 15000 }];

beforeEach(() => {
  db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrate(db);
  company = createCompany(db, { name: "Unifloe", accent: "blue", timezone: "Asia/Kolkata" });
});

describe("a contact's deals", () => {
  it("starts a contact you sell to with one deal, named after it, and nobody else", () => {
    const school = createLead(db, company.id, leadInput.parse({ name: "Oakridge", value: 50000 }));
    const accountant = createLead(db, company.id, leadInput.parse({ name: "Sharma", relationship: "accountant" }));

    expect(listDeals(db, school.id)).toMatchObject([{ title: "Oakridge", value: 50000, stageId: stage("New") }]);
    expect(listDeals(db, accountant.id)).toEqual([]);
    expect(findLead(db, school.id)).toMatchObject({ dealCount: 1, value: 50000, stageId: stage("New") });
    expect(findLead(db, accountant.id)).toMatchObject({ dealCount: 0, value: null, stageId: null });
  });

  it("holds a second deal, and shows both on the board", () => {
    const school = createLead(db, company.id, leadInput.parse({ name: "Oakridge" }));
    createDeal(db, school.id, { title: "Oakridge: second campus", stageId: stage("Interested"), value: 90000 });

    const cards = buildBoard(db, company.id).columns.flatMap((column) =>
      column.cards.map((card) => `${column.name}:${card.title}:${card.name}`),
    );
    expect(cards.sort()).toEqual(["Interested:Oakridge: second campus:Oakridge", "New:Oakridge:Oakridge"]);
  });

  it("sums a contact up by its open deal touched last", () => {
    const school = createLead(db, company.id, leadInput.parse({ name: "Oakridge", value: 1000 }));
    const [first] = listDeals(db, school.id);
    const second = createDeal(db, school.id, { title: "Renewal", stageId: stage("Contacted"), value: 2000 });

    // The newer open deal wins...
    expect(mainDeal(db, school.id)?.id).toBe(second.id);
    // ...until it closes, when the one still open does.
    setDealStage(db, second.id, stage("Won"));
    expect(mainDeal(db, school.id)?.id).toBe(first?.id);
    expect(findLead(db, school.id)).toMatchObject({ value: 1000, dealCount: 2 });

    // With nothing open, the last one touched.
    setDealStage(db, first!.id, stage("Lost"));
    expect(mainDeal(db, school.id)?.id).toBe(first?.id);
  });

  it("filters and sorts the contact list by the main deal", () => {
    const small = createLead(db, company.id, leadInput.parse({ name: "Small", value: 10 }));
    createLead(db, company.id, leadInput.parse({ name: "Big", value: 500 }));
    createDeal(db, small.id, { title: "Small, again", stageId: stage("Interested"), value: 900 });

    const byValue = listLeads(db, { companyId: company.id, sort: "value", direction: "desc" });
    expect(byValue.map((lead) => lead.name)).toEqual(["Small", "Big"]);
    expect(listLeads(db, { companyId: company.id, stageId: stage("Interested") }).map((l) => l.name)).toEqual([
      "Small",
    ]);
  });

  it("records a move on the contact's history, naming the deal when there are two", () => {
    const school = createLead(db, company.id, leadInput.parse({ name: "Oakridge" }));
    const [first] = listDeals(db, school.id);
    setDealStage(db, first!.id, stage("Contacted"));
    const second = createDeal(db, school.id, { title: "Renewal", stageId: null, value: null });
    setDealStage(db, second.id, stage("Won"));

    const moves = listActivities(db, school.id)
      .filter((entry) => entry.kind === "stage_change")
      .map((entry) => entry.body);
    expect(moves).toEqual(["Renewal: Won", "Contacted"]);
    expect(findLead(db, school.id)?.relationship).toBe("customer");
    expect(listDeals(db, school.id).find((deal) => deal.id === second.id)?.closedAt).not.toBeNull();
  });

  it("keeps why a deal was lost on the deal, and says which deal on the history", () => {
    const school = createLead(db, company.id, leadInput.parse({ name: "Oakridge" }));
    const renewal = createDeal(db, school.id, { title: "Renewal", stageId: stage("Lost"), value: null });
    expect(setDealLoss(db, renewal.id, "Went with a cheaper tool").lossReason).toBe("Went with a cheaper tool");
    expect(listActivities(db, school.id)[0]?.body).toBe("Renewal lost because: Went with a cheaper tool");
  });

  it("refuses a stage from another company", () => {
    const other = createCompany(db, { name: "PaperKite", accent: "teal", timezone: "Asia/Kolkata" });
    const theirs = listStages(db, other.id)[0]!.id;
    const school = createLead(db, company.id, leadInput.parse({ name: "Oakridge" }));
    const [deal] = listDeals(db, school.id);
    expect(() => setDealStage(db, deal!.id, theirs)).toThrow("not in this company");
    expect(() => createDeal(db, school.id, { title: "x", stageId: theirs, value: null })).toThrow(
      "not in this company",
    );
  });

  it("goes quiet only while a deal is open", () => {
    const school = createLead(db, company.id, leadInput.parse({ name: "Oakridge" }));
    const old = new Date(Date.now() - 40 * 86_400_000).toISOString();
    db.prepare(`UPDATE leads SET created_at = ?, updated_at = ? WHERE id = ?`).run(old, old, school.id);
    db.prepare(`UPDATE activities SET occurred_at = ?`).run(old);
    expect(buildToday(db, company.id).cold.map((lead) => lead.name)).toEqual(["Oakridge"]);

    const [deal] = listDeals(db, school.id);
    setDealStage(db, deal!.id, stage("Won"), { followUp: false });
    db.prepare(`UPDATE activities SET occurred_at = ?`).run(old);
    expect(buildToday(db, company.id).cold).toEqual([]);
  });
});

describe("editing a contact", () => {
  it("moves its one deal, and renames a deal named after it", () => {
    const school = createLead(db, company.id, leadInput.parse({ name: "Oakridge" }));
    updateLead(db, school.id, leadInput.parse({ name: "Oakridge International", stageId: stage("Interested"), value: 7 }));
    expect(listDeals(db, school.id)).toMatchObject([
      { title: "Oakridge International", stageId: stage("Interested"), value: 7 },
    ]);
  });

  it("leaves several deals alone", () => {
    const school = createLead(db, company.id, leadInput.parse({ name: "Oakridge", value: 1 }));
    createDeal(db, school.id, { title: "Renewal", stageId: stage("Contacted"), value: 2 });
    updateLead(db, school.id, leadInput.parse({ name: "Oakridge", stageId: stage("Won"), value: 999 }));
    expect(listDeals(db, school.id).map((deal) => deal.value).sort()).toEqual([1, 2]);
  });

  it("starts a deal for a contact that becomes somebody you sell to", () => {
    const vendor = createLead(db, company.id, leadInput.parse({ name: "Printer", relationship: "vendor" }));
    updateLead(db, vendor.id, leadInput.parse({ name: "Printer", relationship: "prospect", stageId: stage("New") }));
    expect(listDeals(db, vendor.id)).toHaveLength(1);
  });
});

describe("money on a deal", () => {
  it("puts a quote on the main deal unless told which, and carries it to the invoice", () => {
    const school = createLead(db, company.id, leadInput.parse({ name: "Oakridge" }));
    const [main] = listDeals(db, school.id);
    const renewal = createDeal(db, school.id, { title: "Renewal", stageId: stage("Contacted"), value: null });

    const onMain = saveQuote(db, company.id, null, { leadId: school.id, dealId: main!.id, issuedOn: "2026-09-14", notes: null, lines });
    expect(onMain).toMatchObject({ dealId: main!.id, dealTitle: "Oakridge" });

    const byDefault = saveQuote(db, company.id, null, { leadId: school.id, issuedOn: "2026-09-14", notes: null, lines });
    expect(byDefault.dealId).toBe(renewal.id);

    const invoice = acceptQuote(db, company.id, byDefault.id);
    expect(findInvoice(db, invoice.id)?.dealTitle).toBe("Renewal");
    expect(listDeals(db, school.id).find((deal) => deal.id === renewal.id)?.value).toBe(15000);
  });

  it("keeps an edited quote on its deal, and moves it only when it changes hands", () => {
    const school = createLead(db, company.id, leadInput.parse({ name: "Oakridge" }));
    const [first] = listDeals(db, school.id);
    const quote = saveQuote(db, company.id, null, { leadId: school.id, issuedOn: "2026-09-14", notes: null, lines });
    // A newer deal becomes the main one; fixing the quote must not follow it.
    createDeal(db, school.id, { title: "Renewal", stageId: stage("Contacted"), value: null });
    const edited = saveQuote(db, company.id, quote.id, { leadId: school.id, issuedOn: "2026-09-15", notes: "typo", lines });
    expect(edited.dealId).toBe(first!.id);

    // Given to another contact, it goes on theirs.
    const other = createLead(db, company.id, leadInput.parse({ name: "Beacon" }));
    const moved = saveQuote(db, company.id, quote.id, { leadId: other.id, issuedOn: "2026-09-15", notes: null, lines });
    expect(moved).toMatchObject({ leadId: other.id, dealTitle: "Beacon" });
  });

  it("refuses a deal that is not the contact's, and keeps the invoice when the deal goes", () => {
    const one = createLead(db, company.id, leadInput.parse({ name: "One" }));
    const two = createLead(db, company.id, leadInput.parse({ name: "Two" }));
    const [theirs] = listDeals(db, two.id);
    expect(() =>
      saveInvoice(db, company.id, null, { leadId: one.id, dealId: theirs!.id, issuedOn: "2026-09-14", dueOn: "2026-09-20", notes: null, lines }),
    ).toThrow("not this contact's");

    const invoice = saveInvoice(db, company.id, null, { leadId: two.id, issuedOn: "2026-09-14", dueOn: "2026-09-20", notes: null, lines });
    deleteDeal(db, theirs!.id);
    expect(findInvoice(db, invoice.id)).toMatchObject({ dealId: null, leadId: two.id });
  });

  it("renames a deal without moving it", () => {
    const school = createLead(db, company.id, leadInput.parse({ name: "Oakridge" }));
    const [deal] = listDeals(db, school.id);
    const updated = updateDeal(db, deal!.id, { title: "Pilot", stageId: deal!.stageId, value: 5 });
    expect(updated).toMatchObject({ title: "Pilot", value: 5 });
    expect(listActivities(db, school.id).some((entry) => entry.kind === "stage_change")).toBe(false);
  });
});

describe("the move from one deal per contact", () => {
  it("gives every contact on the board its deal, with its money attached", () => {
    const old = new Database(":memory:");
    old.pragma("foreign_keys = ON");
    old.exec("BEGIN");
    for (const step of MIGRATIONS.filter((m) => m.version <= 21)) old.exec(step.sql);
    old.pragma("user_version = 21");
    old.exec("COMMIT");

    const at = "2026-01-01T00:00:00.000Z";
    old.prepare(`INSERT INTO companies (id, name, accent, timezone, created_at, updated_at) VALUES ('c', 'Old', 'blue', 'UTC', ?, ?)`).run(at, at);
    old.prepare(`INSERT INTO pipeline_stages (id, company_id, name, position, kind, created_at) VALUES ('won', 'c', 'Won', 0, 'won', ?)`).run(at);
    const lead = old.prepare(
      `INSERT INTO leads (id, company_id, name, stage_id, value, loss_reason, closed_at, relationship, tags, created_at, updated_at)
       VALUES (?, 'c', ?, ?, ?, NULL, ?, ?, '[]', ?, ?)`,
    );
    lead.run("school", "Oakridge", "won", 5000, at, "customer", at, at);
    lead.run("vendor", "Printer", null, null, null, "vendor", at, at);
    lead.run("paid-vendor", "Caterer", null, null, null, "vendor", at, at);
    old.prepare(`INSERT INTO invoices (id, company_id, lead_id, number, status, issued_on, due_on, created_at, updated_at)
                 VALUES ('inv', 'c', 'paid-vendor', 1, 'draft', '2026-01-01', '2026-01-02', ?, ?)`).run(at, at);

    migrate(old);

    const deals = old.prepare(`SELECT lead_id, title, stage_id, value, closed_at FROM deals ORDER BY title`).all();
    expect(deals).toEqual([
      { lead_id: "paid-vendor", title: "Caterer", stage_id: null, value: null, closed_at: null },
      { lead_id: "school", title: "Oakridge", stage_id: "won", value: 5000, closed_at: at },
    ]);
    const invoice = old.prepare(`SELECT deal_id FROM invoices WHERE id = 'inv'`).get() as { deal_id: string };
    expect(invoice.deal_id).toBe(
      (old.prepare(`SELECT id FROM deals WHERE lead_id = 'paid-vendor'`).get() as { id: string }).id,
    );
  });
});
