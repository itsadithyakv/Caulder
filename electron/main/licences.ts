import { app, shell } from "electron";
import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * The licences of everything Caulder ships (part six, phase 23).
 *
 * `scripts/notices.mjs` writes them after every build, into `out/notices`,
 * and the package carries that folder beside the executable as `notices`.
 * The path is worked out here, never taken from the window.
 */
const FILE = "third-party-notices.txt";

function noticesFile(): string {
  return app.isPackaged ? join(process.resourcesPath, "notices", FILE) : join(app.getAppPath(), "out", "notices", FILE);
}

/** Opens the list in whatever opens a text file here. */
export async function openLicences(): Promise<void> {
  const file = noticesFile();
  if (!existsSync(file)) throw new Error("The list of licences is written when Caulder is built, and this copy has none.");
  const failed = await shell.openPath(file);
  if (failed) throw new Error(`Windows could not open the list of licences: ${failed}`);
}
