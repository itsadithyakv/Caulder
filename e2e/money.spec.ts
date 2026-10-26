import { test, expect, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { choose } from "./choose";
import { goTo, passSetup } from "./nav";

/**
 * Money through the real window: an invoice from nothing to paid, and an
 * overdue one turning up on Today.
 */

test.describe.configure({ mode: "serial" });

let userDataDir: string;
let app: ElectronApplication;

async function launch() {
  return electron.launch({
    args: [".", `--user-data-dir=${userDataDir}`],
    env: { ...process.env, ELECTRON_ENABLE_LOGGING: "0" },
  });
}

async function openApp(): Promise<Page> {
  app = await launch();
  const page = await app.firstWindow();
  await page.waitForSelector(".firstrun, .sidebar");
  if (await page.locator(".firstrun").isVisible()) {
    await page.getByLabel("Company name").fill("Unifloe");
    await page.getByRole("button", { name: "Create company" }).click();
    await passSetup(page);
    await expect(page.getByRole("button", { name: /Company: Unifloe/ })).toBeVisible();

    await page.getByRole("button", { name: "Contacts", exact: true }).click();
    await page.locator(".leads__toolbar").getByRole("button", { name: "Add contact" }).click();
    await page.getByLabel("Name", { exact: true }).fill("Oakridge International School");
    await page.getByRole("button", { name: "Add contact" }).click();
    await expect(page.getByRole("heading", { name: "Oakridge International School" })).toBeVisible();
  }
  return page;
}

test.beforeAll(() => {
  userDataDir = mkdtempSync(join(tmpdir(), "caulder-money-"));
});

test.afterAll(() => {
  rmSync(userDataDir, { recursive: true, force: true });
});

test.afterEach(async () => {
  await app?.close();
});

test("an invoice goes from nothing to paid, and the month adds up", async () => {
  const page = await openApp();
  await goTo(page, "Money");
  await expect(page.getByText("No invoices yet")).toBeVisible();

  await page.getByRole("button", { name: "New invoice" }).click();
  await choose(page, "Contact", "Oakridge International School");
  await page.getByLabel("Line 1 description").fill("Attendance workshop");
  await page.getByLabel("Line 1 unit price").fill("50000");
  await expect(page.getByText(/Total .*50,000/)).toBeVisible();
  await page.getByRole("button", { name: "Save invoice" }).click();

  const row = page.locator(".money__row", { hasText: "INV-0001" });
  await expect(row).toBeVisible();
  await expect(row).toContainText("Draft");

  await row.getByRole("button", { name: "Mark sent" }).click();
  await expect(row).toContainText("Sent");
  await expect(page.locator(".money__figure", { hasText: "Invoiced" })).toContainText("50,000");

  await row.getByRole("button", { name: "Mark paid" }).click();
  await expect(row).toContainText("Paid");
  await expect(page.locator(".money__figure", { hasText: "Paid" })).toContainText("50,000");

  // And it is on the contact's page.
  await page.getByRole("button", { name: "Contacts", exact: true }).click();
  await page.locator(".leadrow").first().click();
  await expect(page.locator(".money__row", { hasText: "INV-0001" })).toContainText("Paid");
});

test("a sent invoice past its due date is on Today, above the tasks", async () => {
  // Made late by hand: waiting a fortnight is not a test.
  {
    const page = await openApp();
    await goTo(page, "Money");
    await page.getByRole("button", { name: "New invoice" }).click();
    await choose(page, "Contact", "Oakridge International School");
    await page.getByLabel("Line 1 description").fill("Renewal");
    await page.getByLabel("Line 1 unit price").fill("20000");
    await page.getByRole("button", { name: "Save invoice" }).click();
    const row = page.locator(".money__row", { hasText: "INV-0002" });
    await row.getByRole("button", { name: "Mark sent" }).click();
    await expect(row).toContainText("Sent");
    await app.close();
  }

  const db = new Database(join(userDataDir, "caulder.db"));
  try {
    db.prepare(`UPDATE invoices SET issued_on = '2026-01-01', due_on = '2026-01-15' WHERE number = 2`).run();
  } finally {
    db.close();
  }

  const page = await openApp();
  await expect(page.getByText("1 invoice is overdue")).toBeVisible();
  await expect(page.locator(".coldrow", { hasText: "INV-0002" })).toContainText("20,000");

  // Chased from the row it is on: a reminder, written for it, read before it goes.
  await page.locator(".renewrow", { hasText: "INV-0002" }).getByRole("button", { name: "Send a reminder" }).click();
  const reminder = page.getByRole("dialog", { name: "A reminder about INV-0002" });
  await expect(reminder.getByLabel("Subject")).toHaveValue(/^Reminder: invoice INV-0002 from /);
  await expect(reminder.getByLabel("Message")).toHaveValue(/Invoice INV-0002 for .*20,000.* was due on .*days ago\./);
  await expect(reminder).toContainText("To Oakridge International School");
  await reminder.getByRole("button", { name: "Cancel" }).click();
  await expect(reminder).toHaveCount(0);

  await goTo(page, "Money");
  const late = page.locator(".money__row", { hasText: "INV-0002" });
  await expect(late.first()).toContainText("Overdue");
  await expect(late.first().getByRole("button", { name: "Send a reminder" })).toBeVisible();
  // What is owed, by how late it is.
  const owed = page.getByLabel("What is owed, by age");
  await expect(owed).toContainText("Owed");
  await expect(owed).toContainText("over 30 days late");

  // A retainer: said on the invoice, and the next one is drafted when it falls due - a draft, never sent.
  await late.last().locator(".money__main").click();
  await choose(page, "Repeats", "Every month");
  await expect(page.getByText("never sent by itself")).toBeVisible();
  await page.getByRole("button", { name: "Save changes" }).click();
  // This one was due to be written again months ago, so the next is drafted at once.
  await expect(page.locator(".money__row", { hasText: "INV-0003" })).toContainText("Every month");
  await app.close();

  const again = await openApp();
  await expect(again.getByText("1 retainer invoice is drafted, to look at and send")).toBeVisible();
  await goTo(again, "Money");
  const drafted = again.locator(".money__row", { hasText: "INV-0003" });
  await expect(drafted).toContainText("Draft");
  await expect(drafted).toContainText("Every month");
  await expect(drafted).toContainText("20,000");
  // The saying moved on to the draft: the one it was made from no longer repeats.
  await expect(again.locator(".money__row", { hasText: "INV-0002" }).last()).not.toContainText("Every month");
  // Deleting the draft ends the run: nothing is drafted in its place.
  await drafted.getByRole("button", { name: "Delete INV-0003" }).click();
  await expect(drafted).toHaveCount(0);
  await goTo(again, "Today");
  await expect(again.getByText(/retainer invoice/)).toHaveCount(0);
});

test("a quote for a contact with two deals says which deal, and keeps it", async () => {
  const page = await openApp();
  await page.getByRole("button", { name: "Contacts", exact: true }).click();
  await page.locator(".leadrow").first().click();
  await page.getByRole("button", { name: "Add a deal" }).click();
  await page.getByLabel("Deal", { exact: true }).fill("Renewal");
  await page.getByRole("button", { name: "Add deal" }).click();
  await expect(page.getByRole("list", { name: /^Deals with/ }).getByRole("listitem")).toHaveCount(2);

  await goTo(page, "Money");
  await page.getByRole("tab", { name: "Quotes" }).click();
  await page.getByRole("button", { name: "New quote" }).click();
  await choose(page, "Contact", "Oakridge International School");
  // The newest open deal is where it would go anyway, so the picker starts there.
  await expect(page.getByLabel("Deal", { exact: true })).toHaveText("Renewal");
  await page.getByLabel("Line 1 description").fill("Second year");
  await page.getByLabel("Line 1 unit price").fill("30000");
  await page.getByRole("button", { name: "Save quote" }).click();

  const row = page.locator(".money__row", { hasText: "Q-0001" });
  await expect(row).toContainText("Oakridge International School · Renewal");

  // Opened again, it is still on its deal; moved, the row says so.
  await row.locator(".money__main").click();
  await expect(page.getByLabel("Deal", { exact: true })).toHaveText("Renewal");
  await choose(page, "Deal", "Oakridge International School");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(row).toBeVisible();
  await expect(row).not.toContainText("Renewal");
});

test("running costs come from the brain, are paid from Today, and runway reads the bank", async () => {
  const page = await openApp();
  const inFiveDays = new Date(Date.now() + 5 * 86_400_000).toLocaleDateString("en-CA");

  await goTo(page, "Money");
  await page.getByRole("tab", { name: "Running costs" }).click();
  await expect(page.getByText("Nothing recurring yet")).toBeVisible();

  // Adding one writes it where it belongs: a page in the brain.
  await page.getByRole("button", { name: "Add a domain" }).click();
  await page.getByLabel("Title").fill("unifloe.in");
  await page.getByLabel("Renews on").fill(inFiveDays);
  await page.getByLabel("Cost a year").fill("1200");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("button", { name: "Edit", exact: true })).toBeVisible();

  await goTo(page, "Money");
  await page.getByRole("tab", { name: "Running costs" }).click();
  const costs = page.getByRole("list", { name: "Running costs" });
  await expect(costs.locator(".money__row", { hasText: "unifloe.in" })).toContainText("100/mo");
  await expect(costs.locator(".money__row", { hasText: "unifloe.in" })).toContainText("Renews in 5 days");

  // What is in the bank. This month more came in (the paid invoice) than went out.
  await page.getByRole("button", { name: "Say what is in the bank" }).click();
  await page.getByLabel("In the bank").fill("120000");
  await page.getByRole("button", { name: "Save balance" }).click();
  await expect(page.locator(".runway__big")).toHaveText("Not burning");
  await expect(page.locator(".money__runway")).toContainText("Not burning");

  // Today says what is about to be paid for, and Paid moves it a year on.
  await goTo(page, "Today");
  const renewals = page.getByRole("list", { name: "Renewing soon" });
  await expect(renewals).toContainText("unifloe.in");
  await expect(renewals).toContainText("renews in 5 days");
  await page.getByRole("button", { name: "unifloe.in is paid" }).click();
  await expect(renewals).toHaveCount(0);

  await goTo(page, "Money");
  await page.getByRole("tab", { name: "Spend" }).click();
  await expect(page.locator(".money__row", { hasText: "unifloe.in" })).toContainText("1,200");
});

test("a product is priced, picked onto an invoice, and shows what it brought in", async () => {
  const page = await openApp();

  // The brain's checklist sends the first product to the catalogue on Money.
  await goTo(page, "Brain");
  // The list folds to the next few; the whole ten are under All 10.
  await page.getByRole("button", { name: "All 10" }).click();
  await page.getByRole("button", { name: /^What you sell, and what it costs/ }).click();
  await expect(page.getByRole("tab", { name: "Products" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("Nothing in the catalogue yet")).toBeVisible();

  await page.getByRole("button", { name: "Add a product" }).click();
  await page.getByLabel("Name", { exact: true }).fill("Attendance workshop");
  await page.getByLabel("Sold per").fill("workshop");
  await page.getByLabel("What one costs us").fill("4000");
  await page.getByRole("button", { name: "Add the product" }).click();

  // It opens on itself, with an empty price book.
  await expect(page.getByRole("heading", { name: "Attendance workshop" })).toBeVisible();
  await page.getByRole("button", { name: "Add a price" }).click();
  await page.getByLabel("What this price is").fill("Schools");
  await page.getByLabel("Price", { exact: true }).fill("12000");
  await page.getByRole("button", { name: "Add the price" }).click();
  const prices = page.getByRole("list", { name: "Prices" });
  await expect(prices).toContainText("Schools");
  await expect(prices).toContainText("Now");

  await page.getByRole("button", { name: "All products" }).click();
  const row = page.getByRole("list", { name: "Products" }).locator(".money__row", { hasText: "Attendance workshop" });
  await expect(row).toContainText("12,000");
  await expect(row).toContainText("67% margin");
  await expect(row).toContainText("Not sold yet");

  // An invoice line picked from the catalogue takes its name and today's price.
  await page.getByRole("tab", { name: "Invoices" }).click();
  await page.getByRole("button", { name: "New invoice" }).click();
  await choose(page, "Contact", "Oakridge International School");
  await page.getByRole("button", { name: "From the catalogue" }).click();
  await page.getByRole("group", { name: "The catalogue" }).getByRole("button", { name: /Attendance workshop/ }).click();
  await expect(page.getByLabel("Line 1 description")).toHaveValue("Attendance workshop");
  await expect(page.getByLabel("Line 1 unit price")).toHaveValue("12000");
  await expect(page.getByRole("button", { name: "Stop counting line 1 as Attendance workshop" })).toBeVisible();
  await page.getByRole("button", { name: "Save invoice" }).click();
  const invoice = page.locator(".money__row", { hasText: "INV-0003" });
  await invoice.getByRole("button", { name: "Mark sent" }).click();
  await expect(invoice).toContainText("Sent");

  // Now the product knows what it was charged at, and who bought it.
  await page.getByRole("tab", { name: "Products" }).click();
  await page.getByRole("button", { name: /Attendance workshop/ }).first().click();
  await expect(page.getByRole("list", { name: "What it was charged at" })).toContainText("Oakridge International School");
  await expect(page.getByRole("list", { name: "Who bought it" })).toContainText("1 sold");
  await expect(page.locator(".money__figure", { hasText: "Margin" })).toContainText("8,000");
});

test("an invoice paid in two parts says what is still owed, and a payment can be taken back", async () => {
  const page = await openApp();
  await goTo(page, "Money");
  await page.getByRole("button", { name: "New invoice" }).click();
  await choose(page, "Contact", "Oakridge International School");
  await page.getByLabel("Line 1 description").fill("Training day");
  await page.getByLabel("Line 1 unit price").fill("30000");
  await page.getByRole("button", { name: "Save invoice" }).click();
  const row = page.locator(".money__row", { hasText: "INV-0004" });
  await row.getByRole("button", { name: "Mark sent" }).click();
  await expect(row).toContainText("Sent");

  // A deposit. The amount starts at everything owed, and is changed.
  await row.getByRole("button", { name: "Record a payment" }).click();
  const dialog = page.getByRole("dialog", { name: "Payments on INV-0004" });
  await expect(dialog.getByLabel("Amount")).toHaveValue("30000");
  await dialog.getByLabel("Amount").fill("10000");
  await dialog.getByLabel("Note").fill("Deposit");
  await dialog.getByRole("button", { name: "Record the payment" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(row).toContainText("Sent");
  await expect(row).toContainText(/10,000 in, .*20,000 owed/);

  // The rest, offered as what is left.
  await row.getByRole("button", { name: "Record a payment" }).click();
  await expect(dialog.getByRole("list", { name: "Payments" })).toContainText("Deposit");
  await expect(dialog.getByLabel("Amount")).toHaveValue("20000");
  await dialog.getByRole("button", { name: "Record the payment" }).click();
  await expect(row).toContainText("Paid");

  // Recorded by mistake: removed after being asked, and the invoice reopens.
  await row.getByRole("button", { name: "Payments", exact: true }).click();
  const payments = dialog.getByRole("list", { name: "Payments" });
  await expect(payments.getByRole("listitem")).toHaveCount(2);
  await payments.getByRole("button", { name: /^Remove the payment of .*20,000/ }).click();
  await payments.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(payments.getByRole("listitem")).toHaveCount(1);
  await expect(dialog).toContainText("20,000 still owed");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(row).toContainText("Sent");
  await expect(row).toContainText(/20,000 owed/);
});
