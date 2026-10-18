import { MAIN_DEAL } from "../repositories/main-deal";
import type { Db } from "../db/connection";
import type { ColdLead, Reach, ReachLead, ReachWay, Today } from "@shared/domain";
import { ANSWER_KINDS, NOBODY_SENT, WRITTEN_KINDS, type Sent } from "@shared/reached";
import { daysBetween, dayOf, today as todayIn } from "@shared/dates";
import { z } from "zod";
import { getSetting, setSetting } from "../repositories/settings";
import { listDueOn, listOverdue, listUpcoming } from "../repositories/tasks";
import { listBlocks } from "../repositories/blocks";
import { layOut } from "@shared/day";
import { listDraftedRepeats, listOverdueInvoices } from "../repositories/money";
import { listRecentReplies } from "../repositories/mail";
import { renewalsFor } from "./costs";
import { dueSoon } from "./deadlines";

/**
 * The Today engine.
 *
 * Assembles the answer to "what do I do this morning" from the questions the
 * database can answer, in the order they need attention: what money is late,
 * what work is late, what is due, what is in the hours, and what is quietly
 * going nowhere - and, beside all of it, who is still waiting to hear from
 * you for the first time.
 */

const DEFAULT_COLD_AFTER_DAYS = 14;

/** How far back Today shows replies. A week is long enough to have missed one. */
const REPLIES_FOR_DAYS = 7;

/**
 * Activity kinds that count as the lead being alive.
 *
 * `field_change` is excluded on purpose: correcting a typo in a phone number
 * is not contact, and counting it would let a lead look warm forever while
 * nothing actually happened. `created` and `imported` are excluded for the
 * same reason but handled separately below, as the clock's starting point.
 */
const MEANINGFUL = [
  "call",
  "meeting",
  "note",
  "stage_change",
  "task_done",
  "email_sent",
  "email_opened",
  "email_replied",
] as const;

export function buildToday(db: Db, companyIds: string | readonly string[], now: Date = new Date()): Today {
  const ids = typeof companyIds === "string" ? [companyIds] : companyIds;
  const home = ids[0] ?? "";
  const timezone = companyTimezone(db, home);
  const day = todayIn(timezone, now);
  const coldAfterDays = readColdAfterDays(db);
  // Each list from each workspace, then in one order. One workspace, which is
  // nearly everyone, is read exactly as before.
  const all = <T>(read: (companyId: string) => T[], order?: (a: T, b: T) => number): T[] => {
    if (ids.length === 1) return read(home);
    const rows = ids.flatMap(read);
    return order ? rows.sort(order) : rows;
  };
  const byDue = (a: { dueOn: string; createdAt: string }, b: { dueOn: string; createdAt: string }) =>
    a.dueOn.localeCompare(b.dueOn) || a.createdAt.localeCompare(b.createdAt);

  const reach = ids
    .map((id) => reachOf(db, id, day, companyTimezone(db, id)))
    .reduce<Reach>(
      (sum, each) => ({
        today: sum.today + each.today,
        week: sum.week + each.week,
        next: [...sum.next, ...each.next].sort((a, b) => a.addedOn.localeCompare(b.addedOn)).slice(0, REACH_SHOWN),
        waiting: sum.waiting + each.waiting,
        sent: {
          people: sum.sent.people + each.sent.people,
          answered: sum.sent.answered + each.sent.answered,
          waiting: sum.sent.waiting + each.sent.waiting,
          oldestDays:
            sum.sent.oldestDays === null || each.sent.oldestDays === null
              ? (sum.sent.oldestDays ?? each.sent.oldestDays)
              : Math.max(sum.sent.oldestDays, each.sent.oldestDays),
        },
      }),
      { today: 0, week: 0, next: [], waiting: 0, sent: NOBODY_SENT },
    );

  return {
    day,
    blocks: layOut(all((id) => listBlocks(db, id, day))),
    overdue: all((id) => listOverdue(db, id, day), byDue),
    dueToday: all((id) => listDueOn(db, id, day), (a, b) => a.kind.localeCompare(b.kind) || a.createdAt.localeCompare(b.createdAt)),
    upcoming: all((id) => listUpcoming(db, id, day), byDue),
    cold: all((id) => listCold(db, id, day, companyTimezone(db, id), coldAfterDays), (a, b) => a.lastTouchedOn.localeCompare(b.lastTouchedOn)),
    coldAfterDays,
    unpaid: all((id) => listOverdueInvoices(db, id, day), (a, b) => a.dueOn.localeCompare(b.dueOn)),
    // A retainer's invoice, written and not yet sent: whoever drafted it, it is waiting on the owner.
    drafted: all((id) => listDraftedRepeats(db, id).filter((invoice) => invoice.issuedOn <= day), (a, b) => a.issuedOn.localeCompare(b.issuedOn)),
    renewals: all((id) => renewalsFor(db, id, day), (a, b) => a.nextOn.localeCompare(b.nextOn)),
    deadlines: all((id) => dueSoon(db, id, day), (a, b) => a.dueOn.localeCompare(b.dueOn)),
    replies: all(
      (id) => listRecentReplies(db, id, new Date(now.getTime() - REPLIES_FOR_DAYS * 24 * 60 * 60 * 1000).toISOString()),
      (a, b) => b.repliedAt.localeCompare(a.repliedAt),
    ),
    reach,
  };
}

/** How many of those still waiting Today names. The rest are a count: a list of forty is a list nobody starts. */
const REACH_SHOWN = 5;

/** What counts as having reached somebody: you wrote, rang or met. A note about them does not. */
const REACHED = ["email_sent", "whatsapp", "linkedin", "instagram", "call", "meeting"] as const;

/**
 * Outreach for one company (PLAN.md, part seven).
 *
 * **Reached** is people, not messages: three emails to one contact today is
 * one person reached. Counted from the history, which is where every way of
 * reaching somebody already writes, by the company's own day.
 *
 * **Waiting** is the prospects nobody has reached at all: still in play, not
 * marked do not contact, with nothing in their history that is contact, no
 * message scheduled and no next step planned - somebody with a task has been
 * decided about, and is on the list of work already. Oldest first: the one
 * added three weeks ago is the one most likely to be forgotten.
 */
function reachOf(db: Db, companyId: string, day: string, timezone: string): Reach {
  const marks = REACHED.map(() => "?").join(", ");
  // Eight days back in UTC covers seven of the company's own days, whichever side of midnight it is on.
  const since = new Date(Date.parse(`${day}T00:00:00Z`) - 8 * 24 * 60 * 60 * 1000).toISOString();
  const recent = db
    .prepare(`SELECT lead_id, occurred_at FROM activities WHERE company_id = ? AND occurred_at >= ? AND kind IN (${marks})`)
    .all(companyId, since, ...REACHED) as { lead_id: string; occurred_at: string }[];
  const today = new Set<string>();
  const week = new Set<string>();
  for (const row of recent) {
    const on = dayOf(row.occurred_at, timezone);
    const ago = daysBetween(on, day);
    if (ago === 0) today.add(row.lead_id);
    if (ago >= 0 && ago < 7) week.add(row.lead_id);
  }

  // Who was written to in those seven days, and whether anything has come back since the last
  // message to each (shared/reached.ts): people, as above, and the same seven days.
  const kinds = (list: readonly string[]) => list.map((kind) => `'${kind}'`).join(", ");
  const written = db
    .prepare(
      `SELECT w.lead_id, w.last,
              EXISTS (SELECT 1 FROM activities r
                       WHERE r.lead_id = w.lead_id AND r.kind IN (${kinds(ANSWER_KINDS)}) AND r.occurred_at >= w.last) AS answered
         FROM (SELECT a.lead_id, MAX(a.occurred_at) AS last FROM activities a
                WHERE a.company_id = ? AND a.occurred_at >= ? AND a.kind IN (${kinds(WRITTEN_KINDS)})
                GROUP BY a.lead_id) w`,
    )
    .all(companyId, since) as { lead_id: string; last: string; answered: number }[];
  const sent: Sent = { ...NOBODY_SENT };
  for (const row of written) {
    const ago = daysBetween(dayOf(row.last, timezone), day);
    if (ago < 0 || ago >= 7) continue;
    sent.people += 1;
    if (row.answered) sent.answered += 1;
    else {
      sent.waiting += 1;
      sent.oldestDays = Math.max(sent.oldestDays ?? 0, ago);
    }
  }

  const waiting = `
      FROM leads l
      LEFT JOIN deals md ON md.id = ${MAIN_DEAL("l.id")}
      LEFT JOIN pipeline_stages s ON s.id = md.stage_id
     WHERE l.company_id = ?
       AND l.relationship = 'prospect'
       AND l.do_not_contact = 0
       AND l.last_contacted_at IS NULL
       AND COALESCE(s.kind, 'open') = 'open'
       AND NOT EXISTS (SELECT 1 FROM tasks t WHERE t.lead_id = l.id AND t.status = 'open')
       AND NOT EXISTS (SELECT 1 FROM activities a WHERE a.lead_id = l.id AND a.kind IN (${marks}))
       AND NOT EXISTS (SELECT 1 FROM emails e WHERE e.lead_id = l.id AND e.status = 'scheduled')`;
  const rows = db
    .prepare(
      `SELECT l.id, l.name, l.contact_person, l.city, l.email, l.phone, l.linkedin, l.instagram, l.created_at, s.name AS stage_name
       ${waiting}
       ORDER BY l.created_at, l.rowid LIMIT ?`,
    )
    .all(companyId, ...REACHED, REACH_SHOWN) as {
    id: string;
    name: string;
    contact_person: string | null;
    city: string | null;
    email: string | null;
    phone: string | null;
    linkedin: string | null;
    instagram: string | null;
    created_at: string;
    stage_name: string | null;
  }[];
  const count = (db.prepare(`SELECT COUNT(*) AS n ${waiting}`).get(companyId, ...REACHED) as { n: number }).n;

  return {
    today: today.size,
    week: week.size,
    waiting: count,
    sent,
    next: rows.map(
      (row): ReachLead => ({
        id: row.id,
        name: row.name,
        person: row.contact_person,
        stageName: row.stage_name,
        city: row.city,
        addedOn: dayOf(row.created_at, timezone),
        ways: (
          [
            ["email", row.email],
            ["phone", row.phone],
            ["linkedin", row.linkedin],
            ["instagram", row.instagram],
          ] as [ReachWay, string | null][]
        ).flatMap(([way, value]) => (value ? [way] : [])),
      }),
    ),
  };
}

function companyTimezone(db: Db, companyId: string): string {
  const row = db.prepare(`SELECT timezone FROM companies WHERE id = ?`).get(companyId) as
    | { timezone: string }
    | undefined;
  return row?.timezone ?? "UTC";
}

/**
 * How many days without contact makes an open deal "going quiet".
 *
 * Bounded both ways on purpose. Under three days, a contact you spoke to on
 * Monday would be nagging by Thursday and the list would be everyone; past
 * ninety, the list is of people who have already gone, which is a different
 * question and too late to be useful.
 */
export const coldAfterDaysInput = z
  .number({ message: "Give the number of days as a number." })
  .int("Give a whole number of days.")
  .min(3, "Three days is the shortest; any less and everyone is going quiet.")
  .max(90, "Ninety days is the longest; after that they have gone quiet already.");

/**
 * The threshold as it is stored. A value that would not be accepted now -
 * written by hand, or by an older build - reads as the default rather than
 * emptying or flooding the list.
 */
export function readColdAfterDays(db: Db): number {
  const raw = getSetting(db, "coldAfterDays");
  const parsed = coldAfterDaysInput.safeParse(raw === null ? Number.NaN : Number(raw));
  return parsed.success ? parsed.data : DEFAULT_COLD_AFTER_DAYS;
}

/** Checked here as well as at the bridge, so no caller can store what Today would ignore. */
export function setColdAfterDays(db: Db, days: number): number {
  const valid = coldAfterDaysInput.parse(days);
  setSetting(db, "coldAfterDays", String(valid));
  return valid;
}

type ColdRow = {
  id: string;
  name: string;
  city: string | null;
  stage_name: string | null;
  last_touch: string;
};

/**
 * Leads that are still in play and that nothing has happened to for a while.
 *
 * This is the section a spreadsheet can never produce, and the reason the app
 * earns its place. Three exclusions keep it honest:
 *
 *  - **Won and lost stages are out.** A closed lead is not being neglected.
 *  - **A lead with an open task is out**, whatever its date. If you have
 *    already decided what happens next, nothing is falling through; an overdue
 *    task is the right way to be told, and it is already the first section.
 *  - **`field_change` does not count as a touch**, so tidying a record cannot
 *    make a lead look alive. Nor does a call from the prompter that nobody
 *    answered: ringing is not hearing from them. A call logged by hand says
 *    nothing about an answer and still counts.
 *
 * The clock starts at the latest of: the last meaningful activity, the last
 * recorded contact, and the lead's own creation. A brand-new lead is therefore
 * not instantly cold.
 */
export function listCold(
  db: Db,
  companyId: string,
  day: string,
  timezone: string,
  coldAfterDays: number,
): ColdLead[] {
  const placeholders = MEANINGFUL.map(() => "?").join(", ");

  const rows = db
    .prepare(
      `SELECT
         l.id, l.name, l.city, s.name AS stage_name,
         MAX(
           COALESCE(l.last_contacted_at, l.created_at),
           l.created_at,
           COALESCE((
             SELECT MAX(a.occurred_at) FROM activities a
             WHERE a.lead_id = l.id AND a.kind IN (${placeholders})
               AND NOT (a.kind = 'call'
                        AND COALESCE(json_extract(a.meta, '$.outcome'), 'spoke') <> 'spoke')
           ), l.created_at)
         ) AS last_touch
       FROM leads l
       -- Going quiet is about a deal in play: the main deal is an open one
       -- whenever the contact has any.
       JOIN deals md ON md.id = ${MAIN_DEAL("l.id")}
       LEFT JOIN pipeline_stages s ON s.id = md.stage_id
       WHERE l.company_id = ?
         AND COALESCE(s.kind, 'open') = 'open'
         AND NOT EXISTS (
           SELECT 1 FROM tasks t
           WHERE t.lead_id = l.id AND t.status = 'open'
         )
       ORDER BY last_touch ASC`,
    )
    .all(...MEANINGFUL, companyId) as ColdRow[];

  return rows
    .map((row) => {
      const lastTouchedOn = dayOf(row.last_touch, timezone);
      return {
        id: row.id,
        name: row.name,
        city: row.city,
        stageName: row.stage_name,
        lastTouchedOn,
        daysQuiet: daysBetween(lastTouchedOn, day),
      };
    })
    .filter((lead) => lead.daysQuiet >= coldAfterDays);
}
