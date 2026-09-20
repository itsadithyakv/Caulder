import { linkLabelsOnly } from "./links";

/**
 * A journal entry's three parts, for writing it one part at a time.
 *
 * An entry is one text underneath - `## Today`, `## Grateful for`,
 * `## Tomorrow` - and stays one text: search, links, the lock and the history
 * all read it whole. Guided writing reads each part out of it and puts each
 * back in its place, so switching between Guided and Free never loses a word,
 * and anything else written on the day - another heading, a line above the
 * first - is left exactly where it was.
 */

export const ENTRY_PARTS = ["today", "grateful", "tomorrow"] as const;
export type EntryPart = (typeof ENTRY_PARTS)[number];

/** The heading each part is written under. */
export const PART_HEADING: Record<EntryPart, string> = {
  today: "Today",
  grateful: "Grateful for",
  tomorrow: "Tomorrow",
};

type Piece = { heading: string | null; level: number; text: string };

const HEADING = /^(#{1,6})\s+(.+?)\s*#*\s*$/;

function partOf(heading: string | null): EntryPart | null {
  if (heading === null) return null;
  const said = heading.trim().toLowerCase();
  return ENTRY_PARTS.find((part) => PART_HEADING[part].toLowerCase() === said) ?? null;
}

/** Blank lines off both ends; the indent of the first line with words is kept. */
function tidy(text: string): string {
  return text.replace(/^(?:[ \t]*\n)+/, "").replace(/\s+$/, "");
}

function pieces(body: string): Piece[] {
  const out: Piece[] = [{ heading: null, level: 0, text: "" }];
  let fenced = false;
  for (const line of body.replace(/\r\n?/g, "\n").split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
    const heading = fenced ? null : HEADING.exec(line);
    if (heading) {
      out.push({ heading: heading[2] ?? "", level: heading[1]?.length ?? 2, text: "" });
    } else {
      const last = out[out.length - 1] as Piece;
      last.text = last.text ? `${last.text}\n${line}` : line;
    }
  }
  return out.map((piece) => ({ ...piece, text: tidy(piece.text) }));
}

function join(all: readonly Piece[]): string {
  const blocks = all
    .filter((piece) => piece.heading !== null || piece.text !== "")
    .map((piece) =>
      piece.heading === null
        ? piece.text
        : `${"#".repeat(piece.level)} ${piece.heading}${piece.text ? `\n\n${piece.text}` : ""}`,
    );
  return `${blocks.join("\n\n")}\n`;
}

/**
 * Each part's words. A day written before there were parts - words and no
 * Today heading - reads those words as its Today.
 */
export function splitEntry(body: string): Record<EntryPart, string> {
  const all = pieces(body);
  const out: Record<EntryPart, string> = { today: "", grateful: "", tomorrow: "" };
  const hasToday = all.some((piece) => partOf(piece.heading) === "today");
  for (const piece of all) {
    const part = partOf(piece.heading);
    if (part && out[part] === "") out[part] = piece.text;
  }
  if (!hasToday) out.today = all[0]?.text ?? "";
  return out;
}

/**
 * Whether the day holds more than its three parts - another heading, or
 * words above Today - which only Free shows.
 */
export function hasMoreThanParts(body: string): boolean {
  const all = pieces(body);
  const hasToday = all.some((piece) => partOf(piece.heading) === "today");
  return all.some((piece) =>
    piece.heading === null ? hasToday && piece.text !== "" : partOf(piece.heading) === null,
  );
}

/**
 * The entry with one part's words replaced, in place. A part the entry does
 * not have yet is added after the parts that come before it; words written
 * before there were parts become the Today they were read as.
 */
export function withPart(body: string, part: EntryPart, text: string): string {
  let all = pieces(body);
  if (!all.some((piece) => partOf(piece.heading) === "today") && (all[0]?.text ?? "") !== "") {
    // The loose words were this day's Today; they go under the heading now.
    all = [{ heading: null, level: 0, text: "" }, { heading: PART_HEADING.today, level: 2, text: all[0]?.text ?? "" }, ...all.slice(1)];
  }
  const at = all.findIndex((piece) => partOf(piece.heading) === part);
  if (at !== -1) {
    all[at] = { ...(all[at] as Piece), text: tidy(text) };
    return join(all);
  }
  // After the last part that comes before this one, or before the first that comes after.
  const order = ENTRY_PARTS.indexOf(part);
  let insertAt = all.length;
  for (let index = all.length - 1; index >= 0; index -= 1) {
    const other = partOf(all[index]?.heading ?? null);
    if (other && ENTRY_PARTS.indexOf(other) < order) {
      insertAt = index + 1;
      break;
    }
    if (other && ENTRY_PARTS.indexOf(other) > order) insertAt = index;
  }
  all.splice(insertAt, 0, { heading: PART_HEADING[part], level: 2, text: tidy(text) });
  return join(all);
}

/**
 * Tomorrow's lines as tasks: each line with words, its bullet or box taken
 * off and its links read as their names. Five at most - a plan, not a list.
 */
export function tomorrowTasks(text: string): string[] {
  return linkLabelsOnly(text)
    .split("\n")
    .map((line) =>
      line
        .replace(/^\s*(?:[-*+]|\d+[.)])\s+/, "")
        .replace(/^\[[ xX]\]\s*/, "")
        .trim(),
    )
    .filter((line) => line.length > 0 && !HEADING.test(line))
    .slice(0, 5)
    .map((line) => line.slice(0, 200));
}

/* ---- What each part asks ------------------------------------------------- */

const ASK: Record<EntryPart, readonly string[]> = {
  today: [
    "What happened today?",
    "How did today actually go?",
    "The story of today, in a few lines.",
    "What is worth remembering about today?",
    "What did today teach you?",
  ],
  grateful: [
    "One thing you are grateful for",
    "Who made today easier?",
    "What went better than expected?",
    "A small good thing from today",
    "What made you laugh today?",
    "Who deserves a thank-you?",
    "What are you glad you did today?",
    "Something you would miss if it were gone",
  ],
  tomorrow: [
    "Tomorrow's one thing",
    "What would make tomorrow a good day?",
    "The first thing tomorrow",
    "What has to happen tomorrow?",
  ],
};

function dayNumber(day: string): number {
  let hash = 0;
  for (const character of day) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return hash;
}

/**
 * What each part asks on a day. The same day always asks the same, so an
 * entry reads as it was written; the next day asks something else.
 */
export function asksFor(day: string): Record<EntryPart, string> {
  const n = dayNumber(day);
  return {
    today: ASK.today[n % ASK.today.length] ?? "",
    grateful: ASK.grateful[(n >>> 3) % ASK.grateful.length] ?? "",
    tomorrow: ASK.tomorrow[(n >>> 6) % ASK.tomorrow.length] ?? "",
  };
}

/** A question to write to, for `/` in the journal. */
export function aPrompt(seed: number): string {
  const all = [...ASK.today, ...ASK.grateful, ...ASK.tomorrow];
  return all[Math.abs(Math.floor(seed)) % all.length] ?? "";
}
