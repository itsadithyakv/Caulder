import { test, expect, _electron as electron, type ElectronApplication } from "@playwright/test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * The Phase 2 exit criterion, driven through the real window: create a
 * company, see it in the sidebar, switch between two, and have the choice
 * survive a restart.
 *
 * Each run gets its own --user-data-dir so it never touches the real
 * database, and so "first run" genuinely is one.
 */

// These build on one another deliberately: the point is that state written by
// one launch is still there in the next, so they share a data directory and
// must run in order.
test.describe.configure({ mode: "serial" });

let userDataDir: string;
let app: ElectronApplication;

async function launch() {
  return electron.launch({
    args: [".", `--user-data-dir=${userDataDir}`],
    // Electron writes GPU noise to stderr on Windows; it is not a failure.
    env: { ...process.env, ELECTRON_ENABLE_LOGGING: "0" },
  });
}

test.beforeAll(() => {
  userDataDir = mkdtempSync(join(tmpdir(), "caulder-e2e-"));
});

test.afterAll(() => {
  rmSync(userDataDir, { recursive: true, force: true });
});

test.afterEach(async () => {
  await app?.close();
});

test("first run creates a company and the sidebar shows it", async () => {
  app = await launch();
  const page = await app.firstWindow();

  // No company yet, so the app opens straight into setup rather than an
  // empty shell.
  await expect(page.getByRole("heading", { name: "Set up your company" })).toBeVisible();

  await page.getByLabel("Company name").fill("Unifloe");
  // The accent is folded away with the logo and the timezone.
  await page.getByText("Funnel, logo, colour and timezone").click();
  await page.getByRole("radio", { name: "Violet" }).click();
  await page.getByRole("button", { name: "Create company" }).click();

  // The shell replaces the setup screen.
  await expect(page.getByRole("button", { name: /Company: Unifloe/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();

  // The chosen accent is applied to the document, which is what re-tints the
  // whole app.
  await expect(page.locator("html")).toHaveAttribute("data-accent", "violet");
});

test("the company and its accent survive a restart", async () => {
  // Reuses the same userDataDir, so this is the previous test's database.
  app = await launch();
  const page = await app.firstWindow();

  await expect(page.getByRole("button", { name: /Company: Unifloe/ })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-accent", "violet");

  // Setup must not reappear now that a company exists.
  await expect(
    page.getByRole("heading", { name: "Set up your company" }),
  ).toHaveCount(0);
});

test("a second company can be added and switched between", async () => {
  app = await launch();
  const page = await app.firstWindow();

  await page.getByRole("button", { name: /Company: Unifloe/ }).click();
  await page.getByRole("menuitem", { name: "Add a company" }).click();

  await expect(page.getByRole("heading", { name: "Add a company" })).toBeVisible();
  await page.getByLabel("Company name").fill("PaperKite");
  await page.getByText("Funnel, logo, colour and timezone").click();
  await page.getByRole("radio", { name: "Amber" }).click();
  await page.getByRole("button", { name: "Create company" }).click();

  // Creating a company moves you into it; staying in the old one is never
  // what was meant.
  await expect(page.getByRole("button", { name: /Company: PaperKite/ })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-accent", "amber");

  // Switch back.
  await page.getByRole("button", { name: /Company: PaperKite/ }).click();
  await page.getByRole("menuitemradio", { name: "Unifloe" }).click();

  await expect(page.getByRole("button", { name: /Company: Unifloe/ })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-accent", "violet");
});

test("a duplicate name is refused with a message that says what to do", async () => {
  app = await launch();
  const page = await app.firstWindow();

  await page.getByRole("button", { name: /Company: Unifloe/ }).click();
  await page.getByRole("menuitem", { name: "Add a company" }).click();

  await page.getByLabel("Company name").fill("PaperKite");
  await page.getByRole("button", { name: "Create company" }).click();

  await expect(page.getByRole("alert")).toHaveText(
    'A company called "PaperKite" already exists.',
  );
  // Still on the form, with what was typed intact.
  await expect(page.getByLabel("Company name")).toHaveValue("PaperKite");
});

test("settings lists both companies and can rename one", async () => {
  app = await launch();
  const page = await app.firstWindow();

  await page.getByRole("button", { name: "Settings" }).click();

  // Scoped to the main pane: the active company's name also appears in the
  // sidebar switcher, and an unscoped match would hit both.
  const main = page.getByRole("main");
  await expect(main.getByText("Unifloe", { exact: true })).toBeVisible();
  await expect(main.getByText("PaperKite", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Rename PaperKite" }).click();
  await main.getByLabel("Company name").fill("PaperKite Studio");
  await page.getByRole("button", { name: "Save name" }).click();

  await expect(main.getByText("PaperKite Studio", { exact: true })).toBeVisible();
});
