import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { cueEmber, fedEmber } from "@/features/ember/stage";
import { ChevronsUpDown, CornerDownLeft, Sparkles } from "lucide-react";
import {
  TASK_AREAS,
  TASK_AREA_LABEL,
  TASK_KIND_LABEL,
  leadInput,
  type AreaWord,
  type TaskArea,
} from "@shared/domain";
import { describeWeekdays, parseQuick, type Answers, type Learned } from "@shared/quickadd";
import { namedContact, readCapture, type Ask, type CaptureKind, type Effect, type Known } from "@shared/capture";
import { NO_CONTEXT, type Answer, type LastLine, type LineContext, type TaskSnapshot } from "@shared/lines";
import { readQuestion } from "@shared/questions";
import { readEdit, type Edit } from "@shared/edits";
import { followOn } from "@shared/followon";
import { together } from "@shared/together";
import { alreadyOpen, clashWith, complete, completionsFrom, readyFor, usualFor } from "@shared/habitual";
import { cleanPaste } from "@shared/pasteline";
import { RUNNING_COST_TEMPLATE } from "@shared/costs";
import { AnswerReading, EditReading, ManyReading } from "./LinePanels";
import { thoughtBody } from "@shared/thoughts";
import { sayTrail, type Step } from "@shared/branches";
import { measuresOf } from "@shared/subjects";
import type { BrainSectionId } from "@shared/brain";
import { sayShortcut } from "@shared/domain";
import { LESSON_KINDS, learntFrom, voteKind, type Lesson, type LessonKind } from "@shared/lessons";
import { areaOpinion, secondOpinion, type Example } from "@shared/opinion";
import { REMIND_ME } from "@shared/nudges";
import { occurrencesOf } from "@shared/repeat";
import { daysBetween, minutesOf, timeNow, today as todayIn } from "@shared/dates";
import { dateFormatter, formatDuration, formatTime, numberText } from "@/lib/format";
import { messageOf } from "@/lib/errors";

/**
 * One line, and it is a task.
 *
 * The full form asks five questions in a fixed order whether or not you had
 * the answers. This takes the line as you would say it - "datascience
 * assignment at 4pm today", "gym mon wed fri 6am" - and shows what it
 * understood before anything is written, so a wrong reading is caught while
 * it is still one keystroke to fix.
 *
 * When something is genuinely missing it asks, one question at a time, with
 * the likely answers as buttons. Typing the answer into the line works just
 * as well: the question is only ever "what the parse does not have yet", so
 * adding "tomorrow" makes the question about the day disappear by itself.
 *
 * And when it guessed the area wrong, the area in the reading is a button:
 * one click moves it on, without having to know that "#college" exists.
 *
 * On Today it is **smart** (PLAN.md, part four): the line takes anything, and
 * says where it will go before it goes - a task, today's journal, a contact's
 * history, time on a hobby, an idea, a note - from what Caulder knows
 * (shared/capture.ts). The chips under it move it somewhere else.
 */

const GOES_TO: Record<CaptureKind, string> = {
  task: "Task",
  journal: "Journal",
  private: "Private",
  contact: "History",
  hobby: "Hobby",
  done: "Done",
  memory: "Memory",
  command: "Do it",
  idea: "Idea",
  note: "Note",
};

const LENGTHS = [15, 30, 45, 60, 90];

/** Where memories are kept and looked for: the parts of the brain that are about a life rather than a company. */
const MEMORY_SECTIONS: readonly BrainSectionId[] = ["hobbies", "studies", "ideas", "goals", "remembered"];

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
    case "book": {
      const pile = ask.status === "reading" ? "Reading" : ask.status === "read" ? "Read" : "To be read";
      return ask.titles.length > 1 ? `${pile}: ${ask.series ?? "the series"}, all ${ask.titles.length}` : `${pile}: ${ask.titles[0] ?? ""}`;
    }
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
    case "cost":
      return `${ask.title}: ${numberText(ask.amount)} ${ask.cycle === "monthly" ? "a month" : ask.cycle === "yearly" ? "a year" : "a quarter"}`;
  }
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

/** One thing a report will do, in the words it is offered and confirmed in. */
function sayEffect(effect: Effect): string {
  switch (effect.do) {
    case "finish":
      return `Finish “${effect.task.title}”`;
    case "tick":
      return `Tick ${effect.habit.name}`;
    case "time":
      return `${formatDuration(effect.minutes)} on ${effect.hobby.title}${
        effect.startsAt ? ` at ${formatTime(effect.startsAt)}` : ""
      }, on the Calendar`;
    case "block":
      return `${effect.title} at ${formatTime(effect.startsAt)}, on the Calendar`;
    case "memory":
      return effect.page
        ? `Remember under ${effect.page.title}`
        : `New page: ${effect.topic ?? ""}${sayTrail(effect.trail) ? `, under ${sayTrail(effect.trail)}` : ""}`;
    case "journal":
      return "Journal";
  }
}
export function QuickAdd({
  companyId,
  homeId,
  timezone,
  personal,
  focusNonce = 0,
  placeholder = "Datascience assignment at 4pm today",
  hint,
  onAdded,
  smart = false,
  onGo,
  onOpenContact,
  modes,
}: {
  companyId: string;
  /** Where your own things go - the journal, a hobby's time - whichever company is chosen. */
  homeId?: string;
  timezone: string;
  /** A personal workspace fills a missing area with Personal; a company one with Company. */
  personal: boolean;
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
  /**
   * The mode control at the head of the line, when the screen has one to
   * give. Passed in rather than built here: this component is also the
   * capture window, which has one mode and no business drawing three.
   *
   * Asking your AI is one of those modes (LineModes.tsx), so it is offered
   * there - only when an AI is connected - and not by a star of the line's own.
   */
  modes?: ReactNode;
}) {
  const [text, setText] = useState("");
  const [answers, setAnswers] = useState<Answers>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<string | null>(null);
  const readId = useId();
  const input = useRef<HTMLInputElement>(null);
  const firstOption = useRef<HTMLButtonElement>(null);

  const [words, setWords] = useState<readonly AreaWord[]>([]);
  /** The companies by name: "for unifloe" is company work, whichever workspace it is typed in. */
  const [companies, setCompanies] = useState<readonly { word: string; area: string }[]>([]);
  /** What was learnt from lines moved before they were kept (shared/lessons.ts). */
  const [lessons, setLessons] = useState<readonly Lesson[]>([]);
  /** What Tune has settled: slips read without comment, and words never touched. */
  const [learned, setLearned] = useState<Learned>({ same: {}, keep: [] });
  const [termEnd, setTermEnd] = useState<string | null>(null);
  /** The key that opens the quick window from any app, when one is held. */
  const [anywhere, setAnywhere] = useState<string | null>(null);
  /** What the smart line recognises: the contacts and the hobbies. */
  const [known, setKnown] = useState<Known>({ contacts: [], hobbies: [], habits: [] });
  /** Where the person moved it to, over what the line guessed. */
  const [chosen, setChosen] = useState<CaptureKind | null>(null);
  /** How long, for time on a hobby the line did not say the length of. */
  const [length, setLength] = useState<number | null>(null);
  /** The things a report would do that were switched off, by what they say. */
  const [skipped, setSkipped] = useState<readonly string[]>([]);
  /** Bumped once something is kept, so what the line knows about today is read again. */
  const [kept, setKept] = useState(0);
  /** Whether the journal has a passcode: what decides if a private line is locked, or only kept apart. */
  const [passcode, setPasscode] = useState(false);
  /** What is already there - open tasks, the hours ahead, what was typed before (shared/lines.ts). */
  const [context, setContext] = useState<LineContext>(NO_CONTEXT);
  /** The last thing this line made, so the next line can mean it: "actually 6pm", "him", "also eggs". */
  const [last, setLast] = useState<LastLine | null>(null);
  /** What the last cancel took away, for Undo. */
  const [undo, setUndo] = useState<{ title: string; snapshot: TaskSnapshot } | null>(null);
  /** Read this line the plain way: not as a question, an edit or several things. */
  const [plainly, setPlainly] = useState(false);
  /** The usual hour offered for this line, turned down. */
  const [noUsual, setNoUsual] = useState(false);
  /** The day before an exam or a pitch, asked for. */
  const [getReady, setGetReady] = useState(false);
  /** The answer to the question the line is, keyed by the question so a stale one is never shown. */
  const [answered, setAnswered] = useState<{ key: string; answer: Answer | null; error: string | null } | null>(null);

  useEffect(() => {
    if (focusNonce > 0) input.current?.focus();
  }, [focusNonce]);

  // Your words and the term, read again whenever the window comes back to the
  // front. The capture window is hidden and re-shown rather than rebuilt, so a
  // word taught in Settings a minute ago would otherwise not reach it until
  // the app restarted. A failed read leaves the line working without them.
  useEffect(() => {
    const read = () => {
      window.caulder.words.list().then(setWords, () => undefined);
      window.caulder.tune.learned().then(setLearned, () => undefined);
      window.caulder.lessons.list().then(setLessons, () => undefined);
      window.caulder.life.lockState().then((lock) => setPasscode(lock.set), () => undefined);
      window.caulder.companies.list().then(
        (all) =>
          setCompanies(
            all.companies
              .filter((company) => company.kind !== "personal")
              .map((company) => ({ word: company.name, area: "company" })),
          ),
        () => undefined,
      );
      window.caulder.capture.get().then((key) => setAnywhere(key.held ? key.accelerator : null), () => undefined);
      // Your terms are yours, kept in your home whichever company is chosen.
      window.caulder.terms.list(homeId ?? companyId).then((terms) => {
        const day = todayIn(timezone);
        setTermEnd(terms.find((term) => term.fromDay <= day && day <= term.untilDay)?.untilDay ?? null);
      }, () => undefined);
    };
    read();
    window.addEventListener("focus", read);
    return () => window.removeEventListener("focus", read);
  }, [companyId, homeId, timezone]);

  // The names the smart line listens for, read when the window comes back to the front.
  useEffect(() => {
    if (!smart) return;
    const read = () => {
      Promise.all([
        window.caulder.leads.list({ companyId, sort: "name", direction: "asc" }),
        window.caulder.life.hobbies(homeId ?? companyId),
        // Each of the rest is a nicety: a workspace with no habits, or a brain
        // that will not open, is not a reason to know nobody's name.
        window.caulder.habits.list(homeId ?? companyId).catch(() => null),
        window.caulder.today.get(companyId).catch(() => null),
        Promise.all(
          MEMORY_SECTIONS.map((section) => window.caulder.brain.section(homeId ?? companyId, section, false).catch(() => [])),
        ),
      ]).then(
        ([contacts, hobbies, habits, day, sections]) =>
          setKnown({
            contacts: contacts.map((contact) => ({ id: contact.id, name: contact.name, person: contact.contactPerson })),
            hobbies: hobbies.map((hobby) => ({ id: hobby.id, title: hobby.title })),
            habits: (habits?.habits ?? []).filter((habit) => !habit.archived).map((habit) => ({ id: habit.id, name: habit.name })),
            tasks: [...(day?.dueToday ?? []), ...(day?.overdue ?? [])].map((open) => ({ id: open.id, title: open.title })),
            blocks: (day?.blocks ?? []).map((block) => ({ title: block.title })),
            pages: sections.flat().map((page) => ({ id: page.id, title: page.title, section: page.section })),
          }),
        () => undefined,
      );
    };
    read();
    window.addEventListener("focus", read);
    return () => window.removeEventListener("focus", read);
  }, [smart, companyId, homeId, kept]);

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
  // Their own words first, so a company they also taught as something else
  // stays what they taught it as.
  const vocabulary = useMemo(() => [...words, ...companies], [words, companies]);
  // A line that carries on from the last one is read with what it carries on
  // from: "send him the deck" names Rahul, "also eggs" is bought the same day.
  const namesOne = smart && namedContact(text, known.contacts) !== null;
  const followed = useMemo(() => followOn(text, last, namesOne), [text, last, namesOne]);
  const line = followed.line;
  const { task, questions, notes, corrections, unknown } = useMemo(() => {
    const reader = { today, now, words: vocabulary, termEnd, learned, lessons };
    const first = parseQuick(line, reader, answers);
    // The day it carries on from, only when the line says none of its own.
    return first.task.day === null && followed.day !== null && answers.day === undefined
      ? parseQuick(line, reader, { ...answers, day: followed.day })
      : first;
  }, [line, followed.day, today, now, vocabulary, termEnd, learned, lessons, answers]);
  /**
   * What it would have said on its own, before the area was moved by hand -
   * which is what a move is learnt against - and before any lesson, so the
   * line can say when a lesson is why.
   */
  const guessed = useMemo(() => {
    if (!text.trim()) return { area: null as string | null, unlearnt: null as string | null };
    const own: Answers = { ...answers };
    delete own.area;
    const context = { today, now, words: vocabulary, termEnd, learned };
    return {
      area: parseQuick(line, { ...context, lessons }, own).task.area,
      unlearnt: parseQuick(line, context, own).task.area,
    };
  }, [text, line, today, now, vocabulary, termEnd, learned, lessons, answers]);

  // Says the key that works from any app only when one is actually held - a
  // hint naming a key another app took would send somebody looking for
  // nothing.
  const shownHint =
    hint ??
    `Type it the way you would text it — “tmrw 4pm”, “mtg w rahul nxt wk”, “fri for 2h”, “gym every mon wed fri 6am”, “not urgent”, “#college”. Press A here${
      anywhere ? `, or ${sayShortcut(anywhere)} from any app` : ""
    }.`;

  const reading = useMemo(
    () => (smart && line.trim() ? readCapture(line, known, { today, now }) : null),
    [smart, line, known, today, now],
  );

  // A second opinion (PLAN.md, part five, phase 20): only on a reading the
  // rules were guessing at, asked once the typing pauses, and nothing waits
  // for it - without understanding, or before it answers, the rules stand.
  const [heard, setHeard] = useState<{ key: string; examples: Example[] } | null>(null);
  // Asked too for a task nothing gave an area to: the areas of the person's nearest tasks may.
  const softKey = smart && line.trim() && (reading?.soft || task.area === null) ? `${companyId}|${line.trim()}` : null;
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
  /** Where a memory goes: the page the rules found, or the one the model says it belongs with. */
  const placed = reading?.page ?? opinion?.page ?? null;
  /** The area the person's nearest tasks agree on, for a task nothing else gave one. */
  const modelArea = heard && heard.key === softKey && task.area === null ? areaOpinion(heard.examples) : null;

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
  const guessedKind: CaptureKind = learntKind ?? opinion?.kind ?? reading?.kind ?? "task";
  const goesTo: CaptureKind = chosen ?? guessedKind;
  const asTask = goesTo === "task";
  const minutes = reading?.minutes ?? length;

  /** What a report will do, less what was switched off. */
  const doing = (reading?.effects ?? []).filter((effect) => !skipped.includes(sayEffect(effect)));

  const question = text.trim().length > 0 && asTask && !edit && !asked ? questions[0] : undefined;
  const fallback = personal ? "personal" : "company";
  const area = (task.area ?? modelArea ?? fallback) as string;
  /** Said when the area came from the model, so it is never a mystery either. */
  const modelAreaNote =
    modelArea && answers.area === undefined
      ? `${modelArea in TASK_AREA_LABEL ? TASK_AREA_LABEL[modelArea as TaskArea] : modelArea}, like your tasks that sound like it.`
      : null;
  /** Said under the line when a lesson is why it went where it did, so a lesson is never a mystery. */
  const learntNote = (() => {
    if (answers.area !== undefined || task.area === null || task.area === guessed.unlearnt) return null;
    const from = learntFrom(text, lessons, "area", task.area);
    const label = task.area in TASK_AREA_LABEL ? TASK_AREA_LABEL[task.area as TaskArea] : task.area;
    return from ? `${label}, the way you moved \u201c${from}\u201d.` : null;
  })();
  // Asked to be reminded: said back, so it is known before Enter that a notification will come.
  const reminds = asTask && REMIND_ME.test(text);
  const remindNote = reminds && task.day
    ? `A Windows notification ${task.time ? `at ${formatTime(task.time)}` : "that morning"}${task.day === today ? "" : `, ${whenLabel(task.day, today).toLowerCase()}`}.`
    : null;
  // What was done before, said: the hour this usually has, a clash with an
  // hour already taken, the same thing already there (shared/habitual.ts).
  const timed = asTask && task.day !== null && !task.repeat;
  const usual = timed && !noUsual && (!task.time || task.minutes === null) ? usualFor(task.title, context.timed) : null;
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
    const reader = { today, now, words: vocabulary, termEnd, learned, lessons };
    return group.split.map((part) => {
      const read = parseQuick(part, reader, {});
      return { said: part, task: read.task, day: read.task.day ?? task.day };
    });
  }, [group, today, now, vocabulary, termEnd, learned, lessons, task.day]);
  const listNote = group?.list ? group.list.items.map((item) => `- ${item}`).join("\n") : null;

  const shownNotes = [
    ...(followed.note ? [followed.note] : []),
    ...notes,
    ...(learntNote ? [learntNote] : []),
    ...(modelAreaNote ? [modelAreaNote] : []),
    ...(remindNote ? [remindNote] : []),
    ...(usualNote ? [usualNote] : []),
    ...(clash ? [`${clash.title} is at ${formatTime(clash.startsAt)} then.`] : []),
    ...(twin ? [`“${twin.title}” is already there, for ${whenLabel(twin.dueOn, today).toLowerCase()}.`] : []),
    ...(group?.list ? [`${group.list.items.length} things, kept as a list in its note.`] : []),
  ];

  /**
   * What a line moved by hand teaches, once it has been kept: the part of life
   * it was moved to, and where it was moved to go. Never awaited and never an
   * error - a line that was kept was kept.
   */
  function learn(said: string) {
    const lessonsToGive: { text: string; area?: TaskArea; kind?: LessonKind }[] = [];
    if (asTask && answers.area !== undefined && answers.area !== (guessed.area ?? fallback)) {
      lessonsToGive.push({ text: said, area: answers.area as TaskArea });
    }
    if (chosen !== null && chosen !== guessedKind && soft(chosen) && soft(guessedKind)) {
      lessonsToGive.push({ text: said, kind: chosen });
    }
    for (const lesson of lessonsToGive) {
      void window.caulder.lessons.add(lesson).then(setLessons, () => undefined);
    }
  }
  const ready = edit
    ? true
    : asked
      ? false
      : asTask
    ? text.trim().length > 0 && questions.length === 0 && task.day !== null
    : (reading?.text ?? "").length > 0 &&
      (goesTo !== "hobby" || minutes !== null) &&
      (goesTo !== "done" || doing.length > 0);
  const repeat = task.repeat && task.repeat.until !== null && task.day !== null
    ? { weekdays: task.repeat.weekdays, until: task.repeat.until }
    : null;
  const occurrences = repeat && task.day
    ? occurrencesOf({ weekdays: repeat.weekdays, from: task.day, until: repeat.until }).length
    : 0;

  /**
   * The next of the four, from whichever this is - and the cursor back in the
   * line, so the Enter that follows adds the task rather than pressing this
   * button a second time.
   */
  function nextArea() {
    const at = (TASK_AREAS as readonly string[]).indexOf(area);
    setAnswers((current) => ({ ...current, area: TASK_AREAS[(at + 1) % TASK_AREAS.length] }));
    input.current?.focus();
  }

  /**
   * One more thing known about something, kept with it: a dated line at the
   * foot of its page in your own brain. Main finds or starts every page above
   * it - Me, Hobbies, Reading, the series - so the map draws the whole branch
   * (shared/branches.ts says what the chain is; services/remember.ts keeps it).
   */
  async function remember(
    known: { id: string; title: string } | null,
    topic: string | null,
    section: BrainSectionId,
    trail: Step[],
    said: string,
    /** The part to read first - "PR: 45 kg x 3" - so a page of these reads down its left edge. */
    fact: string | null,
    /** The contact a person's page is about, which it then links to. */
    about: { id: string; name: string } | null = null,
  ): Promise<string> {
    const kept = await window.caulder.brain.remember({ pageId: known?.id ?? null, topic, section, trail, said, fact, day: today, about });
    return kept.title;
  }

  /** Everything that is not a task: kept where the line said, or where it was moved to. */
  async function keep() {
    if (!ready || busy || !reading) return;
    const said = reading.text;
    setBusy(true);
    setError(null);
    try {
      let summary = "";
      if (goesTo === "private") {
        const { sealed } = await window.caulder.life.jotPrivate(homeId ?? companyId, {
          text: said,
          feeling: reading.secret?.feeling ?? "other",
          people: reading.secret?.people ?? [],
        });
        // Said as it is: locked is a claim, and without a passcode it is not true yet.
        summary = sealed
          ? "Locked in your journal. Only your passcode opens it."
          : "Kept in your private lines, apart from everything else. It is not locked yet: set a journal passcode and it will be.";
      } else if (goesTo === "journal") {
        await window.caulder.life.jot(homeId ?? companyId, said);
        summary = "In today's journal";
      } else if (goesTo === "contact" && reading.contact) {
        await window.caulder.activities.log({ leadId: reading.contact.id, kind: reading.logged, body: said });
        summary = `On ${reading.contact.name}'s history${reading.logged === "note" ? "" : `, as a ${reading.logged}`}`;
      } else if (goesTo === "hobby" && reading.hobby && minutes !== null) {
        await window.caulder.life.logTime(reading.hobby.id, minutes);
        summary = `${formatDuration(minutes)} of ${reading.hobby.title}, kept`;
      } else if (goesTo === "done") {
        // One after another, in the order they were shown: if one fails, what
        // came before it happened and is said, and the line is kept to try again.
        const did: string[] = [];
        try {
          for (const effect of doing) {
            if (effect.do === "finish") {
              await window.caulder.tasks.complete(effect.task.id);
              cueEmber("done");
            }
            else if (effect.do === "tick") {
              await window.caulder.habits.tick(effect.habit.id, null, true);
              fedEmber();
            }
            else if (effect.do === "time") await window.caulder.life.logTime(effect.hobby.id, effect.minutes, effect.startsAt);
            else if (effect.do === "memory") await remember(effect.page, effect.topic, effect.branch?.section ?? "ideas", effect.trail, said, effect.fact);
            else if (effect.do === "journal") await window.caulder.life.jot(homeId ?? companyId, said);
            else {
              await window.caulder.day.createBlock(companyId, {
                day: today,
                startsAt: effect.startsAt,
                minutes: effect.minutes,
                title: effect.title,
                kind: "personal",
                notes: said,
                taskId: null,
                priority: null,
                remindMinutes: null,
                repeat: null,
              });
            }
            did.push(sayEffect(effect));
          }
        } catch (cause) {
          setKept((count) => count + 1);
          throw new Error(`${did.length > 0 ? `Done: ${did.join(", ")}. Then: ` : ""}${messageOf(cause)}`, { cause });
        }
        summary = did.join(" · ");
      } else if (goesTo === "command" && reading.ask) {
        const ask = reading.ask;
        if (ask.do === "go") onGo?.(ask.place);
        else if (ask.do === "book") {
          await window.caulder.life.shelfAdd(homeId ?? companyId, { titles: ask.titles, series: ask.series, status: ask.status });
        }
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
        else if (ask.do === "cost") {
          // A running cost is a page in the brain's Money (shared/costs.ts), with its amount, how often and when next.
          const page = await window.caulder.brain.create(companyId, "money", RUNNING_COST_TEMPLATE);
          await window.caulder.brain.save(page.id, {
            title: ask.title,
            body: page.body,
            fields: {
              ...page.fields,
              amount: ask.amount,
              cycle: ask.cycle,
              dueOn: ask.day ? nextOnThe(ask.day, today) : null,
              category: costKind(ask.title),
            },
            secrets: {},
            baseRevision: page.revision,
          });
          summary = `${sayAsk(ask)}, a running cost in Money`;
        }
        else if (ask.do === "spend") {
          const on = new Date(`${today}T00:00:00Z`);
          on.setUTCDate(on.getUTCDate() - ask.daysAgo);
          await window.caulder.money.addSpend(companyId, { spentOn: on.toISOString().slice(0, 10), amount: ask.amount, what: ask.what });
        } else {
          // Through the schema, which fills in everything the line did not say
          // and refuses what main would - with the schema's own sentence.
          const parsed = leadInput.safeParse({
            name: ask.name,
            contactPerson: ask.person,
            phone: ask.phone,
            email: ask.email,
            source: ask.source ?? null,
            notes: ask.role ? `Role: ${ask.role}` : null,
          });
          if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "That contact will not do.");
          const lead = await window.caulder.leads.create(companyId, parsed.data);
          // Somebody told about, not only asked for: what happened goes on their
          // history, and what to do about them becomes their task. After the
          // contact, so neither is ever left pointing at nobody.
          const alsoDid: string[] = [];
          if (ask.happened) {
            await window.caulder.activities.log({ leadId: lead.id, kind: "note", body: ask.happened });
            alsoDid.push("what happened on their history");
          }
          if (ask.then) {
            await window.caulder.tasks.quick(companyId, {
              title: ask.then.title,
              day: ask.then.day,
              time: ask.then.time,
              minutes: null,
              kind: "follow_up",
              area: personal ? "personal" : "company",
              priority: null,
              repeat: null,
              leadId: lead.id,
              notes: null,
              followUp: null,
              remind: false,
            });
            alsoDid.push(`“${ask.then.title}” ${whenLabel(ask.then.day, today).toLowerCase()}`);
            setLast({
              taskId: null,
              title: ask.then.title,
              day: ask.then.day,
              time: ask.then.time,
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
        // A page the model found is where it goes as it is: its place in the brain is its owner's.
        const found = !reading.page && placed !== null;
        const title = await remember(
          placed,
          found ? null : reading.topic,
          reading.branch?.section ?? "ideas",
          found ? [] : reading.trail,
          said,
          reading.fact,
          reading.about ?? null,
        );
        summary = `Remembered, under ${title} in the brain`;
      } else if (goesTo === "idea") {
        const page = await window.caulder.brain.create(companyId, "ideas", "idea");
        // A thing to make is kept with its parts apart: a title to scan, what it
        // should be like, and the reference as a link that can be pressed.
        const made = reading.thought;
        const title = made ? made.title : said;
        await window.caulder.brain.save(page.id, {
          title: title.length > 120 ? `${title.slice(0, 117).trimEnd()}…` : title,
          body: made ? thoughtBody(made, said) : said,
          fields: page.fields,
          secrets: {},
          baseRevision: page.revision,
        });
        summary = "An idea, in the brain";
      } else {
        await window.caulder.notes.create(companyId, said);
        summary = "A note, at the foot of Today";
      }
      // The numbers in it - twenty push ups, five kilometres - kept to be added up.
      // Never from a private line, and never what adding them up turns on.
      if (goesTo !== "private") void window.caulder.life.logMeasures(homeId ?? companyId, measuresOf(said)).catch(() => undefined);
      // Never from a private line: what is in one is not a lesson about anything else.
      if (goesTo !== "private") learn(said);
      // Something that happened with a contact is who "him" is in the next line.
      // A new contact with a task for them has set the last line itself.
      if (!(goesTo === "command" && reading.ask?.do === "contact" && reading.ask.then)) {
        setLast(goesTo === "contact" && reading.contact ? { taskId: null, title: said, day: today, time: null, contact: called(reading.contact) } : null);
      }
      done(summary);
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
    setAdded(summary);
    setText("");
    setAnswers({});
    setChosen(null);
    setLength(null);
    setSkipped([]);
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
        done(`Moved “${what.task.title}” to ${when(what.day).toLowerCase()}${moved.time ? ` at ${formatTime(moved.time)}` : ""}`);
      } else if (what.do === "cancel") {
        const snapshot = await window.caulder.lines.cancel(what.task.id);
        setLast(null);
        setUndo({ title: what.task.title, snapshot });
        done(`Cancelled “${what.task.title}”`);
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

  /** Undo a cancel: the task and its hour back as they were. */
  async function putBack() {
    if (!undo) return;
    setBusy(true);
    try {
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
          area: part.task.area ?? area,
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
        area,
        priority: task.priority,
        repeat,
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
      const named = [reading?.contact?.name ?? "", ...known.contacts.map((contact) => contact.person ?? "")]
        .join(" ")
        .toLowerCase();
      void window.caulder.tune
        .seen({ slips: corrections, names: unknown.filter((name) => !named.includes(name)) })
        .catch(() => undefined);
      const summary = repeat
        ? `${task.title} — ${describeWeekdays(repeat.weekdays)}${task.time ? ` at ${formatTime(task.time)}` : ""}, ${result.repeats} on your day`
        : `${task.title} — ${whenLabel(task.day, today)}${time ? ` at ${formatTime(time)}` : ""}${
            result.followUp ? `, and “${result.followUp.title}” ${whenLabel(result.followUp.dueOn, today).toLowerCase()}` : ""
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
    setChosen(null);
    setLength(null);
    setSkipped([]);
    setPlainly(false);
    setNoUsual(false);
    setGetReady(false);
    setError(null);
  }

  // The confirmation stays long enough to read and then gets out of the way.
  useEffect(() => {
    if (!added) return;
    const timer = setTimeout(() => setAdded(null), 4000);
    return () => clearTimeout(timer);
  }, [added]);

  return (
    <div className="quickadd">
      <div className="quickadd__row">
        {modes ?? <Sparkles size={17} className="quickadd__icon" aria-hidden />}
        <span className="quickadd__field">
        <input
          ref={input}
          className="quickadd__input"
          value={text}
          placeholder={smart ? "Say anything - a task, what you did, how it went, something to remember" : placeholder}
          aria-label={smart ? "Anything, in one line" : "Add a task in one line"}
          aria-describedby={readId}
          autoComplete="off"
          spellCheck={false}
          disabled={busy}
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
                setText("");
                setAnswers({});
                setChosen(null);
                setLength(null);
                setError(null);
              }
              return;
            }
            if (event.key !== "Enter") return;
            event.preventDefault();
            // Enter with a question open goes to its answers rather than
            // adding a task the app had to guess at.
            if (ready) void add();
            else firstOption.current?.focus();
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
          disabled={!ready || busy}
          onClick={() => void add()}
        >
          <CornerDownLeft size={14} aria-hidden />
          {asTask ? "Add" : "Keep"}
        </button>
      </div>

      <div id={readId} className="quickadd__read" aria-live="polite">
        {text.trim().length === 0 ? (
          added || undo ? (
            <span className="quickadd__added">
              {added ? (/^(?:Moved|Cancelled|Renamed|Back)\b/.test(added) ? added : `Added: ${added}`) : `Cancelled “${undo?.title ?? ""}”.`}
              {undo && (
                <button type="button" className="quickadd__keep" onClick={() => void putBack()} disabled={busy}>
                  Undo
                </button>
              )}
            </span>
          ) : (
            <span className="quickadd__hint">
              {smart ? (
                <>
                  <kbd className="kbd">{anywhere ? sayShortcut(anywhere) : "A"}</kbd> Text anything you want. We are ready for you.
                </>
              ) : (
                shownHint
              )}
            </span>
          )
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
            <span className="quickadd__note">
              {goesTo === "private"
                ? passcode
                  ? "locked in your journal the moment it is kept; only your passcode opens it"
                  : "kept apart from everything else - and locked too, once the journal has a passcode"
                : goesTo === "journal"
                ? "into today's journal"
                : goesTo === "contact" && reading.contact
                  ? `on ${reading.contact.name}'s history${reading.logged === "note" ? "" : `, as a ${reading.logged}`}`
                  : goesTo === "hobby" && reading.hobby
                    ? minutes !== null
                      ? `${formatDuration(minutes)} of ${reading.hobby.title}, kept on the Calendar`
                      : `time on ${reading.hobby.title}: how long?`
                    : goesTo === "command" && reading.ask
                      ? reading.ask.do === "contact"
                        ? [
                            reading.ask.role,
                            reading.ask.source ? `from ${reading.ask.source}` : null,
                            reading.ask.phone,
                            reading.ask.email,
                            reading.ask.happened ? `“${reading.ask.happened}” on their history` : null,
                            reading.ask.then
                              ? `and “${reading.ask.then.title}” ${whenLabel(reading.ask.then.day, today).toLowerCase()}${
                                  reading.ask.then.time ? ` at ${formatTime(reading.ask.then.time)}` : ""
                                }${reading.ask.then.daySaid ? "" : " - say a day to change it"}`
                              : null,
                            reading.ask.then || reading.ask.happened ? null : "a new contact, and in Google Contacts when that is connected",
                          ]
                            .filter(Boolean)
                            .join(" · ")
                        : reading.ask.do === "spend"
                          ? `in Money, ${reading.ask.daysAgo === 1 ? "for yesterday" : "for today"}`
                          : reading.ask.do === "book"
                            ? reading.ask.titles.length > 1
                              ? `on your shelf, in order: ${reading.ask.titles.join(" · ")}`
                              : `on your shelf${reading.ask.series ? `, part of ${reading.ask.series}` : ""}`
                          : "press Enter"
                    : goesTo === "done"
                      ? doing.length > 0
                        ? "what you did, put where it belongs"
                        : "nothing of yours matches this yet"
                    : goesTo === "memory"
                      ? placed
                        ? `remembered under ${placed.title}, in the brain`
                        : `a new page in the brain's ${reading.branch?.section ?? "ideas"}: ${reading.topic ?? ""}${
                            sayTrail(reading.trail) ? `, under ${sayTrail(reading.trail)}` : ""
                          }`
                    : goesTo === "idea" && reading.thought
                      ? `an idea in the brain: “${reading.thought.title}”${reading.thought.detail ? `, ${reading.thought.detail}` : ""}${
                          reading.thought.links.length > 0 ? `, with ${reading.thought.links.length === 1 ? "its link" : "its links"}` : ""
                        }`
                    : goesTo === "idea"
                      ? "an idea, in the brain's Ideas"
                      : "a note at the foot of Today, to file later"}
            </span>
          </span>
        ) : (
          <Reading
            title={task.title}
            day={task.day ? whenLabel(task.day, today) : null}
            time={time}
            minutes={span}
            kind={task.kind}
            area={area}
            priority={task.priority}
            repeat={task.repeat ? describeWeekdays(task.repeat.weekdays) : null}
            until={task.repeat?.until ? whenLabel(task.repeat.until, today) : null}
            occurrences={occurrences}
            onArea={nextArea}
          />
        )}
      </div>

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
              And “{ready4.title}” {whenLabel(ready4.day, today).toLowerCase()}
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
      {reading && !edit && !asked && (
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
                  : option === "hobby" && reading.hobby
                    ? reading.hobby.title
                    : option === "memory" && placed
                      ? placed.title
                      : option === "command" && reading.ask
                        ? sayAsk(reading.ask)
                        : GOES_TO[option]}
              </button>
            ))}
          </span>
        </div>
      )}

      {/* A report does several things. Each is said, and each can be switched off. */}
      {reading && !edit && !asked && goesTo === "done" && reading.effects.length > 0 && (
        <div className="quickadd__ask" role="group" aria-label="What this will do">
          <span className="quickadd__question">This will</span>
          <span className="quickadd__answers">
            {reading.effects.map((effect) => {
              const says = sayEffect(effect);
              const on = !skipped.includes(says);
              return (
                <button
                  key={says}
                  type="button"
                  className={`chip${on ? " chip--on" : ""}`}
                  aria-pressed={on}
                  onClick={() => {
                    setSkipped((current) => (on ? [...current, says] : current.filter((each) => each !== says)));
                    input.current?.focus();
                  }}
                >
                  {says}
                </button>
              );
            })}
          </span>
        </div>
      )}

      {reading && !edit && !asked && goesTo === "hobby" && reading.minutes === null && (
        <div className="quickadd__ask" role="group" aria-label="How long">
          <span className="quickadd__question">How long?</span>
          <span className="quickadd__answers">
            {LENGTHS.map((each) => (
              <button
                key={each}
                type="button"
                className={`chip${length === each ? " chip--on" : ""}`}
                aria-pressed={length === each}
                onClick={() => {
                  setLength(each);
                  input.current?.focus();
                }}
              >
                {formatDuration(each)}
              </button>
            ))}
          </span>
        </div>
      )}

      {question && (
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
  area,
  priority,
  repeat,
  until,
  occurrences,
  onArea,
}: {
  title: string;
  day: string | null;
  time: string | null;
  minutes: number | null;
  kind: string;
  area: string;
  priority: string | null;
  /** "Every Mon, Wed, Fri", when it repeats. */
  repeat: string | null;
  until: string | null;
  occurrences: number;
  onArea: () => void;
}) {
  const areaName = area in TASK_AREA_LABEL ? TASK_AREA_LABEL[area as TaskArea] : area;
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
      {/* The one part that is a button: the guess most worth correcting, and
          the one "#college" is the only other way to correct. */}
      <button
        type="button"
        className={`area area--${area} quickadd__area`}
        onClick={onArea}
        title="Not this? Click for the next area."
        aria-label={`Area: ${areaName}. Change it`}
      >
        {areaName}
        <ChevronsUpDown size={12} className="quickadd__areaIcon" aria-hidden />
      </button>
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
