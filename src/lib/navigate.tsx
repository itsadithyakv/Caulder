import { createContext, useContext, type ReactNode } from "react";
import type { LinkRef } from "@shared/links";

/**
 * Opening whatever a link points at, from anywhere (PLAN.md, phase 16). A
 * link in a page, a dot on the Map, a name in *Linked here* can be a page, a
 * contact, a product, a person or a document, and each lives on its own
 * screen; the app knows where, so the rest ask it rather than each carrying a
 * handler for every kind.
 */
const OpenRef = createContext<(ref: LinkRef) => void>(() => undefined);

export function OpenRefProvider({ open, children }: { open: (ref: LinkRef) => void; children: ReactNode }) {
  return <OpenRef.Provider value={open}>{children}</OpenRef.Provider>;
}

export function useOpenRef(): (ref: LinkRef) => void {
  return useContext(OpenRef);
}
