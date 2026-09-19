import { app, nativeTheme } from "electron";
import { execFile } from "node:child_process";
import { join } from "node:path";

/**
 * Who Caulder is, to Windows.
 *
 * A notification is labelled with the app's AppUserModelID, not its window
 * title. Left unset, that is Electron's default - so a reminder about a
 * lecture arrived signed "electron.app.Electron", with no mark at all.
 *
 * Two halves. The ID itself is the installer's appId, so the Start menu
 * shortcut electron-builder makes carries the same one and the installed app
 * is named and badged from it. And the name and mark are also registered
 * against the ID for this user, because an app run without that shortcut -
 * from the project, or from a portable copy - has nothing else for Windows to
 * read them from, and would show the bare ID string instead.
 */

/** The same appId electron-builder.yml gives the installer and its shortcut. */
const APP_ID = "app.paperkite.caulder";

/**
 * One of the images in resources/tray: beside the executable in a packaged
 * build, because a path inside the asar does not load, and straight from the
 * project in development.
 */
function brandFile(name: string): string {
  return app.isPackaged
    ? join(process.resourcesPath, "tray", name)
    : join(app.getAppPath(), "resources", "tray", name);
}

/**
 * The mark for Windows' own surfaces - the tray, a notification - which follow
 * Windows' colours rather than the app's. It is on transparency, so on a dark
 * taskbar the near-black cauldron would all but vanish: there it is the copy
 * with the ink lifted. scripts/logo.py makes both.
 */
export function markFile(kind: "tray" | "notify"): string {
  return brandFile(nativeTheme.shouldUseDarkColorsForSystemIntegratedUI ? `${kind}-light.png` : `${kind}.png`);
}

/** Before any notification can be shown. Harmless to call before ready. */
export function claimIdentity(): void {
  if (process.platform === "win32") app.setAppUserModelId(APP_ID);
}

/**
 * Registers the display name and mark for the ID, for this user only.
 *
 * `HKCU\Software\Classes\AppUserModelId\<id>` is where Windows looks for an
 * app's name and icon when no shortcut supplies them. Written on every launch
 * rather than once, so a moved install or a regenerated icon is picked up;
 * the write is a few milliseconds, off the main thread, and a failure only
 * costs the label.
 */
export function registerIdentity(): void {
  if (process.platform !== "win32") return;
  const key = `HKCU\\Software\\Classes\\AppUserModelId\\${APP_ID}`;
  const put = (name: string, value: string) =>
    execFile("reg", ["add", key, "/v", name, "/t", "REG_SZ", "/d", value, "/f"], { windowsHide: true }, () => undefined);
  put("DisplayName", "Caulder");
  put("IconUri", markFile("notify"));
}
