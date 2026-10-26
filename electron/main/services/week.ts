import { randomUUID } from "node:crypto";
import type { Db } from "../db/connection";
import { dayOf, shiftDay, startOfWeek, today as todayIn } from "@shared/dates";
import type { WeekReview, WeekThing, WeekThingsInput } from "@shared/week";
import { listOverdue } from "../repositories/tasks";
import { listInvoices, listOverdueInvoices } from "../repositories/money";
import { listCold, readColdAfterDays } from "./today";

/**
 * The week, read from what is kept (PLAN.md, part eight, phase 35): what
 * happened in it - tasks done, people reached and who answered, deals that
 * moved, money invoiced and paid, hours kept against hours planned - what has
 * slipped as of today, and the three things for the week after. Nothing here
 * is filled in for it; a Friday's page is true because the week was done in
 * Caulder.
 */

/** Reached: wrote, rang or met. The same kinds Today's Reach out counts. */
const REACHED = ["email_sent", "whatsapp", "linkedin", "instagram", "call", "meeting"] as const;
/** They answered: wrote back, said by hand or read from the mail. */
const ANSWERED = ["replied", "email_replied"] as const;

function placeOf(db: Db, companyId: string): { timezone: string; currency: string } {
  const row = db.prepare(`SELECT timezone, currency FROM companies WHERE id = ?`).get(companyId) as { timezone: string; currency: string } | undefined;
  return { timezone: row?.timezone ?? "UTC", currency: row?.currency ?? "INR" };
}

/** The week's three, in order. */
function thingsFor(db: Db, companyId: string, weekStart: string): WeekThing[] {
  return (
    db.prepare(`SELECT id, text, position, done_at FROM week_things WHERE company_id = ? AND week_start = ? ORDER BY position`).all(companyId, weekStart) as {
      id: string;
      text: string;
      position: number;
      done_at: string | null;
    }[]
  ).map((row) => ({ id: row.id, text: row.text, position: row.position, done: row.done_at !== null }));
}

export function weekReview(db: Db, companyId: string, anyDay: string, now: Date = new Date()): WeekReview {
  const { timezone, currency } = placeOf(db, companyId);
  const today = todayIn(timezone, now);
  const from = startOfWeek(anyDay);
  const to = shiftDay(from, 6);
  const upTo = from > today ? null : to < today ? to : today;
  // An instant is on the company's day; seven days and one either side in UTC covers every one of them.
  const since = new Date(Date.parse(`${from}T00:00:00Z`) - 86_400_000).toISOString();
  const until = new Date(Date.parse(`${to}T00:00:00Z`) + 2 * 86_400_000).toISOString();
  const inWeek = (iso: string) => {
    const on = dayOf(iso, timezone);
    return upTo !== null && on >= from && on <= upTo;
  };

  const done = (
    db
      .prepare(`SELECT title, completed_at FROM tasks WHERE company_id = ? AND status = 'done' AND completed_at BETWEEN ? AND ? ORDER BY completed_at DESC`)
      .all(companyId, since, until) as { title: string; completed_at: string }[]
  ).filter((task) => inWeek(task.completed_at));

  const marks = (kinds: readonly string[]) => kinds.map(() => "?").join(", ");
  const activity = (kinds: readonly string[]) =>
    (
      db
        .prepare(
          `SELECT a.lead_id, a.occurred_at, COALESCE(l.contact_person, l.name) AS who FROM activities a
           JOIN leads l ON l.id = a.lead_id
           WHERE a.company_id = ? AND a.occurred_at BETWEEN ? AND ? AND a.kind IN (${marks(kinds)})
           ORDER BY a.occurred_at DESC`,
        )
        .all(companyId, since, until, ...kinds) as { lead_id: string; occurred_at: string; who: string }[]
    ).filter((row) => inWeek(row.occurred_at));
  const reached = activity(REACHED);
  const answered = activity(ANSWERED);
  const names = [...new Map(reached.map((row) => [row.lead_id, row.who.split(/\s+/)[0] ?? row.who])).values()];

  const moved = activity(["stage_change"]);
  const closed = (
    db
      .prepare(
        `SELECT d.lead_id, d.value, s.kind, d.closed_at FROM deals d JOIN pipeline_stages s ON s.id = d.stage_id
         WHERE d.company_id = ? AND s.kind IN ('won', 'lost') AND d.closed_at BETWEEN ? AND ?`,
      )
      .all(companyId, since, until) as { lead_id: string; value: number | null; kind: string; closed_at: string }[]
  ).filter((deal) => inWeek(deal.closed_at));
  const won = closed.filter((deal) => deal.kind === "won");

  const invoiced = listInvoices(db, companyId)
    .filter((invoice) => (invoice.status === "sent" || invoice.status === "paid") && upTo !== null && invoice.issuedOn >= from && invoice.issuedOn <= upTo)
    .reduce((sum, invoice) => sum + invoice.total, 0);
  const paid =
    upTo === null
      ? 0
      : (db.prepare(`SELECT COALESCE(SUM(amount), 0) AS total FROM payments WHERE company_id = ? AND paid_on BETWEEN ? AND ?`).get(companyId, from, upTo) as { total: number })
          .total;

  const blocks =
    upTo === null
      ? []
      : (db.prepare(`SELECT minutes, outcome FROM blocks WHERE company_id = ? AND day BETWEEN ? AND ?`).all(companyId, from, upTo) as {
          minutes: number;
          outcome: string | null;
        }[]);
  const planned = blocks.reduce((sum, block) => sum + block.minutes, 0);
  const kept = blocks.filter((block) => block.outcome !== "skipped").reduce((sum, block) => sum + block.minutes, 0);

  // Behind as of today: only this week's to say.
  const thisWeek = from <= today && today <= to;
  const unpaid = thisWeek ? listOverdueInvoices(db, companyId, today) : [];
  const slipped = thisWeek
    ? {
        overdue: listOverdue(db, companyId, today).length,
        quiet: listCold(db, companyId, today, timezone, readColdAfterDays(db)).length,
        unpaid: unpaid.length,
        unpaidAmount: unpaid.reduce((sum, invoice) => sum + (invoice.total - invoice.paid), 0),
      }
    : null;

  return {
    from,
    to,
    upTo,
    done: { count: done.length, titles: done.slice(0, 5).map((task) => task.title) },
    reached: { people: new Set(reached.map((row) => row.lead_id)).size, answered: new Set(answered.map((row) => row.lead_id)).size, names: names.slice(0, 5) },
    // A deal that closed has moved, whether or not its move was written down as one.
    deals: { moved: new Set([...moved.map((row) => row.lead_id), ...closed.map((deal) => deal.lead_id)]).size, won: won.length, wonValue: won.reduce((sum, deal) => sum + (deal.value ?? 0), 0), lost: closed.length - won.length },
    money: { invoiced, paid, currency },
    hours: { planned, kept },
    slipped,
    three: { thisWeek: thingsFor(db, companyId, from), nextWeek: thingsFor(db, companyId, shiftDay(from, 7)) },
  };
}

/** The three for a week, as typed: each place set, replaced or - typed empty - cleared. */
export function setWeekThings(db: Db, companyId: string, input: WeekThingsInput): WeekThing[] {
  const weekStart = startOfWeek(input.weekStart);
  db.transaction(() => {
    input.texts.forEach((text, position) => {
      const held = db.prepare(`SELECT id, text FROM week_things WHERE company_id = ? AND week_start = ? AND position = ?`).get(companyId, weekStart, position) as
        | { id: string; text: string }
        | undefined;
      if (!text) {
        if (held) db.prepare(`DELETE FROM week_things WHERE id = ?`).run(held.id);
        return;
      }
      if (held?.text === text) return;
      if (held) db.prepare(`UPDATE week_things SET text = ?, done_at = NULL WHERE id = ?`).run(text, held.id);
      else
        db.prepare(`INSERT INTO week_things (id, company_id, week_start, position, text, done_at, created_at) VALUES (?, ?, ?, ?, ?, NULL, ?)`).run(
          randomUUID(),
          companyId,
          weekStart,
          position,
          text,
          new Date().toISOString(),
        );
    });
  })();
  return thingsFor(db, companyId, weekStart);
}

/** One of the three, done - or not, again. */
export function markWeekThing(db: Db, id: string, done: boolean): void {
  const result = db.prepare(`UPDATE week_things SET done_at = ? WHERE id = ?`).run(done ? new Date().toISOString() : null, id);
  if (result.changes === 0) throw new Error("That is not one of the week's three any more.");
}

/** This week's three, for the head of Today. */
export function thisWeeksThings(db: Db, companyId: string, now: Date = new Date()): WeekThing[] {
  const { timezone } = placeOf(db, companyId);
  return thingsFor(db, companyId, startOfWeek(todayIn(timezone, now)));
}
