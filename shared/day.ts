import { minutesOf } from "./dates";
import type { Block, LaidOutBlock } from "./domain";

/**
 * Laying out a day.
 *
 * Everything here is arithmetic on blocks and returns plain numbers. It knows
 * nothing about pixels, hours-tall or the screen - the Day screen multiplies
 * by a row height and that is the whole of the rendering. Kept out of the
 * component so the hard part, which is overlap, can be tested by hand.
 *
 * The governing decision: **overlap is allowed and drawn, never refused.** A
 * day where two things genuinely clash is a day worth seeing clash. An app
 * that rejects the second one does not remove the clash, it just means you
 * keep the clash somewhere it cannot help you.
 */

/**
 * Packs overlapping blocks into side-by-side columns.
 *
 * The standard calendar algorithm, and worth writing out because the naive
 * version is subtly wrong. Blocks are grouped into clusters of things that
 * overlap *transitively* - A over B and B over C puts all three in one cluster
 * even when A and C never touch - and the whole cluster shares a column count.
 * Widths that changed halfway down a stack would read as two separate groups
 * rather than one contended stretch.
 *
 * Ties break on start time, then on the longer block, so the thing that
 * anchors the stretch sits leftmost rather than being pushed around by
 * whatever happens to be shorter.
 */
export function layOut(blocks: readonly Block[]): LaidOutBlock[] {
  const sorted = [...blocks].sort((a, b) => {
    const start = minutesOf(a.startsAt) - minutesOf(b.startsAt);
    if (start !== 0) return start;
    const length = b.minutes - a.minutes;
    if (length !== 0) return length;
    // A stable last resort, so two identical blocks do not swap places
    // between renders.
    return a.id.localeCompare(b.id);
  });

  const out: LaidOutBlock[] = [];

  /** The cluster being filled, and the end of the last block in each column. */
  let cluster: LaidOutBlock[] = [];
  let columnEnds: number[] = [];
  /** How far the cluster reaches. A block starting past this begins a new one. */
  let clusterEnd = -1;

  const flush = () => {
    for (const block of cluster) block.columns = columnEnds.length;
    out.push(...cluster);
    cluster = [];
    columnEnds = [];
    clusterEnd = -1;
  };

  for (const block of sorted) {
    const start = minutesOf(block.startsAt);
    const end = start + block.minutes;

    // Touching is not overlapping: a block ending at 10:00 and one starting at
    // 10:00 are back to back, which is the most ordinary shape a day has.
    if (start >= clusterEnd && cluster.length > 0) flush();

    let column = columnEnds.findIndex((columnEnd) => columnEnd <= start);
    if (column === -1) {
      column = columnEnds.length;
      columnEnds.push(end);
    } else {
      columnEnds[column] = end;
    }

    cluster.push({ ...block, column, columns: 1 });
    clusterEnd = Math.max(clusterEnd, end);
  }

  if (cluster.length > 0) flush();

  return out;
}

/**
 * Minutes accounted for, by kind.
 *
 * Overlapping blocks are both counted. Nobody plans two things at once meaning
 * to do half of each, and quietly halving them would make a double-booked
 * morning look like a light one - which is the opposite of what the number is
 * for. An unset kind is counted under "Unsorted" rather than dropped.
 */
export function spentByKind(blocks: readonly Block[]): { kind: string; minutes: number }[] {
  const totals = new Map<string, number>();

  for (const block of blocks) {
    const kind = block.kind ?? "unsorted";
    totals.set(kind, (totals.get(kind) ?? 0) + block.minutes);
  }

  return [...totals.entries()]
    .map(([kind, minutes]) => ({ kind, minutes }))
    .sort((a, b) => b.minutes - a.minutes);
}

/**
 * How many of the planned minutes have already gone.
 *
 * Counts the part of each block that is behind the cursor, not whether it has
 * started - a two-hour block half an hour in has thirty minutes gone, and
 * saying either "0" or "120" would be a different kind of wrong.
 *
 * `cursor` is minutes since midnight on the day being looked at. The caller
 * decides what that means for a day other than today, because the two answers
 * are opposite and neither is guessable from here: a day already past is
 * entirely spent (`DAY_MINUTES`) and one still ahead is entirely unspent (`0`).
 */
export function elapsedMinutes(blocks: readonly Block[], cursor: number): number {
  let total = 0;
  for (const block of blocks) {
    const start = minutesOf(block.startsAt);
    total += Math.max(0, Math.min(block.minutes, cursor - start));
  }
  return total;
}

/* ---- Clashes ---------------------------------------------------------------- */

type Timed = Pick<Block, "id" | "title" | "startsAt" | "minutes">;

/** Two things in the calendar at once: when they meet, and what they are. */
export type DoubleBooking = { at: string; titles: [string, string] };

const span = (block: Timed) => [minutesOf(block.startsAt), minutesOf(block.startsAt) + block.minutes] as const;

/**
 * Every pair of blocks in a day that overlap - the warning for a calendar
 * that has two things at once. A clash is never refused (see `layOut`):
 * it is said, so it can be sorted out while there is time to.
 * Back to back is not a clash. The earliest first.
 */
export function doubleBooked(blocks: readonly Timed[]): DoubleBooking[] {
  const sorted = [...blocks].sort((a, b) => minutesOf(a.startsAt) - minutesOf(b.startsAt) || a.id.localeCompare(b.id));
  const out: DoubleBooking[] = [];
  for (let i = 0; i < sorted.length; i += 1) {
    const one = sorted[i] as Timed;
    const [, oneEnd] = span(one);
    for (let j = i + 1; j < sorted.length; j += 1) {
      const other = sorted[j] as Timed;
      const [otherStart] = span(other);
      if (otherStart >= oneEnd) break;
      out.push({ at: other.startsAt, titles: [one.title, other.title] });
    }
  }
  return out;
}

/** The blocks a block at this time would overlap, leaving out the one being changed. */
export function clashingWith(candidate: { id?: string | null; startsAt: string; minutes: number }, blocks: readonly Timed[]): Timed[] {
  const start = minutesOf(candidate.startsAt);
  const end = start + candidate.minutes;
  return blocks.filter((block) => {
    if (candidate.id && block.id === candidate.id) return false;
    const [from, to] = span(block);
    return from < end && start < to;
  });
}
