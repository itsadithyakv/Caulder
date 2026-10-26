import { beforeEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";

vi.mock("electron", () => ({ Notification: class {}, nativeTheme: { shouldUseDarkColorsForSystemIntegratedUI: false } }));
vi.mock("../identity", () => ({ markFile: () => "" }));

const { migrate } = await import("../db/migrations");
const { createCompany } = await import("../repositories/companies");
const { createLead, writeActivity } = await import("../repositories/leads");
const { completeTask, createTask } = await import("../repositories/tasks");
const { listDeals, setDealStage } = await import("../repositories/deals");
const { addPayment, saveInvoice, setInvoiceStatus } = await import("../repositories/money");
const { quickAdd } = await import("./quickadd");
const { markWeekThing, setWeekThings, thisWeeksThings, weekReview } = await import("./week");
const { leadInput, taskInput } = await import("@shared/domain");
const { shiftDay, startOfWeek, today: todayIn } = await import("@shared/dates");

/**
 * The week, read from what is kept (PLAN.md, part eight, phase 35): nothing
 * is filled in for it - each number comes from something done in Caulder.
 */

let db: Database.Database;
let studio: string;
let maya: string;
const today = todayIn("Asia/Kolkata");
const monday = startOfWeek(today);

beforeEach(() => {
  db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrate(db);
  studio = createCompany(db, { name: "Studio", accent: "coffee", timezone: "Asia/Kolkata" }).id;
  maya = createLead(db, studio, leadInput.parse({ name: "Harbour Coffee Roasters", contactPerson: "Maya Ellis", value: 4800 })).id;
});

const stageOf = (kind: string) => (db.prepare(`SELECT id FROM pipeline_stages WHERE company_id = ? AND kind = ? ORDER BY position LIMIT 1`).get(studio, kind) as { id: string }).id;

describe("what happened in the week", () => {
  it("is nothing in a week nobody worked", () => {
    const review = weekReview(db, studio, today);
    expect(review).toMatchObject({
      from: monday,
      to: shiftDay(monday, 6),
      upTo: today,
      done: { count: 0 },
      reached: { people: 0, answered: 0 },
      deals: { moved: 0, won: 0, lost: 0 },
      money: { invoiced: 0, paid: 0, currency: "INR" },
      hours: { planned: 0, kept: 0 },
      slipped: { overdue: 0, unpaid: 0 },
    });
  });

  it("counts what was done, from the history, the deals, the money and the Calendar", () => {
    const task = createTask(db, studio, taskInput.parse({ title: "Send the deck", dueOn: today, leadId: maya }));
    completeTask(db, task.id);
    const now = new Date().toISOString();
    writeActivity(db, { companyId: studio, leadId: maya, kind: "call", body: null, occurredAt: now });
    writeActivity(db, { companyId: studio, leadId: maya, kind: "email_sent", body: null, occurredAt: now });
    writeActivity(db, { companyId: studio, leadId: maya, kind: "replied", body: null, occurredAt: now });
    const [deal] = listDeals(db, maya);
    setDealStage(db, deal!.id, stageOf("won"));
    const invoice = saveInvoice(db, studio, null, { leadId: maya, issuedOn: today, dueOn: shiftDay(today, 14), notes: null, lines: [{ description: "Work", quantity: 1, unitPrice: 3000 }] });
    setInvoiceStatus(db, studio, invoice.id, "sent");
    addPayment(db, studio, invoice.id, { amount: 1000, paidOn: today, note: null });
    const kept = quickAdd(db, studio, { title: "Deep work", day: today, time: "09:00", minutes: 120, kind: "todo", priority: null, leadId: null, notes: null, followUp: null, repeat: null, remind: false });
    quickAdd(db, studio, { title: "Admin", day: today, time: "14:00", minutes: 60, kind: "todo", priority: null, leadId: null, notes: null, followUp: null, repeat: null, remind: false });
    db.prepare(`UPDATE blocks SET outcome = 'skipped' WHERE title = 'Admin'`).run();
    void kept;

    const review = weekReview(db, studio, today);
    expect(review.done).toEqual({ count: 1, titles: ["Send the deck"] });
    // One person reached, however many times, and she answered.
    expect(review.reached).toMatchObject({ people: 1, answered: 1, names: ["Maya"] });
    expect(review.deals).toMatchObject({ moved: 1, won: 1, wonValue: 4800, lost: 0 });
    expect(review.money).toMatchObject({ invoiced: 3000, paid: 1000 });
    expect(review.hours).toEqual({ planned: 180, kept: 120 });
  });

  it("says what has slipped only for this week, and nothing of a week to come", () => {
    createTask(db, studio, taskInput.parse({ title: "Late", dueOn: shiftDay(today, -3) }));
    expect(weekReview(db, studio, today).slipped?.overdue).toBe(1);
    expect(weekReview(db, studio, shiftDay(monday, -7)).slipped).toBeNull();
    const next = weekReview(db, studio, shiftDay(monday, 7));
    expect(next.upTo).toBeNull();
    expect(next.done.count).toBe(0);
  });
});

describe("the week's three things", () => {
  it("are chosen for a week, three at most, and replaced or cleared as typed", () => {
    const week = shiftDay(monday, 7);
    expect(setWeekThings(db, studio, { weekStart: week, texts: ["Close Harbour", "Ship the site", "Hire an editor"] }).map((each) => each.text)).toEqual([
      "Close Harbour",
      "Ship the site",
      "Hire an editor",
    ]);
    const after = setWeekThings(db, studio, { weekStart: shiftDay(week, 2), texts: ["Close Harbour", "", "Hire a designer"] });
    expect(after.map((each) => each.text)).toEqual(["Close Harbour", "Hire a designer"]);
    expect(weekReview(db, studio, today).three.nextWeek).toHaveLength(2);
  });

  it("are this week's on Today, and ticked off there", () => {
    const [first] = setWeekThings(db, studio, { weekStart: monday, texts: ["Close Harbour"] });
    expect(thisWeeksThings(db, studio)).toEqual([expect.objectContaining({ text: "Close Harbour", done: false })]);
    markWeekThing(db, first!.id, true);
    expect(thisWeeksThings(db, studio)[0]?.done).toBe(true);
    expect(() => markWeekThing(db, "gone", true)).toThrow("That is not one of the week's three any more.");
  });

  it("are no longer done when what they say is changed", () => {
    const [first] = setWeekThings(db, studio, { weekStart: monday, texts: ["Close Harbour"] });
    markWeekThing(db, first!.id, true);
    expect(setWeekThings(db, studio, { weekStart: monday, texts: ["Close Harbour and Studio Palma"] })[0]?.done).toBe(false);
  });
});
