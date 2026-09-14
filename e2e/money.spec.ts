import { test, expect, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { choose } from "./choose";
import { goTo } from "./nav";

/**
 * Money through the real window: an invoice from nothing to paid, and an
 * overdue one turning up on Today.
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

async function openApp(): Promise<Page> {
  app = await launch();
  const page = await app.firstWindow();
  await page.waitForSelector(".firstrun, .sidebar");
  if (await page.locator(".firstrun").isVisible()) {
    await page.getByLabel("Company name").fill("Unifloe");
    await page.getByRole("button", { name: "Create company" }).click();
    await expect(page.getByRole("button", { name: /Company: Unifloe/ })).toBeVisible();

    await page.getByRole("button", { name: "Contacts", exact: true }).click();
    await page.locator(".leads__toolbar").getByRole("button", { name: "Add contact" }).click();
    await page.getByLabel("Name", { exact: true }).fill("Oakridge International School");
    await page.getByRole("button", { name: "Add contact" }).click();
    await expect(page.getByRole("heading", { name: "Oakridge International School" })).toBeVisible();
  }
  return page;
}

test.beforeAll(() => {
  userDataDir = mkdtempSync(join(tmpdir(), "caulder-money-"));
});

test.afterAll(() => {
  rmSync(userDataDir, { recursive: true, force: true });
});

test.afterEach(async () => {
  await app?.close();
});

test("an invoice goes from nothing to paid, and the month adds up", async () => {
  const page = await openApp();
  await goTo(page, "Money");
  await expect(page.getByText("No invoices yet")).toBeVisible();

  await page.getByRole("button", { name: "New invoice" }).click();
  await choose(page, "Contact", "Oakridge International School");
  await page.getByLabel("Line 1 description").fill("Attendance workshop");
  await page.getByLabel("Line 1 unit price").fill("50000");
  await expect(page.getByText(/Total .*50,000/)).toBeVisible();
  await page.getByRole("button", { name: "Save invoice" }).click();

  const row = page.locator(".money__row", { hasText: "INV-0001" });
  await expect(row).toBeVisible();
  await expect(row).toContainText("Draft");

  await row.getByRole("button", { name: "Mark sent" }).click();
  await expect(row).toContainText("Sent");
  await expect(page.locator(".money__figure", { hasText: "Invoiced" })).toContainText("50,000");

  await row.getByRole("button", { name: "Mark paid" }).click();
  await expect(row).toContainText("Paid");
  await expect(page.locator(".money__figure", { hasText: "Paid" })).toContainText("50,000");

  // And it is on the contact's page.
  await page.getByRole("button", { name: "Contacts", exact: true }).click();
  await page.locator(".leadrow").first().click();
  await expect(page.locator(".money__row", { hasText: "INV-0001" })).toContainText("Paid");
});

test("a sent invoice past its due date is on Today, above the tasks", async () => {
  // Made late by hand: waiting a fortnight is not a test.
  {
    const page = await openApp();
    await goTo(page, "Money");
    await page.getByRole("button", { name: "New invoice" }).click();
    await choose(page, "Contact", "Oakridge International School");
    await page.getByLabel("Line 1 description").fill("Renewal");
    await page.getByLabel("Line 1 unit price").fill("20000");
    await page.getByRole("button", { name: "Save invoice" }).click();
    const row = page.locator(".money__row", { hasText: "INV-0002" });
    await row.getByRole("button", { name: "Mark sent" }).click();
    await expect(row).toContainText("Sent");
    await app.close();
  }

  const db = new Database(join(userDataDir, "caulder.db"));
  try {
    db.prepare(`UPDATE invoices SET issued_on = '2026-01-01', due_on = '2026-01-15' WHERE number = 2`).run();
  } finally {
    db.close();
  }

  const page = await openApp();
  await expect(page.getByText("1 invoice is overdue")).toBeVisible();
  await expect(page.locator(".coldrow", { hasText: "INV-0002" })).toContainText("20,000");

  await goTo(page, "Money");
  await expect(page.locator(".money__row", { hasText: "INV-0002" }).first()).toContainText("Overdue");
});
