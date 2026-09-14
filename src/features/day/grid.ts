import { minutesOf } from "@shared/dates";

/**
 * The geometry both the day and the week are drawn on.
 *
 * One file because there is one grid. A week whose hours were an inch apart
 * and a day whose hours were an inch and a bit would be two calendars that
 * disagree about what an hour looks like, and the first thing anybody does
 * with a week view is compare it against the day they just left.
 */

/** Pixels per hour. The one number the geometry rests on. */
export const HOUR_PX = 60;
export const PER_MINUTE = HOUR_PX / 60;

/** Dragging snaps to this. Fifteen minutes is what a diary is made of. */
export const SNAP = 15;

/** The window the grid draws, widened when something falls outside it. */
const DEFAULT_FIRST_HOUR = 6;
const DEFAULT_LAST_HOUR = 23;

export function snapTo(minutes: number): number {
  return Math.round(minutes / SNAP) * SNAP;
}

type Placed = { startsAt: string; minutes: number };

/**
 * Which hours to draw.
 *
 * It grows to hold whatever is actually there: a five in the morning start
 * clipped off the top would be a block that exists in the database and
 * nowhere else.
 */
export function hourWindow(blocks: readonly Placed[]): number[] {
  const starts = blocks.map((block) => Math.floor(minutesOf(block.startsAt) / 60));
  const ends = blocks.map((block) =>
    Math.ceil((minutesOf(block.startsAt) + block.minutes) / 60),
  );

  const first = Math.min(DEFAULT_FIRST_HOUR, ...starts);
  const last = Math.max(DEFAULT_LAST_HOUR, ...ends);

  return Array.from({ length: last - first + 1 }, (_, index) => first + index);
}
