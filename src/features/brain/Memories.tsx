import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Search, Sparkles, Waypoints } from "lucide-react";
import { sectionOf } from "@shared/brain";
import { groupMemories, type Memory } from "@shared/memories";
import { sayTrail } from "@shared/branches";
import { Card } from "@/components/Card";
import { EmptyState } from "@/components/EmptyState";
import { formatDate } from "@/lib/format";

/**
 * Everything the line was told to remember, in one place.
 *
 * A memory is a dated line on a page in your own brain, so until now seeing
 * one meant knowing which page to open - and with a company chosen, its brain
 * was the wrong brain to look in. This reads them all back: grouped by what
 * they are about, newest first, searchable, and each group opens its page.
 *
 * They are yours, not the company's, so this shows the same thing whichever
 * company is open, and says so.
 */
export function Memories({
  version,
  onOpenPage,
  onOpenMap,
}: {
  version: number;
  /** Your own map, where these hang together. */
  onOpenMap: () => void;
  /** The page knows which workspace it is in, which is not always the one that is open. */
  onOpenPage: (pageId: string) => void;
}) {
  const [found, setFound] = useState<{ companyId: string | null; memories: Memory[]; trails: Record<string, string[]> } | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let live = true;
    window.caulder.brain.memories().then((next) => live && setFound(next), () => live && setFound({ companyId: null, memories: [], trails: {} }));
    return () => {
      live = false;
    };
  }, [version]);

  const groups = useMemo(() => groupMemories(found?.memories ?? [], search), [found, search]);
  if (!found) return null;

  if (found.memories.length === 0) {
    return (
      <EmptyState
        icon={<Sparkles size={24} className="empty__icon" aria-hidden />}
        title="Nothing remembered yet"
        body="Tell the line on Today something worth keeping - “red rising is a book by pierce brown”, “fun fact: honey never spoils”, “hit a pr, 45kg on the bench for 3” - and it is filed here, under what it is about."
      />
    );
  }

  return (
    <div className="memories">
      <header className="memories__head">
        <h2 className="brainhome__name">Memories</h2>
        <p className="card__hint">
          {found.memories.length === 1 ? "One thing" : `${found.memories.length} things`} the line on Today was told to remember. Each is a
          dated line on a page of your own brain, and each page hangs off what it is part of - which is what your map draws.
          They are yours rather than a company&rsquo;s, so they are the same whichever company is open.{" "}
          <button type="button" className="linkbtn" onClick={onOpenMap}>
            <Waypoints size={13} aria-hidden /> See them on your map
          </button>
        </p>
        <label className="memories__search">
          <Search size={15} aria-hidden />
          <span className="visually-hidden">Search your memories</span>
          <input
            className="memories__input"
            type="search"
            placeholder="Search what you remembered"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
      </header>

      {groups.length === 0 ? (
        <p className="card__hint">Nothing remembered matches &ldquo;{search.trim()}&rdquo;.</p>
      ) : (
        <div className="memories__groups">
          {groups.map((group) => (
            <Card
              key={group.pageId}
              title={group.pageTitle}
              // Where it hangs, the whole way up; failing that, the section it is filed in.
              hint={`${sayTrail((found.trails[group.pageId] ?? []).map((title) => ({ title }))) || sectionOf(group.section).label} · ${
                group.memories.length === 1 ? "1 memory" : `${group.memories.length} memories`
              }`}
              actions={
                <button type="button" className="btn btn--sm btn--ghost" onClick={() => onOpenPage(group.pageId)}>
                  Open the page
                  <ArrowRight size={14} aria-hidden />
                </button>
              }
            >
              <ul className="memories__list">
                {group.memories.map((memory, index) => (
                  <li key={`${memory.day}-${index}`} className="memories__item">
                    <span className="memories__says">
                      {memory.fact && <strong className="memories__fact">{memory.fact}</strong>}
                      {memory.fact && " · "}
                      {memory.says}
                    </span>
                    <time className="memories__day" dateTime={memory.day}>
                      {formatDate(memory.day)}
                    </time>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
