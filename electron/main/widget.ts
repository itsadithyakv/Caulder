import { BrowserWindow, app, screen } from "electron";
import { join } from "node:path";
import { DESK_PANEL, DESK_PILL, deskFit, deskHovered, deskOpen, deskRest } from "./desk";
import type { WidgetLevel } from "@shared/widget";
import { attachToWallpaper, detachFromWallpaper, type Attached } from "./wallpaper";

/**
 * The desk widget: what is on, what is next, and what is late, without
 * opening anything.
 *
 * It rests as a pill and opens on hover, and the **window** resizes rather
 * than the contents hiding - a full-size window with a pill drawn in it is
 * still a full-size hole over the desktop underneath, and at the desktop
 * level it would be a full-size hole over the wallpaper.
 *
 * **Hover is watched from the real cursor, here in main.** Three separate
 * reasons, each found the hard way and none of them fixable in the page:
 *
 *  - An element with `-webkit-app-region: drag` gets no mouse events at all,
 *    so the draggable pill can never fire `mouseenter`.
 *  - A window can be moved out from under a stationary pointer, and no DOM
 *    event says so.
 *  - At the desktop level the window is behind everything and unfocusable,
 *    where pointer events cannot be leaned on at all.
 *
 * One mechanism, both directions, no dependence on the DOM.
 *
 * **It opens when the pointer rests on it, not when it passes.** Opening on
 * the first tick threw a panel up every time the pointer crossed the corner
 * on its way somewhere else; a few ticks of resting is what "I want to read
 * this" looks like. It closes the same way, so a wobble off the edge does
 * not snap it shut.
 *
 * **It is dragged by hand, not by a drag region.** A region marked
 * `-webkit-app-region: drag` swallows every click, so the widget could be
 * moved or clicked but never both. The page says when a press starts and
 * ends; main follows the real cursor in between.
 */

const TICK = 150;
/** Ticks the pointer must rest before the panel opens: about half a second. */
const OPEN_AFTER = 3;
/** Ticks off it before the panel closes again. */
const CLOSE_AFTER = 3;

let window: BrowserWindow | null = null;
let level: WidgetLevel = "front";
/** Whether the panel is showing, as opposed to the resting pill. */
let opened = false;
/** The pill's place. The panel is worked out from it, never stored. */
let rest = { x: 0, y: 0, ...DESK_PILL };
/** How tall the panel is, which is however tall the page says its contents are. */
let panel = { ...DESK_PANEL };
let timer: NodeJS.Timeout | null = null;
/** Consecutive ticks over the widget, and off it. */
let over = 0;
let off = 0;
/** A press being dragged: where the pointer and the pill were when it started. */
let drag: { from: { x: number; y: number }; rest: { x: number; y: number }; moved: boolean } | null = null;
/** Opens the main window on Today; index.ts hands it over. */
let opener: (() => void) | null = null;
/** What the desktop level last answered, or null at any other level. */
let pinned: Attached | null = null;
const movers = new Set<(spot: { x: number; y: number }) => void>();

/** Test runs launch the app dozens of times; none of them should take focus. */
const background = () => process.env["CAULDER_BACKGROUND"] === "1";

/** Where the suite says the pointer is. Null, and always null outside a test run. */
let pretend: { x: number; y: number } | null = null;

/**
 * Where the pointer is.
 *
 * The real cursor, except under the suite - which cannot move a mouse without
 * taking it away from whoever is at the machine. Overriding the reading and
 * leaving the watcher to do its own work keeps the tick, the hit test and the
 * resize all under test; a hook that grew the window directly would test
 * nothing but the hook, and lose a race with the next tick besides.
 */
function pointer(): { x: number; y: number } {
  return pretend ?? screen.getCursorScreenPoint();
}

function areaFor(spot: { x: number; y: number }) {
  return screen.getDisplayNearestPoint(spot).workArea;
}

function build(): BrowserWindow {
  const created = new BrowserWindow({
    ...DESK_PILL,
    x: rest.x,
    y: rest.y,
    frame: false,
    show: false,
    transparent: true,
    backgroundColor: "#00000000",
    skipTaskbar: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    // It is a glance, not a place you work. Taking focus from whatever you
    // are typing in would make it the opposite of passive.
    focusable: false,
    webPreferences: {
      preload: join(__dirname, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const devServer = process.env["ELECTRON_RENDERER_URL"];
  if (devServer) void created.loadURL(`${devServer}#widget`);
  else void created.loadFile(join(__dirname, "../renderer/index.html"), { hash: "widget" });

  created.on("closed", () => {
    window = null;
    stopWatching();
  });

  return created;
}

/** Puts the window where the state says it should be. */
function place(bounds: { x: number; y: number; width: number; height: number }): void {
  if (!window || window.isDestroyed()) return;
  window.setBounds(bounds);
}

function grow(): void {
  if (!window || opened) return;
  opened = true;
  place(deskOpen(rest, areaFor(rest), panel));
  window.webContents.send("widget:open", true);
}

function shrink(): void {
  if (!window || !opened) return;
  opened = false;
  place(rest);
  window.webContents.send("widget:open", false);
}

function startWatching(): void {
  if (timer) return;
  timer = setInterval(() => {
    if (!window || window.isDestroyed()) return;
    if (drag) return;
    const point = pointer();
    const bounds = opened ? deskOpen(rest, areaFor(rest), panel) : rest;
    if (deskHovered(point, bounds, opened)) {
      over += 1;
      off = 0;
      if (over >= OPEN_AFTER) grow();
    } else {
      off += 1;
      over = 0;
      if (off >= CLOSE_AFTER) shrink();
    }
  }, TICK);
}

function stopWatching(): void {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}

/**
 * Applies a level to the window that is open.
 *
 * Always lets go of the desktop first, whatever it is moving to. A window
 * still parented to Progman cannot be made topmost, and one that is topmost
 * cannot be parented - so every change goes through the middle.
 */
function apply(next: WidgetLevel): void {
  if (!window || window.isDestroyed()) return;
  detachFromWallpaper(window);
  window.setAlwaysOnTop(false);
  pinned = null;

  if (next === "desktop") {
    pinned = attachToWallpaper(window);
    // Failing soft, and saying so: the widget stays a window rather than
    // disappearing because one Win32 call moved between Windows versions.
    if (!pinned.ok) window.setAlwaysOnTop(true, "floating");
    return;
  }
  if (next === "front") window.setAlwaysOnTop(true, "floating");
}

/** Opens the widget, at a level and in the place it was last left. */
export function showWidget(wanted: WidgetLevel, spot: { x: number; y: number } | null): void {
  level = wanted;
  rest = deskRest(spot, areaFor(spot ?? screen.getPrimaryDisplay().workArea));

  if (!window) window = build();
  place(rest);
  opened = false;

  // Never `show()`: it is focusable false, but a show still raises it over
  // whatever you are reading, and this is meant to be found rather than to
  // arrive.
  window.showInactive();
  apply(level);
  startWatching();
}

/** Closes it. Detaching first, or the app hangs on the way out with nothing on screen. */
export function hideWidget(): void {
  if (!window) return;
  stopWatching();
  detachFromWallpaper(window);
  const going = window;
  window = null;
  going.destroy();
}

/**
 * Moves it between levels while it is open.
 *
 * Returns what the desktop level answered, so Settings can say "Windows
 * would not" rather than leaving somebody looking for a widget that is in
 * front of them after all.
 */
export function setWidgetLevel(wanted: WidgetLevel): void {
  level = wanted;
  if (window) apply(level);
}

/**
 * A press on the pill or the panel's head: started, the pointer moving, let
 * go. The pointer is read here rather than sent, so the page's coordinates
 * and the screen's never have to agree. Answers whether it moved, so the page
 * can tell a click from a drag.
 */
export function dragWidget(phase: "start" | "move" | "end"): boolean {
  if (!window) return false;
  const point = pointer();
  if (phase === "start") {
    drag = { from: point, rest: { x: rest.x, y: rest.y }, moved: false };
    return false;
  }
  if (!drag) return false;
  const dx = point.x - drag.from.x;
  const dy = point.y - drag.from.y;
  if (Math.abs(dx) > 3 || Math.abs(dy) > 3) drag.moved = true;
  if (drag.moved) {
    rest = deskRest({ x: drag.rest.x + dx, y: drag.rest.y + dy }, areaFor(point));
    place(opened ? deskOpen(rest, areaFor(rest), panel) : rest);
  }
  const moved = drag.moved;
  if (phase === "end") {
    drag = null;
    if (moved) for (const listener of movers) listener({ x: rest.x, y: rest.y });
  }
  return moved;
}

/** What opens the main window, from index.ts. */
export function setWidgetOpener(open: () => void): void {
  opener = open;
}

/** The widget clicked: Caulder, on Today. */
export function openFromWidget(): void {
  opener?.();
}

export function widgetState(): { on: boolean; level: WidgetLevel; reason: string | null } {
  return {
    on: window !== null,
    level,
    reason: pinned && !pinned.ok ? pinned.reason : null,
  };
}

/**
 * The page reporting how tall its contents are.
 *
 * Ignored while the pill is resting: the page measures on every render, and a
 * measurement taken as it shrinks would set the panel to the pill's height for
 * the next opening.
 */
export function fitWidget(height: number): void {
  const wanted = deskFit(height);
  if (wanted === panel.height) return;
  panel = { ...panel, height: wanted };
  if (opened) place(deskOpen(rest, areaFor(rest), panel));
}

/** Told when somebody drags the pill, so the spot can be remembered. */
export function onWidgetMove(listener: (spot: { x: number; y: number }) => void): void {
  movers.add(listener);
}

// Before the window goes, and before the app does. A window parented to
// Progman does not close cleanly, and the hang has nothing on screen to
// explain itself - one e2e run took an hour instead of thirty seconds.
app.on("before-quit", () => {
  stopWatching();
  if (window) detachFromWallpaper(window);
});

/**
 * A way in for the suite, and only for the suite: where the pointer is, and
 * where the pill currently rests to aim it at. The same seam the tray takes,
 * for the same reason - there is no pointer a test can move.
 */
if (background()) {
  (globalThis as {
    __caulderWidget?: { point: (at: { x: number; y: number } | null) => void; rest: () => typeof rest };
  }).__caulderWidget = {
    point: (at) => {
      pretend = at;
    },
    rest: () => rest,
  };
}
