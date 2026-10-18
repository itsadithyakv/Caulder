import { app, shell } from "electron";
import type { Db } from "./db/connection";
import { getSetting, setSetting } from "./repositories/settings";

/**
 * Caulder opening when Windows starts.
 *
 * The installer's copy registers itself with Windows (the login item, with
 * `--at-login`, so it can open into the tray rather than over whatever is on
 * screen). A Store copy cannot write that: its package declares a startup
 * task instead (resources/appx-startup.xml), and Windows' own Startup apps
 * page is the only switch for it.
 *
 * **On from the first launch of an installed copy**, once - the owner's
 * decision (15 October 2026). Turned off in Settings it stays off.
 */

const AT_LOGIN = "--at-login";

/** Test runs and the smoke check launch the packaged app; none of them may register it. */
const background = () => process.env["CAULDER_BACKGROUND"] === "1";

/** Started by Windows at sign-in, rather than by somebody opening it. */
export function openedAtLogin(): boolean {
  return process.argv.includes(AT_LOGIN);
}

type StartupState = { on: boolean; store: boolean };

export function startupState(): StartupState {
  if (process.windowsStore) return { on: true, store: true };
  return { on: app.isPackaged && app.getLoginItemSettings({ args: [AT_LOGIN] }).openAtLogin, store: false };
}

export function setStartup(on: boolean): StartupState {
  if (!process.windowsStore && app.isPackaged && !background()) {
    app.setLoginItemSettings({ openAtLogin: on, args: [AT_LOGIN] });
  }
  return startupState();
}

/** The first launch of an installed copy turns it on; never again after that. */
export function startupFirstTime(db: Db): void {
  if (process.windowsStore || !app.isPackaged || background()) return;
  if (getSetting(db, "startupSet")) return;
  setSetting(db, "startupSet", "1");
  setStartup(true);
}

/** Windows' Startup apps page, where a Store copy is switched. */
export function openStartupApps(): Promise<void> {
  return shell.openExternal("ms-settings:startupapps");
}
