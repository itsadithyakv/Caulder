import { beforeEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import { migrate } from "../db/migrations";
import { createCompany } from "../repositories/companies";
import { createLead } from "../repositories/leads";
import { leadInput } from "@shared/domain";

/**
 * A contact into Google Contacts, and a backup into Drive - with the script
 * stood in for, because what matters here is what Caulder asks of it and what
 * it remembers afterwards.
 */

const calls: { action: string; payload: Record<string, unknown> }[] = [];
let answer: (action: string, payload: Record<string, unknown>) => unknown;

vi.mock("./gsync", () => ({
  callScript: (action: string, payload: Record<string, unknown>) => {
    calls.push({ action, payload });
    return Promise.resolve(answer(action, payload));
  },
}));

let backupSize = 1024;
vi.mock("../db/backup", () => ({
  backupNow: () => ({ name: "caulder-2026-09-10.db", path: import.meta.filename, size: backupSize, takenAt: "2026-09-10T10:00:00Z" }),
}));

const { backupToDrive, saveLeadToGoogle } = await import("./gmore");

let db: Database.Database;
let leadId: string;

beforeEach(() => {
  calls.length = 0;
  backupSize = 1024;
  db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrate(db);
  const companyId = createCompany(db, { name: "Mine", accent: "coffee", timezone: "Asia/Kolkata" }).id;
  leadId = createLead(
    db,
    companyId,
    leadInput.parse({ name: "MS PUC", contactPerson: "Rahul Nair", phone: "98765 43210", email: "rahul@mspuc.in" }),
  ).id;
});

describe("a contact, to Google Contacts", () => {
  it("sends who they are and how to reach them, and nothing else", async () => {
    answer = () => ({ resourceName: "people/c1", made: true });
    await expect(saveLeadToGoogle(db, leadId)).resolves.toEqual({ made: true });
    expect(calls).toEqual([
      {
        action: "saveContact",
        payload: {
          contact: { name: "MS PUC", person: "Rahul Nair", phone: "98765 43210", email: "rahul@mspuc.in" },
          resourceName: null,
        },
      },
    ]);
  });

  it("remembers which contact it made, so saving again updates that one", async () => {
    answer = (_action, payload) => ({ resourceName: "people/c1", made: payload["resourceName"] === null });
    await saveLeadToGoogle(db, leadId);
    await expect(saveLeadToGoogle(db, leadId)).resolves.toEqual({ made: false });
    expect(calls[1]?.payload["resourceName"]).toBe("people/c1");
  });

  it("says so when the contact has gone", async () => {
    await expect(saveLeadToGoogle(db, "nobody")).rejects.toThrow(/no longer exists/);
    expect(calls).toEqual([]);
  });
});

describe("a backup, to Drive", () => {
  it("sends a fresh backup whole, by its own name", async () => {
    answer = (_action, payload) => ({ name: payload["name"], size: 1024, at: "2026-09-10T10:00:00Z", kept: 1 });
    await expect(backupToDrive()).resolves.toMatchObject({ name: "caulder-2026-09-10.db", kept: 1 });
    expect(calls[0]?.action).toBe("backupPut");
    expect(typeof calls[0]?.payload["data"]).toBe("string");
  });

  it("refuses one too large to send in one go, and says where it is safe instead", async () => {
    backupSize = 40 * 1024 * 1024;
    await expect(backupToDrive()).rejects.toThrow(/40 MB.*safe on this computer/s);
    expect(calls).toEqual([]);
  });
});
