import { BrowserWindow, powerMonitor } from "electron";
import { getDatabase } from "./db/connection";
import { lockNow, lockState } from "./services/journal-lock";
import { logProblem } from "./log";

/**
 * The journal locks when you leave, not only after a quarter of an hour of
 * nobody using it: locking the computer (Windows+L), closing the lid or the
 * machine going to sleep. Whoever sits down next finds it locked, and every
 * window is told, so none is left showing a day that was open.
 */
export function lockOnLeave(): void {
  const lock = () => {
    try {
      const db = getDatabase();
      if (!lockState(db).open) return;
      const state = lockNow(db);
      for (const window of BrowserWindow.getAllWindows()) window.webContents.send("journal:locked", state);
    } catch (error) {
      logProblem("Could not lock the journal on leaving", error);
    }
  };
  powerMonitor.on("lock-screen", lock);
  powerMonitor.on("suspend", lock);
}
