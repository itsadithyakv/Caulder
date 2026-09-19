import { MAIN_DEAL } from "../repositories/main-deal";
import type { Db } from "../db/connection";
import type { ColdLead, Today } from "@shared/domain";
import { daysBetween, dayOf, today as todayIn } from "@shared/dates";
import { getSetting } from "../repositories/settings";
import { listDueOn, listOverdue, listUpcoming } from "../repositories/tasks";
import { listBlocks } from "../repositories/blocks";
import { layOut } from "@shared/day";
import { listOverdueInvoices } from "../repositories/money";
import { listRecentReplies } from "../repositories/mail";
import { renewalsFor } from "./costs";
import { dueSoon } from "./deadlines";

/**
 * The Today engine.
 *
 * Assembles the answer to "what do I do this morning" from the questions the
 * database can answer, in the order they need attention: what money is late,
 * what work is late, what is due, what is in the hours, and what is quietly
 * going nowhere.
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

  return {
    day,
    blocks: layOut(all((id) => listBlocks(db, id, day))),
    overdue: all((id) => listOverdue(db, id, day), byDue),
    dueToday: all((id) => listDueOn(db, id, day), (a, b) => a.kind.localeCompare(b.kind) || a.createdAt.localeCompare(b.createdAt)),
    upcoming: all((id) => listUpcoming(db, id, day), byDue),
    cold: all((id) => listCold(db, id, day, companyTimezone(db, id), coldAfterDays), (a, b) => a.lastTouchedOn.localeCompare(b.lastTouchedOn)),
    coldAfterDays,
    unpaid: all((id) => listOverdueInvoices(db, id, day), (a, b) => a.dueOn.localeCompare(b.dueOn)),
    renewals: all((id) => renewalsFor(db, id, day), (a, b) => a.nextOn.localeCompare(b.nextOn)),
    deadlines: all((id) => dueSoon(db, id, day), (a, b) => a.dueOn.localeCompare(b.dueOn)),
    replies: all(
      (id) => listRecentReplies(db, id, new Date(now.getTime() - REPLIES_FOR_DAYS * 24 * 60 * 60 * 1000).toISOString()),
      (a, b) => b.repliedAt.localeCompare(a.repliedAt),
    ),
  };
}

function companyTimezone(db: Db, companyId: string): string {
  const row = db.prepare(`SELECT timezone FROM companies WHERE id = ?`).get(companyId) as
    | { timezone: string }
    | undefined;
  return row?.timezone ?? "UTC";
}

function readColdAfterDays(db: Db): number {
  const raw = getSetting(db, "coldAfterDays");
  const parsed = raw === null ? Number.NaN : Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 365) {
    return DEFAULT_COLD_AFTER_DAYS;
  }
  return parsed;
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
function listCold(
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
