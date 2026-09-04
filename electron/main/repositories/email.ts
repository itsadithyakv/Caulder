import { randomUUID } from "node:crypto";
import type { Db } from "../db/connection";
import {
  backoffMinutes,
  isForward,
  MAX_ATTEMPTS,
  type EmailMessage,
  type EmailStatus,
  type EmailTemplate,
  type LogRow,
  type QueueInput,
  type TemplateInput,
} from "@shared/email";
import { writeActivity } from "./leads";

/**
 * Templates, and the queue of messages waiting to cross the bridge.
 */

/* ---- Templates ---------------------------------------------------------- */

type TemplateRow = {
  id: string;
  company_id: string;
  name: string;
  subject: string;
  body: string;
  created_at: string;
  updated_at: string;
};

function toTemplate(row: TemplateRow): EmailTemplate {
  return {
    id: row.id,
    companyId: row.company_id,
    name: row.name,
    subject: row.subject,
    body: row.body,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listTemplates(db: Db, companyId: string): EmailTemplate[] {
  const rows = db
    .prepare(
      `SELECT * FROM email_templates WHERE company_id = ? ORDER BY name COLLATE NOCASE`,
    )
    .all(companyId) as TemplateRow[];
  return rows.map(toTemplate);
}

export function createTemplate(
  db: Db,
  companyId: string,
  input: TemplateInput,
): EmailTemplate[] {
  const now = new Date().toISOString();
  try {
    db.prepare(
      `INSERT INTO email_templates (id, company_id, name, subject, body, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(randomUUID(), companyId, input.name, input.subject, input.body, now, now);
  } catch (cause) {
    throw duplicateOr(cause, input.name);
  }
  return listTemplates(db, companyId);
}

export function updateTemplate(
  db: Db,
  id: string,
  input: TemplateInput,
): EmailTemplate[] {
  const companyId = templateCompany(db, id);
  try {
    db.prepare(
      `UPDATE email_templates SET name = ?, subject = ?, body = ?, updated_at = ?
       WHERE id = ?`,
    ).run(input.name, input.subject, input.body, new Date().toISOString(), id);
  } catch (cause) {
    throw duplicateOr(cause, input.name);
  }
  return listTemplates(db, companyId);
}

export function deleteTemplate(db: Db, id: string): EmailTemplate[] {
  const companyId = templateCompany(db, id);
  db.prepare(`DELETE FROM email_templates WHERE id = ?`).run(id);
  return listTemplates(db, companyId);
}

function templateCompany(db: Db, id: string): string {
  const row = db.prepare(`SELECT company_id FROM email_templates WHERE id = ?`).get(id) as
    | { company_id: string }
    | undefined;
  if (!row) throw new Error("That template no longer exists.");
  return row.company_id;
}

function duplicateOr(cause: unknown, name: string): Error {
  const message = cause instanceof Error ? cause.message : String(cause);
  if (message.includes("UNIQUE") && message.includes("email_templates")) {
    return new Error(`There is already a template called "${name}".`);
  }
  return cause instanceof Error ? cause : new Error(message);
}

/* ---- Messages ----------------------------------------------------------- */

type MessageRow = {
  id: string;
  company_id: string;
  message_id: string;
  lead_id: string;
  lead_name: string | null;
  to_email: string;
  subject: string;
  body: string;
  status: string;
  scheduled_for: string;
  attempt_count: number;
  sent_at: string | null;
  opened_at: string | null;
  replied_at: string | null;
  bounced_at: string | null;
  failure: string | null;
  created_at: string;
};

function toMessage(row: MessageRow): EmailMessage {
  return {
    id: row.id,
    messageId: row.message_id,
    leadId: row.lead_id,
    leadName: row.lead_name,
    toEmail: row.to_email,
    subject: row.subject,
    body: row.body,
    status: row.status as EmailStatus,
    scheduledFor: row.scheduled_for,
    attemptCount: row.attempt_count,
    sentAt: row.sent_at,
    openedAt: row.opened_at,
    repliedAt: row.replied_at,
    bouncedAt: row.bounced_at,
    failure: row.failure,
    createdAt: row.created_at,
  };
}

const SELECT = `
  SELECT m.*, l.name AS lead_name
  FROM email_messages m
  LEFT JOIN leads l ON l.id = m.lead_id
`;

export function listMessages(db: Db, companyId: string, limit = 200): EmailMessage[] {
  const rows = db
    .prepare(`${SELECT} WHERE m.company_id = ? ORDER BY m.created_at DESC LIMIT ?`)
    .all(companyId, limit) as MessageRow[];
  return rows.map(toMessage);
}

export function listMessagesForLead(db: Db, leadId: string): EmailMessage[] {
  const rows = db
    .prepare(`${SELECT} WHERE m.lead_id = ? ORDER BY m.created_at DESC`)
    .all(leadId) as MessageRow[];
  return rows.map(toMessage);
}

/**
 * Queues a message.
 *
 * The message_id generated here is the only thing that ever identifies this
 * email again. Apps Script echoes it back untouched, and every status update
 * matches on it.
 */
export function queueMessage(
  db: Db,
  companyId: string,
  input: QueueInput,
  origin?: { enrollmentId: string; stepId: string },
): EmailMessage {
  const now = new Date().toISOString();
  const id = randomUUID();
  const messageId = randomUUID();

  db.transaction(() => {
    db.prepare(
      `INSERT INTO email_messages (
         id, company_id, lead_id, message_id, to_email, subject, body,
         status, scheduled_for, attempt_count, enrollment_id, step_id,
         created_at, updated_at
       ) VALUES (@id, @companyId, @leadId, @messageId, @toEmail, @subject, @body,
                 'queued', @scheduledFor, 0, @enrollmentId, @stepId, @now, @now)`,
    ).run({
      ...input,
      id,
      companyId,
      messageId,
      enrollmentId: origin?.enrollmentId ?? null,
      stepId: origin?.stepId ?? null,
      now,
    });

    writeActivity(db, {
      companyId,
      leadId: input.leadId,
      kind: "email_queued",
      body: input.subject,
      occurredAt: now,
    });
  })();

  const created = findMessage(db, id);
  if (!created) throw new Error("That message could not be queued.");
  return created;
}

export function findMessage(db: Db, id: string): EmailMessage | null {
  const row = db.prepare(`${SELECT} WHERE m.id = ?`).get(id) as MessageRow | undefined;
  return row ? toMessage(row) : null;
}

/** Messages an export should pick up: due, and not already gone. */
export function listDue(db: Db, companyId: string, day: string): EmailMessage[] {
  const rows = db
    .prepare(
      `${SELECT}
       WHERE m.company_id = ?
         AND m.status = 'queued'
         AND m.scheduled_for <= ?
         AND (m.next_attempt_at IS NULL OR m.next_attempt_at <= ?)
       ORDER BY m.scheduled_for ASC, m.created_at ASC`,
    )
    .all(companyId, day, new Date().toISOString()) as MessageRow[];
  return rows.map(toMessage);
}

export function countDue(db: Db, companyId: string, day: string): number {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n FROM email_messages
       WHERE company_id = ? AND status = 'queued' AND scheduled_for <= ?
         AND (next_attempt_at IS NULL OR next_attempt_at <= ?)`,
    )
    .get(companyId, day, new Date().toISOString()) as { n: number };
  return row.n;
}

/**
 * Leads whose latest email got a reply and who have heard nothing since.
 *
 * The warmest thing in the app, and the one the Today screen must not bury.
 */
export function listAwaitingReply(db: Db, companyId: string): EmailMessage[] {
  const rows = db
    .prepare(
      // `>=`, not `>`. Timestamps are millisecond-resolution, and where a log
      // omits replied_at Caulder stamps it with the time the row was read — so
      // reading a reply and answering it straight away can land in the same
      // millisecond, and a strict comparison would leave the lead sitting on
      // this list having already been dealt with. Nothing writes one of these
      // kinds at exactly the reply instant except a genuine answer.
      `${SELECT}
       WHERE m.company_id = ? AND m.status = 'replied'
         AND NOT EXISTS (
           SELECT 1 FROM activities a
           WHERE a.lead_id = m.lead_id
             AND a.occurred_at >= m.replied_at
             AND a.kind IN ('call', 'meeting', 'note', 'email_queued')
         )
       ORDER BY m.replied_at DESC`,
    )
    .all(companyId) as MessageRow[];
  return rows.map(toMessage);
}

export function markExported(db: Db, ids: string[]): void {
  if (ids.length === 0) return;
  const now = new Date().toISOString();
  const update = db.prepare(
    `UPDATE email_messages SET status = 'exported', updated_at = ? WHERE id = ?`,
  );
  db.transaction(() => {
    for (const id of ids) update.run(now, id);
  })();
}

/**
 * Puts a bounced or failed message back in the queue.
 *
 * The point is the address, not the message. A bounce means the address was
 * wrong; once it has been fixed on the lead, the same message is worth
 * another go — but only from the address the lead now has, which is why this
 * re-reads it rather than reusing the one that bounced.
 *
 * The attempt count goes back to zero. Five attempts against a broken address
 * is not five attempts against a working one, and carrying the old count over
 * would burn the retries on the fix.
 */
export function requeueMessage(db: Db, id: string): EmailMessage {
  const existing = db.prepare(`${SELECT} WHERE m.id = ?`).get(id) as MessageRow | undefined;
  if (!existing) throw new Error("That message no longer exists.");

  if (existing.status !== "bounced" && existing.status !== "failed") {
    throw new Error("Only a bounced or failed message can be put back in the queue.");
  }

  const lead = db.prepare(`SELECT email FROM leads WHERE id = ?`).get(existing.lead_id) as
    | { email: string | null }
    | undefined;

  const address = lead?.email?.trim();
  if (!address) {
    throw new Error(
      "That lead has no email address. Add one on the lead, then put this back in the queue.",
    );
  }

  const now = new Date().toISOString();

  db.prepare(
    `UPDATE email_messages SET
       status = 'queued',
       to_email = ?,
       attempt_count = 0,
       next_attempt_at = NULL,
       failure = NULL,
       bounced_at = NULL,
       updated_at = ?
     WHERE id = ?`,
  ).run(address, now, id);

  const updated = db.prepare(`${SELECT} WHERE m.id = ?`).get(id) as MessageRow;
  return toMessage(updated);
}

export function deleteMessage(db: Db, id: string): void {
  const result = db.prepare(`DELETE FROM email_messages WHERE id = ?`).run(id);
  if (result.changes === 0) throw new Error("That message no longer exists.");
}

/**
 * Applies one row from a log file.
 *
 * Returns what it did, because the sync screen reports it and because
 * "ignored" is a normal, expected outcome rather than a problem: the same log
 * gets imported twice, and rows arrive out of order.
 */
type ApplyOutcome = "applied" | "ignored" | "unmatched";

export function applyLogRow(db: Db, row: LogRow): ApplyOutcome {
  const existing = db
    .prepare(`${SELECT} WHERE m.message_id = ?`)
    .get(row.messageId) as MessageRow | undefined;

  // A log row for a message this database has never had. Either the log
  // belongs to another workspace, or the message was deleted here.
  if (!existing) return "unmatched";

  const current = existing.status as EmailStatus;

  if (row.status === "failed") return applyFailure(db, existing, row);

  // The ladder only climbs. An "opened" row arriving after "replied" is stale,
  // not a correction, and applying it would lose the reply.
  if (!isForward(current, row.status)) return "ignored";

  const now = new Date().toISOString();

  /**
   * A status must always leave a timestamp behind, even when the log omits
   * one. Without this a `replied` row with no `replied_at` sets the status but
   * leaves the date null, and every later comparison against it — "has this
   * been answered since?" — silently never matches, because a comparison with
   * NULL is not false, it is unknown.
   *
   * The reported time is used where it exists; otherwise the time the row was
   * read is the best available answer.
   */
  const stamp = (reported: string | null) => reported ?? now;

  db.transaction(() => {
    db.prepare(
      `UPDATE email_messages SET
         status = @status,
         sent_at = COALESCE(@sentAt, sent_at),
         opened_at = COALESCE(@openedAt, opened_at),
         replied_at = COALESCE(@repliedAt, replied_at),
         bounced_at = COALESCE(@bouncedAt, bounced_at),
         provider_message_id = COALESCE(@providerMessageId, provider_message_id),
         thread_id = COALESCE(@threadId, thread_id),
         next_attempt_at = NULL,
         -- A bounce keeps its reason. Every other forward step clears the last
         -- failure, because it is no longer what happened to this message.
         failure = CASE WHEN @status = 'bounced' THEN @failure ELSE NULL END,
         updated_at = @now
       WHERE id = @id`,
    ).run({
      id: existing.id,
      status: row.status,
      // Each status stamps its own field, so the date is never left unknown.
      sentAt: row.status === "sent" ? stamp(row.sentAt) : row.sentAt,
      openedAt: row.status === "opened" ? stamp(row.openedAt) : row.openedAt,
      repliedAt: row.status === "replied" ? stamp(row.repliedAt) : row.repliedAt,
      bouncedAt: row.status === "bounced" ? stamp(row.bouncedAt) : row.bouncedAt,
      providerMessageId: row.providerMessageId,
      threadId: row.threadId,
      failure: row.error,
      now,
    });

    const kind =
      row.status === "sent"
        ? "email_sent"
        : row.status === "opened"
          ? "email_opened"
          : row.status === "replied"
            ? "email_replied"
            : row.status === "bounced"
              ? "email_bounced"
              : null;

    if (kind) {
      writeActivity(db, {
        companyId: existing.company_id,
        leadId: existing.lead_id,
        kind,
        body: existing.subject,
        // The event happened when the script says it did, not when the file
        // was read: a log imported on Monday can describe Friday.
        occurredAt:
          row.sentAt ?? row.openedAt ?? row.repliedAt ?? row.bouncedAt ?? now,
      });
    }
  })();

  return "applied";
}

/**
 * A failure is not the end of a message.
 *
 * Five attempts with capped exponential backoff, the policy ported from
 * Unifloe's worker. Only the last one is terminal; the rest go back to the
 * queue with a time before which the next export must not pick them up.
 */
function applyFailure(db: Db, existing: MessageRow, row: LogRow): ApplyOutcome {
  if (existing.status === "failed") return "ignored";

  const attempts = existing.attempt_count + 1;
  const terminal = attempts >= MAX_ATTEMPTS;
  const now = new Date().toISOString();
  const nextAttempt = terminal
    ? null
    : new Date(Date.now() + backoffMinutes(attempts) * 60_000).toISOString();

  db.transaction(() => {
    db.prepare(
      `UPDATE email_messages SET
         status = ?, attempt_count = ?, next_attempt_at = ?, failure = ?, updated_at = ?
       WHERE id = ?`,
    ).run(
      terminal ? "failed" : "queued",
      attempts,
      nextAttempt,
      row.error,
      now,
      existing.id,
    );

    if (terminal) {
      writeActivity(db, {
        companyId: existing.company_id,
        leadId: existing.lead_id,
        kind: "email_failed",
        body: row.error ?? existing.subject,
        occurredAt: now,
      });
    }
  })();

  return "applied";
}
