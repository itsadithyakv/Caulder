import type { Db } from "../db/connection";
import { z } from "zod";
import { MODEL, belongsOn, fromBytes, nearest, saidAgain, similarity, textHash, type LooseEnds, type Related, type UnderstandState } from "@shared/understand";
import { TRIVIA_PAGE } from "@shared/facts";
import { ROOT } from "@shared/branches";
import { homeCompanyId, isHomeWorkspace } from "../repositories/companies";
import { memoriesOf, type Memory } from "@shared/memories";
import { allMemories } from "./memories";
import type { BrainSectionId } from "@shared/brain";
import { SEEDS } from "@shared/understand-seeds";
import { OPINION, type Example } from "@shared/opinion";
import type { LessonKind } from "@shared/lessons";
import { getSetting, setSetting } from "../repositories/settings";
import {
  dequeue,
  hashesOf,
  keepVectors,
  markSaidAgain,
  memoryVectorsOn,
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
    const newMemories = new Set(done.filter((item) => item.kind === "memory").map((item) => item.ref));
    if (each.row.kind === "page" && newMemories.size > 0) markRepeats(db, each.row.refId, newMemories, stamp);
    dequeue(db, each.row.kind, each.row.refId);
  }
  return rows.length;
}

/**
 * Phase 21: a memory just read that says again, in other words, what an older
 * one on the same page said marks the older one earlier. Only very alike, with
 * the same numbers (saidAgain, shared/understand.ts): it acts without asking.
 */
function markRepeats(db: Db, pageId: string, newer: ReadonlySet<string>, now: string): void {
  const page = db.prepare(`SELECT title, section, body FROM brain_pages WHERE id = ?`).get(pageId) as
    | { title: string; section: BrainSectionId; body: string }
    | undefined;
  if (!page) return;
  const memories = memoriesOf({ id: pageId, ...page });
  const vectors = memoryVectorsOn(db, pageId, MODEL);
  const refOf = (memory: Memory) => `${pageId}#${textHash(memory.raw)}`;
  const words = (memory: Memory) => `${memory.fact ?? ""} ${memory.says}`;
  memories.forEach((late, at) => {
    const lateVector = vectors.get(refOf(late));
    if (!newer.has(refOf(late)) || !lateVector) return;
    memories.forEach((early, before) => {
      // Older: an earlier day, or the same day and higher up the page.
      if (before === at || !(early.day < late.day || (early.day === late.day && before < at))) return;
      const earlyVector = vectors.get(refOf(early));
      if (!earlyVector) return;
      const score = similarity(fromBytes(earlyVector), fromBytes(lateVector));
      if (saidAgain(words(early), words(late), score)) markSaidAgain(db, pageId, textHash(early.raw), textHash(late.raw), score, now);
    });
  });
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

/* ---- The line's second opinion (phase 20) ---------------------------------- */

/** The seeds, read once a run: they never change while Caulder is open. */
let seedVectors: Promise<{ kind: LessonKind; vector: Float32Array }[]> | null = null;

function seedsRead(read: Read): Promise<{ kind: LessonKind; vector: Float32Array }[]> {
  seedVectors ??= (async () => {
    const lines = (Object.entries(SEEDS) as [LessonKind, readonly string[]][]).flatMap(([kind, said]) => said.map((line) => ({ kind, line })));
    const vectors = await read(lines.map((each) => each.line));
    return lines.map((each, at) => ({ kind: each.kind, vector: fromBytes(vectors[at] ?? new Int8Array()) }));
  })().catch((error: unknown) => {
    seedVectors = null;
    throw error;
  });
  return seedVectors;
}

/** Only for the tests, which read with a stand-in. */
export function forgetSeeds(): void {
  seedVectors = null;
}

/** Pages a memory can be kept on: yours, not the company's. */
const MEMORY_HOMES = new Set(["hobbies", "studies", "ideas", "goals", "remembered"]);

/**
 * What the line's neighbours in meaning were filed as, for shared/opinion.ts
 * to weigh: the seeds, and the person's own tasks, memories, notes, ideas and
 * pages in these workspaces. A contact votes for nothing - who a line is
 * about is found by name - and neither does a company's page, which is never
 * where a memory goes.
 */
export async function examplesFor(db: Db, read: Read, companyIds: readonly string[], text: string): Promise<Example[]> {
  const [query] = await read([text]);
  if (!query) return [];
  const line = fromBytes(query);
  const seeds = (await seedsRead(read)).map((seed): Example => ({ kind: seed.kind, score: similarity(line, seed.vector), own: false }));

  const own = vectorsIn(db, companyIds, MODEL)
    .filter((row) => row.kind !== "contact")
    .map((row) => ({ row, score: similarity(line, fromBytes(row.vector)) }))
    .filter((each) => each.score >= OPINION.floor)
    .sort((a, b) => b.score - a.score)
    .slice(0, OPINION.most * 2);

  const pageOf = db.prepare(`SELECT id, title, section, template FROM brain_pages WHERE id = ?`);
  const areaOf = db.prepare(`SELECT area FROM tasks WHERE id = ?`);
  const examples: Example[] = [];
  for (const { row, score } of own) {
    if (row.kind === "task") {
      const task = areaOf.get(row.sourceId) as { area: string | null } | undefined;
      examples.push({ kind: "task", score, own: true, area: task?.area ?? null });
      continue;
    }
    if (row.kind === "note") {
      examples.push({ kind: "note", score, own: true });
      continue;
    }
    const page = pageOf.get(row.sourceId) as { id: string; title: string; section: string; template: string } | undefined;
    if (!page) continue;
    if (row.kind === "page" && page.template === "idea") examples.push({ kind: "idea", score, own: true });
    else if (MEMORY_HOMES.has(page.section)) {
      examples.push({ kind: row.kind === "memory" ? "memory" : null, score, own: true, page: { id: page.id, title: page.title } });
    }
  }
  return [...examples, ...seeds];
}

/**
 * The memories nearest in meaning to what was asked (phase 21), for recall on
 * the line to fuse with what the words found: "which beans do i like" finds
 * "ethiopian coffee is fruity", which shares no word with it.
 */
export async function memoriesByMeaning(db: Db, read: Read, about: string): Promise<Memory[]> {
  const { companyId, memories } = allMemories(db);
  if (!companyId) return [];
  const byRef = new Map(memories.map((memory) => [`${memory.pageId}#${textHash(memory.raw)}`, memory]));
  const near = await nearestTo(db, read, [companyId], about, { kinds: ["memory"], most: 8, floor: 0.35 });
  return near.map((hit) => byRef.get(hit.ref)).filter((memory): memory is Memory => memory !== undefined);
}

/**
 * What is near a page in meaning and not linked to it (phase 21): pages -
 * a memory counting for the page it is on - and contacts, most alike first.
 * Read from what is already kept; nothing is asked of the model. A company's
 * page looks only in its company, the way it links (repositories/links.ts);
 * a page of yours looks everywhere.
 */
export function relatedTo(db: Db, pageId: string, most = 5, floor = 0.4): Related[] {
  const page = db.prepare(`SELECT company_id FROM brain_pages WHERE id = ?`).get(pageId) as { company_id: string } | undefined;
  if (!page) return [];
  const reach = isHomeWorkspace(db, page.company_id)
    ? (db.prepare(`SELECT id FROM companies WHERE is_archived = 0`).all() as { id: string }[]).map((row) => row.id)
    : [page.company_id];
  const all = vectorsIn(db, reach, MODEL);
  const own = all.find((row) => row.kind === "page" && row.ref === pageId);
  if (!own) return [];
  const mine = fromBytes(own.vector);
  const linked = new Set(
    (db.prepare(`SELECT to_id AS id FROM brain_links WHERE from_page = ? UNION SELECT from_page AS id FROM brain_links WHERE to_id = ?`).all(pageId, pageId) as { id: string }[]).map((row) => row.id),
  );
  const best = new Map<string, { kind: "page" | "contact"; score: number; ref: string; rowKind: VectorKind }>();
  for (const row of all) {
    if (row.sourceId === pageId || linked.has(row.sourceId)) continue;
    if (row.kind !== "page" && row.kind !== "memory" && row.kind !== "contact") continue;
    const score = similarity(mine, fromBytes(row.vector));
    if (score < floor) continue;
    const had = best.get(row.sourceId);
    if (!had || had.score < score) best.set(row.sourceId, { kind: row.kind === "contact" ? "contact" : "page", score, ref: row.ref, rowKind: row.kind });
  }
  const titleOf = db.prepare(`SELECT title, body FROM brain_pages WHERE id = ? AND is_archived = 0 AND section <> 'journal'`);
  const nameOf = db.prepare(`SELECT name FROM leads WHERE id = ?`);
  return [...best.entries()]
    .sort((a, b) => b[1].score - a[1].score)
    .flatMap(([id, hit]): Related[] => {
      if (hit.kind === "contact") {
        const lead = nameOf.get(id) as { name: string } | undefined;
        return lead ? [{ kind: "contact", id, title: lead.name, why: null }] : [];
      }
      const found = titleOf.get(id) as { title: string; body: string } | undefined;
      if (!found) return [];
      const memory = hit.rowKind === "memory" ? memoriesOf({ id, title: found.title, section: "ideas", body: found.body }).find((each) => `${id}#${textHash(each.raw)}` === hit.ref) : undefined;
      return [{ kind: "page", id, title: found.title, why: memory ? (memory.fact ?? memory.says) : null }];
    })
    .slice(0, most);
}

/** The pages loose memories pile up on when the line knows nowhere better. */
const CATCH_ALL = [TRIVIA_PAGE, ROOT.title];

function leftAlone(db: Db): Set<string> {
  try {
    const parsed: unknown = JSON.parse(getSetting(db, "looseLeft") ?? "[]");
    return new Set(Array.isArray(parsed) ? parsed.filter((each): each is string => typeof each === "string") : []);
  } catch {
    return new Set();
  }
}

/**
 * Loose ends (phase 21): memories on the catch-all pages that sound like one
 * of the person's own pages, grouped by it, to be offered as a move. Each line
 * is read without the page it is on, against the titles of the pages it could
 * go to, and goes only where belongsOn (shared/understand.ts) is sure.
 */
export async function looseEnds(db: Db, read: Read): Promise<LooseEnds> {
  const companyId = homeCompanyId(db);
  if (!companyId) return [];
  const pages = db
    .prepare(`SELECT id, title, section, body FROM brain_pages WHERE company_id = ? AND is_archived = 0 AND section <> 'journal'`)
    .all(companyId) as { id: string; title: string; section: BrainSectionId; body: string }[];
  const catchAll = pages.filter((page) => CATCH_ALL.includes(page.title));
  const homes = pages.filter((page) => !CATCH_ALL.includes(page.title) && MEMORY_HOMES.has(page.section));
  const left = leftAlone(db);
  const loose = catchAll.flatMap((page) =>
    memoriesOf(page)
      .filter((memory) => !left.has(`${page.id}#${textHash(memory.raw)}`))
      .map((memory) => ({ page, memory })),
  );
  if (loose.length === 0 || homes.length === 0) return [];

  const vectors = (await read([...loose.map(({ memory }) => `${memory.fact ? `${memory.fact}. ` : ""}${memory.says}`), ...homes.map((page) => page.title)])).map(fromBytes);
  const titles = vectors.slice(loose.length);
  const found = new Map<string, LooseEnds[number]>();
  loose.forEach(({ page, memory }, at) => {
    const line = vectors[at];
    if (!line) return;
    const home = belongsOn(homes.map((each, k) => ({ page: each, score: similarity(line, titles[k] ?? new Float32Array()) })));
    if (!home) return;
    const group = found.get(home.page.id) ?? { to: { pageId: home.page.id, title: home.page.title }, lines: [] };
    group.lines.push({ pageId: page.id, pageTitle: page.title, raw: memory.raw, says: memory.fact ? `${memory.fact} · ${memory.says}` : memory.says });
    found.set(home.page.id, group);
  });
  return [...found.values()].sort((a, b) => b.lines.length - a.lines.length);
}

/** *Not these*: loose memories never offered again. */
export function leaveLoose(db: Db, raw: unknown): void {
  const lines = z.array(z.object({ pageId: z.string().min(1), raw: z.string().min(1).max(4000) })).max(200).parse(raw);
  const left = leftAlone(db);
  for (const line of lines) left.add(`${line.pageId}#${textHash(line.raw)}`);
  setSetting(db, "looseLeft", JSON.stringify([...left]));
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
