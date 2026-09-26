import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/Card";
import { ErrorLine } from "@/components/ErrorLine";
import { messageOf } from "@/lib/errors";
import type { UnderstandState } from "@shared/understand";

/**
 * Understanding, on this machine (PLAN.md, part five): a small model that
 * reads what you write for what it means. On by default - it reads, it never
 * sends, and it only ever offers - so the card says exactly that, how far it
 * has read, and gives the switch.
 */
export function UnderstandCard() {
  const [state, setState] = useState<UnderstandState | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // The latest state, for the timer below to read without being set up again each time it changes.
  const latest = useRef<UnderstandState | null>(null);
  latest.current = state;

  useEffect(() => {
    let live = true;
    const look = () => window.caulder.understand.state().then((next) => live && setState(next), () => undefined);
    void look();
    // While it is reading, the count moves; once it has caught up, it stops asking.
    const timer = window.setInterval(() => {
      const now = latest.current;
      if (now === null || (now.on && now.waiting > 0)) void look();
    }, 3000);
    return () => {
      live = false;
      window.clearInterval(timer);
    };
  }, []);

  async function act(work: () => Promise<UnderstandState>) {
    setBusy(true);
    setProblem(null);
    try {
      setState(await work());
    } catch (error) {
      setProblem(messageOf(error));
    } finally {
      setBusy(false);
    }
  }

  const on = state?.on ?? true;
  const label = "Read what I write for what it means";

  return (
    <Card title="Understanding" hint="A small model on this computer that reads your pages, memories, contacts, tasks and notes for what they mean.">
      <ErrorLine>{problem}</ErrorLine>

      <div className="checkline">
        <button
          type="button"
          className="toggle"
          role="switch"
          aria-checked={on}
          aria-label={label}
          disabled={busy || state === null}
          onClick={() => void act(() => window.caulder.understand.set(!on))}
        >
          <span className="toggle__thumb" />
        </button>
        <span className="checkline__title">{label}</span>
      </div>
      <p className="card__hint">
        Nothing it reads leaves this computer, and it never files, moves or links anything by itself: it only offers.
        The journal and private lines are never read.
      </p>

      {state && !state.here && (
        <p className="card__hint" role="status">
          The model is not on this computer, so nothing is being read. Caulder works the same without it.
        </p>
      )}
      {state?.here && state.on && (
        <p className="card__hint" role="status">
          {state.waiting > 0
            ? `Read ${state.read.toLocaleString()} so far; ${state.waiting.toLocaleString()} waiting.`
            : `Read ${state.read.toLocaleString()} things, and up to date.`}
        </p>
      )}

      {state?.here && state.on && (
        <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => void act(() => window.caulder.understand.again())}>
          Read everything again
        </button>
      )}
    </Card>
  );
}
