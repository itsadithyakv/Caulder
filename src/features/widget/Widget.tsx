import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from "react";
import { Check } from "lucide-react";
import type { Task, Today } from "@shared/domain";
import type { WidgetLevel } from "@shared/widget";
import { deskFacts, deskGlance, deskHours, deskTasks, type DeskFact, type DeskGlance } from "@shared/widget";
import { minutesOf, timeNow } from "@shared/dates";
import { formatDuration, formatLongDay, formatTime } from "@/lib/format";

/**
 * The desk widget: the day, without opening anything.
 *
 * It rests as a pill naming the one thing worth a glance, and opens into a
 * panel when the pointer rests on it. Which of the two it is showing is
 * main's decision, not this page's - the window itself resizes, so the page
 * is told rather than choosing.
 *
 * **It says the three things Caulder is for** (PLAN.md, part eight): what is
 * on, what is late or due, and who has written or is waiting. What is said
 * and in which order is `deskGlance`, `deskTasks`, `deskFacts` and
 * `deskHours` in shared/widget.ts; the words are here.
 *
 * **It can be clicked where Windows lets it be**: the pill and the panel's
 * head open Caulder, and a task is ticked off from its row. At the desktop
 * level Windows sends every click to the wallpaper, so there the ticks are
 * not drawn - a control that silently does nothing is worse than none.
 *
 * **It is moved by dragging the pill or the head.** Main follows the cursor
 * (electron/main/widget.ts); a press that does not move is a click.
 */

type Workspace = { id: string; timezone: string };

/** The one line the pill has room for: a thing's name, not a count of things. */
function sayGlance(glance: DeskGlance): string {
  switch (glance.say) {
    case "soon":
      return glance.minutes <= 0 ? `${glance.title} now` : `${glance.title} in ${formatDuration(glance.minutes)}`;
    case "replied":
      return `${glance.name} replied`;
    case "late":
      return `Late: ${glance.title}`;
    case "now":
      return glance.title;
    case "next":
      return `${glance.title} in ${formatDuration(glance.minutes)}`;
    case "due":
      return glance.title;
    case "nothing":
      return "Nothing on today";
  }
}

/** How many more of the same the pill is not naming. */
function othersOf(glance: DeskGlance): number {
  return "others" in glance ? glance.others : 0;
}

function sayFact(fact: DeskFact): string {
  switch (fact.about) {
    case "replied":
      return fact.others > 0 ? `${fact.name} and ${fact.others} more replied` : `${fact.name} replied`;
    case "unpaid":
      return fact.count === 1 ? "1 invoice unpaid and late" : `${fact.count} invoices unpaid and late`;
    case "waiting":
      return fact.count === 1 ? "1 prospect waiting" : `${fact.count} prospects waiting`;
    case "reached":
      return fact.count === 1 ? "1 person reached today" : `${fact.count} people reached today`;
  }
}

/**
 * A press that opens Caulder when it is a click and moves the widget when it
 * is a drag. Main reads the cursor; the page only says when the press starts,
 * moves and ends.
 */
function usePress(onClick: () => void) {
  const pressing = useRef(false);
  return {
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      if (event.button !== 0) return;
      pressing.current = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      void window.caulder.widget.drag("start");
    },
    onPointerMove: () => {
      if (pressing.current) void window.caulder.widget.drag("move");
    },
    onPointerUp: async () => {
      if (!pressing.current) return;
      pressing.current = false;
      const moved = await window.caulder.widget.drag("end");
      if (!moved) onClick();
    },
  };
}

export function Widget() {
  const [open, setOpen] = useState(false);
  const [level, setLevel] = useState<WidgetLevel>("front");
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [today, setToday] = useState<Today | null>(null);
  const [minutes, setMinutes] = useState(0);

  // Told by main, each time the pointer settles on it and leaves. The level
  // is asked for each time too, since Settings can change it while it rests.
  useEffect(
    () =>
      window.caulder.widget.onOpen((next) => {
        setOpen(next);
        window.caulder.widget.get().then((state) => setLevel(state.level), () => undefined);
      }),
    [],
  );

  const refresh = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 60_000);
    return () => clearInterval(timer);
  }, [refresh]);

  // Read again each time it opens, so what was done in the app is gone here.
  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  // The clock moves faster than the data does, and "in 3 minutes" going stale
  // is what makes a widget look broken.
  useEffect(() => {
    if (!workspace) return;
    const timer = setInterval(() => setMinutes(minutesOf(timeNow(workspace.timezone))), 30_000);
    return () => clearInterval(timer);
  }, [workspace]);

  // How tall the panel needs to be, measured on every render while it is open.
  const inner = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!open || !inner.current) return;
    window.caulder.widget.fit(inner.current.offsetHeight).catch(() => undefined);
  });

  const press = usePress(() => void window.caulder.widget.openApp());

  async function tick(task: Task) {
    // Gone at once, and read back afterwards for whatever ticking it changed.
    setToday((day) =>
      day ? { ...day, overdue: day.overdue.filter((each) => each.id !== task.id), dueToday: day.dueToday.filter((each) => each.id !== task.id) } : day,
    );
    try {
      await window.caulder.tasks.complete(task.id);
    } finally {
      void refresh();
    }
  }

  if (!today) {
    return (
      <div className="desk desk--pill" {...press}>
        <span className="brandmark desk__mark" aria-hidden />
        <p className="desk__line">Caulder</p>
      </div>
    );
  }

  if (!open) {
    const glance = deskGlance(today, minutes);
    const others = othersOf(glance);
    return (
      <div className="desk desk--pill" data-say={glance.say} {...press}>
        <span className="brandmark desk__mark" aria-hidden />
        <p className="desk__line">{sayGlance(glance)}</p>
        {others > 0 && <span className="desk__more">+{others}</span>}
      </div>
    );
  }

  const hours = deskHours(today.blocks, minutes);
  const { tasks, more } = deskTasks(today);
  const facts = deskFacts(today);
  const canClick = level !== "desktop";

  return (
    <div className="desk desk--panel">
      <div className="desk__inner" ref={inner}>
        <div className="desk__head" title="Open Caulder" {...press}>
          <span className="brandmark desk__mark" aria-hidden />
          <strong className="desk__day">{formatLongDay(today.day)}</strong>
        </div>

        {hours.length > 0 ? (
          <ul className="desk__hours" aria-label="The rest of today">
            {hours.map((block) => {
              const on = minutesOf(block.startsAt) <= minutes;
              return (
                <li key={block.id} className={`desk__hour${on ? " desk__hour--now" : ""}`}>
                  <span className="desk__at">{on ? "Now" : formatTime(block.startsAt)}</span>
                  <span className="desk__what">{block.title}</span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="desk__clear">{today.blocks.length > 0 ? "Nothing more set aside today." : "Nothing set aside today."}</p>
        )}

        {tasks.length > 0 && (
          <ul className="desk__tasks" aria-label="To do">
            {tasks.map(({ task, late }) => (
              <li key={task.id} className={`desk__task${late ? " desk__task--late" : ""}`}>
                {canClick && (
                  <button type="button" className="desk__tick" onClick={() => void tick(task)} aria-label={`Done: ${task.title}`} title="Done">
                    <Check size={12} aria-hidden />
                  </button>
                )}
                <span className="desk__what">{task.title}</span>
                {late && <span className="desk__flag">late</span>}
              </li>
            ))}
            {more > 0 && <li className="desk__extra">and {more} more</li>}
          </ul>
        )}

        {facts.length > 0 && (
          <ul className="desk__facts" aria-label="The company today">
            {facts.map((fact) => (
              <li key={fact.about} className={`desk__fact${"urgent" in fact ? " desk__fact--urgent" : ""}`}>
                {sayFact(fact)}
              </li>
            ))}
          </ul>
        )}

        {tasks.length === 0 && facts.length === 0 && <p className="desk__clear">Nothing late, nobody waiting.</p>}
      </div>
    </div>
  );
}
