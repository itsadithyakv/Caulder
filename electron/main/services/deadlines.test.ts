import { beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { MIGRATIONS, migrate } from "../db/migrations";
import { createCompany, setCompanyCurrency } from "../repositories/companies";
import { createLead, deleteLead } from "../repositories/leads";
import { createObligation, doneFor, listObligations, updateObligation } from "../repositories/obligations";
import { deleteDocument, listDocuments, recordDocument, updateDocument } from "../repositories/documents";
import { newPage, savePage } from "./brain";
import {
  addPresetDeadlines,
  buildDeadlines,
  deadlinesBetween,
  dueNowCount,
  dueSoon,
  markDeadlineDone,
  removeDeadline,
  undoDeadline,
} from "./deadlines";
import { buildToday } from "./today";
import { leadInput, type Company } from "@shared/domain";

/**
 * Deadlines: an obligation's occurrences worked out from its rule, what is
 * done kept one row per occurrence, the dates read off contract and
 * registration pages, documents that expire - and the move from the filing
 * and document pages the brain used to hold.
 */

let db: Database.Database;
let company: Company;
// 18 September 2026, late morning in Bengaluru.
const now = new Date("2026-09-18T06:00:00.000Z");
const today = "2026-09-18";

beforeEach(() => {
  db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrate(db);
  company = createCompany(db, { name: "Unifloe", accent: "blue", timezone: "Asia/Kolkata" });
});

/** GSTR-1 on the 11th, for the month before, shown five days ahead. */
function gstr1(startsOn: string | null = "2026-08-01") {
  return createObligation(
    db,
    company.id,
    { title: "GSTR-1", rule: { every: "month", day: 11 }, period: "month-before", remindDays: 5, startsOn },
    today,
    now,
  );
}

function page(section: string, template: string, title: string, fields: Record<string, string | number>) {
  const made = newPage(db, company.id, section, template, now);
  return savePage(db, made.id, { title, body: "", fields, baseRevision: made.revision }, now);
}

describe("an obligation", () => {
  it("is due on every occurrence since it started that is not done, and the next once inside its notice", () => {
    gstr1();
    const soon = dueSoon(db, company.id, today);
    expect(soon.map((deadline) => [deadline.dueOn, deadline.period, deadline.daysLeft])).toEqual([
      ["2026-08-11", "Jul 2026", -38],
      ["2026-09-11", "Aug 2026", -7],
    ]);
    // 11 October is 23 days off, and the notice is five.
    expect(dueSoon(db, company.id, "2026-10-06").map((deadline) => deadline.dueOn)).toContain("2026-10-11");
  });

  it("starts today when no start is given, so nothing from before it was added is late", () => {
    const made = gstr1(null);
    expect(made.startsOn).toBe(today);
    expect(made.nextDue).toBe("2026-10-11");
    expect(dueSoon(db, company.id, today)).toEqual([]);
  });

  it("marks one occurrence done, once however often it is pressed, and can be undone", () => {
    const made = gstr1();
    markDeadlineDone(db, made.id, "2026-08-11", now);
    const overview = markDeadlineDone(db, made.id, "2026-08-11", now);

    expect(doneFor(db, made.id)).toHaveLength(1);
    expect(overview.deadlines.map((deadline) => deadline.dueOn)).toEqual(["2026-09-11"]);
    const [after] = overview.obligations;
    expect(after?.lastDone).toEqual({ dueOn: "2026-08-11", doneOn: today });
    expect(after?.nextDue).toBe("2026-09-11");

    undoDeadline(db, made.id, "2026-08-11", now);
    expect(dueSoon(db, company.id, today)).toHaveLength(2);
  });

  it("shows nothing once it is no longer needed, and keeps its start when edited without one", () => {
    const made = gstr1();
    const paused = updateObligation(
      db,
      made.id,
      { title: "GSTR-1", rule: { every: "month", day: 11 }, period: "month-before", active: false },
      today,
      now,
    );
    expect(paused.startsOn).toBe("2026-08-01");
    expect(paused.nextDue).toBeNull();
    expect(dueSoon(db, company.id, today)).toEqual([]);
    expect(deadlinesBetween(db, company.id, "2026-09-01", "2026-09-30", today)).toEqual([]);
  });

  it("refuses a rule that is not one", () => {
    expect(() =>
      createObligation(db, company.id, { title: "GST", rule: { every: "once", on: "2026-02-30" } }, today, now),
    ).toThrow();
    expect(() =>
      createObligation(db, company.id, { title: "GST", rule: { every: "month", day: 32 } }, today, now),
    ).toThrow();
  });

  it("goes with its history when deleted", () => {
    const made = gstr1();
    markDeadlineDone(db, made.id, "2026-08-11", now);
    removeDeadline(db, made.id, now);
    expect(listObligations(db, company.id, today)).toEqual([]);
    expect(db.prepare(`SELECT COUNT(*) AS n FROM obligation_done`).get()).toEqual({ n: 0 });
  });
});

describe("dates already written in the brain", () => {
  it("read a contract's notice day and end, and a registration's renewal, while they are near", () => {
    page("legal", "contract", "Hosting", { party: "Acme Cloud", endsOn: "2026-10-15", noticeDays: 30 });
    page("tax", "registration", "Shops and establishments", { renewsOn: "2026-12-31" });

    const soon = dueSoon(db, company.id, today);
    expect(soon.map((deadline) => [deadline.title, deadline.what, deadline.dueOn])).toEqual([
      ["Hosting with Acme Cloud", "Give notice, or it carries on", "2026-09-15"],
      ["Hosting with Acme Cloud", "Contract ends", "2026-10-15"],
    ]);
    // A notice day three days gone stays on Today, but the notification said it on the day.
    expect(dueNowCount(db, company.id, today)).toBe(0);
    expect(dueNowCount(db, company.id, "2026-09-15")).toBe(1);
    // The renewal is three months off: the Calendar has it, Today does not yet.
    expect(
      deadlinesBetween(db, company.id, "2026-12-01", "2026-12-31", today).map((deadline) => deadline.what),
    ).toEqual(["Registration renews"]);
  });

  it("move when the page's date does, with nothing copied to keep in step", () => {
    const contract = page("legal", "contract", "Office lease", { endsOn: "2026-10-01" });
    expect(dueSoon(db, company.id, today).map((deadline) => deadline.dueOn)).toEqual(["2026-10-01"]);
    savePage(db, contract.id, { title: "Office lease", body: "", fields: { endsOn: "2027-10-01" }, baseRevision: contract.revision }, now);
    expect(dueSoon(db, company.id, today)).toEqual([]);
  });

  it("include a document that expires, and count toward the notification with what is late", () => {
    recordDocument(db, company.id, { name: "Fire safety certificate", category: "certificate", location: "Office wall", expiresOn: "2026-09-18" }, null, now);
    gstr1();

    const soon = dueSoon(db, company.id, today);
    expect(soon.find((deadline) => deadline.source === "document")).toMatchObject({
      title: "Fire safety certificate",
      what: "Expires",
      daysLeft: 0,
    });
    // Two GSTR-1s late and the certificate today.
    expect(dueNowCount(db, company.id, today)).toBe(3);
    expect(buildToday(db, company.id, now).deadlines).toEqual(soon);
  });
});

describe("the Calendar", () => {
  it("has every occurrence in a span, the done ones saying when", () => {
    const made = gstr1();
    markDeadlineDone(db, made.id, "2026-09-11", now);
    const september = deadlinesBetween(db, company.id, "2026-09-01", "2026-09-30", today);
    expect(september.map((deadline) => [deadline.dueOn, deadline.doneOn])).toEqual([["2026-09-11", today]]);
    // Nothing before it started.
    expect(deadlinesBetween(db, company.id, "2026-07-01", "2026-07-31", today)).toEqual([]);
  });
});

describe("presets", () => {
  it("are picked for the kind of company the profile says it is", () => {
    page("company", "profile", "Unifloe", { entityType: "private-limited-company", gstStatus: "regular-monthly-returns" });
    const overview = buildDeadlines(db, company.id, now);
    expect(overview.presetSet).toBe("india");

    const fits = (id: string) => overview.offers.india.find((offer) => offer.preset.id === id)?.fits;
    expect(fits("in-gstr1-monthly")).toBe(true);
    expect(fits("in-itr-company")).toBe(true);
    expect(fits("in-aoc4")).toBe(true);
    expect(fits("in-gstr1-qrmp")).toBe(false);
    expect(fits("in-itr-firm")).toBe(false);
    expect(fits("in-llp-form11")).toBe(false);
  });

  it("are added once, however often they are pressed, and say so", () => {
    addPresetDeadlines(db, company.id, ["in-gstr1-monthly", "in-advance-tax"], now);
    const overview = addPresetDeadlines(db, company.id, ["in-gstr1-monthly"], now);

    expect(overview.obligations.map((obligation) => obligation.title).sort()).toEqual(["Advance tax", "GSTR-1"]);
    expect(overview.offers.india.find((offer) => offer.preset.id === "in-gstr1-monthly")?.added).toBe(true);
    const gst = overview.obligations.find((obligation) => obligation.presetId === "in-gstr1-monthly");
    expect(gst).toMatchObject({ startsOn: today, nextDue: "2026-10-11", period: "month-before" });
  });

  it("refuse one Caulder does not know", () => {
    expect(() => addPresetDeadlines(db, company.id, ["in-made-up"], now)).toThrow("not a preset");
  });

  it("are the generic set for a company outside India", () => {
    const abroad = createCompany(db, { name: "Northwind", accent: "blue", timezone: "Europe/London" });
    setCompanyCurrency(db, abroad.id, "GBP");
    expect(buildDeadlines(db, abroad.id, now).presetSet).toBe("generic");
  });
});

describe("documents", () => {
  it("are a stored file, or written down with where they are - one or the other", () => {
    expect(() => recordDocument(db, company.id, { name: "Lease" }, null, now)).toThrow("Say where");

    const drawer = recordDocument(db, company.id, { name: "Lease", category: "agreement", location: "The blue folder" }, null, now);
    const stored = recordDocument(db, company.id, { name: "deck.pdf", category: "pitch-deck" }, { stored: "abc-deck.pdf", bytes: 2048 }, now);
    expect(drawer).toMatchObject({ hasFile: false, location: "The blue folder", bytes: null });
    expect(stored).toMatchObject({ hasFile: true, bytes: 2048 });

    expect(() => updateDocument(db, drawer.id, { name: "Lease", location: null }, now)).toThrow("Say where");
    // A stored file is described, never re-pointed.
    expect(updateDocument(db, stored.id, { name: "Pitch deck, 2026", category: "pitch-deck", expiresOn: "2027-01-01" }, now)).toMatchObject({
      name: "Pitch deck, 2026",
      hasFile: true,
      expiresOn: "2027-01-01",
    });

    expect(deleteDocument(db, stored.id)).toBe("abc-deck.pdf");
    expect(deleteDocument(db, drawer.id)).toBeNull();
    expect(listDocuments(db, company.id)).toEqual([]);
  });

  it("can belong to a contact, and go with them", () => {
    const lead = createLead(db, company.id, leadInput.parse({ name: "Oakridge School" }));
    recordDocument(db, company.id, { name: "signed.pdf", category: "contract", leadId: lead.id }, { stored: "x.pdf", bytes: 10 }, now);
    recordDocument(db, company.id, { name: "GST certificate", category: "certificate", location: "Drive" }, null, now);

    expect(listDocuments(db, company.id, { leadId: lead.id }).map((document) => [document.name, document.leadName])).toEqual([
      ["signed.pdf", "Oakridge School"],
    ]);
    expect(listDocuments(db, company.id)).toHaveLength(2);
    deleteLead(db, lead.id);
    expect(listDocuments(db, company.id).map((document) => document.name)).toEqual(["GST certificate"]);
  });

  it("refuse a contact from another company", () => {
    const other = createCompany(db, { name: "Elsewhere", accent: "blue", timezone: "Asia/Kolkata" });
    const theirs = createLead(db, other.id, leadInput.parse({ name: "Not ours" }));
    expect(() =>
      recordDocument(db, company.id, { name: "x", location: "y", leadId: theirs.id }, null, now),
    ).toThrow();
  });
});

describe("migration 26", () => {
  it("turns attachments, document pages and filing pages into documents and obligations", () => {
    const old = new Database(":memory:");
    old.pragma("foreign_keys = ON");
    for (const migration of MIGRATIONS.filter((m) => m.version <= 25)) {
      old.exec(migration.sql);
      old.pragma(`user_version = ${migration.version}`);
    }
    const theirs = createCompany(old, { name: "Unifloe", accent: "blue", timezone: "Asia/Kolkata" });
    const lead = createLead(old, theirs.id, leadInput.parse({ name: "Oakridge School" }));
    const at = "2026-04-01T00:00:00.000Z";

    old
      .prepare(
        `INSERT INTO attachments (id, company_id, lead_id, name, file, bytes, created_at)
         VALUES ('att-1', ?, ?, 'proposal.pdf', 'stored-proposal.pdf', 5120, ?)`,
      )
      .run(theirs.id, lead.id, at);

    const insertPage = old.prepare(
      `INSERT INTO brain_pages (id, company_id, section, template, title, body, fields, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    insertPage.run(
      "doc-1",
      theirs.id,
      "documents",
      "document",
      "Certificate of incorporation",
      "The original, signed.",
      JSON.stringify({ category: "certificate", where: "Office safe", expiresOn: "2030-01-01" }),
      at,
      at,
    );
    insertPage.run(
      "filing-1",
      theirs.id,
      "tax",
      "filing",
      "GSTR-9 for 2024-25",
      "",
      JSON.stringify({ period: "2024-25", dueOn: "2025-12-31", filedOn: "2025-12-20" }),
      at,
      at,
    );
    insertPage.run(
      "filing-2",
      theirs.id,
      "tax",
      "filing",
      "ROC annual return",
      "Ask the CA.",
      JSON.stringify({ dueOn: "2026-11-29" }),
      at,
      at,
    );

    migrate(old);

    const documents = listDocuments(old, theirs.id);
    expect(documents.map((document) => [document.id, document.name, document.category, document.hasFile, document.location])).toEqual(
      expect.arrayContaining([
        ["att-1", "proposal.pdf", "other", true, null],
        ["doc-1", "Certificate of incorporation", "certificate", false, "Office safe"],
      ]),
    );
    expect(documents.find((document) => document.id === "att-1")).toMatchObject({ leadId: lead.id, bytes: 5120 });
    expect(documents.find((document) => document.id === "doc-1")).toMatchObject({
      expiresOn: "2030-01-01",
      notes: "The original, signed.",
    });

    const obligations = listObligations(old, theirs.id, "2026-09-18");
    const annual = obligations.find((obligation) => obligation.id === "filing-1");
    expect(annual).toMatchObject({
      title: "GSTR-9 for 2024-25",
      rule: { every: "once", on: "2025-12-31" },
      notes: "For the period: 2024-25",
      lastDone: { dueOn: "2025-12-31", doneOn: "2025-12-20" },
      nextDue: null,
    });
    expect(obligations.find((obligation) => obligation.id === "filing-2")).toMatchObject({
      rule: { every: "once", on: "2026-11-29" },
      notes: "Ask the CA.",
      nextDue: "2026-11-29",
      lastDone: null,
    });

    const left = old.prepare(`SELECT COUNT(*) AS n FROM brain_pages WHERE template IN ('document', 'filing')`).get();
    expect(left).toEqual({ n: 0 });
    const tables = old.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'attachments'`).all();
    expect(tables).toEqual([]);
  });
});
