import { describe, expect, it } from "vitest";
import { DEFAULT_INVOICE_LOOK, invoiceFilePath, readInvoiceLook } from "./invoicelook";

describe("how a company's invoices look", () => {
  it("is the look every invoice had before, when never set or unreadable", () => {
    expect(readInvoiceLook(null)).toEqual(DEFAULT_INVOICE_LOOK);
    expect(readInvoiceLook("not json")).toEqual(DEFAULT_INVOICE_LOOK);
    expect(readInvoiceLook(JSON.stringify({ layout: "neon" }))).toEqual(DEFAULT_INVOICE_LOOK);
    expect(readInvoiceLook(JSON.stringify({ layout: "band", ink: "teal" }))).toMatchObject({ layout: "band", ink: "teal", folder: null, foldering: "year" });
  });
});

describe("where an invoice's copy goes", () => {
  const invoice = { number: "INV-0007", issuedOn: "2026-10-04", client: "Harbour Coffee" };

  it("is filed by year, by month or by client, named by its number and client", () => {
    expect(invoiceFilePath({ foldering: "flat", naming: "number" }, invoice)).toEqual(["INV-0007.pdf"]);
    expect(invoiceFilePath({ foldering: "year", naming: "number-client" }, invoice)).toEqual(["2026", "INV-0007 Harbour Coffee.pdf"]);
    expect(invoiceFilePath({ foldering: "month", naming: "number" }, invoice)).toEqual(["2026", "10 October", "INV-0007.pdf"]);
    // In a client's own folder, their name in the file would say it twice.
    expect(invoiceFilePath({ foldering: "client", naming: "number-client" }, invoice)).toEqual(["Harbour Coffee", "INV-0007.pdf"]);
  });

  it("takes out what Windows will not have in a name", () => {
    expect(invoiceFilePath({ foldering: "client", naming: "number" }, { ...invoice, client: 'A/B: "Co."' })).toEqual(["AB Co", "INV-0007.pdf"]);
    expect(invoiceFilePath({ foldering: "client", naming: "number" }, { ...invoice, client: null })).toEqual(["No client", "INV-0007.pdf"]);
  });
});
