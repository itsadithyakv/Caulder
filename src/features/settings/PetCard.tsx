import { useEffect, useState } from "react";
import { Card } from "@/components/Card";
import { ErrorLine } from "@/components/ErrorLine";
import { messageOf } from "@/lib/errors";
import { setEmberPref, useEmberPref } from "@/lib/emberPrefs";
import type { PetState } from "@shared/ipc";
import type { PetForm } from "@shared/pet";

/** On the taskbar: as she is, as a dot, or not at all. */
const FORMS: { id: PetForm; label: string }[] = [
  { id: "dot", label: "A small dot" },
  { id: "walk", label: "Walking" },
  { id: "off", label: "Hidden" },
];

/**
 * Ember: in the app or not, how she is on the taskbar - a dot, walking, or
 * hidden - whether she makes a noise, and whether she plays.
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

  async function choose(form: PetForm) {
    setBusy(true);
    setProblem(null);
    try {
      setState(await window.caulder.pet.show(form));
    } catch (error) {
      setProblem(messageOf(error));
    } finally {
      setBusy(false);
    }
  }

  const form = state?.form ?? null;

  return (
    <Card title="Ember" hint="The little flame on the quick line. Click her to ask the AI anything; drag her anywhere.">
      <ErrorLine>{problem}</ErrorLine>

      <Switch label="Ember in the app" on={out} onChange={(next) => setEmberPref("out", next)} />
      <p className="card__hint pet__rules">
        She lives behind a little door on the quick line: out in the morning, in at night. Knock and she answers.
      </p>

      <span className="checkline__title pet__formsTitle" id="pet-taskbar">
        On the taskbar
      </span>
      <div className="tabs pet__forms" role="radiogroup" aria-labelledby="pet-taskbar">
        {FORMS.map((option) => (
          <button
            key={option.id}
            type="button"
            role="radio"
            className="tab"
            aria-checked={form === option.id}
            disabled={busy || form === null}
            onClick={() => void choose(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>
      <ul className="card__hint pet__rules">
        <li>
          Out there while Caulder is not the window in front. <strong>A small dot</strong> rests by the clock and comes
          out when you point at it; <strong>walking</strong>, she walks the top of the taskbar.
        </li>
        <li>
          She holds up what is waiting - a bell when a block starts within ten minutes, a letter when somebody has
          replied, papers when something is overdue - and the dot glows brighter for it. Click her and Caulder opens on
          Today.
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
