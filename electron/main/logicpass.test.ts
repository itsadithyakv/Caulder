import { beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { migrate } from "./db/migrations";
import { createCompany } from "./repositories/companies";
import { createLead } from "./repositories/leads";
import { completeTask, createTask, reopenTask } from "./repositories/tasks";
import { addFact } from "./repositories/facts";
import { findInvoice, paidFrom, saveInvoice, setInvoiceStatus } from "./repositories/money";
import { createObligation, markDone, updateObligation } from "./repositories/obligations";
import { dueSoon } from "./services/deadlines";
import { leadInput, type Company } from "@shared/domain";

/**
 * What the logic pass of 23 October 2026 found: each case here was reproduced
 * by a reviewer before it was mended, and fails without the mend.
 */

let db: Database.Database;
let company: Company;
let lead: string;

beforeEach(() => {
  db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrate(db);
  company = createCompany(db, { name: "Unifloe", accent: "blue", timezone: "Asia/Kolkata" });
  lead = createLead(db, company.id, leadInput.parse({ name: "Harbour Coffee", contactPerson: "Maya Ellis" })).id;
});

const open = () =>
  (db.prepare(`SELECT title, due_on, lead_id FROM tasks WHERE status = 'open' ORDER BY due_on`).all() as { title: string; due_on: string; lead_id: string | null }[]);

/** Ticks the open task with this title, as many times as asked, and says the days it came back on. */
function tickRun(title: string, times: number): string[] {
  const days: string[] = [];
  for (let i = 0; i < times; i += 1) {
    const task = db.prepare(`SELECT id FROM tasks WHERE status = 'open' AND title = ?`).get(title) as { id: string };
    completeTask(db, task.id);
    days.push((db.prepare(`SELECT due_on FROM tasks WHERE status = 'open' AND title = ?`).get(title) as { due_on: string }).due_on);
  }
  return days;
}

describe("a task that comes back", () => {
  const make = (title: string, dueOn: string, repeats: "monthly" | "yearly", leadId: string | null = null) =>
    createTask(db, company.id, { title, kind: "todo", priority: null, dueOn, leadId, notes: null, repeats });

  it("keeps the day of the month it was set on, past a shorter month", () => {
    make("Pay rent", "2027-01-31", "monthly");
    expect(tickRun("Pay rent", 3)).toEqual(["2027-02-28", "2027-03-31", "2027-04-30"]);
  });

  it("comes back on 29 February in a leap year", () => {
    make("Renew the licence", "2028-02-29", "yearly");
    expect(tickRun("Renew the licence", 4)).toEqual(["2029-02-28", "2030-02-28", "2031-02-28", "2032-02-29"]);
  });

  it("comes back for each contact, though two runs share a title and a day", () => {
    const other = createLead(db, company.id, leadInput.parse({ name: "Beta Studio" })).id;
    const a = make("Send invoice", "2026-11-01", "monthly", lead);
    const b = make("Send invoice", "2026-11-01", "monthly", other);
    completeTask(db, a.id);
    completeTask(db, b.id);
    expect(open().map((task) => task.lead_id).sort()).toEqual([lead, other].sort());
  });

  it("is taken back with the tick when the tick is undone", () => {
    const rent = make("Pay rent", "2026-11-01", "monthly");
    completeTask(db, rent.id);
    reopenTask(db, rent.id);
    expect(open().map((task) => task.due_on)).toEqual(["2026-11-01"]);
  });
});

describe("a birthday said again", () => {
  it("is a correction: one fact, and the task moves to the new day", () => {
    addFact(db, company.id, { leadId: lead, text: "Maya's birthday is 9 March", until: null, birthday: "2027-03-09" });
    addFact(db, company.id, { leadId: lead, text: "Maya's birthday is 10 March", until: null, birthday: "2027-03-10" });
    const facts = db.prepare(`SELECT text FROM lead_facts WHERE lead_id = ?`).all(lead) as { text: string }[];
    expect(facts.map((fact) => fact.text)).toEqual(["Maya's birthday is 10 March"]);
    expect(open().map((task) => task.due_on)).toEqual(["2027-03-10"]);
  });
});

describe("money in from the line", () => {
  it("is dated by the company's day, not UTC's", () => {
    const invoice = saveInvoice(db, company.id, null, {
      leadId: lead,
      issuedOn: "2026-10-01",
      dueOn: "2026-10-15",
      notes: null,
      lines: [{ description: "Work", quantity: 1, unitPrice: 10000, productId: null }],
    });
    setInvoiceStatus(db, company.id, invoice.id, "sent");
    // 01:30 on 1 November in Kolkata, still 31 October in UTC.
    paidFrom(db, company.id, { leadId: lead, amount: 4000 }, new Date("2026-10-31T20:00:00Z"));
    const payment = db.prepare(`SELECT paid_on FROM payments WHERE invoice_id = ?`).get(invoice.id) as { paid_on: string };
    expect(payment.paid_on).toBe("2026-11-01");
    expect(findInvoice(db, invoice.id)?.paid).toBe(4000);
  });
});

describe("whether an invoice was chased", () => {
  it("does not count the email that sent it, nor another invoice's number that begins the same", () => {
    const invoice = saveInvoice(db, company.id, null, {
      leadId: lead,
      issuedOn: "2026-10-01",
      dueOn: "2026-10-15",
      notes: null,
      lines: [{ description: "Work", quantity: 1, unitPrice: 10000, productId: null }],
    });
    setInvoiceStatus(db, company.id, invoice.id, "sent");
    const email = (subject: string, at: string) =>
      db
        .prepare(
          `INSERT INTO emails (id, company_id, lead_id, to_email, subject, body, status, sent_at, created_at, updated_at)
           VALUES (?, ?, ?, 'maya@harbour.com', ?, '', 'sent', ?, ?, ?)`,
        )
        .run(`e-${subject}-${at}`, company.id, lead, subject, at, at, at);
    // Sent with the invoice, before it was due: not a reminder.
    email("Invoice INV-0001 from Unifloe", "2026-10-01T05:00:00Z");
    // Another invoice's number that starts the same: not this one's.
    email("Invoice INV-00010", "2026-10-20T05:00:00Z");
    expect(findInvoice(db, invoice.id)?.reminded).toBeNull();
    // A reminder after it was due is one.
    email("Reminder: INV-0001 is late", "2026-10-20T05:00:00Z");
    expect(findInvoice(db, invoice.id)?.reminded).toMatchObject({ times: 1 });
  });
});

describe("a filing whose day changes", () => {
  it("does not bring back the months already done", () => {
    const today = "2026-06-01";
    const now = new Date("2026-06-01T06:00:00Z");
    const gst = createObligation(
      db,
      company.id,
      { title: "GSTR-1", rule: { every: "month", day: 11 }, period: "month-before", remindDays: 5, startsOn: "2026-01-01" },
      today,
      now,
    );
    for (const month of ["01", "02", "03", "04", "05"]) markDone(db, gst.id, `2026-${month}-11`, `2026-${month}-10`);
    updateObligation(
      db,
      gst.id,
      { title: "GSTR-1", rule: { every: "month", day: 13 }, period: "month-before", remindDays: 5, startsOn: "2026-01-01" },
      today,
      now,
    );
    const late = dueSoon(db, company.id, today).filter((due) => due.dueOn < today);
    expect(late).toEqual([]);
  });
});
