import { safeStorage } from "electron";
import { getDatabase } from "../db/connection";
import { getSetting, setSetting } from "../repositories/settings";

/**
 * Where the Google connection is kept.
 *
 * The web-app URL and its secret together are a **bearer capability**: anybody
 * holding both can read and write that calendar and task list, without a
 * password and without a second factor. So they are encrypted at rest by the
 * operating system rather than sitting in the settings table as text.
 *
 * Two consequences worth stating.
 *
 * The renderer never receives either value. It sends them once when they are
 * pasted in, and afterwards can only ask whether a connection exists — the
 * same rule as `attachments.open`, where the renderer passes an id and main
 * derives the path. There is no channel that hands the URL back.
 *
 * And if the OS cannot encrypt, this **refuses to store** rather than quietly
 * falling back to plain text. A user who was told their key is kept safely,
 * and whose key is in fact readable in a file, has been lied to; being unable
 * to use the feature is the lesser failure.
 */

type Connection = { url: string; secret: string };

export function encryptionAvailable(): boolean {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

export function saveConnection(connection: Connection): void {
  if (!encryptionAvailable()) {
    throw new Error(
      "Windows will not encrypt stored secrets on this machine, so Caulder will not keep your script key. Nothing has been saved.",
    );
  }

  const blob = safeStorage.encryptString(JSON.stringify(connection));
  setSetting(getDatabase(), "googleConnection", blob.toString("base64"));
}

export function readConnection(): Connection | null {
  const stored = getSetting(getDatabase(), "googleConnection");
  if (!stored) return null;
  if (!encryptionAvailable()) return null;

  try {
    const text = safeStorage.decryptString(Buffer.from(stored, "base64"));
    const parsed: unknown = JSON.parse(text);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof (parsed as Connection).url === "string" &&
      typeof (parsed as Connection).secret === "string"
    ) {
      return parsed as Connection;
    }
    return null;
  } catch {
    // Written by a different user account, or the OS keys were reset. Not an
    // error to throw at somebody opening Settings - it means "not connected",
    // and reconnecting is the fix.
    return null;
  }
}

export function forgetConnection(): void {
  setSetting(getDatabase(), "googleConnection", "");
}

export function isConnected(): boolean {
  return readConnection() !== null;
}
