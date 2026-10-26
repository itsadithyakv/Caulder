import { parseQuick } from "./quickadd";
import { shiftDay } from "./dates";
import { nextStepIn } from "./nextstep";

/**
 * Somebody new, said the way you would tell a friend: "Jyothi the principal
 * from reva puc has accepted my linkedin connection request, i need to follow
 * up". That is three things - a person at a place, what happened, and what to
 * do about it - and one Enter keeps all three: a new contact (Jyothi, at Reva
 * PUC, the principal, from LinkedIn), what happened on their history, and
 * "Follow up with Jyothi" as their task.
 *
 * Careful by design. Only somebody who is not already a contact, named with
 * where they are ("from", "at") and with something that says they are a
 * person to know: a role, how you met, something they did, or something to do
 * about them. "Letter from school", "email from hdfc bank" and "pizza from
 * dominos" are none of that, and are read the way they always were.
 */

export type NewPerson = {
  /** The person: Jyothi. Null when only what they are was said: "the principal of Vidyashilp". */
  name: string | null;
  /** Where they are: Reva PUC. */
  company: string;
  /** What they are there: Principal. */
  role: string | null;
  /** Where they came from, when the line says: LinkedIn. */
  source: string | null;
  /** What happened, for their history: "Accepted my LinkedIn connection request". */
  happened: string | null;
  /** What to do about them, as their task - on the day said, or tomorrow. */
  then: { title: string; day: string; time: string | null; daySaid: boolean } | null;
};

type Clock = { today: string; now: number };

/** How somebody came to be met, said in front of their name. */
const MET = /^\s*(?:i\s+)?(?:just\s+)?(?:met|meet|spoke\s+(?:to|with)|talked\s+(?:to|with)|connected\s+with|got\s+(?:a\s+)?(?:call|message|reply|mail|email|dm|text)\s+from|heard\s+(?:back\s+)?from|new\s+(?:lead|contact|connection)\s*[:,-]?)\s+/i;
/** Where one part of the line ends: what they did, and anything after a comma. */
const CLAUSE = /\s+(?:has|have|had|is|was|are|were|just|said|says|wants|wanted|accepted|replied|responded|called|messaged|emailed|asked|agreed|liked|shared|sent|reached|referred|introduced|who|and|but|will|would|can|could|needs?|seems|sounds|looks|is\s+interested)\b|\s*[,;.!?:]\s*|\s+[-–—]\s+/i;
/** Something they did that makes them somebody to know. */
const DID = /\b(?:accepted|replied|responded|connected|wants?|wanted|interested|agreed|asked|said|called|messaged|emailed|reached\s+out|referred|introduced|followed|liked|shared|sent|confirmed|signed)\b/i;
/** What to do about them. */
const THEN =
  /(?:^|[,;.]\s*|\s+(?:so|and|but)\s+)(?:i\s+)?(?:(?:need|have|got|ought|want|should|must)\s+to\s+|(?:should|must|will|gotta|gonna)\s+|remind\s+me\s+to\s+|to\s+)?(follow\s*-?\s*up|call|ring|email|mail|message|text|whatsapp|ping|meet|send|share|reply|schedule|set\s+up|book|reach\s+out|thank|invite|visit|pitch|demo|check\s+in)\b(.*)$/i;

/** Words a name never is: a person says "I", "the", "email" before "from" far more often than a name. */
const NOT_A_NAME = new Set([
  "i", "we", "you", "he", "she", "they", "it", "this", "that", "my", "our", "your", "his", "her", "their", "the", "a", "an",
  "someone", "somebody", "anyone", "everyone", "nobody", "people", "guy", "girl", "man", "woman", "lady", "person",
  "email", "mail", "call", "message", "text", "letter", "parcel", "package", "order", "delivery", "invoice", "bill", "reply",
  "update", "news", "notice", "offer", "quote", "request", "pizza", "food", "lunch", "dinner", "coffee", "gift", "money",
  "payment", "refund", "back", "home", "work", "today", "tomorrow", "yesterday", "tonight", "morning", "evening", "just",
  "got", "went", "came", "back", "straight", "fresh", "free", "away", "far", "made", "bought", "ordered", "picked",
  "mom", "mum", "dad", "papa", "mummy", "bro", "sis",
]);
/** What a person is somewhere, ending the role: "the principal", "HR head", "vice principal", "admissions coordinator". */
const A_ROLE =
  /\b(?:principal|head|hod|manager|director|founder|co-?founder|owner|ceo|cto|coo|cfo|cmo|md|admin|administrator|hr|teacher|coordinator|dean|chair(?:man|person|woman)?|secretary|trustee|correspondent|lead|engineer|recruiter|partner|president|officer|accountant|receptionist|couns[ea]llor|librarian|professor|lecturer|faculty|doctor|dr|consultant|advisor|adviser|in-?charge|incharge|supervisor|executive|representative|rep|agent|buyer|purchaser|analyst|designer|developer|editor|producer|organi[sz]er|mentor|investor|vp)\b/i;

/** Words a sentence has and a name does not. */
const IN_A_SENTENCE = new Set([
  "is", "was", "are", "were", "be", "been", "has", "have", "had", "do", "did", "does", "will", "would", "can", "could",
  "to", "for", "in", "on", "with", "and", "or", "but", "not", "no", "so", "very", "new", "old", "first", "last", "one",
  "some", "all", "every", "tried", "try", "got", "get", "went", "go", "made", "make", "took", "take", "saw", "see",
]);
/** Places too general to be a contact: "from home", "at the gym". */
const NOT_A_PLACE = /^(?:the\s+)?(?:home|work|office|college|school|uni|university|class|gym|hostel|there|here|now|night|noon|all|least|most|first|last|once|the\s+moment|\d.*|(?:mon|tues|wednes|thurs|fri|satur|sun)day|today|tomorrow|tonight)$/i;

const SOURCES: [RegExp, string][] = [
  [/\blinked\s?in\b/i, "LinkedIn"],
  [/\binsta(?:gram)?\b/i, "Instagram"],
  [/\b(?:twitter|x\.com)\b/i, "Twitter"],
  [/\bwhats\s?app\b/i, "WhatsApp"],
  [/\b(?:conference|expo|event|meetup|summit|fair|seminar|workshop)\b/i, "Event"],
  [/\breferr(?:ed|al)\b/i, "Referral"],
  [/\bcold\s+call\b/i, "Cold call"],
  [/\bwebsite|web\s+form|enquiry\s+form\b/i, "Website"],
];

const SMALL = new Set(["of", "and", "the", "for", "de", "la", "&"]);

/** "reva puc" is Reva PUC; "jyothi" is Jyothi; a capital someone chose is kept. */
function named(text: string, company: boolean): string {
  return text
    .trim()
    .split(/\s+/)
    .map((word, index) => {
      if (word !== word.toLowerCase()) return word;
      if (index > 0 && SMALL.has(word)) return word;
      if (company && word.length <= 3 && /^[a-z]+$/.test(word)) return word.toUpperCase();
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}

function capital(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Said of a person without being their name: nobody is asked where "the client" is from. */
const NOT_A_PERSON = new Set([
  "client", "customer", "boss", "team", "bank", "landlord", "vendor", "supplier", "lawyer", "auditor", "wife", "husband",
  "friend", "guys", "sir", "madam", "maam", "office", "company", "school", "college", "support", "nobody", "google",
]);

/** A word a name could be. */
function nameWord(word: string, doing: (word: string) => boolean): boolean {
  const lower = word.toLowerCase();
  if (lower.length < 3 || !/^[\p{L}][\p{L}.'-]*$/u.test(word)) return false;
  if (NOT_A_NAME.has(lower) || NOT_A_PERSON.has(lower) || IN_A_SENTENCE.has(lower) || doing(lower)) return false;
  if (A_ROLE.test(lower) || (lower.length >= 5 && /(?:ed|ing)$/.test(lower))) return false;
  return true;
}

/** Somebody the line is about whom nobody has said where they are from. */
type Stranger = {
  /** As a name is written: Sumanth. */
  name: string;
  source: string | null;
  /** What happened, for their history once they are a contact. */
  happened: string;
  then: NonNullable<NewPerson["then"]>;
};

/**
 * "Sumanth asked me to reach out next week", with no "from RV PUC" and no
 * contact of that name (PLAN.md, part nine). Somebody is named and something
 * is owed them, and Caulder does not know who they are - so the line asks
 * where they are from rather than keeping a task about nobody.
 *
 * Only ever when the line leaves a next step (shared/nextstep.ts): that is
 * what makes them somebody to keep, and what keeps "mum asked me to buy milk"
 * - which leaves none - a task like any other. The name comes first and what
 * they said after, or it is my own word given to them: "told Sumanth I'd send
 * the deck".
 */
export function readStranger(said: string, clock: Clock, doing: (word: string) => boolean = () => false): Stranger | null {
  const line = said.trim().replace(/\s+/g, " ");
  const theirs =
    /^([\p{L}][\p{L}.'-]*(?:\s+[\p{L}][\p{L}.'-]*)?)\s+(?=(?:asked|told|said|says|wants|wanted|needs|needed|expects|requested|promised|agreed|will|would|is\s+going\s+to)\b)/iu.exec(
      line,
    );
  const mine = theirs
    ? null
    : /^(?:(?:i|we)\s+)?(?:told|promised|assured)\s+([\p{L}][\p{L}.'-]*)\s+(?=(?:that\s+)?(?:i|we)(?:'d|'ll|\s+would|\s+will)\b)/iu.exec(line);
  const typed = (theirs?.[1] ?? mine?.[1] ?? "").trim();
  if (!typed || !typed.split(/\s+/).every((word) => nameWord(word, doing))) return null;

  const name = named(typed, false);
  const owed = nextStepIn(line, name, clock);
  if (!owed) return null;
  const rest = theirs ? line.slice(theirs[0].length) : line;
  return {
    name,
    source: SOURCES.find(([pattern]) => pattern.test(line))?.[1] ?? null,
    happened: capital(
      rest
        .replace(/[\s,;.!?]+$/, "")
        .replace(/\blinked\s?in\b/gi, "LinkedIn")
        .replace(/\binsta(?:gram)?\b/gi, "Instagram")
        .replace(/\bwhats\s?app\b/gi, "WhatsApp"),
    ),
    then: { title: owed.title, day: owed.day, time: owed.time, daySaid: owed.daySaid },
  };
}

/** A place as it is written on a contact: "rv puc" is RV PUC. */
export function placeNamed(text: string): string {
  return named(text.replace(/\s+/g, " ").replace(/^the\s+/i, ""), true);
}

/**
 * A new person the line describes, or null. `known` is every contact there is,
 * by company and person, so somebody already kept is never kept twice.
 */
export function readNewPerson(
  said: string,
  known: readonly { name: string; person: string | null }[],
  clock: Clock,
  /** Whether a word is something done - "drop", "call", "send" - which a name never starts with. */
  doing: (word: string) => boolean = () => false,
): NewPerson | null {
  const line = said.trim().replace(/\s+/g, " ");
  const lead = MET.exec(line);
  const body = lead ? line.slice(lead[0].length) : line;

  // "Jyothi the principal from reva puc", "Jyothi, principal at Reva PUC", "Priya from Oakridge".
  // Where they are is said with "from" or "at"; "of" only when neither is: "the head of admissions at DPS" is at DPS.
  const where = /\s+(from|at)\s+/i.exec(body) ?? /\s+(of)\s+/i.exec(body);
  if (!where) return null;
  const who = body.slice(0, where.index).trim();
  const after = body.slice(where.index + where[0].length);

  let name: string | null = who;
  let role: string | null = null;
  const roleOnly = /^(?:the|a|an|our|their)\s+(.+)$/i.exec(who);
  const described = /^(.+?)(?:\s*,\s*|\s+)(?:the|a|an|our|their|who\s+is\s+the)\s+(.+)$/i.exec(who) ?? /^(.+?)\s*,\s*(.+)$/.exec(who);
  if (roleOnly) {
    // "The principal of Vidyashilp": somebody known by what they are, not yet by name.
    name = null;
    role = (roleOnly[1] ?? "").trim();
  } else if (described && A_ROLE.test(described[2] ?? "")) {
    // Only a role a person has: "drop the charger at meera's" is not somebody called Drop.
    name = described[1] ?? "";
    role = (described[2] ?? "").trim();
  }
  // "of" only after a role: "the principal of reva puc", not "one of them". And
  // with no name, or with "of", only a role a person has: "the way of kings" is a book.
  const byOf = (where[1] ?? "").toLowerCase() === "of";
  if (byOf && !role) return null;
  if ((byOf || name === null) && !A_ROLE.test(role ?? "")) return null;

  if (name !== null) {
    const nameWords = name.split(/\s+/);
    if (nameWords.length === 0 || nameWords.length > 3) return null;
    if (!nameWords.every((word) => /^[\p{L}][\p{L}.'-]*$/u.test(word))) return null;
    if (NOT_A_NAME.has((nameWords[0] ?? "").toLowerCase()) || doing((nameWords[0] ?? "").toLowerCase())) return null;
    // "tried a new variant of lateral raises", "red rising is the first book of the series": not a person.
    if (nameWords.some((word) => IN_A_SENTENCE.has(word.toLowerCase()) || (word.length >= 5 && /(?:ed|ing)$/i.test(word)))) return null;
  } else if (!role || NOT_A_NAME.has((role.split(/\s+/)[0] ?? "").toLowerCase())) {
    return null;
  }
  if (role && (role.split(/\s+/).length > 4 || !/^[\p{L}\s&/-]+$/u.test(role))) return null;

  const cut = CLAUSE.exec(after);
  const place = (cut ? after.slice(0, cut.index) : after).trim().replace(/^the\s+/i, "");
  const rest = cut ? after.slice(cut.index) : "";
  if (!place || place.split(/\s+/).length > 5 || NOT_A_PLACE.test(place)) return null;

  const then = THEN.exec(rest);
  const happenedPart = (then ? rest.slice(0, then.index) : rest)
    .replace(/^[\s,;.!?:–—-]+/, "")
    .replace(/^(?:and|but|who)\s+/i, "")
    .replace(/^(?:has|have|had)\s+(?:just\s+)?/i, "")
    .replace(/^just\s+/i, "")
    .replace(/[\s,;.!?]+$/, "")
    .trim();

  // Somebody to know, and not a parcel from somewhere: a role, how you met, something they did, or something to do.
  if (!role && !lead && !DID.test(rest) && !then) return null;

  // Never somebody already kept.
  const lower = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const personSaid = name === null ? "" : lower(name);
  const placeSaid = lower(place);
  if (known.some((contact) => lower(contact.name) === placeSaid || (personSaid !== "" && contact.person !== null && lower(contact.person) === personSaid))) {
    return null;
  }

  const company = named(place, true);
  const roleSaid = role ? capital(role) : null;
  // Who the task is about: by name, or by what they are there.
  const person = name !== null ? named(name, false) : `the ${(role ?? "").toLowerCase()} at ${company}`;
  const source = SOURCES.find(([pattern]) => pattern.test(line))?.[1] ?? null;
  const happened = happenedPart
    ? capital(happenedPart.replace(/\blinked\s?in\b/gi, "LinkedIn").replace(/\binsta(?:gram)?\b/gi, "Instagram").replace(/\bwhats\s?app\b/gi, "WhatsApp"))
    : null;

  let task: NewPerson["then"] = null;
  if (then) {
    const verb = (then[1] ?? "").toLowerCase().replace(/\s*-\s*|\s+/g, " ").trim();
    const tail = (then[2] ?? "")
      .replace(/\s+(?:with|to)\s+(?:him|her|them)\b/i, "")
      .replace(/\b(?:him|her|them)\b/i, person)
      .trim();
    const words =
      verb === "follow up" || verb === "check in" || verb === "reach out"
        ? `${verb} with ${person}${tail ? ` ${tail}` : ""}`
        : tail.toLowerCase().startsWith(person.toLowerCase()) || /\b(?:to|with)\b/i.test(tail)
          ? `${verb} ${tail}`
          : `${verb} ${person}${tail ? ` ${tail}` : ""}`;
    const reading = parseQuick(words, clock);
    const title = reading.task.title || capital(words);
    task = {
      title,
      // A follow-up said with no day is for tomorrow: soon, and not before they have had a moment.
      day: reading.task.day ?? shiftDay(clock.today, 1),
      time: reading.task.time,
      daySaid: reading.task.day !== null,
    };
  }

  // Nothing said as "I need to": the thing to do may be inside what they said -
  // "asked me to reach out next week", "said she'll get back in a few days".
  if (!task) {
    const owed = nextStepIn(rest, person, clock);
    if (owed) task = { title: owed.title, day: owed.day, time: owed.time, daySaid: owed.daySaid };
  }

  return {
    name: name !== null ? person : null,
    company,
    role: roleSaid,
    source,
    happened,
    then: task,
  };
}
