import { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { Fact } from "@shared/domain";
import { formatDate } from "@/lib/format";
import { messageOf } from "@/lib/errors";

/**
 * Known about them: what stays true about a contact, said to the quick line
 * (PLAN.md, part twelve, phase 49) - "prefers WhatsApp", "address is 12 King
 * St", "on leave till the 20th", a birthday. Kept here rather than on their
 * history, where a fact and a call would read alike. Nothing at all when
 * nothing is known: the line is where a fact is said, so this is not a form.
 */
export function KnownAbout({ leadId, version = 0 }: { leadId: string; version?: number }) {
  const [facts, setFacts] = useState<Fact[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    window.caulder.facts.list(leadId).then(
      (found) => live && setFacts(found),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [leadId, version]);

  async function remove(id: string) {
    setError(null);
    try {
      await window.caulder.facts.remove(id);
      setFacts((current) => current.filter((fact) => fact.id !== id));
    } catch (cause) {
      setError(messageOf(cause));
    }
  }

  if (facts.length === 0) return null;

  return (
    <div className="knownabout">
      <span className="field__label">Known about them</span>
      <ul className="knownabout__list">
        {facts.map((fact) => (
          <li key={fact.id} className="knownabout__item">
            <span className="knownabout__text">
              {fact.text}
              {fact.until && <span className="knownabout__until"> · until {formatDate(fact.until)}</span>}
            </span>
            <button
              type="button"
              className="btn btn--sm btn--ghost btn--icon"
              onClick={() => void remove(fact.id)}
              aria-label={`Remove "${fact.text}"`}
              title="Not true any more"
            >
              <X size={14} aria-hidden />
            </button>
          </li>
        ))}
      </ul>
      {error && (
        <p className="field__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
