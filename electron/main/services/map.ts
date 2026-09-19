import type { Db } from "../db/connection";
import type { BrainPageSummary } from "@shared/brain";
import { isLinkKind, type LinkKind, type LinkTarget } from "@shared/links";
import { neighbourhood, type MapGraph, type MapPosition } from "@shared/map";
import { summariesOf } from "../repositories/brain";
import { backlinkIds, buildGraph, linkCandidates, savePositions, unpinAll } from "../repositories/links";

/**
 * Links and the Map, as main hands them out (PLAN.md, phase 7).
 */

/** How far out a local map reaches, unless asked for another: one to three. */
const LOCAL_DEPTH = 2;

/** Positions saved in one go; more than a map this size will ever have. */
const MAX_POSITIONS = 5000;

function refOf(kind: unknown, id: unknown): { kind: LinkKind; id: string } {
  if (!isLinkKind(kind)) throw new Error("A link goes to a page, a contact, a product, a person or a document.");
  if (typeof id !== "string" || id.length === 0) throw new Error("Missing link target.");
  return { kind, id };
}

export function linkTargetsFor(db: Db, companyId: string, text: unknown): LinkTarget[] {
  return linkCandidates(db, companyId, typeof text === "string" ? text.slice(0, 60) : "");
}

/** The pages that link here: Linked here, on a page, a contact, a product or a person. */
export function backlinks(db: Db, kind: unknown, id: unknown): BrainPageSummary[] {
  return summariesOf(db, backlinkIds(db, refOf(kind, id)));
}

export function wholeMap(db: Db, companyId: string, allContacts: unknown): MapGraph {
  return buildGraph(db, companyId, { allContacts: allContacts === true });
}

/**
 * The neighbourhood of one dot, two lines out - or one to three, as asked. A
 * contact nothing reaches is not on the map at all, so its local map is empty.
 */
export function localMap(db: Db, companyId: string, kind: unknown, id: unknown, depth?: unknown): MapGraph {
  const ref = refOf(kind, id);
  const reach = typeof depth === "number" && Number.isInteger(depth) && depth >= 1 && depth <= 3 ? depth : LOCAL_DEPTH;
  return neighbourhood(buildGraph(db, companyId, { allContacts: false }), `${ref.kind}:${ref.id}`, reach);
}

export function keepPositions(db: Db, companyId: string, raw: unknown): void {
  if (!Array.isArray(raw)) throw new Error("Missing positions.");
  const positions: MapPosition[] = raw.slice(0, MAX_POSITIONS).flatMap((entry: unknown) => {
    if (typeof entry !== "object" || entry === null) return [];
    const { key, x, y, pinned } = entry as Record<string, unknown>;
    return typeof key === "string" && typeof x === "number" && typeof y === "number"
      ? [{ key, x, y, pinned: pinned === true }]
      : [];
  });
  savePositions(db, companyId, positions);
}

export function letGo(db: Db, companyId: string): void {
  unpinAll(db, companyId);
}
