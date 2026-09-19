import type { Db } from "../db/connection";
import { isDay, today as todayIn } from "@shared/dates";
import { taskInput } from "@shared/domain";
import { dueOfStep, matchesOwner, pageSteps, type PageTasks, type StepTask } from "@shared/steps";
import { daysLeftOf } from "@shared/deadlines";
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
 * The founder's own pages work like a meeting (PLAN.md, part four): a
 * course's assignments, an exam's revision, a hobby's or a goal's next steps
 * become tasks once each, in the area they belong to - college for studies,
 * personal for a hobby, and whatever the goal says for a goal - so Today can
 * weigh the degree against the company.
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
const ONCE = new Set(["meetings", "studies", "hobbies", "goals"]);
const AREAS = new Set(["college", "company", "personal", "health"]);

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

/** Which part of life a page's tasks belong to. A meeting's are the company's by being a meeting, which needs no tag. */
function areaOf(page: PageRow): string | null {
  if (page.section === "studies") return "college";
  if (page.section === "hobbies") return "personal";
  if (page.section === "goals") {
    const area = fieldsOf(page)["area"];
    return typeof area === "string" && AREAS.has(area) ? area : "personal";
  }
  return null;
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

/** Somebody on the team named in an item: "@Asha" is Asha Rao, if she is still here. */
function ownerFor(db: Db, companyId: string, written: string | null, today: string): { id: string; name: string } | null {
  if (!written) return null;
  const people = db
    .prepare(
      `SELECT id, name FROM people
        WHERE company_id = ? AND kind != 'candidate' AND (ends_on IS NULL OR ends_on >= ?)`,
    )
    .all(companyId, today) as { id: string; name: string }[];
  return people.find((person) => matchesOwner(person.name, written)) ?? null;
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
  let fallback = page.mode === "actions" ? ACTION_DAYS : 0;
  let lead: { id: string; name: string } | null = null;
  let chosen = steps;
  const area = areaOf(page);

  if (page.mode === "actions") {
    const fields = fieldsOf(page);
    // A meeting's items, and a class's, are counted from the day it was held.
    const heldOn = fields["heldOn"];
    if (isDay(heldOn) && page.section !== "hobbies" && page.section !== "goals") start = heldOn;
    // Revision for an exam is due the day before it, while there is a day before it.
    const examOn = fields["examOn"];
    if (page.template === "exam" && isDay(examOn) && examOn > today) {
      start = today;
      fallback = Math.max(0, daysLeftOf(examOn, today) - 1);
    }
    chosen = steps.filter((step) => !step.ticked && !made.has(step.title));
    if (chosen.length === 0) throw new Error("Every open step is a task already.");
  } else if (typeof leadId === "string" && leadId) {
    lead = { id: leadId, name: contactName(db, page.company_id, leadId) };
  }

  db.transaction(() => {
    for (const step of chosen) {
      const owner = ownerFor(db, page.company_id, step.owner, today);
      const who = owner?.name ?? step.owner;
      const task = createTask(
        db,
        page.company_id,
        taskInput.parse({
          title: `${step.title}${who ? ` (${who})` : ""}${lead ? ` - ${lead.name}` : ""}`.slice(0, 200),
          kind: "todo",
          dueOn: dueOfStep(step, start, today, fallback),
          leadId: lead?.id ?? null,
          area,
        }),
      );
      db.prepare(`UPDATE tasks SET page_id = ?, source_step = ?, person_id = ? WHERE id = ?`).run(
        page.id,
        step.title,
        owner?.id ?? null,
        task.id,
      );
    }
  })();
  return pageTasks(db, pageId);
}
