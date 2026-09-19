import { test, expect, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { goTo, passSetup } from "./nav";

/**
 * Today as the first screen for all of it (PLAN.md, part four): one line that
 * puts anything where it belongs, habits ticked with their run of days, and
 * the week's life beside the company's work.
 *
 * Set CAULDER_SHOTS to a folder to keep a screenshot of each screen.
 */

test.describe.configure({ mode: "serial" });

let userDataDir: string;
let app: ElectronApplication;
let page: Page;

async function shot(name: string) {
  const folder = process.env["CAULDER_SHOTS"];
  if (!folder) return;
  mkdirSync(folder, { recursive: true });
  await page.screenshot({ path: join(folder, `hub-${name}.png`) });
}

const line = () => page.getByLabel("Anything, in one line");
const goesTo = () => page.getByRole("group", { name: "Where it goes" });

test.beforeAll(async () => {
  userDataDir = mkdtempSync(join(tmpdir(), "caulder-hub-"));
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

  // A contact and a hobby for the line to know by name.
  await page.evaluate(async () => {
    const company = (await window.caulder.companies.list()).activeCompanyId as string;
    await window.caulder.leads.create(company, { name: "Oakridge International School" } as never);
    const hobby = await window.caulder.brain.create(company, "hobbies", "hobby");
    await window.caulder.brain.save(hobby.id, { title: "Guitar", body: "", fields: { hoursWanted: 3 }, secrets: {}, baseRevision: hobby.revision });
  });
  await goTo(page, "Contacts");
  await goTo(page, "Today");
});

test.afterAll(async () => {
  await app?.close();
  rmSync(userDataDir, { recursive: true, force: true });
});

test("the line says where each thing goes, and puts it there", async () => {
  // How the day went: the journal.
  await line().fill("Rough morning but shipped the pricing page");
  await expect(goesTo().getByRole("button", { name: "Journal" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("into today's journal")).toBeVisible();
  await shot("journal");
  await line().press("Enter");
  await expect(page.getByText("Added: In today's journal")).toBeVisible();
  const journal = page.locator(".card", { has: page.getByRole("heading", { name: "Journal" }) });
  await expect(journal.getByText(/shipped the pricing page/)).toBeVisible();

  // A call just made: the contact's history, as a call.
  await line().fill("Called Oakridge, they want a demo next week");
  await expect(goesTo().getByRole("button", { name: "Oakridge International School" })).toHaveAttribute("aria-pressed", "true");
  await line().press("Enter");
  await expect(page.getByText("Added: On Oakridge International School's history, as a call")).toBeVisible();

  // Time on a hobby, with a length.
  await line().fill("guitar 40 min");
  await expect(page.getByText("40m of Guitar, kept on the Calendar")).toBeVisible();
  await line().press("Enter");
  await expect(page.getByText("Added: 40m of Guitar, kept")).toBeVisible();

  // Something unsure is a note - and a chip makes it an idea instead.
  await line().fill("a parent app for attendance");
  await expect(goesTo().getByRole("button", { name: "Note" })).toHaveAttribute("aria-pressed", "true");
  await goesTo().getByRole("button", { name: "Idea" }).click();
  await line().press("Enter");
  await expect(page.getByText("Added: An idea, in the brain")).toBeVisible();

  // And a task is still a task, for the contact it names.
  await line().fill("call Oakridge tmrw 11am");
  await expect(goesTo().getByRole("button", { name: "Task" })).toHaveAttribute("aria-pressed", "true");
  await line().press("Enter");
  await expect(page.getByText(/^Added: call Oakridge/i)).toBeVisible();

  // Where they landed.
  await goTo(page, "Contacts");
  await page.locator(".leadrow__name", { hasText: /Oakridge International School/ }).click();
  await expect(page.getByText("Called Oakridge, they want a demo next week")).toBeVisible();
  await goTo(page, "Brain");
  await expect(page.getByRole("button", { name: /a parent app for attendance/ })).toBeVisible();
});

test("habits are ticked on Today, with their run of days", async () => {
  await goTo(page, "Today");
  const habits = page.locator(".card", { has: page.getByRole("heading", { name: "Habits" }) });
  await habits.getByRole("button", { name: "Add a habit" }).click();
  await habits.getByLabel("The habit").fill("Read 20 pages");
  await habits.getByLabel("The habit").press("Enter");
  const tick = habits.getByRole("checkbox", { name: "Read 20 pages" });
  await expect(tick).not.toBeChecked();
  await tick.click();
  await expect(tick).toBeChecked();
  await expect(habits.getByText("1 of 1 today")).toBeVisible();
  await expect(habits.getByText(/1 day in a row/)).toBeAttached();
  await shot("today");

  await habits.getByRole("button", { name: "Their weeks, on Life" }).click();
  await expect(page.getByRole("tab", { name: "Habits" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("img", { name: /Read 20 pages: kept on 1 of its 1 days/ })).toBeVisible();
});

test("the week's life sits beside the work: the hobby and its time", async () => {
  await goTo(page, "Today");
  const week = page.locator(".card", { has: page.getByRole("heading", { name: "Your week" }) });
  await expect(week.getByText("Guitar")).toBeVisible();
  await week.getByText("Guitar").click();
  await expect(page.getByRole("heading", { name: "Life", level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Guitar", level: 2 })).toBeVisible();
});
