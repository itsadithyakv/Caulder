import { describe, expect, it } from "vitest";
import { navFor, navRouteOf, routeById } from "./routes";

/**
 * The sidebar's shape. Memories are the person's, so they sit under You with
 * the journal and Life; the map is reached from the Brain and from Memories
 * rather than being a row, and while it is open the Brain row says where you
 * are.
 */

const rows = (group: string) => navFor().find((entry) => entry.group === group)?.routes.map((route) => route.id) ?? [];

describe("the sidebar", () => {
  it("has Memories under You, after Life", () => {
    expect(rows("you")).toEqual(["journal", "life", "memories"]);
    expect(routeById("memories").label).toBe("Memories");
  });

  it("keeps the company's screens together, with no row for the map", () => {
    expect(rows("company")).toEqual(["leads", "pipeline", "money", "brain"]);
    expect(navFor().flatMap((entry) => entry.routes.map((route) => route.id))).not.toContain("map");
  });

  it("lights Brain while the map is open, and Contacts while Import is", () => {
    expect(navRouteOf("map")).toBe("brain");
    expect(navRouteOf("import")).toBe("leads");
    expect(navRouteOf("memories")).toBe("memories");
  });
});
