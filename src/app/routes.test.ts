import { describe, expect, it } from "vitest";
import { navFor, navRouteOf, routeById } from "./routes";

/**
 * The sidebar's shape: your time, then the company. The map and Memories are
 * the brain read another way, so neither is a row, and while either is open
 * the Brain row says where you are.
 */

const rows = (group: string) => navFor().find((entry) => entry.group === group)?.routes.map((route) => route.id) ?? [];

describe("the sidebar", () => {
  it("is your time, the company, and Settings - and nothing personal", () => {
    expect(navFor().map((entry) => entry.group)).toEqual(["plan", "company", "app"]);
    expect(rows("plan")).toEqual(["today", "day"]);
    expect(rows("app")).toEqual(["settings"]);
  });

  it("keeps the company's screens together, with no row for the map or for Memories", () => {
    expect(rows("company")).toEqual(["leads", "pipeline", "money", "brain"]);
    const every = navFor().flatMap((entry) => entry.routes.map((route) => route.id));
    expect(every).not.toContain("map");
    expect(every).not.toContain("memories");
    expect(routeById("memories").label).toBe("Memories");
  });

  it("lights Brain while the map or Memories is open, and Contacts while Import is", () => {
    expect(navRouteOf("map")).toBe("brain");
    expect(navRouteOf("memories")).toBe("brain");
    expect(navRouteOf("import")).toBe("leads");
  });
});
