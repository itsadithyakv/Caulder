import { test, expect, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import ExcelJS from "exceljs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { choose } from "./choose";
import { goTo, passSetup } from "./nav";

/**
 * Part thirteen through the real window: GST on an invoice to a client in
 * another state, due by their terms; a quote nobody answered, on Today; and
 * hours set aside for a client, invoiced from their page.
 */

let userDataDir: string;
let app: ElectronApplication | null = null;

async function openApp(): Promise<Page> {
  app = await electron.launch({ args: [".", `--user-data-dir=${userDataDir}`], env: { ...process.env, ELECTRON_ENABLE_LOGGING: "0" } });
  const page = await app.firstWindow();
  await page.waitForSelector(".firstrun");
  await page.getByLabel("Company name").fill("Unifloe");
  await choose(page, "Country", "India");
  await page.getByRole("button", { name: "Create company" }).click();
  await passSetup(page);
  await expect(page.getByRole("button", { name: /Company: Unifloe/ })).toBeVisible();
  return page;
}

test.beforeEach(() => {
  userDataDir = mkdtempSync(join(tmpdir(), "caulder-tax-"));
});

test.afterEach(async () => {
  await app?.close();
  app = null;
  rmSync(userDataDir, { recursive: true, force: true });
});

test("GST is charged as IGST to a client in another state, and the invoice is due by their terms", async () => {
  const page = await openApp();
  await page.evaluate(async () => {
    const c = (await window.caulder.companies.list()).activeCompanyId as string;
    const lead = await window.caulder.leads.create(c, { name: "Harbour Coffee Roasters" } as never);
    await window.caulder.billing.setClient(c, lead.id, { taxNumber: "27AAACR5055K1Z5", taxCountry: null, taxRegion: null, paymentTerms: 30, hourlyRate: null });
  });

  await goTo(page, "Settings");
  await page.getByRole("radio", { name: "Registered", exact: true }).click();
  await page.getByLabel("GSTIN").fill("29ABCDE1234F1Z5");
  await page.getByLabel("GSTIN").blur();

  await goTo(page, "Money");
  await page.getByRole("button", { name: "New invoice" }).click();
  await choose(page, "Contact", "Harbour Coffee Roasters");
  await page.getByLabel("Line 1 description").fill("Brand identity");
  await page.getByLabel("Line 1 unit price").fill("50000");
  const sums = page.getByLabel("What it comes to");
  await expect(sums).toContainText("IGST 18%");
  await expect(sums).toContainText("59,000");
  await page.getByRole("button", { name: "Save invoice" }).click();

  const row = page.locator(".money__row", { hasText: "INV-0001" });
  await expect(row).toContainText("59,000");
  const due = await page.evaluate(async () => {
    const c = (await window.caulder.companies.list()).activeCompanyId as string;
    const money = await window.caulder.money.get(c);
    const invoice = money.invoices[0];
    return invoice ? { issued: invoice.issuedOn, due: invoice.dueOn } : null;
  });
  expect(due).not.toBeNull();
  const days = (Date.parse(`${due?.due}T00:00:00Z`) - Date.parse(`${due?.issued}T00:00:00Z`)) / 86_400_000;
  expect(days).toBe(30);
});

test("a quote nobody answered is on Today, and Accepted makes its invoice", async () => {
  const page = await openApp();
  await page.evaluate(async () => {
    const c = (await window.caulder.companies.list()).activeCompanyId as string;
    const lead = await window.caulder.leads.create(c, { name: "Kettle and Crumb" } as never);
    const old = new Date(Date.now() - 10 * 86_400_000).toISOString().slice(0, 10);
    await window.caulder.money.saveQuote(c, null, { leadId: lead.id, issuedOn: old, notes: null, lines: [{ description: "Menu design", quantity: 1, unitPrice: 12000, productId: null }] });
    const money = await window.caulder.money.get(c);
    const quote = money.quotes[0];
    if (quote) await window.caulder.money.setQuoteStatus(c, quote.id, "sent");
  });
  // Made behind the screen's back: away and back again, so Today reads it.
  await goTo(page, "Money");
  await goTo(page, "Today");
  const card = page.locator(".card", { hasText: "A quote with no answer" });
  await expect(card).toContainText("Kettle and Crumb");
  await card.getByRole("button", { name: "Accepted" }).click();
  await expect(card).toHaveCount(0);
  await goTo(page, "Money");
  await expect(page.locator(".money__row", { hasText: "INV-0001" })).toContainText("Kettle and Crumb");
});

test("billable hours for a client are invoiced from their page", async () => {
  const page = await openApp();
  await page.evaluate(async () => {
    const c = (await window.caulder.companies.list()).activeCompanyId as string;
    const lead = await window.caulder.leads.create(c, { name: "Studio Palma" } as never);
    await window.caulder.billing.setClient(c, lead.id, { taxNumber: null, taxCountry: null, taxRegion: null, paymentTerms: null, hourlyRate: 2000 });
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    await window.caulder.day.createBlock(c, { day: yesterday, startsAt: "10:00", minutes: 90, title: "Brand workshop" } as never);
    const plan = await window.caulder.day.get(c, yesterday);
    const block = plan.blocks.find((each) => each.title === "Brand workshop");
    if (block) await window.caulder.hours.setFor(block.id, { leadId: lead.id, billable: true });
  });
  await goTo(page, "Contacts");
  await page.locator(".leadrow").first().click();
  await page.locator(".clientbilling summary").click();
  const hours = page.locator(".hourstobill");
  await expect(hours).toContainText("1h 30m");
  await hours.getByRole("button", { name: "Invoice the hours" }).click();
  await expect(page.locator(".clientbilling")).toContainText("INV-0001 drafted from the hours");
});

test("the accountant's pack writes the year's invoices, their tax and their PDFs", async () => {
  const page = await openApp();
  const target = join(userDataDir, "pack-out");
  mkdirSync(target, { recursive: true });
  await app?.evaluate(({ dialog, shell }, path) => {
    dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: [path] } as never);
    shell.openPath = () => Promise.resolve("");
  }, target);
  await page.evaluate(async () => {
    const c = (await window.caulder.companies.list()).activeCompanyId as string;
    await window.caulder.billing.setCompany(c, { taxOn: true, taxRate: 18, taxInclusive: false, taxRegion: null, taxNumber: "29ABCDE1234F1Z5", paymentTerms: null, hourlyRate: null });
    const lead = await window.caulder.leads.create(c, { name: "Harbour Coffee Roasters" } as never);
    await window.caulder.billing.setClient(c, lead.id, { taxNumber: "29AAACR5055K1Z5", taxCountry: null, taxRegion: null, paymentTerms: null, hourlyRate: null });
    const today = new Date().toISOString().slice(0, 10);
    const money = await window.caulder.money.saveInvoice(c, null, { leadId: lead.id, issuedOn: today, dueOn: today, notes: null, lines: [{ description: "Brand identity", quantity: 1, unitPrice: 10000, productId: null }] });
    const invoice = money.invoices[0];
    if (invoice) await window.caulder.money.setInvoiceStatus(c, invoice.id, "sent");
  });

  await goTo(page, "Money");
  await page.getByRole("button", { name: "For the accountant" }).click();
  const dialog = page.getByRole("dialog", { name: "For the accountant" });
  await dialog.getByRole("button", { name: "This financial year" }).click();
  await dialog.getByRole("button", { name: "Choose a folder" }).click();
  await expect(dialog).toContainText("one invoice, written.");

  const [folder] = readdirSync(target);
  expect(folder).toMatch(/^Unifloe accounts FY \d{4}-\d{2}$/);
  const root = join(target, folder ?? "");
  expect(readdirSync(join(root, "Invoices"))).toEqual(["INV-0001.pdf"]);
  const book = new ExcelJS.Workbook();
  await book.xlsx.readFile(join(root, "accounts.xlsx"));
  const header = book.getWorksheet("Invoices")?.getRow(1).values as unknown[];
  expect(header).toEqual(expect.arrayContaining(["CGST 9%", "SGST 9%"]));
  const row = book.getWorksheet("Invoices")?.getRow(2).values as unknown[];
  expect(row).toEqual(expect.arrayContaining(["INV-0001", 10000, 900, 11800]));
});
