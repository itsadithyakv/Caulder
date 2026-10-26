import type { BrainSectionId } from "./brain";

/**
 * What the line has been told to remember, read back out of the brain.
 *
 * A memory is not a record of its own: it is a dated line at the foot of a
 * page - "- **PR: 45 kg x 3** · hit a pr on the bench _(2026-09-20)_" - which
 * is what lets a page be read, edited and linked like any other. So seeing
 * them all is a matter of reading those lines back, and a line somebody has
 * rewritten by hand into something else simply stops being one.
 *
 * What leads a line is what it is about - "Blood group: O+", "Parked: level 3"
 * - and a later line about the same thing on the same page is the newer answer:
 * the older one is kept, as what it was before, but it is not what is true now.
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
  /** The line exactly as it is on the page, so it can be edited or forgotten there. */
  raw: string;
  /** What it is the answer to - "Blood group", "Parked", "Drill" - from what leads it. */
  key: string | null;
  /** False when a later memory on the same page answers the same thing. */
  current: boolean;
  /**
   * "model" when it was the model on this machine that found a later line
   * saying it again in other words (phase 21), which *Not the same* can take
   * back. Absent when it is earlier by its key, or current.
   */
  earlierBy?: "model";
};

const LINE = /^\s*-\s+(?:\*\*(.+?)\*\*\s+·\s+)?(.+?)\s+_\((\d{4}-\d{2}-\d{2})\)_\s*$/;

/** "Blood group: O+" is about the blood group; "PR: 45 kg" about the PR; a lead with no colon is its own key. */
function keyOf(fact: string | null): string | null {
  if (!fact) return null;
  const colon = fact.indexOf(":");
  return (colon > 0 ? fact.slice(0, colon) : fact).trim().toLowerCase().replace(/^(?:my|the)\s+/, "") || null;
}

export function memoriesOf(page: { id: string; title: string; section: BrainSectionId; body: string }): Memory[] {
  const found = page.body.split(/\r?\n/).flatMap((line) => {
    const matched = LINE.exec(line);
    if (!matched) return [];
    const fact = matched[1] ?? null;
    return [
      {
        pageId: page.id,
        pageTitle: page.title,
        section: page.section,
        day: matched[3] ?? "",
        fact,
        says: matched[2] ?? "",
        raw: line,
        key: keyOf(fact),
        current: true,
      },
    ];
  });
  // The newest about each thing is what is true now; lines are written in order, so a later one of the same day is newer too.
  const latest = new Map<string, number>();
  found.forEach((memory, index) => {
    if (!memory.key) return;
    const before = latest.get(memory.key);
    if (before === undefined || (found[before]?.day ?? "") <= memory.day) latest.set(memory.key, index);
  });
  return found.map((memory, index) => (memory.key && latest.get(memory.key) !== index ? { ...memory, current: false } : memory));
}

/** The value a fact says: "Birthday: 15 March" says "15 March". */
export function valueOf(memory: Pick<Memory, "fact">): string | null {
  const colon = memory.fact?.indexOf(":") ?? -1;
  return memory.fact && colon > 0 ? memory.fact.slice(colon + 1).trim() : null;
}

/* ---- Kept ----------------------------------------------------------------- */

/** What the window hands main to keep: the line, and the page it is about or the one to start for it. */
export type RememberInput = {
  companyId: string;
  pageId: string | null;
  topic: string | null;
  said: string;
  /** What leads the line - "GST number: 29ABCDE1234F1Z5" - so the newest about a thing is the current answer. */
  fact: string | null;
  day: string;
};

const plainWords = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/**
 * Whether a memory's lead says only what its words say again: "Payment
 * terms: half up front" before "our payment terms are half up front". Then
 * the words are shown, once, and not the lead and the words both.
 */
export function leadRepeats(memory: Pick<Memory, "fact" | "says">): boolean {
  if (!memory.fact) return false;
  const value = memory.fact.includes(":") ? memory.fact.slice(memory.fact.indexOf(":") + 1) : memory.fact;
  const said = plainWords(value);
  return said.length > 0 && plainWords(memory.says).includes(said);
}

/** What was kept, and the page that had to be started to keep it there. */
export type Remembered = {
  pageId: string;
  title: string;
  started: string[];
  /**
   * A rule already on that page that this one may be meant instead of
   * (shared/rules.ts): offered once it is kept, and let go only on a yes.
   */
  like?: { raw: string; says: string } | null;
};

/* ---- Found by what it says -------------------------------------------------- */

/** Every word of the search in the memory, its page's name or what leads it - in any order. */
export function matches(memory: Memory, search: string): boolean {
  const words = search.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const said = `${memory.pageTitle} ${memory.fact ?? ""} ${memory.says}`.toLowerCase();
  return words.every((word) => said.includes(word));
}

/**
 * The words of a question that carry its meaning, cut to a stem - "parked" is
 * found by "park", "keys" by "key" - for looking through what is kept. The
 * question's own words (what, did, have...) are left out.
 */
export function askedStems(about: string): string[] {
  return about
    .toLowerCase()
    .replace(/['’]s\b/g, "")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length >= 3 && !/^(?:the|and|what|where|when|who|did|does|have|has|that|this|with|from|about|your|mine)$/.test(word))
    .map((word) => word.replace(/(?:ing|ed|es|s)$/, ""));
}

/**
 * The memories that answer a question - "where did i park", "mummy's birthday",
 * "what does arjun like" - the current ones first, by how many of its words
 * each has, then the newest.
 */
export function recall(memories: readonly Memory[], about: string): Memory[] {
  const words = askedStems(about);
  if (words.length === 0) return [];
  const scored = memories
    .map((memory) => {
      const said = `${memory.pageTitle} ${memory.fact ?? ""} ${memory.says}`.toLowerCase();
      const hits = words.filter((word) => said.includes(word)).length;
      return { memory, hits };
    })
    .filter(({ hits }) => hits > 0);
  const best = Math.max(0, ...scored.map(({ hits }) => hits));
  return scored
    .filter(({ hits }) => hits === best)
    .sort((a, b) => Number(b.memory.current) - Number(a.memory.current) || b.memory.day.localeCompare(a.memory.day))
    .map(({ memory }) => memory);
}

/* ---- Where they hang -------------------------------------------------------- */

const PART_OF = /Part of \[\[[^|\]]*\|page:([^\]]+)\]\]/i;

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

/**
 * What each page hangs off, all the way up: "Red Rising" is under Me, Hobbies,
 * Reading, Red Rising series. Read from what the pages say they are part of,
 * so it is the owner's word and not a second record of it. A loop - two pages
 * each part of the other - stops where it comes round.
 */
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
  const groups = new Map<string, MemoryGroup>();
  for (const memory of memories) {
    if (!matches(memory, search)) continue;
    const group = groups.get(memory.pageId) ?? { pageId: memory.pageId, pageTitle: memory.pageTitle, section: memory.section, latest: "", memories: [] };
    group.memories.push(memory);
    if (memory.day > group.latest) group.latest = memory.day;
    groups.set(memory.pageId, group);
  }
  return [...groups.values()]
    .map((group) => ({ ...group, memories: [...group.memories].reverse().sort((a, b) => b.day.localeCompare(a.day)) }))
    .sort((a, b) => b.latest.localeCompare(a.latest) || a.pageTitle.localeCompare(b.pageTitle));
}

/**
 * What words found and what meaning found, as one answer (PLAN.md, part five,
 * phase 21): each list gives a memory 1/(60 + its place), so one high on
 * either rises and one on both rises most - with no weighing of a word count
 * against a closeness, which cannot be compared. What is true now still comes
 * before what was true once.
 */
export function fuseRecall(byWords: readonly Memory[], byMeaning: readonly Memory[]): Memory[] {
  const keyOf = (memory: Memory) => `${memory.pageId}\n${memory.raw}`;
  const scored = new Map<string, { memory: Memory; score: number }>();
  for (const list of [byWords, byMeaning]) {
    list.forEach((memory, at) => {
      const had = scored.get(keyOf(memory));
      scored.set(keyOf(memory), { memory, score: (had?.score ?? 0) + 1 / (60 + at) });
    });
  }
  return [...scored.values()]
    .sort((a, b) => Number(b.memory.current) - Number(a.memory.current) || b.score - a.score)
    .map(({ memory }) => memory);
}
