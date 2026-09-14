import { test, expect, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * One line into a task, in a real window.
 *
 * The parsing itself is covered by hand in shared/quickadd.test.ts. What
 * needs a window is the conversation: the reading appearing as you type, a
 * question with buttons when something is missing, Enter refusing to guess,
 * and the task and its hour actually landing.
 */

test.describe.configure({ mode: "serial" });

let userDataDir: string;
let app: ElectronApplication;

/** The workspace's tomorrow, from the machine's own clock. */
function tomorrow(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function openApp(): Promise<Page> {
  app = await electron.launch({
    args: [".", `--user-data-dir=${userDataDir}`],
    env: { ...process.env, ELECTRON_ENABLE_LOGGING: "0" },
  });
  const page = await app.firstWindow();
  await page.waitForSelector(".firstrun, .sidebar");
  if (await page.locator(".firstrun").isVisible()) {
    await page.getByLabel("Company name").fill("Mine");
    await page.getByRole("button", { name: "Create company" }).click();
    await expect(page.getByRole("button", { name: /Mine/ })).toBeVisible();
    // A first run offers a short tour, which sits over everything. Leaving it
    // is exactly what somebody starting the app does.
    await page.locator(".tour").waitFor({ timeout: 3000 }).then(
      () => page.keyboard.press("Escape"),
      () => undefined,
    );
  }
  await page.getByLabel("Main").getByRole("button", { name: "Today", exact: true }).click();
  return page;
}

test.beforeAll(() => {
  userDataDir = mkdtempSync(join(tmpdir(), "caulder-quick-"));
});

test.afterAll(() => {
  rmSync(userDataDir, { recursive: true, force: true });
});

test.afterEach(async () => {
  await app?.close();
});

test("a line with a time makes the task and sets the hour aside", async () => {
  const page = await openApp();
  const line = page.getByLabel("Add a task in one line");

  await line.fill("Task at 4pm, tomorrow, Datascience Assignment");

  // What it understood is shown before anything is written.
  const reading = page.locator(".quickadd__reading");
  await expect(reading).toContainText("Datascience Assignment");
  await expect(reading).toContainText("Tomorrow");
  await expect(reading).toContainText("College");

  await line.press("Enter");
  await expect(page.locator(".quickadd__added")).toContainText("Datascience Assignment");

  // Both halves landed: an hour on tomorrow's grid, pointing at the task.
  const block = await page.evaluate(async (day) => {
    const { activeCompanyId } = await window.caulder.companies.list();
    const plan = await window.caulder.day.get(activeCompanyId ?? "", day);
    const found = plan.blocks.find((entry) => entry.title === "Datascience Assignment");
    return found ? { startsAt: found.startsAt, minutes: found.minutes, task: found.taskTitle } : null;
  }, tomorrow());
  expect(block).toEqual({ startsAt: "16:00", minutes: 60, task: "Datascience Assignment" });
});

test("it asks when a task has no day, and Enter does not guess", async () => {
  const page = await openApp();
  const line = page.getByLabel("Add a task in one line");

  await line.fill("Pay the phone bill");
  await expect(page.locator(".quickadd__question")).toHaveText("When is it due?");

  // Enter with a question open goes to the answers rather than adding.
  await line.press("Enter");
  await expect(page.locator(".quickadd__added")).toHaveCount(0);

  await page.locator(".quickadd__answers").getByRole("button", { name: "Today" }).click();
  await expect(page.locator(".quickadd__question")).toHaveCount(0);
  await line.press("Enter");

  await expect(page.locator(".taskrow").filter({ hasText: "Pay the phone bill" })).toBeVisible();
});

test("typing the answer works as well as pressing it", async () => {
  const page = await openApp();
  const line = page.getByLabel("Add a task in one line");

  await line.fill("Read chapter four");
  await expect(page.locator(".quickadd__question")).toHaveText("When is it due?");
  await line.fill("Read chapter four today");
  await expect(page.locator(".quickadd__question")).toHaveCount(0);
});

test("a word taught in Settings decides the area, and forgetting it undoes that", async () => {
  const page = await openApp();
  const line = page.getByLabel("Add a task in one line");
  const reading = page.locator(".quickadd__reading");

  // Before: nothing in the line points anywhere, so the workspace fills in
  // its own area, which is the company.
  await line.fill("Datascience reading tomorrow");
  await expect(reading.locator(".area")).toHaveText("Company");
  await line.fill("");

  await page.getByLabel("Main").getByRole("button", { name: "Settings", exact: true }).click();
  const card = page.locator(".card").filter({ has: page.getByRole("heading", { name: "Your words" }) });
  await card.getByLabel("Word or phrase").fill("Datascience");
  await card.getByRole("radiogroup", { name: "Which area it means" }).getByRole("radio", { name: "College" }).click();
  await card.getByRole("button", { name: "Teach it" }).click();
  await expect(card.getByRole("list", { name: "Your words" })).toContainText("Datascience");

  // The same word in another case is refused with where it already points,
  // not with a constraint error - and not with Electron's wrapper round it.
  await card.getByLabel("Word or phrase").fill("DATASCIENCE");
  await card.getByRole("button", { name: "Teach it" }).click();
  await expect(card.getByRole("alert")).toHaveText(
    '"DATASCIENCE" is already a word for College. Remove it first to move it.',
  );

  await page.getByLabel("Main").getByRole("button", { name: "Today", exact: true }).click();
  await line.fill("Datascience reading tomorrow");
  await expect(reading.locator(".area")).toHaveText("College");
  // It picked the area and left the title alone.
  await expect(reading.locator(".quickadd__title")).toHaveText("Datascience reading");

  // Forgotten, and the line goes back to not knowing.
  await page.getByLabel("Main").getByRole("button", { name: "Settings", exact: true }).click();
  await card.getByRole("button", { name: 'Forget "Datascience"' }).click();
  await expect(card.getByText("No words yet.")).toBeVisible();
  await page.getByLabel("Main").getByRole("button", { name: "Today", exact: true }).click();
  await line.fill("Datascience reading tomorrow");
  await expect(reading.locator(".area")).toHaveText("Company");
});

test("a title main refuses says why, in a sentence", async () => {
  // The schema in main caps a title at 200 characters. Its refusal used to
  // arrive as Electron's wrapper round a ZodError's whole issue list as JSON.
  const page = await openApp();
  const line = page.getByLabel("Add a task in one line");
  await line.fill(`${"x".repeat(250)} today`);
  await line.press("Enter");
  await expect(page.locator(".quickadd").getByRole("alert")).toHaveText(
    "Keep the title under 200 characters.",
  );
});

test("a repeat asks until when, then sets aside every one of them", async () => {
  const page = await openApp();
  const line = page.getByLabel("Add a task in one line");

  await line.fill("gym mon wed fri 7am");
  await expect(page.locator(".quickadd__reading")).toContainText("Every Mon, Wed, Fri");
  await expect(page.locator(".quickadd__question")).toHaveText("Every Mon, Wed, Fri - until when?");

  // Enter with the question open goes to its answers, not to adding.
  await line.press("Enter");
  await expect(page.locator(".quickadd__added")).toHaveCount(0);

  await page.locator(".quickadd__answers").getByRole("button", { name: "4 weeks" }).click();
  await line.press("Enter");
  await expect(page.locator(".quickadd__added")).toContainText("Every Mon, Wed, Fri");
  await expect(page.locator(".quickadd__added")).toContainText("12 on your day");

  // Four weeks from the first one is exactly four of each - and no task,
  // because a repeat is hours on the grid rather than a thing to tick.
  const found = await page.evaluate(async () => {
    const { activeCompanyId } = await window.caulder.companies.list();
    const start = new Date();
    let blocks = 0;
    let tasks = 0;
    for (let i = 0; i < 35; i += 1) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const plan = await window.caulder.day.get(activeCompanyId ?? "", day);
      blocks += plan.blocks.filter((b) => b.title === "Gym" && b.startsAt === "07:00").length;
      tasks += plan.tasks.filter((t) => t.title === "Gym").length;
    }
    return { blocks, tasks };
  });
  expect(found).toEqual({ blocks: 12, tasks: 0 });
});

test("a wrong area is one click on the reading to fix", async () => {
  const page = await openApp();
  const line = page.getByLabel("Add a task in one line");

  await line.fill("hw due tomorrow");
  const area = page.locator(".quickadd__reading").getByRole("button", { name: /^Area:/ });
  await expect(area).toHaveText("College");
  await area.click();
  await expect(area).toHaveText("Company");

  // The cursor went back to the line, so Enter adds rather than clicking the
  // area a second time.
  await expect(line).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator(".quickadd__added")).toContainText("Hw");

  const saved = await page.evaluate(async (day) => {
    const { activeCompanyId } = await window.caulder.companies.list();
    const plan = await window.caulder.day.get(activeCompanyId ?? "", day);
    return plan.tasks.find((t) => t.title === "Hw")?.area ?? null;
  }, tomorrow());
  expect(saved).toBe("company");
});

test("a slip is read as the day it nearly is, and says so", async () => {
  const page = await openApp();
  await page.getByLabel("Add a task in one line").fill("submit report wensday");
  await expect(page.locator(".quickadd__aside")).toHaveText("Read “wensday” as Wednesday.");
  await expect(page.locator(".quickadd__reading .quickadd__title")).toHaveText("Submit report");
});

test("A from another screen lands in the line", async () => {
  const page = await openApp();
  await page.getByLabel("Main").getByRole("button", { name: "Calendar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Calendar", exact: true })).toBeVisible();

  await page.keyboard.press("a");

  await expect(page.getByRole("heading", { name: "Today", exact: true })).toBeVisible();
  await expect(page.getByLabel("Add a task in one line")).toBeFocused();
  // And the A itself did not land in the line.
  await expect(page.getByLabel("Add a task in one line")).toHaveValue("");
});
