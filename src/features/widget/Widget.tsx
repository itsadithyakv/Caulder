import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Today } from "@shared/domain";
import { whatNow } from "@shared/priority";
import { minutesOf, timeNow } from "@shared/dates";
import { formatDuration, formatTime } from "@/lib/format";

/**
 * The desk widget: the day, without opening anything.
 *
 * It rests as a pill saying the one thing worth a glance, and opens into a
 * panel when the pointer is on it. Which of the two it is showing is main's
 * decision, not this page's - the window itself resizes, so the page is told
 * rather than choosing.
 *
 * **Nothing here is clickable, on purpose.** At the desktop level the window
 * is a child of the wallpaper and Windows sends every click to the desktop
 * instead, so a button here would work at two levels out of three. A control
 * that silently does nothing is worse than no control, and the widget's job
 * is to be read rather than used.
 *
 * The look is the app's own, set on the page (index.html), so this window
 * wears the same coffee as the main one without being told.
 */

type Workspace = { id: string; timezone: string };

export function Widget() {
  const [open, setOpen] = useState(false);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [today, setToday] = useState<Today | null>(null);
  const [minutes, setMinutes] = useState(0);

  // Told by main, each time the pointer arrives and leaves. Asked for nothing
  // on mount: the window opens resting, and the first hover says so.
  useEffect(() => window.caulder.widget.onOpen(setOpen), []);

  useEffect(() => {
    const refresh = async () => {
      try {
        const { companies, activeCompanyId } = await window.caulder.companies.list();
        const active = companies.find((company) => company.id === activeCompanyId);
        if (!active) {
          setWorkspace(null);
          setToday(null);
          return;
        }
        setWorkspace({ id: active.id, timezone: active.timezone });
        setMinutes(minutesOf(timeNow(active.timezone)));
        setToday(await window.caulder.today.get(active.id));
      } catch {
        // A widget that draws an error over the wallpaper is worse than one
        // that keeps showing the last thing it knew.
      }
    };

    void refresh();
    // A minute is the finest this needs to be. It is a glance, and it is
    // reading the database of the process it is already in.
    const timer = setInterval(() => void refresh(), 60_000);
    return () => clearInterval(timer);
  }, []);

  // The clock moves faster than the data does, and "in 3 minutes" going stale
  // is what makes a widget look broken.
  useEffect(() => {
    if (!workspace) return;
    const timer = setInterval(() => setMinutes(minutesOf(timeNow(workspace.timezone))), 30_000);
    return () => clearInterval(timer);
  }, [workspace]);

  // How tall the panel actually needs to be. Measured on every render while
  // it is open, because the answer changes with the day: an empty Sunday is
  // three lines, and a fixed window would draw 300px of card under them.
  const inner = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!open || !inner.current) return;
    window.caulder.widget.fit(inner.current.offsetHeight).catch(() => undefined);
  });

  const blocks = today?.blocks ?? [];
  const advice = whatNow(blocks, minutes);
  const late = today?.overdue.length ?? 0;
  const due = today?.dueToday.length ?? 0;

  if (!open) {
    return (
      <div className="desk desk--pill">
        <p className="desk__line">{restingLine(advice, late)}</p>
      </div>
    );
  }

  return (
    <div className="desk desk--panel">
      <div className="desk__inner" ref={inner}>
        <p className="desk__now">
          {advice.at.length > 0 ? (
            <>
              <span className="desk__label">
                {advice.at.length > 1 ? "Two things now" : "Right now"}
              </span>
              <strong>{advice.at.map((block) => block.title).join("  ·  ")}</strong>
            </>
          ) : advice.next ? (
            <>
              <span className="desk__label">Free until</span>
              <strong>{formatTime(advice.next.startsAt)}</strong>
            </>
          ) : (
            <>
              <span className="desk__label">Today</span>
              <strong>Nothing set aside</strong>
            </>
          )}
        </p>

        {advice.next && advice.nextIn !== null && (
          <p className="desk__next">
            Next: {advice.next.title} in {formatDuration(advice.nextIn)}
          </p>
        )}

        {blocks.length > 0 && (
          <ul className="desk__hours">
            {blocks.slice(0, 5).map((block) => (
              <li key={block.id} className="desk__hour">
                <span className="desk__at">{formatTime(block.startsAt)}</span>
                <span className="desk__what">{block.title}</span>
              </li>
            ))}
          </ul>
        )}

        <p className="desk__counts">
          {late > 0 && <span className="desk__late">{late} late</span>}
          {due > 0 && <span className="desk__due">{due} due today</span>}
          {late === 0 && due === 0 && <span className="desk__clear">Nothing due</span>}
        </p>
      </div>
    </div>
  );
}

/**
 * The one line the pill has room for.
 *
 * Late work wins over what is on, because a lecture you are already in is
 * something you know about and a call you have missed is not.
 */
function restingLine(
  advice: ReturnType<typeof whatNow<Today["blocks"][number]>>,
  late: number,
): string {
  if (late > 0) return `${late} late`;
  if (advice.at.length > 1) return `${advice.at.length} things now`;
  if (advice.at[0]) return advice.at[0].title;
  if (advice.next && advice.nextIn !== null) {
    return `${advice.next.title} in ${formatDuration(advice.nextIn)}`;
  }
  return "Nothing on";
}
