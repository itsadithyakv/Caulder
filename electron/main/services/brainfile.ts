import { writeFileSync } from "node:fs";
import type { Db } from "../db/connection";
import type { ImportOutcome } from "@shared/share";
import { PERSONAL_SQL } from "@shared/brain";
import { applyArrivedEdit, insertArrivedPage, travellingOf, type TravellingPage } from "../repositories/brain";
import { readMe } from "../repositories/me";
import { makeRoomForSingle, readTravelling } from "./brainsync";

/**
 * The brain as one file, for two founders who will not use Google: export
 * it, send it, import it on the other side. Pages keep their ids, so bringing
 * a file in twice changes nothing the second time, and a page both have is
 * matched rather than doubled. What is newer wins; what is older is left
 * alone. Secrets and pins stay behind, as they do in the shared brain.
 */

type FilePage = TravellingPage & { id: string; updatedAt: string; updatedBy: string | null };

type BrainFile = {
  caulder: "brain";
  version: 1;
  company: string;
  exportedAt: string;
  author: string | null;
  pages: FilePage[];
};

export function brainFileOf(db: Db, companyId: string, now: Date = new Date()): BrainFile {
  const company = db.prepare(`SELECT name FROM companies WHERE id = ?`).get(companyId) as { name: string } | undefined;
  if (!company) throw new Error("That company no longer exists.");
  const rows = db
    .prepare(
      `SELECT id, section, template, title, body, fields, is_archived, updated_at, updated_by
         FROM brain_pages WHERE company_id = ? AND section NOT IN (${PERSONAL_SQL}) ORDER BY created_at`,
    )
    .all(companyId) as (Parameters<typeof travellingOf>[0] & { id: string; updated_at: string; updated_by: string | null })[];
  return {
    caulder: "brain",
    version: 1,
    company: company.name,
    exportedAt: now.toISOString(),
    author: readMe(db).name,
    pages: rows.map((row) => ({ id: row.id, ...travellingOf(row), updatedAt: row.updated_at, updatedBy: row.updated_by })),
  };
}

export function writeBrainFile(db: Db, companyId: string, path: string, now: Date = new Date()): number {
  const file = brainFileOf(db, companyId, now);
  writeFileSync(path, JSON.stringify(file, null, 1), "utf8");
  return file.pages.length;
}

function same(a: TravellingPage, b: TravellingPage): boolean {
  return (
    a.section === b.section &&
    a.template === b.template &&
    a.title === b.title &&
    a.body === b.body &&
    a.isArchived === b.isArchived &&
    JSON.stringify(Object.entries(a.fields).sort()) === JSON.stringify(Object.entries(b.fields).sort())
  );
}

/** Reads a brain file into a company. Anything that is not a brain file is refused whole. */
export function importBrainFile(db: Db, companyId: string, text: string, now: Date = new Date()): ImportOutcome {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("That file is not a brain file: it is not readable.");
  }
  const file = parsed as Partial<BrainFile>;
  if (file?.caulder !== "brain" || file.version !== 1 || !Array.isArray(file.pages)) {
    throw new Error("That file is not a brain file Caulder wrote.");
  }

  const outcome: ImportOutcome = { added: 0, updated: 0, kept: 0, same: 0 };
  const at = now.toISOString();
  db.transaction(() => {
    for (const raw of file.pages ?? []) {
      const entry = raw as Partial<FilePage>;
      const page = readTravelling(entry);
      const id = typeof entry.id === "string" && /^[A-Za-z0-9-]{8,64}$/.test(entry.id) ? entry.id : null;
      if (!page || !id) continue;
      const updatedAt = typeof entry.updatedAt === "string" && !Number.isNaN(Date.parse(entry.updatedAt)) ? entry.updatedAt : at;
      const arrival = {
        author: typeof entry.updatedBy === "string" ? entry.updatedBy : (file.author ?? null),
        editedAt: updatedAt,
        concurrent: false,
        syncRevision: null,
      };

      const row = db.prepare(`SELECT * FROM brain_pages WHERE id = ?`).get(id) as
        | (Parameters<typeof travellingOf>[0] & { company_id: string; updated_at: string })
        | undefined;
      if (row && row.company_id !== companyId) continue;
      if (!row) {
        makeRoomForSingle(db, companyId, page.template, id);
        insertArrivedPage(db, companyId, id, page, arrival);
        outcome.added += 1;
      } else if (same(travellingOf(row), page)) {
        outcome.same += 1;
      } else if (updatedAt > row.updated_at) {
        applyArrivedEdit(db, id, page, arrival);
        outcome.updated += 1;
      } else {
        outcome.kept += 1;
      }
    }
  })();
  return outcome;
}
