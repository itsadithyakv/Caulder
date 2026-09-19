import { useEffect, useId, useRef, useState } from "react";
import type { MetricPoint } from "@shared/metrics";

const monthFormat = new Intl.DateTimeFormat(undefined, { month: "short", year: "numeric" });

/** "2026-08" as "Aug 2026". */
export function monthLabel(month: string): string {
  const [year, number] = month.split("-").map(Number);
  return monthFormat.format(new Date(year ?? 1970, (number ?? 1) - 1, 1));
}

/**
 * A year of one metric, as a small chart.
 *
 * One series, so no legend: the card's name says what it is. A flow - money
 * in, calls made - is columns, one a month, the months gone in the muted ink
 * and this one in the accent, because this one is still being counted. A
 * level - the bank balance, a reading - is a 2px line with the latest reading
 * as a dot. Hover or arrow keys read out a month; the table under it carries
 * every value for a screen reader, so nothing is only in the picture.
 */
export function MetricChart({
  history,
  flow,
  format,
  label,
  large = false,
}: {
  history: readonly MetricPoint[];
  flow: boolean;
  format: (value: number) => string;
  /** What the chart is of, for the accessible name. */
  label: string;
  large?: boolean;
}) {
  const id = useId();
  const [active, setActive] = useState<number | null>(null);
  // Drawn at the size it is shown, so a 24px column and a 4px dot are 24 and 4 pixels.
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(320);
  useEffect(() => {
    const element = box.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.max(120, Math.round(entry.contentRect.width)));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const height = large ? 150 : 64;
  const axis = large ? 18 : 0;
  const plot = height - axis;
  const slot = width / history.length;

  const values = history.map((point) => point.value).filter((value): value is number => value !== null);
  const top = Math.max(0, ...values);
  const bottom = Math.min(0, ...values);
  const span = top - bottom || 1;
  // A little headroom, so the tallest column does not touch the edge.
  const y = (value: number) => 4 + ((top - value) / span) * (plot - 8);
  const baseline = y(0);

  const known = history
    .map((point, index) => ({ index, value: point.value }))
    .filter((point): point is { index: number; value: number } => point.value !== null);
  const lastKnown = known.at(-1) ?? null;

  const bars = flow
    ? history.map((point, index) => {
        const value = point.value ?? 0;
        const barWidth = Math.min(24, slot * 0.62);
        const x = index * slot + (slot - barWidth) / 2;
        const from = y(value);
        const tall = Math.max(Math.abs(baseline - from), value === 0 ? 0 : 1.5);
        const up = value >= 0;
        const r = Math.min(4, tall, barWidth / 2);
        const top0 = up ? baseline - tall : baseline;
        // Rounded at the data end, square on the baseline.
        const d = up
          ? `M${x},${baseline} V${top0 + r} Q${x},${top0} ${x + r},${top0} H${x + barWidth - r} Q${x + barWidth},${top0} ${x + barWidth},${top0 + r} V${baseline} Z`
          : `M${x},${baseline} V${baseline + tall - r} Q${x},${baseline + tall} ${x + r},${baseline + tall} H${x + barWidth - r} Q${x + barWidth},${baseline + tall} ${x + barWidth},${baseline + tall - r} V${baseline} Z`;
        return (
          <path
            key={point.month}
            d={d}
            className={`metricchart__bar${index === history.length - 1 ? " metricchart__bar--now" : ""}${
              active === index ? " metricchart__bar--active" : ""
            }`}
          />
        );
      })
    : null;

  // Segments between months that have a reading; a month without one breaks the line.
  const segments: string[] = [];
  if (!flow) {
    let run: string[] = [];
    history.forEach((point, index) => {
      if (point.value === null) {
        if (run.length > 1) segments.push(run.join(" "));
        run = [];
        return;
      }
      run.push(`${run.length === 0 ? "M" : "L"}${index * slot + slot / 2},${y(point.value)}`);
    });
    if (run.length > 1) segments.push(run.join(" "));
  }

  const shown = active !== null ? history[active] : null;
  const pick = (clientX: number, element: SVGSVGElement) => {
    const box = element.getBoundingClientRect();
    const index = Math.floor(((clientX - box.left) / box.width) * history.length);
    setActive(Math.max(0, Math.min(history.length - 1, index)));
  };

  const best = known.reduce<{ index: number; value: number } | null>(
    (most, point) => (most === null || point.value > most.value ? point : most),
    null,
  );
  const summary =
    known.length === 0
      ? `${label}: nothing yet in the last ${history.length} months.`
      : `${label} over the last ${history.length} months${
          best ? `; highest ${format(best.value)} in ${monthLabel(history[best.index]?.month ?? "")}` : ""
        }.`;

  return (
    <div className={`metricchart${large ? " metricchart--large" : ""}`} ref={box}>
      <svg
        className="metricchart__svg"
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={summary}
        aria-describedby={`${id}-table`}
        tabIndex={0}
        onPointerMove={(event) => pick(event.clientX, event.currentTarget)}
        onPointerLeave={() => setActive(null)}
        onFocus={() => setActive(history.length - 1)}
        onBlur={() => setActive(null)}
        onKeyDown={(event) => {
          if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
          event.preventDefault();
          setActive((current) => {
            const at = current ?? history.length - 1;
            return Math.max(0, Math.min(history.length - 1, at + (event.key === "ArrowLeft" ? -1 : 1)));
          });
        }}
      >
        {bottom < 0 && <line className="metricchart__zero" x1={0} x2={width} y1={baseline} y2={baseline} />}
        {active !== null && (
          <line
            className="metricchart__cross"
            x1={active * slot + slot / 2}
            x2={active * slot + slot / 2}
            y1={0}
            y2={plot}
          />
        )}
        {bars}
        {segments.map((d) => (
          <path key={d} d={d} className="metricchart__line" />
        ))}
        {!flow && lastKnown && (
          <circle
            className="metricchart__dot"
            cx={lastKnown.index * slot + slot / 2}
            cy={y(lastKnown.value)}
            r={4}
          />
        )}
        {!flow && active !== null && history[active]?.value != null && active !== lastKnown?.index && (
          <circle
            className="metricchart__dot metricchart__dot--hover"
            cx={active * slot + slot / 2}
            cy={y(history[active]?.value ?? 0)}
            r={4}
          />
        )}
        {large &&
          history.map((point, index) =>
            (history.length - 1 - index) % 2 === 0 ? (
              <text key={point.month} className="metricchart__month" x={index * slot + slot / 2} y={height - 4}>
                {monthLabel(point.month).split(" ")[0]}
              </text>
            ) : null,
          )}
      </svg>
      {shown && active !== null && (
        <div
          className="metricchart__tip"
          style={{ left: `${((active + 0.5) / history.length) * 100}%` }}
          role="status"
        >
          <strong>{shown.value === null ? "Nothing written" : format(shown.value)}</strong>
          <span>
            {monthLabel(shown.month)}
            {flow && active === history.length - 1 ? ", so far" : ""}
          </span>
        </div>
      )}
      <table className="visually-hidden" id={`${id}-table`}>
        <caption>{label}, by month</caption>
        <tbody>
          {history.map((point) => (
            <tr key={point.month}>
              <th scope="row">{monthLabel(point.month)}</th>
              <td>{point.value === null ? "Nothing written" : format(point.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
