import { PrivateLines } from "./PrivateLines";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Lock } from "lucide-react";
import { ENTRY_TEMPLATE, isMood, templateOf, type BrainPage, type Mood } from "@shared/brain";
import { shiftDay, today as todayIn } from "@shared/dates";
import {
  ENTRY_PARTS,
  PART_HEADING,
  aPrompt,
  asksFor,
  hasMoreThanParts,
  splitEntry,
  tomorrowTasks,
  withPart,
  type EntryPart,
} from "@shared/entry";
import type { DayRecord, JournalLockState } from "@shared/life";
import { useWorkspace } from "@/lib/workspace";
import { ErrorLine } from "@/components/ErrorLine";
import { messageOf } from "@/lib/errors";
import { LinkedEditor } from "@/features/brain/LinkedEditor";
import type { SlashExtra } from "@/features/brain/editor/completions";
import { MoodPicker } from "./MoodPicker";
import { DayRecordCard } from "./DayRecordCard";
import { JournalCalendar } from "./JournalCalendar";
import { LockedDay, PasscodeForm, PasscodeMenu } from "./JournalLock";

/**
 * The journal (PLAN.md, part four): a row of its own, because it is the
 * founder's and it is opened most evenings. It opens on today, ready to
 * write - no Edit, no Save: what is typed is kept a moment after the typing
 * stops, the way a notebook keeps what is written in it. How the day felt is
 * one press above it, and what Caulder saw happen that day is under it.
 *
 * Two ways to write it, one switch, remembered on this computer:
 *
 *  - **Guided** asks three things, one box each - what happened, something
 *    to be glad of, tomorrow's one thing - and what each asks changes from
 *    day to day. Tab moves on. Tomorrow's lines can become tomorrow's tasks.
 *  - **Free** is the whole page at once.
 *
 * Both write the same text - `## Today`, `## Grateful for`, `## Tomorrow` -
 * so switching never loses a word (shared/entry.ts). An entry is a brain page
 * underneath, so it links with `@` and is found by search, but it is made
 * only when something is written: opening the journal is not writing in it.
 */

const KEEP_AFTER_MS = 900;
const MODE_KEY = "caulder.journal.mode";

type Mode = "guided" | "free";

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function longDay(day: string): string {
  const [year, month, date] = day.split("-").map(Number) as [number, number, number];
  const weekday = new Date(Date.UTC(year, month - 1, date)).getUTCDay();
  return `${WEEKDAYS[(weekday + 6) % 7]} ${date} ${MONTHS[month - 1]} ${year}`;
}

function storedMode(): Mode {
  try {
    return window.localStorage.getItem(MODE_KEY) === "free" ? "free" : "guided";
  } catch {
    return "guided";
  }
}

/** What each box says before anything is in it. */
const PLACEHOLDER: Record<EntryPart, string> = {
  today: "The way you would tell a friend. A line is plenty.",
  grateful: "Big or small.",
  tomorrow: "One line is enough - it can become a task.",
};

type Status = "idle" | "waiting" | "saving" | "saved" | "failed";

export function JournalScreen({
  openDay,
  onConsumeOpenDay,
  onOpenPage,
  onOpenContact,
}: {
  /** A day another screen asked for: the Calendar's, or an entry opened from search. */
  openDay: string | null;
  onConsumeOpenDay: () => void;
  onOpenPage: (pageId: string) => void;
  onOpenContact: (leadId: string) => void;
}) {
  // Yours, not the chosen company's: the journal stays put when the company changes.
  const { home } = useWorkspace();
  const companyId = home?.id ?? "";
  const today = todayIn(home?.timezone ?? "UTC");

  const [day, setDay] = useState(openDay ?? today);
  const [page, setPage] = useState<BrainPage | null>(null);
  const [body, setBody] = useState("");
  /** Guided: each part's words as typed, so a trailing space is not tidied away mid-word. */
  const [parts, setParts] = useState<Record<EntryPart, string>>({ today: "", grateful: "", tomorrow: "" });
  const [mode, setMode] = useState<Mode>(storedMode);
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  /** What Caulder saw happen on the day, for `/` - what you did today. */
  const [record, setRecord] = useState<DayRecord | null>(null);
  /** The passcode: whether there is one and whether it is open, and a form for it when one is open. */
  const [lock, setLock] = useState<JournalLockState>({ set: false, open: false });
  const [lockMode, setLockMode] = useState<"set" | "change" | "remove" | "forget" | null>(null);
  /** Bumped to read the day again: after it is unlocked, locked, or the passcode changes. */
  const [reread, setReread] = useState(0);

  // What the saves read: the newest page for each day, and the day on screen.
  const latest = useRef(new Map<string, BrainPage>());
  const queue = useRef<Promise<void>>(Promise.resolve());
  const pending = useRef<{ day: string; text: string; timer: ReturnType<typeof setTimeout> } | null>(null);
  const shown = useRef(day);
  shown.current = day;
  /** The whole entry as it now stands, for putting one part back into it. */
  const whole = useRef(body);

  useEffect(() => {
    if (!openDay) return;
    setDay(openDay);
    onConsumeOpenDay();
  }, [openDay, onConsumeOpenDay]);

  /** The entry for a day, made now if it has to be - the first word or face is what makes it. */
  const entryFor = useCallback(
    async (of: string): Promise<BrainPage> => {
      const known = latest.current.get(of) ?? (await window.caulder.life.find(companyId, of));
      return known ?? (await window.caulder.life.entry(companyId, of));
    },
    [companyId],
  );

  /** One change at a time, in order, so no save starts from a revision another is replacing. */
  const enqueue = useCallback(
    (of: string, work: (current: BrainPage) => Promise<BrainPage>) => {
      setStatus("saving");
      queue.current = queue.current
        .then(async () => {
          const made = !latest.current.has(of);
          const saved = await work(await entryFor(of));
          latest.current.set(of, saved);
          if (shown.current === of) setPage(saved);
          if (made) setVersion((n) => n + 1);
          setStatus(pending.current ? "waiting" : "saved");
          setError(null);
        })
        .catch((cause: unknown) => {
          setStatus("failed");
          setError(messageOf(cause));
        });
    },
    [entryFor],
  );

  const keep = useCallback(
    (of: string, text: string) =>
      enqueue(of, (current) =>
        window.caulder.brain.save(current.id, {
          title: current.title,
          body: text,
          fields: current.fields,
          secrets: {},
          baseRevision: current.revision,
        }),
      ),
    [enqueue],
  );

  /** What is waiting to be kept is kept now: on leaving a day, and on leaving the journal. */
  const flush = useCallback(() => {
    const waiting = pending.current;
    if (!waiting) return;
    clearTimeout(waiting.timer);
    pending.current = null;
    keep(waiting.day, waiting.text);
  }, [keep]);

  useEffect(() => {
    window.caulder.life.lockState().then(setLock, () => undefined);
  }, [reread]);

  /** Anything the passcode changed: what is on screen is read again, and nothing opened is kept. */
  const afterLock = useCallback((next: JournalLockState) => {
    setLock(next);
    setLockMode(null);
    latest.current.clear();
    setReread((n) => n + 1);
    setVersion((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!companyId) return;
    let live = true;
    setLoaded(false);
    setError(null);
    window.caulder.life.find(companyId, day).then(
      (found) => {
        if (!live) return;
        if (found) latest.current.set(day, found);
        const text = found?.body ?? templateOf(ENTRY_TEMPLATE).body;
        setPage(found);
        setBody(text);
        whole.current = text;
        setParts(splitEntry(text));
        setStatus(found ? "saved" : "idle");
        setLoaded(true);
      },
      (cause: unknown) => live && setError(messageOf(cause)),
    );
    return () => {
      live = false;
      flush();
    };
  }, [companyId, day, flush, reread]);

  useEffect(() => {
    if (!companyId) return;
    let live = true;
    window.caulder.life.day(companyId, day).then(
      (found) => live && setRecord(found),
      () => live && setRecord(null),
    );
    return () => {
      live = false;
    };
  }, [companyId, day, version]);

  /** For `/`: what you ticked off and who you rang on the day, and a question to write to. */
  const extras = useMemo((): SlashExtra[] => {
    const done = [
      ...(record?.tasksDone ?? []).map((task) => `- [x] ${task.title}`),
      ...(record?.calls ?? []).map((call) => `- [x] ${call.spoke ? "Spoke to" : "Called"} ${call.name}`),
    ];
    return [
      ...(done.length > 0
        ? [{ label: "What I did today", detail: `${done.length} from Caulder`, text: () => `${done.join("\n")}\n` }]
        : []),
      { label: "A question", detail: "Something to write to", text: () => `**${aPrompt(Date.now() / 1000)}**\n` },
    ];
  }, [record]);

  if (!companyId) return null;

  /** The whole text, written: kept a moment after the typing stops. */
  function write(text: string) {
    setBody(text);
    whole.current = text;
    if (pending.current) clearTimeout(pending.current.timer);
    const of = day;
    pending.current = {
      day: of,
      text,
      timer: setTimeout(() => {
        pending.current = null;
        keep(of, text);
      }, KEEP_AFTER_MS),
    };
    setStatus("waiting");
  }

  /** One part, written: put back in its place in the whole. */
  function writePart(part: EntryPart, text: string) {
    setParts((current) => ({ ...current, [part]: text }));
    write(withPart(whole.current, part, text));
  }

  function chooseMode(next: Mode) {
    setMode(next);
    // Guided reads the parts afresh from whatever Free wrote.
    if (next === "guided") setParts(splitEntry(whole.current));
    try {
      window.localStorage.setItem(MODE_KEY, next);
    } catch {
      // Remembered or not, the switch itself works.
    }
  }

  function feel(mood: Mood | null) {
    flush();
    enqueue(day, (current) => window.caulder.life.mood(current.id, mood));
    setVersion((n) => n + 1);
  }

  const mood = page && isMood(page.fields["mood"]) ? page.fields["mood"] : null;
  const said: Record<Status, string> = {
    idle: "Nothing written yet",
    waiting: "Writing",
    saving: "Keeping it",
    saved: "Kept",
    failed: "Not kept",
  };
  const asks = asksFor(day);
  const more = mode === "guided" && hasMoreThanParts(body);

  return (
    <div className="journalscreen">
      <div className="journalscreen__main">
        <section className="card journalentry">
          <header className="journalentry__head">
            <button type="button" className="btn btn--sm btn--ghost" aria-label="The day before" onClick={() => setDay(shiftDay(day, -1))}>
              <ChevronLeft size={16} aria-hidden />
            </button>
            <h2 className="journalentry__day">{longDay(day)}</h2>
            <button
              type="button"
              className="btn btn--sm btn--ghost"
              aria-label="The day after"
              disabled={day >= today}
              onClick={() => setDay(shiftDay(day, 1))}
            >
              <ChevronRight size={16} aria-hidden />
            </button>
            {day !== today && (
              <button type="button" className="btn btn--sm" onClick={() => setDay(today)}>
                Today
              </button>
            )}
            <span className={`journalentry__status journalentry__status--${status}`} role="status">
              {page?.locked ? "" : said[status]}
            </span>
            <div className="journalentry__modes" role="radiogroup" aria-label="How to write it">
              {(["guided", "free"] as const).map((each) => (
                <button
                  key={each}
                  type="button"
                  role="radio"
                  aria-checked={mode === each}
                  className={`journalentry__mode${mode === each ? " journalentry__mode--on" : ""}`}
                  onClick={() => chooseMode(each)}
                  title={each === "guided" ? "Three questions, a box each" : "The whole page at once"}
                >
                  {each === "guided" ? "Guided" : "Free"}
                </button>
              ))}
            </div>
            <PasscodeMenu
              state={lock}
              onPick={(pick) => (pick === "lock" ? void window.caulder.life.lockNow().then(afterLock) : setLockMode(pick))}
            />
          </header>

          {lockMode && <PasscodeForm mode={lockMode} companyId={companyId} onDone={afterLock} onCancel={() => setLockMode(null)} />}

          <MoodPicker value={mood} busy={!loaded} onPick={feel} label="How the day felt" compact />

          {page?.locked ? (
            // Its words are sealed: nothing is shown, so nothing can be saved over them.
            <LockedDay onOpened={afterLock} />
          ) : mode === "guided" ? (
            <div className="journalparts">
              {ENTRY_PARTS.map((part) => (
                <div key={part} className="journalpart">
                  <p className="journalpart__ask" aria-hidden>
                    {asks[part]}
                  </p>
                  <LinkedEditor
                    key={`${day}-${part}`}
                    label={`The entry: ${PART_HEADING[part]}`}
                    companyId={companyId}
                    exclude={page?.id ?? ""}
                    className="journalpart__editor"
                    value={parts[part]}
                    disabled={!loaded}
                    onChange={(text) => writePart(part, text)}
                    placeholder={PLACEHOLDER[part]}
                    names={page?.links}
                    onOpenLink={(ref) => (ref.kind === "contact" ? onOpenContact(ref.id) : ref.kind === "page" ? onOpenPage(ref.id) : undefined)}
                    extras={extras}
                    hint={null}
                  />
                  {part === "tomorrow" && shiftDay(day, 1) >= today && (
                    <TomorrowTasks key={day} text={parts.tomorrow} dueOn={shiftDay(day, 1)} />
                  )}
                </div>
              ))}
              {more && (
                <p className="journalparts__more">
                  This day has more written than its three parts.{" "}
                  <button type="button" className="btn btn--sm btn--ghost" onClick={() => chooseMode("free")}>
                    Show all of it
                  </button>
                </p>
              )}
            </div>
          ) : (
            <LinkedEditor
              key={day}
              label="The entry"
              companyId={companyId}
              exclude={page?.id ?? ""}
              className="journalentry__body"
              value={body}
              disabled={!loaded}
              onChange={write}
              names={page?.links}
              onOpenLink={(ref) => (ref.kind === "contact" ? onOpenContact(ref.id) : ref.kind === "page" ? onOpenPage(ref.id) : undefined)}
              extras={extras}
              hint={null}
            />
          )}
          {/* What the quick line took as private that day: read here, and only with the journal open. */}
          <PrivateLines companyId={companyId} day={day} version={lock.open ? 1 : 0} />
          <p className="journalentry__private">
            <Lock size={12} aria-hidden />
            Kept on this computer only: never shared with a co-founder, never in an export for an assistant.
            {lock.set ? " Days that are over are locked with your passcode." : " A passcode can lock the days that are over."}
          </p>
          <p className="liveedit__hint">
            <kbd>@</kbd> links a page or contact · <kbd>/</kbd> for lists, steps and what you did today · select words to
            format them{mode === "guided" ? <> · <kbd>Tab</kbd> moves on</> : null}
          </p>
          <ErrorLine>{error}</ErrorLine>
        </section>

        <DayRecordCard companyId={companyId} day={day} onOpenPage={onOpenPage} onOpenContact={onOpenContact} />
      </div>

      <aside className="journalscreen__side">
        <JournalCalendar companyId={companyId} selected={day} version={version} onPick={(next) => setDay(next)} />
      </aside>
    </div>
  );
}

/**
 * Tomorrow's lines, as tomorrow's tasks, in the company chosen - one press, and
 * the button says when it is done. Each line once: a line already made into a
 * task is not offered again while the day is open.
 */
function TomorrowTasks({ text, dueOn }: { text: string; dueOn: string }) {
  const { activeCompany } = useWorkspace();
  const [made, setMade] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lines = tomorrowTasks(text);
  const left = lines.filter((line) => !made.includes(line));
  if (!activeCompany || lines.length === 0) return null;

  async function make() {
    if (!activeCompany) return;
    setBusy(true);
    setError(null);
    try {
      for (const title of left) {
        await window.caulder.tasks.create(activeCompany.id, {
          title,
          kind: "todo",
          area: null,
          dueOn,
          priority: null,
          leadId: null,
          notes: null,
        });
        setMade((current) => [...current, title]);
      }
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="journalpart__tasks">
      {left.length === 0 ? (
        <span className="journalpart__made" role="status">
          <Check size={14} aria-hidden />
          On tomorrow's list, in {activeCompany.name}
        </span>
      ) : (
        <button type="button" className="btn btn--sm" onClick={() => void make()} disabled={busy}>
          {left.length === 1 ? "Make it tomorrow's task" : `Make these ${left.length} tomorrow's tasks`}
        </button>
      )}
      <ErrorLine>{error}</ErrorLine>
    </div>
  );
}
