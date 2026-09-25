import { test, expect, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { goTo, passSetup } from "./nav";

/**
 * The journal's passcode, in a real window: writing today never asks for it,
 * a day that is over is locked behind it, a wrong one is refused, and the
 * right one opens the day.
 *
 * Set CAULDER_SHOTS to a folder to keep a screenshot of each screen.
 */

test.describe.configure({ mode: "serial" });

let userDataDir: string;
let app: ElectronApplication;
let page: Page;

async function shot(name: string) {
  const folder = process.env["CAULDER_SHOTS"];
  if (!folder) return;
  mkdirSync(folder, { recursive: true });
  await page.screenshot({ path: join(folder, `journal-lock-${name}.png`) });
}

/** A day this many days from today, as the journal names it. */
function daysAgo(days: number): string {
  const at = new Date();
  at.setDate(at.getDate() - days);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
}

test.beforeAll(async () => {
  userDataDir = mkdtempSync(join(tmpdir(), "caulder-journal-lock-"));
  app = await electron.launch({
    args: [".", `--user-data-dir=${userDataDir}`],
    env: { ...process.env, ELECTRON_ENABLE_LOGGING: "0" },
  });
  page = await app.firstWindow();
  await page.waitForSelector(".firstrun, .sidebar");
  await page.getByLabel("Company name").fill("Unifloe");
  await page.getByRole("button", { name: "Create company" }).click();
  await passSetup(page);
  await expect(page.getByRole("button", { name: /Company: Unifloe/ })).toBeVisible();

  // Yesterday, written already.
  await page.evaluate(async (day) => {
    const company = (await window.caulder.companies.list()).homeCompanyId as string;
    const entry = await window.caulder.life.entry(company, day);
    await window.caulder.brain.save(entry.id, {
      title: entry.title,
      body: "Told Asha the pilot slipped.",
      fields: entry.fields,
      secrets: {},
      baseRevision: entry.revision,
    });
  }, daysAgo(1));
});

test.afterAll(async () => {
  await app?.close();
  rmSync(userDataDir, { recursive: true, force: true });
});

test("a passcode locks the days that are over, and today still needs none", async () => {
  await goTo(page, "Journal");
  await page.getByRole("button", { name: "Passcode" }).click();
  await page.getByRole("menuitem", { name: /Lock the journal with a passcode/ }).click();
  const form = page.getByRole("form", { name: "Lock the journal" });
  await expect(form).toContainText("nobody can open those days");
  await form.getByLabel("A passcode").fill("tiger");
  await expect(form).toContainText("Too short");
  await form.getByLabel("A passcode").fill("tiger lily");
  await form.getByLabel("Once more").fill("tiger lily");
  await form.getByRole("button", { name: "Lock it" }).click();
  // The recovery key, shown once, and only let go of once it is written down.
  await expect(page.getByText("Your recovery key")).toBeVisible();
  await expect(page.locator(".recoverykey")).toHaveText(/^[0-9A-Z]{5}(-[0-9A-Z]{5}){4}$/);
  await expect(page.getByRole("button", { name: "Done" })).toBeDisabled();
  await page.getByLabel("I have written it down").check();
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("button", { name: "Unlocked" })).toBeVisible();

  await page.getByRole("button", { name: "Unlocked" }).click();
  await page.getByRole("menuitem", { name: "Lock now" }).click();
  await expect(page.getByRole("button", { name: "Locked" })).toBeVisible();

  // Today: written in, no passcode asked.
  await page.getByLabel("The entry: Today", { exact: true }).fill("A good day.");
  await expect(page.getByRole("status").filter({ hasText: "Kept" })).toBeVisible();

  // Yesterday: locked.
  await page.getByRole("button", { name: "The day before" }).click();
  const locked = page.getByRole("form", { name: "Unlock the journal" });
  await expect(locked).toContainText("This day is locked");
  await expect(page.getByText("Told Asha the pilot slipped.")).toHaveCount(0);
  await shot("locked");
});

test("a wrong passcode is refused, and the right one opens the day", async () => {
  const locked = page.getByRole("form", { name: "Unlock the journal" });
  await locked.getByLabel("Passcode").fill("tiger lilly");
  await locked.getByRole("button", { name: "Unlock" }).click();
  await expect(locked).toContainText("That is not the passcode.");

  await locked.getByLabel("Passcode").fill("tiger lily");
  await locked.getByRole("button", { name: "Unlock" }).click();
  // Written before the day had parts: Guided reads it as the day's Today.
  await expect(page.getByLabel("The entry: Today", { exact: true })).toHaveText("Told Asha the pilot slipped.");
  await shot("open");
});

test("today is added to while locked, and the journal searched once it is open", async () => {
  await page.getByRole("button", { name: "Unlocked" }).click();
  await page.getByRole("menuitem", { name: "Lock now" }).click();
  await page.locator(".journalentry__head").getByRole("button", { name: "Today", exact: true }).click();
  // Locked as it was written, and still taking words without the passcode.
  await expect(page.getByText("Today is locked as you write it.")).toBeVisible();
  await page.getByLabel("Or add to today without unlocking").fill("Later: the call went well.");
  await page.getByRole("button", { name: "Add it, locked" }).click();
  await expect(page.getByText("Added and locked.")).toBeVisible();

  const search = page.getByRole("searchbox", { name: "Search the journal" });
  await search.fill("pilot");
  await expect(page.getByText("Locked days were not searched")).toBeVisible();

  const locked = page.getByRole("form", { name: "Unlock the journal" });
  await locked.getByLabel("Passcode").fill("tiger lily");
  await locked.getByRole("button", { name: "Unlock" }).click();
  await expect(page.locator(".journalsearch__hit").first()).toContainText("Told Asha the pilot slipped.");
  const today = page.getByLabel("The entry: Today", { exact: true });
  await expect(today).toContainText("A good day.");
  await expect(today).toContainText("Later: the call went well.");
  await shot("search");
});

test("looking back shows the numbers, and says where it would be read", async () => {
  await page.getByRole("button", { name: "Looking back" }).click();
  const panel = page.locator(".lookback");
  await expect(panel.getByRole("heading", { name: "Looking back" })).toBeVisible();
  await expect(panel.getByText(/On this computer/).first()).toBeVisible();
  await shot("lookback");
  await panel.getByRole("button", { name: "Close" }).first().click();
  await expect(panel).toHaveCount(0);
});
