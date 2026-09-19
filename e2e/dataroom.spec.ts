import { test, expect, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { goTo, passSetup } from "./nav";

/**
 * Hand it over, in a real window (PLAN.md, phase 13): a data room zipped to
 * a file, and the handbook printed to one through the invoices' printer.
 * The save dialog is answered by the test; everything after it is the app's.
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
  await page.screenshot({ path: join(folder, `dataroom-${name}.png`) });
}

/** The next save dialog answers with this path. */
async function saveTo(path: string) {
  await app.evaluate(({ dialog }, target) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: target });
  }, path);
}

test.beforeAll(async () => {
  userDataDir = mkdtempSync(join(tmpdir(), "caulder-dataroom-"));
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

  // A few pages to hand over, written the quick way.
  await page.evaluate(async () => {
    const company = (await window.caulder.companies.list()).activeCompanyId as string;
    const write = async (section: "company" | "plan" | "playbooks", template: string, title: string, body: string, fields = {}) => {
      const made = await window.caulder.brain.create(company, section, template);
      await window.caulder.brain.save(made.id, { title, body, fields, secrets: {}, baseRevision: made.revision });
    };
    await write("company", "profile", "Company profile", "## The pitch\n\nAttendance for schools.", { oneLiner: "Attendance that takes itself" });
    await write("plan", "goal", "Forty schools", "By March.");
    await write("playbooks", "playbook", "Onboarding a school", "## Steps\n\n- [ ] Call the principal\n- [ ] Send the invoice");
  });
});

test.afterAll(async () => {
  await app?.close();
  rmSync(userDataDir, { recursive: true, force: true });
});

test("a data room is chosen by ticking, and saved as a zip", async () => {
  await goTo(page, "Brain");
  await page.getByLabel("Brain sections").getByRole("button", { name: "Share and export" }).click();
  await page.getByRole("button", { name: "Make a data room" }).click();
  const form = page.getByRole("form", { name: "What goes in the data room" });
  await expect(form).toBeVisible();
  // Ticked from what a data room is for, and only where there is something.
  await expect(form.getByRole("checkbox", { name: /^Company/ })).toBeChecked();
  await expect(form.getByRole("checkbox", { name: /^Plan/ })).toBeChecked();
  await expect(form.getByRole("checkbox", { name: /^Playbooks/ })).not.toBeChecked();
  await expect(form.getByRole("checkbox", { name: /^Legal and contracts/ })).toBeDisabled();
  await shot("choose");

  const file = join(userDataDir, "room.zip");
  await saveTo(file);
  await form.getByRole("button", { name: "Save the data room" }).click();
  await expect(page.getByText("Saved room.zip: 2 pages and 0 documents.")).toBeVisible();
  expect(existsSync(file)).toBe(true);
  const zip = readFileSync(file);
  expect(zip.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))).toBe(true);
  expect(zip.includes(Buffer.from("pages/02 Plan/Forty schools.html"))).toBe(true);
  await expect(page.getByRole("button", { name: "Show it in its folder" })).toBeVisible();
  await shot("saved");
});

test("the handbook prints the ticked sections to a PDF", async () => {
  await page.getByRole("button", { name: "Print the handbook" }).click();
  const form = page.getByRole("form", { name: "What goes in the handbook" });
  await expect(form.getByRole("checkbox", { name: /^Playbooks/ })).toBeChecked();
  // A handbook carries no documents.
  await expect(form.getByRole("group", { name: "Documents" })).toHaveCount(0);
  await expect(form.getByRole("group", { name: "Pages" })).toBeVisible();

  const file = join(userDataDir, "handbook.pdf");
  await saveTo(file);
  await form.getByRole("button", { name: "Save the handbook" }).click();
  await expect(page.getByText(/^Saved handbook\.pdf: 3 pages\.$/)).toBeVisible({ timeout: 20_000 });
  expect(readFileSync(file).subarray(0, 5).toString()).toBe("%PDF-");
  expect(statSync(file).size).toBeGreaterThan(2000);
});
