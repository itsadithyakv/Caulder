import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import type { DayPlan, LaidOutBlock, Task, WeekPlan } from "@shared/domain";
import { BLOCK_KINDS, BLOCK_KIND_LABEL, type BlockKind } from "@shared/domain";
import { clashesIn } from "@shared/priority";
import { minutesOf, shiftDay, startOfWeek, timeOf, today as todayIn } from "@shared/dates";
import { useWorkspace } from "@/lib/workspace";
import { formatDuration, formatTime } from "@/lib/format";
import { BlockForm } from "./BlockForm";
import { Timetable } from "./Timetable";
import { WeekGrid } from "./WeekGrid";
import { HOUR_PX, PER_MINUTE, SNAP, hourWindow, snapTo } from "./grid";
import { messageOf } from "@/lib/errors";
import { ErrorLine } from "@/components/ErrorLine";

/**
 * The day, as hours you can see.
 *
 * A list of things to do says what is outstanding. It does not say whether it
 * fits. Nine tasks and four hours is the ordinary reason a day goes wrong, and
 * it is invisible in every list and obvious in a grid.
 *
 * The whole plan is re-read after every change rather than patched, for the
 * same reason Today is: moving one block changes the width and position of
 * blocks nobody touched, and a screen that recomputes that itself is a screen
 * that will eventually disagree with the database.
 */

type Drag = {
  id: string;
  mode: "move" | "resize";
  startY: number;
  originStart: number;
  originMinutes: number;
  /** What the pointer is currently proposing, so the block can follow it. */
  start: number;
  minutes: number;
};

export function DayScreen() {
  const { activeCompany } = useWorkspace();
  const companyId = activeCompany?.id ?? null;
  const timezone = activeCompany?.timezone ?? "UTC";

  const [day, setDay] = useState(() => todayIn(timezone));
  const [plan, setPlan] = useState<DayPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<LaidOutBlock | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  /** The task a new block is being set aside for, when it is for one. */
  const [forTask, setForTask] = useState<Task | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [timetable, setTimetable] = useState(false);
  // The day is the default because it is the one you work in. The week is
  // what you open to find room in, which is a thing you do once a week.
  const [view, setView] = useState<"day" | "week">("day");
  const [week, setWeek] = useState<WeekPlan | null>(null);

  const gridRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (!companyId) return;
    try {
      setPlan(await window.caulder.day.get(companyId, day));
      // Only when it is being looked at. The week is seven days of rows to
      // answer a question nobody asked while the day view is open.
      if (view === "week") setWeek(await window.caulder.day.week(companyId, day));
    } catch (cause) {
      setError(messageOf(cause));
    }
  }, [companyId, day, view]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Every mutation goes through here, so the day is never patched by hand. */
  const act = useCallback(
    async (work: () => Promise<DayPlan>) => {
      setError(null);
      try {
        setPlan(await work());
        // Every write answers with one day. The week has to be re-read rather
        // than patched, for the reason the day itself is: moving one block
        // changes the width and position of blocks nobody touched.
        if (view === "week" && companyId) {
          setWeek(await window.caulder.day.week(companyId, day));
        }
      } catch (cause) {
        setError(messageOf(cause));
        void load();
      }
    },
    [load, view, companyId, day],
  );

  // The pointer is followed on the window rather than the block: a fast drag
  // leaves the element behind, and listening on the block itself would drop
  // the gesture the moment the cursor overtook it.
  useEffect(() => {
    if (!drag) return;

    const move = (event: PointerEvent) => {
      const delta = (event.clientY - drag.startY) / PER_MINUTE;
      setDrag((current) => {
        if (!current) return current;
        if (current.mode === "move") {
          const start = Math.max(
            0,
            Math.min(24 * 60 - current.minutes, snapTo(current.originStart + delta)),
          );
          return { ...current, start };
        }
        const minutes = Math.max(
          SNAP,
          Math.min(24 * 60 - current.originStart, snapTo(current.originMinutes + delta)),
        );
        return { ...current, minutes };
      });
    };

    const up = () => {
      setDrag((current) => {
        if (
          current &&
          (current.start !== current.originStart || current.minutes !== current.originMinutes)
        ) {
          void act(() =>
            window.caulder.day.moveBlock(current.id, {
              day,
              startsAt: timeOf(current.start),
              minutes: current.minutes,
            }),
          );
        }
        return null;
      });
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [drag, act, day]);

  if (!companyId) return null;
  // A failed first load used to return nothing at all - the error was stored
  // and never shown, which reads as the app having frozen.
  if (!plan) return error ? <ErrorLine>{error}</ErrorLine> : null;

  const blocks = plan.blocks;
  const currentDay = todayIn(timezone);
  // What each block is up against. A block that loses to something is dimmed;
  // one that ties is marked and left alone, because that is a decision only
  // the person can make.
  const clashes = clashesIn(blocks);

  const hours = hourWindow(blocks);
  const firstHour = hours[0] ?? 0;
  const top = (minutes: number) => (minutes - firstHour * 60) * PER_MINUTE;

  /** Clicking empty grid opens the form at the time you clicked. */
  const addAt = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    const box = gridRef.current?.getBoundingClientRect();
    if (!box) return;
    const minutes = snapTo((event.clientY - box.top) / PER_MINUTE + firstHour * 60);
    setAdding(timeOf(Math.max(0, Math.min(23 * 60 + 45, minutes))));
  };

  return (
    <div className="day">
      <ErrorLine>{error}</ErrorLine>

      <header className="day__head">
        <div className="day__when">
          <button
            type="button"
            className="btn btn--sm btn--ghost"
            onClick={() => setDay(shiftDay(day, view === "week" ? -7 : -1))}
            aria-label={view === "week" ? "The week before" : "The day before"}
          >
            <ChevronLeft size={16} aria-hidden />
          </button>
          <h2 className="day__date">
            {view === "week" ? spanOf(startOfWeek(day)) : longDay(day)}
          </h2>
          <button
            type="button"
            className="btn btn--sm btn--ghost"
            onClick={() => setDay(shiftDay(day, view === "week" ? 7 : 1))}
            aria-label={view === "week" ? "The week after" : "The day after"}
          >
            <ChevronRight size={16} aria-hidden />
          </button>
          {(view === "week" ? startOfWeek(day) !== startOfWeek(currentDay) : day !== currentDay) && (
            <button type="button" className="btn btn--sm" onClick={() => setDay(currentDay)}>
              {view === "week" ? "This week" : "Today"}
            </button>
          )}

          {/* Two readings of one plan, so it is a pair of tabs rather than a
              screen of its own in the sidebar. */}
          <div className="tabs" role="group" aria-label="How much to show">
            {(["day", "week"] as const).map((option) => (
              <button
                key={option}
                type="button"
                className="tab"
                aria-pressed={view === option}
                onClick={() => setView(option)}
              >
                {option === "day" ? "Day" : "Week"}
              </button>
            ))}
          </div>
        </div>

        <div className="day__totals">
          <span className="day__total">
            <strong>
              {formatDuration(
                view === "week"
                  ? (week?.days.reduce((total, entry) => total + entry.planned, 0) ?? 0)
                  : plan.planned,
              )}
            </strong>{" "}
            planned
          </span>
          {view === "day" && plan.planned > 0 && (
            <span className="day__total day__total--muted">
              {formatDuration(plan.elapsed)} gone
            </span>
          )}
          <button type="button" className="btn btn--sm" onClick={() => setTimetable(true)}>
            Timetable
          </button>
          <button type="button" className="btn btn--sm btn--primary" onClick={() => setAdding("09:00")}>
            <Plus size={15} aria-hidden />
            Add a block
          </button>
        </div>
      </header>

      {view === "week" ? (
        week && (
          <WeekGrid
            week={week}
            today={currentDay}
            onOpenDay={(chosen) => {
              setDay(chosen);
              setView("day");
            }}
            onAdd={(chosen, at) => {
              // The form writes to whichever day it was opened on, so picking
              // Thursday at two in the week means Thursday at two.
              setDay(chosen);
              setAdding(at);
            }}
            onEdit={(block) => {
              setDay(block.day);
              setEditing(block);
            }}
            onMove={(id, where) => {
              void act(() => window.caulder.day.moveBlock(id, where));
            }}
          />
        )
      ) : (
      <div className="day__body">
        <div className="grid">
          <div className="grid__hours">
            {hours.map((hour) => (
              <div key={hour} className="grid__hour" style={{ height: HOUR_PX }}>
                <span className="grid__label">{formatTime(timeOf(hour * 60))}</span>
              </div>
            ))}
          </div>

          <div
            className="grid__lanes"
            ref={gridRef}
            style={{ height: hours.length * HOUR_PX }}
            onClick={addAt}
          >
            {hours.map((hour) => (
              <div
                key={hour}
                className="grid__line"
                style={{ top: (hour - firstHour) * HOUR_PX }}
                aria-hidden
              />
            ))}

            {day === currentDay && <NowLine firstHour={firstHour} timezone={timezone} />}

            {blocks.map((block) => {
              const live = drag?.id === block.id ? drag : null;
              const start = live ? live.start : minutesOf(block.startsAt);
              const minutes = live ? live.minutes : block.minutes;

              return (
                <div
                  key={block.id}
                  className={`block block--${block.kind ?? "unsorted"}${
                    minutes * PER_MINUTE < 44 ? " block--short" : ""
                  }${
                    live ? " block--dragging" : ""
                  }${(clashes.get(block.id)?.losesTo.length ?? 0) > 0 ? " block--yields" : ""}${
                    (clashes.get(block.id)?.tiesWith.length ?? 0) > 0 ? " block--ties" : ""
                  }${block.outcome === "skipped" ? " block--skipped" : ""}`}
                  style={{
                    top: top(start),
                    height: Math.max(18, minutes * PER_MINUTE - 2),
                    left: `${(block.column / block.columns) * 100}%`,
                    width: `${(1 / block.columns) * 100}%`,
                  }}
                  onPointerDown={(event) => {
                    if ((event.target as HTMLElement).dataset["grip"]) return;
                    setDrag({
                      id: block.id,
                      mode: "move",
                      startY: event.clientY,
                      originStart: minutesOf(block.startsAt),
                      originMinutes: block.minutes,
                      start: minutesOf(block.startsAt),
                      minutes: block.minutes,
                    });
                  }}
                  onDoubleClick={() => setEditing(block)}
                >
                  <span className="block__time">
                    {formatTime(timeOf(start))} &middot; {formatDuration(minutes)}
                  </span>
                  <span className="block__title">{block.title}</span>
                  {block.taskTitle && <span className="block__task">{block.taskTitle}</span>}
                  {(clashes.get(block.id)?.tiesWith.length ?? 0) > 0 && (
                    <span className="block__note">Clashes</span>
                  )}
                  {block.outcome === "skipped" && (
                    <span className="block__note">Did not happen</span>
                  )}

                  <button
                    type="button"
                    className="block__grip"
                    data-grip="1"
                    aria-label={`Change how long ${block.title} is`}
                    onPointerDown={(event) => {
                      event.stopPropagation();
                      setDrag({
                        id: block.id,
                        mode: "resize",
                        startY: event.clientY,
                        originStart: minutesOf(block.startsAt),
                        originMinutes: block.minutes,
                        start: minutesOf(block.startsAt),
                        minutes: block.minutes,
                      });
                    }}
                  />
                </div>
              );
            })}

            {blocks.length === 0 && (
              <p className="grid__empty">
                Nothing planned. Click an hour to put something in it.
              </p>
            )}
          </div>
        </div>

        <aside className="day__side">
          <section className="card">
            <h2 className="card__title">Due today</h2>
            {plan.tasks.length === 0 ? (
              <p className="card__hint">Nothing is due. The day is yours to spend.</p>
            ) : (
              <ul className="daytasks">
                {plan.tasks.map((task) => (
                  <li key={task.id} className="daytask">
                    <span className="daytask__title">{task.title}</span>
                    <button
                      type="button"
                      className="btn btn--sm btn--ghost"
                      // The point of the link, and it has to carry the task
                      // through: an hour set aside for a SPECIFIC piece of
                      // work. Opening an empty form here would leave the two
                      // lists as unconnected as they were before.
                      onClick={() => {
                        setForTask(task);
                        setAdding(nextFreeHour(blocks));
                      }}
                      title="Give it an hour"
                    >
                      Plan it
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card">
            <h2 className="card__title">How the day went</h2>
            {plan.spent.length === 0 ? (
              <p className="card__hint">
                Nothing to break down yet. Blocks are grouped by what kind of work they are.
              </p>
            ) : (
              <ul className="spent">
                {plan.spent.map((entry) => (
                  <li key={entry.kind} className="spent__row">
                    <span className={`spent__dot spent__dot--${entry.kind}`} aria-hidden />
                    <span className="spent__label">{labelOf(entry.kind)}</span>
                    <span className="spent__value">{formatDuration(entry.minutes)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {plan.notes.length > 0 && (
            <section className="card">
              <h2 className="card__title">Caught today</h2>
              <ul className="daynotes">
                {plan.notes.slice(0, 6).map((note) => (
                  <li key={note.id} className="daynote">
                    {note.body}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </div>
      )}

      {timetable && (
        <Timetable
          day={day}
          onClose={() => setTimetable(false)}
          onApply={async (rows, term) => {
            // The term first, so the timetable it names exists before the
            // blocks that belong to it.
            await window.caulder.terms.create(companyId, term);
            for (const row of rows) {
              await window.caulder.day.createBlock(companyId, row.input);
            }
            setTimetable(false);
            await load();
          }}
        />
      )}

      {(adding !== null || editing) && (
        <BlockForm
          day={day}
          startsAt={adding ?? editing?.startsAt ?? "09:00"}
          block={editing}
          tasks={plan.tasks}
          workspaceLead={activeCompany?.remindMinutes ?? null}
          forTask={forTask}
          onClose={() => {
            setAdding(null);
            setEditing(null);
            setForTask(null);
          }}
          onSave={async (input) => {
            await act(() =>
              editing
                ? window.caulder.day.updateBlock(editing.id, input)
                : window.caulder.day.createBlock(companyId, input),
            );
            setAdding(null);
            setEditing(null);
            setForTask(null);
          }}
          onSkip={
            editing && editing.day <= currentDay
              ? async () => {
                  await act(() =>
                    window.caulder.day.setOutcome(
                      editing.id,
                      editing.outcome === "skipped" ? null : "skipped",
                      companyId,
                      day,
                    ),
                  );
                  setEditing(null);
                }
              : undefined
          }
          onDelete={
            editing
              ? async () => {
                  await act(() => window.caulder.day.deleteBlock(editing.id, companyId, day));
                  setEditing(null);
                }
              : undefined
          }
          {...(editing?.seriesId
            ? {
                onEndSeries: async () => {
                  await act(() =>
                    window.caulder.day.endSeries(editing.seriesId!, companyId, day),
                  );
                  setEditing(null);
                },
              }
            : {})}
        />
      )}
    </div>
  );
}

/** Where now is, on a day that is today. */
function NowLine({ firstHour, timezone }: { firstHour: number; timezone: string }) {
  const [minutes, setMinutes] = useState(() => nowMinutes(timezone));

  useEffect(() => {
    const timer = setInterval(() => setMinutes(nowMinutes(timezone)), 60_000);
    return () => clearInterval(timer);
  }, [timezone]);

  return (
    <div
      className="grid__now"
      style={{ top: (minutes - firstHour * 60) * PER_MINUTE }}
      aria-hidden
    />
  );
}

function nowMinutes(timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: timezone,
  }).format(new Date());
  return minutesOf(parts);
}

function labelOf(kind: string): string {
  const known = (BLOCK_KINDS as readonly string[]).includes(kind);
  return known ? BLOCK_KIND_LABEL[kind as BlockKind] : "Unsorted";
}

/** The first whole hour after everything already planned. */
function nextFreeHour(blocks: readonly LaidOutBlock[]): string {
  if (blocks.length === 0) return "09:00";
  const end = Math.max(
    ...blocks.map((block) => minutesOf(block.startsAt) + block.minutes),
  );
  return timeOf(Math.ceil(end / 60) * 60);
}

const longFormat = new Intl.DateTimeFormat(undefined, {
  weekday: "long",
  day: "numeric",
  month: "long",
});

function longDay(day: string): string {
  return longFormat.format(new Date(`${day}T00:00:00Z`));
}

const shortFormat = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" });

/** "7 Sep – 13 Sep", the week named by what it contains. */
function spanOf(from: string): string {
  const to = shiftDay(from, 6);
  return `${shortFormat.format(new Date(`${from}T00:00:00Z`))} – ${shortFormat.format(
    new Date(`${to}T00:00:00Z`),
  )}`;
}
