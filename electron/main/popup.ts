import { DEFAULT_CAPTURE_SHORTCUT } from "@shared/domain";

/**
 * The decisions behind the tray and the quick window, with no Electron in
 * them - so each can be tested by hand, and tray.ts and capture.ts only have
 * to carry them out.
 */

type Rect = { x: number; y: number; width: number; height: number };
type Size = { width: number; height: number };

/**
 * Which key to claim on launch.
 *
 * Never set is the default. Set to empty is off, deliberately, and stays off:
 * a key turned off that came back after the next restart would be the app
 * overruling the one decision somebody made about it.
 */
export function shortcutToClaim(saved: string | null): string {
  if (saved === null) return DEFAULT_CAPTURE_SHORTCUT;
  return saved.trim();
}

/**
 * Where the quick window goes when it comes from the tray: against the edge
 * the taskbar is on, over the icon, and never off the screen.
 *
 * The taskbar can be on any edge, so the edge is the one the icon is nearest.
 * An icon that reports no size - one tucked into the overflow flyout - has no
 * position worth trusting, and the caller falls back to the middle of the
 * screen.
 */
export function nearTray(anchor: Rect, area: Rect, size: Size, gap = 8): Rect | null {
  if (anchor.width <= 0 || anchor.height <= 0) return null;

  const cx = anchor.x + anchor.width / 2;
  const cy = anchor.y + anchor.height / 2;
  const clampX = (x: number) =>
    Math.round(Math.min(Math.max(x, area.x + gap), area.x + area.width - size.width - gap));
  const clampY = (y: number) =>
    Math.round(Math.min(Math.max(y, area.y + gap), area.y + area.height - size.height - gap));

  const distances = [
    ["bottom", area.y + area.height - cy],
    ["top", cy - area.y],
    ["right", area.x + area.width - cx],
    ["left", cx - area.x],
  ] as const;
  const edge = distances.reduce((best, next) => (next[1] < best[1] ? next : best))[0];

  const place = (x: number, y: number): Rect => ({ x, y, width: size.width, height: size.height });
  if (edge === "bottom") return place(clampX(cx - size.width / 2), area.y + area.height - size.height - gap);
  if (edge === "top") return place(clampX(cx - size.width / 2), area.y + gap);
  if (edge === "right") return place(area.x + area.width - size.width - gap, clampY(cy - size.height / 2));
  return place(area.x + gap, clampY(cy - size.height / 2));
}

type TrayAction = "task" | "note" | "open" | "quit";
type TrayItem = { label: string; action: TrayAction; accelerator?: string } | { separator: true };

/**
 * The tray's menu. The key is shown beside the thing it does, so the menu is
 * also where you find out the key exists.
 */
export function trayItems(shortcut: string | null): TrayItem[] {
  return [
    { label: "Add a task", action: "task", ...(shortcut ? { accelerator: shortcut } : {}) },
    { label: "Write a note", action: "note" },
    { separator: true },
    { label: "Open Caulder", action: "open" },
    { label: "Quit Caulder", action: "quit" },
  ];
}

/** What hovering the icon says. */
export function trayTooltip(shortcut: string | null): string {
  return shortcut ? `Caulder - ${shortcut} adds a task from anywhere` : "Caulder";
}

/**
 * Whether a click on the tray should open the window or leave it shut.
 *
 * Clicking the icon while the window is open takes focus from the window
 * first, which hides it - so by the time the click arrives it is already
 * shut, and opening it again would make the icon impossible to close with.
 * A hide that happened a moment ago was this same click.
 */
export function trayShouldOpen(visible: boolean, hiddenAt: number, now: number): boolean {
  if (visible) return false;
  return now - hiddenAt > 300;
}
