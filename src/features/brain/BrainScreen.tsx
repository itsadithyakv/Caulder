import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { BookHeart, House, LayoutGrid, Share2, Waypoints } from "lucide-react";
import { BRAIN_SECTION_LIST, sectionOf, type BrainHome as Home, type BrainSectionId } from "@shared/brain";
import { ErrorLine } from "@/components/ErrorLine";
import { messageOf } from "@/lib/errors";
import { useWorkspace } from "@/lib/workspace";
import { BrainHome } from "./BrainHome";
import { PageView } from "./PageView";
import { SectionView } from "./SectionView";
import { MapOf } from "./MapOf";
import { BrainShare } from "./BrainShare";
import { SectionsIndex } from "./SectionsIndex";
import { SECTION_ICON } from "./sections";

/**
 * The brain (PLAN.md, parts two and four).
 *
 * A rail beside what is open: Home and the Map, then the sections that hold
 * something - not all fifteen, which is a wall to a new company - then All
 * sections, where the rest are, and Share and export. The rail is a filter,
 * not a level, so a page is never more than Brain and then the page. The
 * founder's own pages - studies, hobbies, goals, the journal - are brain
 * pages too, so a link reaches them, but they live under You, not here. So
 * do Memories, and the map on this rail is the company's alone: yours is
 * drawn from Memories.
 */

type From = BrainSectionId | "home" | "map";

function backLabelOf(from: From): string {
  if (from === "home") return "Brain home";
  if (from === "map") return "The map";
  return sectionOf(from).label;
}

function backTo(from: From): View {
  if (from === "home" || from === "map") return { kind: from };
  return { kind: "section", section: from };
}

type View =
  | { kind: "home" }
  | { kind: "map" }
  | { kind: "all" }
  | { kind: "share" }
  | { kind: "section"; section: BrainSectionId }
  | { kind: "page"; id: string; editing: boolean; from: From };

export function BrainScreen({
  openPageId,
  onConsumeOpenPage,
  openSection,
  onConsumeOpenSection,
  homeNonce,
  onOpenContact,
  onGoToProducts,
  onOpenMemories,
}: {
  /** Bumped when the sidebar's Brain row is pressed while already here. */
  homeNonce: number;
  /** Set when search sends the user straight to one page. */
  openPageId: string | null;
  onConsumeOpenPage: () => void;
  /** Set when Today or search sends the user to a section: a filing to Tax, a person to People. */
  openSection: { section: BrainSectionId } | null;
  onConsumeOpenSection: () => void;
  /** A link or a dot that is a contact opens it on Contacts. */
  onOpenContact: (leadId: string) => void;
  /** Ask the brain needs a key, which is set in Settings. */
  /** The checklist's product line opens the catalogue, which is on Money. */
  onGoToProducts: () => void;
  /** What the line was told to remember, read back off the pages. */
  onOpenMemories: () => void;
}) {
  const { activeCompany } = useWorkspace();
  const companyId = activeCompany?.id ?? null;

  const [view, setView] = useState<View>({ kind: "home" });
  const [home, setHome] = useState<Home | null>(null);
  const [version, setVersion] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!companyId) return;
    window.caulder.brain
      .home(companyId)
      .then(setHome)
      .catch((cause: unknown) => setError(messageOf(cause)));
  }, [companyId]);

  useEffect(load, [load, version]);

  useEffect(() => {
    if (!openPageId) return;
    const id = openPageId;
    onConsumeOpenPage();
    // The same rule as a page made here: one nobody has saved yet - a running
    // cost just added from Money - opens to be written. No cancelling on
    // cleanup: consuming the request is itself a change that would cancel it.
    window.caulder.brain.page(id).then(
      (page) => setView({ kind: "page", id, editing: page.revision === 1, from: "home" }),
      () => setView({ kind: "page", id, editing: false, from: "home" }),
    );
  }, [openPageId, onConsumeOpenPage]);

  useEffect(() => {
    if (!openSection) return;
    setView({ kind: "section", section: openSection.section });
    onConsumeOpenSection();
  }, [openSection, onConsumeOpenSection]);

  // The sidebar row means Brain home, the way the Contacts row means the list.
  useEffect(() => {
    if (homeNonce > 0) setView({ kind: "home" });
  }, [homeNonce]);

  const changed = useCallback(() => setVersion((n) => n + 1), []);

  const current = view.kind === "section" ? view.section : view.kind === "page" ? view.from : view.kind;
  const pill = useRailPill(current, home);

  if (!companyId) return null;

  async function create(section: BrainSectionId, template: string, preset?: string) {
    setError(null);
    try {
      const page = await window.caulder.brain.create(companyId!, section, template, preset);
      // A page nobody has saved yet opens to be written; one with something in
      // it opens to be read.
      setView({ kind: "page", id: page.id, editing: page.revision === 1, from: section });
      changed();
    } catch (cause) {
      setError(messageOf(cause));
    }
  }

  // What is open, as a key: a new one arrives on the spring.
  const viewKey = view.kind === "section" ? view.section : view.kind === "page" ? view.id : view.kind;

  /** A page opened from a link or a dot keeps the way back it came in by. */
  const openPage = (id: string, from: From = view.kind === "page" ? view.from : "home") =>
    setView({ kind: "page", id, editing: false, from });

  return (
    <div className="brain">
      <nav className="brain__rail" aria-label="Brain sections" ref={pill.rail}>
        <span className={`brain__railPill${pill.ready ? " brain__railPill--ready" : ""}`} style={pill.style} aria-hidden />
        <button
          type="button"
          className="brain__railItem"
          aria-current={current === "home" ? "page" : undefined}
          onClick={() => setView({ kind: "home" })}
        >
          <House size={15} aria-hidden />
          <span className="brain__railLabel">Home</span>
        </button>
        <button
          type="button"
          className="brain__railItem"
          aria-current={current === "map" ? "page" : undefined}
          onClick={() => setView({ kind: "map" })}
        >
          <Waypoints size={15} aria-hidden />
          <span className="brain__railLabel">Map</span>
        </button>
        <button type="button" className="brain__railItem" onClick={onOpenMemories}>
          <BookHeart size={15} aria-hidden />
          <span className="brain__railLabel">Memories</span>
        </button>
        <span className="brain__railRule" aria-hidden />
        {BRAIN_SECTION_LIST.filter(
          (section) => section.id === current || (home?.counts[section.id] ?? 0) > 0,
        ).map((section) => {
          const Icon = SECTION_ICON[section.id];
          const count = home?.counts[section.id] ?? 0;
          return (
            <button
              key={section.id}
              type="button"
              className="brain__railItem"
              aria-current={current === section.id ? "page" : undefined}
              onClick={() => setView({ kind: "section", section: section.id })}
            >
              <Icon size={15} aria-hidden />
              <span className="brain__railLabel">{section.label}</span>
              {count > 0 && (
                <span className="brain__railCount">
                  {count}
                  <span className="visually-hidden"> {count === 1 ? "item" : "items"}</span>
                </span>
              )}
            </button>
          );
        })}
        <span className="brain__railRule" aria-hidden />
        <button
          type="button"
          className="brain__railItem"
          aria-current={current === "all" ? "page" : undefined}
          onClick={() => setView({ kind: "all" })}
        >
          <LayoutGrid size={15} aria-hidden />
          <span className="brain__railLabel">All sections</span>
        </button>
        <button
          type="button"
          className="brain__railItem"
          aria-current={current === "share" ? "page" : undefined}
          onClick={() => setView({ kind: "share" })}
        >
          <Share2 size={15} aria-hidden />
          <span className="brain__railLabel">Share and export</span>
        </button>
      </nav>

      <div className="brain__main anim-spring" key={viewKey}>
        <ErrorLine>{error}</ErrorLine>

        {view.kind === "home" ? (
          home && (
            <BrainHome
              companyId={companyId}
              home={home}
              version={version}
              onOpenPage={(id) => openPage(id, "home")}
              onOpenContact={onOpenContact}
              onOpenMap={() => setView({ kind: "map" })}
              onOpenSection={(section) => setView({ kind: "section", section })}
              onCreate={(section, template) => void create(section, template)}
              onGoToProducts={onGoToProducts}
              onChanged={changed}
            />
          )
        ) : view.kind === "all" ? (
          home && <SectionsIndex counts={home.counts} onOpen={(section) => setView({ kind: "section", section })} />
        ) : view.kind === "share" ? (
          <BrainShare companyId={companyId} version={version} />
        ) : view.kind === "map" ? (
          <MapOf companyId={companyId} onOpenPage={(id) => openPage(id, "map")} onOpenContact={onOpenContact} />
        ) : view.kind === "section" ? (
          <SectionView
            key={view.section}
            companyId={companyId}
            section={view.section}
            version={version}
            onOpen={(id, editing) => setView({ kind: "page", id, editing: editing === true, from: view.section })}
            onCreate={(template, preset) => void create(view.section, template, preset)}
            onOpenSection={(section) => setView({ kind: "section", section })}
            onOpenContact={onOpenContact}
            onChanged={changed}
          />
        ) : (
          <PageView
            key={view.id}
            pageId={view.id}
            startEditing={view.editing}
            version={version}
            backLabel={backLabelOf(view.from)}
            onBack={() => setView(backTo(view.from))}
            onChanged={changed}
            onDeleted={() => setView(backTo(view.from))}
            onOpenPage={(id) => openPage(id)}
            onOpenContact={onOpenContact}
          />
        )}
      </div>
    </div>
  );
}

/**
 * The rail's highlight: one pill that springs from the section you left to
 * the one you opened, so the rail says where you went rather than just where
 * you are. Measured from the highlighted button, and again whenever the rail
 * changes size - it lies flat along the top on a narrow window.
 */
function useRailPill(current: string, home: Home | null) {
  const rail = useRef<HTMLElement>(null);
  const [box, setBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [ready, setReady] = useState(false);

  useLayoutEffect(() => {
    const nav = rail.current;
    if (!nav) return;
    const measure = () => {
      const active = nav.querySelector<HTMLElement>('[aria-current="page"]');
      setBox(
        active
          ? { x: active.offsetLeft, y: active.offsetTop, w: active.offsetWidth, h: active.offsetHeight }
          : null,
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(nav);
    return () => observer.disconnect();
  }, [current, home]);

  // Placed without moving the first time, so it does not fly in from the corner.
  useEffect(() => {
    if (!box || ready) return;
    const frame = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(frame);
  }, [box, ready]);

  const style: CSSProperties = box
    ? { transform: `translate(${box.x}px, ${box.y}px)`, width: box.w, height: box.h }
    : { opacity: 0 };

  return { rail, style, ready };
}
