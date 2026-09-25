/**
 * Getting back up: what Ember does when she has been put down somewhere
 * below her own line.
 *
 * She does not float home. She has five ways up, and she takes them in turn,
 * and each one is a small comedy with a beat that goes wrong in it - the
 * grappling hook that comes back down on her head, the magic trick that puts
 * her two steps to the left. Effort is the joke: a character that gets where
 * it is going without trying is scenery.
 *
 * The pure half lives here - which way next, where to aim, and how far up the
 * rope she has got at any moment, slip included - so a test can state it.
 * The stage draws the rope and moves her along it.
 */

export type WayUp = "rope" | "web" | "magic" | "spring" | "rocket";

/** The order she tries them in. The rope first: it is the one with the most effort in it. */
export const WAYS_UP: readonly WayUp[] = ["rope", "web", "magic", "spring", "rocket"];

export function wayUpAt(n: number): WayUp {
  const at = Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
  return WAYS_UP[at % WAYS_UP.length] as WayUp;
}

/**
 * Whether she needs a way up: standing on something that is not home, with
 * her feet below home's edge. A card above her line is a jump down, which
 * she can manage without any of this.
 */
export function stranded(feet: number, homeTop: number): boolean {
  return feet > homeTop + 8;
}

/**
 * Where on home to aim for: straight above her if home reaches that far,
 * otherwise the nearest end of it, kept clear of its corners. In the units
 * of her box's left edge.
 */
export function aimFor(x: number, home: { left: number; right: number }, size = 64): number {
  const lo = home.left - size / 2 + 12;
  const hi = home.right - size / 2 - 12;
  return Math.max(lo, Math.min(hi, x));
}

/** One pull on the rope, in seconds, and how far up it takes her. */
const PULL_S = 0.45;
const PULL = 0.14;
/** After this many pulls, she slips. */
const SLIP_AFTER = 4;
const SLIP = 0.2;
const SLIP_S = 0.25;
/** And hangs there a moment, having a think about her choices. */
const STUNNED_S = 0.6;

/**
 * How far up the rope she is, `t` seconds after she starts climbing.
 *
 * Hand over hand: each pull rises in the first part of its beat and then she
 * hangs, so the climb has effort in it rather than an elevator's glide. After
 * four pulls she slips, loses a good part of it, hangs stunned, and carries
 * on. `pull` counts the pulls, so the stage can swap hands on each one.
 */
export function climbed(t: number): { share: number; pull: number; slipping: boolean; done: boolean } {
  const at = Math.max(0, t);
  const rise = (from: number, into: number) => from + PULL * Math.min(1, into / (PULL_S * 0.6));
  const before = SLIP_AFTER * PULL_S;
  if (at < before) {
    const pull = Math.floor(at / PULL_S);
    return { share: rise(pull * PULL, at - pull * PULL_S), pull, slipping: false, done: false };
  }
  const high = SLIP_AFTER * PULL;
  if (at < before + SLIP_S) {
    const u = (at - before) / SLIP_S;
    return { share: high - SLIP * u * u, pull: SLIP_AFTER, slipping: true, done: false };
  }
  const low = high - SLIP;
  if (at < before + SLIP_S + STUNNED_S) return { share: low, pull: SLIP_AFTER, slipping: true, done: false };
  const after = at - before - SLIP_S - STUNNED_S;
  const pull = Math.floor(after / PULL_S);
  const share = rise(low + pull * PULL, after - pull * PULL_S);
  return share >= 1
    ? { share: 1, pull: SLIP_AFTER + pull, slipping: false, done: true }
    : { share, pull: SLIP_AFTER + pull, slipping: false, done: false };
}
