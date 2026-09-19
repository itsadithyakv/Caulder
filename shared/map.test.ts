import { describe, expect, it } from "vitest";
import {
  asOf,
  mapKindOf,
  matching,
  neighbourhood,
  radiusOf,
  replaySteps,
  withKinds,
  type MapGraph,
  type MapNode,
} from "./map";

function node(key: string, createdAt: string, kind: MapNode["kind"] = "page"): MapNode {
  const [ref, id] = key.split(":") as ["page" | "contact", string];
  return { key, ref, id, kind, label: id, section: null, createdAt, degree: 0, x: null, y: null, pinned: false };
}

// a - b - c - d, and e alone
const graph: MapGraph = {
  nodes: [
    node("page:a", "2026-09-01"),
    node("page:b", "2026-09-02"),
    node("contact:c", "2026-09-03", "contact"),
    node("page:d", "2026-09-04", "decision"),
    node("page:e", "2026-09-05"),
  ],
  links: [
    { source: "page:a", target: "page:b", createdAt: "2026-09-02" },
    { source: "page:b", target: "contact:c", createdAt: "2026-09-06" },
    { source: "page:d", target: "contact:c", createdAt: "2026-09-04" },
  ],
};

const keys = (g: MapGraph) => g.nodes.map((n) => n.key);

describe("what a dot is", () => {
  it("is what it is - and a page is a page, a decision, or the founder's own", () => {
    expect(mapKindOf("contact", null)).toBe("contact");
    expect(mapKindOf("product", null)).toBe("product");
    expect(mapKindOf("person", null)).toBe("person");
    expect(mapKindOf("document", null)).toBe("document");
    // The thinking around products is a page; the products are their own dots.
    expect(mapKindOf("page", "products")).toBe("page");
    expect(mapKindOf("page", "decisions")).toBe("decision");
    expect(mapKindOf("page", "journal")).toBe("own");
    expect(mapKindOf("page", "studies")).toBe("own");
    expect(mapKindOf("page", "plan")).toBe("page");
  });

  it("grows with its lines, and slower than they do", () => {
    expect(radiusOf(0)).toBe(4);
    expect(radiusOf(4)).toBeGreaterThan(radiusOf(1));
    expect(radiusOf(100)).toBeLessThan(30);
  });
});

describe("the local map", () => {
  it("reaches two lines out, both ways", () => {
    expect(keys(neighbourhood(graph, "page:a", 2))).toEqual(["page:a", "page:b", "contact:c"]);
    expect(keys(neighbourhood(graph, "contact:c", 2))).toEqual(["page:a", "page:b", "contact:c", "page:d"]);
  });

  it("keeps only the lines between what it keeps", () => {
    expect(neighbourhood(graph, "page:a", 1).links).toEqual([graph.links[0]]);
  });

  it("is the dot alone when nothing links to it, and nothing for a stranger", () => {
    expect(keys(neighbourhood(graph, "page:e", 2))).toEqual(["page:e"]);
    expect(neighbourhood(graph, "page:zzz", 2)).toEqual({ nodes: [], links: [] });
  });
});

describe("replay", () => {
  it("steps through each moment something appeared", () => {
    expect(replaySteps(graph)).toEqual(["2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-05", "2026-09-06"]);
  });

  it("shows only what existed then, and no line to a dot not yet made", () => {
    const early = asOf(graph, "2026-09-03");
    expect(keys(early)).toEqual(["page:a", "page:b", "contact:c"]);
    expect(early.links).toEqual([graph.links[0]]);
    expect(asOf(graph, "2026-09-06").links).toHaveLength(3);
  });
});

describe("filters", () => {
  it("hides the kinds switched off, and their lines", () => {
    const pages = withKinds(graph, new Set(["page"]));
    expect(keys(pages)).toEqual(["page:a", "page:b", "page:e"]);
    expect(pages.links).toEqual([graph.links[0]]);
  });

  it("matches a search anywhere in the name, ignoring case", () => {
    const pricing = { ...node("page:p", "2026-09-01"), label: "Pricing for schools" };
    expect(matching(pricing, "SCHOOL")).toBe(true);
    expect(matching(pricing, "  ")).toBe(true);
    expect(matching(pricing, "grant")).toBe(false);
  });
});
