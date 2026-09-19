import { useEffect, useState } from "react";
import type { DecisionEntry } from "@shared/brain";
import { ErrorLine } from "@/components/ErrorLine";
import { formatDay, formatMonth } from "@/lib/format";
import { messageOf } from "@/lib/errors";

/**
 * The Decisions section as a log: newest first, a month to a heading, each
 * with what was decided in a line and who decided it. A decision to look at
 * again says when; that day reaches Today too.
 */
export function DecisionLog({
  companyId,
  version,
  onOpen,
}: {
  companyId: string;
  version: number;
  onOpen: (pageId: string) => void;
}) {
  const [entries, setEntries] = useState<DecisionEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    window.caulder.brain.decisions(companyId).then(
      (next) => live && setEntries(next),
      (cause: unknown) => live && setError(messageOf(cause)),
    );
    return () => {
      live = false;
    };
  }, [companyId, version]);

  if (!entries) return <ErrorLine>{error}</ErrorLine>;
  if (entries.length === 0) return null;

  // A month to a heading; a decision with no date is filed under "Not dated".
  const groups: { key: string; label: string; entries: DecisionEntry[] }[] = [];
  for (const entry of entries) {
    const key = entry.decidedOn ? entry.decidedOn.slice(0, 7) : "undated";
    let group = groups.find((each) => each.key === key);
    if (!group) {
      group = { key, label: entry.decidedOn ? formatMonth(entry.decidedOn) : "Not dated", entries: [] };
      groups.push(group);
    }
    group.entries.push(entry);
  }

  return (
    <div className="decisionlog">
      {groups.map((group) => (
        <section key={group.key} className="decisionlog__month" aria-label={group.label}>
          <h3 className="decisionlog__heading">{group.label}</h3>
          <ol className="decisionlog__list">
            {group.entries.map((entry) => (
              <li key={entry.id} className="decisionlog__entry">
                <button type="button" className="decisionlog__open" onClick={() => onOpen(entry.id)}>
                  <span className="decisionlog__title">{entry.title}</span>
                  {entry.summary && <span className="decisionlog__summary">{entry.summary}</span>}
                  <span className="decisionlog__meta">
                    {[
                      entry.decidedOn ? formatDay(entry.decidedOn) : null,
                      entry.decidedBy ? `decided by ${entry.decidedBy}` : null,
                    ]
                      .filter(Boolean)
                      .join(", ")}
                    {entry.revisitOn && <span className="badge badge--info">Look again {formatDay(entry.revisitOn)}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
