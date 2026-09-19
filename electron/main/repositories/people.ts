import { randomUUID } from "node:crypto";
import type { Db } from "../db/connection";
import {
  openingInput,
  personInput,
  statusOf,
  vestingOf,
  type CandidateStage,
  type Opening,
  type Person,
  type PersonTask,
} from "@shared/people";

/**
 * People and open roles, as rows. Status, vesting and how far onboarding has
 * got are worked out on the way out from the day asked about, so nothing
 * stored goes stale overnight.
 */

type PersonRow = {
  id: string;
  company_id: string;
  name: string;
  kind: Person["kind"];
  role: string | null;
  email: string | null;
  phone: string | null;
  lead_id: string | null;
  lead_name: string | null;
  starts_on: string | null;
  ends_on: string | null;
  pay: number | null;
  pay_per: Person["payPer"];
  equity: number | null;
  vesting_months: number | null;
  cliff_months: number | null;
  owns: string | null;
  opening_id: string | null;
  opening_title: string | null;
  stage: Person["stage"];
  onboarded_on: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  tasks_total: number;
  tasks_done: number;
};

const SELECT_PEOPLE = `
  SELECT p.*, l.name AS lead_name, o.title AS opening_title,
         (SELECT COUNT(*) FROM tasks t WHERE t.person_id = p.id) AS tasks_total,
         (SELECT COUNT(*) FROM tasks t WHERE t.person_id = p.id AND t.status = 'done') AS tasks_done
    FROM people p
    LEFT JOIN leads l ON l.id = p.lead_id
    LEFT JOIN openings o ON o.id = p.opening_id`;

/** Founders first, then the team by kind, then candidates; by name within each. */
const ORDER = `
  ORDER BY CASE p.kind WHEN 'founder' THEN 0 WHEN 'employee' THEN 1 WHEN 'intern' THEN 2
                       WHEN 'freelancer' THEN 3 WHEN 'advisor' THEN 4 ELSE 5 END,
           p.name COLLATE NOCASE`;

function toPerson(row: PersonRow, today: string): Person {
  const person = {
    id: row.id,
    companyId: row.company_id,
    name: row.name,
    kind: row.kind,
    role: row.role,
    email: row.email,
    phone: row.phone,
    leadId: row.lead_id,
    leadName: row.lead_name,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    pay: row.pay,
    payPer: row.pay_per,
    equity: row.equity,
    vestingMonths: row.vesting_months,
    cliffMonths: row.cliff_months,
    owns: row.owns,
    openingId: row.opening_id,
    openingTitle: row.opening_title,
    stage: row.stage,
    notes: row.notes,
    onboardedOn: row.onboarded_on,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  return {
    ...person,
    status: statusOf(person, today),
    vesting: vestingOf(person, today),
    onboarding: row.tasks_total > 0 ? { total: row.tasks_total, done: row.tasks_done } : null,
  };
}

export function listPeople(db: Db, companyId: string, today: string): Person[] {
  const rows = db.prepare(`${SELECT_PEOPLE} WHERE p.company_id = ? ${ORDER}`).all(companyId) as PersonRow[];
  return rows.map((row) => toPerson(row, today));
}

function findPerson(db: Db, id: string, today: string): Person | null {
  const row = db.prepare(`${SELECT_PEOPLE} WHERE p.id = ?`).get(id) as PersonRow | undefined;
  return row ? toPerson(row, today) : null;
}

export function personOr(db: Db, id: string, today: string): Person {
  const found = findPerson(db, id, today);
  if (!found) throw new Error("That person is no longer here.");
  return found;
}

/** A contact and a role named on a person have to be this company's. */
function checkOwners(db: Db, companyId: string, leadId: string | null, openingId: string | null): void {
  if (leadId) {
    const lead = db.prepare(`SELECT company_id FROM leads WHERE id = ?`).get(leadId) as { company_id: string } | undefined;
    if (lead?.company_id !== companyId) throw new Error("That contact is not in this company.");
  }
  if (openingId) {
    const opening = db.prepare(`SELECT company_id FROM openings WHERE id = ?`).get(openingId) as
      | { company_id: string }
      | undefined;
    if (opening?.company_id !== companyId) throw new Error("That role is not in this company.");
  }
}

/**
 * What is stored for a person of a kind: a candidate has a stage and no
 * terms yet, and everybody else has no stage - except that a hired candidate
 * keeps "hired", which is how the role knows who filled it.
 */
function tidy(input: ReturnType<typeof personInput.parse>) {
  const candidate = input.kind === "candidate";
  return {
    ...input,
    email: input.email === "" ? null : input.email,
    stage: candidate ? (input.stage ?? "applied") : input.stage === "hired" ? "hired" : null,
  };
}

export function createPerson(db: Db, companyId: string, raw: unknown, today: string, now: Date = new Date()): Person {
  const input = tidy(personInput.parse(raw));
  checkOwners(db, companyId, input.leadId, input.openingId);
  const id = randomUUID();
  const at = now.toISOString();
  db.prepare(
    `INSERT INTO people (id, company_id, name, kind, role, email, phone, lead_id, starts_on, ends_on, pay, pay_per,
                         equity, vesting_months, cliff_months, owns, opening_id, stage, notes, created_at, updated_at)
     VALUES (@id, @companyId, @name, @kind, @role, @email, @phone, @leadId, @startsOn, @endsOn, @pay, @payPer,
             @equity, @vestingMonths, @cliffMonths, @owns, @openingId, @stage, @notes, @at, @at)`,
  ).run({ ...input, id, companyId, at });
  return personOr(db, id, today);
}

export function updatePerson(db: Db, id: string, raw: unknown, today: string, now: Date = new Date()): Person {
  const before = personOr(db, id, today);
  const input = tidy(personInput.parse(raw));
  checkOwners(db, before.companyId, input.leadId, input.openingId);
  db.prepare(
    `UPDATE people SET name = @name, kind = @kind, role = @role, email = @email, phone = @phone, lead_id = @leadId,
       starts_on = @startsOn, ends_on = @endsOn, pay = @pay, pay_per = @payPer, equity = @equity,
       vesting_months = @vestingMonths, cliff_months = @cliffMonths, owns = @owns, opening_id = @openingId,
       stage = @stage, notes = @notes, updated_at = @at
     WHERE id = @id`,
  ).run({ ...input, id, at: now.toISOString() });
  return personOr(db, id, today);
}

/** Their onboarding tasks stay, as tasks: somebody may still need to do them. */
export function deletePerson(db: Db, id: string): void {
  db.prepare(`DELETE FROM people WHERE id = ?`).run(id);
}

export function setStage(db: Db, id: string, stage: CandidateStage, now: Date = new Date()): void {
  const row = db.prepare(`SELECT kind FROM people WHERE id = ?`).get(id) as { kind: string } | undefined;
  if (!row) throw new Error("That person is no longer here.");
  if (row.kind !== "candidate") throw new Error("Only a candidate has a stage.");
  if (stage === "hired") throw new Error("Hire them from their page, which asks what as.");
  db.prepare(`UPDATE people SET stage = ?, updated_at = ? WHERE id = ?`).run(stage, now.toISOString(), id);
}

export function personTasks(db: Db, personId: string): PersonTask[] {
  const rows = db
    .prepare(`SELECT id, title, due_on, status FROM tasks WHERE person_id = ? ORDER BY due_on, created_at`)
    .all(personId) as { id: string; title: string; due_on: string; status: string }[];
  return rows.map((row) => ({ id: row.id, title: row.title, dueOn: row.due_on, done: row.status === "done" }));
}

/* ---- Open roles ------------------------------------------------------------ */

type OpeningRow = {
  id: string;
  company_id: string;
  title: string;
  status: Opening["status"];
  pay: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  in_play: number;
};

function toOpening(row: OpeningRow): Opening {
  return {
    id: row.id,
    companyId: row.company_id,
    title: row.title,
    status: row.status,
    pay: row.pay,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    inPlay: row.in_play,
  };
}

export function listOpenings(db: Db, companyId: string): Opening[] {
  const rows = db
    .prepare(
      `SELECT o.*,
              (SELECT COUNT(*) FROM people p
                WHERE p.opening_id = o.id AND p.kind = 'candidate'
                  AND p.stage IN ('applied', 'talking', 'interview', 'offer')) AS in_play
         FROM openings o
        WHERE o.company_id = ?
        ORDER BY CASE o.status WHEN 'open' THEN 0 WHEN 'paused' THEN 1 ELSE 2 END, o.title COLLATE NOCASE`,
    )
    .all(companyId) as OpeningRow[];
  return rows.map(toOpening);
}

export function openingCompany(db: Db, id: string): string {
  const row = db.prepare(`SELECT company_id FROM openings WHERE id = ?`).get(id) as { company_id: string } | undefined;
  if (!row) throw new Error("That role is no longer here.");
  return row.company_id;
}

export function createOpening(db: Db, companyId: string, raw: unknown, now: Date = new Date()): string {
  const input = openingInput.parse(raw);
  const id = randomUUID();
  const at = now.toISOString();
  db.prepare(
    `INSERT INTO openings (id, company_id, title, status, pay, notes, created_at, updated_at)
     VALUES (@id, @companyId, @title, @status, @pay, @notes, @at, @at)`,
  ).run({ ...input, id, companyId, at });
  return id;
}

export function updateOpening(db: Db, id: string, raw: unknown, now: Date = new Date()): void {
  openingCompany(db, id);
  const input = openingInput.parse(raw);
  db.prepare(
    `UPDATE openings SET title = @title, status = @status, pay = @pay, notes = @notes, updated_at = @at WHERE id = @id`,
  ).run({ ...input, id, at: now.toISOString() });
}

/** Its candidates stay, without a role: they applied, and may fit the next one. */
export function deleteOpening(db: Db, id: string): void {
  db.prepare(`DELETE FROM openings WHERE id = ?`).run(id);
}
