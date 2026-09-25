/**
 * Where the desk widget goes, with no Electron in it - so every case can be
 * worked out by hand, and widget.ts only has to carry the answer out.
 *
 * Geometry only. What the three levels are, and how the settings read, is in
 * shared/widget.ts, because Settings has to describe a level in time for
 * somebody to choose it and this module is main's alone.
 *
 * The hit test is the part worth reading twice. **Hover is watched from the
 * real cursor**, not from the DOM: a window behind everything gets no mouse
 * events, and a draggable region gets none either, so the pointer's own
 * position is the only thing that answers in every case.
 */

type Rect = { x: number; y: number; width: number; height: number };
type Size = { width: number; height: number };

/** Resting: wide enough for "3 due - 2 today" and no wider. */
export const DESK_PILL: Size = { width: 184, height: 44 };
/**
 * Open: as tall as what is in it, never taller than this.
 *
 * The height is a ceiling rather than a size. A fixed panel is 372px of card
 * whatever the day holds, so an empty Sunday draws three lines and 300px of
 * nothing - and on a transparent window over somebody's wallpaper that reads
 * as broken rather than as quiet. The page measures itself and main obeys.
 */
export const DESK_PANEL: Size = { width: 308, height: 372 };
/** Short of this there is nothing worth opening for, so a bad measurement cannot collapse it. */
const DESK_PANEL_MIN = 96;

/** A height the page asked for, held to what a window may sensibly be. */
export function deskFit(height: number): number {
  if (!Number.isFinite(height)) return DESK_PANEL.height;
  return Math.round(Math.min(Math.max(height, DESK_PANEL_MIN), DESK_PANEL.height));
}

/**
 * The resting pill's place: where it was left, or the bottom right corner.
 *
 * Clamped every time rather than only when it is moved, because the monitor
 * it was left on may be gone - unplugging a second screen is how a widget
 * ends up somewhere nobody can reach it.
 */
export function deskRest(remembered: { x: number; y: number } | null, area: Rect, gap = 16): Rect {
  const size = DESK_PILL;
  const fallback = {
    x: area.x + area.width - size.width - gap,
    y: area.y + area.height - size.height - gap,
  };
  const spot = remembered ?? fallback;
  return {
    x: Math.round(Math.min(Math.max(spot.x, area.x + gap), Math.max(area.x + gap, area.x + area.width - size.width - gap))),
    y: Math.round(Math.min(Math.max(spot.y, area.y + gap), Math.max(area.y + gap, area.y + area.height - size.height - gap))),
    ...size,
  };
}

/**
 * Where the panel goes when the pill opens.
 *
 * It grows away from the nearest edges, so a pill resting in the bottom right
 * opens upward and leftward and the pill itself does not appear to move. The
 * obvious version - grow down and right from the pill's corner - puts the
 * panel off the screen for the corner people actually leave it in.
 */
export function deskOpen(rest: Rect, area: Rect, size: Size = DESK_PANEL, gap = 16): Rect {
  const midX = rest.x + rest.width / 2;
  const midY = rest.y + rest.height / 2;

  const x = midX > area.x + area.width / 2 ? rest.x + rest.width - size.width : rest.x;
  const y = midY > area.y + area.height / 2 ? rest.y + rest.height - size.height : rest.y;

  const room = (value: number, start: number, span: number, extent: number) =>
    Math.round(Math.min(Math.max(value, start + gap), Math.max(start + gap, start + span - extent - gap)));

  return {
    x: room(x, area.x, area.width, size.width),
    y: room(y, area.y, area.height, size.height),
    ...size,
  };
}

/**
 * Whether the pointer counts as being over the widget.
 *
 * The margin is why this is a function rather than a comparison. A hit test
 * on the exact bounds opens and shuts the panel every time the pointer
 * trembles on the edge; growing the box while it is open and shrinking it
 * while it is shut gives the gesture somewhere to rest.
 */
export function deskHovered(point: { x: number; y: number }, bounds: Rect, open: boolean, margin = 12): boolean {
  const slack = open ? margin : 0;
  return (
    point.x >= bounds.x - slack &&
    point.x <= bounds.x + bounds.width + slack &&
    point.y >= bounds.y - slack &&
    point.y <= bounds.y + bounds.height + slack
  );
}
