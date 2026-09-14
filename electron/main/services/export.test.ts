import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import Database from "better-sqlite3";
import { migrate } from "../db/migrations";
import { createCompany } from "../repositories/companies";
import { createLead, logActivity } from "../repositories/leads";
import { createTask } from "../repositories/tasks";
import { createTemplate } from "../repositories/email";
import { exportEverything } from "./export";
import { leadInput, taskInput, type Company } from "@shared/domain";
import type * as ConnectionModule from "../db/connection";

type Connection = typeof ConnectionModule;

/**
 * Getting everything out, and putting it back.
 *
 * This is a local app with no cloud, so "what if it goes wrong" has to have a
 * real answer rather than a reassuring one.
 */

let workDir: string;
let db: Database.Database;
let company: Company;

/**
 * The database path is read from Electron's userData, which does not exist in
 * a unit test, so both modules are pointed at a temporary folder instead.
 */
vi.mock("../db/connection", async () => {
  const actual = await vi.importActual<Connection>("../db/connection");
  return {
    ...actual,
    databasePath: () => join(process.env["CAULDER_TEST_DIR"] ?? "", "caulder.db"),
    backupsDir: () => join(process.env["CAULDER_TEST_DIR"] ?? "", "backups"),
  };
});

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), "caulder-export-"));
  process.env["CAULDER_TEST_DIR"] = workDir;

  // A real file, because both the export and the restore copy it.
  db = new Database(join(workDir, "caulder.db"));
  db.pragma("foreign_keys = ON");
  migrate(db);

  company = createCompany(db, {
    name: "Unifloe",
    accent: "blue",
    timezone: "Asia/Kolkata",
  });
});

afterEach(() => {
  db.close();
  rmSync(workDir, { recursive: true, force: true });
});

function seed() {
  const lead = createLead(
    db,
    company.id,
    leadInput.parse({
      name: "Bengaluru Public School",
      email: "office@bps.example.com",
      // Commas, quotes and newlines in a note are the normal case.
      notes: 'Two campuses, "the trust decides".\nNot the principal.',
    }),
  );
  logActivity(db, { leadId: lead.id, kind: "call", body: "Spoke to the principal" });
  createTask(
    db,
    company.id,
    taskInput.parse({ leadId: lead.id, title: "Call again", dueOn: "2026-09-10" }),
  );
  createTemplate(db, company.id, {
    channel: "email",
    name: "Intro",
    subject: "Hello",
    body: "Hi there",
  });
  return lead;
}

describe("exportEverything", () => {
  it("writes a readable file for every kind of record", async () => {
    seed();
    const result = await exportEverything(db, company.id, "Unifloe", workDir);

    expect(result.files).toEqual(
      expect.arrayContaining([
        "leads.csv",
        "history.csv",
        "tasks.csv",
        "templates.csv",
        "caulder.db",
        "README.txt",
      ]),
    );
    expect(result.rows).toBeGreaterThan(0);
  });

  it("includes the database itself, not only the spreadsheets", async () => {
    // CSVs lose the links between records. Putting a spreadsheet back is not
    // the same as putting the app back.
    seed();
    const result = await exportEverything(db, company.id, "Unifloe", workDir);

    const copy = join(result.folder, "caulder.db");
    expect(existsSync(copy)).toBe(true);

    // And it opens as a database, rather than being a truncated file.
    const reopened = new Database(copy, { readonly: true });
    const count = reopened.prepare(`SELECT COUNT(*) AS n FROM leads`).get() as { n: number };
    reopened.close();
    expect(count.n).toBe(1);
  });

  it("quotes a note that would otherwise break the file", async () => {
    seed();
    const result = await exportEverything(db, company.id, "Unifloe", workDir);
    const csv = readFileSync(join(result.folder, "leads.csv"), "utf8");

    expect(csv).toContain("Bengaluru Public School");
    // The note survives intact rather than shifting every later column.
    expect(csv).toContain("the trust decides");
    expect(csv.split(/\r?\n/)[0]).toContain("Name");
  });

  it("writes the stage name rather than an id nobody can read", async () => {
    seed();
    const result = await exportEverything(db, company.id, "Unifloe", workDir);
    const csv = readFileSync(join(result.folder, "leads.csv"), "utf8");
    expect(csv).toContain("New");
  });

  it("exports only the company asked for", async () => {
    seed();
    const other = createCompany(db, {
      name: "PaperKite",
      accent: "rose",
      timezone: "Asia/Kolkata",
    });
    createLead(db, other.id, leadInput.parse({ name: "Not mine" }));

    const result = await exportEverything(db, company.id, "Unifloe", workDir);
    const csv = readFileSync(join(result.folder, "leads.csv"), "utf8");
    expect(csv).not.toContain("Not mine");
  });

  it("copes with a company that has nothing in it", async () => {
    const result = await exportEverything(db, company.id, "Unifloe", workDir);
    expect(result.rows).toBe(0);
    expect(existsSync(join(result.folder, "leads.csv"))).toBe(true);
  });

  it("does not build a folder name Windows will refuse", async () => {
    const result = await exportEverything(db, company.id, 'Uni/floe: "the" app?', workDir);
    // The folder name, not the whole path: a drive letter contains a colon.
    expect(basename(result.folder)).not.toMatch(/[<>:"/|?*]/);
    expect(existsSync(result.folder)).toBe(true);
  });

  it("says in plain words how to put it back", async () => {
    const result = await exportEverything(db, company.id, "Unifloe", workDir);
    const readme = readFileSync(join(result.folder, "README.txt"), "utf8");
    expect(readme).toContain("caulder.db");
    expect(readme).toContain("with Caulder closed");
  });
});

describe("backups", () => {
  it("lists what is there, newest first", async () => {
    const { backupNow, listBackups } = await import("../db/backup");

    backupNow(new Date("2026-09-01T10:00:00Z"));
    backupNow(new Date("2026-09-03T10:00:00Z"));

    const backups = listBackups();
    expect(backups).toHaveLength(2);
    expect((backups[0]?.takenAt ?? "") >= (backups[1]?.takenAt ?? "")).toBe(true);
    expect(backups[0]?.size).toBeGreaterThan(0);
  });

  it("fails loudly when there is nothing to copy", async () => {
    const { backupNow } = await import("../db/backup");
    process.env["CAULDER_TEST_DIR"] = join(workDir, "nowhere");
    // The launch backup stays quiet; this one was asked for by a button, so
    // silence would be worse than an error.
    expect(() => backupNow()).toThrow("no database to copy");
    process.env["CAULDER_TEST_DIR"] = workDir;
  });

  it("copies the current database aside before restoring over it", async () => {
    const { backupNow, restoreBackup, listBackups } = await import("../db/backup");

    seed();
    const taken = backupNow(new Date("2026-09-01T10:00:00Z"));

    // Something the backup does not know about.
    createLead(db, company.id, leadInput.parse({ name: "Added after the backup" }));
    db.close();

    const { safetyCopy } = restoreBackup(taken.path, () => {}, () => {});
    expect(existsSync(safetyCopy)).toBe(true);

    // Restoring the wrong file is itself undoable.
    const rescued = new Database(safetyCopy, { readonly: true });
    const found = rescued
      .prepare(`SELECT COUNT(*) AS n FROM leads WHERE name = 'Added after the backup'`)
      .get() as { n: number };
    rescued.close();
    expect(found.n).toBe(1);

    // And the restore actually happened.
    db = new Database(join(workDir, "caulder.db"));
    const after = db
      .prepare(`SELECT COUNT(*) AS n FROM leads WHERE name = 'Added after the backup'`)
      .get() as { n: number };
    expect(after.n).toBe(0);

    expect(listBackups().some((b) => b.name.includes("before-restore"))).toBe(true);
  });

  it("clears the WAL sidecars so a restore cannot half-apply", async () => {
    const { backupNow, restoreBackup } = await import("../db/backup");

    seed();
    const taken = backupNow();
    db.close();

    // A stale -wal beside a restored file is how a restore silently brings
    // back half of what it replaced.
    const wal = join(workDir, "caulder.db-wal");
    writeFileSync(wal, "stale");

    restoreBackup(taken.path, () => {}, () => {});
    expect(existsSync(wal)).toBe(false);

    db = new Database(join(workDir, "caulder.db"));
  });

  it("refuses a backup that is no longer on disk", async () => {
    const { restoreBackup } = await import("../db/backup");
    expect(() => restoreBackup(join(workDir, "gone.db"), () => {}, () => {})).toThrow(
      "no longer on disk",
    );
  });

  it("keeps only the ten most recent", async () => {
    const { backupNow } = await import("../db/backup");

    for (let i = 0; i < 13; i += 1) {
      backupNow(new Date(Date.UTC(2026, 8, 1, 10, i, 0)));
    }

    const kept = readdirSync(join(workDir, "backups"));
    expect(kept).toHaveLength(10);
  });
});
