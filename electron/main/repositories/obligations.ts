import { randomUUID } from "node:crypto";
import type { Db } from "../db/connection";
import {
  dueRule,
  obligationInput,
  openOccurrences,
  presetById,
  type DueRule,
  type Obligation,
  type ObligationDone,
} from "@shared/deadlines";
import { shiftDay } from "@shared/dates";

/**
 * Obligations: one row each with a rule, and one row per occurrence done.
 * Occurrences themselves are worked out in `shared/deadlines.ts`, never
 * stored, so a monthly filing is one row rather than twelve a year.
 */

type ObligationRow = {
  id: string;
  company_id: string;
  title: string;
  kind: string;
  rule: string;
  period: string;
  remind_days: number;
  amount: number | null;
  notes: string | null;
  preset_id: string | null;
  starts_on: string;
  ends_on: string | null;
  page_id: string | null;
  lead_id: string | null;
  document_id: string | null;
  is_active: number;
};

type DoneRow = {
  id: string;
  obligation_id: string;
  due_on: string;
  done_on: string;
  note: string | null;
  amount: number | null;
};

function readRule(text: string): DueRule {
  try {
    return dueRule.parse(JSON.parse(text));
  } catch {
    // A rule that no longer reads is one that never falls due, not a crash.
    return { every: "once", on: "1970-01-01" };
  }
}

function toDone(row: DoneRow): ObligationDone {
  return {
    id: row.id,
    obligationId: row.obligation_id,
    dueOn: row.due_on,
    doneOn: row.done_on,
    note: row.note,
    amount: row.amount,
  };
}

/** What has been done, by obligation, for a company. */
export function doneByObligation(db: Db, companyId: string): Map<string, ObligationDone[]> {
  const rows = db
    .prepare(
      `SELECT d.* FROM obligation_done d
         JOIN obligations o ON o.id = d.obligation_id
        WHERE o.company_id = ?
        ORDER BY d.due_on DESC`,
    )
    .all(companyId) as DoneRow[];
  const out = new Map<string, ObligationDone[]>();
  for (const row of rows) out.set(row.obligation_id, [...(out.get(row.obligation_id) ?? []), toDone(row)]);
  return out;
}

function toObligation(row: ObligationRow, done: readonly ObligationDone[], today: string): Obligation {
  const base = {
    rule: readRule(row.rule),
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    active: row.is_active === 1,
  };
  const doneDays = new Set(done.map((entry) => entry.dueOn));
  const last = done[0] ?? null;
  return {
    id: row.id,
    companyId: row.company_id,
    title: row.title,
    kind: row.kind as Obligation["kind"],
    period: row.period as Obligation["period"],
    remindDays: row.remind_days,
    amount: row.amount,
    notes: row.notes,
    presetId: row.preset_id,
    pageId: row.page_id,
    leadId: row.lead_id,
    documentId: row.document_id,
    ...base,
    nextDue: openOccurrences(base, doneDays, shiftDay(today, 731))[0] ?? null,
    lastDone: last ? { dueOn: last.dueOn, doneOn: last.doneOn } : null,
  };
}

export function listObligations(db: Db, companyId: string, today: string): Obligation[] {
  const rows = db
    .prepare(`SELECT * FROM obligations WHERE company_id = ? ORDER BY is_active DESC, title COLLATE NOCASE`)
    .all(companyId) as ObligationRow[];
  const done = doneByObligation(db, companyId);
  return rows
    .map((row) => toObligation(row, done.get(row.id) ?? [], today))
    .sort((a, b) => Number(b.active) - Number(a.active) || (a.nextDue ?? "9999").localeCompare(b.nextDue ?? "9999"));
}

function findObligation(db: Db, id: string, today: string): Obligation | null {
  const row = db.prepare(`SELECT * FROM obligations WHERE id = ?`).get(id) as ObligationRow | undefined;
  if (!row) return null;
  const done = db.prepare(`SELECT * FROM obligation_done WHERE obligation_id = ? ORDER BY due_on DESC`).all(id) as DoneRow[];
  return toObligation(row, done.map(toDone), today);
}

function obligationOr(db: Db, id: string, today: string): Obligation {
  const found = findObligation(db, id, today);
  if (!found) throw new Error("That deadline no longer exists.");
  return found;
}

export function createObligation(
  db: Db,
  companyId: string,
  raw: unknown,
  today: string,
  now: Date = new Date(),
  presetId: string | null = null,
): Obligation {
  const input = obligationInput.parse(raw);
  const id = randomUUID();
  const at = now.toISOString();
  db.prepare(
    `INSERT INTO obligations (id, company_id, title, kind, rule, period, remind_days, amount, notes, preset_id,
                              starts_on, ends_on, page_id, lead_id, document_id, is_active, created_at, updated_at)
     VALUES (@id, @companyId, @title, @kind, @rule, @period, @remindDays, @amount, @notes, @presetId,
             @startsOn, @endsOn, @pageId, @leadId, @documentId, @active, @at, @at)`,
  ).run({
    ...input,
    id,
    companyId,
    presetId,
    rule: JSON.stringify(input.rule),
    // Nothing before today is missed: a filing added now starts now.
    startsOn: input.startsOn ?? today,
    active: input.active ? 1 : 0,
    at,
  });
  return obligationOr(db, id, today);
}

export function updateObligation(db: Db, id: string, raw: unknown, today: string, now: Date = new Date()): Obligation {
  const before = obligationOr(db, id, today);
  const input = obligationInput.parse(raw);
  db.prepare(
    `UPDATE obligations SET title = @title, kind = @kind, rule = @rule, period = @period,
       remind_days = @remindDays, amount = @amount, notes = @notes, starts_on = @startsOn, ends_on = @endsOn,
       page_id = @pageId, lead_id = @leadId, document_id = @documentId, is_active = @active, updated_at = @at
     WHERE id = @id`,
  ).run({
    ...input,
    id,
    rule: JSON.stringify(input.rule),
    startsOn: input.startsOn ?? before.startsOn,
    active: input.active ? 1 : 0,
    at: now.toISOString(),
  });
  return obligationOr(db, id, today);
}

export function deleteObligation(db: Db, id: string): void {
  db.prepare(`DELETE FROM obligations WHERE id = ?`).run(id);
}

/** Marks one occurrence done. Doing it twice is doing it once. */
export function markDone(
  db: Db,
  obligationId: string,
  dueOn: string,
  doneOn: string,
  extra: { note?: string | null; amount?: number | null } = {},
  now: Date = new Date(),
): void {
  db.prepare(
    `INSERT INTO obligation_done (id, obligation_id, due_on, done_on, note, amount, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (obligation_id, due_on) DO NOTHING`,
  ).run(randomUUID(), obligationId, dueOn, doneOn, extra.note ?? null, extra.amount ?? null, now.toISOString());
}

export function undoDone(db: Db, obligationId: string, dueOn: string): void {
  db.prepare(`DELETE FROM obligation_done WHERE obligation_id = ? AND due_on = ?`).run(obligationId, dueOn);
}

/** What was done for an obligation, newest first. */
export function doneFor(db: Db, obligationId: string): ObligationDone[] {
  return (
    db.prepare(`SELECT * FROM obligation_done WHERE obligation_id = ? ORDER BY due_on DESC`).all(obligationId) as DoneRow[]
  ).map(toDone);
}

/** The presets a company has already added. */
export function addedPresets(db: Db, companyId: string): Set<string> {
  const rows = db
    .prepare(`SELECT preset_id FROM obligations WHERE company_id = ? AND preset_id IS NOT NULL`)
    .all(companyId) as { preset_id: string }[];
  return new Set(rows.map((row) => row.preset_id));
}

/** Adds presets as obligations starting today, skipping the ones already added. */
export function addPresets(db: Db, companyId: string, ids: readonly string[], today: string, now: Date = new Date()): number {
  const have = addedPresets(db, companyId);
  let added = 0;
  db.transaction(() => {
    for (const id of ids) {
      const preset = presetById(id);
      if (!preset) throw new Error("That is not a preset Caulder knows.");
      if (have.has(id)) continue;
      createObligation(
        db,
        companyId,
        {
          title: preset.title,
          kind: preset.kind,
          rule: preset.rule,
          period: preset.period,
          remindDays: preset.remindDays,
          notes: preset.note,
        },
        today,
        now,
        preset.id,
      );
      have.add(id);
      added += 1;
    }
  })();
  return added;
}
