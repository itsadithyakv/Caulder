import { beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { migrate } from "../db/migrations";
import { createCompany } from "./companies";
import { createLead, deleteLead } from "./leads";
import { addFact, factsAbout, listAway, listFacts, removeFact } from "./facts";
import { completeTask } from "./tasks";
import { addPayment, findInvoice, paidFrom, saveInvoice, setInvoiceStatus } from "./money";
import { leadInput } from "@shared/domain";

/**
 * What stays true about a contact, and money in from one (PLAN.md, part
 * twelve, phase 49), read back out of a real database.
 */

let db: Database.Database;
let studio: string;
let maya: string;

beforeEach(() => {
  db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrate(db);
  studio = createCompany(db, { name: "Studio", accent: "coffee", timezone: "Asia/Kolkata" }).id;
  maya = createLead(db, studio, leadInput.parse({ name: "Harbour Coffee Roasters", contactPerson: "Maya Ellis" })).id;
});

const fact = (text: string, more: { until?: string | null; birthday?: string | null } = {}) =>
  addFact(db, studio, { leadId: maya, text, until: more.until ?? null, birthday: more.birthday ?? null });

describe("what stays true about a contact", () => {
  it("is kept on them, newest first", () => {
    fact("Maya prefers WhatsApp");
    const { facts } = fact("Address: 12 King St");
    expect(facts.map((each) => each.text)).toEqual(["Address: 12 King St", "Maya prefers WhatsApp"]);
    expect(listFacts(db, maya)).toHaveLength(2);
  });

  it("makes a birthday come back every year, once", () => {
    const { task } = fact("Birthday: 3 May", { birthday: "2027-05-03" });
    expect(task).toMatchObject({ title: "Maya's birthday", dueOn: "2027-05-03", repeats: "yearly", leadId: maya });
    expect(fact("Birthday is 3 May", { birthday: "2027-05-03" }).task).toBeNull();
    completeTask(db, task!.id);
    expect(db.prepare(`SELECT due_on FROM tasks WHERE status = 'open'`).all()).toEqual([{ due_on: "2028-05-03" }]);
  });

  it("replaces only their own birthday when it is said again", () => {
    fact("Maya's birthday is 3 May", { birthday: "2027-05-03" });
    fact("Wife's birthday is 2 March");
    fact("Hates birthday fuss");
    fact("Maya's birthday is 14 July", { birthday: "2027-07-14" });
    expect(listFacts(db, maya).map((each) => each.text).sort()).toEqual(["Hates birthday fuss", "Maya's birthday is 14 July", "Wife's birthday is 2 March"]);
  });

  it("says what is away until a day that has not come", () => {
    fact("Maya is on leave till the 20th", { until: "2026-10-20" });
    fact("Away last month", { until: "2026-09-01" });
    expect(listAway(db, studio, "2026-10-14")).toEqual([{ leadId: maya, text: "Maya is on leave till the 20th", until: "2026-10-20" }]);
  });

  it("is found by a question about it, by the contact's name too", () => {
    fact("Maya prefers WhatsApp over email");
    expect(factsAbout(db, studio, "maya prefers")).toEqual([{ label: "Maya prefers WhatsApp over email", detail: "Maya Ellis, Harbour Coffee Roasters" }]);
    expect(factsAbout(db, studio, "harbour whatsapp")).toHaveLength(1);
    expect(factsAbout(db, studio, "sam's address")).toEqual([]);
  });

  it("goes when removed, and with the contact", () => {
    const [first] = fact("One").facts;
    removeFact(db, first!.id);
    expect(listFacts(db, maya)).toEqual([]);
    fact("Two");
    deleteLead(db, maya);
    expect(db.prepare(`SELECT COUNT(*) AS n FROM lead_facts`).get()).toEqual({ n: 0 });
  });
});

describe("money in from a contact", () => {
  const invoice = (amount: number) => {
    const made = saveInvoice(db, studio, null, { leadId: maya, issuedOn: "2026-10-01", dueOn: "2026-10-26", notes: null, lines: [{ description: "Work", quantity: 1, unitPrice: amount }] });
    setInvoiceStatus(db, studio, made.id, "sent");
    return made;
  };

  it("marks the open invoice of that sum paid", () => {
    const small = invoice(1200);
    const big = invoice(2400);
    expect(paidFrom(db, studio, { leadId: maya, amount: 2400 }).say).toBe(`Marked INV-${String(big.number).padStart(4, "0")} paid`);
    expect(findInvoice(db, big.id)?.status).toBe("paid");
    expect(findInvoice(db, small.id)?.status).toBe("sent");
  });

  it("records a part against the only one open, and marks the only one paid when no sum is said", () => {
    const only = invoice(2400);
    expect(paidFrom(db, studio, { leadId: maya, amount: 1000 }).say).toMatch(/^Recorded against INV-\d{4}, with 1400 still owed$/);
    expect(paidFrom(db, studio, { leadId: maya, amount: null }).say).toMatch(/^Marked INV-\d{4} paid$/);
    expect(findInvoice(db, only.id)?.status).toBe("paid");
  });

  it("says so rather than guess which, or when nothing is waiting", () => {
    expect(() => paidFrom(db, studio, { leadId: maya, amount: 500 })).toThrow("Harbour Coffee Roasters has no invoice waiting to be paid.");
    invoice(1200);
    invoice(2400);
    expect(() => paidFrom(db, studio, { leadId: maya, amount: null })).toThrow(/has 2 invoices open/);
    expect(() => paidFrom(db, studio, { leadId: maya, amount: 999 })).toThrow(/None of Harbour Coffee Roasters's 2 open invoices/);
    void addPayment;
  });
});
