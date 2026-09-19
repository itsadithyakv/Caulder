import { useEffect, useState, type CSSProperties } from "react";
import { Check, ChevronDown, ChevronUp, Circle, Waypoints } from "lucide-react";
import { AskBox } from "./AskBox";
import type { MapGraph, MapNode } from "@shared/map";
import { templateOf, type BrainHome as Home, type BrainSectionId, type ChecklistItem } from "@shared/brain";
import { Card } from "@/components/Card";
import { PageList } from "./SectionView";
import { MapCanvas } from "./MapCanvas";
import { useOpenRef } from "@/lib/navigate";

/**
 * Brain home: the company in a line, a box to ask it anything, what is still
 * worth writing down, and the pages you come back to - with the map beside
 * them. Nothing else: sharing, the data room and the exports have a page of
 * their own on the rail, and what is due is on Today.
 */
export function BrainHome({
  companyId,
  home,
  version,
  onOpenPage,
  onOpenContact,
  onOpenMap,
  onOpenSection,
  onCreate,
  onGoToSettings,
  onGoToProducts,
}: {
  companyId: string;
  home: Home;
  version: number;
  onOpenPage: (pageId: string) => void;
  onOpenContact: (leadId: string) => void;
  onOpenMap: () => void;
  onOpenSection: (section: BrainSectionId, focus?: string) => void;
  onCreate: (section: BrainSectionId, template: string) => void;
  onGoToSettings: () => void;
  /** The catalogue, which is a tab on Money rather than a page here. */
  onGoToProducts: () => void;
}) {
  const { company } = home;
  const openRef = useOpenRef();

  /**
   * A checklist item opens what it fills: the page itself for a template a
   * company has one of, a new page when there is none of its kind yet, and
   * otherwise the section, where the ones already written are.
   */
  function open(item: ChecklistItem) {
    if (item.goes === "catalogue") {
      onGoToProducts();
      return;
    }
    if (item.goes === "section") {
      onOpenSection(item.section);
      return;
    }
    const template = templateOf(item.template);
    if (template.single || home.counts[item.section] === 0) onCreate(item.section, item.template);
    else onOpenSection(item.section);
  }

  // Pinned first, then what was written last, each page once.
  const pages = [...home.pinned, ...home.recent.filter((page) => !home.pinned.some((pinned) => pinned.id === page.id))].slice(0, 8);

  return (
    <div className="brainhome">
      <div className="brainhome__main">
        <header className="brainhome__company">
          <h2 className="brainhome__name">{company.name}</h2>
          <p className="brainhome__oneLiner">
            {company.oneLiner ?? <span className="card__hint">No one-liner yet: what the company does, in one sentence.</span>}{" "}
            <button type="button" className="linkbtn" onClick={() => onCreate("company", "profile")}>
              {company.profileId ? "Open the profile" : "Write the profile"}
            </button>
          </p>
        </header>

        <AskBox companyId={companyId} onOpenPage={onOpenPage} onOpenContact={onOpenContact} onGoToSettings={onGoToSettings} />

        <Checklist items={home.checklist} onOpen={open} />

        <Card title={home.pinned.length > 0 ? "Pinned and recent" : "Recently written"}>
          {pages.length > 0 ? (
            <PageList pages={pages} onOpen={onOpenPage} label="Pinned and recent pages" showSection />
          ) : (
            <p className="card__hint">Nothing written yet. The list above is a good place to start.</p>
          )}
        </Card>
      </div>

      <div className="brainhome__side">
        <SmallMap
          companyId={companyId}
          version={version}
          onOpenMap={onOpenMap}
          onOpen={(node) =>
            node.ref === "page"
              ? onOpenPage(node.id)
              : node.ref === "contact"
                ? onOpenContact(node.id)
                : openRef({ kind: node.ref, id: node.id })
          }
        />
      </div>
    </div>
  );
}

/** The map in miniature, live: hover and click work here too. */
function SmallMap({
  companyId,
  version,
  onOpenMap,
  onOpen,
}: {
  companyId: string;
  version: number;
  onOpenMap: () => void;
  onOpen: (node: MapNode) => void;
}) {
  const [graph, setGraph] = useState<MapGraph | null>(null);

  useEffect(() => {
    let live = true;
    window.caulder.brain
      .map(companyId, false)
      .then((found) => live && setGraph(found))
      .catch(() => live && setGraph(null));
    return () => {
      live = false;
    };
  }, [companyId, version]);

  return (
    <Card
      title="The map"
      className="smallmap"
      actions={
        <button type="button" className="btn btn--sm btn--ghost" onClick={onOpenMap}>
          <Waypoints size={14} aria-hidden />
          Open the map
        </button>
      }
    >
      {graph && graph.links.length > 0 ? (
        <MapCanvas
          graph={graph}
          height={320}
          label={`A small map of the company: ${graph.nodes.length} dots and ${graph.links.length} links.`}
          onOpen={onOpen}
        />
      ) : (
        <p className="card__hint">
          Every page is a dot and every link a line. Type [[ in a page to link it to another page, a contact, a product
          or a person.
        </p>
      )}
    </Card>
  );
}

/** How many of the list show before "Show all". */
const FIRST_FEW = 4;

/**
 * The twelve things worth writing down first, folded to the next few not
 * written yet. Gone once they all are: a finished list is not worth a card.
 */
function Checklist({ items, onOpen }: { items: ChecklistItem[]; onOpen: (item: ChecklistItem) => void }) {
  const [all, setAll] = useState(false);
  const done = items.filter((item) => item.done).length;
  if (done === items.length) return null;

  const left = items.filter((item) => !item.done);
  const shown = all ? items : left.slice(0, FIRST_FEW);

  return (
    <section className="card checklist" aria-labelledby="checklist-title">
      <div className="checklist__head">
        <Ring done={done} all={items.length} />
        <div className="checklist__words">
          <h2 className="card__title" id="checklist-title">
            Write these down first
          </h2>
          <p className="card__hint">
            {left.length === 1 ? "One left." : `${left.length} left, about fifteen minutes all told.`} Each opens the page it
            fills.
          </p>
        </div>
      </div>
      <ul className="checklist__items">
        {shown.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              className={`checklist__item${item.done ? " checklist__item--done" : ""}`}
              aria-label={`${item.label}, ${item.done ? "written" : "not written yet"}${
                item.progress && !item.done ? `, ${item.progress}` : ""
              }`}
              onClick={() => onOpen(item)}
            >
              {item.done ? (
                <Check size={16} className="checklist__mark checklist__mark--done anim-spring-pop" aria-hidden />
              ) : (
                <Circle size={16} className="checklist__mark" aria-hidden />
              )}
              <span className="checklist__label">{item.label}</span>
              {item.progress && !item.done && <span className="checklist__progress">{item.progress}</span>}
            </button>
          </li>
        ))}
      </ul>
      {left.length > FIRST_FEW || done > 0 ? (
        <button type="button" className="btn btn--sm btn--ghost checklist__more" aria-expanded={all} onClick={() => setAll((open) => !open)}>
          {all ? <ChevronUp size={14} aria-hidden /> : <ChevronDown size={14} aria-hidden />}
          {all ? "Just what is left" : `All ${items.length}`}
        </button>
      ) : null}
    </section>
  );
}

/** A ring that fills as the list does, with the count in words beside it for anyone not reading the ring. */
function Ring({ done, all }: { done: number; all: number }) {
  const radius = 20;
  const length = 2 * Math.PI * radius;
  const filled = all === 0 ? 0 : (done / all) * length;
  return (
    <div className="ring" role="img" aria-label={`${done} of ${all} written down`}>
      <svg width="52" height="52" viewBox="0 0 52 52" aria-hidden>
        <circle className="ring__track" cx="26" cy="26" r={radius} />
        {/* Not drawn at nought: a round cap on a zero-length line is a dot. */}
        {filled > 0 && (
          <circle
            className="ring__fill anim-ring"
            cx="26"
            cy="26"
            r={radius}
            strokeDasharray={`${filled} ${length}`}
            // Where the drawing-in stops; the keyframe reads it.
            style={{ "--ring-to": `${filled} ${length}` } as CSSProperties}
            transform="rotate(-90 26 26)"
          />
        )}
      </svg>
      <span className="ring__count" aria-hidden>
        {done}/{all}
      </span>
    </div>
  );
}
