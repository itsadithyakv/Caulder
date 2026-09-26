import { z } from "zod";
import type { Db } from "../db/connection";
import type { BrainPage, BrainSectionId } from "@shared/brain";
import { memoriesOf, trailsOf, type Memory } from "@shared/memories";
import { homeCompanyId } from "../repositories/companies";
import { notTheSame, saidAgainIn } from "../repositories/vectors";
import { textHash } from "@shared/understand";
import { getPage, savePage } from "./brain";

/**
 * Everything the line has been told to remember, and whose brain it is in.
 *
 * Memories are yours rather than a company's - the line keeps them in your own
 * workspace whichever company is open - so they are read from there, and the
 * window is told which workspace that is so it can open the page in it.
 *
 * The journal is never read for them. Its pages can be sealed, a sealed body
 * is not text, and what is written there is not the line's to list anyway.
 */
export function allMemories(db: Db): { companyId: string | null; memories: Memory[]; trails: Record<string, string[]> } {
  const companyId = homeCompanyId(db);
  if (!companyId) return { companyId: null, memories: [], trails: {} };
  const pages = db
    .prepare(
      `SELECT id, title, section, body FROM brain_pages
        WHERE company_id = ? AND is_archived = 0 AND section <> 'journal' AND body LIKE '%\\_(____-__-__)\\_%' ESCAPE '\\'
        ORDER BY updated_at DESC`,
    )
    .all(companyId) as { id: string; title: string; section: BrainSectionId; body: string }[];
  // Where each of those pages hangs, which needs every page above them - not only the ones with memories on.
  const every = db
    .prepare(`SELECT id, title, body FROM brain_pages WHERE company_id = ? AND is_archived = 0 AND section <> 'journal'`)
    .all(companyId) as { id: string; title: string; body: string }[];
  const trails = trailsOf(every);
  // A line the model found said again is earlier too (phase 21), unless taken back.
  const said = saidAgainIn(db, companyId);
  const memories = pages.flatMap(memoriesOf).map((memory) =>
    memory.current && said.has(`${memory.pageId}#${textHash(memory.raw)}`) ? { ...memory, current: false, earlierBy: "model" as const } : memory,
  );
  return { companyId, memories, trails: Object.fromEntries(pages.map((page) => [page.id, trails[page.id] ?? []])) };
}

/** One memory's line, found on its page exactly as it was read, or refused: a page edited since is read again. */
function lineOn(db: Db, pageId: string, raw: string): { page: BrainPage; at: number; lines: string[] } {
  const companyId = homeCompanyId(db);
  const page = getPage(db, pageId);
  if (page.companyId !== companyId || page.section === "journal") throw new Error("That is not one of your memories.");
  const lines = page.body.split(/\r?\n/);
  const at = lines.findIndex((line) => line === raw);
  if (at === -1) throw new Error("That memory has changed on its page since. Open the page to see it as it is now.");
  return { page, at, lines };
}

const memoryEdit = z.object({
  pageId: z.string().min(1),
  raw: z.string().min(1).max(4000),
  /** What leads it - "Blood group: O+" - or null for none. */
  fact: z.string().trim().max(200).nullable(),
  says: z.string().trim().min(1, "Say what to remember.").max(2000),
});

/**
 * A memory said differently: the same day, on the same page, in the same place
 * on it. Through savePage, so the page's history has what it said before.
 */
export function editMemory(db: Db, raw: unknown, now: Date): Memory[] {
  const input = memoryEdit.parse(raw);
  const { page, at, lines } = lineOn(db, input.pageId, input.raw);
  const day = /_\((\d{4}-\d{2}-\d{2})\)_\s*$/.exec(input.raw)?.[1] ?? now.toISOString().slice(0, 10);
  // One line, whatever was typed: a memory is a line.
  const one = (text: string) => text.replace(/\s*\r?\n\s*/g, " ");
  lines[at] = `- ${input.fact ? `**${one(input.fact)}** · ` : ""}${one(input.says)} _(${day})_`;
  const saved = savePage(db, page.id, { title: page.title, body: lines.join("\n"), fields: page.fields, secrets: {}, baseRevision: page.revision }, now);
  return memoriesOf(saved);
}

/** A memory let go: its line taken off its page. The page stays, and its history has the line. */
export function forgetMemory(db: Db, raw: unknown, now: Date): Memory[] {
  const input = z.object({ pageId: z.string().min(1), raw: z.string().min(1).max(4000) }).parse(raw);
  const { page, at, lines } = lineOn(db, input.pageId, input.raw);
  lines.splice(at, 1);
  const saved = savePage(
    db,
    page.id,
    { title: page.title, body: lines.join("\n").replace(/\n{3,}/g, "\n\n"), fields: page.fields, secrets: {}, baseRevision: page.revision },
    now,
  );
  return memoriesOf(saved);
}

/** *Not the same*: a memory the model marked said again is current again, and is not marked again. */
export function takeBackSaidAgain(db: Db, raw: unknown): void {
  const input = z.object({ pageId: z.string().min(1), raw: z.string().min(1).max(4000) }).parse(raw);
  notTheSame(db, input.pageId, textHash(input.raw));
}

const moveInput = z.object({
  to: z.string().min(1),
  lines: z.array(z.object({ pageId: z.string().min(1), raw: z.string().min(1).max(4000) })).min(1).max(200),
});

/**
 * Loose memories moved to the page they belong on (phase 21), asked for on the
 * Memories screen: each line exactly as it was - its lead, its words, its day -
 * taken off its page and put at the foot of the other, in one go. Each page is
 * saved once, so its history keeps what it was.
 */
export function moveMemories(db: Db, raw: unknown, now: Date): void {
  const input = moveInput.parse(raw);
  const companyId = homeCompanyId(db);
  db.transaction(() => {
    const target = getPage(db, input.to);
    if (target.companyId !== companyId || target.section === "journal") throw new Error("That page is not one of yours.");
    const moving: string[] = [];
    const bySource = new Map<string, string[]>();
    for (const line of input.lines) {
      if (line.pageId === target.id) continue;
      lineOn(db, line.pageId, line.raw);
      bySource.set(line.pageId, [...(bySource.get(line.pageId) ?? []), line.raw]);
      moving.push(line.raw.trim());
    }
    for (const [pageId, raws] of bySource) {
      const page = getPage(db, pageId);
      const left = page.body.split(/\r?\n/).filter((line) => !raws.includes(line)).join("\n").replace(/\n{3,}/g, "\n\n");
      savePage(db, page.id, { title: page.title, body: left, fields: page.fields, secrets: {}, baseRevision: page.revision }, now);
    }
    if (moving.length === 0) return;
    const written = target.body.trimEnd();
    const gap = written === "" ? "" : /(^|\n)\s*- [^\n]*$/.test(written) ? "\n" : "\n\n";
    savePage(
      db,
      target.id,
      { title: target.title, body: `${written}${gap}${moving.join("\n")}\n`, fields: target.fields, secrets: {}, baseRevision: target.revision },
      now,
    );
  })();
}
