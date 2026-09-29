import { BrowserWindow, app, screen } from "electron";
import { join } from "node:path";
import { onTaskbar, PET_SIZE, stroll, walkway, type PetForm, type Stroll } from "@shared/pet";
import { fullScreenInFront } from "./foreground";

/**
 * Ember on the taskbar: a small window that walks the seam between the
 * taskbar and everything above it.
 *
 * The decisions are in `shared/pet.ts`; this does what they say. Three
 * things about it are not obvious:
 *
 *  - **She can never cost a click.** Her window sits over the bottom of any
 *    maximised window, so it ignores the mouse - except while the pointer is
 *    actually on her, which the page reports, so she can be clicked. With
 *    `forward`, Windows still tells the page where the pointer is while
 *    clicks go straight through to whatever is underneath.
 *  - **There is only one of her.** While Caulder is the window in front she
 *    is inside it on the quick line, and this window is hidden.
 *  - **She is moved by the window, not inside it.** A window the size of her
 *    walking along the screen, rather than a strip across the whole bottom
 *    of the screen with her drawn in it - a strip would be a sixty-four
 *    pixel band over every app's status bar, and this is a sixty-four pixel
 *    square over wherever she happens to be.
 */

/** Four ticks a second: often enough to walk, rarely enough to cost nothing. */
const TICK = 250;

/** How often the foreground is asked about, in ticks. Once a second is plenty. */
const LOOK_EVERY = 4;

let window: BrowserWindow | null = null;
let timer: NodeJS.Timeout | null = null;
let wanted = false;
/** Walking the seam, or a dot by the clock that comes out when pointed at. */
let form: Exclude<PetForm, "off"> = "dot";
let caulderInFront = true;
let fullScreen = false;
let held = false;
let hovering = false;
let ticks = 0;
let walk: Stroll = { x: 0, dir: 1, rest: 20, walked: 0 };
let told: { moving: boolean; dir: 1 | -1 } | null = null;
const openers = new Set<() => void>();

/** Test runs launch the app dozens of times; she does not come out for them unless asked. */
const background = () => process.env["CAULDER_BACKGROUND"] === "1";

function build(): BrowserWindow {
  const created = new BrowserWindow({
    width: PET_SIZE,
    height: PET_SIZE,
    frame: false,
    show: false,
    transparent: true,
    backgroundColor: "#00000000",
    hasShadow: false,
    skipTaskbar: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    // She is company, not a place you type. Taking focus from whatever you
    // are writing would make her the opposite of ambient - and would also
    // make Caulder the window in front, which would put her away.
    focusable: false,
    webPreferences: {
      preload: join(__dirname, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const devServer = process.env["ELECTRON_RENDERER_URL"];
  if (devServer) void created.loadURL(`${devServer}#pet`);
  else void created.loadFile(join(__dirname, "../renderer/index.html"), { hash: "pet" });

  // The page is told which she is once it can hear, and again whenever it changes.
  created.webContents.on("did-finish-load", () => created.webContents.send("pet:form", form));
  created.setAlwaysOnTop(true, "floating");
  created.setIgnoreMouseEvents(true, { forward: true });
  created.on("closed", () => {
    window = null;
    stop();
  });
  return created;
}

function tick(): void {
  if (!window || window.isDestroyed()) return;
  ticks += 1;
  if (ticks % LOOK_EVERY === 0) fullScreen = fullScreenInFront();

  const out = onTaskbar({ wanted, caulderInFront, fullScreenInFront: fullScreen });
  if (!out) {
    if (window.isVisible()) window.hide();
    return;
  }

  const way = walkway(screen.getPrimaryDisplay().workArea);
  // A dot does not walk: she rests at the clock end, where the eye already
  // goes, and comes out there. Walking, someone pointing at her holds her
  // still as surely as a pastime does.
  walk = form === "dot" ? { x: way.to, dir: -1, rest: 0, walked: 0 } : stroll(walk, way, held || hovering);
  window.setBounds({ x: Math.round(walk.x), y: way.y, width: PET_SIZE, height: PET_SIZE });
  // Never `show()`: it raises her over whatever you are reading, and she is
  // meant to be found rather than to arrive.
  if (!window.isVisible()) window.showInactive();

  const moving = form === "walk" && !held && !hovering && walk.rest === 0;
  if (!told || told.moving !== moving || told.dir !== walk.dir) {
    told = { moving, dir: walk.dir };
    window.webContents.send("pet:walk", told);
  }
}

function start(): void {
  if (timer) return;
  timer = setInterval(tick, TICK);
}

function stop(): void {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}

/** Lets her out, walking or as a dot. She only appears once Caulder is not the window in front. */
export function showPet(as: Exclude<PetForm, "off"> = "dot"): void {
  wanted = true;
  if (form !== as) {
    form = as;
    window?.webContents.send("pet:form", form);
  }
  if (!window) {
    window = build();
    walk = { ...walk, x: walkway(screen.getPrimaryDisplay().workArea).to };
    told = null;
  }
  start();
}

/** Puts her away altogether. */
export function hidePet(): void {
  wanted = false;
  stop();
  if (!window) return;
  const going = window;
  window = null;
  going.destroy();
}

export function petState(): { form: PetForm } {
  return { form: wanted ? form : "off" };
}

/** Told by the main window: is Caulder the one in front? */
export function setCaulderInFront(inFront: boolean): void {
  caulderInFront = inFront;
}

/** The page: something wants her still - a pastime, a mood, an errand. */
export function holdPet(still: boolean): void {
  held = still;
}

/** The page: the pointer is on her, so she has to be clickable. */
export function hoverPet(over: boolean): void {
  hovering = over;
  if (!window || window.isDestroyed()) return;
  if (over) window.setIgnoreMouseEvents(false);
  else window.setIgnoreMouseEvents(true, { forward: true });
}

/** She was clicked. Whoever is listening brings Caulder forward. */
export function openFromPet(): void {
  for (const listener of openers) listener();
}

export function onPetOpen(listener: () => void): void {
  openers.add(listener);
}

app.on("before-quit", stop);

/**
 * A way in for the suite, and only for the suite: whether Caulder counts as
 * in front, and where she is. There is no window a test can bring to the
 * front without taking it from whoever is at the machine.
 */
if (background()) {
  (globalThis as {
    __caulderPet?: {
      inFront: (at: boolean) => void;
      state: () => { visible: boolean; bounds: Electron.Rectangle | null; ignoring: boolean };
    };
  }).__caulderPet = {
    inFront: (at) => setCaulderInFront(at),
    state: () => ({
      visible: window?.isVisible() ?? false,
      bounds: window?.getBounds() ?? null,
      ignoring: !hovering,
    }),
  };
}
