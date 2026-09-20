import { test, expect, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { goTo, openBrainSection, passSetup } from "./nav";

/**
 * One connected brain, in a real window (PLAN.md, phase 16): a page links a
 * product and a person with [[, each opens where it lives and knows what
 * links to it, and the Map draws all of it with Obsidian's controls.
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
  await page.screenshot({ path: join(folder, `connected-${name}.png`) });
}

test.beforeAll(async () => {
  userDataDir = mkdtempSync(join(tmpdir(), "caulder-connected-"));
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

  await page.evaluate(async () => {
    const company = (await window.caulder.companies.list()).activeCompanyId as string;
    await window.caulder.products.create(company, { name: "Attendance workshop", unit: "workshop" } as never);
    await window.caulder.people.create(company, { name: "Asha Rao", kind: "founder", role: "CEO" } as never);
    // A page nothing links to: an orphan, for the Display panel.
    const loose = await window.caulder.brain.create(company, "ideas", "idea");
    await window.caulder.brain.save(loose.id, { title: "Parent app", body: "Later.", fields: {}, secrets: {}, baseRevision: loose.revision });
  });
});

test.afterAll(async () => {
  await app?.close();
  rmSync(userDataDir, { recursive: true, force: true });
});

test("[[ links a product and a person, and each opens where it lives", async () => {
  await openBrainSection(page, "Customers and market");
  await page.getByRole("button", { name: "New page" }).click();
  await page.getByRole("menuitem", { name: /^Persona/ }).click();
  await page.getByLabel("Title", { exact: true }).fill("Principals");
  const text = page.getByLabel("Page", { exact: true });
  await text.fill("");
  await text.pressSequentially("They buy the [[Attend");
  const picker = page.getByRole("listbox", { name: "Suggestions" });
  await expect(picker.getByRole("option", { name: /Attendance workshop/ })).toContainText("Product");
  await text.press("Enter");
  await text.pressSequentially(" after a call from [[Asha");
  await expect(picker.getByRole("option", { name: /Asha Rao/ })).toContainText("Person · CEO");
  await text.press("Enter");
  await page.getByRole("button", { name: "Save", exact: true }).click();

  const prose = page.locator(".prose");
  await expect(prose.getByRole("button", { name: "Attendance workshop" })).toBeVisible();
  await shot("page");

  // The product opens on Money, and knows what links to it.
  await prose.getByRole("button", { name: "Attendance workshop" }).click();
  await expect(page.getByRole("heading", { name: "Money", level: 1 })).toBeVisible();
  await expect(page.locator(".brainlinks").getByRole("button", { name: /Principals/ })).toBeVisible();

  // The person opens in People, and knows it too.
  await page.locator(".brainlinks").getByRole("button", { name: /Principals/ }).click();
  await page.locator(".prose").getByRole("button", { name: "Asha Rao" }).click();
  await expect(page.getByRole("heading", { name: "Asha Rao" })).toBeVisible();
  await expect(page.locator(".brainlinks").getByRole("button", { name: /Principals/ })).toBeVisible();
});

test("the Map draws all of it, and its Display panel changes what it shows", async () => {
  await goTo(page, "Brain");
  await page.getByLabel("Brain sections").getByRole("button", { name: "Map" }).click();
  const kinds = page.getByRole("group", { name: "Show on the map" });
  await expect(kinds.getByRole("button", { name: /^Products/ })).toBeVisible();
  await expect(kinds.getByRole("button", { name: /^People/ })).toBeVisible();
  const canvas = page.getByRole("img", { name: /^The map:/ });
  await expect(canvas).toHaveAccessibleName(/The map: 4 dots and 2 links/);
  await page.waitForTimeout(1200);
  await shot("map");

  await page.getByRole("button", { name: "Display" }).click();
  const display = page.getByRole("group", { name: "Display" });
  await display.getByLabel("Dots with no lines").uncheck();
  // The idea nothing links to leaves the map.
  await expect(canvas).toHaveAccessibleName(/The map: 3 dots and 2 links/);
  await display.getByLabel("Arrows, the way links were written").check();
  await shot("display");
  await display.getByLabel("Dots with no lines").check();
  await display.getByRole("button", { name: "Close Display" }).click();

  await page.getByRole("button", { name: "As a list" }).click();
  const list = page.getByRole("list", { name: "Everything on the map" });
  const row = list.getByRole("listitem").filter({ has: page.getByRole("button", { name: "Principals", exact: true }) });
  await expect(row).toContainText("Attendance workshop");
  await expect(row).toContainText("Asha Rao");
  await page.getByRole("button", { name: "As a list" }).click();
});

test("a local map reaches one to three links out", async () => {
  await openBrainSection(page, "Customers and market");
  await page.getByRole("button", { name: /Principals/ }).click();
  const depth = page.getByRole("group", { name: "How far out" });
  await expect(depth.getByRole("button", { name: "2" })).toHaveAttribute("aria-pressed", "true");
  await depth.getByRole("button", { name: "1" }).click();
  await expect(page.getByRole("img", { name: /What is around this page: 2 linked, one step out/ })).toBeVisible();
});
