import { addMonths, daysBetween, shiftDay } from "./dates";
import { nextAfter, type RunningCost } from "./costs";
import { INVOICE_REPEAT_MONTHS, type Invoice } from "./domain";

/**
 * Money ahead, and who it comes from (PLAN.md, part thirteen, phases 54 and
 * 55). Worked out when read from what is kept: invoices, retainers and
 * running costs. Nothing is stored for it.
 */

export type AheadWindow = {
  /** Days from today the window ends: 30, 60, 90. */
  days: number;
  /** Invoices due in it, still owed; the first window takes every late one too. */
  comingIn: number;
  /** Retainers that will be drafted and fall due in it. */
  retainers: number;
  /** Running costs that come round in it. */
  goingOut: number;
};

export type Ahead = {
  windows: AheadWindow[];
  /** Of the first window's money coming in, what is already late. */
  late: number;
};

const WINDOWS = [30, 60, 90] as const;

function windowOf(day: string, on: string): number {
  const ahead = daysBetween(day, on);
  if (ahead < 0) return 0;
  const index = WINDOWS.findIndex((end) => ahead <= end);
  return index;
}

/**
 * The next ninety days, in three thirties: what is owed and due, what the
 * retainers will bring, and what the running costs will take.
 */
export function aheadOf(input: { day: string; invoices: readonly Invoice[]; costs: readonly RunningCost[] }): Ahead {
  const windows: AheadWindow[] = WINDOWS.map((days) => ({ days, comingIn: 0, retainers: 0, goingOut: 0 }));
  const end = shiftDay(input.day, WINDOWS[WINDOWS.length - 1] ?? 90);
  let late = 0;

  for (const invoice of input.invoices) {
    if (invoice.status === "sent") {
      const owed = invoice.total - invoice.paid;
      if (owed <= 0) continue;
      const at = windowOf(input.day, invoice.dueOn);
      if (at < 0) continue;
      const window = windows[at];
      if (window) window.comingIn += owed;
      if (invoice.dueOn < input.day) late += owed;
    }
    // A retainer brings the next one, and the one after, as long as they fall inside the ninety days.
    if (invoice.repeats && (invoice.status === "sent" || invoice.status === "paid")) {
      const term = Math.max(0, daysBetween(invoice.issuedOn, invoice.dueOn));
      // Each counted from the first, so one on the 31st is on the 31st again after a short month.
      const every = INVOICE_REPEAT_MONTHS[invoice.repeats];
      for (let next = 1; next <= 12; next += 1) {
        const due = shiftDay(addMonths(invoice.issuedOn, every * next), term);
        if (due > end) break;
        const at = windowOf(input.day, due);
        const window = at >= 0 ? windows[at] : undefined;
        if (window) window.retainers += invoice.total;
      }
    }
  }

  for (const cost of input.costs) {
    if (!cost.nextOn || !cost.each) continue;
    let on: string | null = cost.nextOn;
    for (let guard = 0; on && on <= end && guard < 100; guard += 1) {
      const at = windowOf(input.day, on);
      const window = at >= 0 ? windows[at] : undefined;
      if (window) window.goingOut += cost.each;
      on = nextAfter(on, cost.cycle, cost.years);
    }
  }

  return { windows, late };
}

export type ClientMoney = {
  leadId: string;
  name: string;
  /** Paid this calendar year, by the day each payment came. */
  paidThisYear: number;
  /** Owed now, on invoices sent. */
  owed: number;
  /** Of those owed, how much is late. */
  late: number;
  /** Days from issue to the last payment, over the invoices paid in full; null with none. */
  daysToPay: number | null;
  /** Their part of the year's income, from 0 to 1. */
  share: number;
};

/** One client is this much of the year's income: worth a line. */
const MOST_OF_IT = 0.5;

/**
 * Who the money comes from: each client's year, what they owe, how long they
 * take to pay, most first. And one client, when one is most of the income.
 */
export function clientsOf(invoices: readonly Invoice[], day: string): { clients: ClientMoney[]; mostOfIt: ClientMoney | null } {
  const year = day.slice(0, 4);
  const byClient = new Map<string, ClientMoney & { paidDays: number[] }>();
  for (const invoice of invoices) {
    if (invoice.status === "draft" || invoice.status === "void") continue;
    const client = byClient.get(invoice.leadId) ?? {
      leadId: invoice.leadId,
      name: invoice.leadName,
      paidThisYear: 0,
      owed: 0,
      late: 0,
      daysToPay: null,
      share: 0,
      paidDays: [],
    };
    for (const payment of invoice.payments) if (payment.paidOn.startsWith(year)) client.paidThisYear += payment.amount;
    if (invoice.status === "sent") {
      const owed = Math.max(0, invoice.total - invoice.paid);
      client.owed += owed;
      if (invoice.dueOn < day) client.late += owed;
    }
    if (invoice.status === "paid" && invoice.paidOn) client.paidDays.push(Math.max(0, daysBetween(invoice.issuedOn, invoice.paidOn)));
    byClient.set(invoice.leadId, client);
  }
  const total = [...byClient.values()].reduce((sum, client) => sum + client.paidThisYear, 0);
  const clients = [...byClient.values()]
    .map(({ paidDays, ...client }) => ({
      ...client,
      daysToPay: paidDays.length > 0 ? Math.round(paidDays.reduce((sum, days) => sum + days, 0) / paidDays.length) : null,
      share: total > 0 ? client.paidThisYear / total : 0,
    }))
    .sort((a, b) => b.paidThisYear - a.paidThisYear || b.owed - a.owed);
  const top = clients[0];
  return { clients, mostOfIt: top && clients.length > 1 && top.share >= MOST_OF_IT ? top : null };
}
