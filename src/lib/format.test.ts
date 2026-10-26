import { afterEach, describe, expect, it } from "vitest";
import { localeFor } from "@shared/countries";
import { describeDue } from "@shared/dates";
import { formatDay, formatTime, formatValue, numberText, region, setRegion } from "./format";

/**
 * Money and dates read the way they do where the company is (phase 24): the
 * words English, the ways the region's.
 */
describe("formatting by the company's country", () => {
  afterEach(() => setRegion(undefined));

  it("writes each country's locale in English", () => {
    expect(localeFor("IN")).toBe("en-IN");
    expect(localeFor("us")).toBe("en-US");
    expect(localeFor(null)).toBeUndefined();
    expect(localeFor("XX")).toBeUndefined();
  });

  it("groups money in lakhs in India, and in thousands in the United States", () => {
    setRegion(localeFor("IN"));
    expect(formatValue(185000, "INR")).toBe("₹1,85,000");
    expect(numberText(185000)).toBe("1,85,000");
    setRegion(localeFor("US"));
    expect(formatValue(185000, "USD")).toBe("$185,000");
    expect(numberText(185000)).toBe("185,000");
  });

  it("puts the day first or the month first, as the region does", () => {
    setRegion(localeFor("GB"));
    expect(formatDay("2026-09-26")).toMatch(/^26 Sept? 2026$/);
    setRegion(localeFor("US"));
    expect(formatDay("2026-09-26")).toBe("Sep 26, 2026");
  });

  it("keeps a 24-hour clock where people use one", () => {
    setRegion(localeFor("DE"));
    expect(formatTime("13:05")).toBe("13:05");
    setRegion(localeFor("US"));
    expect(formatTime("13:05")).toMatch(/^1:05\sPM$/);
  });

  it("says a due day as the region does, and never the day before", () => {
    setRegion(localeFor("US"));
    // Midnight UTC would be the evening before in New York; the day is written in UTC.
    expect(describeDue("2026-12-25", "2026-09-26", region())).toBe("Dec 25");
    setRegion(localeFor("IN"));
    expect(describeDue("2026-12-25", "2026-09-26", region())).toBe("25 Dec");
  });
});
