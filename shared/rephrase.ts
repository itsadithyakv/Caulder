/**
 * What a line means, said the plain way, before anything reads it.
 *
 * Some lines are already clear to a person and only need turning round for
 * the reader: "rahul owes me 500" is "get 500 back from rahul", "kal subah
 * gym jaana hai" is "tomorrow morning, need to go to gym". Doing it here, the
 * way short forms are written out, means the task line and the smart line
 * both read the plain version, and the title that is kept is the plain one.
 *
 * Hinglish is its own reader (shared/hinglish.ts): it turns the whole line
 * round into English, so it goes first.
 *
 * Careful by design, like the short forms: each rule fires only on a shape
 * that means one thing, and a line that does not match is left exactly as it
 * was typed.
 */

import { hinglish } from "./hinglish";

/**
 * Said to nobody, around the line: "bro remind me tmrw to pay rent fr", "bhai
 * kal presentation hai yaar". Only at the ends, and never where it is who the
 * line is about - "call bro", "bhai ko call karna", "meet yaar at 5".
 */
const LEADING =
  /^\s*(?:(?:bro|bruh|dude|yo|okay\s+so|ok\s+so|so\s+basically|basically|honestly|ngl|tbh|lowkey|deadass|istg|bhai|yaar|arre|arey|are\s+yaar|acha|accha|achha|haan|oye|suno)(?!\s+(?:ko|se|ka|ki|ke|ne|ne)\b)[,\s]+)+/i;
const TRAILING =
  /(?<!\b(?:call|text|message|ping|meet|tell|ask|with|to|for|and|my|remind|pay|email|mail|see|visit|help|thank|invite|at|from|ko|se)\s*)(?:[,\s]+(?:bro|bruh|dude|fr|frfr|fr\s+fr|lol|lmao|haha+|pls|plz|please|asap\s+pls|yaar|bhai|na))+\s*([.!?]*)\s*$/i;

/**
 * "forgot to pay rent" is still to be done - unless the line is about the day
 * it was forgotten ("forgot to call mom yesterday, felt bad").
 */
const FORGOT = /\b(?:i\s+)?(?:totally\s+|completely\s+|kinda\s+)?forgot\s+to\b/i;
const ABOUT_THEN = /\b(?:yesterday|last\s+\w+|felt|feel|so\s+i|but|and\s+then|again)\b/i;

const MONEY = String.raw`((?:rs\.?|₹|inr)\s*)?(\d[\d,]*(?:\.\d+)?\s*k?)`;

/** Money lent and owed: a thing to do, in the words it would be done in. */
const OWED: [RegExp, (m: RegExpExecArray) => string][] = [
  [new RegExp(String.raw`^\s*(?:i\s+)?lent\s+([\p{L}]+)\s+${MONEY}(?!\S)`, "iu"), (m) => `get ${m[3]} back from ${m[1]}`],
  [new RegExp(String.raw`^\s*([\p{L}]+)\s+owes\s+me\s+${MONEY}(?!\S)`, "iu"), (m) => `get ${m[3]} back from ${m[1]}`],
  // Owed to the company: a payment to chase, not a loan to get back.
  [new RegExp(String.raw`^\s*((?:the\s+)?[\p{L}]+(?:\s+[\p{L}]+)?)\s+owes\s+us\s+${MONEY}(?!\S)`, "iu"), (m) => `chase ${m[1]} for ${m[3]}`],
  [new RegExp(String.raw`^\s*i\s+owe\s+([\p{L}]+)\s+${MONEY}(?!\S)`, "iu"), (m) => `pay ${m[1]} back ${m[3]}`],
  [new RegExp(String.raw`^\s*([\p{L}]+)\s+borrowed\s+${MONEY}(?!\S)`, "iu"), (m) => `get ${m[3]} back from ${m[1]}`],
];

/** Words for a day of the month that the when-reader already knows another way to say. */
const MONTHLY: [RegExp, string][] = [
  [/\b(?:the\s+)?(?:first|1st)\s+of\s+(?:every|each)\s+month\b/gi, "on the 1st every month"],
  [/\b(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)\s+of\s+(?:every|each)\s+month\b/gi, "on the $1th every month"],
  [/\bevery\s+2nd\b/gi, "every second"],
];

export function rephrase(text: string): string {
  let line = text.replace(LEADING, "").replace(TRAILING, "$1");
  line = hinglish(line);
  if (FORGOT.test(line) && !ABOUT_THEN.test(line)) line = line.replace(FORGOT, "need to");
  for (const [pattern, say] of OWED) {
    const m = pattern.exec(line);
    if (m) {
      line = `${say(m).replace(/\s+/g, " ").trim()}${line.slice(m.index + m[0].length)}`;
      break;
    }
  }
  for (const [pattern, said] of MONTHLY) line = line.replace(pattern, said);
  return line.replace(/\bon the (\d{1,2})th\b/g, (whole, day: string) => `on the ${day}${suffix(Number(day))}`);
}

function suffix(day: number): string {
  if (day % 100 >= 11 && day % 100 <= 13) return "th";
  return ["th", "st", "nd", "rd"][day % 10] ?? "th";
}
