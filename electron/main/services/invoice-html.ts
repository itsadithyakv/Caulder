/**
 * The invoice as a page of HTML, ready to print.
 *
 * Pure, so what an invoice says can be tested without a window. Every value is
 * escaped on the way in; the document is a table and two addresses, and a
 * string is the whole of the template.
 */

export type InvoiceDocument = {
  /** "Invoice", or "Tax invoice" where the law asks for the words (shared/tax.ts). */
  title?: string;
  from: {
    name: string;
    address: string | null;
    gstin: string | null;
    /** What the tax number is called where the company is: GSTIN in India. */
    taxLabel: string;
    email: string | null;
    phone: string | null;
    payTo: string[];
  };
  number: string;
  issuedOn: string;
  dueOn: string;
  to: string[];
  /** The client's own tax number, with its name: "GSTIN 27AAACR5055K1Z5". */
  toTax?: string | null;
  lines: { description: string; quantity: number; unitPrice: string; total: string; taxRate?: string | null; code?: string | null }[];
  /** Before tax, and the tax by component and rate, when any is charged. */
  subtotal?: string | null;
  tax?: { label: string; amount: string }[];
  /** Why no tax is charged: a reverse charge, an export, not registered, a composition scheme. */
  taxNote?: string | null;
  /** The company's other numbers, printed under its name: "PAN ABCDE1234F", "Udyam UDYAM-KR-03-0012345". */
  ids?: string[];
  /** What is due, in words: "Rupees Sixty-Six Thousand Eighty Only". */
  words?: string | null;
  /** A quote's words where an invoice's are: "Valid until" for "Due", "Quoted" for "Amount due". Left out, an invoice's. */
  dueLabel?: string;
  owedLabel?: string;
  total: string;
  paid: string | null;
  owed: string;
  notes: string | null;
  /** How it looks (shared/invoicelook.ts). Left out, it is the classic page in ink. */
  look?: {
    layout: "classic" | "band" | "compact";
    /** The ink, as a hex colour from `INVOICE_INKS`. */
    ink: string;
    /** The logo as a data: URL, already read; null for none. */
    logo: string | null;
    footer: string | null;
  };
};

/** Money as it is written where the company is (`localeFor` its country); this computer's way when none is said. */
export function money(value: number, currency: string, locale?: string): string {
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
  } catch {
    return `${currency} ${value.toLocaleString()}`;
  }
}

function escape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function lines(values: (string | null)[]): string {
  return values
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .map((value) => `<div>${escape(value)}</div>`)
    .join("");
}

export function invoiceHtml(doc: InvoiceDocument): string {
  // A column only when something is in it: a rate when tax is charged, a code when a product has one.
  const rated = doc.lines.some((line) => line.taxRate);
  const coded = doc.lines.some((line) => line.code);
  const rows = doc.lines
    .map(
      (line) => `<tr>
        <td>${escape(line.description)}</td>
        ${coded ? `<td>${escape(line.code ?? "")}</td>` : ""}
        <td class="n">${line.quantity}</td>
        <td class="n">${escape(line.unitPrice)}</td>
        ${rated ? `<td class="n">${escape(line.taxRate ?? "")}</td>` : ""}
        <td class="n">${escape(line.total)}</td>
      </tr>`,
    )
    .join("");
  const taxRows = (doc.tax ?? []).map((line) => `<tr><td>${escape(line.label)}</td><td class="n">${escape(line.amount)}</td></tr>`).join("");

  const from = doc.from;
  const contact = [from.email, from.phone].filter(Boolean).join(" · ");
  const look = doc.look ?? { layout: "classic", ink: "#1a1f2b", logo: null, footer: null };
  // Only a colour written as one reaches the style sheet.
  const ink = /^#[0-9a-f]{6}$/i.test(look.ink) ? look.ink : "#1a1f2b";
  // A logo only as an image the page itself carries: never a path or an address to fetch.
  const logo = look.logo && /^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(look.logo) ? look.logo : null;
  const layoutCss =
    look.layout === "band"
      ? `.head { background: ${ink}; color: #fff; margin: -48px -48px 40px; padding: 40px 48px 32px; }
  .head h1, .head .address, .head .meta, .head .meta strong, .head .from div { color: #fff; }
  .logo { background: #fff; padding: 6px; border-radius: 4px; }`
      : look.layout === "compact"
        ? `body { font-size: 11.5px; margin: 32px; }
  h1 { font-size: 22px; }
  .head { margin-bottom: 24px; }
  .to { margin-bottom: 20px; }
  td { padding: 5px 6px; }
  th { padding: 6px; }
  .notes, .pay { margin-top: 20px; }`
        : "";

  return `<!doctype html><html><head><meta charset="utf-8"><title>${escape(doc.number)}</title>
<style>
  body { font: 13px/1.5 -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; color: #1a1f2b; background: #fff; margin: 48px; }
  h1 { font-size: 28px; margin: 0 0 4px; letter-spacing: 0.02em; color: ${ink}; }
  .logo { display: block; max-height: 56px; max-width: 220px; margin-bottom: 12px; }
  .footer { margin-top: 40px; padding-top: 12px; border-top: 1px solid #e6e8ee; color: #777; font-size: 11px; white-space: pre-wrap; text-align: center; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; gap: 32px; }
  .from strong { display: block; margin-top: 4px; }
  .address { white-space: pre-line; color: #555; }
  .meta { text-align: right; color: #555; }
  .meta strong { color: #1a1f2b; }
  .to { margin-bottom: 32px; }
  h2 { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #777; margin: 0 0 6px; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #777; padding: 8px 6px; border-bottom: 1px solid #ccd; }
  td { padding: 10px 6px; border-bottom: 1px solid #e6e8ee; vertical-align: top; }
  .n { text-align: right; white-space: nowrap; }
  .totals { margin-top: 16px; margin-left: auto; width: 320px; }
  .totals td { border: none; padding: 4px 6px; }
  .totals .owed td { font-size: 18px; font-weight: 700; border-top: 2px solid ${ink}; padding-top: 10px; }
  .notes { margin-top: 40px; color: #555; white-space: pre-wrap; }
  .words { margin-top: 8px; text-align: right; color: #555; font-style: italic; }
  .pay { margin-top: 32px; padding-top: 16px; border-top: 1px solid #e6e8ee; }
  ${layoutCss}
</style></head><body>
  <div class="head">
    <div class="from">
      ${logo ? `<img class="logo" src="${logo}" alt="">` : ""}
      <h1>${escape(doc.title ?? "Invoice")}</h1>
      <strong>${escape(from.name)}</strong>
      ${from.address ? `<div class="address">${escape(from.address)}</div>` : ""}
      ${lines([from.gstin ? `${from.taxLabel} ${from.gstin}` : null, ...(doc.ids ?? []), contact || null])}
    </div>
    <div class="meta">
      <div><strong>${escape(doc.number)}</strong></div>
      <div>Issued ${escape(doc.issuedOn)}</div>
      ${doc.dueOn ? `<div>${escape(doc.dueLabel ?? "Due")} ${escape(doc.dueOn)}</div>` : ""}
    </div>
  </div>
  <div class="to"><h2>To</h2>${lines([...doc.to, doc.toTax ?? null])}</div>
  <table>
    <thead><tr><th>Description</th>${coded ? "<th>HSN/SAC</th>" : ""}<th class="n">Qty</th><th class="n">Unit price</th>${rated ? '<th class="n">Tax</th>' : ""}<th class="n">Amount</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <table class="totals">
    ${doc.subtotal && taxRows ? `<tr><td>Subtotal</td><td class="n">${escape(doc.subtotal)}</td></tr>${taxRows}` : ""}
    <tr><td>Total</td><td class="n">${escape(doc.total)}</td></tr>
    ${doc.paid ? `<tr><td>Paid</td><td class="n">${escape(doc.paid)}</td></tr>` : ""}
    <tr class="owed"><td>${escape(doc.owedLabel ?? "Amount due")}</td><td class="n">${escape(doc.owed)}</td></tr>
  </table>
  ${doc.words ? `<div class="words">${escape(doc.words)}</div>` : ""}
  ${doc.taxNote ? `<div class="notes">${escape(doc.taxNote)}</div>` : ""}
  ${doc.notes ? `<div class="notes">${escape(doc.notes)}</div>` : ""}
  ${from.payTo.length > 0 ? `<div class="pay"><h2>Pay to</h2>${lines(from.payTo)}</div>` : ""}
  ${look.footer ? `<div class="footer">${escape(look.footer)}</div>` : ""}
</body></html>`;
}
