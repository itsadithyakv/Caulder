import { test, expect, _electron as electron, type ElectronApplication } from "@playwright/test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { passSetup } from "./nav";

/**
 * The mark, in a real window.
 *
 * Worth its own suite for one reason: the renderer runs under a strict CSP
 * from a file:// document, and an image that directive refuses is not an
 * error - it is a blank space. Reading the CSS back would pass either way,
 * so every assertion here decodes the file the browser actually fetched.
 */

test.describe.configure({ mode: "serial" });

let userDataDir: string;
let app: ElectronApplication;

/**
 * The URL a `.brandmark` is painting, and whether the browser could decode it.
 * `Image` is subject to img-src exactly as the background-image is, so a
 * width of 0 here is the CSP refusing the file.
 */
async function paintedMark(selector: string) {
  const page = await app.firstWindow();
  return page.evaluate(async (sel) => {
    const element = document.querySelector(sel);
    if (!element) throw new Error(`No element for ${sel}`);

    const url = getComputedStyle(element).backgroundImage.match(/url\("?(.+?)"?\)/)?.[1];
    if (!url) throw new Error(`No background-image on ${sel}`);

    const loaded = await new Promise<number>((resolve) => {
      const image = new Image();
      image.onload = () => resolve(image.naturalWidth);
      image.onerror = () => resolve(0);
      image.src = url;
    });

    return { url, width: loaded };
  }, selector);
}

test.beforeAll(async () => {
  userDataDir = mkdtempSync(join(tmpdir(), "caulder-brand-"));
  app = await electron.launch({
    args: [".", `--user-data-dir=${userDataDir}`],
    env: { ...process.env, ELECTRON_ENABLE_LOGGING: "0" },
  });
});

test.afterAll(async () => {
  await app.close();
  rmSync(userDataDir, { recursive: true, force: true });
});

test("the title bar mark loads rather than silently failing the CSP", async () => {
  const page = await app.firstWindow();
  await page.waitForSelector(".titlebar__mark");

  const painted = await paintedMark(".titlebar__mark");
  expect(painted.width, `blocked or missing: ${painted.url}`).toBeGreaterThan(0);
});

test("first run introduces the app with the mark", async () => {
  const page = await app.firstWindow();
  await page.waitForSelector(".firstrun");

  await expect(page.locator(".firstrun__mark")).toBeVisible();
  expect((await paintedMark(".firstrun__mark")).width).toBeGreaterThan(0);
});

test("the mark follows the theme", async () => {
  const page = await app.firstWindow();

  // The cauldron is near-black on transparency. Left as drawn it disappears
  // into the dark canvas and only the flame survives, so dark mode has to be
  // painting a different file - not the same one.
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "light"));
  const light = await paintedMark(".titlebar__mark");

  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
  const dark = await paintedMark(".titlebar__mark");

  expect(dark.url).not.toBe(light.url);
  expect(dark.width).toBeGreaterThan(0);

  await page.evaluate(() => document.documentElement.removeAttribute("data-theme"));
});

test("the window icon resolves to a file that is actually there", async () => {
  // A BrowserWindow given a path that does not exist keeps its default icon
  // and says nothing, so the only way to know is to check the path itself.
  const appPath = await app.evaluate(({ app: electronApp }) => electronApp.getAppPath());
  const icon = join(appPath, "resources", "icon.png");

  expect(existsSync(icon), `window icon missing: ${icon}`).toBe(true);
});

test("a notification is signed Caulder, with the mark, rather than Electron", async () => {
  // Windows names a notification after the app's AppUserModelID. Unset, a
  // reminder arrived as "electron.app.Electron" with no icon. The name and
  // mark are registered against Caulder's ID for this user, so they show even
  // without an installed shortcut to read them from.
  test.skip(process.platform !== "win32", "an AppUserModelID is a Windows idea");

  const appPath = await app.evaluate(({ app: electronApp }) => electronApp.getAppPath());
  const read = (name: string) =>
    new Promise<string>((resolve) => {
      execFile(
        "reg",
        ["query", "HKCU\\Software\\Classes\\AppUserModelId\\app.paperkite.caulder", "/v", name],
        { windowsHide: true },
        (_error, stdout) => resolve(/REG_SZ\s+(.+)\s*$/m.exec(stdout)?.[1]?.trim() ?? ""),
      );
    });

  await expect.poll(() => read("DisplayName")).toBe("Caulder");
  const icon = await read("IconUri");
  // The copy with the ink lifted when Windows is dark: either is the mark.
  expect([join(appPath, "resources", "tray", "notify.png"), join(appPath, "resources", "tray", "notify-light.png")]).toContain(icon);
  expect(existsSync(icon), `notification mark missing: ${icon}`).toBe(true);
});

test("adding a second company is a form, not a welcome", async () => {
  const page = await app.firstWindow();

  await page.getByLabel("Company name").fill("Unifloe");
  await page.getByRole("button", { name: "Create company" }).click();
  await passSetup(page);
  await expect(page.getByRole("button", { name: /Company: Unifloe/ })).toBeVisible();


  await page.getByRole("button", { name: /Company: Unifloe/ }).click();
  await page.getByRole("menuitem", { name: "Add a company" }).click();

  await expect(page.getByRole("heading", { name: "Add a company" })).toBeVisible();
  await expect(page.locator(".firstrun__mark")).toHaveCount(0);
});
