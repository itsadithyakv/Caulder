import { randomUUID } from "node:crypto";
import type { Db } from "../db/connection";
import { DOCUMENT_CATEGORIES, documentInput, type CompanyDocument } from "@shared/deadlines";

/**
 * The company's documents: certificates, contracts, pitch decks, the files a
 * contact came with. A document is either a stored file - copied into the
 * app's own folder, the way attachments always were - or a record of where
 * one is, for the paper in a drawer. Either can expire.
 */

type DocumentRow = {
  id: string;
  company_id: string;
  name: string;
  category: string;
  file: string | null;
  bytes: number | null;
  location: string | null;
  expires_on: string | null;
  lead_id: string | null;
  lead_name: string | null;
  page_id: string | null;
  page_title: string | null;
  notes: string | null;
  created_at: string;
};

const SELECT = `
  SELECT d.*, l.name AS lead_name, p.title AS page_title
    FROM documents d
    LEFT JOIN leads l ON l.id = d.lead_id
    LEFT JOIN brain_pages p ON p.id = d.page_id`;

function toDocument(row: DocumentRow): CompanyDocument {
  return {
    id: row.id,
    companyId: row.company_id,
    name: row.name,
    category: (DOCUMENT_CATEGORIES as readonly string[]).includes(row.category)
      ? (row.category as CompanyDocument["category"])
      : "other",
    hasFile: row.file !== null,
    bytes: row.bytes,
    location: row.location,
    expiresOn: row.expires_on,
    leadId: row.lead_id,
    leadName: row.lead_name,
    pageId: row.page_id,
    pageTitle: row.page_title,
    notes: row.notes,
    createdAt: row.created_at,
  };
}

/** A company's documents, or one contact's, newest first. */
export function listDocuments(db: Db, companyId: string, filter: { leadId?: string } = {}): CompanyDocument[] {
  const rows = filter.leadId
    ? (db.prepare(`${SELECT} WHERE d.lead_id = ? ORDER BY d.created_at DESC`).all(filter.leadId) as DocumentRow[])
    : (db.prepare(`${SELECT} WHERE d.company_id = ? ORDER BY d.created_at DESC`).all(companyId) as DocumentRow[]);
  return rows.map(toDocument);
}

function findDocument(db: Db, id: string): CompanyDocument | null {
  const row = db.prepare(`${SELECT} WHERE d.id = ?`).get(id) as DocumentRow | undefined;
  return row ? toDocument(row) : null;
}

/** Where a document's stored file is, for opening or deleting it. */
export function storedFile(db: Db, id: string): { file: string | null; companyId: string; leadId: string | null } | null {
  const row = db.prepare(`SELECT file, company_id, lead_id FROM documents WHERE id = ?`).get(id) as
    | { file: string | null; company_id: string; lead_id: string | null }
    | undefined;
  return row ? { file: row.file, companyId: row.company_id, leadId: row.lead_id } : null;
}

function checkOwners(db: Db, companyId: string, leadId: string | null, pageId: string | null): void {
  if (leadId && !db.prepare(`SELECT 1 FROM leads WHERE id = ? AND company_id = ?`).get(leadId, companyId)) {
    throw new Error("That contact is not in this company.");
  }
  if (pageId && !db.prepare(`SELECT 1 FROM brain_pages WHERE id = ? AND company_id = ?`).get(pageId, companyId)) {
    throw new Error("That page is not in this company.");
  }
}

/**
 * Keeps a document: a file already copied into the store, or - with no file -
 * a record of where it is.
 */
export function recordDocument(
  db: Db,
  companyId: string,
  raw: unknown,
  file: { stored: string; bytes: number } | null = null,
  now: Date = new Date(),
): CompanyDocument {
  const input = documentInput.parse(raw);
  checkOwners(db, companyId, input.leadId, input.pageId);
  if (!file && !input.location) {
    throw new Error("Say where the document is, or attach the file.");
  }
  const id = randomUUID();
  const at = now.toISOString();
  db.prepare(
    `INSERT INTO documents (id, company_id, name, category, file, bytes, location, expires_on, lead_id, page_id,
                            notes, created_at, updated_at)
     VALUES (@id, @companyId, @name, @category, @file, @bytes, @location, @expiresOn, @leadId, @pageId,
             @notes, @at, @at)`,
  ).run({ ...input, id, companyId, file: file?.stored ?? null, bytes: file?.bytes ?? null, at });
  const saved = findDocument(db, id);
  if (!saved) throw new Error("The document vanished immediately after being kept.");
  return saved;
}

export function updateDocument(db: Db, id: string, raw: unknown, now: Date = new Date()): CompanyDocument {
  const before = findDocument(db, id);
  if (!before) throw new Error("That document no longer exists.");
  const input = documentInput.parse(raw);
  checkOwners(db, before.companyId, input.leadId, input.pageId);
  if (!before.hasFile && !input.location) throw new Error("Say where the document is.");
  db.prepare(
    `UPDATE documents SET name = @name, category = @category, location = @location, expires_on = @expiresOn,
       lead_id = @leadId, page_id = @pageId, notes = @notes, updated_at = @at
     WHERE id = @id`,
  ).run({ ...input, id, at: now.toISOString() });
  const saved = findDocument(db, id);
  if (!saved) throw new Error("That document no longer exists.");
  return saved;
}

/** Forgets a document and says which stored file, if any, is now nobody's. */
export function deleteDocument(db: Db, id: string): string | null {
  const found = storedFile(db, id);
  if (!found) throw new Error("That document no longer exists.");
  db.prepare(`DELETE FROM documents WHERE id = ?`).run(id);
  return found.file;
}
