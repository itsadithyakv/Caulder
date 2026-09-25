/**
 * The lists people keep in their heads and type as they go: a film to watch,
 * a gift for mum, a place to try, a quote worth keeping, a link to read later.
 *
 * Each goes on one page for its kind - Watchlist, Gift ideas, Quotes - as a
 * dated line, the way a memory is kept, and that page hangs where it belongs
 * in your own brain. A book to read is the shelf's, not a page's.
 *
 * Only said the way a list item is said: a kind and then the thing ("movie to
 * watch: interstellar", "gift idea for mom: saree", "quote: ..."), or a link
 * with "later". A line that only mentions a film is not an item on a list.
 */

type ListItem =
  | { kind: "book"; title: string }
  | {
      kind: "page";
      /** The page it goes on. */
      page: string;
      /** The hobby the page hangs off, when it has one; otherwise it hangs off you. */
      under: "Films and shows" | "Cooking" | "Music" | null;
      /** What is written on it. */
      says: string;
    };

const SEP = String.raw`\s*[:\-–—]\s*`;
const FROM = String.raw`(?:\s+(?:from|by|via)\s+([\p{L}]+(?:\s+[\p{L}]+)?))?`;
const ASKED = String.raw`(?:to\s+(?:watch|see)|rec(?:ommendation)?s?|recommended|suggestions?|idea)`;

const RULES: { says: RegExp; make: (m: RegExpExecArray) => ListItem | null }[] = [
  {
    says: new RegExp(String.raw`^\s*(?:books?|novels?)\s+(?:to\s+read|rec(?:ommendation)?s?|recommended|suggestions?)${FROM}${SEP}(.+)$`, "iu"),
    make: (m) => ({ kind: "book", title: (m[2] ?? "").trim() }),
  },
  {
    says: new RegExp(String.raw`^\s*(?:to\s+read|tbr|reading\s+list)${SEP}(.+)$`, "iu"),
    make: (m) => ({ kind: "book", title: (m[1] ?? "").trim() }),
  },
  {
    says: new RegExp(String.raw`^\s*(?:movies?|films?|shows?|series|anime|documentar(?:y|ies)|k-?dramas?)\s+${ASKED}${FROM}${SEP}(.+)$`, "iu"),
    make: (m) => ({ kind: "page", page: "Watchlist", under: "Films and shows", says: from(m[2], m[1]) }),
  },
  {
    says: new RegExp(String.raw`^\s*(?:to\s+watch|watch\s*list|watch\s+later)${SEP}(.+)$`, "iu"),
    make: (m) => ({ kind: "page", page: "Watchlist", under: "Films and shows", says: (m[1] ?? "").trim() }),
  },
  {
    says: new RegExp(String.raw`^\s*gift\s+ideas?(?:\s+for\s+([\p{L}]+(?:\s+[\p{L}]+)?))?${SEP}(.+)$`, "iu"),
    make: (m) => ({ kind: "page", page: "Gift ideas", under: null, says: m[1] ? `For ${m[1]}: ${(m[2] ?? "").trim()}` : (m[2] ?? "").trim() }),
  },
  {
    says: new RegExp(String.raw`^\s*podcasts?\s+(?:to\s+(?:listen\s+to|hear)|rec(?:ommendation)?s?|recommended)${FROM}${SEP}(.+)$`, "iu"),
    make: (m) => ({ kind: "page", page: "Podcasts", under: null, says: from(m[2], m[1]) }),
  },
  {
    says: new RegExp(String.raw`^\s*(?:songs?|albums?|music)\s+(?:to\s+(?:learn|listen\s+to|hear)|rec(?:ommendation)?s?)${FROM}${SEP}(.+)$`, "iu"),
    make: (m) => ({ kind: "page", page: "Songs to hear", under: "Music", says: from(m[2], m[1]) }),
  },
  {
    says: new RegExp(String.raw`^\s*(?:places?|restaurants?|caf(?:e|é)s?|spots?)\s+(?:to\s+(?:try|visit|go(?:\s+to)?|eat)|rec(?:ommendation)?s?)${FROM}${SEP}(.+)$`, "iu"),
    make: (m) => ({ kind: "page", page: "Places to try", under: null, says: from(m[2], m[1]) }),
  },
  {
    says: new RegExp(String.raw`^\s*(?:recipes?|dish(?:es)?)\s+(?:to\s+(?:try|make|cook)|rec(?:ommendation)?s?)${FROM}${SEP}(.+)$`, "iu"),
    make: (m) => ({ kind: "page", page: "Recipes to try", under: "Cooking", says: from(m[2], m[1]) }),
  },
  {
    says: new RegExp(String.raw`^\s*(?:wish\s*list|want\s+to\s+buy|to\s+buy\s+(?:someday|one\s+day)|things?\s+to\s+buy\s+someday)${SEP}(.+)$`, "iu"),
    make: (m) => ({ kind: "page", page: "Wishlist", under: null, says: (m[1] ?? "").trim() }),
  },
  {
    says: new RegExp(String.raw`^\s*quotes?${SEP}(.+)$`, "iu"),
    make: (m) => ({ kind: "page", page: "Quotes", under: null, says: (m[1] ?? "").trim() }),
  },
  {
    // "“The obstacle is the way” - Marcus Aurelius": a quote, said the way one is written.
    says: /^\s*["“](.{6,}?)["”]\s*[-–—~]\s*(\p{L}.{1,60})$/u,
    make: (m) => ({ kind: "page", page: "Quotes", under: null, says: `“${(m[1] ?? "").trim()}” - ${(m[2] ?? "").trim()}` }),
  },
];

/** Recommended by somebody: kept with who said so, since that is half of why it is on the list. */
function from(item: string | undefined, who: string | undefined): string {
  const thing = (item ?? "").trim();
  return who ? `${thing} (from ${who.trim()})` : thing;
}

const LINK = /https?:\/\/\S+/i;
const LATER = /\b(?:(?:read|watch|listen(?:\s+to)?|check(?:\s+(?:it|this))?\s+out|look\s+at)\s+(?:it\s+|this\s+)?later|for\s+later|to\s+read|to\s+watch|save\s+(?:this|for\s+later))\b/i;

export function readListItem(text: string): ListItem | null {
  for (const rule of RULES) {
    const m = rule.says.exec(text);
    if (!m) continue;
    const item = rule.make(m);
    if (item && (item.kind === "book" ? item.title : item.says).length >= 2) return item;
  }
  // A link to come back to: "https://... read later".
  if (LINK.test(text) && LATER.test(text)) return { kind: "page", page: "Read later", under: null, says: text.trim() };
  return null;
}
