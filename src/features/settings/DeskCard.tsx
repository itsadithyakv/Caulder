import { useEffect, useState } from "react";
import { Card } from "@/components/Card";
import { ErrorLine } from "@/components/ErrorLine";
import { messageOf } from "@/lib/errors";
import type { WidgetState } from "@shared/ipc";
import { WIDGET_LEVELS } from "@shared/widget";

/**
 * The desk widget, switched on and placed.
 *
 * One toggle and three levels, because the whole feature is one window and
 * the only real decision about it is where in the stack it sits.
 *
 * The card says what the desktop level costs **before** it is chosen. A
 * widget pinned to the wallpaper is behind your windows and cannot be
 * clicked, and somebody who picks it and then cannot find the widget has not
 * hit a bug - they have Chrome open. There is nowhere else to say that in
 * time for it to help.
 */

export function DeskCard() {
  const [state, setState] = useState<WidgetState | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    window.caulder.widget.get().then(setState, () => undefined);
  }, []);

  async function run(work: () => Promise<WidgetState>) {
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

  const on = state?.on ?? false;
  const level = state?.level ?? "front";

  return (
    <Card
      title="Desk widget"
      hint="What is on now and what is late, on your desktop."
    >
      <ErrorLine>{problem}</ErrorLine>

      <div className="checkline">
        <button
          type="button"
          className="toggle"
          role="switch"
          aria-checked={on}
          aria-label="Show the desk widget"
          disabled={busy}
          onClick={() => void run(() => window.caulder.widget.show(!on))}
        >
          <span className="toggle__thumb" />
        </button>
        <span className="checkline__text">
          <span className="checkline__title">Show the desk widget</span>
        </span>
      </div>

      {on && (
        <>
          <div className="actions">
            {WIDGET_LEVELS.map((choice) => (
              <button
                key={choice.id}
                type="button"
                className={`btn btn--sm ${level === choice.id ? "btn--primary" : "btn--ghost"}`}
                aria-pressed={level === choice.id}
                disabled={busy}
                onClick={() => void run(() => window.caulder.widget.setLevel(choice.id))}
              >
                {choice.title}
              </button>
            ))}
          </div>

          <p className="card__hint">{WIDGET_LEVELS.find((choice) => choice.id === level)?.detail}</p>

          {/* Asked for and refused. Said plainly, because the widget is in
              front of them instead and that would otherwise look like the
              setting having been ignored. */}
          {state?.reason && (
            <p className="card__hint">
              Windows would not pin it, so it is in front.
            </p>
          )}
        </>
      )}
    </Card>
  );
}
