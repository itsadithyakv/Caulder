import { test, expect, _electron as electron, type ElectronApplication } from "@playwright/test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { goTo } from "./nav";

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

test("looking around opens on a day with work in it, and says what it is", async () => {
  app = await launch();
  const page = await app.firstWindow();
  await page.waitForSelector(".firstrun");

  await page.getByRole("button", { name: "Look around with sample data" }).click();
  await expect(page.getByRole("button", { name: /Company: Sample company/ })).toBeVisible();
  await expect(page.getByText(/This is sample data/)).toBeVisible();

  // A first run now offers the tour, which sits over everything. Dismissing
  // it is exactly what somebody starting the app does.
  await page.waitForTimeout(700);
  if (await page.locator(".tour").count()) await page.keyboard.press("Escape");

  // Today is the screen the app is for, so it is the one that must not be
  // blank on the first launch.
  await expect(page.getByText(/is overdue/)).toBeVisible();
  await expect(page.getByText("Due today")).toBeVisible();

  // And the sidebar counts them, rather than showing the zero it read before
  // the sample was seeded.
  await expect(page.getByRole("button", { name: /Company: Sample company/ })).toContainText(
    "8 contacts",
  );
});

test("setting up the real company takes the sample away on its own", async () => {
  // Its own profile: the suite above has already undone its sample.
  const own = mkdtempSync(join(tmpdir(), "caulder-demo-real-"));
  app = await electron.launch({
    args: [".", `--user-data-dir=${own}`],
    env: { ...process.env, ELECTRON_ENABLE_LOGGING: "0" },
  });
  const page = await app.firstWindow();
  await page.waitForSelector(".firstrun");
  await page.getByRole("button", { name: "Look around with sample data" }).click();
  await expect(page.getByText(/This is sample data/)).toBeVisible();

  await page.getByRole("button", { name: "Set up your company" }).click();
  await page.getByLabel("Company name").fill("Unifloe");
  await page.getByRole("button", { name: "Create company" }).click();

  await expect(page.getByRole("button", { name: /Company: Unifloe/ })).toBeVisible();
  await expect(page.getByText(/This is sample data/)).toHaveCount(0);
  // Nobody had to find it and delete it.
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByText("Sample company")).toHaveCount(0);
  await app.close();
  rmSync(own, { recursive: true, force: true });
});

test("the board has a shape rather than one full column", async () => {
  app = await launch();
  const page = await app.firstWindow();
  await page.waitForSelector(".sidebar");

  await page.getByRole("button", { name: "Deals", exact: true }).click();
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
  await goTo(page, "Import");
  await expect(page.getByText("Sample data", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByText("Undone")).toBeVisible();

  await page.getByRole("button", { name: "Contacts", exact: true }).click();
  await expect(page.getByText("No contacts yet")).toBeVisible();

  // Everything hanging off those leads went with them.
  await page.getByRole("button", { name: "Today", exact: true }).click();
  await expect(page.getByText("Nothing is due today")).toBeVisible();
});
