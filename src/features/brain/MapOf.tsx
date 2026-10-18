import { MapView } from "./MapView";

/**
 * The company's map, as a screen of its own: its pages, contacts, products,
 * people and documents, and what links them.
 *
 * There used to be two maps side by side, the company's and your own, because
 * what the line remembered was kept in a workspace apart. Memories are the
 * company's now (PLAN.md, part seven), so there is one.
 */
export function MapOf({
  companyId,
  onOpenPage,
  onOpenContact,
}: {
  companyId: string;
  onOpenPage: (pageId: string) => void;
  onOpenContact: (leadId: string) => void;
}) {
  return (
    <div className="mapof">
      <MapView key={companyId} companyId={companyId} onOpenPage={onOpenPage} onOpenContact={onOpenContact} />
    </div>
  );
}
