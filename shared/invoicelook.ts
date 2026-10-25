import { z } from "zod";

/**
 * How a company's invoices look, and where their files go (PLAN.md, part
 * fourteen). Kept as one JSON value on the company (`companies.invoice_look`,
 * migration 61) by electron/main/repositories/billing.ts, and read by
 * services/invoice.ts and invoice-html.ts.
 *
 * Few choices on purpose: three layouts, six inks, a logo and a closing line
 * cover what a one-person company is asked for. The colours are the
 * document's, printed on paper, not the window's - so they live here and not
 * in tokens.css, and they do not follow the app's theme.
 */

export const INVOICE_LAYOUTS = ["classic", "band", "compact"] as const;
type InvoiceLayout = (typeof INVOICE_LAYOUTS)[number];

export const INVOICE_LAYOUT_LABEL: Record<InvoiceLayout, string> = {
  classic: "Classic",
  band: "Banner",
  compact: "Compact",
};

/** Inks that print well on white and stay readable photocopied. */
export const INVOICE_INKS = {
  ink: { label: "Ink", hex: "#1a1f2b" },
  blue: { label: "Blue", hex: "#1f4e8c" },
  teal: { label: "Teal", hex: "#0f6b6b" },
  green: { label: "Green", hex: "#2f6b2f" },
  plum: { label: "Plum", hex: "#5b2a6e" },
  rust: { label: "Rust", hex: "#9a3d12" },
} as const;
export type InvoiceInk = keyof typeof INVOICE_INKS;
const INK_IDS = Object.keys(INVOICE_INKS) as [InvoiceInk, ...InvoiceInk[]];

/** Copies kept in a folder of the person's own, as well as on the contact. */
export const INVOICE_FOLDERING = ["flat", "year", "month", "client"] as const;
type InvoiceFoldering = (typeof INVOICE_FOLDERING)[number];

export const INVOICE_FOLDERING_LABEL: Record<InvoiceFoldering, string> = {
  flat: "All in one",
  year: "By year",
  month: "By month",
  client: "By client",
};

const INVOICE_NAMINGS = ["number", "number-client"] as const;


export const invoiceLookInput = z.object({
  layout: z.enum(INVOICE_LAYOUTS).default("classic"),
  ink: z.enum(INK_IDS).default("ink"),
  /** A closing line: thanks, a late-payment term, a registration line. */
  footer: z.string().trim().max(500, "Keep the closing line under 500 characters.").nullable().default(null),
  /** Whether the logo chosen is printed. The file itself is kept beside the attachments. */
  logo: z.boolean().default(false),
  /** A folder of the person's own that a copy of each invoice goes into, or null for none. */
  folder: z.string().max(1000).nullable().default(null),
  foldering: z.enum(INVOICE_FOLDERING).default("year"),
  naming: z.enum(INVOICE_NAMINGS).default("number-client"),
  /** Numbers printed under the company's name: PAN, Udyam, ABN, SIRET, a company number. */
  ids: z
    .array(z.object({ label: z.string().trim().min(1, "Name the number.").max(30), value: z.string().trim().min(1, "Give the number.").max(60) }))
    .max(6, "Six numbers is the limit.")
    .default([]),
  /** The amount due written out in words, as Indian invoices usually are. Left out, on in India. */
  words: z.boolean().optional(),
  /** How an invoice's number is written: INV-0042, PK/26-27/0042, 2026-00042. */
  numbering: z
    .object({
      prefix: z
        .string()
        .trim()
        .max(5, "Keep the prefix to five characters, so a number fits in sixteen.")
        .regex(/^[A-Za-z0-9-]*$/, "A prefix is letters, digits and hyphens."),
      year: z.enum(["none", "calendar", "financial"]),
      digits: z.number().int().min(3).max(5),
    })
    .default({ prefix: "INV", year: "none", digits: 4 }),
});
export type InvoiceLook = z.infer<typeof invoiceLookInput>;

export const DEFAULT_INVOICE_LOOK: InvoiceLook = invoiceLookInput.parse({});

/** The look kept on a company, or the default for one never set or set by an older build. */
export function readInvoiceLook(raw: string | null): InvoiceLook {
  if (!raw) return DEFAULT_INVOICE_LOOK;
  try {
    const parsed = invoiceLookInput.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : DEFAULT_INVOICE_LOOK;
  } catch {
    return DEFAULT_INVOICE_LOOK;
  }
}

/** A name Windows will take for a file or a folder: no \ / : * ? " < > |, no trailing dot or space. */
function safeName(name: string): string {
  return name.replace(/[<>:"/\\|?*]+/g, "").replace(/[\s.]+$/, "").trim().slice(0, 80) || "Unnamed";
}

/**
 * Where an invoice's copy goes inside the chosen folder, as the parts of a
 * path: "2026/INV-0007 Harbour Coffee.pdf", "2026/10 October/…",
 * "Harbour Coffee/INV-0007.pdf".
 */
export function invoiceFilePath(
  look: Pick<InvoiceLook, "foldering" | "naming">,
  invoice: { number: string; issuedOn: string; client: string | null },
): string[] {
  const client = safeName(invoice.client ?? "No client");
  const file = look.naming === "number-client" && look.foldering !== "client" ? `${invoice.number} ${client}.pdf` : `${invoice.number}.pdf`;
  const year = invoice.issuedOn.slice(0, 4);
  const month = Number(invoice.issuedOn.slice(5, 7));
  const monthName = new Date(Date.UTC(2000, month - 1, 1)).toLocaleString("en-GB", { month: "long", timeZone: "UTC" });
  switch (look.foldering) {
    case "flat":
      return [file];
    case "year":
      return [year, file];
    case "month":
      return [year, `${String(month).padStart(2, "0")} ${monthName}`, file];
    case "client":
      return [client, file];
  }
}

/**
 * An invoice's number as it is printed and searched for. The count never
 * starts again - unique for good is unique within any year, which is what
 * India's rule 46 asks - so a year in it says when, not which series.
 * "INV-0042"; "PK/26-27/0042" with India's financial year; "2026/00042".
 */
export function formatInvoiceNumber(
  numbering: InvoiceLook["numbering"],
  number: number,
  issuedOn: string,
  /** The month the company's financial year starts (its tax rules). */
  starts: number,
): string {
  const count = String(number).padStart(numbering.digits, "0");
  const year = Number(issuedOn.slice(0, 4));
  const span =
    numbering.year === "none"
      ? null
      : numbering.year === "financial" && starts !== 1
        ? (() => {
            const from = Number(issuedOn.slice(5, 7)) >= starts ? year : year - 1;
            return `${String(from % 100).padStart(2, "0")}-${String((from + 1) % 100).padStart(2, "0")}`;
          })()
        : String(year);
  const prefix = numbering.prefix.trim();
  if (span) return [prefix, span, count].filter(Boolean).join("/");
  return prefix ? `${prefix}-${count}` : count;
}
