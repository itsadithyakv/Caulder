import { randomUUID } from "node:crypto";
import type { Db } from "../db/connection";
import {
  CALL_OUTCOMES,
  CALL_SCRIPT_TEMPLATE,
  callInput,
  callSummary,
  isCallTone,
  isInterest,
  type CallAnswer,
  type CallOutcome,
  type CallRecord,
  type CallScript,
} from "@shared/calls";
import { taskInput } from "@shared/domain";
import { findLead, writeActivity } from "./leads";
import { findDeal, mainDeal, setDealLoss, setDealStage } from "./deals";
import { completeTask, createTask, findTask } from "./tasks";

/**
 * Calls, and the scripts they are read from.
 *
 * Logging a call is one transaction that does everything hanging up implies:
 * the call and its line on the history, the contact's notes, the task it came
 * from ticked off, the next one made, and the deal moved. A failure anywhere
 * leaves none of it.
 */

type CallRow = {
  id: string;
  lead_id: string;
  deal_id: string | null;
  deal_title: string | null;
  script_id: string | null;
  outcome: string;
  interest: number | null;
  notes: string | null;
  answers: string;
  seconds: number | null;
  created_at: string;
};

const SELECT = `SELECT c.*, d.title AS deal_title FROM calls c LEFT JOIN deals d ON d.id = c.deal_id`;

function readAnswers(text: string): CallAnswer[] {
  try {
    const parsed: unknown = JSON.parse(text);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (pair): pair is CallAnswer =>
        typeof pair === "object" &&
        pair !== null &&
        typeof (pair as CallAnswer).question === "string" &&
        typeof (pair as CallAnswer).answer === "string",
    );
  } catch {
    return [];
  }
}

function toCall(row: CallRow): CallRecord {
  return {
    id: row.id,
    leadId: row.lead_id,
    dealId: row.deal_id,
    dealTitle: row.deal_title,
    scriptId: row.script_id,
    outcome: (CALL_OUTCOMES as readonly string[]).includes(row.outcome) ? (row.outcome as CallOutcome) : "spoke",
    interest: isInterest(row.interest) ? row.interest : null,
    notes: row.notes ?? "",
    answers: readAnswers(row.answers),
    seconds: row.seconds,
    createdAt: row.created_at,
  };
}

export function findCall(db: Db, id: string): CallRecord | null {
  const row = db.prepare(`${SELECT} WHERE c.id = ?`).get(id) as CallRow | undefined;
  return row ? toCall(row) : null;
}

/** A contact's calls, newest first. */
export function listCalls(db: Db, leadId: string, limit = 5): CallRecord[] {
  const rows = db
    .prepare(`${SELECT} WHERE c.lead_id = ? ORDER BY c.created_at DESC LIMIT ?`)
    .all(leadId, limit) as CallRow[];
  return rows.map(toCall);
}

/* ---- Scripts ------------------------------------------------------------ */

type ScriptRow = { id: string; title: string; body: string; fields: string; updated_at: string };

function plainField(fields: Record<string, unknown>, key: string): string | null {
  const value = fields[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function toScript(row: ScriptRow): CallScript {
  let fields: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(row.fields);
    if (typeof parsed === "object" && parsed !== null) fields = parsed as Record<string, unknown>;
  } catch {
    // A page whose fields do not parse still has its text.
  }
  const tone = fields.tone;
  return {
    id: row.id,
    title: row.title,
    tone: isCallTone(tone) ? tone : null,
    caller: plainField(fields, "caller"),
    body: row.body,
    updatedAt: row.updated_at,
  };
}

/** A company's call scripts, pinned first, then the ones edited last. */
export function listScripts(db: Db, companyId: string): CallScript[] {
  const rows = db
    .prepare(
      `SELECT id, title, body, fields, updated_at FROM brain_pages
        WHERE company_id = ? AND template = ? AND is_archived = 0
        ORDER BY is_pinned DESC, updated_at DESC`,
    )
    .all(companyId, CALL_SCRIPT_TEMPLATE) as ScriptRow[];
  return rows.map(toScript);
}

export function findScript(db: Db, id: string): CallScript | null {
  const row = db
    .prepare(`SELECT id, title, body, fields, updated_at FROM brain_pages WHERE id = ? AND template = ?`)
    .get(id, CALL_SCRIPT_TEMPLATE) as ScriptRow | undefined;
  return row ? toScript(row) : null;
}

/** The script the last call in this company was read from, if it is still there. */
export function lastScriptId(db: Db, companyId: string): string | null {
  const row = db
    .prepare(
      `SELECT c.script_id AS id FROM calls c
         JOIN brain_pages p ON p.id = c.script_id AND p.is_archived = 0
        WHERE c.company_id = ?
        ORDER BY c.created_at DESC LIMIT 1`,
    )
    .get(companyId) as { id: string } | undefined;
  return row?.id ?? null;
}

/* ---- Logging a call ------------------------------------------------------- */

export function logCall(db: Db, companyId: string, raw: unknown, now: Date = new Date()): CallRecord {
  const input = callInput.parse(raw);
  const lead = findLead(db, input.leadId);
  if (!lead || lead.companyId !== companyId) throw new Error("That contact is not in this company.");

  let dealId: string | null;
  if (input.dealId) {
    const deal = findDeal(db, input.dealId);
    if (!deal || deal.leadId !== lead.id) throw new Error("That deal is not this contact's.");
    dealId = deal.id;
  } else {
    dealId = mainDeal(db, lead.id)?.id ?? null;
  }

  // A script deleted while somebody was reading it is not a reason to lose
  // the call; the call just stops pointing at it.
  const script = input.scriptId ? findScript(db, input.scriptId) : null;

  if (input.taskId) {
    const task = findTask(db, input.taskId);
    if (!task || task.companyId !== companyId) throw new Error("That task no longer exists.");
  }

  const at = now.toISOString();
  const id = randomUUID();
  const notes = input.notes.trim();

  db.transaction(() => {
    const activityId = writeActivity(db, {
      companyId,
      leadId: lead.id,
      kind: "call",
      body: callSummary({ ...input, notes }),
      occurredAt: at,
      meta: { callId: id, outcome: input.outcome, interest: input.interest },
    });

    db.prepare(
      `INSERT INTO calls (id, company_id, lead_id, deal_id, script_id, activity_id, outcome, interest,
                          notes, answers, started_at, seconds, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      companyId,
      lead.id,
      dealId,
      script?.id ?? null,
      activityId,
      input.outcome,
      input.interest,
      notes.length > 0 ? notes : null,
      JSON.stringify(input.answers),
      input.startedAt,
      input.seconds,
      at,
    );

    // Only speaking to somebody is contact. A missed call is an attempt, and
    // counting it would take the contact off Going quiet for ringing once.
    if (input.outcome === "spoke") {
      db.prepare(`UPDATE leads SET last_contacted_at = ?, updated_at = ? WHERE id = ?`).run(at, at, lead.id);
    }

    if (input.keepInMind !== undefined) {
      const next = input.keepInMind && input.keepInMind.length > 0 ? input.keepInMind : null;
      if (next !== (lead.notes ?? null)) {
        db.prepare(`UPDATE leads SET notes = ?, updated_at = ? WHERE id = ?`).run(next, at, lead.id);
        writeActivity(db, { companyId, leadId: lead.id, kind: "field_change", body: "notes", occurredAt: at });
      }
    }

    if (input.taskId) completeTask(db, input.taskId);

    if (input.next) {
      createTask(
        db,
        companyId,
        taskInput.parse({
          leadId: lead.id,
          title: input.next.title,
          kind: input.outcome === "spoke" ? "follow_up" : "call",
          dueOn: input.next.dueOn,
        }),
      );
    }

    if (dealId && input.stageId !== undefined) {
      const deal = findDeal(db, dealId);
      // The follow-up is the one just asked about, so the move does not add its own.
      if (deal && deal.stageId !== input.stageId) setDealStage(db, dealId, input.stageId, { followUp: false });
      if (input.lossReason) setDealLoss(db, dealId, input.lossReason);
    }
  })();

  const saved = findCall(db, id);
  if (!saved) throw new Error("The call vanished immediately after being saved.");
  return saved;
}
