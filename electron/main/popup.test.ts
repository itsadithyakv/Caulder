import { describe, expect, it } from "vitest";
import { nearTray, shortcutToClaim, trayItems, trayShouldOpen, trayTooltip } from "./popup";

/**
 * The tray and the quick window, worked out by hand on a 1920x1080 screen
 * whose taskbar is 40px tall along the bottom unless a test says otherwise.
 */

const SIZE = { width: 560, height: 260 };
const BOTTOM = { x: 0, y: 0, width: 1920, height: 1040 };

describe("which key to claim", () => {
  it("claims Ctrl+Alt+A when nobody has chosen", () => {
    expect(shortcutToClaim(null)).toBe("Ctrl+Alt+A");
  });

  it("keeps a key that was turned off turned off, across restarts", () => {
    expect(shortcutToClaim("")).toBe("");
  });

  it("claims the one somebody picked", () => {
    expect(shortcutToClaim(" Ctrl+Alt+N ")).toBe("Ctrl+Alt+N");
  });
});

describe("where the window goes", () => {
  it("sits above an icon in a taskbar along the bottom, against the right edge", () => {
    // The icon at x 1800 wants the window centred on it, which would run off
    // the right, so it is pulled back to 8px from the edge.
    const icon = { x: 1790, y: 1050, width: 20, height: 20 };
    expect(nearTray(icon, BOTTOM, SIZE)).toEqual({ x: 1352, y: 772, width: 560, height: 260 });
  });

  it("centres on an icon that has room either side", () => {
    const icon = { x: 950, y: 1050, width: 20, height: 20 };
    expect(nearTray(icon, BOTTOM, SIZE)?.x).toBe(960 - 280);
  });

  it("hangs below a taskbar along the top", () => {
    const icon = { x: 1790, y: 10, width: 20, height: 20 };
    const top = { x: 0, y: 40, width: 1920, height: 1040 };
    expect(nearTray(icon, top, SIZE)).toMatchObject({ y: 48 });
  });

  it("stands beside a taskbar on the right", () => {
    const icon = { x: 1890, y: 1000, width: 20, height: 20 };
    const right = { x: 0, y: 0, width: 1860, height: 1080 };
    expect(nearTray(icon, right, SIZE)).toEqual({ x: 1292, y: 812, width: 560, height: 260 });
  });

  it("gives up on an icon with no size, so the caller can centre it", () => {
    expect(nearTray({ x: 0, y: 0, width: 0, height: 0 }, BOTTOM, SIZE)).toBeNull();
  });

  it("works on a second screen to the left of the first", () => {
    const icon = { x: -130, y: 1050, width: 20, height: 20 };
    const left = { x: -1920, y: 0, width: 1920, height: 1040 };
    expect(nearTray(icon, left, SIZE)).toEqual({ x: -568, y: 772, width: 560, height: 260 });
  });
});

describe("the tray itself", () => {
  it("shows the key beside the thing it does", () => {
    expect(trayItems("Ctrl+Alt+A")[0]).toEqual({ label: "Add a task", action: "task", accelerator: "Ctrl+Alt+A" });
    expect(trayItems(null)[0]).toEqual({ label: "Add a task", action: "task" });
  });

  it("puts quitting last, after a separator", () => {
    const items = trayItems(null);
    expect(items.at(-1)).toEqual({ label: "Quit Caulder", action: "quit" });
    expect(items).toContainEqual({ separator: true });
  });

  it("says what the key does when hovered, and only when there is one", () => {
    expect(trayTooltip("Ctrl+Alt+A")).toBe("Caulder - Ctrl+Alt+A adds a task from anywhere");
    expect(trayTooltip(null)).toBe("Caulder");
  });
});

describe("clicking the icon", () => {
  it("opens a window that is shut", () => {
    expect(trayShouldOpen(false, 0, 10_000)).toBe(true);
  });

  it("does not reopen the window the same click just closed", () => {
    // The click takes focus first, which hides the window; the click itself
    // arrives a few milliseconds later and must leave it shut.
    expect(trayShouldOpen(false, 10_000, 10_040)).toBe(false);
  });

  it("closes a window that is open", () => {
    expect(trayShouldOpen(true, 0, 10_000)).toBe(false);
  });
});
