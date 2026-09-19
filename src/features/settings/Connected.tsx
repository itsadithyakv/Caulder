import { useEffect, useState } from "react";
import { CalendarDays, Compass, Sparkles } from "lucide-react";
import { serviceOf } from "@shared/ask";
import { Card } from "@/components/Card";
import { useWorkspace } from "@/lib/workspace";

/** Said by the Google and AI cards when either is connected or let go, so the summary beside them keeps up. */
const CHANGED = "caulder:connections";

export function announceConnections(): void {
  window.dispatchEvent(new Event(CHANGED));
}

type Status = { google: boolean; ai: string | null };

/**
 * The two connections at a glance, beside the cards that make them: whether
 * Google and an AI are connected, and the way into the setup guide, which
 * walks through both in order. Read again whenever either card changes.
 */
export function ConnectionsCard({ onOpenSetup }: { onOpenSetup: () => void }) {
  const { activeCompany } = useWorkspace();
  const companyId = activeCompany?.id ?? null;
  const [status, setStatus] = useState<Status | null>(null);

  useEffect(() => {
    if (!companyId) return;
    let live = true;
    const read = () => {
      Promise.all([window.caulder.google.state(companyId), window.caulder.ask.state()])
        .then(([google, ask]) => {
          if (live) setStatus({ google: google.connected, ai: ask.connected ? (serviceOf(ask.service ?? "")?.label ?? "An AI") : null });
        })
        .catch(() => undefined);
    };
    read();
    window.addEventListener(CHANGED, read);
    return () => {
      live = false;
      window.removeEventListener(CHANGED, read);
    };
  }, [companyId]);

  const rows = [
    {
      icon: <CalendarDays size={16} aria-hidden />,
      name: "Google",
      what: "Your day's blocks and tasks, both ways, and email from your own Gmail.",
      on: status?.google ?? false,
      said: status?.google ? "Connected" : "Not yet",
    },
    {
      icon: <Sparkles size={16} aria-hidden />,
      name: "An AI",
      what: "Ask the brain about the company, from everything written in it.",
      on: status?.ai != null,
      said: status?.ai ?? "Not yet",
    },
  ];

  return (
    <Card
      title="Two connections"
      icon={<Compass size={16} aria-hidden />}
      hint="Both optional - Caulder works without either. About five minutes each."
      className="connections"
    >
      <ul className="connections__list">
        {rows.map((row) => (
          <li key={row.name} className="connections__row">
            <span className={`connections__icon${row.on ? " connections__icon--on" : ""}`}>{row.icon}</span>
            <span className="connections__text">
              <span className="connections__name">{row.name}</span>
              <span className="connections__what">{row.what}</span>
            </span>
            <span className={`badge ${row.on ? "badge--ok" : "badge--neutral"}`}>{row.said}</span>
          </li>
        ))}
      </ul>
      <div className="connections__foot">
        <button type="button" className="btn btn--sm" onClick={onOpenSetup}>
          Open the setup guide
        </button>
        <span className="card__hint">The same cards, in order, with what each is for.</span>
      </div>
    </Card>
  );
}
