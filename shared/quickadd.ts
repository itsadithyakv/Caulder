import { minutesOf, shiftDay, startOfWeek, timeOf, weekdayOf } from "./dates";

/**
 * One line of text into a task, without a model.
 *
 * "Datascience assignment at 4pm today", "call Oakridge tmrw 11:30",
 * "gym every mon wed fri 6am", "submit the form by the 15th". The vocabulary
 * a person uses for when something happens is small and regular - a few
 * hundred date, time and length words - so it is matched, not guessed at.
 * Whatever is left once the when, the how-long and the how-much-it-matters
 * are taken out is the title.
 *
 * **Typed the way people actually type**: tmrw, 2moro, tonite, "firday",
 * "4 p.m.", "@4", "half past 4", "1h30", "not urgent", "don't forget to".
 * A misspelt day is read as the day it nearly is - and the reading says so,
 * because a correction made silently is a guess wearing a disguise.
 *
 * **It asks rather than assumes**, but only where an assumption would
 * genuinely be a coin toss:
 *
 *  - no day at all, and no time to hang one on - "When is it due?"
 *  - "at 8", which is a lecture or an evening, and the two are equally likely
 *  - a time that has already gone today
 *  - a length or a repeat with no time to put it at
 *  - a repeat with no last day
 *
 * Everywhere else it takes the reading a person would: "at 4" is the
 * afternoon, because nobody plans a four in the morning; "at 9 in the
 * morning" is nine; and a time with no day is today while it is still ahead.
 */

type QuickKind = "call" | "email" | "follow_up" | "meeting" | "todo";

/** Days of the week a thing comes back on, and the last day it does. */
type Repeat = { weekdays: number[]; until: string | null };

type QuickTask = {
  title: string;
  /** `YYYY-MM-DD`, or null until it is known. For a repeat, the first one. */
  day: string | null;
  /** `HH:MM`, or null for a task with no time - which is most of them. */
  time: string | null;
  /** How long, when it was said. */
  minutes: number | null;
  kind: QuickKind;
  /** Null when nothing in the text says; the caller fills in its default. */
  area: string | null;
  priority: "must" | "spare" | null;
  /**
   * Null for a one-off. A repeat is hours set aside on the day grid rather
   * than a task - a task is done once - so it always has a time by the time
   * it is added.
   */
  repeat: Repeat | null;
};

/** What to show under the box, one question at a time. */
type Question =
  | { id: "title"; text: string }
  | { id: "day"; text: string; options: { label: string; day: string }[] }
  | { id: "meridiem"; text: string; options: { label: string; time: string }[] }
  | { id: "past"; text: string; options: { label: string; day: string }[] }
  | { id: "time"; text: string; options: { label: string; time: string | null }[] }
  | { id: "until"; text: string; options: { label: string; until: string }[] };

/** What the person picked in answer to a question. */
export type Answers = {
  day?: string;
  /** A time, or null for "no time - just a task". */
  time?: string | null;
  /** The last day of a repeat. */
  until?: string;
  /** Picked on the reading, when the words pointed the wrong way. */
  area?: string;
};

type Context = {
  /** The workspace's today, `YYYY-MM-DD`. */
  today: string;
  /** Minutes since midnight, where the workspace is. */
  now: number;
  /**
   * Words the person has taught it - course names, a company, a gym - each
   * pointing at an area. Checked before the built-in list, because they are
   * knowledge about this one life rather than a guess about everyone's.
   */
  words?: readonly { word: string; area: string }[];
  /** The last day of the term running now, for "until the end of term". */
  termEnd?: string | null;
};

/** Which part of the day a line mentions - what settles "at 9". */
type Hint = "morning" | "afternoon" | "evening" | "night";

/* ---- Vocabulary --------------------------------------------------------- */

const WEEKDAYS: Record<string, number> = {
  mon: 1, monday: 1,
  tue: 2, tues: 2, tuesday: 2,
  wed: 3, weds: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4,
  fri: 5, friday: 5,
  sat: 6, saturday: 6,
  sun: 7, sunday: 7,
};

const FULL_WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const SHORT_WEEKDAY = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8,
  sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11,
  dec: 12, december: 12,
};
const FULL_MONTHS = [
  "january", "february", "march", "april", "may", "june", "july", "august", "september",
  "october", "november", "december",
];

const NUMBER_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12,
};
const MINUTE_WORDS: Record<string, number> = {
  ...NUMBER_WORDS, fifteen: 15, twenty: 20, thirty: 30, forty: 40, "forty five": 45,
  "forty-five": 45, ninety: 90,
};

/** Longest first, so an alternation never settles for a prefix. */
const alternation = (words: readonly string[]) =>
  [...words].sort((a, b) => b.length - a.length).map(escapeRegex).join("|");

function escapeRegex(word: string): string {
  return word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const WD = alternation(Object.keys(WEEKDAYS));
const WDS = alternation(FULL_WEEKDAYS.map((day) => `${day}s`));
const HOUR_WORD = alternation(Object.keys(NUMBER_WORDS).filter((w) => w !== "a" && w !== "an"));
const COUNT = `\\d+|${alternation(Object.keys(NUMBER_WORDS))}`;

// "Tom" is deliberately not here: "call Tom friday" is a person.
const TOMORROW =
  "tomorrow|tomorow|tommorow|tommorrow|tomorro|tmrw|tmrow|tmr|tmw|tmoro|tomm|2moro|2morro|2morrow|2mrw|2mro";
const TODAY = "today|tdy|tday|2day";
const TONIGHT = "tonight|tonite|2nite|2night|tonigt";
const DAY_WORD = `${TOMORROW}|${TODAY}|${TONIGHT}|${WD}`;

/** am, pm, a.m., p.m. - but not "am" as the start of "amazing". */
const MER = String.raw`(a\.?m\.?|p\.?m\.?)(?![a-z])`;

const H = String.raw`(?:hours|hour|hrs|hr|h)`;
const M = String.raw`(?:minutes|minute|mins|min|m)`;
const LENGTH = [
  String.raw`\d+(?:\.\d+)?[\s-]*${H}\s*(?:and\s+)?\d{1,2}\s*${M}`,
  String.raw`\d+h\d{1,2}m?`,
  String.raw`(?:${COUNT})\s+and\s+a\s+half\s+${H}`,
  String.raw`(?:an?|one)\s+hour\s+and\s+a\s+half`,
  String.raw`(?:half\s+an?|a\s+half|half)[\s-]*hour`,
  String.raw`(?:a\s+)?quarter\s+(?:of\s+an\s+)?hour`,
  String.raw`(?:a\s+)?couple\s+(?:of\s+)?${H}`,
  String.raw`\d+(?:\.\d+)?[\s-]*${H}`,
  String.raw`\d+[\s-]*${M}`,
  String.raw`(?:${HOUR_WORD}|an?)\s+${H}`,
  String.raw`(?:${alternation(Object.keys(MINUTE_WORDS))})\s+${M}`,
].join("|");

/**
 * Words that say which part of your life a task belongs to.
 *
 * Only words that point one way. "Project" is the degree and the company in
 * equal measure, "call" is your mother as often as a client, "exercise 4.2"
 * is homework and "clean the dataset" is not housework - so none of those is
 * here: a wrong guess shown confidently is worse than the default.
 */
const AREA_WORDS: [string, string[]][] = [
  // Company first. The company sells to schools, so "demo for class 10" and
  // "exam-season campaign" are company work that happens to use school words;
  // checked the other way round they would land in College.
  ["company", [
    "client", "clients", "invoice", "invoices", "invoicing", "pitch", "pitching", "demo", "demos",
    "investor", "investors", "vc", "vcs", "fundraise", "fundraising", "funding", "proposal",
    "proposals", "deck", "sales", "customer", "customers", "outreach", "mailshot", "campaign",
    "campaigns", "payroll", "prospect", "prospects", "contract", "contracts", "onboarding",
    "cofounder", "co-founder", "cofounders", "startup", "mvp", "roadmap", "standup", "stand-up",
    "crm", "leads", "revenue", "gst", "quotation", "vendor", "vendors", "supplier", "marketing",
    "newsletter", "hiring", "sprint planning",
  ]],
  ["college", [
    "assignment", "assignments", "assgn", "homework", "hw", "lecture", "lectures", "class",
    "classes", "exam", "exams", "quiz", "quizzes", "lab", "labs", "tutorial", "tutorials", "tut",
    "seminar", "midterm", "midterms", "midsem", "mid-sem", "mid sem", "endsem", "end-sem",
    "end sem", "finals", "internals", "viva", "practical", "practicals", "coursework", "revise",
    "revision", "study", "studying", "essay", "thesis", "dissertation", "professor", "prof",
    "submission", "semester", "syllabus", "pset", "psets", "problem set", "problem sets",
    "worksheet", "textbook", "lecture notes", "attendance", "hod", "dean", "uni", "university",
    "college", "campus", "gpa", "cgpa", "office hours", "study group", "tutor",
  ]],
  // No "run", "walk" or "work out": "run the numbers", "walk through the
  // demo" and "work out the budget" are not exercise.
  ["health", [
    "gym", "workout", "workouts", "yoga", "swim", "swimming", "jog", "jogging", "doctor",
    "dentist", "physio", "physiotherapy", "meds", "medicine", "medicines", "pills", "cardio",
    "therapy", "therapist", "checkup", "check-up", "hospital", "clinic", "blood test", "eye test",
    "vaccine", "vaccination", "pharmacy", "chemist", "badminton", "cricket", "football",
    "basketball", "tennis", "squash", "volleyball", "cycling", "marathon", "5k", "10k",
    "meditate", "meditation", "stretching", "pilates", "zumba", "hike", "hiking", "trek",
    "trekking", "sports", "morning run", "evening run", "go for a run",
  ]],
  // Last: the rest of a life. What matters most here is that "buy groceries"
  // typed into an outreach workspace is not filed under the company.
  ["personal", [
    "groceries", "grocery", "laundry", "rent", "bill", "bills", "electricity", "wifi", "recharge",
    "mom", "mum", "mother", "dad", "father", "parents", "sister", "brother", "family", "grandma",
    "grandpa", "birthday", "bday", "anniversary", "haircut", "barber", "salon", "bank", "passport",
    "shopping", "cook", "cooking", "movie", "movies", "party", "gift", "gifts", "insurance",
    "landlord",
  ]],
];

const AREA_PATTERNS = AREA_WORDS.map(
  ([area, words]) =>
    [area, new RegExp(`(?<![a-z0-9])(?:${alternation(words).replace(/ /g, "\\s+")})(?![a-z0-9])`)] as const,
);

/** `#name` sets the area outright. These spellings map onto the four. */
const AREA_TAGS: Record<string, string> = {
  college: "college", uni: "college", univ: "college", school: "college", class: "college",
  study: "college", acad: "college", academics: "college",
  company: "company", work: "company", biz: "company", business: "company", startup: "company",
  job: "company", office: "company",
  personal: "personal", home: "personal", life: "personal", me: "personal", family: "personal",
  errand: "personal", errands: "personal",
  health: "health", gym: "health", fitness: "health", sport: "health", sports: "health",
  workout: "health",
};

/* ---- Matching ----------------------------------------------------------- */

type Span = { start: number; end: number };

function overlapsTaken(taken: Span[], start: number, end: number): boolean {
  return taken.some((span) => start < span.end && span.start < end);
}

/**
 * Every match of a pattern that does not overlap text already claimed, and
 * that `accept` agrees with. A match refused is not claimed, and the search
 * resumes one character on, so a refusal never hides a real match inside it.
 */
function claimIf(
  text: string,
  taken: Span[],
  pattern: RegExp,
  accept: (match: RegExpExecArray) => boolean = () => true,
  limit = Infinity,
): RegExpExecArray[] {
  const found: RegExpExecArray[] = [];
  const global = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);
  let match: RegExpExecArray | null;
  while (found.length < limit && (match = global.exec(text)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    if (match[0].length === 0 || overlapsTaken(taken, start, end) || !accept(match)) {
      global.lastIndex = start + 1;
      continue;
    }
    taken.push({ start, end });
    found.push(match);
  }
  return found;
}

const claim = (text: string, taken: Span[], pattern: RegExp) => claimIf(text, taken, pattern);

/**
 * Edits between two words, counting a swapped pair as one - "firday" is one
 * slip from "friday", not two.
 */
function distance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const d = new Array<number>(rows * cols).fill(0);
  const at = (i: number, j: number) => d[i * cols + j] ?? 0;
  for (let i = 0; i < rows; i += 1) d[i * cols] = i;
  for (let j = 0; j < cols; j += 1) d[j] = j;
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let best = Math.min(at(i - 1, j) + 1, at(i, j - 1) + 1, at(i - 1, j - 1) + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        best = Math.min(best, at(i - 2, j - 2) + 1);
      }
      d[i * cols + j] = best;
    }
  }
  return at(a.length, b.length);
}

/**
 * The word a slip of the keyboard was aiming at, or null.
 *
 * Strict on short targets: a six-letter day gets one slip and must keep its
 * length, so "frida" stays a name rather than becoming Friday. Longer words
 * can carry two - "tommorow" and "wensday" are how those two are usually
 * spelt at speed.
 */
function nearest(word: string, targets: readonly string[], loose: boolean): string | null {
  let best: { target: string; d: number } | null = null;
  for (const target of targets) {
    const allowed = target.length >= 8 ? 2 : 1;
    const d = distance(word, target);
    if (d === 0) return target;
    if (d > allowed) continue;
    if (!loose && target.length <= 6 && word.length !== target.length) continue;
    if (!best || d < best.d) best = { target, d };
  }
  return best?.target ?? null;
}

/** Real words one slip from a day, which must not be read as one. */
const NOT_A_DAY = new Set(["sundae", "sundaes"]);

function monthOf(word: string): number | null {
  const exact = MONTHS[word];
  if (exact !== undefined) return exact;
  if (word.length < 5) return null;
  // Only ever asked about a word sitting beside a day number, where a slip
  // is the likeliest explanation - so a little looser than for days.
  const guess = nearest(word, FULL_MONTHS, true);
  return guess ? (MONTHS[guess] ?? null) : null;
}

/* ---- Calendar arithmetic ------------------------------------------------ */

const pad = (n: number) => String(n).padStart(2, "0");
const capital = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

/** A 12-hour clock reading into 24-hour minutes. */
function clock(hour: number, minute: number, meridiem: "am" | "pm" | undefined): number {
  const h = hour % 12;
  if (meridiem === "am") return h * 60 + minute;
  if (meridiem === "pm") return (h + 12) * 60 + minute;
  return hour * 60 + minute;
}

const meridiemOf = (raw: string | undefined): "am" | "pm" | undefined =>
  raw ? (raw.startsWith("a") ? "am" : "pm") : undefined;

/** The soonest `weekday` on or after today; "next" moves it into next week. */
function weekdayDay(today: string, weekday: number, next: boolean): string {
  if (next) return shiftDay(startOfWeek(today), 7 + weekday - 1);
  const ahead = (weekday - weekdayOf(today) + 7) % 7;
  return shiftDay(today, ahead);
}

/** A day and month, this year if still to come, otherwise next year. */
function dayMonth(today: string, day: number, month: number, year?: number): string | null {
  const thisYear = Number(today.slice(0, 4));
  const build = (y: number) => `${y}-${pad(month)}-${pad(day)}`;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const candidate = build(year ?? thisYear);
  // A day that does not exist - the 31st of September - is refused rather
  // than rolled into October.
  const check = new Date(`${candidate}T00:00:00Z`);
  if (check.getUTCMonth() + 1 !== month) return null;
  if (year !== undefined || candidate >= today) return candidate;
  return build(thisYear + 1);
}

const yearOf = (raw: string | undefined) =>
  raw ? Number(raw.length === 2 ? `20${raw}` : raw) : undefined;

/** The Nth of this month if still to come, otherwise of next month. */
function ordinalDay(today: string, dd: number): string | null {
  const [y, m] = [Number(today.slice(0, 4)), Number(today.slice(5, 7))];
  const thisMonth = dayMonth(today, dd, m, y);
  if (thisMonth && thisMonth >= today) return thisMonth;
  return dayMonth(today, dd, m === 12 ? 1 : m + 1, m === 12 ? y + 1 : y);
}

function lastOfMonth(day: string): string {
  const [y, m] = [Number(day.slice(0, 4)), Number(day.slice(5, 7))];
  return `${y}-${pad(m)}-${pad(new Date(Date.UTC(y, m, 0)).getUTCDate())}`;
}

/** The same date `count` months on, or the month's last day if it is shorter. */
function addMonths(day: string, count: number): string {
  const [y, m, d] = [Number(day.slice(0, 4)), Number(day.slice(5, 7)), Number(day.slice(8, 10))];
  const total = y * 12 + (m - 1) + count;
  const [ny, nm] = [Math.floor(total / 12), (total % 12) + 1];
  const last = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  return `${ny}-${pad(nm)}-${pad(Math.min(d, last))}`;
}

/** Friday this week, or Sunday once Friday has gone. */
function endOfWeek(today: string): string {
  const wd = weekdayOf(today);
  return shiftDay(today, wd <= 5 ? 5 - wd : 7 - wd);
}

/** This Saturday - or today, on a weekend. "Next" is the one after. */
function weekend(today: string, next: boolean): string {
  if (next) return shiftDay(startOfWeek(today), 12);
  const wd = weekdayOf(today);
  return wd >= 6 ? today : shiftDay(today, 6 - wd);
}

/** The first day on or after `from` that the repeat lands on. */
function firstOn(from: string, weekdays: readonly number[]): string {
  for (let ahead = 0; ahead < 7; ahead += 1) {
    const day = shiftDay(from, ahead);
    if (weekdays.includes(weekdayOf(day))) return day;
  }
  return from;
}

/** Monday to Friday from "mon-fri"; round the weekend from "fri-mon". */
function weekdaySpan(from: number, to: number): number[] {
  const days: number[] = [];
  for (let d = from; ; d = (d % 7) + 1) {
    days.push(d);
    if (d === to || days.length === 7) break;
  }
  return days.sort((a, b) => a - b);
}

/* ---- Reading pieces ----------------------------------------------------- */

/** Minutes from a length phrase: "1h30", "an hour and a half", "90 mins". */
function readLength(raw: string): number | null {
  const p = raw.replace(/^(?:for|in)\s+/, "").trim();
  const count = (s: string | undefined) => NUMBER_WORDS[s ?? ""] ?? Number(s);
  let m: RegExpExecArray | null;
  if ((m = /^(\d+(?:\.\d+)?)[\s-]*h[a-z]*\s*(?:and\s+)?(\d{1,2})\s*(?:m[a-z]*)?$/.exec(p))) {
    return Math.round(Number(m[1]) * 60) + Number(m[2]);
  }
  if ((m = /^(\S+)\s+and\s+a\s+half\s+h/.exec(p))) return Math.round((count(m[1]) + 0.5) * 60);
  if (/^(?:an?|one)\s+hour\s+and\s+a\s+half$/.test(p)) return 90;
  if (/half/.test(p)) return 30;
  if (/quarter/.test(p)) return 15;
  if (/couple/.test(p)) return 120;
  if ((m = /^(\d+(?:\.\d+)?)[\s-]*h/.exec(p))) return Math.round(Number(m[1]) * 60);
  if ((m = /^(\d+)[\s-]*m/.exec(p))) return Number(m[1]);
  if ((m = /^(\S+)\s+h/.exec(p))) return count(m[1]) * 60;
  if ((m = /^(.+?)\s+m[a-z]*$/.exec(p))) return MINUTE_WORDS[m[1] ?? ""] ?? null;
  return null;
}

type Clock = { time: number } | { ask: { hour: number; minute: number } } | null;

/**
 * An hour and minute as said, into minutes since midnight - or a question.
 *
 * Said am or pm wins; then 13-23 read as a 24-hour clock; then the part of
 * the day the line mentions. Only with none of those does the old rule apply:
 * one to six is the afternoon, and seven to eleven is asked.
 */
function resolveClock(hour: number, minute: number, meridiem: "am" | "pm" | undefined, hint: Hint | null): Clock {
  if (hour > 23 || minute > 59) return null;
  if (meridiem) return hour >= 1 && hour <= 12 ? { time: clock(hour, minute, meridiem) } : null;
  if (hour >= 13 || hour === 0) return { time: hour * 60 + minute };
  if (hour === 12) return { time: hint === "night" ? minute : 12 * 60 + minute };
  if (hint === "morning") return { time: hour * 60 + minute };
  if (hint) return { time: (hour + 12) * 60 + minute };
  if (hour <= 6) return { time: (hour + 12) * 60 + minute };
  return { ask: { hour, minute } };
}

type DateRead = { day: string | null; length: number; term?: boolean };

/**
 * A date at the very start of `rest`, for the last day of a repeat: "dec 20",
 * "20/12", "the 20th", "friday", "the end of term".
 */
function readDate(rest: string, today: string): DateRead | null {
  let m: RegExpExecArray | null;
  if ((m = /^(?:the\s+)?end\s+of\s+(?:the\s+|this\s+)?(month|year|term|semester|sem)\b/.exec(rest)) ||
      (m = /^(?:this\s+|the\s+)?(term|semester|sem)\b/.exec(rest))) {
    if (m[1] === "month") return { day: lastOfMonth(today), length: m[0].length };
    if (m[1] === "year") return { day: `${today.slice(0, 4)}-12-31`, length: m[0].length };
    return { day: null, length: m[0].length, term: true };
  }
  if ((m = /^(\d{4})-(\d{2})-(\d{2})\b/.exec(rest))) {
    return { day: dayMonth(today, Number(m[3]), Number(m[2]), Number(m[1])), length: m[0].length };
  }
  if ((m = /^(\d{1,2})[./-](\d{1,2})(?:[./-](\d{4}|\d{2}))?\b/.exec(rest))) {
    return { day: dayMonth(today, Number(m[1]), Number(m[2]), yearOf(m[3])), length: m[0].length };
  }
  if ((m = /^(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?([a-z]{3,})\.?(?:,?\s+(\d{4}))?\b/.exec(rest))) {
    const month = monthOf(m[2] ?? "");
    if (month) return { day: dayMonth(today, Number(m[1]), month, yearOf(m[3])), length: m[0].length };
  }
  if ((m = /^([a-z]{3,})\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?\b/.exec(rest))) {
    const month = monthOf(m[1] ?? "");
    if (month) return { day: dayMonth(today, Number(m[2]), month, yearOf(m[3])), length: m[0].length };
  }
  if ((m = /^(\d{1,2})(?:st|nd|rd|th)\b/.exec(rest))) {
    return { day: ordinalDay(today, Number(m[1])), length: m[0].length };
  }
  if ((m = new RegExp(`^(?:(next)\\s+)?(${WD})\\b`).exec(rest))) {
    return { day: weekdayDay(today, WEEKDAYS[m[2] ?? ""] ?? 1, m[1] === "next"), length: m[0].length };
  }
  return null;
}

/* ---- The parse ---------------------------------------------------------- */

export function parseQuick(input: string, context: Context, answers: Answers = {}): {
  task: QuickTask;
  questions: Question[];
  /** Things worth saying about the reading: a slip corrected, a repeat it cannot do. */
  notes: string[];
} {
  // Matching is done on a lowercased copy of the same length, so every span
  // found in it maps straight back onto the text as typed. Dashes and curly
  // quotes are straightened first, one character for one.
  const text = input.replace(/[‒-―]/g, "-").replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
  const lower = text.toLowerCase();
  const shouting = text === text.toUpperCase();
  const taken: Span[] = [];
  const notes: string[] = [];
  const { today } = context;

  /* -- What the line says around the task, rather than the task itself -- */
  claim(
    lower,
    taken,
    /^\s*(?:(?:hey|ok|okay|so|please|pls|plz|kindly|can\s+you|could\s+you|would\s+you|will\s+you)[\s,]+)*(?:(?:add|create|make|new|set)\s+(?:a\s+|an\s+)?(?:new\s+)?(?:task|todo|to-do|reminder)\b[\s:,-]*(?:to\s+|for\s+)?|(?:task|todo|to-do|to\s+do|reminder)\b[\s:,-]*|note\s*[:-]\s*)?(?:(?:remind\s+me\s+to|remind\s+me|don'?t\s+forget\s+(?:to\s+)?|do\s+not\s+forget\s+(?:to\s+)?|remember\s+to|i\s+need\s+to|need\s+to|i\s+have\s+to|have\s+to|i'?ve\s+got\s+to|i\s+got\s+to|got\s+to|i\s+gotta|gotta|i\s+must|i\s+should|i\s+want\s+to|want\s+to|i\s+wanna|wanna|i'll|i\s+will|let\s+me|lemme)\b[\s:,-]*)?/,
  );
  claim(lower, taken, /[\s,]*\b(?:please|pls|plz|thanks|thank\s+you|thx)\b[\s.!]*$/);

  /* -- Area, from a tag -- */
  let area: string | null = null;
  for (const match of claim(lower, taken, /#([a-z][\w-]*)/)) {
    const tag = match[1] ?? "";
    area = AREA_TAGS[tag] ?? tag;
  }

  /* -- Priority. The negations first, so "not urgent" is never urgent. -- */
  let priority: "must" | "spare" | null = null;
  if (claim(
    lower,
    taken,
    /\b(?:not\s+(?:urgent|important|a\s+priority|priority)|no\s+(?:rush|hurry)|low[\s-]*prio(?:rity)?|if\s+(?:there\s+is\s+|there's\s+|i\s+have\s+|i\s+get\s+)?(?:the\s+)?time|if\s+possible|whenever|some\s?day|sometime|eventually|maybe|optional|nice\s+to\s+have|p[34])\b/,
  ).length) {
    priority = "spare";
  }
  const asap = claim(lower, taken, /\b(?:asap|a\.s\.a\.p\b\.?)/).length > 0;
  if (asap || claim(
    lower,
    taken,
    /\b(?:urgent(?:ly)?|important|high[\s-]*prio(?:rity)?|top\s+prio(?:rity)?|priority|critical|must[\s-]do|p[01])\b|(?:^|\s)!{1,3}(?=\s|$)|!{2,}/,
  ).length) {
    priority = "must";
  }
  claim(lower, taken, /\bp2\b/);

  /* -- The part of the day, which settles "at 9" -- */
  // Said outright first; failing that, a meal says it for you - "dinner at 8"
  // is not a question anybody needs asking.
  const hintWord =
    /\b(morning|afternoon|evening|night|tonight|tonite|2nite|2night)s?\b/.exec(lower)?.[1] ??
    /\b(breakfast|lunch|dinner|supper)\b/.exec(lower)?.[1];
  const hint: Hint | null =
    hintWord === "morning" || hintWord === "breakfast"
      ? "morning"
      : hintWord === "afternoon" || hintWord === "lunch"
        ? "afternoon"
        : hintWord === "evening" || hintWord === "dinner" || hintWord === "supper"
          ? "evening"
          : hintWord
            ? "night"
            : null;

  /* -- Repeats: "every monday", "mon wed fri", "daily", "weekdays" -- */
  // Declared through `as` so the compiler does not narrow them to null at the
  // declaration: several are set from inside the small helpers below.
  let weekdays = null as number[] | null;
  let weekly = false;
  const repeatOf = (days: number[]) => {
    if (weekdays === null) weekdays = [...new Set(days)].sort((a, b) => a - b);
  };
  const listed = (phrase: string) =>
    [...phrase.matchAll(new RegExp(`\\b(${WD})s?\\b`, "g"))].map((m) => WEEKDAYS[m[1] ?? ""] ?? 1);
  const SEP = String.raw`(?:\s*,\s*(?:and\s+)?|\s*&\s*|\s*\/\s*|\s*\+\s*|\s+and\s+|\s+)`;

  if (claim(lower, taken, /\b(?:monthly|every\s+month|each\s+month|once\s+a\s+month|yearly|annually|every\s+year|each\s+year|once\s+a\s+year)\b/).length) {
    notes.push("Repeats go by the days of the week, so this adds just the next one.");
  }
  if (claim(lower, taken, /\b(?:every\s+(?:other|second|alternate)|alternate|bi-?weekly|fortnightly|every\s+fortnight|every\s+(?:\d+|two|three|four)\s+(?:days|weeks))\b/).length) {
    notes.push("Every other week is not something it can repeat, so this adds just the next one.");
  }
  for (const _ of claim(lower, taken, /\b(?:every\s*day|everyday|daily|each\s+day|every\s+single\s+day|every\s+(?:morning|afternoon|evening|night))\b/)) repeatOf([1, 2, 3, 4, 5, 6, 7]);
  for (const _ of claim(lower, taken, /\b(?:every\s+week\s?day|(?:on\s+|every\s+)?week\s?days|every\s+working\s+day)\b/)) repeatOf([1, 2, 3, 4, 5]);
  for (const _ of claim(lower, taken, /\b(?:(?:on\s+|every\s+)?weekends|every\s+weekend)\b/)) repeatOf([6, 7]);
  for (const match of claim(lower, taken, new RegExp(`\\b(?:every\\s+)?(${WD})\\s*(?:-|to|thru|through|till|until)\\s*(${WD})\\b`))) {
    const [from, to] = [WEEKDAYS[match[1] ?? ""] ?? 1, WEEKDAYS[match[2] ?? ""] ?? 5];
    // "mon-fri" is a repeat only where a repeat was plainly meant; a range of
    // two days back to back is still a range of days.
    repeatOf(weekdaySpan(from, to));
  }
  for (const match of claim(lower, taken, new RegExp(`\\b(?:every|each)\\s+(?:${WD})(?:${SEP}(?:${WD}))*\\b`))) repeatOf(listed(match[0]));
  for (const match of claim(lower, taken, new RegExp(`\\b(?:on\\s+)?(?:${WDS})(?:${SEP}(?:${WDS}|${WD}))*\\b`))) repeatOf(listed(match[0]));
  for (const match of claim(lower, taken, new RegExp(`\\b(?:on\\s+)?(?:${WD})(?:${SEP}(?:${WD}))+\\b`))) repeatOf(listed(match[0]));
  if (claim(lower, taken, /\b(?:every\s+week|weekly|once\s+a\s+week|each\s+week)\b/).length) weekly = true;

  /* -- The last day of a repeat -- */
  type Until = { day: string } | { weeks: number } | { months: number } | { term: true } | null;
  let untilSpec: Until = null;
  if (weekdays !== null || weekly) {
    for (const match of lower.matchAll(/\b(?:until|till|til|thru|through|up\s*to|upto)\s+(?:the\s+)?/g)) {
      const start = match.index ?? 0;
      const read = readDate(lower.slice(start + match[0].length), today);
      const end = start + match[0].length + (read?.length ?? 0);
      if (!read || overlapsTaken(taken, start, end)) continue;
      taken.push({ start, end });
      untilSpec = read.term ? { term: true } : read.day ? { day: read.day } : null;
      break;
    }
    for (const _ of claim(lower, taken, /\bfor\s+(?:the\s+)?(?:whole\s+|rest\s+of\s+the\s+|entire\s+)?(?:term|semester|sem)\b/)) untilSpec ??= { term: true };
    for (const match of claim(lower, taken, new RegExp(`\\bfor\\s+(${COUNT}|a\\s+couple\\s+of)\\s+(weeks?|months?)\\b`))) {
      const n = /couple/.test(match[1] ?? "") ? 2 : (NUMBER_WORDS[match[1] ?? ""] ?? Number(match[1]));
      untilSpec ??= match[2]?.startsWith("week") ? { weeks: n } : { months: n };
    }
    for (const _ of claim(lower, taken, /\b(?:forever|indefinitely|for\s+good|for\s+a\s+year|all\s+year)\b/)) untilSpec ??= { months: 12 };
  }

  /* -- Whole dates with a year, before a time can take "15.09" of them -- */
  let day = null as string | null;
  const setDay = (value: string | null) => {
    if (value && day === null) day = value;
  };
  // Only a date that exists is claimed: "10.30-11.30" is a time range, and
  // refusing the thirtieth month leaves it for the range to read.
  for (const match of claimIf(lower, taken, /\b(\d{4})-(\d{2})-(\d{2})\b/, (m) =>
    dayMonth(today, Number(m[3]), Number(m[2]), Number(m[1])) !== null,
  )) {
    setDay(dayMonth(today, Number(match[3]), Number(match[2]), Number(match[1])));
  }
  // Never starting or ending inside a longer number: "10.30-11.30" holds
  // "30-11.30", and that is not the 30th of November 2030.
  for (const match of claimIf(lower, taken, /(?<![\d.:/-])\b(\d{1,2})[./-](\d{1,2})[./-](\d{4}|\d{2})\b(?![.:/-]\d)/, (m) =>
    dayMonth(today, Number(m[1]), Number(m[2]), yearOf(m[3])) !== null,
  )) {
    setDay(dayMonth(today, Number(match[1]), Number(match[2]), yearOf(match[3])));
  }

  /* -- "In two hours": a time, counted from now -- */
  let time = null as number | null;
  let minutes = null as number | null;
  let meridiemAsk = null as { hour: number; minute: number } | null;
  /** Nothing has said when yet - the only state in which a time is taken. */
  const open = () => time === null && meridiemAsk === null;

  for (const match of claimIf(lower, taken, new RegExp(`\\bin\\s+(?:${LENGTH})\\b`), (m) => readLength(m[0]) !== null, 1)) {
    const at = context.now + (readLength(match[0]) ?? 0);
    // Rounded up to five minutes: "in an hour" at 10:03 is 11:05, not 11:03.
    const rounded = Math.ceil(at / 5) * 5;
    setDay(shiftDay(today, Math.floor(rounded / (24 * 60))));
    time = rounded % (24 * 60);
  }

  /* -- 24-hour clock with "hrs": "1500 hrs", "at 1630" -- */
  if (time === null) {
    const match = claimIf(
      lower,
      taken,
      /(?:\bat\s*|@\s*)([01]\d|2[0-3])([0-5]\d)(?:\s*(?:hrs|hours|h)\b)?|\b([01]\d|2[0-3])([0-5]\d)\s*(?:hrs|hours|h)\b/,
      () => true,
      1,
    )[0];
    if (match) time = Number(match[1] ?? match[3]) * 60 + Number(match[2] ?? match[4]);
  }

  /* -- Time range: "4-5pm", "from 2 to 4", "between 4 and 6", "14:00-16:00" -- */
  /**
   * A start and an end, into a time and a length.
   *
   * Every am/pm pairing the words allow is tried, and only real ranges
   * survive - forwards, and no longer than half a day unless both ends said
   * so. "10:30-12:00" has one survivor; "11-1pm" has one; "9-5" is a working
   * day. Where two survive, the afternoon rule settles "4-6" and "12-2", and
   * "9-11" - a lecture or an evening - is asked.
   */
  const range = (h1: number, m1: number, p1: "am" | "pm" | undefined, h2: number, m2: number, p2: "am" | "pm" | undefined) => {
    if (!open()) return;
    if (h1 > 23 || h2 > 23 || m1 > 59 || m2 > 59) return;
    const set = (start: number, end: number) => {
      if (end <= start) return;
      time = start;
      minutes = end - start;
    };
    // A 24-hour clock on either end: read both as said.
    if (h1 >= 13 || h2 >= 13 || h1 === 0 || h2 === 0) {
      set(p1 ? clock(h1, m1, p1) : h1 * 60 + m1, p2 ? clock(h2, m2, p2) : h2 * 60 + m2);
      return;
    }
    const hintMer: "am" | "pm" | undefined = hint === "morning" ? "am" : hint ? "pm" : undefined;
    const starts = p1 ? [p1] : hintMer ? [hintMer] : (["am", "pm"] as const);
    const ends = p2 ? [p2] : (["am", "pm"] as const);
    const both = Boolean(p1 && p2);
    const fits = starts
      .flatMap((a) => ends.map((b) => ({ a, s: clock(h1, m1, a), e: clock(h2, m2, b) })))
      .filter(({ s, e }) => e > s && (both || e - s <= 12 * 60));
    if (fits.length === 0) return;
    const pm = fits.find((fit) => fit.a === "pm");
    const am = fits.find((fit) => fit.a === "am");
    if (fits.length === 1 || !pm || !am) {
      const only = fits[0];
      if (only) set(only.s, only.e);
    } else if (h1 <= 6 || h1 === 12) set(pm.s, pm.e);
    else {
      meridiemAsk = { hour: h1, minute: m1 };
      minutes = am.e - am.s;
    }
  };

  for (const match of claim(
    lower,
    taken,
    new RegExp(String.raw`\b(?:from\s+)?(\d{1,2})(?:[:.](\d{2}))?\s*(?:${MER})?\s*(?:-|to|until|till)\s*(\d{1,2})(?:[:.](\d{2}))?\s*${MER}`),
  )) {
    range(Number(match[1]), Number(match[2] ?? 0), meridiemOf(match[3]), Number(match[4]), Number(match[5] ?? 0), meridiemOf(match[6]));
  }
  // Said on the start only: "10am-12", "4pm to 6".
  for (const match of claim(
    lower,
    taken,
    new RegExp(String.raw`\b(\d{1,2})(?:[:.](\d{2}))?\s*${MER}\s*(?:-|to|until|till)\s*(\d{1,2})(?:[:.](\d{2}))?\b(?![:.]\d|\s*(?:pages?|problems?|questions?|slides?|people|marks|%))`),
  )) {
    range(Number(match[1]), Number(match[2] ?? 0), meridiemOf(match[3]), Number(match[4]), Number(match[5] ?? 0), undefined);
  }
  for (const match of claim(
    lower,
    taken,
    new RegExp(String.raw`(?:\b(?:from|between|at)\s+|@\s*)(\d{1,2})(?:[:.](\d{2}))?\s*(?:${MER})?\s*(?:-|to|until|till|and)\s*(\d{1,2})(?:[:.](\d{2}))?(?:\s*${MER})?`),
  )) {
    range(Number(match[1]), Number(match[2] ?? 0), meridiemOf(match[3]), Number(match[4]), Number(match[5] ?? 0), meridiemOf(match[6]));
  }
  // Minutes on either end make it a clock: "9-10:30", "14:00-16:00".
  for (const match of claim(
    lower,
    taken,
    /\b(\d{1,2})(?:[:.](\d{2}))?\s*(?:-|to|until|till)\s*(\d{1,2})[:.](\d{2})\b|\b(\d{1,2})[:.](\d{2})\s*(?:-|to|until|till)\s*(\d{1,2})\b(?![:.]\d)/,
  )) {
    const [h1, m1, h2, m2] = match[1] !== undefined
      ? [match[1], match[2], match[3], match[4]]
      : [match[5], match[6], match[7], undefined];
    range(Number(h1), Number(m1 ?? 0), undefined, Number(h2), Number(m2 ?? 0), undefined);
  }
  // Bare "4-6" only straight after a day - "tomorrow 4-6" - because on its own
  // it is as often "problems 4-6" or "chapters 4 to 6", and never when a count
  // follows it: "tomorrow 10-20 pages".
  for (const match of claim(
    lower,
    taken,
    new RegExp(String.raw`(?<=\b(?:${DAY_WORD})\s+)(\d{1,2})(?:[:.](\d{2}))?\s*(?:-|to|until|till)\s*(\d{1,2})(?:[:.](\d{2}))?\b(?!\s*(?:pages?|problems?|questions?|slides?|chapters?|exercises?|marks|points|%))`),
  )) {
    range(Number(match[1]), Number(match[2] ?? 0), undefined, Number(match[3]), Number(match[4] ?? 0), undefined);
  }

  /* -- Length: "for 2h", "1h30", "an hour and a half", "90 mins" -- */
  for (const match of claimIf(lower, taken, new RegExp(`\\b(?:for\\s+)?(?:${LENGTH})\\b`), (m) => readLength(m[0]) !== null)) {
    const length = readLength(match[0]) ?? 0;
    if (length > 0 && minutes === null) minutes = Math.min(length, 24 * 60);
  }

  /* -- A single time -- */
  const settle = (reading: Clock) => {
    if (!reading) return false;
    if ("time" in reading) time = reading.time;
    else meridiemAsk = reading.ask;
    return true;
  };
  const hourOf =(raw: string | undefined) => NUMBER_WORDS[raw ?? ""] ?? Number(raw);
  const PREFIX = String.raw`(?:\b(?:at|around)\s+|@\s*)`;

  if (open()) {
    for (const match of claim(lower, taken, /\b(?:12\s*)?(noon|midday)\b|\b(midnight)\b/)) {
      time = match[2] ? 0 : 12 * 60;
      break;
    }
  }
  const singles: [RegExp, (m: RegExpExecArray) => Clock][] = [
    [
      new RegExp(String.raw`${PREFIX}?\b(half|quarter)\s+(past|after|to|till|til)\s+(\d{1,2}|${HOUR_WORD})(?:\s*${MER})?`),
      (m) => {
        const base = hourOf(m[3]);
        const back = m[2] === "to" || m[2] === "till" || m[2] === "til";
        const minute = m[1] === "half" ? 30 : back ? 45 : 15;
        const hour = back ? (base === 1 ? 12 : base - 1) : base;
        return resolveClock(hour, minute, meridiemOf(m[4]), hint);
      },
    ],
    [
      new RegExp(String.raw`${PREFIX}?\b(\d{1,2}|${HOUR_WORD})\s*(?:o'?\s?clock|oclock)(?:\s*${MER})?`),
      (m) => resolveClock(hourOf(m[1]), 0, meridiemOf(m[2]), hint),
    ],
    [
      new RegExp(String.raw`(?:${PREFIX}|\bby\s+)?\b(\d{1,2})[:.](\d{2})(?:\s*${MER})?`),
      (m) => resolveClock(Number(m[1]), Number(m[2]), meridiemOf(m[3]), hint),
    ],
    [
      new RegExp(String.raw`(?:${PREFIX}|\bby\s+)?\b(\d{1,2})\s*${MER}`),
      (m) => resolveClock(Number(m[1]), 0, meridiemOf(m[2]), hint),
    ],
    [
      /(?:\bat\s*|@\s*)(\d{1,2})\s*(a|p)(?![a-z])/,
      (m) => resolveClock(Number(m[1]), 0, meridiemOf(m[2]), hint),
    ],
    [
      // "at 4", "@4", "around 4" - and "by 4", unless it is "by 4 marks".
      new RegExp(String.raw`(?:${PREFIX}|\bby\s+)(\d{1,2})\b(?![:.]\d|\s*(?:%|percent|pages?|people|marks|points|kg|km|rs|k\b|lakhs?|crores?|st\b|nd\b|rd\b|th\b))`),
      (m) => resolveClock(Number(m[1]), 0, undefined, hint),
    ],
    [
      // "9 in the morning", "9 tonight" - the number the phrase is about.
      new RegExp(String.raw`\b(\d{1,2})(?:[:.](\d{2}))?(?=\s+(?:in\s+the\s+(?:morning|afternoon|evening)|at\s+night|${TONIGHT}|this\s+(?:morning|afternoon|evening)))`),
      (m) => resolveClock(Number(m[1]), Number(m[2] ?? 0), undefined, hint),
    ],
    [
      // A bare number straight after a day, ending the line: "tomorrow 7".
      new RegExp(String.raw`(?<=\b(?:${DAY_WORD})\s+)(\d{1,2})(?![\d:.]|\s*(?:st|nd|rd|th)\b)(?=\s*(?:$|[,;.!?)]|for\b))`),
      (m) => (Number(m[1]) >= 1 && Number(m[1]) <= 12 ? resolveClock(Number(m[1]), 0, undefined, hint) : null),
    ],
  ];
  for (const [pattern, read] of singles) {
    if (!open()) break;
    claimIf(lower, taken, pattern, (m) => settle(read(m)), 1);
  }

  /* -- The part of the day, taken out where it is being used as a time -- */
  claim(lower, taken, /\bin\s+the\s+(?:morning|afternoon|evening)\b|\bat\s+night\b/);
  for (const _ of claim(lower, taken, /\bthis\s+(?:morning|afternoon|evening)\b/)) setDay(today);
  claim(lower, taken, new RegExp(`(?<=\\b(?:${DAY_WORD}|every|each|${WDS})\\s+)(?:morning|afternoon|evening|night)s?\\b`));
  // At the end, or before a time - "run tomorrow morning", "morning at 6" -
  // but not "morning run", where it is part of the name of the thing.
  claim(lower, taken, /\b(?:morning|afternoon|evening|night)\b(?=\s*(?:$|[,;.!?)]|\d|at\b|@))/);

  /* -- The day -- */
  const before = claim(
    lower,
    taken,
    new RegExp(`\\bbefore\\s+(?=(?:(?:this|next|coming)\\s+)?(?:${WD}|${TOMORROW})\\b|(?:the\\s+)?\\d{1,2}(?:st|nd|rd|th)\\b|(?:${Object.keys(MONTHS).join("|")})\\b)`),
  ).length > 0;

  for (const match of claim(lower, taken, new RegExp(`\\b(${WD})\\s+(?:of\\s+)?next\\s+week\\b|\\bnext\\s+week(?:'s)?\\s+(?:on\\s+)?(${WD})\\b`))) {
    setDay(weekdayDay(today, WEEKDAYS[match[1] ?? match[2] ?? ""] ?? 1, true));
  }
  for (const _ of claim(lower, taken, new RegExp(`\\b(?:the\\s+)?day\\s+after\\s+(?:${TOMORROW})\\b`))) setDay(shiftDay(today, 2));
  for (const _ of claim(lower, taken, new RegExp(`\\b(?:${TOMORROW})(?:'s)?\\b`))) setDay(shiftDay(today, 1));
  for (const _ of claim(lower, taken, new RegExp(`\\b(?:${TONIGHT})(?:'s)?\\b`))) setDay(today);
  for (const _ of claim(lower, taken, new RegExp(`\\blater(?:\\s+(?:${TODAY}|${TONIGHT}|on))?\\b`))) setDay(today);
  for (const _ of claim(lower, taken, new RegExp(`\\b(?:${TODAY})(?:'s)?\\b`))) setDay(today);
  for (const _ of claim(lower, taken, /\b(?:(?:by|before|at)\s+)?(?:the\s+)?(?:eod|cob|end\s+of\s+(?:the\s+)?(?:day|today))\b/)) setDay(today);
  for (const _ of claim(lower, taken, /\b(?:(?:by|before)\s+)?(?:the\s+)?(?:eow|end\s+of\s+(?:the\s+|this\s+)?week)\b/)) setDay(endOfWeek(today));
  for (const _ of claim(lower, taken, /\b(?:(?:by|before)\s+)?(?:the\s+)?(?:eom|end\s+of\s+(?:the\s+|this\s+)?month|month[\s-]end)\b/)) setDay(lastOfMonth(today));
  for (const _ of claim(lower, taken, /\bnext\s+weekend\b/)) setDay(weekend(today, true));
  for (const _ of claim(lower, taken, /\b(?:(?:this|the|on\s+the|over\s+the|at\s+the)\s+)?weekend\b/)) setDay(weekend(today, false));
  for (const _ of claim(lower, taken, /\bnext\s+week\b/)) setDay(shiftDay(today, 7));
  for (const _ of claim(lower, taken, /\bnext\s+month\b/)) setDay(addMonths(today, 1));
  for (const match of claim(lower, taken, new RegExp(`\\bin\\s+(${COUNT}|a\\s+couple\\s+of)\\s+(days?|weeks?|months?|fortnights?)\\b`))) {
    const n = /couple/.test(match[1] ?? "") ? 2 : (NUMBER_WORDS[match[1] ?? ""] ?? Number(match[1]));
    const unit = match[2] ?? "day";
    setDay(unit.startsWith("month") ? addMonths(today, n) : shiftDay(today, n * (unit.startsWith("fortnight") ? 14 : unit.startsWith("week") ? 7 : 1)));
  }
  for (const match of claim(lower, taken, new RegExp(`\\b(?:(this\\s+coming|this|next|on|coming|by)\\s+)?(${WD})(?:'s)?\\b`))) {
    setDay(weekdayDay(today, WEEKDAYS[match[2] ?? ""] ?? 1, match[1] === "next"));
  }
  for (const match of claimIf(
    lower,
    taken,
    /\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?([a-z]{3,})\.?(?:,?\s+(\d{4}))?\b|\b([a-z]{3,})\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?\b/,
    (m) => monthOf(m[2] ?? m[4] ?? "") !== null,
  )) {
    const word = match[2] ?? match[4] ?? "";
    const month = monthOf(word) ?? 1;
    if (MONTHS[word] === undefined) notes.push(`Read “${word}” as ${capital(FULL_MONTHS[month - 1] ?? "")}.`);
    setDay(dayMonth(today, Number(match[1] ?? match[5]), month, yearOf(match[3] ?? match[6])));
  }
  // Day first, the way dates are written here. Slashes only without a year:
  // "4.30" is a time and "4-5" is a range, and reading either as a date would
  // be the parser arguing with the person.
  for (const match of claim(lower, taken, /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/)) {
    setDay(dayMonth(today, Number(match[1]), Number(match[2]), yearOf(match[3])));
  }
  // "On the 15th", "by the 15th", or a 15th that ends the line. Not "1st year
  // orientation" or "2nd round interview", where the number is not a date.
  for (const match of claim(
    lower,
    taken,
    /\b(?:on|by|due|before|until|till)\s+(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)\b|\b(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)\b(?=\s*(?:$|[,;.!?)]|at\b|@|from\b|for\b|\d))/,
  )) {
    setDay(ordinalDay(today, Number(match[1] ?? match[2])));
  }

  // Slips: "firday", "wensday", "tommorrow". Only when nothing else said the
  // day, and only for words typed in lowercase - a capitalised word mid-line is
  // more likely somebody's name than a misspelt day.
  if (day === null) {
    claimIf(lower, taken, /\b(?:(this|next|on|coming|by)\s+)?([a-z]{5,})\b/, (m) => {
      const word = m[2] ?? "";
      const at = m.index + m[0].length - word.length;
      const typed = text.slice(at, at + word.length);
      if (NOT_A_DAY.has(word) || (!shouting && typed !== typed.toLowerCase())) return false;
      const guess = nearest(word, [...FULL_WEEKDAYS, "tomorrow", "tonight"], false);
      if (!guess) return false;
      if (guess === "tomorrow") setDay(shiftDay(today, 1));
      else if (guess === "tonight") setDay(today);
      else setDay(weekdayDay(today, WEEKDAYS[guess] ?? 1, m[1] === "next"));
      if (guess !== word) notes.push(`Read “${word}” as ${capital(guess)}.`);
      return true;
    }, 1);
  }

  if (before && day !== null) day = shiftDay(day, -1) < today ? today : shiftDay(day, -1);
  if (asap && day === null) day = today;

  /* -- Kind and area, read from the words that stay in the title -- */
  // Only from what was not already understood as the when: "for the
  // semester" says how long the gym repeat runs, not that the gym is college.
  const rest = blank(lower, taken);
  const kind = kindOf(rest);

  // Your words next - a tag has already had its say - and the longest one that
  // matches wins, because "machine learning lab" is more specific than "lab".
  if (area === null) area = yourArea(rest, context.words ?? []);
  if (area === null) area = AREA_PATTERNS.find(([, pattern]) => pattern.test(rest))?.[0] ?? null;

  /* -- The title is what is left -- */
  // A line typed in capitals is shouting, not an acronym: "PAY RENT TMRW"
  // becomes "Pay rent". Mixed case is left exactly as typed.
  const kept = titleFrom(text, taken);
  const title = shouting && /[A-Z]{2}/.test(kept) ? capital(kept.toLowerCase()) : kept;

  /* -- Answers, then what is still missing -- */
  if (answers.area !== undefined) area = answers.area;
  if (answers.time !== undefined) {
    time = answers.time === null ? null : minutesOf(answers.time);
    meridiemAsk = null;
  }
  if (answers.day !== undefined) day = answers.day;

  // A repeat answered with "only the next one" is a task on its first day.
  const repeating = (weekdays !== null || weekly) && answers.time !== null;
  if ((weekdays !== null || weekly) && answers.time === null && day === null) {
    day = firstOn(today, weekdays ?? [weekdayOf(today)]);
  }

  let repeat: Repeat | null = null;
  if (repeating) {
    const start = day ?? (time !== null && time <= context.now ? shiftDay(today, 1) : today);
    const days: number[] = weekdays ?? [weekdayOf(start)];
    day = firstOn(start, days);
    let until: string | null = null;
    const spec: Until = untilSpec;
    if (spec && "day" in spec) until = spec.day;
    else if (spec && "weeks" in spec) until = shiftDay(day, spec.weeks * 7 - 1);
    else if (spec && "months" in spec) until = shiftDay(addMonths(day, spec.months), -1);
    else if (spec && "term" in spec) until = context.termEnd ?? null;
    if (answers.until !== undefined) until = answers.until;
    if (until !== null && until < day) {
      notes.push("That last day is before the first one, so it needs a new last day.");
      until = null;
    }
    if (until !== null && until > shiftDay(day, 365)) {
      notes.push("Repeats run for a year at most, so this one stops a year from its first day.");
      until = shiftDay(day, 365);
    }
    repeat = { weekdays: days, until };
  }

  const questions: Question[] = [];

  if (title.length === 0) {
    questions.push({ id: "title", text: "What is it? Type the task itself - the when is already understood." });
  }

  if (meridiemAsk) {
    const { hour, minute } = meridiemAsk;
    const am = timeOf(hour * 60 + minute);
    const pm = timeOf((hour + 12) * 60 + minute);
    questions.push({
      id: "meridiem",
      text: `${hour}${minute ? `:${pad(minute)}` : ""} in the morning or the evening?`,
      options: [
        { label: "Morning", time: am },
        { label: "Evening", time: pm },
      ],
    });
  }

  if (repeat && time === null && !meridiemAsk && answers.time === undefined) {
    // A repeat is hours on the grid, so it needs a time - or it becomes a
    // task on its first day, which is the honest thing to offer instead.
    questions.push({
      id: "time",
      text: `${describeWeekdays(repeat.weekdays)} - at what time?`,
      options: [...timeOptions(hint), { label: "Only the next one, as a task", time: null }],
    });
  }

  // A length with nowhere to put it: they wanted time set aside, not a to-do.
  if (!repeat && minutes !== null && time === null && !meridiemAsk && answers.time === undefined) {
    questions.push({
      id: "time",
      text: `${describeLength(minutes)} - at what time?`,
      options: [...timeOptions(hint), { label: "No time, just the task", time: null }],
    });
  }

  if (repeat && repeat.until === null && day !== null) {
    questions.push({
      id: "until",
      text: `${describeWeekdays(repeat.weekdays)} - until when?`,
      options: untilOptions(day, context.termEnd ?? null),
    });
  }

  if (!repeat) {
    if (day === null && time !== null && !meridiemAsk) {
      // A time with no day is today - while that time is still ahead.
      if (time > context.now) day = today;
      else {
        questions.push({
          id: "past",
          text: `${label(time)} has already gone today.`,
          options: [
            { label: `Tomorrow at ${label(time)}`, day: shiftDay(today, 1) },
            { label: "Today anyway", day: today },
          ],
        });
      }
    } else if (day === null && !meridiemAsk && !questions.some((q) => q.id === "time")) {
      questions.push({
        id: "day",
        text: "When is it due?",
        options: dueOptions(today),
      });
    }
  }

  return {
    task: {
      title,
      day,
      time: time === null ? null : timeOf(time),
      minutes,
      kind,
      area,
      priority,
      repeat,
    },
    questions,
    notes,
  };
}

/** Call, email, follow up or meet - read from the verb, which stays in the title. */
function kindOf(lower: string): QuickKind {
  if (/\b(?:follow[\s-]?up|followup|f\/u|chase|chasing|check[\s-]?in\s+(?:with|on)|nudge|ping)\b/.test(lower)) {
    return "follow_up";
  }
  // "Phone" and "ring" only as verbs: "pay the phone bill" and "buy a ring"
  // are not calls.
  if (
    /\b(?:call|calls|called|calling)\b/.test(lower) ||
    /(?:^|[\s,])phone\s+(?:up\s+)?(?!bill|bills|number|no\b|case|cover|charger|screen|repair|recharge|plan)[a-z]/.test(lower) ||
    /(?<!\b(?:a|the|engagement|wedding|boxing)\s)\bring\s+(?!light|size)[a-z]/.test(lower)
  ) {
    return "call";
  }
  if (/\b(?:e-?mail|mail)(?:s|ed|ing)?\b/.test(lower)) return "email";
  if (
    /\b(?:meet|meets|meeting|meetings|meetup|catch[\s-]?up|1:1|1-on-1|one[\s-]on[\s-]one|zoom|g-?meet|google\s+meet|standup|stand-up|interview)\b/.test(lower) ||
    /\bsync\s+(?:with|up)\b|\b(?:team|weekly|daily|cofounder|co-founder)\s+sync\b/.test(lower) ||
    /\b(?:coffee|lunch|dinner|breakfast|drinks)\s+with\b/.test(lower)
  ) {
    return "meeting";
  }
  return "todo";
}

/**
 * The area your own words point at, or null.
 *
 * Whole words and phrases only, ignoring case: "lab" must not match inside
 * "collaborate", and "CS301" has to match as itself rather than as "cs" then
 * a number. The boundaries are letters and digits rather than `\b`, so a word
 * ending in a symbol - "c++" - still has an edge to stop at.
 */
function yourArea(lower: string, words: readonly { word: string; area: string }[]): string | null {
  let best: { length: number; area: string } | null = null;
  for (const { word, area } of words) {
    const phrase = word.trim().toLowerCase().replace(/\s+/g, " ");
    if (phrase.length === 0) continue;
    const escaped = escapeRegex(phrase).replace(/ /g, "\\s+");
    if (!new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`).test(lower)) continue;
    if (!best || phrase.length > best.length) best = { length: phrase.length, area };
  }
  return best?.area ?? null;
}

/** The text with everything understood blanked out, same length. */
function blank(text: string, taken: Span[]): string {
  const keep = [...text];
  for (const span of taken) for (let i = span.start; i < span.end; i += 1) keep[i] = " ";
  return keep.join("");
}

/** Strips what was understood and tidies what is left into a title. */
function titleFrom(text: string, taken: Span[]): string {
  const keep = [...blank(text, taken)];
  const FILLER = new Set([
    "at", "on", "by", "due", "for", "from", "the", "this", "and", "to", "in", "before", "coming",
    "around", "until", "till", "starting", "then", "or", "@",
  ]);

  let words = keep
    .join("")
    .split(/\s+/)
    // Punctuation hugging a word's edges goes; an apostrophe inside one -
    // "mom's" - stays. A word that was only punctuation goes altogether.
    .map((word) => word.replace(/^[,.;:!?\-–()[\]{}"']+|[,.;:!?\-–()[\]{}"']+$/g, ""))
    .filter((word) => /[\p{L}\p{N}]/u.test(word));

  // Filler is only removed from the ends. "Hand in the form" keeps its "in"
  // and its "the"; "the form due" loses the "due" it was left holding.
  while (words.length && FILLER.has((words[0] ?? "").toLowerCase())) words = words.slice(1);
  while (words.length && FILLER.has((words[words.length - 1] ?? "").toLowerCase())) words = words.slice(0, -1);

  const title = words.join(" ").trim();
  return title.length === 0 ? "" : title.charAt(0).toUpperCase() + title.slice(1);
}

/** "Every day", "Weekdays", "Every Mon, Wed, Fri". */
export function describeWeekdays(weekdays: readonly number[]): string {
  const sorted = [...weekdays].sort((a, b) => a - b).join(",");
  if (sorted === "1,2,3,4,5,6,7") return "Every day";
  if (sorted === "1,2,3,4,5") return "Weekdays";
  if (sorted === "6,7") return "Weekends";
  if (weekdays.length === 1) return `Every ${capital(FULL_WEEKDAYS[(weekdays[0] ?? 1) - 1] ?? "")}`;
  return `Every ${sorted.split(",").map((d) => SHORT_WEEKDAY[Number(d) - 1] ?? "").join(", ")}`;
}

function timeOptions(hint: Hint | null): { label: string; time: string }[] {
  if (hint === "morning") return [{ label: "6 AM", time: "06:00" }, { label: "7 AM", time: "07:00" }, { label: "8 AM", time: "08:00" }];
  if (hint === "afternoon") return [{ label: "1 PM", time: "13:00" }, { label: "3 PM", time: "15:00" }, { label: "5 PM", time: "17:00" }];
  if (hint === "evening" || hint === "night") return [{ label: "6 PM", time: "18:00" }, { label: "7 PM", time: "19:00" }, { label: "9 PM", time: "21:00" }];
  return [{ label: "9 AM", time: "09:00" }, { label: "2 PM", time: "14:00" }, { label: "7 PM", time: "19:00" }];
}

function untilOptions(first: string, termEnd: string | null): { label: string; until: string }[] {
  const options: { label: string; until: string }[] = [];
  if (termEnd && termEnd >= first && termEnd <= shiftDay(first, 365)) options.push({ label: "End of term", until: termEnd });
  options.push({ label: "4 weeks", until: shiftDay(first, 27) });
  options.push({ label: "12 weeks", until: shiftDay(first, 83) });
  const yearEnd = `${first.slice(0, 4)}-12-31`;
  if (yearEnd > shiftDay(first, 90)) options.push({ label: "End of the year", until: yearEnd });
  return options;
}

function dueOptions(today: string): { label: string; day: string }[] {
  const friday = weekdayDay(today, 5, false);
  const options = [
    { label: "Today", day: today },
    { label: "Tomorrow", day: shiftDay(today, 1) },
  ];
  // "Friday" is only worth offering when it is not already one of the two.
  if (friday !== today && friday !== shiftDay(today, 1)) options.push({ label: "Friday", day: friday });
  options.push({ label: "Next week", day: shiftDay(today, 7) });
  return options;
}

function label(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}${m ? `:${pad(m)}` : ""} ${h < 12 ? "AM" : "PM"}`;
}

function describeLength(minutes: number): string {
  if (minutes < 60) return `${minutes} minutes`;
  if (minutes === 60) return "An hour";
  return minutes % 60 === 0 ? `${minutes / 60} hours` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

/**
 * What kind of block to set aside for a task with a time.
 *
 * A call or a meeting is a meeting on the day grid; otherwise the area says
 * what the hour is for.
 */
export function blockKindFor(task: Pick<QuickTask, "kind" | "area">): string {
  if (task.kind === "meeting" || task.kind === "call") return "meeting";
  if (task.area === "college") return "study";
  if (task.area === "company") return "focus";
  return "personal";
}
