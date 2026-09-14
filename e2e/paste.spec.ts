import { test, expect, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { goTo } from "./nav";

/**
 * Importing a list that was never a file.
 *
 * The whole point is that pasting a chat reply lands in the same wizard a
 * chosen file does, so the assertions here follow it all the way through to
 * leads that exist - not just to a preview that looked right.
 */

test.describe.configure({ mode: "serial" });

let userDataDir: string;
let app: ElectronApplication;

const REPLY = `Here are 3 schools that match what you asked for:

| Name | Contact Person | Email | Phone | City |
| --- | --- | --- | --- | --- |
| Oakridge International School | Asha Menon | asha@oakridge.edu.in | 9480004094 | Bengaluru |
| TRIO World School |  | admissions@trio.com | 9141924141 | Bengaluru |
| GIG International School | Meera Rao | meera@gig.edu | 9845098450 | Mysuru |

Let me know if you would like more.`;

async function launch() {
  return electron.launch({
    args: [".", `--user-data-dir=${userDataDir}`],
    env: { ...process.env, ELECTRON_ENABLE_LOGGING: "0" },
  });
}

async function openImport(page: Page) {
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
  await goTo(page, "Import");
}

test.beforeAll(() => {
  userDataDir = mkdtempSync(join(tmpdir(), "caulder-paste-"));
});

test.afterAll(() => {
  rmSync(userDataDir, { recursive: true, force: true });
});

test.afterEach(async () => {
  await app?.close();
});

test("a pasted chat reply becomes leads", async () => {
  app = await launch();
  const page = await app.firstWindow();
  await openImport(page);

  await page.getByLabel("Paste a list of leads").fill(REPLY);
  await page.getByRole("button", { name: "Read this list" }).click();

  // Straight into the mapping step, with the columns already matched from the
  // headings the model was told to use.
  await expect(page.getByRole("heading", { name: /Match the columns/i })).toBeVisible();
  await page.getByRole("button", { name: /Preview/i }).click();

  await expect(page.getByText("3 new")).toBeVisible();
  await page.getByRole("button", { name: /Import 3/i }).click();

  await expect(page.locator(".card__hint", { hasText: /3 added/ })).toBeVisible();

  await page.getByRole("button", { name: "Contacts", exact: true }).click();
  await expect(page.locator(".leadrow")).toHaveCount(3);
  await expect(
    page.locator(".leadrow__name", { hasText: "Oakridge International School" }),
  ).toBeVisible();
});

test("the prose around the table does not become a lead", async () => {
  app = await launch();
  const page = await app.firstWindow();
  await openImport(page);

  await page.getByRole("button", { name: "Contacts", exact: true }).click();
  await expect(page.locator(".leadrow")).toHaveCount(3);

  const names = await page.locator(".leadrow__name").allTextContents();

  expect(names).not.toContain("Here are 3 schools that match what you asked for:");
  expect(names).not.toContain("Let me know if you would like more.");
});

test("pasting something that is not a table says so", async () => {
  app = await launch();
  const page = await app.firstWindow();
  await openImport(page);

  await page.getByLabel("Paste a list of leads").fill("I could not find any schools.");
  await page.getByRole("button", { name: "Read this list" }).click();

  await expect(page.getByRole("alert")).toContainText("does not look like a table");
  // And it stays put rather than throwing away what was pasted.
  await expect(page.getByLabel("Paste a list of leads")).toHaveValue(
    "I could not find any schools.",
  );
});

test("the button is dead until there is something to read", async () => {
  app = await launch();
  const page = await app.firstWindow();
  await openImport(page);

  await expect(page.getByRole("button", { name: "Read this list" })).toBeDisabled();
  await page.getByLabel("Paste a list of leads").fill("| Name |\n| --- |\n| A |");
  await expect(page.getByRole("button", { name: "Read this list" })).toBeEnabled();
});

test("the prompt for a model can be copied", async () => {
  app = await launch();
  const page = await app.firstWindow();
  await openImport(page);

  await page.getByRole("button", { name: /Copy the prompt/ }).click();
  await expect(page.getByRole("button", { name: "Prompt copied" })).toBeVisible();

  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain("markdown table");
  expect(copied).toContain("Alt Phone");
});
