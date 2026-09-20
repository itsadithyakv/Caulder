/**
 * The line as a way round Caulder: go somewhere, log what was spent, add a
 * contact - said rather than clicked through.
 *
 * Matched, like everything else the line reads, and kept narrow on purpose. A
 * command is only ever something said outright, in a form a task never takes:
 *
 *  - **Going somewhere** names a place that exists. "Go to money" goes; "go to
 *    the gym today at 5" does not, because the gym is not a screen.
 *  - **Money** is said in the past. "Spent 500 on hosting" is logged; "pay 500
 *    for hosting tomorrow" is a thing still to do.
 *  - **A contact** is asked for by name: "add contact rahul nair from ms puc,
 *    98765 43210". "Add milk to the list" is not one.
 *
 * Nothing here does anything. It says what would be done, the line shows it,
 * and Enter does it - the same bargain as the rest of the line.
 */

import { readBook, type ShelfStatus } from "./books";

/** The screens, by the ids the app routes on (src/app/routes.ts). */
type Place = "today" | "day" | "leads" | "pipeline" | "money" | "import" | "brain" | "map" | "journal" | "life" | "settings";

export type Command =
  | { do: "go"; place: Place; label: string }
  /** Whole units of the workspace's currency; negative for money that came back. */
  | { do: "spend"; amount: number; what: string; daysAgo: number }
  | { do: "contact"; name: string; person: string | null; phone: string | null; email: string | null }
  /** "I want to read the percy jackson series": books, and the pile they go on (shared/books.ts). */
  | { do: "book"; status: ShelfStatus; titles: string[]; series: string | null };

const PLACES: readonly { place: Place; label: string; words: RegExp }[] = [
  { place: "today", label: "Today", words: /^(?:today|home|dashboard|start)$/ },
  { place: "day", label: "Calendar", words: /^(?:calendar|day|days|week|schedule|planner|timetable|time\s?table|plan)$/ },
  { place: "leads", label: "Contacts", words: /^(?:contacts?|leads?|clients?|customers?)$/ },
  { place: "pipeline", label: "Pipeline", words: /^(?:pipeline|board|deals?|sales|kanban)$/ },
  { place: "money", label: "Money", words: /^(?:money|finances?|invoices?|quotes?|costs?|expenses?|spend|spending|payments?|billing|runway)$/ },
  { place: "import", label: "Import", words: /^(?:import|imports|importer)$/ },
  { place: "brain", label: "Brain", words: /^(?:brain|pages?|notes|knowledge|wiki|memories|memory|docs?|documents?)$/ },
  { place: "map", label: "Map", words: /^(?:map|graph|connections|links|network|mind\s?map)$/ },
  { place: "journal", label: "Journal", words: /^(?:journal|diary)$/ },
  { place: "life", label: "Life", words: /^(?:life|habits?|hobbies|hobby|goals?|studies|study|courses?|me)$/ },
  { place: "settings", label: "Settings", words: /^(?:settings?|preferences|prefs|options|config|configuration|setup)$/ },
];

const GO = /^\s*(?:(?:please|pls|can\s+you|could\s+you)\s+)?(?:go\s*to|goto|open(?:\s+up)?|show(?:\s+me)?|take\s+me\s+to|switch\s+to|jump\s+to|view|navigate\s+to)\s+(?:the\s+|my\s+|our\s+)?(.+?)(?:\s+(?:screen|page|tab|section|view))?\s*[.!]?\s*$/i;

const SYMBOL = String.raw`(?:rs\.?|inr|usd|eur|gbp|aed|sgd|₹|\$|€|£)`;
const AMOUNT = String.raw`(?:${SYMBOL}\s*)?(\d[\d,]*(?:\.\d+)?)\s*(k|lakhs?|lacs?|l|crores?|cr|m|mn|million)?(?:\s*${SYMBOL})?`;
/** "Spent 500 on hosting", "paid rs 1,200 for the domain", "bought 2k of ads" - said of oneself, in the past. */
const SPENT = new RegExp(
  String.raw`^\s*(?:(?:i|we)\s+)?(?:just\s+)?(?:spent|paid|bought|shelled\s+out|expensed?|logg?ed?\s+(?:an?\s+)?expense(?:\s+of)?|expense\s*[:-]?)\s+${AMOUNT}\s*(?:on|for|to|towards|of|in|-|:)?\s*(.*?)\s*$`,
  "i",
);
/**
 * "Hosting cost 500", "the domain came to 1,200": the thing first, and what it
 * came to. Not "was" - "my score was 85" is not money, and a sum logged that
 * nobody spent is worse than one that has to be typed the other way round.
 */
const COST = new RegExp(String.raw`^\s*(?:the\s+)?(.+?)\s+(?:cost(?:s|ed)?(?:\s+(?:me|us))?|came\s+to|set\s+(?:me|us)\s+back)\s+${AMOUNT}\s*$`, "i");
const REFUND = new RegExp(
  String.raw`^\s*(?:(?:i|we)\s+)?(?:got\s+)?(?:an?\s+)?refund(?:ed)?\s+(?:of\s+)?${AMOUNT}\s*(?:from|for|on|by|-|:)?\s*(.*?)\s*$`,
  "i",
);

const CONTACT = /^\s*(?:please\s+)?(?:add|new|create|save|make)\s+(?:an?\s+)?(?:new\s+)?(?:contact|lead|client|customer)\s*(?:called|named|for|[:-])?\s+(.+?)\s*$/i;
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/;
/** Seven digits or more, however they are grouped - and never a year or a price, which are shorter. */
const PHONE = /(?:\+|\b)\d[\d\s().-]{6,}\d\b/;

const MULTIPLIER: Record<string, number> = {
  k: 1e3, l: 1e5, lakh: 1e5, lakhs: 1e5, lac: 1e5, lacs: 1e5, cr: 1e7, crore: 1e7, crores: 1e7, m: 1e6, mn: 1e6, million: 1e6,
};

function amountOf(digits: string | undefined, scale: string | undefined): number {
  const value = Number((digits ?? "").replace(/,/g, "")) * (MULTIPLIER[(scale ?? "").toLowerCase()] ?? 1);
  return Math.round(value);
}

/** "Yesterday" is the one day worth hearing: what was spent is nearly always logged the day it was, or the day after. */
function whenSpent(what: string): { what: string; daysAgo: number } {
  const match = /\s*\b(yesterday|yday|ystd|today|just\s+now)\b\s*$/i.exec(what);
  if (!match) return { what, daysAgo: 0 };
  return { what: what.slice(0, match.index).trim(), daysAgo: /^y/i.test(match[1] ?? "") ? 1 : 0 };
}

const SMALL_IN_A_NAME = new Set(["of", "and", "the", "for", "de", "la", "van", "von", "bin", "al", "el", "st", "&"]);

/** "rahul nair" is Rahul Nair; "ms puc" is MS PUC - three letters or fewer in a company is nearly always initials. */
function named(text: string, company: boolean): string {
  return text
    .trim()
    .split(/\s+/)
    .map((word, index) => {
      if (word !== word.toLowerCase()) return word;
      if (index > 0 && SMALL_IN_A_NAME.has(word)) return word;
      if (company && word.length <= 3 && /^[a-z]+$/.test(word)) return word.toUpperCase();
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}

function readContact(rest: string): Command | null {
  const email = EMAIL.exec(rest)?.[0] ?? null;
  let left = email ? rest.replace(email, " ") : rest;
  const phone = PHONE.exec(left)?.[0] ?? null;
  if (phone) left = left.replace(phone, " ");
  // What is left is who: "rahul nair from ms puc", "rahul nair, ms puc", or just a name.
  const parts = left
    .split(/\s*,\s*|\s+(?:from|at|of|@)\s+|\s+-\s+/i)
    .map((part) => part.replace(/\b(?:phone|mobile|mob|ph|email|mail|number|no)\b\s*[:.]?/gi, " ").replace(/[,;:()]+/g, " ").trim())
    .filter((part) => /\p{L}/u.test(part));
  const [first, second] = parts;
  if (!first) return null;
  return {
    do: "contact",
    // A contact is kept under the company it is at, with the person named on it.
    name: named(second ?? first, second !== undefined),
    person: second ? named(first, false) : null,
    phone: phone ? phone.replace(/\s+/g, " ").trim() : null,
    email: email ? email.toLowerCase() : null,
  };
}

/** What the line asks Caulder to do, or null when it is not asking. */
export function readCommand(line: string): Command | null {
  const go = GO.exec(line);
  if (go) {
    const where = (go[1] ?? "").trim().toLowerCase();
    const found = PLACES.find(({ words }) => words.test(where));
    // Only a place that exists: "open a bank account" is something to do.
    return found ? { do: "go", place: found.place, label: found.label } : null;
  }

  const contact = CONTACT.exec(line);
  if (contact) return readContact(contact[1] ?? "");

  const book = readBook(line);
  if (book) return { do: "book", ...book };

  const refund = REFUND.exec(line);
  if (refund) {
    const amount = amountOf(refund[1], refund[2]);
    const { what, daysAgo } = whenSpent(refund[3] ?? "");
    return amount > 0 ? { do: "spend", amount: -amount, what: what ? `Refund: ${what}` : "Refund", daysAgo } : null;
  }

  const spent = SPENT.exec(line);
  if (spent) {
    const amount = amountOf(spent[1], spent[2]);
    const { what, daysAgo } = whenSpent(spent[3] ?? "");
    // Without what it was for it cannot be logged, and the line asks rather than guessing.
    return amount > 0 && what ? { do: "spend", amount, what: what.charAt(0).toUpperCase() + what.slice(1), daysAgo } : null;
  }

  const cost = COST.exec(line);
  if (cost) {
    const amount = amountOf(cost[2], cost[3]);
    const { what, daysAgo } = whenSpent(cost[1] ?? "");
    // "The exam was 3 hours" is not money: a thing that cost something says a sum, not a small number of something.
    return amount >= 10 && what && !/\b(?:hours?|hrs?|mins?|minutes?|days?|weeks?|marks?|pages?|%)\b/i.test(line)
      ? { do: "spend", amount, what: what.charAt(0).toUpperCase() + what.slice(1), daysAgo }
      : null;
  }
  return null;
}
