import { ROOT, type Step } from "./branches";

/**
 * The things a life is made of, told to the line the way they come up:
 *
 *  - **About you**: "my blood group is O+", "i'm allergic to peanuts", "my
 *    shoe size is 9", "our anniversary is 12 june".
 *  - **The people in it**: "mummy's birthday is 15 march", "arjun likes filter
 *    coffee", "meera just got engaged", "priya's daughter is called anya" -
 *    each person a page of their own, under People.
 *  - **Where things are**: "the spare key is under the plant pot", "i parked
 *    on level 3, spot B12", "kept my passport in the top drawer".
 *  - **What was lent**: "lent my drill to arjun", "arjun returned the drill".
 *
 * Each is a memory on its page in Remembered (shared/brain.ts), with what it
 * is about leading the line - "**Blood group: O+**" - so a later line about
 * the same thing is the newer answer to it, and the old one is kept as what it
 * was before (shared/memories.ts). A birthday or an anniversary carries its day,
 * so it can be said when it comes round.
 *
 * Careful by design, like every reader here: only the shapes these are said
 * in. "My exam is on friday" is a task, "my head is killing me" is the journal,
 * and a password is never a memory - see isSecret.
 */

type LifeFact = {
  kind: "me" | "person" | "where" | "lent";
  /** The page it goes on: About me, Mummy, Where things are, Lent and borrowed. */
  page: string;
  /** The pages above it, outermost first. */
  trail: Step[];
  /** What leads the line, "Key: value", so a later one about the same key replaces it. */
  fact: string;
  /** For a birthday or an anniversary: the day it comes round. */
  date: { month: number; day: number } | null;
};

export const REMEMBERED_SECTION = "remembered" as const;
const ABOUT_ME = "About me";
const WHERE_THINGS_ARE = "Where things are";
const LENT_AND_BORROWED = "Lent and borrowed";
const PEOPLE: Step = { title: "People", section: REMEMBERED_SECTION, template: "page" };

/* ---- Days of the year ---------------------------------------------------- */

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MONTH = String.raw`(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)`;

/** "15 march", "march 15th", "the 3rd of october", "15/03": a day of the year. */
export function monthDayOf(text: string): { month: number; day: number } | null {
  const valid = (month: number, day: number) => (month >= 1 && month <= 12 && day >= 1 && day <= 31 ? { month, day } : null);
  const dayFirst = new RegExp(String.raw`\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?${MONTH}\b`, "i").exec(text);
  if (dayFirst) return valid(MONTHS.indexOf((dayFirst[2] ?? "").slice(0, 3).toLowerCase()) + 1, Number(dayFirst[1]));
  const monthFirst = new RegExp(String.raw`\b${MONTH}\s+(\d{1,2})(?:st|nd|rd|th)?\b`, "i").exec(text);
  if (monthFirst) return valid(MONTHS.indexOf((monthFirst[1] ?? "").slice(0, 3).toLowerCase()) + 1, Number(monthFirst[2]));
  // Day first, the way it is written here: 15/03 is the fifteenth of March.
  const numeric = /\b(\d{1,2})[/.-](\d{1,2})(?:[/.-](?:\d{2}|\d{4}))?\b/.exec(text);
  if (numeric) return valid(Number(numeric[2]), Number(numeric[1]));
  return null;
}

function sayMonthDay(date: { month: number; day: number }): string {
  return `${date.day} ${MONTH_NAMES[date.month - 1] ?? ""}`;
}

/* ---- Never a memory ------------------------------------------------------ */

const SECRET =
  /\b(?:password|passcode|passwd|pwd|(?:atm\s+|upi\s+|card\s+|phone\s+|sim\s+|debit\s+card\s+|credit\s+card\s+)?pin(?!\s*code)|otp|cvv|card\s+(?:number|no)|account\s+(?:number|no)|a\/c\s+(?:number|no)|aadhaa?r(?:\s+(?:number|no|card))?|pan(?:\s+card)?\s+(?:number|no)|passport\s+(?:number|no)|ifsc|api\s+key|secret\s+key|recovery\s+(?:code|key|phrase)|seed\s+phrase|security\s+(?:code|answer))\b/i;

/**
 * A password, a PIN or a card number being written down. Never a memory,
 * which is plain text on a page any search finds: the line keeps it as a
 * private line instead, locked behind the journal's passcode.
 */
export function isSecret(said: string): boolean {
  return SECRET.test(said) && /(?:\bis\b|:|=|-)\s*\S/.test(said);
}

/* ---- Reading ------------------------------------------------------------- */

/** What a person keeps about themselves or somebody else, said "my X is Y". */
const KEYS =
  /^(?:favou?rite\s+[\p{L} ]{1,24}|fav\s+[\p{L} ]{1,24}|blood\s+(?:group|type)|(?:shoe|shirt|t-?shirt|pant|jeans|dress|ring|bra|jacket|kurta)\s+size|size|waist|height|weight|birthday|bday|birth\s?day|date\s+of\s+birth|dob|anniversary|wedding\s+anniversary|address|home\s+address|pin\s?code|postcode|zip(?:\s+code)?|car(?:\s+number)?|bike(?:\s+number)?|scooter(?:\s+number)?|vehicle(?:\s+number)?|number\s+plate|licen[cs]e(?:\s+number)?|locker(?:\s+number)?|seat(?:\s+number)?|roll\s+(?:number|no)|usn|reg(?:istration)?\s+(?:number|no)|employee\s+(?:id|number|no)|student\s+id|flat(?:\s+number)?|house\s+number|room\s+number|apartment|gate\s+code|wifi(?:\s+name)?|star\s+sign|zodiac(?:\s+sign)?|sun\s+sign|allergy|allergies|medication|medicines?|doctor|dentist|gp|gym|tailor|barber|hairdresser|landlord|insurance(?:\s+company)?|insurer|bank|diet|go-?to\s+order|usual\s+order|coffee\s+order|hometown|native(?:\s+place)?|college|school|university|major|branch|team|club|church|temple|nickname|middle\s+name|maiden\s+name|full\s+name)$/iu;
/** Said of something still to come: a task, not a fact about anybody. */
const EVENTISH = /^(?:exam|test|flight|train|bus|meeting|class|lecture|appointment|interview|deadline|submission|match|game|show|party|trip|call|demo|presentation|shift|slot|turn|order|delivery)s?$/i;
const WHENISH = /\b(?:today|tomorrow|tonight|yesterday|due|at\s+\d|next\s+(?:week|month|mon|tue|wed|thu|fri|sat|sun)\w*|this\s+(?:week|weekend|evening)|in\s+\d+\s+(?:days?|weeks?|hours?|mins?))\b/i;

/** Who a line is about: a word or two, never a pronoun, a day or a thing. */
const NAME = String.raw`((?:[\p{L}][\p{L}.'’-]*)(?:\s+(?!(?:just|recently|finally|also|really|still|got|is|has|had|was|and)\b)[\p{L}][\p{L}.'’-]*)?)`;
const NOT_A_PERSON = new Set([
  "i", "we", "you", "he", "she", "it", "they", "this", "that", "these", "those", "the", "a", "an", "my", "our", "your",
  "someone", "somebody", "everyone", "everybody", "nobody", "anyone", "people", "today", "tomorrow", "yesterday",
  "tonight", "everything", "nothing", "something", "life", "work", "college", "school", "office", "home", "there", "here",
  "who", "what", "which", "why", "how", "when", "where", "one", "all", "both", "each", "team", "company", "class",
]);

const RELATION = String.raw`(daughter|son|wife|husband|partner|girlfriend|boyfriend|fianc[eé]e?|kid|kids|child|children|baby|mom|mum|mother|dad|father|brother|sister|dog|cat|pet|puppy|kitten)`;

const LIKES: [RegExp, string][] = [
  [/^(?:likes?|loves?|enjoys?|is\s+into|is\s+obsessed\s+with|is\s+a\s+fan\s+of|adores?)$/i, "Likes"],
  [/^(?:hates?|dislikes?|doesn'?t\s+like|does\s+not\s+like|can'?t\s+stand)$/i, "Doesn't like"],
  [/^prefers?$/i, "Prefers"],
  [/^(?:is\s+allergic\s+to|am\s+allergic\s+to|'m\s+allergic\s+to)$/i, "Allergic to"],
  [/^(?:doesn'?t\s+eat|can'?t\s+eat|does\s+not\s+eat|don'?t\s+eat|avoids?)$/i, "Doesn't eat"],
  [/^(?:drinks?)$/i, "Drinks"],
  [/^(?:supports?)$/i, "Supports"],
  [/^(?:plays?)$/i, "Plays"],
  [/^(?:collects?)$/i, "Collects"],
];
const LIKE_VERBS = String.raw`(likes?|loves?|enjoys?|is\s+into|is\s+obsessed\s+with|is\s+a\s+fan\s+of|adores?|hates?|dislikes?|doesn'?t\s+like|does\s+not\s+like|can'?t\s+stand|prefers?|is\s+allergic\s+to|doesn'?t\s+eat|can'?t\s+eat|does\s+not\s+eat|avoids?|drinks?|supports?|plays?|collects?)`;
const WHERE_VERBS: [RegExp, string][] = [
  [/^lives\s+in$/i, "Lives in"],
  [/^moved\s+to$/i, "Lives in"],
  [/^(?:works\s+at|works\s+for|joined|started\s+at|started\s+working\s+at)$/i, "Works at"],
  [/^(?:studies\s+at|goes\s+to|is\s+at|got\s+into)$/i, "Studies at"],
];
const NEWS =
  /^(just\s+)?(got\s+engaged|got\s+married|is\s+getting\s+married|had\s+a\s+(?:baby|boy|girl|son|daughter)|is\s+pregnant|is\s+expecting|got\s+a\s+(?:new\s+)?job|got\s+promoted|got\s+a\s+promotion|graduated|passed\s+away|retired|broke\s+up|got\s+divorced|bought\s+a\s+(?:house|flat|car|home)|moved\s+(?:house|out|abroad)|cleared\s+.+|won\s+.+|got\s+into\s+.+)(.*)$/i;
const DIET = /^(?:i'?m|i\s+am|am)\s+(?:a\s+)?(vegetarian|vegan|eggetarian|pescatarian|lactose\s+intolerant|gluten\s+intolerant|diabetic|asthmatic|left-?handed|right-?handed|colou?r\s?blind|teetotal|a\s+teetotaller|jain)$/i;

/** Things kept somewhere, said without "the" or "my" in front. */
const THINGS =
  /^(?:passport|keys?|spare\s+key|car\s+keys?|house\s+keys?|charger|documents?|certificates?|marksheets?|laptop|phone|wallet|purse|watch|glasses|specs|sunglasses|earphones|headphones|airpods|remote|umbrella|helmet|jacket|cheque\s*book|pan\s+card|aadhaa?r\s+card|licen[cs]e|rc|insurance\s+papers?|warranty|bill|receipt|tickets?|medicines?|first\s+aid\s+kit|toolbox|drill|ladder|torch|batteries|extension\s+cord|suitcase|bag|backpack)$/i;
const PLACE_PREP = String.raw`(in|under|on|behind|inside|beside|next\s+to|near|at|on\s+top\s+of|in\s+front\s+of|with)`;

const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const tidy = (text: string) => text.trim().replace(/[\s,;.!]+$/, "").replace(/\s+/g, " ");
/** "arjun" is Arjun; "mummy" is Mummy; a capital someone chose stays. */
const personName = (text: string) =>
  text
    .trim()
    .split(/\s+/)
    .map((word) => (word === word.toLowerCase() ? capital(word) : word))
    .join(" ");

function aPerson(name: string, contacts: readonly { name: string; person: string | null }[]): boolean {
  const words = name.toLowerCase().split(/\s+/);
  if (words.some((word) => NOT_A_PERSON.has(word))) return false;
  // Somebody already a contact is theirs: what is said about them goes on their history.
  const said = words.join(" ");
  return !contacts.some((contact) =>
    [contact.name, contact.person].some((known) => known !== null && known.toLowerCase().split(/\s+/)[0] === words[0] && known.toLowerCase().startsWith(said)),
  );
}

function person(name: string): { page: string; trail: Step[] } {
  return { page: personName(name.replace(/^my\s+/i, "")), trail: [ROOT, PEOPLE] };
}

/**
 * What a line says about a life, or null. `said` is the line with its short
 * forms written out (shared/slang.ts); `contacts` are everybody already kept,
 * who are not given a page here.
 */
export function readLifeFact(said: string, contacts: readonly { name: string; person: string | null }[]): LifeFact | null {
  const line = tidy(said.replace(/^(?:remember(?:\s+that)?|fyi|note(?:\s+that)?|btw)[:,\s]+/i, "").replace(/’/g, "'"));
  if (!line || isSecret(line) || /\b(?:need\s+to|have\s+to|remind\s+me|don'?t\s+forget|should|must|gotta|got\s+to)\b/i.test(line)) return null;
  const me = (fact: string, date: LifeFact["date"] = null): LifeFact => ({ kind: "me", page: ABOUT_ME, trail: [ROOT], fact, date });

  // About you.
  const mine = /^(?:my|our)\s+([\p{L} -]{2,30}?)\s+(?:is|are|=|:)\s+(.+)$/iu.exec(line);
  if (mine) {
    const key = tidy(mine[1] ?? "");
    const value = tidy(mine[2] ?? "");
    const dated = /birth\s?day|bday|anniversary|date\s+of\s+birth|dob/i.test(key);
    if (dated) {
      const date = monthDayOf(value);
      if (date) return me(`${capital(key.replace(/^bday$/i, "birthday"))}: ${sayMonthDay(date)}`, date);
    } else if (
      !EVENTISH.test(key) &&
      !WHENISH.test(value) &&
      !/^(?:on|at|by|due|from|till|until|coming|going|getting|being|so|very|really|too|not|killing|hurting|broken|dead|down|off|over|late)\b/i.test(value) &&
      value.split(/\s+/).length <= 8 &&
      (KEYS.test(key) || /\d/.test(value))
    ) {
      return me(`${capital(key)}: ${value}`);
    }
  }
  const allergic = /^(?:i'?m|i\s+am)\s+allergic\s+to\s+(.+)$/i.exec(line);
  if (allergic) return me(`Allergic to: ${tidy(allergic[1] ?? "")}`);
  const diet = DIET.exec(line);
  if (diet) return me(`${/vegetarian|vegan|eggetarian|pescatarian|lactose|gluten|jain|teetotal/i.test(diet[1] ?? "") ? "Diet" : "About me"}: ${tidy(diet[1] ?? "")}`);
  const prefer = /^i\s+(prefer|always\s+(?:take|order|get|sit\s+in)|can'?t\s+eat|cannot\s+eat|don'?t\s+eat|do\s+not\s+eat)\s+(.+)$/i.exec(line);
  if (prefer) return me(`${/eat/i.test(prefer[1] ?? "") ? "Doesn't eat" : "Prefers"}: ${tidy(prefer[2] ?? "")}`);

  // Where things are.
  const parked = /^(?:i\s+)?parked\s+(?:the\s+(?:car|bike|scooter)\s+|my\s+(?:car|bike|scooter)\s+)?(?:on|in|at|near|outside|opposite|behind)\s+(.+)$/i.exec(line);
  if (parked) return { kind: "where", page: WHERE_THINGS_ARE, trail: [ROOT], fact: `Parked: ${tidy(parked[1] ?? "")}`, date: null };
  const kept = new RegExp(String.raw`^(?:i\s+)?(?:kept|put|left|stored|hid|placed|stashed)\s+(?:my\s+|the\s+|our\s+)?(.+?)\s+${PLACE_PREP}\s+(.+)$`, "i").exec(line);
  if (kept && !WHENISH.test(line)) {
    const what = tidy(kept[1] ?? "");
    if (what.split(/\s+/).length <= 4 && !NOT_A_PERSON.has(what.toLowerCase())) {
      return { kind: "where", page: WHERE_THINGS_ARE, trail: [ROOT], fact: `${capital(what)}: ${kept[2]} ${tidy(kept[3] ?? "")}`, date: null };
    }
  }
  const lies = new RegExp(String.raw`^(?:(the|my|our)\s+)?(.{2,30}?)\s+(?:is|are)\s+(?:kept\s+|stored\s+|lying\s+)?${PLACE_PREP}\s+(the|my|our|his|her|a)\s+(.+)$`, "i").exec(line);
  if (lies && !WHENISH.test(line) && !EVENTISH.test(lies[2] ?? "") && (lies[1] || THINGS.test(lies[2] ?? ""))) {
    const what = tidy(lies[2] ?? "");
    return { kind: "where", page: WHERE_THINGS_ARE, trail: [ROOT], fact: `${capital(what)}: ${lies[3]} ${lies[4]} ${tidy(lies[5] ?? "")}`, date: null };
  }

  // What was lent, and what came back.
  const lent = new RegExp(String.raw`^(?:i\s+)?lent\s+(?:my\s+|the\s+|a\s+|an\s+|our\s+)?(.+?)\s+to\s+${NAME}$`, "iu").exec(line);
  if (lent && aPersonish(lent[2] ?? "")) {
    return { kind: "lent", page: LENT_AND_BORROWED, trail: [ROOT], fact: `${capital(tidy(lent[1] ?? ""))}: lent to ${personName(lent[2] ?? "")}`, date: null };
  }
  const borrowed = new RegExp(String.raw`^(?:i\s+)?borrowed\s+(?:a\s+|an\s+|the\s+|his\s+|her\s+|their\s+)?(.+?)\s+from\s+${NAME}$`, "iu").exec(line);
  if (borrowed && aPersonish(borrowed[2] ?? "")) {
    return { kind: "lent", page: LENT_AND_BORROWED, trail: [ROOT], fact: `${capital(tidy(borrowed[1] ?? ""))}: borrowed from ${personName(borrowed[2] ?? "")}`, date: null };
  }
  const has = new RegExp(String.raw`^${NAME}\s+(?:has|took|borrowed|still\s+has)\s+my\s+(.+)$`, "iu").exec(line);
  if (has && aPersonish(has[1] ?? "")) {
    return { kind: "lent", page: LENT_AND_BORROWED, trail: [ROOT], fact: `${capital(tidy(has[2] ?? ""))}: lent to ${personName(has[1] ?? "")}`, date: null };
  }
  const back =
    new RegExp(String.raw`^${NAME}\s+(?:returned|gave\s+back|gave\s+me\s+back)\s+(?:my\s+|the\s+)?(.+)$`, "iu").exec(line) ??
    new RegExp(String.raw`^(?:i\s+)?got\s+(?:my\s+|the\s+)?(.+?)\s+back(?:\s+from\s+${NAME})?$`, "iu").exec(line);
  if (back) {
    const returned = /^(?:i\s+)?got\s/i.test(line);
    const what = tidy((returned ? back[1] : back[2]) ?? "");
    const who = returned ? back[2] : back[1];
    if (what && what.split(/\s+/).length <= 4 && (!who || aPersonish(who))) {
      return { kind: "lent", page: LENT_AND_BORROWED, trail: [ROOT], fact: `${capital(what)}: back${who ? ` from ${personName(who)}` : ""}`, date: null };
    }
  }

  // The people in it.
  const theirDay = new RegExp(String.raw`^(?:my\s+)?${NAME}(?:'s|s')\s+(birth\s?day|bday|(?:wedding\s+)?anniversary)\s+is\s+(?:on\s+)?(.+)$`, "iu").exec(line);
  if (theirDay && aPerson(theirDay[1] ?? "", contacts)) {
    const date = monthDayOf(theirDay[3] ?? "");
    if (date) {
      const what = /anniversary/i.test(theirDay[2] ?? "") ? "Anniversary" : "Birthday";
      return { kind: "person", ...person(theirDay[1] ?? ""), fact: `${what}: ${sayMonthDay(date)}`, date };
    }
  }
  const family = new RegExp(String.raw`^(?:my\s+)?${NAME}(?:'s|s')\s+${RELATION}(?:'s\s+name)?\s+(?:is\s+called|is\s+named|is|are|name\s+is|names\s+are)\s+(.+)$`, "iu").exec(line);
  if (family && aPerson(family[1] ?? "", contacts)) {
    return { kind: "person", ...person(family[1] ?? ""), fact: `${capital(family[2] ?? "")}: ${personName(tidy(family[3] ?? ""))}`, date: null };
  }
  const theirs = new RegExp(String.raw`^(?:my\s+)?${NAME}(?:'s|s')\s+([\p{L} -]{2,30}?)\s+(?:is|are)\s+(.+)$`, "iu").exec(line);
  if (theirs && aPerson(theirs[1] ?? "", contacts) && KEYS.test(tidy(theirs[2] ?? "")) && !WHENISH.test(theirs[3] ?? "")) {
    return { kind: "person", ...person(theirs[1] ?? ""), fact: `${capital(tidy(theirs[2] ?? ""))}: ${tidy(theirs[3] ?? "")}`, date: null };
  }
  const likes = new RegExp(String.raw`^(?:my\s+)?${NAME}\s+${LIKE_VERBS}\s+(.+)$`, "iu").exec(line);
  if (likes && aPerson(likes[1] ?? "", contacts) && !WHENISH.test(likes[3] ?? "")) {
    const key = LIKES.find(([verb]) => verb.test(tidy(likes[2] ?? "")))?.[1] ?? "Likes";
    return { kind: "person", ...person(likes[1] ?? ""), fact: `${key}: ${tidy(likes[3] ?? "")}`, date: null };
  }
  const lives = new RegExp(String.raw`^(?:my\s+)?${NAME}\s+(lives\s+in|moved\s+to|works\s+at|works\s+for|joined|started\s+at|started\s+working\s+at|studies\s+at|goes\s+to|got\s+into)\s+(.+)$`, "iu").exec(line);
  if (lives && aPerson(lives[1] ?? "", contacts) && !WHENISH.test(lives[3] ?? "")) {
    const key = WHERE_VERBS.find(([verb]) => verb.test(tidy(lives[2] ?? "")))?.[1] ?? "About";
    return { kind: "person", ...person(lives[1] ?? ""), fact: `${key}: ${tidy(lives[3] ?? "")}`, date: null };
  }
  // The name ends where the news starts: "meera just got engaged" is Meera.
  const news = new RegExp(String.raw`^(?:my\s+)?${NAME}\s+(?=(?:just|recently|finally)\s|(?:got|is|had|graduated|passed|retired|broke|bought|moved|cleared|won)\b)(.+)$`, "iu").exec(line);
  if (news && aPerson(news[1] ?? "", contacts)) {
    const happened = NEWS.exec(news[2] ?? "");
    if (happened) return { kind: "person", ...person(news[1] ?? ""), fact: `News: ${tidy(`${happened[2] ?? ""}${happened[3] ?? ""}`)}`, date: null };
  }
  return null;
}

/** For lending, where somebody already a contact is still who has the drill. */
function aPersonish(name: string): boolean {
  return !name.toLowerCase().split(/\s+/).some((word) => NOT_A_PERSON.has(word));
}
