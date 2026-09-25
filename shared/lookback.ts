import { z } from "zod";
import type { Mood } from "./brain";
import { shiftDay } from "./dates";

/**
 * Looking back: a reading of your journal over a stretch of time - how you
 * have changed, what kept coming up and what stopped - written by a model.
 *
 * It is the most private thing Caulder could send anywhere, so it is built
 * the other way round from Ask:
 *  - **On this computer first.** A model run by Ollama, at an address on
 *    this machine and nowhere else (`isOnThisComputer`). Nothing leaves.
 *  - **Sent away only on purpose.** The AI connected in Settings can do it
 *    instead, but only after the screen says who will receive how many days,
 *    and the journal's passcode is typed again - not just the journal open.
 *  - **Nothing is kept.** Not the request, not the reading. It lives on the
 *    screen until it is closed. Private lines never go, either way.
 *
 * The numbers - days written, moods, what got done - are worked out here and
 * shown whether or not any model is there.
 */

export const LOOKBACK_SPANS = [
  { id: "month", label: "The last month", days: 31 },
  { id: "season", label: "The last three months", days: 92 },
  { id: "year", label: "The last year", days: 366 },
  { id: "all", label: "Everything", days: null },
] as const;
export type LookBackSpan = (typeof LOOKBACK_SPANS)[number]["id"];

export const DEFAULT_LOCAL_ADDRESS = "http://localhost:11434";

/** A month of the journal and the days around it, in numbers. */
export type LookBackMonth = {
  /** "2026-09". */
  month: string;
  days: number;
  words: number;
  /** The average of the moods given, 1 (rough) to 5 (great); null when none were. */
  mood: number | null;
  tasksDone: number;
  calls: number;
  habitsKept: number;
  contactsAdded: number;
};

/** A model on this computer: whether Ollama answered at the address, and what it has. */
export type LocalModel = { address: string; found: boolean; models: string[]; model: string | null };

/** What a reading would be, before one is asked for. */
export type LookBackPlan = {
  span: LookBackSpan;
  from: string | null;
  to: string;
  days: number;
  characters: number;
  months: LookBackMonth[];
  local: LocalModel;
  /** The AI connected in Settings, if there is one, and whether it is itself on this computer. */
  away: { service: string; model: string | null; onThisComputer: boolean } | null;
  /** The journal has a passcode; and whether it is open, which reading locked days takes. */
  passcode: boolean;
  open: boolean;
  /** Days in the span that are sealed, and cannot be read while the journal is locked. */
  sealed: number;
};

export type LookBackReading = {
  text: string;
  via: "local" | "away";
  service: string;
  model: string;
  days: number;
  characters: number;
  /** How many requests it took: one, or a note for each part and one to bring them together. */
  requests: number;
};

export const lookBackInput = z.object({
  span: z.enum(["month", "season", "year", "all"]),
  via: z.enum(["local", "away"]),
  /** Sending away: the journal's passcode, asked for again. */
  passcode: z.string().max(200).optional(),
  /** Sending away from a journal with no passcode: SEND, typed. */
  confirm: z.string().max(20).optional(),
});
export type LookBackInput = z.infer<typeof lookBackInput>;

export const localModelInput = z.object({
  address: z.string().trim().max(200),
  model: z.string().trim().max(200).nullable(),
});

const MOOD_SCORE: Record<Mood, number> = { rough: 1, low: 2, okay: 3, good: 4, great: 5 };

function moodScore(mood: Mood | null | undefined): number | null {
  return mood ? MOOD_SCORE[mood] : null;
}

/** The first day of a span, or null for everything. */
export function spanStart(span: LookBackSpan, today: string): string | null {
  const days = LOOKBACK_SPANS.find((each) => each.id === span)?.days ?? null;
  return days === null ? null : shiftDay(today, -(days - 1));
}

/**
 * Whether an address is on this machine. The only thing that makes "on this
 * computer" true: a model at any other address is somebody else's computer,
 * however it was set up.
 */
export function isOnThisComputer(address: string): boolean {
  try {
    const url = new URL(address);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    const host = url.hostname.replace(/^\[|\]$/g, "");
    return host === "localhost" || host === "::1" || /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host);
  } catch {
    return false;
  }
}

export type ReadDay = { day: string; mood: Mood | null; text: string };

const countWords = (text: string) => (text.match(/\S+/g) ?? []).length;

/** A day as the model reads it: the date, the mood, the words. */
function dayBlock(day: ReadDay): string {
  return `### ${day.day}${day.mood ? ` (${day.mood})` : ""}\n${day.text.trim()}`;
}

/** Words per month: the journal's share of the numbers. */
export function journalNumbers(days: readonly ReadDay[]): Map<string, { days: number; words: number; mood: number | null }> {
  const months = new Map<string, { days: number; words: number; moods: number[] }>();
  for (const day of days) {
    const month = day.day.slice(0, 7);
    const into = months.get(month) ?? { days: 0, words: 0, moods: [] };
    into.days += 1;
    into.words += countWords(day.text);
    const score = moodScore(day.mood);
    if (score !== null) into.moods.push(score);
    months.set(month, into);
  }
  return new Map(
    [...months].map(([month, into]) => [
      month,
      {
        days: into.days,
        words: into.words,
        mood: into.moods.length ? Math.round((into.moods.reduce((a, b) => a + b, 0) / into.moods.length) * 10) / 10 : null,
      },
    ]),
  );
}

/**
 * The journal cut into parts that fit, a month at a time where a month fits
 * and in pieces where it does not. One part means one request; more means a
 * note for each and a last request that reads the notes.
 */
export function partsOf(days: readonly ReadDay[], budget: number): { label: string; text: string }[] {
  const parts: { label: string; text: string }[] = [];
  let label = "";
  let blocks: string[] = [];
  let size = 0;
  const flush = () => {
    if (blocks.length) parts.push({ label, text: blocks.join("\n\n") });
    blocks = [];
    size = 0;
  };
  for (const day of [...days].sort((a, b) => a.day.localeCompare(b.day))) {
    const block = dayBlock(day).slice(0, budget);
    const month = day.day.slice(0, 7);
    if (size + block.length > budget || (blocks.length > 0 && !label.startsWith(month) && size > budget / 2)) flush();
    if (blocks.length === 0) label = month;
    blocks.push(block);
    size += block.length + 2;
  }
  flush();
  // "2026-09" twice reads as "2026-09, part 2".
  const seen = new Map<string, number>();
  return parts.map((part) => {
    const n = (seen.get(part.label) ?? 0) + 1;
    seen.set(part.label, n);
    return n > 1 ? { ...part, label: `${part.label}, part ${n}` } : part;
  });
}

/** The numbers as a small table the model can read beside the words. */
export function numbersText(months: readonly LookBackMonth[]): string {
  if (months.length === 0) return "";
  const rows = months.map(
    (month) =>
      `| ${month.month} | ${month.days} | ${month.words} | ${month.mood ?? "-"} | ${month.tasksDone} | ${month.calls} | ${month.habitsKept} | ${month.contactsAdded} |`,
  );
  return [
    "| Month | Days written | Words | Mood (1-5) | Tasks done | Calls | Habits kept | Contacts added |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ...rows,
  ].join("\n");
}

const VOICE = `Write to the person, as "you", warmly and plainly, in British English. Be honest rather than flattering: name what got harder as well as what got better. Quote their own words briefly, with the date, when it shows something. Never diagnose, never give medical or financial advice, and never invent anything that is not in the entries.`;

/** Instructions for a reading done in one request. */
export function readingInstructions(from: string | null, to: string): string {
  return [
    `You are reading someone's private journal${from ? ` from ${from} to ${to}` : ` up to ${to}`}, at their request, to help them see how they have grown.`,
    VOICE,
    `Write in markdown with these headings, each a short paragraph or a few bullets:`,
    `## How you have changed - personally: confidence, habits, how you speak about yourself and others.`,
    `## Work and ambition - what you were building and chasing, and how that moved. Use the numbers table when it helps.`,
    `## What kept coming up - worries, people, themes that returned; which of them faded and which grew.`,
    `## What went well - wins, small and large, that you might not have noticed.`,
    `## Worth thinking about - one to three gentle questions for the months ahead.`,
    `Keep the whole reading under 700 words.`,
  ].join("\n\n");
}

/** Instructions for one part of a long journal: notes, not a reading. */
export function partInstructions(label: string): string {
  return [
    `You are reading one part (${label}) of someone's private journal, at their request. Another step will bring the notes from every part together.`,
    `Write compact notes, under 250 words, in bullets: what happened, how they felt and spoke about it, recurring people and worries, wins, and any change you can see within this part. Quote a few telling words with their date. Never invent anything.`,
  ].join("\n\n");
}

/** What the last request is given: the notes, in order, and the numbers. */
export function notesContext(notes: readonly { label: string; text: string }[], months: readonly LookBackMonth[]): string {
  return [
    ...notes.map((note) => `## Notes on ${note.label}\n\n${note.text.trim()}`),
    months.length ? `## The numbers, month by month\n\n${numbersText(months)}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** The journal itself, for a reading done in one request. */
export function journalContext(days: readonly ReadDay[], months: readonly LookBackMonth[]): string {
  return [
    `## The journal\n\n${[...days].sort((a, b) => a.day.localeCompare(b.day)).map(dayBlock).join("\n\n")}`,
    months.length ? `## The numbers, month by month\n\n${numbersText(months)}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}
