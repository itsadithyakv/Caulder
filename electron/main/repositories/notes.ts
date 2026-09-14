import { randomUUID } from "node:crypto";
import type { Db } from "../db/connection";
import type { Note } from "@shared/domain";

/**
 * Notes: a thought, caught before it goes.
 *
 * The one design rule worth stating is what a note is *not*. It is not an
 * activity, because an activity must belong to a lead and the whole value of
 * catching a thought is that it belongs to nothing yet. Forcing it to pick an
 * owner first is how the thought is lost.
 */

type NoteRow = {
  id: string;
  company_id: string;
  body: string;
  day: string;
  is_pinned: number;
  created_at: string;
  updated_at: string;
};

function toNote(row: NoteRow): Note {
  return {
    id: row.id,
    companyId: row.company_id,
    body: row.body,
    day: row.day,
    isPinned: row.is_pinned === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Pinned first, then newest.
 *
 * A search matches the body, with `%` and `_` escaped so looking for "50%"
 * does not match everything - the same rule the leads search already follows.
 */
export function listNotes(db: Db, companyId: string, search = "", limit = 200): Note[] {
  const term = search.trim();

  if (term.length === 0) {
    const rows = db
      .prepare(
        `SELECT * FROM notes WHERE company_id = ?
          ORDER BY is_pinned DESC, created_at DESC LIMIT ?`,
      )
      .all(companyId, limit) as NoteRow[];
    return rows.map(toNote);
  }

  const escaped = term.replace(/[\\%_]/g, (character) => `\\${character}`);
  const rows = db
    .prepare(
      `SELECT * FROM notes
        WHERE company_id = ? AND body LIKE ? ESCAPE '\\'
        ORDER BY is_pinned DESC, created_at DESC LIMIT ?`,
    )
    .all(companyId, `%${escaped}%`, limit) as NoteRow[];
  return rows.map(toNote);
}

/** The notes caught on one day, shown beside that day's plan. */
export function listNotesOn(db: Db, companyId: string, day: string): Note[] {
  const rows = db
    .prepare(
      `SELECT * FROM notes WHERE company_id = ? AND day = ?
        ORDER BY is_pinned DESC, created_at DESC`,
    )
    .all(companyId, day) as NoteRow[];
  return rows.map(toNote);
}

function findNote(db: Db, id: string): Note | null {
  const row = db.prepare(`SELECT * FROM notes WHERE id = ?`).get(id) as NoteRow | undefined;
  return row ? toNote(row) : null;
}

export function createNote(db: Db, companyId: string, body: string, day: string): Note {
  const now = new Date().toISOString();
  const id = randomUUID();

  db.prepare(
    `INSERT INTO notes (id, company_id, body, day, is_pinned, created_at, updated_at)
     VALUES (?, ?, ?, ?, 0, ?, ?)`,
  ).run(id, companyId, body, day, now, now);

  const created = findNote(db, id);
  if (!created) throw new Error("The note vanished immediately after being written.");
  return created;
}

export function updateNote(db: Db, id: string, body: string): Note {
  const result = db
    .prepare(`UPDATE notes SET body = ?, updated_at = ? WHERE id = ?`)
    .run(body, new Date().toISOString(), id);

  if (result.changes === 0) throw new Error("That note no longer exists.");

  const updated = findNote(db, id);
  if (!updated) throw new Error("That note no longer exists.");
  return updated;
}

export function setNotePinned(db: Db, id: string, pinned: boolean): Note {
  db.prepare(`UPDATE notes SET is_pinned = ?, updated_at = ? WHERE id = ?`).run(
    pinned ? 1 : 0,
    new Date().toISOString(),
    id,
  );

  const updated = findNote(db, id);
  if (!updated) throw new Error("That note no longer exists.");
  return updated;
}

export function deleteNote(db: Db, id: string): void {
  db.prepare(`DELETE FROM notes WHERE id = ?`).run(id);
}
