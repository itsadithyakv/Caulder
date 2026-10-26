import { randomUUID } from "node:crypto";
import type { Db } from "../db/connection";
import type { NameInput, NameKept } from "@shared/tune";

/**
 * Who a word on the quick line means (PLAN.md, part twelve, phase 48): kept
 * when the line asked "which Priya?" or "is that Priya?" and was told, so it
 * is not asked again. One word, one contact, per company; a second answer
 * for the same word replaces the first.
 */

export function listNames(db: Db, companyId: string): NameKept[] {
  return (
    db
      .prepare(
        `SELECT n.id, n.said, n.lead_id, l.name AS lead_name FROM line_names n
         JOIN leads l ON l.id = n.lead_id
         WHERE n.company_id = ? ORDER BY n.said COLLATE NOCASE`,
      )
      .all(companyId) as { id: string; said: string; lead_id: string; lead_name: string }[]
  ).map((row) => ({ id: row.id, said: row.said, leadId: row.lead_id, leadName: row.lead_name }));
}

export function keepName(db: Db, companyId: string, input: NameInput): NameKept[] {
  const lead = db.prepare(`SELECT 1 FROM leads WHERE id = ? AND company_id = ?`).get(input.leadId, companyId);
  if (!lead) throw new Error("That contact is not in this company.");
  db.prepare(
    `INSERT INTO line_names (id, company_id, said, lead_id, created_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (company_id, said COLLATE NOCASE) DO UPDATE SET lead_id = excluded.lead_id`,
  ).run(randomUUID(), companyId, input.said, input.leadId, new Date().toISOString());
  return listNames(db, companyId);
}

export function forgetName(db: Db, id: string): void {
  db.prepare(`DELETE FROM line_names WHERE id = ?`).run(id);
}
