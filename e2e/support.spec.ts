import { test, expect, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { goTo, passSetup } from "./nav";

/**
 * Caulder is free, and says who made it (PLAN.md, part six, phase 23): About
 * Caulder in Settings, and the ask at the foot of Today - not on the first
 * day, and gone for three months after Not now.
 */

test.describe.configure({ mode: "serial" });

let userDataDir: string;
let app: ElectronApplication;

async function launch(): Promise<Page> {
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
  await expect(page.getByLabel("Main")).toBeVisible();
  return page;
}

/** The app's own database, while the app is closed. */
function setting(value?: string): string | null {
  const db = new Database(join(userDataDir, "caulder.db"));
  try {
    if (value !== undefined) db.prepare(`UPDATE settings SET value = ? WHERE key = 'supportAsk'`).run(value);
    const row = db.prepare(`SELECT value FROM settings WHERE key = 'supportAsk'`).get() as { value: string } | undefined;
    return row?.value ?? null;
  } finally {
    db.close();
  }
}

test.beforeAll(() => {
  userDataDir = mkdtempSync(join(tmpdir(), "caulder-support-"));
});

test.afterAll(() => {
  rmSync(userDataDir, { recursive: true, force: true });
});

test.afterEach(async () => {
  await app?.close();
});

test("the first day asks nothing, and About Caulder has the ways to help", async () => {
  const page = await launch();
  await expect(page.getByText("Nothing is due today")).toBeVisible();
  await expect(page.getByText(/one college student in India makes it/)).toHaveCount(0);

  await goTo(page, "Settings");
  const about = page.locator(".about");
  await expect(about.getByRole("heading", { name: "About Caulder" })).toBeVisible();
  await expect(about.getByText(/Made by one college student in India/)).toBeVisible();
  await expect(about.getByRole("button", { name: "Sponsor on GitHub" })).toBeVisible();
  await expect(about.getByRole("button", { name: "Licences" })).toBeVisible();
  await expect(about.getByRole("button", { name: "Privacy" })).toBeVisible();
});

test("a month on, Today asks at its foot, and Not now puts it away", async () => {
  // The first launch set the day to ask on; move it into the past.
  expect(setting()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  setting("2020-01-01");

  let page = await launch();
  const ask = page.locator(".supportask");
  await expect(ask).toBeVisible();
  await expect(ask.getByText(/one college student in India makes it/)).toBeVisible();
  await ask.getByRole("button", { name: "Not now" }).click();
  await expect(ask).toHaveCount(0);
  await app.close();

  // Asked again in three months, not on the next launch.
  const next = setting();
  expect(next).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(next! > new Date().toISOString().slice(0, 10)).toBe(true);
  page = await launch();
  await expect(page.getByText("Nothing is due today")).toBeVisible();
  await expect(page.locator(".supportask")).toHaveCount(0);
});

test("Don't ask again is for good", async () => {
  setting("2020-01-01");
  let page = await launch();
  await page.locator(".supportask").getByRole("button", { name: "Don't ask again" }).click();
  await expect(page.locator(".supportask")).toHaveCount(0);
  await app.close();

  expect(setting()).toBe("never");
  page = await launch();
  await expect(page.getByText("Nothing is due today")).toBeVisible();
  await expect(page.locator(".supportask")).toHaveCount(0);
});
