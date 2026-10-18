/**
 * How we work: the rules a company keeps (PLAN.md, part eleven).
 *
 * "We invoice on the 1st", "never discount a retainer", "no calls before
 * ten". Said to the line, these used to land on one page - Things to
 * remember - in the order they were said, beside the printer and what a
 * supplier is like. They have a home now: a page a subject, in the section
 * the playbooks are in, because the rules and the steps are the same thing
 * said two ways.
 *
 * A rule is a remembered line like any other (shared/memories.ts): one
 * line, with the day it was set. So it is found, read back, said
 * differently and let go by what already does that. What is here is only
 * what makes it a rule, which page it belongs on, and when two say the same
 * thing.
 *
 * Five subjects to start with - decided 13 October 2026, as recommended -
 * and any page added to the section is a subject of its own.
 */

/** The section the rules live in: with the playbooks, under "How we work". */
export const RULES_SECTION = "playbooks";
/** The kind of page a subject is. */
export const RULES_TEMPLATE = "rules";

type Subject = { title: string; words: RegExp };

/**
 * The subjects, in the order a tie goes: money first, since a rule about
 * "a late-paying client" is about being paid.
 */
const SUBJECTS: readonly Subject[] = [
  {
    title: "Billing and payment",
    words: /\b(?:invoic\w*|bill(?:s|ed|ing)?|pay(?:s|ing|ment|ments)?|paid|deposit|advance|upfront|up\s+front|late\s+fees?|terms|net\s*\d+|refunds?|refunded|receipts?|gst|vat|tax|due|overdue|instal?ments?|milestones?)\b/gi,
  },
  {
    title: "Pricing and discounts",
    words: /\b(?:pric(?:e|es|ed|ing)|charg(?:e|es|ed|ing)|rates?|discount\w*|quot(?:e|es|ed|ing)|fees?|retainers?|free|minimum|markup|margin|estimate[sd]?|rush|hourly|per\s+(?:hour|day|page|word|project))\b/gi,
  },
  {
    title: "Hours and replies",
    words: /\b(?:hours?|calls?|meetings?|repl(?:y|ies|ied)|respond\w*|answer\w*|weekends?|(?:mon|tues|wednes|thurs|fri|satur|sun)days?|holidays?|leave|available|availability|mornings?|evenings?|nights?|lunch|\d{1,2}\s*(?:am|pm)|after\s+\d|before\s+\d|same\s+day|within\s+\d+\s+(?:hours?|days?))\b/gi,
  },
  {
    title: "Clients",
    words: /\b(?:clients?|customers?|onboard\w*|contracts?|scope|revisions?|sign(?:s|ed|ing)?|nda|briefs?|feedback|referrals?|leads?|prospects?|testimonials?|case\s+stud(?:y|ies)|handover|kick-?off)\b/gi,
  },
  {
    title: "Suppliers and tools",
    words: /\b(?:suppliers?|vendors?|freelancers?|contractors?|subcontract\w*|tools?|software|subscriptions?|backups?|printers?|couriers?|hosting|domains?|passwords?|licen[cs]es?|files?|folders?|drive)\b/gi,
  },
];

/** Where a rule goes when it is about none of them: a page of its own, and never the page of everything. */
export const OTHER_RULES = "Other rules";

export const RULE_PAGES: readonly string[] = [...SUBJECTS.map((subject) => subject.title), OTHER_RULES];

const plain = (title: string) => title.trim().toLowerCase().replace(/\s+/g, " ");

/** Whether a page's title is one of the subjects: a page started for a rule is started in How we work. */
export function isRulePage(title: string | null | undefined): boolean {
  return title != null && RULE_PAGES.some((page) => plain(page) === plain(title));
}

/**
 * A rule the company keeps, said as one: "we always", "we never", "we
 * don't", "our policy is", "as a rule" - and what it does as a matter of
 * course, said with the few words that are a company's practice and not an
 * appointment: "we invoice on the 1st", "we charge by the day". Said of the
 * company, never of one person's morning. Not something to do ("never
 * forget to…" is caught before this, where the line reads what is meant),
 * and not a fact about the company, which says what something is.
 */
const A_RULE =
  /^\s*(?:we\s+(?:don'?t|do\s+not|never|always|only|no\s+longer|stopped|usually|normally)\b|we\s+(?:invoice|bill|charge|quote|ship|deliver|accept|require|offer)\b|never\b|always\b|no\s+[\p{L}]+\s+(?:before|after|on|without|until|unless)\b|(?:our|my|the|company)\s+(?:policy|rule|terms?)\b|policy\s*:|rule\s*:|as\s+a\s+rule\b)|\b(?:by\s+default|as\s+a\s+rule|without\s+exception|no\s+exceptions?)\b|^\s*we\s+[\p{L}]+\s.*\b(?:always|never)\b/iu;

export function isRule(said: string): boolean {
  return A_RULE.test(said);
}

/** The page a rule belongs on: the subject most of its words are about. */
export function ruleSubject(said: string): string {
  let best: { title: string; hits: number } | null = null;
  for (const subject of SUBJECTS) {
    const hits = said.match(subject.words)?.length ?? 0;
    if (hits > 0 && (!best || hits > best.hits)) best = { title: subject.title, hits };
  }
  return best?.title ?? OTHER_RULES;
}

/** Words a rule has that say nothing about what it is a rule on. */
const EMPTY = new Set([
  "we", "i", "our", "my", "the", "a", "an", "to", "of", "on", "in", "at", "for", "is", "are", "be", "do", "does", "dont", "not",
  "never", "always", "only", "no", "any", "all", "and", "or", "but", "with", "without", "before", "after", "by", "as", "it", "its",
  "that", "this", "now", "from", "per", "can", "cant", "will", "wont", "usually", "normally", "rule", "policy", "default", "every",
  "each", "than", "more", "less", "over", "under", "then", "when", "if", "unless", "until", "longer", "stopped",
]);

/** What a rule is about, as the words left when the grammar and the numbers are taken out. */
function aboutOf(said: string): Set<string> {
  const out = new Set<string>();
  for (const word of said.toLowerCase().replace(/['’]/g, "").match(/[\p{L}]{2,}/gu) ?? []) {
    if (EMPTY.has(word) || /^(?:st|nd|rd|th|am|pm)$/.test(word)) continue;
    // "discounted", "discounts" and "discount" are one word here; "invoices" and "invoicing" another.
    out.add(word.replace(/(?:ing|ed|es|s)$/, "").replace(/([^aeiou])\1$/, "$1") || word);
  }
  return out;
}

/**
 * Whether two rules are about the same thing - so that the second may be
 * meant instead of the first: "we invoice on the 1st" and "we invoice on
 * the 15th now". By their words with the numbers left out, since the number
 * is usually what changed. Only ever used to ask, never to replace.
 */
export function alike(one: string, other: string): boolean {
  const [a, b] = [aboutOf(one), aboutOf(other)];
  const small = Math.min(a.size, b.size);
  if (small === 0) return false;
  let shared = 0;
  for (const word of a) if (b.has(word)) shared += 1;
  // One word in common is enough only between two short rules: "no calls before 10", "no calls on fridays".
  if (small === 1) return shared === 1 && Math.max(a.size, b.size) <= 2;
  return shared / small >= 0.6;
}

/* ---- Sorting a page of what was remembered ---------------------------------- */

/** Where a remembered line would be better kept. */
export type Home =
  /** A rule: on its subject's page in How we work. */
  | { kind: "rule"; subject: string }
  /** About a contact: under their Keep in mind. */
  | { kind: "contact"; id: string; name: string }
  /** Said twice on the page: this one let go, the other kept. */
  | { kind: "twice"; as: string };

export type Sorted = {
  /** The line exactly as it is on the page. */
  raw: string;
  says: string;
  day: string;
  /** Where it would go, or null to stay where it is. */
  to: Home | null;
  /** Who thought so: the rules on this machine, or the AI that was asked. */
  by: "rules" | "ai";
};

const same = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/**
 * A page's remembered lines, each with where it would be better kept - by
 * what can be checked on this machine: it is said as a rule, it names a
 * contact, or it is on the page twice. A line that is none of those stays,
 * and is what an AI may be asked about (services/propose.ts).
 *
 * `onRulePage` is whether the page being sorted is itself a subject's page:
 * a rule there is already home unless it belongs to another subject.
 */
export function sortLines(
  lines: readonly { raw: string; says: string; fact: string | null; day: string }[],
  who: (said: string) => { id: string; name: string } | null,
  page: { title: string; rules: boolean },
): Sorted[] {
  const seen = new Map<string, string>();
  return lines.map((line): Sorted => {
    const said = [line.fact, line.says].filter(Boolean).join(": ");
    const key = same(line.says);
    const earlier = seen.get(key);
    if (earlier !== undefined) return { raw: line.raw, says: line.says, day: line.day, to: { kind: "twice", as: earlier }, by: "rules" };
    seen.set(key, line.says);

    let to: Home | null = null;
    const contact = who(said);
    if (isRule(line.says)) {
      const subject = ruleSubject(said);
      // Home already: on its own subject's page, or on a page somebody made in How we work and it fits no subject better.
      const home = plain(subject) === plain(page.title) || (page.rules && subject === OTHER_RULES);
      if (!home) to = { kind: "rule", subject };
    } else if (contact) {
      to = { kind: "contact", id: contact.id, name: contact.name };
    }
    return { raw: line.raw, says: line.says, day: line.day, to, by: "rules" };
  });
}

/** Where a line goes, in the words it is offered in. */
export function sayHome(home: Home): string {
  return home.kind === "rule" ? `How we work · ${home.subject}` : home.kind === "contact" ? `${home.name}, under Keep in mind` : "said twice - let this one go";
}
