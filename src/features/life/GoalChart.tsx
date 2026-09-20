import { daysBetween } from "@shared/dates";
import type { GoalDetail } from "@shared/goals";
import { formatDay } from "@/lib/format";

/**
 * A goal's line: where it has been, where it should be by now, and where it
 * is heading.
 *
 *  - **You**: a solid line through each check-in, from where the goal started.
 *  - **Pace**: dashed, straight from the start to the target on its day - the
 *    line to stay on or above.
 *  - **At this rate**: dotted on from today to when the target will be reached
 *    if it keeps moving as it has.
 *
 * The lines are SVG stretched to the box (their strokes kept thin whatever
 * the width); the dots and words are laid over it in HTML, so a dot stays
 * round, a word stays its size, and each check-in says its day and value when
 * pointed at. The whole is one picture to a screen reader, with a sentence.
 */

const format = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits: 2 });

export function GoalChart({ goal, summary }: { goal: GoalDetail; summary: string }) {
  const target = goal.target;
  if (target === null) return null;
  const pace = goal.pace;

  const points = [
    { day: goal.startedOn, value: goal.startValue, note: null as string | null, id: "start" },
    ...goal.checkins.map((checkin) => ({ day: checkin.day, value: checkin.value, note: checkin.note, id: checkin.id })),
  ];
  // Where the picture ends: the goal's day, today, or where it is heading - whichever is last, within reason.
  const heading = pace?.projectedOn ?? null;
  const lastDay = [goal.byOn, goal.today, heading && goal.byOn && heading > goal.byOn ? heading : null]
    .filter((day): day is string => !!day)
    .sort()
    .at(-1) as string;
  const span = Math.max(1, daysBetween(goal.startedOn, lastDay));

  const values = [goal.startValue, target, ...points.map((point) => point.value)];
  const low = Math.min(...values);
  const high = Math.max(...values);
  const room = (high - low || 1) * 0.08;
  const bottom = low - room;
  const top = high + room;

  const x = (day: string) => Math.max(0, Math.min(100, (daysBetween(goal.startedOn, day) / span) * 100));
  const y = (value: number) => 100 - ((value - bottom) / (top - bottom)) * 100;
  const done = goal.done || goal.reached;

  const path = points.map((point) => `${x(point.day)},${y(point.value)}`).join(" ");
  const now = points[points.length - 1] ?? points[0];

  return (
    <div className={`goalchart${done ? " goalchart--done" : ""}`} role="img" aria-label={summary}>
      <svg className="goalchart__lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
        <line className="goalchart__target" x1="0" x2="100" y1={y(target)} y2={y(target)} />
        {goal.byOn && (
          <line className="goalchart__pace" x1={x(goal.startedOn)} y1={y(goal.startValue)} x2={x(goal.byOn)} y2={y(target)} />
        )}
        {heading && !done && now && (
          <line className="goalchart__heading" x1={x(now.day)} y1={y(now.value)} x2={x(heading)} y2={y(target)} />
        )}
        <polyline className="goalchart__you" points={path} />
      </svg>

      {points.slice(1).map((point, index) => (
        <span
          key={point.id}
          className={`goalchart__dot${index === points.length - 2 ? " goalchart__dot--now" : ""}`}
          style={{ left: `${x(point.day)}%`, top: `${y(point.value)}%` }}
          title={`${formatDay(point.day)}: ${format(point.value)}${goal.unit ? ` ${goal.unit}` : ""}${point.note ? ` - ${point.note}` : ""}`}
        />
      ))}

      <span className="goalchart__label goalchart__label--target" style={{ top: `${y(target)}%` }}>
        {format(target)}
        {goal.unit ? ` ${goal.unit}` : ""}
      </span>
      {goal.byOn && (
        <span className="goalchart__label goalchart__label--by" style={{ left: `${x(goal.byOn)}%` }}>
          {formatDay(goal.byOn)}
        </span>
      )}
      <span className="goalchart__label goalchart__label--from">{formatDay(goal.startedOn)}</span>
    </div>
  );
}
