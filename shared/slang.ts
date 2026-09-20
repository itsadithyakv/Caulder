/**
 * Short forms, written out before anything is read.
 *
 * "mtg w rahul nxt wk", "gotta call mom b4 fri", "ask u abt pricing". People
 * type a task the way they would text it, and the reading should not depend
 * on having typed "with" in full. So the short forms that mean exactly one
 * thing are written out first, and everything after - the when, the area, the
 * title - is read from the line as it would have been said.
 *
 * **Only the ones that mean one thing.** "doc" is a doctor and a document,
 * "inv" an invoice and an invite, "apt" a flat and an appointment, and "2" and
 * "4" are numbers far more often than they are "to" and "for" - so none of
 * those is here. A short form left alone is still a perfectly good title; one
 * written out wrongly is a task about something else.
 *
 * The days and times people shorten - tmrw, 2nite, eod - are not here either:
 * shared/quickadd.ts reads those as the when, and takes them out of the title
 * rather than spelling them out in it.
 */

const SHORT: Record<string, string> = {
  // The small words.
  u: "you", ur: "your", urs: "yours", w: "with", "w/": "with", wid: "with", "w/o": "without",
  abt: "about", bc: "because", bcz: "because", bcoz: "because", cuz: "because", coz: "because",
  b4: "before", bfr: "before", thru: "through", tho: "though",
  smth: "something", sth: "something", smthng: "something", sm1: "someone", ppl: "people",
  evry1: "everyone", every1: "everyone", any1: "anyone",
  // When.
  nxt: "next", wk: "week", wks: "weeks", wknd: "weekend", wkend: "weekend", mnth: "month",
  yday: "yesterday", ystd: "yesterday", l8r: "later", l8: "late", rn: "right now",
  mrng: "morning", morn: "morning", aftn: "afternoon", arvo: "afternoon", evng: "evening",
  evn: "evening", nite: "night", evry: "every", evryday: "everyday", evrday: "everyday",
  // Things.
  msg: "message", msgs: "messages", mtg: "meeting", mtng: "meeting", mtgs: "meetings",
  appt: "appointment", appts: "appointments", asgn: "assignment", asgmt: "assignment",
  assgmt: "assignment", asmt: "assignment", proj: "project", bday: "birthday", "b'day": "birthday",
  anniv: "anniversary", "f/u": "follow up", fup: "follow up", fwd: "forward", pymt: "payment",
  pmt: "payment", amt: "amount", acct: "account", dept: "department", govt: "government",
  clg: "college", gr8: "great", w8: "wait",
  // How much it matters.
  imp: "important", impt: "important", urg: "urgent", urgnt: "urgent",
  // The way it is said out loud.
  gonna: "going to", gotta: "got to", hafta: "have to", wanna: "want to", lemme: "let me",
  gimme: "give me", imma: "i'm going to", ima: "i'm going to", iont: "i don't", idk: "i don't know",
  dunno: "don't know", im: "i'm", ive: "i've", dont: "don't", cant: "can't", wont: "won't",
  didnt: "didn't", doesnt: "doesn't", isnt: "isn't", wasnt: "wasn't", havent: "haven't",
  shouldnt: "shouldn't", couldnt: "couldn't", wouldnt: "wouldn't",
  plz: "please", pls: "please", plss: "please", thx: "thanks", thnx: "thanks", tnx: "thanks",
  // Said around a thought rather than in it; gone, like "please" is.
  btw: "", ngl: "", tbh: "", lol: "", lowkey: "", highkey: "",
};

/**
 * Read only as typed in lowercase. "U" is a university and "W" an initial;
 * "IM" is a message and "RN" a nurse.
 */
const LOWER_ONLY = new Set(["u", "ur", "w", "im", "rn", "ima"]);

/**
 * "ion" is "I don't" only in front of what people do not do - and an ion
 * everywhere else, in a chemistry lab report.
 */
const ION = /(^|\s)ion(?=\s+(?:wanna|want|know|think|feel|like|care|need|have|got|get|see|even|really|mind)\b)/g;

/** The line with its short forms written out. Case follows what was typed. */
export function expand(text: string): string {
  return text
    .replace(ION, (_whole, lead: string) => `${lead}i don't`)
    .replace(/(^|[\s(])([\p{L}\p{N}][\p{L}\p{N}/']*)(?=$|[\s,.;:!?)])/gu, (whole, lead: string, token: string) => {
      const meant = SHORT[token.toLowerCase()];
      if (meant === undefined) return whole;
      if (LOWER_ONLY.has(token.toLowerCase()) && token !== token.toLowerCase()) return whole;
      // A line typed in capitals stays in capitals, so it still reads as shouting.
      if (token.length > 1 && token === token.toUpperCase() && /\p{L}/u.test(token)) return lead + meant.toUpperCase();
      if (token[0] !== token[0]?.toLowerCase()) return lead + meant.charAt(0).toUpperCase() + meant.slice(1);
      return lead + meant;
    });
}
