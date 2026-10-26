import { beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { migrate } from "../db/migrations";
import { createCompany } from "./companies";
import { createLead } from "./leads";
import { draftRepeats, findInvoice, listDraftedRepeats, listInvoices, listOverdueInvoices, saveInvoice, setInvoiceStatus } from "./money";
import { buildToday } from "../services/today";
import { leadInput } from "@shared/domain";
import { chaseOffer, daysLate, owedByAge, reminderFor } from "@shared/chase";

/**
 * Money that asks for itself (PLAN.md, part eight, phase 34): a late invoice
 * is chased from the row it is on, a second reminder is offered a week after
 * the first, and what is owed is said by how late it is.
 */

const DAY = "2026-10-14";
const money = (value: number) => `INR ${value.toLocaleString("en-IN")}`;
const date = (day: string) => day;
const invoice = (more: Partial<Parameters<typeof reminderFor>[0]["invoice"]> = {}) => ({
  number: 7,
  label: "INV-0007",
  issuedOn: "2026-09-15",
  dueOn: "2026-10-02",
  total: 12000,
  paid: 0,
  reminded: null,
  ...more,
});

describe("the words of a reminder", () => {
  it("says the number, the amount, when it was due and how late it is, to the person by name", () => {
    const written = reminderFor({ invoice: invoice(), company: "Unifloe", person: "Priya Nair", day: DAY, money, date });
    expect(written.subject).toBe("Reminder: invoice INV-0007 from Unifloe");
    expect(written.body.split("\n")[0]).toBe("Hello Priya,");
    expect(written.body).toContain("Invoice INV-0007 for INR 12,000, issued on 2026-09-15, was due on 2026-10-02, 12 days ago.");
    expect(written.body).toContain("If it already has been, thank you, and please ignore this.");
    expect(written.body.trimEnd().endsWith("Unifloe")).toBe(true);
  });

  it("says what has come in and what is still owed, and is a second reminder the second time", () => {
    const part = reminderFor({ invoice: invoice({ paid: 4000 }), company: "Unifloe", person: null, day: DAY, money, date });
    expect(part.body.split("\n")[0]).toBe("Hello,");
    expect(part.body).toContain("INR 4,000 has come in, and INR 8,000 is still owed.");

    const again = reminderFor({ invoice: invoice({ reminded: { at: "2026-10-05T09:00:00Z", times: 1 } }), company: "Unifloe", person: null, day: DAY, money, date });
    expect(again.subject).toBe("Second reminder: invoice INV-0007 from Unifloe");
    expect(again.body).toContain("I wrote before about invoice INV-0007");
  });
});

describe("what a late invoice's row offers", () => {
  it("offers a reminder once it is late, nothing for a week after one went, and another after that", () => {
    const late = { status: "sent" as const, dueOn: "2026-10-02", reminded: null };
    expect(daysLate(late, DAY)).toBe(12);
    expect(chaseOffer(late, DAY)).toBe("first");
    expect(chaseOffer({ ...late, reminded: { at: "2026-10-10T09:00:00Z", times: 1 } }, DAY)).toBe("wait");
    expect(chaseOffer({ ...late, reminded: { at: "2026-10-07T09:00:00Z", times: 1 } }, DAY)).toBe("again");
    // Not late, a draft and a paid one are not chased.
    expect(chaseOffer({ ...late, dueOn: DAY }, DAY)).toBeNull();
    expect(chaseOffer({ ...late, status: "draft" }, DAY)).toBeNull();
    expect(chaseOffer({ ...late, status: "paid" }, DAY)).toBeNull();
  });
});

describe("what is owed, by age", () => {
  it("adds up what is still owed on invoices that were sent, by how late each is", () => {
    const owed = owedByAge(
      [
        { status: "sent", dueOn: "2026-10-20", total: 5000, paid: 0 },
        { status: "sent", dueOn: "2026-10-02", total: 12000, paid: 4000 },
        { status: "sent", dueOn: "2026-08-01", total: 3000, paid: 0 },
        { status: "sent", dueOn: "2026-07-01", total: 1000, paid: 0 },
        { status: "draft", dueOn: "2026-08-01", total: 9999, paid: 0 },
        { status: "paid", dueOn: "2026-08-01", total: 9999, paid: 9999 },
      ],
      DAY,
    );
    expect(owed).toEqual({
      notDue: { count: 1, amount: 5000 },
      late: { count: 1, amount: 8000 },
      veryLate: { count: 2, amount: 4000 },
      total: 17000,
    });
  });
});

describe("whether an invoice has been chased", () => {
  let db: Database.Database;
  let companyId: string;
  let leadId: string;

  beforeEach(() => {
    db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    migrate(db);
    companyId = createCompany(db, { name: "Unifloe", accent: "blue", timezone: "Asia/Kolkata" }).id;
    leadId = createLead(db, companyId, leadInput.parse({ name: "Oakridge", email: "office@oakridge.test" })).id;
  });

  const email = (subject: string, status: string, at: string) =>
    db
      .prepare(
        `INSERT INTO emails (id, company_id, lead_id, to_email, subject, body, status, sent_at, created_at, updated_at)
         VALUES (?, ?, ?, 'office@oakridge.test', ?, 'Hello', ?, ?, ?, ?)`,
      )
      .run(`${subject}-${at}`, companyId, leadId, subject, status, status === "scheduled" ? null : at, at, at);

  it("is read from the emails sent to its contact with its number in the subject, and kept nowhere", () => {
    const lines = [{ description: "Workshop", quantity: 1, unitPrice: 12000 }];
    const one = saveInvoice(db, companyId, null, { leadId, issuedOn: "2026-09-15", dueOn: "2026-10-02", notes: null, lines });
    const two = saveInvoice(db, companyId, null, { leadId, issuedOn: "2026-09-15", dueOn: "2026-10-02", notes: null, lines });
    setInvoiceStatus(db, companyId, one.id, "sent");
    setInvoiceStatus(db, companyId, two.id, "sent");
    expect(findInvoice(db, one.id)?.reminded).toBeNull();

    email("Reminder: invoice INV-0001 from Unifloe", "sent", "2026-10-05T09:00:00.000Z");
    // One written by hand counts; one not yet sent, and one about something else, do not.
    email("About INV-0001, again", "replied", "2026-10-12T09:00:00.000Z");
    email("Reminder: invoice INV-0001 from Unifloe", "scheduled", "2026-10-13T09:00:00.000Z");
    email("The workshop on Friday", "sent", "2026-10-13T10:00:00.000Z");

    expect(findInvoice(db, one.id)?.reminded).toEqual({ at: "2026-10-12T09:00:00.000Z", times: 2 });
    expect(findInvoice(db, two.id)?.reminded).toBeNull();
    // And it is on the row Today shows, where it is chased from.
    const late = listOverdueInvoices(db, companyId, DAY).sort((a, b) => a.number - b.number);
    expect(late.map((each) => [each.number, each.reminded?.times ?? 0])).toEqual([[1, 2], [2, 0]]);
    expect(chaseOffer(late[0] as never, DAY)).toBe("wait");
    expect(chaseOffer(late[1] as never, DAY)).toBe("first");
  });
});

describe("a retainer", () => {
  let db: Database.Database;
  let companyId: string;
  let leadId: string;
  const lines = [{ description: "Retainer, October", quantity: 1, unitPrice: 30000 }];

  beforeEach(() => {
    db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    migrate(db);
    companyId = createCompany(db, { name: "Unifloe", accent: "blue", timezone: "Asia/Kolkata" }).id;
    leadId = createLead(db, companyId, leadInput.parse({ name: "Harbour" })).id;
  });

  it("drafts the next invoice when it falls due to be written, and moves the saying on to the draft", () => {
    const first = saveInvoice(db, companyId, null, { leadId, issuedOn: "2026-09-01", dueOn: "2026-09-15", notes: "Thank you.", lines, repeats: "monthly" });
    // Not from a draft: it has not gone yet.
    expect(draftRepeats(db, companyId, "2026-10-14")).toBe(0);
    setInvoiceStatus(db, companyId, first.id, "sent");
    // Not before the month comes round.
    expect(draftRepeats(db, companyId, "2026-09-30")).toBe(0);

    expect(draftRepeats(db, companyId, "2026-10-01")).toBe(1);
    const [draft] = listDraftedRepeats(db, companyId);
    expect(draft).toMatchObject({ number: 2, status: "draft", issuedOn: "2026-10-01", dueOn: "2026-10-15", notes: "Thank you.", total: 30000, repeats: "monthly", leadId });
    expect(findInvoice(db, first.id)?.repeats).toBeNull();
    // Reading again drafts nothing more: one waiting at a time, however long it has been.
    expect(draftRepeats(db, companyId, "2026-12-20")).toBe(0);
    expect(listInvoices(db, companyId)).toHaveLength(2);

    // Sent, the run goes on from it - and only ever as a draft.
    setInvoiceStatus(db, companyId, draft?.id ?? "", "sent");
    expect(draftRepeats(db, companyId, "2026-12-20")).toBe(1);
    expect(listInvoices(db, companyId).map((invoice) => [invoice.number, invoice.status, invoice.issuedOn, invoice.repeats]).sort()).toEqual([
      [1, "sent", "2026-09-01", null],
      [2, "sent", "2026-10-01", null],
      [3, "draft", "2026-11-01", "monthly"],
    ]);
  });

  it("is on Today while it waits, keeps to the month's last day, and stops when it is set to no or made void", () => {
    const first = saveInvoice(db, companyId, null, { leadId, issuedOn: "2026-01-31", dueOn: "2026-01-31", notes: null, lines, repeats: "monthly" });
    setInvoiceStatus(db, companyId, first.id, "sent");
    draftRepeats(db, companyId, "2026-03-05");
    const [draft] = listDraftedRepeats(db, companyId);
    expect(draft?.issuedOn).toBe("2026-02-28");
    expect(buildToday(db, companyId, new Date("2026-03-05T06:00:00Z")).drafted.map((invoice) => invoice.number)).toEqual([2]);

    // Set to no on the newest one, and sent: nothing more is drafted.
    saveInvoice(db, companyId, draft?.id ?? "", { leadId, issuedOn: "2026-02-28", dueOn: "2026-02-28", notes: null, lines, repeats: null });
    setInvoiceStatus(db, companyId, draft?.id ?? "", "sent");
    expect(draftRepeats(db, companyId, "2026-06-01")).toBe(0);

    const quarterly = saveInvoice(db, companyId, null, { leadId, issuedOn: "2026-01-10", dueOn: "2026-01-24", notes: null, lines, repeats: "quarterly" });
    setInvoiceStatus(db, companyId, quarterly.id, "void");
    expect(draftRepeats(db, companyId, "2026-06-01")).toBe(0);
  });
});
