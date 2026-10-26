import { z } from "zod";
import { readCapture, type Ask, type CaptureKind, type CaptureReading, type Known } from "./capture";
import { placeNamed } from "./newperson";
import { shiftDay } from "./dates";
import type { Logged } from "./nextstep";
import type { AskAnswer } from "./ask";

/**
 * The line, read by the AI (PLAN.md, part ten, phase 38).
 *
 * The mark at the start of the line is a switch. Not pressed, a line is read
 * by the rules on this machine (shared/capture.ts) and nothing leaves it.
 * Pressed, the line goes to the AI that is connected, with today's date and
 * the names it might mean, and what comes back is put into the same reading
 * the rules make - so it is shown the same way, moved by the same chips, and
 * kept through the same channels. The AI never writes anything: it says what
 * it understood, and Enter keeps it, as ever.
 *
 * It may ask one question when it is unsure - "Where is Sumanth from?" - and
 * is read again with the answer. A line that is a question for it, or asks
 * it to write something, is answered instead (services/ask.ts).
 */

/** What is sent to be read: the line, and what was answered when the AI asked about it. */
export const lineInput = z.object({
  line: z.string().trim().min(1, "Type something first.").max(600, "Keep a line under 600 characters."),
  answers: z
    .array(z.object({ question: z.string().trim().min(1).max(300), answer: z.string().trim().min(1).max(300) }))
    .max(4)
    .default([]),
});
export type LineInput = z.input<typeof lineInput>;

const AI_KINDS = ["task", "happened", "new_contact", "update_contact", "remember", "idea", "note", "spend", "question"] as const;
const VIA = ["call", "meeting", "whatsapp", "linkedin", "instagram", "replied", "note"] as const;

const words = (most: number) =>
  z
    .string()
    .trim()
    .max(most)
    .nullish()
    .catch(null)
    .transform((value) => (value && value.toLowerCase() !== "null" ? value : null));
const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullish()
  .catch(null)
  .transform((value) => value ?? null);

/** What the AI says a line is. Every field is forgiving: a model that leaves one out, or gets one wrong, has still read the rest. */
const aiLine = z.object({
  kind: z.enum(AI_KINDS).catch("note"),
  contact: words(160),
  person: words(120),
  company: words(160),
  phone: words(40),
  email: words(160),
  title: words(200),
  day,
  time: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .nullish()
    .catch(null)
    .transform((value) => value ?? null),
  happened: words(400),
  via: z.enum(VIA).catch("note"),
  then: z
    .object({ title: z.string().trim().min(1).max(200), day })
    .nullish()
    .catch(null)
    .transform((value) => value ?? null),
  amount: z
    .number()
    .finite()
    .nullish()
    .catch(null)
    .transform((value) => value ?? null),
  what: words(200),
  ask: words(200),
});
export type AiLine = z.infer<typeof aiLine>;

/** The AI's reply as what it says the line is, or null when it is not something that can be read. */
export function parseAiLine(text: string): AiLine | null {
  const from = text.indexOf("{");
  const to = text.lastIndexOf("}");
  if (from === -1 || to <= from) return null;
  try {
    const parsed = aiLine.safeParse(JSON.parse(text.slice(from, to + 1)));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** What comes back from reading a line: what it is, or - for a question - its answer. */
export type AiLineResult =
  | {
      is: "reading";
      line: AiLine;
      service: string;
      model: string;
      /** What went with the line: how many names, and how much in all. */
      sent: { contacts: number; characters: number };
      usage: AskAnswer["usage"];
    }
  | { is: "answer"; answer: AskAnswer };

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * What the AI is told before the line. Short on purpose: a line is read many
 * times a day, and every word here is paid for each time.
 */
export function linePrompt(told: {
  company: string;
  brief: string;
  today: string;
  contacts: readonly { name: string; person: string | null }[];
  pages: readonly string[];
}): string {
  const weekday = WEEKDAYS[new Date(`${told.today}T00:00:00Z`).getUTCDay()] ?? "";
  return [
    `You read one line typed by the founder of ${told.company} into Caulder, their app for contacts, deals, money, tasks and company notes, and say what it is. Today is ${weekday} ${told.today}.`,
    `About the company: ${told.brief.replace(/\s*\n\s*/g, " ")}`,
    "Reply with one JSON object and nothing else:",
    `{"kind": "task" | "happened" | "new_contact" | "update_contact" | "remember" | "idea" | "note" | "spend" | "question",
 "contact": the exact name of a known contact the line is about, or null,
 "person": a person's name, when they are not a known contact, or null,
 "company": where that person is from, when the line says, or null,
 "phone": string or null, "email": string or null,
 "title": for a task - what to do, as an instruction, without the day - or null,
 "day": "YYYY-MM-DD" or null, "time": "HH:MM" (24 hour) or null,
 "happened": what happened, in one plain sentence, or null,
 "via": "call" | "meeting" | "whatsapp" | "linkedin" | "instagram" | "replied" | "note",
 "then": {"title": what the line leaves to be done, "day": "YYYY-MM-DD" or null} or null,
 "amount": a number or null, "what": what the money was for, or null,
 "ask": one short question for the founder when something needed is missing or unclear, else null}`,
    [
      "Kinds: task - something the founder is to do. happened - something that happened with a known contact, for their history; when it also leaves something to do (they asked for it, the founder promised it, or they said they would do something and it is to be checked on), put that in then. new_contact - it is about a person who is not a known contact: give person and company. update_contact - a known contact's phone or email. remember - a fact about how the company runs, worth keeping. idea - something floated. spend - money spent: amount and what. question - the line asks you something or asks you to write something. note - anything else.",
      'via: "replied" when they wrote back; a place only when the line names it; otherwise "note".',
      "Dates: work them out from today. A loose when is a day - next week is the same weekday next week, in a few days is three days on, mid-month is the 15th. Never give a day the line does not imply; leave it null.",
      "contact must be copied exactly from the known contacts, matching a misspelt or shortened name when it is plainly them. If two could be meant, or it names a person with nowhere they are from, set ask - \"Which Priya?\", \"Where is Sumanth from?\" - rather than guessing. Ask nothing you can work out.",
    ].join("\n"),
    told.contacts.length > 0
      ? `Known contacts the line might mean, as "company | person":\n${told.contacts.map((contact) => `${contact.name} | ${contact.person ?? "-"}`).join("\n")}`
      : "There are no known contacts yet.",
    ...(told.pages.length > 0 ? [`Pages of the company's notes: ${told.pages.join("; ")}`] : []),
  ].join("\n\n");
}

/** The line and what was answered about it, as it is put to the AI. */
export function lineAsked(input: { line: string; answers: readonly { question: string; answer: string }[] }): string {
  return [input.line, ...input.answers.map((each) => `(You asked: ${each.question} The founder answered: ${each.answer})`)].join("\n");
}

/**
 * A line that is for the AI to answer rather than to keep: a question, or
 * something to write. Told from the words, on this machine, so that it goes
 * with what a question needs (services/relevant.ts) rather than being read
 * first and asked second.
 */
export function isForAi(line: string): boolean {
  const said = line.trim();
  if (/\?\s*$/.test(said)) return true;
  return /^(?:please\s+|pls\s+|can\s+you\s+|could\s+you\s+)?(?:draft|compose|summari[sz]e|explain|suggest|rewrite|reword|brainstorm|write\s+(?:me\s+)?(?:an?|the|up|out)\b)/i.test(said) && said.split(/\s+/).length >= 4;
}

const key = (text: string | null) => (text ?? "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** The contact the AI named: by the company or the person exactly, and otherwise only when one contact answers to it. */
function contactNamed(named: string | null, contacts: Known["contacts"]): { id: string; name: string } | null {
  const said = key(named);
  if (!said) return null;
  // "Company | person", as the list was given, is read back the same way.
  const [first = said] = (named ?? "").split("|").map(key);
  const exact = contacts.filter((each) => [key(each.name), key(each.person)].some((name) => name !== "" && (name === said || name === first)));
  const found = exact.length > 0 ? exact : contacts.filter((each) => key(each.name).includes(first) || (key(each.person) !== "" && key(each.person).includes(first)));
  const one = found.length === 1 ? found[0] : exact[0];
  return one ? { id: one.id, name: one.name } : null;
}

/**
 * What the AI said, as the reading the line shows and keeps. Everything it
 * names is checked against what Caulder holds: a contact that is not one is
 * nobody, and somebody "new" who is a contact already is that contact.
 */
export function readingFromAi(ai: AiLine, line: string, known: Known, clock: { today: string; now: number }): CaptureReading {
  // The page a memory goes on, what is kept, and what must never be kept in the open: as the rules read them.
  const base = readCapture(line, known, clock, { contact: null, from: null });
  const who = contactNamed(ai.contact, known.contacts);
  const then = ai.then ? { title: ai.then.title, day: ai.then.day ?? shiftDay(clock.today, 1), time: null, daySaid: ai.then.day !== null, why: "asked" as const } : null;
  const logged: Logged = ai.via;

  const made = (kind: CaptureKind, more: Partial<CaptureReading> = {}): CaptureReading => {
    const ask = more.ask ?? null;
    const options: CaptureKind[] = [...(ask ? (["command"] as const) : []), "task", ...(more.contact ? (["contact"] as const) : []), "memory", "idea", "note"];
    return {
      kind,
      text: base.text,
      contact: null,
      page: base.page,
      topic: base.topic,
      fact: base.fact,
      ask: null,
      spend: null,
      logged: "note",
      then: null,
      doubt: ai.ask ? { text: ai.ask, options: [{ label: "Skip the question", contact: null }], open: true } : null,
      because: "read by the AI",
      options,
      warn: base.warn,
      ...more,
    };
  };

  /** Somebody new, as the contact they would be: kept under where they are from, or under their own name. */
  const introduce = (): CaptureReading => {
    const company = ai.company ? placeNamed(ai.company) : null;
    const person = ai.person;
    const already = contactNamed(company && person ? `${company} | ${person}` : null, known.contacts) ?? (person ? contactNamed(person, known.contacts) : null);
    if (already) return made("contact", { contact: already, logged, then });
    if (!company && !person) return made("note");
    const ask: Ask = {
      do: "contact",
      name: company ?? (person as string),
      person: company ? person : null,
      phone: ai.phone,
      email: ai.email,
      role: null,
      source: null,
      happened: ai.happened,
      then: then ? { title: then.title, day: then.day, time: null, daySaid: then.daySaid } : null,
    };
    return made("command", {
      ask,
      logged,
      // A person with nowhere they are from is asked about, whether or not the AI thought to.
      ...(ai.ask || company ? {} : { doubt: { text: `Where is ${person} from?`, options: [{ label: "Keep them without", contact: null }], open: true } }),
    });
  };

  switch (ai.kind) {
    case "task":
      return made("task", { contact: who, task: { title: ai.title ?? base.text, day: ai.day, time: ai.time } });
    case "happened":
      return who ? made("contact", { contact: who, logged, then }) : ai.person || ai.company ? introduce() : made("note");
    case "new_contact":
      return introduce();
    case "update_contact":
      return who && (ai.phone || ai.email)
        ? made("command", { contact: who, ask: { do: "update", contact: who, phone: ai.phone, email: ai.email } })
        : made("note");
    case "remember":
      return made("memory");
    case "idea":
      return made("idea");
    case "spend": {
      if (ai.amount === null) return made("note");
      const spend = { do: "spend" as const, amount: Math.round(ai.amount), what: ai.what ?? base.text, daysAgo: 0 };
      return made("command", { ask: spend, spend });
    }
    default:
      return made("note");
  }
}

/**
 * Whether the AI read a line the way the rules did, in everything but its
 * wording: the same place, the same contact, the same days. When it did,
 * what was shown is what is kept and Enter need not be pressed twice; when
 * it did not, the AI's reading is shown first.
 */
export function sameReading(
  rules: { kind: CaptureKind; reading: CaptureReading; day: string | null; time: string | null },
  ai: CaptureReading,
): boolean {
  if (rules.reading.doubt || ai.doubt || rules.kind !== ai.kind) return false;
  if ((rules.reading.contact?.id ?? null) !== (ai.contact?.id ?? null)) return false;
  if (ai.kind === "task") return (ai.task?.day ?? null) === rules.day && (ai.task?.time ?? null) === rules.time;
  if (ai.kind === "contact") return (rules.reading.then?.day ?? null) === (ai.then?.day ?? null) && rules.reading.logged === ai.logged;
  if (ai.kind === "command") {
    const [mine, theirs] = [rules.reading.ask, ai.ask];
    if (!mine || !theirs || mine.do !== theirs.do) return false;
    if (mine.do === "contact" && theirs.do === "contact") {
      return key(mine.name) === key(theirs.name) && key(mine.person) === key(theirs.person) && (mine.then?.day ?? null) === (theirs.then?.day ?? null);
    }
    if (mine.do === "spend" && theirs.do === "spend") return mine.amount === theirs.amount;
    if (mine.do === "update" && theirs.do === "update") return mine.phone === theirs.phone && mine.email === theirs.email;
    return false;
  }
  return true;
}
