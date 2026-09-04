import Database from "better-sqlite3";
import { app } from "electron";
import { join } from "node:path";
import { mkdirSync } from "node:fs";

export type Db = Database.Database;

let db: Db | null = null;

/** Where the user's only copy of their data lives. */
export function databasePath(): string {
  return join(app.getPath("userData"), "caulder.db");
}

export function backupsDir(): string {
  return join(app.getPath("userData"), "backups");
}

/**
 * Opens the database, creating it if this is the first launch.
 *
 * WAL is on because a crash mid-write must not take the file with it. Foreign
 * keys are on because SQLite disables them by default per-connection, and the
 * whole point of company_id cascades is that deleting a company takes its
 * world with it rather than leaving orphans.
 */
export function openDatabase(): Db {
  if (db) return db;

  mkdirSync(app.getPath("userData"), { recursive: true });

  const connection = new Database(databasePath());
  connection.pragma("journal_mode = WAL");
  connection.pragma("foreign_keys = ON");
  // Durable enough for a desktop app, and much faster than FULL on spinning
  // disks. WAL plus NORMAL loses at most the last transaction on a power cut,
  // never the file.
  connection.pragma("synchronous = NORMAL");

  db = connection;
  return db;
}

/** The open handle. Throws rather than silently opening a second connection. */
export function getDatabase(): Db {
  if (!db) throw new Error("Database is not open. Call openDatabase() first.");
  return db;
}

export function closeDatabase(): void {
  db?.close();
  db = null;
}

/**
 * Folds the write-ahead log back into the main file.
 *
 * WAL means recent commits live in `caulder.db-wal`, not in `caulder.db`. A
 * plain file copy of an open database therefore misses them — which for a
 * backup is the one failure it exists to prevent. Checkpointing first makes
 * the main file complete on its own.
 *
 * A no-op when nothing is open, which is the case during the launch backup.
 */
export function checkpoint(): void {
  db?.pragma("wal_checkpoint(TRUNCATE)");
}
