import { randomUUID } from "node:crypto";
import type { Db } from "../db/connection";
import type { PipelineStage, StageKind } from "@shared/domain";
import { listStages } from "./companies";

/**
 * Editing the funnel.
 *
 * Every function returns the company's whole stage list rather than the one row
 * it changed. Reordering touches several rows at once, and the caller replacing
 * its list outright removes a class of bug where positions drift out of step
 * with what is on screen — the same reasoning as the company handlers.
 */

/** Positions are contiguous from zero, so a gap never survives a change. */
function renumber(db: Db, companyId: string): void {
  const rows = db
    .prepare(`SELECT id FROM pipeline_stages WHERE company_id = ? ORDER BY position, rowid`)
    .all(companyId) as { id: string }[];

  const setPosition = db.prepare(`UPDATE pipeline_stages SET position = ? WHERE id = ?`);
  rows.forEach((row, index) => setPosition.run(index, row.id));
}

function stageCompany(db: Db, stageId: string): string {
  const row = db
    .prepare(`SELECT company_id FROM pipeline_stages WHERE id = ?`)
    .get(stageId) as { company_id: string } | undefined;
  if (!row) throw new Error("That stage no longer exists.");
  return row.company_id;
}

export function createStage(
  db: Db,
  companyId: string,
  name: string,
  kind: StageKind,
): PipelineStage[] {
  const now = new Date().toISOString();

  try {
    db.transaction(() => {
      const last = db
        .prepare(
          `SELECT COALESCE(MAX(position), -1) AS p FROM pipeline_stages WHERE company_id = ?`,
        )
        .get(companyId) as { p: number };

      db.prepare(
        `INSERT INTO pipeline_stages (id, company_id, name, position, kind, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(randomUUID(), companyId, name, last.p + 1, kind, now);
    })();
  } catch (cause) {
    throw duplicateNameOr(cause, name);
  }

  return listStages(db, companyId);
}

export function renameStage(db: Db, stageId: string, name: string): PipelineStage[] {
  const companyId = stageCompany(db, stageId);

  try {
    db.prepare(`UPDATE pipeline_stages SET name = ? WHERE id = ?`).run(name, stageId);
  } catch (cause) {
    throw duplicateNameOr(cause, name);
  }

  return listStages(db, companyId);
}

export function setStageKind(db: Db, stageId: string, kind: StageKind): PipelineStage[] {
  const companyId = stageCompany(db, stageId);
  db.prepare(`UPDATE pipeline_stages SET kind = ? WHERE id = ?`).run(kind, stageId);
  return listStages(db, companyId);
}

/**
 * Moves a stage one place along the board.
 *
 * A swap rather than an arbitrary reorder: the buttons in settings are Up and
 * Down, and this is exactly what they mean. Reordering by drag would want a
 * different shape, and there is nothing to gain from writing that first.
 */
export function moveStage(db: Db, stageId: string, direction: -1 | 1): PipelineStage[] {
  const companyId = stageCompany(db, stageId);

  db.transaction(() => {
    renumber(db, companyId);

    const stages = listStages(db, companyId);
    const index = stages.findIndex((stage) => stage.id === stageId);
    const target = index + direction;
    // Already at the end. Doing nothing is the right answer, not an error.
    if (index === -1 || target < 0 || target >= stages.length) return;

    const swap = db.prepare(`UPDATE pipeline_stages SET position = ? WHERE id = ?`);
    swap.run(target, stageId);
    swap.run(index, stages[target]!.id);
  })();

  return listStages(db, companyId);
}

/**
 * Removes a stage.
 *
 * Deals in it are not deleted: the foreign key nulls their `stage_id`, and they
 * show on the board in an "Unstaged" column so nothing is lost by tidying the
 * funnel. The last stage cannot go, because a board with no columns has nowhere
 * to put anything.
 */
export function deleteStage(db: Db, stageId: string): PipelineStage[] {
  const companyId = stageCompany(db, stageId);

  const count = db
    .prepare(`SELECT COUNT(*) AS n FROM pipeline_stages WHERE company_id = ?`)
    .get(companyId) as { n: number };
  if (count.n <= 1) {
    throw new Error("Keep at least one stage. A board needs somewhere to put a deal.");
  }

  db.transaction(() => {
    db.prepare(`DELETE FROM pipeline_stages WHERE id = ?`).run(stageId);
    renumber(db, companyId);
  })();

  return listStages(db, companyId);
}

/**
 * Stage names are unique per company, so two "Contacted" columns cannot exist.
 * The constraint gives a SQLite message; this turns it into one that says what
 * to do.
 */
function duplicateNameOr(cause: unknown, name: string): Error {
  const message = cause instanceof Error ? cause.message : String(cause);
  if (message.includes("UNIQUE") && message.includes("pipeline_stages")) {
    return new Error(`There is already a stage called "${name}".`);
  }
  return cause instanceof Error ? cause : new Error(message);
}
