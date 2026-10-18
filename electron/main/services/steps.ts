import type { Db } from "../db/connection";
import { isDay, today as todayIn } from "@shared/dates";
import { taskInput } from "@shared/domain";
import { dueOfStep, pageSteps, type PageTasks, type StepTask } from "@shared/steps";
import { createTask } from "../repositories/tasks";

/**
 * A page's steps as tasks.
 *
 * A meeting's action items become tasks once each: "Make the tasks" after the
 * meeting makes the ones not made yet, due a week after it unless the item
 * says otherwise, with whoever was @-named as the owner. A playbook is run:
 * every step becomes a task again each time, for a contact if one is named -
 * onboarding a client is the same list for every client.
 *
 */

/** Days after a meeting that an action item without a date is due: the next weekly check-in. */
const ACTION_DAYS = 7;

type PageRow = {
  id: string;
  company_id: string;
  section: string;
  template: string;
  title: string;
  body: string;
  fields: string;
};

/** Sections whose steps become tasks once each, like a meeting's action items. */
const ONCE = new Set(["meetings"]);

function pageOf(db: Db, pageId: string): PageRow & { mode: PageTasks["mode"] } {
  const row = db
    .prepare(`SELECT id, company_id, section, template, title, body, fields FROM brain_pages WHERE id = ?`)
    .get(pageId) as PageRow | undefined;
  if (!row) throw new Error("That page no longer exists.");
  if (ONCE.has(row.section)) return { ...row, mode: "actions" };
  if (row.section === "playbooks") return { ...row, mode: "run" };
  throw new Error("Only steps on a meeting, a playbook, or one of your own pages become tasks.");
}

function fieldsOf(page: PageRow): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(page.fields);
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}


type TaskRow = { id: string; source_step: string | null; due_on: string; status: string };

function tasksOf(db: Db, pageId: string): TaskRow[] {
  return db
    .prepare(`SELECT id, source_step, due_on, status FROM tasks WHERE page_id = ? ORDER BY created_at DESC`)
    .all(pageId) as TaskRow[];
}

export function pageTasks(db: Db, pageId: string): PageTasks {
  const page = pageOf(db, pageId);
  const tasks = tasksOf(db, pageId);
  const steps: StepTask[] = pageSteps(page.body).map((step) => {
    const task = page.mode === "actions" ? tasks.find((each) => each.source_step === step.title) : undefined;
    return { step, task: task ? { id: task.id, dueOn: task.due_on, done: task.status === "done" } : null };
  });
  return {
    mode: page.mode,
    steps,
    runs: { tasks: tasks.length, open: tasks.filter((task) => task.status === "open").length },
  };
}

function contactName(db: Db, companyId: string, leadId: string): string {
  const row = db.prepare(`SELECT company_id, name FROM leads WHERE id = ?`).get(leadId) as
    | { company_id: string; name: string }
    | undefined;
  if (row?.company_id !== companyId) throw new Error("That contact is not in this company.");
  return row.name;
}

export function makeTasks(db: Db, pageId: string, leadId: unknown, now: Date = new Date()): PageTasks {
  const page = pageOf(db, pageId);
  const timezone = (db.prepare(`SELECT timezone FROM companies WHERE id = ?`).get(page.company_id) as { timezone: string })
    .timezone;
  const today = todayIn(timezone, now);
  const steps = pageSteps(page.body);
  if (steps.length === 0) throw new Error("There are no steps to make tasks of. Write each as - [ ] on its own line.");

  const made = new Set(tasksOf(db, pageId).map((task) => task.source_step));
  let start = today;
  const fallback = page.mode === "actions" ? ACTION_DAYS : 0;
  let lead: { id: string; name: string } | null = null;
  let chosen = steps;

  if (page.mode === "actions") {
    const fields = fieldsOf(page);
    // A meeting's items are counted from the day it was held.
    const heldOn = fields["heldOn"];
    if (isDay(heldOn)) start = heldOn;
    chosen = steps.filter((step) => !step.ticked && !made.has(step.title));
    if (chosen.length === 0) throw new Error("Every open step is a task already.");
  } else if (typeof leadId === "string" && leadId) {
    lead = { id: leadId, name: contactName(db, page.company_id, leadId) };
  }

  db.transaction(() => {
    for (const step of chosen) {
      // Whoever an item was @-named for is kept in the task's words: there is no team to look them up in.
      const who = step.owner;
      const task = createTask(
        db,
        page.company_id,
        taskInput.parse({
          title: `${step.title}${who ? ` (${who})` : ""}${lead ? ` - ${lead.name}` : ""}`.slice(0, 200),
          kind: "todo",
          dueOn: dueOfStep(step, start, today, fallback),
          leadId: lead?.id ?? null,
        }),
      );
      db.prepare(`UPDATE tasks SET page_id = ?, source_step = ? WHERE id = ?`).run(
        page.id,
        step.title,
        task.id,
      );
    }
  })();
  return pageTasks(db, pageId);
}
