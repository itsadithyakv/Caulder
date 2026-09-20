import { useEffect, useId, useMemo, useRef, useState } from "react";
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
import { readCapture, type Ask, type CaptureKind, type Effect, type Known } from "@shared/capture";
import { thoughtBody } from "@shared/thoughts";
import { measuresOf } from "@shared/subjects";
import type { BrainSectionId } from "@shared/brain";
import { occurrencesOf } from "@shared/repeat";
import { daysBetween, minutesOf, timeNow, today as todayIn } from "@shared/dates";
import { formatDuration, formatTime } from "@/lib/format";
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
const MEMORY_SECTIONS: readonly BrainSectionId[] = ["hobbies", "studies", "ideas", "goals"];

/** What the line was asked to do, in the words it is offered in before Enter does it. */
function sayAsk(ask: Ask): string {
  switch (ask.do) {
    case "go":
      return `Go to ${ask.label}`;
    case "spend":
      return ask.amount < 0 ? `Log ${-ask.amount} back: ${ask.what}` : `Log ${ask.amount} spent: ${ask.what}`;
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
  }
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
        : `New page: ${effect.topic ?? ""}${effect.branch?.parent ? `, part of ${effect.branch.parent.title}` : ""}`;
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
      window.caulder.terms.list(companyId).then((terms) => {
        const day = todayIn(timezone);
        setTermEnd(terms.find((term) => term.fromDay <= day && day <= term.untilDay)?.untilDay ?? null);
      }, () => undefined);
    };
    read();
    window.addEventListener("focus", read);
    return () => window.removeEventListener("focus", read);
  }, [companyId, timezone]);

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

  // The clock where the workspace is, read on every keystroke: a quick-add
  // left open over lunch must not think it is still the morning.
  const today = todayIn(timezone);
  const now = minutesOf(timeNow(timezone));
  // Their own words first, so a company they also taught as something else
  // stays what they taught it as.
  const vocabulary = useMemo(() => [...words, ...companies], [words, companies]);
  const { task, questions, notes, corrections, unknown } = useMemo(
    () => parseQuick(text, { today, now, words: vocabulary, termEnd, learned }, answers),
    [text, today, now, vocabulary, termEnd, learned, answers],
  );

  // Says the key that works from any app only when one is actually held - a
  // hint naming a key another app took would send somebody looking for
  // nothing.
  const shownHint =
    hint ??
    `Type it the way you would text it — “tmrw 4pm”, “mtg w rahul nxt wk”, “fri for 2h”, “gym every mon wed fri 6am”, “not urgent”, “#college”. Press A here${
      anywhere ? `, or ${anywhere} from any app` : ""
    }.`;

  const reading = useMemo(
    () => (smart && text.trim() ? readCapture(text, known, { today, now }) : null),
    [smart, text, known, today, now],
  );
  const goesTo: CaptureKind = chosen ?? reading?.kind ?? "task";
  const asTask = goesTo === "task";
  const minutes = reading?.minutes ?? length;

  /** What a report will do, less what was switched off. */
  const doing = (reading?.effects ?? []).filter((effect) => !skipped.includes(sayEffect(effect)));

  const question = text.trim().length > 0 && asTask ? questions[0] : undefined;
  const area = (task.area ?? (personal ? "personal" : "company")) as string;
  const ready = asTask
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
   * foot of its page in the brain. With no page yet, one is started - in the
   * section the line said it belongs to, and hung off the page it is part of
   * ("Red Rising" is a book; books hang off Reading), so the map draws the
   * branch rather than a page on its own.
   */
  async function remember(
    known: { id: string; title: string } | null,
    topic: string | null,
    branch: { section: BrainSectionId; parent: { id: string; title: string } | null } | null,
    said: string,
    /** The part to read first - "PR: 45 kg × 3" - so a page of these reads down its left edge. */
    fact: string | null,
  ): Promise<string> {
    const page = known
      ? await window.caulder.brain.page(known.id)
      : await window.caulder.brain.create(homeId ?? companyId, branch?.section ?? "ideas", "page");
    // A page just started still holds its template's empty headings; a memory
    // page is its memories, so it starts with where it branches from instead.
    const before = known
      ? page.body.trimEnd()
      : branch?.parent
        ? `Part of [[${branch.parent.title}|page:${branch.parent.id}]].`
        : "";
    const title = known ? page.title : (topic ?? "Untitled");
    await window.caulder.brain.save(page.id, {
      title,
      body: `${before}${before ? "\n\n" : ""}- ${fact ? `**${fact}** · ` : ""}${said} _(${today})_\n`,
      fields: page.fields,
      secrets: {},
      baseRevision: page.revision,
    });
    return title;
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
            if (effect.do === "finish") await window.caulder.tasks.complete(effect.task.id);
            else if (effect.do === "tick") await window.caulder.habits.tick(effect.habit.id, null, true);
            else if (effect.do === "time") await window.caulder.life.logTime(effect.hobby.id, effect.minutes, effect.startsAt);
            else if (effect.do === "memory") await remember(effect.page, effect.topic, effect.branch, said, effect.fact);
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
        else if (ask.do === "spend") {
          const on = new Date(`${today}T00:00:00Z`);
          on.setUTCDate(on.getUTCDate() - ask.daysAgo);
          await window.caulder.money.addSpend(companyId, { spentOn: on.toISOString().slice(0, 10), amount: ask.amount, what: ask.what });
        } else {
          // Through the schema, which fills in everything the line did not say
          // and refuses what main would - with the schema's own sentence.
          const parsed = leadInput.safeParse({ name: ask.name, contactPerson: ask.person, phone: ask.phone, email: ask.email });
          if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "That contact will not do.");
          const lead = await window.caulder.leads.create(companyId, parsed.data);
          // To the phone too, through Google Contacts, when that is connected.
          // Its failing is not the contact failing: it is here, and can be sent again from its page.
          const sent = await window.caulder.google.saveContact(lead.id).then(() => true, () => false);
          summary = `${sayAsk(ask)}${sent ? ", and saved to Google Contacts" : ""}`;
        }
        summary ||= sayAsk(ask);
      } else if (goesTo === "memory") {
        const title = await remember(reading.page, reading.topic, reading.branch, said, reading.fact);
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
      setAdded(summary);
      setText("");
      setAnswers({});
      setChosen(null);
      setLength(null);
      setSkipped([]);
      setKept((count) => count + 1);
      onAdded?.(summary);
      input.current?.focus();
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }

  async function add() {
    if (!asTask) {
      await keep();
      return;
    }
    if (!ready || busy || task.day === null) return;
    setBusy(true);
    setError(null);
    try {
      const result = await window.caulder.tasks.quick(companyId, {
        title: task.title,
        day: task.day,
        time: task.time,
        minutes: task.minutes,
        kind: task.kind,
        area,
        priority: task.priority,
        repeat,
        leadId: reading?.contact?.id ?? null,
        notes: task.notes,
        followUp: task.followUp,
      });
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
        : `${task.title} — ${whenLabel(task.day, today)}${task.time ? ` at ${formatTime(task.time)}` : ""}${
            result.followUp ? `, and “${result.followUp.title}” ${whenLabel(result.followUp.dueOn, today).toLowerCase()}` : ""
          }`;
      setAdded(summary);
      setText("");
      setAnswers({});
      setChosen(null);
      setKept((count) => count + 1);
      onAdded?.(summary);
      input.current?.focus();
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
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
        <Sparkles size={17} className="quickadd__icon" aria-hidden />
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
          onChange={(event) => {
            setText(event.target.value);
            // An answer belongs to the line it answered. Once the line
            // changes the question may no longer exist, and a stale answer
            // would override what was just typed.
            setAnswers({});
            setChosen(null);
            setLength(null);
            setSkipped([]);
            setError(null);
          }}
          onKeyDown={(event) => {
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
          added ? (
            <span className="quickadd__added">Added: {added}</span>
          ) : (
            <span className="quickadd__hint">
              {smart
                ? `Say it the way you would text it — “mtg w rahul tmrw 4”, “went to the gym, felt good”, “red rising is a book by pierce brown”. It says what it will do first. Press A here${
                    anywhere ? `, or ${anywhere} from any app` : ""
                  }.`
                : shownHint}
            </span>
          )
        ) : !asTask && reading ? (
          <span className="quickadd__reading">
            <strong className="quickadd__title">
              {goesTo === "command" && reading.ask ? sayAsk(reading.ask) : reading.text || "…"}
            </strong>
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
                        ? [reading.ask.phone, reading.ask.email, "a new contact, and in Google Contacts when that is connected"]
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
                      ? reading.page
                        ? `remembered under ${reading.page.title}, in the brain`
                        : `a new page in the brain's ${reading.branch?.section ?? "ideas"}: ${reading.topic ?? ""}${
                            reading.branch?.parent ? `, part of ${reading.branch.parent.title}` : ""
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
            time={task.time}
            minutes={task.minutes}
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
      {text.trim().length > 0 && asTask && (task.notes || task.followUp) && (
        <div className="quickadd__more">
          {task.followUp && (
            <p className="quickadd__then">
              <span className="quickadd__thenLabel">And then</span>
              <strong>{task.followUp.title}</strong>
              <span className="quickadd__part">{whenLabel(task.followUp.day, today)}</span>
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

      {text.trim().length > 0 && asTask && notes.length > 0 && (
        <p className="quickadd__aside">
          {notes.join(" ")}
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
      {reading && (
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
                    : option === "memory" && reading.page
                      ? reading.page.title
                      : option === "command" && reading.ask
                        ? sayAsk(reading.ask)
                        : GOES_TO[option]}
              </button>
            ))}
          </span>
        </div>
      )}

      {/* A report does several things. Each is said, and each can be switched off. */}
      {reading && goesTo === "done" && reading.effects.length > 0 && (
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

      {reading && goesTo === "hobby" && reading.minutes === null && (
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
    return new Intl.DateTimeFormat(undefined, { weekday: "long" }).format(
      new Date(`${day}T00:00:00Z`),
    );
  }
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(day.slice(0, 4) === today.slice(0, 4) ? {} : { year: "numeric" }),
  }).format(new Date(`${day}T00:00:00Z`));
}
