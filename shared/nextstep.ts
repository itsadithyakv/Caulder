import { parseQuick } from "./quickadd";
import { shiftDay } from "./dates";
import { REPLY_WAIT_DAYS } from "./reached";

/**
 * What a line about somebody leaves to be done (PLAN.md, part nine).
 *
 * "Sumanth asked me to reach out to him next week. I messaged him on
 * LinkedIn." is two things that happened and one thing owed: he is to be
 * written to next week. Nothing in it says "remind me" or "I need to" - the
 * thing to do is inside what he said. A line like that used to go on his
 * history and leave nothing on any day, which is how a thing somebody asked
 * for is forgotten.
 *
 * Three ways a line about somebody owes a next step, and no more:
 *
 *  - **They asked.** "asked me to call back after the 20th", "wants me to
 *    send the deck", "said to try again in a few weeks". The task is the
 *    thing they asked for, on the day they said.
 *  - **I promised.** "told her I'd send the quote by friday", "said I would
 *    get back to him". The same, and it was me who said it.
 *  - **They promised.** "she'll get back to me in a few days", "said he
 *    would confirm by monday", "will decide next month". Their move, not
 *    mine - so the task is to check in with them on that day, in case they
 *    have not.
 *
 * A when that is loose ("next week", "in a few days", "mid november") is
 * still a day (shared/quickadd.ts), and the line says which day before
 * anything is kept. With no when at all, what was asked or promised is for
 * tomorrow, and what is waited for is looked at again in three days.
 *
 * Careful, like the rest of the line: only these forms, and never from a
 * fact that merely has a date in it - "Harbour pay on the 5th" owes nothing.
 */

export type NextStep = {
  title: string;
  /** `YYYY-MM-DD`. */
  day: string;
  time: string | null;
  /** Whether the line said when. If not, the day is the usual one and can be said to change it. */
  daySaid: boolean;
  /** Whose move it was: theirs to be done by me, mine by my own word, or theirs to wait for. */
  why: "asked" | "promised" | "awaited";
};

type Clock = { today: string; now: number };

/** What can be asked for or promised, as it would start a task. Longest first where one begins another. */
const VERB = String.raw`follow\s*-?\s*up|check\s+(?:in|back)|reach\s+out|get\s+back|circle\s+back|touch\s+base|call\s+back|call|ring|phone|email|mail|message|text|whatsapp|ping|write|meet|send|share|reply|respond|revert|schedule|set\s+up|book|thank|invite|visit|pitch|demo|quote|invoice|try\s+again|try|come\s+back|connect|update|remind|confirm|review|prepare|draft|fix|deliver|pay|sign`;

/** "asked me to …", "wants me to …", "said to …", "told me I should …": their request. */
const ASKED = new RegExp(
  // "Wants me to send" asks it of me; "wants to send" is what they will do, and is waited for below.
  String.raw`\b(?:(?:asked|told|said|requested)\s+(?:(?:me|us)\s+)?|(?:wants|wanted|needs|needed|expects|expected|would\s+like|'d\s+like)\s+(?:me|us)\s+)(?:to|that\s+i\s+should|i\s+should)\s+(${VERB})\b([^.;!?\n]*)`,
  "i",
);
/** "told her I'd …", "said I would …", "promised to …", "I promised him I'll …": my own word. */
const I_PROMISED = new RegExp(
  String.raw`\b(?:(?:i|we)\s+)?(?:told|promised|assured)\s+(?:(?:him|her|them|[\p{L}]+)\s+)?(?:that\s+)?(?:i|we)(?:'d|'ll|\s+would|\s+will)\s+(${VERB})\b([^.;!?\n]*)|\b(?:i|we)\s+(?:said|promised)\s+(?:(?:to\s+)?(?:him|her|them)\s+)?(?:that\s+)?(?:(?:i|we)(?:'d|'ll|\s+would|\s+will)|to)\s+(${VERB})\b([^.;!?\n]*)`,
  "iu",
);
/** "wants the invoice by the 5th", "asked for a call mid november", "needs the copy before friday": a thing they want. */
const WANTED = /\b(?:wants|wanted|needs|needed|asked\s+for|requested|is\s+expecting|expects|would\s+like|'d\s+like)\s+(?:an?\s+|the\s+|my\s+|our\s+|some\s+)?((?!(?:me|us|to)\b)[^.;!?\n]{3,80})/i;

/** What somebody else says they will do, that is then waited for. */
const THEIR_MOVE = String.raw`get\s+back|come\s+back|revert|reply|respond|confirm|decide|let\s+(?:me|us)\s+know|send|share|call(?:\s+back)?|ring|pay|sign|think\s+(?:about\s+it|it\s+over)|check|review|look\s+(?:at|into|over)|discuss|talk\s+to|speak\s+to|ask|update`;
/** "she'll get back to me", "said he would confirm", "will decide next month", "is going to send it". Never "I'll". */
const THEY_PROMISED = new RegExp(
  String.raw`(?<![\p{L}])(?!(?:i|we)(?:'ll|\s))(?:(?:he|she|they|[\p{L}]{2,})(?:'ll|\s+will|\s+would|\s+is\s+going\s+to|\s+are\s+going\s+to|\s+promised\s+to|\s+agreed\s+to|\s+needs?\s+to|\s+has\s+to|\s+have\s+to))\s+(?:then\s+|probably\s+|also\s+)?(${THEIR_MOVE})\b([^.;!?\n]*)`,
  "iu",
);

const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** The words for a task from a verb and what followed it, with "him" and "her" made the person. */
function words(verb: string, tail: string, who: string): string {
  const said = verb.toLowerCase().replace(/\s*-\s*|\s+/g, " ").trim();
  const rest = tail
    .replace(/\s+(?:to|with)\s+(?:him|her|them)\b/i, "")
    .replace(/\b(?:him|her|them)\b/i, who)
    .replace(/\s+/g, " ")
    .trim();
  const named = rest.toLowerCase().includes(who.toLowerCase());
  if (named) return `${said} ${rest}`;
  // "Follow up with", "check in with", "reach out to", "get back to": the word each takes before a person.
  if (/^(?:follow up|check in|check back|touch base|connect)$/.test(said)) return `${said} with ${who}${rest ? ` ${rest}` : ""}`;
  if (/^(?:reach out|get back|circle back|come back|write|reply|respond|revert)$/.test(said)) return `${said} to ${who}${rest ? ` ${rest}` : ""}`;
  if (/^(?:call back)$/.test(said)) return `call ${who} back${rest ? ` ${rest}` : ""}`;
  if (/^(?:try again|try)$/.test(said)) return `try ${who} again${rest ? ` ${rest.replace(/^again\s*/i, "")}` : ""}`;
  // "Send the deck", "share the pricing", "schedule a demo": the thing first, and who it is for after.
  if (/^(?:send|share|schedule|set up|book|quote|prepare|draft|fix|deliver|review|confirm|update|pay|sign)$/.test(said) && rest && !/^(?:on|by|in|next|this|tomorrow|after|before|early|mid|late)\b/i.test(rest)) {
    // The when is said last, and is put back there: "send the quote to Jonas sometime in november".
    const [thing = rest, when = ""] = rest.split(/\s+(?=(?:by|on|before|after|next|this|tomorrow|in\s+(?:a|\d)|sometime|early|mid|late|end\s+of)\b)/i, 2);
    const to = /^(?:send|share|deliver|pay)$/.test(said) ? "to" : /^(?:schedule|set up|book)$/.test(said) ? "with" : "for";
    return `${said} ${thing} ${to} ${who}${when ? ` ${rest.slice(thing.length).trim()}` : ""}`;
  }
  return `${said} ${who}${rest ? ` ${rest}` : ""}`;
}

/**
 * The next step a line about `who` leaves, or null when it leaves none.
 * `who` is how the person is spoken of - "Sumanth", "the principal at RV PUC".
 */
export function nextStepIn(said: string, who: string, clock: Clock): NextStep | null {
  const line = said.replace(/\s+/g, " ").trim();
  const step = (wording: string, why: NextStep["why"], waitDays: number): NextStep => {
    const reading = parseQuick(wording, clock);
    const title = reading.task.title || capital(wording);
    // A day gone by is when something happened, not when anything is due.
    const day = reading.task.day !== null && reading.task.day >= clock.today ? reading.task.day : null;
    return { title, day: day ?? shiftDay(clock.today, waitDays), time: day ? reading.task.time : null, daySaid: day !== null, why };
  };

  const mine = I_PROMISED.exec(line);
  if (mine) return step(words(mine[1] ?? mine[3] ?? "", mine[2] ?? mine[4] ?? "", who), "promised", 1);

  const asked = ASKED.exec(line);
  if (asked) return step(words(asked[1] ?? "", asked[2] ?? "", who), "asked", 1);

  // "Wants the invoice by the 5th", "asked for a call mid november": a thing, and a day for it.
  // Only with a day said - "wants a bigger logo" is what she wants, not something owed on a day.
  const wanted = WANTED.exec(line);
  if (wanted) {
    const thing = (wanted[1] ?? "").trim();
    const what = /^(?:call|callback|call\s+back|ring)\b/i.test(thing)
      ? `call ${who} ${thing.replace(/^(?:call\s+back|callback|call|ring)\s*/i, "")}`
      : /^(?:meeting|demo|catch[\s-]?up|chat|walkthrough|session|review)\b/i.test(thing)
        ? thing.replace(/^([\p{L}-]+(?:\s+up)?)/iu, `$1 with ${who}`)
        : thing.replace(/^((?:[\p{L}\p{N}'-]+\s+){0,4}?[\p{L}\p{N}'-]+?)(?=\s+(?:by|on|before|after|next|this|tomorrow|in|sometime|early|mid|late|end)\b|$)/iu, `$1 for ${who}`);
    const owed = step(what, "asked", 1);
    if (owed.daySaid) return owed;
  }

  // My own next move, said straight after what happened: "no answer, try again thursday",
  // "call her back on monday" (PLAN.md, part twelve, phase 49).
  const again = /\b(try(?:\s+(?:him|her|them))?(?:\s+again)?|call\s+(?:him\s+|her\s+|them\s+)?back|ring\s+(?:him\s+|her\s+|them\s+)?back)\b([^.;!?\n]*)/i.exec(line);
  if (again && /\b(?:again|back)\b/i.test(again[1] ?? "")) {
    const verb = /^try/i.test(again[1] ?? "") ? "try again" : "call back";
    const rest = (again[2] ?? "").trim();
    const next = step(words(verb, rest, who), "promised", 1);
    // "Try again monday", said on a Monday after a call that went nowhere, is next Monday.
    if (next.day === clock.today && /\b(?:mon|tue|wed|thu|fri|sat|sun)/i.test(rest)) return { ...next, day: shiftDay(next.day, 7) };
    return next;
  }

  const theirs = THEY_PROMISED.exec(line);
  if (theirs) {
    // When they said they would is in what follows; the task is only ever to look again.
    const when = parseQuick(`check in ${theirs[2] ?? ""}`, clock).task;
    const day = when.day !== null && when.day >= clock.today ? when.day : null;
    return {
      title: `Check in with ${who}`,
      day: day ?? shiftDay(clock.today, REPLY_WAIT_DAYS),
      time: null,
      daySaid: day !== null,
      why: "awaited",
    };
  }
  return null;
}

/* ---- What kind of thing happened ------------------------------------------ */

/** How a line about a contact goes on their history. */
export type Logged = "call" | "meeting" | "whatsapp" | "linkedin" | "instagram" | "replied" | "note";

const CALLED = /\b(called|rang|spoke|talked|phoned|no answer|voicemail)\b/i;
const MET = /\b(met|meeting|visited)\b/i;
/** I wrote to them: "messaged him", "dm'd her", "sent her a message", "pinged them". */
const I_WROTE = /(?<![\p{L}])(?:(?:i|we)\s+)?(?:messaged|dm'?d|dmed|pinged|texted|whatsapped|inmailed|wrote\s+to|reached\s+out\s+to|sent\s+(?:(?:him|her|them)\s+)?(?:an?\s+)?(?:message|dm|text|note|inmail|connection\s+request)|connected\s+with)\b/iu;
/** They wrote to me. */
const THEY_WROTE = /\b(?:replied|responded|answered|reverted|wrote\s+back|got\s+back\s+to\s+(?:me|us)|came\s+back\s+to\s+(?:me|us)|messaged\s+(?:me|us)|texted\s+(?:me|us)|pinged\s+(?:me|us)|dm'?d\s+(?:me|us))\b/i;

/**
 * The kind of history entry a line is. A call and a meeting as before; and
 * now a message said to have been sent - on the place it names - and their
 * having written back, which is what "who has not answered" reads
 * (shared/reached.ts). "Messaged him" with no place named is a note: Caulder
 * cannot tell where.
 */
export function loggedAs(said: string): Logged {
  if (CALLED.test(said)) return "call";
  if (MET.test(said)) return "meeting";
  if (THEY_WROTE.test(said)) return "replied";
  if (I_WROTE.test(said) || /^\s*(?:whatsapped|inmailed)\b/i.test(said)) {
    if (/\blinked\s?in\b|\binmail/i.test(said)) return "linkedin";
    if (/\binsta(?:gram)?\b/i.test(said)) return "instagram";
    if (/\bwhats\s?app|\bwa\b|\btexted\b/i.test(said)) return "whatsapp";
  }
  return "note";
}

/** "as a call", "as a LinkedIn message", "as their answer": how the reading says it before it is kept. */
export const LOGGED_SAID: Record<Logged, string> = {
  call: "as a call",
  meeting: "as a meeting",
  whatsapp: "as a WhatsApp message",
  linkedin: "as a LinkedIn message",
  instagram: "as an Instagram message",
  replied: "as their answer",
  note: "",
};
