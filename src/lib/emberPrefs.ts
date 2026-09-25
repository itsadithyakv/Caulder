import { useEffect, useState } from "react";

/**
 * Three switches for Ember, kept per machine.
 *
 * - **out**: whether she comes out of her door at all. Off, the door stays
 *   shut and the app is just an app.
 * - **sound**: whether she makes any noise at all.
 * - **play**: whether she answers pokes and has a temper. Off, a click on her
 *   is only ever "ask the AI", and nothing you do makes her cross.
 *
 * Browser storage rather than the settings table, because both are about
 * this machine and this person's patience, not about the data, and because
 * her taskbar window reads them too: it is the same origin, so it shares the
 * storage and hears the `storage` event when Settings changes one.
 *
 * All default to on. They are the fun, and the switch is there for the day
 * it stops being.
 */

type EmberPref = "out" | "sound" | "play";

const KEYS: Record<EmberPref, string> = { out: "caulder.ember.out", sound: "caulder.ember.sound", play: "caulder.ember.play" };

const local = new Set<() => void>();

export function emberPref(pref: EmberPref): boolean {
  try {
    return window.localStorage.getItem(KEYS[pref]) !== "off";
  } catch {
    return true;
  }
}

export function setEmberPref(pref: EmberPref, on: boolean): void {
  try {
    window.localStorage.setItem(KEYS[pref], on ? "on" : "off");
  } catch {
    // Storage refused (a locked-down profile): there is nowhere to keep the
    // choice, so she stays on her default, which is the honest answer.
  }
  for (const listener of local) listener();
}

export function useEmberPref(pref: EmberPref): boolean {
  const [on, setOn] = useState(() => emberPref(pref));
  useEffect(() => {
    const read = () => setOn(emberPref(pref));
    local.add(read);
    window.addEventListener("storage", read);
    return () => {
      local.delete(read);
      window.removeEventListener("storage", read);
    };
  }, [pref]);
  return on;
}
