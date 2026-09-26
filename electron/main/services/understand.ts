import type { Db } from "../db/connection";
import { MODEL, fromBytes, nearest, type UnderstandState } from "@shared/understand";
import { getSetting, setSetting } from "../repositories/settings";
import {
  dequeue,
  hashesOf,
  keepVectors,
  queueEverything,
  queueSize,
  queued,
  sourceOf,
  vectorCount,
  vectorsIn,
  type VectorKind,
} from "../repositories/vectors";
import { isFault, logProblem } from "../log";

/**
 * Understanding, on this machine (PLAN.md, part five, phase 19): the queue
 * worked through, and what Settings says about it.
 *
 * On by default - decided 25 September 2026: it reads, it never sends, and it
 * only ever offers. The setting switches it off. The model is asked through
 * `Read` so the tests can stand in for it; in the app that is
 * understand/host.ts, which runs it in its own process.
 */

export type Read = (lines: readonly string[]) => Promise<Int8Array[]>;

export function understandingOn(db: Db): boolean {
  return getSetting(db, "understandOff") !== "on";
}

export function setUnderstanding(db: Db, on: unknown): void {
  setSetting(db, "understandOff", on === true ? "" : "on");
}

export function understandState(db: Db, here: boolean): UnderstandState {
  return { on: understandingOn(db), here, read: vectorCount(db, MODEL), waiting: queueSize(db) };
}

/** Everything queued again: *Read everything again* in Settings. */
export function readEverythingAgain(db: Db, now: Date = new Date()): void {
  queueEverything(db, now.toISOString());
}

/** How many rows a pass takes: one batch to the model, a few milliseconds. */
const PASS = 16;

/**
 * One pass over the queue: the oldest few rows, their text read by the model
 * where it changed since last time, what they no longer say taken away.
 * Returns how many rows were done. A row whose reading fails stays queued for
 * the next pass; the rest are kept.
 */
export async function readQueued(db: Db, read: Read, now: Date = new Date()): Promise<number> {
  const rows = queued(db, PASS);
  if (rows.length === 0) return 0;
  const work = rows.map((row) => {
    const source = sourceOf(db, row.kind, row.refId);
    const had = hashesOf(db, row.refId, MODEL);
    const changed = (source?.items ?? []).filter((item) => had.get(item.ref) !== item.hash);
    return { row, source, changed };
  });

  const lines = work.flatMap((each) => each.changed.map((item) => item.text));
  const vectors = lines.length > 0 ? await read(lines) : [];

  let at = 0;
  const stamp = now.toISOString();
  for (const each of work) {
    const done = each.changed.map((item) => ({ ...item, vector: vectors[at++] ?? new Int8Array() }));
    // Only what changed is written; what is unchanged is still said, so it stays.
    keepVectors(db, each.row.refId, each.source, MODEL, done, stamp);
    dequeue(db, each.row.kind, each.row.refId);
  }
  return rows.length;
}

/**
 * The things nearest in meaning to a line, in these workspaces, of these
 * kinds: what phase 20's line and phase 21's memories will ask.
 */
export async function nearestTo(
  db: Db,
  read: Read,
  companyIds: readonly string[],
  text: string,
  options: { kinds?: readonly VectorKind[]; most?: number; floor?: number } = {},
): Promise<{ kind: VectorKind; ref: string; sourceId: string; score: number }[]> {
  const [query] = await read([text]);
  if (!query) return [];
  const among = vectorsIn(db, companyIds, MODEL)
    .filter((row) => !options.kinds || options.kinds.includes(row.kind))
    .map((row) => ({ kind: row.kind, ref: row.ref, sourceId: row.sourceId, vector: fromBytes(row.vector) }));
  return nearest(fromBytes(query), among, options.most ?? 5, options.floor ?? 0).map(({ kind, ref, sourceId, score }) => ({
    kind,
    ref,
    sourceId,
    score,
  }));
}

/* ---- In the background ----------------------------------------------------- */

/** Quickly while there is a queue; slowly once there is not. */
const BUSY_MS = 1_500;
const IDLE_MS = 30_000;

let timer: NodeJS.Timeout | null = null;
let lastProblem: string | null = null;

/**
 * Works through the queue while understanding is on and the model is here.
 * A pass that fails is written down once and tried again later; nothing else
 * in Caulder waits on it.
 */
export function startUnderstanding(db: () => Db, read: Read, here: () => boolean): void {
  stopUnderstanding();
  const tick = async () => {
    let busy = false;
    try {
      const database = db();
      if (understandingOn(database) && here() && queueSize(database) > 0) {
        busy = (await readQueued(database, read)) > 0;
      }
      lastProblem = null;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message !== lastProblem && isFault(error)) logProblem("understanding", error);
      lastProblem = message;
    } finally {
      timer = setTimeout(() => void tick(), busy ? BUSY_MS : IDLE_MS);
    }
  };
  // Not at once: the window has just opened, and it comes first.
  timer = setTimeout(() => void tick(), 20_000);
}

export function stopUnderstanding(): void {
  if (timer) clearTimeout(timer);
  timer = null;
}
