import { test, expect, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { goTo, passSetup } from "./nav";

/**
 * The desk widget, in a real window.
 *
 * Where the pill rests and where the panel opens are worked out by hand in
 * electron/main/desk.test.ts, and what the three levels are in
 * shared/widget.test.ts. What needs the real thing is everything those
 * cannot reach: that the switch in Settings actually makes a window, that it
 * comes back after a restart, that hovering it grows the window rather than
 * the contents, and - the one that has burnt this feature before - that an
 * app with a widget pinned to the wallpaper still quits.
 */

test.describe.configure({ mode: "serial" });

let userDataDir: string;
let app: ElectronApplication | null = null;

async function openApp(): Promise<{ app: ElectronApplication; page: Page }> {
  const launched = await electron.launch({
    args: [".", `--user-data-dir=${userDataDir}`],
    env: { ...process.env, ELECTRON_ENABLE_LOGGING: "0" },
  });
  app = launched;
  // Not firstWindow(): once the widget restores itself on launch, the first
  // window to appear is as likely to be the widget as the app. Every extra
  // window Caulder opens carries a hash, and the main one carries none.
  const page = await mainWindow(launched);
  await page.waitForSelector(".firstrun, .sidebar");
  if (await page.locator(".firstrun").isVisible()) {
    await page.getByLabel("Company name").fill("Mine");
    await page.getByRole("button", { name: "Create company" }).click();
    await passSetup(page);
    await expect(page.getByRole("button", { name: /Mine/ })).toBeVisible();
  }
  return { app: launched, page };
}

/** The app's own window, as opposed to the widget or the quick box. */
async function mainWindow(electronApp: ElectronApplication): Promise<Page> {
  const found = electronApp.windows().find((w) => !w.url().includes("#"));
  if (found) return found;
  for (;;) {
    const next = await electronApp.waitForEvent("window");
    if (!next.url().includes("#")) return next;
  }
}

/** The widget's window, by the hash main gave it. */
function widgetBounds(electronApp: ElectronApplication) {
  return electronApp.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes("#widget"));
    return win ? win.getBounds() : null;
  });
}

/**
 * Which of the two sizes the window is, rather than the exact pixels.
 *
 * At a fractional display scale - this machine runs 1.5 - Electron rounds a
 * rectangle's two corners to device pixels independently, so a window whose
 * x does not land on a whole device pixel reports back a pixel wider than it
 * was asked for. Measured: 184x44 asked for at x=300 comes back exactly, and
 * the same size at x=1507 comes back 185x45. The app is placing it correctly;
 * an exact assertion here would be asserting the rounding.
 */
async function widgetSize(electronApp: ElectronApplication): Promise<"pill" | "panel" | null> {
  const bounds = await widgetBounds(electronApp);
  if (!bounds) return null;
  if (Math.abs(bounds.height - 44) <= 2) return "pill";
  // The open panel has no one height: it is as tall as what is in it, between
  // 96 and 372. So it is told apart by being taller than the pill, not by a
  // number - an empty day opens to about 98 and a full one to about 330.
  if (bounds.height > 46 && bounds.height <= 374) return "panel";
  return null;
}

type Spot = { x: number; y: number };
type Hook = { point: (at: Spot | null) => void; rest: () => Spot };

/**
 * Puts the pointer on the widget, or a long way from it.
 *
 * The widget watches the real cursor, which no test can move without taking
 * the mouse off whoever is at the machine, so the reading is overridden and
 * the watcher left to do the rest: its own tick, its own hit test, its own
 * resize. The hook exists only under the suite.
 */
function point(electronApp: ElectronApplication, on: boolean) {
  // The electron module is the first argument; what is passed in is the second.
  return electronApp.evaluate((_electron, over: boolean) => {
    const hook = (globalThis as { __caulderWidget?: Hook }).__caulderWidget;
    if (!hook) return;
    const rest = hook.rest();
    hook.point(over ? { x: rest.x + 20, y: rest.y + 20 } : { x: rest.x - 500, y: rest.y - 500 });
  }, on);
}

test.beforeAll(() => {
  userDataDir = mkdtempSync(join(tmpdir(), "caulder-widget-"));
});

test.afterAll(() => {
  rmSync(userDataDir, { recursive: true, force: true });
});

test.afterEach(async () => {
  await app?.close();
  app = null;
});

test("the switch in Settings puts a pill on the desktop", async () => {
  const { app: running, page } = await openApp();

  await goTo(page, "Settings");
  const opened = running.waitForEvent("window");
  await page.getByRole("switch", { name: "Show the desk widget" }).click();

  const widget = await opened;
  await widget.waitForSelector(".desk--pill");

  // The resting size, which is the window's size and not a card drawn inside
  // a bigger one: a full-size window with a pill in it is a full-size hole
  // over the wallpaper.
  expect(await widgetSize(running)).toBe("pill");
});

test("and it comes back where it was left", async () => {
  const { app: running, page } = await openApp();

  // No second click: the state was stored, so the launch above made it.
  await expect.poll(() => widgetSize(running)).toBe("pill");
  await goTo(page, "Settings");
  await expect(page.getByRole("switch", { name: "Show the desk widget" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
});

test("the pointer on it grows the window, not the contents", async () => {
  const { app: running } = await openApp();
  await expect.poll(() => widgetSize(running)).toBe("pill");

  // Only the pointer's position is supplied; the watcher does everything
  // else, so the tick, the hit test and the resize are all under test here.
  // Which pointers count as on it is worked out by hand in desk.test.ts.
  const widget = running.windows().find((w) => w.url().includes("#widget"));
  await point(running, true);

  // The window grew, and the page drew the panel rather than a pill inside a
  // window-shaped hole.
  await expect.poll(() => widgetSize(running)).toBe("panel");
  await widget?.waitForSelector(".desk--panel");

  await point(running, false);
  await expect.poll(() => widgetSize(running)).toBe("pill");
  await widget?.waitForSelector(".desk--pill");
});

test("it can be pinned to the wallpaper, and the app still quits", async () => {
  const { app: running, page } = await openApp();
  await goTo(page, "Settings");

  await page.getByRole("button", { name: "On the desktop" }).click();

  // Either it went behind the wallpaper or Windows refused and said why.
  // Both are correct; silently doing neither is not. `reason` is null only
  // when GetAncestor came back with the desktop's own window - on this
  // machine, Windows 11, it does.
  const state = await page.evaluate(() => window.caulder.widget.get());
  expect(state.level).toBe("desktop");
  if (state.reason !== null) expect(state.reason.length).toBeGreaterThan(0);

  // And the window is still there either way, rather than having vanished
  // into a level that did not work out.
  expect(await widgetSize(running)).not.toBeNull();

  // The real assertion is the teardown. A window parented to Progman does not
  // close cleanly, and the app hangs on quit with nothing on screen to say
  // why - one run took an hour instead of thirty seconds. If the detach is
  // missing, this test times out rather than passing.
  await app?.close();
  app = null;
});

test("turning it off takes the window with it", async () => {
  const { app: running, page } = await openApp();
  await goTo(page, "Settings");

  await page.getByRole("switch", { name: "Show the desk widget" }).click();
  await expect.poll(() => widgetSize(running)).toBeNull();
});
