import type { BrainSectionId } from "./brain";

/**
 * What a question needs sent with it (PLAN.md, part ten, phase 37).
 *
 * A question used to go with the whole company - four documents, every
 * contact - until that was too big to send. Most questions are about one
 * thing: a contact, the money, what to chase. So what goes is the company in
 * brief, always, and then only the parts of the records the question is
 * about. The whole company goes when it is asked for - "everything", "all my
 * contacts" - or when Settings says to send it every time.
 *
 * This is the part that reads the question: which parts of the dossier
 * (electron/main/services/dossier.ts, by their headings) and which sections
 * of the brain its words point at. Who it names, and what it means beyond
 * its words, is worked out beside the records (services/relevant.ts).
 */

/** Which contacts go besides the ones a question names. */
type Besides = "none" | "open" | "recent";

type Needs = {
  /** Asked for outright: the whole company. */
  whole: boolean;
  /** Parts of the dossier, by their headings. */
  parts: string[];
  /** Sections of the brain, with every page in them. */
  sections: BrainSectionId[];
  /** Contacts besides the ones named: those with a deal open, or the ones last spoken to. */
  besides: Besides;
};

const EVERYTHING =
  /\b(?:everything|the\s+whole\s+(?:company|thing|lot)|whole\s+company|all\s+(?:of\s+)?(?:it|the\s+(?:company|records|contacts|data))|all\s+(?:of\s+)?my\s+(?:contacts|records|data)|every\s+(?:contact|record|page)|entire\s+(?:company|brain))\b/i;

type Topic = { words: RegExp; parts?: string[]; sections?: BrainSectionId[]; besides?: Besides };

/** What a question's words point at. Several can match; what they point at is added up. */
const TOPICS: readonly Topic[] = [
  {
    words: /\b(?:money|cash|runway|burn|bank|spend|spent|spending|costs?|expenses?|afford|profit|revenue|income|budget|paid|pay(?:ing|ment|ments)?|owe[sd]?|owing|unpaid|overdue|invoices?|invoiced|receipts?)\b/i,
    parts: ["Money now"],
    sections: ["money"],
  },
  {
    words: /\b(?:price[sd]?|pricing|charge|charging|rates?|products?|sell|selling|offer(?:ing)?s?|catalogue|margins?|packages?|retainers?)\b/i,
    parts: ["What we sell"],
    sections: ["products"],
  },
  {
    words: /\b(?:deals?|pipeline|funnel|chase|chasing|clos(?:e|ing)|won|lost|proposals?|quotes?|stages?|prospects?|leads?)\b/i,
    parts: ["The funnel", "Why deals were lost", "Every deal"],
    besides: "open",
  },
  { words: /\b(?:calls?|called|calling|objections?|scripts?|prompter|pitch(?:ing)?|cold)\b/i, parts: ["Calls in the last 30 days"], sections: ["playbooks"] },
  {
    words: /\b(?:tasks?|to-?dos?|today|tomorrow|this\s+week|next\s+week|due|focus|priorit\w+|what\s+(?:should\s+i\s+do|next|now)|on\s+my\s+plate)\b/i,
    parts: ["Open tasks"],
  },
  { words: /\b(?:tax(?:es)?|gst|vat|filings?|returns?|compliance|deadlines?|tds|audit)\b/i, sections: ["tax"] },
  { words: /\b(?:legal|contracts?|nda|terms|agreements?|clauses?)\b/i, sections: ["legal"] },
  { words: /\b(?:tools?|subscriptions?|software|logins?)\b/i, sections: ["tools"] },
  { words: /\b(?:decided|decisions?|why\s+did\s+we|chose|chosen)\b/i, sections: ["decisions"] },
  { words: /\b(?:meetings?|minutes)\b/i, sections: ["meetings"] },
  { words: /\b(?:metrics?|numbers|growth|churn|mrr|arr|kpis?|trends?)\b/i, sections: ["metrics"] },
  { words: /\b(?:documents?|certificates?|on\s+file|expir\w+|licen[cs]es?)\b/i, sections: ["documents"] },
  { words: /\b(?:ideas?|brainstorm)\b/i, sections: ["ideas"] },
  { words: /\b(?:notes?|jotted|wrote\s+down)\b/i, parts: ["Loose notes"] },
  { words: /\b(?:customers?|clients?|market|competitors?|segments?|who\s+buys)\b/i, sections: ["customers"], besides: "recent" },
  { words: /\b(?:strategy|goals?|vision|roadmap|mission|investors?|one-?pager|update\s+for)\b/i, parts: ["Money now", "The funnel"], sections: ["plan", "company"] },
  {
    words: /\b(?:remember(?:ed)?|usually|always|never|policy|rules?|process|how\s+(?:do\s+)?(?:we|i)\s+(?:work|do|handle|bill|invoice|charge)|the\s+way\s+(?:we|i))\b/i,
    sections: ["remembered", "playbooks"],
  },
  {
    words: /\b(?:who\s+(?:has|have)\s*n[o']?t|not\s+answered|(?:gone|going)\s+quiet|follow\s*-?\s*ups?|contacts|people|anyone|who\s+(?:should|do|can)\s+i)\b/i,
    besides: "recent",
  },
];

/** What a question with no topic in it gets: enough to say what to do next. */
const IN_GENERAL: Needs = { whole: false, parts: ["Open tasks", "Every deal"], sections: [], besides: "open" };

/** Whether a question's words point at anything at all. */
export function hasTopic(question: string): boolean {
  return EVERYTHING.test(question) || TOPICS.some((topic) => topic.words.test(question));
}

export function needsOf(question: string): Needs {
  if (EVERYTHING.test(question)) return { whole: true, parts: [], sections: [], besides: "recent" };
  const parts = new Set<string>();
  const sections = new Set<BrainSectionId>();
  let besides: Besides = "none";
  let matched = false;
  for (const topic of TOPICS) {
    if (!topic.words.test(question)) continue;
    matched = true;
    for (const part of topic.parts ?? []) parts.add(part);
    for (const section of topic.sections ?? []) sections.add(section);
    // The wider of the two: the ones last spoken to include the ones with a deal open.
    if (topic.besides === "recent" || (topic.besides === "open" && besides === "none")) besides = topic.besides;
  }
  return matched ? { whole: false, parts: [...parts], sections: [...sections], besides } : IN_GENERAL;
}

/** The words of a question worth looking up one by one: long, and not the words every question has. */
const COMMON = new Set([
  "about", "after", "again", "against", "before", "being", "between", "could", "every", "first", "going", "should", "since",
  "their", "there", "these", "thing", "things", "think", "those", "under", "until", "where", "which", "while", "would",
  "write", "draft", "email", "message", "please", "tell", "what", "when", "have", "with", "from", "that", "this", "them",
  "they", "does", "know", "last", "next", "week", "month", "today", "company", "anything", "something", "summarise",
  "summarize", "summary",
]);

export function rareWords(question: string, most = 4): string[] {
  const seen = new Set<string>();
  for (const word of question.toLowerCase().match(/[\p{L}][\p{L}'-]{4,}/gu) ?? []) {
    if (!COMMON.has(word)) seen.add(word);
  }
  return [...seen].sort((a, b) => b.length - a.length).slice(0, most);
}

/** About how many tokens so many characters are. English runs near four characters a token. */
export function tokensIn(characters: number): number {
  return Math.max(1, Math.round(characters / 4));
}

/** What went, or is about to, in a line: "the company in brief, Harbour Coffee Roasters, Money now". */
export function sayParts(parts: readonly string[], most = 6): string {
  if (parts.length <= most) return parts.join(", ");
  return `${parts.slice(0, most).join(", ")} and ${parts.length - most} more`;
}
