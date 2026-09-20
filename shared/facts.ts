/**
 * A fact worth keeping: "Shivajinagar was called Blackpally, interesting
 * question", "fun fact: honey never spoils", "TIL the Eiffel Tower grows in
 * summer".
 *
 * Not a thing to do, not about your day, not about anything the brain has a
 * page for - something learnt, of the kind a quizzer collects. They all go on
 * one page, Random knowledge, with what each is about said first so the page
 * reads down its left edge. A page per fact would bury the brain in stubs.
 *
 * Two ways in. Said to be one - "fun fact", "did you know", "TIL", "good quiz
 * question" - which is never doubted. Or shaped like one: a thing, then the
 * way an encyclopaedia talks ("was called", "is the capital of", "was founded
 * by", "stands for"). The second never fires on a line about yourself, which
 * is what the list of who-not-to-start-with is for.
 */

type Trivia = {
  /** What the fact is about, to lead the line with: "Shivajinagar". Null when the line never says. */
  subject: string | null;
  /** The fact, without the words that only said it was one. */
  says: string;
  /** Said to be a fact ("fun fact", "interesting question"), rather than only shaped like one. */
  marked: boolean;
};

/** The one page they all go on. */
export const TRIVIA_PAGE = "Random knowledge";

const LEAD =
  /^\s*(?:(?:random|fun|interesting|cool|weird|quiz|gk)\s+)?(?:fact|trivia|gk)\s*[:\-–,]?\s+|^\s*(?:did\s+(?:you|u)\s+know(?:\s+that)?|til|today\s+i\s+learn(?:ed|t)(?:\s+that)?|apparently|turns\s+out(?:\s+that)?|for\s+(?:the\s+)?quiz)\s*[:\-–,]?\s+/i;

/**
 * What is said after a fact to say it was one. "Good" on its own is not
 * enough - "the gym felt good" ends in it - so an adjective needs its noun,
 * and "interesting" alone needs the comma that sets it apart.
 */
const TAIL = new RegExp(
  String.raw`(?:` +
    String.raw`[\s,.;:-]+(?:(?:what\s+)?an?\s+|very\s+|such\s+an?\s+|pretty\s+)?(?:interesting|fascinating|good|great|nice|cool|fun)\s+(?:quiz\s+)?(?:question|fact|trivia)` +
    String.raw`|[,.;:-]\s*(?:(?:very|pretty|quite)\s+)?(?:interesting|fascinating)` +
    String.raw`|[\s,.;:-]+who\s+knew` +
    String.raw`|[\s,.;:-]+for\s+(?:the\s+|a\s+)?quiz(?:zing|zes)?` +
    String.raw`|[\s,.;:-]+quiz\s+(?:question|material)` +
    String.raw`|[,.;:-]\s*(?:fun\s+fact|gk|trivia)` +
    String.raw`)\s*[.!?]*\s*$`,
  "i",
);

/** The way a fact is put: what comes after the thing it is about. */
const ENCYCLOPAEDIC = String.raw`(?:(?:is|are|was|were)\s+(?:also\s+|once\s+|originally\s+|formerly\s+|first\s+|actually\s+)?(?:called|known\s+as|named(?:\s+after)?|founded|built|invented|discovered|established|born|written\s+by|composed\s+by|designed\s+by|made\s+of|located\s+in|the\s+(?:capital|largest|smallest|biggest|first|last|only|longest|shortest|tallest|oldest|youngest|fastest|deepest|highest|national)\b)|(?:stands?\s+for|means?|comes?\s+from|originated\s+(?:in|from)|invented|discovered|founded)\s+\S)`;

const SHAPED = new RegExp(String.raw`^\s*((?:[\p{L}\p{N}'’.&-]+\s+){0,5}?[\p{L}\p{N}'’.&-]+)\s+${ENCYCLOPAEDIC}`, "iu");

/** A line that opens with one of these is about the person typing it, or about nothing in particular. */
const NOT_A_SUBJECT = new Set([
  "i", "im", "i'm", "ive", "i've", "my", "me", "we", "our", "us", "you", "your", "he", "she", "they", "his", "her", "their",
  "it", "its", "it's", "this", "that", "these", "those", "there", "here", "today", "tomorrow", "yesterday", "tonight",
  "what", "who", "why", "how", "when", "where", "which", "remind", "remember", "note", "idea", "task", "todo",
]);

const LEADING_ARTICLE = /^(?:the|a|an)\s+/i;

function titled(text: string): string {
  return text.replace(/(^|[\s-])(\p{Ll})/gu, (_whole, gap: string, letter: string) => gap + letter.toUpperCase());
}

function subjectIn(says: string): string | null {
  const found = SHAPED.exec(says)?.[1]?.trim() ?? "";
  if (!found) return null;
  const first = (found.split(/\s+/)[0] ?? "").toLowerCase();
  if (NOT_A_SUBJECT.has(first)) return null;
  return titled(found.replace(LEADING_ARTICLE, ""));
}

export function readFact(text: string): Trivia | null {
  const said = text.trim();
  if (said.length < 8) return null;
  const led = LEAD.test(said);
  const tailed = TAIL.test(said);
  const says = said.replace(LEAD, "").replace(TAIL, "").trim();
  if (says.split(/\s+/).length < 3) return null;

  const subject = subjectIn(says);
  // Said to be a fact, or shaped like one. A line that is neither is left for what it was going to be.
  if (!led && !tailed && subject === null) return null;
  return { subject, says: says.charAt(0).toUpperCase() + says.slice(1), marked: led || tailed };
}
