import { shiftDay, weekdayOf } from "./dates";
import type { EmberDance } from "./ember";
import { xpForLevel, type HabitRun } from "./progress";
import type { WayUp } from "./ascent";
import type { EmberCostume } from "./wardrobe";
import type { Garment } from "./closet";

/**
 * What Ember has learned, and how she is: the game, with her as the reason
 * to play it.
 *
 * Three things, each tied to something real you did, and each worked out
 * from it rather than kept - the same rule as your level: nothing is banked,
 * so undoing a tick undoes what it earned, and opening the app earns nothing.
 *
 *  - **Your habits feed her.** Every habit ticked is a marshmallow, and how
 *    many you have kept these last few days is how warm she is: bright and
 *    dancing when you are keeping up, dim and sleepy when you are not.
 *  - **Your level teaches her things.** Everything you get done already
 *    earns XP; each level from the second on teaches her a dance, a costume
 *    or a new way back up, in a fixed order so there is always a next thing.
 *  - **Your streaks earn the special costumes.** The longest run you have had
 *    on any habit unlocks the ones people ask for first.
 *
 * **She never dies, sulks or tells you off.** Cold, she sits by her door and
 * yawns; one habit ticked and she brightens on the spot. A pet that punishes
 * you gets switched off, and then it motivates nothing.
 */

export type Learnable =
  | { kind: "dance"; id: EmberDance }
  | { kind: "costume"; id: EmberCostume }
  | { kind: "way"; id: WayUp }
  | { kind: "garment"; id: Garment };

/** What unlocks it: a level reached, or a run of days on a habit. */
type Needs = { level: number } | { streak: number };

type Rung = { item: Learnable; needs: Needs };

const dance = (id: EmberDance): Learnable => ({ kind: "dance", id });
const costume = (id: EmberCostume): Learnable => ({ kind: "costume", id });
const way = (id: WayUp): Learnable => ({ kind: "way", id });
const garment = (id: Garment): Learnable => ({ kind: "garment", id });

/** Hers from the start: something to dance, something to dress up as, a way home, and her own clothes. */
const STARTER: readonly Learnable[] = [dance("dab"), costume("cowboy"), way("rope"), garment("scarf"), garment("sneakers"), garment("beanie")];

/**
 * The ladder. Levels start at one, so the first rung is level two - a
 * hundred XP, a day or two of ordinary use. The most-asked-for things come
 * early; the long tail keeps going for months. A new way home arrives every
 * three levels, because watching her find a new way up is the best of it.
 */
const LEVELS: readonly Rung[] = [
  [2, [dance("floss"), costume("superman"), way("web"), garment("shades"), garment("ballcap")]],
  [3, [dance("moonwalk"), dance("ninjarun"), costume("pirate"), garment("bow"), garment("heartshades")]],
  [4, [dance("robot"), costume("batman"), garment("bowtie"), garment("tie")]],
  [5, [dance("sixseven"), costume("einstein"), way("magic"), garment("boots"), garment("headphones")]],
  [6, [dance("headspin"), costume("srk"), garment("backpack"), garment("hightops")]],
  [7, [dance("disco"), costume("trump"), garment("partyhat"), garment("beret")]],
  [8, [dance("griddy"), costume("rajini"), way("spring"), garment("redkicks"), garment("medal")]],
  [9, [dance("chicken"), costume("napoleon"), garment("flower"), garment("cape")]],
  [10, [dance("worm"), costume("elvis"), garment("hoodie")]],
  [11, [dance("carlton"), costume("caesar"), way("rocket"), garment("bandana"), garment("monocle")]],
  [12, [dance("macarena"), costume("freddie"), garment("specs")]],
  [13, [dance("sprinkler"), costume("sachin"), garment("sweatband")]],
  [14, [dance("gangnam"), costume("dhoni"), garment("puffer")]],
  [15, [dance("jacks"), costume("cleopatra")]],
  [16, [dance("jig"), costume("lincoln"), garment("goldkicks")]],
  [17, [dance("twist"), costume("newton")]],
  [18, [dance("runningman"), costume("chaplin")]],
  [19, [dance("cossack"), costume("beethoven")]],
  [20, [costume("shakespeare"), costume("bobross"), garment("crown"), garment("halo")]],
  [21, [costume("curie"), costume("viking")]],
  [22, [costume("frida"), costume("detective")]],
  [23, [costume("knight"), costume("hero")]],
  [24, [costume("kalam"), costume("plumber")]],
  [25, [costume("wizard")]],
].flatMap(([level, items]) => (items as Learnable[]).map((item) => ({ item, needs: { level: level as number } })));

/** Runs of days on any one habit, and the costume each earns. Discipline, then speed, then the Moon. */
const STREAKS: readonly Rung[] = [
  { item: costume("brucelee"), needs: { streak: 3 } },
  { item: costume("bolt"), needs: { streak: 7 } },
  { item: costume("armstrong"), needs: { streak: 14 } },
  { item: costume("ronaldo"), needs: { streak: 21 } },
  { item: costume("mj"), needs: { streak: 30 } },
  { item: costume("tyson"), needs: { streak: 60 } },
  { item: costume("zeus"), needs: { streak: 100 } },
];

export const LADDER: readonly Rung[] = [...STARTER.map((item) => ({ item, needs: { level: 1 } })), ...LEVELS, ...STREAKS];

export function keyOf(item: Learnable): string {
  return `${item.kind}:${item.id}`;
}

/** How Ember is doing, and what you have done to get her there. */
export type EmberStats = {
  level: number;
  xp: number;
  /** The longest run of days on any one habit, ever. */
  best: number;
  /** The longest run going now. */
  streak: number;
  /** How warm she is, 0 to 100: see `warmthOf`. */
  warmth: number;
  /** Habits there are to keep. With none, she stays warm and suggests one. */
  habits: number;
  /** Habits ticked today. */
  keptToday: number;
};

function has(needs: Needs, stats: Pick<EmberStats, "level" | "best">): boolean {
  return "level" in needs ? stats.level >= needs.level : stats.best >= needs.streak;
}

/** Everything she knows, as keys. */
export function learnedBy(stats: Pick<EmberStats, "level" | "best">): Set<string> {
  return new Set(LADDER.filter((rung) => has(rung.needs, stats)).map((rung) => keyOf(rung.item)));
}

export function needsOf(item: Learnable): Needs {
  return LADDER.find((rung) => keyOf(rung.item) === keyOf(item))?.needs ?? { level: 1 };
}

/** What unlocks it, said short, for a locked line in her book: "Level 4", "7-day run". */
export function needsLabel(needs: Needs): string {
  return "level" in needs ? `Level ${needs.level}` : `${needs.streak}-day run`;
}

type Upcoming = { item: Learnable; needs: Needs; /** How far off, in its own terms: XP or days. */ togo: number; unit: "XP" | "days" };

/**
 * What she learns next, nearest first: the next level's rung in XP still to
 * earn, and the next streak costume in days still to keep. The goal you can
 * nearly touch is the one that gets you to tick the box.
 */
export function upNext(stats: Pick<EmberStats, "level" | "xp" | "best">, count = 3): Upcoming[] {
  const levels = LADDER.filter((rung) => "level" in rung.needs && !has(rung.needs, stats)).map((rung) => ({
    item: rung.item,
    needs: rung.needs,
    togo: Math.max(0, xpForLevel((rung.needs as { level: number }).level) - stats.xp),
    unit: "XP" as const,
  }));
  const streaks = LADDER.filter((rung) => "streak" in rung.needs && !has(rung.needs, stats)).map((rung) => ({
    item: rung.item,
    needs: rung.needs,
    togo: (rung.needs as { streak: number }).streak - stats.best,
    unit: "days" as const,
  }));
  // One of each kind first, so the next streak costume is never buried under
  // a list of level rungs; then whatever is nearest.
  const first = [levels[0], streaks[0]].filter((one): one is Upcoming => one !== undefined);
  const rest = [...levels.slice(1), ...streaks.slice(1)].sort((a, b) => (a.unit === b.unit ? a.togo - b.togo : a.unit === "days" ? -1 : 1));
  return [...first, ...rest].slice(0, count);
}

/* ---- Your habits ------------------------------------------------------------ */

function isDue(run: HabitRun, day: string): boolean {
  return run.since <= day && run.weekdays.includes(weekdayOf(day));
}

/**
 * The longest run on any habit, ever, and the longest going now. A run
 * counts a habit's own days only - a gym habit on Mondays and Thursdays is
 * not broken by a Tuesday - and today, not yet ticked, does not break one.
 */
export function streaksOf(runs: readonly HabitRun[], today: string): { best: number; streak: number } {
  let best = 0;
  let streak = 0;
  for (const run of runs) {
    const done = new Set(run.days);
    let length = 0;
    const from = run.since < shiftDay(today, -731) ? shiftDay(today, -731) : run.since;
    for (let at = from; at <= today; at = shiftDay(at, 1)) {
      if (!isDue(run, at)) continue;
      if (done.has(at)) {
        length += 1;
        best = Math.max(best, length);
      } else if (at !== today) {
        length = 0;
      }
    }
    streak = Math.max(streak, length);
  }
  return { best, streak };
}

/** Weight of each day back, yesterday first: how quickly she forgets. */
const MEMORY = [1, 0.6, 0.36, 0.22, 0.13];

/**
 * How warm she is, 0 to 100.
 *
 * Two parts. What she woke up with: how much of what was due you kept these
 * last five days, recent days counting most. And what today has given her:
 * every habit ticked feeds her straight away. The morning after a perfect
 * week she is warm, not blazing - the blaze is what today's ticks are for.
 * After five days of nothing she is down to embers, and one day's habits
 * bring her straight back up to warm: relief, not a debt to work off.
 *
 * Days with nothing due are skipped rather than counted as missed, and with
 * no habits at all she is simply warm, and asks for one.
 */
export function warmthOf(runs: readonly HabitRun[], today: string): number {
  if (runs.length === 0) return 60;
  const share = (day: string): number | null => {
    const due = runs.filter((run) => isDue(run, day));
    if (due.length === 0) return null;
    return Math.min(1, due.filter((run) => run.days.includes(day)).length / due.length);
  };
  let weighed = 0;
  let weight = 0;
  MEMORY.forEach((w, back) => {
    const kept = share(shiftDay(today, -(back + 1)));
    if (kept === null) return;
    weighed += kept * w;
    weight += w;
  });
  const woke = weight > 0 ? (weighed / weight) * 100 : 60;
  const fed = share(today) ?? 0;
  return Math.round(Math.max(0, Math.min(100, woke * 0.75 + fed * 60)));
}

export type Warmth = "blazing" | "warm" | "low" | "embers";

export function warmthBand(warmth: number): Warmth {
  if (warmth >= 80) return "blazing";
  if (warmth >= 45) return "warm";
  if (warmth >= 20) return "low";
  return "embers";
}

/** How many of each kind she knows, out of how many there are. */
export function collected(learned: ReadonlySet<string>): Record<Learnable["kind"], { have: number; of: number }> {
  const count = (kind: Learnable["kind"]) => {
    const all = LADDER.filter((rung) => rung.item.kind === kind);
    return { have: all.filter((rung) => learned.has(keyOf(rung.item))).length, of: all.length };
  };
  return { dance: count("dance"), costume: count("costume"), way: count("way"), garment: count("garment") };
}
