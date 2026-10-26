import { parseQuick } from "./quickadd";
import { expand } from "./slang";
import { addMonths, shiftDay, startOfWeek } from "./dates";
import type { Question } from "./lines";

/**
 * A question typed into the line, and what it asks about - the day it means,
 * the contact it names, the money it is about - so it can be answered from
 * what is kept (services/lines.ts) instead of being filed as a note.
 *
 * Only a whole line said the way a question is said: "what's on tomorrow",
 * "am i free at 5", "rahul's number", "how much did i spend this week", "what
 * did i note about red rising". A line that merely starts with a question word
 * - "what if we priced it yearly", "when rahul calls, ask about the demo" -
 * is not one, and is read the way it always was.
 */

type Clock = { today: string; now: number };

/** Words that say a day, so "move it to 5" keeps its day and "move it to friday" does not. */
const DAYISH =
  /\b(?:today|tonight|tomorrow|tmrw|tmr|yesterday|(?:mon|tue|tues|wed|wednes|thu|thur|thurs|fri|sat|satur|sun)(?:day)?|weekend|week|month|\d{1,2}(?:st|nd|rd|th)|jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec|day\s+after)\b/i;

/**
 * A when on its own - "tomorrow", "5", "friday at 6pm" - read the way the task
 * line reads it. What it is for comes along, so an hour said bare leans the way
 * it would for that: "the dentist at 10" is the morning. Null when it says no
 * when at all.
 */
export function readWhen(
  phrase: string,
  clock: Clock,
  about = "it",
  /** An hour it already has, so "move it to 9" stays in the half of the day it was. */
  was: string | null = null,
  /** Nothing but a when: "friday" is one, "sugar this week" is not. */
  only = false,
): { day: string | null; time: string | null; minutes: number | null } | null {
  const said = phrase.trim();
  if (!said) return null;
  const bare = /^\d{1,2}(?:[:.]\d{2})?(?:\s*[ap]\.?m\.?)?$/i.test(said);
  const reading = parseQuick(`${about} ${bare ? "at " : ""}${said}`, clock);
  if (only && plain(reading.task.title) !== plain(parseQuick(about, clock).task.title)) return null;
  let time = reading.task.time;
  const half = reading.questions.find((question) => question.id === "meridiem");
  if (!time && half && "options" in half) {
    const options = half.options as { label: string; time: string }[];
    const evening = was !== null && Number(was.slice(0, 2)) >= 12;
    time = (evening ? options[1] : options[0])?.time ?? null;
  }
  const day = DAYISH.test(said) ? reading.task.day : null;
  if (day === null && time === null) return null;
  return { day, time, minutes: reading.task.minutes };
}

const plain = (title: string) => title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** "Tomorrow", "Friday", "next week": the day a question is about, and what to call it. */
function dayOf(words: string, clock: Clock): { day: string; label: string } | null {
  const said = words.trim();
  if (!said || /^(?:today|my\s+day|the\s+day)$/i.test(said)) return { day: clock.today, label: "Today" };
  if (/^(?:tomorrow|tmrw|tmr)$/i.test(said)) return { day: shiftDay(clock.today, 1), label: "Tomorrow" };
  const when = readWhen(said, clock);
  if (!when?.day) return null;
  return { day: when.day, label: said.charAt(0).toUpperCase() + said.slice(1) };
}

/** A span of days for money: "this week" is since Monday, "this month" since the first. */
function spanOf(words: string, today: string): { from: string; to: string; label: string } {
  const said = words.trim().toLowerCase();
  if (said === "today") return { from: today, to: today, label: "Today" };
  if (said === "yesterday") return { from: shiftDay(today, -1), to: shiftDay(today, -1), label: "Yesterday" };
  if (/^(?:last|past)\s+week$/.test(said)) {
    const monday = startOfWeek(today);
    return { from: shiftDay(monday, -7), to: shiftDay(monday, -1), label: "Last week" };
  }
  if (/^this\s+month$|^so\s+far(?:\s+this\s+month)?$/.test(said)) return { from: `${today.slice(0, 8)}01`, to: today, label: "This month" };
  if (/^(?:last|past)\s+month$/.test(said)) {
    const first = addMonths(`${today.slice(0, 8)}01`, -1);
    return { from: first, to: shiftDay(`${today.slice(0, 8)}01`, -1), label: "Last month" };
  }
  if (/^this\s+year$/.test(said)) return { from: `${today.slice(0, 4)}-01-01`, to: today, label: "This year" };
  // "This week", and the question said with no span at all.
  return { from: startOfWeek(today), to: today, label: "This week" };
}

const DAY_WORDS = String.raw`today|tonight|tomorrow|tmrw|tmr|day\s+after\s+tomorrow|this\s+weekend|the\s+weekend|next\s+week|this\s+week|(?:this\s+|next\s+)?(?:mon|tues|wednes|thurs|fri|satur|sun)day|(?:the\s+)?\d{1,2}(?:st|nd|rd|th)`;

/** How long a slot was asked for: an hour unless it said otherwise. */
function slotMinutes(said: string | undefined): number {
  const words = (said ?? "").toLowerCase();
  if (/half|30/.test(words)) return 30;
  if (/two|2\s*h/.test(words)) return 120;
  return 60;
}

const RULES: { says: RegExp; ask: (m: RegExpExecArray, clock: Clock) => Question | null }[] = [
  // Part twelve, phase 50: asked about a contact, the money, and the hours left.
  {
    says: /^(?:when\s+(?:did|have)\s+i\s+(?:last\s+)?(?:talk(?:ed)?|speak|spoken|spoke|meet|met|call(?:ed)?|e-?mail(?:ed)?|messag(?:e|ed)|text(?:ed)?|hear(?:d)?)\s+(?:to\s+|with\s+|from\s+)?(.+?)(?:\s+last)?|when\s+was\s+i\s+last\s+in\s+touch\s+with\s+(.+)|(?:the\s+)?last\s+time\s+i\s+(?:spoke|talked|met|called|heard\s+from)\s+(?:to\s+|with\s+)?(.+))$/i,
    ask: (m) => ({ ask: "last", name: (m[1] ?? m[2] ?? m[3] ?? "").trim() }),
  },
  {
    says: /^(?:how\s+much\s+(?:does|do)\s+(.+?)\s+owe(?:\s+(?:me|us))?|what\s+(?:does|do)\s+(.+?)\s+owe(?:\s+(?:me|us))?|who\s+owes\s+(?:me|us)(?:\s+money)?|what(?:'?s|\s+is)\s+(?:outstanding|owed|unpaid|still\s+owed)|(?:money\s+)?owed\s+to\s+(?:me|us))$/i,
    ask: (m) => ({ ask: "owed", name: (m[1] ?? m[2] ?? "").trim() || null }),
  },
  {
    says: /^(?:(?:my\s+|the\s+)?next\s+free\s+(slot|hour|half\s+(?:an\s+)?hour|30\s*min(?:ute)?s?|two\s+hours|2\s*h(?:ours?)?)|when\s+am\s+i\s+(?:next\s+)?(free)|find\s+(?:me\s+)?(?:an?\s+)?(hour|half\s+(?:an\s+)?hour|slot|time|30\s*min(?:ute)?s?|two\s+hours|2\s*h(?:ours?)?))(?:\s+(?:on\s+)?(.+))?$/i,
    ask: (m, clock) => {
      const day = m[4] ? dayOf(m[4], clock) : { day: clock.today, label: "Today" };
      return day ? { ask: "slot", day: day.day, label: day.label, minutes: slotMinutes(m[1] ?? m[3]) } : null;
    },
  },
  {
    says: /^(?:what\s+did\s+i\s+(?:promise|say\s+i(?:'?d|\s+would)\s+do\s+for)|what\s+do\s+i\s+owe|what(?:'?s|\s+is)\s+(?:pending|open|left)\s+(?:with|for))\s+(.+)$/i,
    ask: (m) => ({ ask: "promised", name: (m[1] ?? "").trim() }),
  },
  {
    // "what's on tomorrow", "what do i have friday", "anything on the weekend", "how does tomorrow look"
    says: new RegExp(
      String.raw`^(?:what(?:'?s|\s+is)\s+(?:on|happening|planned|scheduled)|what\s+(?:do|have)\s+i\s+(?:got|have)(?:\s+on)?|anything\s+(?:on|planned)|show\s+me)\s*(?:for\s+|on\s+)?(${DAY_WORDS})?(?:\s+(?:look(?:ing)?\s+like|like))?$`,
      "i",
    ),
    ask: (m, clock) => {
      const day = dayOf(m[1] ?? "today", clock);
      return day ? { ask: "day", day: day.day, label: day.label } : null;
    },
  },
  {
    // "kal kya hai", "aaj kya kya karna hai", "kal ka plan kya hai" - after the
    // Hinglish has been turned round (shared/hinglish.ts) the day is English
    // and the "kya" is not: "kya tomorrow", "need to do kya kya today".
    says: new RegExp(String.raw`^(?:(?:plan|schedule)\s+)?(?:need\s+to\s+do\s+)?kya(?:\s+kya)?\s+(${DAY_WORDS}|day\s+after\s+tomorrow)$`, "i"),
    ask: (m, clock) => {
      const day = dayOf(m[1] ?? "today", clock);
      return day ? { ask: "day", day: day.day, label: day.label } : null;
    },
  },
  {
    says: new RegExp(String.raw`^(?:what(?:'?s|\s+is)\s+my\s+day(?:\s+like)?|how(?:'?s|\s+is|\s+does)\s+(${DAY_WORDS})\s+look(?:ing)?(?:\s+like)?)$`, "i"),
    ask: (m, clock) => {
      const day = dayOf(m[1] ?? "today", clock);
      return day ? { ask: "day", day: day.day, label: day.label } : null;
    },
  },
  {
    // "am i free at 5", "am i busy friday", "is 5 free tomorrow"
    says: /^(?:am\s+i|are\s+we|will\s+i\s+be)\s+(?:free|busy|available)\s*(.*)$|^is\s+(.+?)\s+free$/i,
    ask: (m, clock) => {
      const words = (m[1] ?? m[2] ?? "").trim();
      const when = words ? readWhen(words, clock) : { day: clock.today, time: null, minutes: null };
      if (!when) return null;
      const day = when.day ?? clock.today;
      const label = day === clock.today ? "Today" : day === shiftDay(clock.today, 1) ? "Tomorrow" : day;
      return { ask: "free", day, time: when.time, label };
    },
  },
  {
    // "rahul's number", "what's priya's email", "number for oakridge"
    says: /^(?:what(?:'?s|\s+is)\s+|get\s+(?:me\s+)?|give\s+me\s+)?(.+?)(?:'s|s'|’s)\s+(number|phone(?:\s+number)?|mobile|contact(?:\s+details)?|email(?:\s+address)?|e-?mail|mail\s+id)$/i,
    ask: (m) => ({ ask: "contact", name: (m[1] ?? "").trim(), want: wantOf(m[2] ?? "") }),
  },
  {
    says: /^(?:what(?:'?s|\s+is)\s+(?:the\s+)?)?(number|phone(?:\s+number)?|mobile|email(?:\s+address)?|contact(?:\s+details)?)\s+(?:of|for)\s+(.+)$/i,
    ask: (m) => ({ ask: "contact", name: (m[2] ?? "").trim(), want: wantOf(m[1] ?? "") }),
  },
  {
    // "how much did i spend this week", "how much have i spent on food this month", "spending this month"
    says: /^(?:how\s+much\s+(?:did|have|do)\s+(?:i|we)\s+(?:spen[dt]|pa(?:y|id))|total\s+spen(?:t|ding)|spending)(?:\s+(?:on|for)\s+(.+?))?(?:\s+(today|yesterday|this\s+week|last\s+week|past\s+week|this\s+month|last\s+month|past\s+month|this\s+year|so\s+far(?:\s+this\s+month)?))?(?:\s+so\s+far)?$/i,
    ask: (m, clock) => {
      const span = spanOf(m[2] ?? "this week", clock.today);
      return { ask: "spent", from: span.from, to: span.to, label: span.label, on: m[1]?.trim() || null };
    },
  },
  {
    // "what did i note about red rising", "what do i know about dbms"
    says: /^(?:what\s+(?:did|do|have)\s+i\s+(?:note|noted|write|written|save|saved|say|said|know|jot|jotted|keep|kept)(?:\s+down)?\s+(?:about|on)|what\s+do\s+i\s+know\s+about|what(?:'?s|\s+is)\s+in\s+my\s+notes\s+(?:on|about))\s+(.+)$/i,
    ask: (m) => ({ ask: "find", topic: (m[1] ?? "").trim() }),
  },
  {
    // "where did i park", "where is my passport", "where are the car keys", "where did i put the charger"
    says: /^where(?:'?s|\s+is|\s+are|\s+did\s+i\s+(put|keep|leave|hide|store|park)|\s+have\s+i\s+(?:put|kept|left))\s*(?:my\s+|the\s+|our\s+)?(.*)$/i,
    ask: (m) => {
      const thing = (m[2] ?? "").trim();
      if (!thing && /park/i.test(m[1] ?? "")) return { ask: "recall", about: "parked", label: "where you parked" };
      return thing ? { ask: "recall", about: thing, label: thing } : null;
    },
  },
  {
    // "what is our policy on refunds", "what's the rule about discounts", "what are our terms for late payment"
    says: /^what(?:'?s|\s+is|\s+are)\s+(?:our|my|the)\s+(?:policy|policies|rules?|terms?|stance|position)\s+(?:on|about|for|with|around)\s+(.+)$/i,
    ask: (m) => ({ ask: "recall", about: (m[1] ?? "").trim(), label: `the rule on ${(m[1] ?? "").trim()}` }),
  },
  {
    // "how do we handle late payers", "how do we bill retainers"
    says: /^how\s+do\s+(?:we|i)\s+(?:usually\s+|normally\s+)?(?:handle|deal\s+with|do|treat|bill|invoice|charge\s+for|price|quote)\s+(.+)$/i,
    ask: (m) => ({ ask: "recall", about: (m[1] ?? "").trim(), label: `how you handle ${(m[1] ?? "").trim()}` }),
  },
  {
    // "what's my blood group", "what is my shoe size" - not "what's my day like", read above.
    says: /^what(?:'?s|\s+is|\s+are)\s+(?:my|our)\s+(.+)$/i,
    ask: (m) => ({ ask: "recall", about: (m[1] ?? "").trim(), label: `your ${(m[1] ?? "").trim()}` }),
  },
  {
    // "what does arjun like", "what does mummy prefer", "what can't priya eat"
    says: /^what\s+(?:does|do|can'?t|doesn'?t|won'?t)\s+(.+?)\s+(like|love|prefer|eat|drink|hate|dislike)$/i,
    ask: (m) => ({ ask: "recall", about: `${(m[1] ?? "").trim()} ${m[2] === "eat" ? "eat" : (m[2] ?? "").replace(/e?$/, "es")}`, label: `what ${(m[1] ?? "").trim()} ${m[2]}s` }),
  },
  {
    // "who has my drill", "who did i lend the ladder to"
    says: /^who\s+(?:has|took|borrowed)\s+(?:my|the|our)\s+(.+)$|^who\s+did\s+i\s+lend\s+(?:my|the|our)\s+(.+?)\s+to$/i,
    ask: (m) => {
      const thing = (m[1] ?? m[2] ?? "").trim();
      return { ask: "recall", about: thing, label: `the ${thing}` };
    },
  },
  {
    // "what's dad's shirt size", "what is arjun's favourite food"
    says: /^what(?:'?s|\s+is|\s+are)\s+(.+?)(?:'s|s'|’s)\s+(.+)$/i,
    ask: (m) => ({ ask: "recall", about: `${(m[1] ?? "").trim()} ${(m[2] ?? "").trim()}`, label: `${(m[1] ?? "").trim()}'s ${(m[2] ?? "").trim()}` }),
  },
  {
    // "when's mummy's birthday", "when is the dentist", "when do i have the demo"
    says: /^when(?:'?s|\s+is|\s+was|\s+are|\s+do\s+i\s+have|\s+am\s+i\s+(?:meeting|seeing))\s+(?:my\s+|the\s+)?(.+)$/i,
    ask: (m) => ({ ask: "when", about: (m[1] ?? "").trim() }),
  },
  {
    // "did i go to gym this week", "have i meditated today", "did i call rahul
    // yesterday". Asked, not reported: "did 45 min guitar" has no "i", and is
    // a day reported, read the way it always was.
    says: /^(?:did|have)\s+i\s+(?:(?:go|been|gone|went)\s+(?:to\s+(?:the\s+)?|for\s+(?:a\s+|my\s+)?)?)?(.+?)(?:\s+(today|yesterday|this\s+week|last\s+week|past\s+week|this\s+month|last\s+month|past\s+month|this\s+year))?$/i,
    ask: (m, clock) => {
      const about = (m[1] ?? "").trim();
      if (!about) return null;
      const span = spanOf(m[2] ?? "today", clock.today);
      return { ask: "did", about, from: span.from, to: span.to, label: span.label };
    },
  },
  {
    says: /^(?:what(?:'?s|\s+is)\s+(?:due|overdue|pending|left|remaining|on\s+my\s+plate)|what\s+(?:do|should)\s+i\s+(?:have|need)\s+to\s+do|to-?\s?do(?:\s+list)?|my\s+tasks)(?:\s+today)?$/i,
    ask: (_m, clock) => ({ ask: "due", day: clock.today }),
  },
];

function wantOf(word: string): "phone" | "email" | "any" {
  if (/mail/i.test(word)) return "email";
  if (/number|phone|mobile/i.test(word)) return "phone";
  return "any";
}

/** The question the line asks, or null when it is not asking one. */
export function readQuestion(line: string, clock: Clock): Question | null {
  const said = expand(line)
    .trim()
    .replace(/\s*[?!.]+\s*$/, "")
    .replace(/^(?:hey|so|ok|okay|um+|hmm+)[,\s]+/i, "")
    .replace(/’/g, "'");
  if (!said || /^what\s+if\b/i.test(said)) return null;
  for (const rule of RULES) {
    const m = rule.says.exec(said);
    if (!m) continue;
    const asked = rule.ask(m, clock);
    if (asked) return asked;
  }
  return null;
}
