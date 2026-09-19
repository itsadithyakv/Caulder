import { randomUUID } from "node:crypto";
import type { Db } from "../db/connection";
import type { CustomField, CustomFieldInput, FieldKind } from "@shared/domain";

/**
 * Files on a lead, and the fields the app could not have known about.
 *
 * Together because they share a shape - a small per-company list that
 * something else reads - and one rule: a company owns them, and deleting the
 * company takes them with it.
 */

/* ---- Custom fields ------------------------------------------------------ */

type FieldRow = {
  id: string;
  company_id: string;
  name: string;
  kind: string;
  choices: string | null;
  position: number;
  created_at: string;
};

function toField(row: FieldRow): CustomField {
  let choices: string[] = [];
  if (row.choices) {
    try {
      choices = JSON.parse(row.choices) as string[];
    } catch {
      choices = [];
    }
  }
  return {
    id: row.id,
    companyId: row.company_id,
    name: row.name,
    kind: row.kind as FieldKind,
    choices,
    position: row.position,
  };
}

export function listFields(db: Db, companyId: string): CustomField[] {
  const rows = db
    .prepare(`SELECT * FROM custom_fields WHERE company_id = ? ORDER BY position`)
    .all(companyId) as FieldRow[];
  return rows.map(toField);
}

export function createField(
  db: Db,
  companyId: string,
  input: CustomFieldInput,
): CustomField[] {
  const { next } = db
    .prepare(
      `SELECT COALESCE(MAX(position) + 1, 0) AS next FROM custom_fields WHERE company_id = ?`,
    )
    .get(companyId) as { next: number };

  try {
    db.prepare(
      `INSERT INTO custom_fields (id, company_id, name, kind, choices, position, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      randomUUID(),
      companyId,
      input.name,
      input.kind,
      input.kind === "choice" ? JSON.stringify(input.choices) : null,
      next,
      new Date().toISOString(),
    );
  } catch (error) {
    if (String(error).includes("UNIQUE")) {
      throw new Error(`There is already a field called "${input.name}".`);
    }
    throw error;
  }

  return listFields(db, companyId);
}

/**
 * Deleting a field deletes what people wrote in it.
 *
 * By cascade rather than quietly orphaning the values: a field nobody can see
 * is not a field, and leaving the rows behind would mean re-adding a field
 * with the same name silently resurrects old answers.
 */
export function deleteField(db: Db, companyId: string, id: string): CustomField[] {
  db.prepare(`DELETE FROM custom_fields WHERE id = ? AND company_id = ?`).run(id, companyId);
  return listFields(db, companyId);
}

export function valuesFor(db: Db, leadId: string): Record<string, string> {
  const rows = db
    .prepare(`SELECT field_id, value FROM custom_values WHERE lead_id = ?`)
    .all(leadId) as { field_id: string; value: string }[];

  return Object.fromEntries(rows.map((row) => [row.field_id, row.value]));
}

/** Writes one answer. An empty string clears it, rather than storing blank. */
export function setValue(db: Db, leadId: string, fieldId: string, value: string): void {
  const trimmed = value.trim();

  if (trimmed === "") {
    db.prepare(`DELETE FROM custom_values WHERE lead_id = ? AND field_id = ?`).run(leadId, fieldId);
    return;
  }

  db.prepare(
    `INSERT INTO custom_values (lead_id, field_id, value) VALUES (?, ?, ?)
     ON CONFLICT (lead_id, field_id) DO UPDATE SET value = excluded.value`,
  ).run(leadId, fieldId, trimmed);
}
