import { test, expect, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Hardening: shortcuts, backup, restore, export, and the empty states.
 *
 * The restore test is the one that matters. Caulder holds the user's only copy
 * of their data, so "what if this goes wrong" has to have an answer that
 * actually works rather than a reassuring button.
 */

test.describe.configure({ mode: "serial" });

let userDataDir: string;
let exportDir: string;
let app: ElectronApplication;

async function launch() {
  return electron.launch({
    args: [".", `--user-data-dir=${userDataDir}`],
    env: { ...process.env, ELECTRON_ENABLE_LOGGING: "0" },
  });
}

async function stubDirectory(electronApp: ElectronApplication, dir: string) {
  await electronApp.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = () =>
      Promise.resolve({ canceled: false, filePaths: [path] } as never);
  }, dir);
}

async function ensureCompany(page: Page) {
  await page.waitForSelector(".firstrun, .sidebar");
  if (await page.locator(".firstrun").isVisible()) {
    await page.getByLabel("Company name").fill("Unifloe");
    await page.getByLabel("Start with sample data").uncheck();
    await page.getByRole("button", { name: "Create company" }).click();
    await expect(page.getByRole("button", { name: /Company: Unifloe/ })).toBeVisible();
  }
}

async function addLead(page: Page, name: string) {
  await page.getByRole("button", { name: "Leads" }).click();
  await page.getByRole("button", { name: /^Add a? ?lead$/ }).first().click();
  await page.getByLabel("Name").fill(name);
  await page.getByRole("button", { name: "Add lead" }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
}

test.beforeAll(() => {
  userDataDir = mkdtempSync(join(tmpdir(), "caulder-hard-"));
  exportDir = mkdtempSync(join(tmpdir(), "caulder-out-"));
});

test.afterAll(() => {
  rmSync(userDataDir, { recursive: true, force: true });
  rmSync(exportDir, { recursive: true, force: true });
});

test.afterEach(async () => {
  await app?.close();
});

test("every screen says something useful when it is empty", async () => {
  app = await launch();
  const page = await app.firstWindow();
  await ensureCompany(page);

  // An empty state should state the fact and name the next action, never just
  // show a blank panel.
  await expect(page.getByText("Nothing is due today")).toBeVisible();

  await page.getByRole("button", { name: "Leads" }).click();
  await expect(page.getByText("No leads yet")).toBeVisible();

  await page.getByRole("button", { name: "Pipeline" }).click();
  await expect(page.locator(".hintbar")).toContainText("This is your funnel");

  await page.getByRole("button", { name: "Import" }).click();
  await expect(page.getByText("Bring in a spreadsheet")).toBeVisible();

  await page.getByRole("button", { name: "Email" }).click();
  await expect(page.getByText("No emails yet")).toBeVisible();
});

test("the shortcuts move between screens", async () => {
  app = await launch();
  const page = await app.firstWindow();
  await ensureCompany(page);

  await page.keyboard.press("l");
  await expect(page.getByRole("heading", { name: "Leads", level: 1 })).toBeVisible();

  await page.keyboard.press("p");
  await expect(page.getByRole("heading", { name: "Pipeline", level: 1 })).toBeVisible();

  await page.keyboard.press("e");
  await expect(page.getByRole("heading", { name: "Email", level: 1 })).toBeVisible();

  await page.keyboard.press("t");
  await expect(page.getByRole("heading", { name: "Today", level: 1 })).toBeVisible();
});

test("a shortcut never fires while you are typing", async () => {
  // The bug that makes single-letter shortcuts unusable: a letter vanishing
  // mid-sentence is worse than having no shortcut at all.
  app = await launch();
  const page = await app.firstWindow();
  await ensureCompany(page);
  await addLead(page, "Bengaluru Public School");

  await page.getByRole("button", { name: "All leads" }).click();
  const search = page.getByLabel("Search leads");
  await search.click();
  await search.type("planets");

  await expect(search).toHaveValue("planets");
  // Still on Leads: the p, l, e and t did not navigate anywhere.
  await expect(page.getByRole("heading", { name: "Leads", level: 1 })).toBeVisible();
});

test("? opens the shortcut list and Escape closes it", async () => {
  app = await launch();
  const page = await app.firstWindow();
  await ensureCompany(page);

  await page.keyboard.press("?");
  await expect(page.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("/ jumps to the search box and N opens the new-lead form", async () => {
  app = await launch();
  const page = await app.firstWindow();
  await ensureCompany(page);

  await page.keyboard.press("/");
  await expect(page.getByLabel("Search leads")).toBeFocused();

  await page.getByRole("heading", { name: "Leads", level: 1 }).click();
  await page.keyboard.press("n");
  await expect(page.getByText("Add a lead")).toBeVisible();
});

test("export everything writes files anybody can open", async () => {
  app = await launch();
  const page = await app.firstWindow();
  await ensureCompany(page);
  await stubDirectory(app, exportDir);

  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Export everything" }).click();

  await expect(page.getByText(/a copy of the database written to/)).toBeVisible();

  const folder = readdirSync(exportDir).find((name) => name.includes("export"));
  expect(folder).toBeTruthy();

  const files = readdirSync(join(exportDir, folder!));
  expect(files).toEqual(
    expect.arrayContaining(["leads.csv", "caulder.db", "README.txt"]),
  );
  expect(readFileSync(join(exportDir, folder!, "leads.csv"), "utf8")).toContain(
    "Bengaluru Public School",
  );
});

test("a backup can be taken on demand", async () => {
  app = await launch();
  const page = await app.firstWindow();
  await ensureCompany(page);

  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Back up now" }).click();

  await expect(page.getByText(/Copied to caulder-/)).toBeVisible();
  expect(existsSync(join(userDataDir, "backups"))).toBe(true);
});

test("restoring puts back what the backup held, and is itself undoable", async () => {
  app = await launch();
  const page = await app.firstWindow();
  await ensureCompany(page);

  // The backup taken in the previous test does not know about this lead.
  await addLead(page, "Added after the backup");
  await page.getByRole("button", { name: "All leads" }).click();
  await expect(page.locator(".leads__count")).toHaveText("2 leads");

  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Restore" }).first().click();
  // The confirmation, not another row's Restore button: every row has one.
  await page.locator(".detail__confirm").getByRole("button", { name: "Restore" }).click();

  // The window reloads onto the restored database.
  await expect(page.getByRole("button", { name: /Company: Unifloe/ })).toBeVisible({
    timeout: 15000,
  });

  // The reload lands on Today. Waiting for it before navigating matters: the
  // sidebar appears before the reload has finished settling, and a click sent
  // into that gap is swallowed by the render that replaces it.
  await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();

  await page.getByRole("button", { name: "Leads", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Leads" })).toBeVisible();
  await expect(page.locator(".leads__count")).toHaveText("1 lead");

  // And the state that was replaced was saved aside first.
  const saved = readdirSync(join(userDataDir, "backups"));
  expect(saved.some((name) => name.includes("before-restore"))).toBe(true);
});

test("settings says where the data actually lives", async () => {
  app = await launch();
  const page = await app.firstWindow();
  await ensureCompany(page);

  await page.getByRole("button", { name: "Settings" }).click();
  // No cloud behind this, so the location is stated rather than hidden.
  await expect(page.getByText(/The database is at/)).toBeVisible();
  await expect(page.getByText(/with Caulder closed/)).toBeVisible();
});
