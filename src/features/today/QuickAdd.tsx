import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronsUpDown, CornerDownLeft, Sparkles } from "lucide-react";
import {
  TASK_AREAS,
  TASK_AREA_LABEL,
  TASK_KIND_LABEL,
  type AreaWord,
  type TaskArea,
} from "@shared/domain";
import { describeWeekdays, parseQuick, type Answers } from "@shared/quickadd";
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
 */
export function QuickAdd({
  companyId,
  timezone,
  personal,
  focusNonce = 0,
  placeholder = "Datascience assignment at 4pm today",
  hint,
  onAdded,
}: {
  companyId: string;
  timezone: string;
  /** A personal workspace fills a missing area with Personal; a company one with Company. */
  personal: boolean;
  /** Bumped from outside - the A key - to put the cursor here. */
  focusNonce?: number;
  placeholder?: string;
  /** What to say under an empty line. The capture window has no A key to mention. */
  hint?: string;
  onAdded?: (summary: string) => void;
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
  const [termEnd, setTermEnd] = useState<string | null>(null);
  /** The key that opens the quick window from any app, when one is held. */
  const [anywhere, setAnywhere] = useState<string | null>(null);

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

  // The clock where the workspace is, read on every keystroke: a quick-add
  // left open over lunch must not think it is still the morning.
  const today = todayIn(timezone);
  const now = minutesOf(timeNow(timezone));
  const { task, questions, notes } = useMemo(
    () => parseQuick(text, { today, now, words, termEnd }, answers),
    [text, today, now, words, termEnd, answers],
  );

  // Says the key that works from any app only when one is actually held - a
  // hint naming a key another app took would send somebody looking for
  // nothing.
  const shownHint =
    hint ??
    `Type it the way you would say it — “tmrw 4pm”, “fri for 2h”, “gym every mon wed fri 6am”, “not urgent”, “#college”. Press A here${
      anywhere ? `, or ${anywhere} from any app` : ""
    }.`;

  const question = text.trim().length > 0 ? questions[0] : undefined;
  const area = (task.area ?? (personal ? "personal" : "company")) as string;
  const ready = text.trim().length > 0 && questions.length === 0 && task.day !== null;
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

  async function add() {
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
      });
      const summary = repeat
        ? `${task.title} — ${describeWeekdays(repeat.weekdays)}${task.time ? ` at ${formatTime(task.time)}` : ""}, ${result.repeats} on your day`
        : `${task.title} — ${whenLabel(task.day, today)}${task.time ? ` at ${formatTime(task.time)}` : ""}`;
      setAdded(summary);
      setText("");
      setAnswers({});
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
          placeholder={placeholder}
          aria-label="Add a task in one line"
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
            setError(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              if (text.length > 0) {
                event.preventDefault();
                event.stopPropagation();
                setText("");
                setAnswers({});
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
          Add
        </button>
      </div>

      <div id={readId} className="quickadd__read" aria-live="polite">
        {text.trim().length === 0 ? (
          added ? (
            <span className="quickadd__added">Added: {added}</span>
          ) : (
            <span className="quickadd__hint">{shownHint}</span>
          )
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

      {text.trim().length > 0 && notes.length > 0 && (
        <p className="quickadd__aside">{notes.join(" ")}</p>
      )}

      {question && (
        <div className="quickadd__ask" role="group" aria-label={question.text}>
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
