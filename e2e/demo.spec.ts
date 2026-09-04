import { test, expect, _electron as electron, type ElectronApplication } from "@playwright/test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * The sample data, and taking it away again.
 *
 * The point of seeding is not that rows exist but that the first launch shows
 * somebody what the app is for. So this checks the screens they will actually
 * look at, and then that the company comes back to empty cleanly.
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

test.beforeAll(() => {
  userDataDir = mkdtempSync(join(tmpdir(), "caulder-demo-"));
});

test.afterAll(() => {
  rmSync(userDataDir, { recursive: true, force: true });
});

test.afterEach(async () => {
  await app?.close();
});

test("first run offers the sample, and it is on by default", async () => {
  app = await launch();
  const page = await app.firstWindow();
  await page.waitForSelector(".firstrun");

  // On by default: six empty screens is the worst first impression of an app
  // whose every screen is about a list you have not built yet.
  await expect(page.getByLabel("Start with sample data")).toBeChecked();
});

test("a company started with the sample opens on a day with work in it", async () => {
  app = await launch();
  const page = await app.firstWindow();
  await page.waitForSelector(".firstrun");

  await page.getByLabel("Company name").fill("Unifloe");
  await page.getByRole("button", { name: "Create company" }).click();
  await expect(page.getByRole("button", { name: /Company: Unifloe/ })).toBeVisible();

  // Today is the screen the app is for, so it is the one that must not be
  // blank on the first launch.
  await expect(page.getByText(/is overdue/)).toBeVisible();
  await expect(page.getByText("Due today")).toBeVisible();

  // And the sidebar counts them, rather than showing the zero it read before
  // the sample was seeded.
  await expect(page.getByRole("button", { name: /Company: Unifloe/ })).toContainText(
    "8 leads",
  );
});

test("the board has a shape rather than one full column", async () => {
  app = await launch();
  const page = await app.firstWindow();
  await page.waitForSelector(".sidebar");

  await page.getByRole("button", { name: "Pipeline", exact: true }).click();
  await expect(page.locator(".boardcard").first()).toBeVisible();

  const counts = await page.locator(".column").evaluateAll((columns) =>
    columns.filter((column) => column.querySelectorAll(".boardcard").length > 0).length,
  );
  expect(counts).toBeGreaterThan(2);
});

test("the sample says where it came from, and comes out in one go", async () => {
  app = await launch();
  const page = await app.firstWindow();
  await page.waitForSelector(".sidebar");

  // It is a real import batch, which is why undoing it is the undo that
  // already exists rather than a second delete path written specially.
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await expect(page.getByText("Sample data")).toBeVisible();

  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByText("Undone")).toBeVisible();

  await page.getByRole("button", { name: "Leads", exact: true }).click();
  await expect(page.getByText("No leads yet")).toBeVisible();

  // Everything hanging off those leads went with them.
  await page.getByRole("button", { name: "Today", exact: true }).click();
  await expect(page.getByText("Nothing is due today")).toBeVisible();
});
