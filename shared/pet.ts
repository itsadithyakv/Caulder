/**
 * Ember on the taskbar: where she stands, how she walks, and what she is
 * carrying for you.
 *
 * Everything here is a decision and nothing here is a window. The window is
 * `electron/main/pet.ts`, which asks these functions what to do and does it.
 */

/** Her window, square, the sprite at two screen pixels to one. */
export const PET_SIZE = 64;

/**
 * How far above the seam her window sits. Her feet are on sprite rows 29 and
 * 30 of 32, so the bottom four screen pixels of her window are below her
 * feet - that is where her skateboard's wheels and her bed's legs go, and
 * they dip over the taskbar's edge, which is where they should be.
 */
const FEET = 60;

type Rect = { x: number; y: number; width: number; height: number };

/**
 * Where she walks: the bottom of the work area, from one side to the other.
 *
 * One rule for every taskbar. At the bottom of the screen, the bottom of the
 * work area IS the seam between the taskbar and the windows above it, which
 * is the edge she was asked to walk. On the top or a side, or hidden, it is
 * the bottom of the screen - she does not walk upside down along a top
 * taskbar, and she does not climb.
 */
export function walkway(workArea: Rect): { y: number; from: number; to: number } {
  return {
    y: workArea.y + workArea.height - FEET,
    from: workArea.x,
    to: workArea.x + workArea.width - PET_SIZE,
  };
}

export type Stroll = {
  x: number;
  dir: 1 | -1;
  /** Ticks left to stand still. */
  rest: number;
  /** Ticks walked since the last stop, which is what decides the next one. */
  walked: number;
};

/** Pixels per tick. At four ticks a second, sixteen a second: an amble. */
const STEP = 4;

/** She stops every so often mid-walk, and at each end for longer. */
const WALK_FOR = 60;
const STOP_FOR = 24;
const TURN_FOR = 40;

/**
 * One tick of her walk.
 *
 * Counted, never random, for the reason her pastimes are: a pure function of
 * where she is can be tested for its whole behaviour, and nothing about a
 * walk needs to be a surprise to be charming - it needs to stop sometimes.
 *
 * `held` is anything that wants her still: a pastime, a mood, something she
 * is carrying for you. She stands where she is and the walk resumes from
 * there, rather than snapping anywhere.
 */
export function stroll(state: Stroll, way: { from: number; to: number }, held: boolean): Stroll {
  const x = Math.min(Math.max(state.x, way.from), Math.max(way.from, way.to));
  if (held) return { ...state, x };
  if (state.rest > 0) return { ...state, x, rest: state.rest - 1 };

  const next = x + STEP * state.dir;
  if (next >= way.to) return { x: way.to, dir: -1, rest: TURN_FOR, walked: 0 };
  if (next <= way.from) return { x: way.from, dir: 1, rest: TURN_FOR, walked: 0 };

  const walked = state.walked + 1;
  if (walked >= WALK_FOR) return { x: next, dir: state.dir, rest: STOP_FOR, walked: 0 };
  return { x: next, dir: state.dir, rest: 0, walked };
}

/**
 * Something she is holding up for you.
 *
 * `bell` - a block in your day starts soon. `letter` - somebody replied.
 * `papers` - something is overdue.
 */
export type Errand = "bell" | "letter" | "papers";

/** How soon a block has to be to earn the bell. The reminder's own default. */
const SOON_MINUTES = 10;

function minutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/**
 * What she should be carrying, if anything.
 *
 * The whole of her purpose, in one function. She is not decoration if the
 * thing in her hand is a fact about your day: the lecture starting in eight
 * minutes, the principal who wrote back, the call that is two days late.
 *
 * **One at a time, in a fixed order**, because she has one pair of hands and
 * because a mascot juggling three alerts is a dashboard with a face. Soonest
 * first: a block about to start cannot wait, a reply is the warmest thing in
 * the app and goes cold if left, and overdue work was already late an hour
 * ago and will still be late in ten minutes.
 *
 * Nothing invented. Every errand is a row Caulder already has; if Today is
 * empty she carries nothing and gets on with her own life.
 */
export function errandOf(
  today: {
    day: string;
    blocks: readonly { day: string; startsAt: string; outcome?: string | null }[];
    replies: readonly unknown[];
    overdue: readonly unknown[];
  },
  now: { day: string; hhmm: string },
): Errand | null {
  if (today.day === now.day) {
    const at = minutes(now.hhmm);
    const soon = today.blocks.some((block) => {
      if (block.day !== now.day || block.outcome) return false;
      const until = minutes(block.startsAt) - at;
      return until >= 0 && until <= SOON_MINUTES;
    });
    if (soon) return "bell";
  }
  if (today.replies.length > 0) return "letter";
  if (today.overdue.length > 0) return "papers";
  return null;
}

/**
 * Whether she is on the taskbar at all, from what Caulder is doing.
 *
 * **There is only ever one of her.** When Caulder is the window in front she
 * is inside it, on the quick line; when it is not, she is out here. Two of
 * her at once would be two mascots, and the quick line is where she is
 * useful rather than only company.
 *
 * And never over something full-screen - a film, a slide deck, a game. A
 * pet that walks across your presentation is not one anybody keeps.
 */
export function onTaskbar(state: { wanted: boolean; caulderInFront: boolean; fullScreenInFront: boolean }): boolean {
  return state.wanted && !state.caulderInFront && !state.fullScreenInFront;
}

/**
 * How she is out on the taskbar:
 *  - `walk`: walking the seam, as she always did;
 *  - `dot`: a small ember resting by the clock, who comes out when you point
 *    at her and goes back when you leave - company without movement in the
 *    corner of your eye;
 *  - `off`: not there at all.
 */
export type PetForm = "walk" | "dot" | "off";

/**
 * The setting, read. Never set is a dot (27 September 2026): walking all day
 * was too much to have on by default. "1" and "0" are the old switch, on and
 * off, and keep meaning what they meant.
 */
export function petForm(saved: unknown): PetForm {
  if (saved === "walk" || saved === "1") return "walk";
  if (saved === "off" || saved === "0") return "off";
  return "dot";
}
