import { beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { migrate } from "../db/migrations";
import {
  archiveCompany,
  createCompany,
  findCompany,
  listCompanies,
  listStages,
  renameCompany,
  setCompanyAccent,
} from "./companies";
import { resolveActiveCompanyId, getSetting, setSetting } from "./settings";
import { DEFAULT_STAGES } from "@shared/domain";

let db: Database.Database;

const INPUT = {
  name: "Unifloe",
  accent: "blue",
  timezone: "Asia/Kolkata",
} as const;

beforeEach(() => {
  db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrate(db);
});

describe("createCompany", () => {
  it("returns the company it stored", () => {
    const created = createCompany(db, INPUT);

    expect(created.name).toBe("Unifloe");
    expect(created.accent).toBe("blue");
    expect(created.timezone).toBe("Asia/Kolkata");
    expect(created.isArchived).toBe(false);
    expect(created.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("seeds the default pipeline in the right order", () => {
    // A workspace with no stages cannot show a board, so creation is not
    // considered done until the stages exist.
    const created = createCompany(db, INPUT);
    const stages = listStages(db, created.id);

    expect(stages.map((s) => s.name)).toEqual(DEFAULT_STAGES.map((s) => s.name));
    expect(stages.map((s) => s.position)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(stages.at(-1)?.kind).toBe("lost");
  });

  it("rejects a duplicate name with a message a person can act on", () => {
    createCompany(db, INPUT);

    expect(() => createCompany(db, INPUT)).toThrow(
      'A company called "Unifloe" already exists.',
    );
  });

  it("treats names as case-insensitive when checking for duplicates", () => {
    createCompany(db, INPUT);
    expect(() => createCompany(db, { ...INPUT, name: "UNIFLOE" })).toThrow(
      /already exists/,
    );
  });

  it("leaves no half-written company behind when the name collides", () => {
    // The insert and the stage seeding share one transaction; a failed create
    // must not leave orphan stages pointing at nothing.
    createCompany(db, INPUT);
    try {
      createCompany(db, INPUT);
    } catch {
      // expected
    }

    const stages = db.prepare(`SELECT COUNT(*) AS n FROM pipeline_stages`).get() as {
      n: number;
    };
    expect(stages.n).toBe(DEFAULT_STAGES.length);
  });
});

describe("listCompanies", () => {
  it("sorts by name, ignoring case", () => {
    createCompany(db, { ...INPUT, name: "zeta" });
    createCompany(db, { ...INPUT, name: "Alpha" });
    createCompany(db, { ...INPUT, name: "beta" });

    expect(listCompanies(db).map((c) => c.name)).toEqual(["Alpha", "beta", "zeta"]);
  });

  it("hides archived companies", () => {
    const keep = createCompany(db, { ...INPUT, name: "Keep" });
    const gone = createCompany(db, { ...INPUT, name: "Gone" });
    archiveCompany(db, gone.id);

    expect(listCompanies(db).map((c) => c.id)).toEqual([keep.id]);
  });
});

describe("archiveCompany", () => {
  it("frees the name for reuse", () => {
    const first = createCompany(db, INPUT);
    archiveCompany(db, first.id);

    expect(() => createCompany(db, INPUT)).not.toThrow();
  });

  it("keeps the archived row rather than deleting it", () => {
    // Archiving must not cascade away leads and email history.
    const created = createCompany(db, INPUT);
    archiveCompany(db, created.id);

    expect(findCompany(db, created.id)?.isArchived).toBe(true);
    expect(listStages(db, created.id)).toHaveLength(DEFAULT_STAGES.length);
  });

  it("refuses to archive something that is not there", () => {
    expect(() => archiveCompany(db, "nope")).toThrow("That company no longer exists.");
  });

  it("refuses to archive the same company twice", () => {
    const created = createCompany(db, INPUT);
    archiveCompany(db, created.id);
    expect(() => archiveCompany(db, created.id)).toThrow(/no longer exists/);
  });
});

describe("renameCompany and setCompanyAccent", () => {
  it("renames", () => {
    const created = createCompany(db, INPUT);
    expect(renameCompany(db, created.id, "PaperKite").name).toBe("PaperKite");
  });

  it("rejects a rename onto a name already in use", () => {
    createCompany(db, { ...INPUT, name: "Taken" });
    const other = createCompany(db, { ...INPUT, name: "Free" });

    expect(() => renameCompany(db, other.id, "Taken")).toThrow(/already exists/);
  });

  it("changes the accent", () => {
    const created = createCompany(db, INPUT);
    expect(setCompanyAccent(db, created.id, "violet").accent).toBe("violet");
  });

  it("refuses to touch a company that is not there", () => {
    expect(() => setCompanyAccent(db, "nope", "teal")).toThrow(/no longer exists/);
    expect(() => renameCompany(db, "nope", "x")).toThrow(/no longer exists/);
  });
});

describe("resolveActiveCompanyId", () => {
  it("returns null when there are no companies", () => {
    expect(resolveActiveCompanyId(db, [])).toBeNull();
  });

  it("keeps a stored id that still points at a live company", () => {
    const a = createCompany(db, { ...INPUT, name: "A" });
    const b = createCompany(db, { ...INPUT, name: "B" });
    setSetting(db, "activeCompanyId", b.id);

    expect(resolveActiveCompanyId(db, [a.id, b.id])).toBe(b.id);
  });

  it("falls back and repairs the setting when the stored id is stale", () => {
    // The failure this prevents: archive the company you were in, reopen the
    // app, and land on a workspace that does not exist with no way back.
    const live = createCompany(db, { ...INPUT, name: "Live" });
    setSetting(db, "activeCompanyId", "archived-or-deleted");

    expect(resolveActiveCompanyId(db, [live.id])).toBe(live.id);
    expect(getSetting(db, "activeCompanyId")).toBe(live.id);
  });

  it("picks the first company when nothing is stored", () => {
    const a = createCompany(db, { ...INPUT, name: "A" });
    expect(resolveActiveCompanyId(db, [a.id])).toBe(a.id);
    expect(getSetting(db, "activeCompanyId")).toBe(a.id);
  });
});

describe("settings store", () => {
  it("overwrites rather than duplicating a key", () => {
    setSetting(db, "syncFolder", "C:/one");
    setSetting(db, "syncFolder", "C:/two");

    expect(getSetting(db, "syncFolder")).toBe("C:/two");
    const count = db.prepare(`SELECT COUNT(*) AS n FROM settings`).get() as { n: number };
    expect(count.n).toBe(1);
  });

  it("returns null for a key never set", () => {
    expect(getSetting(db, "syncFolder")).toBeNull();
  });
});
