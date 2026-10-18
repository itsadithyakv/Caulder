import { useEffect, useState } from "react";
import { Undo2 } from "lucide-react";
import type { AnswerInput, Guess, NameKept, TuneState } from "@shared/tune";
import { messageOf } from "@/lib/errors";
import { useWorkspace } from "@/lib/workspace";
import { Card } from "@/components/Card";
import { Explain } from "@/components/Explain";

/**
 * Tune: a minute, when there is one, spent on what the quick-add line was
 * unsure of.
 *
 * One question at a time, each answered with one press - the way a photo
 * library asks whether two faces are the same person. The line itself never
 * asks these: the moment a task is being written down is the wrong moment for
 * a quiz, so it guesses, says so, and leaves the question here.
 *
 * "Later" answers nothing and moves on, and it is only later for this visit:
 * nothing is written, so the question is back next time. Every answer that
 * was given is listed underneath with a way to take it back, because a wrong
 * press here should cost exactly one more.
 */
export function TuneCard() {
  const [state, setState] = useState<TuneState>({ asking: [], settled: [] });
  /** Who a word means in this company, kept from answers the line was given (part twelve, phase 48). */
  const { activeCompany } = useWorkspace();
  const [names, setNames] = useState<NameKept[]>([]);
  /** Put off for this visit only. */
  const [later, setLater] = useState<readonly string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void window.caulder.tune.get().then(setState, () => undefined);
  }, []);

  useEffect(() => {
    if (!activeCompany) return;
    void window.caulder.tune.names(activeCompany.id).then(setNames, () => undefined);
  }, [activeCompany]);

  async function forgetName(id: string) {
    try {
      await window.caulder.tune.forgetName(id);
      setNames((current) => current.filter((name) => name.id !== id));
    } catch (cause) {
      setError(messageOf(cause));
    }
  }

  const waiting = state.asking.filter((guess) => !later.includes(guess.id));
  const asked = waiting[0];

  async function settle(change: () => Promise<TuneState>) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      setState(await change());
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
    }
  }

  const answer = (input: AnswerInput) => settle(() => window.caulder.tune.answer(input));

  return (
    <Card
      title="Tune"
      hint="What the quick-add line was unsure of, asked one at a time. Each answer is one press."
      actions={waiting.length > 0 ? <span className="section-head__count">{waiting.length} to go</span> : undefined}
    >
      {asked ? (
        <div className="tune" role="group" aria-label="A question about something you typed">
          <Question guess={asked} />
          <div className="tune__answers">
            <button
              type="button"
              className="btn btn--sm btn--primary"
              disabled={busy}
              onClick={() => void answer({ id: asked.id, verdict: "same" })}
            >
              Yes, same thing
            </button>
            <button
              type="button"
              className="btn btn--sm"
              disabled={busy}
              onClick={() => void answer({ id: asked.id, verdict: "keep" })}
            >
              No, leave &ldquo;{asked.typed}&rdquo; alone
            </button>
            <button
              type="button"
              className="btn btn--sm btn--ghost"
              disabled={busy}
              onClick={() => setLater((current) => [...current, asked.id])}
            >
              Later
            </button>
          </div>
        </div>
      ) : (
        <p className="card__hint">
          {state.asking.length > 0
            ? "That is all for now."
            : "Nothing to ask."}
        </p>
      )}

      {error && (
        <p className="field__error" role="alert">
          {error}
        </p>
      )}

      {names.length > 0 && (
        <ul className="rules" aria-label="Who a word means">
          {names.map((name) => (
            <li key={name.id} className="rule">
              <span className="rule__text">
                <strong>{name.said}</strong> is {name.leadName}
              </span>
              <button
                type="button"
                className="btn btn--sm btn--ghost"
                onClick={() => void forgetName(name.id)}
                aria-label={`Forget who "${name.said}" means`}
                title="Forget this - the line will ask again"
              >
                <Undo2 size={14} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      {state.settled.length > 0 && (
        <ul className="rules" aria-label="What you have settled">
          {state.settled.map((entry) => (
            <li key={entry.id} className="rule">
              <span className="rule__text">
                <strong>{entry.typed}</strong>{" "}
                {entry.verdict === "same" ? <>is read as {entry.meant}</> : <>is left as typed</>}
              </span>
              <button
                type="button"
                className="btn btn--sm btn--ghost"
                onClick={() => void settle(() => window.caulder.tune.forget(entry.id))}
                aria-label={`Take back the answer about "${entry.typed}"`}
                title="Take this answer back"
              >
                <Undo2 size={14} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      <Explain>
        <p>
          The line reads &ldquo;meetining&rdquo; as a meeting and says so, rather than stopping you to
          check. Say here that it was right and it stops mentioning it; say it was wrong and it never
          touches that word again.
        </p>
      </Explain>
    </Card>
  );
}

function Question({ guess }: { guess: Guess }) {
  const often = guess.times > 1 ? ` It has come up ${guess.times} times.` : "";
  return (
    <p className="tune__question">
      You typed <strong>&ldquo;{guess.typed}&rdquo;</strong> and it was read as{" "}
      <strong>&ldquo;{guess.meant}&rdquo;</strong>. Same thing?{often}
    </p>
  );
}
