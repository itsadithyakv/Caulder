import { test, expect, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { goTo, newPage, passSetup } from "./nav";

/**
 * You, in a real window (PLAN.md, part four, phase 14): the journal a key
 * away and written in without an Edit button, Life's studies with an exam
 * that reaches Today, and a hobby given time on the Calendar - all of it
 * apart from the company's brain.
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
  await page.screenshot({ path: join(folder, `life-${name}.png`) });
}

/** A day this many days from today, as the date field wants it. */
function inDays(days: number): string {
  const at = new Date();
  at.setDate(at.getDate() + days);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
}

async function lifeTab(name: string) {
  await goTo(page, "Life");
  await page.getByRole("tab", { name }).click();
}

test.beforeAll(async () => {
  userDataDir = mkdtempSync(join(tmpdir(), "caulder-life-"));
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
});

test.afterAll(async () => {
  await app?.close();
  rmSync(userDataDir, { recursive: true, force: true });
});

test("your own are under You, and not in the company's brain", async () => {
  const nav = page.getByLabel("Main");
  await expect(nav.getByRole("button", { name: "Journal" })).toBeVisible();
  await expect(nav.getByRole("button", { name: "Life" })).toBeVisible();
  await goTo(page, "Brain");
  await expect(page.getByRole("navigation", { name: "Brain sections" }).getByRole("button", { name: /^Studies|^Journal/ })).toHaveCount(0);
});

test("how today felt, pressed on Today, opens with the journal - and what is typed is kept without a Save", async () => {
  await goTo(page, "Today");
  const card = page.locator(".card", { has: page.getByRole("heading", { name: "Journal" }) });
  await card.getByRole("button", { name: "Good" }).click();
  await expect(card.getByRole("button", { name: "Good" })).toHaveAttribute("aria-pressed", "true");
  await shot("today");

  await card.getByRole("button", { name: "Open today's entry" }).click();
  await expect(page.getByRole("group", { name: "How the day felt" }).getByRole("button", { name: "Good" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByLabel("The entry").fill("## Today\n\nShipped the pricing page. Called two schools.");
  await expect(page.getByRole("status").filter({ hasText: "Kept" })).toBeVisible();
  await expect(page.getByRole("button", { name: /written, Good$/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "The day in Caulder" })).toBeVisible();
  await shot("journal");

  // Away and back: it was kept.
  await goTo(page, "Today");
  await expect(card.getByText("Shipped the pricing page. Called two schools.")).toBeVisible();
  await page.keyboard.press("j");
  await expect(page.getByLabel("The entry")).toHaveValue(/Called two schools/);

  // Yesterday has nothing yet, and looking at it does not write it.
  await page.getByRole("button", { name: "The day before" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Nothing written yet" })).toBeVisible();
  await page.getByRole("main").getByRole("button", { name: "Today", exact: true }).click();
  await expect(page.getByRole("button", { name: /: written/ })).toHaveCount(1);
});

test("a course's exam, made from the course, comes up on Today", async () => {
  await lifeTab("Studies");
  await newPage(page, "Course");
  await page.getByLabel("Title", { exact: true }).fill("Data structures");
  await page.getByLabel("Code").fill("CS2101");
  await page.getByLabel("Credits").fill("4");
  await page.getByLabel("Grade points").fill("9");
  await page.getByLabel("Page", { exact: true }).fill("## Assignments\n\n- [ ] Problem set 3");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("button", { name: "Edit", exact: true })).toBeVisible();

  // Its assignments become college tasks.
  await page.getByRole("button", { name: "Make 1 task" }).click();
  await expect(page.getByText(/^Task, due /)).toBeVisible();

  // A page just made opens ready to write.
  await page.getByRole("button", { name: "Add an exam for it" }).click();
  await page.getByLabel("Title", { exact: true }).fill("Data structures midterm");
  await page.getByLabel("On", { exact: true }).fill(inDays(10));
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("button", { name: "Edit", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Studies", exact: true }).click();
  await expect(page.getByRole("heading", { name: "1 exam coming" })).toBeVisible();
  await expect(page.getByText(/Average 9/)).toBeVisible();
  await shot("studies");

  await goTo(page, "Today");
  const deadlines = page.getByRole("list", { name: "Deadlines" });
  await expect(deadlines.getByText("Data structures midterm")).toBeVisible();
  await expect(deadlines.getByText("Exam", { exact: true })).toBeVisible();
  // Opened from Today, the exam opens on Life, not in the brain.
  await deadlines.getByText("Data structures midterm").click();
  await expect(page.getByRole("heading", { name: "Life", level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Data structures midterm", level: 2 })).toBeVisible();
});

test("a hobby is given evenings on the Calendar, and the block opens the hobby", async () => {
  await lifeTab("Hobbies");
  await page.getByRole("button", { name: "Add a hobby" }).click();
  await page.getByLabel("Title", { exact: true }).fill("Guitar");
  await page.getByLabel("Hours a week").fill("3");
  await page.getByRole("button", { name: "Save", exact: true }).click();

  await page.getByRole("button", { name: "Make time for it" }).click();
  const form = page.getByRole("form", { name: "Make time for it" });
  await form.getByLabel("At").fill("23:30");
  await form.getByRole("button", { name: "Put it on the Calendar" }).click();
  // The time is written the way this computer writes times: 23:30 or 11:30 PM.
  await expect(page.getByRole("list", { name: "Time set aside" })).toContainText(/23:30|11:30/);
  await expect(page.getByText(/^Next: /)).toBeVisible();
  await shot("time");

  await goTo(page, "Life");
  await expect(page.getByRole("heading", { name: "Time for them" })).toBeVisible();
  await shot("overview");

  await goTo(page, "Calendar");
  // A block opens with a double-click, as every block on the grid does.
  await page.locator(".block", { hasText: "Guitar" }).first().dblclick();
  await expect(page.getByText(/Time for Guitar, set aside from the brain/)).toBeVisible();
  await page.getByRole("button", { name: "Open the page" }).click();
  await expect(page.getByRole("heading", { name: "Guitar", level: 2 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Life", level: 1 })).toBeVisible();
});
