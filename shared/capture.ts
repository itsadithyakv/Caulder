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
 *  4. When it happens, or an instruction - "by friday", "submit", "call" -
 *     is a task.
 *  5. The first person, a feeling, a day looked back on - "felt", "today
 *     was", "grateful", "shipped the pricing page" - is the journal.
 *  6. Anything else is a note, caught and filed later: nothing is lost by
 *     the line being unsure.
 */

export type CaptureKind = "task" | "journal" | "contact" | "hobby" | "idea" | "note";

export type Known = {
  contacts: readonly { id: string; name: string; person: string | null }[];
  hobbies: readonly { id: string; title: string }[];
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
  /** For a contact's history: what kind of entry it is. */
  logged: "call" | "meeting" | "note";
  /** Why, in a few words, for the reading under the line. */
  because: string;
  /** Every kind the line could sensibly go to, for the chips. */
  options: CaptureKind[];
};

const PREFIX = /^\s*(journal|j|idea|note|task|todo)\s*[:\-–]\s*/i;

/** Said about something still to come: the start of an instruction. */
const DOING = new Set([
  "call", "ring", "phone", "email", "mail", "message", "text", "whatsapp", "follow", "chase", "remind",
  "send", "submit", "finish", "complete", "write", "draft", "prepare", "prep", "book", "buy", "pay", "fix",
  "read", "revise", "study", "review", "schedule", "plan", "meet", "visit", "go", "get", "make", "update",
  "check", "ask", "tell", "clean", "order", "renew", "file", "register", "apply", "practise", "practice",
  "learn", "do", "start", "sign", "print", "upload", "post", "publish", "ship", "demo", "pitch",
]);

/** Words that put a line in time. */
const WHEN =
  /\b(today|tonight|tonite|tomorrow|tmrw|tmr|2moro|by|before|next|on (mon|tue|wed|thu|fri|sat|sun)|mon(day)?|tue(s|sday)?|wed(nesday)?|thu(rs|rsday)?|fri(day)?|sat(urday)?|sun(day)?|this (week|weekend|evening|morning|afternoon)|at \d{1,2}|\d{1,2}(:\d{2})?\s?(am|pm)|every|in \d+ (days?|weeks?))\b/i;

/** Said about something that happened: a contact's history. */
const HAPPENED = /\b(called|rang|spoke|talked|met|emailed|mailed|messaged|texted|replied|said|says|told|asked|agreed|signed|paid|wants|want|loved|liked|declined|no answer|voicemail)\b/i;
const CALLED = /\b(called|rang|spoke|talked|phoned|no answer|voicemail)\b/i;
const MET = /\b(met|meeting|visited)\b/i;

/** Said in the first person, about a day: the journal. */
const FELT =
  /\b(i('m| am| was| felt| feel|'ve| have| had| got| did)|felt|feeling|today was|good day|bad day|long day|rough|tough|awful|terrible|lovely|productive|lazy|tired|exhausted|happy|sad|stressed|anxious|grateful|thankful|proud|frustrated|excited|calm|overwhelmed|slept|mood)\b/i;

const IDEA = /^\s*(what if|maybe we (could|should)|idea\b)/i;

/** A line that starts by saying what was done - "shipped the pricing page" - is the day, looked back on. */
const NOT_PAST = new Set(["need", "feed", "seed", "speed", "red", "bed", "shed", "embed", "proceed", "exceed", "succeed"]);
const doneWord = (word: string) => word.length > 4 && word.endsWith("ed") && !NOT_PAST.has(word);

/** A length: "40 min", "1h", "1.5 hours", "an hour". */
const LENGTH = /\b(\d+(?:\.\d+)?)\s*(h|hr|hrs|hour|hours|m|min|mins|minute|minutes)\b|\ban hour\b|\bhalf an hour\b/i;
const DID_IT = /\b(played|practised|practiced|ran|run|swam|drew|painted|read|wrote|trained|did|gym|climbed|cooked|jammed|session)\b/i;

export function minutesIn(text: string): number | null {
  if (/\bhalf an hour\b/i.test(text)) return 30;
  if (/\ban hour\b/i.test(text)) return 60;
  const match = LENGTH.exec(text);
  if (!match || !match[1]) return null;
  const value = Number(match[1]);
  const unit = (match[2] ?? "").toLowerCase();
  const minutes = unit.startsWith("h") ? value * 60 : value;
  return minutes > 0 && minutes <= 12 * 60 ? Math.round(minutes) : null;
}

function words(text: string): string[] {
  return text.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? [];
}

/**
 * The contact a line names: their whole name or its start, or the name of the
 * person there, as whole words. The longest match wins, so "Oakridge
 * International" beats "Oakridge". A name has to be three letters or more to
 * count.
 */
export function namedContact(text: string, contacts: Known["contacts"]): { id: string; name: string } | null {
  const lower = ` ${words(text).join(" ")} `;
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
  return best ? { id: best.id, name: best.name } : null;
}

function namedHobby(text: string, hobbies: Known["hobbies"]): { id: string; title: string } | null {
  const lower = ` ${words(text).join(" ")} `;
  const found = hobbies
    .map((hobby) => ({ hobby, said: words(hobby.title).join(" ") }))
    .filter(({ said }) => said.length >= 3 && lower.includes(` ${said} `))
    .sort((a, b) => b.said.length - a.said.length)[0];
  return found ? found.hobby : null;
}

export function readCapture(line: string, known: Known): CaptureReading {
  const prefix = PREFIX.exec(line);
  const text = prefix ? line.slice(prefix[0].length).trim() : line.trim();
  const contact = namedContact(text, known.contacts);
  const hobby = namedHobby(text, known.hobbies);
  const minutes = minutesIn(text);
  const logged: CaptureReading["logged"] = CALLED.test(text) ? "call" : MET.test(text) ? "meeting" : "note";
  const first = words(text)[0] ?? "";
  const timed = WHEN.test(text);
  const instruction = DOING.has(first) || (first === "don't" && DOING.has(words(text)[2] ?? ""));

  const options: CaptureKind[] = ["task", "journal"];
  if (contact) options.push("contact");
  if (hobby) options.push("hobby");
  options.push("idea", "note");

  const reading = (kind: CaptureKind, because: string): CaptureReading => ({
    kind,
    text,
    contact,
    hobby,
    minutes,
    logged,
    because,
    options,
  });

  if (prefix) {
    const said = (prefix[1] ?? "").toLowerCase();
    const kind: CaptureKind = said === "j" || said === "journal" ? "journal" : said === "idea" ? "idea" : said === "note" ? "note" : "task";
    return reading(kind, `it starts with ${said}:`);
  }
  if (!text) return reading("note", "");

  if (contact) {
    if (instruction && timed) return reading("task", `something to do for ${contact.name}, with a when`);
    if (HAPPENED.test(text) || !timed) return reading("contact", `it is about ${contact.name}`);
    return reading("task", `something to do for ${contact.name}`);
  }
  if (hobby && (minutes !== null || DID_IT.test(text)) && !timed) return reading("hobby", `time given to ${hobby.title}`);
  if (IDEA.test(text)) return reading("idea", "it is an idea");
  if (timed || instruction) return reading("task", timed ? "it says when" : "it is something to do");
  if (FELT.test(text) || doneWord(first)) return reading("journal", "it is about your day");
  return reading("note", "kept to file later");
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
