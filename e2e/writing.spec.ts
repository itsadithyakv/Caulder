import { test, expect, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { goTo, openBrainSection, passSetup } from "./nav";

/**
 * Writing, in a real window: the journal asked in three parts, a link made
 * with @ and shown as a chip, bold from the keys and the bar, a list from /,
 * tomorrow's line made a task, and Free showing the same words as one page.
 * Underneath, the entry is the same markdown it always was.
 *
 * Set CAULDER_SHOTS to a folder to keep a screenshot of each moment.
 */

test.describe.configure({ mode: "serial" });

let userDataDir: string;
let app: ElectronApplication;
let page: Page;

async function shot(name: string) {
  const folder = process.env["CAULDER_SHOTS"];
  if (!folder) return;
  mkdirSync(folder, { recursive: true });
  await page.screenshot({ path: join(folder, `writing-${name}.png`) });
}

/** Today's entry as it is kept. */
const kept = () =>
  page.evaluate(async () => {
    const { homeCompanyId } = await window.caulder.companies.list();
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const day = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    return (await window.caulder.life.find(homeCompanyId as string, day))?.body ?? "";
  });

const box = (part: "Today" | "Grateful for" | "Tomorrow") => page.getByLabel(`The entry: ${part}`, { exact: true });

test.beforeAll(async () => {
  userDataDir = mkdtempSync(join(tmpdir(), "caulder-writing-"));
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
  await page.evaluate(async () => {
    const { activeCompanyId } = await window.caulder.companies.list();
    await window.caulder.leads.create(activeCompanyId as string, { name: "Oakridge School" } as never);
  });
});

test.afterAll(async () => {
  await app?.close();
  rmSync(userDataDir, { recursive: true, force: true });
});

test("the journal asks three things, and @ links a contact as a chip", async () => {
  await goTo(page, "Journal");
  await expect(box("Today")).toBeVisible();
  await expect(box("Grateful for")).toBeVisible();
  await expect(box("Tomorrow")).toBeVisible();

  await box("Today").click();
  await page.keyboard.type("Met @Oak");
  const suggestions = page.getByRole("listbox", { name: "Suggestions" });
  await expect(suggestions.getByRole("option", { name: /Oakridge School/ })).toContainText("Contact");
  await shot("mention");
  await page.keyboard.press("Enter");
  await page.keyboard.type(" about the pilot.");

  // A chip on screen, the link's id nowhere to be seen - and in the text underneath.
  await expect(box("Today").locator(".cm-chip", { hasText: "Oakridge School" })).toBeVisible();
  await expect(box("Today")).not.toContainText("contact:");
  await expect(page.getByRole("status").filter({ hasText: "Kept" })).toBeVisible();
  expect(await kept()).toMatch(/^## Today\n\nMet \[\[Oakridge School\|contact:[0-9a-f-]{36}\]\] about the pilot\.\n/);
});

test("Ctrl+B makes a word bold, and / starts a list", async () => {
  await box("Grateful for").click();
  await page.keyboard.type("Asha");
  await page.keyboard.press("Shift+Home");
  await expect(page.getByRole("toolbar", { name: "Format" })).toBeVisible();
  await shot("bar");
  await page.keyboard.press("Control+b");
  await page.keyboard.press("End");

  await box("Tomorrow").click();
  await page.keyboard.type("/check");
  await page.getByRole("listbox", { name: "Suggestions" }).getByRole("option", { name: /Checklist/ }).click();
  await page.keyboard.type("Send the pilot quote");
  // The box is drawn once the cursor moves off the line.
  await box("Today").click();
  await expect(box("Tomorrow").getByRole("checkbox", { name: "Tick off" })).toBeVisible();
  await expect(box("Grateful for").locator(".cm-md-strong", { hasText: "Asha" })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Kept" })).toBeVisible();

  const body = await kept();
  expect(body).toContain("## Grateful for\n\n**Asha**");
  expect(body).toContain("## Tomorrow\n\n- [ ] Send the pilot quote");
});

test("tomorrow's line becomes tomorrow's task", async () => {
  await page.getByRole("button", { name: "Make it tomorrow's task" }).click();
  await expect(page.getByRole("status").filter({ hasText: "On tomorrow's list" })).toBeVisible();
  const task = await page.evaluate(async () => {
    const { activeCompanyId } = await window.caulder.companies.list();
    const today = await window.caulder.today.get(activeCompanyId as string);
    return today.upcoming.find((each) => each.title === "Send the pilot quote") ?? null;
  });
  expect(task?.kind).toBe("todo");
});

test("Free shows the same words as one page, and Guided comes back to them", async () => {
  await page.getByRole("radio", { name: "Free" }).click();
  const whole = page.getByLabel("The entry", { exact: true });
  await expect(whole).toContainText("Grateful for");
  await expect(whole.locator(".cm-chip", { hasText: "Oakridge School" })).toBeVisible();
  await shot("free");
  await page.getByRole("radio", { name: "Guided" }).click();
  await expect(box("Grateful for")).toContainText("Asha");
});

test("a page is written the same way", async () => {
  await openBrainSection(page, "Products and pricing");
  await page.getByRole("button", { name: "Blank page" }).click();
  await page.getByLabel("Title", { exact: true }).fill("Pilot");
  const text = page.getByLabel("Page", { exact: true });
  await text.click();
  await page.keyboard.type("## Plan");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Ask [[Oak");
  await expect(page.getByRole("listbox", { name: "Suggestions" }).getByRole("option", { name: /Oakridge/ })).toBeVisible();
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.locator(".prose").getByRole("button", { name: "Oakridge School" })).toBeVisible();
  await expect(page.locator(".prose").getByRole("heading", { name: "Plan" })).toBeVisible();
});
