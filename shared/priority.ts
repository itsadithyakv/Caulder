import { minutesOf } from "./dates";

/**
 * Which of two things you should actually be at.
 *
 * The day grid already draws a clash. This decides what to say about one, and
 * the interesting part is where it stops: **when both are equally important it
 * refuses to choose.** Caulder does not know whether the client or the exam
 * matters more once you have called both "has to happen", and picking one
 * would be inventing an answer — the same reason the forecast declines to name
 * a median it has not observed.
 */

/**
 * Three levels, named rather than numbered.
 *
 * Everybody's one-to-five scale drifts within a week, and "priority 2" means
 * nothing at a glance. Three is as many as anybody sorts reliably.
 */
export const PRIORITIES = ["must", "should", "spare"] as const;
type Priority = (typeof PRIORITIES)[number];

export const PRIORITY_LABEL: Record<Priority, string> = {
  must: "Has to happen",
  should: "Should happen",
  spare: "If there is time",
};

/** The short form, for a badge on a block where the long one will not fit. */
export const PRIORITY_SHORT: Record<Priority, string> = {
  must: "Must",
  should: "Should",
  spare: "Spare",
};

/**
 * What each kind of block is, unless told otherwise.
 *
 * So that nobody sets a priority twice a day. A lecture and a client meeting
 * are things you turn up to; a break is what gives way when something lands on
 * it. Anything unlisted is "should", which is the safe middle.
 */
const BY_KIND: Record<string, Priority> = {
  meeting: "must",
  class: "must",
  study: "should",
  focus: "should",
  admin: "should",
  personal: "should",
  break: "spare",
};

export function priorityOf(kind: string | null, explicit: string | null): Priority {
  if (explicit && (PRIORITIES as readonly string[]).includes(explicit)) {
    return explicit as Priority;
  }
  return BY_KIND[kind ?? ""] ?? "should";
}

/** Lower is more important, so it sorts the way a list should read. */
function rankOf(priority: Priority): number {
  return PRIORITIES.indexOf(priority);
}

/** The least this file needs to know about a block. */
export type Timed = {
  id: string;
  startsAt: string;
  minutes: number;
  kind: string | null;
  priority: string | null;
};

function overlapping(a: Timed, b: Timed): boolean {
  const startA = minutesOf(a.startsAt);
  const startB = minutesOf(b.startsAt);
  // Touching is not clashing: back to back is the most ordinary shape a day
  // has, and warning about it would make the feature noise.
  return startA < startB + b.minutes && startB < startA + a.minutes;
}

type Clash = {
  /** Something more important is happening at the same time. */
  losesTo: string[];
  /** Something equally important is. Named, never ranked. */
  tiesWith: string[];
};

/**
 * What each block is up against.
 *
 * A block that loses to something is dimmed on the grid. A block that ties is
 * marked as clashing and left alone, because that is a decision only the
 * person can make.
 */
export function clashesIn(blocks: readonly Timed[]): Map<string, Clash> {
  const out = new Map<string, Clash>();

  for (const block of blocks) {
    const mine = rankOf(priorityOf(block.kind, block.priority));
    const losesTo: string[] = [];
    const tiesWith: string[] = [];

    for (const other of blocks) {
      if (other.id === block.id) continue;
      if (!overlapping(block, other)) continue;

      const theirs = rankOf(priorityOf(other.kind, other.priority));
      if (theirs < mine) losesTo.push(other.id);
      else if (theirs === mine) tiesWith.push(other.id);
    }

    out.set(block.id, { losesTo, tiesWith });
  }

  return out;
}

type NowAdvice<T extends Timed> = {
  /**
   * What you should be at.
   *
   * More than one means a genuine tie, deliberately unbroken. The screen says
   * they clash rather than pretending to know which wins.
   */
  at: T[];
  /** Happening now, but outranked. */
  yielding: T[];
  /** The next thing to start after now. */
  next: T | null;
  /** How many minutes until it does. */
  nextIn: number | null;
};

/**
 * The answer to "what should I be doing".
 *
 * `now` is minutes since midnight. A block that ends exactly now is over — the
 * boundary belongs to whatever starts then, or a ten o'clock finish would go
 * on being the answer while the ten o'clock meeting waits.
 */
export function whatNow<T extends Timed>(blocks: readonly T[], now: number): NowAdvice<T> {
  const live = blocks.filter((block) => {
    const start = minutesOf(block.startsAt);
    return now >= start && now < start + block.minutes;
  });

  const upcoming = blocks
    .filter((block) => minutesOf(block.startsAt) > now)
    .sort((a, b) => minutesOf(a.startsAt) - minutesOf(b.startsAt));

  const next = upcoming[0] ?? null;

  if (live.length === 0) {
    return {
      at: [],
      yielding: [],
      next,
      nextIn: next ? minutesOf(next.startsAt) - now : null,
    };
  }

  const best = Math.min(
    ...live.map((block) => rankOf(priorityOf(block.kind, block.priority))),
  );

  return {
    at: live.filter((block) => rankOf(priorityOf(block.kind, block.priority)) === best),
    yielding: live.filter(
      (block) => rankOf(priorityOf(block.kind, block.priority)) !== best,
    ),
    next,
    nextIn: next ? minutesOf(next.startsAt) - now : null,
  };
}
