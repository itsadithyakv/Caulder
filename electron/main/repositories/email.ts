import { randomUUID } from "node:crypto";
import type { Db } from "../db/connection";
import type { EmailTemplate, TemplateInput } from "@shared/email";

/**
 * Email and WhatsApp templates. The messages themselves are in mail.ts.
 */

/* ---- Templates ---------------------------------------------------------- */

type TemplateRow = {
  id: string;
  company_id: string;
  name: string;
  subject: string;
  body: string;
  channel: string;
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
    channel: row.channel,
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

export function findTemplate(db: Db, id: string): EmailTemplate | null {
  const row = db.prepare(`SELECT * FROM email_templates WHERE id = ?`).get(id) as
    | TemplateRow
    | undefined;
  return row ? toTemplate(row) : null;
}

export function createTemplate(
  db: Db,
  companyId: string,
  input: TemplateInput,
): EmailTemplate[] {
  const now = new Date().toISOString();
  try {
    db.prepare(
      `INSERT INTO email_templates
         (id, company_id, name, subject, body, channel, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      randomUUID(),
      companyId,
      input.name,
      input.subject,
      input.body,
      input.channel,
      now,
      now,
    );
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
      `UPDATE email_templates SET name = ?, subject = ?, body = ?, channel = ?, updated_at = ?
       WHERE id = ?`,
    ).run(
      input.name,
      input.subject,
      input.body,
      input.channel,
      new Date().toISOString(),
      id,
    );
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
