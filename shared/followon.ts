import { startsWithDoing } from "./capture";
import type { LastLine } from "./lines";

/**
 * A line that carries on from the one before, the way a message does:
 * "met rahul, he wants a demo" and then "send him the deck friday" - him is
 * Rahul. "buy milk" and then "also eggs" - eggs are bought too, the same day.
 * "call priya" and then "and email her the quote" - her is Priya.
 *
 * Only ever the line just before (shared/lines.ts, LastLine), and only a
 * word that cannot mean anything else without it. What it took from the last
 * line is said, so it is never a surprise where "him" went.
 */

type FollowOn = {
  /** The line with what it meant written in: "send Rahul the deck friday". */
  line: string;
  /** The day to use when the line says none: the day of the thing it carries on from. */
  day: string | null;
  /** Said under the line: what was taken from the last one. */
  note: string | null;
};

/** Said of a person only by the line before: object pronouns, so "he wants a demo" is left for the contact's history. */
const PRONOUN = /\b(him|her|them)\b/i;
/** Carrying on: "also eggs", "and email her the quote", "plus the charger". */
const ALSO = /^\s*(?:also|and|plus|oh\s+and|and\s+also|n)\s+(.+)$/i;
/**
 * Doings that carry over to something else said after "also": bought, sent,
 * called. Not "pitch" or "review", which as often name the thing as do it -
 * "Pitch deck" then "also the one-pager" is not pitching the one-pager.
 */
const CARRIED = /^(?:buy|get|grab|order|bring|pack|carry|call|email|mail|message|text|whatsapp|ping|pay|send|book|return|collect|pick|print|renew|cancel|invite|remind|wish|thank)$/i;
const SAME_TIME = /\s*\b(?:at\s+)?(?:the\s+)?same\s+time\b/i;
const SAME_DAY = /\s*\b(?:on\s+)?(?:the\s+)?same\s+day\b/i;

/**
 * The line as it means to be read, given the one before it. `named` is whether
 * the line already names a contact itself, in which case "her" is somebody in
 * it and nothing is taken.
 */
export function followOn(line: string, last: LastLine | null, named: boolean): FollowOn {
  if (!last) return { line, day: null, note: null };
  let said = line;
  let day: string | null = null;
  const notes: string[] = [];

  const also = ALSO.exec(said);
  if (also?.[1]) {
    const rest = also[1].trim();
    if (startsWithDoing(rest)) said = rest;
    else {
      // "also eggs" after "buy milk": the same doing, to something else.
      const verb = /^\s*(\S+)/.exec(last.title)?.[1] ?? "";
      said = CARRIED.test(verb) ? `${verb.toLowerCase()} ${rest}` : rest;
    }
    day = last.day;
    notes.push(`Same day as “${last.title}”.`);
  }

  if (last.day && SAME_DAY.test(said)) {
    said = said.replace(SAME_DAY, "");
    day = last.day;
    if (notes.length === 0) notes.push(`Same day as “${last.title}”.`);
  }
  if (last.time && SAME_TIME.test(said)) {
    said = said.replace(SAME_TIME, ` at ${last.time}`);
    day ??= last.day;
    notes.push(`At the time “${last.title}” is.`);
  }

  if (!named && last.contact) {
    // "he wants a demo", straight after a line about Rahul, is Rahul wanting one.
    const subject = /^\s*(he|she|they)\b/i.exec(said);
    if (subject?.[1]) {
      said = `${last.contact.name}${said.slice(subject.index + subject[0].length)}`;
      notes.push(`“${subject[1]}” is ${last.contact.name}, from your last line.`);
    }
    const pronoun = PRONOUN.exec(said);
    if (pronoun?.[1]) {
      said = `${said.slice(0, pronoun.index)}${last.contact.name}${said.slice(pronoun.index + pronoun[1].length)}`;
      notes.push(`“${pronoun[1]}” is ${last.contact.name}, from your last line.`);
    }
  }

  return { line: said.replace(/\s+/g, " ").trim(), day, note: notes.length > 0 ? notes.join(" ") : null };
}
