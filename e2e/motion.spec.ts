import { test, expect, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pick } from "./choose";
import { passSetup } from "./nav";

/**
 * Motion.
 *
 * Two things are worth a real window here. One, that the animations are
 * actually attached rather than sitting in a stylesheet nothing selects. Two,
 * and much more important, that the app still works with motion turned off:
 * ticking a task holds the row on screen before telling the parent, and a
 * hold that waited on an animation would wait forever under reduced motion.
 */

test.describe.configure({ mode: "serial" });

let userDataDir: string;
let app: ElectronApplication;

async function launch() {
  return electron.launch({
    args: [".", `--user-data-dir=${userDataDir}`],
    env: { ...process.env, ELECTRON_ENABLE_LOGGING: "0" },
  });
}

/** The animation the browser has resolved for an element, not the one declared. */
function animationOf(page: Page, selector: string) {
  return page.evaluate((sel) => {
    const element = document.querySelector(sel);
    if (!element) throw new Error(`No element for ${sel}`);
    const style = getComputedStyle(element);
    return { name: style.animationName, duration: style.animationDuration };
  }, selector);
}

async function ensureCompany(page: Page) {
  await page.waitForSelector(".firstrun, .sidebar");
  if (await page.locator(".firstrun").isVisible()) {
    await page.getByLabel("Company name").fill("Unifloe");
    await page.getByRole("button", { name: "Create company" }).click();
    await passSetup(page);
    await expect(page.getByRole("button", { name: /Company: Unifloe/ })).toBeVisible();

  }
}

async function addLeadWithTask(page: Page, name: string) {
  await page.getByRole("button", { name: "Contacts", exact: true }).click();
  await page.getByRole("button", { name: /^Add a? ?contact$/ }).first().click();
  await page.getByLabel("Name").fill(name);
  await page.getByRole("button", { name: "Add contact" }).click();

  await page.getByRole("button", { name: "Add a task" }).click();
  await page.getByLabel("What needs doing").fill(`Call ${name}`);
  await pick(page, "Kind", "Call");
  await page.getByRole("button", { name: "Add task" }).click();
  await expect(page.getByText(`Call ${name}`)).toBeVisible();
}

test.beforeAll(() => {
  userDataDir = mkdtempSync(join(tmpdir(), "caulder-motion-"));
});

test.afterAll(() => {
  rmSync(userDataDir, { recursive: true, force: true });
});

test.afterEach(async () => {
  await app?.close();
});

test("first run arrives, and the mark arrives with it", async () => {
  app = await launch();
  const page = await app.firstWindow();
  await page.waitForSelector(".firstrun");

  expect((await animationOf(page, ".firstrun__card")).name).toBe("float-up");
  expect((await animationOf(page, ".firstrun__mark")).name).toBe("mark-in");
});

test("changing screen replays the page entrance", async () => {
  app = await launch();
  const page = await app.firstWindow();
  await ensureCompany(page);

  expect((await animationOf(page, ".main__inner")).name).toBe("rise");

  // Keyed on the route, so the second screen animates as well as the first.
  await page.getByRole("button", { name: "Deals", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Deals" })).toBeVisible();
  expect((await animationOf(page, ".main__inner")).name).toBe("rise");
});

test("Today's sections arrive in the order they need attention", async () => {
  app = await launch();
  const page = await app.firstWindow();
  await ensureCompany(page);
  await addLeadWithTask(page, "Bengaluru Public School");

  await page.getByRole("button", { name: "Today", exact: true }).click();
  await expect(page.getByText("Due today")).toBeVisible();

  // Second section onwards is held back, so the order reads as an order.
  const delays = await page.evaluate(() =>
    [...document.querySelectorAll(".today.anim-stagger > *")].map(
      (el) => getComputedStyle(el).animationDelay,
    ),
  );

  expect(delays.length).toBeGreaterThan(1);
  expect(delays[0]).toBe("0s");
  expect(delays[1]).not.toBe("0s");
});

test("a form that opens in place arrives with it", async () => {
  app = await launch();
  const page = await app.firstWindow();
  await ensureCompany(page);

  await page.getByRole("button", { name: "Contacts", exact: true }).click();
  await page.getByRole("button", { name: /^Add a? ?contact$/ }).first().click();

  expect((await animationOf(page, ".leadform")).name).toBe("unfold");
});

test("a completed task leaves before the list closes over it", async () => {
  app = await launch();
  const page = await app.firstWindow();
  await ensureCompany(page);

  await page.getByRole("button", { name: "Today", exact: true }).click();
  await expect(page.getByText("Call Bengaluru Public School")).toBeVisible();

  const row = page.locator(".taskrow").first();
  await row.locator(".taskrow__tick").click();

  // Still there, and on its way out, rather than gone the instant it is clicked.
  await expect(row).toHaveClass(/anim-leave/);

  await expect(page.getByText("Call Bengaluru Public School")).toHaveCount(0);
});

test("reduced motion turns the animations off, and the app still works", async () => {
  app = await launch();
  const page = await app.firstWindow();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await ensureCompany(page);
  await addLeadWithTask(page, "TRIO World School");

  expect((await animationOf(page, ".main__inner")).name).toBe("none");

  await page.getByRole("button", { name: "Today", exact: true }).click();
  await expect(page.getByText("Call TRIO World School")).toBeVisible();

  // The point of the whole test. The row is held back before the parent is
  // told, and if that hold waited on an animationend event it would never
  // fire here - the tick would look broken and the task would never complete.
  await page.locator(".taskrow__tick").first().click();

  // Gone from the screen AND gone from the day, which only happens if the
  // write landed and Today re-read it. A row that merely animated away would
  // still be here.
  await expect(page.getByText("Call TRIO World School")).toHaveCount(0);
  await expect(page.getByText("Nothing is due today")).toBeVisible();
});
