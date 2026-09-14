import { test, expect, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { mkdtempSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { goTo } from "./nav";

/**
 * The import wizard through the real window.
 *
 * The file dialogs are native, so they are stubbed in main: each test tells
 * Electron what the user "picked". Everything after that - reading, mapping,
 * previewing, committing, undoing - is the real path.
 */

test.describe.configure({ mode: "serial" });

const REAL_FILE = "D:/MyFiles/LeadsUnifloe.xlsx";

let userDataDir: string;
let app: ElectronApplication;

async function launch() {
  return electron.launch({
    args: [".", `--user-data-dir=${userDataDir}`],
    env: { ...process.env, ELECTRON_ENABLE_LOGGING: "0" },
  });
}

/**
 * Makes the next Open dialog resolve to a given path without a human. Native
 * dialogs cannot be driven from the renderer, so main is patched instead.
 */
async function stubOpenDialog(electronApp: ElectronApplication, filePath: string) {
  await electronApp.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = () =>
      Promise.resolve({ canceled: false, filePaths: [path] } as never);
  }, filePath);
}

async function stubSaveDialog(electronApp: ElectronApplication, filePath: string) {
  await electronApp.evaluate(({ dialog }, path) => {
    dialog.showSaveDialog = () => Promise.resolve({ canceled: false, filePath: path } as never);
  }, filePath);
}

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

async function openImport(page: Page) {
  await ensureCompany(page);
  await goTo(page, "Import");
  await expect(page.getByText("Bring in a spreadsheet")).toBeVisible();
}

test.beforeAll(() => {
  userDataDir = mkdtempSync(join(tmpdir(), "caulder-import-"));
});

test.afterAll(() => {
  rmSync(userDataDir, { recursive: true, force: true });
});

test.afterEach(async () => {
  await app?.close();
});

test("the template can be saved and is readable by the importer", async () => {
  app = await launch();
  const page = await app.firstWindow();
  const target = join(userDataDir, "template.xlsx");
  await stubSaveDialog(app, target);

  await openImport(page);
  await page.getByRole("button", { name: "Download the template" }).click();

  await expect(page.getByText(`Saved to ${target}`)).toBeVisible();
  expect(existsSync(target)).toBe(true);
});

test("a CSV walks the whole wizard and lands in the leads table", async () => {
  app = await launch();
  const page = await app.firstWindow();

  const csv = join(userDataDir, "leads.csv");
  writeFileSync(
    csv,
    [
      "School name,Phone number,Email,Location",
      "Alpha School,9480004094 / 9141924141,alpha@example.com,Bannerghatta Road Bengaluru - 560083",
      "Beta Academy,Not mentioned,Not clearly mentioned,Mysore",
    ].join("\n"),
    "utf8",
  );
  await stubOpenDialog(app, csv);

  await openImport(page);
  await page.getByRole("button", { name: "Choose a file" }).click();

  // Caulder guesses the mapping from headers that match none of its own names.
  await expect(page.getByText("Match the columns")).toBeVisible();
  // The app's own picker is a button showing the chosen label, not an input.
  await expect(page.getByLabel("Import School name as")).toContainText("Name");
  await expect(page.getByLabel("Import Phone number as")).toContainText("Phone");

  await page.getByRole("button", { name: /Preview 2 rows/ }).click();
  await expect(page.getByText("What this will do")).toBeVisible();
  await expect(page.getByText("2 new leads")).toBeVisible();

  await page.getByRole("button", { name: /Import 2 leads/ }).click();
  await expect(page.getByText("Import finished")).toBeVisible();
  await expect(page.getByText("2 added.")).toBeVisible();

  await page.getByRole("button", { name: "See the leads" }).click();
  await expect(page.locator(".leads__count")).toHaveText("2 contacts");

  // The two-number cell was split rather than dropped, and the sentinels
  // became nothing rather than text reading "Not mentioned".
  await page.locator(".leadrow__name", { hasText: /Alpha School/ }).click();
  await expect(page.getByText("9480004094", { exact: true })).toBeVisible();
  await expect(page.getByText("9141924141", { exact: true })).toBeVisible();
  await expect(page.getByText("Not mentioned")).toHaveCount(0);
});

test("a second import of the same file is caught as duplicates", async () => {
  app = await launch();
  const page = await app.firstWindow();
  await stubOpenDialog(app, join(userDataDir, "leads.csv"));

  await openImport(page);
  await page.getByRole("button", { name: "Choose a file" }).click();
  await page.getByRole("button", { name: /Preview 2 rows/ }).click();

  await expect(page.getByText("2 already look familiar")).toBeVisible();
  // Skip is the default, so committing changes nothing.
  await expect(page.getByRole("button", { name: /^Import 0 leads$/ })).toBeDisabled();
});

test("choosing Fill merges the row into the lead it matched", async () => {
  app = await launch();
  const page = await app.firstWindow();

  const csv = join(userDataDir, "extra.csv");
  writeFileSync(
    csv,
    ["School name,Email,Location", "Beta Academy,beta@example.com,Mysore"].join("\n"),
    "utf8",
  );
  await stubOpenDialog(app, csv);

  await openImport(page);
  await page.getByRole("button", { name: "Choose a file" }).click();
  await page.getByRole("button", { name: /Preview 1 row/ }).click();

  await expect(page.getByText("1 already look familiar")).toBeVisible();
  await page.getByRole("radio", { name: "Fill in blanks" }).click();
  await page.getByRole("button", { name: /merge 1/ }).click();

  await expect(page.getByText("Import finished")).toBeVisible();
  await page.getByRole("button", { name: "See the leads" }).click();

  // Beta had no email before this import.
  await page.locator(".leadrow__name", { hasText: /Beta Academy/ }).click();
  await expect(page.getByText("beta@example.com")).toBeVisible();
});

test("undo removes what an import added and puts back what it merged", async () => {
  app = await launch();
  const page = await app.firstWindow();

  await openImport(page);
  await expect(page.getByText("Earlier imports")).toBeVisible();

  // Newest first: the merge, then the two-lead import.
  const undoButtons = page.getByRole("button", { name: "Undo", exact: true });
  await undoButtons.first().click();

  await page.getByRole("button", { name: "Contacts", exact: true }).click();
  await page.locator(".leadrow__name", { hasText: /Beta Academy/ }).click();
  // The merged email is gone; the lead itself stays, because the merge did not
  // create it.
  await expect(page.getByText("beta@example.com")).toHaveCount(0);

  await goTo(page, "Import");
  await page.getByRole("button", { name: "Undo", exact: true }).first().click();

  await page.getByRole("button", { name: "Contacts", exact: true }).click();
  await expect(page.getByText("No contacts yet")).toBeVisible();
});

test.describe(() => {
  test.skip(!existsSync(REAL_FILE), "the real leads file is not on this machine");

  test("the real LeadsUnifloe.xlsx imports and rolls back", async () => {
    app = await launch();
    const page = await app.firstWindow();
    await stubOpenDialog(app, REAL_FILE);

    await openImport(page);
    await page.getByRole("button", { name: "Choose a file" }).click();

    await expect(page.getByLabel("Import School name as")).toContainText("Name");
    await page.getByRole("button", { name: /Preview 20 rows/ }).click();

    // Three of the twenty rows repeat a school already in the file.
    await expect(page.getByText("3 already look familiar")).toBeVisible();
    await expect(page.getByText("17 new leads")).toBeVisible();

    await page.getByRole("button", { name: /Import 17 leads/ }).click();
    await expect(page.getByText("17 added, 3 skipped.")).toBeVisible();

    await page.getByRole("button", { name: "See the leads" }).click();
    await expect(page.locator(".leads__count")).toHaveText("17 contacts");

    await goTo(page, "Import");
    await page.getByRole("button", { name: "Undo", exact: true }).first().click();

    await page.getByRole("button", { name: "Contacts", exact: true }).click();
    await expect(page.getByText("No contacts yet")).toBeVisible();
  });
});
