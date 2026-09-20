import { test, expect, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { goTo, passSetup } from "./nav";

/**
 * Keeping up with a goal, and your week, in a real window: +1 and Update move
 * a goal and say how it stands, the last check-in comes back, a goal reached
 * is marked so; a weekday given a theme heads Today and the Calendar.
 *
 * Set CAULDER_SHOTS to a folder to keep a screenshot of each moment.
 */

test.describe.configure({ mode: "serial" });

let userDataDir: string;
let app: ElectronApplication;
let page: Page;

async function shot(name: string) {
  const folder = process.env["CAULDER_SHOTS"];
  if (!folder) return;
  mkdirSync(folder, { recursive: true });
  await page.screenshot({ path: join(folder, `goals-${name}.png`) });
}

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

test.beforeAll(async () => {
  userDataDir = mkdtempSync(join(tmpdir(), "caulder-goals-"));
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
  // A goal and a hobby, made the way Life's own buttons make them.
  await page.evaluate(async () => {
    const { homeCompanyId } = await window.caulder.companies.list();
    const home = homeCompanyId as string;
    const make = async (section: "goals" | "hobbies", template: string, title: string, fields: Record<string, string | number | boolean | null>) => {
      const blank = await window.caulder.brain.create(home, section, template);
      await window.caulder.brain.save(blank.id, { title, body: "", fields: { ...blank.fields, ...fields }, secrets: {}, baseRevision: blank.revision });
    };
    const year = new Date().getFullYear();
    await make("goals", "life-goal", "Read 12 books", { target: 12, unit: "books", byOn: `${year}-12-31` });
    await make("hobbies", "hobby", "Guitar", { hoursWanted: 3, status: "doing-it" });
  });
});

test.afterAll(async () => {
  await app?.close();
  rmSync(userDataDir, { recursive: true, force: true });
});

test("+1 and Update move a goal, and the last check-in comes back", async () => {
  await goTo(page, "Life");
  const goal = page.locator(".goalcard", { hasText: "Read 12 books" });
  await expect(goal).toContainText("Just set");
  await goal.getByRole("button", { name: "Add 1 books to Read 12 books" }).click();
  await expect(goal).toContainText("1 of 12 books");

  await goal.getByRole("button", { name: "Update" }).click();
  await page.getByRole("radio", { name: "Set to" }).click();
  await page.getByLabel("Where it stands now").fill("5");
  await page.getByLabel("A word about it").fill("Dune");
  await page.getByRole("button", { name: "Keep it" }).click();
  await expect(goal).toContainText("5 of 12 books");
  await expect(goal).toContainText('Last: today, "Dune"');
  await shot("moved");

  await goal.getByRole("button", { name: "Undo" }).click();
  await expect(goal).toContainText("1 of 12 books");
});

test("a goal reached is marked so", async () => {
  const goal = page.locator(".goalcard", { hasText: "Read 12 books" });
  await goal.getByRole("button", { name: "Update" }).click();
  await page.getByRole("radio", { name: "Set to" }).click();
  await page.getByLabel("Where it stands now").fill("12");
  await page.getByRole("button", { name: "Keep it" }).click();
  await expect(goal).toContainText("Reached");
  await goal.getByRole("button", { name: "Mark it reached" }).click();
  await expect(goal).toContainText("Done");
});

test("a theme day heads Today and the Calendar", async () => {
  const d = new Date();
  const weekday = WEEKDAYS[(d.getDay() + 6) % 7] as string;
  await page.getByRole("button", { name: new RegExp(`^${weekday}:`) }).click();
  await page.getByRole("group", { name: `What ${weekday} is for` }).getByRole("button", { name: /^Guitar/ }).click();
  await expect(page.getByRole("button", { name: `${weekday}: Guitar` })).toBeVisible();
  await expect(page.locator(".hobbyweeks__days")).toContainText("its day");
  await shot("week");

  await goTo(page, "Today");
  await expect(page.locator(".today__theme")).toHaveText("Guitar day");

  await goTo(page, "Calendar");
  const week = page.getByRole("button", { name: "Week", exact: true });
  if (await week.count()) await week.first().click();
  await expect(page.locator(".week__theme", { hasText: "Guitar" })).toBeVisible();
});
