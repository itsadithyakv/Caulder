import { remembered } from "@shared/voice";

/**
 * The window's half of shared/voice.ts: the memory and the dice.
 *
 * What has been shown is kept in this browser's storage - it is a convenience,
 * not a record, and if it is lost the worst that happens is an example shown
 * twice. Every read and write can fail (a private profile, storage cleared
 * underneath it), and none of them may stop the window from drawing.
 *
 * A slot is said once per stamp. The stamp is what makes it speak again: the
 * quick window opened another time.
 */

const STORE = "caulder.said";
const said = new Map<string, { stamp: string; value: { key: string } }>();

function seenIn(slot: string): string[] {
  try {
    const all = JSON.parse(window.localStorage.getItem(STORE) ?? "{}") as Record<string, unknown>;
    const mine = all[slot];
    return Array.isArray(mine) ? mine.filter((each): each is string => typeof each === "string") : [];
  } catch {
    return [];
  }
}

function keep(slot: string, seen: string[]): void {
  try {
    const all = JSON.parse(window.localStorage.getItem(STORE) ?? "{}") as Record<string, unknown>;
    window.localStorage.setItem(STORE, JSON.stringify({ ...all, [slot]: seen }));
  } catch {
    // Shown twice, then. Not worth a word to anybody.
  }
}

export function sayOnce<T extends { key: string }>(slot: string, stamp: string, choose: (seen: string[], seed: number) => T): T {
  const before = said.get(slot);
  if (before && before.stamp === stamp) return before.value as T;
  const seen = seenIn(slot);
  const value = choose(seen, Math.floor(Math.random() * 100000));
  said.set(slot, { stamp, value });
  keep(slot, remembered(seen, value.key));
  return value;
}
