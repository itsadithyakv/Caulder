import { beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { migrate } from "../db/migrations";
import { createCompany } from "./companies";
import { createLead, deleteLead } from "./leads";
import { forgetName, keepName, listNames } from "./linenames";
import { leadInput } from "@shared/domain";

/**
 * Who a word means (PLAN.md, part twelve, phase 48): an answer the line was
 * given, kept per company, one contact per word.
 */

let db: Database.Database;
let studio: string;
let priya: string;
let other: string;

beforeEach(() => {
  db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrate(db);
  studio = createCompany(db, { name: "Studio", accent: "coffee", timezone: "Asia/Kolkata" }).id;
  priya = createLead(db, studio, leadInput.parse({ name: "Kettle & Crumb Bakery", contactPerson: "Priya Nair" })).id;
  other = createLead(db, studio, leadInput.parse({ name: "Priya Sharma Design", contactPerson: "Priya Sharma" })).id;
});

describe("who a word means", () => {
  it("is kept, and listed with the contact's name", () => {
    expect(keepName(db, studio, { said: "pk", leadId: priya })).toEqual([expect.objectContaining({ said: "pk", leadId: priya, leadName: "Kettle & Crumb Bakery" })]);
  });

  it("is one contact per word: a second answer replaces the first, whatever the case", () => {
    keepName(db, studio, { said: "priya", leadId: priya });
    const after = keepName(db, studio, { said: "Priya", leadId: other });
    expect(after).toHaveLength(1);
    expect(after[0]?.leadId).toBe(other);
  });

  it("is never a contact of another company", () => {
    const elsewhere = createCompany(db, { name: "Elsewhere", accent: "blue", timezone: "Asia/Kolkata" }).id;
    expect(() => keepName(db, elsewhere, { said: "pk", leadId: priya })).toThrow("That contact is not in this company.");
  });

  it("is forgotten when asked, and goes with the contact", () => {
    const [kept] = keepName(db, studio, { said: "pk", leadId: priya });
    forgetName(db, kept!.id);
    expect(listNames(db, studio)).toEqual([]);
    keepName(db, studio, { said: "ps", leadId: other });
    deleteLead(db, other);
    expect(listNames(db, studio)).toEqual([]);
  });
});
