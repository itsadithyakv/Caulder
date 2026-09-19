import { test, expect, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { choose, pick } from "./choose";
import { openBrainSection, passSetup } from "./nav";

/**
 * People through the real window: a founder with equity vesting, a role with
 * a candidate who is hired and onboarded, and a person found from search.
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
  await page.screenshot({ path: join(folder, `people-${name}.png`) });
}

/** A day as the date input wants it, counted from today on this machine. */
function dayFromNow(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

async function openPeople(page: Page) {
  await openBrainSection(page, "People");
}

test.beforeAll(() => {
  userDataDir = mkdtempSync(join(tmpdir(), "caulder-people-"));
});

test.afterAll(() => {
  rmSync(userDataDir, { recursive: true, force: true });
});

test.afterEach(async () => {
  await app?.close();
});

test("a founder is written down with what they own, and their equity vests", async () => {
  const page = await openApp();
  await openPeople(page);
  await expect(page.getByText("Nobody here yet")).toBeVisible();

  await page.getByRole("button", { name: "Add someone" }).click();
  const form = page.getByRole("form", { name: "Add someone" });
  await form.getByLabel("Name").fill("Asha Rao");
  await pick(page, "Here as", "Founder");
  await form.getByLabel("Role", { exact: true }).fill("CEO");
  // Thirteen months in: past a one-year cliff.
  await form.getByLabel("Started, and vesting from").fill(dayFromNow(-400));
  await form.getByLabel("Equity, %").fill("48");
  await form.getByLabel("Vesting, months").fill("48");
  await form.getByLabel("Cliff, months").fill("12");
  await form.getByLabel("What they own").fill("Sales, pricing and the money");
  await form.getByRole("button", { name: "Add them" }).click();

  // Their page opens, with the vesting worked out.
  await expect(page.getByRole("heading", { name: "Asha Rao" })).toBeVisible();
  await expect(page.getByText("13% of 48% vested")).toBeVisible();
  await expect(page.getByText("Sales, pricing and the money")).toBeVisible();
  await shot(page, "founder");

  await page.getByRole("button", { name: "Everybody" }).click();
  const team = page.getByRole("list", { name: "The team" });
  await expect(team.getByText("Asha Rao")).toBeVisible();
  await expect(team.getByText("Founder · CEO · 48%, 13% vested")).toBeVisible();
  await expect(page.getByText("Equity given: 48%")).toBeVisible();

  // The checklist's founder items are answered from here.
  await page.getByLabel("Brain sections").getByRole("button", { name: "Home" }).click();
  // The list folds to what is left; written ones are under All 12.
  await expect(page.getByRole("button", { name: /^Founders, and who owns what/ })).toHaveCount(0);
  await page.getByRole("button", { name: "All 12" }).click();
  await expect(page.getByRole("button", { name: "Founders, and who owns what, written" })).toBeVisible();
  await expect(page.getByRole("button", { name: "The equity split, written" })).toBeVisible();
});

test("a candidate for a role is hired, the role filled, and onboarding becomes tasks", async () => {
  const page = await openApp();
  await openPeople(page);

  await page.getByRole("button", { name: "Add a role" }).click();
  const role = page.getByRole("form", { name: "Add a role" });
  await role.getByLabel("The role").fill("Sales intern");
  await role.getByLabel("Pay range").fill("₹15,000 a month");
  await role.getByRole("button", { name: "Add the role" }).click();
  await expect(page.getByRole("heading", { name: "Sales intern" })).toBeVisible();

  await page.getByRole("button", { name: "Add a candidate" }).click();
  const form = page.getByRole("form", { name: "Add a candidate" });
  await form.getByLabel("Name").fill("Meera Iyer");
  await choose(page, "For the role", "Sales intern");
  await form.getByLabel("Notes").fill("Sold ads for the college fest.");
  await form.getByRole("button", { name: "Add the candidate" }).click();

  // Back on the list, where she is moved along without opening her.
  await page.getByRole("button", { name: "Everybody" }).click();
  const candidates = page.getByRole("list", { name: "Candidates for Sales intern" });
  await expect(candidates.getByText("Meera Iyer")).toBeVisible();
  await choose(page, "Where Meera Iyer is up to", "Offer made");
  await expect(page.getByLabel("Where Meera Iyer is up to")).toContainText("Offer made");
  await shot(page, "hiring");

  await candidates.getByRole("button", { name: /^Meera Iyer/ }).click();
  await pick(page, "Joining as", "Intern");
  await page.getByLabel("Starting on").fill(dayFromNow(7));
  await page.getByRole("button", { name: "Hire Meera Iyer" }).click();
  await expect(page.getByText("Starting soon")).toBeVisible();
  await expect(page.getByText("Sold ads for the college fest.")).toBeVisible();

  await page.getByRole("button", { name: "Start onboarding" }).click();
  const steps = page.getByRole("list", { name: "Onboarding tasks" });
  await expect(steps.getByText("Offer letter signed (Meera Iyer)")).toBeVisible();
  await expect(page.getByText(/^0 of 6 done/)).toBeVisible();
  await steps.getByRole("button", { name: "Offer letter signed (Meera Iyer) is done" }).click();
  await expect(page.getByText(/^1 of 6 done/)).toBeVisible();
  await shot(page, "onboarding");

  await page.getByRole("button", { name: "Everybody" }).click();
  await expect(page.getByRole("list", { name: "The team" }).getByText("Meera Iyer")).toBeVisible();
  await expect(page.getByLabel("Sales intern", { exact: true }).getByText("Filled")).toBeVisible();
});

test("a person is found from search and opens on their page", async () => {
  const page = await openApp();
  await page.keyboard.press("Control+k");
  const search = page.getByRole("combobox", { name: "Search everything" });
  await search.fill("college fest");
  const results = page.getByRole("listbox", { name: "Results" });
  await expect(results.getByRole("option", { name: /Person\s*Meera Iyer/ })).toBeVisible();
  await search.press("Enter");

  await expect(page.getByRole("heading", { name: "Meera Iyer" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Onboarding tasks" })).toBeVisible();
});
