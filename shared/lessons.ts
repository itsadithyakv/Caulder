import { z } from "zod";
import { TASK_AREAS } from "./domain";

/**
 * What the line learns from being corrected.
 *
 * Move a task from Company to Personal, or a line from Note to Task, before
 * pressing Enter, and the words of that line are kept with the choice. The
 * next line that shares those words is read the way you chose - "give
 * rahul his jacket back" lands in Personal because "return my friends
 * jacket" did. No model: a lesson is the words and the answer, and every one
 * can be seen and taken back in Settings.
 *
 * Two rules keep it from learning the wrong thing. A word that has been
 * corrected towards two different answers says nothing ("report" is a client's
 * and a lab's), and a word you have taught outright as one of Your words is
 * left to that, which already speaks for it. A lesson wins only when it has a
 * word the others do not.
 */

/** The kinds a line can be moved between and learn from. Never private, contact, done or command. */
export const LESSON_KINDS = ["task", "journal", "idea", "note", "memory"] as const;
export type LessonKind = (typeof LESSON_KINDS)[number];

export type Lesson = {
  id: string;
  /** The words of the line, plain and sorted: what a later line is matched on. */
  words: readonly string[];
  area: string | null;
  kind: LessonKind | null;
  /** How many times this exact lesson was given. */
  times: number;
  /** The line as it was typed the first time, to show what was learnt from. */
  sample: string;
};

export const lessonInput = z
  .object({
    text: z.string().trim().min(1).max(2000),
    area: z.enum(TASK_AREAS).nullable().default(null),
    kind: z.enum(LESSON_KINDS).nullable().default(null),
  })
  .refine((value) => value.area !== null || value.kind !== null, "Nothing was chosen to learn from.");
export type LessonInput = z.input<typeof lessonInput>;

/** Words that carry nothing about which part of life a line is, or what it is. */
const STOP = new Set([
  "a", "an", "the", "and", "or", "but", "so", "to", "of", "in", "on", "at", "for", "with", "from", "by", "about",
  "into", "over", "after", "before", "up", "down", "out", "off", "it", "its", "this", "that", "these", "those",
  "i", "im", "ive", "ill", "me", "my", "mine", "we", "our", "us", "you", "your", "he", "she", "they", "them",
  "his", "her", "their", "is", "are", "was", "were", "be", "been", "am", "do", "does", "did", "have", "has", "had",
  "having", "need", "needs", "got", "gotta", "get", "want", "wants", "will", "would", "should", "could", "must",
  "can", "cant", "dont", "not", "no", "yes", "also", "just", "then", "than", "there", "here", "when", "what",
  "which", "who", "how", "why", "some", "any", "all", "more", "very", "really", "today", "tomorrow", "tonight",
  "yesterday", "tmrw", "now", "later", "soon", "next", "last", "week", "month", "year", "day", "days", "morning",
  "afternoon", "evening", "night", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
  "mon", "tue", "tues", "wed", "thu", "thur", "thurs", "fri", "sat", "sun", "am", "pm", "ish", "remember", "remind",
  "forget", "please", "ok", "okay", "hey", "again", "back", "still", "thing", "things", "stuff", "something",
  "one", "two", "three", "every", "each", "asap", "urgent", "maybe", "if", "as", "too", "well",
]);

/** "friends" and "friend" are one word; "class" and "glass" are not "clas" and "glas". */
function stem(word: string): string {
  return word.length > 4 && word.endsWith("s") && !word.endsWith("ss") ? word.slice(0, -1) : word;
}

/** The words of a line worth matching a later one on, each once, in order. */
export function wordsOf(text: string): string[] {
  const seen = new Set<string>();
  for (const raw of text.toLowerCase().replace(/[’']/g, "").split(/[^\p{L}\p{N}]+/u)) {
    const word = stem(raw);
    if (word.length < 3 || /\d/.test(word) || STOP.has(raw) || STOP.has(word)) continue;
    seen.add(word);
  }
  return [...seen].sort();
}

type Field = "area" | "kind";

/**
 * Which answer the lessons give for a line, for one field, or null when they
 * give none or cannot agree. A word that has been taught two answers counts
 * for neither. The answer with the most weight wins, and only outright.
 */
function vote(text: string, lessons: readonly Lesson[], field: Field, leave: ReadonlySet<string>): string | null {
  const words = wordsOf(text).filter((word) => !leave.has(word));
  if (words.length === 0) return null;
  const relevant = lessons.filter((lesson) => lesson[field] !== null);

  // What each word has been taught, across every lesson that has it.
  const taught = new Map<string, Set<string>>();
  for (const lesson of relevant) {
    for (const word of lesson.words) {
      const answers = taught.get(word) ?? new Set<string>();
      answers.add(lesson[field] as string);
      taught.set(word, answers);
    }
  }

  const weight = new Map<string, number>();
  for (const lesson of relevant) {
    const answer = lesson[field] as string;
    const shared = lesson.words.filter((word) => words.includes(word) && taught.get(word)?.size === 1);
    if (shared.length === 0) continue;
    weight.set(answer, (weight.get(answer) ?? 0) + shared.length * Math.max(1, lesson.times));
  }

  const ranked = [...weight.entries()].sort((a, b) => b[1] - a[1]);
  const best = ranked[0];
  if (!best || best[1] < 1) return null;
  if (ranked[1] && ranked[1][1] >= best[1]) return null;
  return best[0];
}

/** Which part of life the lessons say a line is. `taught` are Your words, which already speak for themselves. */
export function voteArea(text: string, lessons: readonly Lesson[], taught: readonly string[] = []): string | null {
  const leave = new Set(taught.flatMap((word) => wordsOf(word)));
  return vote(text, lessons, "area", leave);
}

/** The line a choice was learnt from, to say so under the line: "the way you moved “return my friends jacket”". */
export function learntFrom(text: string, lessons: readonly Lesson[], field: Field, answer: string): string | null {
  const words = wordsOf(text);
  const best = lessons
    .filter((lesson) => lesson[field] === answer)
    .map((lesson) => ({ lesson, shared: lesson.words.filter((word) => words.includes(word)).length }))
    .filter(({ shared }) => shared > 0)
    .sort((a, b) => b.shared - a.shared || b.lesson.times - a.lesson.times)[0];
  return best?.lesson.sample ?? null;
}

/** Where the lessons say a line goes. */
export function voteKind(text: string, lessons: readonly Lesson[]): LessonKind | null {
  const kind = vote(text, lessons, "kind", new Set());
  return kind !== null && (LESSON_KINDS as readonly string[]).includes(kind) ? (kind as LessonKind) : null;
}
