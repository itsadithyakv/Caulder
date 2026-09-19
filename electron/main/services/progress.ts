import type { Db } from "../db/connection";
import { ENTRY_TEMPLATE } from "@shared/brain";
import { TASK_AREAS, type TaskArea } from "@shared/domain";
import { dayOf, isDay, minutesOf, timeNow, today as todayIn } from "@shared/dates";
import { progressOf, type Happening, type HabitRun, type Progress } from "@shared/progress";

/**
 * Your level, worked out (PLAN.md, phase 17): each thing that happened is
 * read from the table that says so, on the company's own day, and handed to
 * shared/progress.ts. Nothing here is written.
 */

const isArea = (value: unknown): value is TaskArea => TASK_AREAS.includes(value as TaskArea);

/** The words a block's kind is known by, and the area each is for. A break is rest, not kept time. */
const KIND_AREA: Record<string, TaskArea> = {
  class: "college",
  study: "college",
  lecture: "college",
  focus: "company",
  meeting: "company",
  admin: "company",
  sales: "company",
  personal: "personal",
  hobby: "personal",
  health: "health",
  exercise: "health",
  gym: "health",
  workout: "health",
  sport: "health",
  run: "health",
};

function fieldsOf(raw: string | null): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(raw ?? "{}");
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** A stored moment as the company's day: a day stays a day, an instant is read in the company's timezone. */
function dayFrom(value: string, timezone: string): string {
  return isDay(value) ? value : dayOf(value, timezone);
}

export function happeningsOf(db: Db, companyId: string, now: Date = new Date()): { today: string; happenings: Happening[]; habits: HabitRun[] } {
  const company = db.prepare(`SELECT timezone FROM companies WHERE id = ?`).get(companyId) as { timezone: string } | undefined;
  if (!company) throw new Error("That company no longer exists.");
  const { timezone } = company;
  const today = todayIn(timezone, now);
  const happenings: Happening[] = [];

  // Tasks done: the area written on them, or the company's when they are for a contact.
  for (const row of db
    .prepare(`SELECT completed_at, area, lead_id FROM tasks WHERE company_id = ? AND status = 'done' AND completed_at IS NOT NULL`)
    .all(companyId) as { completed_at: string; area: string | null; lead_id: string | null }[]) {
    happenings.push({ kind: "task", day: dayFrom(row.completed_at, timezone), area: isArea(row.area) ? row.area : row.lead_id ? "company" : null });
  }

  // Time kept: blocks not skipped, today's only once they have ended. The page or task it was for says the area first.
  const clock = minutesOf(timeNow(timezone, now));
  for (const row of db
    .prepare(
      `SELECT b.day, b.starts_at, b.minutes, b.kind, p.section, p.fields AS page_fields, t.area AS task_area
         FROM blocks b
         LEFT JOIN brain_pages p ON p.id = b.page_id
         LEFT JOIN tasks t ON t.id = b.task_id
        WHERE b.company_id = ? AND b.outcome IS NULL AND b.day <= ?`,
    )
    .all(companyId, today) as {
    day: string;
    starts_at: string;
    minutes: number;
    kind: string | null;
    section: string | null;
    page_fields: string | null;
    task_area: string | null;
  }[]) {
    const kind = (row.kind ?? "").trim().toLowerCase();
    if (kind === "break") continue;
    if (row.day === today && minutesOf(row.starts_at) + row.minutes > clock) continue;
    const goalArea = row.section === "goals" ? fieldsOf(row.page_fields)["area"] : null;
    const area = isArea(row.task_area)
      ? row.task_area
      : row.section === "studies"
        ? "college"
        : row.section === "hobbies"
          ? "personal"
          : isArea(goalArea)
            ? goalArea
            : (KIND_AREA[kind] ?? null);
    happenings.push({ kind: "time", day: row.day, area, minutes: row.minutes });
  }

  for (const row of db.prepare(`SELECT created_at FROM calls WHERE company_id = ?`).all(companyId) as { created_at: string }[]) {
    happenings.push({ kind: "call", day: dayFrom(row.created_at, timezone), area: "company" });
  }

  for (const row of db
    .prepare(
      `SELECT d.closed_at FROM deals d JOIN pipeline_stages s ON s.id = d.stage_id
        WHERE d.company_id = ? AND s.kind = 'won' AND d.closed_at IS NOT NULL`,
    )
    .all(companyId) as { closed_at: string }[]) {
    happenings.push({ kind: "deal", day: dayFrom(row.closed_at, timezone), area: "company" });
  }

  for (const row of db
    .prepare(`SELECT paid_on FROM invoices WHERE company_id = ? AND status = 'paid' AND paid_on IS NOT NULL`)
    .all(companyId) as { paid_on: string }[]) {
    happenings.push({ kind: "paid", day: dayFrom(row.paid_on, timezone), area: "company" });
  }

  // An entry is made by writing in it, so every entry is a day written about.
  for (const row of db
    .prepare(`SELECT fields FROM brain_pages WHERE company_id = ? AND template = ? AND is_archived = 0`)
    .all(companyId, ENTRY_TEMPLATE) as { fields: string }[]) {
    const day = fieldsOf(row.fields)["day"];
    if (isDay(day)) happenings.push({ kind: "entry", day, area: "personal" });
  }

  // Habits: each tick, and each habit's days for the runs.
  const habitRows = db
    .prepare(`SELECT id, area, weekdays, created_at FROM habits WHERE company_id = ?`)
    .all(companyId) as { id: string; area: string | null; weekdays: string; created_at: string }[];
  const ticks = db.prepare(`SELECT day FROM habit_checks WHERE habit_id = ? ORDER BY day`);
  const habits: HabitRun[] = [];
  for (const habit of habitRows) {
    const days = (ticks.all(habit.id) as { day: string }[]).map((tick) => tick.day);
    for (const day of days) happenings.push({ kind: "habit", day, area: isArea(habit.area) ? habit.area : null });
    const made = dayFrom(habit.created_at, timezone);
    const first = days[0];
    habits.push({
      weekdays: habit.weekdays.split(",").map(Number).filter((day) => day >= 1 && day <= 7),
      days,
      since: first && first < made ? first : made,
    });
  }

  // Goals reached: on the day they were last marked done, read from the page's history.
  const revisions = db.prepare(`SELECT fields, edited_at FROM brain_revisions WHERE page_id = ? ORDER BY revision`);
  for (const goal of db
    .prepare(`SELECT id, fields, updated_at FROM brain_pages WHERE company_id = ? AND section = 'goals' AND is_archived = 0`)
    .all(companyId) as { id: string; fields: string; updated_at: string }[]) {
    const fields = fieldsOf(goal.fields);
    if (fields["done"] !== true) continue;
    let since: string | null = null;
    for (const revision of revisions.all(goal.id) as { fields: string; edited_at: string }[]) {
      if (fieldsOf(revision.fields)["done"] === true) since ??= revision.edited_at;
      else since = null;
    }
    happenings.push({ kind: "goal", day: dayFrom(since ?? goal.updated_at, timezone), area: isArea(fields["area"]) ? fields["area"] : null });
  }

  return { today, happenings, habits };
}

/**
 * Your level is yours, not a company's: what you did in every workspace
 * counts, on the day of the one asked for - your home.
 */
export function progress(db: Db, companyId: string, now: Date = new Date()): Progress {
  const { today, happenings, habits } = happeningsOf(db, companyId, now);
  const others = (db.prepare(`SELECT id FROM companies WHERE id <> ? AND is_archived = 0`).all(companyId) as { id: string }[]).map(
    (row) => happeningsOf(db, row.id, now),
  );
  return progressOf(
    [...happenings, ...others.flatMap((other) => other.happenings)],
    [...habits, ...others.flatMap((other) => other.habits)],
    today,
  );
}
