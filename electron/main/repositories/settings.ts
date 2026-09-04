import type { Db } from "../db/connection";
import type { SettingKey } from "@shared/domain";

/**
 * The app-wide key-value store. Keys are constrained by SettingKey, so a typo
 * in a caller is a type error rather than a row nothing ever reads again.
 */

export function getSetting(db: Db, key: SettingKey): string | null {
  const row = db.prepare(`SELECT value FROM settings WHERE key = ?`).get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

export function setSetting(db: Db, key: SettingKey, value: string): void {
  db.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  ).run(key, value, new Date().toISOString());
}

/**
 * Which company the app should open in.
 *
 * Resolves rather than just reads: a stored id can point at a company that has
 * since been archived, in which case the first live company is used and the
 * setting is repaired on the spot. Returning a dangling id would strand the
 * user on an empty workspace with no obvious way back.
 */
export function resolveActiveCompanyId(db: Db, liveIds: readonly string[]): string | null {
  if (liveIds.length === 0) return null;

  const stored = getSetting(db, "activeCompanyId");
  if (stored && liveIds.includes(stored)) return stored;

  const fallback = liveIds[0] ?? null;
  if (fallback) setSetting(db, "activeCompanyId", fallback);
  return fallback;
}
