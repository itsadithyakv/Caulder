import { test, expect, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type * as ChildProcess from "node:child_process";

/**
 * The tray icon, and what closing the window now means, in a real app.
 *
 * Where the quick window goes and what the menu says are worked out by hand
 * in electron/main/popup.test.ts. What needs the real thing is the rest: that
 * the icon opens the quick window ready for a task, that a task typed there
 * lands, and that closing the main window leaves Caulder running - with
 * opening it again bringing the window back.
 */

test.describe.configure({ mode: "serial" });

let userDataDir: string;
let app: ElectronApplication | null = null;

type TrayHandle = { emit: (event: string) => boolean };

function tomorrow(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function openApp(): Promise<{ app: ElectronApplication; page: Page }> {
  const launched = await electron.launch({
    args: [".", `--user-data-dir=${userDataDir}`],
    env: { ...process.env, ELECTRON_ENABLE_LOGGING: "0" },
  });
  app = launched;
  const page = await launched.firstWindow();
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
  return { app: launched, page };
}

/**
 * The notification area has no pointer a test can move, so the icon is told
 * it was clicked. The hook exists only when this suite launched the app.
 */
async function clickTray(electronApp: ElectronApplication): Promise<void> {
  await electronApp.evaluate(() => {
    (globalThis as { __caulderTray?: TrayHandle }).__caulderTray?.emit("click");
  });
}

/** Where the quick window is, and whether it is showing. */
function quickState(electronApp: ElectronApplication) {
  return electronApp.evaluate(({ BrowserWindow, screen }) => {
    const win = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().includes("#capture"));
    if (!win) return null;
    const b = win.getBounds();
    const area = screen.getDisplayMatching(b).workArea;
    return {
      visible: win.isVisible(),
      onScreen:
        b.x >= area.x && b.y >= area.y && b.x + b.width <= area.x + area.width && b.y + b.height <= area.y + area.height,
    };
  });
}

/** Whether the main window - not the quick one, not the widget - is showing. */
function mainShowing(electronApp: ElectronApplication) {
  return electronApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().some((w) => w.isVisible() && !w.webContents.getURL().includes("#")),
  );
}

test.beforeAll(() => {
  userDataDir = mkdtempSync(join(tmpdir(), "caulder-tray-"));
});

test.afterAll(() => {
  rmSync(userDataDir, { recursive: true, force: true });
});

test.afterEach(async () => {
  await app?.close();
  app = null;
});

test("the tray icon opens the quick window on a task, and the task goes in", async () => {
  const { app: running, page } = await openApp();

  const opened = running.waitForEvent("window");
  await clickTray(running);
  const quick = await opened;
  await quick.waitForSelector(".capture");

  // Beside the icon, on the screen, and ready for a task rather than a note.
  await expect.poll(() => quickState(running)).toEqual({ visible: true, onScreen: true });
  await expect(quick.getByRole("radio", { name: "Task" })).toHaveAttribute("aria-checked", "true");

  const line = quick.getByLabel("Add a task in one line");
  await line.fill("water the plants tomorrow");
  await line.press("Enter");

  // It says so, then gets out of the way of whatever you were doing.
  await expect(quick.locator(".quickadd__added")).toContainText("Water the plants");
  await expect.poll(async () => (await quickState(running))?.visible).toBe(false);

  const saved = await page.evaluate(async (day) => {
    const { activeCompanyId } = await window.caulder.companies.list();
    const plan = await window.caulder.day.get(activeCompanyId ?? "", day);
    return plan.tasks.some((task) => task.title === "Water the plants");
  }, tomorrow());
  expect(saved).toBe(true);
});

test("a second click on the icon shuts the window it opened", async () => {
  const { app: running } = await openApp();
  const opened = running.waitForEvent("window");
  await clickTray(running);
  await (await opened).waitForSelector(".capture");
  await expect.poll(async () => (await quickState(running))?.visible).toBe(true);

  await clickTray(running);
  await expect.poll(async () => (await quickState(running))?.visible).toBe(false);
});

test("Ctrl+N and Ctrl+T move between a note and a task", async () => {
  const { app: running } = await openApp();
  const opened = running.waitForEvent("window");
  await clickTray(running);
  const quick = await opened;
  await quick.waitForSelector(".capture");

  await quick.keyboard.press("Control+n");
  await expect(quick.getByRole("radio", { name: "Note" })).toHaveAttribute("aria-checked", "true");
  await quick.keyboard.press("Control+t");
  await expect(quick.getByRole("radio", { name: "Task" })).toHaveAttribute("aria-checked", "true");
});

test("closing the window leaves Caulder in the tray, and opening it again brings it back", async () => {
  const { app: running, page } = await openApp();
  await expect.poll(() => mainShowing(running)).toBe(true);

  // The title bar's X.
  await page.evaluate(() => window.caulder.window.close());
  await expect.poll(() => mainShowing(running)).toBe(false);
  // Still running: the tray, the key and the reminders all need it to be.
  expect(await running.evaluate(({ app: electronApp }) => electronApp.isReady())).toBe(true);

  // Opening Caulder again - from the Start menu, say - is a second launch,
  // which hands over to this one and leaves. Started from inside the app and
  // waited on there, so the test's own worker never has to manage a child
  // process of its own.
  const secondExit = await running.evaluate(
    ({ app: electronApp }) =>
      new Promise<number | string>((resolve) => {
        const { spawn } = process.getBuiltinModule("node:child_process") as typeof ChildProcess;
        const second = spawn(
          process.execPath,
          [electronApp.getAppPath(), `--user-data-dir=${electronApp.getPath("userData")}`],
          { stdio: "ignore", windowsHide: true },
        );
        const timer = setTimeout(() => resolve("still running"), 15_000);
        second.once("exit", (code) => {
          clearTimeout(timer);
          resolve(code ?? "no exit code");
        });
      }),
  );

  // The second copy really does leave. It used to quit before it was ready,
  // run a shutdown handler that threw, and sit behind an error dialog - one
  // stray process for every time Caulder was opened while it was running.
  expect(secondExit).toBe(0);
  await expect.poll(() => mainShowing(running), { timeout: 20_000 }).toBe(true);
});

test("with the tray switched off, closing the window quits - even with the quick window about", async () => {
  const { app: running, page } = await openApp();
  await page.evaluate(() => window.caulder.capture.setKeepInTray(false));

  // The quick window, once opened, stays in existence hidden. It used to be
  // enough to keep the app alive with nothing on screen.
  const opened = running.waitForEvent("window");
  await clickTray(running);
  await (await opened).waitForSelector(".capture");
  await clickTray(running);

  const closed = running.waitForEvent("close");
  await page.evaluate(() => window.caulder.window.close());
  await closed;
  app = null;
});
