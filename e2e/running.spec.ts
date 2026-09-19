import { test, expect, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { goTo, newPage, openBrainSection, passSetup } from "./nav";

/**
 * Running the company through the real window: a meeting's action items made
 * into tasks, a playbook run, the decision log, and metrics - one worked out,
 * one written down.
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
  await page.screenshot({ path: join(folder, `running-${name}.png`) });
}

async function openSection(page: Page, name: string) {
  await openBrainSection(page, name);
}

/** A new page from a section's button - or, for a section of several kinds, its New page menu - written and saved. */
async function writePage(page: Page, button: string, title: string, body: string) {
  if (button.startsWith("New page: ")) await newPage(page, button.slice("New page: ".length));
  else await page.getByRole("button", { name: button }).click();
  await page.getByLabel("Title", { exact: true }).fill(title);
  await page.getByLabel("Page", { exact: true }).fill(body);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
}

test.beforeAll(() => {
  userDataDir = mkdtempSync(join(tmpdir(), "caulder-running-"));
});

test.afterAll(() => {
  rmSync(userDataDir, { recursive: true, force: true });
});

test.afterEach(async () => {
  await app?.close();
});

test("a meeting's action items become tasks, once each, and reach Today", async () => {
  const page = await openApp();
  await openSection(page, "Meetings");
  await writePage(
    page,
    "Add meeting notes",
    "Monday check-in",
    "## Action items\n\n- [ ] Send the proposal to Oakridge (day 0)\n- [ ] Fix the website\n- [x] Book the hall",
  );

  const items = page.getByRole("list", { name: "Action items" });
  await expect(items.getByText("Not a task yet")).toHaveCount(2);
  await expect(items.getByText("Ticked on the page")).toBeVisible();
  await page.getByRole("button", { name: "Make 2 tasks" }).click();
  await expect(items.getByText(/^Task, due/)).toHaveCount(2);
  await expect(page.getByRole("button", { name: /^Make \d tasks?$/ })).toHaveCount(0);
  await shot(page, "meeting");

  await goTo(page, "Today");
  await expect(page.getByText("Send the proposal to Oakridge")).toBeVisible();
  // Each says which page made it, and takes you back there.
  const row = page.locator(".taskrow", { hasText: "Send the proposal to Oakridge" });
  await row.getByRole("button", { name: "from Monday check-in" }).click();
  await expect(page.getByRole("heading", { name: "Monday check-in" })).toBeVisible();
});

test("a playbook runs as tasks, again each time", async () => {
  const page = await openApp();
  await openSection(page, "Playbooks");
  await writePage(
    page,
    "New page: Playbook",
    "Sending an invoice",
    "## Steps\n\n- [ ] Check the lines against the quote\n- [ ] Send it (day 1)\n- [ ] Chase it (day 14)",
  );

  await page.getByRole("button", { name: "Run as 3 tasks" }).click();
  await expect(page.getByText("3 tasks made from this playbook so far, 3 still open.")).toBeVisible();
  await page.getByRole("button", { name: "Run as 3 tasks" }).click();
  await expect(page.getByText("6 tasks made from this playbook so far, 6 still open.")).toBeVisible();
  await shot(page, "playbook");
});

test("decisions read as a log, newest first, with what was decided", async () => {
  const page = await openApp();
  await openSection(page, "Decisions");
  await page.getByRole("button", { name: "Write down a decision" }).click();
  await page.getByLabel("Title", { exact: true }).fill("Charge per school");
  await page.getByLabel("Decided on").fill("2026-08-02");
  await page.getByLabel("Decided by").fill("Asha and Ravi");
  await page.getByLabel("Page", { exact: true }).fill("## What we decided\n\nA flat fee a school, not per seat.");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("button", { name: "Decisions" }).first().click();

  const log = page.getByRole("region", { name: /August 2026/ });
  await expect(log.getByText("Charge per school")).toBeVisible();
  await expect(log.getByText("A flat fee a school, not per seat.")).toBeVisible();
  await expect(log.getByText(/decided by Asha and Ravi/)).toBeVisible();
  await shot(page, "decisions");
});

test("metrics: one worked out, one written down with its readings", async () => {
  const page = await openApp();
  await openSection(page, "Metrics");

  const picker = page.getByRole("group", { name: "Metrics to add" });
  await picker.getByRole("button", { name: "Add Paid in", exact: true }).click();
  await expect(page.getByRole("article", { name: "Paid in" })).toBeVisible();

  await picker.getByRole("button", { name: "Something you count yourself" }).click();
  const form = page.getByRole("form", { name: "Add a metric" });
  await form.getByLabel("Name").fill("Schools signed");
  await form.getByLabel("Counting").fill("schools");
  await form.getByLabel("Target").fill("20");
  await form.getByRole("button", { name: "Add the metric" }).click();

  const card = page.getByRole("article", { name: "Schools signed" });
  await expect(card.getByText("Nothing written down yet")).toBeVisible();
  await shot(page, "metrics");

  await card.getByRole("button", { name: "Schools signed" }).click();
  const reading = page.getByRole("form", { name: "Write down a reading" });
  await reading.getByLabel("Value").fill("7");
  await reading.getByRole("button", { name: "Write it down" }).click();
  await expect(page.getByRole("list", { name: "Readings" }).getByText("7 schools")).toBeVisible();
  await expect(page.getByRole("img", { name: /Schools signed over the last 12 months/ })).toBeVisible();
  await shot(page, "metric");

  await page.getByRole("button", { name: "All metrics" }).click();
  await expect(page.getByRole("article", { name: "Schools signed" }).getByText("35% of the target, 20 schools")).toBeVisible();
});
