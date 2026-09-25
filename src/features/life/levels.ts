import { useEffect, useState } from "react";

/**
 * Whether your level, its XP and the achievements are shown (Settings ›
 * Appearance). On unless it has been switched off, so nobody who had them
 * loses them by updating.
 *
 * Kept in the settings table rather than browser storage because it is about
 * the person, not the machine. Read once and shared: Today's strip, Life's
 * overview and the Settings switch all ask, and a change in Settings reaches
 * the other two without a reload.
 */

let known: boolean | null = null;
let asking: Promise<boolean> | null = null;
const listeners = new Set<(shown: boolean) => void>();

function tell(shown: boolean): void {
  known = shown;
  for (const listener of listeners) listener(shown);
}

function ask(): Promise<boolean> {
  asking ??= window.caulder.progress.shown().then(
    (shown) => {
      tell(shown);
      return shown;
    },
    // Unreadable is treated as on: the default, and the one that hides nothing.
    () => {
      asking = null;
      return true;
    },
  );
  return asking;
}

/** Switches levels on or off, for everybody listening. */
export async function setShowLevels(on: boolean): Promise<boolean> {
  const before = known ?? true;
  // Said at once, so the box and the screens behind it move together.
  tell(on);
  try {
    const now = await window.caulder.progress.setShown(on);
    if (now !== on) tell(now);
    return now;
  } catch {
    // Not kept: back to what it was, rather than a switch that lies until restart.
    tell(before);
    return before;
  }
}

/**
 * The switch as it stands: null until the first answer is in, which Settings
 * needs so its box does not tick itself a moment after opening.
 */
export function useLevelsSetting(): boolean | null {
  const [shown, setShown] = useState<boolean | null>(known);
  useEffect(() => {
    let live = true;
    const hear = (next: boolean) => live && setShown(next);
    listeners.add(hear);
    if (known === null) void ask().then(hear);
    else setShown(known);
    return () => {
      live = false;
      listeners.delete(hear);
    };
  }, []);
  return shown;
}

/**
 * True while levels are shown. False until the answer is in: everything it
 * gates reads its own numbers asynchronously anyway, so nothing that is going
 * to be shown is held back, and nothing switched off blinks up first.
 */
export function useShowLevels(): boolean {
  return useLevelsSetting() === true;
}
