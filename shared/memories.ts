import type { BrainSectionId } from "./brain";

/**
 * What the line has been told to remember, read back out of the brain.
 *
 * A memory is not a record of its own: it is a dated line at the foot of a
 * page - "- **PR: 45 kg x 3** · hit a pr on the bench _(2026-09-20)_" - which
 * is what lets a page be read, edited and linked like any other. So seeing
 * them all is a matter of reading those lines back, and a line somebody has
 * rewritten by hand into something else simply stops being one.
 */

export type Memory = {
  pageId: string;
  pageTitle: string;
  section: BrainSectionId;
  /** YYYY-MM-DD, as written on the line. */
  day: string;
  /** What leads the line, when something does: a lift's numbers, what a fact is about. */
  fact: string | null;
  says: string;
};

const LINE = /^\s*-\s+(?:\*\*(.+?)\*\*\s+·\s+)?(.+?)\s+_\((\d{4}-\d{2}-\d{2})\)_\s*$/;

export function memoriesOf(page: { id: string; title: string; section: BrainSectionId; body: string }): Memory[] {
  return page.body.split(/\r?\n/).flatMap((line) => {
    const found = LINE.exec(line);
    if (!found) return [];
    return [{ pageId: page.id, pageTitle: page.title, section: page.section, day: found[3] ?? "", fact: found[1] ?? null, says: found[2] ?? "" }];
  });
}

const PART_OF = /Part of \[\[[^|\]]*\|page:([^\]]+)\]\]/i;

/**
 * What each page hangs off, all the way up: "Red Rising" is under Me, Hobbies,
 * Reading, Red Rising series. Read from what the pages say they are part of,
 * so it is the owner's word and not a second record of it. A loop - two pages
 * each part of the other - stops where it comes round.
 */
/**
 * Everything that hangs under a page, however far down: the gym's lifts are
 * part of Chest and Back, which are part of the gym. Nearest first would be no
 * use to a list, so it is by title. A loop is walked once.
 */
export function underOf(pages: readonly { id: string; title: string; body: string }[], top: string): { id: string; title: string }[] {
  const parent = new Map(pages.map((page) => [page.id, PART_OF.exec(page.body)?.[1] ?? null]));
  const hangs = (id: string): boolean => {
    const seen = new Set([id]);
    let up = parent.get(id) ?? null;
    while (up && !seen.has(up)) {
      if (up === top) return true;
      seen.add(up);
      up = parent.get(up) ?? null;
    }
    return false;
  };
  return pages
    .filter((page) => page.id !== top && hangs(page.id))
    .map((page) => ({ id: page.id, title: page.title }))
    .sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }));
}

export function trailsOf(pages: readonly { id: string; title: string; body: string }[]): Record<string, string[]> {
  const byId = new Map(pages.map((page) => [page.id, page]));
  const trails: Record<string, string[]> = {};
  for (const page of pages) {
    const chain: string[] = [];
    const seen = new Set([page.id]);
    let up = byId.get(PART_OF.exec(page.body)?.[1] ?? "");
    while (up && !seen.has(up.id)) {
      chain.unshift(up.title);
      seen.add(up.id);
      up = byId.get(PART_OF.exec(up.body)?.[1] ?? "");
    }
    trails[page.id] = chain;
  }
  return trails;
}

type MemoryGroup = { pageId: string; pageTitle: string; section: BrainSectionId; latest: string; memories: Memory[] };

/**
 * By what they are about, the most recently added to first; within each,
 * newest first. Narrowed by a search over the words and the page's name.
 */
export function groupMemories(memories: readonly Memory[], search = ""): MemoryGroup[] {
  const wanted = search.trim().toLowerCase();
  const groups = new Map<string, MemoryGroup>();
  for (const memory of memories) {
    if (wanted && !`${memory.pageTitle} ${memory.fact ?? ""} ${memory.says}`.toLowerCase().includes(wanted)) continue;
    const group = groups.get(memory.pageId) ?? { pageId: memory.pageId, pageTitle: memory.pageTitle, section: memory.section, latest: "", memories: [] };
    group.memories.push(memory);
    if (memory.day > group.latest) group.latest = memory.day;
    groups.set(memory.pageId, group);
  }
  return [...groups.values()]
    .map((group) => ({ ...group, memories: [...group.memories].reverse().sort((a, b) => b.day.localeCompare(a.day)) }))
    .sort((a, b) => b.latest.localeCompare(a.latest) || a.pageTitle.localeCompare(b.pageTitle));
}
