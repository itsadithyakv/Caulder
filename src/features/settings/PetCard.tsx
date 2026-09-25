import { useEffect, useState } from "react";
import { Card } from "@/components/Card";
import { ErrorLine } from "@/components/ErrorLine";
import { messageOf } from "@/lib/errors";
import { setEmberPref, useEmberPref } from "@/lib/emberPrefs";
import type { PetState } from "@shared/ipc";

/**
 * Ember: out on the taskbar or not, whether she makes a noise, and whether
 * she plays.
 *
 * Three switches, each with what it does written under it, because a
 * character that walks the screen, talks and has a temper is either company
 * or an irritation, and which one is a matter of taste nobody else can decide.
 */
export function PetCard() {
  const [state, setState] = useState<PetState | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const out = useEmberPref("out");
  const sound = useEmberPref("sound");
  const play = useEmberPref("play");

  useEffect(() => {
    window.caulder.pet.get().then(setState, () => undefined);
  }, []);

  async function toggle(on: boolean) {
    setBusy(true);
    setProblem(null);
    try {
      setState(await window.caulder.pet.show(on));
    } catch (error) {
      setProblem(messageOf(error));
    } finally {
      setBusy(false);
    }
  }

  const on = state?.on ?? false;

  return (
    <Card title="Ember" hint="The little flame on the quick line. Click her to ask the AI anything; drag her anywhere.">
      <ErrorLine>{problem}</ErrorLine>

      <Switch label="Ember in the app" on={out} onChange={(next) => setEmberPref("out", next)} />
      <p className="card__hint pet__rules">
        She lives behind a little door on the quick line: out in the morning, in at night. Knock and she answers.
      </p>

      <Switch label="Let Ember out on the taskbar" on={on} disabled={busy} onChange={(next) => void toggle(next)} />
      <ul className="card__hint pet__rules">
        <li>
          She walks the top of the taskbar while Caulder is not the window in front, and holds up what is waiting: a
          bell when a block starts within ten minutes, a letter when somebody has replied, papers when something is
          overdue. Click her and Caulder opens on Today.
        </li>
        <li>Clicks go straight through her to whatever is underneath, unless you are pointing right at her.</li>
      </ul>

      <Switch label="Her sounds" on={sound} onChange={(next) => setEmberPref("sound", next)} />
      <p className="card__hint pet__rules">
        Bonks, whooshes and catchphrases, in whoever&rsquo;s voice she is doing. Only ever for something you did - a
        poke, a throw, a task finished. What she gets up to on her own is silent.
      </p>

      <Switch label="Poking, and her temper" on={play} onChange={(next) => setEmberPref("play", next)} />
      <p className="card__hint pet__rules">
        A poke on the head, the belly or the feet each gets a different answer. Poke her, throw her about or drop her
        too often and she gets cross, then furious, and the screen goes up with her until she has a marshmallow.
      </p>
    </Card>
  );
}

function Switch({
  label,
  on,
  disabled = false,
  onChange,
}: {
  label: string;
  on: boolean;
  disabled?: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <div className="checkline">
      <button
        type="button"
        className="toggle"
        role="switch"
        aria-checked={on}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!on)}
      >
        <span className="toggle__thumb" />
      </button>
      <span className="checkline__title">{label}</span>
    </div>
  );
}
