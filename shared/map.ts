import { isPersonalSection, type BrainSectionId } from "./brain";
import type { LinkKind } from "./links";

/**
 * The Map (PLAN.md, phase 7): what it draws, as data.
 *
 * A dot is a page, a contact, a product, a person or a document. A line is a
 * link written in a page, or one Caulder already knows - a person who is a
 * contact, a product and who bought it, a document and whose it is. Everything
 * here is pure: the service fills a graph from the database, the window lays
 * it out and draws it, and both lean on these functions for what a dot is and
 * who its neighbours are.
 */

/**
 * What a dot is, for its colour and the legend. A page's kind comes from its
 * section: a decision is its own, and the founder's own pages - studies,
 * hobbies, goals, the journal - are one gray kind, the way Obsidian draws a
 * note, because a seventh hue could not be told from the six (every pair has
 * to stay apart, and a gray is the one that does).
 */
export const MAP_KINDS = ["page", "decision", "contact", "product", "person", "document", "own"] as const;
export type MapKind = (typeof MAP_KINDS)[number];

export const MAP_KIND_LABEL: Record<MapKind, string> = {
  page: "Pages",
  decision: "Decisions",
  contact: "Contacts",
  product: "Products",
  person: "People",
  document: "Documents",
  own: "Your own",
};

export function mapKindOf(ref: LinkKind, section: BrainSectionId | null): MapKind {
  if (ref !== "page") return ref;
  if (section === "decisions") return "decision";
  if (section && isPersonalSection(section)) return "own";
  return "page";
}

export type MapNode = {
  /** "page:<id>", "contact:<id>" and so on: the same key a link uses. */
  key: string;
  ref: LinkKind;
  id: string;
  kind: MapKind;
  label: string;
  section: BrainSectionId | null;
  createdAt: string;
  /** How many lines touch it, which is what sizes it. */
  degree: number;
  /** Where it was left last time, if it was. */
  x: number | null;
  y: number | null;
  pinned: boolean;
};

export type MapLink = {
  source: string;
  target: string;
  createdAt: string;
  /**
   * Written in a page's text, so it can be taken out on the Map. The lines
   * Caulder draws itself - a person who is a contact, who bought what - are
   * not, and cannot.
   */
  written?: boolean;
};

/** What linking two dots on the Map did: the page it was written in, or that it was there already. */
export type LinkOutcome = { pageId: string; pageTitle: string; already: boolean };

export type MapGraph = { nodes: MapNode[]; links: MapLink[] };

export type MapPosition = { key: string; x: number; y: number; pinned: boolean };

/** A dot's radius: the more it is linked, the bigger, but not linearly - one hub should not fill the screen. */
export function radiusOf(degree: number): number {
  return 4 + 2.2 * Math.sqrt(degree);
}

/** Every key a node's lines reach, both directions. */
export function adjacency(graph: MapGraph): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const node of graph.nodes) out.set(node.key, new Set());
  for (const link of graph.links) {
    out.get(link.source)?.add(link.target);
    out.get(link.target)?.add(link.source);
  }
  return out;
}

/**
 * The part of the graph within `depth` lines of one dot: the local map on a
 * page or a contact. The dot itself is always in it, even with no lines.
 */
export function neighbourhood(graph: MapGraph, key: string, depth: number): MapGraph {
  const near = adjacency(graph);
  if (!near.has(key)) return { nodes: [], links: [] };

  const keep = new Set([key]);
  let edge = [key];
  for (let step = 0; step < depth; step += 1) {
    const next: string[] = [];
    for (const at of edge) {
      for (const other of near.get(at) ?? []) {
        if (!keep.has(other)) {
          keep.add(other);
          next.push(other);
        }
      }
    }
    edge = next;
  }

  return {
    nodes: graph.nodes.filter((node) => keep.has(node.key)),
    links: graph.links.filter((link) => keep.has(link.source) && keep.has(link.target)),
  };
}

/**
 * The map as it stood at one moment: every dot and line made by then. The
 * replay slider moves through `replaySteps`, which are those moments in order.
 */
export function asOf(graph: MapGraph, moment: string): MapGraph {
  const nodes = graph.nodes.filter((node) => node.createdAt <= moment);
  const present = new Set(nodes.map((node) => node.key));
  return {
    nodes,
    links: graph.links.filter(
      (link) => link.createdAt <= moment && present.has(link.source) && present.has(link.target),
    ),
  };
}

/** Each distinct moment something appeared, oldest first. */
export function replaySteps(graph: MapGraph): string[] {
  const moments = new Set<string>();
  for (const node of graph.nodes) moments.add(node.createdAt);
  for (const link of graph.links) moments.add(link.createdAt);
  return [...moments].sort();
}

/** The graph without the dots nothing links to - Obsidian's "orphans" - when they are not wanted. */
export function withoutOrphans(graph: MapGraph): MapGraph {
  const linked = new Set(graph.links.flatMap((link) => [link.source, link.target]));
  return { nodes: graph.nodes.filter((node) => linked.has(node.key)), links: graph.links };
}

/** What the filters leave: the kinds switched on, and a search that dims rather than hides. */
export function matching(node: MapNode, search: string): boolean {
  const text = search.trim().toLowerCase();
  return text.length === 0 || node.label.toLowerCase().includes(text);
}

/** The graph with only the dots `keep` allows, and the lines between them. */
function keeping(graph: MapGraph, keep: (node: MapNode) => boolean): MapGraph {
  const nodes = graph.nodes.filter(keep);
  const present = new Set(nodes.map((node) => node.key));
  return {
    nodes,
    links: graph.links.filter((link) => present.has(link.source) && present.has(link.target)),
  };
}

export function withKinds(graph: MapGraph, kinds: ReadonlySet<MapKind>): MapGraph {
  return keeping(graph, (node) => kinds.has(node.kind));
}

/**
 * A day of the journal. The journal holds nothing but its entries (its one
 * template is ENTRY_TEMPLATE), so the section is enough to know one.
 */
export function isJournalDay(node: MapNode): boolean {
  return node.ref === "page" && node.section === "journal";
}

/**
 * The graph without the journal's days, unless they are asked for. A dot a
 * day is mostly dates - dozens of them crowding the hobbies, books and people
 * the map is for - so they are off until Display turns them on. A day that
 * links to something is still in that thing's Linked here; this is only the
 * drawing.
 */
export function withoutJournalDays(graph: MapGraph): MapGraph {
  return keeping(graph, (node) => !isJournalDay(node));
}

/* ---- Labels ----------------------------------------------------------------- */

/** How wide a label may be before it is cut short, in ems of its own font. */
export const LABEL_EMS = 13;

/**
 * A label cut to fit `maxWidth`, ending in an ellipsis when it had to be cut.
 * `measure` is how wide a piece of text is - the canvas's, in the window - so
 * the cut is where the width runs out rather than at a fixed count of letters.
 */
export function clipLabel(text: string, maxWidth: number, measure: (text: string) => number): string {
  if (measure(text) <= maxWidth) return text;
  // The longest start that still fits with the ellipsis after it.
  let low = 0;
  let high = text.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (measure(`${text.slice(0, mid).trimEnd()}…`) <= maxWidth) low = mid;
    else high = mid - 1;
  }
  return `${text.slice(0, low).trimEnd()}…`;
}

/** Where a label would be drawn: its box, top left and size, and how much it matters. */
export type LabelBox = {
  key: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Shown whatever it covers: the dot looked at, the page's own, what the search found. */
  always: boolean;
  /** Among the rest, the higher keeps its place when two would overlap - the busier dot, usually. */
  rank: number;
};

/**
 * Which labels to draw, so that none runs into another. The ones that must
 * show claim their room first; then, busiest first, each label is drawn only
 * if its box is clear of every one already placed - the quieter of two
 * neighbours waits for a hover, a search or a closer zoom. `pad` keeps a
 * little air between boxes.
 *
 * The placed boxes are kept in a grid of cells about a label wide, so a
 * label is tested against the few near it rather than all of them: this runs
 * every frame the map moves.
 */
export function labelsShown(boxes: readonly LabelBox[], pad = 0): Set<string> {
  const shown = new Set<string>();
  if (boxes.length === 0) return shown;

  const order = [...boxes].sort(
    (a, b) => Number(b.always) - Number(a.always) || b.rank - a.rank || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0),
  );
  const cell = Math.max(1, boxes.reduce((sum, box) => sum + box.width, 0) / boxes.length + pad * 2);
  const grid = new Map<string, LabelBox[]>();
  const cellsOf = (box: LabelBox, visit: (key: string) => boolean | void) => {
    const x0 = Math.floor((box.x - pad) / cell);
    const x1 = Math.floor((box.x + box.width + pad) / cell);
    const y0 = Math.floor((box.y - pad) / cell);
    const y1 = Math.floor((box.y + box.height + pad) / cell);
    for (let cx = x0; cx <= x1; cx += 1) {
      for (let cy = y0; cy <= y1; cy += 1) {
        if (visit(`${cx},${cy}`) === true) return true;
      }
    }
    return false;
  };
  const overlaps = (a: LabelBox, b: LabelBox) =>
    a.x - pad < b.x + b.width && b.x - pad < a.x + a.width && a.y - pad < b.y + b.height && b.y - pad < a.y + a.height;

  for (const box of order) {
    const clashes = !box.always && cellsOf(box, (key) => grid.get(key)?.some((other) => overlaps(box, other)) === true);
    if (clashes) continue;
    shown.add(box.key);
    cellsOf(box, (key) => {
      const bucket = grid.get(key);
      if (bucket) bucket.push(box);
      else grid.set(key, [box]);
    });
  }
  return shown;
}

/**
 * How the Map looks and moves - Obsidian's display and forces panel. Kept per
 * computer by the window; these are where it starts.
 */
export type MapLook = {
  /** How hard dots push each other apart. */
  repel: number;
  /** How long a line wants to be. */
  distance: number;
  /** How hard everything is pulled to the middle. */
  centre: number;
  /** Dots and lines, scaled. */
  size: number;
  lines: number;
  /** The zoom past which every label with room shows; below it, only the busiest and what is lit. */
  labelsAt: number;
  /** Which way a link was written, as an arrow at the far end. */
  arrows: boolean;
  /** Dots with no line at all. */
  orphans: boolean;
  /** The journal's days, a dot each - off unless asked for (see `withoutJournalDays`). */
  journal: boolean;
};

export const MAP_LOOK: MapLook = {
  repel: 130,
  distance: 56,
  centre: 0.04,
  size: 1,
  lines: 1,
  labelsAt: 1.1,
  arrows: false,
  orphans: true,
  journal: false,
};

/** A stored look, checked value by value: anything missing or out of range takes its default. */
export function lookFrom(raw: unknown): MapLook {
  const value = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {};
  const num = (key: keyof MapLook, min: number, max: number) => {
    const found = value[key];
    return typeof found === "number" && found >= min && found <= max ? found : (MAP_LOOK[key] as number);
  };
  return {
    repel: num("repel", 20, 600),
    distance: num("distance", 20, 200),
    centre: num("centre", 0, 0.3),
    size: num("size", 0.5, 2.5),
    lines: num("lines", 0.5, 3),
    labelsAt: num("labelsAt", 0.3, 3),
    arrows: value["arrows"] === true,
    orphans: value["orphans"] !== false,
    journal: value["journal"] === true,
  };
}
