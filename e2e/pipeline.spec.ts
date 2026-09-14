import { test, expect, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * The pipeline board and the stage editor, through the real window.
 *
 * Dragging is driven where it can be, but the Move menu is what most of these
 * exercise: it is the path that has to work from the keyboard, and it is the
 * one somebody actually uses to cross seven columns.
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

async function ensureCompany(page: Page) {
  await page.waitForSelector(".firstrun, .sidebar");
  if (await page.locator(".firstrun").isVisible()) {
    await page.getByLabel("Company name").fill("Unifloe");
    await page.getByRole("button", { name: "Create company" }).click();
    await expect(page.getByRole("button", { name: /Company: Unifloe/ })).toBeVisible();

  // A first run now offers the tour, which sits over everything. Dismissing
  // it is exactly what somebody starting the app does.
  await page.waitForTimeout(700);
  if (await page.locator(".tour").count()) await page.keyboard.press("Escape");
  }
}

async function addLead(page: Page, name: string) {
  await page.getByRole("button", { name: "Contacts", exact: true }).click();
  await page.getByRole("button", { name: /^Add a? ?contact$/ }).first().click();
  await page.getByLabel("Name").fill(name);
  await page.getByRole("button", { name: "Add contact" }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
}

/** The card for one lead, wherever it is on the board. */
function card(page: Page, name: string) {
  return page.locator(".boardcard").filter({ hasText: name });
}

/** The column a card currently sits in. */
async function columnOf(page: Page, name: string): Promise<string> {
  return card(page, name)
    .locator("xpath=ancestor::section[contains(@class,'column')]")
    .locator(".column__name")
    .innerText();
}

test.beforeAll(() => {
  userDataDir = mkdtempSync(join(tmpdir(), "caulder-pipeline-"));
});

test.afterAll(() => {
  rmSync(userDataDir, { recursive: true, force: true });
});

test.afterEach(async () => {
  await app?.close();
});

test("an empty board still shows the funnel, with a line of guidance", async () => {
  app = await launch();
  const page = await app.firstWindow();
  await ensureCompany(page);

  await page.getByRole("button", { name: "Deals" }).click();

  // The funnel is drawn even with nothing in it. A card saying the board is
  // empty told you less than the empty board itself does, and left the screen
  // mostly blank while doing it.
  await expect(page.locator(".hintbar")).toContainText("This is your funnel");
  await expect(page.getByRole("button", { name: "Edit the stages" })).toBeVisible();
  await expect
    .poll(() => page.locator(".column__name").allInnerTexts())
    .toEqual(expect.arrayContaining(["New", "Contacted"]));
});

test("a new lead appears in the first column", async () => {
  app = await launch();
  const page = await app.firstWindow();
  await ensureCompany(page);
  await addLead(page, "Bengaluru Public School");

  await page.getByRole("button", { name: "Deals" }).click();

  await expect(page.locator(".column")).toHaveCount(7);
  expect(await columnOf(page, "Bengaluru Public School")).toBe("New");
  // A lead with nothing planned says so on the card, not only on Today.
  await expect(card(page, "Bengaluru Public School")).toContainText("No next step");
});

test("the Move menu crosses columns and records the move", async () => {
  app = await launch();
  const page = await app.firstWindow();
  await ensureCompany(page);

  await page.getByRole("button", { name: "Deals" }).click();
  await page
    .getByRole("button", { name: "Move Bengaluru Public School to another stage" })
    .click();
  await page.getByRole("menuitem", { name: "Meeting booked" }).click();

  expect(await columnOf(page, "Bengaluru Public School")).toBe("Meeting booked");

  // Every move is on the lead's history, so the board explains itself later.
  await card(page, "Bengaluru Public School").getByRole("button").first().click();
  await expect(page.getByText("Stage changed")).toBeVisible();
  await expect(page.locator(".entry__text").first()).toHaveText("Meeting booked");
});

test("the menu closes on Escape without moving anything", async () => {
  app = await launch();
  const page = await app.firstWindow();
  await ensureCompany(page);
  await page.getByRole("button", { name: "Deals" }).click();

  await page
    .getByRole("button", { name: "Move Bengaluru Public School to another stage" })
    .click();
  await expect(page.getByRole("menu")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  expect(await columnOf(page, "Bengaluru Public School")).toBe("Meeting booked");
});

test("a card can be dragged to another column", async () => {
  app = await launch();
  const page = await app.firstWindow();
  await ensureCompany(page);
  await page.getByRole("button", { name: "Deals" }).click();
  // The board loads asynchronously, and evaluate does not wait for anything.
  await expect(card(page, "Bengaluru Public School")).toBeVisible();

  // Playwright's dragTo drives the mouse, which is enough for a JS drag
  // implementation but not for the browser's own drag-and-drop: no dragstart
  // or drop is produced. Dispatching real DragEvents with a shared
  // DataTransfer runs the app's actual handlers, which is what is under test.
  await page.evaluate(
    ({ cardText, columnText }) => {
      const cards = Array.from(document.querySelectorAll(".boardcard"));
      const target = cards.find((el) => el.textContent?.includes(cardText));
      const handle = target?.querySelector(".boardcard__drag");

      const columns = Array.from(document.querySelectorAll(".column"));
      const column = columns.find((el) => el.textContent?.includes(columnText));
      if (!handle || !column) throw new Error("Card or column not on screen.");

      const dataTransfer = new DataTransfer();
      const fire = (node: Element, type: string) =>
        node.dispatchEvent(new DragEvent(type, { bubbles: true, dataTransfer }));

      fire(handle, "dragstart");
      fire(column, "dragover");
      fire(column, "drop");
      fire(handle, "dragend");
    },
    { cardText: "Bengaluru Public School", columnText: "Proposal sent" },
  );

  await expect(
    page.locator(".column").filter({ hasText: "Proposal sent" }).locator(".boardcard"),
  ).toContainText("Bengaluru Public School");
  expect(await columnOf(page, "Bengaluru Public School")).toBe("Proposal sent");
});

test("a column totals the value of the leads in it", async () => {
  app = await launch();
  const page = await app.firstWindow();
  await ensureCompany(page);

  await addLead(page, "Oakridge International School");
  await page.getByRole("button", { name: "Edit details" }).click();
  await page.getByLabel("Value").fill("45000");
  await page.getByRole("button", { name: "Save changes" }).click();

  await page.getByRole("button", { name: "Deals" }).click();
  const first = page.locator(".column").first();
  await expect(first.locator(".column__value")).toHaveText("45,000");
});

test("stages can be renamed, reordered and added", async () => {
  app = await launch();
  const page = await app.firstWindow();
  await ensureCompany(page);
  await page.getByRole("button", { name: "Settings" }).click();

  await expect(page.getByText("Pipeline stages")).toBeVisible();

  // Rename applies on blur, not on every keystroke.
  const second = page.getByLabel("Name of stage 2");
  await second.fill("Reached out");
  await second.blur();

  // Wait for the rename to have gone to the database and come back, not just
  // for the box to have lost focus. Every other control here is labelled from
  // the stage names, so acting before the list re-renders is acting on labels
  // that are about to change underneath the click.
  await expect(page.getByRole("button", { name: "Move Reached out earlier" })).toBeVisible();

  await page.getByRole("button", { name: "Move Interested earlier" }).click();
  await page.getByRole("button", { name: "Add a stage" }).click();
  await page.getByLabel("New stage name").fill("Negotiating");
  await page.getByRole("button", { name: "Add", exact: true }).click();

  await page.getByRole("button", { name: "Deals" }).click();

  // Polled, not read once. allInnerTexts does not auto-wait, and the board is
  // fetched after the screen mounts - reading it straight after the click gets
  // an empty array and compares it against the answer.
  await expect
    .poll(() => page.locator(".column__name").allInnerTexts())
    .toEqual(expect.arrayContaining(["New", "Interested", "Reached out", "Negotiating"]));

  const names = await page.locator(".column__name").allInnerTexts();
  expect(names.slice(0, 3)).toEqual(["New", "Interested", "Reached out"]);
});

test("a duplicate stage name is refused with something you can act on", async () => {
  app = await launch();
  const page = await app.firstWindow();
  await ensureCompany(page);
  await page.getByRole("button", { name: "Settings" }).click();

  await page.getByRole("button", { name: "Add a stage" }).click();
  await page.getByLabel("New stage name").fill("Interested");
  await page.getByRole("button", { name: "Add", exact: true }).click();

  await expect(page.getByText('There is already a stage called "Interested".')).toBeVisible();
});

test("deleting a stage keeps its leads, on an Unstaged column", async () => {
  app = await launch();
  const page = await app.firstWindow();
  await ensureCompany(page);
  await page.getByRole("button", { name: "Settings" }).click();

  // Bengaluru Public School is in Proposal sent from the drag test.
  await page.getByRole("button", { name: "Delete Proposal sent" }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();

  await page.getByRole("button", { name: "Deals" }).click();
  expect(await columnOf(page, "Bengaluru Public School")).toBe("Unstaged");

  // And it can be put back from there.
  await page
    .getByRole("button", { name: "Move Bengaluru Public School to another stage" })
    .click();
  await page.getByRole("menuitem", { name: "New", exact: true }).click();
  expect(await columnOf(page, "Bengaluru Public School")).toBe("New");
});

test("everything survives a restart", async () => {
  app = await launch();
  const page = await app.firstWindow();
  await ensureCompany(page);
  await page.getByRole("button", { name: "Deals" }).click();

  await expect
    .poll(() => page.locator(".column__name").allInnerTexts())
    .toEqual(expect.arrayContaining(["New", "Interested", "Reached out"]));

  const names = await page.locator(".column__name").allInnerTexts();
  expect(names.slice(0, 3)).toEqual(["New", "Interested", "Reached out"]);
  expect(await columnOf(page, "Bengaluru Public School")).toBe("New");
});
