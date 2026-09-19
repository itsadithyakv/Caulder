import { useEffect, useState } from "react";
import type { BrainPageSummary } from "@shared/brain";
import type { LinkKind } from "@shared/links";
import { MAP_LOOK, type MapGraph, type MapLook, type MapNode } from "@shared/map";
import { Card } from "@/components/Card";
import { ErrorLine } from "@/components/ErrorLine";
import { messageOf } from "@/lib/errors";
import { useOpenRef } from "@/lib/navigate";
import { MapCanvas } from "./MapCanvas";
import { PageList } from "./SectionView";

/** A local map has few dots and long names: longer lines, so the names fit between them. */
const LOCAL_LOOK: MapLook = { ...MAP_LOOK, distance: 120, repel: 360 };

/**
 * Linked here: the pages that link to a page or a contact, and the little map
 * of what is around it, two lines out. On every page and every contact.
 */
export function BrainLinks({
  companyId,
  kind,
  id,
  version = 0,
  onOpenPage,
  onOpenContact,
}: {
  companyId: string;
  kind: LinkKind;
  id: string;
  /** Bumped when the page changes, so its own links are read again. */
  version?: number;
  onOpenPage: (pageId: string) => void;
  onOpenContact: (leadId: string) => void;
}) {
  const openRef = useOpenRef();
  const [pages, setPages] = useState<BrainPageSummary[] | null>(null);
  const [local, setLocal] = useState<MapGraph | null>(null);
  /** How far out the local map reaches: one to three links. */
  const [depth, setDepth] = useState(2);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    Promise.all([window.caulder.brain.backlinks(kind, id), window.caulder.brain.localMap(companyId, kind, id, depth)])
      .then(([linked, graph]) => {
        if (!live) return;
        setPages(linked);
        setLocal(graph);
      })
      .catch((cause: unknown) => live && setError(messageOf(cause)));
    return () => {
      live = false;
    };
  }, [companyId, kind, id, version, depth]);

  if (!pages) return <ErrorLine>{error}</ErrorLine>;

  const open = (node: MapNode) => {
    if (node.key === `${kind}:${id}`) return;
    if (node.ref === "page") onOpenPage(node.id);
    else if (node.ref === "contact") onOpenContact(node.id);
    else openRef({ kind: node.ref, id: node.id });
  };

  return (
    <Card title="Linked here" className="brainlinks">
      {pages.length > 0 ? (
        <PageList pages={pages} onOpen={onOpenPage} label="Pages that link here" showSection />
      ) : (
        <p className="card__hint">
          No page links here yet: on any page, type [[ and the start of this{" "}
          {kind === "page" ? "page's title" : `${kind}'s name`}.
          {local && local.nodes.length > 1 ? ` The map shows what this ${kind} links to.` : ""}
        </p>
      )}
      {local && (local.nodes.length > 1 || depth > 1) && (
        <div className="brainlinks__depth" role="group" aria-label="How far out">
          <span className="card__hint">How far out</span>
          {[1, 2, 3].map((reach) => (
            <button
              key={reach}
              type="button"
              className={`chip${depth === reach ? " chip--on" : ""}`}
              aria-pressed={depth === reach}
              onClick={() => setDepth(reach)}
            >
              {reach}
            </button>
          ))}
        </div>
      )}
      {local && local.nodes.length > 1 && (
        <div className="brainlinks__map">
          <MapCanvas
            graph={local}
            height={280}
            look={LOCAL_LOOK}
            focus={`${kind}:${id}`}
            label={`What is around this ${kind}: ${local.nodes.length - 1} linked, ${depth === 1 ? "one step" : depth === 2 ? "two steps" : "three steps"} out.`}
            onOpen={open}
          />
        </div>
      )}
    </Card>
  );
}
