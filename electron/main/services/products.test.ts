import { beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { MIGRATIONS, migrate } from "../db/migrations";
import { createCompany } from "../repositories/companies";
import { createLead } from "../repositories/leads";
import { acceptQuote, saveInvoice, saveQuote, setInvoiceStatus } from "../repositories/money";
import {
  buildCatalogue,
  editProduct,
  forPicking,
  newPrice,
  newProduct,
  productDetail,
  removePrice,
  removeProduct,
} from "./products";
import { leadInput, type Company } from "@shared/domain";

/**
 * The catalogue: what a product asks, what it actually brought in, and the
 * move from the product pages the brain used to hold.
 */

let db: Database.Database;
let company: Company;
let school: { id: string };
const now = new Date("2026-09-17T06:00:00.000Z");

function product(name: string, over: Record<string, unknown> = {}) {
  return newProduct(db, company.id, { name, ...over }, now).product;
}

/** An invoice that is real money: sent, so it counts. */
function sold(productId: string | null, quantity: number, unitPrice: number, issuedOn = "2026-09-01") {
  const invoice = saveInvoice(db, company.id, null, {
    leadId: school.id,
    issuedOn,
    dueOn: issuedOn,
    notes: null,
    lines: [{ description: "Workshop", quantity, unitPrice, productId }],
  });
  setInvoiceStatus(db, company.id, invoice.id, "sent");
  return invoice;
}

beforeEach(() => {
  db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrate(db);
  company = createCompany(db, { name: "Unifloe", accent: "blue", timezone: "Asia/Kolkata" });
  school = createLead(db, company.id, leadInput.parse({ name: "Oakridge" }));
});

describe("the catalogue", () => {
  it("holds what is sold, with the price that applies today and the margin on it", () => {
    const workshop = product("Attendance workshop", { unit: "workshop", cost: 4000, code: "998314" });
    newPrice(db, workshop.id, { name: "List", amount: 15000 }, now);
    newPrice(db, workshop.id, { name: "Schools", amount: 12000, validFrom: "2026-09-01" }, now);
    product("Timetable licence", { kind: "subscription", unit: "month", status: "building" });

    const catalogue = buildCatalogue(db, company.id, now);
    expect(catalogue).toMatchObject({ currency: "INR", day: "2026-09-17" });
    expect(catalogue.products.map((row) => [row.name, row.current?.name, row.current?.amount])).toEqual([
      ["Attendance workshop", "Schools", 12000],
      ["Timetable licence", undefined, undefined],
    ]);
    // Two prices kept, the dated one first.
    expect(catalogue.products[0]?.prices.map((price) => price.name)).toEqual(["Schools", "List"]);
  });

  it("counts what invoices actually charged, and leaves drafts and voids out", () => {
    const workshop = product("Workshop", { cost: 4000 });
    newPrice(db, workshop.id, { amount: 15000 }, now);
    sold(workshop.id, 2, 15000, "2026-08-10");
    sold(workshop.id, 1, 12000, "2026-09-02");
    // A draft is not money yet, and a void never was.
    saveInvoice(db, company.id, null, {
      leadId: school.id,
      issuedOn: "2026-09-03",
      dueOn: "2026-09-10",
      notes: null,
      lines: [{ description: "Workshop", quantity: 5, unitPrice: 15000, productId: workshop.id }],
    });
    const voided = sold(workshop.id, 9, 15000, "2026-09-04");
    setInvoiceStatus(db, company.id, voided.id, "void");

    const detail = productDetail(db, workshop.id, now);
    expect(detail.sales).toMatchObject({ invoices: 2, quantity: 3, value: 42000, lastOn: "2026-09-02" });
    // Three sold at 4,000 each to make.
    expect(detail.sales.margin).toBe(42000 - 12000);
    expect(detail.charged.map((line) => [line.issuedOn, line.unitPrice, line.margin])).toEqual([
      ["2026-09-02", 12000, 8000],
      ["2026-08-10", 15000, 11000],
    ]);
    expect(detail.buyers).toEqual([
      { leadId: school.id, name: "Oakridge", quantity: 3, value: 42000, lastOn: "2026-09-02" },
    ]);
  });

  it("offers the picker what is selling, before what is being built, and never an idea", () => {
    const live = product("Workshop");
    newPrice(db, live.id, { amount: 15000 }, now);
    product("Licence", { status: "building" });
    product("Retired thing", { status: "retired" });
    product("Something one day", { status: "idea" });

    expect(forPicking(db, company.id, now).map((option) => [option.name, option.price?.amount])).toEqual([
      ["Workshop", 15000],
      ["Licence", undefined],
      ["Retired thing", undefined],
    ]);
  });

  it("keeps a line's words and money when the product goes, and carries the product to the invoice", () => {
    const workshop = product("Workshop", { cost: 1000 });
    newPrice(db, workshop.id, { amount: 15000 }, now);
    const quote = saveQuote(db, company.id, null, {
      leadId: school.id,
      issuedOn: "2026-09-10",
      notes: null,
      lines: [{ description: "Attendance workshop", quantity: 2, unitPrice: 15000, productId: workshop.id }],
    });
    expect(quote.lines[0]).toMatchObject({ productId: workshop.id, productName: "Workshop" });

    const invoice = acceptQuote(db, company.id, quote.id, now);
    expect(invoice.lines[0]).toMatchObject({ productId: workshop.id, unitPrice: 15000 });

    removeProduct(db, workshop.id, now);
    const after = saveQuote(db, company.id, quote.id, {
      leadId: school.id,
      issuedOn: "2026-09-10",
      notes: null,
      lines: quote.lines.map((line) => ({
        description: line.description,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
      })),
    });
    expect(after.lines[0]).toMatchObject({ description: "Attendance workshop", unitPrice: 15000, productId: null });
    expect(buildCatalogue(db, company.id, now).products).toEqual([]);
  });

  it("refuses a line naming another company's product, and edits and prices what it has", () => {
    const workshop = product("Workshop");
    const other = createCompany(db, { name: "PaperKite", accent: "teal", timezone: "Asia/Kolkata" });
    const theirs = newProduct(db, other.id, { name: "Theirs" }, now).product;
    expect(() =>
      saveQuote(db, company.id, null, {
        leadId: school.id,
        issuedOn: "2026-09-10",
        notes: null,
        lines: [{ description: "x", quantity: 1, unitPrice: 1, productId: theirs.id }],
      }),
    ).toThrow("not in this company");

    const renamed = editProduct(db, workshop.id, { name: "Attendance workshop", cost: 500 }, now);
    expect(renamed.product).toMatchObject({ name: "Attendance workshop", cost: 500 });

    const priced = newPrice(db, workshop.id, { name: "List", amount: 9000 }, now);
    expect(priced.prices).toHaveLength(1);
    expect(removePrice(db, priced.prices[0]!.id, now).prices).toEqual([]);
    expect(() => productDetail(db, "nope", now)).toThrow("no longer exists");
  });
});

describe("the move from product pages", () => {
  it("turns each brain product page into a product with its price, and takes the page away", () => {
    const old = new Database(":memory:");
    old.pragma("foreign_keys = ON");
    for (const migration of MIGRATIONS.filter((m) => m.version <= 24)) {
      old.exec(migration.sql);
      old.pragma(`user_version = ${migration.version}`);
    }
    const theirs = createCompany(old, { name: "Unifloe", accent: "blue", timezone: "Asia/Kolkata" });
    old
      .prepare(
        `INSERT INTO brain_pages (id, company_id, section, template, title, body, fields, created_at, updated_at)
         VALUES (?, ?, 'products', 'product', ?, ?, ?, ?, ?)`,
      )
      .run(
        "page-1",
        theirs.id,
        "Attendance workshop",
        "## What it is\n\nA day with the staff.",
        JSON.stringify({ status: "live", unit: "workshop", price: 15000, billing: "once", cost: 4000, taxRate: 18, hsn: "998314" }),
        "2026-04-01T00:00:00.000Z",
        "2026-04-02T00:00:00.000Z",
      );
    old
      .prepare(
        `INSERT INTO brain_pages (id, company_id, section, template, title, body, fields, created_at, updated_at)
         VALUES (?, ?, 'products', 'product', ?, '', ?, ?, ?)`,
      )
      .run("page-2", theirs.id, "Timetable licence", JSON.stringify({ status: "building", billing: "monthly", price: 2000 }), "2026-05-01T00:00:00.000Z", "2026-05-01T00:00:00.000Z");
    // A page that is not a product stays where it is.
    old
      .prepare(
        `INSERT INTO brain_pages (id, company_id, section, template, title, body, fields, created_at, updated_at)
         VALUES ('page-3', ?, 'products', 'page', 'How we price', 'Thinking.', '{}', '2026-05-02T00:00:00.000Z', '2026-05-02T00:00:00.000Z')`,
      )
      .run(theirs.id);

    migrate(old);

    const rows = buildCatalogue(old, theirs.id, now).products;
    expect(rows.map((row) => [row.name, row.kind, row.status, row.cost, row.taxRate, row.code])).toEqual([
      ["Attendance workshop", "service", "live", 4000, 18, "998314"],
      ["Timetable licence", "subscription", "building", null, null, null],
    ]);
    expect(rows[0]?.notes).toBe("## What it is\n\nA day with the staff.");
    expect(rows[0]?.prices).toMatchObject([{ name: "Standard", amount: 15000, recurrence: "once", validFrom: "2026-04-01" }]);
    expect(rows[1]?.prices).toMatchObject([{ amount: 2000, recurrence: "monthly" }]);

    const pages = old.prepare(`SELECT title FROM brain_pages ORDER BY title`).all() as { title: string }[];
    expect(pages.map((page) => page.title)).toEqual(["How we price"]);
  });
});
