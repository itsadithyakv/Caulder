import { test, expect, _electron as electron, type ElectronApplication } from "@playwright/test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { passSetup } from "./nav";

/**
 * The week, in a real window.
 *
 * The arithmetic — which days a week holds, and that overlap is worked out
 * inside a day rather than across seven — is covered in
 * electron/main/services/day.test.ts. What needs a window is the gesture: a
 * block dragged from one column into another has to land on that day, and
 * there is no way to prove that without a real pointer over a real layout.
 */

test.describe.configure({ mode: "serial" });

let userDataDir: string;
let app: ElectronApplication;

/** The Monday of the week the machine is in, and two days after it. */
function thisWeek() {
  const monday = new Date();
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const iso = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
      date.getDate(),
    ).padStart(2, "0")}`;
  const wednesday = new Date(monday);
  wednesday.setDate(wednesday.getDate() + 2);
  return { monday: iso(monday), wednesday: iso(wednesday) };
}

async function openApp() {
  app = await electron.launch({
    args: [".", `--user-data-dir=${userDataDir}`],
    env: { ...process.env, ELECTRON_ENABLE_LOGGING: "0" },
  });
  const page = await app.firstWindow();

  await page.waitForSelector(".firstrun, .sidebar");
  if (await page.locator(".firstrun").isVisible()) {
    await page.getByLabel("Company name").fill("Mine");
    await page.getByRole("button", { name: "Create company" }).click();
    await passSetup(page);
    await expect(page.getByRole("button", { name: /Mine/ })).toBeVisible();
  }

  await page.getByLabel("Main").getByRole("button", { name: "Calendar", exact: true }).click();
  await expect(page.getByRole("button", { name: "Week", exact: true })).toBeVisible();

  return page;
}

/**
 * Switches to the week, re-reading it on the way.
 *
 * Going out to the day and back rather than straight there, because the week
 * is only fetched when it is switched to — pressing a tab that is already on
 * changes nothing, which is correct behaviour and a trap for a test that
 * wrote a block in between.
 */
async function showWeek(page: Awaited<ReturnType<typeof openApp>>) {
  const tabs = page.getByLabel("How much to show");
  await tabs.getByRole("button", { name: "Day" }).click();
  await tabs.getByRole("button", { name: "Week" }).click();
  await expect(page.locator(".week__lane")).toHaveCount(7);
}

test.beforeAll(() => {
  userDataDir = mkdtempSync(join(tmpdir(), "caulder-week-"));
});

test.afterAll(() => {
  rmSync(userDataDir, { recursive: true, force: true });
});

test.afterEach(async () => {
  await app?.close();
});

test("a block dragged into another column lands on that day", async () => {
  const { monday, wednesday } = thisWeek();
  const page = await openApp();

  const companyId = await page.evaluate(async (day) => {
    const { activeCompanyId } = await window.caulder.companies.list();
    if (!activeCompanyId) throw new Error("No active workspace.");
    await window.caulder.day.createBlock(activeCompanyId, {
      day,
      startsAt: "10:00",
      minutes: 60,
      title: "Gym",
      kind: "away",
      notes: null,
      taskId: null,
      priority: null,
      remindMinutes: null,
      repeat: null,
    });
    return activeCompanyId;
  }, monday);

  await showWeek(page);
  await expect(page.locator(".block--week")).toHaveCount(1);

  const block = await page.locator(".block--week").boundingBox();
  const target = await page.locator(".week__lane").nth(2).boundingBox();
  if (!block || !target) throw new Error("Nothing to drag.");

  // A real pointer. Playwright's dragTo never fires the browser's own
  // drag-and-drop events, but this grid is built on pointer events, so
  // moving the mouse is the whole gesture.
  await page.mouse.move(block.x + block.width / 2, block.y + 10);
  await page.mouse.down();
  // Two moves, because one is indistinguishable from a click and the
  // handler is only attached once a drag has started.
  await page.mouse.move(target.x + target.width / 2, block.y + 10, { steps: 8 });
  await page.mouse.move(target.x + target.width / 2, block.y + 10);
  await page.mouse.up();

  // The day is asked for by name rather than read off the machine's UTC
  // clock, which after half past six in the evening in India is yesterday.
  await expect
    .poll(async () =>
      page.evaluate(async (where) => {
        const week = await window.caulder.day.week(where.id, where.day);
        return week.days
          .flatMap((entry) => entry.blocks.map((block) => ({ day: entry.day, at: block.startsAt })))
          .at(0) ?? null;
      }, { id: companyId, day: monday }),
    )
    .toEqual({ day: wednesday, at: "10:00" });
});

test("the day it landed on is the one that opens", async () => {
  const { wednesday } = thisWeek();
  const page = await openApp();
  await showWeek(page);

  // Every heading opens that day on its own, which is the ordinary way out of
  // the week.
  await page.locator(".week__day").nth(2).click();
  await expect(page.locator(".week")).toHaveCount(0);
  await expect(page.locator(".block")).toHaveCount(1);
  await expect(page.getByText("Gym")).toBeVisible();

  // And it really is the Wednesday, not merely a day with a Gym on it.
  const shown = await page.evaluate(async (day) => {
    const { activeCompanyId } = await window.caulder.companies.list();
    const week = await window.caulder.day.week(activeCompanyId ?? "", day);
    return week.days.filter((entry) => entry.blocks.length > 0).map((entry) => entry.day);
  }, wednesday);
  expect(shown).toEqual([wednesday]);
});

/** A day some whole days from another, by the calendar rather than the clock. */
function plusDays(day: string, days: number): string {
  const [year, month, date] = day.split("-").map(Number);
  const moved = new Date(year ?? 1970, (month ?? 1) - 1, (date ?? 1) + days);
  return `${moved.getFullYear()}-${String(moved.getMonth() + 1).padStart(2, "0")}-${String(
    moved.getDate(),
  ).padStart(2, "0")}`;
}

test("a repeat changed from one day on leaves the ones already past alone", async () => {
  const { monday } = thisWeek();
  const lastMonday = plusDays(monday, -7);
  const nextMonday = plusDays(monday, 7);
  const page = await openApp();

  // Mondays from last week to next, so there is one before the change, the
  // one changed, and one after it.
  const companyId = await page.evaluate(
    async (where) => {
      const { activeCompanyId } = await window.caulder.companies.list();
      if (!activeCompanyId) throw new Error("No active workspace.");
      await window.caulder.day.createBlock(activeCompanyId, {
        day: where.from,
        startsAt: "09:00",
        minutes: 60,
        title: "Databases lecture",
        kind: "meeting",
        notes: null,
        taskId: null,
        priority: null,
        remindMinutes: null,
        repeat: { weekdays: [1], until: where.until },
      });
      return activeCompanyId;
    },
    { from: lastMonday, until: nextMonday },
  );

  // This week's Monday, opened from the week, then the lecture on it.
  await showWeek(page);
  await page.locator(".week__day").nth(0).click();
  await page.locator(".block", { hasText: "Databases lecture" }).dblclick();

  const form = page.getByRole("dialog", { name: "A block of time" });
  await form.getByLabel("What", { exact: true }).fill("Databases, room 4");
  await form.getByLabel("Starts", { exact: true }).fill("10:00");
  await form.getByRole("button", { name: "Save every one from here" }).click();
  await expect(form).toHaveCount(0);

  const mondayOf = (day: string) =>
    page.evaluate(
      async (where) => {
        const week = await window.caulder.day.week(where.id, where.day);
        const block = week.days.find((entry) => entry.day === where.day)?.blocks[0];
        return block ? { title: block.title, at: block.startsAt } : null;
      },
      { id: companyId, day },
    );

  // Last week's happened at nine and still says so; this one and the next moved.
  expect(await mondayOf(lastMonday)).toEqual({ title: "Databases lecture", at: "09:00" });
  expect(await mondayOf(monday)).toEqual({ title: "Databases, room 4", at: "10:00" });
  expect(await mondayOf(nextMonday)).toEqual({ title: "Databases, room 4", at: "10:00" });
});

test("a usual week is put in once, and is on the calendar the week after", async () => {
  const page = await openApp();

  await page.getByRole("button", { name: "A usual week", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "A usual week" });
  // Nothing to name: it runs until a day, a quarter off unless told otherwise.
  await expect(sheet.getByLabel("Runs until")).not.toHaveValue("");
  await sheet.getByLabel("What it is").fill("Client work");
  await sheet.getByRole("button", { name: "Put it on the calendar" }).click();
  await expect(sheet).toHaveCount(0);

  // Next week rather than this one, so a row set for today's weekday is in
  // it whichever side of midnight the machine's clock and the workspace's are.
  const next = await page.evaluate(async (day) => {
    const { activeCompanyId } = await window.caulder.companies.list();
    const week = await window.caulder.day.week(activeCompanyId ?? "", day);
    return week.days.flatMap((entry) => entry.blocks.filter((block) => block.title === "Client work").map((block) => block.kind));
  }, plusDays(thisWeek().monday, 7));
  expect(next).toEqual(["focus"]);
});

test("two things at once are said: on Today, in the calendar, and while a time is chosen", async () => {
  const page = await openApp();
  await page.evaluate(async () => {
    const { activeCompanyId } = await window.caulder.companies.list();
    if (!activeCompanyId) throw new Error("No active workspace.");
    // The company was made on this computer, so its day is this computer's.
    const day = new Date().toLocaleDateString("en-CA");
    for (const [title, startsAt, minutes] of [
      ["Call with Kettle & Crumb", "14:00", 30],
      ["Proposal for Harbour", "14:15", 90],
    ] as const) {
      await window.caulder.day.createBlock(activeCompanyId, {
        day,
        startsAt,
        minutes,
        title,
        kind: "meeting",
        notes: null,
        taskId: null,
        priority: null,
        remindMinutes: null,
        repeat: null,
      });
    }
  });

  await page.getByLabel("Main").getByRole("button", { name: /^Today/ }).click();
  const today = page.locator(".clashes");
  await expect(today).toContainText("Two things at once");
  await expect(today).toContainText("Call with Kettle & Crumb and Proposal for Harbour at 2:15");

  await page.getByLabel("Main").getByRole("button", { name: "Calendar", exact: true }).click();
  await page.getByLabel("How much to show").getByRole("button", { name: "Day" }).click();
  await expect(page.locator(".clashes")).toContainText("Call with Kettle & Crumb and Proposal for Harbour");

  // Choosing a time that clashes says so before anything is kept - and keeps it if asked.
  await page.getByRole("button", { name: "Add a block" }).click();
  await page.getByLabel("Starts").fill("14:00");
  await expect(page.locator(".blockform__clash")).toContainText("Overlaps Call with Kettle & Crumb");
  // An hour nothing else in this week has.
  await page.getByLabel("Starts").fill("05:00");
  await expect(page.locator(".blockform__clash")).toHaveCount(0);
});

test("the week says what happened in it, and three things chosen for next week come to Today", async () => {
  const page = await openApp();
  await showWeek(page);
  const review = page.locator(".weekreview");
  await expect(review).toContainText("This week so far");
  await expect(review).toContainText("planned");

  // Chosen for next week from this week's head...
  await review.getByLabel("Thing 1").fill("Close Harbour Coffee");
  await review.getByLabel("Thing 1").press("Enter");
  await page.getByLabel("The week after").click();
  // ...they are that week's own when it is shown.
  await expect(page.locator(".weekreview").getByLabel("Thing 1")).toHaveValue("Close Harbour Coffee");

  // This week's three, chosen from the week before, are on Today until ticked.
  await page.getByLabel("The week before").click();
  await page.getByLabel("The week before").click();
  await page.locator(".weekreview").getByLabel("Thing 1").fill("Send the Harbour proposal");
  await page.locator(".weekreview").getByLabel("Thing 1").press("Enter");
  await page.getByLabel("Main").getByRole("button", { name: /^Today/ }).click();
  const three = page.locator(".weekthree");
  await expect(three).toContainText("Send the Harbour proposal");
  await three.getByRole("button", { name: "Done: Send the Harbour proposal" }).click();
  await expect(three).toHaveCount(0);
});
