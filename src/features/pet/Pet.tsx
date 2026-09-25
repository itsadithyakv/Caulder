import { useCallback, useEffect, useState } from "react";
import { writingMode } from "@shared/ember";
import { errandOf, type Errand } from "@shared/pet";
import { today as todayIn } from "@shared/dates";
import { doodleOf } from "@shared/wardrobe";
import { Ember, useEmberMood } from "@/components/Ember";

/**
 * Ember's own window, out on the taskbar.
 *
 * Main walks the window; this page is her. It does three things:
 *
 *  - **Finds her something to carry.** Once a minute it reads Today and asks
 *    `errandOf` whether anything is waiting - the next block, a reply,
 *    overdue work. That is the whole of her purpose out here: every thing
 *    she holds up is a fact about your day, and clicking her takes you to it.
 *  - **Says when she should stand still**, so main stops walking her for a
 *    pastime or an errand. She does not play the guitar on the move.
 *  - **Says when the pointer is on her**, so her window stops ignoring the
 *    mouse just long enough to be clicked.
 */

/** Often enough that a block ten minutes off is caught in time; rarely enough to cost nothing. */
const LOOK_MS = 60_000;

type Where = { companyId: string; timezone: string; personal: boolean };

function clock(timezone: string): { day: string; hhmm: string } {
  const now = new Date();
  let hhmm: string;
  try {
    hhmm = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(now);
  } catch {
    hhmm = now.toTimeString().slice(0, 5);
  }
  return { day: todayIn(timezone, now), hhmm };
}

export function Pet() {
  const [where, setWhere] = useState<Where | null>(null);
  const [errand, setErrand] = useState<Errand | null>(null);
  const [walk, setWalk] = useState<{ moving: boolean; dir: 1 | -1 }>({ moving: false, dir: 1 });
  const mood = useEmberMood({ busy: false, failed: false, done: false });

  // Which workspace she belongs to, which decides her colour and whose day
  // she carries errands for.
  useEffect(() => {
    let live = true;
    const read = () =>
      window.caulder.companies
        .list()
        .then((workspace) => {
          const company = workspace.companies.find((one) => one.id === workspace.activeCompanyId);
          if (live && company) {
            setWhere({ companyId: company.id, timezone: company.timezone, personal: company.kind === "personal" });
          }
        })
        .catch(() => undefined);
    void read();
    const beat = setInterval(read, LOOK_MS);
    return () => {
      live = false;
      clearInterval(beat);
    };
  }, []);

  useEffect(() => {
    if (!where) return;
    let live = true;
    const look = () =>
      window.caulder.today
        .get(where.companyId)
        .then((today) => live && setErrand(errandOf(today, clock(where.timezone))))
        // A day that will not load is a day with nothing to carry, not a
        // mascot with an error in her hand.
        .catch(() => live && setErrand(null));
    void look();
    const beat = setInterval(look, LOOK_MS);
    return () => {
      live = false;
      clearInterval(beat);
    };
  }, [where]);

  useEffect(() => window.caulder.pet.onWalk(setWalk), []);

  const still = useCallback((on: boolean) => void window.caulder.pet.hold(on), []);

  return (
    <button
      type="button"
      className="pet"
      data-walking={walk.moving ? "yes" : "no"}
      data-dir={walk.dir}
      aria-label={errand ? "Open Caulder: something is waiting on Today" : "Open Caulder"}
      onMouseEnter={() => void window.caulder.pet.hover(true)}
      onMouseLeave={() => void window.caulder.pet.hover(false)}
      onClick={() => void window.caulder.pet.open()}
    >
      <span className="pet__facing">
        <Ember
          mode={writingMode(where?.personal ?? false)}
          mood={mood}
          size={64}
          errand={errand}
          onStill={still}
          walks={walk.moving}
          dressed={where ? doodleOf(clock(where.timezone).day) : null}
          bubbles={false}
        />
      </span>
    </button>
  );
}
