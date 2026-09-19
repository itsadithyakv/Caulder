import { describe, expect, it } from "vitest";
import { invoiceHtml, type InvoiceDocument } from "./invoice-html";

const base: InvoiceDocument = {
  from: { name: "Unifloe", address: null, gstin: null, taxLabel: "GSTIN", email: null, phone: null, payTo: [] },
  number: "INV-0007",
  issuedOn: "2026-09-17",
  dueOn: "2026-09-30",
  to: ["Oakridge School", "Asha"],
  lines: [{ description: "Workshop", quantity: 2, unitPrice: "₹15,000", total: "₹30,000" }],
  total: "₹30,000",
  paid: null,
  owed: "₹30,000",
  notes: null,
};

describe("the invoice page", () => {
  it("prints who it is from, with the address, GSTIN and contact details", () => {
    const html = invoiceHtml({
      ...base,
      from: {
        name: "Unifloe LLP",
        address: "12 MG Road\nBengaluru 560001",
        gstin: "29ABCDE1234F1Z5",
        taxLabel: "GSTIN",
        email: "hello@unifloe.in",
        phone: "+91 98450 00000",
        payTo: [],
      },
    });
    expect(html).toContain("<strong>Unifloe LLP</strong>");
    expect(html).toContain('<div class="address">12 MG Road\nBengaluru 560001</div>');
    expect(html).toContain("<div>GSTIN 29ABCDE1234F1Z5</div>");
    expect(html).toContain("<div>hello@unifloe.in · +91 98450 00000</div>");
  });

  it("adds a Pay to block only when there is an account to pay", () => {
    expect(invoiceHtml(base)).not.toContain("Pay to");
    const html = invoiceHtml({
      ...base,
      from: { ...base.from, payTo: ["Bank: HDFC", "IFSC: HDFC0001234"] },
    });
    expect(html).toContain('<div class="pay"><h2>Pay to</h2><div>Bank: HDFC</div><div>IFSC: HDFC0001234</div></div>');
  });

  it("escapes everything that came from a person", () => {
    const html = invoiceHtml({
      ...base,
      from: { ...base.from, name: "<script>x</script>", address: 'A & "B"' },
      to: ["<img src=x onerror=alert(1)>"],
      lines: [{ description: "<b>bold</b>", quantity: 1, unitPrice: "1", total: "1" }],
      notes: "</div><script>",
    });
    expect(html).not.toContain("<script>x");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<b>bold");
    expect(html).toContain("&lt;script&gt;x&lt;/script&gt;");
    expect(html).toContain("A &amp; &quot;B&quot;");
  });
});
