import { test, expect, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openBrainSection, passSetup } from "./nav";

/**
 * Writing a page, in a real window: a link made as it is typed and shown as a
 * chip, and Ctrl+K starting one rather than opening search over the editor.
 */

test.describe.configure({ mode: "serial" });

let userDataDir: string;
let app: ElectronApplication;
let page: Page;

test.beforeAll(async () => {
  userDataDir = mkdtempSync(join(tmpdir(), "caulder-writing-"));
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
    const { activeCompanyId } = await window.caulder.companies.list();
    await window.caulder.leads.create(activeCompanyId as string, { name: "Oakridge School" } as never);
  });
});

test.afterAll(async () => {
  await app?.close();
  rmSync(userDataDir, { recursive: true, force: true });
});

test("a page is written the same way", async () => {
  await openBrainSection(page, "Products and pricing");
  await page.getByRole("button", { name: "Blank page" }).click();
  await page.getByLabel("Title", { exact: true }).fill("Pilot");
  const text = page.getByLabel("Page", { exact: true });
  await text.click();
  await page.keyboard.type("## Plan");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Ask [[Oak");
  await expect(page.getByRole("listbox", { name: "Suggestions" }).getByRole("option", { name: /Oakridge/ })).toBeVisible();
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.locator(".prose").getByRole("button", { name: "Oakridge School" })).toBeVisible();
  await expect(page.locator(".prose").getByRole("heading", { name: "Plan" })).toBeVisible();
});

test("Ctrl+K in a page starts a link, and does not open search over it", async () => {
  // Outside a field it is search; brain.spec.ts shows that.
  await openBrainSection(page, "Products and pricing");
  await page.getByRole("button", { name: "Blank page" }).click();
  await page.getByLabel("Page", { exact: true }).click();
  await page.keyboard.type("Call ");
  await page.keyboard.press("Control+k");
  await expect(page.getByRole("dialog", { name: "Search everything" })).toHaveCount(0);
  await page.keyboard.type("Oak");
  await expect(page.getByRole("listbox", { name: "Suggestions" }).getByRole("option", { name: /Oakridge/ })).toBeVisible();
});
