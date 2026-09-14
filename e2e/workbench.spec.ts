import { test, expect, _electron as electron, type ElectronApplication } from "@playwright/test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Your own fields, files and reminders, through the real window.
 */

test.describe.configure({ mode: "serial" });

let userDataDir: string;
let app: ElectronApplication;

async function openApp() {
  app = await electron.launch({
    args: [".", `--user-data-dir=${userDataDir}`],
    env: { ...process.env, ELECTRON_ENABLE_LOGGING: "0" },
  });
  const page = await app.firstWindow();

  await page.waitForSelector(".firstrun, .sidebar");
  if (await page.locator(".firstrun").isVisible()) {
    await page.getByLabel("Company name").fill("Unifloe");
    await page.getByRole("button", { name: "Create company" }).click();
    await expect(page.getByRole("button", { name: /Company: Unifloe/ })).toBeVisible();
  }

  // A real company starts empty, and three of these tests open a contact.
  await page.getByRole("button", { name: "Contacts", exact: true }).click();
  await page.waitForSelector(".leads__toolbar, .leadrow");
  if ((await page.locator(".leadrow").count()) === 0) {
    await page.locator(".leads__toolbar").getByRole("button", { name: "Add contact" }).click();
    await page.getByLabel("Name", { exact: true }).fill("Alpha School");
    await page.getByRole("button", { name: "Add contact" }).click();
    await expect(page.getByRole("heading", { name: "Alpha School" })).toBeVisible();
    await page.getByRole("button", { name: "All contacts" }).click();
  }

  return page;
}

test.beforeAll(() => {
  userDataDir = mkdtempSync(join(tmpdir(), "caulder-workbench-"));
});

test.afterAll(() => {
  rmSync(userDataDir, { recursive: true, force: true });
});

test.afterEach(async () => {
  await app?.close();
});

test("a field invented in Settings turns up on every lead", async () => {
  const page = await openApp();

  await page.getByRole("button", { name: /^Settings/ }).click();
  await page.getByLabel("Name", { exact: true }).fill("Board");
  await page.getByRole("button", { name: "Add the field" }).click();
  // Scoped: "Board" is also the placeholder in the box that just created it.
  await expect(page.locator(".rule__text", { hasText: "Board" })).toBeVisible();

  await page.getByRole("button", { name: /^Contacts/ }).click();
  await page.locator(".leadrow").first().click();

  const field = page.getByLabel("Board");
  await expect(field).toBeVisible();

  // Saved on blur, so it behaves like the fields the app came with.
  await field.fill("CBSE");
  await field.blur();
  await page.getByRole("button", { name: "All contacts" }).click();
  await page.locator(".leadrow").first().click();
  await expect(page.getByLabel("Board")).toHaveValue("CBSE");
});

test("a lead has somewhere to keep its files", async () => {
  const page = await openApp();

  await page.getByRole("button", { name: /^Contacts/ }).click();
  await page.locator(".leadrow").first().click();

  await expect(page.getByRole("heading", { name: "Files" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Attach a file" })).toBeVisible();
});

test("reminders are off until asked for", async () => {
  const page = await openApp();

  await page.getByRole("button", { name: /^Settings/ }).click();
  const toggle = page.getByRole("switch", { name: "Tell me when something is overdue" });

  // An app that starts notifying you before you have said yes has already
  // lost the argument.
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "true");
});

test("the setting survives a restart", async () => {
  const page = await openApp();
  await page.getByRole("button", { name: /^Settings/ }).click();

  await expect(
    page.getByRole("switch", { name: "Tell me when something is overdue" }),
  ).toHaveAttribute("aria-checked", "true");
});
