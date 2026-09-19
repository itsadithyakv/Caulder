import { randomUUID } from "node:crypto";
import { countryOf, currencyFor, isCountry } from "@shared/countries";
import type { Db } from "../db/connection";
import {
  COMPANY_MODE_STAGES,
  DEFAULT_STAGES,
  WORKSPACE_KINDS,
  type AccentId,
  type Company,
  type CompanyDraft,
  type PipelineStage,
  type StageKind,
  type WorkspaceKind,
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
  kind: string;
  is_archived: number;
  created_at: string;
  updated_at: string;
  logo: string | null;
  goal_value: number | null;
  goal_period: string | null;
  remind_minutes: number | null;
  qualified_stage_id: string | null;
  currency: string;
  country: string | null;
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
    // Rows written before migration 9 default to 'solo', which is what they
    // have always been. The fallback covers a value the app can no longer
    // produce rather than a missing one.
    kind: (WORKSPACE_KINDS as readonly string[]).includes(row.kind)
      ? (row.kind as WorkspaceKind)
      : "solo",
    isArchived: row.is_archived === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    // Overwritten by listCompanies, which counts in the same query. Callers
    // fetching a single company do not need the count.
    leadCount: 0,
    logo: row.logo,
    goalValue: row.goal_value,
    goalPeriod: (row.goal_period as Company["goalPeriod"]) ?? null,
    remindMinutes: row.remind_minutes,
    qualifiedStageId: row.qualified_stage_id,
    currency: row.currency,
    country: row.country ?? null,
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

/**
 * Where your own things live: the journal, Life, habits, the vision board.
 * They are yours, not a company's, so they stay put whichever company is
 * chosen. A workspace of the personal kind is exactly that, if there is one;
 * otherwise it is the first company made - for most people, their only one.
 */
export function homeCompanyId(db: Db): string | null {
  const row = db
    .prepare(
      `SELECT id FROM companies WHERE is_archived = 0
        ORDER BY (kind = 'personal') DESC, created_at, rowid LIMIT 1`,
    )
    .get() as { id: string } | undefined;
  return row?.id ?? null;
}

/**
 * The workspaces your day is made of: your home, and the company chosen.
 * One id for nearly everyone; two for someone whose own things live apart
 * from the company they are working on. Home first, so its timezone is the
 * day's.
 */
export function withHome(db: Db, companyId: string): string[] {
  const home = homeCompanyId(db);
  return home && home !== companyId ? [home, companyId] : [companyId];
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
/**
 * What this company is aiming at.
 *
 * Null clears it, which is different from a target of zero - "no goal set" and
 * "aiming at nothing" are not the same statement, and the forecast says
 * different things about them.
 */
export function setCompanyGoal(
  db: Db,
  companyId: string,
  goal: { value: number; period: string } | null,
): Company {
  db.prepare(
    `UPDATE companies SET goal_value = ?, goal_period = ?, updated_at = ? WHERE id = ?`,
  ).run(goal?.value ?? null, goal?.period ?? null, new Date().toISOString(), companyId);

  const row = db.prepare(`SELECT * FROM companies WHERE id = ?`).get(companyId) as
    | CompanyRow
    | undefined;
  if (!row) throw new Error("That company no longer exists.");
  return toCompany(row);
}

/**
 * How long before a block starts this workspace says something, or null for
 * nothing at all.
 *
 * Off is the default and off is the master switch: a block asking for its own
 * lead time is ignored while this is null. A control that keeps acting after
 * it has been turned off is worse than one that was never offered.
 */
export function setCompanyRemind(db: Db, companyId: string, minutes: number | null): Company {
  db.prepare(`UPDATE companies SET remind_minutes = ?, updated_at = ? WHERE id = ?`).run(
    minutes,
    new Date().toISOString(),
    companyId,
  );

  const row = db.prepare(`SELECT * FROM companies WHERE id = ?`).get(companyId) as
    | CompanyRow
    | undefined;
  if (!row) throw new Error("That workspace no longer exists.");
  return toCompany(row);
}

/**
 * Which stage counts as qualified, and what currency this workspace is in.
 *
 * Both belong to the marketing report and both are nullable-by-meaning:
 * qualified is null until somebody says, because inventing it from stage
 * position would be Caulder deciding what this funnel means, and the report
 * says "not set" rather than reporting zero qualified leads.
 */
/** Display only. Nothing is ever converted, so a total is a total of one thing. */
/**
 * Where a company is: the country it chose, or - for one made before
 * countries - India when its money or its clock says so, which is all
 * Caulder assumed then. Null when nothing says.
 */
export function companyCountry(db: Db, companyId: string): string | null {
  const row = db.prepare(`SELECT country, currency, timezone FROM companies WHERE id = ?`).get(companyId) as
    | { country: string | null; currency: string; timezone: string }
    | undefined;
  if (!row) return null;
  if (row.country) return row.country;
  return row.currency === "INR" || row.timezone === "Asia/Kolkata" || row.timezone === "Asia/Calcutta" ? "IN" : null;
}

/** The calling code a bare number there is dialled with: "91", "44", "1". */
export function dialCodeOf(db: Db, companyId: string): string | null {
  return countryOf(companyCountry(db, companyId))?.dial ?? null;
}

/** Where the company is. Its currency is not changed with it: money already written down stays in what it was. */
export function setCompanyCountry(db: Db, companyId: string, country: string): void {
  if (!isCountry(country)) throw new Error("That is not a country Caulder knows.");
  db.prepare(`UPDATE companies SET country = ?, updated_at = ? WHERE id = ?`).run(country, new Date().toISOString(), companyId);
}

/** Its clock: the day it is, the hour a block starts. */
export function setCompanyTimezone(db: Db, companyId: string, timezone: string): void {
  if (!isTimezone(timezone)) throw new Error("That is not a timezone.");
  db.prepare(`UPDATE companies SET timezone = ?, updated_at = ? WHERE id = ?`).run(timezone, new Date().toISOString(), companyId);
}

function isTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export function setCompanyCurrency(db: Db, companyId: string, currency: string): Company {
  db.prepare(`UPDATE companies SET currency = ?, updated_at = ? WHERE id = ?`).run(
    currency,
    new Date().toISOString(),
    companyId,
  );

  const row = db.prepare(`SELECT * FROM companies WHERE id = ?`).get(companyId) as
    | CompanyRow
    | undefined;
  if (!row) throw new Error("That workspace no longer exists.");
  return toCompany(row);
}

export function createCompany(db: Db, input: CompanyDraft): Company {
  const now = new Date().toISOString();
  const id = randomUUID();

  const insertCompany = db.prepare(
    `INSERT INTO companies (id, name, accent, timezone, kind, logo, is_archived, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`,
  );
  // A company made with a country starts on its money; one made without, as
  // before any of this, on the rupee it always had. Written as its own step so
  // a database from before countries - an old one being carried forward in a
  // test - can still take a company made the old way.
  const place = input.country ?? null;
  const money = input.currency ?? currencyFor(place);
  const insertStage = db.prepare(
    `INSERT INTO pipeline_stages (id, company_id, name, position, kind, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );

  const kind = input.kind ?? "solo";

  // The chosen funnel, not always the default one. Every stage stays editable
  // from Settings afterwards, so this is a starting point rather than a
  // commitment - but starting from the right shape is most of the value.
  //
  // A personal workspace gets none. It has no board to show them on, and
  // seeding seven stages nobody can reach would leave the pipeline screen
  // technically correct and completely pointless.
  const stages = kind === "personal" ? [] : COMPANY_MODE_STAGES[input.mode ?? "sales"] ?? DEFAULT_STAGES;

  const run = db.transaction(() => {
    insertCompany.run(
      id,
      input.name,
      input.accent,
      input.timezone,
      kind,
      input.logo ?? null,
      now,
      now,
    );
    if (place || money) {
      db.prepare(`UPDATE companies SET country = ?, currency = COALESCE(?, currency) WHERE id = ?`).run(place, money, id);
    }
    stages.forEach((stage, index) => {
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
 * the tasks, the funnel, the templates, the calendar and the money -
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
