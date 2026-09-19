import { beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { migrate } from "../db/migrations";
import { companyCountry, createCompany, findCompany, setCompanyCountry, setCompanyTimezone } from "../repositories/companies";
import { buildDeadlines } from "./deadlines";
import { guessCountry, isCurrency } from "@shared/countries";
import { phoneKey } from "@shared/normalise";

/**
 * Anywhere, not only India: a company's country decides the money it starts
 * on and the filing calendar it is offered, and a company from before
 * countries keeps what it had.
 */

let db: Database.Database;

beforeEach(() => {
  db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrate(db);
});

describe("a company's country", () => {
  it("starts it on that country's money, unless another is chosen", () => {
    const london = createCompany(db, { name: "Northwind", accent: "blue", timezone: "Europe/London", country: "GB" });
    expect(london).toMatchObject({ country: "GB", currency: "GBP" });
    const berlin = createCompany(db, { name: "Kaffee", accent: "blue", timezone: "Europe/Berlin", country: "DE", currency: "USD" });
    expect(berlin).toMatchObject({ country: "DE", currency: "USD" });
  });

  it("leaves a company made without one as it always was", () => {
    const old = createCompany(db, { name: "Unifloe", accent: "blue", timezone: "Asia/Calcutta" });
    expect(old).toMatchObject({ country: null, currency: "INR" });
    // India, by its money and its clock - which is all Caulder assumed then.
    expect(companyCountry(db, old.id)).toBe("IN");
  });

  it("offers India's filings in India and the general set anywhere else", () => {
    const india = createCompany(db, { name: "Unifloe", accent: "blue", timezone: "Asia/Kolkata", country: "IN" }).id;
    const britain = createCompany(db, { name: "Northwind", accent: "blue", timezone: "Europe/London", country: "GB" }).id;
    expect(buildDeadlines(db, india).presetSet).toBe("india");
    expect(buildDeadlines(db, britain).presetSet).toBe("generic");
    setCompanyCountry(db, britain, "IN");
    expect(buildDeadlines(db, britain).presetSet).toBe("india");
  });

  it("refuses a country or a timezone that is not one", () => {
    const company = createCompany(db, { name: "Acme", accent: "blue", timezone: "UTC", country: "US" }).id;
    expect(() => setCompanyCountry(db, company, "ZZ")).toThrow("not a country");
    expect(() => setCompanyTimezone(db, company, "Mars/Olympus")).toThrow("not a timezone");
    setCompanyTimezone(db, company, "America/Chicago");
    expect(findCompany(db, company)?.timezone).toBe("America/Chicago");
  });
});

describe("the first guess, and the money", () => {
  it("reads the country from a timezone only one country uses, then from the language setting", () => {
    // A computer in India set to American English is in India.
    expect(guessCountry("en-US", "Asia/Calcutta")).toBe("IN");
    expect(guessCountry("en-IN", "UTC")).toBe("IN");
    expect(guessCountry("de-AT", "Europe/Vienna")).toBe("AT");
    expect(guessCountry("en", "Europe/London")).toBe("GB");
    expect(guessCountry("en", "UTC")).toBeNull();
  });

  it("knows every currency by its code", () => {
    expect(isCurrency("NGN")).toBe(true);
    expect(isCurrency("XXQ")).toBe(false);
    expect(isCurrency("inr")).toBe(false);
  });

  it("compares numbers without the company's own country code", () => {
    expect(phoneKey("+44 7700 900123", "44")).toBe(phoneKey("07700 900123", "44"));
    expect(phoneKey("+1 415 555 0100", "1")).toBe("4155550100");
    // With no country known, nothing is taken off.
    expect(phoneKey("+44 7700 900123", null)).toBe("447700900123");
  });
});
