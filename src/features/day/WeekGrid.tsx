import { useEffect, useRef, useState } from "react";
import type { LaidOutBlock, WeekPlan } from "@shared/domain";
import { themeOn, type DayTheme } from "@shared/goals";
import { minutesOf, timeOf } from "@shared/dates";
import { formatDuration, formatTime } from "@/lib/format";
import { HOUR_PX, PER_MINUTE, hourWindow, snapTo } from "./grid";

/**
 * Seven days at once.
 *
 * The day grid answers "does this afternoon fit". This answers the question
 * you cannot ask it at all: **where is the space.** A student founder looking
 * for two hours to write a proposal is looking across the week, and finding
 * them by pressing the next-day arrow six times is not finding them.
 *
 * Two decisions worth stating.
 *
 * **Overlap is worked out per day, never across the week.** Tuesday at nine
 * and Wednesday at nine are not competing for anything, and a layout that
 * treated them as a clash would halve the width of both for no reason.
 *
 * **A drag can cross a column**, which is the whole reason this view earns
 * its keep — moving Thursday's gym to Friday is one gesture rather than a
 * form and two dates. Resizing is not offered here: the columns are a seventh
 * of the width and an eight-pixel grip in one is a promise the mouse cannot
 * keep. That stays on the day.
 */

type Drag = {
  id: string;
  /** Which column it started in, so a vertical drag does not change the day. */
  originIndex: number;
  originStart: number;
  startY: number;
  /** What the pointer is proposing. */
  index: number;
  start: number;
  minutes: number;
};

export function WeekGrid({
  week,
  today,
  themes,
  onOpenDay,
  onAdd,
  onEdit,
  onMove,
}: {
  week: WeekPlan;
  today: string;
  /** Your week's theme days, to head each day with what it is for. */
  themes?: readonly DayTheme[];
  onOpenDay: (day: string) => void;
  onAdd: (day: string, startsAt: string) => void;
  onEdit: (block: LaidOutBlock) => void;
  onMove: (id: string, where: { day: string; startsAt: string; minutes: number }) => void;
}) {
  const [drag, setDrag] = useState<Drag | null>(null);
  const lanesRef = useRef<HTMLDivElement>(null);

  const hours = hourWindow(week.days.flatMap((entry) => entry.blocks));
  const firstHour = hours[0] ?? 0;
  const top = (minutes: number) => (minutes - firstHour * 60) * PER_MINUTE;

  // The pointer is followed on the window rather than on the block, for the
  // reason the day grid already documents: a fast drag leaves the element
  // behind, and the gesture would end the moment the cursor overtook it.
  useEffect(() => {
    if (!drag) return;

    const move = (event: PointerEvent) => {
      const box = lanesRef.current?.getBoundingClientRect();
      if (!box) return;
      const columnWidth = box.width / 7;

      setDrag((current) => {
        if (!current) return current;
        const delta = (event.clientY - current.startY) / PER_MINUTE;
        const start = Math.max(
          0,
          Math.min(24 * 60 - current.minutes, snapTo(current.originStart + delta)),
        );
        // Which column the pointer is over, clamped: dragging off the left of
        // Monday means Monday, not last week.
        const index = Math.max(
          0,
          Math.min(6, Math.floor((event.clientX - box.left) / columnWidth)),
        );
        return { ...current, start, index };
      });
    };

    const up = () => {
      setDrag((current) => {
        if (!current) return null;
        const moved =
          current.start !== current.originStart || current.index !== current.originIndex;
        const to = week.days[current.index]?.day;
        if (moved && to) {
          onMove(current.id, {
            day: to,
            startsAt: timeOf(current.start),
            minutes: current.minutes,
          });
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
  }, [drag, onMove, week.days]);

  return (
    <div className="week">
      <div className="week__head">
        <span className="week__corner" aria-hidden />
        {/* The seven share one track, divided the same way the lanes below are.
            Laying the headings out as seven grid columns of their own put them
            a few pixels off the columns they name, which on a calendar reads
            as the whole thing being slightly broken. */}
        <div className="week__days">
        {week.days.map((entry) => (
          <button
            key={entry.day}
            type="button"
            className={`week__day${entry.day === today ? " week__day--now" : ""}`}
            onClick={() => onOpenDay(entry.day)}
            title="Open this day on its own"
          >
            <span className="week__name">{weekdayName(entry.day)}</span>
            <span className="week__date">{dayNumber(entry.day)}</span>
            <span className="week__planned">
              {entry.planned === 0 ? "nothing" : formatDuration(entry.planned)}
            </span>
            {themes && themeOn(themes, entry.day) && (
              <span className="week__theme">{themeOn(themes, entry.day)?.label}</span>
            )}
            {/* Filings and notice dates on the heading, not in the lane: they
                have a day but no hour. */}
            {entry.deadlines.length > 0 && (
              <span
                className={`week__due${entry.deadlines.every((deadline) => deadline.doneOn) ? " week__due--done" : ""}`}
                title={entry.deadlines.map((deadline) => deadline.title).join(", ")}
              >
                {entry.deadlines.length === 1 ? entry.deadlines[0]?.title : `${entry.deadlines.length} deadlines`}
              </span>
            )}
          </button>
        ))}
        </div>
      </div>

      <div className="week__body">
        <div className="grid__hours">
          {hours.map((hour) => (
            <div key={hour} className="grid__hour" style={{ height: HOUR_PX }}>
              <span className="grid__label">{formatTime(timeOf(hour * 60))}</span>
            </div>
          ))}
        </div>

        <div className="week__lanes" ref={lanesRef} style={{ height: hours.length * HOUR_PX }}>
          {hours.map((hour) => (
            <div
              key={hour}
              className="grid__line"
              style={{ top: (hour - firstHour) * HOUR_PX }}
              aria-hidden
            />
          ))}

          {week.days.map((entry, index) => (
            <div
              key={entry.day}
              className={`week__lane${entry.day === today ? " week__lane--now" : ""}`}
              style={{ left: `${(index / 7) * 100}%`, width: `${(1 / 7) * 100}%` }}
              onClick={(event) => {
                if (event.target !== event.currentTarget) return;
                const box = event.currentTarget.getBoundingClientRect();
                const minutes = snapTo((event.clientY - box.top) / PER_MINUTE + firstHour * 60);
                onAdd(entry.day, timeOf(Math.max(0, Math.min(23 * 60 + 45, minutes))));
              }}
            >
              {entry.blocks.map((block) => {
                // A block being dragged is drawn wherever the pointer is, in
                // whichever lane that turns out to be, so it leaves this one.
                if (drag?.id === block.id && drag.index !== index) return null;
                const live = drag?.id === block.id ? drag : null;
                const start = live ? live.start : minutesOf(block.startsAt);

                return (
                  <Piece
                    key={block.id}
                    block={block}
                    top={top(start)}
                    start={start}
                    dragging={live !== null}
                    onStart={(event) =>
                      setDrag({
                        id: block.id,
                        originIndex: index,
                        originStart: minutesOf(block.startsAt),
                        startY: event.clientY,
                        index,
                        start: minutesOf(block.startsAt),
                        minutes: block.minutes,
                      })
                    }
                    onOpen={() => onEdit(block)}
                  />
                );
              })}

              {/* The block being dragged, once the pointer has carried it into
                  a lane it did not start in. */}
              {drag && drag.index === index && drag.originIndex !== index && (
                <DraggedInto week={week} drag={drag} top={top(drag.start)} />
              )}
            </div>
          ))}

          {week.days.every((entry) => entry.blocks.length === 0) && (
            <p className="grid__empty">
              Nothing planned this week. Click an hour in any day to put something in it.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/** One block on the week grid. */
function Piece({
  block,
  top,
  start,
  dragging,
  onStart,
  onOpen,
}: {
  block: LaidOutBlock;
  top: number;
  start: number;
  dragging: boolean;
  onStart: (event: React.PointerEvent) => void;
  onOpen: () => void;
}) {
  return (
    <div
      className={`block block--week block--${block.kind ?? "unsorted"}${
        block.minutes * PER_MINUTE < 34 ? " block--short" : ""
      }${
        dragging ? " block--dragging" : ""
      }${block.outcome === "skipped" ? " block--skipped" : ""}`}
      style={{
        top,
        height: Math.max(16, block.minutes * PER_MINUTE - 2),
        left: `${(block.column / block.columns) * 100}%`,
        width: `${(1 / block.columns) * 100}%`,
      }}
      onPointerDown={onStart}
      onDoubleClick={onOpen}
    >
      <span className="block__time">{formatTime(timeOf(start))}</span>
      <span className="block__title">{block.title}</span>
    </div>
  );
}

/** The block redrawn in the lane the pointer has taken it to. */
function DraggedInto({ week, drag, top }: { week: WeekPlan; drag: Drag; top: number }) {
  const block = week.days.flatMap((entry) => entry.blocks).find((entry) => entry.id === drag.id);
  if (!block) return null;

  return (
    <div
      className={`block block--week block--dragging block--${block.kind ?? "unsorted"}`}
      style={{ top, height: Math.max(16, drag.minutes * PER_MINUTE - 2), left: 0, width: "100%" }}
    >
      <span className="block__time">{formatTime(timeOf(drag.start))}</span>
      <span className="block__title">{block.title}</span>
    </div>
  );
}

const weekdayFormat = new Intl.DateTimeFormat(undefined, { weekday: "short" });
const dateFormat = new Intl.DateTimeFormat(undefined, { day: "numeric" });

function weekdayName(day: string): string {
  return weekdayFormat.format(new Date(`${day}T00:00:00Z`));
}

function dayNumber(day: string): string {
  return dateFormat.format(new Date(`${day}T00:00:00Z`));
}
