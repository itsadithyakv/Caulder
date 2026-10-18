import { test, expect, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { goTo, passSetup } from "./nav";

/**
 * Today as the first screen: one line that puts anything said about the
 * company where it belongs - a contact's history, a task, a memory on a brain
 * page, money, an idea, a note - and says where before it does.
 *
 * Set CAULDER_SHOTS to a folder to keep a screenshot of each screen.
 */

test.describe.configure({ mode: "serial" });

let userDataDir: string;
let app: ElectronApplication;
let page: Page;

async function shot(name: string) {
  const folder = process.env["CAULDER_SHOTS"];
  if (!folder) return;
  mkdirSync(folder, { recursive: true });
  await page.screenshot({ path: join(folder, `hub-${name}.png`) });
}

const line = () => page.getByLabel("Anything, in one line");
const goesTo = () => page.getByRole("group", { name: "Where it goes" });

test.beforeAll(async () => {
  userDataDir = mkdtempSync(join(tmpdir(), "caulder-hub-"));
  app = await electron.launch({
    args: [".", `--user-data-dir=${userDataDir}`],
    env: { ...process.env, ELECTRON_ENABLE_LOGGING: "0" },
  });
  page = await app.firstWindow();
  await page.waitForSelector(".firstrun, .sidebar");
  await page.getByLabel("Company name").fill("Unifloe");
  await page.getByRole("button", { name: "Create company" }).click();
  await passSetup(page);
  await expect(page.getByRole("button", { name: /Company: Unifloe/ })).toBeVisible();

  // A contact for the line to know by name.
  await page.evaluate(async () => {
    const { activeCompanyId } = await window.caulder.companies.list();
    await window.caulder.leads.create(activeCompanyId as string, { name: "Oakridge International School" } as never);
  });
  await goTo(page, "Contacts");
  await goTo(page, "Today");
});

test.afterAll(async () => {
  await app?.close();
  rmSync(userDataDir, { recursive: true, force: true });
});

test("the line says where each thing goes, and puts it there", async () => {
  // A call just made: the contact's history, as a call.
  await line().fill("Called Oakridge, they want a demo next week");
  await expect(goesTo().getByRole("button", { name: "Oakridge International School" })).toHaveAttribute("aria-pressed", "true");
  await shot("history");
  await line().press("Enter");
  await expect(page.getByText("Added: On Oakridge International School's history, as a call")).toBeVisible();

  // Something to remember about the company: a dated line on a brain page.
  await line().fill("our gst number is 29ABCDE1234F1Z5");
  await expect(goesTo().getByRole("button", { name: "Remember" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("a dated line on Things to remember, in the brain")).toBeVisible();
  await line().press("Enter");
  await expect(page.getByText("Added: Remembered, on Things to remember in the brain")).toBeVisible();

  // Something unsure is a note - and a chip makes it an idea instead.
  await line().fill("attendance through the parents' phones");
  await expect(goesTo().getByRole("button", { name: "Note" })).toHaveAttribute("aria-pressed", "true");
  await goesTo().getByRole("button", { name: "Idea" }).click();
  await line().press("Enter");
  await expect(page.getByText("Added: An idea, in the brain")).toBeVisible();

  // And a task is still a task, for the contact it names.
  await line().fill("call Oakridge tmrw 11am");
  await expect(goesTo().getByRole("button", { name: "Task" })).toHaveAttribute("aria-pressed", "true");
  await line().press("Enter");
  await expect(page.getByText(/^Added: call Oakridge/i)).toBeVisible();

  // Where they landed.
  await goTo(page, "Contacts");
  await page.locator(".leadrow__name", { hasText: /Oakridge International School/ }).click();
  await expect(page.getByText("Called Oakridge, they want a demo next week")).toBeVisible();
  await goTo(page, "Brain");
  await expect(page.getByRole("button", { name: /attendance through the parents/i })).toBeVisible();
});

test("a sum that was not said to be spent is offered, and logged only when chosen", async () => {
  await goTo(page, "Today");
  await line().fill("swiggy 320 lunch");
  // Read as a note, with the money one press away - never assumed.
  await expect(goesTo().getByRole("button", { name: "Note" })).toHaveAttribute("aria-pressed", "true");
  await goesTo().getByRole("button", { name: "Log 320 spent: Swiggy lunch" }).click();
  await shot("spend");
  await line().press("Enter");
  await expect(page.getByText("Added: Log 320 spent: Swiggy lunch, in Money")).toBeVisible();

  const spent = await page.evaluate(async () => {
    const { activeCompanyId } = await window.caulder.companies.list();
    const money = await window.caulder.money.get(activeCompanyId as string);
    return money.spend.map((entry) => [entry.what, entry.amount]);
  });
  expect(spent).toContainEqual(["Swiggy lunch", 320]);
});

test("what was remembered is read back from the brain, and nothing personal is on the sidebar", async () => {
  const nav = page.getByLabel("Main");
  for (const gone of ["Journal", "Life"]) {
    await expect(nav.getByRole("button", { name: gone, exact: true })).toHaveCount(0);
  }
  await goTo(page, "Brain");
  await page.getByRole("navigation", { name: "Brain sections" }).getByRole("button", { name: "Memories" }).click();
  await expect(page.getByRole("heading", { name: "Memories", level: 1 })).toBeVisible();
  await expect(page.getByText("our gst number is 29ABCDE1234F1Z5")).toBeVisible();
  await shot("memories");
});
