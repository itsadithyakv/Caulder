import { describe, expect, it } from "vitest";
import { aheadOf, clientsOf } from "./insights";
import type { Invoice } from "./domain";
import type { RunningCost } from "./costs";

const DAY = "2026-10-23";

const invoice = (over: Partial<Invoice>): Invoice =>
  ({
    id: "i",
    leadId: "a",
    leadName: "Harbour",
    status: "sent",
    issuedOn: "2026-10-01",
    dueOn: "2026-10-31",
    paidOn: null,
    total: 1000,
    paid: 0,
    payments: [],
    repeats: null,
    ...over,
  }) as Invoice;

const cost = (over: Partial<RunningCost>): RunningCost =>
  ({ pageId: "p", title: "Hosting", template: "tool", section: "tools", amount: 300, cycle: "monthly", nextOn: "2026-11-05", category: null, monthly: 300, years: 1, each: 300, account: null, product: null, ...over }) as RunningCost;

describe("the next ninety days", () => {
  it("puts what is owed in the window it falls due, and late money in the first", () => {
    const ahead = aheadOf({
      day: DAY,
      invoices: [invoice({ dueOn: "2026-10-31" }), invoice({ id: "late", dueOn: "2026-10-01", total: 500 }), invoice({ id: "far", dueOn: "2026-12-10", total: 2000, paid: 500 })],
      costs: [],
    });
    expect(ahead.windows.map((window) => window.comingIn)).toEqual([1500, 1500, 0]);
    expect(ahead.late).toBe(500);
  });

  it("counts the retainers that will be drafted, and the costs as they come round", () => {
    const ahead = aheadOf({
      day: DAY,
      invoices: [invoice({ status: "paid", issuedOn: "2026-10-01", dueOn: "2026-10-15", total: 4000, paid: 4000, repeats: "monthly" })],
      costs: [cost({}), cost({ pageId: "q", title: "Domain", amount: 1200, each: 1200, cycle: "yearly", nextOn: "2027-06-01" })],
    });
    // Drafted on the 1st of November, December and January, each due a fortnight on.
    expect(ahead.windows.map((window) => window.retainers)).toEqual([4000, 4000, 4000]);
    expect(ahead.windows.map((window) => window.goingOut)).toEqual([300, 300, 300]);
  });
});

describe("who the money comes from", () => {
  it("adds up each client's year, what they owe and how long they take, most first", () => {
    const { clients, mostOfIt } = clientsOf(
      [
        invoice({ id: "1", status: "paid", issuedOn: "2026-03-01", paidOn: "2026-03-21", total: 6000, paid: 6000, payments: [{ id: "p1", invoiceId: "1", amount: 6000, paidOn: "2026-03-21", note: null, withheld: 0 }] }),
        invoice({ id: "2", status: "sent", dueOn: "2026-10-10", total: 1000 }),
        invoice({ id: "3", leadId: "b", leadName: "Kettle", status: "paid", issuedOn: "2026-05-01", paidOn: "2026-05-11", total: 2000, paid: 2000, payments: [{ id: "p2", invoiceId: "3", amount: 2000, paidOn: "2026-05-11", note: null, withheld: 0 }] }),
        invoice({ id: "4", leadId: "c", leadName: "Draft Co", status: "draft", total: 9999 }),
      ],
      DAY,
    );
    expect(clients.map((client) => [client.name, client.paidThisYear, client.owed, client.late, client.daysToPay])).toEqual([
      ["Harbour", 6000, 1000, 1000, 20],
      ["Kettle", 2000, 0, 0, 10],
    ]);
    expect(mostOfIt?.name).toBe("Harbour");
    expect(mostOfIt?.share).toBe(0.75);
  });

  it("says nothing of a client that is the only one", () => {
    expect(clientsOf([invoice({ status: "paid", paid: 1000, payments: [{ id: "p", invoiceId: "i", amount: 1000, paidOn: "2026-10-02", note: null, withheld: 0 }] })], DAY).mostOfIt).toBeNull();
  });
});
