import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { join } from "node:path";
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

  return {
    name,
    path: target,
    size: stats.size,
    takenAt: new Date(stats.mtimeMs).toISOString(),
  };
}

/**
 * Puts a backup back.
 *
 * The dangerous one, so it is deliberately careful:
 *
 *  - the current database is copied aside **first**, so restoring the wrong
 *    file is itself undoable;
 *  - the connection is closed before the file is overwritten, because SQLite
 *    holds it open and a swap underneath a live handle corrupts both;
 *  - the WAL and shared-memory sidecars go too. Leaving a `-wal` from the old
 *    database beside a restored file is how a restore silently half-applies;
 *  - the connection is reopened before returning, because `getDatabase()`
 *    throws rather than lazily opening, so leaving it closed would break every
 *    call that follows.
 */
export function restoreBackup(
  path: string,
  close: () => void,
  reopen: () => void,
  now: Date = new Date(),
): { safetyCopy: string } {
  if (!existsSync(path)) throw new Error("That backup is no longer on disk.");

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
    if (existsSync(stale)) {
      try {
        unlinkSync(stale);
      } catch {
        // Windows can hold these briefly. The copy below still wins.
      }
    }
  }

  copyFileSync(path, source);
  reopen();

  return { safetyCopy };
}
