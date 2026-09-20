import { randomUUID } from "node:crypto";
import type { Db } from "../db/connection";
import type { Learned } from "@shared/quickadd";
import { worthAsking, type AnswerInput, type Guess, type Settled, type TuneState } from "@shared/tune";
import { addAreaWord } from "./words";

/**
 * Tune: what the quick-add line guessed at, and what was said about it since.
 *
 * Plain rows, one per thing guessed (shared/tune.ts says what they mean). What
 * a settled guess does to the next line is decided in shared/quickadd.ts;
 * this only counts, remembers the answers, and hands them back.
 */

type Row = {
  id: string;
  kind: "slip" | "name";
  typed: string;
  meant: string;
  times: number;
  verdict: string | null;
};

const toGuess = (row: Row): Guess => ({
  id: row.id,
  kind: row.kind,
  typed: row.typed,
  meant: row.meant === "" ? null : row.meant,
  times: row.times,
});

function find(db: Db, kind: Row["kind"], typed: string, meant: string): Row | undefined {
  return db
    .prepare(`SELECT * FROM line_guesses WHERE kind = ? AND typed = ? COLLATE NOCASE AND meant = ? COLLATE NOCASE`)
    .get(kind, typed, meant) as Row | undefined;
}

/** Seen once more, or for the first time. An answer already given stays given. */
function bump(db: Db, kind: Row["kind"], typed: string, meant: string, verdict: string | null = null): void {
  const now = new Date().toISOString();
  const existing = find(db, kind, typed, meant);
  if (existing) {
    db.prepare(`UPDATE line_guesses SET times = times + 1, last_seen = ?, verdict = COALESCE(?, verdict) WHERE id = ?`).run(
      now,
      verdict,
      existing.id,
    );
    return;
  }
  db.prepare(
    `INSERT INTO line_guesses (id, kind, typed, meant, times, verdict, last_seen, created_at) VALUES (?, ?, ?, ?, 1, ?, ?, ?)`,
  ).run(randomUUID(), kind, typed, meant, verdict, now, now);
}

/**
 * What a line that was just added had in it.
 *
 * A name that is already one of Your words is not a guess any more, so it is
 * not counted: the question it would lead to has been answered elsewhere.
 */
export function recordSeen(db: Db, seen: { slips: { typed: string; as: string }[]; names: string[] }): void {
  db.transaction(() => {
    for (const slip of seen.slips) bump(db, "slip", slip.typed, slip.as);
    for (const name of seen.names) {
      const taught = db.prepare(`SELECT 1 FROM area_words WHERE word = ? COLLATE NOCASE`).get(name);
      if (!taught) bump(db, "name", name, "");
    }
  })();
}

/** "Keep “frida”", pressed under the line: an answer given before the question was asked. */
export function keepAsTyped(db: Db, slip: { typed: string; as: string }): Learned {
  bump(db, "slip", slip.typed, slip.as, "keep");
  return learnedFrom(db);
}

/** The most-seen first: what comes up most is what is most worth a moment. */
export function tuneState(db: Db): TuneState {
  const rows = db
    .prepare(`SELECT * FROM line_guesses ORDER BY times DESC, last_seen DESC`)
    .all() as Row[];
  return {
    asking: rows.filter((row) => row.verdict === null).map(toGuess).filter(worthAsking).slice(0, 40),
    settled: rows
      .filter((row) => row.kind === "slip" && (row.verdict === "same" || row.verdict === "keep"))
      .map((row): Settled => ({ ...toGuess(row), verdict: row.verdict as Settled["verdict"] }))
      .sort((a, b) => a.typed.localeCompare(b.typed)),
  };
}

/** What the line should read without comment, and what it should never touch. */
export function learnedFrom(db: Db): Learned {
  const rows = db
    .prepare(`SELECT * FROM line_guesses WHERE kind = 'slip' AND verdict IN ('same', 'keep')`)
    .all() as Row[];
  const same: Record<string, string> = {};
  for (const row of rows) if (row.verdict === "same") same[row.typed.toLowerCase()] = row.meant;
  return { same, keep: rows.filter((row) => row.verdict === "keep").map((row) => row.typed.toLowerCase()) };
}

/**
 * One answer. A name given an area becomes one of Your words - and if it
 * already was one, that is the same answer arriving twice, not an error.
 */
export function answerGuess(db: Db, answer: AnswerInput): TuneState {
  const row = db.prepare(`SELECT * FROM line_guesses WHERE id = ?`).get(answer.id) as Row | undefined;
  if (!row || row.kind !== answer.kind) throw new Error("That question is not there to answer any more.");

  db.transaction(() => {
    if (answer.kind === "slip") {
      db.prepare(`UPDATE line_guesses SET verdict = ? WHERE id = ?`).run(answer.verdict, row.id);
      return;
    }
    if (answer.area !== null) {
      const taught = db.prepare(`SELECT 1 FROM area_words WHERE word = ? COLLATE NOCASE`).get(row.typed);
      if (!taught) addAreaWord(db, { word: row.typed, area: answer.area });
    }
    db.prepare(`UPDATE line_guesses SET verdict = ? WHERE id = ?`).run(answer.area === null ? "none" : "taught", row.id);
  })();
  return tuneState(db);
}

/** Takes an answer back. The guess goes with it, so the line is free to make it - and ask - again. */
export function forgetGuess(db: Db, id: string): TuneState {
  db.prepare(`DELETE FROM line_guesses WHERE id = ?`).run(id);
  return tuneState(db);
}
