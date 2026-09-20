import { useEffect, useState } from "react";
import { Lock, Trash2 } from "lucide-react";
import { FEELING_LABEL, type PrivateDay } from "@shared/private";
import { messageOf } from "@/lib/errors";

/**
 * A day's private lines, under its entry: the things jotted into the quick
 * line that were nobody else's business (shared/private.ts).
 *
 * Read only here, and only with the journal open. While it is locked this says
 * how many there are and nothing about them - not who, not what kind of
 * feeling - because a list of "A worry, about Julia" is most of the secret.
 *
 * Each is shown with what it was and who it was about, which is the
 * structure that makes them worth reading back: a year of them can be read
 * for one person, or for what kept going wrong, rather than only by date.
 */
export function PrivateLines({
  companyId,
  day,
  /** Bumped when the journal is locked or unlocked, so this reads again. */
  version = 0,
}: {
  companyId: string;
  day: string;
  version?: number;
}) {
  const [lines, setLines] = useState<PrivateDay | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    window.caulder.life.privateDay(companyId, day).then(
      (next) => live && setLines(next),
      (cause: unknown) => live && setError(messageOf(cause)),
    );
    return () => {
      live = false;
    };
  }, [companyId, day, version]);

  if (error) return <p className="field__error" role="alert">{error}</p>;
  if (!lines || lines.count === 0) return null;

  async function remove(id: string) {
    try {
      await window.caulder.life.removePrivate(id);
      setLines(await window.caulder.life.privateDay(companyId, day));
    } catch (cause) {
      setError(messageOf(cause));
    }
  }

  return (
    <section className="privatelines" aria-label="Private lines">
      <h3 className="privatelines__title">
        <Lock size={13} aria-hidden />
        Private
      </h3>

      {lines.locked && (
        <p className="card__hint">
          {lines.count === 1 ? "One private line" : `${lines.count} private lines`} from this day, locked. Unlock the
          journal to read {lines.count === 1 ? "it" : "them"}.
        </p>
      )}
      {!lines.passcode && (
        <p className="card__hint card__hint--warn">
          These are kept apart from everything else, but they are not locked: the journal has no passcode yet. Set one
          and they are sealed at once, and every one after them as it is written.
        </p>
      )}

      <ul className="privatelines__list">
        {lines.lines.map((line) => (
          <li key={line.id} className="privateline">
            <p className="privateline__what">
              {FEELING_LABEL[line.feeling]}
              {line.people.length > 0 ? ` · ${line.people.join(", ")}` : ""}
            </p>
            <p className="privateline__text">{line.text}</p>
            <button
              type="button"
              className="btn btn--sm btn--ghost btn--danger privateline__remove"
              onClick={() => void remove(line.id)}
              aria-label="Delete this private line for good"
              title="Delete for good"
            >
              <Trash2 size={13} aria-hidden />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
