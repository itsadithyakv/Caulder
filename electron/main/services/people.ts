import type { Db } from "../db/connection";
import { today as todayIn } from "@shared/dates";
import { taskInput } from "@shared/domain";
import {
  CANDIDATE_STAGES,
  ONBOARDING,
  checklistSteps,
  hireInput,
  stepDueOn,
  type CandidateStage,
  type ChecklistStep,
  type PeopleOverview,
  type PersonDetail,
  type RunnableChecklist,
} from "@shared/people";
import { createTask } from "../repositories/tasks";
import {
  createOpening,
  createPerson,
  deleteOpening,
  deletePerson,
  listOpenings,
  listPeople,
  openingCompany,
  personOr,
  personTasks,
  setStage,
  updateOpening,
  updatePerson,
} from "../repositories/people";

/**
 * The People section: the team, the roles being hired for, and onboarding -
 * a checklist run once for somebody new, whose steps become tasks on the days
 * they fall due and so reach Today like any other work.
 */

function companyOf(db: Db, companyId: string): { timezone: string; currency: string } {
  const row = db.prepare(`SELECT timezone, currency FROM companies WHERE id = ?`).get(companyId) as
    | { timezone: string; currency: string }
    | undefined;
  if (!row) throw new Error("That company no longer exists.");
  return row;
}

function companyOfPerson(db: Db, personId: string): string {
  const row = db.prepare(`SELECT company_id FROM people WHERE id = ?`).get(personId) as
    | { company_id: string }
    | undefined;
  if (!row) throw new Error("That person is no longer here.");
  return row.company_id;
}

/** Playbook pages with steps in them, any of which can be run to onboard somebody. */
function runnableChecklists(db: Db, companyId: string): RunnableChecklist[] {
  const pages = db
    .prepare(
      `SELECT id, title, body FROM brain_pages
        WHERE company_id = ? AND section = 'playbooks' AND is_archived = 0
        ORDER BY title COLLATE NOCASE`,
    )
    .all(companyId) as { id: string; title: string; body: string }[];
  return pages
    .map((page) => ({ pageId: page.id, title: page.title, steps: checklistSteps(page.body).length }))
    .filter((checklist) => checklist.steps > 0);
}

export function buildPeople(db: Db, companyId: string, now: Date = new Date()): PeopleOverview {
  const company = companyOf(db, companyId);
  const day = todayIn(company.timezone, now);
  return {
    day,
    currency: company.currency,
    people: listPeople(db, companyId, day),
    openings: listOpenings(db, companyId),
    checklists: runnableChecklists(db, companyId),
  };
}

export function personDetail(db: Db, personId: string, now: Date = new Date()): PersonDetail {
  const companyId = companyOfPerson(db, personId);
  const company = companyOf(db, companyId);
  const day = todayIn(company.timezone, now);
  return {
    day,
    currency: company.currency,
    person: personOr(db, personId, day),
    tasks: personTasks(db, personId),
    openings: listOpenings(db, companyId),
    checklists: runnableChecklists(db, companyId),
  };
}

function todayFor(db: Db, companyId: string, now: Date): string {
  return todayIn(companyOf(db, companyId).timezone, now);
}

export function addPerson(db: Db, companyId: string, raw: unknown, now: Date = new Date()): PersonDetail {
  const person = createPerson(db, companyId, raw, todayFor(db, companyId, now), now);
  return personDetail(db, person.id, now);
}

export function editPerson(db: Db, personId: string, raw: unknown, now: Date = new Date()): PersonDetail {
  const companyId = companyOfPerson(db, personId);
  updatePerson(db, personId, raw, todayFor(db, companyId, now), now);
  return personDetail(db, personId, now);
}

export function removePerson(db: Db, personId: string): void {
  companyOfPerson(db, personId);
  deletePerson(db, personId);
}

export function moveCandidate(db: Db, personId: string, stage: unknown, now: Date = new Date()): PeopleOverview {
  if (!(CANDIDATE_STAGES as readonly unknown[]).includes(stage)) throw new Error("That is not a stage.");
  const companyId = companyOfPerson(db, personId);
  setStage(db, personId, stage as CandidateStage, now);
  return buildPeople(db, companyId, now);
}

/**
 * A candidate hired: the kind they are joining as, the day they start, and
 * the role marked filled. The same row, so the notes from the interviews
 * stay with them.
 */
export function hire(db: Db, personId: string, raw: unknown, now: Date = new Date()): PersonDetail {
  const companyId = companyOfPerson(db, personId);
  const day = todayFor(db, companyId, now);
  const person = personOr(db, personId, day);
  if (person.kind !== "candidate") throw new Error("They already work here.");
  const input = hireInput.parse(raw);
  const at = now.toISOString();
  db.transaction(() => {
    db.prepare(
      `UPDATE people SET kind = ?, stage = 'hired', starts_on = COALESCE(?, starts_on), updated_at = ? WHERE id = ?`,
    ).run(input.kind, input.startsOn, at, personId);
    if (input.fillOpening && person.openingId) {
      db.prepare(`UPDATE openings SET status = 'filled', updated_at = ? WHERE id = ?`).run(at, person.openingId);
    }
  })();
  return personDetail(db, personId, now);
}

/**
 * Onboarding: a checklist's steps as tasks, due that many days after the
 * start - never before today - and tied to the person, so their page shows
 * how far along it is. The checklist is the default for their kind, or a
 * playbook page's `- [ ]` steps.
 */
export function onboard(db: Db, personId: string, playbookId: unknown, now: Date = new Date()): PersonDetail {
  const companyId = companyOfPerson(db, personId);
  const day = todayFor(db, companyId, now);
  const person = personOr(db, personId, day);
  if (person.kind === "candidate") throw new Error("Hire them first; onboarding is for somebody joining.");

  let steps: readonly ChecklistStep[];
  if (typeof playbookId === "string" && playbookId) {
    const page = db
      .prepare(`SELECT body FROM brain_pages WHERE id = ? AND company_id = ? AND section = 'playbooks'`)
      .get(playbookId, companyId) as { body: string } | undefined;
    if (!page) throw new Error("That playbook is no longer here.");
    steps = checklistSteps(page.body);
  } else {
    steps = ONBOARDING[person.kind];
  }
  if (steps.length === 0) throw new Error("That checklist has no steps. Write each as - [ ] on its own line.");

  db.transaction(() => {
    for (const step of steps) {
      const task = createTask(
        db,
        companyId,
        taskInput.parse({
          title: `${step.title} (${person.name})`.slice(0, 200),
          kind: "todo",
          dueOn: stepDueOn(person.startsOn, step.day, day),
          leadId: person.leadId,
        }),
      );
      db.prepare(`UPDATE tasks SET person_id = ? WHERE id = ?`).run(personId, task.id);
    }
    db.prepare(`UPDATE people SET onboarded_on = COALESCE(onboarded_on, ?), updated_at = ? WHERE id = ?`).run(
      day,
      now.toISOString(),
      personId,
    );
  })();
  return personDetail(db, personId, now);
}

export function addOpening(db: Db, companyId: string, raw: unknown, now: Date = new Date()): PeopleOverview {
  createOpening(db, companyId, raw, now);
  return buildPeople(db, companyId, now);
}

export function editOpening(db: Db, id: string, raw: unknown, now: Date = new Date()): PeopleOverview {
  const companyId = openingCompany(db, id);
  updateOpening(db, id, raw, now);
  return buildPeople(db, companyId, now);
}

export function removeOpening(db: Db, id: string, now: Date = new Date()): PeopleOverview {
  const companyId = openingCompany(db, id);
  deleteOpening(db, id);
  return buildPeople(db, companyId, now);
}
