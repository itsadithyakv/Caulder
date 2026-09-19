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

export function withKinds(graph: MapGraph, kinds: ReadonlySet<MapKind>): MapGraph {
  const nodes = graph.nodes.filter((node) => kinds.has(node.kind));
  const present = new Set(nodes.map((node) => node.key));
  return {
    nodes,
    links: graph.links.filter((link) => present.has(link.source) && present.has(link.target)),
  };
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
  /** The zoom past which every label shows; below it, only the busiest and what is lit. */
  labelsAt: number;
  /** Which way a link was written, as an arrow at the far end. */
  arrows: boolean;
  /** Dots with no line at all. */
  orphans: boolean;
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
  };
}
