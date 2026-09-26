import { readCommand, type Command } from "./commands";
import { PRIVATE_PREFIX, readPrivate, type PrivateReading } from "./private";
import { lengthIn, parseQuick } from "./quickadd";
import { expand } from "./slang";
import { slipAt } from "./slips";
import { subjectOf, type Subject } from "./subjects";
import { isLevel, ROOT, trailOf, type Is, type Step } from "./branches";
import { readFact, TRIVIA_PAGE } from "./facts";
import { readListItem } from "./lists";
import { readThought, type Thought } from "./thoughts";
import { readNewPerson } from "./newperson";
import { isSecret, readLifeFact, REMEMBERED_SECTION } from "./lifefacts";

/**
 * One line, and where it belongs (PLAN.md, part four).
 *
 * Today's line takes anything - a task, how the day is going, a call just
 * made, an idea, twenty minutes of guitar - and works out where it goes from
 * what Caulder already knows: the contacts' names, the hobbies, the courses,
 * and the words that say when. No model: the signals are few and regular,
 * and a reading that can be explained is one that can be corrected. The line
 * always shows where it will go, and the chips under it change that before
 * anything is kept.
 *
 * In the order it asks:
 *
 *  1. A prefix says so outright: "journal:", "idea:", "note:", "task:".
 *  2. A contact named: with a call, an email or a meeting still to come -
 *     "call Oakridge tmrw 11" - it is a task for them; otherwise it is
 *     something that happened, and goes on their history.
 *  3. A hobby named with a length or a verb of doing it - "guitar 40 min" -
 *     is time kept on it.
 *  3b. Something reported as done - "meditated", "went to the gym at 5, felt
 *     good" - does everything it implies at once: the open task finished, the
 *     habit ticked, the time kept, the feeling in the journal.
 *  4. Something meant to be done - "submit", "call", "need to", "dont forget"
 *     - or a when still to come - "by friday" - is a task.
 *  5. The first person, a feeling, a day looked back on - "felt", "today
 *     was", "grateful", "shipped the pricing page" - is the journal. "Today"
 *     does not make a task of it: "felt great today" is about today.
 *  6. Anything else is a note, caught and filed later: nothing is lost by
 *     the line being unsure.
 *
 * It is read the way the task line reads - short forms written out, slips
 * mended, the same words for when (shared/quickadd.ts) - so "emial rahul
 * tmrw", "gotta submit the form" and "gutar 40 mins" land where they would
 * have, spelt properly.
 */

export type CaptureKind = "task" | "journal" | "private" | "contact" | "hobby" | "done" | "memory" | "command" | "idea" | "note";

/**
 * Something the line was asked to do rather than to keep (shared/commands.ts)
 * - or, knowing the contacts as this does, to open one of them: "email rahul"
 * with no day on it is not a task, it is wanting to write to Rahul now.
 */
export type Ask =
  | Command
  | { do: "open"; contact: { id: string; name: string }; how: "email" | "call" | "message" | null }
  /** "rahul's number is 98765 43210": the contact's phone or email, set. */
  | { do: "update"; contact: { id: string; name: string }; phone: string | null; email: string | null };

/**
 * One thing a line that reports on the day will do. "Went to the gym, hit legs
 * for 2 hours, feel good" is four of them, and each is shown - and can be
 * switched off - before any of them happens.
 */
export type Effect =
  | { do: "finish"; task: { id: string; title: string } }
  | { do: "tick"; habit: { id: string; name: string } }
  /** Time on a hobby, which is also an hour on the Calendar: at the time it said, or ending now. */
  | { do: "time"; hobby: { id: string; title: string }; minutes: number; startsAt: string | null }
  /** Not a hobby, but it said when or how long: the hour goes on the Calendar all the same, as kept. */
  | { do: "block"; title: string; startsAt: string; minutes: number }
  /**
   * Kept under the page about it, in the brain: what was said about Red Rising,
   * with Red Rising. When there is no page yet - the first thing ever said
   * about the bench press - `topic` is the page it starts and `branch` where
   * that goes. `fact` is the part to read first: "PR: 45 kg × 3".
   */
  | { do: "memory"; page: { id: string; title: string } | null; topic: string | null; branch: Branch | null; trail: Step[]; fact: string | null }
  | { do: "journal" };

export type Known = {
  contacts: readonly { id: string; name: string; person: string | null }[];
  hobbies: readonly { id: string; title: string }[];
  /** The habits being kept, so "meditated" ticks today rather than becoming a note. */
  habits?: readonly { id: string; name: string }[];
  /** What is open and due by today, so "went to the gym" finishes the gym rather than adding another. */
  tasks?: readonly { id: string; title: string }[];
  /** What is already in today's hours, so an hour reported is not set aside twice. */
  blocks?: readonly { title: string }[];
  /** The brain's pages by title, so what is said about one is kept with it. */
  pages?: readonly { id: string; title: string; section: string }[];
};

type CaptureReading = {
  kind: CaptureKind;
  /** The line with a prefix taken off: what is kept. */
  text: string;
  /** A contact the line names, for a task for them or their history. */
  contact: { id: string; name: string } | null;
  /** A hobby the line names, and how long, when it said. */
  hobby: { id: string; title: string } | null;
  minutes: number | null;
  /** Everything the line would do as a report on the day - what "Done" does, whichever kind it was read as. */
  effects: Effect[];
  /** For a memory: the page it is kept under - or, when there is none yet, the page it will start. */
  page: { id: string; title: string } | null;
  topic: string | null;
  /** For a page about to be started: the section it belongs in, and the page it hangs off. */
  branch: Branch | null;
  /** The chain above it, said even for a page the brain has - one that hangs off nothing is hung where it belongs. */
  trail: Step[];
  /** The part of a memory worth reading first, when there is one: "PR: 45 kg × 3". */
  fact: string | null;
  /**
   * For a fact about somebody who is a contact - "amma's bp tablet is telma
   * 40" - the contact their page under People links to. Only then: a line that
   * merely names a contact is not about them.
   */
  about?: { id: string; name: string } | null;
  /** For an idea that is a thing to make: its title, what it should be like, and its links, apart. */
  thought: Thought | null;
  /** What it was asked to do, when it was asked to do something. */
  ask: Ask | null;
  /**
   * For a line that is nobody else's business: who it was about and what kind
   * of feeling it was. Null for any other - and for one moved to Private by
   * hand, which is kept as private all the same.
   */
  secret: PrivateReading | null;
  /** For a contact's history: what kind of entry it is. */
  logged: "call" | "meeting" | "note";
  /** Why, in a few words, for the reading under the line. */
  because: string;
  /** Every kind the line could sensibly go to, for the chips. */
  options: CaptureKind[];
  /**
   * The rules were guessing: the reading came from the fallbacks at the end
   * of readCapture. Only a soft reading is ever given a second opinion by the
   * model on this machine (shared/opinion.ts).
   */
  soft?: boolean;
};

const PREFIX = /^\s*(journal|jrnl|diary|j|idea|note|task|todo|remember|memory|mem|urgent|important|imp|asap|priority)\s*[:\-–!]\s*/i;
/** "Journal good day today": the word alone, when what follows is not something still to come. */
const SAID_JOURNAL = /^\s*(journal|jrnl|diary)\s+(?=\S)/i;

/** Said about something still to come: the start of an instruction. */
const DOING = new Set([
  "call", "ring", "phone", "email", "mail", "message", "text", "whatsapp", "follow", "chase", "remind",
  "send", "submit", "finish", "complete", "write", "draft", "prepare", "prep", "book", "buy", "pay", "fix",
  "read", "revise", "study", "review", "schedule", "plan", "meet", "visit", "go", "get", "make", "update",
  "check", "ask", "tell", "clean", "order", "renew", "file", "register", "apply", "practise", "practice",
  "learn", "do", "start", "sign", "print", "upload", "post", "publish", "ship", "demo", "pitch",
  // Around the house and out of it.
  "pick", "take", "return", "cancel", "water", "bring", "drop", "collect", "grab", "wash", "charge", "pack",
  "cook", "bake", "sweep", "iron", "fold", "refill", "recharge", "feed", "walk", "move", "sell", "donate",
  "withdraw", "deposit", "transfer", "replace", "repair", "install", "download", "backup", "reset",
  // At the desk.
  "reply", "respond", "confirm", "remove", "delete", "add", "create", "build", "design", "test", "deploy",
  "merge", "record", "edit", "scan", "sort", "organise", "organize", "arrange", "set", "setup", "change",
  "invoice", "quote", "research", "find", "search", "compare", "decide", "choose", "discuss", "share",
  "invite", "attend", "join", "rsvp", "finalise", "finalize", "proofread", "rewrite", "outline", "solve",
  "attempt", "memorise", "memorize", "watch", "listen", "present", "rehearse", "negotiate", "close",
  "onboard", "interview", "hire", "dm", "ping", "nudge", "escalate", "approve", "sync",
]);
/** The ones long enough for a slip at them to be told from another word: "sumbit", "finsih". */
const DOING_SLIPS = [...DOING].filter((word) => word.length >= 5);

/** Whether a line starts with something done: "email priya", "buy eggs" - not "eggs", not "priya". */
export function startsWithDoing(text: string): boolean {
  const first = words(expand(text))[0] ?? "";
  return DOING.has(first) || slipAt(first, DOING_SLIPS) !== null;
}

/**
 * Said as something meant to be done, whatever the verb: "need to", "have to",
 * "dont forget", "remind me", "i'll". Read after the short forms are written
 * out, so "gotta", "hafta", "lemme" and "imma" are all here already.
 */
const MEANT =
  /^\s*(?:(?:hey|ok|okay|so|also|oh|please)[\s,]+)*(?:(?:i\s+)?(?:need|have|got|ought|want)\s+to\b|i\s+(?:must|should|shd)\b|i'll\b|i\s+will\b|let\s+me\b|i'?m\s+going\s+to\b|going\s+to\b)|\b(?:remember|rember|remeber|remmber|rmbr|rmb)\s+to\b|\bdon'?t\s+(?:let\s+me\s+)?forget\b|\bremind\s+me\b/i;

/**
 * The same, said in a later clause: "my friends jacket is in my room, have to
 * return it". The first clause is a fact and the second is the point, so the
 * line is a thing to do and not a note. Only after a break in the line - a
 * mid-sentence "need to" ("the doc said i need to rest") is not one.
 */
const MEANT_LATER = /[,;:]\s*(?:(?:i\s+)?(?:need|have|got|ought)\s+to\b|i\s+(?:must|should|shd)\b|gotta\b|hafta\b)/i;

/**
 * A feeling said first - "feeling anxious about tomorrow", "so tired" - is the
 * journal, whatever day it goes on to mention: the tomorrow is what it is
 * about, not when it is due.
 */
const FEELING_WORDS =
  "anxious|nervous|worried|scared|afraid|excited|tired|exhausted|drained|sleepy|sad|down|low|happy|glad|stressed|overwhelmed|lonely|bored|angry|annoyed|irritated|frustrated|grateful|thankful|proud|guilty|burnt\\s+out|burned\\s+out|sick|unwell|motivated|unmotivated|lazy|calm|hopeful|confused|lost|meh|productive|restless|pumped|hyped";
/** Words that are a feeling on their own, and not in "good to go", "fine with it", "great for us". */
const PLAIN_WORDS = "good|great|bad|awful|terrible|amazing|fine|off";
const FEEL_START = new RegExp(
  String.raw`^\s*(?:(?:i\s+(?:am|feel|felt|was)|i'm|im|feeling|felt|so|kinda|really|super)\s+)+(?:(?:so|really|very|kinda|super|pretty|quite|a\s+(?:bit|little))\s+)?(?:(?:${FEELING_WORDS})\b|(?:${PLAIN_WORDS})\b(?!\s+(?:to|with|for|like|enough)\b))`,
  "i",
);

/**
 * A chore said by its name alone - "laundry", "groceries", "dishes" - is a
 * thing to do, not a note to file.
 */
const CHORE =
  /^\s*(?:do\s+(?:the\s+)?)?(?:laundry|groceries|grocery\s+(?:shopping|run)|(?:the\s+)?dishes|ironing|vacuum(?:ing)?|dusting|mopping|trash|garbage|recycling|meal\s+prep|bills|clean(?:ing)?(?:\s+(?:the\s+)?[\p{L}]+)?)\s*[.!]*\s*$/iu;

/** "rahul's number is 98765 43210", "rajesh email rajesh@mspuc.edu": a contact detail, said. */
const PHONE = /(\+?\d[\d\s-]{7,}\d)/;
const EMAIL = /([\w.+-]+@[\w-]+(?:\.[\w-]+)+)/;
const DETAIL_CUE = /\b(?:number|no\.?|phone|mobile|cell|contact|whatsapp|email|e-?mail|mail\s+id|email\s+id)\b/i;

/** Said about something that happened: a contact's history. */
const HAPPENED = /\b(called|rang|spoke|talked|met|emailed|mailed|messaged|texted|replied|said|says|told|asked|agreed|signed|paid|wants|want|loved|liked|declined|no answer|voicemail)\b/i;
const CALLED = /\b(called|rang|spoke|talked|phoned|no answer|voicemail)\b/i;
const MET = /\b(met|meeting|visited)\b/i;

/** Said in the first person, about a day: the journal. */
const FELT =
  /\b(i('m| am| was| felt| feel|'ve| have| had| got| did| don't| do not| can't| cannot)|felt|feeling|today was|(?:good|great|bad|long|amazing|awesome|terrible|awful|productive|lazy|busy|chill|nice|decent|weird|hard|tough|slow|fun|shit|crap|meh)\s+day|couldn't\s+(?:sleep|focus|stop)|can't\s+(?:sleep|focus)|slept\s+(?:badly|well|late|in|early)|rough|tough|awful|terrible|lovely|productive|lazy|tired|exhausted|happy|sad|stressed|anxious|grateful|thankful|proud|frustrated|excited|calm|overwhelmed|slept|mood)\b/i;

/** Thanks said first: "grateful for", "so thankful that", "proud of". */
const THANKS_START = /^\s*(?:(?:i'?m|i\s+am|i\s+feel|feeling|so|really|very|super)\s+)*(?:grateful|thankful|blessed|proud)\s+(?:for|of|to|that)\b/i;

/**
 * A thought floated, not a thing to do: "what if", "could partner with coaching
 * centres", "we should try a referral scheme", "how about a yearly plan". Not
 * "could you send it" - that is asking somebody - and not "should call rahul",
 * which is a thing to do said softly.
 */
const IDEA =
  /^\s*(?:what\s+if|maybe\s+(?:we\s+)?(?:could|should)|idea\b|(?:we\s+)?could\s+(?!(?:you|u|i|he|she|they)\b)\w+|(?:we\s+)?should\s+(?:try|build|make|start|launch|offer|add|experiment|pilot)\b|how\s+about\s+(?:a|an|we|making|building|trying|adding|offering)\b|what\s+about\s+(?:a|an|making|building|trying|adding|offering)\b)/i;

/** A line that starts by saying what was done - "shipped the pricing page" - is the day, looked back on. */
const NOT_PAST = new Set(["need", "feed", "seed", "speed", "red", "bed", "shed", "embed", "proceed", "exceed", "succeed"]);
const doneWord = (word: string) => word.length > 4 && word.endsWith("ed") && !NOT_PAST.has(word);

const DID_IT = /\b(played|practised|practiced|ran|run|swam|drew|painted|read|wrote|trained|did|gym|climbed|cooked|jammed|session)\b/i;

/**
 * A length, read by the one reader the task line uses - so "1h30", "an hour
 * and a half" and "45 minuts" are the same length here as they are there.
 */
export function minutesIn(text: string): number | null {
  const minutes = lengthIn(text);
  return minutes !== null && minutes > 0 && minutes <= 12 * 60 ? minutes : null;
}

function words(text: string): string[] {
  return text.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? [];
}

/** The names one person in the family goes by: a contact saved as any of them is called by all of them. */
const FAMILY: readonly (readonly string[])[] = [
  ["mom", "mum", "mummy", "mommy", "mother", "amma", "maa", "ammi", "aai", "mumma"],
  ["dad", "daddy", "papa", "pappa", "father", "appa", "baba", "abbu", "pitaji", "pops"],
  ["bro", "brother", "bhai", "bhaiya", "bhaiyya"],
  ["sis", "sister", "didi", "behen", "akka", "chechi"],
  ["grandma", "granny", "nani", "dadi", "ammamma", "paati", "ajji"],
  ["grandpa", "thatha", "ajja", "dadu"],
];

/**
 * The contact a line names: their whole name or its start, or the name of the
 * person there, as whole words. The longest match wins, so "Oakridge
 * International" beats "Oakridge". A name has to be three letters or more to
 * count.
 */
export function namedContact(text: string, contacts: Known["contacts"]): { id: string; name: string } | null {
  const lower = ` ${words(text.replace(/['’]s\b/gi, "")).join(" ")} `;
  let best: { id: string; name: string; length: number } | null = null;
  for (const contact of contacts) {
    for (const candidate of [contact.name, contact.person]) {
      if (!candidate) continue;
      const said = words(candidate).join(" ");
      if (said.length < 3) continue;
      // The whole name, or the start of it: two words or more ("GIG International" for
      // "GIG International School"), or one distinctive word ("Oakridge").
      const parts = said.split(" ");
      const tries = parts
        .map((_, index) => parts.slice(0, index + 1).join(" "))
        .filter((phrase, index) => index === parts.length - 1 || index >= 1 || phrase.length >= 5);
      for (const phrase of tries) {
        if (lower.includes(` ${phrase} `) && (!best || phrase.length > best.length)) {
          best = { id: contact.id, name: contact.name, length: phrase.length };
        }
      }
    }
  }
  if (best) return { id: best.id, name: best.name };

  // Family, called what the line calls them: "mom" is the contact saved as Mummy or Amma.
  for (const contact of contacts) {
    for (const candidate of [contact.name, contact.person]) {
      const family = FAMILY.find((names) => names.includes(words(candidate ?? "").join(" ")));
      if (family?.some((name) => lower.includes(` ${name} `))) return { id: contact.id, name: contact.name };
    }
  }

  // Nobody named outright: a slip at the first word of a name - "oakrigde",
  // "pirya" - is still them. Only when exactly one contact answers to it.
  const firsts = new Map<string, { id: string; name: string } | null>();
  for (const contact of contacts) {
    for (const candidate of [contact.name, contact.person]) {
      const word = words(candidate ?? "")[0] ?? "";
      if (word.length < 5) continue;
      const held = firsts.get(word);
      firsts.set(word, held === undefined || held?.id === contact.id ? { id: contact.id, name: contact.name } : null);
    }
  }
  for (const word of words(text)) {
    const aimed = slipAt(word, firsts.keys());
    const found = aimed ? firsts.get(aimed) : null;
    if (found) return found;
  }
  return null;
}

function namedHobby(text: string, hobbies: Known["hobbies"]): { id: string; title: string } | null {
  const lower = ` ${words(text).join(" ")} `;
  const found = hobbies
    .map((hobby) => ({ hobby, said: words(hobby.title).join(" ") }))
    .filter(({ said }) => said.length >= 3 && lower.includes(` ${said} `))
    .sort((a, b) => b.said.length - a.said.length)[0];
  if (found) return found.hobby;
  // "Gutar 40 min": a slip at a hobby that is one word.
  const single = new Map(hobbies.map((hobby) => [words(hobby.title).join(" "), hobby] as const));
  for (const word of words(text)) {
    const aimed = slipAt(word, [...single.keys()].filter((title) => !title.includes(" ")));
    if (aimed) return single.get(aimed) ?? null;
  }
  return null;
}

/** Said of a habit: it happened. */
const DONE = /\b(done|did|finished|completed|complete|ticked|tick|check(?:ed)?\s+off|nailed|✓|✅)\b|[✓✅]/iu;
/** The words that say nothing about which habit: "did my meditation today". */
const AROUND_A_HABIT = new Set([
  "i", "my", "the", "a", "an", "did", "done", "with", "today", "for", "just", "finished", "completed",
  "some", "session", "of", "went", "to", "at", "hit", "had", "this", "morning", "evening", "tonight",
]);

/**
 * The same word in another form: "meditated" and "meditation" are "meditate".
 * Four letters of shared beginning - "study" and "studied" - or the whole of a
 * shorter word, which is as much grammar as a line like this needs.
 */
/** "drank" is Drink water, "slept" is Sleep by 11: the plain form a habit or a task is named in. */
const IRREGULAR: Record<string, string> = {
  drank: "drink", ate: "eat", slept: "sleep", ran: "run", swam: "swim", went: "go", wrote: "write", woke: "wake",
  rode: "ride", sang: "sing", drew: "draw", took: "take", did: "do", made: "make", bought: "buy", fed: "feed",
  meditated: "meditate", practised: "practise", practiced: "practice", stretched: "stretch", journaled: "journal",
};
const plainly = (said: string[]) => said.map((word) => IRREGULAR[word] ?? word);

function sameStem(a: string, b: string): boolean {
  const need = Math.min(4, a.length, b.length);
  if (need < 3) return false;
  let shared = 0;
  while (shared < a.length && shared < b.length && a[shared] === b[shared]) shared += 1;
  return shared >= need && shared >= Math.min(a.length, b.length) - 2;
}

/**
 * The habit a line names, and whether the line is nothing but that habit.
 *
 * Every word of the habit that carries meaning has to be there, in some form
 * or mistyped - "Morning walk" is not ticked by a line about the morning. A
 * line that is only the habit - "meditated", "gym" - is said as done without
 * needing the word.
 */
function namedHabit(
  text: string,
  habits: NonNullable<Known["habits"]>,
  /**
   * What the line is part of, added by the reader rather than said - the
   * Reading a book hangs off. It can name a habit, but it never says one was
   * done: "book train tickets" hung off Reading is not "reading" said.
   */
  implied = "",
): { habit: { id: string; name: string }; done: boolean } | null {
  const said = plainly(words(text));
  const added = plainly(words(implied)).filter((word) => !said.includes(word));
  const heard = [...said, ...added];
  let best: { habit: { id: string; name: string }; done: boolean; size: number } | null = null;
  for (const habit of habits) {
    const all = words(habit.name).filter((word) => !/^\d+$/.test(word));
    const telling = all.filter((word) => word.length >= 4);
    const names = telling.length > 0 ? telling : all;
    if (names.length === 0) continue;
    const hit = (name: string) => heard.filter((word) => word === name || sameStem(word, name) || slipAt(word, [name]) === name);
    const hits = names.map(hit);
    if (hits.some((found) => found.length === 0)) continue;
    const used = new Set(hits.flat());
    const rest = said.filter((word) => !used.has(word) && !AROUND_A_HABIT.has(word) && !/^\d+$/.test(word));
    // Said in another form than its name - "meditated" for Meditate - is said as done.
    const past = [...used].some((word) => /(?:ed|ing)$/.test(word) && !all.includes(word) && said.includes(word));
    const size = names.join(" ").length;
    if (!best || size > best.size) best = { habit: { id: habit.id, name: habit.name }, done: rest.length === 0 || past, size };
  }
  return best ? { habit: best.habit, done: best.done } : null;
}

/* ---- A day reported ------------------------------------------------------ */

/** Said in the past, at the start: what was done rather than what is to do. */
const PAST_START =
  /^\s*(?:i\s+)?(?:just\s+)?(?:went|did|finished|completed|attended|visited|hit|ran|swam|played|practi[sc]ed|studied|revised|worked|cooked|cleaned|walked|cycled|trained|lifted|watched|wrote|submitted|sent|paid|bought|learnt|learned|tried|started|began|managed|mastered|nailed|sang|recorded|memori[sz]ed|figured\s+out|picked\s+up|got\s+(?:to|through|back)|slept|woke\s+up|ate|drank|meditated|stretched|journaled|made|saw|gave|took|had|finally\s+\w+ed)\b/i;
/**
 * Said of what was not done: "skipped gym today", "I didn't go to office",
 * "couldn't finish the report". About the day all the same - but it finishes
 * nothing, ticks nothing and takes no hour on the Calendar.
 */
const NOT_DONE =
  /^\s*(?:i\s+)?(?:(?:totally|completely|just)\s+)?(?:didn'?t|did\s+not|couldn'?t|could\s+not|wasn'?t\s+able\s+to|was\s+not\s+able\s+to|never\s+(?:got|went|did|made)|skipped|bunked|ditched|failed\s+to|gave\s+up\s+on)\b/i;
/** A clause that looks back: what makes "read red rising today, loved chapter 25" a report and not a to-do. */
const LOOKED_BACK =
  /\b(?:loved|liked|enjoyed|hated|felt|feel(?:s|ing)?\s+(?:so\s+|really\s+|pretty\s+)?(?:good|great|bad|tired|sore|amazing|strong|better|awful|fresh|pumped|dead)|(?:it|that|this)\s+was|was\s+(?:so\s+|really\s+)?(?:good|great|fun|tough|hard|boring|amazing|intense|brutal)|went\s+(?:well|badly|great|okay|ok)|crushed|nailed|smashed|killed\s+it|pr|pb|personal\s+(?:best|record)|had\s+(?:so\s+much\s+|a\s+lot\s+of\s+)?fun|had\s+a\s+(?:blast|great\s+time)|(?:is|are|was|were)\s+(?:quite\s+|so\s+|really\s+|very\s+|pretty\s+)?(?:burning|sore|dead|on\s+fire|killing\s+me|difficult|hard|easy|tricky|tough|fun))\b/i;
/** What a report says before it says what it was: "i went to the". */
const REPORT_LEAD =
  /^(?:i\s+)?(?:just\s+)?(?:went\s+(?:to|for)|did|finished|completed|attended|visited|had|hit|got\s+(?:to|through))\s+(?:the\s+|my\s+|a\s+|an\s+|some\s+)?/i;

/**
 * The open tasks a line is about: every word of the title that carries
 * meaning is in the line, in some form - or, for a long title, most of them.
 * Only ever asked about what is due by today, which is a short list.
 */
function matchingTasks(text: string, tasks: NonNullable<Known["tasks"]>): { id: string; title: string }[] {
  const said = plainly(words(text));
  const found: { task: { id: string; title: string }; hits: number }[] = [];
  for (const task of tasks) {
    const names = words(task.title).filter((word) => word.length >= 3 && !AROUND_A_HABIT.has(word) && !/^\d+$/.test(word));
    if (names.length === 0) continue;
    const hits = names.filter((name) => said.some((word) => word === name || sameStem(word, name) || slipAt(word, [name]) === name)).length;
    if (hits === names.length || (hits >= 2 && hits / names.length >= 0.6)) found.push({ task: { id: task.id, title: task.title }, hits });
  }
  return found.sort((a, b) => b.hits - a.hits).map(({ task }) => task);
}

/* ---- Memories, and where they branch from -------------------------------- */

/** The brain page a line is about: its whole title, as whole words. The longest title wins. */
function namedPage(text: string, pages: NonNullable<Known["pages"]>): { id: string; title: string } | null {
  const lower = ` ${words(text).join(" ")} `;
  let best: { id: string; title: string } | null = null;
  for (const page of pages) {
    const title = words(page.title).join(" ");
    if (title.length < 4 || title === "untitled" || isLevel(page.title) || !lower.includes(` ${title} `)) continue;
    if (!best || title.length > words(best.title).join(" ").length) best = { id: page.id, title: page.title };
  }
  return best;
}

const NOT_A_TOPIC = new Set([
  "it", "this", "that", "these", "those", "he", "she", "they", "there", "here", "today", "tomorrow", "yesterday",
  "i", "we", "you", "my", "our", "the", "a", "an", "what", "who", "which", "everything", "nothing", "something",
]);

/** Said to be a book, a film, a song, a game: the words that make "The ..." a title rather than an article. */
const SAID_A_KIND = /\b(?:is|was)\s+(?:the|a|an|my|our|one\s+of)\s+(?:[\p{L}-]+\s+){0,3}?(?:books?|novels?|movies?|films?|shows?|series|anime|songs?|albums?|games?|documentar(?:y|ies))\b/iu;

/**
 * "Red rising is the first book of the red rising series": a thing, said what
 * it is. The thing is the topic - up to four words, and not a pronoun - and a
 * page is started for it.
 */
function newTopic(text: string): string | null {
  const match = /^\s*(?:remember\s+that\s+|note\s+that\s+|fyi\s+)?((?:[\p{L}\p{N}'&-]+\s+){0,3}[\p{L}\p{N}'&-]+)\s+(?:is|was|are|were)\s+(?:the|a|an|my|our|one\s+of)\s+\S/iu.exec(text);
  const topic = (match?.[1] ?? "").trim();
  const opens = (words(topic)[0] ?? "").toLowerCase();
  // "The meeting was a mess" names nothing; "The Two Towers is a movie" names a film
  // whose title happens to start that way, and says so by saying what it is.
  const aTitle = opens === "the" && words(topic).length > 1 && SAID_A_KIND.test(text);
  if (!topic || (NOT_A_TOPIC.has(opens) && !aTitle)) return null;
  return topic.replace(/(^|[\s-])(\p{Ll})/gu, (_whole, lead: string, letter: string) => lead + letter.toUpperCase());
}

/** "Remember: the wifi password is on the fridge" names no topic; its first words are the best there is. */
function fallbackTopic(text: string): string {
  const title = text.split(/\s+/).slice(0, 5).join(" ").replace(/[,.;:!?]+$/, "");
  return title.charAt(0).toUpperCase() + title.slice(1);
}

/** Where what was done stops and what it was like begins: "gym | hit legs, feel good". */
const CUT_SHORT = /,|\b(?:and|then|hit|feel|feeling|felt|was|loved)\b/i;

type Branch = {
  section: "hobbies" | "studies" | "ideas" | "remembered";
  /** The page it hangs off, when the brain already has it. */
  parent: { id: string; title: string } | null;
  /** The whole way down to it, from Me: every level, whether or not it exists yet. See shared/branches.ts. */
  trail: Step[];
};

/**
 * Where a new memory belongs, from what it said it is. A book is a hobby and
 * hangs off the page about reading; a course is a study. Anything else starts
 * in Ideas, which is where a page with no better home has always gone.
 */
/**
 * `trunk` is the hobby a thing of this kind is part of, by the name it is
 * started under when the brain has no page for it yet: somebody keeping track
 * of the books they read has Reading for a hobby, whether or not they said so.
 */
const BRANCHES: readonly { says: RegExp; is: Is; section: Branch["section"]; parent: RegExp | null; trunk: string | null }[] = [
  { says: /\b(?:books?|novels?|trilogy|author|chapters?|audiobooks?|manga|comics?)\b/i, is: "book", section: "hobbies", parent: /\b(?:read|book|novel|literature)/i, trunk: "Reading" },
  { says: /\b(?:movies?|films?|shows?|anime|documentar(?:y|ies)|episodes?|seasons?)\b/i, is: "film", section: "hobbies", parent: /\b(?:movie|film|watch|cinema|show|anime|tv)/i, trunk: "Films and shows" },
  { says: /\b(?:songs?|albums?|bands?|artists?|playlists?|chords?|riffs?)\b/i, is: "song", section: "hobbies", parent: /\b(?:music|guitar|piano|sing(?:ing)?\b|song|drum)/i, trunk: "Music" },
  { says: /\b(?:games?|gaming|bosses|levels?|quests?)\b/i, is: "game", section: "hobbies", parent: /\bgam/i, trunk: "Gaming" },
  { says: /\b(?:recipes?|dish(?:es)?|cuisine|baking)\b/i, is: "recipe", section: "hobbies", parent: /\b(?:cook|bak|food|recipe)/i, trunk: "Cooking" },
  { says: /\b(?:workouts?|exercises?|lifts?|squats?|deadlifts?|bench|yoga|running)\b/i, is: "exercise", section: "hobbies", parent: /\b(?:gym|fitness|workout|run|yoga|sport|lift)/i, trunk: "Gym" },
  { says: /\b(?:courses?|subjects?|professors?|textbooks?|syllabus|lectures?|exams?|semesters?|theorems?|algorithms?)\b/i, is: "course", section: "studies", parent: null, trunk: null },
];

/** A word of each kind of subject, in the terms the branches are told apart by. */
const SAYS_KIND: Record<Subject["kind"], string> = {
  exercise: "workout", song: "song", book: "book", film: "movie", game: "game", recipe: "recipe", course: "course", thing: "",
};

/** A level the line made - "Fantasy books", "Red Rising series" - which is never the hobby itself, whatever word is in it. */
const A_LEVEL = /\s(?:books|films|series)$/i;

function branchOf(
  text: string,
  pages: NonNullable<Known["pages"]>,
  hobbies: Known["hobbies"],
  topic: string,
  kind?: Subject["kind"],
): Branch {
  // What the subject was found to be says more than any word that happens to be in the line.
  const told = kind ? SAYS_KIND[kind] : "";
  // Said first wins: "a movie in the ... trilogy" is a film, though a trilogy is usually books.
  const heard = told || text;
  const branch = BRANCHES.map((each) => ({ each, at: heard.search(each.says) }))
    .filter(({ at }) => at >= 0)
    .sort((a, b) => a.at - b.at)[0]?.each;
  // Nothing it is part of: it hangs off you, which is still somewhere.
  if (!branch) return { section: "ideas", parent: null, trail: [ROOT] };
  // The hobby it is part of is one of your hobbies, when you have one that fits:
  // "Fantasy books" has "book" in it too, and is a shelf in Reading, not Reading.
  const yours = branch.parent ? hobbies.filter((hobby) => branch.parent?.test(hobby.title) && !A_LEVEL.test(hobby.title)) : [];
  const others = branch.parent
    ? pages.filter((page) => page.section === branch.section && branch.parent?.test(page.title) && !A_LEVEL.test(page.title))
    : [];
  // Your hobbies first, so with nothing named in the line it is a hobby that is chosen and not a page that merely fits.
  const among = [...yours, ...others.filter((page) => !yours.some((hobby) => hobby.id === page.id))];
  // Guitar and Piano are both where a song could hang: the one the line names, when it names one.
  const lower = ` ${words(text).join(" ")} `;
  const parent = among.find((page) => lower.includes(` ${words(page.title).join(" ")} `)) ?? among[0];
  // The hobby itself: the page there is, by its own name, or the one to start.
  const trunk: Step | null = parent
    ? { title: parent.title, section: branch.section, template: "hobby" }
    : branch.trunk
      ? { title: branch.trunk, section: branch.section, template: "hobby" }
      : null;
  return {
    section: branch.section,
    parent: parent ? { id: parent.id, title: parent.title } : null,
    trail: trailOf({ section: branch.section, trunk, is: branch.is, text, topic }),
  };
}

/** "Lateral raise" and "Lateral Raises" are one page: a title, with its plurals taken off. */
function pageTitled(topic: string, pages: NonNullable<Known["pages"]>): { id: string; title: string } | null {
  const plain = (title: string) => words(title).map((word) => word.replace(/(?:es|s)$/, "")).join(" ");
  const found = pages.find((page) => plain(page.title) === plain(topic));
  return found ? { id: found.id, title: found.title } : null;
}

/** Whether a line says when, and what it says - read by the task line's own reader. */
function whenIn(
  text: string,
  clock: { today: string; now: number },
): {
  timed: boolean;
  ahead: boolean;
  day: string | null;
  time: string | null;
  /** "At 9", which the task line would ask about: the morning and the evening it could be. */
  either: string[];
  repeats: boolean;
  title: string;
} {
  const { task, questions } = parseQuick(text, clock);
  const either = questions.flatMap((question) => (question.id === "meridiem" ? question.options.map((option) => option.time) : []));
  const asked = questions.some((question) => question.id === "meridiem" || question.id === "past" || question.id === "until");
  const timed = task.day !== null || task.time !== null || task.repeat !== null || asked;
  // "Today" alone is as often the day looked back on as a day something is due.
  const onlyToday = !asked && task.day === clock.today && task.time === null && task.repeat === null;
  return { timed, ahead: timed && !onlyToday, day: task.day, time: task.time, either, repeats: task.repeat !== null, title: task.title };
}

/** A heading and what is said under it: "atomic habits: 1% better every day". */
const HEADED = /^\s*([^:\n]{2,40}):\s+(\S.*)$/;
/** What starts a when: "gym: every day at 6", "dentist: tomorrow 5", "call: 9am". Not "1%". */
const WHEN_FIRST =
  /^(?:every|each|daily|weekly|monthly|today|tonight|tomorrow|tmrw|tmr|mon|tues?|wed|thu|thurs|fri|sat|sun|next|this|at|on|by|from|in\s+\d|\d{1,2}(?:[:.]\d{2})?\s*(?:am|pm)?(?![\d%.,]))\b/i;

/**
 * "Atomic habits: 1% better every day" is a line about a book, and "every
 * day" is in what it says - not when anything is due. After a heading a when
 * counts only when it is what the heading is told: it comes first ("gym: every
 * day at 6"), or something to do does ("dentist: go at 5").
 */
function whenOnlyInPassing(said: string): boolean {
  const headed = HEADED.exec(said);
  if (!headed) return false;
  const told = (headed[2] ?? "").trim();
  if (WHEN_FIRST.test(told) || MEANT.test(told)) return false;
  return !DOING.has(words(told)[0] ?? "");
}

export function readCapture(
  line: string,
  known: Known,
  /** The workspace's clock. Only "is it today" turns on it, so a reading without one still reads. */
  clock: { today: string; now: number } = { today: "2026-01-01", now: 9 * 60 },
): CaptureReading {
  // "Private: ..." says so outright, and nothing else about the line is looked at.
  const hush = PRIVATE_PREFIX.exec(line);
  if (hush) {
    const kept = line.slice(hush[0].length).trim();
    return {
      kind: "private", text: kept, contact: null, hobby: null, minutes: null, effects: [], page: null, topic: null,
      branch: null, trail: [], fact: null, thought: null, ask: null, logged: "note", because: "you said it was private",
      secret: readPrivate(kept, false) ?? { feeling: "other", people: [], because: "you said it was private" },
      options: ["private", "journal", "note"],
    };
  }

  const prefix = PREFIX.exec(line);
  // "Journal good day today" - but "journal for ten minutes tomorrow" is a
  // thing to do, and keeps its first word.
  const opener = prefix ? null : SAID_JOURNAL.exec(line);
  const journal = opener !== null && !whenIn(line, clock).ahead;
  const cut = prefix ?? (journal ? opener : null);
  const text = cut ? line.slice(cut[0].length).trim() : line.trim();
  // Read as it would have been said; kept as it was typed. A journal line is
  // theirs, and "ion feel great" is not improved by being corrected.
  const said = expand(text);
  const contact = namedContact(said, known.contacts);
  const hobby = namedHobby(said, known.hobbies);
  const minutes = minutesIn(said);
  const logged: CaptureReading["logged"] = CALLED.test(said) ? "call" : MET.test(said) ? "meeting" : "note";
  const spoken = words(said);
  const first = spoken[0] ?? "";
  const when = whenOnlyInPassing(said)
    ? { timed: false, ahead: false, day: null, time: null, either: [], repeats: false, title: said }
    : whenIn(text, clock);
  const { timed } = when;
  const doing = (word: string) => DOING.has(word) || slipAt(word, DOING_SLIPS) !== null;
  const instruction =
    doing(first) ||
    (first === "don't" && doing(spoken[2] ?? "")) ||
    MEANT.test(said) ||
    MEANT_LATER.test(said) ||
    CHORE.test(said) ||
    // "feeling like pizza tonight, order dominos": a later clause that gives an order is the point of the line.
    said.split(/[,;]/).slice(1).some((clause) => doing(words(clause)[0] ?? ""));

  // What the line is about, when it is about one thing: the bench press, a
  // song called Riptide. Its own page when it has one, and the page it starts
  // when it does not - rather than whatever other page the line happens to name.
  const pages = known.pages ?? [];
  const subject = subjectOf(said);
  const opensWith = subject ? null : newTopic(said);
  // "Golden Son is a book in the Red Rising series" is about Golden Son. The
  // series it names is where it hangs, not the page it goes on.
  const page = subject ? pageTitled(subject.topic, pages) : opensWith ? pageTitled(opensWith, pages) : namedPage(said, pages);
  const named = page ? null : (opensWith ?? subject?.topic ?? null);
  const branch = branchOf(said, pages, known.hobbies, page?.title ?? named ?? "", subject?.kind);
  // A course called by its letters is written in them: DBMS, not Dbms.
  const topic = named !== null && branch.section === "studies" && /^[A-Za-z]{2,4}$/.test(named) ? named.toUpperCase() : named;
  // A page hangs off what it is part of, and talking about the one is doing
  // the other: a PR on the bench press is a day at the gym.
  // A lift is a day at the gym; a run, a ride or a swim is its own thing, and finishes no gym task.
  const cardio = subject !== null && /^(?:running|cycling|hiking|swimming|walking|body weight)$/i.test(subject.topic);
  const implied = cardio ? "" : (branch.parent?.title ?? (subject?.kind === "exercise" ? "gym" : ""));
  const about = implied ? `${said} ${implied}` : said;
  const habit = namedHabit(said, known.habits ?? [], implied);

  // A day reported: said in the past, or with a clause that looks back, and
  // not about a day still to come. "Went to the gym at 5" says when it was,
  // not when it is due - so a time does not make a task of it.
  const notDone = NOT_DONE.test(said);
  const looksBack =
    notDone || PAST_START.test(said) || doneWord(first) || LOOKED_BACK.test(said) || DONE.test(said) || habit?.done === true;
  const toCome = when.repeats || (when.day !== null && when.day > clock.today);
  const reports = looksBack && !toCome && !MEANT.test(said);
  const ahead = when.ahead && !reports;

  const effects: Effect[] = [];
  if (reports && !notDone) {
    for (const task of matchingTasks(about, known.tasks ?? []).slice(0, 2)) effects.push({ do: "finish", task });
    if (habit) effects.push({ do: "tick", habit: habit.habit });
    // What was done took up part of the day, so it goes on the Calendar: at the
    // hour it said, or - the way time on a hobby has always been kept - ending
    // now. Once only: not when today already has it.
    const title = (when.title.replace(REPORT_LEAD, "").split(CUT_SHORT)[0] ?? "").trim();
    const already = (known.blocks ?? []).some((block) => matchingTasks(said, [{ id: "", title: block.title }]).length > 0);
    // Already done, so whichever reading of the hour has already gone: "at 9"
    // is nine this morning, and "at 5", said at ten, was five this morning too.
    const minutesOf = (time: string) => {
      const [hour = 0, minute = 0] = time.split(":").map(Number);
      return hour * 60 + minute;
    };
    const gone = when.either.map(minutesOf).filter((each) => each <= clock.now).sort((a, b) => b - a)[0];
    const said24 = when.time !== null ? minutesOf(when.time) : (gone ?? (when.either[0] ? minutesOf(when.either[0]) : null));
    const clockOf = (at: number) => `${String(Math.floor(at / 60)).padStart(2, "0")}:${String(at % 60).padStart(2, "0")}`;
    const began = said24 === null ? null : said24 > clock.now && said24 >= 12 * 60 ? said24 - 12 * 60 : said24;
    if (hobby && minutes !== null) {
      effects.push({ do: "time", hobby, minutes, startsAt: began === null ? null : clockOf(began) });
    } else if (title && !already && (began !== null || minutes !== null) && !/^(?:slept|woke|sleep|wake)\b/i.test(title)) {
      // What was done took time on the Calendar; a night's sleep reported is not an hour to block out.
      const length = minutes ?? 60;
      // No hour said, only how long: it has just ended.
      const at = began ?? Math.max(0, Math.floor((clock.now - length) / 5) * 5);
      effects.push({ do: "block", title: title.charAt(0).toUpperCase() + title.slice(1), startsAt: clockOf(at), minutes: length });
    }
    if (page || topic) effects.push({ do: "memory", page, topic, branch: page ? null : branch, trail: branch.trail, fact: subject?.fact ?? null });
    // The feeling goes in the journal - but only alongside something else: a
    // line that is nothing but the feeling is simply a journal line.
    if (effects.length > 0 && (FELT.test(said) || LOOKED_BACK.test(said))) effects.push({ do: "journal" });
  }

  // Asked to do something: go somewhere, log money, add a contact - or reach
  // one now. "Call oakridge tmrw 11" has a when and is a task; "call oakridge"
  // has none, and means now.
  // "Send an email to rahul from orchids school", "i want to call ms puc college,
  // rajesh". Wanting to is now; needing to is a thing for the list.
  const reach =
    /^\s*(?:(?:please|pls|can\s+you|could\s+you|i\s+want\s+to|i'd\s+like\s+to|i\s+would\s+like\s+to|want\s+to|let\s+me|let's|lets)\s+)*(?:(?:send|write|draft|shoot|drop)\s+(?:an?\s+|the\s+)?(email|mail|message|whatsapp|text|dm)\s+(?:to|for)\b|(?:give|make)\s+(?:an?\s+)?(call)\s+to\b|(email|mail|call|ring|phone|dial|whatsapp|message|text|dm|open|show|find)\b)/i.exec(
      said,
    );
  const verb = (reach?.[1] ?? reach?.[2] ?? reach?.[3] ?? "").toLowerCase();
  const obliged = /\b(?:need|have|got|ought)\s+to\b|\b(?:must|should|shd)\b|\b(?:remember|rmb)\s+to\b|\bforget\b|\bremind\b/i.test(said);
  const asked = prefix ? null : readCommand(said);
  // Somebody new, told about the way you would tell a friend: kept as a contact,
  // with what happened and what to do about them (shared/newperson.ts).
  const met = prefix || contact || asked ? null : readNewPerson(said, known.contacts, clock, doing);
  // "The plumber's number is 98450 12345": somebody you will want to ring again, kept as a contact.
  const serviceNumber =
    prefix || contact || asked ? null : /^(?:the\s+|my\s+|our\s+)?([\p{L}][\p{L} ]{1,30}?)(?:'s|s'|’s)\s+(?:number|phone(?:\s+number)?|mobile|contact(?:\s+number)?)\s+(?:is\s+|:\s*|-\s*)?(\+?\d[\d\s-]{6,}\d)\s*$/iu.exec(said);
  const introduced: Ask | null = serviceNumber
    ? {
        do: "contact",
        name: (serviceNumber[1] ?? "").trim().replace(/^\p{L}/u, (first) => first.toUpperCase()),
        person: null,
        phone: (serviceNumber[2] ?? "").replace(/[\s-]+/g, " ").trim(),
        email: null,
      }
    : met
    ? {
        do: "contact",
        name: met.company,
        person: met.name,
        phone: PHONE.exec(said)?.[1]?.replace(/[\s-]+/g, " ").trim() ?? null,
        email: EMAIL.exec(said)?.[1] ?? null,
        role: met.role,
        source: met.source,
        happened: met.happened,
        then: met.then,
      }
    : null;
  // A number or an address, said of somebody who is already a contact: theirs, set - not a new contact.
  const detailPhone = contact && DETAIL_CUE.test(said) ? (PHONE.exec(said)?.[1]?.replace(/[\s-]+/g, " ").trim() ?? null) : null;
  const detailEmail = contact && (DETAIL_CUE.test(said) || EMAIL.test(said)) ? (EMAIL.exec(said)?.[1] ?? null) : null;
  const detail: Ask | null =
    contact && (detailPhone || detailEmail) && !timed ? { do: "update", contact, phone: detailPhone, email: detailEmail } : null;
  const ask: Ask | null = prefix
    ? null
    : detail ?? introduced ?? ((asked?.do === "book" && (when.repeats || (when.day !== null && when.day > clock.today)) ? null : asked) ??
      (contact && reach && !timed && !obliged
        ? {
            do: "open",
            contact,
            how: /mail/.test(verb) ? "email" : /call|ring|phone|dial/.test(verb) ? "call" : /whatsapp|message|text|dm/.test(verb) ? "message" : null,
          }
        : null));

  // Nobody else's business: read before anything helpful can be done with it.
  // Not when it is still to come - "i need to apologise to mum" is wanted on the
  // list of things to do, by the person who typed it there.
  const later = when.repeats || (when.day !== null && when.day > clock.today);
  const secret = prefix || MEANT.test(said) || later ? null : readPrivate(said, contact !== null);

  // Something to make - "edit on helicopter, grunge dark edit" - which opens with
  // a word that is also a verb, and is not an instruction for all that.
  const thought = prefix || MEANT.test(said) || later ? null : readThought(text);

  // Something learnt, of the kind a quizzer collects. All of them go on one
  // page; a line about a page the brain has, or about something with a page
  // of its own to start (a song, a lift), is that page's and not this one's.
  const trivia = prefix || page || subject || MEANT.test(said) || later ? null : readFact(text);

  // An item for one of the lists people keep - a film to watch, a gift idea, a quote, a link for later.
  const listed = prefix || MEANT.test(said) || later ? null : readListItem(text);

  // What a life is made of - about you, the people in it, where things are,
  // what was lent (shared/lifefacts.ts) - and a password, which is never a memory.
  const keepSafe = !MEANT.test(said) && isSecret(said);
  const life = keepSafe || (prefix && !/^(?:remember|memory|mem)$/i.test(prefix[1] ?? "")) ? null : readLifeFact(said, known.contacts);

  // Private is always one press away, whatever the line was read as.
  const options: CaptureKind[] = ask || listed?.kind === "book" ? ["command", "task", "journal", "private"] : ["task", "journal", "private"];
  if (contact) options.push("contact");
  if (hobby) options.push("hobby");
  if (effects.length > 0) options.push("done");
  if (page || topic || trivia || life || listed?.kind === "page") options.push("memory");
  options.push("idea", "note");

  const reading = (kind: CaptureKind, because: string): CaptureReading => ({
    kind,
    text,
    contact,
    hobby,
    minutes,
    effects,
    page,
    topic: page ? null : (topic ?? fallbackTopic(text)),
    branch: page ? null : branch,
    trail: branch.trail,
    fact: subject?.fact ?? null,
    // Read from the line as typed: a link is not something to write out the short forms of.
    thought,
    ask,
    secret,
    logged,
    because,
    options,
  });

  // A life fact, on its own page under Remembered: About me, Mummy, Where things are.
  const remembered = (because: string): CaptureReading => {
    const kept = life ? pageTitled(life.page, pages) : null;
    return {
      ...reading("memory", because),
      page: kept,
      topic: kept ? null : (life?.page ?? null),
      branch: kept ? null : { section: REMEMBERED_SECTION, parent: null, trail: [] },
      trail: life?.trail ?? [],
      fact: life?.fact ?? null,
      about: life?.contact ?? null,
    };
  };

  if (prefix) {
    const word = (prefix[1] ?? "").toLowerCase();
    if (life && (word === "remember" || word === "memory" || word === "mem")) return remembered(`it is about ${life.page === "About me" ? "you" : life.page}`);
    const kind: CaptureKind =
      word === "j" || word === "journal" || word === "jrnl" || word === "diary"
        ? "journal"
        : word === "idea"
          ? "idea"
          : word === "note"
            ? "note"
            : word === "remember" || word === "memory" || word === "mem"
              ? "memory"
              : "task";
    return reading(kind, `it starts with ${word}:`);
  }
  if (!text) return reading("note", "");
  if (journal) return reading("journal", "it starts with journal");
  // Before the contact it names, the page it could start, the report it could be:
  // a private line goes to one place, and that place is locked.
  if (secret) return reading("private", secret.because);
  // A password, a PIN, a card number: locked, never a memory any search could find.
  if (keepSafe) {
    const because = "it looks like a password or a number to keep safe";
    return { ...reading("private", because), secret: { feeling: "other", people: [], because } };
  }
  if (life) return remembered(`it is about ${life.page === "About me" ? "you" : life.page}`);
  if (ask) return reading("command", "it asks for something to be done");
  if (listed?.kind === "book") {
    return { ...reading("command", "it is a book to read"), ask: { do: "book", status: "to-read", titles: [listed.title], series: null } };
  }
  if (listed?.kind === "page") {
    const kept = pageTitled(listed.page, pages);
    const trunk: Step | null = listed.under ? { title: listed.under, section: "hobbies", template: "hobby" } : null;
    return {
      ...reading("memory", `it goes on your ${listed.page}`),
      text: listed.says,
      page: kept,
      topic: kept ? null : listed.page,
      branch: kept ? null : { section: listed.under ? "hobbies" : "ideas", parent: null, trail: [] },
      trail: listed.under ? trailOf({ section: "hobbies", trunk, is: "thing", text: "", topic: listed.page }) : [ROOT],
      fact: null,
    };
  }
  // A feeling said first is the journal, before the day it mentions can make a task of it.
  // Not when a later clause says what to do: "feeling lazy, order dominos" is an order.
  const thenDo = said.split(/[,;]/).slice(1).some((clause) => doing(words(clause)[0] ?? ""));
  if (FEEL_START.test(said) && !contact && !thenDo) return reading("journal", "it is how you feel");
  // Gratitude said first is the journal whoever it names: "grateful for amma's
  // food today" is about Amma, and there is nothing to do for her in it.
  if (THANKS_START.test(said) && !thenDo) return reading("journal", "it is what you are grateful for");

  if (contact) {
    if (instruction && timed) return reading("task", `something to do for ${contact.name}, with a when`);
    // "I need to email rahul" has no day on it, and is still something to do rather than something that happened.
    if (MEANT.test(said)) return reading("task", `something to do for ${contact.name}`);
    // "send proposal to orchids school" has no day on it and is still something to do, not something that happened.
    if (instruction && !HAPPENED.test(said)) return reading("task", `something to do for ${contact.name}`);
    if (HAPPENED.test(said) || !timed) return reading("contact", `it is about ${contact.name}`);
    return reading("task", `something to do for ${contact.name}`);
  }
  // More than the time alone: a task to finish, a habit to tick, a page to add to.
  if (effects.some((effect) => effect.do !== "time" && effect.do !== "journal")) return reading("done", "it says what you did");
  // "I need to go to the gym today" names the gym, and is still a thing to do.
  if (hobby && !notDone && (minutes !== null || DID_IT.test(said)) && !ahead && !MEANT.test(said)) {
    return reading("hobby", `time given to ${hobby.title}`);
  }
  // Kept as the fact alone, led by what it is about, on the one page they share.
  const learnt = (): CaptureReading => {
    const kept = pageTitled(TRIVIA_PAGE, pages);
    return {
      ...reading("memory", "it is a fact worth keeping"),
      text: trivia?.says ?? text,
      page: kept,
      topic: kept ? null : TRIVIA_PAGE,
      branch: kept ? null : { section: "ideas", parent: null, trail: [ROOT] },
      // Not led by its subject, as a lift is by its numbers: a fact opens with
      // what it is about, and "Bangalore · Bangalore was founded..." says it twice.
      fact: null,
      trail: [ROOT],
    };
  };
  // Said to be one - "fun fact", "interesting question" - so nothing below gets to doubt it.
  if (trivia?.marked) return learnt();
  if (thought) return reading("idea", "it is something to make");
  if (IDEA.test(said)) return reading("idea", "it is an idea");
  // Looked back on, with nothing of Caulder's to update: the day, in the journal
  // - before "read" gets to make a to-do of "read red rising, loved chapter 25".
  if (reports && (LOOKED_BACK.test(said) || FELT.test(said))) return reading("journal", "it is about your day");
  if (instruction) return reading("task", "it is something to do");
  // From here down the rules are guessing: a when with nothing else to say
  // what the line is, a fact only shaped like one, a feeling said in passing,
  // and the note nothing else claimed. These are the only readings the model
  // on this machine is asked about (phase 20; shared/opinion.ts).
  const guess = (kind: CaptureKind, because: string): CaptureReading => ({ ...reading(kind, because), soft: true });
  if (ahead) return guess("task", "it says when");
  // Something said about a page the brain has, or a thing said what it is.
  if (page) return reading("memory", `it is about ${page.title}`);
  // Only shaped like one, so after everything that is surer of itself - and
  // not when the line says what kind of thing it is: "Red Rising is the first
  // book of the series" is a book, which has a page of its own to start and
  // somewhere to hang it, not one more line on the pile.
  const hasAHome = topic !== null && branch.section !== "ideas";
  if (trivia && !hasAHome) return { ...learnt(), soft: true };
  if (topic) return guess("memory", `it says what ${topic} is`);
  // Before "today" gets a say: "felt great today" is about today, not due today.
  if (FELT.test(said) || doneWord(first)) return guess("journal", "it is about your day");
  if (reports) return guess("journal", "it is about your day");
  if (timed) return guess("task", "it says when");
  return guess("note", "kept to file later");
}

/**
 * A line added to a journal entry, under its "Today" heading - after what is
 * already there, before the next heading - or at the end when there is none.
 */
export function addToEntry(body: string, line: string): string {
  const said = line.trim();
  if (!said) return body;
  const lines = body.replace(/\r\n?/g, "\n").split("\n");
  const at = lines.findIndex((each) => /^#{1,6}\s+today\s*$/i.test(each.trim()));
  if (at === -1) return `${body.trimEnd()}\n\n${said}\n`;
  let end = at + 1;
  while (end < lines.length && !/^#{1,6}\s/.test(lines[end] ?? "")) end += 1;
  // Written after the last line with words in it, one blank line before the next heading.
  let last = end - 1;
  while (last > at && (lines[last] ?? "").trim() === "") last -= 1;
  const before = lines.slice(0, last + 1);
  const after = lines.slice(end);
  const gap = last === at ? [""] : [""];
  return [...before, ...gap, said, "", ...after].join("\n").replace(/\n{3,}/g, "\n\n");
}
