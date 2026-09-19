/**
 * The invoice as a page of HTML, ready to print.
 *
 * Pure, so what an invoice says can be tested without a window. Every value is
 * escaped on the way in; the document is a table and two addresses, and a
 * string is the whole of the template.
 */

export type InvoiceDocument = {
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
  lines: { description: string; quantity: number; unitPrice: string; total: string }[];
  total: string;
  paid: string | null;
  owed: string;
  notes: string | null;
};

export function money(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 0 }).format(value);
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
  const rows = doc.lines
    .map(
      (line) => `<tr>
        <td>${escape(line.description)}</td>
        <td class="n">${line.quantity}</td>
        <td class="n">${escape(line.unitPrice)}</td>
        <td class="n">${escape(line.total)}</td>
      </tr>`,
    )
    .join("");

  const from = doc.from;
  const contact = [from.email, from.phone].filter(Boolean).join(" · ");

  return `<!doctype html><html><head><meta charset="utf-8"><title>${escape(doc.number)}</title>
<style>
  body { font: 13px/1.5 -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; color: #1a1f2b; margin: 48px; }
  h1 { font-size: 28px; margin: 0 0 4px; letter-spacing: 0.02em; }
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
  .totals .owed td { font-size: 18px; font-weight: 700; border-top: 2px solid #1a1f2b; padding-top: 10px; }
  .notes { margin-top: 40px; color: #555; white-space: pre-wrap; }
  .pay { margin-top: 32px; padding-top: 16px; border-top: 1px solid #e6e8ee; }
</style></head><body>
  <div class="head">
    <div class="from">
      <h1>Invoice</h1>
      <strong>${escape(from.name)}</strong>
      ${from.address ? `<div class="address">${escape(from.address)}</div>` : ""}
      ${lines([from.gstin ? `${from.taxLabel} ${from.gstin}` : null, contact || null])}
    </div>
    <div class="meta">
      <div><strong>${escape(doc.number)}</strong></div>
      <div>Issued ${escape(doc.issuedOn)}</div>
      <div>Due ${escape(doc.dueOn)}</div>
    </div>
  </div>
  <div class="to"><h2>To</h2>${lines(doc.to)}</div>
  <table>
    <thead><tr><th>Description</th><th class="n">Qty</th><th class="n">Unit price</th><th class="n">Amount</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <table class="totals">
    <tr><td>Total</td><td class="n">${escape(doc.total)}</td></tr>
    ${doc.paid ? `<tr><td>Paid</td><td class="n">${escape(doc.paid)}</td></tr>` : ""}
    <tr class="owed"><td>Amount due</td><td class="n">${escape(doc.owed)}</td></tr>
  </table>
  ${doc.notes ? `<div class="notes">${escape(doc.notes)}</div>` : ""}
  ${from.payTo.length > 0 ? `<div class="pay"><h2>Pay to</h2>${lines(from.payTo)}</div>` : ""}
</body></html>`;
}
