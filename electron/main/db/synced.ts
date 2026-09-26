import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { SyncedFolder } from "@shared/data";

/**
 * Folders another service already keeps in step (phase 24): OneDrive,
 * Dropbox, Google Drive. Pointing Caulder's backups at one is a copy off this
 * computer with no account of Caulder's and no API - the service does the
 * travelling. The first run offers them by name.
 *
 * The window names one (`onedrive`); the path is only ever worked out here.
 */

type Synced = SyncedFolder;

/** Where the copies go inside the service's folder. */
const SUBFOLDER = "Caulder backups";

/** Google Drive for desktop puts "My Drive" on a drive letter of its own, G: unless that was taken. */
const DRIVE_LETTERS = "GHIJKLMNOPQRSTUVWXYZ";

type Look = {
  env: Record<string, string | undefined>;
  exists: (path: string) => boolean;
  read: (path: string) => string | null;
};

const machine: Look = {
  env: process.env,
  exists: existsSync,
  read: (path) => {
    try {
      return readFileSync(path, "utf8");
    } catch {
      return null;
    }
  },
};

/** The synced folders on this computer, each with the folder Caulder's copies would go in. */
export function syncedFolders(look: Look = machine): Synced[] {
  const found: Synced[] = [];
  const { env, exists, read } = look;

  // OneDrive sets its own path in the environment, personal or work.
  const onedrive = [env["OneDrive"], env["OneDriveConsumer"], env["OneDriveCommercial"]].find(
    (path): path is string => typeof path === "string" && path.length > 0 && exists(path),
  );
  if (onedrive) found.push({ id: "onedrive", name: "OneDrive", folder: join(onedrive, SUBFOLDER) });

  // Dropbox writes where it is into info.json; the folder in your home is where it usually is.
  let dropbox: string | null = null;
  const info = env["LOCALAPPDATA"] ? read(join(env["LOCALAPPDATA"], "Dropbox", "info.json")) : null;
  if (info) {
    try {
      const parsed = JSON.parse(info) as Record<string, { path?: unknown }>;
      const path = parsed["personal"]?.path ?? parsed["business"]?.path;
      if (typeof path === "string" && exists(path)) dropbox = path;
    } catch {
      // An unreadable info.json says nothing; the usual place is tried next.
    }
  }
  if (!dropbox && env["USERPROFILE"] && exists(join(env["USERPROFILE"], "Dropbox"))) dropbox = join(env["USERPROFILE"], "Dropbox");
  if (dropbox) found.push({ id: "dropbox", name: "Dropbox", folder: join(dropbox, SUBFOLDER) });

  const drive = [...DRIVE_LETTERS].map((letter) => `${letter}:\\My Drive`).find((path) => exists(path));
  if (drive) found.push({ id: "gdrive", name: "Google Drive", folder: join(drive, SUBFOLDER) });

  return found;
}
