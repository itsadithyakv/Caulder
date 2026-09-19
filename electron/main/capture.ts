import { BrowserWindow, globalShortcut, screen, app, type Rectangle } from "electron";
import { join } from "node:path";
import { nearTray, trayShouldOpen } from "./popup";

/**
 * The quick window: a task or a thought, without stopping what you are doing.
 *
 * A task you have to open an app, pick a workspace and find a screen to write
 * is a task you do not write. So this is a small window that appears in front
 * of whatever you were doing, takes a line, and goes away again. Two ways in:
 * the tray icon, which puts it by the icon, and a system-wide key, which puts
 * it where you are looking.
 *
 * Two rules it lives by:
 *
 *  - **On from the start, and easy to turn off.** The key is Ctrl+Alt+A until
 *    somebody picks another or none - and a key turned off stays off.
 *  - **A failed registration is reported, not swallowed.** Another app may
 *    already own the combination, and believing you have a key that does
 *    nothing is worse than knowing you have none.
 */

const WIDTH = 560;
/**
 * Tall enough for the task mode's question row under the line, which is the
 * tallest thing the window ever shows. A note box one row taller costs
 * nothing; a question clipped off the bottom would be an answer you cannot
 * give.
 */
const HEIGHT = 260;

type Mode = "task" | "note";

let window: BrowserWindow | null = null;
let registered: string | null = null;
/** The last combination asked for, held or not - what Settings shows. */
let attempted = "";
/** Why that combination is not held, when it is not. */
let refusal: string | null = null;
/** The mode this showing was asked for; null keeps whichever was last used. */
let wanted: Mode | null = null;
/** When it last hid itself, so a tray click that caused the hide does not undo it. */
let hiddenAt = 0;
const listeners = new Set<() => void>();

function devServer(): string | undefined {
  return process.env.ELECTRON_RENDERER_URL;
}

/** Test runs launch the app dozens of times; none of them should take focus. */
const background = () => process.env["CAULDER_BACKGROUND"] === "1";

function build(): BrowserWindow {
  const created = new BrowserWindow({
    width: WIDTH,
    height: HEIGHT,
    frame: false,
    show: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    backgroundColor: "#00000000",
    transparent: true,
    webPreferences: {
      preload: join(__dirname, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  created.setAlwaysOnTop(true, "screen-saver");
  created.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  const url = devServer();
  if (url) void created.loadURL(`${url}#capture`);
  else void created.loadFile(join(__dirname, "../renderer/index.html"), { hash: "capture" });

  // Closing on blur is what makes it feel like a key rather than a window.
  // Clicking away is a way of saying "not this after all", and leaving a
  // half-typed line floating over the desktop is not.
  created.on("blur", () => {
    created.hide();
    hiddenAt = Date.now();
  });

  // The first showing is asked for before the page exists; it hears which
  // mode once it has loaded, and asks again itself on mount.
  created.webContents.on("did-finish-load", tellMode);

  created.on("closed", () => {
    window = null;
  });

  return created;
}

function tellMode(): void {
  if (window && wanted) window.webContents.send("capture:mode", wanted);
}

/** Centred on whichever screen is being looked at, a third of the way down. */
function placeCentre(target: BrowserWindow): void {
  const { workArea } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  target.setBounds({
    x: Math.round(workArea.x + (workArea.width - WIDTH) / 2),
    y: Math.round(workArea.y + workArea.height / 3 - HEIGHT / 2),
    width: WIDTH,
    height: HEIGHT,
  });
}

/**
 * Opens the window, in a mode if one is asked for, by the tray icon if an
 * anchor is given and where you are looking otherwise.
 */
export function openCapture(options: { mode?: Mode; anchor?: Rectangle } = {}): void {
  if (!window) window = build();
  wanted = options.mode ?? null;

  const spot = options.anchor
    ? nearTray(options.anchor, screen.getDisplayMatching(options.anchor).workArea, { width: WIDTH, height: HEIGHT })
    : null;
  if (spot) window.setBounds(spot);
  else placeCentre(window);

  if (background()) window.showInactive();
  else {
    window.show();
    window.focus();
  }
  if (!window.webContents.isLoading()) tellMode();
}

/** The tray icon's click: open it by the icon, or shut it if it is open. */
export function toggleCapture(anchor: Rectangle): void {
  const visible = window?.isVisible() ?? false;
  if (visible) {
    window?.hide();
    hiddenAt = Date.now();
    return;
  }
  if (trayShouldOpen(visible, hiddenAt, Date.now())) openCapture({ mode: "task", anchor });
}

export function closeCapture(): void {
  window?.hide();
}

/** Which mode the window was last asked to open in, for it to ask on mount. */
export function wantedMode(): Mode | null {
  return wanted;
}

/** The key as it actually stands - held, or refused and why. */
export function captureState(): { accelerator: string; held: boolean; reason: string | null } {
  return { accelerator: attempted, held: registered !== null, reason: refusal };
}

/** The key being held right now, or null. */
export function heldShortcut(): string | null {
  return registered;
}

/** Told whenever the key changes, so the tray can show the new one. */
export function onShortcutChange(listener: () => void): void {
  listeners.add(listener);
}

type ShortcutResult = { ok: true } | { ok: false; reason: string };

function claim(accelerator: string): ShortcutResult {
  try {
    globalShortcut.register(accelerator, () => openCapture());
  } catch {
    return { ok: false, reason: `${accelerator} is not a combination Windows can register.` };
  }
  if (!globalShortcut.isRegistered(accelerator)) {
    return {
      ok: false,
      reason: `${accelerator} is already being used by something else on this machine. Pick another.`,
    };
  }
  return { ok: true };
}

/**
 * Claims the combination, or says why it could not.
 *
 * An empty accelerator means "none", which is a valid answer and not a
 * failure. Anything else is verified with `isRegistered` afterwards, because
 * `register` returning without throwing is not the same as having got it.
 *
 * A refused combination leaves the one already held in place. Trying a key
 * that turns out to be taken must not cost you the one that worked.
 */
export function setCaptureShortcut(accelerator: string): ShortcutResult {
  const wantedKey = accelerator.trim();
  const previous = registered;
  if (previous) {
    globalShortcut.unregister(previous);
    registered = null;
  }

  let outcome: ShortcutResult = { ok: true };
  if (wantedKey.length > 0) {
    outcome = claim(wantedKey);
    if (outcome.ok) registered = wantedKey;
    else if (previous && claim(previous).ok) registered = previous;
  }

  attempted = outcome.ok ? wantedKey : (registered ?? wantedKey);
  refusal = outcome.ok ? null : outcome.reason;
  for (const listener of listeners) listener();
  return outcome;
}

app.on("will-quit", () => {
  // Only once the app is ready. A quit asked for before then - a second copy
  // bowing out - reaches this at once, and globalShortcut throws before
  // "ready": an error dialog that kept that copy running, with nothing held
  // to let go of anyway.
  if (app.isReady()) globalShortcut.unregisterAll();
});
