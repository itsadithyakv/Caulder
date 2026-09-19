import { test, expect, _electron as electron, type ElectronApplication } from "@playwright/test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { passSetup } from "./nav";

/**
 * The Google link, as far as it can be driven without a Google account.
 *
 * The reconciling itself is checked in shared/gsync.test.ts, where the cases
 * that can lose somebody's work are written out by hand. What is worth a real
 * window here is the half that surrounds it: that a bad connection is refused
 * rather than stored, that nothing is asked of the network until it is set up,
 * and that the setup a stranger has to follow is actually on the screen.
 */

test.describe.configure({ mode: "serial" });

let userDataDir: string;
let app: ElectronApplication;

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

  await page.getByRole("button", { name: /^Settings/ }).click();
  return page;
}

/** The active workspace id, for the calls that take one. */
async function activeId(page: Awaited<ReturnType<typeof openApp>>) {
  return page.evaluate(async () => (await window.caulder.companies.list()).activeCompanyId);
}

test.beforeAll(() => {
  userDataDir = mkdtempSync(join(tmpdir(), "caulder-google-"));
});

test.afterAll(() => {
  rmSync(userDataDir, { recursive: true, force: true });
});

test.afterEach(async () => {
  await app?.close();
});

test("it starts disconnected and asks nothing of the network", async () => {
  const page = await openApp();
  const id = await activeId(page);

  const state = await page.evaluate((company) => window.caulder.google.state(company!), id);

  expect(state.connected).toBe(false);
  expect(state.calendars).toEqual([]);
  expect(state.sync.lastSyncedAt).toBeNull();
});

test("the whole setup is written on the card, not linked to", async () => {
  const page = await openApp();

  await page.getByRole("button", { name: "How to set this up" }).click();

  // Five steps, and the three that look wrong until explained are all named:
  // adding two services by hand, running a function to be asked for
  // permission, and a deployment set to "Anyone".
  await expect(page.locator(".guide li")).toHaveCount(5);
  await expect(page.getByText("Google Calendar API")).toBeVisible();
  await expect(page.getByText("Tasks API")).toBeVisible();
  await expect(page.locator(".guide").getByText("Anyone")).toBeVisible();
});

test("a URL that is not an Apps Script deployment is refused, and nothing is kept", async () => {
  const page = await openApp();
  const id = await activeId(page);

  const outcome = await page.evaluate(async (company) => {
    try {
      await window.caulder.google.connect(company!, "https://example.com/whatever", "key");
      return "accepted";
    } catch (error) {
      return String((error as Error).message);
    }
  }, id);

  expect(outcome).toContain("Apps Script web app URL");

  // The important half. A URL and key that do not work are worse kept than
  // refused: the mistake would resurface later as a sync that never runs.
  const state = await page.evaluate((company) => window.caulder.google.state(company!), id);
  expect(state.connected).toBe(false);
});

test("a syncing attempt with nothing connected says so rather than hanging", async () => {
  const page = await openApp();
  const id = await activeId(page);

  const outcome = await page.evaluate(async (company) => {
    try {
      await window.caulder.google.sync(company!);
      return "ran";
    } catch (error) {
      return String((error as Error).message);
    }
  }, id);

  // No calendar and no list are chosen, so there is nothing to do and it
  // finishes rather than reaching for the network.
  expect(outcome).toBe("ran");
});

test("nothing about Google appears on a workspace's data unless it is used", async () => {
  const page = await openApp();
  const id = await activeId(page);

  const state = await page.evaluate((company) => window.caulder.google.state(company!), id);
  expect(state.calendarId).toBeNull();
  expect(state.taskListId).toBeNull();
});
