import type { Db } from "../db/connection";
import type { ColdLead, DayLoad, FunnelSlice, StageKind, Today } from "@shared/domain";
import { daysBetween, dayOf, shiftDay, today as todayIn } from "@shared/dates";
import { getSetting } from "../repositories/settings";
import { listDueOn, listOverdue, listUpcoming } from "../repositories/tasks";
import { listBlocks } from "../repositories/blocks";
import { layOut } from "@shared/day";
import { listOverdueInvoices } from "../repositories/money";

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

  return {
    day,
    blocks: layOut(listBlocks(db, companyId, day)),
    overdue: listOverdue(db, companyId, day),
    dueToday: listDueOn(db, companyId, day),
    upcoming: listUpcoming(db, companyId, day),
    cold: listCold(db, companyId, day, timezone, coldAfterDays),
    coldAfterDays,
    unpaid: listOverdueInvoices(db, companyId, day),
    funnel: buildFunnel(db, companyId),
    ahead: buildAhead(db, companyId, day),
  };
}

/**
 * Counts and value per stage, in funnel order.
 *
 * Never sorted by size: the order is the funnel, and re-ordering it by count
 * would turn a picture of a process into a leaderboard. An empty stage stays
 * in the picture too - a gap in the middle of a funnel is the most useful
 * thing this chart can show.
 */
function buildFunnel(db: Db, companyId: string): FunnelSlice[] {
  const rows = db
    .prepare(
      `SELECT s.id, s.name, s.kind, s.position,
              COUNT(l.id) AS n,
              COALESCE(SUM(l.value), 0) AS total
         FROM pipeline_stages s
         LEFT JOIN leads l ON l.stage_id = s.id AND l.company_id = s.company_id
        WHERE s.company_id = ?
        GROUP BY s.id
        ORDER BY s.position`,
    )
    .all(companyId) as { id: string; name: string; kind: StageKind; n: number; total: number }[];

  const slices: FunnelSlice[] = rows.map((row) => ({
    stageId: row.id,
    name: row.name,
    kind: row.kind,
    count: row.n,
    value: row.total,
  }));

  // Leads left behind by a deleted stage are still leads, and a funnel that
  // does not add up to the number in the sidebar is a funnel nobody trusts.
  const unstaged = db
    .prepare(
      `SELECT COUNT(*) AS n, COALESCE(SUM(value), 0) AS total
         FROM leads WHERE company_id = ? AND stage_id IS NULL`,
    )
    .get(companyId) as { n: number; total: number };

  if (unstaged.n > 0) {
    slices.push({
      stageId: null,
      name: "Unstaged",
      kind: "open",
      count: unstaged.n,
      value: unstaged.total,
    });
  }

  return slices;
}

/** How many days of work the chart looks ahead. Two weeks of planning. */
const AHEAD_DAYS = 14;

/**
 * Open tasks per day for the fortnight, zero-filled.
 *
 * Zero-filled because the useful reading is "Thursday is heavy and Friday is
 * empty" - and a bar chart that simply omits the quiet days says the opposite
 * of that by putting the busy ones next to each other.
 */
function buildAhead(db: Db, companyId: string, day: string): DayLoad[] {
  const last = shiftDay(day, AHEAD_DAYS - 1);

  const rows = db
    .prepare(
      `SELECT due_on AS day, COUNT(*) AS n
         FROM tasks
        WHERE company_id = ? AND status = 'open'
          AND due_on >= ? AND due_on <= ?
        GROUP BY due_on`,
    )
    .all(companyId, day, last) as { day: string; n: number }[];

  const counts = new Map(rows.map((row) => [row.day, row.n]));

  return Array.from({ length: AHEAD_DAYS }, (_, index) => {
    const on = shiftDay(day, index);
    return { day: on, count: counts.get(on) ?? 0 };
  });
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
