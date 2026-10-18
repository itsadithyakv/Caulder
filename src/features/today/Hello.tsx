import { useEffect, useState } from "react";
import { greet } from "@shared/voice";
import { minutesOf, timeNow } from "@shared/dates";
import { NAME_GIVEN } from "@/features/onboarding/SetupNudge";

/**
 * Hello, by name, at the head of the day.
 *
 * The name is the one in Settings under "This is me". Not given, the greeting
 * simply goes without; the offer to give it is in *Finish setting up* with
 * the other things left to set up, not here - one place that asks, not one
 * on every screen.
 *
 * One plain line, by the hour, at the size of the date beside it: it says
 * nothing about the work, so it is not the biggest thing on the screen.
 */
export function Hello({ timezone }: { timezone: string }) {
  const [name, setName] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    let live = true;
    const read = () => window.caulder.me.get().then((mine) => live && setName(mine), () => live && setName(null));
    void read();
    window.addEventListener(NAME_GIVEN, read);
    return () => {
      live = false;
      window.removeEventListener(NAME_GIVEN, read);
    };
  }, []);

  // Until the name is known, say nothing: a hello that changes as it loads reads as a glitch.
  if (name === undefined) return <span className="today__greeting" aria-hidden />;
  const hour = Math.floor(minutesOf(timeNow(timezone)) / 60);
  return <span className="today__greeting">{greet(hour, name)}</span>;
}
