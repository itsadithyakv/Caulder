import { beforeEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import { migrate } from "../db/migrations";
import { createCompany } from "../repositories/companies";
import { createLead, deleteLead, findLead, listActivities, updateLead } from "../repositories/leads";
import { leadInput } from "@shared/domain";
import { SHEET_HEADER } from "@shared/sheet";

/**
 * A company's contacts kept as a Google Sheet, with the script stood in for
 * by a sheet in memory: what Caulder asks of it, what it takes in from an
 * edit made there, and what it refuses.
 */

/** The spreadsheet, as the script would hold it: the rows under the heading. */
let sheet: string[][] = [];
const calls: string[] = [];
let failNext: string | null = null;

vi.mock("./gsync", () => ({
  callScript: (action: string, payload: { rows?: string[][]; header?: string[] }) => {
    calls.push(action);
    if (failNext) {
      const why = failNext;
      failNext = null;
      return Promise.reject(new Error(why));
    }
    if (action === "sheetRead") return Promise.resolve({ id: "s1", url: "https://docs.google.com/spreadsheets/d/s1/edit", rows: sheet.map((row) => [...row]) });
    if (action === "sheetWrite") {
      // Sheets shows a cell without the apostrophe that only said "this is text".
      sheet = (payload.rows ?? []).map((row) => row.map((cell) => cell.replace(/^'(?=[=+\-@])/, "")));
      return Promise.resolve({ id: "s1", url: "https://docs.google.com/spreadsheets/d/s1/edit", count: sheet.length });
    }
    return Promise.reject(new Error(`unexpected ${action}`));
  },
}));

let connected = true;
vi.mock("./credentials", () => ({ isConnected: () => connected }));

let version = 6;
vi.mock("./mail", () => ({ scriptInfo: () => ({ version }) }));

const { linkSheet, sheetState, sheetUrl, syncLinkedSheets, syncSheet, unlinkSheet } = await import("./sheetsync");

const NOW = new Date("2026-10-10T06:00:00Z");
const col = (heading: string) => SHEET_HEADER.findIndex((each) => each.startsWith(heading));

let db: Database.Database;
let companyId: string;
let harbour: string;

beforeEach(async () => {
  sheet = [];
  calls.length = 0;
  failNext = null;
  connected = true;
  version = 6;
  db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrate(db);
  companyId = createCompany(db, { name: "Northwind", accent: "coffee", timezone: "Asia/Kolkata" }).id;
  harbour = createLead(db, companyId, leadInput.parse({ name: "Harbour Coffee", contactPerson: "Maya Ellis", phone: "+1 415 555 0100", city: "San Francisco" })).id;
  createLead(db, companyId, leadInput.parse({ name: "Nordlys Design", email: "jonas@nordlys.example" }));
});

/** The row for a contact, to edit the way somebody would on a phone. */
const rowOf = (id: string) => sheet.find((row) => row[0] === id) as string[];

describe("keeping contacts in a sheet", () => {
  it("is off until asked, and says why it cannot be when Google is not there", () => {
    expect(sheetState(db, companyId)).toMatchObject({ linked: false, blocked: null, syncedAt: null });
    connected = false;
    expect(sheetState(db, companyId).blocked).toMatch(/Connect Google/);
    connected = true;
    version = 5;
    expect(sheetState(db, companyId).blocked).toMatch(/older version/);
  });

  it("writes every contact the first time, by name, under the headings", async () => {
    const state = await linkSheet(db, companyId, NOW);
    expect(calls).toEqual(["sheetRead", "sheetWrite"]);
    expect(state).toMatchObject({ linked: true, count: 2, changed: 0, made: 0, error: null, syncedAt: NOW.toISOString() });
    expect(sheet.map((row) => row[col("Name")])).toEqual(["Harbour Coffee", "Nordlys Design"]);
    expect(rowOf(harbour)[col("Phone")]).toBe("+1 415 555 0100");
    expect(rowOf(harbour)[col("Stage")]).toBeTruthy();
    expect(sheetUrl(db, companyId)).toBe("https://docs.google.com/spreadsheets/d/s1/edit");
  });

  it("takes in a cell changed in the sheet, as an edit to the contact", async () => {
    await linkSheet(db, companyId, NOW);
    rowOf(harbour)[col("Phone")] = "+1 415 555 0199";
    rowOf(harbour)[col("LinkedIn")] = "linkedin.com/in/maya-ellis/";

    const state = await syncSheet(db, companyId, NOW);
    expect(state).toMatchObject({ changed: 1, made: 0, problems: [] });
    expect(findLead(db, harbour)).toMatchObject({ phone: "+1 415 555 0199", linkedin: "https://www.linkedin.com/in/maya-ellis" });
    // Like an edit on their page: the history says the details were edited.
    expect(listActivities(db, harbour).some((entry) => entry.kind === "field_change")).toBe(true);
    // And the sheet now says what Caulder keeps: the address in full.
    expect(rowOf(harbour)[col("LinkedIn")]).toBe("https://www.linkedin.com/in/maya-ellis");
  });

  it("keeps an edit made in Caulder when the sheet did not touch that cell, and writes it out", async () => {
    await linkSheet(db, companyId, NOW);
    const lead = findLead(db, harbour)!;
    updateLead(db, harbour, leadInput.parse({ ...lead, city: "Oakland" }));
    rowOf(harbour)[col("Phone")] = "+1 415 555 0199";

    await syncSheet(db, companyId, NOW);
    expect(findLead(db, harbour)).toMatchObject({ city: "Oakland", phone: "+1 415 555 0199" });
    expect(rowOf(harbour)[col("City")]).toBe("Oakland");
  });

  it("makes a contact of a row typed in with a name, and says so of what it cannot keep", async () => {
    await linkSheet(db, companyId, NOW);
    const blank = () => SHEET_HEADER.map(() => "");
    const added = blank();
    added[col("Name")] = "Studio Palma";
    added[col("Email")] = "lucia@palma.example";
    const nameless = blank();
    nameless[col("Email")] = "nobody@example.com";
    sheet.push(added, nameless);
    rowOf(harbour)[col("Instagram")] = "not a handle at all";

    const state = await syncSheet(db, companyId, NOW);
    expect(state).toMatchObject({ made: 1, changed: 0, count: 3 });
    expect(state.problems).toEqual([
      "Row 5 has no name, so it was not made a contact.",
      expect.stringMatching(/^Harbour Coffee: That does not look like an Instagram handle/),
    ]);
    const made = db.prepare(`SELECT source, email FROM leads WHERE name = 'Studio Palma'`).get();
    expect(made).toEqual({ source: "Google Sheet", email: "lucia@palma.example" });
    // The nameless row is gone from the sheet, and Harbour's cell is back as Caulder has it.
    expect(sheet).toHaveLength(3);
    expect(rowOf(harbour)[col("Instagram")]).toBe("");
  });

  it("never deletes a contact because its row went, and drops the row of one deleted here", async () => {
    await linkSheet(db, companyId, NOW);
    sheet = sheet.filter((row) => row[0] !== harbour);
    await syncSheet(db, companyId, NOW);
    expect(findLead(db, harbour)).not.toBeNull();
    expect(rowOf(harbour)).toBeDefined();

    deleteLead(db, harbour);
    await syncSheet(db, companyId, NOW);
    expect(sheet.map((row) => row[col("Name")])).toEqual(["Nordlys Design"]);
  });

  it("keeps what went wrong on the link, in a sentence, and goes again next time", async () => {
    await linkSheet(db, companyId, NOW);
    failNext = "Google answered 500.";
    await expect(syncSheet(db, companyId, NOW)).rejects.toThrow("Google answered 500.");
    expect(sheetState(db, companyId)).toMatchObject({ linked: true, error: "Google answered 500." });
    expect(await syncLinkedSheets(db, NOW)).toBe(1);
    expect(sheetState(db, companyId).error).toBeNull();
  });

  it("is not left linked to a sheet that was never made", async () => {
    failNext = "That key is not right.";
    await expect(linkSheet(db, companyId, NOW)).rejects.toThrow("That key is not right.");
    expect(sheetState(db, companyId).linked).toBe(false);
  });

  it("stops when asked, and forgets what it wrote", async () => {
    await linkSheet(db, companyId, NOW);
    expect(unlinkSheet(db, companyId)).toMatchObject({ linked: false, syncedAt: null });
    expect((db.prepare(`SELECT COUNT(*) AS n FROM sheet_rows`).get() as { n: number }).n).toBe(0);
    await expect(syncSheet(db, companyId, NOW)).rejects.toThrow("not kept in a sheet");
    expect(await syncLinkedSheets(db, NOW)).toBe(0);
  });
});
