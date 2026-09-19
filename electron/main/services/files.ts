import { randomUUID } from "node:crypto";
import { copyFile, mkdir, stat } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { app } from "electron";

/**
 * Files attached to a lead.
 *
 * Copied into the app's own folder rather than linked. A link is a promise
 * that the file will still be where it was, and the first tidy-up of a
 * Downloads folder breaks every one of them at once - which is exactly when
 * somebody goes looking for the proposal they sent.
 *
 * Stored under a generated name with the original extension, and the real
 * name kept in the database. Two files called "proposal.pdf" are ordinary;
 * one overwriting the other is not.
 */

/** Beside the database, so a backup of the folder catches both. */
export function attachmentsDir(): string {
  return join(app.getPath("userData"), "attachments");
}

/** 25 MB. Large enough for any proposal, small enough not to fill a disk. */
const MAX_BYTES = 25 * 1024 * 1024;

export async function copyIntoStore(
  source: string,
): Promise<{ name: string; stored: string; bytes: number }> {
  const info = await stat(source);
  if (info.size > MAX_BYTES) {
    throw new Error(
      `That file is ${Math.round(info.size / 1024 / 1024)} MB. The limit is 25 MB.`,
    );
  }

  const directory = attachmentsDir();
  await mkdir(directory, { recursive: true });

  const stored = `${randomUUID()}${extname(source).toLowerCase()}`;
  await copyFile(source, join(directory, stored));

  return { name: basename(source), stored, bytes: info.size };
}
