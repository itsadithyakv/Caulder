import { app, BrowserWindow } from "electron";
import electronUpdater from "electron-updater";
import type { UpdateState } from "@shared/data";
import { logProblem } from "./log";

/**
 * Updates (after 0.3): the installed app looks for a newer release on GitHub
 * a little after it starts and every few hours, downloads it quietly, and
 * puts it in when Caulder is next quit - or at once, from Settings. Nothing
 * is looked for in development or under the tests, and nothing is installed
 * without the app being closed first.
 *
 * Releases are what `npm run release` publishes: the installer, its
 * blockmap and latest.yml, on the repository's Releases page.
 */

const { autoUpdater } = electronUpdater;

const FIRST_LOOK_MS = 30 * 1000;
const EVERY_MS = 6 * 60 * 60 * 1000;

let state: UpdateState = { status: "off", current: app.getVersion(), version: null, percent: null, error: null };

function set(next: Partial<UpdateState>): void {
  state = { ...state, ...next };
  for (const window of BrowserWindow.getAllWindows()) window.webContents.send("updates:changed", state);
}

export function updateState(): UpdateState {
  return state;
}

/** The installed app, not a copy run from the project or by the tests. */
function eligible(): boolean {
  return app.isPackaged && process.env["CAULDER_BACKGROUND"] !== "1";
}

export function startUpdates(): void {
  if (!eligible()) return;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = null;
  autoUpdater.on("checking-for-update", () => set({ status: "checking", error: null }));
  autoUpdater.on("update-available", (info) => set({ status: "downloading", version: info.version, percent: 0 }));
  autoUpdater.on("update-not-available", () => set({ status: "current", version: null, percent: null }));
  autoUpdater.on("download-progress", (progress) => set({ status: "downloading", percent: Math.round(progress.percent) }));
  autoUpdater.on("update-downloaded", (info) => set({ status: "ready", version: info.version, percent: 100 }));
  autoUpdater.on("error", (error) => {
    logProblem("updates", error);
    set({ status: "failed", error: "Caulder could not reach its releases just now. It will try again later." });
  });
  set({ status: "idle" });
  setTimeout(() => void checkForUpdates(), FIRST_LOOK_MS);
  setInterval(() => void checkForUpdates(), EVERY_MS);
}

export async function checkForUpdates(): Promise<UpdateState> {
  if (!eligible()) return state;
  if (state.status === "downloading" || state.status === "ready") return state;
  try {
    await autoUpdater.checkForUpdates();
  } catch (error) {
    logProblem("updates", error);
    set({ status: "failed", error: "Caulder could not reach its releases just now. It will try again later." });
  }
  return state;
}

/** Quits and installs the update that has downloaded. */
export function installUpdate(): void {
  if (state.status !== "ready") throw new Error("There is no update ready to put in yet.");
  autoUpdater.quitAndInstall();
}
