import { readCommand, spendIn, type Command } from "./commands";
import { parseQuick } from "./quickadd";
import { expand } from "./slang";
import { distance, slipAt } from "./slips";
import { placeNamed, readNewPerson, readStranger } from "./newperson";
import { isSecret } from "./secretline";
import { loggedAs, nextStepIn, type Logged, type NextStep } from "./nextstep";
import { isRule, ruleSubject } from "./rules";

/**
 * One line, and where it belongs.
 *
 * Today's line takes anything said about the company and the day - a task, a
 * call just made, what a client wants, what something cost, something worth
 * remembering - and works out where it goes from what Caulder already knows:
 * the contacts' names, the brain's pages, and the words that say when. The
 * rules are few and each can be explained, so a reading that is wrong can be
 * corrected: the line always shows where it will go, and the chips under it
 * change that before anything is kept.
 *
 * Six places, and no more. The line used to have ten - the journal, private
 * lines, time on a hobby and a report on the day among them - and read about
 * half of unseen lines rightly, because most of what it got wrong was one
 * personal kind taken for another. Those went with the personal half of the
 * app on 10 October 2026 (PLAN.md, part seven). What is left is told apart
 * by what Caulder can check rather than by how a sentence sounds:
 *
 *  1. A prefix says so outright: "task:", "note:", "idea:", "remember:".
 *  2. Something asked for - go somewhere, log money, add a contact, reach one
 *     now, set their number - is done (shared/commands.ts).
 *  3. A contact named: with something still to do it is a task for them;
 *     otherwise it is something that happened, and goes on their history.
 *     Unless the line is an idea said outright, which is one whoever it names.
 *  4. An idea floated - "what if", "we could", "a referral scheme for…".
 *  5. Something meant to be done is a task.
 *  6. A rule the company keeps, how it runs - how often, at what rate, in
 *     what hours - something said about a page the brain has, or said the way
 *     a fact is said, is a memory: a dated line on that page.
 *  7. An opinion is a note, whatever day is in it; a when still to come, in a
 *     line that does not look back, is a task.
 *  8. Anything else is a note, kept to file later: nothing is lost by the
 *     line being unsure.
 *
 * How well this reads lines it was not written against is measured, and the
 * number kept honest, in electron/main/understand/lines.eval.test.ts.
 *
 * It is read the way the task line reads - short forms written out, slips
 * mended, the same words for when (shared/quickadd.ts) - so "emial rahul
 * tmrw" and "gotta submit the form" land where they would have, spelt
 * properly.
 */

export type CaptureKind = "task" | "contact" | "memory" | "command" | "idea" | "note";

/**
 * Something the line was asked to do rather than to keep (shared/commands.ts)
 * - or, knowing the contacts as this does, to open one of them: "email rahul"
 * with no day on it is not a task, it is wanting to write to Rahul now.
 */
export type Ask =
  | Command
  | { do: "open"; contact: { id: string; name: string }; how: "email" | "call" | "message" | null }
  /** "rahul's number is 98765 43210": the contact's phone or email, set. */
  | { do: "update"; contact: { id: string; name: string }; phone: string | null; email: string | null }
  /** "Got 2400 from harbour", "harbour paid": their open invoice paid, not a refund (part twelve, phase 49). */
  | { do: "paid"; contact: { id: string; name: string }; amount: number | null };

export type Known = {
  contacts: readonly { id: string; name: string; person: string | null }[];
  /** Who a word means, kept from an answer the line was given (part twelve, phase 48). Read first. */
  names?: readonly { said: string; contact: string }[];
  /** The brain's pages by title, so what is said about one is kept with it. */
  pages?: readonly { id: string; title: string; section: string }[];
};

/** The page a memory goes on when it names none: one page, read down, rather than a page per stray line. */
export const REMEMBER_PAGE = "Things to remember";

export type CaptureReading = {
  kind: CaptureKind;
  /** The line with a prefix taken off: what is kept. */
  text: string;
  /** A contact the line names, for a task for them or their history. */
  contact: { id: string; name: string } | null;
  /** For a memory: the page it is kept on - or, when there is none yet, the page it will start. */
  page: { id: string; title: string } | null;
  topic: string | null;
  /** The part of a memory worth reading first, when there is one: "GST number: 29ABCDE1234F1Z5". */
  fact: string | null;
  /** What it was asked to do, when it was asked to do something. */
  ask: Ask | null;
  /**
   * Money the line may be about, when it holds a sum and did not say outright
   * that it was spent: offered as a chip, never assumed.
   */
  spend: Extract<Command, { do: "spend" }> | null;
  /**
   * For a contact's history: what kind of entry it is - or "fact", something
   * about them that stays true, kept on the contact rather than on their
   * history (PLAN.md, part twelve, phase 49). The fact itself is `fact`.
   */
  logged: Logged | "fact";
  /** For a fact that ends: "on leave till the 20th" - the day it stops being so. */
  until?: string | null;
  /** For a birthday: the next one, `YYYY-MM-DD` - kept with a reminder every year. */
  birthday?: string | null;
  /** Who the line means, when it is not sure: asked before anything is kept. */
  doubt: Doubt | null;
  /**
   * What a line that goes on a contact's history leaves to be done
   * (shared/nextstep.ts): kept with it, as their task, on the day it says.
   */
  then: NextStep | null;
  /**
   * What the task is, when the reading knows it better than the task line's
   * own reader would: "Sumanth asked me to reach out" is "Reach out to
   * Sumanth", and a line read by the AI brings its own title and day. A day
   * of null leaves the task line to find one, or to ask.
   */
  task?: { title: string; day: string | null; time: string | null };
  /** Why, in a few words, for the reading under the line. */
  because: string;
  /** Every kind the line could sensibly go to, for the chips. */
  options: CaptureKind[];
  /** Said before it is kept: this line holds something Caulder should not keep in the open. */
  warn: string | null;
  /**
   * The rules were guessing: the reading came from the fallbacks at the end
   * of readCapture. Only a soft reading is ever given a second opinion by the
   * model on this machine (shared/opinion.ts).
   */
  soft?: boolean;
};

const PREFIX = /^\s*(idea|note|task|todo|remember|memory|mem|urgent|important|imp|asap|priority)\s*[:\-–!]\s*/i;

/** Said about something still to come: the start of an instruction. */
const DOING = new Set([
  "call", "ring", "phone", "email", "mail", "message", "text", "whatsapp", "follow", "chase", "remind",
  "send", "submit", "finish", "complete", "write", "draft", "prepare", "prep", "book", "buy", "pay", "fix",
  "read", "revise", "study", "review", "schedule", "plan", "meet", "visit", "go", "get", "make", "update",
  "check", "ask", "tell", "clean", "order", "renew", "file", "register", "apply", "practise", "practice",
  "learn", "do", "start", "sign", "print", "upload", "post", "publish", "ship", "demo", "pitch",
  // Out and about.
  "pick", "take", "return", "cancel", "bring", "drop", "collect", "grab", "charge", "pack", "move", "sell",
  "withdraw", "deposit", "transfer", "replace", "repair", "install", "download", "backup", "reset",
  // At the desk.
  "reply", "respond", "confirm", "remove", "delete", "add", "create", "build", "design", "test", "deploy",
  "merge", "record", "edit", "scan", "sort", "organise", "organize", "arrange", "set", "setup", "change",
  "invoice", "quote", "research", "find", "search", "compare", "decide", "choose", "discuss", "share",
  "invite", "attend", "join", "rsvp", "finalise", "finalize", "proofread", "rewrite", "outline", "solve",
  "attempt", "watch", "listen", "present", "rehearse", "negotiate", "close", "onboard", "interview", "hire",
  "dm", "ping", "nudge", "escalate", "approve", "sync",
  // Running a company (the second blind set, 11 October 2026).
  "courier", "refund", "raise", "look", "log", "clear", "tidy", "brief", "wire", "bill", "reconcile", "archive",
  "migrate", "refactor", "rename", "restart", "tweak", "polish", "lower", "increase", "reduce", "stop", "try",
  "extend", "forward", "resend", "upgrade", "verify", "export", "open", "run",
]);
/**
 * What follows a word when the word is the thing and not the doing of it:
 * "quote i liked", "test is failing", "email from priya", "demo went well".
 * Half the words above are nouns as well, and the word after says which.
 */
const NOT_AN_ORDER = new Set([
  "i", "we", "he", "she", "they", "it", "is", "was", "are", "were", "isn't", "wasn't", "from", "went", "has", "had",
  "will", "would", "did", "didn't", "seems", "sent",
]);
/** What an order is given about: "get the nda signed", "send our rates", "chase them". */
const ORDERED = new Set([
  "the", "a", "an", "my", "our", "his", "her", "their", "this", "that", "these", "those", "him", "them", "it", "up",
  "out", "back",
]);
/** The ones long enough for a slip at them to be told from another word: "sumbit", "finsih". */
const DOING_SLIPS = [...DOING].filter((word) => word.length >= 5);

/** Whether a line starts with something done: "email priya", "buy eggs" - not "eggs", not "priya". */
export function startsWithDoing(text: string): boolean {
  const [first = "", second = ""] = words(expand(text));
  return ordered(first, second);
}

/** Whether a word is something done, slips mended. */
function isDoing(word: string): boolean {
  return DOING.has(word) || slipAt(word, DOING_SLIPS) !== null;
}

/** Whether two words start an order: "email priya", "top up the credits" - not "email from priya", not "top priority". */
function ordered(first: string, second: string): boolean {
  if (first === "top") return second === "up";
  return isDoing(first) && !NOT_AN_ORDER.has(second);
}

/**
 * Said as something meant to be done, whatever the verb: "need to", "have to",
 * "dont forget", "remind me", "i'll". Read after the short forms are written
 * out, so "gotta", "hafta", "lemme" and "imma" are all here already.
 */
const MEANT =
  /^\s*(?:(?:hey|ok|okay|so|also|oh|please)[\s,]+)*(?:(?:i\s+)?(?:need|have|got|ought|want)\s+to\b|i\s+(?:must|should|shd)\b|i'll\b|i\s+will\b|let\s+me\b|i'?m\s+going\s+to\b|going\s+to\b)|\b(?:remember|rember|remeber|remmber|rmbr|rmb)\s+to\b|\bdon'?t\s+(?:let\s+me\s+)?forget\b|\bremind\s+me\b/i;

/**
 * The same with nobody said: "should probably ask jonas for a testimonial",
 * "must renew the domain". Not "should we…" or "should try a referral
 * scheme", which are a thought floated (IDEA, below).
 */
const MEANT_SOFTLY =
  /^\s*(?:should|shd|must)\s+(?:(?:probably|really|just|also)\s+)*(?!(?:we|i|try|build|make|start|launch|offer|add|experiment|pilot)\b)[\p{L}]+/iu;

/** Said of something that is still owed: "timesheets for september - still not done". */
const OUTSTANDING = /\b(?:still\s+(?:not\s+done|to\s+do|to\s+be\s+done|undone)|not\s+done\s+yet|yet\s+to\s+be\s+done)\b/i;

/**
 * The same, said in a later clause: "the deck is half done, need to finish
 * it". The first clause is a fact and the second is the point, so the line is
 * a thing to do. Only after a break in the line - a mid-sentence "need to"
 * ("priya said i need to resend it") is not one.
 */
const MEANT_LATER = /[,;:]\s*(?:(?:i\s+)?(?:need|have|got|ought)\s+to\b|i\s+(?:must|should|shd)\b|gotta\b|hafta\b)/i;

/** "rahul's number is 98765 43210", "rajesh email rajesh@mspuc.edu": a contact detail, said. */
const PHONE = /(\+?\d[\d\s-]{7,}\d)/;
const EMAIL = /([\w.+-]+@[\w-]+(?:\.[\w-]+)+)/;
const DETAIL_CUE = /\b(?:number|no\.?|phone|mobile|cell|contact|whatsapp|email|e-?mail|mail\s+id|email\s+id)\b/i;

/** Said about something that happened: a contact's history. */
const HAPPENED =
  /\b(called|rang|spoke|talked|met|emailed|mailed|messaged|texted|dm'?d|pinged|replied|said|says|told|asked|agreed|signed|paid|wants|want|loved|liked|declined|refused|ghosted|accepted|confirmed|cancelled|canceled|no answer|voicemail|mentioned|went|sent|shared|approved|rejected|complained|renewed|churned|postponed|rescheduled)\b/i;

/**
 * A thought floated, not a thing to do: "what if", "could partner with coaching
 * centres", "we should try a referral scheme", "how about a yearly plan". Not
 * "could you send it" - that is asking somebody - and not "should call rahul",
 * which is a thing to do said softly.
 */
const IDEA =
  /^\s*(?:what\s+if|maybe\s+(?:we\s+)?(?:could|should)|(?:maybe|perhaps)\s+(?:a|an|we)\b|idea\b|(?:we\s+)?could\s+(?!(?:you|u|i|he|she|they)\b)\w+|(?:we\s+)?should\s+(?:try|build|make|start|launch|offer|add|experiment|pilot)\b|how\s+about\s+(?:a|an|we|making|building|trying|adding|offering)\b|what\s+about\s+(?:a|an|making|building|trying|adding|offering)\b|(?:i'?m\s+|i'?ve\s+been\s+|been\s+)?(?:thinking\s+(?:of|about)|toying\s+with|wondering\s+(?:if|whether|about))\b|(?:some\s?day|one\s+day|eventually|down\s+the\s+line|long[\s-]term)\s*(?:[:,–-]|\s(?:we|i|maybe)\b)|there\s+(?:might|may|could)\s+be\b|there(?:'s|\s+is)\s+(?:an?\s+)?(?:business|market|product|opportunity|niche|gap|demand)\b)/i;

/**
 * The same, said after something else: "harbour's subscribers would pay for a
 * roast-date tracker, we could build that". Only after a break in the line -
 * "priya said we could extend it" is what Priya said.
 */
const IDEA_LATER = /[,;.–-]\s*(?:we|i)\s+could\s+(?!not\b)[\p{L}]+|\bwould\s+(?:(?:probably|happily|gladly|definitely)\s+)?pay\s+for\b/iu;

/** Somebody who could: "teachers could mark attendance by voice". An idea even with "weekly" in it. */
const COULD =
  /^\s*(?!(?:i|you|u|he|she|it|they|we|this|that|who|what)\b)(?:[\p{L}-]+\s+){1,2}could\s+(?!(?:you|u|i|not|have|be)\b)[\p{L}]+/iu;

/**
 * An idea put some other way than "what if":
 *  - asked of yourself: "why not let students rate each lecture", "should we
 *    move to annual billing?";
 *  - a thing to make, named: "a chrome extension that blocks youtube", "an
 *    alumni mentorship marketplace", "offline mode for schools";
 *  - a thing pitched: "gamify homework with streaks", "white label it".
 * Never with a when: "should we meet tomorrow" is a meeting.
 */
const MADE =
  "app|apps|extension|plugin|add-?on|bot|chatbot|channel|platform|marketplace|tool|website|dashboard|leaderboard|newsletter|podcast|community|club|dinner|meetup|workshop|webinar|masterclass|bootcamp|course|subscription|membership|template|theme|game|feature|widget|kit|challenge|contest|hackathon|service|scheme|programme|program|discount|bundle|package|partnership|portal|directory|calculator|generator|tracker|integration|store|shop|series|product";
const PITCH = new RegExp(
  [
    String.raw`^\s*(?:why\s+not|should\s+we|kya\s+ho\s+agar|kya\s+hum)\b`,
    // Named with "a" - or "ek", which is the same word - and then what it is for, or nothing.
    String.raw`^\s*(?:an?|ek)\s+(?:[\p{L}-]+\s+){0,3}?(?:${MADE})\b(?:\s*[,:–-]\s.*|\s+(?:that|which|for|where|to|with|so|we|i)\b.*)?\s*[?.!]*\s*$`,
    // Named bare, and who it is for or what it comes to: "workshop for shop owners", "referral scheme: a free month".
    String.raw`^\s*(?:[\p{L}-]+\s+){0,2}(?:${MADE})(?::\s|\s+for\s)`,
    String.raw`^\s*(?:[\p{L}-]+\s+){1,2}(?:mode|tier|plan|version)\s+for\b`,
    String.raw`^\s*(?:gamify|gamified|bundle|white[\s-]?label|producti[sz]e|monetis|monetiz|franchise|crowdsource|upsell)[\p{L}]*\b`,
    // Something that does not exist yet, to be put in front of people: "launch a paid newsletter", "offer copy and photos together".
    String.raw`^\s*(?:(?:launch|host|run|introduce|pilot)\s+an?\s|offer\s)`,
  ].join("|"),
  "iu",
);
/**
 * A pitch that stays one whatever else the line says. "Productise the site
 * audit, report in 48 hrs" has a when in it and names nobody to do it for:
 * the 48 hours are the product's.
 */
const PITCHED = /^\s*(?:gamify|white[\s-]?label|producti[sz]e|monetis|monetiz|franchise|crowdsource|open[\s-]source|licen[sc]e\s+(?:it|our|the))[\p{L}]*\b/iu;

/** A thing proposed by asking: "retainers billed quarterly instead of monthly?". Not a question put to anybody. */
const ASKED_OF_NOBODY =
  /^\s*(?!(?:who|what|when|where|which|why|how|is|are|was|were|am|do|does|did|has|have|had|can|could|will|would|shall|any|anyone)\b)(?:\S+\s+){3,}\S*\?/i;

/**
 * Said the way a fact is said: a thing, then what it is or does - "the
 * printer on fourth takes A3", "razorpay settles in two working days". Kept
 * as a memory, softly: the model on this machine and where it belongs decide
 * the rest. Not a complaint about how something is behaving ("the wifi is
 * down"), which is a note.
 */
const STATES_A_FACT =
  /^\s*(?:the\s+|a\s+|an\s+)?(?!(?:i|we|you|u|he|she|they|it|this|that|there|here|what|who|why|how|when|where|which|me|us|need|want)\b)(?:[\p{L}\p{N}'’-]+\s+){1,5}?(?:is|are|was|were|isn't|aren't|wasn't|has|have|takes?|costs?|settles?|charges?|needs?|wants?|gives?|stops?|opens|closes|accepts?|supports?|requires?|expires?|renews?|contains?|holds?|belongs?|runs?|goes|go|gets?|comes?|pays?|includes?|covers?|applies|apply)\s+\S/iu;
const A_COMPLAINT =
  /\b(?:down|broken|not\s+working|isn't\s+working|crashed|crashing|failing|failed|offline|pending|overdue|late|stuck|missing|lost|slow|laggy|buggy|wrong|full|empty|out\s+of|almost\s+(?:out|gone|over|finished)|running\s+(?:out|low)|low\s+on)\b/i;

/**
 * Said the way an opinion is said, not a fact: "worth a proper read", "going
 * to be freezing", "useless for calls", "everyone was talking about it". A
 * remark is a note - it is true of an afternoon, and nobody will look it up.
 */
const A_REMARK =
  /\b(?:worth|somehow|honestly|imo|tbh|i\s+think|i\s+guess|i\s+feel|feels?\s+like|seems?|kind\s+of|sort\s+of|kinda|really|going\s+to\s+be|weird|odd|strange|funny|great|good|bad|nice|awful|terrible|boring|useless|amazing|brilliant|interesting|annoying|lovely|freezing|exhausting|a\s+waste|(?:was|were)\s+[\p{L}]+ing)\b/iu;
/** A remark from its first word: "not sure the monday ritual is working", "weird, traffic doubled". */
const REMARKED =
  /^\s*(?:not\s+sure|weird|odd|strange|funny|interesting|hm+|ugh|wow|huh|turns\s+out|apparently|i\s+think|i\s+feel|i\s+wonder|feels?\s+like|seems?\s+like|noticed|reali[sz]ed)\b/i;

/**
 * Said of something over: "took two hours", "traffic doubled on sunday". The
 * day in such a line is when it happened, and nothing is due on it.
 */
const LOOKED_BACK = /\b(?:took|went|came|saw|felt|noticed|happened|doubled|halved|tripled|dropped|jumped|broke|lost|didn't)\b/i;
/** The same, said less surely: "was moved to friday" is still to come, "was incorporated in 2022" is not. */
const WAS = /\b(?:was|were|had)\b/i;

/**
 * How often, rather than when: "nightly", "every month", "mon-fri". With a
 * thing and what it does - "backups run nightly at 2am" - that is how the
 * company runs, not something due.
 */
const HABITUAL =
  /\b(?:every|each)\s+(?:day|night|morning|evening|week|weekday|month|quarter|year|(?:mon|tues|wednes|thurs|fri|satur|sun)day)\b|\b(?:daily|nightly|weekly|fortnightly|monthly|quarterly|yearly|annually)\b|\bmon(?:day)?\s*(?:-|to)\s*(?:fri|sat)(?:day)?\b|\b(?:mon|tues|wednes|thurs|fri|satur|sun)days\b/i;
/** The hours something keeps: "support hours are 10 to 6". */
const HOURS = /\b(?:hours|timings)\s+(?:are|is)\s+\S/i;
/** A rate: "2% per month", "6 rs a word", "9k a month". What something comes to each time, which is a term and not a bill. */
const RATE =
  /\d\s*%|\b\d[\d,.]*\s*(?:k|rs\.?|inr|usd|eur|gbp|₹|\$|€|£)?\s*(?:a|an|per|\/)\s*(?:hour|hr|day|week|month|quarter|year|word|page|seat|head|user|person|project|item|unit|session|click)\b/i;

/**
 * How the company does things, said as a rule: "we never start without a
 * deposit", "always quote in dollars", "we don't take work under a week",
 * "don't quote fixed price for payments work", "we bill in their currency
 * but always quote in dollars", "we stopped offering wordpress builds".
 * Not "I never heard back", which is one person's afternoon - and not
 * "don't forget", which is something to do.
 */
const POLICY =
  /^\s*(?:we\s+(?:don'?t|do\s+not|never|always|only|no\s+longer|stopped|usually|normally)|never|always|(?:don'?t|do\s+not)\s+(?!forget\b|let\b))\s*[\p{L}]|^\s*we\s+[\p{L}]+\s.*\b(?:always|never|by\s+default|as\s+a\s+rule)\b/iu;
/** A thing and what it comes to, written the short way: "retainer = 15% of the build". */
const DEFINED = /^\s*[^=\n]{2,48}\s=\s+\S/;

/** Said to be kept: "remember that…", "note that…", "fyi", "for the record". */
const KEEP_IT = /^\s*(?:remember\s+that|note\s+that|fyi|for\s+the\s+record|for\s+later|worth\s+knowing)\b[\s,:-]*/i;

/**
 * Something of the company's, and what it is: "our gst number is 29ABCDE1234F1Z5",
 * "the office wifi is caulder-5g", "company pan is ABCDE1234F". The thing is
 * what the memory is led by, so the newest line about it is the current answer.
 */
const OURS = /^\s*(?:our|my|the\s+company(?:'s)?|company(?:'s)?|the\s+office(?:'s)?|office)\s+((?:[\p{L}\p{N}'’&-]+\s+){0,3}?[\p{L}\p{N}'’&-]+)\s+(?:is|are|=|:)\s+(\S.*)$/iu;

/** How a line speaks of a contact: by the person's first name when it used it, otherwise by the name they are kept under. */
function spokenOf(said: string, contact: { id: string; name: string }, contacts: Known["contacts"], matched = ""): string {
  const person = contacts.find((each) => each.id === contact.id)?.person ?? null;
  const first = person ? (person.trim().split(/\s+/)[0] ?? "") : "";
  const plainFirst = words(first)[0] ?? "";
  // Named in the line - or meant by a word that was a slip at their name.
  if (first && (words(said).includes(plainFirst) || matched === plainFirst)) return first;
  return contact.name;
}

/** The contact a "new contact" would only repeat: the same name, and the same person there when one is said. */
function sameContact(asked: Extract<Command, { do: "contact" }>, contacts: Known["contacts"]): { id: string; name: string } | null {
  const key = (text: string | null) => words(text ?? "").join(" ");
  const found = contacts.find(
    (each) => key(each.name) === key(asked.name) && (asked.person === null || each.person === null || key(each.person) === key(asked.person)),
  );
  return found ? { id: found.id, name: found.name } : null;
}

/** How somebody is until a day: "is on leave till mid november", "are closed until the 5th". */
const STATE_UNTIL = /\b(?:is|are|will\s+be|'s)\s+[^,.;]*\b(?:till|til|until)\b/i;

/**
 * Something about a contact that stays true (PLAN.md, part twelve, phase 49):
 * the line starts with them - after "fyi", "note" or "remember" - and goes on
 * with what is so, not what was done. Each pattern is tried on what follows
 * their name.
 */
const FACT_FILLER = /^\s*(?:fyi|note|nb|n\.b\.|btw|remember(?:\s+that)?|just\s+so\s+you\s+know)[,:\-\s]+/i;
const FACT_AFTER: readonly RegExp[] = [
  // A birthday, an anniversary.
  /^(?:'s|s'|’s)?\s+(?:birthday|bday|b'day|anniversary)\b/iu,
  // A number of theirs that is not a phone: a tax or company number.
  /^(?:'s|s'|’s)?\s+(?:gst(?:in)?|pan|vat|tax|ein|abn|cin|ifsc|iban|a\/c|account|registration|reg|company)\s*(?:no\.?|number|num|#|id|code)?\b/iu,
  // Something of theirs, and what it is or is called: "priya's daughter is called aarav".
  /^(?:'s|s'|’s)\s+(?:[\p{L}-]+\s+){1,3}(?:is|are|was\s+called|were\s+called|=|:)/iu,
  // Something of theirs, and when it runs: "oakridge's term starts in jan".
  /^(?:'s|s'|’s)\s+(?:[\p{L}-]+\s+){1,2}(?:starts?|ends?|begins?|runs?|closes?|opens?)\b/iu,
  // How they are: away, on leave, based somewhere.
  /^\s+(?:is|are|'s)\s+(?:on\s+leave|away|out\s+of\s+office|off|travell?ing|abroad|based|vegetarian|vegan|allergic|in\s+[\p{L}])/iu,
  // What they do, always: prefers, likes, pays on, works, lives.
  /^\s+(?:prefers?|likes?|loves?|hates?|dislikes?|pays?|works?|lives?|speaks?|uses?|owns?|runs?|only\s+[\p{L}]+s|never\s+[\p{L}]+s|always\s+[\p{L}]+s|doesn'?t|does\s+not|don'?t)\b/iu,
];

/** A fact about the contact `phrase` names, said at the start of the line - or null. */
function factAbout(said: string, text: string, phrase: string, clock: { today: string; now: number }): { text: string; until: string | null; birthday: string | null } | null {
  if (!phrase) return null;
  const body = said.replace(FACT_FILLER, "");
  if (!plain(body.toLowerCase()).startsWith(plain(phrase.toLowerCase()))) return null;
  const rest = body.slice(phrase.length);
  if (!FACT_AFTER.some((pattern) => pattern.test(rest))) return null;
  const till = /\b(?:till|until|til|through|thru)\s+(.+)$/i.exec(rest);
  const until = till ? parseQuick(`x ${till[1]}`, clock).task.day : null;
  const bday = /\b(?:birthday|bday|b'day)\s+(?:is\s+)?(?:on\s+)?(.+)$/i.exec(rest);
  const birthday = bday ? parseQuick(`x ${bday[1]}`, clock).task.day : null;
  // "Priya's call is at 4" is an hour, not something that stays true.
  if (!until && !birthday && parseQuick(`x ${rest}`, clock).task.time !== null) return null;
  const kept = text.replace(FACT_FILLER, "").trim().replace(/[.!]+$/, "");
  return { text: capital(kept), until, birthday };
}

/** Opened by something done with them: what happened, whatever else the line goes on to say. */
const OPENS_DONE = /^\s*(?:i\s+|we\s+|just\s+)?(?:called|rang|phoned|spoke|talked|met|emailed|mailed|messaged|texted|whatsapp'?d|whatsapped|tried\s+(?:calling|to\s+call|ringing|reaching)|left\s+(?:a\s+|an?\s+)?(?:vm|voicemail|voice\s+mail|message))\b/i;

/** Money in from a contact: "got 2400 from harbour", "payment of 2.4k from sam", "harbour paid". */
const PAID_IN = /^\s*(?:(?:i\s+|we\s+)?(?:got|received|recd|rcvd)\s+(?:a\s+)?(?:payment\s+(?:of\s+)?)?|(?:payment|money)\s+(?:of\s+)?)(?:₹|rs\.?\s*|inr\s*|\$|€|£)?\s*(\d[\d,]*(?:\.\d+)?\s*k?)?\s*(?:came\s+in\s+|received\s+)?(?:from|by)\s+/i;
const PAID_BY = /^\s*[\p{L}][\p{L}.&' ]{0,40}?\s+(?:has\s+|have\s+|just\s+)?(?:paid|settled|cleared)(?:\s+(?:me|us|up|the\s+invoice|their\s+invoice|in\s+full))*(?:\s+(?:₹|rs\.?\s*|inr\s*|\$|€|£)?\s*(\d[\d,]*(?:\.\d+)?\s*k?))?\s*[.!]?$/iu;

function amountOf(said: string | undefined): number | null {
  if (!said) return null;
  const k = /k\s*$/i.test(said);
  const value = Number(said.replace(/[,\sk]/gi, ""));
  return Number.isFinite(value) && value > 0 ? Math.round(k ? value * 1000 : value) : null;
}

/** Something of somebody's, and what it is: "priya's birthday is 3 march", "greenline physio's person is dr. bello". */
const ABOUT_THEIRS = /^\s*[\p{L}][\p{L}.&' ]{1,40}?(?:'s|’s)\s+(?:[\p{L}-]+\s+){1,3}(?:is|are|was|were)\b/iu;

/** Letters without their accents: nobody types "Lucía" into a line, and "lucia" is still her. */
function plain(text: string): string {
  return text.normalize("NFD").replace(/\p{M}+/gu, "");
}

function words(text: string): string[] {
  return plain(text).toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? [];
}

/** First names that are also words: "will call you" is not about Will, nor "may need more time" about May. */
const NAME_IS_A_WORD = new Set([
  "will", "mark", "may", "art", "rose", "grace", "hope", "joy", "faith", "bill", "pat", "rich", "sunny", "happy", "lucky",
  "april", "june", "august", "summer", "dawn", "chance", "penny", "page", "price", "wade", "miles", "frank", "earnest",
  // Three letters: "sam" and "ben" are people; these are also words, months and days.
  "dev", "rob", "sue", "don", "ray", "bob", "ken", "eve", "ivy", "max", "jay", "van", "guy", "kit", "ram", "jan", "sun",
  "mon", "sat", "ash", "bay", "gem", "dot", "bud", "mat", "cal", "ted", "lot", "tab", "tag", "tip", "the", "and", "for",
]);
/** What comes before a word when it is the thing and not a name: "the studio", "our agency" - not Studio Palma. */
const NOT_A_NAME_AFTER = new Set(["the", "a", "an", "my", "our", "your", "this", "that"]);
/** ...unless what follows shows it is theirs: "the harbour invoice", "the brightside mockups". */
const SENTENCE_GOES_ON = new Set([
  "is", "was", "are", "were", "has", "had", "will", "would", "and", "or", "in", "on", "at", "for", "of", "to", "with",
  "from", "by", "so", "but",
]);

/** Whether every time a word is said it is said as a thing: after "the" or "our", with the sentence going on or ending after it. */
function saidAsAThing(lower: string, word: string): boolean {
  const all = lower.trim().split(" ");
  const at = all.flatMap((each, index) => (each === word ? [index] : []));
  return at.length > 0 && at.every((index) => NOT_A_NAME_AFTER.has(all[index - 1] ?? "") && (index === all.length - 1 || SENTENCE_GOES_ON.has(all[index + 1] ?? "")));
}

/**
 * The contact a line names: their whole name or its start, or the name of the
 * person there, as whole words. The longest match wins, so "Oakridge
 * International" beats "Oakridge". A company is known by one word of its
 * name only when the word is distinctive - five letters or more; a person is
 * known by their first name from four, which is how people are spoken of,
 * unless the name is also a word.
 */
export function namedContact(text: string, contacts: Known["contacts"]): { id: string; name: string } | null {
  return findContact(text, contacts, []).contact;
}

type Found = {
  contact: { id: string; name: string } | null;
  /** The words of the line that named them. */
  said: string;
  /** Found only by a slip at their name: what was typed. */
  slip: string | null;
  /** Others the same words name just as well: "priya", when two contacts have one. */
  also: { id: string; name: string }[];
};

/** The same, with how sure it is: whether it took a slip to find them, and who else it could be. */
function findContact(text: string, contacts: Known["contacts"], names: NonNullable<Known["names"]> = []): Found {
  // A word the line has been told about: "pk" is Priya Nair, because that was the answer.
  const said = ` ${words(text).join(" ")} `;
  for (const name of names) {
    const word = words(name.said).join(" ");
    if (!word || !said.includes(` ${word} `)) continue;
    const contact = contacts.find((each) => each.id === name.contact);
    if (contact) return { contact: { id: contact.id, name: contact.name }, said: word, slip: null, also: [] };
  }

  const lower = ` ${words(text.replace(/['’]s\b/gi, "")).join(" ")} `;
  let best: { id: string; name: string; phrase: string } | null = null;
  let also: { id: string; name: string }[] = [];
  for (const contact of contacts) {
    for (const candidate of [contact.name, contact.person]) {
      if (!candidate) continue;
      const said = words(candidate).join(" ");
      if (said.length < 3) continue;
      const aPerson = candidate === contact.person;
      // The whole name, or the start of it: two words or more ("GIG International" for
      // "GIG International School"), or one distinctive word ("Oakridge", "Maya").
      const parts = said.split(" ");
      const alone = (word: string) => word.length >= 5 || (aPerson && word.length >= 3 && !NAME_IS_A_WORD.has(word));
      const tries = parts
        .map((_, index) => parts.slice(0, index + 1).join(" "))
        .filter((phrase, index) => index === parts.length - 1 || index >= 1 || alone(phrase));
      for (const phrase of tries) {
        if (!lower.includes(` ${phrase} `) || (best && phrase.length < best.phrase.length)) continue;
        // One word of a company's name, said as a thing: "open an account for the studio" is not Studio Palma.
        if (!aPerson && parts.length > 1 && !phrase.includes(" ") && saidAsAThing(lower, phrase)) continue;
        if (best && phrase.length === best.phrase.length) {
          // As good a match for somebody else: two contacts answer to these words.
          if (contact.id !== best.id && !also.some((each) => each.id === contact.id)) also.push({ id: contact.id, name: contact.name });
          continue;
        }
        best = { id: contact.id, name: contact.name, phrase };
        also = [];
      }
    }
  }
  if (best) return { contact: { id: best.id, name: best.name }, said: best.phrase, slip: null, also };

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
    const aimed = slipAt(word, firsts.keys()) ?? [...firsts.keys()].find((name) => nearName(word, name)) ?? null;
    const found = aimed ? firsts.get(aimed) : null;
    if (found) return { contact: found, said: aimed ?? word, slip: word, also: [] };
  }

  // A short first name with a letter added or dropped, straight after a word
  // for reaching somebody - "call priyaa", "email rta" - asked about, never
  // assumed. Only a letter in or out, not a wrong one: "call rite" is not Rita.
  const reached = /\b(?:call|ring|phone|email|mail|text|message|msg|ping|whatsapp|meet|dm)\s+([\p{L}]{3,})/iu.exec(text);
  const typed = reached?.[1]?.toLowerCase();
  if (typed && !DOING.has(typed) && !NAME_IS_A_WORD.has(typed)) {
    const near = new Map<string, { id: string; name: string } | null>();
    for (const contact of contacts) {
      const first = words(contact.person ?? "")[0] ?? "";
      if (first.length < 4 || first === typed || first[0] !== typed[0] || Math.abs(first.length - typed.length) !== 1) continue;
      if (distance(typed, first) !== 1) continue;
      const held = near.get(first);
      near.set(first, held === undefined || held?.id === contact.id ? { id: contact.id, name: contact.name } : null);
    }
    const only = near.size === 1 ? [...near][0] : undefined;
    if (only?.[1]) return { contact: only[1], said: only[0], slip: typed, also: [] };
  }
  return { contact: null, said: "", slip: null, also: [] };
}

/**
 * A name one letter out - dropped, added or wrong: "sumant", "sumunth",
 * "jyoti". Looser than a slip at a word (shared/slips.ts), which refuses a
 * wrong letter because that is how "finding" differs from "funding" - and
 * allowed here for two reasons: only in a name of six letters or more, where
 * one letter out is rarely another word, and only ever to **ask** whether it
 * is them (`Doubt`), never to assume it.
 */
function nearName(typed: string, name: string): boolean {
  if (name.length < 6 || typed.length < 5 || typed === name || typed[0] !== name[0]) return false;
  if (DOING.has(typed) || NAME_IS_A_WORD.has(typed)) return false;
  return distance(typed, name) === 1;
}

/**
 * Something the line is not sure of, asked rather than assumed: a name that
 * took a slip to read, or one that two contacts answer to. Each option is a
 * contact, or nobody - "somebody else" - and the line is read again with the
 * answer.
 */
export type Doubt = {
  text: string;
  options: { label: string; contact: string | null }[];
  /** The word the question is about, so an answer can be kept for it (part twelve, phase 48). */
  word?: string;
  /**
   * Asked in words rather than by a choice: where somebody the line names is
   * from ("Where is Sumanth from?"). The one option beside it is to keep
   * nobody. Answered as `settled.from`.
   */
  from?: string;
  /** A question the AI asked, answered in words (shared/ailine.ts). */
  open?: boolean;
};

function doubtAbout(found: Found, contacts: Known["contacts"]): Doubt | null {
  if (!found.contact) return null;
  const called = (id: string) => {
    const contact = contacts.find((each) => each.id === id);
    if (!contact) return "";
    return contact.person ? `${contact.person}, ${contact.name}` : contact.name;
  };
  if (found.also.length > 0) {
    return {
      word: found.said,
      text: `Which ${capital(found.said)}?`,
      options: [...[found.contact, ...found.also].map((each) => ({ label: called(each.id), contact: each.id as string | null })), { label: "None of them", contact: null }],
    };
  }
  if (found.slip) {
    return {
      word: found.slip,
      text: `“${found.slip}” - is that ${called(found.contact.id)}?`,
      options: [
        { label: "Yes", contact: found.contact.id },
        { label: "Somebody else", contact: null },
      ],
    };
  }
  return null;
}

/* ---- Memories ------------------------------------------------------------ */

/** The brain page a line is about: its whole title, as whole words. The longest title wins. */
function namedPage(text: string, pages: NonNullable<Known["pages"]>): { id: string; title: string } | null {
  const lower = ` ${words(text).join(" ")} `;
  let best: { id: string; title: string } | null = null;
  for (const page of pages) {
    const title = words(page.title).join(" ");
    if (title.length < 4 || title === "untitled" || !lower.includes(` ${title} `)) continue;
    if (!best || title.length > words(best.title).join(" ").length) best = { id: page.id, title: page.title };
  }
  return best;
}

/** A page by its title, plurals aside: the one to add to rather than start again. */
function pageTitled(title: string, pages: NonNullable<Known["pages"]>): { id: string; title: string } | null {
  const plain = (each: string) => words(each).map((word) => word.replace(/(?:es|s)$/, "")).join(" ");
  const found = pages.find((page) => plain(page.title) === plain(title));
  return found ? { id: found.id, title: found.title } : null;
}

/** Whether a line says when, and what it says - read by the task line's own reader. */
function whenIn(
  text: string,
  clock: { today: string; now: number },
): { timed: boolean; ahead: boolean; day: string | null; repeats: boolean } {
  const { task, questions } = parseQuick(text, clock);
  const asked = questions.some((question) => question.id === "meridiem" || question.id === "past" || question.id === "until");
  const timed = task.day !== null || task.time !== null || task.repeat !== null || asked;
  // "Today" alone is as often the day looked back on as a day something is due.
  // "Tonight" and "by today" are not: they are still to come.
  const onlyToday =
    !asked && task.day === clock.today && task.time === null && task.repeat === null && !/\b(?:tonight|tonite|this\s+evening|eod|by\s+today)\b/i.test(text);
  // A day gone by is when something happened: "incorporated on 4 feb 2022".
  const gone = task.day !== null && task.day < clock.today && task.repeat === null;
  return { timed, ahead: timed && !onlyToday && !gone, day: task.day, repeats: task.repeat !== null };
}

/** A heading and what is said under it: "pricing: 999 a month for schools". */
const HEADED = /^\s*([^:\n]{2,40}):\s+(\S.*)$/;
/** What starts a when: "standup: every day at 6", "dentist: tomorrow 5", "call: 9am". Not "1%". */
const WHEN_FIRST =
  /^(?:every|each|daily|weekly|monthly|today|tonight|tomorrow|tmrw|tmr|mon|tues?|wed|thu|thurs|fri|sat|sun|next|this|at|on|by|from|in\s+\d|\d{1,2}(?:[:.]\d{2})?\s*(?:am|pm)?(?![\d%.,]))\b/i;

/**
 * "Pricing: 999 a month, billed every quarter" is a line about pricing, and
 * "every quarter" is in what it says - not when anything is due. After a
 * heading a when counts only when it is what the heading is told: it comes
 * first ("standup: every day at 6"), or something to do does.
 */
function whenOnlyInPassing(said: string): boolean {
  const headed = HEADED.exec(said);
  if (!headed) return false;
  const told = (headed[2] ?? "").trim();
  if (WHEN_FIRST.test(told) || MEANT.test(told)) return false;
  return !DOING.has(words(told)[0] ?? "");
}

const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

export function readCapture(
  line: string,
  known: Known,
  /** The workspace's clock. Only "is it today" turns on it, so a reading without one still reads. */
  clock: { today: string; now: number } = { today: "2026-01-01", now: 9 * 60 },
  /**
   * What the person answered when the line asked: who it meant - a contact's
   * id, or null for nobody - and where somebody it did not know is from: a
   * place, or null for nobody worth keeping.
   */
  settled: { contact?: string | null; from?: string | null } = {},
): CaptureReading {
  const prefix = PREFIX.exec(line);
  const text = prefix ? line.slice(prefix[0].length).trim() : line.trim();
  // Read as it would have been said; kept as it was typed.
  const said = expand(text);
  const answered = "contact" in settled ? (known.contacts.find((each) => each.id === settled.contact) ?? null) : undefined;
  const found: Found =
    answered === undefined
      ? findContact(said, known.contacts, known.names ?? [])
      : // Said to be them: spoken of by the person's name, since it was a name - spelt some way - that the line used.
        { contact: answered ? { id: answered.id, name: answered.name } : null, said: words(answered?.person ?? "")[0] ?? "", slip: null, also: [] };
  const contact = found.contact;
  const doubt = prefix ? null : doubtAbout(found, known.contacts);
  const logged = loggedAs(said);
  const spoken = words(said);
  const first = spoken[0] ?? "";
  const when = whenOnlyInPassing(said) ? { timed: false, ahead: false, day: null, repeats: false } : whenIn(text, clock);
  const { timed, ahead } = when;
  const doing = isDoing;
  const starts = ordered(first, spoken[1] ?? "");
  const meant = MEANT.test(said) || MEANT_SOFTLY.test(said);
  const instruction =
    starts ||
    meant ||
    MEANT_LATER.test(said) ||
    OUTSTANDING.test(said) ||
    // "the deck is late, send it tonight": a later clause that gives an order is the point of the line.
    said.split(/[,;]/).slice(1).some((clause) => doing(words(clause)[0] ?? ""));
  // An order given about something - "get the nda signed", "send our rates" - is one whatever else is in the line.
  const order = starts && ORDERED.has(spoken[1] ?? "");
  // The line looks back, so its day is when something happened. "Was" only when the day is not still to come.
  const over = LOOKED_BACK.test(said) || (WAS.test(said) && !(when.day !== null && when.day > clock.today));

  const pages = known.pages ?? [];
  // Said to be kept - "remember that…" - which is not "remember to…", a thing to do.
  const keepIt = meant ? null : KEEP_IT.exec(text);
  /** The line without the words that only said to keep it. */
  const kept = keepIt ? text.slice(keepIt[0].length).trim() || text : text;
  const ours = prefix || instruction || timed ? null : OURS.exec(said);
  const page = namedPage(said, pages);

  // Asked to do something: go somewhere, log money, add a contact - or reach
  // one now. "Call oakridge tmrw 11" has a when and is a task; "call oakridge"
  // has none, and means now.
  const reach =
    /^\s*(?:(?:please|pls|can\s+you|could\s+you|i\s+want\s+to|i'd\s+like\s+to|i\s+would\s+like\s+to|want\s+to|let\s+me|let's|lets)\s+)*(?:(?:send|write|draft|shoot|drop)\s+(?:an?\s+|the\s+)?(email|mail|message|whatsapp|text|dm)\s+(?:to|for)\b|(?:give|make)\s+(?:an?\s+)?(call)\s+to\b|(email|mail|call|ring|phone|dial|whatsapp|message|text|dm|open|show|find)\b|(write)\s+to\b|(get)\s+\S.*?\s+on\s+the\s+(?:phone|line)\b)/i.exec(
      said,
    );
  const verb = (reach?.[1] ?? reach?.[2] ?? reach?.[3] ?? reach?.[4] ?? reach?.[5] ?? "").toLowerCase();
  // "Write to jonas now": the when is this minute, which is no when at all.
  const rightNow = !ahead && /\b(?:right\s+)?now\s*[.!]?\s*$/i.test(said);
  const obliged = /\b(?:need|have|got|ought)\s+to\b|\b(?:must|should|shd)\b|\b(?:remember|rmb)\s+to\b|\bforget\b|\bremind\b/i.test(said);
  const command = prefix ? null : readCommand(said);
  // "Add contact rahul nair from ms puc", when he is one already: never a second Rahul. What the
  // line brought that is new - a number, an address - is set on him; with nothing new, he is opened.
  const already = command?.do === "contact" ? sameContact(command, known.contacts) : null;
  const asked: Ask | null =
    command?.do === "contact" && already
      ? command.phone || command.email
        ? { do: "update", contact: already, phone: command.phone, email: command.email }
        : { do: "open", contact: already, how: null }
      : command;
  // Somebody new, told about the way you would tell a friend: kept as a contact,
  // with what happened and what to do about them (shared/newperson.ts).
  const met = prefix || contact || asked ? null : readNewPerson(said, known.contacts, clock, doing);
  // "The plumber's number is 98450 12345": somebody you will want to ring again, kept as a contact.
  const theirNumber =
    prefix || contact || asked
      ? null
      : /^(?:the\s+|my\s+|our\s+)?([\p{L}][\p{L} ]{1,30}?)(?:'s|s'|’s)\s+(?:number|phone(?:\s+number)?|mobile|contact(?:\s+number)?)\s+(?:is\s+|:\s*|-\s*)?(\+?\d[\d\s-]{6,}\d)\s*$/iu.exec(said);
  // Somebody named, with something owed them, whom Caulder does not know - and has not been told where from.
  const unknown = prefix || contact || asked || met || theirNumber ? null : readStranger(said, clock, doing);
  const from = unknown && typeof settled.from === "string" ? settled.from.trim() : "";
  const introduced: Ask | null = unknown && from
    ? {
        do: "contact",
        name: placeNamed(from),
        person: unknown.name,
        phone: PHONE.exec(said)?.[1]?.replace(/[\s-]+/g, " ").trim() ?? null,
        email: EMAIL.exec(said)?.[1] ?? null,
        role: null,
        source: unknown.source,
        happened: unknown.happened,
        then: unknown.then,
      }
    : theirNumber
    ? {
        do: "contact",
        name: capital((theirNumber[1] ?? "").trim()),
        person: null,
        phone: (theirNumber[2] ?? "").replace(/[\s-]+/g, " ").trim(),
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
  // "Got 2400 from harbour": their invoice paid, not 2,400 come back (part twelve, phase 49).
  const paidIn = contact && !prefix ? (PAID_IN.exec(said) ?? PAID_BY.exec(said)) : null;
  const paid: Ask | null = paidIn && contact ? { do: "paid", contact, amount: amountOf(paidIn[1]) } : null;
  const ask: Ask | null = prefix
    ? null
    : (paid ??
      detail ??
      introduced ??
      asked ??
      // "Email sent to maya" and "call with harbour went well" are not wanting to reach them.
      (contact && reach && (!doing(first) || (starts && spoken[1] !== "with")) && (!timed || rightNow) && !obliged
        ? {
            do: "open",
            contact,
            how: /mail|write/.test(verb) ? "email" : /call|ring|phone|dial|get/.test(verb) ? "call" : /whatsapp|message|text|dm/.test(verb) ? "message" : null,
          }
        : null));

  // A sum in a line that did not say it was spent: offered, never assumed.
  const spend = prefix || ask || timed ? null : spendIn(said);
  // A password or a card number is not kept on a page any search can find.
  const warn =
    !instruction && isSecret(said)
      ? "This looks like a password or a number to keep safe. Caulder keeps a line in the open, where search finds it: put it in a sealed field on a brain page instead."
      : null;

  const options: CaptureKind[] = ask || spend ? ["command", "task"] : ["task"];
  if (contact) options.push("contact");
  options.push("memory", "idea", "note");

  const reading = (kind: CaptureKind, because: string): CaptureReading => ({
    kind,
    text,
    contact,
    page,
    topic: page ? null : REMEMBER_PAGE,
    fact: null,
    ask: ask ?? spend,
    spend,
    logged,
    then: kind === "contact" ? owed : null,
    doubt,
    because,
    options,
    warn,
  });

  /** A memory on the page it names, the page its subject has, or the one page for the rest. */
  const remembered = (because: string, soft = false): CaptureReading => {
    const about = ours ? capital((ours[1] ?? "").trim()) : null;
    const value = ours ? (ours[2] ?? "").trim().replace(/[.!]+$/, "") : null;
    // A rule the company keeps goes on its subject's page in How we work (shared/rules.ts) -
    // unless the line names a page, or says what something of the company's is.
    const subject = !page && !ours && isRule(kept) ? ruleSubject(kept) : null;
    const home = page ?? pageTitled(subject ?? REMEMBER_PAGE, pages);
    return {
      ...reading("memory", subject ? "it is a rule you keep" : because),
      text: kept,
      page: home,
      topic: home ? null : (subject ?? REMEMBER_PAGE),
      fact: about && value ? `${about}: ${value}` : null,
      ...(soft ? { soft: true } : {}),
    };
  };

  if (prefix) {
    const word = (prefix[1] ?? "").toLowerCase();
    if (word === "remember" || word === "memory" || word === "mem") return remembered("it starts with remember:");
    const kind: CaptureKind = word === "idea" ? "idea" : word === "note" ? "note" : "task";
    return reading(kind, `it starts with ${word}:`);
  }
  if (!text) return reading("note", "");
  // Never kept as anything a search could find, whatever else the line looks like.
  if (warn) return reading("note", "it looks like something to keep safe");
  if (ask) return reading("command", "it asks for something to be done");
  if (unknown) {
    // Their task either way, said the way a task is: "Reach out to Sumanth", on the day it said.
    const theirs = { title: unknown.then.title, day: unknown.then.daySaid ? unknown.then.day : null, time: unknown.then.time };
    // Said to be nobody worth keeping: a task, and no more is asked.
    if ("from" in settled) return { ...reading("task", "it is something to do"), task: theirs };
    return {
      ...reading("task", `it leaves something to do, and Caulder does not know ${unknown.name}`),
      task: theirs,
      doubt: { text: `Where is ${unknown.name} from?`, options: [{ label: "Only a task", contact: null }], from: unknown.name },
    };
  }

  // What a line about them leaves to be done: they asked, I promised, or they said they would.
  // Spoken of the way the line speaks of them - by the person's first name when it used it.
  const owed = contact && !prefix ? nextStepIn(said, spokenOf(said, contact, known.contacts, found.said), clock) : null;

  // An idea said outright is one whoever it names: "white-label the app we built for brightside".
  const floated = !meant && !keepIt && (IDEA.test(said) || IDEA_LATER.test(said) || PITCHED.test(said) || PITCHED.test(text));

  if (contact) {
    // Something about them that stays true: kept on them, not on their history (part twelve, phase 49).
    const fact = floated || meant || order ? null : factAbout(said, text, found.said, clock);
    if (fact) {
      return {
        ...reading("contact", `it is about ${contact.name}, and stays true`),
        text: keepIt ? kept : text,
        logged: "fact",
        fact: fact.text,
        until: fact.until,
        birthday: fact.birthday,
        then: null,
      };
    }
    // "Called priya - no answer, try again thursday": what happened, and what is next, as one.
    if (OPENS_DONE.test(said) && !floated) {
      return reading("contact", owed ? `it is about ${contact.name}, and leaves something to do` : `it is about ${contact.name}`);
    }
    // "Remember that Harbour pay on the 5th" is about Harbour: it goes where
    // everything about a contact goes, their history - and the 5th is when
    // they pay, not when anything is due.
    if (keepIt) return { ...reading("contact", `it is about ${contact.name}`), text: kept };
    if (floated) return reading("idea", "it is an idea");
    if (instruction && timed) return reading("task", `something to do for ${contact.name}, with a when`);
    // "I need to email rahul" has no day on it, and is still something to do rather than something that happened.
    if (meant || order) return reading("task", `something to do for ${contact.name}`);
    // "send proposal to orchids school" has no day on it and is still something to do, not something that happened.
    if (instruction && !HAPPENED.test(said)) return reading("task", `something to do for ${contact.name}`);
    // "Priya's birthday is 3 march": theirs, and what it is - whatever day is in it.
    if (ABOUT_THEIRS.test(said) && !instruction) return reading("contact", `it is about ${contact.name}`);
    // "Jonas is on leave till mid november": how they are until a day, which is not a day anything is due.
    if (STATE_UNTIL.test(said) && !instruction) return reading("contact", `it is about ${contact.name}`);
    // "Today" and "now" alone are as often when it was said as when anything is due.
    // And what it leaves to be done goes with it, as their task (`then`): "Sumanth asked me to
    // reach out next week" is something that happened and something owed, and both are kept.
    if (HAPPENED.test(said) || !ahead) {
      return reading("contact", owed ? `it is about ${contact.name}, and leaves something to do` : `it is about ${contact.name}`);
    }
    return reading("task", `something to do for ${contact.name}`);
  }

  // Said to be kept, or something of the company's and what it is.
  if (keepIt) return remembered("you said to remember it");
  if (ours) return remembered(`it says what your ${(ours[1] ?? "").trim().toLowerCase()} is`);

  if (floated) return reading("idea", "it is an idea");
  if (!meant && (((PITCH.test(said) || PITCH.test(text)) && !timed) || COULD.test(said))) return reading("idea", "it is an idea");
  // From here down - and for a thing proposed by asking - the rules are guessing, and say so: these
  // are the only readings the model on this machine is asked about (shared/opinion.ts).
  const guess = (kind: CaptureKind, because: string): CaptureReading => ({ ...reading(kind, because), soft: true });
  // "Retainers billed quarterly instead of monthly?", "charge per page instead of per project?".
  if (!timed && !meant && ASKED_OF_NOBODY.test(said)) return guess("idea", "it asks whether to");
  if (instruction) return reading("task", "it is something to do");

  // A thing, and what it is or does - and what is said of it, where a complaint or an opinion would be.
  const stated = STATES_A_FACT.exec(said);
  const saidOfIt = stated ? said.slice(stated[0].length - 1) : "";
  // A rule the company keeps, or a thing and what it comes to. Before a when:
  // "we always invoice on the 1st" says how it is done, not that anything is due.
  if ((POLICY.test(said) || DEFINED.test(said) || isRule(said)) && !A_COMPLAINT.test(said)) return remembered("it says how you do things", true);
  // An opinion, whatever day is in it: "mondays are useless for calls", "not sure the monday ritual is working".
  // Said as one from the first word, it is not a guess; an opinion inside a sentence is.
  if (REMARKED.test(said)) return reading("note", "it is a remark");
  if (stated && A_REMARK.test(said)) return guess("note", "it is a remark");
  if (stated && !A_COMPLAINT.test(saidOfIt)) {
    // How the company runs - how often, at what rate, in what hours - and not something due.
    if (HABITUAL.test(said) || HOURS.test(said)) return remembered("it says how things run", true);
    if (RATE.test(said)) return remembered("it says what something comes to", true);
  }
  if (ahead && !over) return guess("task", "it says when");
  // Something said about a page the brain has.
  if (page) return remembered(`it is about ${page.title}`);
  // A fact said plainly: a thing, and what it is or does. Not how something is misbehaving.
  if ((!timed || over) && stated && !A_COMPLAINT.test(saidOfIt)) return remembered("it says what something is", true);
  if (timed && !over) return guess("task", "it says when");
  return guess("note", "kept to file later");
}
