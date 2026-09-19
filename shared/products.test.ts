import { describe, expect, it } from "vitest";
import { currentPrice, describeRecurrence, marginOf, priceInput, productInput, type Price } from "./products";

const price = (over: Partial<Price>): Price => ({
  id: over.name ?? "p",
  productId: "product",
  name: "Standard",
  amount: 1000,
  recurrence: "once",
  validFrom: null,
  validTo: null,
  ...over,
});

describe("the price that applies", () => {
  it("prefers a dated price, the latest that has started, over one with no dates", () => {
    const plain = price({ name: "List", amount: 1000 });
    const march = price({ name: "March", amount: 1200, validFrom: "2026-03-01" });
    const september = price({ name: "September", amount: 1500, validFrom: "2026-09-01" });
    expect(currentPrice([plain, march, september], "2026-09-17")?.name).toBe("September");
    expect(currentPrice([plain, march, september], "2026-04-01")?.name).toBe("March");
    expect(currentPrice([plain, march, september], "2026-01-01")?.name).toBe("List");
  });

  it("ignores one that has ended, and has nothing to say for an empty book", () => {
    const old = price({ name: "Launch", validFrom: "2026-01-01", validTo: "2026-06-30" });
    expect(currentPrice([old], "2026-09-17")).toBeNull();
    expect(currentPrice([old], "2026-02-01")?.name).toBe("Launch");
    expect(currentPrice([], "2026-09-17")).toBeNull();
  });
});

describe("margin", () => {
  it("is what is left of a price, in money and per cent, and unknown without a cost", () => {
    expect(marginOf(2000, 500)).toEqual({ amount: 1500, percent: 75 });
    expect(marginOf(2000, 2500)).toEqual({ amount: -500, percent: -25 });
    expect(marginOf(0, 0)).toEqual({ amount: 0, percent: 0 });
    expect(marginOf(2000, null)).toBeNull();
    expect(marginOf(null, 500)).toBeNull();
  });

  it("says how often a price is charged as the end of a sentence", () => {
    expect(describeRecurrence("once")).toBe("one-off");
    expect(describeRecurrence("monthly")).toBe("a month");
    expect(describeRecurrence("yearly")).toBe("a year");
  });
});

describe("what goes in", () => {
  it("takes a product with only a name, and refuses nonsense", () => {
    expect(productInput.parse({ name: " Workshop " })).toEqual({
      name: "Workshop",
      kind: "service",
      unit: null,
      status: "live",
      cost: null,
      taxRate: null,
      code: null,
      notes: null,
    });
    expect(() => productInput.parse({ name: "" })).toThrow("Give the product a name");
    expect(() => productInput.parse({ name: "X", cost: -1 })).toThrow("cannot be negative");
    expect(() => productInput.parse({ name: "X", cost: 10.5 })).toThrow("Whole units");
    expect(() => productInput.parse({ name: "X", taxRate: 120 })).toThrow("percentage");
  });

  it("takes a price with a shape and a window, and refuses a window that ends first", () => {
    expect(priceInput.parse({ amount: 15000 })).toMatchObject({ name: "Standard", recurrence: "once", validFrom: null });
    expect(priceInput.parse({ name: "Schools", amount: 2000, recurrence: "monthly", validFrom: "2026-09-01" })).toMatchObject(
      { name: "Schools", recurrence: "monthly" },
    );
    expect(() => priceInput.parse({ amount: 100, validFrom: "2026-09-01", validTo: "2026-08-01" })).toThrow(
      "cannot stop before it starts",
    );
    expect(() => priceInput.parse({ amount: 100, validFrom: "not a day" })).toThrow("Pick a date");
  });
});
