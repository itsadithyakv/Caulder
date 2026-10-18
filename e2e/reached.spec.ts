import { test, expect, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { choose, pick } from "./choose";
import { passSetup } from "./nav";

/**
 * Who has been written to, and who answered (PLAN.md, part eight, phase 33).
 *
 * The filter on Contacts reads each contact's history, and *Work through
 * them* writes to it one contact at a time. Worth a real window because the
 * two have to agree: somebody the walk says was written to must leave "Not
 * written to", and somebody said to have answered must turn up under
 * "Answered".
 *
 * Nothing is opened outside the app here: under test the outreach service
 * does everything but hand the address to Windows.
 */

test.describe.configure({ mode: "serial" });

let userDataDir: string;
let app: ElectronApplication;
let page: Page;

const CONTACTS = [
  { name: "Alder Cafe", phone: "98450 11111" },
  { name: "Birch Books", phone: "" },
  { name: "Cedar Clinic", phone: "98450 33333" },
];

/** The names as the table currently has them, top to bottom. */
const names = () => page.locator(".leadrow__name").allTextContents();

test.beforeAll(async () => {
  userDataDir = mkdtempSync(join(tmpdir(), "caulder-reached-"));
  app = await electron.launch({
    args: [".", `--user-data-dir=${userDataDir}`],
    env: { ...process.env, ELECTRON_ENABLE_LOGGING: "0" },
  });
  page = await app.firstWindow();
  await page.waitForSelector(".firstrun, .sidebar");
  await page.getByLabel("Company name").fill("Unifloe");
  await page.getByRole("button", { name: "Create company" }).click();
  await passSetup(page);
  await page.getByRole("button", { name: "Contacts", exact: true }).click();

  for (const contact of CONTACTS) {
    await page.getByRole("button", { name: /^Add a? ?contact$/ }).first().click();
    await page.getByLabel("Name").fill(contact.name);
    if (contact.phone) await page.getByLabel("Phone", { exact: true }).fill(contact.phone);
    await page.getByRole("button", { name: "Add contact" }).click();
    await expect(page.getByRole("heading", { name: contact.name })).toBeVisible();
    await page.getByRole("button", { name: "All contacts" }).click();
  }
});

test.afterAll(async () => {
  await app?.close();
  rmSync(userDataDir, { recursive: true, force: true });
});

test("nobody has been written to, so everybody is under Not written to", async () => {
  await choose(page, "Filter by whether they answered", "Not written to");
  expect((await names()).sort()).toEqual(["Alder Cafe", "Birch Books", "Cedar Clinic"]);
  await choose(page, "Filter by whether they answered", "Answered");
  await expect(page.getByText("Nothing matches those filters")).toBeVisible();
  await choose(page, "Filter by whether they answered", "Written to or not");
});

test("working through them goes one at a time, leaves out who cannot be reached there, and writes only what was said to have gone", async () => {
  await page.getByLabel("Select every contact shown").check();
  await page.getByRole("button", { name: "Work through them" }).click();

  const walk = page.getByRole("region", { name: "Work through them" });
  await expect(walk).toContainText("2 of 3 can be written to on WhatsApp.");
  await expect(walk).toContainText("Birch Books (no phone number)");
  // Somewhere none of them is: said, and nothing to start.
  await pick(page, "Where to write to them", "LinkedIn");
  await expect(walk).toContainText("None of them can be written to on LinkedIn.");
  await expect(walk.getByRole("button", { name: /^Start with/ })).toBeDisabled();
  await pick(page, "Where to write to them", "WhatsApp");

  await walk.getByLabel("Message").fill("Hello {{lead.name}}, a quick question.");
  await walk.getByRole("button", { name: /^Start with/ }).click();

  // The first: their own copy, opened, and said to have gone.
  const going = page.getByRole("region", { name: "Working through them" });
  await expect(going.getByRole("status")).toHaveText("1 of 2");
  const first = (await going.getByRole("heading").textContent()) ?? "";
  await expect(going.getByLabel("What they will read")).toHaveText(`Hello ${first}, a quick question.`);
  await going.getByRole("button", { name: "Open WhatsApp" }).click();
  await going.getByRole("button", { name: "Sent it" }).click();

  // The second: skipped, and nothing written about them.
  await expect(going.getByRole("status")).toHaveText("2 of 2");
  const second = (await going.getByRole("heading").textContent()) ?? "";
  await going.getByRole("button", { name: "Skip" }).click();

  const after = page.getByRole("region", { name: "What was sent" });
  await expect(after.getByRole("heading")).toHaveText("Written to 1 on WhatsApp");
  await expect(after).toContainText(`Skipped: ${second}.`);
  await after.getByRole("button", { name: "Done" }).click();

  // The history is what the filter reads: the one written to has left "Not written to".
  await choose(page, "Filter by whether they answered", "Not written to");
  expect((await names()).sort()).toEqual(["Birch Books", second].sort());
  expect(await names()).not.toContain(first);

  // And their page has what they were sent, with their name in it.
  await choose(page, "Filter by whether they answered", "Written to or not");
  await page.locator(".leadrow__name", { hasText: first }).click();
  await expect(page.locator(".entry").filter({ hasText: "WhatsApp" }).first()).toContainText(`Hello ${first}, a quick question.`);

  // They answered there, which Caulder cannot see: said on the history, and the filter has it.
  await page.getByRole("tab", { name: "Message" }).click();
  await page.getByRole("button", { name: "Their reply" }).click();
  await page.getByLabel("They answered details").fill("Yes, send it over");
  await page.getByLabel("They answered details").press("Control+Enter");
  await expect(page.locator(".entry").filter({ hasText: "They answered" }).first()).toContainText("Yes, send it over");
  await page.getByRole("button", { name: "All contacts" }).click();
  await choose(page, "Filter by whether they answered", "Answered");
  expect(await names()).toEqual([first]);
});

test("Today says who was written to this week and what came back", async () => {
  await page.getByLabel("Main").getByRole("button", { name: "Today", exact: true }).click();
  const card = page.locator(".card").filter({ has: page.getByRole("heading", { name: "Reach out" }) });
  await expect(card).toContainText("1 written to this week: 1 answered, 0 waiting.");
});
