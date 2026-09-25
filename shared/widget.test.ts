import { describe, expect, it } from "vitest";
import { WIDGET_LEVELS, widgetLevel, widgetSpot, widgetWanted } from "./widget";

describe("which level to restore", () => {
  it("is in front when nobody has chosen", () => {
    expect(widgetLevel(null)).toBe("front");
  });

  it("restores the one that was chosen", () => {
    expect(widgetLevel("desktop")).toBe("desktop");
    expect(widgetLevel(" normal ")).toBe("normal");
  });

  // The settings row is a line in a SQLite file anybody can open. A level
  // nobody recognises should cost the widget its place, not its existence.
  it("falls back rather than refusing to appear", () => {
    expect(widgetLevel("wallpaper")).toBe("front");
    expect(widgetLevel("")).toBe("front");
  });
});

describe("whether it comes back at all", () => {
  it("stays away until it has been asked for", () => {
    expect(widgetWanted(null)).toBe(false);
  });

  it("comes back once it has been", () => {
    expect(widgetWanted("1")).toBe(true);
  });

  it("stays away once it has been sent away", () => {
    expect(widgetWanted("0")).toBe(false);
  });
});

describe("the spot it was left in", () => {
  it("is nothing at all before it has ever been moved", () => {
    expect(widgetSpot(null)).toBeNull();
  });

  it("reads a pair of numbers", () => {
    expect(widgetSpot('{"x":300,"y":120}')).toEqual({ x: 300, y: 120 });
  });

  it("rounds, because a window cannot sit on half a pixel", () => {
    expect(widgetSpot('{"x":1.6,"y":2.4}')).toEqual({ x: 2, y: 2 });
  });

  // Every one of these is a row somebody could have edited by hand, or a
  // shape an older version wrote. None of them is a reason to throw on launch.
  it("refuses anything that is not a pair of numbers", () => {
    expect(widgetSpot("not json at all")).toBeNull();
    expect(widgetSpot("{}")).toBeNull();
    expect(widgetSpot("null")).toBeNull();
    expect(widgetSpot('{"x":"300","y":120}')).toBeNull();
    expect(widgetSpot('{"x":null,"y":120}')).toBeNull();
  });
});

describe("what each level says about itself", () => {
  // The admission the whole card is built around. A level that takes the
  // widget out of reach has to say so before it is picked, not after.
  it("admits that the desktop level cannot be clicked", () => {
    const desktop = WIDGET_LEVELS.find((level) => level.id === "desktop");
    expect(desktop?.detail).toContain("cannot be clicked");
  });

  it("gives every level a name and a sentence", () => {
    for (const level of WIDGET_LEVELS) {
      expect(level.title.length).toBeGreaterThan(0);
      expect(level.detail.length).toBeGreaterThan(20);
    }
  });

  // Front first: it is the one somebody reading the card should land on, and
  // the one an unrecognised setting falls back to.
  it("offers the level everything works at first", () => {
    expect(WIDGET_LEVELS[0]?.id).toBe("front");
  });
});
