import type { BrainSectionId } from "./brain";
import { monthDayOf } from "./lifefacts";
import { daysBetween } from "./dates";

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

/* ---- Coming round ---------------------------------------------------------- */

type Coming = { pageId: string; pageTitle: string; what: string; day: string; inDays: number };

/** The next time a day of the year comes round, from today: this year's, or next year's once it has gone. */
function nextOf(date: { month: number; day: number }, today: string): string {
  const year = Number(today.slice(0, 4));
  const on = (y: number) => {
    // The 29th of February comes round on the 28th in a year without one.
    const last = new Date(Date.UTC(y, date.month, 0)).getUTCDate();
    return `${y}-${String(date.month).padStart(2, "0")}-${String(Math.min(date.day, last)).padStart(2, "0")}`;
  };
  return on(year) >= today ? on(year) : on(year + 1);
}

/** Birthdays and anniversaries coming round in the next `within` days, soonest first. */
export function comingUp(memories: readonly Memory[], today: string, within = 30): Coming[] {
  return memories
    .filter((memory) => memory.current && memory.key && /^(?:birthday|anniversary|wedding anniversary)$/.test(memory.key))
    .flatMap((memory) => {
      const date = monthDayOf(valueOf(memory) ?? "");
      if (!date) return [];
      const day = nextOf(date, today);
      const inDays = daysBetween(today, day);
      if (inDays > within) return [];
      const what = memory.key === "birthday" ? "Birthday" : "Anniversary";
      return [{ pageId: memory.pageId, pageTitle: memory.pageTitle, what, day, inDays }];
    })
    .sort((a, b) => a.inDays - b.inDays || a.pageTitle.localeCompare(b.pageTitle));
}

/** "Mummy's birthday is today", "Priya's birthday is in 3 days", "Your anniversary is tomorrow". */
export function sayComing(coming: Coming): string {
  const whose = coming.pageTitle === "About me" ? "Your" : `${coming.pageTitle}'s`;
  const when = coming.inDays === 0 ? "today" : coming.inDays === 1 ? "tomorrow" : `in ${coming.inDays} days`;
  return `${whose} ${coming.what.toLowerCase()} is ${when}`;
}

/* ---- Brought back ---------------------------------------------------------- */

/** Kept on this day in an earlier year - or, failing that, an earlier month. */
export function onThisDay(memories: readonly Memory[], today: string): Memory[] {
  const monthDay = today.slice(5);
  const years = memories.filter((memory) => memory.day < today && memory.day.slice(5) === monthDay);
  if (years.length > 0) return years;
  return memories.filter((memory) => memory.day < today.slice(0, 7) && memory.day.slice(8) === today.slice(8));
}

/**
 * One memory to bring back today, the same one all day: a birthday coming
 * round first, then one kept on this day before, then one from a while ago
 * that has not been looked at since. Null for a brain with nothing old enough.
 */
export function resurface(memories: readonly Memory[], today: string): { memory: Memory | null; coming: Coming | null } {
  const coming = comingUp(memories, today, 7)[0] ?? null;
  if (coming) return { memory: null, coming };
  const current = memories.filter((memory) => memory.current);
  const again = onThisDay(current, today);
  const pool = again.length > 0 ? again : current.filter((memory) => daysBetween(memory.day, today) >= 14);
  if (pool.length === 0) return { memory: null, coming: null };
  // The day picks it, so it stays the same until tomorrow.
  const seed = [...today].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) % 100003, 7);
  return { memory: pool[seed % pool.length] ?? null, coming: null };
}

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
