import type { Db } from "../db/connection";
import { memoriesOf } from "@shared/memories";
import { linkLabelsOnly } from "@shared/links";
import { textHash } from "@shared/understand";
import type { BrainSectionId } from "@shared/brain";

/**
 * What the model on this machine has read, and what is waiting to be (PLAN.md,
 * part five). The tables are described in reference/data-model.md; the
 * arithmetic is shared/understand.ts; the model runs in its own process
 * (electron/main/understand/). This file only decides what text each thing is
 * read as, and keeps what came back.
 */

export type QueuedKind = "page" | "contact" | "task" | "note";
export type VectorKind = QueuedKind | "memory";

/** One thing to read: what it is, what it is kept by, and the words. */
type Readable = { kind: VectorKind; ref: string; text: string; hash: string };

/** A row's things to read, or null when the row is gone or must not be read. */
type Source = { companyId: string; items: Readable[] };

/** The most of a long page read for its own vector: its opening says what it is about. */
const PAGE_CHARS = 1200;

const readable = (kind: VectorKind, ref: string, text: string): Readable | null => {
  const words = text.replace(/\s+/g, " ").trim();
  return words ? { kind, ref, text: words, hash: textHash(words) } : null;
};

/** The oldest few waiting. */
export function queued(db: Db, most: number): { kind: QueuedKind; refId: string }[] {
  return db
    .prepare(`SELECT kind, ref_id AS refId FROM embed_queue ORDER BY queued_at LIMIT ?`)
    .all(most) as { kind: QueuedKind; refId: string }[];
}

export function queueSize(db: Db): number {
  return (db.prepare(`SELECT COUNT(*) AS n FROM embed_queue`).get() as { n: number }).n;
}

export function dequeue(db: Db, kind: QueuedKind, refId: string): void {
  db.prepare(`DELETE FROM embed_queue WHERE kind = ? AND ref_id = ?`).run(kind, refId);
}

/**
 * What a queued row is read as. A page is its title and opening words, and
 * each memory on it is read on its own, with the page's title for what it is
 * about. An archived page, or a row that is gone, gives null:
 * whatever was made of it before is then taken away.
 */
export function sourceOf(db: Db, kind: QueuedKind, id: string): Source | null {
  const items = (...found: (Readable | null)[]) => found.filter((each): each is Readable => each !== null);
  switch (kind) {
    case "page": {
      const page = db.prepare(`SELECT company_id, section, title, body, is_archived FROM brain_pages WHERE id = ?`).get(id) as
        | { company_id: string; section: BrainSectionId; title: string; body: string; is_archived: number }
        | undefined;
      if (!page || page.is_archived === 1) return null;
      const memories = memoriesOf({ id, title: page.title, section: page.section, body: page.body });
      const kept = new Set(memories.map((memory) => memory.raw));
      const rest = page.body
        .split(/\r?\n/)
        .filter((line) => !kept.has(line) && !/^\s*Part of \[\[/i.test(line))
        .join("\n");
      return {
        companyId: page.company_id,
        items: items(
          readable("page", id, `${page.title}. ${linkLabelsOnly(rest).slice(0, PAGE_CHARS)}`),
          ...memories.map((memory) =>
            readable("memory", `${id}#${textHash(memory.raw)}`, `${page.title}: ${memory.fact ? `${memory.fact}. ` : ""}${linkLabelsOnly(memory.says)}`),
          ),
        ),
      };
    }
    case "contact": {
      const lead = db.prepare(`SELECT company_id, name, contact_person, city, notes FROM leads WHERE id = ?`).get(id) as
        | { company_id: string; name: string; contact_person: string | null; city: string | null; notes: string | null }
        | undefined;
      if (!lead) return null;
      const said = [lead.name, lead.contact_person, lead.city, (lead.notes ?? "").slice(0, 600)].filter(Boolean).join(". ");
      return { companyId: lead.company_id, items: items(readable("contact", id, said)) };
    }
    case "task": {
      const task = db.prepare(`SELECT company_id, title, area, notes FROM tasks WHERE id = ?`).get(id) as
        | { company_id: string; title: string; area: string | null; notes: string | null }
        | undefined;
      if (!task) return null;
      return { companyId: task.company_id, items: items(readable("task", id, [task.title, task.notes].filter(Boolean).join(". "))) };
    }
    case "note": {
      const note = db.prepare(`SELECT company_id, body FROM notes WHERE id = ?`).get(id) as { company_id: string; body: string } | undefined;
      if (!note) return null;
      return { companyId: note.company_id, items: items(readable("note", id, note.body)) };
    }
  }
}

/** The hashes already read for a row, so only what changed goes to the model. */
export function hashesOf(db: Db, sourceId: string, model: string): Map<string, string> {
  const rows = db.prepare(`SELECT ref, text_hash FROM vectors WHERE source_id = ? AND model = ?`).all(sourceId, model) as {
    ref: string;
    text_hash: string;
  }[];
  return new Map(rows.map((row) => [row.ref, row.text_hash]));
}

/**
 * Keeps what was read for a row, in one go: new vectors written, and anything
 * the row no longer says - a memory taken off a page - taken away.
 */
export function keepVectors(
  db: Db,
  sourceId: string,
  source: Source | null,
  model: string,
  read: readonly (Readable & { vector: Int8Array })[],
  now: string,
): void {
  db.transaction(() => {
    const still = new Set((source?.items ?? []).map((item) => `${item.kind}:${item.ref}`));
    const had = db.prepare(`SELECT kind, ref FROM vectors WHERE source_id = ?`).all(sourceId) as { kind: string; ref: string }[];
    const drop = db.prepare(`DELETE FROM vectors WHERE kind = ? AND ref = ?`);
    for (const row of had) if (!still.has(`${row.kind}:${row.ref}`)) drop.run(row.kind, row.ref);
    if (!source) return;
    const put = db.prepare(
      `INSERT INTO vectors (kind, ref, source_id, company_id, model, text_hash, vec, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (kind, ref, model) DO UPDATE SET text_hash = excluded.text_hash, vec = excluded.vec, updated_at = excluded.updated_at`,
    );
    for (const item of read) {
      const bytes = Buffer.from(item.vector.buffer, item.vector.byteOffset, item.vector.byteLength);
      put.run(item.kind, item.ref, sourceId, source.companyId, model, item.hash, bytes, now);
    }
  })();
}

/** Every vector in these workspaces, by this model: what is compared against. */
export function vectorsIn(
  db: Db,
  companyIds: readonly string[],
  model: string,
): { kind: VectorKind; ref: string; sourceId: string; companyId: string; vector: Int8Array }[] {
  if (companyIds.length === 0) return [];
  const rows = db
    .prepare(
      `SELECT kind, ref, source_id, company_id, vec FROM vectors
        WHERE model = ? AND company_id IN (${companyIds.map(() => "?").join(", ")})`,
    )
    .all(model, ...companyIds) as { kind: VectorKind; ref: string; source_id: string; company_id: string; vec: Buffer }[];
  return rows.map((row) => ({
    kind: row.kind,
    ref: row.ref,
    sourceId: row.source_id,
    companyId: row.company_id,
    vector: new Int8Array(row.vec.buffer, row.vec.byteOffset, row.vec.byteLength),
  }));
}

/** How many things have been read by this model. */
export function vectorCount(db: Db, model: string): number {
  return (db.prepare(`SELECT COUNT(*) AS n FROM vectors WHERE model = ?`).get(model) as { n: number }).n;
}

/** Read everything again: every row queued, whatever it was read as before. */
export function queueEverything(db: Db, now: string): void {
  db.transaction(() => {
    const at = now;
    db.prepare(`INSERT OR REPLACE INTO embed_queue (kind, ref_id, queued_at) SELECT 'page', id, ? FROM brain_pages WHERE is_archived = 0`).run(at);
    db.prepare(`INSERT OR REPLACE INTO embed_queue (kind, ref_id, queued_at) SELECT 'contact', id, ? FROM leads`).run(at);
    db.prepare(`INSERT OR REPLACE INTO embed_queue (kind, ref_id, queued_at) SELECT 'task', id, ? FROM tasks`).run(at);
    db.prepare(`INSERT OR REPLACE INTO embed_queue (kind, ref_id, queued_at) SELECT 'note', id, ? FROM notes`).run(at);
  })();
}

/* ---- Said again (phase 21) ----------------------------------------------------- */

/** The vectors of the memories on one page, by ref. */
export function memoryVectorsOn(db: Db, pageId: string, model: string): Map<string, Int8Array> {
  const rows = db.prepare(`SELECT ref, vec FROM vectors WHERE source_id = ? AND kind = 'memory' AND model = ?`).all(pageId, model) as {
    ref: string;
    vec: Buffer;
  }[];
  return new Map(rows.map((row) => [row.ref, new Int8Array(row.vec.buffer, row.vec.byteOffset, row.vec.byteLength)]));
}

/** An older line marked said again. Once marked - even if the mark is later taken back - the same line is not marked again. */
export function markSaidAgain(db: Db, pageId: string, lineHash: string, newerHash: string, score: number, now: string): void {
  db.prepare(
    `INSERT OR IGNORE INTO said_again (page_id, line_hash, newer_hash, score, marked_at) VALUES (?, ?, ?, ?, ?)`,
  ).run(pageId, lineHash, newerHash, score, now);
}

/** The lines marked said again and not taken back, in a workspace, as "pageId#hash". */
export function saidAgainIn(db: Db, companyId: string): Set<string> {
  const rows = db
    .prepare(
      `SELECT s.page_id, s.line_hash FROM said_again s JOIN brain_pages p ON p.id = s.page_id
        WHERE p.company_id = ? AND s.undone = 0`,
    )
    .all(companyId) as { page_id: string; line_hash: string }[];
  return new Set(rows.map((row) => `${row.page_id}#${row.line_hash}`));
}

/** *Not the same*: the mark taken back. */
export function notTheSame(db: Db, pageId: string, lineHash: string): void {
  db.prepare(`UPDATE said_again SET undone = 1 WHERE page_id = ? AND line_hash = ?`).run(pageId, lineHash);
}
