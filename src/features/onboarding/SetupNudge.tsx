import { useEffect, useState } from "react";
import { ArrowRight, X } from "lucide-react";
import { Card } from "@/components/Card";

/**
 * What is still unconnected, offered on Today until it is connected or waved away.
 *
 * The setup guide is shown once, at the moment a company is made - so anybody
 * whose company is older than the guide, or who took the sample for a look
 * round, or who simply clicked away, was never asked again. And what was never
 * offered looks like what is not there: email from Gmail, the day on a phone,
 * a contact saved to it, a backup in Drive are all the Google connection, and
 * without it none of them is anywhere to be seen.
 *
 * So this asks, for as long as there is something to ask about. Each thing can
 * be set up or skipped on its own, and "Skip all of this" is one press: a
 * nudge that cannot be dismissed is a nag. Skipping is remembered on this
 * machine only, and costs nothing - Settings has all of it, always.
 */

type Item = { id: "google" | "ai"; title: string; gives: string };

const ITEMS: readonly Item[] = [
  {
    id: "google",
    title: "Connect Google",
    gives:
      "Your day and tasks on your phone, email sent from your own Gmail with a follow-up that goes by itself, contacts saved to your phone, and backups in your Drive. About five minutes, in your own Google account: there is no Caulder account to make.",
  },
  {
    id: "ai",
    title: "Connect an AI",
    gives: "Ask the brain questions about your contacts, your deals and your notes, with your own key.",
  },
];

const KEY = "caulder.setup.skipped";

function readSkipped(): string[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(stored) ? stored.filter((each): each is string => typeof each === "string") : [];
  } catch {
    return [];
  }
}

export function SetupNudge({ companyId, onSetUp }: { companyId: string; onSetUp: () => void }) {
  /** Null until asked: a card that appears and vanishes as the answers come in is worse than one a moment late. */
  const [connected, setConnected] = useState<Record<Item["id"], boolean> | null>(null);
  const [skipped, setSkipped] = useState<string[]>(readSkipped);

  useEffect(() => {
    let live = true;
    // Both are cheap and offline: what is stored, not a request to anybody.
    Promise.all([
      window.caulder.google.state(companyId).then((state) => state.connected, () => true),
      window.caulder.ask.state().then((state) => state.connected, () => true),
    ]).then(([google, ai]) => live && setConnected({ google, ai }));
    return () => {
      live = false;
    };
  }, [companyId]);

  function skip(ids: readonly string[]) {
    const next = [...new Set([...skipped, ...ids])];
    setSkipped(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // Not remembered, so it asks again next time - which is only what it did before.
    }
  }

  if (!connected) return null;
  const left = ITEMS.filter((item) => !connected[item.id] && !skipped.includes(item.id));
  if (left.length === 0) return null;

  return (
    <Card
      title="Finish setting up"
      hint="Optional, and each can wait. Everything in Caulder works without them."
      actions={
        <button type="button" className="btn btn--sm btn--ghost" onClick={() => skip(left.map((item) => item.id))}>
          Skip all of this
        </button>
      }
    >
      <ul className="rules" aria-label="What is left to set up">
        {left.map((item) => (
          <li key={item.id} className="rule">
            <span className="rule__text">
              <strong>{item.title}.</strong> {item.gives}
            </span>
            <button type="button" className="btn btn--sm btn--primary" onClick={onSetUp}>
              Set it up
              <ArrowRight size={14} aria-hidden />
            </button>
            <button type="button" className="btn btn--sm btn--ghost" onClick={() => skip([item.id])} aria-label={`Skip: ${item.title}`}>
              <X size={14} aria-hidden />
              Skip
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
