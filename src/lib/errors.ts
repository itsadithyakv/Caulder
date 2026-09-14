import { ipcMessage } from "@shared/errors";

/**
 * What to show for something that went wrong.
 *
 * The preload already takes Electron's wrapper off every failure that crosses
 * the bridge, so for those this is `error.message`. It strips again anyway -
 * `ipcMessage` changes nothing on a message that has no wrapper - so a caller
 * never has to know which path an error came by.
 */
export function messageOf(error: unknown): string {
  return error instanceof Error ? ipcMessage(error.message) : String(error);
}
