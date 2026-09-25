import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, CalendarHeart, History, Pencil, Search, Sparkles, Trash2, Waypoints } from "lucide-react";
import { sectionOf } from "@shared/brain";
import { comingUp, groupMemories, matches, onThisDay, sayComing, type Memory } from "@shared/memories";
import { sayTrail } from "@shared/branches";
import { today as todayIn } from "@shared/dates";
import { Card } from "@/components/Card";
import { EmptyState } from "@/components/EmptyState";
import { formatDay, formatMonth } from "@/lib/format";
import { messageOf } from "@/lib/errors";
import { PageView } from "./PageView";

/**
 * Everything the line was told to remember, in one place: a screen of its own
 * under You, beside the journal and Life, because it is the part of the app
 * that is about a life rather than a company.
 *
 * A memory is a dated line on a page in your own brain (shared/memories.ts).
 * This reads them all back - by what they are about, or as a timeline - with
 * what is coming round (a birthday, an anniversary) and what was kept on this
 * day before at the top. Each can be said differently or let go, on its page,
 * where the page's history keeps what it said.
 *
 * They are yours, not the company's, so this shows the same thing whichever
 * company is open, and says so. It once sat on the company Brain's rail,
 * which was the wrong house for it: the Brain is the company's knowledge.
 */

/**
 * Memories as a screen: the list, or one of the pages it opened, with the way
 * back to the list. A page opened from here is read here, whatever section it
 * is filed in - Random knowledge, Mummy, The Way Of Kings - because the list
 * is where the person came from and where they will want to go back to. So is
 * a page linked from that page, as it is in the company's Brain.
 */
export function MemoriesScreen({
  openPageId,
  onConsumeOpenPage,
  homeNonce,
  onOpenMap,
  onOpenContact,
}: {
  /** A remembered page asked for from somewhere else: search, a link. */
  openPageId: string | null;
  onConsumeOpenPage: () => void;
  /** Bumped when the Memories row is pressed while already here: back to the list. */
  homeNonce: number;
  /** Your own map, where these hang together. */
  onOpenMap: () => void;
  onOpenContact: (leadId: string) => void;
}) {
  const [open, setOpen] = useState<{ id: string; editing: boolean } | null>(null);
  const [version, setVersion] = useState(0);
  const changed = useCallback(() => setVersion((n) => n + 1), []);

  useEffect(() => {
    if (!openPageId) return;
    const id = openPageId;
    onConsumeOpenPage();
    setOpen({ id, editing: false });
  }, [openPageId, onConsumeOpenPage]);

  useEffect(() => {
    if (homeNonce > 0) setOpen(null);
  }, [homeNonce]);

  return (
    <div className="anim-spring" key={open?.id ?? "list"}>
      {open ? (
        <PageView
          key={open.id}
          pageId={open.id}
          startEditing={open.editing}
          version={version}
          backLabel="Memories"
          onBack={() => setOpen(null)}
          onChanged={changed}
          onDeleted={() => {
            setOpen(null);
            changed();
          }}
          onOpenPage={(id) => setOpen({ id, editing: false })}
          onOpenContact={onOpenContact}
        />
      ) : (
        <Memories version={version} onOpenPage={(id) => setOpen({ id, editing: false })} onOpenMap={onOpenMap} />
      )}
    </div>
  );
}

type Found = { companyId: string | null; memories: Memory[]; trails: Record<string, string[]> };
type View = "topics" | "timeline";

const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;

function Memories({
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
  const [found, setFound] = useState<Found | null>(null);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<View>("topics");
  const [error, setError] = useState<string | null>(null);
  const [changed, setChanged] = useState(0);

  useEffect(() => {
    let live = true;
    window.caulder.brain.memories().then(
      (next) => live && setFound(next),
      () => live && setFound({ companyId: null, memories: [], trails: {} }),
    );
    return () => {
      live = false;
    };
  }, [version, changed]);

  const today = todayIn(zone);
  const memories = useMemo(() => found?.memories ?? [], [found]);
  const groups = useMemo(() => groupMemories(memories, search), [memories, search]);
  const coming = useMemo(() => comingUp(memories, today, 30), [memories, today]);
  const again = useMemo(() => onThisDay(memories.filter((memory) => memory.current), today), [memories, today]);
  const timeline = useMemo(() => {
    const months = new Map<string, Memory[]>();
    for (const memory of [...memories].filter((each) => matches(each, search)).sort((a, b) => b.day.localeCompare(a.day))) {
      const month = memory.day.slice(0, 7);
      months.set(month, [...(months.get(month) ?? []), memory]);
    }
    return [...months.entries()];
  }, [memories, search]);

  if (!found) return null;

  if (memories.length === 0) {
    return (
      <EmptyState
        icon={<Sparkles size={24} className="empty__icon" aria-hidden />}
        title="Nothing remembered yet"
        body="Tell the line on Today something worth keeping - “my blood group is O+”, “mummy's birthday is 15 march”, “the spare key is under the plant pot”, “red rising is a book by pierce brown” - and it is kept here, on a page for what it is about."
      />
    );
  }

  const changedMemory = () => {
    setError(null);
    setChanged((count) => count + 1);
  };
  const failed = (cause: unknown) => setError(messageOf(cause));
  const item = (memory: Memory) => (
    <MemoryItem key={memory.raw + memory.pageId} memory={memory} onChanged={changedMemory} onFailed={failed} />
  );
  const current = memories.filter((memory) => memory.current).length;

  return (
    <div className="memories">
      <header className="memories__head">
        {/* The screen's own heading says Memories already, so this opens on what they are. */}
        <p className="card__hint">
          {current === 1 ? "One thing" : `${current} things`} you have told the line on Today to remember, each on a page for what it is
          about - about you, the people you know, where things are, what you read and lift and learn. A later memory about the same thing
          is the newer answer; the one before stays, marked earlier. They are yours, the same whichever company is open, and never leave
          this machine.{" "}
          <button type="button" className="linkbtn" onClick={onOpenMap}>
            <Waypoints size={13} aria-hidden /> See them on your map
          </button>
        </p>
        <div className="memories__tools">
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
          <div className="tabs" role="group" aria-label="Show memories">
            <button type="button" className="tab" aria-pressed={view === "topics"} onClick={() => setView("topics")}>
              By what
            </button>
            <button type="button" className="tab" aria-pressed={view === "timeline"} onClick={() => setView("timeline")}>
              Timeline
            </button>
          </div>
        </div>
        {error && (
          <p className="field__error" role="alert">
            {error}
          </p>
        )}
      </header>

      {!search.trim() && (coming.length > 0 || again.length > 0) && (
        <div className="memories__soon">
          {coming.length > 0 && (
            <Card title="Coming up" hint="Birthdays and anniversaries you told it, in the next month.">
              <ul className="memories__list" aria-label="Coming up">
                {coming.map((each) => (
                  <li key={`${each.pageId}-${each.what}`} className="memories__item">
                    <span className="memories__says">
                      <CalendarHeart size={14} className="memories__icon" aria-hidden />
                      <button type="button" className="linkbtn" onClick={() => onOpenPage(each.pageId)}>
                        {sayComing(each)}
                      </button>
                    </span>
                    <time className="memories__day" dateTime={each.day}>
                      {formatDay(each.day)}
                    </time>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {again.length > 0 && (
            <Card title="On this day" hint="Kept on this day before.">
              <ul className="memories__list" aria-label="On this day">
                {again.slice(0, 5).map(item)}
              </ul>
            </Card>
          )}
        </div>
      )}

      {view === "topics" ? (
        groups.length === 0 ? (
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
                <ul className="memories__list">{group.memories.map(item)}</ul>
              </Card>
            ))}
          </div>
        )
      ) : timeline.length === 0 ? (
        <p className="card__hint">Nothing remembered matches &ldquo;{search.trim()}&rdquo;.</p>
      ) : (
        <div className="memories__groups">
          {timeline.map(([month, each]) => (
            <Card key={month} title={formatMonth(`${month}-01`)} hint={each.length === 1 ? "1 memory" : `${each.length} memories`}>
              <ul className="memories__list">
                {each.map((memory) => (
                  <MemoryItem key={memory.raw + memory.pageId} memory={memory} onChanged={changedMemory} onFailed={failed} page={memory.pageTitle} onOpenPage={onOpenPage} />
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

/** One memory: what it says, its day, and - on hover or focus - saying it differently, or letting it go. */
function MemoryItem({
  memory,
  onChanged,
  onFailed,
  page,
  onOpenPage,
}: {
  memory: Memory;
  onChanged: () => void;
  onFailed: (cause: unknown) => void;
  /** In the timeline, which page it is on - since it is not under its page's heading there. */
  page?: string;
  onOpenPage?: (pageId: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [fact, setFact] = useState(memory.fact ?? "");
  const [says, setSays] = useState(memory.says);
  const [forgetting, setForgetting] = useState(false);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await window.caulder.brain.editMemory({ pageId: memory.pageId, raw: memory.raw, fact: fact.trim() || null, says });
      setEditing(false);
      onChanged();
    } catch (cause) {
      onFailed(cause);
    } finally {
      setBusy(false);
    }
  }

  async function forget() {
    setBusy(true);
    try {
      await window.caulder.brain.forgetMemory({ pageId: memory.pageId, raw: memory.raw });
      onChanged();
    } catch (cause) {
      onFailed(cause);
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <li className="memories__item memories__item--editing">
        <form
          className="memories__edit"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          {memory.fact !== null && (
            <input className="input" aria-label="What it is about" value={fact} onChange={(event) => setFact(event.target.value)} />
          )}
          <input className="input" aria-label="What to remember" value={says} onChange={(event) => setSays(event.target.value)} autoFocus />
          <span className="memories__editActions">
            <button type="submit" className="btn btn--sm btn--primary" disabled={busy || !says.trim()}>
              Save
            </button>
            <button type="button" className="btn btn--sm btn--ghost" onClick={() => setEditing(false)} disabled={busy}>
              Cancel
            </button>
          </span>
        </form>
      </li>
    );
  }

  return (
    <li className={`memories__item${memory.current ? "" : " memories__item--earlier"}`}>
      <span className="memories__says">
        {memory.fact && <strong className="memories__fact">{memory.fact}</strong>}
        {memory.fact && " · "}
        {memory.says}
        {!memory.current && (
          <span className="memories__earlier">
            <History size={12} aria-hidden /> earlier
          </span>
        )}
        {page && onOpenPage && (
          <>
            {" "}
            <button type="button" className="linkbtn memories__page" onClick={() => onOpenPage(memory.pageId)}>
              {page}
            </button>
          </>
        )}
      </span>
      <span className="memories__side">
        {forgetting ? (
          <span className="memories__confirm">
            Forget it?{" "}
            <button type="button" className="btn btn--sm btn--danger" onClick={() => void forget()} disabled={busy}>
              Forget
            </button>
            <button type="button" className="btn btn--sm btn--ghost" onClick={() => setForgetting(false)} disabled={busy}>
              Keep
            </button>
          </span>
        ) : (
          <span className="memories__actions">
            <button type="button" className="btn btn--sm btn--ghost btn--icon memories__act" title="Say it differently" aria-label={`Edit: ${memory.fact ?? memory.says}`} onClick={() => setEditing(true)}>
              <Pencil size={13} aria-hidden />
            </button>
            <button type="button" className="btn btn--sm btn--ghost btn--icon memories__act" title="Forget it" aria-label={`Forget: ${memory.fact ?? memory.says}`} onClick={() => setForgetting(true)}>
              <Trash2 size={13} aria-hidden />
            </button>
          </span>
        )}
        <time className="memories__day" dateTime={memory.day}>
          {formatDay(memory.day)}
        </time>
      </span>
    </li>
  );
}
