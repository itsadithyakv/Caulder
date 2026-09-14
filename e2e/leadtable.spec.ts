import { test, expect, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { choose } from "./choose";

/**
 * The leads table as something you work rather than only read.
 *
 * Sorting from the column headings, ticking rows, and acting on what is
 * ticked. The parts worth a real window are the ones where the DOM and the
 * database have to agree: that a sort actually reorders rows rather than only
 * moving an arrow, and that a bulk action leaves the list showing what is
 * really there.
 */

test.describe.configure({ mode: "serial" });

let userDataDir: string;
let app: ElectronApplication;

const LEADS = [
  { name: "Alpha School", value: "300" },
  { name: "Bravo Academy", value: "100" },
  { name: "Charlie College", value: "" },
];

async function launch() {
  return electron.launch({
    args: [".", `--user-data-dir=${userDataDir}`],
    env: { ...process.env, ELECTRON_ENABLE_LOGGING: "0" },
  });
}

async function openLeads(page: Page) {
  await page.waitForSelector(".firstrun, .sidebar");
  if (await page.locator(".firstrun").isVisible()) {
    await page.getByLabel("Company name").fill("Unifloe");
    await page.getByRole("button", { name: "Create company" }).click();
    await expect(page.getByRole("button", { name: /Company: Unifloe/ })).toBeVisible();

  // A first run now offers the tour, which sits over everything. Dismissing
  // it is exactly what somebody starting the app does.
  await page.waitForTimeout(700);
  if (await page.locator(".tour").count()) await page.keyboard.press("Escape");
  }
  await page.getByRole("button", { name: "Contacts", exact: true }).click();
}

/** The names as the table currently has them, top to bottom. */
function names(page: Page) {
  return page.locator(".leadrow__name").allTextContents();
}

test.beforeAll(async () => {
  userDataDir = mkdtempSync(join(tmpdir(), "caulder-leadtable-"));

  const seed = await launch();
  const page = await seed.firstWindow();
  await openLeads(page);

  for (const lead of LEADS) {
    await page.getByRole("button", { name: /^Add a? ?contact$/ }).first().click();
    await page.getByLabel("Name").fill(lead.name);
    if (lead.value) await page.getByLabel(/^Value/).first().fill(lead.value);
    await page.getByRole("button", { name: "Add contact" }).click();
    await expect(page.getByRole("heading", { name: lead.name })).toBeVisible();
    await page.getByRole("button", { name: "All contacts" }).click();
  }

  await seed.close();
});

test.afterAll(() => {
  rmSync(userDataDir, { recursive: true, force: true });
});

test.afterEach(async () => {
  await app?.close();
});

test("a column heading sorts, and sorts back", async () => {
  app = await launch();
  const page = await app.firstWindow();
  await openLeads(page);

  const name = page.getByRole("button", { name: "Name" });

  await name.click();
  await expect.poll(() => names(page)).toEqual([
    "Alpha School",
    "Bravo Academy",
    "Charlie College",
  ]);

  // The same heading again reverses rather than re-sorting the same way.
  await name.click();
  await expect.poll(() => names(page)).toEqual([
    "Charlie College",
    "Bravo Academy",
    "Alpha School",
  ]);
});

test("a new column starts at the end worth looking at", async () => {
  app = await launch();
  const page = await app.firstWindow();
  await openLeads(page);

  // Value starts biggest-first. Ascending would put the cheapest deal on top,
  // which is nobody's reason for clicking a value column.
  await page.getByRole("button", { name: "Value" }).click();
  await expect.poll(() => names(page)).toEqual([
    "Alpha School",
    "Bravo Academy",
    "Charlie College", // unvalued, and last whichever way the arrow points
  ]);

  await page.getByRole("button", { name: "Value" }).click();
  await expect.poll(() => names(page)).toEqual([
    "Bravo Academy",
    "Alpha School",
    "Charlie College",
  ]);
});

test("the sorted column is announced, not just arrowed", async () => {
  app = await launch();
  const page = await app.firstWindow();
  await openLeads(page);

  await page.getByRole("button", { name: "Name" }).click();

  const header = page.getByRole("columnheader", { name: "Name" });
  await expect(header).toHaveAttribute("aria-sort", "ascending");
  await page.getByRole("button", { name: "Name" }).click();
  await expect(header).toHaveAttribute("aria-sort", "descending");
});

test("ticking a row does not open it", async () => {
  app = await launch();
  const page = await app.firstWindow();
  await openLeads(page);

  await page.locator(".leadrow .tickbox").first().check();

  // Still on the list. The checkbox lives inside a row that opens on click,
  // so without stopping the event a tick also navigates away from the tick.
  await expect(page.locator(".leadtable")).toBeVisible();
  await expect(page.locator(".bulkbar")).toContainText("1 contact selected");
});

test("the header box selects everything, and clears it again", async () => {
  app = await launch();
  const page = await app.firstWindow();
  await openLeads(page);

  await page.locator("thead .tickbox").check();
  await expect(page.locator(".bulkbar")).toContainText("3 contacts selected");

  await page.locator("thead .tickbox").uncheck();
  await expect(page.locator(".bulkbar")).toHaveCount(0);
});

test("moving a selection to a stage moves all of it", async () => {
  app = await launch();
  const page = await app.firstWindow();
  await openLeads(page);

  await page.locator("thead .tickbox").check();
  await choose(page, "Move the selected leads to a stage", "Contacted");

  // The bar goes when the action lands, and the rows show where they now are.
  await expect(page.locator(".bulkbar")).toHaveCount(0);
  await expect(page.locator(".leadrow", { hasText: "Contacted" })).toHaveCount(3);
});

test("a bulk delete asks first, and can be backed out of", async () => {
  app = await launch();
  const page = await app.firstWindow();
  await openLeads(page);

  await page.locator(".leadrow .tickbox").first().check();
  await page.getByRole("button", { name: "Delete", exact: true }).click();

  await expect(page.locator(".bulkbar")).toContainText("Delete 1 contact, and everything");
  await page.getByRole("button", { name: "Keep them" }).click();

  await expect.poll(async () => (await names(page)).length).toBe(3);
});

test("a confirmed bulk delete removes exactly what was ticked", async () => {
  app = await launch();
  const page = await app.firstWindow();
  await openLeads(page);

  await page.getByRole("button", { name: "Name" }).click();
  await expect.poll(async () => (await names(page))[0]).toBe("Alpha School");

  await page.locator(".leadrow .tickbox").nth(0).check();
  await page.locator(".leadrow .tickbox").nth(1).check();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("button", { name: "Delete 2 contacts" }).click();

  await expect.poll(() => names(page)).toEqual(["Charlie College"]);

  // And the sidebar count is the same number, not the one it read at launch.
  await expect(page.getByRole("button", { name: /Company: Unifloe/ })).toContainText("1 contact");
});
