import { randomUUID } from "node:crypto";
import type { Db } from "../db/connection";
import {
  DEFAULT_STAGES,
  type AccentId,
  type Company,
  type CompanyInput,
  type PipelineStage,
  type StageKind,
} from "@shared/domain";

/**
 * Every function takes its connection explicitly. Reaching for a module-level
 * singleton would tie these to Electron's app paths and make them untestable
 * outside a running window; passing the handle keeps them plain functions over
 * a database.
 */

type CompanyRow = {
  id: string;
  name: string;
  accent: string;
  timezone: string;
  is_archived: number;
  created_at: string;
  updated_at: string;
};

type StageRow = {
  id: string;
  company_id: string;
  name: string;
  position: number;
  kind: string;
};

function toCompany(row: CompanyRow): Company {
  return {
    id: row.id,
    name: row.name,
    accent: row.accent as AccentId,
    timezone: row.timezone,
    isArchived: row.is_archived === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    // Overwritten by listCompanies, which counts in the same query. Callers
    // fetching a single company do not need the count.
    leadCount: 0,
  };
}

function toStage(row: StageRow): PipelineStage {
  return {
    id: row.id,
    companyId: row.company_id,
    name: row.name,
    position: row.position,
    kind: row.kind as StageKind,
  };
}

export function listCompanies(db: Db): Company[] {
  const rows = db
    .prepare(
      `SELECT c.*, (
         SELECT COUNT(*) FROM leads l WHERE l.company_id = c.id
       ) AS lead_count
       FROM companies c
       WHERE c.is_archived = 0
       ORDER BY c.name COLLATE NOCASE`,
    )
    .all() as (CompanyRow & { lead_count: number })[];

  return rows.map((row) => ({ ...toCompany(row), leadCount: row.lead_count }));
}

export function findCompany(db: Db, id: string): Company | null {
  const row = db.prepare(`SELECT * FROM companies WHERE id = ?`).get(id) as
    | CompanyRow
    | undefined;
  return row ? toCompany(row) : null;
}

/**
 * Creates a company and seeds its default pipeline, in one transaction. A
 * workspace with no stages cannot show a board, so the two are never allowed
 * to exist apart.
 */
export function createCompany(db: Db, input: CompanyInput): Company {
  const now = new Date().toISOString();
  const id = randomUUID();

  const insertCompany = db.prepare(
    `INSERT INTO companies (id, name, accent, timezone, is_archived, created_at, updated_at)
     VALUES (?, ?, ?, ?, 0, ?, ?)`,
  );
  const insertStage = db.prepare(
    `INSERT INTO pipeline_stages (id, company_id, name, position, kind, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );

  const run = db.transaction(() => {
    insertCompany.run(id, input.name, input.accent, input.timezone, now, now);
    DEFAULT_STAGES.forEach((stage, index) => {
      insertStage.run(randomUUID(), id, stage.name, index, stage.kind, now);
    });
  });

  try {
    run();
  } catch (error) {
    // The live-name unique index is the only constraint a user can trip here,
    // and "UNIQUE constraint failed" is not an answer anyone can act on.
    if (isUniqueViolation(error)) {
      throw new Error(`A company called "${input.name}" already exists.`);
    }
    throw error;
  }

  const created = findCompany(db, id);
  if (!created) throw new Error("Company vanished immediately after being created.");
  return created;
}

export function renameCompany(db: Db, id: string, name: string): Company {
  try {
    const result = db
      .prepare(`UPDATE companies SET name = ?, updated_at = ? WHERE id = ?`)
      .run(name, new Date().toISOString(), id);
    if (result.changes === 0) throw new Error("That company no longer exists.");
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new Error(`A company called "${name}" already exists.`);
    }
    throw error;
  }

  const updated = findCompany(db, id);
  if (!updated) throw new Error("That company no longer exists.");
  return updated;
}

export function setCompanyAccent(db: Db, id: string, accent: AccentId): Company {
  const result = db
    .prepare(`UPDATE companies SET accent = ?, updated_at = ? WHERE id = ?`)
    .run(accent, new Date().toISOString(), id);

  if (result.changes === 0) throw new Error("That company no longer exists.");

  const updated = findCompany(db, id);
  if (!updated) throw new Error("That company no longer exists.");
  return updated;
}

/**
 * Archives rather than deletes. A company owns leads, activities and email
 * history through cascades, so a real delete would silently destroy years of
 * record. Archiving frees the name and hides the workspace.
 */
export function archiveCompany(db: Db, id: string): void {
  const result = db
    .prepare(
      `UPDATE companies SET is_archived = 1, updated_at = ?
       WHERE id = ? AND is_archived = 0`,
    )
    .run(new Date().toISOString(), id);

  if (result.changes === 0) throw new Error("That company no longer exists.");
}

/**
 * Deletes a company and everything in it.
 *
 * Archiving hides a workspace; this ends it. Every table carries company_id
 * with ON DELETE CASCADE, so one statement takes the leads, their timelines,
 * the tasks, the funnel, the templates, the sequences and the email queue -
 * which is exactly why it needs confirming by name in the UI rather than by
 * a button somebody can be halfway through pressing.
 *
 * The last company cannot go. An app with no workspace has nowhere to put the
 * user, and the first-run screen would reappear as if nothing had ever
 * happened, which reads as data loss even when it was asked for.
 */
export function deleteCompany(db: Db, id: string): void {
  const remaining = db
    .prepare(`SELECT COUNT(*) AS n FROM companies WHERE id <> ?`)
    .get(id) as { n: number };

  if (remaining.n === 0) {
    throw new Error(
      "This is your only company, so it cannot be deleted. Add another one first.",
    );
  }

  const result = db.prepare(`DELETE FROM companies WHERE id = ?`).run(id);
  if (result.changes === 0) throw new Error("That company no longer exists.");
}

export function listStages(db: Db, companyId: string): PipelineStage[] {
  const rows = db
    .prepare(`SELECT * FROM pipeline_stages WHERE company_id = ? ORDER BY position`)
    .all(companyId) as StageRow[];
  return rows.map(toStage);
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    String((error as { code: unknown }).code).startsWith("SQLITE_CONSTRAINT")
  );
}
