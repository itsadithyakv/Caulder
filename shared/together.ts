import { startsWithDoing } from "./capture";
import { expand } from "./slang";

/**
 * One line, several things - said the way a list is said in a message.
 *
 *  - **Two doings**: "call rahul and email priya tomorrow" is two tasks, and
 *    the when said once is for both.
 *  - **A list of doings**: "gym, laundry, finish the deck" - three.
 *  - **A list of things to get**: "buy milk, eggs and bread" is one errand,
 *    kept with the list in its note, because it is done in one trip.
 *
 * Careful by design. Only a part that starts with something done is its own
 * task, so "call rahul and priya", "salt and pepper", "research and
 * development" and "rahul and priya's wedding" stay whole. A line that is
 * not a list is left alone and read the way it always was.
 */

type Together =
  | { split: string[]; list: null }
  | { split: null; list: { items: string[] } };

/** Said once in front, for every part: "remind me to call rahul and email priya". */
const LEAD = /^(?:(?:please\s+)?remind\s+me\s+to|i\s+need\s+to|need\s+to|i\s+have\s+to|have\s+to|got\s+to|i\s+got\s+to|i\s+must|must)\s+/i;
/** Where one doing ends and the next starts. */
const JOIN = /\s*(?:,\s*and\s+then|,\s*then|\s+and\s+then|,\s*and|;|,|\s+and|\s+&|\s+then)\s+/i;
/** Getting things, where a list is what to get rather than several tasks. */
const ERRAND = /^(?:buy|get|grab|pick\s+up|order|bring|pack|carry|shop\s+for|restock)\s+(.+)$/i;
/** A when said at the very end, which belongs to every part. */
const WHEN_AT_END =
  /\s+((?:(?:today|tonight|tomorrow|tmrw|tmr|this\s+week|next\s+week|this\s+weekend|(?:this\s+|next\s+)?(?:mon|tues|wednes|thurs|fri|satur|sun)day|by\s+\S+|before\s+\S+|on\s+the\s+\d{1,2}(?:st|nd|rd|th))\s*)+(?:(?:at|by)\s+\d{1,2}(?:[:.]\d{2})?\s*(?:am|pm)?)?)$/i;

/** What is done in the middle of something else, not after it. */
const DURING = /^(?:ask|tell|discuss|mention|confirm|check\s+(?:if|whether|about)|remind|say|explain|show|let\s+(?:him|her|them)\s+know)\b/i;
/** A part that points back at the one before. */
const BACK = /\b(?:him|her|them|it|that|this)\b/i;
/** A part that says its own when, and keeps it. */
const OWN_WHEN = /\b(?:today|tonight|tomorrow|tmrw|tmr|(?:mon|tues|wednes|thurs|fri|satur|sun)day|week|weekend|at\s+\d|\d\s*(?:am|pm))\b/i;

export function together(line: string): Together | null {
  const said = expand(line).trim().replace(/[.!]+$/, "");
  if (said.length < 7 || !/(?:,|;|\band\b|&|\bthen\b)/i.test(said)) return null;

  const lead = LEAD.exec(said)?.[0] ?? "";
  const rest = said.slice(lead.length);

  const errand = ERRAND.exec(rest);
  if (errand?.[1] && /,/.test(errand[1])) {
    const items = errand[1]
      .split(/\s*,\s*(?:and\s+)?|\s+and\s+|\s*&\s*/i)
      .map((item) => item.trim())
      .filter(Boolean);
    // Each is a thing, not another doing: "buy milk, eggs, then call mum" is not a shopping list.
    if (items.length >= 2 && items.every((item) => item.split(/\s+/).length <= 4 && !startsWithDoing(item))) {
      return { split: null, list: { items } };
    }
  }

  const when = WHEN_AT_END.exec(rest);
  const body = when ? rest.slice(0, when.index) : rest;
  const parts = body
    .split(JOIN)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length < 2) return null;
  // Every part a doing of its own, of two words or more - or, said as a list of three and up, short chores.
  const doings = parts.every((part) => startsWithDoing(part) && part.split(/\s+/).length >= 2);
  const chores = parts.length >= 3 && /,/.test(body) && parts.every((part) => part.split(/\s+/).length <= 4) && parts.some(startsWithDoing);
  if (!doings && !chores) return null;
  // Done during the first, or about it: "call rahul and ask him about pricing" is one call.
  if (parts.slice(1).some((part) => DURING.test(part) || BACK.test(part))) return null;
  const tail = when?.[1] ? ` ${when[1].trim()}` : "";
  return { split: parts.map((part) => `${lead}${part}${OWN_WHEN.test(part) ? "" : tail}`), list: null };
}
