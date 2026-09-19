import { useEffect, useId, useState } from "react";
import { CalendarPlus, Clock } from "lucide-react";
import type { BrainPage } from "@shared/brain";
import { describeWeekdays, type PageTime } from "@shared/life";
import { shiftDay, weekdayOf } from "@shared/dates";
import { Card } from "@/components/Card";
import { Select } from "@/components/Select";
import { ErrorLine } from "@/components/ErrorLine";
import { formatDay, formatDuration, formatTime } from "@/lib/format";
import { messageOf } from "@/lib/errors";

/**
 * Time for a page (PLAN.md, part four): a course's study hours, a hobby's
 * evenings, revision before an exam, a goal's weekly push. Set aside here, it
 * is a repeat on the Calendar tied to the page; the card says what is set
 * aside, what is next, and what the last four weeks actually got.
 */

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const LENGTHS = [30, 45, 60, 90, 120, 180];

function field(page: BrainPage, key: string): string | null {
  const value = page.fields[key];
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

/** Until when, to start with: the day before an exam, a goal's day, a term for a course, twelve weeks otherwise. */
function untilFor(page: BrainPage, today: string): string {
  const exam = page.template === "exam" ? field(page, "examOn") : null;
  if (exam && exam > today) return shiftDay(exam, -1);
  const by = page.template === "life-goal" ? field(page, "byOn") : null;
  if (by && by > today) return by;
  return shiftDay(today, page.template === "course" ? 7 * 15 : 7 * 12);
}

export function TimeCard({ page, onChanged }: { page: BrainPage; onChanged: () => void }) {
  const id = useId();
  const [time, setTime] = useState<PageTime | null>(null);
  const [adding, setAdding] = useState(false);
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [startsAt, setStartsAt] = useState("18:00");
  const [minutes, setMinutes] = useState(60);
  const [until, setUntil] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    window.caulder.life.time(page.id).then(
      (next) => live && setTime(next),
      (cause: unknown) => live && setError(messageOf(cause)),
    );
    return () => {
      live = false;
    };
  }, [page.id]);

  if (!time) return <ErrorLine>{error}</ErrorLine>;

  function start() {
    if (!time) return;
    setWeekdays([weekdayOf(time.today)]);
    setUntil(untilFor(page, time.today));
    setAdding(true);
    setError(null);
  }

  async function run(work: () => Promise<PageTime>) {
    setBusy(true);
    setError(null);
    try {
      setTime(await work());
      setAdding(false);
      onChanged();
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }

  const active = time.series.filter((series) => series.active);
  const verb = page.template === "exam" ? "Make time to revise" : "Make time for it";

  return (
    <Card
      icon={<Clock size={15} aria-hidden />}
      title="Time for it"
      actions={
        !adding && (
          <button type="button" className="btn btn--sm" onClick={start}>
            <CalendarPlus size={14} aria-hidden />
            {verb}
          </button>
        )
      }
    >
      {active.length > 0 ? (
        <ul className="timecard__list" aria-label="Time set aside">
          {active.map((series) => (
            <li key={series.id} className="timecard__row">
              <span>
                {describeWeekdays(series.weekdays)}, {formatTime(series.startsAt)} for {formatDuration(series.minutes)}, until{" "}
                {formatDay(series.untilDay)}
              </span>
              <button
                type="button"
                className="btn btn--sm btn--ghost"
                disabled={busy}
                onClick={() => void run(() => window.caulder.life.stopTime(series.id))}
              >
                Stop
              </button>
            </li>
          ))}
        </ul>
      ) : (
        !adding && <p className="card__hint">Nothing set aside. It goes on the Calendar as a repeat, and each block opens this page.</p>
      )}

      {(time.planned > 0 || time.next) && (
        <p className="timecard__facts">
          {time.next && (
            <>
              Next: {formatDay(time.next.day)} at {formatTime(time.next.startsAt)}.{" "}
            </>
          )}
          {time.planned > 0 &&
            `In the last four weeks, ${formatDuration(time.kept)} kept of ${formatDuration(time.planned)} set aside.`}
          {time.wantedWeekly !== null &&
            time.planned > 0 &&
            ` About ${formatDuration(Math.round(time.kept / 4))} a week, of ${formatDuration(time.wantedWeekly)} wanted.`}
        </p>
      )}

      {adding && (
        <form
          className="timecard__form anim-spring"
          aria-label={verb}
          onSubmit={(event) => {
            event.preventDefault();
            void run(() => window.caulder.life.makeTime(page.id, { weekdays, startsAt, minutes, until }));
          }}
        >
          <div className="chips" role="group" aria-label="Which days">
            {DAY_NAMES.map((name, index) => {
              const day = index + 1;
              const on = weekdays.includes(day);
              return (
                <button
                  key={name}
                  type="button"
                  className={`chip${on ? " chip--on" : ""}`}
                  aria-pressed={on}
                  onClick={() => setWeekdays((current) => (on ? current.filter((each) => each !== day) : [...current, day]))}
                >
                  {name}
                </button>
              );
            })}
          </div>
          <div className="timecard__fields">
            <label className="field">
              <span className="field__label">At</span>
              <input
                id={`${id}-at`}
                type="time"
                className="input"
                value={startsAt}
                required
                onChange={(event) => setStartsAt(event.target.value)}
              />
            </label>
            <div className="field">
              <label className="field__label" htmlFor={`${id}-for`}>
                For
              </label>
              <Select
                id={`${id}-for`}
                value={String(minutes)}
                onChange={(value) => setMinutes(Number(value))}
                options={LENGTHS.map((length) => ({ value: String(length), label: formatDuration(length) }))}
              />
            </div>
            <label className="field">
              <span className="field__label">Until</span>
              <input type="date" className="input" value={until} min={time.today} required onChange={(event) => setUntil(event.target.value)} />
            </label>
          </div>
          <div className="actions">
            <button type="button" className="btn btn--sm" disabled={busy} onClick={() => setAdding(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn--sm btn--primary" disabled={busy || weekdays.length === 0}>
              Put it on the Calendar
            </button>
          </div>
        </form>
      )}
      <ErrorLine>{error}</ErrorLine>
    </Card>
  );
}
