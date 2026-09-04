import type { Db } from "../db/connection";
import type { ColdLead, Today } from "@shared/domain";
import { daysBetween, dayOf, today as todayIn } from "@shared/dates";
import { getSetting } from "../repositories/settings";
import { listDueOn, listOverdue, listUpcoming } from "../repositories/tasks";
import { countDue, listAwaitingReply } from "../repositories/email";
import { lastLogAt } from "./sync";

/**
 * The Today engine.
 *
 * Assembles the answer to "what do I do this morning" from three questions the
 * database can answer, in the order they need attention: what is late, what is
 * due, and what is quietly going nowhere.
 *
 * All five sections the plan asked for are here: what is late, what is due,
 * what is queued to send, who has replied and is waiting, and what is quietly
 * going nowhere.
 */

const DEFAULT_COLD_AFTER_DAYS = 14;

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

export function buildToday(db: Db, companyId: string, now: Date = new Date()): Today {
  const timezone = companyTimezone(db, companyId);
  const day = todayIn(timezone, now);
  const coldAfterDays = readColdAfterDays(db);

  const lastSyncAt = lastLogAt(db, companyId);

  return {
    day,
    overdue: listOverdue(db, companyId, day),
    dueToday: listDueOn(db, companyId, day),
    upcoming: listUpcoming(db, companyId, day),
    cold: listCold(db, companyId, day, timezone, coldAfterDays),
    coldAfterDays,
    emailsReady: countDue(db, companyId, day),
    awaitingReply: listAwaitingReply(db, companyId).map((message) => ({
      leadId: message.leadId,
      leadName: message.leadName,
      subject: message.subject,
      repliedAt: message.repliedAt,
    })),
    lastSyncAt,
    syncOverdue: hasUnreconciledExport(db, companyId, lastSyncAt),
  };
}

/**
 * Whether an outbox has gone out with no log read since.
 *
 * The bridge is manual, and the risk the plan flags is somebody exporting and
 * then forgetting the other half. Left silent, the app would show stale
 * statuses and look simply wrong.
 */
function hasUnreconciledExport(db: Db, companyId: string, lastSyncAt: string | null): boolean {
  const row = db
    .prepare(
      `SELECT MAX(created_at) AS at FROM sync_batches
       WHERE company_id = ? AND direction = 'outbox'`,
    )
    .get(companyId) as { at: string | null };

  if (!row.at) return false;
  return lastSyncAt === null || row.at > lastSyncAt;
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
 *    make a lead look alive.
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
           ), l.created_at)
         ) AS last_touch
       FROM leads l
       LEFT JOIN pipeline_stages s ON s.id = l.stage_id
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
