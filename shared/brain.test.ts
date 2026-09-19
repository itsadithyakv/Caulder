import { describe, expect, it } from "vitest";
import {
  BRAIN_SECTIONS,
  BRAIN_SECTION_LIST,
  BRAIN_TEMPLATES,
  cleanFields,
  evaluateChecklist,
  lastFour,
  maskSecret,
  quarterLabel,
  quarterOf,
  quartersFrom,
  templateFits,
  templateOf,
  type ChecklistPage,
} from "./brain";

describe("the sections and templates", () => {
  it("lists all fifteen sections, each with its own templates", () => {
    expect(BRAIN_SECTION_LIST.map((section) => section.id)).toEqual([...BRAIN_SECTIONS]);
    for (const section of BRAIN_SECTION_LIST) {
      // Every section offers a kind of page, except the four whose things
      // became rows: products (phase 8, on Money), documents (phase 9),
      // people (phase 10) and metrics (phase 11), listed in their section.
      // What is left there is written as blank pages.
      if (!["products", "documents", "people", "metrics"].includes(section.id)) {
        expect(section.templates.length).toBeGreaterThan(0);
      }
      for (const id of section.templates) expect(templateOf(id).section).toBe(section.id);
    }
  });

  it("never reuses a template id or a field key within a template", () => {
    const ids = BRAIN_TEMPLATES.map((template) => template.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const template of BRAIN_TEMPLATES) {
      const keys = template.fields.map((field) => field.key);
      expect(new Set(keys).size, template.id).toBe(keys.length);
    }
  });

  it("gives every choice field its choices", () => {
    for (const template of BRAIN_TEMPLATES) {
      for (const field of template.fields) {
        if (field.kind === "choice") expect(field.options?.length, field.key).toBeGreaterThan(1);
      }
    }
  });

  it("lets a blank page go anywhere and a template only in its own section", () => {
    expect(templateFits("page", "legal")).toBe(true);
    expect(templateFits("bank", "company")).toBe(true);
    expect(templateFits("bank", "ideas")).toBe(false);
    expect(templateOf("no-such-thing").id).toBe("page");
  });
});

describe("cleaning fields", () => {
  const profile = templateOf("profile");
  const contract = templateOf("contract");

  it("keeps what the template defines, and drops everything else", () => {
    expect(cleanFields(profile, { legalName: "  Unifloe Pvt Ltd ", invented: "x" })).toEqual({
      legalName: "Unifloe Pvt Ltd",
    });
  });

  it("never keeps a secret as a plain field", () => {
    expect(cleanFields(profile, { pan: "ABCDE1234F" })).toEqual({});
  });

  it("reads numbers the way people type them", () => {
    expect(cleanFields(contract, { value: "45,000", noticeDays: "18" })).toEqual({
      value: 45000,
      noticeDays: 18,
    });
    expect(() => cleanFields(contract, { value: "a lot" })).toThrow("Value has to be a number.");
    expect(() => cleanFields(contract, { value: -5 })).toThrow("cannot be negative");
  });

  it("checks dates, choices and quarters", () => {
    expect(() => cleanFields(profile, { incorporatedOn: "31/03/2024" })).toThrow("has to be a date");
    expect(() => cleanFields(profile, { entityType: "empire" })).toThrow("one of its choices");
    expect(cleanFields(profile, { entityType: "llp", incorporatedOn: "2024-03-31" })).toEqual({
      entityType: "llp",
      incorporatedOn: "2024-03-31",
    });
    expect(() => cleanFields(templateOf("goal"), { quarter: "Q3" })).toThrow("has to be a quarter");
  });

  it("gives a web address a scheme and refuses anything that is not the web", () => {
    expect(cleanFields(profile, { website: "unifloe.in" })).toEqual({ website: "https://unifloe.in" });
    expect(() => cleanFields(profile, { website: "javascript:alert(1)" })).toThrow("web address");
    expect(() => cleanFields(profile, { email: "not an email" })).toThrow("email address");
  });

  it("does not store empty values or an unticked box", () => {
    expect(cleanFields(templateOf("bank"), { bankName: "", onInvoices: false })).toEqual({});
    expect(cleanFields(templateOf("bank"), { onInvoices: true })).toEqual({ onInvoices: true });
  });
});

describe("masking", () => {
  it("shows the last four and no more", () => {
    expect(maskSecret(lastFour("ABCDE1234F"))).toBe("•••• 234F");
    expect(maskSecret(lastFour("0012 3456 7890"))).toBe("•••• 7890");
    expect(maskSecret(lastFour("1234"))).toBe("••••");
  });
});

describe("quarters", () => {
  it("names calendar quarters by their months", () => {
    expect(quarterOf("2026-09-17")).toBe("2026-Q3");
    expect(quarterLabel("2026-Q3")).toBe("Jul–Sep 2026");
    expect(quartersFrom("2026-11-02")).toEqual(["2026-Q4", "2027-Q1", "2027-Q2", "2027-Q3"]);
  });
});

describe("write these down first", () => {
  const page = (template: string, fields: ChecklistPage["fields"] = {}, secretKeys: string[] = []) => ({
    template,
    fields,
    secretKeys,
  });
  const NOBODY = { count: 0, withOwns: 0, withEquity: 0 };
  const done = (pages: ChecklistPage[], pricedProducts = 0, founders = NOBODY) =>
    evaluateChecklist(pages, "2026-09-17", { pricedProducts, founders })
      .filter((item) => item.done)
      .map((item) => item.id);

  it("has twelve items and none done on a new company", () => {
    const items = evaluateChecklist([], "2026-09-17", { pricedProducts: 0, founders: NOBODY });
    expect(items).toHaveLength(12);
    expect(items.every((item) => !item.done)).toBe(true);
  });

  it("reads the first product from the catalogue, not from a page, and opens it there", () => {
    // Products stopped being pages in phase 8; the item goes to Money.
    expect(done([], 1)).toEqual(["product"]);
    const item = evaluateChecklist([], "2026-09-17", { pricedProducts: 1, founders: NOBODY }).find(
      (entry) => entry.id === "product",
    );
    expect(item).toMatchObject({ goes: "catalogue", done: true });
  });

  it("counts a secret that is held as written down", () => {
    expect(done([page("profile", {}, ["pan"])])).toEqual(["numbers"]);
  });

  it("wants what each founder owns and their equity, for every founder, read from People", () => {
    // Founders stopped being pages in phase 10; the items open the People section.
    expect(done([], 0, { count: 2, withOwns: 2, withEquity: 1 })).toEqual(["founders"]);
    expect(done([], 0, { count: 1, withOwns: 1, withEquity: 1 })).toEqual(["founders", "equity"]);
    const items = evaluateChecklist([], "2026-09-17", {
      pricedProducts: 0,
      founders: { count: 2, withOwns: 1, withEquity: 0 },
    });
    expect(items.find((item) => item.id === "founders")).toMatchObject({
      done: false,
      progress: "2 written",
      goes: "section",
      section: "people",
    });
  });

  it("wants a bank account that prints on invoices and has its number", () => {
    expect(done([page("bank", { onInvoices: true })])).toEqual([]);
    expect(done([page("bank", { onInvoices: true }, ["number"])])).toEqual(["bank"]);
  });

  it("wants three goals for this quarter, and says how many so far", () => {
    const goal = (quarter: string) => page("goal", { quarter });
    const items = evaluateChecklist([goal("2026-Q3"), goal("2026-Q2")], "2026-09-17", {
      pricedProducts: 0,
      founders: NOBODY,
    });
    expect(items.find((item) => item.id === "goals")).toMatchObject({ done: false, progress: "1 of 3" });
    expect(done([goal("2026-Q3"), goal("2026-Q3"), goal("2026-Q3")])).toEqual(["goals"]);
  });
});
