import { randomUUID } from "node:crypto";
import type { Db } from "../db/connection";
import { lessonInput, wordsOf, type Lesson, type LessonKind } from "@shared/lessons";

/**
 * What the line learnt from being corrected (shared/lessons.ts says what a
 * lesson means). Global, like Your words and Tune: which part of life a jacket
 * is does not change with the company that happens to be open.
 */

type Row = { id: string; words: string; area: string | null; kind: string | null; times: number; sample: string };

const toLesson = (row: Row): Lesson => ({
  id: row.id,
  words: row.words.split(" ").filter(Boolean),
  area: row.area,
  kind: row.kind as LessonKind | null,
  times: row.times,
  sample: row.sample,
});

/** Most recently taught first, which is the order a list of them is read in. */
export function listLessons(db: Db): Lesson[] {
  return (db.prepare(`SELECT id, words, area, kind, times, sample FROM line_lessons ORDER BY last_seen DESC`).all() as Row[]).map(toLesson);
}

/**
 * One correction. The same words taught the same answer again count up. A
 * line with no word worth learning from - "do it", "the thing" - teaches
 * nothing, and says so by returning the list unchanged.
 */
export function addLesson(db: Db, raw: unknown, now: Date = new Date()): Lesson[] {
  const input = lessonInput.parse(raw);
  const words = wordsOf(input.text).join(" ");
  if (!words) return listLessons(db);
  const stamp = now.toISOString();
  const same = db
    .prepare(`SELECT id FROM line_lessons WHERE words = ? AND COALESCE(area, '') = ? AND COALESCE(kind, '') = ?`)
    .get(words, input.area ?? "", input.kind ?? "") as { id: string } | undefined;
  if (same) {
    db.prepare(`UPDATE line_lessons SET times = times + 1, last_seen = ? WHERE id = ?`).run(stamp, same.id);
  } else {
    db.prepare(
      `INSERT INTO line_lessons (id, words, area, kind, times, sample, created_at, last_seen) VALUES (?, ?, ?, ?, 1, ?, ?, ?)`,
    ).run(randomUUID(), words, input.area, input.kind, input.text.slice(0, 200), stamp, stamp);
  }
  return listLessons(db);
}

export function removeLesson(db: Db, id: string): Lesson[] {
  db.prepare(`DELETE FROM line_lessons WHERE id = ?`).run(id);
  return listLessons(db);
}
