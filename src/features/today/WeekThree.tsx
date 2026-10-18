import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import type { WeekThing } from "@shared/week";
import { messageOf } from "@/lib/errors";

/**
 * The week's three things, at the head of Today until each is done or the
 * week ends (PLAN.md, part eight, phase 35). Chosen at the head of the
 * Calendar's week; ticked here. Nothing at all when there are none left.
 */
export function WeekThree({ companyId }: { companyId: string }) {
  const [things, setThings] = useState<WeekThing[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const read = () => window.caulder.week.things(companyId).then(setThings, () => undefined);
    void read();
    window.addEventListener("focus", read);
    return () => window.removeEventListener("focus", read);
  }, [companyId]);

  const left = things.filter((thing) => !thing.done);
  if (left.length === 0) return null;

  async function tick(thing: WeekThing) {
    setError(null);
    try {
      await window.caulder.week.markThing(thing.id, true);
      setThings((current) => current.map((each) => (each.id === thing.id ? { ...each, done: true } : each)));
    } catch (cause) {
      setError(messageOf(cause));
    }
  }

  return (
    <section className="weekthree" aria-label="This week's three">
      <span className="weekthree__label">This week</span>
      <ul className="weekthree__list">
        {left.map((thing) => (
          <li key={thing.id} className="weekthree__item">
            <button type="button" className="taskrow__tick" onClick={() => void tick(thing)} aria-label={`Done: ${thing.text}`} title="Done">
              <Check size={14} aria-hidden />
            </button>
            <span>{thing.text}</span>
          </li>
        ))}
      </ul>
      {error && (
        <p className="field__error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
