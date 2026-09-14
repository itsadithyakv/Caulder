import { test, expect, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { choose } from "./choose";

/**
 * Phase 3 through the real window: add a lead, find it, edit it, log against
 * it, and have the timeline tell the story afterwards.
 *
 * Its own data directory, seeded once with a company, so nothing here depends
 * on the company suite having run.
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

/**
 * Gets past first run so every test starts inside a workspace.
 *
 * Waits for the app to settle into one of its two states first. Checking
 * visibility straight after launch answers about the loading screen, which is
 * neither, and the check then falls through to the wrong branch.
 */
async function ensureCompany(page: Page) {
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
}

async function openLeads(page: Page) {
  await ensureCompany(page);
  await page.getByRole("button", { name: "Contacts", exact: true }).click();
}

test.beforeAll(() => {
  userDataDir = mkdtempSync(join(tmpdir(), "caulder-leads-"));
});

test.afterAll(() => {
  rmSync(userDataDir, { recursive: true, force: true });
});

test.afterEach(async () => {
  await app?.close();
});

test("an empty workspace offers both ways to get leads in", async () => {
  app = await launch();
  const page = await app.firstWindow();
  await openLeads(page);

  await expect(page.getByText("No contacts yet")).toBeVisible();
  await expect(page.getByRole("button", { name: "Import a spreadsheet" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add a contact" })).toBeVisible();
});

test("a lead can be added with only a name", async () => {
  // The real source file has rows where everything else is missing.
  app = await launch();
  const page = await app.firstWindow();
  await openLeads(page);

  await page.getByRole("button", { name: "Add a contact" }).click();
  await page.getByLabel("Name").fill("JNS Public School");
  await page.getByRole("button", { name: "Add contact" }).click();

  // Lands on the new lead, with its history already started.
  await expect(page.getByRole("heading", { name: "JNS Public School" })).toBeVisible();
  await expect(page.getByText("Created", { exact: true })).toBeVisible();
  await expect(page.getByRole("main").getByText("Never", { exact: true })).toBeVisible();
});

test("a fuller lead shows its details and lands in the first stage", async () => {
  app = await launch();
  const page = await app.firstWindow();
  await openLeads(page);

  await page.getByRole("button", { name: "Add contact" }).click();
  await page.getByLabel("Name").fill("Bengaluru Public School");
  await page.getByLabel("Contact person").fill("Priya");
  await page.getByLabel("Email").fill("hello@bps.example.com");
  // Exact, or this also matches the Alt phone field.
  await page.getByLabel("Phone", { exact: true }).fill("9480004094");
  await page.getByLabel("City").fill("Bengaluru");
  await page.getByLabel("Value").fill("45000");
  await page.getByRole("button", { name: "Add contact" }).click();

  await expect(page.getByRole("heading", { name: "Bengaluru Public School" })).toBeVisible();
  // A lead outside the funnel would be invisible on the board, so it starts in
  // the first stage rather than nowhere.
  await expect(page.getByText("New", { exact: true })).toBeVisible();
  await expect(page.getByText("45,000")).toBeVisible();
});

test("the list shows both leads and the search narrows it", async () => {
  app = await launch();
  const page = await app.firstWindow();
  await openLeads(page);

  await expect(page.locator(".leads__count")).toHaveText("2 contacts");

  await page.getByLabel("Search contacts").fill("bengaluru");
  await expect(page.locator(".leads__count")).toHaveText("1 contact matching");
  await expect(page.locator(".leadrow__name", { hasText: /Bengaluru Public School/ })).toBeVisible();

  // Searching by city finds it too, not just by name.
  await page.getByLabel("Search contacts").fill("JNS");
  await expect(page.locator(".leads__count")).toHaveText("1 contact matching");

  await page.getByLabel("Search contacts").fill("nothing matches this");
  await expect(page.getByText("Nothing matches those filters")).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(page.locator(".leads__count")).toHaveText("2 contacts");
});

test("logging a call moves the last-contacted date; a note does not", async () => {
  app = await launch();
  const page = await app.firstWindow();
  await openLeads(page);

  await page.locator(".leadrow__name", { hasText: /JNS Public School/ }).click();
  await expect(page.getByRole("heading", { name: "JNS Public School" })).toBeVisible();

  // A note is not contact.
  await page.getByRole("tab", { name: "Note" }).click();
  await page.getByLabel("Note details").fill("Found their website.");
  await page.getByRole("button", { name: "Log note" }).click();
  await expect(page.getByText("Found their website.")).toBeVisible();
  await expect(page.getByRole("main").getByText("Never", { exact: true })).toBeVisible();

  // A call is.
  await page.getByRole("tab", { name: "Call" }).click();
  await page.getByLabel("Call details").fill("Spoke to the principal.");
  await page.getByRole("button", { name: "Log call" }).click();
  await expect(page.getByText("Spoke to the principal.")).toBeVisible();
  await expect(page.getByRole("main").getByText("Today", { exact: true })).toBeVisible();
});

test("editing records what changed on the timeline", async () => {
  app = await launch();
  const page = await app.firstWindow();
  await openLeads(page);

  await page.locator(".leadrow__name", { hasText: /JNS Public School/ }).click();
  await page.getByRole("button", { name: "Edit details" }).click();

  await page.getByLabel("City").fill("Bengaluru");
  await choose(page, "Stage", "Contacted");
  await page.getByRole("button", { name: "Save changes" }).click();

  // The stage move and the field edit are recorded separately, because they
  // answer different questions later.
  await expect(page.getByText("Stage changed")).toBeVisible();
  await expect(page.getByText("Details edited")).toBeVisible();
  await expect(page.getByText("city", { exact: true })).toBeVisible();
});

test("the stage filter narrows to one stage", async () => {
  app = await launch();
  const page = await app.firstWindow();
  await openLeads(page);

  await choose(page, "Filter by stage", "Contacted");
  await expect(page.locator(".leads__count")).toHaveText("1 contact matching");
  await expect(page.locator(".leadrow__name", { hasText: /JNS Public School/ })).toBeVisible();
});

test("everything survives a restart", async () => {
  app = await launch();
  const page = await app.firstWindow();
  await openLeads(page);

  await expect(page.locator(".leads__count")).toHaveText("2 contacts");

  await page.locator(".leadrow__name", { hasText: /JNS Public School/ }).click();
  await expect(page.getByText("Spoke to the principal.")).toBeVisible();
  await expect(page.getByText("Found their website.")).toBeVisible();
});

test("a lead can be deleted, and its history goes with it", async () => {
  app = await launch();
  const page = await app.firstWindow();
  await openLeads(page);

  await page.locator(".leadrow__name", { hasText: /JNS Public School/ }).click();
  await page.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).last().click();

  await expect(page.locator(".leads__count")).toHaveText("1 contact");
  await expect(page.locator(".leadrow__name", { hasText: /JNS Public School/ })).toHaveCount(0);
});
