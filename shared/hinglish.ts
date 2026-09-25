/**
 * Hinglish, said the English way, before anything reads it.
 *
 * "kal subah gym jaana hai", "mummy ko call karna hai", "paani piya", "report
 * bhejni hai client ko". Hindi says the thing to do last and who it is for with
 * a word after the name ("rahul ko" is to Rahul, "mom ke saath" with Mom), so
 * the line is turned round: the one verb is found and whether it is to be done
 * or was done, each "ko", "se" and "ke saath" becomes the English it means, and
 * it is said again in English order - "need to go to gym tomorrow morning",
 * "drank water". Everything after that - the when, the area, the habit it
 * ticks, the reminder - is read from the English, by the readers that already
 * know English.
 *
 * Careful, like the rest of rephrase: only a line with words that are only
 * ever Hindi is touched. "meet Kal Penn tomorrow" and "call abhi at 5" are left
 * exactly as typed.
 */

/** Joins the words of one phrase, so "day after tomorrow" moves as one. */
const J = String.fromCharCode(0xe000);
/** Marks a when: "tomorrow", "at 5". */
const WHEN = String.fromCharCode(0xe001);
/** Marks a "with mom", "for tea", "in the car". */
const WITH = String.fromCharCode(0xe002);
/** Marks who it is done to or given to: "rahul ko". */
const TO = String.fromCharCode(0xe003);
/** Marks who it comes from or is done with: "rahul se". */
const FROM = String.fromCharCode(0xe004);
/** Marks the verb: its mood, then what it means in English. */
const VERB = String.fromCharCode(0xe005);
const MARKS = new RegExp(`[${J}${WHEN}${WITH}${TO}${FROM}${VERB}]`, "g");
/** Any of the marks, for a character class: they are one run of private characters. */
const MARKED = `${J}-${VERB}`;

const mark = (kind: string, words: string) => kind + words.trim().split(/\s+/).join(J);
const said = (token: string) => token.replace(MARKS, (c) => (c === J ? " " : "")).trim();
const isMarked = (token: string) => new RegExp(`^[${MARKED}]`).test(token);

const HINDI_DAYS: Record<string, string> = {
  somvar: "monday", somwar: "monday", mangalvar: "tuesday", mangalwar: "tuesday", budhvar: "wednesday",
  budhwar: "wednesday", guruvar: "thursday", guruwar: "thursday", veervar: "thursday", shukravar: "friday",
  shukrawar: "friday", shanivar: "saturday", shaniwar: "saturday", ravivar: "sunday", raviwar: "sunday",
  itwar: "sunday", itvar: "sunday",
};

/** Words that are only ever Hindi: one is enough. */
const HINDI = new RegExp(
  String.raw`\b(?:hai|hain|hoon|tha|thi|karna|karni|karne|krna|krni|kardo|kardena|karunga|karungi|jaana|jaani|jaane|jaunga|jaungi|jayenge|leni|lene|deni|dene|bharna|bharni|bhejna|bhejni|bhejne|milna|milni|milne|milte|uthna|peena|peeni|dhona|dhone|dhoni|padhna|padhni|padhai|likhna|dekhna|dekhni|kharidna|kharidni|piya|kiya|kia|khaya|liya|diya|dekha|padha|likha|bheja|soya|nahaya|bhara|baje|bje|parso|parson|subah|subha|shaam|dopahar|mujhe|mujhko|humein|maine|yaar|bahut|bohot|bhot|nahi|nahin|nhi|kuch|kuchh|rozana|yaad|bhool|pakka|jaldi|doodh|sabzi|sabji|kapde|paani|dawai|kiraya|agle|hafte|thak|khush|udaas|pareshan|udhaar|udhar|udhari|diye|liye|ghante|ghanta|baare|${Object.keys(HINDI_DAYS).join("|")})\b`,
  "i",
);
/** Words that are Hindi more often than not, but are a name or an English word too: two are needed. */
const LIKELY = /\b(?:aaj|kal|gaya|gayi|gaye|lana|laana|lena|dena|se|ko|mein|roz|ghar|abhi|hu|ho|ka|ki|ke|ne|raat|pani)\b/gi;

export function isHinglish(line: string): boolean {
  if (HINDI.test(line)) return true;
  return new Set((line.match(LIKELY) ?? []).map((word) => word.toLowerCase())).size >= 2;
}

/** The same word spelt the ways it is texted, spelt one way. */
const SPELLINGS: [RegExp, string][] = [
  [/\b(?:bohot|bahot|bhot|bht|bhut|bahut)\b/gi, "very"],
  [/\b(?:nhi|nai|nahin)\b/gi, "nahi"],
  [/\b(?:hoon|hun)\b/gi, "hu"],
  [/\bkr(na|ni|ne|o|unga|ungi|enge)\b/gi, "kar$1"],
  [/\bkr\b/gi, "kar"],
  [/\bkar(do|dena|diya|di|lena|liya)\b/gi, "kar $1"],
  [/\bkuchh?\b|\bkch\b/gi, "kuch"],
  [/\bsubha\b/gi, "subah"],
  [/\bsham\b/gi, "shaam"],
  [/\bghr\b/gi, "ghar"],
  [/\bpani\b/gi, "paani"],
  [/\bdudh\b/gi, "doodh"],
  [/\bsabji\b/gi, "sabzi"],
  [/\bkapda\b/gi, "kapde"],
  [/\bjana\b/gi, "jaana"],
  [/\bchutti\b/gi, "chhutti"],
  [/\s+(?:h|he|hy|hei)\s*$/i, " hai"],
];

// ── When ────────────────────────────────────────────────────────────────────

const DAY_WORD = String.raw`(?:mon|tues|wednes|thurs|fri|satur|sun)day|${Object.keys(HINDI_DAYS).join("|")}`;
const dayOf = (word: string) => HINDI_DAYS[word.toLowerCase()] ?? word.toLowerCase();
const PARTS: Record<string, string> = { subah: "morning", shaam: "evening", raat: "night", dopahar: "afternoon" };

function nth(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
}

/** What it says about when, each said in English and marked, so it can be put at the end. */
function whens(text: string, past: boolean): string {
  const W = (words: string) => ` ${mark(WHEN, words)} `;
  const rules: [RegExp, (...m: string[]) => string][] = [
    [/\baaj\s+raat(?:\s+ko)?\b/gi, () => W("tonight")],
    [/\bkal\s+raat(?:\s+ko)?\b/gi, () => W(past ? "last night" : "tomorrow night")],
    [/\bkal\s+se\b/gi, () => W("from tomorrow")],
    [/\baaj\s+se\b/gi, () => W("from today")],
    [/\b(\S+)\s+se\s+pehle\b/gi, (_w, what) => W(`before ${what}`)],
    [/\b(\S+)\s+ke\s+baad\b/gi, (_w, what) => W(`after ${what}`)],
    [/\bbaad\s+(?:mein|me)\b/gi, () => W("later")],
    [/\b(?:very\s+)?der\s+(?:raat\s+)?tak\b/gi, () => W("till late")],
    [/\b(\d{1,2})\s+(?:tarikh|tareekh)\s+tak\b/gi, (_w, d) => W(`by the ${nth(Number(d))}`)],
    [/\bkal\s+tak\b/gi, () => W("by tomorrow")],
    [/\baaj\s+tak\b/gi, () => W("by today")],
    [/\bshaam\s+tak\b/gi, () => W("by this evening")],
    [new RegExp(String.raw`\b(${DAY_WORD})\s+tak\b`, "gi"), (_w, day) => W(`by ${dayOf(day ?? "")}`)],
    [/\bweekend\s+(?:pe|par|ko)\b/gi, () => W("this weekend")],
    [/\b(\d+)\s+(din|hafte|hafton|mahine)\s+(?:mein|me|mai|baad)\b/gi, (_w, much, unit) =>
      W(`in ${much} ${/^din/i.test(unit ?? "") ? "days" : /^haft/i.test(unit ?? "") ? "weeks" : "months"}`),
    ],
    [/\babhi\b(?!\s+(?:ko|se|ka|ki|ke|ne)\b)/gi, () => W("now")],
    [/\bpars(?:o|on)\b/gi, () => W("day after tomorrow")],
    [/\bagle\s+hafte\b/gi, () => W("next week")],
    [/\bagle\s+mahine\b/gi, () => W("next month")],
    [/\bis\s+hafte\b/gi, () => W("this week")],
    [/\bpichle\s+hafte\b/gi, () => W("last week")],
    [/\bhar\s+(?:roz|din)\b|\brozana\b|\broz\b|\bdaily\b/gi, () => W("every day")],
    [/\bhar\s+hafte\b/gi, () => W("every week")],
    [/\bhar\s+mahine\b/gi, () => W("every month")],
    [new RegExp(String.raw`\bhar\s+(${DAY_WORD})\b`, "gi"), (_w, day) => W(`every ${dayOf(day ?? "")}`)],
    [new RegExp(String.raw`\b(${DAY_WORD})(?:\s+ko)?\b`, "gi"), (_w, day) => W(dayOf(day ?? ""))],
    // Half past, a quarter to: "sade 5 baje" is 5:30, "paune 5" is 4:45.
    [/\b(?:sade|saade|sadhe)\s+(\d{1,2})(?:\s+(?:baje|bje))?\b/gi, (_w, h) => W(`at ${h}:30`)],
    [/\bderh(?:\s+(?:baje|bje))?\b/gi, () => W("at 1:30")],
    [/\bdhai(?:\s+(?:baje|bje))?\b/gi, () => W("at 2:30")],
    [/\bpaune\s+(\d{1,2})(?:\s+(?:baje|bje))?\b/gi, (_w, h) => W(`at ${Number(h) === 1 ? 12 : Number(h) - 1}:45`)],
    [/\b(\d{1,2})(?:[:.](\d{2}))?\s+(?:baje|bje)\b/gi, (_w, h, m) => W(`at ${h}${m ? `:${m}` : ""}`)],
    [/\b(\d{1,2})\s+(?:tarikh|tareekh)(?:\s+ko)?\b/gi, (_w, d) => W(`on the ${nth(Number(d))}`)],
    [/\b(\d{1,2})\s+ko\b/gi, (whole, d) => (Number(d) >= 1 && Number(d) <= 31 ? W(`on the ${nth(Number(d))}`) : whole)],
    [/\b(subah|shaam|raat|dopahar)(?:\s+ko)?\b/gi, (_w, part) => W(PARTS[(part ?? "").toLowerCase()] ?? "")],
    [/\baaj\b/gi, () => W("today")],
    [/\bkal\b/gi, () => W(past ? "yesterday" : "tomorrow")],
    [/\bjaldi\b/gi, () => W("early")],
    // What is already English about when, so it goes to the end with the rest.
    [new RegExp(String.raw`(?<![${MARKED}])\b(today|tonight|tomorrow|tmrw|tmr|yesterday|morning|evening|afternoon|night|weekend|eod|later|(?:next|this)\s+(?:week|month|weekend))\b`, "gi"), (_w, word) => W(word ?? "")],
    [/\b(\d{1,2}(?::\d{2})?\s*(?:am|pm))\b/gi, (_w, at) => W(at ?? "")],
  ];
  let line = text;
  for (const [pattern, say] of rules) line = line.replace(pattern, (...m) => say(...(m as string[])));
  return line;
}

// ── Who, and with what ──────────────────────────────────────────────────────

/** A word that is not already marked. */
const WORD = `([^\\s${MARKED}]+)`;
/** Said of a thing paid for: "netflix ka bill" is the Netflix bill, not Netflix's. */
const BILLS = /^(?:bill|bills|fees?|recharge|subscription|emi|payment|plan|renewal)$/i;
const MEALS = /^(?:chai|tea|coffee|lunch|dinner|breakfast|nashta|drinks?|daaru|beer)$/i;

function around(text: string): string {
  return text
    .replace(new RegExp(String.raw`${WORD}\s+ke\s+(?:baare|bare)\s+(?:mein|me|mai)\b`, "gi"), (_w, what) => ` ${mark(WITH, `about ${noun(what)}`)} `)
    .replace(/\b(\d+(?:\.\d+)?)\s+(ghante|ghanta|ghanton|hours?|hrs?|minute|minutes|mins?)\b/gi, (_w, much, unit) =>
      ` ${mark(WITH, `for ${much} ${/^(?:ghant|hour|hr)/i.test(unit) ? (Number(much) === 1 ? "hour" : "hours") : "minutes"}`)} `,
    )
    .replace(new RegExp(String.raw`${WORD}\s+ke\s+(?:saath|sath|sang)\b`, "gi"), (_w, who) => ` ${mark(WITH, `with ${noun(who)}`)} `)
    .replace(new RegExp(String.raw`${WORD}\s+ke\s+liye\b`, "gi"), (_w, who) => ` ${mark(WITH, `for ${noun(who)}`)} `)
    .replace(new RegExp(String.raw`${WORD}\s+(?:mein|mei)\b`, "gi"), (_w, where) => ` ${mark(WITH, `in ${noun(where)}`)} `)
    .replace(new RegExp(String.raw`${WORD}\s+(?:pe|par)\b`, "gi"), (_w, where) =>
      ` ${mark(WITH, `${MEALS.test(where) ? "for" : "at"} ${noun(where)}`)} `,
    )
    .replace(new RegExp(String.raw`${WORD}\s+ko\b`, "gi"), (_w, who) => ` ${mark(TO, noun(who))} `)
    .replace(new RegExp(String.raw`${WORD}\s+se\b`, "gi"), (_w, who) => ` ${mark(FROM, noun(who))} `)
    // "mummy ka birthday" is Mummy's; "bijli ka bill" is the electricity bill.
    .replace(new RegExp(String.raw`${WORD}\s+(?:ka|ki|ke)\s+(?=(\S+))`, "gi"), (_w, whose, what) =>
      NOUNS[whose.toLowerCase()] || BILLS.test(what ?? "") ? `${noun(whose)} ` : `${whose}'s `,
    )
    .replace(/\b(\S+)\s+ne\b/gi, "$1");
}

const NOUNS: Record<string, string> = {
  doodh: "milk", sabzi: "vegetables", kapde: "clothes", ghar: "home", paani: "water", chai: "tea",
  khana: "food", khaana: "food", dawai: "medicine", dawa: "medicine", davai: "medicine", kitaab: "book",
  kitab: "book", dukaan: "shop", dukan: "shop", bazaar: "market", bazar: "market", kaam: "work",
  naukri: "job", paise: "money", paisa: "money", kiraya: "rent", kiraaya: "rent", bartan: "dishes",
  nashta: "breakfast", dost: "friend", dosto: "friends", doston: "friends", gaadi: "car", gadi: "car",
  bijli: "electricity", ande: "eggs", anda: "egg", chawal: "rice", atta: "flour", cheeni: "sugar",
  chini: "sugar", namak: "salt", dahi: "curd", sabun: "soap", tel: "oil", fal: "fruit", phal: "fruit",
  kamra: "room", kamre: "room", bistar: "bed", chabi: "keys", chaabi: "keys", joote: "shoes",
  padosi: "neighbour", shaadi: "wedding", chhutti: "day off", safar: "trip", gaana: "song", gana: "song",
  padhai: "study", safai: "cleaning", ek: "a", aur: "and", phir: "then", kuch: "something",
  picture: "movie", pic: "movie", mera: "my", meri: "my", mere: "my", apna: "my", apni: "my", apne: "my",
  tera: "your", teri: "your", tere: "your", hamara: "our", hamari: "our", hamare: "our",
};
const noun = (word: string) => NOUNS[word.toLowerCase()] ?? word;

// ── The verb ────────────────────────────────────────────────────────────────

type Mood = "need" | "did";
const n = String.raw`n[aie]`; // jaana, jaani, jaane
const will = String.raw`un?g[ai]|enge|ega|egi`; // jaunga, jayenge

/** What each Hindi verb means, in each way it is said: to be done, and done. Longer ones first. */
const HINDI_VERBS: { base: string; need: string; did: string }[] = [
  { base: "talk to", need: String.raw`baat\s+kar${n}`, did: String.raw`baat\s+(?:ho\s+ga(?:ya|yi)|hui)` },
  { base: "finish", need: String.raw`khatam\s+ho${n}`, did: String.raw`ho\s+ga(?:ya|yi|ye)|khatam\s+ho\s+ga(?:ya|yi)` },
  { base: "cook", need: String.raw`kha+na\s+bana+${n}|paka+${n}`, did: String.raw`kha+na\s+banaya|pakaya` },
  { base: "get a haircut", need: String.raw`baal\s+katwa(?:${n}|${will})(?:\s+ja+${n})?`, did: String.raw`baal\s+katwa(?:ye|\s+liye)` },
  { base: "go for a walk", need: String.raw`walk\s+(?:pe|par)\s+ja+${n}|te?ha?lne\s+ja+${n}`, did: String.raw`walk\s+(?:pe|par)\s+ga(?:ya|yi)` },
  { base: "take leave", need: String.raw`chhutti\s+le${n}`, did: String.raw`chhutti\s+li` },
  { base: "return", need: String.raw`lauta+${n}|[wv]apas\s+(?:kar${n}|de${n})`, did: String.raw`lautaya|[wv]apas\s+(?:kiya|kiye|diya)` },
  { base: "get", need: String.raw`le\s+(?:ke\s+|kar\s+)?a+${n}|la+${n}|la(?:${will})`, did: String.raw`le\s+aa?ya|la+ya|layi|la+ye` },
  { base: "get", need: String.raw`le${n}|lu(?:ng[ai])|le\s+le${n}`, did: String.raw`liya|liye|le\s+liya|le\s+li` },
  { base: "give", need: String.raw`de${n}|du(?:ng[ai])|de\s+de${n}`, did: String.raw`diya|diye|de\s+diya|de\s+di` },
  { base: "pay", need: String.raw`bhar${n}|bhar\s+de${n}`, did: String.raw`bhara|bhari|bhar\s+diya|bhar\s+di` },
  { base: "send", need: String.raw`bhej${n}|bhej\s+de${n}|bhej(?:${will})`, did: String.raw`bheja|bheji|bheje|bhej\s+diya|bhej\s+di` },
  { base: "meet", need: String.raw`mil${n}|mil(?:${will})|milte`, did: String.raw`mila|mili|mile` },
  { base: "wake up", need: String.raw`uth${n}|uth(?:${will})`, did: String.raw`utha|uthi|uth\s+ga(?:ya|yi)` },
  { base: "sleep", need: String.raw`so\s+ja+${n}|so${n}|so(?:${will})`, did: String.raw`soya|soyi|so\s+ga(?:ya|yi)` },
  { base: "drink", need: String.raw`pee?${n}|pee?\s+le${n}|piy(?:${will})`, did: String.raw`piya|piye|pee?\s+li(?:ya)?` },
  { base: "eat", need: String.raw`kha+${n}|kha\s+le${n}|khau(?:ng[ai])`, did: String.raw`kha+ya|khayi|khaye|kha\s+li(?:ya)?` },
  { base: "wash", need: String.raw`dho${n}|dho\s+de${n}`, did: String.raw`dhoya|dhoye|dhoyi|dho\s+di(?:ya|ye)` },
  { base: "pick up", need: String.raw`utha+${n}|utha\s+le${n}`, did: String.raw`uthaya|uthayi|utha\s+liya` },
  { base: "study", need: String.raw`padh${n}|padh(?:${will})`, did: String.raw`padha|padhi|padhe` },
  { base: "write", need: String.raw`likh${n}`, did: String.raw`likha|likhi|likhe` },
  { base: "watch", need: String.raw`dekh${n}|dekh(?:${will})`, did: String.raw`dekha|dekhi|dekhe` },
  { base: "listen to", need: String.raw`sun${n}`, did: String.raw`suna|suni|sune` },
  { base: "make", need: String.raw`bana+${n}|bana\s+le${n}`, did: String.raw`banaya|banayi|banaye` },
  { base: "buy", need: String.raw`khare?e?d${n}|kharid\s+le${n}`, did: String.raw`khare?e?da|kharidi|kharide` },
  { base: "sell", need: String.raw`bech${n}`, did: String.raw`becha|bechi|beche` },
  { base: "ask", need: String.raw`(?:poo|pu)chh?${n}`, did: String.raw`(?:poo|pu)chh?a|(?:poo|pu)chh?i` },
  { base: "tell", need: String.raw`bata+${n}|bol${n}`, did: String.raw`bataya|batayi|bola|boli` },
  { base: "learn", need: String.raw`(?:see|si)kh${n}`, did: String.raw`(?:see|si)kha|(?:see|si)khi` },
  { base: "shower", need: String.raw`naha+${n}|naha\s+le${n}`, did: String.raw`nahaya|nahayi|naha\s+li(?:ya)?` },
  { base: "drop off", need: String.raw`chh?od${n}|chh?od\s+de${n}`, did: String.raw`chh?oda|chh?odi|chh?od\s+diya` },
  { base: "find", need: String.raw`dh(?:oo|u)ndh${n}`, did: String.raw`dh(?:oo|u)ndha` },
  { base: "come", need: String.raw`a+${n}|a+u(?:ng[ai])|aayenge`, did: String.raw`a+ya|a+yi|a+ye` },
  { base: "go to", need: String.raw`ja+${n}|ja+u(?:ng[ai])|ja+y?enge`, did: String.raw`ga(?:ya|yi|ye|i)|gy[ai]` },
];

/** "kar": to do the word before it - "submit karna" is to submit, "saaf karna" to clean. */
const KAR_NEED = String.raw`kar(?:${n}|${will}|o|\s+(?:de${n}|do|le${n}))`;
const KAR_DID = String.raw`kiya|kiye|kia|kari|kar\s+(?:diya|di|diye|liya|li|liye)`;

const LIGHT: Record<string, string> = {
  saaf: "clean", safai: "clean up", khatam: "finish", khatm: "finish", poora: "finish", pura: "finish",
  shuru: "start", band: "turn off", taiyaar: "prepare", taiyari: "prepare", tayari: "prepare",
  tyari: "prepare", baat: "talk to", madad: "help", intezaar: "wait for", intezar: "wait for",
  padhai: "study", pooja: "pray", puja: "pray", kasrat: "exercise", yaad: "learn", phone: "call",
  call: "call", msg: "message", message: "message", text: "message", whatsapp: "message",
  mail: "email", email: "email", gym: "go to gym", workout: "work out", walk: "walk",
  kaam: "work", party: "party", try: "try", kharidari: "go shopping", recharge: "recharge",
};
/** English said with "karna" that is itself the thing to do. */
const ENGLISH_VERBS = new Set(
  (
    "submit check book pay order cancel finish clean print plan prepare practice practise meditate study revise complete " +
    "send fix pack sign apply register renew update review edit share post upload download install charge clear confirm " +
    "schedule reschedule prepone postpone iron water feed visit reply follow finalize finalise design draft write read " +
    "watch test start stop change transfer withdraw deposit collect pickup drop exercise stretch shave cook bake wash " +
    "backup sync contact invite remind thank wish ask tell help learn teach explain present discuss arrange organise " +
    "organize sort delete forward attend join leave decide choose compare buy sell rent repair service file claim verify " +
    "link block unblock report research analyse analyze calculate save track log rest relax nap run jog swim cycle " +
    "memorize memorise mop sweep dust vacuum refill top-up topup deliver return accept approve reject setup handover"
  ).split(" "),
);
const GO_ING = /^(?:shopping|swimming|jogging|running|cycling|trekking|hiking|bowling|dancing|skating|fishing|camping)$/i;

type Found = { base: string; mood: Mood; at: number; length: number };

/** The verb a line ends on - the last one said, which in Hindi is the one that matters. */
function findVerb(text: string): Found | null {
  let found: Found | null = null;
  const consider = (pattern: string, mood: Mood, base: (m: RegExpExecArray) => string) => {
    const re = new RegExp(String.raw`(^|\s)(${pattern})(?=$|\s)`, "gi");
    for (let m = re.exec(text); m; m = re.exec(text)) {
      const at = m.index + (m[1] ?? "").length;
      const length = (m[2] ?? "").length;
      const end = at + length;
      if (!found || end > found.at + found.length || (end === found.at + found.length && length > found.length)) {
        found = { base: base(m), mood, at, length };
      }
    }
  };
  for (const verb of HINDI_VERBS) {
    consider(verb.need, "need", () => verb.base);
    consider(verb.did, "did", () => verb.base);
  }
  // With "kar", the word before it is part of the verb.
  const light = (m: RegExpExecArray) => m[2] ?? "";
  consider(String.raw`${WORD.slice(1, -1)}\s+(?:${KAR_NEED})`, "need", light);
  consider(String.raw`${WORD.slice(1, -1)}\s+(?:${KAR_DID})`, "did", light);
  return found ? withKar(found) : null;
}

/** "submit karna" to "submit", "saaf karna" to "clean", "yoga karna" to "do yoga". */
function withKar(found: Found): Found {
  const words = found.base.trim().split(/\s+/);
  if (words.length < 2 || !/^(?:kar|kiya|kiye|kia|kari)/i.test(words[1] ?? "")) return found;
  const before = (words[0] ?? "").toLowerCase();
  if (isMarked(before)) return { ...found, base: "do" };
  const base = LIGHT[before] ?? (ENGLISH_VERBS.has(before) ? before : GO_ING.test(before) ? `go ${before}` : `do ${noun(before)}`);
  return { ...found, base };
}

const PAST: Record<string, string> = {
  go: "went", come: "came", get: "got", give: "gave", pay: "paid", send: "sent", meet: "met", wake: "woke",
  sleep: "slept", drink: "drank", eat: "ate", read: "read", write: "wrote", make: "made", buy: "bought",
  sell: "sold", tell: "told", find: "found", do: "did", take: "took", run: "ran", swim: "swam", leave: "left",
  teach: "taught", learn: "learnt", pick: "picked", drop: "dropped", plan: "planned", submit: "submitted",
  stop: "stopped", shop: "shopped", jog: "jogged", chat: "chatted", prep: "prepped", "set": "set",
};
/** Said as done: "go to" is "went to", "meditate" is "meditated". */
export function pastOf(base: string): string {
  const [head = "", ...tail] = base.split(" ");
  const done =
    PAST[head] ??
    (/e$/.test(head) ? `${head}d` : /[^aeiou]y$/.test(head) ? `${head.slice(0, -1)}ied` : `${head}ed`);
  return [done, ...tail].join(" ");
}

// ── Putting it back together ────────────────────────────────────────────────

/** Said around the thing, meaning nothing on its own. */
const FILLER = /^(?:hai|hain|hu|ho|tha|thi|na|toh|bhi|pakka|zaroor|zarur|bas|yaar|wala|wali|wale|mujhe|mujhko|humein|hume|humko|maine|meine|mene|please)$/i;
/** Who is said in front, as the one doing it: "main kal jaunga". */
const SUBJECT = /^\s*(?:main|mai|mein|hum)\s+/i;

/** Verbs done to somebody directly: "call rahul", "meet rahul". The rest are done to something, for somebody. */
const DIRECT = /^(?:call|message|email|tell|remind|meet|pick up|drop off|help|ask|wish|thank|invite|teach|visit|talk to|wait for)$/;
const PAY_FOR = /^(?:rent|bill|bills|fees?|emi|tax|salary|money|electricity)$/i;

const FEELINGS: Record<string, string> = {
  thak: "tired", thaka: "tired", thaki: "tired", khush: "happy", udaas: "sad", udas: "sad", dukhi: "sad",
  pareshan: "stressed", tension: "stressed", tensed: "stressed", gussa: "angry", naraz: "upset", naraaz: "upset",
  bore: "bored", bored: "bored", akela: "lonely", akeli: "lonely", bimaar: "sick", beemar: "sick", bimar: "sick",
  tired: "tired", happy: "happy", sad: "sad", sick: "sick", stressed: "stressed", anxious: "anxious",
  excited: "excited", nervous: "nervous", low: "low", down: "down", angry: "angry", frustrated: "frustrated",
  lonely: "lonely", sleepy: "sleepy", confused: "confused", scared: "scared", good: "good", great: "great",
  bad: "bad", ok: "okay", okay: "okay", fresh: "fresh", relaxed: "relaxed", motivated: "motivated",
};
const HINDI_FEELINGS = new Set(["thak", "thaka", "thaki", "khush", "udaas", "udas", "dukhi", "pareshan", "tension", "gussa", "naraz", "naraaz", "akela", "akeli", "bimaar", "beemar", "bimar"]);
const FEEL = new RegExp(
  String.raw`(?:^|\s)(very\s+)?(?:(mood\s+(?:off|kharab|kharaab))|(mood\s+(?:acha|accha|achha|mast))|(${Object.keys(FEELINGS).join("|")})(\s+(?:ga(?:ya|yi|ye)|chuka|chuki|hua|hui|ho\s+(?:gaya|gayi|raha|rahi)|lag\s+raha|lag\s+rahi|feel\s+(?:ho\s+raha|kar\s+raha|kar\s+rahi)))?)(\s+(?:hu|hai|h)\b|\s*$)`,
  "i",
);

/** "rahul ko 500 dene hai": money owed, in the words the money rules already read. */
function owed(text: string): string | null {
  const who = WORD;
  const money = String.raw`((?:rs\.?|₹)\s*)?(\d[\d,]*(?:\.\d+)?\s*k?)(?:\s*(?:rs|rupees|rupaye|rupay|rupya|₹))?`;
  const rules: [RegExp, (who: string, amount: string) => string][] = [
    [new RegExp(String.raw`${who}\s+ko\s+${money}\s+(?:udh?aa?r|udhari)\s+(?:de\s+)?di(?:ya|ye)?\b`, "iu"), (w, a) => `lent ${w} ${a}`],
    [new RegExp(String.raw`${who}\s+se\s+${money}\s+(?:udh?aa?r|udhari)\s+(?:le\s+)?li(?:ya|ye)?\b`, "iu"), (w, a) => `i owe ${w} ${a}`],
    [new RegExp(String.raw`${who}\s+ne\s+${money}\s+(?:udh?aa?r\s+)?li(?:ya|ye)?\b`, "iu"), (w, a) => `${w} borrowed ${a}`],
    [new RegExp(String.raw`${who}\s+(?:ko|ke)\s+${money}\s+(?:wapas\s+)?de${n}\b`, "iu"), (w, a) => `pay ${w} ${a}`],
    [new RegExp(String.raw`${who}\s+se\s+${money}\s+(?:wapas\s+)?le${n}\b`, "iu"), (w, a) => `get ${a} back from ${w}`],
  ];
  for (const [pattern, say] of rules) {
    const m = pattern.exec(text);
    if (m) {
      const rest = (text.slice(0, m.index) + " " + text.slice(m.index + m[0].length)).trim();
      return `${say(m[1] ?? "", (m[3] ?? "").replace(/\s+/g, ""))}${rest ? ` ${rest}` : ""}`;
    }
  }
  return null;
}

/** A reminder asked for in Hindi: "yaad dila dena", "bhool mat jaana". */
const REMIND = /\b(?:mujhe\s+)?(?:yaad\s+dila(?:na|\s+dena|\s+do|\s+diyo|\s+dijiye|iyo)?|bhool\s+(?:mat|na)\s+ja+na|bhoolna\s+(?:mat|nahi)|mat\s+bhoolna)\b/i;

export function hinglish(input: string): string {
  if (!isHinglish(input)) return input;
  let line = ` ${input.replace(/[,!?]+/g, " ").replace(/\.(?!\d)/g, " ")} `;
  for (const [spelt, as] of SPELLINGS) line = line.replace(spelt, as);
  line = ` ${line.trim()} `;

  const remind = REMIND.test(line);
  line = line.replace(REMIND, " ").replace(SUBJECT, " ");

  // "kal" is yesterday when the line is about something done.
  const past = /\b(?:tha|thi|kiya|kia|gaya|gayi|gaye|hua|hui|liya|diya|piya|khaya|dekha|padha|mila|mili|soya|utha)\b/i.test(line);
  line = whens(line, past);
  line = line.replace(/\bkuch\s+(?:bhi\s+)?nahi\s+(?:kiya|kia|hua)\b/gi, " did nothing ");
  line = line.replace(/\bvery\s+(?=(?:kaam|padhai|tension|traffic|kuch)\b)/gi, "a lot of ");

  const money = owed(line);
  if (money !== null) return finish(money.split(/\s+/).filter((word) => !FILLER.test(word)));

  // A feeling: "aaj bahut thak gaya hu" is "I'm feeling very tired today".
  const feeling = FEEL.exec(line);
  const english = feeling && feeling[4] && !HINDI_FEELINGS.has(feeling[4].toLowerCase());
  if (feeling && !(english && !feeling[5] && !(feeling[6] ?? "").trim())) {
    const how = feeling[2] ? "low" : feeling[3] ? "good" : FEELINGS[(feeling[4] ?? "").toLowerCase()] ?? feeling[4] ?? "";
    const rest = (line.slice(0, feeling.index) + " " + line.slice(feeling.index + feeling[0].length)).split(/\s+/);
    return finish([`I'm feeling ${feeling[1] ? "very " : ""}${how}`, ...order(around(rest.join(" ")).split(/\s+/), null)]);
  }

  line = line.replace(/\s(ki)(\s+(?:hai|tha|thi))?\s*$/i, " kiya$2 ");
  const verb = findVerb(line);
  if (!verb) return finish(order(around(line).split(/\s+/), null));
  const before = line.slice(0, verb.at).replace(/\s(?:ka|ki|ke)\s*$/i, " ");
  const after = line.slice(verb.at + verb.length);
  const negated = /\bnahi\s*$/i.test(before);
  const words = [...around(before.replace(/\bnahi\s*$/i, "")).split(/\s+/), VERB, ...around(after).split(/\s+/)];
  return finish(order(words, { ...verb, negated, remind }));
}

/** The words in English order: the verb, who it is done to, what, with whom, and when. */
function order(words: string[], verb: (Found & { negated: boolean; remind: boolean }) | null): string[] {
  const direct: string[] = [];
  const things: string[] = [];
  const to: string[] = [];
  const withs: string[] = [];
  const when: string[] = [];
  let afterVerb = false;
  for (const raw of words) {
    const word = raw.trim();
    if (!word) continue;
    if (word === VERB) {
      afterVerb = true;
      continue;
    }
    const kind = word[0];
    if (kind === WHEN) when.push(word);
    else if (kind === WITH) withs.push(word);
    else if (kind === TO || kind === FROM) {
      const who = said(word);
      if (verb && DIRECT.test(verb.base)) direct.push(who);
      else if (kind === TO) to.push(verb?.base === "send" || verb?.base === "give" || verb?.base === "return" || verb?.base === "pay" ? `to ${who}` : who);
      else to.push(verb ? `from ${who}` : who);
    } else if (FILLER.test(word)) continue;
    // A name said after the verb, as an afterthought, is who it is for: "milte hai rahul".
    else if (afterVerb && verb && DIRECT.test(verb.base) && !NOUNS[word.toLowerCase()]) direct.push(word);
    else things.push(noun(word));
  }
  if (!verb) return [...things, ...direct, ...to, ...withs, ...when];

  let base = verb.base;
  if (base === "give" && things.some((thing) => PAY_FOR.test(thing))) base = "pay";
  if (base === "study" && things.some((thing) => /^(?:book|chapter|novel|article|newspaper)s?$/i.test(thing))) base = "read";
  if (base === "watch" && things.some((thing) => /^(?:e?mails?|messages?|notes?)$/i.test(thing))) base = "check";
  if (base === "go to") {
    const where = things[0] ?? "";
    if (!where) base = "go";
    else if (/^home$/i.test(where)) base = "go";
    else if (GO_ING.test(where)) base = "go";
  }
  if (base === "clean" && things.length === 1 && things[0] === "home") things[0] = "the house";
  if (direct.length > 0 && things.length > 0 && (base === "drop off" || base === "pick up")) {
    things[0] = `${base === "drop off" ? "at" : "from"} ${things[0]}`;
  }

  const head =
    verb.mood === "did"
      ? verb.negated
        ? `I didn't ${base}`
        : pastOf(base)
      : `${verb.remind ? "remind me to" : verb.negated ? "don't" : "need to"} ${base}`;
  return [head, ...direct, ...things, ...to, ...withs, ...when];
}

/** A day said some way, so a bare "shaam ko" is known to be this evening. */
const A_DAY = new RegExp(String.raw`\b(?:today|tonight|tomorrow|tmrw|tmr|yesterday|every|next|this|last|on the|from|before|after|${DAY_WORD})\b`, "i");

function finish(words: string[]): string {
  const line = words
    .map(said)
    .filter(Boolean)
    .join(" ")
    .replace(/\bevery day (morning|evening|night|afternoon)\b/gi, "every $1")
    .replace(/\s+/g, " ")
    .trim();
  if (A_DAY.test(line)) return line;
  return line.replace(/\b(morning|evening|afternoon)\b/i, "this $1").replace(/\bnight\b/i, "tonight");
}
