import { test, expect, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { choose } from "./choose";
import { goTo, passSetup } from "./nav";

/**
 * Part fourteen through the real window: how a company's invoices look, set
 * in Settings, and a copy of each kept in a folder of the person's own, filed
 * by client.
 */

let userDataDir: string;
let app: ElectronApplication | null = null;

async function openApp(): Promise<Page> {
  app = await electron.launch({ args: [".", `--user-data-dir=${userDataDir}`], env: { ...process.env, ELECTRON_ENABLE_LOGGING: "0" } });
  const page = await app.firstWindow();
  await page.waitForSelector(".firstrun");
  await page.getByLabel("Company name").fill("PaperKite");
  await choose(page, "Country", "India");
  await page.getByRole("button", { name: "Create company" }).click();
  await passSetup(page);
  await expect(page.getByRole("button", { name: /Company: PaperKite/ })).toBeVisible();
  return page;
}

test.beforeEach(() => {
  userDataDir = mkdtempSync(join(tmpdir(), "caulder-invoices-"));
});

test.afterEach(async () => {
  await app?.close();
  app = null;
  rmSync(userDataDir, { recursive: true, force: true });
});

test("an invoice is printed in the look chosen, with its logo, and a copy is filed under its client", async () => {
  const page = await openApp();
  const folder = join(userDataDir, "Invoices");
  mkdirSync(folder, { recursive: true });
  // The smallest PNG there is: one transparent pixel.
  const logo = join(userDataDir, "logo.png");
  writeFileSync(logo, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64"));
  await app?.evaluate(({ dialog, shell }, paths) => {
    dialog.showOpenDialog = ((options: { properties?: string[] }) =>
      Promise.resolve({ canceled: false, filePaths: [options.properties?.includes("openDirectory") ? paths.folder : paths.logo] })) as never;
    shell.openPath = () => Promise.resolve("");
  }, { folder, logo });

  await goTo(page, "Settings");
  const card = page.locator(".card", { hasText: "Closing line" });
  await card.getByRole("button", { name: "Banner" }).click();
  await card.getByRole("button", { name: "Plum" }).click();
  await card.getByRole("button", { name: "Add a logo" }).click();
  await expect(card.getByRole("button", { name: "Remove" })).toBeVisible();
  await card.getByLabel("Closing line").fill("Thank you for your business.");
  await card.getByLabel("Closing line").blur();
  await card.getByRole("button", { name: "Choose a folder" }).click();
  await expect(card).toContainText(folder);
  await card.getByRole("button", { name: "By client" }).click();
  await expect(card.getByRole("button", { name: "By client" })).toHaveClass(/chip--on/);

  const look = await page.evaluate(async () => {
    const c = (await window.caulder.companies.list()).activeCompanyId as string;
    const lead = await window.caulder.leads.create(c, { name: "Leaflet Studio" } as never);
    const today = new Date().toISOString().slice(0, 10);
    await window.caulder.money.saveInvoice(c, null, { leadId: lead.id, issuedOn: today, dueOn: today, notes: null, lines: [{ description: "Design", quantity: 1, unitPrice: 9000, productId: null }] });
    return window.caulder.billing.invoiceLook(c);
  });
  expect(look).toMatchObject({ layout: "band", ink: "plum", logo: true, footer: "Thank you for your business.", foldering: "client" });

  await goTo(page, "Money");
  await page.locator(".money__row", { hasText: "INV-0001" }).getByRole("button", { name: "PDF" }).click();
  await expect.poll(() => existsSync(join(folder, "Leaflet Studio", "INV-0001.pdf"))).toBe(true);
  expect(readdirSync(folder)).toEqual(["Leaflet Studio"]);
});

test("a business not registered for GST invoices under its PAN, numbered by its year, is paid net of TDS, and sees its threshold", async () => {
  const page = await openApp();
  await app?.evaluate(({ shell }) => {
    shell.openPath = () => Promise.resolve("");
  });

  await goTo(page, "Settings");
  await expect(page.getByRole("radio", { name: "Not registered" })).toHaveAttribute("aria-checked", "true");
  await expect(page.locator(".card", { hasText: "Tax and billing" })).toContainText("Needed above ₹20 lakh a year");
  const card = page.locator(".card", { hasText: "Closing line" });
  await card.getByLabel("Which number").fill("PAN");
  await card.getByLabel("The number").fill("ABCDE1234F");
  await card.getByRole("button", { name: "Add", exact: true }).click();
  await expect(card).toContainText("PAN ABCDE1234F");
  await card.getByLabel("Prefix").fill("PK");
  await card.getByLabel("Prefix").blur();
  await card.getByRole("button", { name: "Financial year" }).click();
  await expect(card).toContainText(/Like PK\/\d\d-\d\d\/0042/);

  await page.evaluate(async () => {
    const c = (await window.caulder.companies.list()).activeCompanyId as string;
    const lead = await window.caulder.leads.create(c, { name: "Leaflet Studio" } as never);
    const today = new Date().toISOString().slice(0, 10);
    const money = await window.caulder.money.saveInvoice(c, null, { leadId: lead.id, issuedOn: today, dueOn: today, notes: null, lines: [{ description: "Design", quantity: 1, unitPrice: 100000, productId: null }] });
    const invoice = money.invoices[0];
    if (invoice) await window.caulder.money.setInvoiceStatus(c, invoice.id, "sent");
  });

  await goTo(page, "Money");
  const row = page.locator(".money__row", { hasText: "Leaflet Studio" }).first();
  await expect(row).toContainText(/PK\/\d\d-\d\d\/0001/);
  await row.getByRole("button", { name: "Record a payment" }).click();
  const dialog = page.getByRole("dialog", { name: /Payments on/ });
  await dialog.getByLabel("They deducted TDS").check();
  await expect(dialog.getByLabel("TDS withheld")).toHaveValue("10000");
  await dialog.getByRole("button", { name: "Record the payment" }).click();
  await expect(row).toContainText("Paid");

  await page.getByRole("tab", { name: "Health" }).click();
  await expect(page.getByText("TDS withheld by clients")).toBeVisible();
  await expect(page.getByRole("progressbar", { name: "Turnover towards the registration threshold" })).toHaveAttribute("aria-valuenow", "5");
});
