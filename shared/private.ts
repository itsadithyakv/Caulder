import { z } from "zod";

/**
 * The lines that are nobody else's business.
 *
 * "I spoke to julia today about this, really liked it." "I did not like how I
 * spoke to my mum today." These are the reason a journal has a lock, and they
 * are exactly what a line that files things helpfully would get wrong: put on
 * a contact's history, started as a page in the brain, offered to an AI as
 * context. So they are recognised first, and once recognised they go to one
 * place only - the journal, sealed with its passcode the moment they are
 * written (electron/main/services/private.ts) - and nowhere else, whatever
 * else the line happens to name.
 *
 * Erring towards private on purpose. A line locked that did not need to be
 * costs a passcode to read back; a line about a crush left on a client's
 * timeline costs rather more. And it is one press on the chips to move.
 *
 * What is kept is structured, a little: who it was about and what kind of
 * feeling it was, so that a locked journal read back months later can be read
 * by person and by feeling, and not only by date.
 */

export type Feeling = "affection" | "regret" | "hurt" | "worry" | "anger" | "joy" | "other";

export type PrivateReading = {
  feeling: Feeling;
  /** Who it was about, as they were named: "Julia", "Mum". */
  people: string[];
  /** Why it was taken as private, in a few words, for the reading under the line. */
  because: string;
};

/** Said outright: "private: ...", "secret - ...", "lock: ...". */
export const PRIVATE_PREFIX = /^\s*(?:private|secret|intimate|locked|lock)\s*[:\-–]\s*/i;

/** The people a life is mostly about, by what they are rather than by name. */
const CLOSE =
  /\b(?:mum|mom|mother|mummy|amma|maa|dad|father|papa|appa|parents|sister|brother|sis|bro|grandma|grandpa|grandmother|grandfather|girlfriend|boyfriend|gf|bf|wife|husband|partner|fianc[eé]e?|ex|crush|best\s+friend|bestie|roommate|flatmate)\b/i;

const AFFECTION =
  /\b(?:crush|in\s+love|love\s+(?:her|him|them)|like\s+(?:her|him|them)|liked\s+(?:her|him|them)|fancy|fell\s+for|falling\s+for|butterflies|cute|flirt(?:ed|ing)?|kissed?|date\b|went\s+on\s+a\s+date|asked\s+(?:her|him|them)\s+out|miss\s+(?:her|him|them)|missing\s+(?:her|him|them)|can'?t\s+stop\s+thinking)\b/i;
const REGRET =
  /\b(?:i\s+(?:did\s+not|didn'?t|do\s+not|don'?t)\s+like\s+(?:how|the\s+way|that)\s+i|i\s+regret|i\s+shouldn'?t\s+have|i\s+should\s+not\s+have|i\s+wish\s+i\s+(?:had|hadn'?t|did|didn'?t)|i\s+hate\s+(?:that|how)\s+i|i\s+was\s+(?:rude|harsh|mean|unfair|short|cold)|snapped\s+at|i\s+feel\s+(?:bad|guilty|ashamed|terrible)\s+(?:about|for)|ashamed|guilty|embarrass(?:ed|ing))\b/i;
const HURT = /\b(?:hurt\s+me|hurt\s+by|heartbr(?:oken|eak)|broke\s+up|breakup|break\s+up|cried|crying|lonely|left\s+out|ignored\s+me|ghosted|rejected|betrayed|let\s+me\s+down|insecure|jealous|worthless)\b/i;
const WORRY = /\b(?:scared|terrified|panic(?:ked|king)?|anxious\s+about|worried\s+(?:about|that)|can'?t\s+sleep|therapy|therapist|depress(?:ed|ion)|burn(?:ed|t)\s+out|self[\s-]?harm|overthinking)\b/i;
const ANGER = /\b(?:furious|so\s+angry|pissed|fought\s+with|had\s+a\s+fight|argument\s+with|argued\s+with|yelled\s+at|shouted\s+at|screamed\s+at|can'?t\s+stand)\b/i;

/** Talking with somebody, and how it felt: "spoke to julia today about this, really liked it". */
const TALKED = /\b(?:spoke|talked|chatted|texted|called|messaged|met|hung\s+out|had\s+(?:a\s+)?(?:coffee|lunch|dinner|call)|opened\s+up)\s+(?:to|with)?\s*(\p{L}[\p{L}'-]{1,})/iu;
const FELT_IT =
  /\b(?:really\s+)?(?:liked|loved|enjoyed|hated)\s+(?:it|that|this|talking|her|him|them)\b|\bfelt\s+(?:so\s+|really\s+)?(?:good|great|happy|nervous|awkward|close|seen|safe|weird|strange|bad|sad)\b|\bmade\s+me\s+(?:smile|happy|sad|cry|nervous)\b|\bmeant\s+a\s+lot\b/i;

const NOT_A_NAME = new Set([
  "the", "a", "an", "my", "our", "his", "her", "their", "to", "with", "about", "today", "yesterday", "him", "them", "me",
  "it", "this", "that", "some", "someone", "somebody", "everyone", "people", "client", "clients", "team", "customer",
]);

/** What in a line says it is work, which is what keeps "spoke to priya, liked the deck" off the locked page. */
const WORK =
  /\b(?:client|invoice|quote|proposal|deck|demo|pitch|deal|pricing|contract|lead|pipeline|meeting\s+notes|follow[\s-]?up|onboarding|renewal|vendor|supplier|sprint|standup|release|deploy|bug|ticket)\b/i;

const named = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

/** Whether a line is a private one, and what is worth keeping about it - or null when it is not. */
export function readPrivate(text: string, isContact: boolean): PrivateReading | null {
  const people = new Set<string>();
  const close = CLOSE.exec(text);
  if (close) people.add(named(close[0].toLowerCase()));
  const talked = TALKED.exec(text);
  const who = talked?.[1] ?? "";
  if (who && !NOT_A_NAME.has(who.toLowerCase()) && !CLOSE.test(who)) people.add(named(who));

  const reading = (feeling: Feeling, because: string): PrivateReading => ({ feeling, people: [...people], because });

  if (AFFECTION.test(text)) return reading("affection", "it is about somebody you care for");
  if (REGRET.test(text)) return reading("regret", "it is something you wish had gone differently");
  if (HURT.test(text)) return reading("hurt", "it is about being hurt");
  if (WORRY.test(text)) return reading("worry", "it is a worry of your own");
  if (ANGER.test(text) && (close || talked)) return reading("anger", "it is about a falling out");

  // Somebody close, and a feeling about it: family is private before it is anything else.
  if (close && FELT_IT.test(text)) return reading(/hated|bad|sad|awkward|weird|strange|cry/i.test(text) ? "hurt" : "joy", "it is about somebody close to you");

  // Talked with somebody and it meant something - unless they are a contact, or
  // the line is plainly about work, where the same words are a good meeting.
  if (talked && people.size > 0 && FELT_IT.test(text) && !isContact && !WORK.test(text)) {
    return reading(/hated|bad|sad|awkward|weird|strange|cry|nervous/i.test(text) ? "worry" : "joy", "it is about time with somebody");
  }
  return null;
}

/* ---- As it is kept, and read back ---------------------------------------- */

export const FEELINGS: readonly Feeling[] = ["affection", "regret", "hurt", "worry", "anger", "joy", "other"];

export const FEELING_LABEL: Record<Feeling, string> = {
  affection: "Somebody you care for",
  regret: "Something you would do differently",
  hurt: "Something that hurt",
  worry: "A worry",
  anger: "A falling out",
  joy: "A good moment",
  other: "Private",
};

export const privateInput = z.object({
  text: z.string().trim().min(1, "Write something first.").max(4000, "That is a page, not a line: write it in the journal."),
  feeling: z.enum(["affection", "regret", "hurt", "worry", "anger", "joy", "other"]).default("other"),
  people: z.array(z.string().trim().min(1).max(60)).max(8).default([]),
});
export type PrivateInput = z.input<typeof privateInput>;

export type PrivateLine = { id: string; at: string; text: string; feeling: Feeling; people: string[] };

export type PrivateDay = {
  day: string;
  /** How many there are, which is all that can be said while the journal is locked. */
  count: number;
  /** Some of them are sealed and the journal is not open: `lines` leaves those out. */
  locked: boolean;
  /** Whether there is a passcode at all. Without one nothing here is sealed, and the screen says so. */
  passcode: boolean;
  lines: PrivateLine[];
};
