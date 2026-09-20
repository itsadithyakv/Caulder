import { randomUUID } from "node:crypto";
import type { Db } from "../db/connection";
import { today as todayIn } from "@shared/dates";
import { FEELINGS, privateInput, type Feeling, type PrivateDay, type PrivateLine } from "@shared/private";
import { keepPrivate, lockState, readPrivateBox } from "./journal-lock";

/**
 * Private lines: written without a passcode, read only with one.
 *
 * The journal's lock seals with the public half of a key, which needs nothing
 * - so a private line is sealed the moment it is written, not at midnight as
 * a day is, and the person writing is never asked for a passcode to do it.
 * Reading one back takes the passcode, like any day that is over.
 *
 * What is sealed is the whole of it: the words, who they were about and what
 * kind of feeling it was. Only the day is outside the box, so the journal can
 * say that a day has something locked in it without being able to say what.
 *
 * These rows are joined to nothing. Not to the contact a line names, not to a
 * page, not to the search index, not to anything an AI is sent: the only way
 * to one is to open the day it was written on, with the journal unlocked.
 */

type Row = { id: string; day: string; box: string | null; body: string | null; created_at: string };
type Kept = { text: string; feeling: Feeling; people: string[] };

function companyTimezone(db: Db, companyId: string): string {
  const row = db.prepare(`SELECT timezone FROM companies WHERE id = ?`).get(companyId) as { timezone: string } | undefined;
  if (!row) throw new Error("That workspace no longer exists.");
  return row.timezone;
}

/** One private line, kept. `sealed` says whether it could be locked - which it can only be once a passcode is set. */
export function jotPrivate(db: Db, companyId: string, raw: unknown, now: Date = new Date()): { sealed: boolean } {
  const parsed = privateInput.safeParse(raw);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Write something first.");
  const kept: Kept = { text: parsed.data.text, feeling: parsed.data.feeling, people: parsed.data.people };
  const { box, body } = keepPrivate(JSON.stringify(kept), db);
  db.prepare(`INSERT INTO journal_private (id, company_id, day, box, body, created_at) VALUES (?, ?, ?, ?, ?, ?)`).run(
    randomUUID(),
    companyId,
    todayIn(companyTimezone(db, companyId), now),
    box,
    body,
    now.toISOString(),
  );
  return { sealed: box !== null };
}

function lineFrom(row: Row, stored: string): PrivateLine | null {
  try {
    const kept = JSON.parse(stored) as Partial<Kept>;
    if (typeof kept.text !== "string") return null;
    return {
      id: row.id,
      at: row.created_at,
      text: kept.text,
      feeling: FEELINGS.includes(kept.feeling as Feeling) ? (kept.feeling as Feeling) : "other",
      people: Array.isArray(kept.people) ? kept.people.filter((each): each is string => typeof each === "string") : [],
    };
  } catch {
    return null;
  }
}

/**
 * A day's private lines: all of them when the journal is open, and only how
 * many there are when it is not.
 */
export function privateDay(db: Db, companyId: string, day: string): PrivateDay {
  const rows = db
    .prepare(`SELECT id, day, box, body, created_at FROM journal_private WHERE company_id = ? AND day = ? ORDER BY created_at`)
    .all(companyId, day) as Row[];
  const lock = lockState(db);
  const lines: PrivateLine[] = [];
  let locked = false;
  for (const row of rows) {
    const stored = row.box === null ? row.body : readPrivateBox(row.box);
    if (stored === null) locked = true;
    else {
      const line = lineFrom(row, stored);
      if (line) lines.push(line);
    }
  }
  return { day, count: rows.length, locked, passcode: lock.set, lines };
}

/** Gone for good, sealed or not: deleting takes no passcode, as deleting a day's entry does not. */
export function removePrivate(db: Db, id: string): void {
  db.prepare(`DELETE FROM journal_private WHERE id = ?`).run(id);
}
