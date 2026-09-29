import { useCallback, useEffect, useRef, useState } from "react";
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
 *
 * **As a dot** (the default since 27 September 2026) she is a small ember by
 * the clock, brighter when something is waiting. Pointed at, she comes out;
 * left, she goes back after a moment. Clicked either way, Caulder opens.
 */

/** How long she stays out after the pointer leaves her, before she is a dot again. */
const LINGER_MS = 2500;

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
  const [form, setForm] = useState<"walk" | "dot">("dot");
  const [out, setOut] = useState(false);
  const linger = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => window.caulder.pet.onForm(setForm), []);
  useEffect(() => () => {
    if (linger.current) clearTimeout(linger.current);
  }, []);

  const enter = () => {
    if (linger.current) clearTimeout(linger.current);
    setOut(true);
    void window.caulder.pet.hover(true);
  };
  const leave = () => {
    void window.caulder.pet.hover(false);
    if (linger.current) clearTimeout(linger.current);
    linger.current = setTimeout(() => setOut(false), LINGER_MS);
  };
  const dot = form === "dot" && !out;

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
      data-form={dot ? "dot" : "her"}
      // Her colours, for the dot: the same flame she is, work or life.
      data-flame={writingMode(where?.personal ?? false)}
      data-walking={walk.moving ? "yes" : "no"}
      data-dir={walk.dir}
      data-waiting={errand ? "yes" : "no"}
      aria-label={errand ? "Open Caulder: something is waiting on Today" : "Open Caulder"}
      onMouseEnter={enter}
      onMouseLeave={leave}
      onClick={() => void window.caulder.pet.open()}
    >
      {/* The dot is the only part of her that can be pointed at while she is
          one: the rest of the window is not there for the mouse. */}
      <span className="pet__dot" aria-hidden />
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
