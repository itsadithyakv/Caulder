import { ipcMain } from "electron";
import { readableError } from "@shared/errors";
import { isFault, logProblem } from "../log";

/**
 * What every handler file registers through. Split out of index.ts so the
 * handlers can live beside what they handle rather than in one long file.
 */

export function assertId(value: unknown, label: string): string {
  if (typeof value === "string" && value.length > 0) return value;
  throw new Error(`Missing ${label}.`);
}

/**
 * `ipcMain.handle`, with what goes back on failure made fit to read.
 *
 * Whatever a handler throws reaches the window as its `toString()`, so a
 * schema rejecting a field arrived as a page of JSON. Every handler is
 * registered through this rather than directly, so no single one can forget.
 */
export function handle(channel: string, listener: Parameters<typeof ipcMain.handle>[1]): void {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      return await listener(event, ...args);
    } catch (error) {
      // A sentence for the person goes back and nowhere else; a fault is
      // also written down, because nobody reads the console of an installed
      // app.
      if (isFault(error)) logProblem(channel, error);
      throw readableError(error);
    }
  });
}
