import { beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";

const { migrate } = await import("../db/migrations");
const { createCompany } = await import("../repositories/companies");
const { getSetting } = await import("../repositories/settings");
const { answerSupportAsk, supportState } = await import("./support");

/** The ask for support on Today (part six), as stored between launches. */

let db: Database.Database;
/** Asia/Kolkata is UTC+5:30: 20:00 UTC on the 25th is already the 26th there. */
const first = new Date("2026-09-25T20:00:00Z");
const on = (day: string) => new Date(`${day}T06:00:00Z`);

beforeEach(() => {
  db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrate(db);
  createCompany(db, { name: "Unifloe", accent: "blue", timezone: "Asia/Kolkata" });
});

describe("the ask for support", () => {
  it("asks nothing on the first day, and sets the day a month out by the workspace's clock", () => {
    expect(supportState(db, first)).toEqual({ ask: false });
    expect(getSetting(db, "supportAsk")).toBe("2026-10-26");
  });

  it("asks from that day on, until answered", () => {
    supportState(db, first);
    expect(supportState(db, on("2026-10-25"))).toEqual({ ask: false });
    expect(supportState(db, on("2026-10-26"))).toEqual({ ask: true });
    expect(supportState(db, on("2026-11-02"))).toEqual({ ask: true });
  });

  it("waits three months after Not now, and stops for good after never", () => {
    supportState(db, first);
    answerSupportAsk(db, "later", on("2026-10-26"));
    expect(supportState(db, on("2027-01-23"))).toEqual({ ask: false });
    expect(supportState(db, on("2027-01-24"))).toEqual({ ask: true });

    answerSupportAsk(db, "never", on("2027-01-24"));
    expect(supportState(db, on("2031-01-01"))).toEqual({ ask: false });
  });

  it("refuses an answer it does not know", () => {
    expect(() => answerSupportAsk(db, "maybe", first)).toThrow("That is not an answer to the ask.");
  });
});
