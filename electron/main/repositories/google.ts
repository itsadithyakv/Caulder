import { randomUUID } from "node:crypto";
import type { Db } from "../db/connection";
import type { GoogleSync } from "@shared/domain";

/**
 * What the Google link remembers between runs: what was deleted here while
 * offline, and what the last sync did.
 */

type SyncRow = {
  company_id: string;
  last_synced_at: string | null;
  synced_from: string | null;
  synced_to: string | null;
  pushed: number;
  pulled: number;
  conflicts: number;
  last_error: string | null;
};

export function readSync(db: Db, companyId: string): GoogleSync {
  const row = db.prepare(`SELECT * FROM google_sync WHERE company_id = ?`).get(companyId) as
    | SyncRow
    | undefined;

  if (!row) {
    return {
      lastSyncedAt: null,
      syncedFrom: null,
      syncedTo: null,
      pushed: 0,
      pulled: 0,
      conflicts: 0,
      lastError: null,
    };
  }

  return {
    lastSyncedAt: row.last_synced_at,
    syncedFrom: row.synced_from,
    syncedTo: row.synced_to,
    pushed: row.pushed,
    pulled: row.pulled,
    conflicts: row.conflicts,
    lastError: row.last_error,
  };
}

export function writeSync(db: Db, companyId: string, state: GoogleSync): void {
  db.prepare(
    `INSERT INTO google_sync
       (company_id, last_synced_at, synced_from, synced_to, pushed, pulled, conflicts, last_error)
     VALUES (@companyId, @lastSyncedAt, @syncedFrom, @syncedTo, @pushed, @pulled, @conflicts, @lastError)
     ON CONFLICT (company_id) DO UPDATE SET
       last_synced_at = excluded.last_synced_at,
       synced_from    = excluded.synced_from,
       synced_to      = excluded.synced_to,
       pushed         = excluded.pushed,
       pulled         = excluded.pulled,
       conflicts      = excluded.conflicts,
       last_error     = excluded.last_error`,
  ).run({ companyId, ...state });
}

/** Records the last attempt's failure without touching what a good one left. */
export function writeSyncError(db: Db, companyId: string, message: string): void {
  const current = readSync(db, companyId);
  writeSync(db, companyId, { ...current, lastError: message });
}

/* ---- Tombstones --------------------------------------------------------- */

/**
 * A deletion made here, waiting to be told to Google.
 *
 * The row is gone, so nothing else remembers it existed. Without this the
 * event simply stays in the calendar forever, and the user is left deleting
 * the same thing twice in two places - which is exactly the chore the sync
 * was supposed to remove.
 */
export function rememberDeleted(
  db: Db,
  companyId: string,
  kind: "event" | "task",
  externalId: string,
): void {
  db.prepare(
    `INSERT INTO google_tombstones (id, company_id, kind, external_id, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(randomUUID(), companyId, kind, externalId, new Date().toISOString());
}

export function listTombstones(db: Db, companyId: string, kind: "event" | "task"): string[] {
  const rows = db
    .prepare(`SELECT external_id FROM google_tombstones WHERE company_id = ? AND kind = ?`)
    .all(companyId, kind) as { external_id: string }[];
  return rows.map((row) => row.external_id);
}

/**
 * Cleared only once Google has been told.
 *
 * Dropped before the call and the call then failing would leave the event in
 * the calendar with nothing left to say it should go.
 */
export function forgetTombstones(db: Db, companyId: string, kind: "event" | "task"): void {
  db.prepare(`DELETE FROM google_tombstones WHERE company_id = ? AND kind = ?`).run(
    companyId,
    kind,
  );
}
