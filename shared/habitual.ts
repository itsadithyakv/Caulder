import { wordsOf } from "./lessons";
import { expand } from "./slang";
import { daysBetween, shiftDay } from "./dates";
import type { Busy, OpenTask, Said, Timed } from "./lines";

/**
 * What the line knows from what you have done before (shared/lines.ts):
 *
 *  - **Your usual.** Gym has been at 7 in the morning nine times out of ten,
 *    so "gym tomorrow" is at 7 without asking - said, and one click to drop.
 *  - **A clash.** "Meeting at 5" when Guitar is at 5 says so before Enter.
 *  - **Already there.** "Pay rent" when "Pay rent" is open for the 1st.
 *  - **Getting ready.** An exam or a pitch a few days off offers the day before
 *    to prepare.
 *  - **Tab.** The rest of the line, from what you have typed before and the
 *    names you know - the thing you do at this hour first.
 *
 * All of it from counting, none of it guessed: an hour is only "usual" when it
 * has been that hour three times and most of the time.
 */

/** Words about doing, not about what: "go to gym" and "gym session" are both the gym. */
const GENERIC = new Set([
  "go", "going", "went", "hit", "need", "get", "have", "has", "take", "attend", "session", "time", "today",
  "tomorrow", "tonight", "morning", "evening", "night", "afternoon", "daily", "every", "quick", "usual",
]);

/** What a title is about, as a set of words: "Go to gym" and "gym" are the same. */
export function coreOf(title: string): string[] {
  return wordsOf(expand(title)).filter((word) => !GENERIC.has(word));
}

function same(a: readonly string[], b: readonly string[]): boolean {
  return a.length > 0 && a.length === b.length && a.every((word) => b.includes(word));
}

function mostOf<T>(values: readonly T[]): { value: T; count: number } | null {
  const counts = new Map<T, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  let best: { value: T; count: number } | null = null;
  for (const [value, count] of counts) if (!best || count > best.count) best = { value, count };
  return best;
}

type Usual = { time: string | null; minutes: number | null; of: number; out: number; about: string };

/** The hour and length this has had before, when it has had one often enough to count on. */
export function usualFor(title: string, timed: readonly Timed[]): Usual | null {
  const core = coreOf(title);
  if (core.length === 0) return null;
  const before = timed.filter((each) => same(coreOf(each.title), core));
  if (before.length < 3) return null;
  const hour = mostOf(before.map((each) => each.startsAt));
  const length = mostOf(before.map((each) => each.minutes));
  const counts = (found: { count: number } | null) => found !== null && found.count >= 3 && found.count / before.length >= 0.6;
  if (!counts(hour) && !counts(length)) return null;
  return {
    time: counts(hour) ? (hour?.value ?? null) : null,
    minutes: counts(length) ? (length?.value ?? null) : null,
    // What the note counts: the hour, when there is one to count on, else the length.
    of: counts(hour) ? (hour?.count ?? 0) : (length?.count ?? 0),
    out: before.length,
    about: core.join(" "),
  };
}

const minutesOf = (time: string) => {
  const [hour = 0, minute = 0] = time.split(":").map(Number);
  return hour * 60 + minute;
};

/** An hour already taken when this would be, that is not this itself. */
export function clashWith(
  task: { title: string; day: string; time: string; minutes: number | null },
  busy: readonly Busy[],
  own: string | null = null,
): Busy | null {
  const start = minutesOf(task.time);
  const end = start + (task.minutes ?? 60);
  const core = coreOf(task.title);
  return (
    busy.find(
      (hour) =>
        hour.day === task.day &&
        (own === null || hour.taskId !== own) &&
        !same(coreOf(hour.title), core) &&
        minutesOf(hour.startsAt) < end &&
        start < minutesOf(hour.startsAt) + hour.minutes,
    ) ?? null
  );
}

/** The same thing, already open for about then: "Pay rent" twice is one rent. */
export function alreadyOpen(title: string, day: string, open: readonly OpenTask[]): OpenTask | null {
  const core = coreOf(title);
  if (core.length === 0) return null;
  return open.find((task) => same(coreOf(task.title), core) && Math.abs(daysBetween(day, task.dueOn)) <= 14) ?? null;
}

const EXAM = /\b(?:exam|exams|test|viva|midsem|mid-sem|midterm|endsem|end-sem|finals?|quiz|board)\b/i;
const EVENT = /\b(?:interview|presentation|pitch|demo|recital|audition|match|competition|hackathon|debate)\b/i;
const ALREADY_READY = /^(?:prepare|prep|revise|study|practise|practice|rehearse|get\s+ready)\b/i;

/** For an exam or a pitch a few days off: the day before, to get ready. */
export function readyFor(title: string, day: string, today: string): { title: string; day: string } | null {
  if (ALREADY_READY.test(title) || daysBetween(today, day) < 2) return null;
  const what = title.replace(/^(?:have|has|attend|give|write|take|appear\s+for)\s+(?:an?\s+|the\s+|my\s+)?/i, "").trim();
  if (EXAM.test(title)) return { title: `Revise for ${lower(what)}`, day: shiftDay(day, -1) };
  if (EVENT.test(title)) return { title: `Prepare for ${lower(what)}`, day: shiftDay(day, -1) };
  return null;
}

function lower(title: string): string {
  // "DBMS exam" stays DBMS; "Exam" is "exam" in the middle of a sentence.
  return /^[A-Z][a-z]/.test(title) ? title.charAt(0).toLowerCase() + title.slice(1) : title;
}

/** What Tab can finish a line with, and how much each is worth. */
type Completions = { phrases: readonly { text: string; weight: number }[]; names: readonly { text: string; weight: number }[] };

/**
 * The things Tab offers, weighted: what you type most, what you usually do at
 * about this hour, and the names you know - habits and hobbies first, since
 * they are the things said most often.
 */
export function completionsFrom(
  context: { said: readonly Said[]; timed: readonly Timed[] },
  known: { contacts: readonly { name: string; person: string | null }[]; hobbies: readonly { title: string }[]; habits?: readonly { name: string }[]; pages?: readonly { title: string }[] },
  now: number,
): Completions {
  const nearNow = new Set(
    context.timed
      .filter((each) => Math.abs(minutesOf(each.startsAt) - now) <= 90)
      .map((each) => coreOf(each.title).join(" "))
      .filter(Boolean),
  );
  const phrases = context.said.map((each) => ({
    text: each.title,
    weight: each.count + (nearNow.has(coreOf(each.title).join(" ")) ? 10 : 0),
  }));
  const names = [
    ...(known.habits ?? []).map((habit) => ({ text: habit.name, weight: 30 })),
    ...known.hobbies.map((hobby) => ({ text: hobby.title, weight: 25 })),
    ...known.contacts.flatMap((contact) => [
      ...(contact.person ? [{ text: contact.person, weight: 20 }] : []),
      { text: contact.name, weight: 15 },
    ]),
    ...(known.pages ?? []).map((page) => ({ text: page.title, weight: 5 })),
  ];
  return { phrases, names };
}

/**
 * The rest of what is being typed, for Tab: the whole line when it starts
 * like something said before, else the name the last word starts. Only ever
 * what comes after the cursor, in the case it was said in.
 */
export function complete(text: string, from: Completions): string | null {
  if (text.trim().length === 0 || /\s{2,}$/.test(text)) return null;
  const typed = text.toLowerCase();
  let best: { rest: string; weight: number } | null = null;
  for (const phrase of from.phrases) {
    const said = phrase.text.toLowerCase();
    if (said.length > typed.length && said.startsWith(typed) && (!best || phrase.weight > best.weight)) {
      best = { rest: phrase.text.slice(text.length), weight: phrase.weight };
    }
  }
  if (best) return best.rest;

  // The name the last word or two starts: "call ra" is Rahul, "meet priya sh" is Priya Sharma.
  if (/\s$/.test(text)) return null;
  const tokens = text.split(/\s+/);
  for (let take = Math.min(3, tokens.length); take >= 1; take -= 1) {
    const tail = tokens.slice(-take).join(" ");
    if (tail.length < 2) continue;
    const lowerTail = tail.toLowerCase();
    let found: { rest: string; weight: number } | null = null;
    for (const name of from.names) {
      const said = name.text.toLowerCase();
      if (said.length > lowerTail.length && said.startsWith(lowerTail) && (!found || name.weight > found.weight)) {
        found = { rest: name.text.slice(tail.length), weight: name.weight };
      }
    }
    if (found) return found.rest;
  }
  return null;
}
