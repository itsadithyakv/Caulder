import { test, expect, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { goTo } from "./nav";

/**
 * Nothing complains on the way through.
 *
 * This exists because of a bug that was invisible in every other suite. The
 * renderer runs under `script-src 'self'`, which refuses inline script — and
 * refuses it as a console message, not an exception. The one inline script in
 * index.html was the code that applies the saved theme before the first
 * paint, so the feature that exists to prevent a flash never ran at all, and
 * every screen still looked correct in every test.
 *
 * A console error is a bug that has not been noticed yet. Walking the screens
 * with the console watched is the cheapest way to notice.
 */

test.describe.configure({ mode: "serial" });

let userDataDir: string;
let app: ElectronApplication;
let complaints: string[];

/** Everything the renderer reported, including violations that threw nothing. */
function watch(page: Page) {
  const found: string[] = [];
  page.on("pageerror", (error) => found.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") found.push(`console.error: ${message.text()}`);
  });
  return found;
}

test.beforeAll(() => {
  userDataDir = mkdtempSync(join(tmpdir(), "caulder-console-"));
});

test.afterAll(() => {
  rmSync(userDataDir, { recursive: true, force: true });
});

test.afterEach(async () => {
  await app?.close();
});

test("first run says nothing to the console", async () => {
  app = await electron.launch({
    args: [".", `--user-data-dir=${userDataDir}`],
    env: { ...process.env, ELECTRON_ENABLE_LOGGING: "0" },
  });
  const page = await app.firstWindow();
  complaints = watch(page);

  await page.waitForSelector(".firstrun");
  await page.getByLabel("Company name").fill("Unifloe");
  await page.getByRole("button", { name: "Create company" }).click();
  await expect(page.getByRole("button", { name: /Company: Unifloe/ })).toBeVisible();

  // A first run now offers the tour, which sits over everything. Dismissing
  // it is exactly what somebody starting the app does.
  await page.waitForTimeout(700);
  if (await page.locator(".tour").count()) await page.keyboard.press("Escape");

  expect(complaints).toEqual([]);
});

test("every screen loads without a complaint", async () => {
  app = await electron.launch({
    args: [".", `--user-data-dir=${userDataDir}`],
    env: { ...process.env, ELECTRON_ENABLE_LOGGING: "0" },
  });
  const page = await app.firstWindow();
  complaints = watch(page);
  await page.waitForSelector(".sidebar");

  // Scoped to the sidebar: the Day screen has its own Day/Week tabs, so an
  // unscoped "Day" now matches two controls.
  const nav = page.getByLabel("Main");

  for (const screen of ["Today", "Calendar", "Contacts", "Deals", "Money", "Import", "Settings"]) {
    await goTo(page, screen);
    await expect(page.getByRole("heading", { name: screen, exact: true })).toBeVisible();
  }

  // The week is a second reading of the same screen rather than a screen of
  // its own, so it is walked here rather than being missed by a nav loop.
  await nav.getByRole("button", { name: "Calendar", exact: true }).click();
  await page.getByLabel("How much to show").getByRole("button", { name: "Week" }).click();
  await expect(page.locator(".week__lane")).toHaveCount(7);

  // And the things that sit over a screen rather than being one.
  await page.keyboard.press("?");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");

  await page.keyboard.press("Control+k");
  await expect(page.locator(".switcher")).toBeVisible();
  await page.keyboard.press("Escape");

  expect(complaints).toEqual([]);
});

test("the saved theme is on the document before the app draws anything", async () => {
  app = await electron.launch({
    args: [".", `--user-data-dir=${userDataDir}`],
    env: { ...process.env, ELECTRON_ENABLE_LOGGING: "0" },
  });
  const page = await app.firstWindow();
  await page.waitForSelector(".sidebar");

  await page.evaluate(() => localStorage.setItem("caulder.theme", "dark"));
  complaints = watch(page);
  await page.reload();

  // The attribute is what the whole token file keys off. React sets it too,
  // on mount — the point of the boot script is that it is already right
  // before React exists, so nothing paints light first.
  await expect
    .poll(() => page.evaluate(() => document.documentElement.dataset["theme"]))
    .toBe("dark");

  expect(complaints).toEqual([]);
});
