import { z } from "zod";

/**
 * What the line learns from being corrected.
 *
 * Move a line from Note to Task, or from Task to Idea, before pressing Enter,
 * and the words of that line are kept with the choice. The next line that
 * shares those words is read the way you chose - "look into a loyalty card"
 * is an idea because "look into a referral scheme" was. No model: a lesson
 * is the words and the answer, and every one can be seen and taken back in
 * Settings.
 *
 * One rule keeps it from learning the wrong thing: a word that has been
 * corrected towards two different answers says nothing. A lesson wins only
 * when it has a word the others do not.
 *
 * A lesson used to say which part of life a task was in as well. A task has
 * no area now (PLAN.md, phase 32); the column on `line_lessons` stays, unread.
 */

/** The kinds a line can be moved between and learn from. Never private, contact, done or command. */
export const LESSON_KINDS = ["task", "idea", "note", "memory"] as const;
export type LessonKind = (typeof LESSON_KINDS)[number];

export type Lesson = {
  id: string;
  /** The words of the line, plain and sorted: what a later line is matched on. */
  words: readonly string[];
  kind: LessonKind;
  /** How many times this exact lesson was given. */
  times: number;
  /** The line as it was typed the first time, to show what was learnt from. */
  sample: string;
};

export const lessonInput = z.object({
  text: z.string().trim().min(1).max(2000),
  kind: z.enum(LESSON_KINDS, { error: "Nothing was chosen to learn from." }),
});
export type LessonInput = z.input<typeof lessonInput>;

/** Words that carry nothing about what a line is. */
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

/**
 * Which kind the lessons give for a line, or null when they give none or
 * cannot agree. A word that has been taught two answers counts for neither.
 * The answer with the most weight wins, and only outright.
 */
function vote(text: string, lessons: readonly Lesson[]): string | null {
  const words = wordsOf(text);
  if (words.length === 0) return null;

  // What each word has been taught, across every lesson that has it.
  const taught = new Map<string, Set<string>>();
  for (const lesson of lessons) {
    for (const word of lesson.words) {
      const answers = taught.get(word) ?? new Set<string>();
      answers.add(lesson.kind);
      taught.set(word, answers);
    }
  }

  const weight = new Map<string, number>();
  for (const lesson of lessons) {
    const shared = lesson.words.filter((word) => words.includes(word) && taught.get(word)?.size === 1);
    if (shared.length === 0) continue;
    weight.set(lesson.kind, (weight.get(lesson.kind) ?? 0) + shared.length * Math.max(1, lesson.times));
  }

  const ranked = [...weight.entries()].sort((a, b) => b[1] - a[1]);
  const best = ranked[0];
  if (!best || best[1] < 1) return null;
  if (ranked[1] && ranked[1][1] >= best[1]) return null;
  return best[0];
}

/** The line a choice was learnt from, to say so under the line: "the way you moved “return my friends jacket”". */
export function learntFrom(text: string, lessons: readonly Lesson[], answer: LessonKind): string | null {
  const words = wordsOf(text);
  const best = lessons
    .filter((lesson) => lesson.kind === answer)
    .map((lesson) => ({ lesson, shared: lesson.words.filter((word) => words.includes(word)).length }))
    .filter(({ shared }) => shared > 0)
    .sort((a, b) => b.shared - a.shared || b.lesson.times - a.lesson.times)[0];
  return best?.lesson.sample ?? null;
}

/** Where the lessons say a line goes. */
export function voteKind(text: string, lessons: readonly Lesson[]): LessonKind | null {
  const kind = vote(text, lessons);
  return kind !== null && (LESSON_KINDS as readonly string[]).includes(kind) ? (kind as LessonKind) : null;
}
