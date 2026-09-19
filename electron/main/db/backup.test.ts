import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Restoring a backup: the most dangerous thing the app does to the user's only
 * copy of their data.
 *
 * Run against real files in a scratch folder, because every failure worth
 * catching here is about files - a name that points somewhere else, a file
 * that is not a database, one from a newer build - and an in-memory database
 * would test none of them.
 */

let home = "";
vi.mock("electron", () => ({ app: { getPath: () => home } }));

const { backupsDir, closeDatabase, databasePath, getDatabase, openDatabase } = await import(
  "./connection"
);
const { LATEST_VERSION, migrate } = await import("./migrations");
const { backupNow, mirrorFolder, restoreBackup, setMirrorFolder } = await import("./backup");
const { createCompany } = await import("../repositories/companies");

function companies(): number {
  return (getDatabase().prepare(`SELECT COUNT(*) AS n FROM companies`).get() as { n: number }).n;
}

function addCompany(name: string) {
  createCompany(getDatabase(), { name, accent: "blue", timezone: "Asia/Kolkata" });
}

function restore(name: string) {
  return restoreBackup(name, closeDatabase, openDatabase, new Date(2026, 8, 17, 10, 0, 0));
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "caulder-backup-"));
  migrate(openDatabase());
});

afterEach(() => {
  closeDatabase();
  rmSync(home, { recursive: true, force: true });
});

describe("restoring a backup", () => {
  it("puts the copy back, and keeps the current state aside first", () => {
    const taken = backupNow(new Date(2026, 8, 17, 9, 0, 0));
    addCompany("Made after the backup");
    expect(companies()).toBe(1);

    const { safetyCopy } = restore(taken.name);

    expect(companies()).toBe(0);
    expect(existsSync(safetyCopy)).toBe(true);
  });

  it("refuses anything that is not the name of one of its backups", () => {
    addCompany("Still here");
    for (const name of ["..\\caulder.db", "../caulder.db", databasePath(), "notes.db"]) {
      expect(() => restore(name)).toThrow("not one of Caulder's backups");
    }
    expect(companies()).toBe(1);
  });

  it("refuses a file that is not a database, and changes nothing", () => {
    mkdirSync(backupsDir(), { recursive: true });
    writeFileSync(join(backupsDir(), "caulder-20260101-000000.db"), "not a database at all");
    addCompany("Still here");

    expect(() => restore("caulder-20260101-000000.db")).toThrow("not a Caulder database");
    expect(companies()).toBe(1);
  });

  it("refuses a backup a newer version of Caulder made", () => {
    const taken = backupNow(new Date(2026, 8, 17, 9, 0, 0));
    const newer = new Database(taken.path);
    newer.pragma(`user_version = ${LATEST_VERSION + 1}`);
    newer.close();
    addCompany("Still here");

    expect(() => restore(taken.name)).toThrow("newer version of Caulder");
    expect(companies()).toBe(1);
  });
});

describe("another copy, somewhere else", () => {
  it("copies every backup to the chosen folder too, and keeps ten there", () => {
    const elsewhere = join(home, "OneDrive", "Caulder");
    setMirrorFolder(elsewhere);
    expect(mirrorFolder()).toBe(elsewhere);

    let last = backupNow(new Date(2026, 8, 17, 9, 0, 0));
    expect(last.mirrored).toEqual({ folder: elsewhere, error: null });
    expect(readdirSync(elsewhere)).toEqual([last.name]);

    for (let minute = 1; minute <= 11; minute += 1) last = backupNow(new Date(2026, 8, 17, 9, minute, 0));
    expect(readdirSync(elsewhere)).toHaveLength(10);
    expect(readdirSync(elsewhere)).toContain(last.name);
  });

  it("still takes the backup when the folder cannot be written, and says why", () => {
    const blocked = join(home, "a-file-not-a-folder");
    writeFileSync(blocked, "in the way");
    setMirrorFolder(blocked);
    const taken = backupNow(new Date(2026, 8, 17, 9, 0, 0));
    expect(existsSync(taken.path)).toBe(true);
    expect(taken.mirrored?.error).toBeTruthy();
  });

  it("stops when asked", () => {
    setMirrorFolder(join(home, "Drive"));
    setMirrorFolder(null);
    expect(mirrorFolder()).toBeNull();
    expect(backupNow(new Date(2026, 8, 17, 9, 0, 0)).mirrored).toBeUndefined();
  });
});

