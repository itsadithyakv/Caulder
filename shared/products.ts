import { z } from "zod";
import { isDay } from "./dates";

/**
 * Products and pricing (PLAN.md, phase 8).
 *
 * A product is what the company sells; a price is what it asks for one, with
 * the days that price applied. What was actually charged is not here - it is
 * on the invoice lines, which say which product they were - so a product can
 * say both what it costs, what it asks, and what people in fact paid.
 */

export const PRODUCT_KINDS = ["service", "good", "subscription"] as const;
export type ProductKind = (typeof PRODUCT_KINDS)[number];

export const PRODUCT_KIND_LABEL: Record<ProductKind, string> = {
  service: "Service",
  good: "Something made",
  subscription: "Subscription",
};

export const PRODUCT_STATUSES = ["idea", "building", "live", "retired"] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

export const PRODUCT_STATUS_LABEL: Record<ProductStatus, string> = {
  idea: "An idea",
  building: "Being built",
  live: "Selling",
  retired: "Retired",
};

export const RECURRENCES = ["once", "monthly", "quarterly", "yearly"] as const;
export type Recurrence = (typeof RECURRENCES)[number];

export const RECURRENCE_LABEL: Record<Recurrence, string> = {
  once: "Once",
  monthly: "A month",
  quarterly: "A quarter",
  yearly: "A year",
};

/** How often a price is charged, as the end of a sentence: "₹2,000 a month". */
export function describeRecurrence(recurrence: Recurrence): string {
  return recurrence === "once" ? "one-off" : RECURRENCE_LABEL[recurrence].toLowerCase();
}

export type Product = {
  id: string;
  companyId: string;
  name: string;
  kind: ProductKind;
  /** What one of it is: a seat, a month, a workshop. */
  unit: string | null;
  status: ProductStatus;
  /** What one costs the company, in whole units. */
  cost: number | null;
  taxRate: number | null;
  /** HSN or SAC, for an Indian invoice. */
  code: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Price = {
  id: string;
  productId: string;
  name: string;
  amount: number;
  recurrence: Recurrence;
  validFrom: string | null;
  validTo: string | null;
};

/** What a product has actually brought in, from the invoices that named it. */
export type ProductSales = {
  /** Invoices it has been on, excluding drafts and voids. */
  invoices: number;
  quantity: number;
  value: number;
  /** Value less what it cost to make that many, when the cost is known. */
  margin: number | null;
  lastOn: string | null;
};

export type ProductRow = Product & {
  prices: Price[];
  /** The price that applies today, if any. */
  current: Price | null;
  sales: ProductSales;
};

/** One line of what a product was actually charged at, newest first. */
export type Charged = {
  invoiceId: string;
  number: number;
  leadId: string;
  leadName: string;
  issuedOn: string;
  quantity: number;
  unitPrice: number;
  /** Against the product's cost now, since that is the only cost known. */
  margin: number | null;
};

export type Buyer = {
  leadId: string;
  name: string;
  quantity: number;
  value: number;
  lastOn: string;
};

export type ProductDetail = {
  product: Product;
  prices: Price[];
  charged: Charged[];
  buyers: Buyer[];
  sales: ProductSales;
  currency: string;
  day: string;
};

export type Catalogue = {
  currency: string;
  day: string;
  products: ProductRow[];
};

/** A product and the price to put on a line, for the picker on a quote. */
export type PickableProduct = {
  id: string;
  name: string;
  unit: string | null;
  status: ProductStatus;
  price: Price | null;
  cost: number | null;
};

const money = (label: string) =>
  z
    .number({ message: `${label} has to be a number.` })
    .int("Whole units of the currency.")
    .min(0, `${label} cannot be negative.`)
    .max(1_000_000_000);

const day = z
  .string()
  .refine((value) => isDay(value), "Pick a date.")
  .nullable()
  .default(null);

export const productInput = z.object({
  name: z.string().trim().min(1, "Give the product a name.").max(160, "Keep the name under 160 characters."),
  kind: z.enum(PRODUCT_KINDS).default("service"),
  unit: z.string().trim().max(40).nullable().default(null),
  status: z.enum(PRODUCT_STATUSES).default("live"),
  cost: money("The cost").nullable().default(null),
  taxRate: z.number().min(0, "A rate cannot be negative.").max(100, "A rate is a percentage.").nullable().default(null),
  code: z.string().trim().max(40).nullable().default(null),
  notes: z.string().trim().max(4000).nullable().default(null),
});
export type ProductInput = z.input<typeof productInput>;

export const priceInput = z
  .object({
    name: z.string().trim().min(1, "Name the price: Standard, Teams, 50+ seats.").max(80).default("Standard"),
    amount: money("The price"),
    recurrence: z.enum(RECURRENCES).default("once"),
    validFrom: day,
    validTo: day,
  })
  .refine((input) => !input.validFrom || !input.validTo || input.validTo >= input.validFrom, {
    message: "A price cannot stop before it starts.",
    path: ["validTo"],
  });
export type PriceInput = z.input<typeof priceInput>;

/**
 * The price that applies on a day.
 *
 * A price with dates wins over one without, because saying "from March" is a
 * deliberate act and a price with no dates is only "what we ask". Between two
 * that both apply, the one that started later.
 */
export function currentPrice(prices: readonly Price[], day: string): Price | null {
  const applies = prices.filter(
    (price) => (!price.validFrom || price.validFrom <= day) && (!price.validTo || price.validTo >= day),
  );
  const dated = applies
    .filter((price) => price.validFrom !== null)
    .sort((a, b) => (b.validFrom ?? "").localeCompare(a.validFrom ?? ""));
  return dated[0] ?? applies[0] ?? null;
}

/** What is left of a price after what it cost to make. Null when the cost is not known. */
export function marginOf(amount: number | null, cost: number | null): { amount: number; percent: number } | null {
  if (amount === null || cost === null) return null;
  return { amount: amount - cost, percent: amount === 0 ? 0 : Math.round(((amount - cost) / amount) * 100) };
}
