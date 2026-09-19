import type { Db } from "../db/connection";
import { today as todayIn } from "@shared/dates";
import type { Catalogue, PickableProduct, ProductDetail } from "@shared/products";
import {
  addPrice,
  buyersOf,
  chargedFor,
  createProduct,
  deletePrice,
  deleteProduct,
  findProduct,
  listPrices,
  listProducts,
  pickableProducts,
  salesFor,
  updatePrice,
  updateProduct,
} from "../repositories/products";

/**
 * The catalogue as a screen sees it: the company's own day and currency
 * around the products, and one product with its price book, what it was
 * actually charged at, and who bought it.
 */

function companyOf(db: Db, companyId: string): { timezone: string; currency: string } {
  const row = db.prepare(`SELECT timezone, currency FROM companies WHERE id = ?`).get(companyId) as
    | { timezone: string; currency: string }
    | undefined;
  if (!row) throw new Error("That company no longer exists.");
  return row;
}

export function buildCatalogue(db: Db, companyId: string, now: Date = new Date()): Catalogue {
  const company = companyOf(db, companyId);
  const day = todayIn(company.timezone, now);
  return { currency: company.currency, day, products: listProducts(db, companyId, day) };
}

export function productDetail(db: Db, productId: string, now: Date = new Date()): ProductDetail {
  const product = findProduct(db, productId);
  if (!product) throw new Error("That product no longer exists.");
  const company = companyOf(db, product.companyId);
  const day = todayIn(company.timezone, now);
  return {
    product,
    prices: listPrices(db, productId),
    charged: chargedFor(db, product),
    buyers: buyersOf(db, productId),
    sales: salesFor(db, product),
    currency: company.currency,
    day,
  };
}

export function forPicking(db: Db, companyId: string, now: Date = new Date()): PickableProduct[] {
  const company = companyOf(db, companyId);
  return pickableProducts(db, companyId, todayIn(company.timezone, now));
}

/* ---- Changes, each handing back what the screen is looking at ------------ */

export function newProduct(db: Db, companyId: string, raw: unknown, now: Date = new Date()): ProductDetail {
  companyOf(db, companyId);
  return productDetail(db, createProduct(db, companyId, raw, now).id, now);
}

export function editProduct(db: Db, id: string, raw: unknown, now: Date = new Date()): ProductDetail {
  return productDetail(db, updateProduct(db, id, raw, now).id, now);
}

export function removeProduct(db: Db, id: string, now: Date = new Date()): Catalogue {
  const product = findProduct(db, id);
  if (!product) throw new Error("That product no longer exists.");
  deleteProduct(db, id);
  return buildCatalogue(db, product.companyId, now);
}

export function newPrice(db: Db, productId: string, raw: unknown, now: Date = new Date()): ProductDetail {
  addPrice(db, productId, raw, now);
  return productDetail(db, productId, now);
}

export function editPrice(db: Db, id: string, raw: unknown, now: Date = new Date()): ProductDetail {
  const prices = updatePrice(db, id, raw, now);
  const productId = prices[0]?.productId;
  if (!productId) throw new Error("That price no longer exists.");
  return productDetail(db, productId, now);
}

export function removePrice(db: Db, id: string, now: Date = new Date()): ProductDetail {
  const row = db.prepare(`SELECT product_id FROM prices WHERE id = ?`).get(id) as { product_id: string } | undefined;
  if (!row) throw new Error("That price no longer exists.");
  deletePrice(db, id);
  return productDetail(db, row.product_id, now);
}
