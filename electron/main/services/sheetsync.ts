import type { Db } from "../db/connection";
import { leadInput } from "@shared/domain";
import {
  SHEET_FIELDS,
  SHEET_HEADER,
  planSheet,
  readRow,
  rowOf,
  valuesOf,
  type SheetShown,
  type SheetState,
  type SheetValues,
} from "@shared/sheet";
import { SHEET_SINCE_VERSION } from "@shared/script";
import { MAIN_DEAL } from "../repositories/main-deal";
import { createLead, findLead, updateLead } from "../repositories/leads";
import { isConnected } from "./credentials";
import { callScript } from "./gsync";
import { scriptInfo } from "./mail";

/**
 * A company's contacts kept as a Google Sheet (shared/sheet.ts says what a
 * row is and which side is right; this reads, applies and writes).
 *
 * Through the person's own script, like everything else Google: the sheet is
 * in their Drive, and Caulder never signs in. Off until a company is linked,
 * and then only that company's contacts go - names, the ways to reach them,
 * where they came from and notes, with the stage, value and next step shown
 * beside them. Never the history, the money or the brain.
 *
 * One pass is: read the sheet, take in what was changed there, write the
 * whole list back, and keep what was written as the base for next time. What
 * the sheet changed goes through `leadInput` and `updateLead` like an edit
 * made on the contact's own page, so the same sentences refuse the same
 * things, and the contact's history says its details were edited.
 */

type LinkRow = {
  company_id: string;
  url: string | null;
  synced_at: string | null;
  count: number;
  changed: number;
  made: number;
  error: string | null;
  problems: string;
};

type ContactRow = SheetValues & { id: string; stage: string | null; value: number | null; next: string | null; last_contacted_at: string | null };

/** Why a sheet cannot be kept right now, or null when it can. */
function blocked(db: Db): string | null {
  if (!isConnected()) return "Connect Google above first.";
  const info = scriptInfo(db);
  if (info && info.version < SHEET_SINCE_VERSION) {
    return "Your Google script is an older version that cannot keep a sheet. Update it above - it takes a minute - and come back.";
  }
  return null;
}

function linkOf(db: Db, companyId: string): LinkRow | null {
  return (db.prepare(`SELECT * FROM sheet_links WHERE company_id = ?`).get(companyId) as LinkRow | undefined) ?? null;
}

function problemsOf(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((each): each is string => typeof each === "string") : [];
  } catch {
    return [];
  }
}

export function sheetState(db: Db, companyId: string): SheetState {
  const link = linkOf(db, companyId);
  return {
    linked: link !== null,
    blocked: blocked(db),
    syncedAt: link?.synced_at ?? null,
    count: link?.count ?? 0,
    error: link?.error ?? null,
    problems: link ? problemsOf(link.problems) : [],
    changed: link?.changed ?? 0,
    made: link?.made ?? 0,
  };
}

/** The address of a company's sheet, for main to open. Null until the first sync has made it. */
export function sheetUrl(db: Db, companyId: string): string | null {
  return linkOf(db, companyId)?.url ?? null;
}

/** Every contact of a company as the sheet shows it. */
function contactsOf(db: Db, companyId: string): ContactRow[] {
  return db
    .prepare(
      `SELECT l.id, l.name, l.contact_person AS contactPerson, l.email, l.phone, l.city, l.linkedin, l.instagram,
              l.website, l.source, l.notes, l.last_contacted_at, s.name AS stage, md.value AS value,
              (SELECT t.title || ', ' || t.due_on FROM tasks t
                WHERE t.lead_id = l.id AND t.status = 'open' ORDER BY t.due_on, t.created_at LIMIT 1) AS next
         FROM leads l
         LEFT JOIN deals md ON md.id = ${MAIN_DEAL("l.id")}
         LEFT JOIN pipeline_stages s ON s.id = md.stage_id
        WHERE l.company_id = ?
        ORDER BY l.name COLLATE NOCASE, l.created_at`,
    )
    .all(companyId) as ContactRow[];
}

function shownOf(row: ContactRow): SheetShown {
  return {
    stage: row.stage,
    value: row.value === null ? null : String(row.value),
    next: row.next,
    lastContacted: row.last_contacted_at ? row.last_contacted_at.slice(0, 10) : null,
  };
}

/** Starts keeping a company's contacts in a sheet, and brings the two in step for the first time. */
export async function linkSheet(db: Db, companyId: string, now: Date = new Date()): Promise<SheetState> {
  const why = blocked(db);
  if (why) throw new Error(why);
  if (!db.prepare(`SELECT 1 FROM companies WHERE id = ?`).get(companyId)) throw new Error("That company no longer exists.");
  db.prepare(`INSERT OR IGNORE INTO sheet_links (company_id, created_at) VALUES (?, ?)`).run(companyId, now.toISOString());
  try {
    return await syncSheet(db, companyId, now);
  } catch (error) {
    // Not linked to a sheet that was never made: the next press starts again.
    if (linkOf(db, companyId)?.url == null) unlinkSheet(db, companyId);
    throw error;
  }
}

/** Stops keeping it. The spreadsheet stays in Drive, as it was last written; Caulder forgets it. */
export function unlinkSheet(db: Db, companyId: string): SheetState {
  db.transaction(() => {
    db.prepare(`DELETE FROM sheet_rows WHERE company_id = ?`).run(companyId);
    db.prepare(`DELETE FROM sheet_links WHERE company_id = ?`).run(companyId);
  })();
  return sheetState(db, companyId);
}

/**
 * One pass: the sheet read, what it changed taken in, the list written back.
 * A failure is kept on the link, in a sentence, and thrown for whoever asked.
 */
export async function syncSheet(db: Db, companyId: string, now: Date = new Date()): Promise<SheetState> {
  if (!linkOf(db, companyId)) throw new Error("This company's contacts are not kept in a sheet yet.");
  const why = blocked(db);
  if (why) throw new Error(why);
  const company = db.prepare(`SELECT name FROM companies WHERE id = ?`).get(companyId) as { name: string } | undefined;
  if (!company) throw new Error("That company no longer exists.");

  try {
    const read = await callScript<{ id: string; url: string; rows: unknown[][] }>("sheetRead", {
      company: companyId,
      name: company.name,
      columns: SHEET_HEADER.length,
    });

    const before = contactsOf(db, companyId);
    const local = new Map(before.map((row) => [row.id, valuesOf(row)] as const));
    const base = new Map(
      (db.prepare(`SELECT lead_id, base FROM sheet_rows WHERE company_id = ?`).all(companyId) as { lead_id: string; base: string }[]).flatMap(
        (row) => {
          try {
            return [[row.lead_id, valuesOf(JSON.parse(row.base) as SheetValues)] as const];
          } catch {
            return [];
          }
        },
      ),
    );
    const plan = planSheet(local, base, (read.rows ?? []).map((cells) => readRow(Array.isArray(cells) ? cells : [])));
    const problems = [...plan.problems];
    let changed = 0;
    let made = 0;

    db.transaction(() => {
      for (const update of plan.updates) {
        const lead = findLead(db, update.id);
        if (!lead) continue;
        const parsed = leadInput.safeParse({ ...lead, ...update.changes });
        if (!parsed.success) {
          // The sheet's word is refused the way the form would refuse it, and Caulder's stands.
          problems.push(`${lead.name}: ${parsed.error.issues[0]?.message ?? "what the sheet says could not be kept."}`);
          continue;
        }
        updateLead(db, lead.id, parsed.data);
        changed += 1;
      }
      for (const create of plan.creates) {
        const parsed = leadInput.safeParse({ ...create.values, source: create.values.source ?? "Google Sheet" });
        if (!parsed.success) {
          problems.push(`Row ${create.row}: ${parsed.error.issues[0]?.message ?? "it could not be made a contact."}`);
          continue;
        }
        createLead(db, companyId, parsed.data);
        made += 1;
      }
    })();

    // Written back from what Caulder holds now, so the two say the same thing.
    const after = contactsOf(db, companyId);
    const written = await callScript<{ id: string; url: string; count: number }>("sheetWrite", {
      company: companyId,
      name: company.name,
      header: SHEET_HEADER,
      rows: after.map((row) => rowOf(row.id, valuesOf(row), shownOf(row))),
    });

    db.transaction(() => {
      db.prepare(`DELETE FROM sheet_rows WHERE company_id = ?`).run(companyId);
      const keep = db.prepare(`INSERT INTO sheet_rows (lead_id, company_id, base) VALUES (?, ?, ?)`);
      for (const row of after) {
        const values = valuesOf(row);
        keep.run(row.id, companyId, JSON.stringify(Object.fromEntries(SHEET_FIELDS.map((field) => [field, values[field]]))));
      }
      db.prepare(
        `UPDATE sheet_links SET url = ?, synced_at = ?, count = ?, changed = ?, made = ?, error = NULL, problems = ? WHERE company_id = ?`,
      ).run(written.url ?? read.url ?? null, now.toISOString(), after.length, changed, made, JSON.stringify(problems.slice(0, 20)), companyId);
    })();
  } catch (error) {
    const said = error instanceof Error ? error.message : String(error);
    db.prepare(`UPDATE sheet_links SET error = ? WHERE company_id = ?`).run(said, companyId);
    throw error;
  }
  return sheetState(db, companyId);
}

/** Every linked company brought in step, for the background pass. One failing does not hold up the rest. */
export async function syncLinkedSheets(db: Db, now: Date = new Date()): Promise<number> {
  if (blocked(db)) return 0;
  let done = 0;
  for (const { company_id } of db.prepare(`SELECT company_id FROM sheet_links ORDER BY created_at`).all() as { company_id: string }[]) {
    try {
      await syncSheet(db, company_id, now);
      done += 1;
    } catch {
      // Said on the link, where Settings shows it.
    }
  }
  return done;
}
