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
      kind: "personal",
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
