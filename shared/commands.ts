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
import type { NewPerson } from "./newperson";

/** The screens, by the ids the app routes on (src/app/routes.ts). */
type Place = "today" | "day" | "leads" | "pipeline" | "money" | "import" | "brain" | "map" | "journal" | "life" | "memories" | "settings";

export type Command =
  | { do: "go"; place: Place; label: string }
  /** Whole units of the workspace's currency; negative for money that came back. */
  | { do: "spend"; amount: number; what: string; daysAgo: number }
  | {
      do: "contact";
      name: string;
      person: string | null;
      phone: string | null;
      email: string | null;
      /**
       * Said of somebody new rather than asked for (shared/newperson.ts): what
       * they are there, where they came from, what happened - for their
       * history - and what to do about them, as their task.
       */
      role?: string | null;
      source?: string | null;
      happened?: string | null;
      then?: NewPerson["then"];
    }
  /** "I want to read the percy jackson series": books, and the pile they go on (shared/books.ts). */
  | { do: "book"; status: ShelfStatus; titles: string[]; series: string | null }
  /** "Netflix 649 monthly": something paid again and again, kept as a running cost in the brain's Money. */
  | { do: "cost"; title: string; amount: number; cycle: "monthly" | "quarterly" | "yearly"; day: number | null };

const PLACES: readonly { place: Place; label: string; words: RegExp }[] = [
  { place: "today", label: "Today", words: /^(?:today|home|dashboard|start)$/ },
  { place: "day", label: "Calendar", words: /^(?:calendar|day|days|week|schedule|planner|timetable|time\s?table|plan)$/ },
  { place: "leads", label: "Contacts", words: /^(?:contacts?|leads?|clients?|customers?)$/ },
  { place: "pipeline", label: "Pipeline", words: /^(?:pipeline|board|deals?|sales|kanban)$/ },
  { place: "money", label: "Money", words: /^(?:money|finances?|invoices?|quotes?|costs?|expenses?|spend|spending|payments?|billing|runway)$/ },
  { place: "import", label: "Import", words: /^(?:import|imports|importer)$/ },
  { place: "brain", label: "Brain", words: /^(?:brain|pages?|notes|knowledge|wiki|handbook|docs?|documents?)$/ },
  { place: "memories", label: "Memories", words: /^(?:memories|memory|remembered|what\s+i\s+remember(?:ed)?)$/ },
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
/** The days a spend is said on, at the end of the line: "yesterday", "last night", "this morning". */
const SPENT_WHEN = String.raw`yesterday|yday|ystd|last\s+night|today|tonight|just\s+now|earlier(?:\s+today)?|this\s+(?:morning|afternoon|evening)`;

/**
 * "Uber 340", "coffee 150", "lunch 250": what it was, then what it cost, and
 * nothing else. Only for the things people actually buy this way - "room 101"
 * and "chapter 4" are not money, so an unknown word before a number is not
 * read as spending.
 */
const SPENT_ON = new RegExp(
  String.raw`^\s*(uber|ola|rapido|auto|cab|taxi|metro|bus|train\s+ticket|flight|petrol|fuel|diesel|parking|toll|coffee|chai|tea|lunch|dinner|breakfast|snacks?|groceries|grocery|swiggy|zomato|blinkit|zepto|instamart|food|drinks|beer|movie|movies|movie\s+tickets?|netflix|spotify|recharge|haircut|laundry|gym|medicines?|pharmacy|books?|stationery|amazon|flipkart|rent|electricity|wifi|internet)\s+(?:rs\.?|inr|₹)?\s*(\d[\d,]*(?:\.\d+)?)\s*(k)?(?:\s+(${SPENT_WHEN}))?\s*$`,
  "i",
);

const REFUND = new RegExp(
  String.raw`^\s*(?:(?:i|we)\s+)?(?:got\s+)?(?:an?\s+)?refund(?:ed)?\s+(?:of\s+)?${AMOUNT}\s*(?:from|for|on|by|-|:)?\s*(.*?)\s*$`,
  "i",
);

/**
 * Money that came in: "got salary 50k", "received 5000 from rahul", "stipend
 * credited 12000". Kept in Money as money in, the way a refund is.
 */
const INCOME = new RegExp(
  String.raw`^\s*(?:(?:i|we)\s+)?(?:just\s+)?(?:got|received|recieved|earned|made|collected)\s+(?:my\s+|the\s+|a\s+)?(?:(salary|stipend|pocket\s+money|allowance|bonus|incentive|commission|pay(?:check)?|rent|interest|dividend|payment|fees?)\s+(?:of\s+)?)?${AMOUNT}(?:\s+(?:as\s+)?(salary|stipend|pocket\s+money|allowance|bonus|incentive|commission|rent|interest|dividend))?(?:\s+(?:from|for|by)\s+(.+?))?\s*$`,
  "i",
);
const CREDITED = new RegExp(
  String.raw`^\s*(salary|stipend|pocket\s+money|allowance|bonus|incentive|commission|pay(?:check)?|rent|interest|dividend)\s+(?:of\s+)?${AMOUNT}\s+(?:credited|received|came(?:\s+in)?|in|got\s+credited|deposited)\s*$|^\s*(salary|stipend|bonus|pay(?:check)?)\s+(?:credited|received|came(?:\s+in)?|deposited)\s*(?:[:-]\s*)?${AMOUNT}\s*$`,
  "i",
);
/** "Netflix 649 monthly", "spotify 119 a month", "aws 3000 every month on the 5th", "domain 900 yearly". */
const RECURRING = new RegExp(
  String.raw`^\s*(?:(?:my|the|our)\s+)?(.+?)\s+(?:subscription\s+|plan\s+|bill\s+|membership\s+)?(?:is\s+|costs?\s+|of\s+)?${AMOUNT}\s*(?:(?:a|per|\/|every|each)\s*(month|mo|year|yr|quarter)|(monthly|yearly|annually|annual|quarterly))(?:\s+on\s+the\s+(\d{1,2})(?:st|nd|rd|th)?)?\s*$`,
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
  // "Last night" is yesterday's dinner; this morning, tonight and earlier are today.
  const match = new RegExp(String.raw`\s*\b(${SPENT_WHEN})\b\s*$`, "i").exec(what);
  if (!match) return { what, daysAgo: 0 };
  return { what: what.slice(0, match.index).trim(), daysAgo: /^(?:y|last)/i.test(match[1] ?? "") ? 1 : 0 };
}

const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

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

  const recurring = RECURRING.exec(line);
  if (recurring) {
    const amount = amountOf(recurring[2], recurring[3]);
    const per = (recurring[4] ?? recurring[5] ?? "").toLowerCase().replace(/\./g, "");
    const cycle = /^(?:year|yr|yearly|annually|annual)$/.test(per) ? "yearly" : /^quarter/.test(per) ? "quarterly" : "monthly";
    const title = (recurring[1] ?? "").trim();
    const day = recurring[6] ? Number(recurring[6]) : null;
    // A price said with no thing to pay for, or a thing that is plainly not a bill, is not a running cost.
    if (amount > 0 && title && !/^(?:i|we|it|this|that|spent|paid|salary|stipend|allowance|pocket\s+money|income|pay)\b/i.test(title) && (day === null || (day >= 1 && day <= 31))) {
      // "aws" is AWS: a name of three letters or fewer is nearly always initials.
      const name = /^[a-z]{2,3}$/i.test(title) ? title.toUpperCase() : title.charAt(0).toUpperCase() + title.slice(1);
      return { do: "cost", title: name, amount, cycle, day };
    }
  }

  const income = INCOME.exec(line) ;
  if (income) {
    const amount = amountOf(income[2], income[3]);
    const kind = (income[1] ?? income[4] ?? "").trim();
    const from = (income[5] ?? "").trim();
    const what = kind ? capital(kind) + (from ? ` from ${from}` : "") : from ? `From ${from}` : "Money in";
    // "Got 3 marks", "made 2 friends": money is a sum, not a small count of something.
    if (amount >= 10 && !/\b(?:marks?|points?|friends?|goals?|runs?|km|kg|hours?|pages?|%)\b/i.test(line)) {
      return { do: "spend", amount: -amount, what, daysAgo: 0 };
    }
  }
  const credited = CREDITED.exec(line);
  if (credited) {
    const amount = amountOf(credited[2] ?? credited[5], credited[3] ?? credited[6]);
    const kind = (credited[1] ?? credited[4] ?? "").trim();
    if (amount > 0) return { do: "spend", amount: -amount, what: capital(kind), daysAgo: 0 };
  }

  const refund = REFUND.exec(line);
  if (refund) {
    const amount = amountOf(refund[1], refund[2]);
    const { what, daysAgo } = whenSpent(refund[3] ?? "");
    return amount > 0 ? { do: "spend", amount: -amount, what: what ? `Refund: ${what}` : "Refund", daysAgo } : null;
  }

  const short = SPENT_ON.exec(line);
  if (short) {
    const amount = amountOf(short[2], short[3]);
    const what = (short[1] ?? "").trim();
    return amount > 0 ? { do: "spend", amount, what: what.charAt(0).toUpperCase() + what.slice(1), daysAgo: whenSpent(short[4] ?? "").daysAgo } : null;
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
