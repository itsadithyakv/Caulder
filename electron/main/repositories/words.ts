import { randomUUID } from "node:crypto";
import type { Db } from "../db/connection";
import { TASK_AREA_LABEL, type AreaWord, type TaskArea } from "@shared/domain";

/**
 * Your words: course names and the like, each pointing at an area.
 *
 * Plain rows. What a word means when it turns up in a line is decided in
 * shared/quickadd.ts; this only keeps the list.
 */

type Row = { id: string; word: string; area: string; created_at: string };

const toWord = (row: Row): AreaWord => ({ id: row.id, word: row.word, area: row.area });

/** Alphabetical, so a list of twenty course codes is findable by eye. */
export function listAreaWords(db: Db): AreaWord[] {
  return (db.prepare(`SELECT * FROM area_words ORDER BY word COLLATE NOCASE`).all() as Row[]).map(
    toWord,
  );
}

/**
 * Teaches it one word or phrase.
 *
 * Spaces inside are collapsed as it is stored, so "machine  learning" and
 * "machine learning" are one phrase rather than two that look the same. A
 * word already known - ignoring case - is refused with a sentence rather than
 * a constraint error, because the answer the person needs is which area it
 * already points at.
 */
export function addAreaWord(db: Db, raw: { word: string; area: string }): AreaWord[] {
  const word = raw.word.trim().replace(/\s+/g, " ");
  if (word.length === 0) throw new Error("Type the word or phrase first.");

  const existing = db
    .prepare(`SELECT area FROM area_words WHERE word = ? COLLATE NOCASE`)
    .get(word) as { area: string } | undefined;
  if (existing) {
    const name = TASK_AREA_LABEL[existing.area as TaskArea] ?? existing.area;
    throw new Error(`"${word}" is already a word for ${name}. Remove it first to move it.`);
  }

  db.prepare(`INSERT INTO area_words (id, word, area, created_at) VALUES (?, ?, ?, ?)`).run(
    randomUUID(),
    word,
    raw.area,
    new Date().toISOString(),
  );
  return listAreaWords(db);
}

export function removeAreaWord(db: Db, id: string): AreaWord[] {
  db.prepare(`DELETE FROM area_words WHERE id = ?`).run(id);
  return listAreaWords(db);
}
