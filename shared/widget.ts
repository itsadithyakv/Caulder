/**
 * What the desk widget's three levels are, and how its settings read.
 *
 * In `shared/` because both halves need the same answer: main puts the window
 * at a level, and Settings has to describe that level in time for somebody to
 * choose it. Two copies of this list is how a card ends up promising
 * behaviour the window does not have.
 *
 * The geometry - where the pill rests and where the panel opens - is main's
 * alone and lives in electron/main/desk.ts.
 */

export const WIDGET_LEVELS = [
  {
    id: "front",
    title: "In front",
    detail: "Above your other windows, wherever you drag it. Hover it to open it.",
  },
  {
    id: "desktop",
    title: "On the desktop",
    /**
     * The one that has to be said before it is chosen rather than discovered
     * after. Somebody who picks this and then cannot find the widget has not
     * hit a bug - they have a browser open.
     */
    detail:
      "Part of the wallpaper, behind your windows and your icons. You see it when you see the desktop, and it cannot be clicked or dragged there - Windows sends those to the desktop instead. Move it while it is in front, then send it back.",
  },
  {
    id: "normal",
    title: "An ordinary window",
    detail: "In the stack with everything else, so whatever you are working in covers it.",
  },
] as const;

export type WidgetLevel = (typeof WIDGET_LEVELS)[number]["id"];

/**
 * The level to restore, from what was stored.
 *
 * Anything unrecognised is `front` rather than an error: the settings row is
 * editable by anyone who can open the file, and a widget that refuses to
 * appear because its level is misspelt is worse than one in the wrong place.
 * `front` and not `desktop` because it is the only level where everything
 * about the widget works - visible without minimising anything, and
 * clickable.
 */
export function widgetLevel(saved: string | null): WidgetLevel {
  const found = WIDGET_LEVELS.find((level) => level.id === saved?.trim());
  return found?.id ?? "front";
}

/**
 * Whether it comes back on launch.
 *
 * Never set is off. The widget is the one part of Caulder that puts something
 * on screen you did not open, so it starts asked-for or not at all.
 */
export function widgetWanted(saved: string | null): boolean {
  return saved === "1";
}

/** Where the resting pill was left, if it was ever written. */
export function widgetSpot(saved: string | null): { x: number; y: number } | null {
  if (!saved) return null;
  try {
    const read: unknown = JSON.parse(saved);
    if (typeof read !== "object" || read === null) return null;
    const { x, y } = read as { x?: unknown; y?: unknown };
    if (typeof x !== "number" || typeof y !== "number") return null;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { x: Math.round(x), y: Math.round(y) };
  } catch {
    return null;
  }
}
