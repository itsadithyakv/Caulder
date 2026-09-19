import { app } from "electron";
import Database from "better-sqlite3";
import { copyFileSync, cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { logProblem } from "./log";

/**
 * Where Caulder keeps its data when it came from the Microsoft Store.
 *
 * Windows gives a Store app a private view of AppData: what it writes there
 * lands in a folder of the package's own, and only the app sees it where it
 * thinks it is. Explorer, opened from Settings on the backups or the log,
 * looks at the real folder and finds it empty - and the path Settings shows
 * is not where the file is. So a Store copy keeps everything in its package's
 * LocalState folder instead, which is real for everybody:
 *
 *   %LOCALAPPDATA%\Packages\<package family name>\LocalState
 *
 * Windows removes that folder when the app is uninstalled, as it does for
 * every Store app; Settings says so, beside the backup folder that is the
 * way around it.
 *
 * The first time a Store copy starts on a computer that already had the
 * desktop Caulder, the desktop copy's data is brought across once - its
 * database read whole through SQLite (so a copy that is open, or mid-write,
 * comes across as it stands), its attached files, and the backup folder it
 * was told to use. The desktop copy's own files are left exactly as they
 * were.
 */

/**
 * The package family name, from the folder Windows installed the package in:
 * `...\WindowsApps\<Name>_<Version>_<Arch>_<ResourceId>_<PublisherId>\...`,
 * the family being `<Name>_<PublisherId>`. Null for anything else.
 */
export function packageFamilyOf(execPath: string): string | null {
  const segments = execPath.split(/[\\/]/);
  const at = segments.findIndex((segment) => segment.toLowerCase() === "windowsapps");
  const folder = at >= 0 ? segments[at + 1] : undefined;
  const match = folder ? /^([^_]+)_[^_]+_[^_]*_[^_]*_([a-z0-9]{13})$/i.exec(folder) : null;
  return match ? `${match[1]}_${match[2]}` : null;
}

/** The Store copy's own data folder, or null when this is not one. */
export function storeHome(execPath: string, localAppData: string | undefined): string | null {
  const family = packageFamilyOf(execPath);
  return family && localAppData ? join(localAppData, "Packages", family, "LocalState") : null;
}

let fromStore = false;

/** Whether this copy came from the Microsoft Store, and keeps its data where Windows removes it on uninstall. */
export function isStoreCopy(): boolean {
  return fromStore;
}

/**
 * Before anything reads or writes the data folder - the single-instance lock
 * included - a Store copy moves it to LocalState and brings the desktop
 * copy's data across if it has none of its own yet.
 */
export function useStoreHome(): void {
  if (process.windowsStore !== true) return;
  const home = storeHome(process.execPath, process.env["LOCALAPPDATA"]);
  if (!home) return;
  fromStore = true;
  const desktop = app.getPath("userData");
  mkdirSync(home, { recursive: true });
  app.setPath("userData", home);
  bringAcross(desktop, home);
}

/** The desktop copy's data, into a Store copy that has none yet. Never throws: a fresh start is the worst case. */
export function bringAcross(from: string, to: string): boolean {
  const source = join(from, "caulder.db");
  const target = join(to, "caulder.db");
  if (existsSync(target) || !existsSync(source)) return false;
  try {
    const db = new Database(source, { readonly: true, fileMustExist: true });
    try {
      writeFileSync(target, db.serialize());
    } finally {
      db.close();
    }
    if (existsSync(join(from, "attachments"))) cpSync(join(from, "attachments"), join(to, "attachments"), { recursive: true });
    if (existsSync(join(from, "backup-folder.json"))) copyFileSync(join(from, "backup-folder.json"), join(to, "backup-folder.json"));
    logProblem("store", `Brought the desktop copy's data across from ${from}`);
    return true;
  } catch (error) {
    logProblem("store", error);
    return false;
  }
}
