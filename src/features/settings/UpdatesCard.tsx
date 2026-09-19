import { useEffect, useState } from "react";
import { RefreshCw, Rocket } from "lucide-react";
import type { UpdateState } from "@shared/data";
import { Card } from "@/components/Card";
import { messageOf } from "@/lib/errors";

/**
 * Updates, in Settings: which version this is, whether a newer one is on its
 * way, and the button that puts it in. The looking and the downloading
 * happen by themselves; this is where to see it and hurry it.
 */

export function useUpdates(): UpdateState | null {
  const [state, setState] = useState<UpdateState | null>(null);
  useEffect(() => {
    let live = true;
    window.caulder.app.updates().then((next) => live && setState(next), () => undefined);
    const stop = window.caulder.app.onUpdates((next) => live && setState(next));
    return () => {
      live = false;
      stop();
    };
  }, []);
  return state;
}

function said(state: UpdateState): string {
  switch (state.status) {
    case "off":
      return "Updates are looked for in the installed app.";
    case "idle":
      return "Caulder looks for a newer version a little after it starts, and every few hours.";
    case "checking":
      return "Looking for a newer version…";
    case "current":
      return "This is the newest version.";
    case "downloading":
      return `Caulder ${state.version ?? ""} is downloading${state.percent !== null ? ` - ${state.percent}%` : ""}. It goes in when Caulder is next quit.`;
    case "ready":
      return `Caulder ${state.version ?? ""} is ready. Restart to put it in, or it goes in when Caulder is next quit.`;
    case "failed":
      return state.error ?? "Caulder could not look for a newer version just now.";
  }
}

export function UpdatesCard() {
  const state = useUpdates();
  const [error, setError] = useState<string | null>(null);
  if (!state) return null;

  return (
    <Card icon={<Rocket size={15} aria-hidden />} title="Updates" hint={`This is Caulder ${state.current}.`}>
      <p className="card__hint" role="status">
        {said(state)}
      </p>
      {error && <p className="field__error">{error}</p>}
      <div className="actions">
        {state.status === "ready" ? (
          <button
            type="button"
            className="btn btn--sm btn--primary"
            onClick={() => void window.caulder.app.installUpdate().catch((cause: unknown) => setError(messageOf(cause)))}
          >
            Restart to update
          </button>
        ) : (
          <button
            type="button"
            className="btn btn--sm"
            disabled={state.status === "off" || state.status === "checking" || state.status === "downloading"}
            onClick={() => void window.caulder.app.checkForUpdates().catch((cause: unknown) => setError(messageOf(cause)))}
          >
            <RefreshCw size={14} aria-hidden />
            Check now
          </button>
        )}
      </div>
    </Card>
  );
}
