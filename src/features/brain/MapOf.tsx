import { useState } from "react";
import { useWorkspace } from "@/lib/workspace";
import { MapView } from "./MapView";

/**
 * The map, and whose it is.
 *
 * A company's map is its pages, contacts and people. What the line on Today
 * remembers is kept in your own workspace - Red Rising hanging off Reading, a
 * PR hanging off the gym - so with a company open none of it was on any map
 * you could get to. This puts the two side by side: the company's, and yours.
 *
 * With your own workspace open they are the same map, and there is nothing to
 * choose between, so the choice is not drawn. Nor is it on the company's
 * Brain, which holds only the company's knowledge: yours is reached from
 * Memories, under You.
 */
export function MapOf({
  companyId,
  startYours = false,
  companyOnly = false,
  onOpenPage,
  onOpenContact,
}: {
  companyId: string;
  /** Arrived at from Memories, which are on your map and not the company's. */
  startYours?: boolean;
  /** On the company's Brain: the company's map, and no way across to yours. */
  companyOnly?: boolean;
  onOpenPage: (pageId: string) => void;
  onOpenContact: (leadId: string) => void;
}) {
  const { home, activeCompany } = useWorkspace();
  const [yours, setYours] = useState(startYours);
  const twoMaps = !companyOnly && home !== null && home.id !== companyId;
  const shown = twoMaps && yours ? home.id : companyId;

  return (
    <div className="mapof">
      {twoMaps && (
        <div className="tabs mapof__whose" role="group" aria-label="Whose map">
          <button type="button" className="tab" aria-pressed={!yours} onClick={() => setYours(false)}>
            {activeCompany?.name ?? "The company"}
          </button>
          <button type="button" className="tab" aria-pressed={yours} onClick={() => setYours(true)}>
            Yours
          </button>
        </div>
      )}
      <MapView key={shown} companyId={shown} onOpenPage={onOpenPage} onOpenContact={onOpenContact} />
    </div>
  );
}
