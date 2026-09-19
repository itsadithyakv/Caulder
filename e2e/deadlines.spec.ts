import { test, expect, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { goTo, openBrainSection, passSetup } from "./nav";

/**
 * Deadlines through the real window: the filing calendar set up from the
 * presets, one due today marked done from Today and seen on the Calendar, and
 * a document written down with an expiry that Today warns about.
 *
 * Set CAULDER_SHOTS to a folder to keep a screenshot of each screen.
 */

test.describe.configure({ mode: "serial" });

let userDataDir: string;
let app: ElectronApplication;

async function openApp(): Promise<Page> {
  app = await electron.launch({
    args: [".", `--user-data-dir=${userDataDir}`],
    env: { ...process.env, ELECTRON_ENABLE_LOGGING: "0" },
  });
  const page = await app.firstWindow();
  await page.waitForSelector(".firstrun, .sidebar");
  if (await page.locator(".firstrun").isVisible()) {
    await page.getByLabel("Company name").fill("Unifloe");
    await page.getByRole("button", { name: "Create company" }).click();
    await passSetup(page);
    await expect(page.getByRole("button", { name: /Company: Unifloe/ })).toBeVisible();
  }
  return page;
}

async function shot(page: Page, name: string) {
  const folder = process.env["CAULDER_SHOTS"];
  if (!folder) return;
  mkdirSync(folder, { recursive: true });
  await page.screenshot({ path: join(folder, `deadlines-${name}.png`) });
}

/** A day as the date input wants it, counted from today on this machine. */
function dayFromNow(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

async function openSection(page: Page, name: string) {
  await openBrainSection(page, name);
}

test.beforeAll(() => {
  userDataDir = mkdtempSync(join(tmpdir(), "caulder-deadlines-"));
});

test.afterAll(() => {
  rmSync(userDataDir, { recursive: true, force: true });
});

test.afterEach(async () => {
  await app?.close();
});

test("the filing calendar starts from the presets, and a preset is added once", async () => {
  const page = await openApp();
  await openSection(page, "Tax and compliance");

  // With nothing set up, the presets are the way in. A rupee company gets India's.
  const presets = page.getByRole("group", { name: "Presets" });
  await expect(presets).toBeVisible();
  await expect(presets.getByRole("radio", { name: "India" })).toHaveAttribute("aria-checked", "true");
  // The profile says nothing yet, so only what fits every company is ticked.
  await expect(presets.getByRole("checkbox", { name: /Advance tax/ })).toBeChecked();

  // GST depends on the profile, so it is with the rest, for picking by hand.
  await presets.getByRole("button", { name: /For other kinds of company/ }).click();
  await presets
    .locator(".preset")
    .filter({ has: page.locator(".preset__title", { hasText: /^GSTR-1$/ }) })
    .getByRole("checkbox")
    .check();
  await shot(page, "presets");
  await presets.getByRole("button", { name: "Add 2 deadlines" }).click();

  const calendar = page.getByRole("list", { name: "The filing calendar" });
  await expect(calendar.getByText("GSTR-1", { exact: true })).toBeVisible();
  await expect(calendar.getByText("Advance tax", { exact: true })).toBeVisible();
  await expect(calendar.getByText("Filing · the 11th of every month")).toBeVisible();
  await shot(page, "calendar");

  // Opened again, what was added says so and cannot be added twice.
  await page.getByRole("button", { name: "From the presets" }).click();
  await expect(presets.getByRole("checkbox", { name: /Advance tax/ })).toBeDisabled();
  await expect(presets.getByRole("button", { name: "Pick some to add" })).toBeDisabled();
});

test("a deadline due today is on Today, done from there, and on the Calendar", async () => {
  const page = await openApp();
  await openSection(page, "Tax and compliance");

  await page.getByRole("button", { name: "Add a deadline" }).click();
  const form = page.getByRole("form", { name: "Add a deadline" });
  await form.getByLabel("What has to be done").fill("Professional tax");
  await form.getByRole("radio", { name: "Payment" }).click();
  await form.getByRole("radio", { name: "Once" }).click();
  await form.getByLabel("On", { exact: true }).fill(dayFromNow(0));
  await form.getByRole("button", { name: "Add the deadline" }).click();

  await expect(page.getByRole("list", { name: "Coming up" }).getByText("Professional tax")).toBeVisible();

  await goTo(page, "Today");
  const deadlines = page.getByRole("list", { name: "Deadlines" });
  await expect(deadlines.getByText("Professional tax")).toBeVisible();
  await expect(deadlines.getByText("due today")).toBeVisible();
  await shot(page, "today");
  await deadlines.getByRole("button", { name: "Professional tax is done" }).click();
  await expect(deadlines.getByText("Professional tax")).toHaveCount(0);

  // The Calendar still has it on its day, done.
  await goTo(page, "Calendar");
  const chip = page
    .getByRole("list", { name: "Deadlines on this day" })
    .getByRole("listitem")
    .filter({ hasText: "Professional tax" });
  await expect(chip).toContainText("Professional tax");
  await expect(chip).toHaveClass(/duechip--done/);
  await shot(page, "day");
});

test("a document written down with its expiry is in Documents and warned about on Today", async () => {
  const page = await openApp();
  await openSection(page, "Documents");

  await expect(page.getByText("No documents yet")).toBeVisible();
  await page.getByRole("button", { name: "Write down where one is" }).click();
  const form = page.getByRole("form", { name: "Write down where a document is" });
  await form.getByLabel("Name").fill("Fire safety certificate");
  await form.getByLabel("Where it is kept").fill("On the office wall");
  await form.getByLabel("Expires on").fill(dayFromNow(10));
  await form.getByRole("button", { name: "Write it down" }).click();

  const documents = page.getByRole("list", { name: "Documents" });
  await expect(documents.getByText("Fire safety certificate")).toBeVisible();
  await expect(documents.getByText("Certificate · kept On the office wall")).toBeVisible();
  await expect(documents.getByText("Expires in 10 days")).toBeVisible();
  await shot(page, "documents");

  // Where there is nothing to write down, the form says so.
  await page.getByRole("button", { name: "Write down where one is" }).click();
  await form.getByLabel("Name").fill("Lease");
  await form.getByRole("button", { name: "Write it down" }).click();
  await expect(form.getByText("Say where it is kept.")).toBeVisible();
  await form.getByRole("button", { name: "Cancel" }).click();

  await goTo(page, "Today");
  const deadlines = page.getByRole("list", { name: "Deadlines" });
  await expect(deadlines.getByText("Fire safety certificate")).toBeVisible();
  await expect(deadlines.getByText("due in 10 days")).toBeVisible();

  // It opens where the document lives.
  await deadlines.getByRole("button", { name: /Fire safety certificate/ }).click();
  await expect(page.getByRole("list", { name: "Documents" }).getByText("Fire safety certificate")).toBeVisible();
});
