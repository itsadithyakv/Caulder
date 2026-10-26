import { test, expect, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database, { type Database as DatabaseType } from "better-sqlite3";
import { pick } from "./choose";
import { passSetup } from "./nav";

/**
 * Tasks and the Today screen through the real window.
 *
 * The exit criterion for this phase is that opening the app answers "what do I
 * do this morning", so these tests set work up and then check the home screen
 * says the right thing about it.
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
    await passSetup(page);
    await expect(page.getByRole("button", { name: /Company: Unifloe/ })).toBeVisible();

  }
}

/**
 * Edits the app's own database between launches.
 *
 * Ageing a lead by forty days is not something the UI can do, and waiting is
 * not a test. The app is closed at this point, so there is no second writer.
 */
function edit(run: (db: DatabaseType) => void) {
  const db = new Database(join(userDataDir, "caulder.db"));
  try {
    run(db);
  } finally {
    db.close();
  }
}

async function addLead(page: Page, name: string) {
  await page.getByRole("button", { name: "Contacts", exact: true }).click();
  await page.getByRole("button", { name: /^Add a? ?contact$/ }).first().click();
  await page.getByLabel("Name").fill(name);
  await page.getByRole("button", { name: "Add contact" }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
}

test.beforeAll(() => {
  userDataDir = mkdtempSync(join(tmpdir(), "caulder-today-"));
});

test.afterAll(() => {
  rmSync(userDataDir, { recursive: true, force: true });
});

test.afterEach(async () => {
  await app?.close();
});

test("an empty day says so rather than showing empty lists", async () => {
  app = await launch();
  const page = await app.firstWindow();
  await ensureCompany(page);

  await expect(page.getByText("Nothing is due today")).toBeVisible();
  // One way in, the quick line: no second box for notes, and no Notes card
  // with nothing in it.
  await expect(page.getByLabel("Write a note")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Notes", exact: true })).toHaveCount(0);
});

test("the work comes straight after the quick line, and nothing on Today is there to amuse", async () => {
  app = await launch();
  const page = await app.firstWindow();
  await ensureCompany(page);

  const quick = page.locator(".today__quick");
  const work = page.locator(".today__work");
  await expect(quick).toBeVisible();
  expect(
    await page.evaluate(() => {
      const line = document.querySelector(".today__quick");
      const first = document.querySelector(".today__work");
      if (!line || !first) return false;
      return (line.compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    }),
  ).toBe(true);
  await expect(work).toBeVisible();
  // A plain hello and the day in numbers: no joke, no quotation.
  await expect(page.locator(".today__greeting")).toHaveText(/^Good (morning|afternoon|evening)\.$/);
  await expect(page.locator(".today__aside")).toHaveCount(0);
  await expect(page.locator(".today__summary")).toHaveText("Nothing due today.");
});

test("a task set on a lead appears on Today", async () => {
  app = await launch();
  const page = await app.firstWindow();
  await ensureCompany(page);
  await addLead(page, "Bengaluru Public School");

  // A lead with nothing planned is how one goes quiet, so the detail says so.
  await expect(page.getByText("Nothing planned.")).toBeVisible();

  await page.getByRole("button", { name: "Add a task" }).click();
  await page.getByLabel("What needs doing").fill("Call the principal");
  await pick(page, "Kind", "Call");
  await page.getByRole("button", { name: "Add task" }).click();

  await expect(page.getByText("Call the principal")).toBeVisible();

  await page.getByRole("button", { name: "Today" }).click();
  await expect(page.getByText("Due today")).toBeVisible();
  // Grouped by kind, because calls are made in a batch.
  await expect(page.getByText("Calls to make")).toBeVisible();
  await expect(page.getByText("Call the principal")).toBeVisible();
  await expect(page.getByRole("button", { name: "Bengaluru Public School" })).toBeVisible();
});

test("snoozing a task moves it off today", async () => {
  app = await launch();
  const page = await app.firstWindow();
  await ensureCompany(page);

  await page.getByRole("button", { name: "Tomorrow" }).first().click();

  await expect(page.getByText("Nothing is due today")).toBeVisible();
  // The empty state says what is next rather than just being empty.
  await expect(page.getByText(/Next up: Call the principal tomorrow/)).toBeVisible();
});

test("an overdue task is announced first, and separately", async () => {
  // Backdated in the file rather than by waiting a day. The app is not
  // running, so there is no second writer.
  edit((db) => {
    db.prepare("UPDATE tasks SET due_on = ? WHERE status = 'open'").run("2020-01-01");
  });

  app = await launch();
  const page = await app.firstWindow();
  await ensureCompany(page);

  await expect(page.getByText("1 thing is overdue")).toBeVisible();
  await expect(page.getByText(/days ago/)).toBeVisible();
  // Overdue and due-today are different sections, and this task is only late.
  await expect(page.getByText("Due today")).toHaveCount(0);

  // Put it back for the tests that follow.
  await page.getByRole("button", { name: "Tomorrow" }).first().click();
  await expect(page.getByText("Nothing is due today")).toBeVisible();
});

test("completing a task records it on the lead's history", async () => {
  app = await launch();
  const page = await app.firstWindow();
  await ensureCompany(page);

  await page.getByRole("button", { name: "Contacts", exact: true }).click();
  await page.locator(".leadrow__name", { hasText: /Bengaluru Public School/ }).click();

  await page.getByRole("button", { name: 'Mark "Call the principal" done' }).click();

  await expect(page.getByText("Task done")).toBeVisible();
  // Ticking a task is not proof the call happened, so this stays Never.
  await expect(page.getByRole("main").getByText("Never", { exact: true })).toBeVisible();
});

test("a lead with nothing planned turns up under Going quiet", async () => {
  // Aged past the threshold, and the threshold lowered, rather than waiting
  // two weeks. Everything the task left open is cleared so the lead really
  // has nothing planned - and they were rung once, forty days ago: somebody
  // nobody has ever written to is under Reach out, not here.
  edit((db) => {
    const old = new Date(Date.now() - 40 * 86400000).toISOString();
    db.prepare("DELETE FROM tasks").run();
    db.prepare("UPDATE leads SET created_at = ?, updated_at = ?, last_contacted_at = ?").run(old, old, old);
    db.prepare("UPDATE activities SET occurred_at = ?").run(old);
    db.prepare(
      "INSERT INTO activities (id, company_id, lead_id, kind, body, occurred_at, created_at) SELECT 'e2e-call', company_id, id, 'call', 'Spoke to the office', ?, ? FROM leads LIMIT 1",
    ).run(old, old);
    db.prepare(
      "INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('coldAfterDays', '7', ?)",
    ).run(new Date().toISOString());
  });

  app = await launch();
  const page = await app.firstWindow();
  await ensureCompany(page);

  await page.getByRole("button", { name: "Today" }).click();
  await expect(page.getByRole("heading", { name: "Going quiet" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Bengaluru Public School/ })).toBeVisible();

  // A shortcut used earlier is not replayed. N opens the new-contact form
  // once; it must not open again on the next visit, which here is Today
  // sending the user to one contact.
  await page.keyboard.press("n");
  await expect(page.getByLabel("Contact person")).toBeVisible();
  await page.getByRole("button", { name: "Today" }).click();

  // Clicking through opens that lead.
  await page.getByRole("button", { name: /Bengaluru Public School/ }).click();
  await expect(page.getByRole("heading", { name: "Bengaluru Public School" })).toBeVisible();
  await expect(page.getByLabel("Contact person")).toHaveCount(0);
});

test("planning a next step takes the lead out of Going quiet", async () => {
  app = await launch();
  const page = await app.firstWindow();
  await ensureCompany(page);

  await expect(page.getByRole("heading", { name: "Going quiet" })).toBeVisible();

  await page.getByRole("button", { name: /Bengaluru Public School/ }).click();
  await page.getByRole("button", { name: "Add a task" }).click();
  await page.getByLabel("What needs doing").fill("Send the proposal");
  await page.getByRole("radio", { name: "Next week" }).click();
  await page.getByRole("button", { name: "Add task" }).click();

  await page.getByRole("button", { name: "Today" }).click();
  // Nothing is falling through once a next step exists, so it drops off the
  // list even though the lead is still quiet.
  await expect(page.getByRole("heading", { name: "Going quiet" })).toHaveCount(0);
});

test("everything survives a restart", async () => {
  app = await launch();
  const page = await app.firstWindow();
  await ensureCompany(page);

  await page.getByRole("button", { name: "Contacts", exact: true }).click();
  await page.locator(".leadrow__name", { hasText: /Bengaluru Public School/ }).click();
  await expect(page.getByText("Send the proposal")).toBeVisible();
});

test("a task is changed from its own row, and Escape puts the row back", async () => {
  app = await launch();
  const page = await app.firstWindow();
  await ensureCompany(page);

  await page.getByRole("button", { name: "Full form" }).click();
  await page.getByLabel("What needs doing").fill("Draft the pitch");
  await page.getByRole("button", { name: "Add task" }).click();
  await expect(page.getByText("Draft the pitch", { exact: true })).toBeVisible();

  // The form opens in the row's place, filled with the task as it stands.
  await page.getByRole("button", { name: 'Edit "Draft the pitch"' }).click();
  const form = page.locator(".taskedit");
  await expect(form.getByLabel("What needs doing")).toHaveValue("Draft the pitch");
  await form.getByLabel("What needs doing").fill("Draft the pitch deck");
  await form.getByLabel("Notes").fill("Ten slides at most");
  await form
    .getByRole("radiogroup", { name: "How much it matters", exact: true })
    .getByRole("radio", { name: "Has to happen", exact: true })
    .click();
  await form.getByRole("button", { name: "Save", exact: true }).click();

  await expect(page.locator(".taskedit")).toHaveCount(0);
  await expect(page.getByText("Draft the pitch deck", { exact: true })).toBeVisible();
  await expect(page.getByText("Ten slides at most")).toBeVisible();
  await expect(page.getByText("Has to happen", { exact: true })).toBeVisible();

  // Escape leaves without saving, and only the form goes - not the screen behind it.
  await page.getByRole("button", { name: 'Edit "Draft the pitch deck"' }).click();
  await page.locator(".taskedit").getByLabel("What needs doing").fill("Something else");
  await page.keyboard.press("Escape");
  await expect(page.locator(".taskedit")).toHaveCount(0);
  await expect(page.getByText("Draft the pitch deck", { exact: true })).toBeVisible();
  // Saving sends the whole task, so the note it already had is still there.
  await expect(page.getByText("Ten slides at most")).toBeVisible();
});

test("the line files what is typed, and has no switches beside it", async () => {
  app = await launch();
  const page = await app.firstWindow();
  await ensureCompany(page);

  // Asking an AI and copying context for one each live in the Brain, and only there.
  const quick = page.locator(".today__quick");
  await expect(quick.getByLabel("Anything, in one line")).toBeVisible();
  await expect(quick.getByRole("button", { name: "Copy context for another AI" })).toHaveCount(0);
  await expect(quick.getByRole("button", { name: /Ask the AI/ })).toHaveCount(0);
});
