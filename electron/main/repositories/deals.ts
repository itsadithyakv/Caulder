import { randomUUID } from "node:crypto";
import type { Db } from "../db/connection";
import type { Deal, DealInput } from "@shared/domain";
import { followUpIfNothingPlanned } from "../services/rules";
import { writeActivity } from "./leads";
import { MAIN_DEAL } from "./main-deal";

/**
 * Deals: what is being sold to a contact (PLAN.md; migration 22).
 *
 * A contact can have several. Moving one writes the stage change on the
 * contact's history, stamps or clears when it closed, makes a prospect a
 * customer when it is won, and plans a follow-up if nothing is planned - the
 * same things a contact's own move used to do, now done per deal.
 */

type DealRow = {
  id: string;
  company_id: string;
  lead_id: string;
  title: string;
  stage_id: string | null;
  value: number | null;
  loss_reason: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
};

function toDeal(row: DealRow): Deal {
  return {
    id: row.id,
    companyId: row.company_id,
    leadId: row.lead_id,
    title: row.title,
    stageId: row.stage_id,
    value: row.value,
    lossReason: row.loss_reason,
    closedAt: row.closed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function findDeal(db: Db, id: string): Deal | null {
  const row = db.prepare(`SELECT * FROM deals WHERE id = ?`).get(id) as DealRow | undefined;
  return row ? toDeal(row) : null;
}

/** A contact's deals, open ones first, then by when they were last touched. */
export function listDeals(db: Db, leadId: string): Deal[] {
  return (
    db
      .prepare(
        `SELECT d.* FROM deals d
           LEFT JOIN pipeline_stages s ON s.id = d.stage_id
          WHERE d.lead_id = ?
          ORDER BY (COALESCE(s.kind, 'open') = 'open') DESC, d.updated_at DESC, d.created_at DESC`,
      )
      .all(leadId) as DealRow[]
  ).map(toDeal);
}

export function mainDeal(db: Db, leadId: string): Deal | null {
  const row = db.prepare(`SELECT * FROM deals WHERE id = ${MAIN_DEAL("?")}`).get(leadId) as
    | DealRow
    | undefined;
  return row ? toDeal(row) : null;
}

function leadOf(db: Db, leadId: string): { company_id: string; name: string } {
  const lead = db.prepare(`SELECT company_id, name FROM leads WHERE id = ?`).get(leadId) as
    | { company_id: string; name: string }
    | undefined;
  if (!lead) throw new Error("That contact no longer exists.");
  return lead;
}

function stageInCompany(db: Db, companyId: string, stageId: string | null): void {
  if (stageId === null) return;
  const row = db.prepare(`SELECT 1 FROM pipeline_stages WHERE id = ? AND company_id = ?`).get(stageId, companyId);
  if (!row) throw new Error("That stage is not in this company.");
}

function firstStageId(db: Db, companyId: string): string | null {
  const row = db
    .prepare(`SELECT id FROM pipeline_stages WHERE company_id = ? ORDER BY position LIMIT 1`)
    .get(companyId) as { id: string } | undefined;
  return row?.id ?? null;
}

/**
 * A new deal. With no stage it starts in the first one: a deal outside the
 * funnel is invisible on the board.
 */
export function createDeal(
  db: Db,
  leadId: string,
  input: DealInput,
  now: string = new Date().toISOString(),
): Deal {
  const lead = leadOf(db, leadId);
  const stageId = input.stageId ?? firstStageId(db, lead.company_id);
  stageInCompany(db, lead.company_id, stageId);
  const id = randomUUID();
  db.transaction(() => {
    db.prepare(
      `INSERT INTO deals (id, company_id, lead_id, title, stage_id, value, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(id, lead.company_id, leadId, input.title, stageId, input.value, now, now);
    touchLead(db, leadId, now);
    stampClosed(db, id, stageId, now);
    becomeCustomer(db, leadId, stageId);
  })();
  const created = findDeal(db, id);
  if (!created) throw new Error("The deal vanished immediately after being made.");
  return created;
}

/** Renames a deal, changes its value and, if it moved, its stage. */
export function updateDeal(db: Db, id: string, input: DealInput): Deal {
  const before = findDeal(db, id);
  if (!before) throw new Error("That deal no longer exists.");
  const now = new Date().toISOString();
  db.transaction(() => {
    db.prepare(`UPDATE deals SET title = ?, value = ?, updated_at = ? WHERE id = ?`).run(
      input.title,
      input.value,
      now,
      id,
    );
    if (input.stageId !== before.stageId) moveDeal(db, id, input.stageId, { followUp: true, now });
    touchLead(db, before.leadId, now);
  })();
  const updated = findDeal(db, id);
  if (!updated) throw new Error("That deal no longer exists.");
  return updated;
}

/** Only the value, for a quote accepted or a spreadsheet merged. */
export function setDealValue(db: Db, id: string, value: number | null, now: string): void {
  db.prepare(`UPDATE deals SET value = ?, updated_at = ? WHERE id = ?`).run(value, now, id);
}

/**
 * Moving a deal along the funnel. A move to where it already is writes
 * nothing.
 */
export function setDealStage(
  db: Db,
  id: string,
  stageId: string | null,
  /** False when the stage is being written rather than moved: the sample seed. */
  options: { followUp?: boolean } = {},
): Deal {
  const before = findDeal(db, id);
  if (!before) throw new Error("That deal no longer exists.");
  if (before.stageId === stageId) return before;
  const now = new Date().toISOString();
  db.transaction(() => moveDeal(db, id, stageId, { followUp: options.followUp !== false, now }))();
  const moved = findDeal(db, id);
  if (!moved) throw new Error("That deal no longer exists.");
  return moved;
}

function moveDeal(db: Db, id: string, stageId: string | null, options: { followUp: boolean; now: string }): void {
  const deal = findDeal(db, id);
  if (!deal) throw new Error("That deal no longer exists.");
  stageInCompany(db, deal.companyId, stageId);
  const { now } = options;

  db.prepare(`UPDATE deals SET stage_id = ?, updated_at = ? WHERE id = ?`).run(stageId, now, id);
  touchLead(db, deal.leadId, now);

  writeActivity(db, {
    companyId: deal.companyId,
    leadId: deal.leadId,
    kind: "stage_change",
    body: movedTo(db, deal, stageId),
    occurredAt: now,
    meta: { stageId, dealId: id },
  });

  stampClosed(db, id, stageId, now);
  becomeCustomer(db, deal.leadId, stageId);

  // Inside the same transaction as the move: a follow-up for a move that then
  // rolled back would be a task for something that never happened.
  if (stageId && options.followUp) followUpIfNothingPlanned(db, deal.companyId, deal.leadId, stageId);
}

/**
 * What the history says about a move: the stage, and the deal's name too when
 * the contact has more than one deal or the deal is not just named after it.
 */
function movedTo(db: Db, deal: Deal, stageId: string | null): string {
  const stage = stageId
    ? ((db.prepare(`SELECT name FROM pipeline_stages WHERE id = ?`).get(stageId) as { name: string } | undefined)
        ?.name ?? "A stage")
    : "No stage";
  const lead = leadOf(db, deal.leadId);
  const count = (db.prepare(`SELECT COUNT(*) AS n FROM deals WHERE lead_id = ?`).get(deal.leadId) as { n: number }).n;
  return count > 1 || deal.title !== lead.name ? `${deal.title}: ${stage}` : stage;
}

/**
 * Why a deal was lost. Recorded separately from the move, and never required:
 * a required field on a drag is how a board stops being used.
 */
export function setDealLoss(db: Db, id: string, reason: string | null): Deal {
  const before = findDeal(db, id);
  if (!before) throw new Error("That deal no longer exists.");
  const now = new Date().toISOString();
  db.transaction(() => {
    db.prepare(`UPDATE deals SET loss_reason = ?, updated_at = ? WHERE id = ?`).run(reason, now, id);
    if (reason) {
      const lead = leadOf(db, before.leadId);
      writeActivity(db, {
        companyId: before.companyId,
        leadId: before.leadId,
        kind: "field_change",
        body: before.title === lead.name ? `Lost because: ${reason}` : `${before.title} lost because: ${reason}`,
        occurredAt: now,
        meta: { dealId: id },
      });
    }
  })();
  const updated = findDeal(db, id);
  if (!updated) throw new Error("That deal no longer exists.");
  return updated;
}

/** Deletes a deal. Its quotes and invoices stay with the contact; the money is still the money. */
export function deleteDeal(db: Db, id: string): void {
  const deal = findDeal(db, id);
  if (!deal) throw new Error("That deal no longer exists.");
  db.transaction(() => {
    db.prepare(`DELETE FROM deals WHERE id = ?`).run(id);
    touchLead(db, deal.leadId, new Date().toISOString());
  })();
}

/** A deal changing is the contact changing, as far as "recently touched" goes. */
function touchLead(db: Db, leadId: string, now: string): void {
  db.prepare(`UPDATE leads SET updated_at = ? WHERE id = ?`).run(now, leadId);
}

/**
 * When a deal actually finished: set on the way into a won or lost stage,
 * cleared on the way back out, or a reopened deal is closed and open at once.
 */
function stampClosed(db: Db, id: string, stageId: string | null, now: string): void {
  const kind = stageId
    ? (db.prepare(`SELECT kind FROM pipeline_stages WHERE id = ?`).get(stageId) as { kind: string } | undefined)?.kind
    : undefined;
  const closed = kind === "won" || kind === "lost";
  db.prepare(`UPDATE deals SET closed_at = ? WHERE id = ?`).run(closed ? now : null, id);
}

/**
 * A prospect whose deal is won is a customer now. Only a prospect: an investor
 * who also bought something is still, first, an investor.
 */
function becomeCustomer(db: Db, leadId: string, stageId: string | null): void {
  if (!stageId) return;
  const stage = db.prepare(`SELECT kind FROM pipeline_stages WHERE id = ?`).get(stageId) as
    | { kind: string }
    | undefined;
  if (stage?.kind !== "won") return;
  db.prepare(`UPDATE leads SET relationship = 'customer' WHERE id = ? AND relationship = 'prospect'`).run(leadId);
}
