import { randomUUID } from "node:crypto";
import type { Db } from "../db/connection";
import type { Task, TaskInput, TaskKind, TaskStatus } from "@shared/domain";
import { rememberDeleted } from "./google";
import { writeActivity } from "./leads";

/**
 * Tasks: the work the Today screen is made of.
 */

type TaskRow = {
  id: string;
  company_id: string;
  lead_id: string | null;
  lead_name: string | null;
  page_id: string | null;
  page_title: string | null;
  title: string;
  kind: string;
  area: string | null;
  priority: string | null;
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
    pageId: row.page_id,
    pageTitle: row.page_title,
    title: row.title,
    kind: row.kind as TaskKind,
    area: row.area,
    priority: row.priority,
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
 * says "Follow up" without saying who is useless. The page that made it
 * comes too, so a playbook's step can say which playbook.
 */
const SELECT = `
  SELECT t.*, l.name AS lead_name, p.title AS page_title
  FROM tasks t
  LEFT JOIN leads l ON l.id = t.lead_id
  LEFT JOIN brain_pages p ON p.id = t.page_id
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
         id, company_id, lead_id, title, kind, area, priority, status, due_on, notes,
         completed_at, created_at, updated_at
       ) VALUES (@id, @companyId, @leadId, @title, @kind, @area, @priority, 'open', @dueOn,
                 @notes, NULL, @now, @now)`,
    ).run({
      ...input,
      area: input.area ?? null,
      // Accepted by the schema since migration 12 and never written until
      // now, so every task anybody marked as having to happen was saved as
      // though nobody had said.
      priority: input.priority ?? null,
      id,
      companyId,
      now,
    });
  })();

  const created = findTask(db, id);
  if (!created) throw new Error("That task could not be saved.");
  return created;
}

export function updateTask(db: Db, id: string, input: TaskInput): Task {
  const before = findTask(db, id);
  if (!before) throw new Error("That task no longer exists.");

  db.prepare(
    `UPDATE tasks SET is_dirty = 1, lead_id = @leadId, title = @title, kind = @kind,
       area = @area, priority = @priority, due_on = @dueOn, notes = @notes, updated_at = @now
     WHERE id = @id`,
  ).run({
    ...input,
    area: input.area ?? null,
    priority: input.priority ?? null,
    id,
    now: new Date().toISOString(),
  });

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
      `UPDATE tasks SET is_dirty = 1, status = 'done', completed_at = ?, updated_at = ? WHERE id = ?`,
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
      `UPDATE tasks SET is_dirty = 1, status = 'open', completed_at = NULL, updated_at = ? WHERE id = ?`,
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
    .prepare(`UPDATE tasks SET is_dirty = 1, due_on = ?, updated_at = ? WHERE id = ?`)
    .run(dueOn, new Date().toISOString(), id);
  if (result.changes === 0) throw new Error("That task no longer exists.");

  const task = findTask(db, id);
  if (!task) throw new Error("That task no longer exists.");
  return task;
}

/**
 * Deleting one, and remembering that it went.
 *
 * Same reasoning as a block: once the row is gone nothing is left to say the
 * copy in Google Tasks should go too, so the deletion has to outlive it.
 */
export function deleteTask(db: Db, id: string): void {
  const row = db
    .prepare(`SELECT company_id, external_id FROM tasks WHERE id = ?`)
    .get(id) as { company_id: string; external_id: string | null } | undefined;
  if (!row) throw new Error("That task no longer exists.");

  db.transaction(() => {
    if (row.external_id) rememberDeleted(db, row.company_id, "task", row.external_id);
    db.prepare(`DELETE FROM tasks WHERE id = ?`).run(id);
  })();
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
