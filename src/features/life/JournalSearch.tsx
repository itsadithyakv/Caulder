import { useEffect, useState } from "react";
import { Lock, Search } from "lucide-react";
import type { JournalSearch as Found } from "@shared/life";
import { messageOf } from "@/lib/errors";
import { ErrorLine } from "@/components/ErrorLine";

/**
 * Searching the journal, locked days included while it is open. The main
 * search never finds a sealed day - its words are not in the index - so this
 * one opens each day in memory, looks, and lets go (services/journalread.ts).
 * What it found is dropped when the journal locks.
 */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function shortDay(day: string): string {
  const [year, month, date] = day.split("-").map(Number) as [number, number, number];
  return `${date} ${MONTHS[month - 1]} ${year}`;
}

export function JournalSearch({
  companyId,
  open,
  version,
  onPick,
}: {
  companyId: string;
  /** Whether the journal is unlocked: what was found goes when it locks. */
  open: boolean;
  version: number;
  onPick: (day: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<Found | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const words = query.trim();
    if (words.length < 2) {
      setFound(null);
      return;
    }
    let live = true;
    const timer = setTimeout(() => {
      window.caulder.life.search(companyId, words).then(
        (result) => {
          if (!live) return;
          setFound(result);
          setError(null);
        },
        (cause: unknown) => live && setError(messageOf(cause)),
      );
    }, 250);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [companyId, query, open, version]);

  return (
    <section className="card journalsearch" aria-label="Search the journal">
      <label className="journalsearch__field">
        <Search size={14} aria-hidden />
        <input
          className="input"
          type="search"
          placeholder="Search the journal"
          aria-label="Search the journal"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      {found && (
        <>
          {found.found.length === 0 ? (
            <p className="card__hint">Not written anywhere{found.locked ? " you can read right now" : ""}.</p>
          ) : (
            <ul className="journalsearch__list">
              {found.found.map((each, index) => (
                <li key={`${each.day}-${each.kind}-${index}`}>
                  <button type="button" className="journalsearch__hit" onClick={() => onPick(each.day)}>
                    <span className="journalsearch__day">
                      {shortDay(each.day)}
                      {each.kind === "private" && <span className="journalsearch__kind">private</span>}
                    </span>
                    <span className="journalsearch__snippet">{each.snippet}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {found.locked && (
            <p className="card__hint journalsearch__locked">
              <Lock size={12} aria-hidden /> Locked days were not searched. Unlock the journal to search them too.
            </p>
          )}
        </>
      )}
      <ErrorLine>{error}</ErrorLine>
    </section>
  );
}
