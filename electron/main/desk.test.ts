import { describe, expect, it } from "vitest";
import { DESK_PANEL, DESK_PILL, deskFit, deskHovered, deskOpen, deskRest } from "./desk";

/**
 * The desk widget, worked out by hand on a 1920x1080 screen whose taskbar is
 * 40px tall along the bottom, so the work area is 1920x1040.
 */

const AREA = { x: 0, y: 0, width: 1920, height: 1040 };

describe("where the pill rests", () => {
  it("starts in the bottom right, clear of the taskbar", () => {
    // 1920 - 184 - 16 across, and 1040 - 44 - 16 down.
    expect(deskRest(null, AREA)).toEqual({ x: 1644, y: 980, ...DESK_PILL });
  });

  it("goes back where it was left", () => {
    expect(deskRest({ x: 400, y: 200 }, AREA)).toEqual({ x: 400, y: 200, ...DESK_PILL });
  });

  // The case that matters: a widget left on a second monitor, and the monitor
  // is now unplugged. Clamping only on a move would leave it unreachable.
  it("is pulled back onto the screen it was left off", () => {
    expect(deskRest({ x: 3200, y: 1600 }, AREA)).toEqual({ x: 1644, y: 980, ...DESK_PILL });
    expect(deskRest({ x: -900, y: -400 }, AREA)).toEqual({ x: 16, y: 16, ...DESK_PILL });
  });
});

describe("where the panel opens", () => {
  it("grows up and left from a pill in the bottom right, so the pill does not move", () => {
    const rest = deskRest(null, AREA);
    const open = deskOpen(rest, AREA);
    expect(open).toEqual({ x: 1596, y: 652, ...DESK_PANEL });
    // The corner nearest the screen edge is the same corner in both.
    expect(open.x + open.width).toBe(rest.x + rest.width);
    expect(open.y + open.height).toBe(rest.y + rest.height);
  });

  it("grows down and right from a pill in the top left, for the same reason", () => {
    const rest = deskRest({ x: 16, y: 16 }, AREA);
    const open = deskOpen(rest, AREA);
    expect(open).toEqual({ x: 16, y: 16, ...DESK_PANEL });
  });

  it("grows up and right from a pill in the bottom left", () => {
    const rest = deskRest({ x: 16, y: 980 }, AREA);
    expect(deskOpen(rest, AREA)).toEqual({ x: 16, y: 652, ...DESK_PANEL });
  });
});

describe("how tall the panel is allowed to be", () => {
  it("is as tall as the page says", () => {
    expect(deskFit(210)).toBe(210);
  });

  it("never grows past the ceiling, however much there is to show", () => {
    expect(deskFit(900)).toBe(372);
  });

  // A measurement taken mid-render, or from a page that has not laid out yet,
  // comes back as 0. Obeying it would leave a window with no height, which is
  // a widget that has silently stopped existing.
  it("refuses to collapse on a measurement of nothing", () => {
    expect(deskFit(0)).toBe(96);
    expect(deskFit(-40)).toBe(96);
  });

  it("falls back to the full height on a number that is not one", () => {
    expect(deskFit(Number.NaN)).toBe(372);
    expect(deskFit(Number.POSITIVE_INFINITY)).toBe(372);
  });
});

describe("the panel at a height of its own", () => {
  it("still shares the pill's corner when it is shorter", () => {
    const rest = deskRest(null, AREA);
    const open = deskOpen(rest, AREA, { width: DESK_PANEL.width, height: 200 });
    expect(open.height).toBe(200);
    expect(open.y + open.height).toBe(rest.y + rest.height);
  });
});

describe("whether the pointer is on it", () => {
  const bounds = { x: 100, y: 100, width: 184, height: 44 };

  it("counts the edge as on it", () => {
    expect(deskHovered({ x: 100, y: 100 }, bounds, false)).toBe(true);
    expect(deskHovered({ x: 284, y: 144 }, bounds, false)).toBe(true);
  });

  it("counts a pixel outside as off it, while it is shut", () => {
    expect(deskHovered({ x: 99, y: 100 }, bounds, false)).toBe(false);
    expect(deskHovered({ x: 285, y: 100 }, bounds, false)).toBe(false);
  });

  // Open, the box is bigger than the window. Without that, a pointer resting
  // on the edge of an open panel shuts and opens it on every tremor.
  it("holds on a little longer once it is open", () => {
    expect(deskHovered({ x: 89, y: 100 }, bounds, true)).toBe(true);
    expect(deskHovered({ x: 87, y: 100 }, bounds, true)).toBe(false);
  });
});
