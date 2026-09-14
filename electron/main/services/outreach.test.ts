import { beforeEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import { migrate } from "../db/migrations";
import { createCompany } from "../repositories/companies";
import { createLead } from "../repositories/leads";
import { leadInput } from "@shared/domain";

/**
 * WhatsApp, and the two things it must refuse.
 *
 * The URL is built in main from the lead's own row, so what is worth checking
 * is that the row is what decides it: a flagged lead opens nothing, and the
 * renderer's text is the only thing the renderer contributes.
 */

const opened: string[] = [];
vi.mock("electron", () => ({
  shell: { openExternal: (url: string) => opened.push(url) },
}));

const { openWhatsApp } = await import("./outreach");

let db: Database.Database;
let companyId: string;

beforeEach(() => {
  opened.length = 0;
  db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrate(db);
  companyId = createCompany(db, { name: "Unifloe", accent: "blue", timezone: "Asia/Kolkata" }).id;
});

function lead(over: Record<string, unknown>) {
  return createLead(db, companyId, leadInput.parse({ name: "Oakridge", ...over }));
}

describe("opening WhatsApp", () => {
  it("dials the international number, not the one the sheet happened to hold", () => {
    const made = lead({ phone: "9019959088" });
    openWhatsApp(db, made.id, "");
    expect(opened).toEqual(["https://wa.me/919019959088"]);
  });

  it("does not double the country code on a number that already has one", () => {
    const made = lead({ phone: "+91 90199 59088" });
    openWhatsApp(db, made.id, "");
    expect(opened).toEqual(["https://wa.me/919019959088"]);
  });

  it("carries the message as text, encoded", () => {
    const made = lead({ phone: "9019959088" });
    openWhatsApp(db, made.id, "Hi there — following up?");
    expect(opened[0]).toBe(
      "https://wa.me/919019959088?text=Hi%20there%20%E2%80%94%20following%20up%3F",
    );
  });

  it("refuses a lead marked do not contact", () => {
    // The flag is enforced where the reaching-out happens rather than by
    // hiding a button. A flag only the screen respects is not a flag.
    const made = lead({ phone: "9019959088", doNotContact: true });
    expect(() => openWhatsApp(db, made.id, "Hello")).toThrow(/do not contact/);
    expect(opened).toEqual([]);
  });

  it("says so rather than opening a broken link when there is no number", () => {
    const made = lead({ phone: null });
    expect(() => openWhatsApp(db, made.id, "Hello")).toThrow(/no usable phone number/);
    expect(opened).toEqual([]);
  });
});
