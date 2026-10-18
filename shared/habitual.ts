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
 *  - **Getting ready.** A pitch or a demo a few days off offers the day before
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

/** What kind of thing a block's title says it was, for its usual length: a call, or a meeting. */
function kindOfTitle(title: string): "call" | "meeting" | null {
  const lower = expand(title).toLowerCase();
  if (/\b(?:call|calls|ring|phone)\b/.test(lower)) return "call";
  if (/\b(?:meet|meeting|catch[\s-]?up|sync|1:1|one[\s-]on[\s-]one|standup|stand-up|interview|coffee\s+with|lunch\s+with)\b/.test(lower)) return "meeting";
  return null;
}

/**
 * The length a call or a meeting has usually had, when the line said none and
 * this very thing has no usual of its own: thirty minutes, if most of the
 * person's calls have been thirty minutes. Counted the way `usualFor` counts.
 */
export function usualLength(kind: string, timed: readonly Timed[]): Usual | null {
  if (kind !== "call" && kind !== "meeting") return null;
  const before = timed.filter((each) => kindOfTitle(each.title) === kind);
  if (before.length < 3) return null;
  const length = mostOf(before.map((each) => each.minutes));
  if (!length || length.count < 3 || length.count / before.length < 0.6) return null;
  return { time: null, minutes: length.value, of: length.count, out: before.length, about: kind === "call" ? "a call" : "a meeting" };
}

/** This thing's own usual, else the usual length of its kind. */
export function usualOf(title: string, kind: string, timed: readonly Timed[]): Usual | null {
  return usualFor(title, timed) ?? usualLength(kind, timed);
}

/**
 * The shape of the person's working day, from their own blocks over the last
 * eight weeks (PLAN.md, part twelve, phase 46): when it usually starts, when
 * it usually ends, and when lunch is over. Each is the middle value of the
 * days that had one, and null with fewer than five days (three lunches) to
 * count - a new workspace leans on nothing.
 */
export type YourDay = { starts: number | null; ends: number | null; lunchEnds: number | null };

export const NO_DAY: YourDay = { starts: null, ends: null, lunchEnds: null };

const middle = (values: readonly number[], least = 5): number | null => {
  if (values.length < least) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? null;
};

export function yourDay(timed: readonly Timed[], today: string): YourDay {
  const since = shiftDay(today, -56);
  const recent = timed.filter((each) => each.day >= since && each.day < today);
  const byDay = new Map<string, Timed[]>();
  for (const block of recent) byDay.set(block.day, [...(byDay.get(block.day) ?? []), block]);
  const days = [...byDay.values()];
  const lunches = recent.filter((each) => /\blunch\b/i.test(each.title)).map((each) => minutesOf(each.startsAt) + each.minutes);
  return {
    starts: middle(days.map((blocks) => Math.min(...blocks.map((each) => minutesOf(each.startsAt))))),
    ends: middle(days.map((blocks) => Math.max(...blocks.map((each) => minutesOf(each.startsAt) + each.minutes)))),
    lunchEnds: middle(lunches, 3),
  };
}

/**
 * Morning or evening for this very thing, from when it has been before
 * (PLAN.md, part twelve, phase 48): "call mum at 8" has gone in at 8pm twice
 * and never at 8am, so it is 8pm without asking. Learned from what was kept,
 * the way `usualFor` learns an hour - nothing stored apart from the blocks.
 */
export function sideBefore(title: string, hour: number, minute: number, timed: readonly Timed[]): "am" | "pm" | null {
  const core = coreOf(title);
  if (core.length === 0) return null;
  const at = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  const [am, pm] = [at(hour * 60 + minute), at((hour + 12) * 60 + minute)];
  const before = timed.filter((each) => same(coreOf(each.title), core));
  const mornings = before.filter((each) => each.startsAt === am).length;
  const evenings = before.filter((each) => each.startsAt === pm).length;
  if (evenings >= 2 && mornings === 0) return "pm";
  if (mornings >= 2 && evenings === 0) return "am";
  return null;
}

/**
 * Morning or evening for an hour said bare, from when the person's days are:
 * eleven is the morning to somebody who works nine to seven, because 11pm
 * falls outside their day and 11am inside it. An hour either side of the day
 * still counts as in it. Null - so the line asks - when both fall inside, or
 * neither does, or there is no day to go on.
 */
export function sideOf(hour: number, minute: number, day: YourDay): "am" | "pm" | null {
  if (day.starts === null || day.ends === null) return null;
  const inside = (at: number) => at >= day.starts! - 60 && at <= day.ends! + 60;
  const am = inside(hour * 60 + minute);
  const pm = inside((hour + 12) * 60 + minute);
  if (am === pm) return null;
  return am ? "am" : "pm";
}

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

const EVENT = /\b(?:interview|presentation|pitch|demo|talk|workshop|webinar|launch|audit|hackathon)\b/i;
const ALREADY_READY = /^(?:prepare|prep|practise|practice|rehearse|get\s+ready)\b/i;

/** For a pitch or a demo a few days off: the day before, to get ready. */
export function readyFor(title: string, day: string, today: string): { title: string; day: string } | null {
  if (ALREADY_READY.test(title) || daysBetween(today, day) < 2) return null;
  const what = title.replace(/^(?:have|has|attend|give|write|take|appear\s+for)\s+(?:an?\s+|the\s+|my\s+)?/i, "").trim();
  if (EVENT.test(title)) return { title: `Prepare for ${lower(what)}`, day: shiftDay(day, -1) };
  return null;
}

function lower(title: string): string {
  // "CRM demo" stays CRM; "Demo" is "demo" in the middle of a sentence.
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
  known: { contacts: readonly { name: string; person: string | null }[]; hobbies?: readonly { title: string }[]; habits?: readonly { name: string }[]; pages?: readonly { title: string }[] },
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
    ...(known.hobbies ?? []).map((hobby) => ({ text: hobby.title, weight: 25 })),
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
