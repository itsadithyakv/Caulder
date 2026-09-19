import Database from "better-sqlite3";
import {
  closeSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  readSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { LATEST_VERSION } from "./migrations";
import { backupsDir, checkpoint, databasePath } from "./connection";
import type { BackupFile } from "@shared/data";

/**
 * This is the user's only copy of their business data, on one machine, with no
 * cloud behind it. So: a copy on every launch before any migration touches the
 * file, and a bounded number kept.
 */

const KEEP = 10;
const PREFIX = "caulder-";
const SUFFIX = ".db";

function stamp(now: Date): string {
  // Sortable, filename-safe, local time so the user recognises it.
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  );
}

type BackupResult =
  | { kind: "skipped"; reason: string }
  | { kind: "created"; path: string; pruned: number };

/**
 * Copies the database aside, then prunes the oldest beyond KEEP.
 *
 * Never throws: a failed backup must not stop the app opening, because the
 * user losing access to their leads is worse than one missing copy. The caller
 * logs whatever comes back.
 */
export function backupOnLaunch(now: Date = new Date()): BackupResult {
  const source = databasePath();

  // First launch: nothing to copy yet.
  if (!existsSync(source)) return { kind: "skipped", reason: "no database yet" };

  try {
    const dir = backupsDir();
    mkdirSync(dir, { recursive: true });

    const target = join(dir, `${PREFIX}${stamp(now)}${SUFFIX}`);
    copyFileSync(source, target);
    mirror(target);

    return { kind: "created", path: target, pruned: prune(dir) };
  } catch (error) {
    return {
      kind: "skipped",
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Deletes the oldest backups beyond KEEP. Returns how many went. */
function prune(dir: string): number {
  const files = readdirSync(dir)
    .filter((name) => name.startsWith(PREFIX) && name.endsWith(SUFFIX))
    .map((name) => {
      const path = join(dir, name);
      return { path, mtime: statSync(path).mtimeMs };
    })
    // Newest first, so everything past KEEP is the tail. The name is the
    // tie-break: it encodes the timestamp, and two copies taken in the same
    // second would otherwise be pruned in whatever order the filesystem
    // happened to list them.
    .sort((a, b) => b.mtime - a.mtime || b.path.localeCompare(a.path));

  let pruned = 0;
  for (const file of files.slice(KEEP)) {
    try {
      unlinkSync(file.path);
      pruned += 1;
    } catch {
      // A locked file is not worth failing the launch over.
    }
  }
  return pruned;
}

/* ---- What the settings screen needs ------------------------------------- */

/** Newest first, which is the order somebody restoring wants to read. */
export function listBackups(): BackupFile[] {
  const dir = backupsDir();
  if (!existsSync(dir)) return [];

  return readdirSync(dir)
    .filter((name) => name.startsWith(PREFIX) && name.endsWith(SUFFIX))
    .map((name) => {
      const path = join(dir, name);
      const stats = statSync(path);
      return {
        name,
        path,
        size: stats.size,
        takenAt: new Date(stats.mtimeMs).toISOString(),
      };
    })
    .sort((a, b) => b.takenAt.localeCompare(a.takenAt));
}

/**
 * Takes a copy now, on demand.
 *
 * Unlike the launch backup this one is allowed to fail loudly: the user asked
 * for it and pressed a button, so silence would be worse than an error.
 */
export function backupNow(now: Date = new Date()): BackupFile {
  const source = databasePath();
  if (!existsSync(source)) throw new Error("There is no database to copy yet.");

  // The connection is open when this runs, so the newest commits are still in
  // the write-ahead log. Copying without this produces a backup missing
  // exactly the work the user most wants kept.
  checkpoint();

  const dir = backupsDir();
  mkdirSync(dir, { recursive: true });

  const name = `${PREFIX}${stamp(now)}${SUFFIX}`;
  const target = join(dir, name);
  copyFileSync(source, target);

  // Read before pruning. Copies taken in the same second share an mtime, and
  // reporting the size of a file that has just been deleted is worse than
  // useless.
  const stats = statSync(target);
  prune(dir);
  const mirrored = mirror(target);

  return {
    name,
    path: target,
    size: stats.size,
    takenAt: new Date(stats.mtimeMs).toISOString(),
    ...(mirrored ? { mirrored } : {}),
  };
}

/* ---- Another copy, somewhere else ------------------------------------------
 * A backup on this computer does not survive this computer. So every backup
 * can also be copied to a folder the person chooses - one that OneDrive,
 * Google Drive or Dropbox keeps somewhere else - with the same ten kept
 * there. Where it is lives in a small file beside the database, because the
 * launch backup runs before the database is opened.
 * ------------------------------------------------------------------------ */

function mirrorFile(): string {
  return join(dirname(databasePath()), "backup-folder.json");
}

/** The folder every backup is also copied to, or null. */
export function mirrorFolder(): string | null {
  try {
    const parsed = JSON.parse(readFileSync(mirrorFile(), "utf8")) as { folder?: unknown };
    return typeof parsed.folder === "string" && parsed.folder.length > 0 ? parsed.folder : null;
  } catch {
    return null;
  }
}

export function setMirrorFolder(folder: string | null): void {
  writeFileSync(mirrorFile(), JSON.stringify({ folder }), "utf8");
}

/**
 * Copies a backup to the chosen folder too, and keeps the ten newest there.
 * Never throws - a folder on a drive that is not plugged in must not stop a
 * backup or a launch - and says where it went, or why not.
 */
function mirror(path: string): { folder: string; error: string | null } | null {
  const folder = mirrorFolder();
  if (!folder) return null;
  try {
    mkdirSync(folder, { recursive: true });
    copyFileSync(path, join(folder, basename(path)));
    prune(folder);
    return { folder, error: null };
  } catch (error) {
    return { folder, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * The path of one of Caulder's own backups, from its file name.
 *
 * The name is all the window sends. Anything that is not a bare file name in
 * the backups folder's own pattern is refused, so no path the window could be
 * talked into sending - the live database, a file elsewhere on the disk - can
 * be copied over the user's data.
 */
function backupPath(name: string): string {
  const file = basename(name);
  if (file !== name || !file.startsWith(PREFIX) || !file.endsWith(SUFFIX)) {
    throw new Error("That is not one of Caulder's backups, so nothing was restored.");
  }
  const path = join(backupsDir(), file);
  if (!existsSync(path)) throw new Error("That backup is no longer on disk.");
  return path;
}

const SQLITE_HEADER = "SQLite format 3\u0000";

/**
 * Whether a file is safe to put in the live database's place.
 *
 * Three questions, asked of a scratch copy so the backup itself is never
 * opened for writing: is it an SQLite file at all, does SQLite find it intact,
 * and was it made by a version of Caulder this one can read. A backup that
 * fails any of them is refused before anything has been touched.
 */
function checkRestorable(path: string, now: Date): void {
  const head = Buffer.alloc(16);
  const handle = openSync(path, "r");
  try {
    readSync(handle, head, 0, 16, 0);
  } finally {
    closeSync(handle);
  }
  if (head.toString("latin1") !== SQLITE_HEADER) {
    throw new Error("That file is not a Caulder database, so nothing was restored.");
  }

  const probe = join(tmpdir(), `caulder-restore-check-${stamp(now)}-${process.pid}.db`);
  copyFileSync(path, probe);
  const copy = new Database(probe);
  try {
    const check = copy.pragma("integrity_check", { simple: true });
    if (check !== "ok") {
      throw new Error(`That backup is damaged (${String(check)}), so nothing was restored.`);
    }
    const version = Number(copy.pragma("user_version", { simple: true }));
    if (version > LATEST_VERSION) {
      throw new Error(
        "That backup was made by a newer version of Caulder, so this one cannot open it.",
      );
    }
  } finally {
    copy.close();
    for (const leftover of [probe, `${probe}-wal`, `${probe}-shm`]) {
      if (existsSync(leftover)) unlinkSync(leftover);
    }
  }
}

/**
 * Puts a backup back.
 *
 * The dangerous one, so it is deliberately careful:
 *
 *  - it takes a backup's file name, never a path, and checks the file is an
 *    intact Caulder database this version can read before touching anything;
 *  - the current database is copied aside **first**, so restoring the wrong
 *    file is itself undoable;
 *  - the connection is closed before the file is overwritten, because SQLite
 *    holds it open and a swap underneath a live handle corrupts both;
 *  - the WAL and shared-memory sidecars go too. Leaving a `-wal` from the old
 *    database beside a restored file is how a restore silently half-applies,
 *    so if Windows will not let one go, the restore stops there and the old
 *    database is reopened untouched;
 *  - the connection is reopened before returning, because `getDatabase()`
 *    throws rather than lazily opening, so leaving it closed would break every
 *    call that follows.
 */
export function restoreBackup(
  name: string,
  close: () => void,
  reopen: () => void,
  now: Date = new Date(),
): { safetyCopy: string } {
  const path = backupPath(name);
  checkRestorable(path, now);

  const source = databasePath();
  const dir = backupsDir();
  mkdirSync(dir, { recursive: true });

  // Before anything is overwritten.
  const safetyCopy = join(dir, `${PREFIX}before-restore-${stamp(now)}${SUFFIX}`);
  if (existsSync(source)) {
    checkpoint();
    copyFileSync(source, safetyCopy);
  }

  close();

  for (const sidecar of ["-wal", "-shm"]) {
    const stale = `${source}${sidecar}`;
    if (!existsSync(stale)) continue;
    try {
      unlinkSync(stale);
    } catch {
      // Windows can hold these briefly. Copying over the database with the
      // old log still beside it would half-apply the restore, so stop here
      // with nothing changed.
      reopen();
      throw new Error(
        "Windows is still holding part of the database, so nothing was restored. Wait a moment and try again.",
      );
    }
  }

  copyFileSync(path, source);
  reopen();

  return { safetyCopy };
}
