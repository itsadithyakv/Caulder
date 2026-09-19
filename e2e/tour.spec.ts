import { test, expect, _electron as electron, type ElectronApplication } from "@playwright/test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { passSetup } from "./nav";

/**
 * The first-run tour, in a real window: five quick steps after the setup
 * guide, the line's step saying the key that works from any app, gone for
 * good once done, and back from `?` when asked for.
 *
 * Every other spec runs without it; this one asks for it with CAULDER_TOUR.
 * Set CAULDER_SHOTS to a folder to keep a screenshot of each step.
 */

test.describe.configure({ mode: "serial" });

let userDataDir: string;
let app: ElectronApplication | undefined;

const launch = () =>
  electron.launch({
    args: [".", `--user-data-dir=${userDataDir}`],
    env: { ...process.env, ELECTRON_ENABLE_LOGGING: "0", CAULDER_TOUR: "1" },
  });

test.beforeAll(() => {
  userDataDir = mkdtempSync(join(tmpdir(), "caulder-tour-"));
});

test.afterEach(async () => {
  await app?.close();
  app = undefined;
});

test.afterAll(() => {
  rmSync(userDataDir, { recursive: true, force: true });
});

test("a first run gets a short tour, and the line's step says the key for any app", async () => {
  app = await launch();
  const page = await app.firstWindow();
  await page.waitForSelector(".firstrun, .sidebar");
  await page.getByLabel("Company name").fill("Unifloe");
  await page.getByRole("button", { name: "Create company" }).click();
  await passSetup(page);

  const tour = page.getByRole("dialog", { name: "Your day, in one place" });
  await expect(tour).toBeVisible();
  await expect(tour).toContainText("1 of 5");
  const shots = process.env["CAULDER_SHOTS"];
  if (shots) mkdirSync(shots, { recursive: true });
  const shot = async (name: string) => {
    if (shots) await page.screenshot({ path: join(shots, `tour-${name}.png`) });
  };
  await page.waitForTimeout(400);
  await shot("1");

  await page.getByRole("button", { name: "Next" }).click();
  const line = page.getByRole("dialog", { name: "One line for anything" });
  await expect(line).toContainText("Ctrl Alt A");
  await page.waitForTimeout(400);
  await shot("2");

  // The arrow keys move through it too.
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("dialog", { name: "Yours, not the company's" })).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("dialog", { name: "Your company" })).toBeVisible();
  await page.waitForTimeout(400);
  await shot("4");
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.locator(".tour")).toHaveCount(0);
});

test("once done it does not come back, and ? has it again", async () => {
  app = await launch();
  const page = await app.firstWindow();
  await expect(page.getByRole("button", { name: /Company: Unifloe/ })).toBeVisible();
  await page.waitForTimeout(600);
  await expect(page.locator(".tour")).toHaveCount(0);

  await page.keyboard.press("?");
  await page.getByRole("button", { name: "Show me around again" }).click();
  await expect(page.getByRole("dialog", { name: "Your day, in one place" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".tour")).toHaveCount(0);
});
