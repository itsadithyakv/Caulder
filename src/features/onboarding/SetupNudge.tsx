import { useEffect, useId, useState } from "react";
import { ArrowRight, X } from "lucide-react";

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
 * be set up or skipped on its own, and "Skip all" is one press: a nudge that
 * cannot be dismissed is a nag. Skipping is remembered on this machine only,
 * and costs nothing - Settings has all of it, always.
 *
 * It is one line, not a card. It used to be a card with a paragraph for each
 * thing, and it stood between the quick line and the day's work, pushing the
 * first overdue task off the bottom of the window. An offer is worth a line;
 * what each one gives is on hover, and read out to a screen reader.
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
  const id = useId();
  /** Null until asked: a line that appears and vanishes as the answers come in is worse than one a moment late. */
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
    <section className="setupnudge" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="setupnudge__title">
        Finish setting up
      </h2>
      <ul className="setupnudge__items" aria-label="What is left to set up">
        {left.map((item) => (
          <li key={item.id} className="setupnudge__item">
            {/* The name is the button: one press to the guide, where the steps
                are. What it gives is read out with it, and shown on hover. */}
            <button
              type="button"
              className="setupnudge__go"
              onClick={onSetUp}
              title={item.gives}
              aria-describedby={`${id}-${item.id}`}
            >
              {item.title}
              <ArrowRight size={13} aria-hidden />
            </button>
            <span id={`${id}-${item.id}`} className="visually-hidden">
              {item.gives}
            </span>
            <button
              type="button"
              className="setupnudge__skip"
              onClick={() => skip([item.id])}
              aria-label={`Skip: ${item.title}`}
              title="Skip this one"
            >
              <X size={13} aria-hidden />
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="btn btn--sm btn--ghost setupnudge__all"
        onClick={() => skip(left.map((item) => item.id))}
        title="Optional, and each can wait. Everything in Caulder works without them, and Settings has all of it."
      >
        Skip all
      </button>
    </section>
  );
}
