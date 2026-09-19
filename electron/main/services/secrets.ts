import { safeStorage } from "electron";
import { encryptionAvailable } from "./credentials";
import { lastFour } from "@shared/brain";

/**
 * Small secrets inside the database: registration numbers and bank account
 * numbers on brain pages.
 *
 * Encrypted by the operating system, the same way the Google key is, so a
 * copy of the database - a backup, an export folder handed to an accountant -
 * does not carry them readable. The last four characters are kept beside the
 * ciphertext, which is what lets a page show "•••• 4821" without decrypting
 * anything; four characters of an account number are what a bank statement
 * prints anyway.
 *
 * If the OS cannot encrypt, a secret is refused rather than stored as text,
 * for the reason credentials.ts gives.
 */

type SealedSecret = { $secret: string; last4: string };

export function isSealed(value: unknown): value is SealedSecret {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as SealedSecret).$secret === "string" &&
    typeof (value as SealedSecret).last4 === "string"
  );
}

export function sealSecret(text: string): SealedSecret {
  if (!encryptionAvailable()) {
    throw new Error(
      "Windows will not encrypt stored secrets on this machine, so Caulder will not keep registration or account numbers. Nothing has been saved.",
    );
  }
  return {
    $secret: safeStorage.encryptString(text).toString("base64"),
    last4: lastFour(text),
  };
}

/** The value, or null if it cannot be read on this machine any more. */
export function openSecret(sealed: SealedSecret): string | null {
  if (!encryptionAvailable()) return null;
  try {
    return safeStorage.decryptString(Buffer.from(sealed.$secret, "base64"));
  } catch {
    return null;
  }
}
