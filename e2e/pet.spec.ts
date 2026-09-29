import { test, expect, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { passSetup } from "./nav";

/**
 * Ember on the taskbar, in a real window.
 *
 * The walking, the errands and the rules are in shared/pet.test.ts. What is
 * worth a window here is what only Electron can answer: that she stands on
 * the seam of the real work area, that her window lets clicks through, that
 * there is only ever one of her, and that clicking her brings Caulder to
 * Today. Which window is "in front" is set through the suite's own hook,
 * because a test cannot take focus from whoever is at the machine.
 */

test.describe.configure({ mode: "serial" });

let userDataDir: string;
let app: ElectronApplication;

type PetState = { visible: boolean; bounds: { x: number; y: number; width: number; height: number } | null; ignoring: boolean };

function petState(): Promise<PetState> {
  return app.evaluate(() => (globalThis as unknown as { __caulderPet: { state: () => PetState } }).__caulderPet.state());
}

function caulderInFront(on: boolean): Promise<void> {
  return app.evaluate(
    (_electron, at: boolean) => (globalThis as unknown as { __caulderPet: { inFront: (a: boolean) => void } }).__caulderPet.inFront(at),
    on,
  );
}

/** The main window: the one whose address has no `#`. */
function mainWindow(): Page {
  const page = app.windows().find((one) => !one.url().includes("#"));
  if (!page) throw new Error("No main window.");
  return page;
}

test.beforeAll(async () => {
  userDataDir = mkdtempSync(join(tmpdir(), "caulder-pet-"));
  app = await electron.launch({
    args: [".", `--user-data-dir=${userDataDir}`],
    env: { ...process.env, ELECTRON_ENABLE_LOGGING: "0" },
  });
  const page = await app.firstWindow();
  await page.waitForSelector(".firstrun, .sidebar");
  if (await page.locator(".firstrun").isVisible()) {
    await page.getByLabel("Company name").fill("Unifloe");
    await page.getByRole("button", { name: "Create company" }).click();
    await passSetup(page);
  }
});

test.afterAll(async () => {
  await app?.close();
  rmSync(userDataDir, { recursive: true, force: true });
});

test("she is not out for a test run until asked, so the first window is still Caulder", async () => {
  // The trap the widget fell into: a second window that opens by itself
  // becomes firstWindow() and every other spec drives the wrong page.
  expect(app.windows()).toHaveLength(1);
  const state = await mainWindow().evaluate(() => window.caulder.pet.get());
  expect(state.form).toBe("off");
});

test("let out, she stays inside while Caulder is in front", async () => {
  await mainWindow().evaluate(() => window.caulder.pet.show("walk"));
  await caulderInFront(true);
  await expect.poll(async () => (await petState()).visible).toBe(false);
});

test("with Caulder behind, she stands on the seam above the taskbar", async () => {
  await caulderInFront(false);
  await expect.poll(async () => (await petState()).visible, { timeout: 5_000 }).toBe(true);

  const area = await app.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea);
  const { bounds } = await petState();
  // Her feet are sixty pixels down a sixty-four pixel window, so the window
  // hangs four pixels past the bottom of the work area: onto the taskbar's
  // edge, which is where her wheels and her bed's legs go.
  // Within a pixel: at a fractional scale factor Windows rounds a window's
  // corners to device pixels independently, and one at 959 DIPs is 1438.5
  // device pixels - it reads back as 958. Measured on the widget first.
  expect(Math.abs((bounds?.y ?? 0) - (area.y + area.height - 60))).toBeLessThanOrEqual(1);
  expect(Math.abs((bounds?.height ?? 0) - 64)).toBeLessThanOrEqual(1);
  expect(bounds?.x).toBeGreaterThanOrEqual(area.x);
  expect((bounds?.x ?? 0) + 64).toBeLessThanOrEqual(area.x + area.width);
});

test("she lets every click through while the pointer is not on her", async () => {
  expect((await petState()).ignoring).toBe(true);
});

test("clicking her brings Caulder forward on Today", async () => {
  const main = mainWindow();
  await main.getByRole("button", { name: /^Settings/ }).click();
  await expect(main.getByRole("heading", { name: "Ember", exact: true })).toBeVisible();

  const pet = app.windows().find((one) => one.url().includes("#pet"));
  expect(pet).toBeDefined();
  await pet?.evaluate(() => window.caulder.pet.open());

  await expect(main.getByLabel("Anything, in one line")).toBeVisible();
});

test("as a dot, she rests by the clock, comes out when pointed at, and goes back after", async () => {
  await mainWindow().evaluate(() => window.caulder.pet.show("dot"));
  await caulderInFront(false);
  const area = await app.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea);
  // At the clock end, and still there a moment later: a dot does not walk.
  await expect.poll(async () => (await petState()).bounds?.x ?? 0, { timeout: 5_000 }).toBeGreaterThanOrEqual(area.x + area.width - 65);
  const pet = app.windows().find((one) => one.url().includes("#pet"));
  if (!pet) throw new Error("Her window is not there.");
  const her = pet.locator(".pet");
  await expect(her).toHaveAttribute("data-form", "dot");
  await pet.waitForTimeout(1200);
  expect((await petState()).bounds?.x ?? 0).toBeGreaterThanOrEqual(area.x + area.width - 65);

  // Pointed at, she comes out and can be clicked; left, she is a dot again.
  await pet.locator(".pet__dot").dispatchEvent("mouseover");
  await expect(her).toHaveAttribute("data-form", "her");
  await expect.poll(async () => (await petState()).ignoring).toBe(false);
  await her.dispatchEvent("mouseout");
  await expect.poll(async () => (await petState()).ignoring).toBe(true);
  await expect(her).toHaveAttribute("data-form", "dot", { timeout: 5_000 });
  expect(await mainWindow().evaluate(() => window.caulder.pet.get())).toEqual({ form: "dot" });
});

test("put away, she is gone even with Caulder behind", async () => {
  await mainWindow().evaluate(() => window.caulder.pet.show("off"));
  await caulderInFront(false);
  await expect.poll(async () => (await petState()).visible).toBe(false);
});
