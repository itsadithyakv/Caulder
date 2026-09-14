import type { ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Renders its children on the document body instead of where they are written.
 *
 * Needed by anything that has to cover the whole window. Every screen arrives
 * with an entrance animation that finishes holding a transform, and a
 * transformed ancestor becomes the containing block for `position: fixed` -
 * so a dialog written inside a screen, with `inset: 0`, covered that screen
 * and stopped at the sidebar. Moving it to the body puts the window back in
 * charge of where "fixed" means.
 *
 * React context and events still flow through a portal as though it had not
 * moved, so nothing inside has to know.
 */
export function Portal({ children }: { children: ReactNode }) {
  return createPortal(children, document.body);
}
