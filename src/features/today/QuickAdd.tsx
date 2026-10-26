import { useEffect, useId, useMemo, useRef, useState } from "react";
import { CornerDownLeft, Sparkles } from "lucide-react";
import { linkAnswer, serviceOf, type AskState } from "@shared/ask";
import { isForAi, readingFromAi, sameReading, type AiLineResult } from "@shared/ailine";
import { sayParts, tokensIn } from "@shared/relevant";
import { isRulePage } from "@shared/rules";
import type { LinkedName } from "@shared/links";
import { Markdown } from "@/features/brain/Markdown";
import { useOpenRef } from "@/lib/navigate";
import { TASK_KIND_LABEL, TASK_REPEAT_LABEL, leadInput } from "@shared/domain";
import { describeWeekdays, parseQuick, type Answers, type Learned } from "@shared/quickadd";
import { namedContact, readCapture, type Ask, type CaptureKind, type Known } from "@shared/capture";
import { NO_CONTEXT, type Answer, type LastLine, type LineContext, type TaskSnapshot } from "@shared/lines";
import { readQuestion } from "@shared/questions";
import { readEdit, type Edit } from "@shared/edits";
import { followOn } from "@shared/followon";
import { together } from "@shared/together";
import { alreadyOpen, clashWith, complete, completionsFrom, readyFor, usualOf, yourDay } from "@shared/habitual";
import { cleanPaste } from "@shared/pasteline";
import { RUNNING_COST_TEMPLATE } from "@shared/costs";
import { AnswerReading, EditReading, ManyReading } from "./LinePanels";
import { sayShortcut } from "@shared/domain";
import { LESSON_KINDS, learntFrom, voteKind, type Lesson, type LessonKind } from "@shared/lessons";
import { secondOpinion, type Example } from "@shared/opinion";
import { REMIND_ME } from "@shared/nudges";
import { LOGGED_SAID } from "@shared/nextstep";
import { occurrencesOf } from "@shared/repeat";
import { addMonths, daysBetween, minutesOf, timeNow, today as todayIn } from "@shared/dates";
import { dateFormatter, formatDay, formatDuration, formatTime, inSentence, numberText } from "@/lib/format";
import { messageOf } from "@/lib/errors";

/**
 * One line, and it is a task.
 *
 * The full form asks five questions in a fixed order whether or not you had
 * the answers. This takes the line as you would say it - "send the
 * proposal at 4pm today", "standup mon wed fri 10am" - and shows what it
 * understood before anything is written, so a wrong reading is caught while
 * it is still one keystroke to fix.
 *
 * When something is genuinely missing it asks, one question at a time, with
 * the likely answers as buttons. Typing the answer into the line works just
 * as well: the question is only ever "what the parse does not have yet", so
 * adding "tomorrow" makes the question about the day disappear by itself.
 *
 * On Today it is **smart**: the line takes anything, and says where it will
 * go before it goes - a task, a contact's history, a memory on a brain page,
 * money, an idea, a note - from what Caulder knows (shared/capture.ts). The
 * chips under it move it somewhere else.
 */

const GOES_TO: Record<CaptureKind, string> = {
  task: "Task",
  contact: "History",
  memory: "Remember",
  command: "Do it",
  idea: "Idea",
  note: "Note",
};

/** What the line was asked to do, in the words it is offered in before Enter does it. */
function sayAsk(ask: Ask): string {
  switch (ask.do) {
    case "go":
      return `Go to ${ask.label}`;
    case "spend":
      return ask.amount < 0
        ? `Log ${-ask.amount} ${/^refund/i.test(ask.what) ? "back" : "in"}: ${ask.what}`
        : `Log ${ask.amount} spent: ${ask.what}`;
    case "contact":
      return `New contact: ${ask.person ? `${ask.person} at ${ask.name}` : ask.name}`;
    case "open":
      return ask.how === "email"
        ? `Write to ${ask.contact.name}`
        : ask.how === "call"
          ? `Call ${ask.contact.name}, with the prompter`
          : ask.how === "message"
            ? `Message ${ask.contact.name}`
            : `Open ${ask.contact.name}`;
    case "update":
      return `Save ${[ask.phone, ask.email].filter(Boolean).join(" and ")} on ${ask.contact.name}`;
    case "cost": {
      const years = ask.years ?? 1;
      const per = years > 1 ? `for ${years} years` : ask.cycle === "monthly" ? "a month" : ask.cycle === "yearly" ? "a year" : "a quarter";
      const sum = ask.amount === null ? null : `${numberText(ask.amount)} ${per}`;
      const when = ask.paid ? `paid, renews ${formatDay(addMonths(ask.on ?? "", 12 * years))}` : ask.on ? `renews ${formatDay(ask.on)}` : null;
      return [ask.title, [sum, when].filter(Boolean).join(", ")].filter(Boolean).join(": ");
    }
    case "paid":
      return `${ask.contact.name} paid${ask.amount ? ` ${numberText(ask.amount)}` : ""}: their invoice, marked`;
    case "account":
      return `${ask.title}: on ${ask.email}${ask.was ? `, not ${ask.was}` : ""}`;
  }
}

/** The page a thing the company pays for already has, by its title; "the domain", unnamed, is its one domain. */
async function pageFor(companyId: string, title: string, domain: boolean) {
  const titles = await window.caulder.brain.titles(companyId).catch(() => []);
  const named = titles.find((each) => each.title.trim().toLowerCase() === title.toLowerCase());
  const domains = titles.filter((each) => /^(?:[a-z0-9-]+\.)+[a-z]{2,}$/i.test(each.title.trim()));
  const match = named ?? (domain && title === "Domain" && domains.length === 1 ? domains[0] : undefined);
  return match ? await window.caulder.brain.page(match.id).catch(() => null) : null;
}

/**
 * The account a service was bought with, on its page in Tools - a new tool
 * page when it has none. A change of account keeps what it was, dated, at the
 * foot of the page: which email ran it last year is asked more than once.
 */
async function keepAccount(companyId: string, ask: Extract<Ask, { do: "account" }>, today: string): Promise<string> {
  const found = await pageFor(companyId, ask.title, ask.domain);
  const page = found ?? (await window.caulder.brain.create(companyId, "tools", ask.domain ? "domain" : "tool"));
  const before = typeof page.fields["account"] === "string" ? page.fields["account"].trim() : "";
  const was = ask.was ?? (before && before.toLowerCase() !== ask.email ? before : null);
  const body = was ? `${page.body.trimEnd()}\n\n- Was on ${was} until ${today}\n` : page.body;
  await window.caulder.brain.save(page.id, {
    title: found ? page.title : ask.title,
    body,
    fields: { ...page.fields, account: ask.email },
    secrets: {},
    baseRevision: page.revision,
  });
  return `${sayAsk(ask)}, on its page in Tools`;
}

/**
 * A running cost from the line (shared/costs.ts): a page in the brain's Money,
 * or a domain in Tools. Said again, the page it already has is brought up to
 * date rather than a second made. Paid ahead, the payment is logged and the
 * day moves a term on, by the one way a cost is paid (`costs:renew`).
 */
async function keepCost(companyId: string, ask: Extract<Ask, { do: "cost" }>, today: string): Promise<string> {
  const template = ask.domain ? "domain" : RUNNING_COST_TEMPLATE;
  const found = await pageFor(companyId, ask.title, ask.domain === true);
  const page = found && found.template === template ? found : await window.caulder.brain.create(companyId, ask.domain ? "tools" : "money", template);
  const years = ask.years ?? 1;
  const on = ask.on ?? (ask.day ? nextOnThe(ask.day, today) : null);
  const term = years > 1 ? years : (page.fields["years"] ?? null);
  const fields = ask.domain
    ? { ...page.fields, renewsOn: on ?? page.fields["renewsOn"] ?? null, cost: ask.amount === null ? (page.fields["cost"] ?? null) : Math.round(ask.amount / years), years: term }
    : {
        ...page.fields,
        amount: ask.amount ?? page.fields["amount"] ?? null,
        cycle: ask.cycle,
        dueOn: on ?? page.fields["dueOn"] ?? null,
        years: term,
        category: page.fields["category"] ?? costKind(ask.title),
      };
  await window.caulder.brain.save(page.id, { title: page === found ? page.title : ask.title, body: page.body, fields, secrets: {}, baseRevision: page.revision });
  if (ask.paid && on) await window.caulder.costs.renew(companyId, page.id);
  return `${sayAsk(ask)}, ${ask.domain ? "a domain in Tools" : "a running cost in Money"}`;
}

/** Where a running cost is filed, by what it is: a streaming service is software, the flat is rent. */
function costKind(title: string): string {
  if (/\b(?:rent|lease|pg|hostel)\b/i.test(title)) return "rent";
  if (/\b(?:aws|server|hosting|vercel|domain|gcp|azure|droplet|vps)\b/i.test(title)) return "hosting";
  if (/\b(?:netflix|spotify|prime|hotstar|youtube|icloud|google\s+one|chatgpt|claude|notion|figma|adobe|app|subscription|software|canva|zoom)\b/i.test(title)) {
    return "software";
  }
  return "other";
}

/** The next time the 5th comes round, from today. */
function nextOnThe(dayOfMonth: number, today: string): string {
  const [year = 2000, month = 1, day = 1] = today.split("-").map(Number);
  const fits = (y: number, m: number) => Math.min(dayOfMonth, new Date(Date.UTC(y, m, 0)).getUTCDate());
  const [y, m] = day <= fits(year, month) ? [year, month] : month === 12 ? [year + 1, 1] : [year, month + 1];
  return `${y}-${String(m).padStart(2, "0")}-${String(fits(y, m)).padStart(2, "0")}`;
}

export function QuickAdd({
  companyId,
  timezone,
  focusNonce = 0,
  placeholder = "Send the proposal at 4pm today",
  hint,
  onAdded,
  smart = false,
  onGo,
  onOpenContact,
}: {
  companyId: string;
  timezone: string;
  /** Bumped from outside - the A key - to put the cursor here. */
  focusNonce?: number;
  placeholder?: string;
  /** What to say under an empty line. The capture window has no A key to mention. */
  hint?: string;
  onAdded?: (summary: string) => void;
  /** Takes anything and works out where it goes, rather than only tasks. */
  smart?: boolean;
  /** "Go to money": where the app is asked to go. Without it, the line does not offer to. */
  onGo?: (place: Extract<Ask, { do: "go" }>["place"]) => void;
  /** "Email rahul": opens the contact, which is where writing and calling are. */
  onOpenContact?: (leadId: string, how: "email" | "call" | "message" | null) => void;
}) {
  const [text, setText] = useState("");
  const [answers, setAnswers] = useState<Answers>({});
  /**
   * What was answered when the line asked about somebody: who it meant - a
   * contact's id, or null for nobody - and the day what it leaves to do is for.
   * Belongs to the line it answered, like `answers`.
   */
  const [told, setTold] = useState<{ contact?: string | null; from?: string | null; thenDay?: string }>({});
  /** Facts that end and have not yet - "on leave till the 20th" - for a task planned for them before then. */
  const [awayList, setAwayList] = useState<{ leadId: string; text: string; until: string }[]>([]);
  /** A word the line asked about and was told who it is, kept once the line is (part twelve, phase 48). */
  const [taught, setTaught] = useState<{ said: string; leadId: string } | null>(null);
  /** What is being typed into a question that is answered in words: where somebody is from, or what the AI asked. */
  const [reply, setReply] = useState("");
  /**
   * AI mode (PLAN.md, part ten, phase 38): which AI is connected and whether
   * the mark is pressed; what it said this line is, keyed by the line so a
   * stale reading is never shown; what it asked and was answered; and whether
   * what it asked was passed over.
   */
  const [ai, setAi] = useState<AskState | null>(null);
  const [aiRead, setAiRead] = useState<{ key: string; result: AiLineResult } | null>(null);
  const [aiAnswers, setAiAnswers] = useState<{ question: string; answer: string }[]>([]);
  const [aiSkipped, setAiSkipped] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  /** The line the AI could not read - busy, over its limit, unreachable - so that Enter keeps it as read here. */
  const [aiDown, setAiDown] = useState<string | null>(null);
  /** The AI read it as the rules did: keep it on the next draw, without a second Enter. */
  const [keepNext, setKeepNext] = useState(false);
  /** Said when the mark is pressed with nothing connected. */
  const [modeNote, setModeNote] = useState<string | null>(null);
  const openRef = useOpenRef();
  const answerInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<string | null>(null);
  const readId = useId();
  const input = useRef<HTMLInputElement>(null);
  const firstOption = useRef<HTMLButtonElement>(null);

  /** What was learnt from lines moved before they were kept (shared/lessons.ts). */
  const [lessons, setLessons] = useState<readonly Lesson[]>([]);
  /** What Tune has settled: slips read without comment, and words never touched. */
  const [learned, setLearned] = useState<Learned>({ same: {}, keep: [] });
  /** The key that opens the quick window from any app, when one is held. */
  const [anywhere, setAnywhere] = useState<string | null>(null);
  /** What the smart line recognises: the contacts, and the brain's pages by their titles. */
  const [known, setKnown] = useState<Known>({ contacts: [] });
  /** Where the person moved it to, over what the line guessed. */
  const [chosen, setChosen] = useState<CaptureKind | null>(null);
  /** Bumped once something is kept, so what the line knows about today is read again. */
  const [kept, setKept] = useState(0);
  /** What is already there - open tasks, the hours ahead, what was typed before (shared/lines.ts). */
  const [context, setContext] = useState<LineContext>(NO_CONTEXT);
  /** The last thing this line made, so the next line can mean it: "actually 6pm", "him", "also eggs". */
  const [last, setLast] = useState<LastLine | null>(null);
  /** What the last cancel took away, for Undo. */
  /** What Undo takes back: a cancelled task and its hour, or a task ticked off from the line. */
  const [undo, setUndo] = useState<{ title: string; snapshot: TaskSnapshot } | { title: string; reopen: string } | null>(null);
  /** A rule just kept that says nearly what an older one on its page does: offered instead of it, once. */
  const [instead, setInstead] = useState<{ pageId: string; raw: string; says: string } | null>(null);
  /** Read this line the plain way: not as a question, an edit or several things. */
  const [plainly, setPlainly] = useState(false);
  /** The usual hour offered for this line, turned down. */
  const [noUsual, setNoUsual] = useState(false);
  /** The day before a pitch or a demo, asked for. */
  const [getReady, setGetReady] = useState(false);
  /** The answer to the question the line is, keyed by the question so a stale one is never shown. */
  const [answered, setAnswered] = useState<{ key: string; answer: Answer | null; error: string | null } | null>(null);

  useEffect(() => {
    if (focusNonce > 0) input.current?.focus();
  }, [focusNonce]);

  // What the line has learnt, read again whenever the window comes back to the
  // front. The capture window is hidden and re-shown rather than rebuilt, so
  // an answer given in Settings a minute ago would otherwise not reach it
  // until the app restarted. A failed read leaves the line working without.
  useEffect(() => {
    const read = () => {
      window.caulder.tune.learned().then(setLearned, () => undefined);
      window.caulder.lessons.list().then(setLessons, () => undefined);
      window.caulder.capture.get().then((key) => setAnywhere(key.held ? key.accelerator : null), () => undefined);
      if (smart) window.caulder.ask.state().then(setAi, () => undefined);
    };
    read();
    window.addEventListener("focus", read);
    return () => window.removeEventListener("focus", read);
  }, [smart]);

  // The names the smart line listens for, read when the window comes back to the front.
  useEffect(() => {
    if (!smart) return;
    const read = () => {
      Promise.all([
        window.caulder.leads.list({ companyId, sort: "name", direction: "asc" }),
        // A nicety: a brain that will not open is not a reason to know nobody's name.
        window.caulder.brain.titles(companyId).catch(() => []),
        // Who a word means, from answers given before (part twelve, phase 48).
        window.caulder.tune.names(companyId).catch(() => []),
        window.caulder.facts.away(companyId, todayIn(timezone)).catch(() => []),
      ]).then(
        ([contacts, pages, names, away]) => {
          setKnown({
            contacts: contacts.map((contact) => ({ id: contact.id, name: contact.name, person: contact.contactPerson })),
            pages,
            names: names.map((name) => ({ said: name.said, contact: name.leadId })),
          });
          setAwayList(away);
        },
        () => undefined,
      );
    };
    read();
    window.addEventListener("focus", read);
    return () => window.removeEventListener("focus", read);
  }, [smart, companyId, kept]);

  // What is already there, read when the window comes back to the front and
  // after every line kept - never on a keystroke. Without it the line still
  // reads; it only cannot mean what is there.
  useEffect(() => {
    const read = () => {
      window.caulder.lines.context(companyId, todayIn(timezone)).then(setContext, () => undefined);
    };
    read();
    window.addEventListener("focus", read);
    return () => window.removeEventListener("focus", read);
  }, [companyId, timezone, kept]);

  // The clock where the workspace is, read on every keystroke: a quick-add
  // left open over lunch must not think it is still the morning.
  const today = todayIn(timezone);
  const now = minutesOf(timeNow(timezone));
  // A line that carries on from the last one is read with what it carries on
  // from: "send him the deck" names Rahul, "also eggs" is bought the same day.
  const namesOne = smart && namedContact(text, known.contacts) !== null;
  const followed = useMemo(() => followOn(text, last, namesOne), [text, last, namesOne]);
  const line = followed.line;
  // The shape of the person's day, from their own blocks: what settles "at 11",
  // "first thing" and "after lunch" before anything is asked.
  const day = useMemo(() => yourDay(context.timed, today), [context.timed, today]);
  const parsed = useMemo(() => {
    const reader = { today, now, learned, day, past: context.timed };
    const first = parseQuick(line, reader, answers);
    // The day it carries on from, only when the line says none of its own.
    return first.task.day === null && followed.day !== null && answers.day === undefined
      ? parseQuick(line, reader, { ...answers, day: followed.day })
      : first;
  }, [line, followed.day, today, now, learned, day, context.timed, answers]);
  // Says the key that works from any app only when one is actually held - a
  // hint naming a key another app took would send somebody looking for
  // nothing.
  const shownHint =
    hint ??
    `Type it the way you would text it — “tmrw 4pm”, “mtg w rahul nxt wk”, “fri for 2h”, “gym every mon wed fri 6am”, “not urgent”, “#college”. Press A here${
      anywhere ? `, or ${sayShortcut(anywhere)} from any app` : ""
    }.`;

  /** The line as the rules on this machine read it. */
  const rules = useMemo(
    () =>
      smart && line.trim()
        ? readCapture(line, known, { today, now }, {
            ...("contact" in told ? { contact: told.contact ?? null } : {}),
            ...("from" in told ? { from: told.from ?? null } : {}),
          })
        : null,
    [smart, line, known, today, now, told],
  );
  // In AI mode, once the AI has read this very line, its reading stands in for the rules'.
  const aiOn = smart && ai !== null && ai.connected && ai.line;
  const aiName = serviceOf(ai?.service)?.label ?? "the AI";
  const aiKey = `${companyId}|${line.trim()}`;
  const aiFor = aiOn && aiRead && aiRead.key === aiKey ? aiRead.result : null;
  const aiReading = useMemo(() => {
    if (aiFor?.is !== "reading") return null;
    const read = readingFromAi(aiFor.line, line, known, { today, now });
    return aiSkipped ? { ...read, doubt: null } : read;
  }, [aiFor, line, known, today, now, aiSkipped]);
  const reading = aiReading ?? rules;

  // The task, as the task line read it - or as the reading names it, when it knows better:
  // "Sumanth asked me to reach out" is "Reach out to Sumanth", and the AI brings its own title.
  const task = useMemo(
    () =>
      reading?.task
        ? { ...parsed.task, title: reading.task.title, day: reading.task.day ?? parsed.task.day, time: reading.task.time ?? parsed.task.time }
        : parsed.task,
    [parsed, reading],
  );
  const questions = reading?.task && task.day !== null ? [] : parsed.questions;
  const { notes, corrections } = parsed;

  // A second opinion (PLAN.md, part five, phase 20): only on a reading the
  // rules were guessing at, asked once the typing pauses, and nothing waits
  // for it - without understanding, or before it answers, the rules stand.
  const [heard, setHeard] = useState<{ key: string; examples: Example[] } | null>(null);
  const softKey = smart && line.trim() && reading?.soft ? aiKey : null;
  useEffect(() => {
    if (!softKey) return;
    const said = line.trim();
    const timer = setTimeout(() => {
      window.caulder.understand.read(companyId, said).then(
        (examples) => setHeard({ key: softKey, examples }),
        () => undefined,
      );
    }, 250);
    return () => clearTimeout(timer);
    // The key stands for the line and the workspace.
  }, [softKey]);
  const opinion = useMemo(
    () => (reading && heard && heard.key === softKey ? secondOpinion(reading, heard.examples) : null),
    [reading, heard, softKey],
  );
  // A rule the company keeps has a page of its own in How we work, there already or started for it.
  const ruleTopic = reading?.kind === "memory" && isRulePage(reading.topic) ? reading.topic : null;
  /** Where a memory goes: the page the rules found, or the one the model says it belongs with - never over a rule's own page. */
  const placed = reading?.page ?? (ruleTopic ? null : opinion?.page) ?? null;

  // Not something new: a question to answer, or a change to what is there.
  const asked = useMemo(() => (smart && !plainly && line.trim() ? readQuestion(line, { today, now }) : null), [smart, plainly, line, today, now]);
  const edit = useMemo<Edit | null>(
    () => (smart && !plainly && !asked && line.trim() ? readEdit(line, { today, now, open: context.open, last }) : null),
    [smart, plainly, asked, line, today, now, context.open, last],
  );
  const askedKey = asked ? JSON.stringify(asked) : null;
  useEffect(() => {
    if (!asked || !askedKey) return;
    // A moment's pause, so a question is asked once it is typed rather than at every letter.
    const timer = setTimeout(() => {
      window.caulder.lines.answer(companyId, asked).then(
        (answer) => setAnswered({ key: askedKey, answer, error: null }),
        (cause) => setAnswered({ key: askedKey, answer: null, error: messageOf(cause) }),
      );
    }, 200);
    return () => clearTimeout(timer);
    // The key stands for the question: the object is new on every render.
  }, [askedKey, companyId]);
  const answer = answered && answered.key === askedKey ? answered : null;

  // Tab finishes the line from what was typed before and the names known -
  // what is usually done at about this hour first.
  const nowHour = Math.floor(now / 30);
  const completions = useMemo(
    () => completionsFrom(context, known, nowHour * 30),
    [context, known, nowHour],
  );
  const ghost = text.length > 0 && !busy ? complete(text, completions) : null;
  // A line moved before, from one soft kind to another, is read the way it was moved - never out of
  // a prefix, a private line, a contact or a report, which are said outright or found, not guessed.
  const soft = (kind: CaptureKind | undefined): kind is LessonKind => (LESSON_KINDS as readonly string[]).includes(kind ?? "");
  const learntKind = useMemo(() => {
    if (!reading || !soft(reading.kind) || reading.because.startsWith("it starts with")) return null;
    const kind = voteKind(text, lessons);
    return kind && kind !== reading.kind && reading.options.includes(kind) ? kind : null;
  }, [reading, text, lessons]);
  // What the person taught it comes first, then the model's opinion, then the rules.
  // Read by the AI, it is where the AI said - that is what the mark was pressed for.
  const guessedKind: CaptureKind = aiReading?.kind ?? learntKind ?? opinion?.kind ?? reading?.kind ?? "task";
  const goesTo: CaptureKind = chosen ?? guessedKind;
  const asTask = goesTo === "task";

  const question = text.trim().length > 0 && asTask && !edit && !asked ? questions[0] : undefined;
  // Asked to be reminded: said back, so it is known before Enter that a notification will come.
  const reminds = asTask && REMIND_ME.test(text);
  const remindNote = reminds && task.day
    ? `A Windows notification ${task.time ? `at ${formatTime(task.time)}` : "that morning"}${task.day === today ? "" : `, ${inSentence(whenLabel(task.day, today))}`}.`
    : null;
  // What was done before, said: the hour this usually has, a clash with an
  // hour already taken, the same thing already there (shared/habitual.ts).
  const timed = asTask && task.day !== null && !task.repeat;
  const usual = timed && !noUsual && (!task.time || task.minutes === null) ? usualOf(task.title, task.kind, context.timed) : null;
  const time = task.time ?? (timed ? (usual?.time ?? null) : null);
  const span = task.minutes ?? (time ? (usual?.minutes ?? null) : null);
  const usualNote =
    usual && ((!task.time && usual.time) || (task.minutes === null && time && usual.minutes))
      ? `${!task.time && usual.time ? `At ${formatTime(usual.time)}` : "For"}${
          task.minutes === null && usual.minutes ? `${!task.time && usual.time ? " for" : ""} ${formatDuration(usual.minutes)}` : ""
        }, your usual for ${usual.about} (${usual.of} of the last ${usual.out}).`
      : null;
  const clash = timed && time && task.day ? clashWith({ title: task.title, day: task.day, time, minutes: span }, context.busy) : null;
  const twin = asTask && task.day ? alreadyOpen(task.title, task.day, context.open) : null;
  const ready4 = asTask && task.day && !task.followUp ? readyFor(task.title, task.day, today) : null;
  const followUp = task.followUp ?? (getReady && ready4 ? { title: ready4.title, day: ready4.day, kind: "todo" as const, notes: null } : null);

  // One line, several things: two tasks, or one errand with its list (shared/together.ts).
  const group = useMemo(() => (asTask && !plainly ? together(line) : null), [asTask, plainly, line]);
  const parts = useMemo(() => {
    if (!group?.split) return null;
    const reader = { today, now, learned, day, past: context.timed };
    return group.split.map((part) => {
      const read = parseQuick(part, reader, {});
      return { said: part, task: read.task, day: read.task.day ?? task.day };
    });
  }, [group, today, now, learned, day, context.timed, task.day]);
  const listNote = group?.list ? group.list.items.map((item) => `- ${item}`).join("\n") : null;

  /** Said when a lesson is why the line went where it did, so a lesson is never a mystery. */
  const learntSample = learntKind && !chosen ? learntFrom(text, lessons, learntKind) : null;
  // "Jonas is on leave till the 20th", said when a task for him lands before then (part twelve, phase 49).
  const awayNote = (() => {
    const who = reading?.contact;
    if (!asTask || !who || !task.day) return null;
    const away = awayList.find((each) => each.leadId === who.id && task.day! <= each.until);
    return away ? `${away.text}.` : null;
  })();
  const shownNotes = [
    ...(awayNote ? [awayNote] : []),
    ...(followed.note ? [followed.note] : []),
    ...notes,
    ...(learntSample && asTask ? [`The way you moved “${learntSample}”.`] : []),
    ...(remindNote ? [remindNote] : []),
    ...(usualNote ? [usualNote] : []),
    ...(clash ? [`${clash.title} is at ${formatTime(clash.startsAt)} then.`] : []),
    ...(twin ? [`“${twin.title}” is already there, for ${inSentence(whenLabel(twin.dueOn, today))}.`] : []),
    ...(group?.list ? [`${group.list.items.length} things, kept as a list in its note.`] : []),
  ];

  /**
   * What a line moved by hand teaches, once it has been kept: where it was
   * moved to go. Never awaited and never an error - a line that was kept was
   * kept.
   */
  function learn(said: string) {
    if (chosen !== null && chosen !== guessedKind && soft(chosen) && soft(guessedKind)) {
      void window.caulder.lessons.add({ text: said, kind: chosen }).then(setLessons, () => undefined);
    }
  }
  /** What a line about somebody leaves to do: their task, on the day it said or the day that was chosen. */
  const owed = (() => {
    const from = goesTo === "contact" ? reading?.then : goesTo === "command" && reading?.ask?.do === "contact" ? reading.ask.then : null;
    if (!from) return null;
    return told.thenDay ? { ...from, day: told.thenDay, time: null, daySaid: true } : from;
  })();
  /**
   * What the line is not sure of, asked one at a time before anything is kept:
   * who it means, then - for something somebody asked for with no day said -
   * when. The first answer is the likeliest, so Enter twice takes it.
   */
  const doubt: {
    text: string;
    blocks: boolean;
    options: { label: string; pick: () => void }[];
    /** Answered in words: what to do with what was typed, and what the box says while it is empty. */
    say?: { hint: string; take: (answer: string) => void };
  } | null = (() => {
    if (!smart || !reading || edit || asked || text.trim().length === 0) return null;
    if (reading.doubt?.open) {
      const asking = reading.doubt.text;
      return {
        text: asking,
        blocks: true,
        // Passed over, the reading stands as it is; nothing more is sent.
        options: reading.doubt.options.map((option) => ({ label: option.label, pick: () => setAiSkipped(true) })),
        say: { hint: "Type the answer", take: (answer) => void readWithAi([...aiAnswers, { question: asking, answer }]) },
      };
    }
    if (reading.doubt?.from && goesTo === "task") {
      return {
        text: reading.doubt.text,
        // A contact or only a task: where it is kept turns on the answer.
        blocks: true,
        options: reading.doubt.options.map((option) => ({ label: option.label, pick: () => setTold((current) => ({ ...current, from: null })) })),
        say: { hint: "Their company, school or place", take: (answer) => setTold((current) => ({ ...current, from: answer })) },
      };
    }
    if (reading.doubt && !reading.doubt.from && (goesTo === "contact" || goesTo === "task" || goesTo === "command")) {
      return {
        text: reading.doubt.text,
        // Who it is about decides where it is kept, so nothing is kept until it is said.
        blocks: true,
        options: reading.doubt.options.map((option) => ({
          label: option.label,
          pick: () => {
            setTold((current) => ({ ...current, contact: option.contact }));
            const word = reading.doubt?.word;
            setTaught(word && option.contact ? { said: word, leadId: option.contact } : null);
          },
        })),
      };
    }
    if (owed && !owed.daySaid) {
      const day = (ahead: number) => {
        const on = new Date(`${today}T00:00:00Z`);
        on.setUTCDate(on.getUTCDate() + ahead);
        return on.toISOString().slice(0, 10);
      };
      const offer: [string, number][] = [["Tomorrow", 1], ["Today", 0], ["In 3 days", 3], ["Next week", 7]];
      // The usual day first: tomorrow for what was asked, three days for what is waited for.
      const usual = daysBetween(today, owed.day);
      offer.sort((a, b) => Number(b[1] === usual) - Number(a[1] === usual));
      return {
        text: `“${owed.title}” - when?`,
        // The day shown is a usual one and can be kept as it is: asked, and Enter does not wait for an answer.
        blocks: false,
        options: offer.map(([label, ahead]) => ({ label, pick: () => setTold((current) => ({ ...current, thenDay: day(ahead) })) })),
      };
    }
    return null;
  })();
  // A line the AI is to answer rather than keep; and one that is done here whatever the mode -
  // going somewhere, opening somebody - because nothing about it needs reading.
  const forAi = aiOn && !edit && !asked && isForAi(line);
  const doneHere = !forAi && (rules?.ask?.do === "go" || rules?.ask?.do === "open");
  /** In AI mode, Enter sends a line the AI has not read yet. Never one that looks like a secret. */
  const toAsk = aiOn && !edit && !asked && !doneHere && aiFor === null && aiDown !== aiKey && text.trim().length > 0 && !rules?.warn;
  const aiAnswer = aiFor?.is === "answer" ? aiFor.answer : null;
  const ready = aiAnswer || (forAi && aiDown !== aiKey)
    ? false
    : doubt?.blocks
    ? false
    : edit
    ? true
    : asked
      ? false
      : asTask
    ? text.trim().length > 0 && questions.length === 0 && task.day !== null
    : (reading?.text ?? "").length > 0 && (goesTo !== "command" || reading?.ask != null);
  const repeat = task.repeat && task.repeat.until !== null && task.day !== null
    ? { weekdays: task.repeat.weekdays, until: task.repeat.until, ...(task.repeat.every ? { every: task.repeat.every } : {}) }
    : null;
  const occurrences = repeat && task.day
    ? occurrencesOf({ weekdays: repeat.weekdays, from: task.day, until: repeat.until, every: repeat.every }).length
    : 0;

  /**
   * The line, read by the AI. What comes back is shown as the reading; when
   * it is what the rules had read - the same place, contact and days - it is
   * kept at once, since it is what was on the screen. Nothing is written by
   * the AI either way: keeping is the same Enter, through the same channels.
   */
  async function readWithAi(answers: { question: string; answer: string }[] = aiAnswers) {
    if (aiBusy || busy) return;
    const key = aiKey;
    setAiBusy(true);
    setError(null);
    try {
      const result = await window.caulder.ask.line(companyId, { line: line.trim(), answers });
      setAiAnswers(answers);
      setAiSkipped(false);
      setReply("");
      setAiRead({ key, result });
      if (result.is === "reading" && answers.length === 0 && chosen === null && rules) {
        const theirs = readingFromAi(result.line, line, known, { today, now });
        const kind = learntKind ?? opinion?.kind ?? rules.kind;
        if (sameReading({ kind, reading: rules, day: parsed.task.day, time: parsed.task.time }, theirs)) setKeepNext(true);
      }
    } catch (cause) {
      // A free tier runs out, and a service is sometimes busy: the line is not held hostage to it.
      setAiDown(key);
      setError(`${messageOf(cause)} Enter keeps the line as this computer read it.`);
    } finally {
      setAiBusy(false);
      // Back to the line once it can be typed in again.
      setTimeout(() => input.current?.focus(), 0);
    }
  }

  /** The mark at the start of the line: AI mode on or off, kept as it was left. */
  async function toggleAi() {
    setModeNote(null);
    if (!ai?.connected) {
      setModeNote("AI mode reads each line with an AI you connect. None is connected yet - Gemini is free.");
      return;
    }
    try {
      setAi(await window.caulder.ask.setLineMode(!ai.line));
      setAiRead(null);
    } catch (cause) {
      setModeNote(messageOf(cause));
    }
    input.current?.focus();
  }

  /** Enter, and the button: ask the AI when the mode is on and it has not read this line; else keep what is shown. */
  function enter() {
    if ((forAi && aiDown !== aiKey) || toAsk) void readWithAi();
    else if (ready) void add();
    else (answerInput.current ?? firstOption.current)?.focus();
  }

  /** Everything that is not a task: kept where the line said, or where it was moved to. */
  async function keep() {
    if (!ready || busy || !reading) return;
    const said = reading.text;
    setBusy(true);
    setError(null);
    try {
      let summary = "";
      let later: typeof instead = null;
      if (goesTo === "contact" && reading.contact && reading.logged === "fact") {
        // Something that stays true: on them, under Known about them - and a birthday comes back every year.
        const made = await window.caulder.facts.add(companyId, {
          leadId: reading.contact.id,
          text: reading.fact ?? said,
          until: reading.until ?? null,
          birthday: reading.birthday ?? null,
        });
        summary = `Kept on ${reading.contact.name}${made.task ? `, and “${made.task.title}” every year` : ""}`;
      } else if (goesTo === "contact" && reading.contact && reading.logged !== "fact") {
        await window.caulder.activities.log({ leadId: reading.contact.id, kind: reading.logged, body: said });
        summary = `On ${reading.contact.name}'s history${reading.logged === "note" ? "" : `, ${LOGGED_SAID[reading.logged]}`}`;
        // What it leaves to be done is their task, on its day, with a word that morning:
        // a thing somebody asked for is the thing most easily forgotten.
        const then = owed;
        if (then) {
          await window.caulder.tasks.quick(companyId, {
            title: then.title,
            day: then.day,
            time: then.time,
            minutes: null,
            kind: "follow_up",
            priority: null,
            repeat: null,
            leadId: reading.contact.id,
            notes: said,
            followUp: null,
            remind: true,
          });
          summary += `, and “${then.title}” ${inSentence(whenLabel(then.day, today))}, with a reminder that morning`;
        }
      } else if (goesTo === "command" && reading.ask) {
        const ask = reading.ask;
        if (ask.do === "go") onGo?.(ask.place);
        else if (ask.do === "open") onOpenContact?.(ask.contact.id, ask.how);
        else if (ask.do === "update") {
          // Through the schema with everything else the contact already has, so only what was said changes.
          const lead = await window.caulder.leads.find(ask.contact.id);
          if (!lead) throw new Error(`${ask.contact.name} is not a contact any more.`);
          const parsed = leadInput.safeParse({ ...lead, ...(ask.phone ? { phone: ask.phone } : {}), ...(ask.email ? { email: ask.email } : {}) });
          if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "That will not go on the contact.");
          await window.caulder.leads.update(lead.id, parsed.data);
          summary = sayAsk(ask);
        }
        else if (ask.do === "cost") summary = await keepCost(companyId, ask, today);
        else if (ask.do === "account") summary = await keepAccount(companyId, ask, today);
        else if (ask.do === "paid") {
          const result = await window.caulder.money.paidFrom(companyId, { leadId: ask.contact.id, amount: ask.amount });
          summary = `${result.say}, from ${ask.contact.name}`;
        }
        else if (ask.do === "spend") {
          const on = new Date(`${today}T00:00:00Z`);
          on.setUTCDate(on.getUTCDate() - ask.daysAgo);
          await window.caulder.money.addSpend(companyId, { spentOn: on.toISOString().slice(0, 10), amount: ask.amount, what: ask.what });
          summary = `${sayAsk(ask)}, in Money`;
        } else {
          // Through the schema, which fills in everything the line did not say
          // and refuses what main would - with the schema's own sentence.
          const parsed = leadInput.safeParse({
            name: ask.name,
            contactPerson: ask.person,
            phone: ask.phone,
            email: ask.email,
            source: ask.source ?? null,
            contactRole: ask.role ?? null,
          });
          if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "That contact will not do.");
          const lead = await window.caulder.leads.create(companyId, parsed.data);
          // Somebody told about, not only asked for: what happened goes on their
          // history, and what to do about them becomes their task. After the
          // contact, so neither is ever left pointing at nobody.
          const alsoDid: string[] = [];
          if (ask.happened) {
            // As what it was: a message on LinkedIn is one, and is what "who has not answered" reads.
            await window.caulder.activities.log({ leadId: lead.id, kind: reading.logged === "fact" ? "note" : reading.logged, body: ask.happened });
            alsoDid.push("what happened on their history");
          }
          const then = owed ?? ask.then;
          if (then) {
            await window.caulder.tasks.quick(companyId, {
              title: then.title,
              day: then.day,
              time: then.time,
              minutes: null,
              kind: "follow_up",
              priority: null,
              repeat: null,
              leadId: lead.id,
              notes: null,
              followUp: null,
              remind: true,
            });
            alsoDid.push(`“${then.title}” ${inSentence(whenLabel(then.day, today))}, with a reminder that morning`);
            setLast({
              taskId: null,
              title: then.title,
              day: then.day,
              time: then.time,
              contact: { id: lead.id, name: ask.person ?? ask.name },
            });
          }
          // To the phone too, through Google Contacts, when that is connected.
          // Its failing is not the contact failing: it is here, and can be sent again from its page.
          const sent = await window.caulder.google.saveContact(lead.id).then(() => true, () => false);
          summary = `${sayAsk(ask)}${alsoDid.length > 0 ? `, with ${alsoDid.join(" and ")}` : ""}${sent ? ", and saved to Google Contacts" : ""}`;
        }
        summary ||= sayAsk(ask);
      } else if (goesTo === "memory") {
        // One dated line, on the page it is about - the one the rules found,
        // the one the model says it belongs with, or the one page for the rest.
        const kept = await window.caulder.brain.remember({
          companyId,
          pageId: placed?.id ?? null,
          topic: placed ? null : reading.topic,
          said,
          fact: reading.fact,
          day: today,
        });
        summary = `Remembered, on ${kept.title} in the brain`;
        later = kept.like ? { pageId: kept.pageId, raw: kept.like.raw, says: kept.like.says } : null;
      } else if (goesTo === "idea") {
        const page = await window.caulder.brain.create(companyId, "ideas", "idea");
        await window.caulder.brain.save(page.id, {
          title: said.length > 120 ? `${said.slice(0, 117).trimEnd()}…` : said,
          body: said,
          fields: page.fields,
          secrets: {},
          baseRevision: page.revision,
        });
        summary = "An idea, in the brain";
      } else {
        await window.caulder.notes.create(companyId, said);
        summary = "A note, on Today";
      }
      learn(said);
      // Something that happened with a contact is who "him" is in the next line.
      // A new contact with a task for them has set the last line itself.
      if (!(goesTo === "command" && reading.ask?.do === "contact" && reading.ask.then)) {
        setLast(goesTo === "contact" && reading.contact ? { taskId: null, title: said, day: today, time: null, contact: called(reading.contact) } : null);
      }
      done(summary);
      setInstead(later);
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }

  /** The older rule let go, since the new one was meant instead of it. Its page's history keeps what it said. */
  async function replaceRule() {
    if (!instead) return;
    setBusy(true);
    try {
      await window.caulder.brain.forgetMemory({ pageId: instead.pageId, raw: instead.raw });
      setInstead(null);
      setAdded(`Replaced “${instead.says}”`);
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }

  /** A contact the way a person would say them: Rahul, rather than Orchids School. */
  function called(contact: { id: string; name: string }): { id: string; name: string } {
    const person = known.contacts.find((each) => each.id === contact.id)?.person;
    return { id: contact.id, name: person ?? contact.name };
  }

  /** The line kept: said, emptied, and everything about it forgotten but what it made. */
  function done(summary: string) {
    // The answer to "which one?" is kept now the line it was for is: never asked again.
    if (taught) void window.caulder.tune.keepName(companyId, taught).catch(() => undefined);
    setTaught(null);
    setAdded(summary);
    setInstead(null);
    setText("");
    setAnswers({});
    setTold({});
    setReply("");
    setAiAnswers([]);
    setAiSkipped(false);
    setAiRead(null);
    setChosen(null);
    setPlainly(false);
    setNoUsual(false);
    setGetReady(false);
    setKept((count) => count + 1);
    onAdded?.(summary);
    input.current?.focus();
  }

  /** A change to something already there: moved, cancelled - with Undo - or renamed. */
  async function change(what: Edit) {
    setBusy(true);
    setError(null);
    try {
      const when = (day: string) => whenLabel(day, today);
      if (what.do === "move") {
        const moved = await window.caulder.lines.move(what.task.id, { day: what.day, time: what.time, minutes: what.minutes });
        setLast((before) => ({
          taskId: what.task.id,
          title: what.task.title,
          day: what.day,
          time: moved.time,
          contact: before?.taskId === what.task.id ? before.contact : null,
        }));
        setUndo(null);
        done(`Moved “${what.task.title}” to ${inSentence(when(what.day))}${moved.time ? ` at ${formatTime(moved.time)}` : ""}`);
      } else if (what.do === "cancel") {
        const snapshot = await window.caulder.lines.cancel(what.task.id);
        setLast(null);
        setUndo({ title: what.task.title, snapshot });
        done(`Cancelled “${what.task.title}”`);
      } else if (what.do === "done") {
        await window.caulder.tasks.complete(what.task.id);
        setLast(null);
        setUndo({ title: what.task.title, reopen: what.task.id });
        done(`Ticked off “${what.task.title}”`);
      } else {
        await window.caulder.lines.rename(what.task.id, what.title);
        setLast((before) => (before?.taskId === what.task.id ? { ...before, title: what.title } : before));
        setUndo(null);
        done(`Renamed to “${what.title}”`);
      }
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }

  /** Undo a cancel - the task and its hour back as they were - or a tick. */
  async function putBack() {
    if (!undo) return;
    setBusy(true);
    try {
      if ("reopen" in undo) {
        await window.caulder.tasks.reopen(undo.reopen);
        setUndo(null);
        done(`Back: “${undo.title}”`);
        return;
      }
      const task = await window.caulder.lines.restore(companyId, undo.snapshot);
      setUndo(null);
      setLast({ taskId: task.id, title: task.title, day: task.dueOn, time: undo.snapshot.block?.startsAt ?? null, contact: null });
      done(`Back: “${task.title}”`);
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }

  /** Several tasks from one line, each read on its own, the day said once shared by all. */
  async function addMany() {
    if (!parts || busy) return;
    setBusy(true);
    setError(null);
    const added: string[] = [];
    try {
      for (const part of parts) {
        const day = part.day ?? task.day;
        if (!day) continue;
        const contact = namedContact(part.said, known.contacts);
        const result = await window.caulder.tasks.quick(companyId, {
          title: part.task.title,
          day,
          time: part.task.time,
          minutes: part.task.minutes,
          kind: part.task.kind,
          priority: part.task.priority,
          repeat: null,
          leadId: contact?.id ?? null,
          notes: part.task.notes,
          followUp: null,
          remind: REMIND_ME.test(part.said),
        });
        added.push(part.task.title);
        setLast({ taskId: result.task?.id ?? null, title: part.task.title, day, time: part.task.time, contact: contact ? called(contact) : null });
      }
      learn(text.trim());
      done(`${added.length} tasks: ${added.join(", ")}`);
    } catch (cause) {
      // What was added before the failure is said, so nothing is added twice.
      setKept((count) => count + 1);
      setError(`${added.length > 0 ? `Added ${added.join(", ")}. Then: ` : ""}${messageOf(cause)}`);
    } finally {
      setBusy(false);
    }
  }

  async function add() {
    if (edit) {
      await change(edit);
      return;
    }
    if (asked) return;
    if (!asTask) {
      await keep();
      return;
    }
    if (parts) {
      await addMany();
      return;
    }
    if (!ready || busy || task.day === null) return;
    setBusy(true);
    setError(null);
    try {
      const result = await window.caulder.tasks.quick(companyId, {
        title: task.title,
        day: task.day,
        time,
        minutes: span,
        kind: task.kind,
        priority: task.priority,
        repeat,
        every: task.every,
        leadId: reading?.contact?.id ?? null,
        notes: [task.notes, listNote].filter(Boolean).join("\n\n") || null,
        followUp,
        remind: reminds,
      });
      setLast({
        taskId: result.task?.id ?? null,
        title: task.title,
        day: task.day,
        time,
        contact: reading?.contact ? called(reading.contact) : null,
      });
      setUndo(null);
      // What it guessed at, for Tune to ask about another day. Never awaited and
      // never an error: a task that was added was added.
      void window.caulder.tune.seen({ slips: corrections }).catch(() => undefined);
      const summary = repeat
        ? `${task.title} — ${describeWeekdays(repeat.weekdays)}${task.time ? ` at ${formatTime(task.time)}` : ""}, ${result.repeats} on your day`
        : `${task.title} — ${whenLabel(task.day, today)}${time ? ` at ${formatTime(time)}` : ""}${
            result.followUp ? `, and “${result.followUp.title}” ${inSentence(whenLabel(result.followUp.dueOn, today))}` : ""
          }`;
      learn(text.trim());
      done(summary);
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }

  /**
   * The line changed. An answer belongs to the line it answered: once the line
   * changes the question may no longer exist, and a stale answer would override
   * what was just typed. The same for where it goes, and what was turned down.
   */
  function retype(next: string) {
    setText(next);
    setAnswers({});
    setTold({});
    setTaught(null);
    setReply("");
    setAiAnswers([]);
    setAiSkipped(false);
    setAiDown(null);
    setKeepNext(false);
    setModeNote(null);
    setChosen(null);
    setPlainly(false);
    setNoUsual(false);
    setGetReady(false);
    setError(null);
  }

  // What the AI read was what was already showing: kept on this draw, the one that has its reading in it.
  useEffect(() => {
    if (!keepNext) return;
    setKeepNext(false);
    if (aiReading && ready && !busy) void add();
    // Only ever on the draw after the AI answered.
  }, [keepNext]);

  // The confirmation stays long enough to read and then gets out of the way.
  useEffect(() => {
    if (!added) return;
    const timer = setTimeout(() => setAdded(null), 4000);
    return () => clearTimeout(timer);
  }, [added]);

  return (
    <div className="quickadd">
      <div className="quickadd__row">
        {smart ? (
          <button
            type="button"
            className={`quickadd__mode${aiOn ? " quickadd__mode--on" : ""}`}
            aria-pressed={aiOn}
            aria-label="AI mode"
            title={aiOn ? `AI mode is on: lines are read by ${aiName}. Press to read them on this computer.` : "AI mode: have each line read by the AI you connected."}
            onClick={() => void toggleAi()}
          >
            <Sparkles size={17} aria-hidden />
          </button>
        ) : (
          <Sparkles size={17} className="quickadd__icon" aria-hidden />
        )}
        <span className="quickadd__field">
        <input
          ref={input}
          className="quickadd__input"
          value={text}
          placeholder={smart ? "Say anything - a task, who you spoke to, what it cost, something to remember" : placeholder}
          aria-label={smart ? "Anything, in one line" : "Add a task in one line"}
          aria-describedby={readId}
          autoComplete="off"
          spellCheck={false}
          disabled={busy || aiBusy}
          onChange={(event) => retype(event.target.value)}
          onPaste={(event) => {
            // A message or an email pasted in: what was asked, and whose it was (shared/pasteline.ts).
            const pasted = event.clipboardData.getData("text");
            const meant = cleanPaste(pasted);
            if (meant === pasted) return;
            event.preventDefault();
            const field = event.currentTarget;
            const from = field.selectionStart ?? text.length;
            const to = field.selectionEnd ?? text.length;
            retype(`${text.slice(0, from)}${meant}${text.slice(to)}`);
          }}
          onKeyDown={(event) => {
            // Tab, or the right arrow at the end, takes what is offered; with nothing offered Tab moves on as ever.
            const atEnd = event.currentTarget.selectionStart === text.length && event.currentTarget.selectionEnd === text.length;
            if (ghost && atEnd && ((event.key === "Tab" && !event.shiftKey) || event.key === "ArrowRight")) {
              event.preventDefault();
              retype(text + ghost);
              return;
            }
            if (event.key === "Escape") {
              if (text.length > 0) {
                event.preventDefault();
                event.stopPropagation();
                retype("");
                setChosen(null);
              }
              return;
            }
            if (event.key !== "Enter") return;
            event.preventDefault();
            // Enter with a question open goes to its answers rather than
            // adding a task the app had to guess at.
            enter();
          }}
        />
        {/* What Tab would add, after what was typed, in the input's own type so it lines up. */}
        {ghost && (
          <span className="quickadd__ghost" aria-hidden>
            <span className="quickadd__typed">{text}</span>
            {ghost}
            <kbd className="kbd quickadd__tab">Tab</kbd>
          </span>
        )}
        </span>
        <button
          type="button"
          className="btn btn--sm btn--primary quickadd__go"
          disabled={busy || aiBusy || !(ready || forAi || toAsk)}
          onClick={enter}
        >
          <CornerDownLeft size={14} aria-hidden />
          {(forAi && aiDown !== aiKey) || toAsk ? (forAi ? "Ask" : "Read") : asTask ? "Add" : "Keep"}
        </button>
      </div>

      <div id={readId} className="quickadd__read" aria-live="polite">
        {text.trim().length === 0 ? (
          added || undo || instead ? (
            <span className="quickadd__added">
              {added
                ? /^(?:Moved|Cancelled|Renamed|Back|Replaced|Ticked)\b/.test(added)
                  ? added
                  : `Added: ${added}`
                : undo
                  ? `${"reopen" in undo ? "Ticked off" : "Cancelled"} “${undo.title}”.`
                  : null}
              {instead && (
                <>
                  {" "}
                  Is it instead of “{instead.says}”?
                  <button type="button" className="quickadd__keep" onClick={() => void replaceRule()} disabled={busy}>
                    Yes, let that one go
                  </button>
                  <button type="button" className="quickadd__keep" onClick={() => setInstead(null)}>
                    No, keep both
                  </button>
                </>
              )}
              {undo && (
                <button type="button" className="quickadd__keep" onClick={() => void putBack()} disabled={busy}>
                  Undo
                </button>
              )}
            </span>
          ) : modeNote ? (
            <span className="quickadd__hint" role="status">
              {modeNote}
              {onGo && (
                <button type="button" className="quickadd__keep" onClick={() => onGo("settings")}>
                  Connect one in Settings
                </button>
              )}
            </span>
          ) : aiOn ? (
            <span className="quickadd__hint" data-ai-mode>
              AI mode: lines go to {aiName}. Nothing is kept until you see it.
            </span>
          ) : (
            <span className="quickadd__hint">
              {smart ? (
                <>
                  <kbd className="kbd">{anywhere ? sayShortcut(anywhere) : "A"}</kbd> “call Priya tomorrow 4pm” · “Priya wants the invoice by the 5th” · “figma 1,200” · “our GST number is …”
                </>
              ) : (
                shownHint
              )}
            </span>
          )
        ) : aiAnswer ? (
          <span className="quickadd__reading">
            <strong className="quickadd__title">Answered by {aiAnswer.service}</strong>
            <span className="quickadd__note">
              sent: {sayParts(aiAnswer.sent.parts)} · {numberText(aiAnswer.usage.input || tokensIn(aiAnswer.sent.characters))} tokens
            </span>
          </span>
        ) : edit ? (
          <EditReading edit={edit} when={(day) => whenLabel(day, today)} />
        ) : asked ? (
          <AnswerReading answer={answer?.answer ?? null} error={answer?.error ?? null} />
        ) : asTask && parts ? (
          <ManyReading
            parts={parts.map((part) => ({
              title: part.task.title,
              when: part.day ? `${whenLabel(part.day, today)}${part.task.time ? ` at ${formatTime(part.task.time)}` : ""}` : null,
            }))}
          />
        ) : !asTask && reading ? (
          <span className="quickadd__reading">
            <strong className="quickadd__title">
              {goesTo === "command" && reading.ask ? sayAsk(reading.ask) : reading.text || "…"}
            </strong>
            {/* Said only when the model changed something, and nobody has chosen since. */}
            {opinion?.because && !chosen && !learntKind && (
              <span className="quickadd__note" data-opinion>
                {opinion.because} ·
              </span>
            )}
            {learntSample && (
              <span className="quickadd__note" data-learnt>
                the way you moved “{learntSample}” ·
              </span>
            )}
            <span className="quickadd__note">
              {goesTo === "contact" && reading.contact && reading.logged === "fact"
                ? [
                    `on ${reading.contact.name}, under Known about them`,
                    reading.until ? `until ${inSentence(whenLabel(reading.until, today))}` : null,
                    reading.birthday ? "and a reminder every year" : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")
                : goesTo === "contact" && reading.contact && reading.logged !== "fact"
                ? [
                    `on ${reading.contact.name}'s history${reading.logged === "note" ? "" : `, ${LOGGED_SAID[reading.logged]}`}`,
                    owed
                      ? `and “${owed.title}” ${inSentence(whenLabel(owed.day, today))}${
                          owed.time ? ` at ${formatTime(owed.time)}` : ""
                        }, with a reminder that morning`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")
                : goesTo === "command" && reading.ask
                  ? reading.ask.do === "contact"
                    ? [
                        reading.ask.role,
                        reading.ask.source ? `from ${reading.ask.source}` : null,
                        reading.ask.phone,
                        reading.ask.email,
                        reading.ask.happened
                          ? `“${reading.ask.happened}” on their history${reading.logged === "note" || reading.logged === "fact" ? "" : `, ${LOGGED_SAID[reading.logged]}`}`
                          : null,
                        owed
                          ? `and “${owed.title}” ${inSentence(whenLabel(owed.day, today))}${
                              owed.time ? ` at ${formatTime(owed.time)}` : ""
                            }, with a reminder that morning`
                          : null,
                        owed || reading.ask.happened ? null : "a new contact, and in Google Contacts when that is connected",
                      ]
                        .filter(Boolean)
                        .join(" · ")
                    : reading.ask.do === "spend"
                      ? `in Money, ${reading.ask.daysAgo === 1 ? "for yesterday" : "for today"}`
                      : "press Enter"
                  : goesTo === "memory"
                    ? placed
                      ? `a dated line on ${placed.title}, in the brain`
                      : ruleTopic
                        ? `a rule, on ${ruleTopic} in How we work`
                        : `a dated line on ${reading.topic ?? "a page"}, in the brain`
                    : goesTo === "idea"
                      ? "an idea, in the brain's Ideas"
                      : "a note on Today, to file later"}
            </span>
            {/* Said before it is kept, never after: what this line should not be. */}
            {reading.warn && (
              <span className="quickadd__warn" role="alert">
                {reading.warn}
              </span>
            )}
          </span>
        ) : (
          <Reading
            title={task.title}
            day={task.day ? whenLabel(task.day, today) : null}
            time={time}
            minutes={span}
            kind={task.kind}
            priority={task.priority}
            repeat={task.repeat ? describeWeekdays(task.repeat.weekdays, task.repeat.every) : task.every ? TASK_REPEAT_LABEL[task.every] : null}
            until={task.repeat?.until ? whenLabel(task.repeat.until, today) : null}
            occurrences={occurrences}
          />
        )}
      </div>

      {/* AI mode, said where the reading is: what Enter will do, who read it, and what that cost. */}
      {aiOn && text.trim().length > 0 && !edit && !asked && !aiAnswer && (aiBusy || toAsk || (forAi && aiDown !== aiKey) || aiFor?.is === "reading") && (
        <p className="quickadd__ai" role="status">
          {aiBusy
            ? `${aiName} is reading…`
            : aiFor?.is === "reading"
              ? `Read by ${aiFor.service} · ${numberText(aiFor.usage.input + aiFor.usage.output || tokensIn(aiFor.sent.characters))} tokens · ${
                  aiFor.sent.contacts === 1 ? "1 name" : `${aiFor.sent.contacts} names`
                } sent with it. Enter keeps it.`
              : forAi
                ? `Enter asks ${aiName}, with what the question needs.`
                : `Above is how this computer reads it. Enter has ${aiName} read it.`}
        </p>
      )}
      {aiAnswer && (
        <div className="quickadd__answer">
          <Markdown
            source={linkAnswer(aiAnswer.text, aiAnswer.references)}
            links={Object.fromEntries(
              aiAnswer.references.map((reference): [string, LinkedName] => [`${reference.kind}:${reference.id}`, { name: reference.name, kind: reference.kind }]),
            )}
            onOpenLink={(ref) => (ref.kind === "contact" && onOpenContact ? onOpenContact(ref.id, null) : openRef(ref))}
          />
          <p className="quickadd__answerActions">
            <button type="button" className="btn btn--sm" onClick={() => void navigator.clipboard.writeText(aiAnswer.text)}>
              Copy
            </button>
            <button
              type="button"
              className="btn btn--sm btn--ghost"
              onClick={() => {
                retype("");
                input.current?.focus();
              }}
            >
              Done
            </button>
          </p>
        </div>
      )}

      {/* The rest of what was said: kept as the task's note, and - when it asked
          for one - the second task, shown before either is written. */}
      {text.trim().length > 0 && asTask && !edit && !asked && (task.notes || followUp) && (
        <div className="quickadd__more">
          {followUp && (
            <p className="quickadd__then">
              <span className="quickadd__thenLabel">And then</span>
              <strong>{followUp.title}</strong>
              <span className="quickadd__part">{whenLabel(followUp.day, today)}</span>
            </p>
          )}
          {task.notes && (
            <p className="quickadd__noted">
              <span className="quickadd__thenLabel">Note</span>
              {task.notes}
            </p>
          )}
        </div>
      )}

      {/* Not something new: say what else it could be, one click away. */}
      {text.trim().length > 0 && (edit || asked || parts || group?.list) && (
        <div className="quickadd__goes" role="group" aria-label="How to read it">
          <span className="quickadd__goesLabel">{edit ? "Change" : asked ? "Question" : parts ? "Several" : "A list"}</span>
          <span className="quickadd__goesChips">
            <button type="button" className="chip chip--on" aria-pressed onClick={() => input.current?.focus()}>
              {edit ? "Do it" : asked ? "Answer" : parts ? `${parts.length} tasks` : "One errand"}
            </button>
            <button
              type="button"
              className="chip"
              aria-pressed={false}
              onClick={() => {
                setPlainly(true);
                input.current?.focus();
              }}
            >
              {asked ? "Keep it instead" : edit ? "Add it as new" : parts ? "One task" : "No list"}
            </button>
          </span>
        </div>
      )}

      {text.trim().length > 0 && asTask && !edit && !asked && (shownNotes.length > 0 || (ready4 && !task.followUp)) && (
        <p className="quickadd__aside">
          {shownNotes.join(" ")}
          {usualNote && (
            <button
              type="button"
              className="quickadd__keep"
              onClick={() => {
                setNoUsual(true);
                input.current?.focus();
              }}
            >
              Not this time
            </button>
          )}
          {ready4 && !task.followUp && (
            <button
              type="button"
              className={`quickadd__keep${getReady ? " quickadd__keep--on" : ""}`}
              aria-pressed={getReady}
              onClick={() => {
                setGetReady((on) => !on);
                input.current?.focus();
              }}
            >
              And “{ready4.title}” {inSentence(whenLabel(ready4.day, today))}
            </button>
          )}
          {corrections.map((slip) => (
            <button
              key={slip.typed}
              type="button"
              className="quickadd__keep"
              onClick={() => {
                // For this line now, and for every line after: nobody wants to
                // refuse the same correction twice.
                setAnswers((current) => ({ ...current, keep: [...(current.keep ?? []), slip.typed] }));
                window.caulder.tune.keep(slip).then(setLearned, () => undefined);
                input.current?.focus();
              }}
            >
              Keep &ldquo;{slip.typed}&rdquo;
            </button>
          ))}
        </p>
      )}

      {/* Where it goes: the line's guess pressed, every other sensible place a click away. */}
      {reading && !edit && !asked && !aiAnswer && (
        <div className="quickadd__goes" role="group" aria-label="Where it goes">
          <span className="quickadd__goesLabel">Goes to</span>
          <span className="quickadd__goesChips">
            {reading.options.map((option) => (
              <button
                key={option}
                type="button"
                className={`chip${goesTo === option ? " chip--on" : ""}`}
                aria-pressed={goesTo === option}
                onClick={() => {
                  setChosen(option);
                  input.current?.focus();
                }}
              >
                {option === "contact" && reading.contact
                  ? reading.contact.name
                  : option === "memory" && (placed || ruleTopic)
                    ? (placed?.title ?? ruleTopic)
                    : option === "command" && reading.ask
                      ? sayAsk(reading.ask)
                      : GOES_TO[option]}
              </button>
            ))}
          </span>
        </div>
      )}

      {doubt && (
        <div
          className="quickadd__ask"
          role="group"
          aria-label={doubt.text}
          onKeyDown={(event) => {
            const buttons = [...event.currentTarget.querySelectorAll("button")];
            const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              input.current?.focus();
            } else if (at !== -1 && (event.key === "ArrowRight" || event.key === "ArrowLeft")) {
              event.preventDefault();
              buttons[(at + (event.key === "ArrowRight" ? 1 : buttons.length - 1)) % buttons.length]?.focus();
            }
          }}
        >
          <span className="quickadd__question">{doubt.text}</span>
          {doubt.say && (
            <input
              ref={answerInput}
              className="input quickadd__reply"
              value={reply}
              placeholder={doubt.say.hint}
              aria-label={doubt.text}
              autoComplete="off"
              spellCheck={false}
              disabled={aiBusy}
              onChange={(event) => setReply(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                event.stopPropagation();
                const answer = reply.trim();
                // Nothing typed is the other answer: the first one beside the box.
                if (answer) doubt.say?.take(answer);
                else doubt.options[0]?.pick();
                setReply("");
                input.current?.focus();
              }}
            />
          )}
          <span className="quickadd__answers">
            {doubt.options.map((option, index) => (
              <button
                key={option.label}
                ref={index === 0 && !doubt.say ? firstOption : undefined}
                type="button"
                className="chip"
                onClick={() => {
                  option.pick();
                  input.current?.focus();
                }}
              >
                {option.label}
              </button>
            ))}
          </span>
        </div>
      )}

      {question && !doubt && (
        <div
          className="quickadd__ask"
          role="group"
          aria-label={question.text}
          onKeyDown={(event) => {
            // Left and right between the answers, Escape back to the line: the
            // whole question can be answered without the mouse or the Tab key.
            const buttons = [...event.currentTarget.querySelectorAll("button")];
            const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              input.current?.focus();
            } else if (at !== -1 && (event.key === "ArrowRight" || event.key === "ArrowLeft")) {
              event.preventDefault();
              buttons[(at + (event.key === "ArrowRight" ? 1 : buttons.length - 1)) % buttons.length]?.focus();
            }
          }}
        >
          <span className="quickadd__question">{question.text}</span>
          {"options" in question && (
            <span className="quickadd__answers">
              {question.options.map((option, index) => (
                <button
                  key={option.label}
                  ref={index === 0 ? firstOption : undefined}
                  type="button"
                  className="chip"
                  onClick={() => {
                    setAnswers((current) =>
                      "day" in option
                        ? { ...current, day: option.day }
                        : "until" in option
                          ? { ...current, until: option.until }
                          : { ...current, time: option.time },
                    );
                    input.current?.focus();
                  }}
                >
                  {option.label}
                </button>
              ))}
            </span>
          )}
        </div>
      )}

      {error && (
        <p className="field__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/** What the line was understood as, in the order a person would say it. */
function Reading({
  title,
  day,
  time,
  minutes,
  kind,
  priority,
  repeat,
  until,
  occurrences,
}: {
  title: string;
  day: string | null;
  time: string | null;
  minutes: number | null;
  kind: string;
  priority: string | null;
  /** "Every Mon, Wed, Fri", when it repeats. */
  repeat: string | null;
  until: string | null;
  occurrences: number;
}) {
  return (
    <span className="quickadd__reading">
      <strong className="quickadd__title">{title || "…"}</strong>
      {repeat ? (
        <span className="quickadd__part">{repeat}</span>
      ) : (
        day && <span className="quickadd__part">{day}</span>
      )}
      {time && (
        <span className="quickadd__part">
          {formatTime(time)}
          {` for ${formatDuration(minutes ?? 60)}`}
        </span>
      )}
      {repeat && until && <span className="quickadd__part">until {until}</span>}
      {kind !== "todo" && (
        <span className="quickadd__part">{TASK_KIND_LABEL[kind as keyof typeof TASK_KIND_LABEL]}</span>
      )}
      {priority === "must" && <span className="quickadd__part">Has to happen</span>}
      {priority === "spare" && <span className="quickadd__part">If there is time</span>}
      {repeat
        ? occurrences > 0 && <span className="quickadd__note">{occurrences} on your day, no task to tick</span>
        : time && <span className="quickadd__note">and the hour set aside on your day</span>}
    </span>
  );
}

/** "Today", "Tomorrow", "Friday" for this week, a date beyond that. */
function whenLabel(day: string, today: string): string {
  const ahead = daysBetween(today, day);
  if (ahead === 0) return "Today";
  if (ahead === 1) return "Tomorrow";
  if (ahead > 1 && ahead < 7) {
    return dateFormatter({ weekday: "long", timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`));
  }
  return dateFormatter({
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
    ...(day.slice(0, 4) === today.slice(0, 4) ? {} : { year: "numeric" }),
  }).format(new Date(`${day}T00:00:00Z`));
}
