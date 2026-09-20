import { test, expect, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pick } from "./choose";
import { goTo, newPage, openBrainSection, passSetup } from "./nav";

/**
 * The call prompter through the real window: a first call that starts its own
 * script and ends with the deal moved, a call made from a task on Today, and
 * scripts started from Playbooks.
 */

test.describe.configure({ mode: "serial" });

let userDataDir: string;
let app: ElectronApplication;

const SCHOOL = "Oakridge International School";

async function launch(): Promise<Page> {
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
  await page.screenshot({ path: join(folder, `calls-${name}.png`) });
}

async function openContact(page: Page) {
  await goTo(page, "Contacts");
  await page.locator(".leadrow", { hasText: SCHOOL }).first().click();
  await expect(page.getByRole("heading", { name: SCHOOL })).toBeVisible();
}

test.beforeAll(() => {
  userDataDir = mkdtempSync(join(tmpdir(), "caulder-calls-"));
});

test.afterAll(() => {
  rmSync(userDataDir, { recursive: true, force: true });
});

test.afterEach(async () => {
  await app?.close();
});

test("a first call starts a script, and hanging up writes it all down", async () => {
  const page = await launch();
  await page.setViewportSize({ width: 1280, height: 860 });
  await goTo(page, "Contacts");
  await page.locator(".leads__toolbar").getByRole("button", { name: "Add contact" }).click();
  await page.getByLabel("Name", { exact: true }).fill(SCHOOL);
  await page.getByLabel("Phone", { exact: true }).fill("9480004094");
  await page.getByRole("button", { name: "Add contact" }).click();
  await expect(page.getByRole("heading", { name: SCHOOL })).toBeVisible();

  await page.getByRole("button", { name: "Call", exact: true }).click();
  const prompter = page.getByRole("dialog", { name: `Call ${SCHOOL}` });
  await expect(prompter).toBeVisible();
  await expect(prompter.getByText("9480004094")).toBeVisible();

  // No script yet: the four tones are the way in.
  await expect(prompter.getByText("No call script yet.")).toBeVisible();
  await prompter.getByRole("button", { name: /^Warm/ }).click();
  await expect(prompter.getByRole("combobox", { name: "Script" })).toContainText("Warm call script");
  await expect(prompter.getByRole("heading", { name: "Questions to ask" })).toBeVisible();
  // A gap still to fill shows as one, rather than being read out as a word.
  await expect(prompter.locator("code", { hasText: "[your name]" }).first()).toBeVisible();

  await prompter.getByRole("button", { name: "Start the clock" }).click();
  await prompter.getByLabel("Answer: How do you handle [the problem] today?").fill("Paper registers");
  await prompter.getByRole("button", { name: "There's no budget." }).click();
  await expect(prompter.getByRole("region", { name: /Answer to/ })).toContainText("When do you usually plan");
  await prompter.getByLabel("Notes as you talk").fill("Principal wants a pilot for the staff.");
  await shot(page, "prompter");

  // Escape with notes typed asks rather than throwing them away.
  await page.keyboard.press("Escape");
  await expect(prompter.getByText("Close without saving?")).toBeVisible();
  await prompter.getByRole("button", { name: "Keep the call" }).click();

  await prompter.getByRole("button", { name: "End the call" }).click();
  await pick(page, "How did it go", "Spoke to them");
  await prompter.getByLabel("How interested are they?").fill("4");
  // The answer moves the deal on to Interested, and plans a follow-up.
  await expect(prompter.getByRole("combobox", { name: "Move the deal to" })).toContainText("Interested");
  await expect(prompter.getByLabel("What happens next")).toHaveValue(`Follow up with ${SCHOOL}`);
  await expect(prompter.getByRole("term")).toHaveText("How do you handle [the problem] today?");
  await prompter.getByLabel("Keep in mind next time").fill("Call before 10am. Ask for Mrs Rao.");
  await shot(page, "wrapup");
  await prompter.getByRole("button", { name: "Save the call" }).click();
  await expect(prompter).toHaveCount(0);

  // All of it is on the contact.
  const call = page.locator(".entry__text", { hasText: "Spoke to them" });
  await expect(call).toContainText("Interested (4 of 5)");
  await expect(call).toContainText("Principal wants a pilot for the staff.");
  await expect(call).toContainText("Paper registers");
  await expect(page.locator(".detail__head")).toContainText("Interested");
  await expect(page.locator(".detail__notesBody")).toHaveText("Call before 10am. Ask for Mrs Rao.");
  await expect(page.locator(".leadtasks").getByText(`Follow up with ${SCHOOL}`)).toBeVisible();
});

test("a call task on Today opens the prompter where the last call left off", async () => {
  const page = await launch();
  await openContact(page);
  await page.getByRole("button", { name: "Add a task" }).click();
  await page.getByLabel("What needs doing").fill("Ring Oakridge about the pilot");
  await pick(page, "Kind", "Call");
  await page.getByRole("radio", { name: "Today", exact: true }).click();
  await page.getByRole("button", { name: /^Add task$/ }).click();
  await expect(page.locator(".leadtasks").getByText("Ring Oakridge about the pilot")).toBeVisible();

  await goTo(page, "Today");
  await page.getByRole("button", { name: 'Call for "Ring Oakridge about the pilot"' }).click();
  const prompter = page.getByRole("dialog", { name: `Call ${SCHOOL}` });
  // The script used last, and what to keep in mind from the call before.
  await expect(prompter.getByRole("combobox", { name: "Script" })).toContainText("Warm call script");
  await expect(prompter.getByLabel("Keep in mind")).toHaveValue("Call before 10am. Ask for Mrs Rao.");
  await expect(prompter.locator(".prompter__call").first()).toContainText("Spoke to them · Interested");

  // A letter pressed on a button does not change the screen behind.
  await prompter.getByRole("button", { name: "Start the clock" }).focus();
  await page.keyboard.press("m");
  await expect(prompter).toBeVisible();
  await expect(page.getByRole("heading", { name: "Today", level: 1 })).toBeVisible();

  await prompter.getByRole("button", { name: "End the call" }).click();
  await pick(page, "How did it go", "Didn't pick up");
  await expect(prompter.getByLabel("How interested are they?")).toHaveCount(0);
  await expect(prompter.getByLabel("What happens next")).toHaveValue(`Call ${SCHOOL} again`);
  await expect(prompter.getByRole("radiogroup", { name: "Next step" }).getByRole("radio", { name: "Tomorrow" })).toBeChecked();
  await prompter.getByRole("button", { name: "Save the call" }).click();
  await expect(prompter).toHaveCount(0);

  // The task is done and the next try is planned for tomorrow.
  await expect(page.getByText("Ring Oakridge about the pilot")).toHaveCount(0);
  await openContact(page);
  await expect(page.locator(".entry__text", { hasText: "Didn't pick up" })).toBeVisible();
  await expect(page.locator(".leadtasks").getByText(`Call ${SCHOOL} again`)).toBeVisible();
  // A missed call did not move the deal.
  await expect(page.locator(".detail__head")).toContainText("Interested");
});

test("Playbooks starts a call script from a tone", async () => {
  const page = await launch();
  await openBrainSection(page, "Playbooks");
  await newPage(page, "Call script");
  await page.getByRole("button", { name: /^Direct/ }).click();
  await expect(page.getByLabel("Title")).toHaveValue("Direct call script");
  await expect(page.getByLabel("Page", { exact: true })).toContainText("If they say…");
});
