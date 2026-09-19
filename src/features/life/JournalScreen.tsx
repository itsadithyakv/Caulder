import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Lock } from "lucide-react";
import { ENTRY_TEMPLATE, isMood, templateOf, type BrainPage, type Mood } from "@shared/brain";
import { shiftDay, today as todayIn } from "@shared/dates";
import { useWorkspace } from "@/lib/workspace";
import { ErrorLine } from "@/components/ErrorLine";
import { messageOf } from "@/lib/errors";
import { LinkedTextarea } from "@/features/brain/LinkedTextarea";
import { MoodPicker } from "./MoodPicker";
import { DayRecordCard } from "./DayRecordCard";
import { JournalCalendar } from "./JournalCalendar";

/**
 * The journal (PLAN.md, part four): a row of its own, because it is the
 * founder's and it is opened most evenings. It opens on today, ready to
 * write - no Edit, no Save: what is typed is kept a moment after the typing
 * stops, the way a notebook keeps what is written in it. How the day felt is
 * one press above it, and what Caulder saw happen that day is under it.
 *
 * An entry is a brain page underneath, so it links with [[ and is found by
 * search, but it is made only when something is written: opening the journal
 * is not writing in it.
 */

const KEEP_AFTER_MS = 900;

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
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  // What the saves read: the newest page for each day, and the day on screen.
  const latest = useRef(new Map<string, BrainPage>());
  const queue = useRef<Promise<void>>(Promise.resolve());
  const pending = useRef<{ day: string; text: string; timer: ReturnType<typeof setTimeout> } | null>(null);
  const shown = useRef(day);
  shown.current = day;

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
    if (!companyId) return;
    let live = true;
    setLoaded(false);
    setError(null);
    window.caulder.life.find(companyId, day).then(
      (found) => {
        if (!live) return;
        if (found) latest.current.set(day, found);
        setPage(found);
        setBody(found?.body ?? templateOf(ENTRY_TEMPLATE).body);
        setStatus(found ? "saved" : "idle");
        setLoaded(true);
      },
      (cause: unknown) => live && setError(messageOf(cause)),
    );
    return () => {
      live = false;
      flush();
    };
  }, [companyId, day, flush]);

  if (!companyId) return null;

  function write(text: string) {
    setBody(text);
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
              {said[status]}
            </span>
          </header>

          <MoodPicker value={mood} busy={!loaded} onPick={feel} label="How the day felt" />

          <label className="visually-hidden" htmlFor="journal-body">
            The entry
          </label>
          <LinkedTextarea
            id="journal-body"
            companyId={companyId}
            exclude={page?.id ?? ""}
            className="textarea journalentry__body"
            value={body}
            disabled={!loaded}
            onChange={write}
          />
          <p className="journalentry__private">
            <Lock size={12} aria-hidden />
            Kept on this computer only: never shared with a co-founder, never in an export for an assistant. [[ links a page
            or a contact.
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
