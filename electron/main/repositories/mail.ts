import type { Db } from "../db/connection";
import type { ActivityKind } from "@shared/domain";
import {
  planEmailChange,
  type EmailEvent,
  type EmailProgress,
  type EmailRecord,
  type EmailReply,
  type EmailStatus,
  type FollowUpStatus,
  type RemoteEmail,
} from "@shared/mail";
import { writeActivity } from "./leads";

/**
 * Email sent through the Google script: the rows, and what a report from the
 * script does to them and to the contact's history.
 *
 * The decision about how a message moves is in shared/mail.ts, where it has
 * no database in it. This file only reads a row, asks that function, and
 * writes down the answer.
 */

type EmailRow = {
  id: string;
  company_id: string;
  lead_id: string;
  to_email: string;
  subject: string;
  body: string;
  send_at: string | null;
  status: EmailStatus;
  sent_at: string | null;
  replied_at: string | null;
  error: string | null;
  follow_up_days: number | null;
  follow_up_body: string | null;
  follow_up_status: FollowUpStatus | null;
  follow_up_sent_at: string | null;
  follow_up_error: string | null;
  settled: number;
  forgotten: number;
  created_at: string;
  updated_at: string;
};

function toRecord(row: EmailRow): EmailRecord {
  return {
    id: row.id,
    leadId: row.lead_id,
    to: row.to_email,
    subject: row.subject,
    body: row.body,
    sendAt: row.send_at,
    status: row.status,
    sentAt: row.sent_at,
    repliedAt: row.replied_at,
    error: row.error,
    followUp:
      row.follow_up_days === null || row.follow_up_status === null
        ? null
        : {
            days: row.follow_up_days,
            status: row.follow_up_status,
            sentAt: row.follow_up_sent_at,
            error: row.follow_up_error,
          },
    createdAt: row.created_at,
  };
}

function progressOf(row: EmailRow): EmailProgress {
  return {
    status: row.status,
    sentAt: row.sent_at,
    repliedAt: row.replied_at,
    error: row.error,
    followUpStatus: row.follow_up_status,
    followUpSentAt: row.follow_up_sent_at,
    followUpError: row.follow_up_error,
  };
}

type NewEmail = {
  id: string;
  companyId: string;
  leadId: string;
  to: string;
  subject: string;
  body: string;
  sendAt: string | null;
  followUpDays: number | null;
  followUpBody: string | null;
};

/**
 * A message the script has just accepted, with whatever it reported doing -
 * which, for a message due now, is already "sent".
 *
 * Stored as scheduled and then moved by the same rule every later report
 * goes through, so the first "sent" reaches the history the same way as any
 * other.
 */
export function recordEmail(db: Db, email: NewEmail, remote: RemoteEmail, now: Date): void {
  const stamp = now.toISOString();
  db.transaction(() => {
    db.prepare(
      `INSERT INTO emails (id, company_id, lead_id, to_email, subject, body, send_at, status,
                           follow_up_days, follow_up_body, follow_up_status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'scheduled', ?, ?, ?, ?, ?)`,
    ).run(
      email.id,
      email.companyId,
      email.leadId,
      email.to,
      email.subject,
      email.body,
      email.sendAt,
      email.followUpDays,
      email.followUpBody,
      email.followUpDays === null ? null : "waiting",
      stamp,
      stamp,
    );
    applyReport(db, remote, now);
  })();
}

/** What the script said about one message. An id Caulder does not know is ignored. */
export function applyReport(db: Db, remote: RemoteEmail, now: Date): void {
  db.transaction(() => {
    const row = db.prepare(`SELECT * FROM emails WHERE id = ?`).get(remote.id) as
      | EmailRow
      | undefined;
    if (!row) return;

    const { next, events, settled } = planEmailChange(progressOf(row), remote, now);
    db.prepare(
      `UPDATE emails
          SET status = ?, sent_at = ?, replied_at = ?, error = ?,
              follow_up_status = ?, follow_up_sent_at = ?, follow_up_error = ?,
              settled = ?, updated_at = ?
        WHERE id = ?`,
    ).run(
      next.status,
      next.sentAt,
      next.repliedAt,
      next.error,
      next.followUpStatus,
      next.followUpSentAt,
      next.followUpError,
      settled ? 1 : 0,
      now.toISOString(),
      row.id,
    );

    for (const event of events) writeEvent(db, row, next, event, now);
  })();
}

const HISTORY: Record<EmailEvent, ActivityKind> = {
  sent: "email_sent",
  replied: "email_replied",
  failed: "email_failed",
  bounced: "email_bounced",
  follow_up_sent: "email_sent",
  follow_up_failed: "email_failed",
};

/** A send or a reply is contact, the same as a logged call. A failure is not. */
const IS_CONTACT = new Set<EmailEvent>(["sent", "replied", "follow_up_sent"]);

function writeEvent(
  db: Db,
  row: EmailRow,
  next: EmailProgress,
  event: EmailEvent,
  now: Date,
): void {
  const when =
    (event === "sent"
      ? next.sentAt
      : event === "replied"
        ? next.repliedAt
        : event === "follow_up_sent"
          ? next.followUpSentAt
          : null) ?? now.toISOString();

  writeActivity(db, {
    companyId: row.company_id,
    leadId: row.lead_id,
    kind: HISTORY[event],
    body: describe(event, row, next),
    occurredAt: when,
    meta: { emailId: row.id },
  });

  if (IS_CONTACT.has(event)) {
    db.prepare(
      `UPDATE leads
          SET last_contacted_at = MAX(COALESCE(last_contacted_at, ''), ?), updated_at = ?
        WHERE id = ?`,
    ).run(when, now.toISOString(), row.lead_id);
  }
}

function describe(event: EmailEvent, row: EmailRow, next: EmailProgress): string {
  switch (event) {
    case "sent":
      return `${row.subject}\n\n${row.body}`;
    case "replied":
      return `They replied to "${row.subject}".`;
    case "failed":
      return `"${row.subject}" did not go: ${next.error ?? "no reason was given"}`;
    case "bounced":
      return `"${row.subject}" bounced. ${next.error ?? ""}`.trim();
    case "follow_up_sent":
      return `Follow-up to "${row.subject}"\n\n${row.follow_up_body ?? ""}`.trim();
    case "follow_up_failed":
      return `The follow-up to "${row.subject}" did not go: ${next.followUpError ?? "no reason was given"}`;
  }
}

/* ---- Reading ------------------------------------------------------------ */

/** Newest first: the one just written is the one worth seeing. */
export function listEmailsForLead(db: Db, leadId: string): EmailRecord[] {
  const rows = db
    .prepare(`SELECT * FROM emails WHERE lead_id = ? ORDER BY created_at DESC`)
    .all(leadId) as EmailRow[];
  return rows.map(toRecord);
}

export function findEmail(db: Db, id: string): EmailRecord | null {
  const row = db.prepare(`SELECT * FROM emails WHERE id = ?`).get(id) as EmailRow | undefined;
  return row ? toRecord(row) : null;
}

/** How many ids go to the script in one call, so a call never grows without end. */
const BATCH = 200;

/** Messages something can still happen to, least recently heard about first. */
export function watchedEmailIds(db: Db): string[] {
  const rows = db
    .prepare(`SELECT id FROM emails WHERE settled = 0 ORDER BY updated_at LIMIT ?`)
    .all(BATCH) as { id: string }[];
  return rows.map((row) => row.id);
}

/** Settled messages the script has not yet been told it can forget. */
export function forgettableEmailIds(db: Db): string[] {
  const rows = db
    .prepare(`SELECT id FROM emails WHERE settled = 1 AND forgotten = 0 LIMIT ?`)
    .all(BATCH) as { id: string }[];
  return rows.map((row) => row.id);
}

export function markForgotten(db: Db, ids: string[]): void {
  const mark = db.prepare(`UPDATE emails SET forgotten = 1 WHERE id = ?`);
  db.transaction(() => {
    for (const id of ids) mark.run(id);
  })();
}

/** Whether there is anything to ask the script about. */
export function hasEmailWork(db: Db): boolean {
  return (
    db.prepare(`SELECT 1 FROM emails WHERE settled = 0 OR forgotten = 0 LIMIT 1`).get() !==
    undefined
  );
}

/** Replies since a moment, newest first, for Today. */
export function listRecentReplies(db: Db, companyId: string, since: string): EmailReply[] {
  const rows = db
    .prepare(
      `SELECT e.id, e.lead_id, l.name, e.subject, e.replied_at
         FROM emails e
         JOIN leads l ON l.id = e.lead_id
        WHERE e.company_id = ? AND e.status = 'replied' AND e.replied_at >= ?
        ORDER BY e.replied_at DESC
        LIMIT 10`,
    )
    .all(companyId, since) as {
    id: string;
    lead_id: string;
    name: string;
    subject: string;
    replied_at: string;
  }[];
  return rows.map((row) => ({
    emailId: row.id,
    leadId: row.lead_id,
    leadName: row.name,
    subject: row.subject,
    repliedAt: row.replied_at,
  }));
}
