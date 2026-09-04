import { randomUUID } from "node:crypto";
import type { Db } from "../db/connection";
import type { Sequence, SequenceInput, SequenceStep } from "@shared/email";
import { queueInput } from "@shared/email";
import { render } from "@shared/render";
import { dayOf, shiftDay, today as todayIn } from "@shared/dates";
import { queueMessage } from "../repositories/email";
import { findLead } from "../repositories/leads";

/**
 * Cadences.
 *
 * A sequence is an ordered list of steps, each with a template and a number of
 * days. The offset is counted from the previous step actually being **sent**,
 * not from enrolment — because the send confirmation arrives late over the
 * file bridge, and scheduling from the queue time would collapse a three-week
 * cadence into whatever day the user happened to run the export.
 */

/* ---- Reading ------------------------------------------------------------ */

export function listSequences(db: Db, companyId: string): Sequence[] {
  const rows = db
    .prepare(`SELECT * FROM sequences WHERE company_id = ? ORDER BY name COLLATE NOCASE`)
    .all(companyId) as Record<string, unknown>[];

  return rows.map((row) => {
    const id = row["id"] as string;
    return {
      id,
      companyId: row["company_id"] as string,
      name: row["name"] as string,
      isActive: (row["is_active"] as number) === 1,
      steps: listSteps(db, id),
      activeCount: countActive(db, id),
    };
  });
}

function listSteps(db: Db, sequenceId: string): SequenceStep[] {
  const rows = db
    .prepare(
      `SELECT s.*, t.name AS template_name
       FROM sequence_steps s
       JOIN email_templates t ON t.id = s.template_id
       WHERE s.sequence_id = ? ORDER BY s.position`,
    )
    .all(sequenceId) as Record<string, unknown>[];

  return rows.map((row) => ({
    id: row["id"] as string,
    templateId: row["template_id"] as string,
    templateName: row["template_name"] as string,
    position: row["position"] as number,
    offsetDays: row["offset_days"] as number,
  }));
}

function countActive(db: Db, sequenceId: string): number {
  const row = db
    .prepare(`SELECT COUNT(*) AS n FROM enrollments WHERE sequence_id = ? AND status = 'active'`)
    .get(sequenceId) as { n: number };
  return row.n;
}

/* ---- Editing ------------------------------------------------------------ */

export function createSequence(
  db: Db,
  companyId: string,
  input: SequenceInput,
): Sequence[] {
  try {
    db.prepare(
      `INSERT INTO sequences (id, company_id, name, is_active, created_at)
       VALUES (?, ?, ?, 1, ?)`,
    ).run(randomUUID(), companyId, input.name, new Date().toISOString());
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    if (message.includes("UNIQUE")) {
      throw new Error(`There is already a sequence called "${input.name}".`);
    }
    throw cause;
  }
  return listSequences(db, companyId);
}

export function deleteSequence(db: Db, sequenceId: string): Sequence[] {
  const companyId = sequenceCompany(db, sequenceId);
  db.prepare(`DELETE FROM sequences WHERE id = ?`).run(sequenceId);
  return listSequences(db, companyId);
}

export function addStep(
  db: Db,
  sequenceId: string,
  templateId: string,
  offsetDays: number,
): Sequence[] {
  const companyId = sequenceCompany(db, sequenceId);
  const last = db
    .prepare(
      `SELECT COALESCE(MAX(position), -1) AS p FROM sequence_steps WHERE sequence_id = ?`,
    )
    .get(sequenceId) as { p: number };

  db.prepare(
    `INSERT INTO sequence_steps (id, sequence_id, template_id, position, offset_days, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    randomUUID(),
    sequenceId,
    templateId,
    last.p + 1,
    Math.max(0, Math.trunc(offsetDays)),
    new Date().toISOString(),
  );

  return listSequences(db, companyId);
}

export function removeStep(db: Db, stepId: string): Sequence[] {
  const row = db
    .prepare(`SELECT sequence_id FROM sequence_steps WHERE id = ?`)
    .get(stepId) as { sequence_id: string } | undefined;
  if (!row) throw new Error("That step no longer exists.");

  const companyId = sequenceCompany(db, row.sequence_id);
  db.transaction(() => {
    db.prepare(`DELETE FROM sequence_steps WHERE id = ?`).run(stepId);
    const remaining = db
      .prepare(`SELECT id FROM sequence_steps WHERE sequence_id = ? ORDER BY position`)
      .all(row.sequence_id) as { id: string }[];
    const update = db.prepare(`UPDATE sequence_steps SET position = ? WHERE id = ?`);
    remaining.forEach((step, index) => update.run(index, step.id));
  })();

  return listSequences(db, companyId);
}

function sequenceCompany(db: Db, sequenceId: string): string {
  const row = db.prepare(`SELECT company_id FROM sequences WHERE id = ?`).get(sequenceId) as
    | { company_id: string }
    | undefined;
  if (!row) throw new Error("That sequence no longer exists.");
  return row.company_id;
}

/* ---- Running ------------------------------------------------------------ */

/**
 * Puts a lead into a sequence and queues its first step.
 *
 * Re-enrolling a lead restarts the same enrolment rather than making a second
 * one, so somebody who runs a cadence twice does not end up sending two copies
 * of every step.
 */
export function enroll(db: Db, sequenceId: string, leadId: string): void {
  const companyId = sequenceCompany(db, sequenceId);
  const steps = listSteps(db, sequenceId);
  if (steps.length === 0) throw new Error("Add a step to the sequence first.");

  const lead = findLead(db, leadId);
  if (!lead) throw new Error("That lead no longer exists.");
  if (!lead.email) throw new Error(`${lead.name} has no email address.`);

  const now = new Date().toISOString();
  const id = randomUUID();

  db.transaction(() => {
    db.prepare(
      `INSERT INTO enrollments (
         id, company_id, sequence_id, lead_id, status, stopped_for, next_step,
         created_at, updated_at
       ) VALUES (?, ?, ?, ?, 'active', NULL, 0, ?, ?)
       ON CONFLICT (sequence_id, lead_id) DO UPDATE SET
         status = 'active', stopped_for = NULL, next_step = 0, updated_at = excluded.updated_at`,
    ).run(id, companyId, sequenceId, leadId, now, now);
  })();

  const enrollment = db
    .prepare(`SELECT id FROM enrollments WHERE sequence_id = ? AND lead_id = ?`)
    .get(sequenceId, leadId) as { id: string };

  queueStep(db, companyId, enrollment.id, steps[0]!, leadId, null);
}

/**
 * Queues one step for one lead.
 *
 * `after` is when the previous step was sent; the step's offset counts from
 * there. For the first step it is null and the message goes out today.
 */
function queueStep(
  db: Db,
  companyId: string,
  enrollmentId: string,
  step: SequenceStep,
  leadId: string,
  after: string | null,
): void {
  const lead = findLead(db, leadId);
  if (!lead?.email) return;

  const template = db
    .prepare(`SELECT subject, body FROM email_templates WHERE id = ?`)
    .get(step.templateId) as { subject: string; body: string } | undefined;
  if (!template) return;

  const company = db
    .prepare(`SELECT name, timezone FROM companies WHERE id = ?`)
    .get(companyId) as { name: string; timezone: string };

  const context = {
    leadName: lead.name,
    leadContact: lead.contactPerson,
    leadCity: lead.city,
    companyName: company.name,
  };

  const base = after
    ? dayOf(after, company.timezone)
    : todayIn(company.timezone);

  queueMessage(
    db,
    companyId,
    queueInput.parse({
      leadId,
      toEmail: lead.email,
      subject: render(template.subject, context),
      body: render(template.body, context),
      scheduledFor: shiftDay(base, step.offsetDays),
    }),
    { enrollmentId, stepId: step.id },
  );
}

/**
 * Moves a cadence on once a step is confirmed sent.
 *
 * Called from the log ingest, because the send date is the thing the next
 * step counts from and it is only known when the script reports back.
 */
export function advanceAfterSend(db: Db, messageId: string, sentAt: string | null): void {
  const row = db
    .prepare(
      `SELECT company_id, lead_id, enrollment_id FROM email_messages WHERE message_id = ?`,
    )
    .get(messageId) as
    | { company_id: string; lead_id: string; enrollment_id: string | null }
    | undefined;
  if (!row?.enrollment_id) return;

  const enrollment = db
    .prepare(`SELECT * FROM enrollments WHERE id = ?`)
    .get(row.enrollment_id) as Record<string, unknown> | undefined;
  if (!enrollment || enrollment["status"] !== "active") return;

  const steps = listSteps(db, enrollment["sequence_id"] as string);
  const nextIndex = (enrollment["next_step"] as number) + 1;
  const now = new Date().toISOString();

  if (nextIndex >= steps.length) {
    db.prepare(
      `UPDATE enrollments SET status = 'finished', next_step = ?, updated_at = ? WHERE id = ?`,
    ).run(nextIndex, now, row.enrollment_id);
    return;
  }

  db.prepare(`UPDATE enrollments SET next_step = ?, updated_at = ? WHERE id = ?`).run(
    nextIndex,
    now,
    row.enrollment_id,
  );

  queueStep(
    db,
    row.company_id,
    row.enrollment_id,
    steps[nextIndex]!,
    row.lead_id,
    sentAt,
  );
}

/**
 * A reply ends the cadence.
 *
 * The whole point of a sequence is to get an answer, so continuing to nudge
 * somebody who has replied is the one thing it must never do. Anything still
 * queued for that enrolment is dropped rather than left to go out later.
 */
export function stopOnReply(db: Db, messageId: string): void {
  const row = db
    .prepare(`SELECT enrollment_id FROM email_messages WHERE message_id = ?`)
    .get(messageId) as { enrollment_id: string | null } | undefined;
  if (!row?.enrollment_id) return;

  stopEnrollment(db, row.enrollment_id, "replied");
}

function stopEnrollment(db: Db, enrollmentId: string, why: string): void {
  const now = new Date().toISOString();

  db.transaction(() => {
    db.prepare(
      `UPDATE enrollments SET status = 'stopped', stopped_for = ?, updated_at = ?
       WHERE id = ? AND status = 'active'`,
    ).run(why, now, enrollmentId);

    // Only what has not gone yet. A message already exported is out of
    // Caulder's hands, and pretending otherwise would make the timeline lie.
    db.prepare(
      `DELETE FROM email_messages WHERE enrollment_id = ? AND status = 'queued'`,
    ).run(enrollmentId);
  })();
}

/**
 * Stops every cadence for a lead that has reached a won or lost stage.
 *
 * Called when a lead moves on the board: nudging somebody who has already
 * bought, or already said no, is worse than sending nothing.
 */
export function stopForClosedLead(db: Db, leadId: string): void {
  const rows = db
    .prepare(`SELECT id FROM enrollments WHERE lead_id = ? AND status = 'active'`)
    .all(leadId) as { id: string }[];
  for (const row of rows) stopEnrollment(db, row.id, "closed");
}
