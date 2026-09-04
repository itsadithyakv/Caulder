import { randomUUID } from "node:crypto";
import type { Db } from "../db/connection";
import type { Task, TaskInput, TaskKind, TaskStatus } from "@shared/domain";
import { writeActivity } from "./leads";

/**
 * Tasks: the work the Today screen is made of.
 */

type TaskRow = {
  id: string;
  company_id: string;
  lead_id: string | null;
  lead_name: string | null;
  title: string;
  kind: string;
  status: string;
  due_on: string;
  notes: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

function toTask(row: TaskRow): Task {
  return {
    id: row.id,
    companyId: row.company_id,
    leadId: row.lead_id,
    leadName: row.lead_name,
    title: row.title,
    kind: row.kind as TaskKind,
    status: row.status as TaskStatus,
    dueOn: row.due_on,
    notes: row.notes,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Every read joins the lead's name. Today lists tasks, and a task that only
 * says "Follow up" without saying who is useless.
 */
const SELECT = `
  SELECT t.*, l.name AS lead_name
  FROM tasks t
  LEFT JOIN leads l ON l.id = t.lead_id
`;

export function findTask(db: Db, id: string): Task | null {
  const row = db.prepare(`${SELECT} WHERE t.id = ?`).get(id) as TaskRow | undefined;
  return row ? toTask(row) : null;
}

/** Open tasks for one lead, soonest first, then anything already done. */
export function listTasksForLead(db: Db, leadId: string): Task[] {
  const rows = db
    .prepare(
      // Open before done, spelled out: sorting on the status text puts 'done'
      // first, because d sorts before o. Open tasks then run soonest-first,
      // and finished ones most-recently-completed-first.
      `${SELECT} WHERE t.lead_id = ?
       ORDER BY
         CASE t.status WHEN 'open' THEN 0 ELSE 1 END ASC,
         CASE WHEN t.status = 'open' THEN t.due_on END ASC,
         t.completed_at DESC,
         t.created_at ASC`,
    )
    .all(leadId) as TaskRow[];
  return rows.map(toTask);
}

export function createTask(db: Db, companyId: string, input: TaskInput): Task {
  const now = new Date().toISOString();
  const id = randomUUID();

  db.transaction(() => {
    db.prepare(
      `INSERT INTO tasks (
         id, company_id, lead_id, title, kind, status, due_on, notes,
         completed_at, created_at, updated_at
       ) VALUES (@id, @companyId, @leadId, @title, @kind, 'open', @dueOn, @notes,
                 NULL, @now, @now)`,
    ).run({ ...input, id, companyId, now });
  })();

  const created = findTask(db, id);
  if (!created) throw new Error("That task could not be saved.");
  return created;
}

export function updateTask(db: Db, id: string, input: TaskInput): Task {
  const before = findTask(db, id);
  if (!before) throw new Error("That task no longer exists.");

  db.prepare(
    `UPDATE tasks SET lead_id = @leadId, title = @title, kind = @kind,
       due_on = @dueOn, notes = @notes, updated_at = @now
     WHERE id = @id`,
  ).run({ ...input, id, now: new Date().toISOString() });

  const updated = findTask(db, id);
  if (!updated) throw new Error("That task no longer exists.");
  return updated;
}

/**
 * Marks a task done, and records it on the lead's timeline.
 *
 * It does NOT move `last_contacted_at`. Ticking a "Call the principal" task is
 * not proof the call happened, and the going-cold list depends on that
 * distinction being honest — the same rule as a note in Phase 3. Somebody who
 * actually spoke logs a call, which does move it.
 */
export function completeTask(db: Db, id: string): Task {
  const task = findTask(db, id);
  if (!task) throw new Error("That task no longer exists.");
  if (task.status === "done") return task;

  const now = new Date().toISOString();

  db.transaction(() => {
    db.prepare(
      `UPDATE tasks SET status = 'done', completed_at = ?, updated_at = ? WHERE id = ?`,
    ).run(now, now, id);

    if (task.leadId) {
      writeActivity(db, {
        companyId: task.companyId,
        leadId: task.leadId,
        kind: "task_done",
        body: task.title,
        occurredAt: now,
      });
    }
  })();

  const done = findTask(db, id);
  if (!done) throw new Error("That task no longer exists.");
  return done;
}

/** Undoes a completion. The timeline entry stays: it did happen. */
export function reopenTask(db: Db, id: string): Task {
  const now = new Date().toISOString();
  const result = db
    .prepare(
      `UPDATE tasks SET status = 'open', completed_at = NULL, updated_at = ? WHERE id = ?`,
    )
    .run(now, id);
  if (result.changes === 0) throw new Error("That task no longer exists.");

  const task = findTask(db, id);
  if (!task) throw new Error("That task no longer exists.");
  return task;
}

/** Moves a task to another day. The whole point of a follow-up list. */
export function rescheduleTask(db: Db, id: string, dueOn: string): Task {
  const result = db
    .prepare(`UPDATE tasks SET due_on = ?, updated_at = ? WHERE id = ?`)
    .run(dueOn, new Date().toISOString(), id);
  if (result.changes === 0) throw new Error("That task no longer exists.");

  const task = findTask(db, id);
  if (!task) throw new Error("That task no longer exists.");
  return task;
}

export function deleteTask(db: Db, id: string): void {
  const result = db.prepare(`DELETE FROM tasks WHERE id = ?`).run(id);
  if (result.changes === 0) throw new Error("That task no longer exists.");
}

/* ---- The Today queries -------------------------------------------------- */

/** Open tasks whose day has passed. First on the screen, and in red. */
export function listOverdue(db: Db, companyId: string, day: string): Task[] {
  const rows = db
    .prepare(
      `${SELECT} WHERE t.company_id = ? AND t.status = 'open' AND t.due_on < ?
       ORDER BY t.due_on ASC, t.created_at ASC`,
    )
    .all(companyId, day) as TaskRow[];
  return rows.map(toTask);
}

export function listDueOn(db: Db, companyId: string, day: string): Task[] {
  const rows = db
    .prepare(
      `${SELECT} WHERE t.company_id = ? AND t.status = 'open' AND t.due_on = ?
       ORDER BY t.kind ASC, t.created_at ASC`,
    )
    .all(companyId, day) as TaskRow[];
  return rows.map(toTask);
}

export function listUpcoming(
  db: Db,
  companyId: string,
  day: string,
  limit = 10,
): Task[] {
  const rows = db
    .prepare(
      `${SELECT} WHERE t.company_id = ? AND t.status = 'open' AND t.due_on > ?
       ORDER BY t.due_on ASC, t.created_at ASC LIMIT ?`,
    )
    .all(companyId, day, limit) as TaskRow[];
  return rows.map(toTask);
}

/** What the sidebar badge counts: anything open and already late. */
export function countOverdue(db: Db, companyId: string, day: string): number {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n FROM tasks
       WHERE company_id = ? AND status = 'open' AND due_on < ?`,
    )
    .get(companyId, day) as { n: number };
  return row.n;
}
