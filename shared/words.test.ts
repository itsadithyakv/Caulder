import { describe, expect, it } from "vitest";
import { amountInWords } from "./words";

describe("an amount in words", () => {
  it("says rupees in lakhs and crores", () => {
    expect(amountInWords(66080, "INR")).toBe("Rupees Sixty-Six Thousand Eighty Only");
    expect(amountInWords(1850000, "INR")).toBe("Rupees Eighteen Lakh Fifty Thousand Only");
    expect(amountInWords(25000000, "INR")).toBe("Rupees Two Crore Fifty Lakh Only");
    expect(amountInWords(0, "INR")).toBe("Rupees Zero Only");
  });

  it("says other currencies in thousands and millions, by their name", () => {
    expect(amountInWords(1200, "USD")).toBe("US Dollars One Thousand Two Hundred Only");
    expect(amountInWords(2500000, "EUR")).toBe("Euros Two Million Five Hundred Thousand Only");
  });
});
