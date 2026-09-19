import type { Db } from "../db/connection";
import type { BrainPageSummary } from "@shared/brain";
import { isLinkKind, keyOf, withLink, withoutLink, type LinkKind, type LinkRef, type LinkTarget } from "@shared/links";
import { neighbourhood, type LinkOutcome, type MapGraph, type MapPosition } from "@shared/map";
import { findPageRow, savePageRow, summariesOf } from "../repositories/brain";
import { backlinkIds, buildGraph, linkCandidates, resolveNames, savePositions, unpinAll } from "../repositories/links";
import { isSealed } from "./journal-lock";

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

/* ---- Linking on the Map ----------------------------------------------------- */

/** "page:<id>" and the like, as a dot's key is written. */
function refOfKey(value: unknown): LinkRef {
  if (typeof value !== "string") throw new Error("Missing a dot.");
  const at = value.indexOf(":");
  return refOf(value.slice(0, at), value.slice(at + 1));
}

const LOCKED = "That day of the journal is locked. Open the journal with its passcode, then link it.";

/**
 * Links two dots, the way dragging one onto the other on the Map does. A link
 * is words in a page, so it is written into one: the page dragged from, or
 * the page dropped on when the drag began somewhere else. It lands at the
 * foot of that page (see `withLink`), is a version in its history like any
 * other edit, and can be taken out by editing the text as well as on the Map.
 */
export function connect(db: Db, companyId: string, from: unknown, to: unknown, now: Date): LinkOutcome {
  const a = refOfKey(from);
  const b = refOfKey(to);
  if (keyOf(a) === keyOf(b)) throw new Error("A dot cannot be linked to itself.");
  const names = resolveNames(db, companyId, [a, b]);
  if (!names[keyOf(a)] || !names[keyOf(b)]) throw new Error("One of those is no longer in this company.");

  const [holder, target] = a.kind === "page" ? [a, b] : b.kind === "page" ? [b, a] : [null, null];
  if (!holder || !target) {
    throw new Error("A link is written in a page, so one end has to be a page. Drag from a page, or onto one.");
  }
  const row = findPageRow(db, holder.id);
  if (!row || row.company_id !== companyId) throw new Error("That page is no longer in this company.");

  // Already joined, whichever way it was written.
  const joined = db
    .prepare(
      `SELECT 1 FROM brain_links WHERE company_id = ? AND
         ((from_page = ? AND to_kind = ? AND to_id = ?) OR (from_page = ? AND to_kind = ? AND to_id = ?))`,
    )
    .get(companyId, holder.id, target.kind, target.id, target.id, holder.kind, holder.id);
  if (joined) return { pageId: holder.id, pageTitle: row.title, already: true };
  if (isSealed(db, holder.id)) throw new Error(LOCKED);

  const body = withLink(row.body, names[keyOf(target)]?.name ?? "", target);
  savePageRow(db, holder.id, { title: row.title, body, fields: row.stored }, row.revision, now.toISOString());
  return { pageId: holder.id, pageTitle: row.title, already: false };
}

/**
 * Takes the link between two dots out of the page or pages it is written in:
 * a line of links loses it, a sentence keeps its words. The ids of the pages
 * changed, so a journal day can go back under its seal. Refused for a line
 * Caulder draws itself, or one in a journal day that is locked.
 */
export function disconnect(db: Db, companyId: string, one: unknown, other: unknown, now: Date): string[] {
  const a = refOfKey(one);
  const b = refOfKey(other);
  const changed: string[] = [];
  let locked = false;
  for (const [holder, target] of [
    [a, b],
    [b, a],
  ] as const) {
    if (holder.kind !== "page") continue;
    const row = findPageRow(db, holder.id);
    if (!row || row.company_id !== companyId) continue;
    if (isSealed(db, holder.id)) {
      locked ||= db
        .prepare(`SELECT 1 FROM brain_links WHERE from_page = ? AND to_kind = ? AND to_id = ?`)
        .get(holder.id, target.kind, target.id) !== undefined;
      continue;
    }
    const body = withoutLink(row.body, target);
    if (body === row.body) continue;
    savePageRow(db, holder.id, { title: row.title, body, fields: row.stored }, row.revision, now.toISOString());
    changed.push(holder.id);
  }
  if (changed.length === 0) {
    throw new Error(locked ? LOCKED : "Caulder draws that line itself, from what it already knows. It is not written in a page.");
  }
  return changed;
}
