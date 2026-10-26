import type { Today } from "./domain";
import { minutesOf } from "./dates";
import { whatNow } from "./priority";

/**
 * What the desk widget's three levels are, and how its settings read.
 *
 * In `shared/` because both halves need the same answer: main puts the window
 * at a level, and Settings has to describe that level in time for somebody to
 * choose it. Two copies of this list is how a card ends up promising
 * behaviour the window does not have.
 *
 * The geometry - where the pill rests and where the panel opens - is main's
 * alone and lives in electron/main/desk.ts.
 */

export const WIDGET_LEVELS = [
  {
    id: "front",
    title: "In front",
    detail: "Above your windows.",
  },
  {
    id: "desktop",
    title: "On the desktop",
    /**
     * The one that has to be said before it is chosen rather than discovered
     * after. Somebody who picks this and then cannot find the widget has not
     * hit a bug - they have a browser open.
     */
    detail: "On the wallpaper. Cannot be clicked there.",
  },
  {
    id: "normal",
    title: "An ordinary window",
    detail: "Covered by other windows.",
  },
] as const;

export type WidgetLevel = (typeof WIDGET_LEVELS)[number]["id"];

/**
 * The level to restore, from what was stored.
 *
 * Anything unrecognised is `front` rather than an error: the settings row is
 * editable by anyone who can open the file, and a widget that refuses to
 * appear because its level is misspelt is worse than one in the wrong place.
 * `front` and not `desktop` because it is the only level where everything
 * about the widget works - visible without minimising anything, and
 * clickable.
 */
export function widgetLevel(saved: string | null): WidgetLevel {
  const found = WIDGET_LEVELS.find((level) => level.id === saved?.trim());
  return found?.id ?? "front";
}

/**
 * Whether it comes back on launch.
 *
 * Never set is off. The widget is the one part of Caulder that puts something
 * on screen you did not open, so it starts asked-for or not at all.
 */
export function widgetWanted(saved: string | null): boolean {
  return saved === "1";
}

/** Where the resting pill was left, if it was ever written. */
export function widgetSpot(saved: string | null): { x: number; y: number } | null {
  if (!saved) return null;
  try {
    const read: unknown = JSON.parse(saved);
    if (typeof read !== "object" || read === null) return null;
    const { x, y } = read as { x?: unknown; y?: unknown };
    if (typeof x !== "number" || typeof y !== "number") return null;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { x: Math.round(x), y: Math.round(y) };
  } catch {
    return null;
  }
}

/* ---- What it says ---------------------------------------------------------
 *
 * The widget answers the three things Caulder is for without anything being
 * opened: what is on, who has written or is waiting, and what is late or
 * owed. What is said, and in which order, is decided here so it can be
 * tested; the words and the times are the window's (src/features/widget).
 * ------------------------------------------------------------------------ */

/** A block about to start outranks everything: it is the one thing that cannot wait. */
const DESK_SOON_MINUTES = 10;

/** The most blocks the open panel lists. */
const DESK_HOURS = 4;

/** The most tasks the open panel lists, late ones first. */
const DESK_TASKS = 4;

type DeskDay = Pick<Today, "blocks" | "overdue" | "dueToday" | "replies" | "unpaid" | "reach">;

/** The one thing the resting pill says. */
export type DeskGlance =
  | { say: "soon"; title: string; minutes: number }
  | { say: "replied"; name: string; others: number }
  | { say: "late"; title: string; others: number }
  | { say: "now"; title: string; others: number }
  | { say: "next"; title: string; minutes: number }
  | { say: "due"; title: string; others: number }
  | { say: "nothing" };

/**
 * What the pill has room for, soonest first.
 *
 * A block starting within ten minutes cannot wait. A reply is the warmest
 * thing in the app and goes cold if left. Late work was already late an hour
 * ago. Then what is on, what is next, and what is due.
 */
export function deskGlance(day: DeskDay, minutes: number): DeskGlance {
  const advice = whatNow(day.blocks, minutes);
  if (advice.next && advice.nextIn !== null && advice.nextIn <= DESK_SOON_MINUTES) {
    return { say: "soon", title: advice.next.title, minutes: advice.nextIn };
  }
  const first = day.replies[0];
  if (first) return { say: "replied", name: first.leadName, others: day.replies.length - 1 };
  const late = day.overdue[0];
  if (late) return { say: "late", title: late.title, others: day.overdue.length - 1 };
  const on = advice.at[0];
  if (on) return { say: "now", title: on.title, others: advice.at.length - 1 };
  if (advice.next && advice.nextIn !== null) return { say: "next", title: advice.next.title, minutes: advice.nextIn };
  const due = day.dueToday[0];
  if (due) return { say: "due", title: due.title, others: day.dueToday.length - 1 };
  return { say: "nothing" };
}

/**
 * The tasks the panel lists by name, to be ticked off there: late first, then
 * due today, at most four, and how many more there are. Named rather than
 * counted - "2 due today" made you open the app to find out which.
 */
export function deskTasks<T>(day: { overdue: readonly T[]; dueToday: readonly T[] }): { tasks: { task: T; late: boolean }[]; more: number } {
  const all = [...day.overdue.map((task) => ({ task, late: true })), ...day.dueToday.map((task) => ({ task, late: false }))];
  return { tasks: all.slice(0, DESK_TASKS), more: Math.max(0, all.length - DESK_TASKS) };
}

/** One line under the tasks in the open panel. `urgent` is the only thing that earns a colour. */
export type DeskFact =
  | { about: "replied"; name: string; others: number }
  | { about: "unpaid"; count: number; urgent: true }
  | { about: "waiting"; count: number }
  | { about: "reached"; count: number };

/**
 * The rest of the company's day, under the tasks: who wrote, what is owed,
 * who is waiting. Only what is so; the tasks themselves are listed by name.
 */
export function deskFacts(day: DeskDay): DeskFact[] {
  const facts: DeskFact[] = [];
  const reply = day.replies[0];
  if (reply) facts.push({ about: "replied", name: reply.leadName, others: day.replies.length - 1 });
  if (day.unpaid.length > 0) facts.push({ about: "unpaid", count: day.unpaid.length, urgent: true });
  if (day.reach.waiting > 0) facts.push({ about: "waiting", count: day.reach.waiting });
  if (day.reach.today > 0) facts.push({ about: "reached", count: day.reach.today });
  return facts;
}

/** The blocks worth listing: what has not finished yet, soonest first. A morning that is over is not on the desk. */
export function deskHours<T extends { startsAt: string; minutes: number }>(blocks: readonly T[], minutes: number): T[] {
  return blocks
    .filter((block) => minutesOf(block.startsAt) + block.minutes > minutes)
    .sort((a, b) => minutesOf(a.startsAt) - minutesOf(b.startsAt))
    .slice(0, DESK_HOURS);
}

