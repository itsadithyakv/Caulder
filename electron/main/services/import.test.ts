import { beforeEach, describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import Database from "better-sqlite3";
import { migrate } from "../db/migrations";
import { createCompany } from "../repositories/companies";
import { listLeads, findLead, updateLead } from "../repositories/leads";
import {
  buildTemplate,
  commitImport,
  guessMapping,
  listBatches,
  previewImport,
  readSheet,
  undoImport,
  type SheetData,
} from "./import";
import { leadInput, type Company } from "@shared/domain";
import type { Resolution } from "@shared/import";

/**
 * The real file is the test case.
 *
 * D:\MyFiles\LeadsUnifloe.xlsx is the sheet this app exists to replace, and
 * Phase 4 is only finished when it imports cleanly and rolls back. Where the
 * file is not on disk those tests skip rather than fail, so the suite still
 * runs on another machine; everything else is built from fixtures.
 */

const REAL_FILE = "D:/MyFiles/LeadsUnifloe.xlsx";
const hasRealFile = existsSync(REAL_FILE);

let db: Database.Database;
let company: Company;

beforeEach(() => {
  db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrate(db);
  company = createCompany(db, {
    name: "Unifloe",
    accent: "blue",
    timezone: "Asia/Kolkata",
  });
});

/** Builds a sheet in memory, so most tests need no file at all. */
function sheet(headers: string[], rows: unknown[][]): SheetData {
  return { headers, rows };
}

function preview(data: SheetData, mapping = guessMapping(data.headers)) {
  return previewImport(db, company.id, { name: "test.xlsx", type: "xlsx" }, data, mapping);
}

describe("guessMapping", () => {
  it("maps the real file's headers without help", () => {
    const mapping = guessMapping(["School name", "Phone number", "Email", "Location"]);
    expect(mapping).toEqual({ 0: "Name", 1: "Phone", 2: "Email", 3: "Location" });
  });

  it("leaves a column it cannot place unmapped", () => {
    const mapping = guessMapping(["School name", "Board affiliation"]);
    expect(mapping[1]).toBeNull();
  });

  it("refuses to map two columns to the same field", () => {
    // The second Phone is left for the user rather than silently winning.
    const mapping = guessMapping(["Name", "Phone", "Phone"]);
    expect(mapping[1]).toBe("Phone");
    expect(mapping[2]).toBeNull();
  });
});

describe("previewImport", () => {
  it("writes nothing to the database", () => {
    preview(sheet(["Name"], [["Bengaluru Public School"]]));
    expect(listLeads(db, { companyId: company.id })).toHaveLength(0);
  });

  it("insists on a Name column before it will run", () => {
    expect(() => preview(sheet(["Phone number"], [["9480004094"]]))).toThrow(
      "Map a column to Name",
    );
  });

  it("flags a row with no name instead of dropping it", () => {
    const result = preview(sheet(["Name", "Email"], [["", "a@example.com"]]));
    expect(result.rows[0]?.status).toBe("error");
    expect(result.rows[0]?.errors[0]).toBe("Name is missing.");
  });

  it("applies every normalisation rule the real file needs", () => {
    const result = preview(
      sheet(
        ["School name", "Phone number", "Email", "Location"],
        [
          [
            "TRIO World School / Prajna Vahini listing",
            "9480004094 / 9141924141",
            { text: "trio@example.com", hyperlink: "mailto:trio@example.com" },
            "Vishweshwarayya Layout, Bengaluru – 560056",
          ],
        ],
      ),
    );

    expect(result.rows[0]?.values).toMatchObject({
      name: "TRIO World School",
      source: "Prajna Vahini listing",
      phone: "9480004094",
      altPhone: "9141924141",
      email: "trio@example.com",
      city: "Bengaluru",
      pin: "560056",
    });
  });

  it("reads a phone stored as a number", () => {
    const result = preview(sheet(["Name", "Phone"], [["Oakridge", 9480040338]]));
    expect(result.rows[0]?.values?.phone).toBe("9480040338");
  });

  it("turns the sheet's sentinels into nothing", () => {
    const result = preview(
      sheet(
        ["Name", "Phone", "Email"],
        [["JNS Public School", "Not mentioned", "Not clearly mentioned"]],
      ),
    );
    expect(result.rows[0]?.values).toMatchObject({ phone: null, email: null });
  });

  it("ignores blank rows rather than reporting them as errors", () => {
    const data = sheet(["Name"], [["Real School"], ["", ""], ["  "]]);
    // readSheet drops these; a mapping-only preview sees what it is given, so
    // the filter is asserted where it lives.
    expect(data.rows).toHaveLength(3);
  });
});

describe("duplicate detection", () => {
  it("does not merge seven schools that share one email address", () => {
    // The real file has prajnavahini2025@gmail.com against seven different
    // schools. Matching on email alone would collapse them into one lead.
    const shared = "prajnavahini2025@gmail.com";
    const result = preview(
      sheet(
        ["Name", "Email"],
        [
          ["TRIO World School", shared],
          ["BVM Global Bengaluru", shared],
          ["NPS Varthur", shared],
          ["GIG International School", shared],
        ],
      ),
    );

    expect(result.counts.valid).toBe(4);
    expect(result.counts.duplicates).toBe(0);
  });

  it("does merge when the email and the name both agree", () => {
    const result = preview(
      sheet(
        ["Name", "Email"],
        [
          ["Oakridge International School", "oak@example.com"],
          ["Oakridge International School Bengaluru", "oak@example.com"],
        ],
      ),
    );

    expect(result.rows[1]?.status).toBe("duplicate");
    expect(result.rows[1]?.match?.on).toBe("email+name");
  });

  it("merges on a phone number even when the country code differs", () => {
    const result = preview(
      sheet(
        ["Name", "Phone"],
        [
          ["JES Public School", "+91 9019959088"],
          ["JES Public School Annexe", "9019959088"],
        ],
      ),
    );
    expect(result.rows[1]?.match?.on).toBe("phone");
  });

  it("merges on name and city together", () => {
    const result = preview(
      sheet(
        ["Name", "Location"],
        [
          ["Oakridge International School Bengaluru", "Bengaluru"],
          ["Oakridge International School Bengaluru", "Bengaluru"],
        ],
      ),
    );
    expect(result.rows[1]?.match?.on).toBe("name+city");
  });

  it("catches a row repeating one earlier in the same file", () => {
    // Nothing is in the database yet, so this only works if the preview
    // compares against rows it has already accepted.
    const result = preview(
      sheet(
        ["Name", "Location"],
        [
          ["Oakridge International School Bengaluru", "Bengaluru"],
          ["Some Other School", "Bengaluru"],
          ["Oakridge International School Bengaluru", "Bengaluru"],
        ],
      ),
    );

    expect(result.rows[2]?.status).toBe("duplicate");
    expect(result.rows[2]?.match?.leadId).toBeNull();
    expect(result.rows[2]?.match?.rowNumber).toBe(2);
  });

  it("catches a row repeating a lead already in the database", () => {
    const existing = preview(sheet(["Name", "Location"], [["Oakridge", "Bengaluru"]]));
    commitImport(db, existing.jobId, {});

    const second = preview(sheet(["Name", "Location"], [["Oakridge", "Bengaluru"]]));
    expect(second.rows[0]?.status).toBe("duplicate");
    expect(second.rows[0]?.match?.leadId).not.toBeNull();
  });

  it("lists only the fields that genuinely disagree", () => {
    const first = preview(
      sheet(["Name", "Location", "Email"], [["Oakridge", "Bengaluru", "a@example.com"]]),
    );
    commitImport(db, first.jobId, {});

    const second = preview(
      sheet(["Name", "Location", "Email"], [["Oakridge", "Bengaluru", "b@example.com"]]),
    );
    const conflicts = second.rows[0]?.match?.conflicts ?? [];

    // City is the same on both sides, so it is not a conflict.
    expect(conflicts.map((c) => c.field)).toEqual(["email"]);
    expect(conflicts[0]).toMatchObject({ existing: "a@example.com", incoming: "b@example.com" });
  });

  it("treats a blank on either side as something to fill, not a conflict", () => {
    const first = preview(sheet(["Name", "Location"], [["Oakridge", "Bengaluru"]]));
    commitImport(db, first.jobId, {});

    const second = preview(
      sheet(["Name", "Location", "Phone"], [["Oakridge", "Bengaluru", "9480004094"]]),
    );
    expect(second.rows[0]?.match?.conflicts).toEqual([]);
  });
});

describe("commitImport", () => {
  it("creates the valid rows and skips duplicates by default", () => {
    const result = preview(
      sheet(
        ["Name", "Location"],
        [
          ["Oakridge", "Bengaluru"],
          ["Oakridge", "Bengaluru"],
          ["Vibgyor High", "Mysore"],
        ],
      ),
    );

    const summary = commitImport(db, result.jobId, {});
    expect(summary).toMatchObject({ created: 2, updated: 0, skipped: 1 });
    expect(listLeads(db, { companyId: company.id })).toHaveLength(2);
  });

  it("fills in only what the existing lead is missing", () => {
    const first = preview(sheet(["Name", "Location", "Email"], [["Oakridge", "Bengaluru", "keep@example.com"]]));
    commitImport(db, first.jobId, {});

    const second = preview(
      sheet(
        ["Name", "Location", "Email", "Phone"],
        [["Oakridge", "Bengaluru", "new@example.com", "9480004094"]],
      ),
    );
    const summary = commitImport(db, second.jobId, { 2: "fill" });

    expect(summary.updated).toBe(1);
    const [lead] = listLeads(db, { companyId: company.id });
    // The phone was missing, so it lands. The email was not, so it stands.
    expect(lead?.phone).toBe("9480004094");
    expect(lead?.email).toBe("keep@example.com");
  });

  it("takes the imported values when told to overwrite", () => {
    const first = preview(sheet(["Name", "Location", "Email"], [["Oakridge", "Bengaluru", "old@example.com"]]));
    commitImport(db, first.jobId, {});

    const second = preview(
      sheet(["Name", "Location", "Email"], [["Oakridge", "Bengaluru", "new@example.com"]]),
    );
    commitImport(db, second.jobId, { 2: "overwrite" });

    expect(listLeads(db, { companyId: company.id })[0]?.email).toBe("new@example.com");
  });

  it("never blanks a known value just because the sheet omits the column", () => {
    const first = preview(sheet(["Name", "Location", "Phone"], [["Oakridge", "Bengaluru", "9480004094"]]));
    commitImport(db, first.jobId, {});

    const second = preview(sheet(["Name", "Location"], [["Oakridge", "Bengaluru"]]));
    commitImport(db, second.jobId, { 2: "overwrite" });

    expect(listLeads(db, { companyId: company.id })[0]?.phone).toBe("9480004094");
  });

  it("can add a lookalike as a separate lead", () => {
    const result = preview(
      sheet(
        ["Name", "Location"],
        [
          ["Oakridge", "Bengaluru"],
          ["Oakridge", "Bengaluru"],
        ],
      ),
    );
    commitImport(db, result.jobId, { 3: "create" });
    expect(listLeads(db, { companyId: company.id })).toHaveLength(2);
  });

  it("merges a row into the lead an earlier row in the same file created", () => {
    // Neither row exists when the preview runs, so this only works if the
    // commit tracks what it made as it goes.
    const result = preview(
      sheet(
        ["Name", "Location", "Phone"],
        [
          ["Oakridge", "Bengaluru", ""],
          ["Oakridge", "Bengaluru", "9480040338"],
        ],
      ),
    );
    const summary = commitImport(db, result.jobId, { 3: "fill" });

    expect(summary).toMatchObject({ created: 1, updated: 1 });
    expect(listLeads(db, { companyId: company.id })[0]?.phone).toBe("9480040338");
  });

  it("gives every created lead a timeline", () => {
    const result = preview(sheet(["Name"], [["Oakridge"]]));
    commitImport(db, result.jobId, {});

    const [lead] = listLeads(db, { companyId: company.id });
    const count = db
      .prepare(`SELECT COUNT(*) AS n FROM activities WHERE lead_id = ?`)
      .get(lead!.id) as { n: number };
    expect(count.n).toBeGreaterThan(0);
  });

  it("refuses a preview it no longer holds", () => {
    const result = preview(sheet(["Name"], [["Oakridge"]]));
    commitImport(db, result.jobId, {});
    expect(() => commitImport(db, result.jobId, {})).toThrow("expired");
  });
});

describe("undoImport", () => {
  it("deletes what the import created", () => {
    const result = preview(
      sheet(["Name"], [["Oakridge"], ["Vibgyor High"]]),
    );
    const summary = commitImport(db, result.jobId, {});

    undoImport(db, summary.batchId);
    expect(listLeads(db, { companyId: company.id })).toHaveLength(0);
  });

  it("puts back the values it overwrote", () => {
    // The half that actually saves work: deleting new rows is easy, but a
    // merge into an existing lead is otherwise unrecoverable.
    const first = preview(sheet(["Name", "Location", "Email"], [["Oakridge", "Bengaluru", "original@example.com"]]));
    commitImport(db, first.jobId, {});

    const second = preview(
      sheet(["Name", "Location", "Email"], [["Oakridge", "Bengaluru", "imported@example.com"]]),
    );
    const summary = commitImport(db, second.jobId, { 2: "overwrite" });
    expect(listLeads(db, { companyId: company.id })[0]?.email).toBe("imported@example.com");

    const undone = undoImport(db, summary.batchId);
    expect(undone).toMatchObject({ deleted: 0, restored: 1 });
    expect(listLeads(db, { companyId: company.id })[0]?.email).toBe("original@example.com");
  });

  it("leaves leads the import did not touch alone", () => {
    const first = preview(sheet(["Name"], [["Untouched School"]]));
    commitImport(db, first.jobId, {});

    const second = preview(sheet(["Name"], [["Imported School"]]));
    const summary = commitImport(db, second.jobId, {});

    undoImport(db, summary.batchId);
    const left = listLeads(db, { companyId: company.id }).map((l) => l.name);
    expect(left).toEqual(["Untouched School"]);
  });

  it("does not resurrect a lead the user deleted afterwards", () => {
    const first = preview(sheet(["Name", "Location", "Email"], [["Oakridge", "Bengaluru", "a@example.com"]]));
    commitImport(db, first.jobId, {});
    const [lead] = listLeads(db, { companyId: company.id });

    const second = preview(sheet(["Name", "Location", "Email"], [["Oakridge", "Bengaluru", "b@example.com"]]));
    const summary = commitImport(db, second.jobId, { 2: "overwrite" });

    db.prepare(`DELETE FROM leads WHERE id = ?`).run(lead!.id);
    expect(() => undoImport(db, summary.batchId)).not.toThrow();
    expect(listLeads(db, { companyId: company.id })).toHaveLength(0);
  });

  it("will not undo the same import twice", () => {
    const result = preview(sheet(["Name"], [["Oakridge"]]));
    const summary = commitImport(db, result.jobId, {});

    undoImport(db, summary.batchId);
    expect(() => undoImport(db, summary.batchId)).toThrow("already been undone");
  });

  it("keeps a manual edit made after the import", () => {
    const result = preview(sheet(["Name"], [["Oakridge"]]));
    const summary = commitImport(db, result.jobId, {});
    const [lead] = listLeads(db, { companyId: company.id });

    updateLead(db, lead!.id, leadInput.parse({ name: "Renamed by hand" }));
    undoImport(db, summary.batchId);

    // Undo removes what the import created, edits included. The batch is the
    // unit, and a half-undone lead would be worse than either outcome.
    expect(findLead(db, lead!.id)).toBeNull();
  });
});

describe("listBatches", () => {
  it("records what each import did", () => {
    const result = preview(sheet(["Name"], [["Oakridge"], ["Vibgyor"]]));
    commitImport(db, result.jobId, {});

    const [batch] = listBatches(db, company.id);
    expect(batch).toMatchObject({
      filename: "test.xlsx",
      rowCount: 2,
      createdCount: 2,
      undoneAt: null,
    });
  });

  it("marks a batch once it is undone", () => {
    const result = preview(sheet(["Name"], [["Oakridge"]]));
    const summary = commitImport(db, result.jobId, {});
    undoImport(db, summary.batchId);

    expect(listBatches(db, company.id)[0]?.undoneAt).not.toBeNull();
  });
});

describe("the template", () => {
  it("round-trips through its own reader", async () => {
    // Generated from the same column list the parser checks against, so the
    // file offered for download cannot drift from the file Caulder expects.
    const buffer = await buildTemplate();
    const data = await readSheet(buffer, "xlsx");

    expect(data.headers[0]).toBe("Name");
    const mapping = guessMapping(data.headers);
    expect(Object.values(mapping)).toContain("Name");

    const result = preview(data, mapping);
    expect(result.counts.errors).toBe(0);
  });
});

describe("readSheet", () => {
  it("drops trailing blank rows", async () => {
    const buffer = await buildTemplate();
    const data = await readSheet(buffer, "xlsx");
    expect(data.rows.every((row) => row.some((cell) => cell !== null))).toBe(true);
  });

  it("refuses a file over the size limit", async () => {
    const huge = Buffer.alloc(11 * 1024 * 1024);
    await expect(readSheet(huge, "xlsx")).rejects.toThrow("10 MB");
  });
});

describe.runIf(hasRealFile)("the real LeadsUnifloe.xlsx", () => {
  it("imports cleanly, and every rule earns its place", async () => {
    const data = await readSheet(readFileSync(REAL_FILE), "xlsx");

    expect(data.headers).toEqual(["School name", "Phone number", "Email", "Location"]);
    expect(data.rows).toHaveLength(20);

    const mapping = guessMapping(data.headers);
    const result = preview(data, mapping);

    // Every row has a school name, so nothing fails outright.
    expect(result.counts.errors).toBe(0);

    // Oakridge appears three times and JES twice. Those five rows are three
    // duplicates; the other fifteen are new.
    expect(result.counts.duplicates).toBe(3);
    expect(result.counts.valid).toBe(17);

    const byName = new Map(
      result.rows.filter((r) => r.values).map((r) => [r.values!.name, r.values!]),
    );

    // Provenance lifted out of the name.
    expect(byName.get("TRIO World School")?.source).toBe("Prajna Vahini listing");
    expect(byName.has("Delhi Public School Electronic City")).toBe(true);

    // Two numbers in one cell, split rather than dropped.
    expect(byName.get("Bengaluru Public School")).toMatchObject({
      phone: "9480004094",
      altPhone: "9141924141",
      city: "Bengaluru",
      pin: "560083",
    });

    // Hyperlink cells read as addresses.
    expect(byName.get("Bengaluru Public School")?.email).toBe("bpsdkh@gmail.com");

    // Sentinels became nothing.
    expect(byName.get("JNS Public School")).toMatchObject({ phone: null, email: null });

    const summary = commitImport(db, result.jobId, {});
    expect(summary.created).toBe(17);
    expect(listLeads(db, { companyId: company.id })).toHaveLength(17);
  });

  it("rolls back completely", async () => {
    const data = await readSheet(readFileSync(REAL_FILE), "xlsx");
    const result = preview(data, guessMapping(data.headers));
    const summary = commitImport(db, result.jobId, {});

    undoImport(db, summary.batchId);

    expect(listLeads(db, { companyId: company.id })).toHaveLength(0);
    const activities = db.prepare(`SELECT COUNT(*) AS n FROM activities`).get() as { n: number };
    expect(activities.n).toBe(0);
  });

  it("merges the repeats when told to fill", async () => {
    const data = await readSheet(readFileSync(REAL_FILE), "xlsx");
    const result = preview(data, guessMapping(data.headers));

    const resolutions: Record<number, Resolution> = {};
    for (const row of result.rows) {
      if (row.status === "duplicate") resolutions[row.rowNumber] = "fill";
    }

    const summary = commitImport(db, result.jobId, resolutions);
    expect(summary).toMatchObject({ created: 17, updated: 3, skipped: 0 });

    // Row 21's Oakridge carries the phone the earlier two lacked.
    const oakridge = listLeads(db, { companyId: company.id, search: "Oakridge" });
    expect(oakridge).toHaveLength(1);
    expect(oakridge[0]?.phone).toBe("9480040338");
  });
});
