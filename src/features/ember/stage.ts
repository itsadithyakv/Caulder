import { useSyncExternalStore } from "react";
import {
  bother,
  BURNS_AT,
  cooled,
  CROSS_AT,
  cueTrick,
  STREAK_MS,
  type Bother,
  type EmberCue,
  type EmberDance,
  type EmberMood,
  type EmberTrick,
  type LineMode,
  type Poke,
  type Temper,
} from "@shared/ember";
import type { EmberCostume } from "@shared/wardrobe";
import type { Warmth } from "@shared/growth";
import { emberPref } from "@/lib/emberPrefs";

/**
 * Ember's side of the app: what she has been asked to do, whether she is off
 * her perch, and how cross she is.
 *
 * A module rather than a context, because the things that talk to her are
 * all over the app - a task ticked on Today, a poke on the quick line, a
 * throw across the window - and every flame on the screen is the same person
 * listening to the same news. One channel, however many of her are drawn.
 */

/** Something for her to do: a trick by name, or a poke she decides about herself. */
export type EmberPlay =
  | { trick: EmberTrick; loud: boolean; costume?: EmberCostume; dance?: EmberDance }
  | { poke: Poke; streak: number }
  /** A line, said out loud and in her bubble: "Splat!", "Boing!". Quiet: the bubble only. */
  | { say: string; quiet?: boolean };

const players = new Set<(play: EmberPlay) => void>();

export function playEmber(play: EmberPlay): void {
  for (const player of players) player(play);
}

export function onEmberPlay(player: (play: EmberPlay) => void): () => void {
  players.add(player);
  return () => players.delete(player);
}

/**
 * Something happened that she has an answer to. You did it, so she is
 * allowed to make a noise about it. The last overdue thing gets the whole
 * routine, and the routine is Michael Jackson's, because a moonwalk is the
 * only proportionate response to an empty overdue list.
 */
/**
 * Which dance, and which costume, is hers to choose: she picks from what
 * she knows (shared/growth.ts), so a cue asks for "a dance" and she decides.
 */
export function cueEmber(cue: EmberCue): void {
  const trick = cueTrick(cue);
  if (trick === "signature") playEmber({ trick, loud: true, costume: "mj" });
  else playEmber({ trick, loud: true });
  // A task done is XP: her numbers may have moved.
  statsChanged();
}

/* ---- Where she is, and her temper ----------------------------------------- */

type EmberState = {
  /** Cross: a red face and steam. */
  cross: boolean;
  /** In flames, and the screen with her. */
  burning: boolean;
};

let state: EmberState = { cross: false, burning: false };
let temper: Temper = { heat: 0, at: 0 };
let cooling: ReturnType<typeof setInterval> | undefined;
const watchers = new Set<() => void>();

function set(next: Partial<EmberState>): void {
  state = { ...state, ...next };
  for (const watcher of watchers) watcher();
}

export function useEmberState(): EmberState {
  return useSyncExternalStore(
    (watch) => {
      watchers.add(watch);
      return () => watchers.delete(watch);
    },
    () => state,
  );
}

/** Re-reads her temper against the clock, so a cross face calms down by itself. */
function settle(): void {
  const heat = cooled(temper, Date.now());
  if (state.burning) return;
  const cross = heat >= CROSS_AT;
  if (cross !== state.cross) set({ cross });
  if (heat <= 0 && cooling) {
    clearInterval(cooling);
    cooling = undefined;
  }
}

/**
 * Something got under her skin. Only counts while she is allowed a temper:
 * with play switched off in Settings, nothing you do makes her cross, and
 * nothing sets the screen on fire.
 */
export function botherEmber(what: Bother): void {
  if (!emberPref("play") || state.burning) return;
  temper = bother(temper, what, Date.now());
  if (cooled(temper, Date.now()) >= BURNS_AT) {
    set({ burning: true, cross: true });
    return;
  }
  settle();
  cooling ??= setInterval(settle, 1000);
}

/** The marshmallow. The only known cure. */
export function feedEmber(): void {
  temper = { heat: 0, at: Date.now() };
  set({ burning: false, cross: false });
  playEmber({ trick: "munch", loud: true });
}

/* ---- Pokes ----------------------------------------------------------------- */

let lastPoke = 0;
let streak = 0;

/** A poke from wherever she is: counts the streak, bothers her, and tells her where. */
export function pokeEmber(where: Poke): void {
  const now = Date.now();
  streak = now - lastPoke <= STREAK_MS ? streak + 1 : 1;
  lastPoke = now;
  botherEmber("poke");
  playEmber({ poke: where, streak });
}

/* ---- The line she lives on ---------------------------------------------------
 *
 * Her house is on the quick line: a door at one end of it. The line says what
 * mode it is in and how it is doing - thinking while the AI reads, pleased
 * when something was kept - and she wears that, wherever she has wandered.
 * The stage says whether her door is open; the line draws it.
 */

type Line = { mode: LineMode; mood: EmberMood };

let line: Line | null = null;
const lineWatchers = new Set<() => void>();

export function setLine(next: Line | null): void {
  if (line?.mode === next?.mode && line?.mood === next?.mood) return;
  line = next;
  for (const watcher of lineWatchers) watcher();
}

export function useLine(): Line | null {
  return useSyncExternalStore(
    (watch) => {
      lineWatchers.add(watch);
      return () => lineWatchers.delete(watch);
    },
    () => line,
  );
}

type Door = "shut" | "open" | "sleeping";

let door: Door = "shut";
const doorWatchers = new Set<() => void>();

export function setDoor(next: Door): void {
  if (door === next) return;
  door = next;
  for (const watcher of doorWatchers) watcher();
}

export function useDoor(): Door {
  return useSyncExternalStore(
    (watch) => {
      doorWatchers.add(watch);
      return () => doorWatchers.delete(watch);
    },
    () => door,
  );
}

/** Somebody knocked on her door. */
const knockers = new Set<() => void>();

export function knockEmber(): void {
  for (const knocker of knockers) knocker();
}

export function onKnock(knocker: () => void): () => void {
  knockers.add(knocker);
  return () => knockers.delete(knocker);
}

/** She was clicked: the line becomes a question for the AI. */
const askers = new Set<() => void>();

export function askEmber(): void {
  for (const asker of askers) asker();
}

export function onAsk(asker: () => void): () => void {
  askers.add(asker);
  return () => askers.delete(asker);
}

/* ---- Feeding her, and hearing that something changed ------------------------
 *
 * A habit ticked is a marshmallow: the stage throws one from wherever you
 * clicked into her mouth. Anything else that moves her numbers - a task
 * done, a tick taken back - only asks the stage to read them again.
 */

const feeders = new Set<() => void>();
const readers = new Set<() => void>();

/** A habit was ticked: feed her. */
export function fedEmber(): void {
  for (const feeder of feeders) feeder();
  statsChanged();
}

export function onFed(feeder: () => void): () => void {
  feeders.add(feeder);
  return () => feeders.delete(feeder);
}

/** Something that counts towards her changed: read her numbers again. */
export function statsChanged(): void {
  for (const reader of readers) reader();
}

export function onStatsChanged(reader: () => void): () => void {
  readers.add(reader);
  return () => readers.delete(reader);
}

/* ---- How warm she is, for her door --------------------------------------------- */

let warmth: Warmth = "warm";
const warmthWatchers = new Set<() => void>();

export function setWarmth(next: Warmth): void {
  if (warmth === next) return;
  warmth = next;
  for (const watcher of warmthWatchers) watcher();
}

export function useWarmth(): Warmth {
  return useSyncExternalStore(
    (watch) => {
      warmthWatchers.add(watch);
      return () => warmthWatchers.delete(watch);
    },
    () => warmth,
  );
}
