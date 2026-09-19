import { randomUUID } from "node:crypto";
import type { Db } from "../db/connection";
import {
  currentPrice,
  priceInput,
  productInput,
  type Buyer,
  type Charged,
  type PickableProduct,
  type Price,
  type Product,
  type ProductRow,
  type ProductSales,
} from "@shared/products";

/**
 * The catalogue and the price book.
 *
 * A product's prices are what it asks; what it actually brought in is read
 * from the invoice lines that named it, so the two can differ and the
 * difference is the interesting part. Draft and void invoices are left out of
 * every total: a draft is not money and a void never was.
 */

type ProductRecord = {
  id: string;
  company_id: string;
  name: string;
  kind: string;
  unit: string | null;
  status: string;
  cost: number | null;
  tax_rate: number | null;
  code: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

type PriceRecord = {
  id: string;
  product_id: string;
  name: string;
  amount: number;
  recurrence: string;
  valid_from: string | null;
  valid_to: string | null;
};

function toProduct(row: ProductRecord): Product {
  return {
    id: row.id,
    companyId: row.company_id,
    name: row.name,
    kind: row.kind as Product["kind"],
    unit: row.unit,
    status: row.status as Product["status"],
    cost: row.cost,
    taxRate: row.tax_rate,
    code: row.code,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toPrice(row: PriceRecord): Price {
  return {
    id: row.id,
    productId: row.product_id,
    name: row.name,
    amount: row.amount,
    recurrence: row.recurrence as Price["recurrence"],
    validFrom: row.valid_from,
    validTo: row.valid_to,
  };
}

export function findProduct(db: Db, id: string): Product | null {
  const row = db.prepare(`SELECT * FROM products WHERE id = ?`).get(id) as ProductRecord | undefined;
  return row ? toProduct(row) : null;
}

function productOr(db: Db, id: string): Product {
  const product = findProduct(db, id);
  if (!product) throw new Error("That product no longer exists.");
  return product;
}

export function listPrices(db: Db, productId: string): Price[] {
  const rows = db
    .prepare(
      `SELECT * FROM prices WHERE product_id = ?
        ORDER BY (valid_from IS NULL), valid_from DESC, created_at DESC`,
    )
    .all(productId) as PriceRecord[];
  return rows.map(toPrice);
}

/** What each product has brought in, by product id. */
function salesOf(db: Db, companyId: string): Map<string, ProductSales> {
  const rows = db
    .prepare(
      `SELECT il.product_id AS id, COUNT(DISTINCT i.id) AS invoices,
              SUM(il.quantity) AS quantity, SUM(ROUND(il.quantity * il.unit_price)) AS value,
              MAX(i.issued_on) AS last_on
         FROM invoice_lines il
         JOIN invoices i ON i.id = il.invoice_id
        WHERE i.company_id = ? AND il.product_id IS NOT NULL AND i.status NOT IN ('draft', 'void')
        GROUP BY il.product_id`,
    )
    .all(companyId) as { id: string; invoices: number; quantity: number; value: number; last_on: string | null }[];
  return new Map(
    rows.map((row) => [
      row.id,
      { invoices: row.invoices, quantity: row.quantity, value: row.value, margin: null, lastOn: row.last_on },
    ]),
  );
}

function withCost(sales: ProductSales, cost: number | null): ProductSales {
  return { ...sales, margin: cost === null ? null : sales.value - Math.round(cost * sales.quantity) };
}

const NOTHING_SOLD: ProductSales = { invoices: 0, quantity: 0, value: 0, margin: null, lastOn: null };

/** The catalogue: every product with its prices, the one that applies today, and what it has sold. */
export function listProducts(db: Db, companyId: string, day: string): ProductRow[] {
  const rows = db
    .prepare(`SELECT * FROM products WHERE company_id = ? ORDER BY name COLLATE NOCASE`)
    .all(companyId) as ProductRecord[];
  const sales = salesOf(db, companyId);
  return rows.map((row) => {
    const product = toProduct(row);
    const prices = listPrices(db, product.id);
    return {
      ...product,
      prices,
      current: currentPrice(prices, day),
      sales: withCost(sales.get(product.id) ?? NOTHING_SOLD, product.cost),
    };
  });
}

/** What the picker on a quote offers: what is selling, first. */
export function pickableProducts(db: Db, companyId: string, day: string): PickableProduct[] {
  return listProducts(db, companyId, day)
    .filter((product) => product.status !== "idea")
    .sort((a, b) => {
      const mine = (status: string) => (status === "live" ? 0 : status === "building" ? 1 : 2);
      return mine(a.status) - mine(b.status) || a.name.localeCompare(b.name);
    })
    .map((product) => ({
      id: product.id,
      name: product.name,
      unit: product.unit,
      status: product.status,
      price: product.current,
      cost: product.cost,
    }));
}

/** What a product was charged at, newest first. A draft is not money yet. */
export function chargedFor(db: Db, product: Product, limit = 50): Charged[] {
  const rows = db
    .prepare(
      `SELECT i.id AS invoice_id, i.number, i.lead_id, l.name AS lead_name, i.issued_on,
              il.quantity, il.unit_price
         FROM invoice_lines il
         JOIN invoices i ON i.id = il.invoice_id
         JOIN leads l ON l.id = i.lead_id
        WHERE il.product_id = ? AND i.status NOT IN ('draft', 'void')
        ORDER BY i.issued_on DESC, i.number DESC
        LIMIT ?`,
    )
    .all(product.id, limit) as {
    invoice_id: string;
    number: number;
    lead_id: string;
    lead_name: string;
    issued_on: string;
    quantity: number;
    unit_price: number;
  }[];
  return rows.map((row) => ({
    invoiceId: row.invoice_id,
    number: row.number,
    leadId: row.lead_id,
    leadName: row.lead_name,
    issuedOn: row.issued_on,
    quantity: row.quantity,
    unitPrice: row.unit_price,
    margin: product.cost === null ? null : row.unit_price - product.cost,
  }));
}

/** Who has bought it, by what they have spent on it. */
export function buyersOf(db: Db, productId: string): Buyer[] {
  const rows = db
    .prepare(
      `SELECT i.lead_id, l.name, SUM(il.quantity) AS quantity,
              SUM(ROUND(il.quantity * il.unit_price)) AS value, MAX(i.issued_on) AS last_on
         FROM invoice_lines il
         JOIN invoices i ON i.id = il.invoice_id
         JOIN leads l ON l.id = i.lead_id
        WHERE il.product_id = ? AND i.status NOT IN ('draft', 'void')
        GROUP BY i.lead_id
        ORDER BY value DESC, l.name COLLATE NOCASE`,
    )
    .all(productId) as { lead_id: string; name: string; quantity: number; value: number; last_on: string }[];
  return rows.map((row) => ({
    leadId: row.lead_id,
    name: row.name,
    quantity: row.quantity,
    value: row.value,
    lastOn: row.last_on,
  }));
}

export function salesFor(db: Db, product: Product): ProductSales {
  return withCost(salesOf(db, product.companyId).get(product.id) ?? NOTHING_SOLD, product.cost);
}

/* ---- Writing ------------------------------------------------------------- */

export function createProduct(db: Db, companyId: string, raw: unknown, now: Date = new Date()): Product {
  const input = productInput.parse(raw);
  const id = randomUUID();
  const at = now.toISOString();
  db.prepare(
    `INSERT INTO products (id, company_id, name, kind, unit, status, cost, tax_rate, code, notes,
                           created_at, updated_at)
     VALUES (@id, @companyId, @name, @kind, @unit, @status, @cost, @taxRate, @code, @notes, @at, @at)`,
  ).run({ ...input, id, companyId, at });
  return productOr(db, id);
}

export function updateProduct(db: Db, id: string, raw: unknown, now: Date = new Date()): Product {
  productOr(db, id);
  const input = productInput.parse(raw);
  db.prepare(
    `UPDATE products SET name = @name, kind = @kind, unit = @unit, status = @status, cost = @cost,
       tax_rate = @taxRate, code = @code, notes = @notes, updated_at = @at
     WHERE id = @id`,
  ).run({ ...input, id, at: now.toISOString() });
  return productOr(db, id);
}

/**
 * Deletes a product. Its prices go with it; the invoice lines that named it
 * keep their words and their money and simply stop pointing anywhere, because
 * what was charged happened whatever the catalogue says now.
 */
export function deleteProduct(db: Db, id: string): void {
  db.prepare(`DELETE FROM products WHERE id = ?`).run(id);
}

export function addPrice(db: Db, productId: string, raw: unknown, now: Date = new Date()): Price[] {
  const product = productOr(db, productId);
  const input = priceInput.parse(raw);
  const at = now.toISOString();
  db.prepare(
    `INSERT INTO prices (id, company_id, product_id, name, amount, recurrence, valid_from, valid_to,
                         created_at, updated_at)
     VALUES (@id, @companyId, @productId, @name, @amount, @recurrence, @validFrom, @validTo, @at, @at)`,
  ).run({ ...input, id: randomUUID(), companyId: product.companyId, productId, at });
  return listPrices(db, productId);
}

export function updatePrice(db: Db, id: string, raw: unknown, now: Date = new Date()): Price[] {
  const row = db.prepare(`SELECT product_id FROM prices WHERE id = ?`).get(id) as { product_id: string } | undefined;
  if (!row) throw new Error("That price no longer exists.");
  const input = priceInput.parse(raw);
  db.prepare(
    `UPDATE prices SET name = @name, amount = @amount, recurrence = @recurrence,
       valid_from = @validFrom, valid_to = @validTo, updated_at = @at
     WHERE id = @id`,
  ).run({ ...input, id, at: now.toISOString() });
  return listPrices(db, row.product_id);
}

export function deletePrice(db: Db, id: string): void {
  db.prepare(`DELETE FROM prices WHERE id = ?`).run(id);
}

/** The product a line names, checked against the company. */
export function productInCompany(db: Db, companyId: string, productId: string): string {
  const row = db.prepare(`SELECT 1 FROM products WHERE id = ? AND company_id = ?`).get(productId, companyId);
  if (!row) throw new Error("That product is not in this company.");
  return productId;
}
