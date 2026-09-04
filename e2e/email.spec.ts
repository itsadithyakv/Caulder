import { test, expect, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * The bridge, end to end through the real window.
 *
 * The phase's exit criterion is that a real send round-trip shows up on the
 * lead's timeline: queue an email, export the outbox, write a log the way Apps
 * Script would, import it back, and see the send recorded.
 */

test.describe.configure({ mode: "serial" });

let userDataDir: string;
let app: ElectronApplication;
let outboxPath: string;

async function launch() {
  return electron.launch({
    args: [".", `--user-data-dir=${userDataDir}`],
    env: { ...process.env, ELECTRON_ENABLE_LOGGING: "0" },
  });
}

async function stubSave(electronApp: ElectronApplication, filePath: string) {
  await electronApp.evaluate(({ dialog }, path) => {
    dialog.showSaveDialog = () => Promise.resolve({ canceled: false, filePath: path } as never);
  }, filePath);
}

async function stubOpen(electronApp: ElectronApplication, filePath: string) {
  await electronApp.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = () =>
      Promise.resolve({ canceled: false, filePaths: [path] } as never);
  }, filePath);
}

async function ensureCompany(page: Page) {
  await page.waitForSelector(".firstrun, .sidebar");
  if (await page.locator(".firstrun").isVisible()) {
    await page.getByLabel("Company name").fill("Unifloe");
    await page.getByLabel("Start with sample data").uncheck();
    await page.getByRole("button", { name: "Create company" }).click();
    await expect(page.getByRole("button", { name: /Company: Unifloe/ })).toBeVisible();
  }
}

/** The message_id the outbox carries — the join key the log must echo back. */
function messageIdFrom(csv: string): string {
  const [header, ...rows] = csv.trim().split(/\r?\n/);
  const at = header!.split(",").indexOf("message_id");
  return rows[0]!.split(",")[at]!.replace(/"/g, "").trim();
}

test.beforeAll(() => {
  userDataDir = mkdtempSync(join(tmpdir(), "caulder-email-"));
  outboxPath = join(userDataDir, "outbox.csv");
});

test.afterAll(() => {
  rmSync(userDataDir, { recursive: true, force: true });
});

test.afterEach(async () => {
  await app?.close();
});

test("the Apps Script file can be saved for pasting into Google", async () => {
  app = await launch();
  const page = await app.firstWindow();
  await ensureCompany(page);

  const target = join(userDataDir, "Caulder.gs");
  await stubSave(app, target);

  await page.getByRole("button", { name: "Email" }).click();
  await page.getByRole("button", { name: "Save the Apps Script" }).click();

  await expect(page.getByText(`Apps Script saved to ${target}`)).toBeVisible();
  expect(existsSync(target)).toBe(true);
  // The join-key rule is the one thing the script must not get wrong.
  expect(readFileSync(target, "utf8")).toContain("message_id");
});

test("an email written to a lead is queued, not sent", async () => {
  app = await launch();
  const page = await app.firstWindow();
  await ensureCompany(page);

  await page.getByRole("button", { name: "Leads" }).click();
  await page.getByRole("button", { name: /^Add a? ?lead$/ }).first().click();
  await page.getByLabel("Name").fill("Bengaluru Public School");
  await page.getByLabel("Email").fill("office@bps.example.com");
  await page.getByRole("button", { name: "Add lead" }).click();

  await page.getByRole("button", { name: "Write one" }).click();
  await page.getByLabel("Subject").fill("Introducing Unifloe");
  await page.getByLabel("Message").fill("Hello, we build school software.");
  await page.getByRole("button", { name: "Queue it" }).click();

  await expect(page.getByText("Queued", { exact: true })).toBeVisible();
  // And it lands on the history straight away, before anything is sent.
  await expect(page.getByText("Email queued")).toBeVisible();
});

test("Today says an email is ready and offers the export", async () => {
  app = await launch();
  const page = await app.firstWindow();
  await ensureCompany(page);

  await expect(page.getByText("1 email is ready to go")).toBeVisible();
  await expect(page.getByText("Caulder does not send.")).toBeVisible();
});

test("exporting writes the outbox and marks the message waiting", async () => {
  app = await launch();
  const page = await app.firstWindow();
  await ensureCompany(page);
  await stubSave(app, outboxPath);

  await page.getByRole("button", { name: "Email" }).click();
  await page.getByRole("button", { name: "Export the outbox" }).click();

  await expect(page.getByText(/1 message written to/)).toBeVisible();
  expect(existsSync(outboxPath)).toBe(true);

  const csv = readFileSync(outboxPath, "utf8");
  expect(csv.split(/\r?\n/)[0]).toContain("message_id");
  expect(csv).toContain("office@bps.example.com");

  await expect(page.getByText("Waiting on the script")).toBeVisible();
});

test("Today warns that no log has come back", async () => {
  app = await launch();
  const page = await app.firstWindow();
  await ensureCompany(page);

  // The risk the plan names: the bridge is manual and half of it is easy to
  // forget, which would leave the app showing stale statuses.
  await expect(page.getByText("A log has not come back yet")).toBeVisible();
});

test("importing the log completes the round trip", async () => {
  const messageId = messageIdFrom(readFileSync(outboxPath, "utf8"));
  const logPath = join(userDataDir, "log.csv");
  writeFileSync(
    logPath,
    [
      "message_id,status,sent_at,provider_message_id,thread_id,opened_at,replied_at,error",
      `${messageId},sent,,gmail-1,thread-1,,,`,
    ].join("\n"),
    "utf8",
  );

  app = await launch();
  const page = await app.firstWindow();
  await ensureCompany(page);
  await stubOpen(app, logPath);

  await page.getByRole("button", { name: "Email" }).click();
  await page.getByRole("button", { name: "Import a log" }).click();

  await expect(page.getByText(/log.csv: 1 rows, 1 applied/)).toBeVisible();
  await expect(page.getByText("Sent", { exact: true })).toBeVisible();

  // The exit criterion: it is on the lead's history.
  await page.getByRole("button", { name: "Leads" }).click();
  await page.locator(".leadrow__name", { hasText: /Bengaluru Public School/ }).click();
  await expect(page.getByText("Email sent")).toBeVisible();

  // And the warning has cleared.
  await page.getByRole("button", { name: "Today" }).click();
  await expect(page.getByText("A log has not come back yet")).toHaveCount(0);
});

test("importing the same log again changes nothing and says so", async () => {
  app = await launch();
  const page = await app.firstWindow();
  await ensureCompany(page);
  await stubOpen(app, join(userDataDir, "log.csv"));

  await page.getByRole("button", { name: "Email" }).click();
  await page.getByRole("button", { name: "Import a log" }).click();

  await expect(page.getByText(/1 already known/)).toBeVisible();
  await expect(page.getByText("This exact file has been read before")).toBeVisible();
});

test("a reply surfaces on Today and stops when answered", async () => {
  const messageId = messageIdFrom(readFileSync(outboxPath, "utf8"));
  const replyPath = join(userDataDir, "reply.csv");
  writeFileSync(
    replyPath,
    [
      "message_id,status,sent_at,provider_message_id,thread_id,opened_at,replied_at,error",
      `${messageId},replied,,,,,,`,
    ].join("\n"),
    "utf8",
  );

  app = await launch();
  const page = await app.firstWindow();
  await ensureCompany(page);
  await stubOpen(app, replyPath);

  await page.getByRole("button", { name: "Email" }).click();
  await page.getByRole("button", { name: "Import a log" }).click();
  await expect(page.getByText("Replied")).toBeVisible();

  await page.getByRole("button", { name: "Today" }).click();
  await expect(page.getByText("1 reply is waiting on you")).toBeVisible();

  // Clicking through opens the lead; writing back clears it.
  await page.getByRole("button", { name: /Bengaluru Public School/ }).click();
  await page.getByRole("button", { name: "Write one" }).click();
  await page.getByLabel("Subject").fill("Thanks for coming back to me");
  await page.getByLabel("Message").fill("Shall we talk on Thursday?");
  await page.getByRole("button", { name: "Queue it" }).click();

  await page.getByRole("button", { name: "Today" }).click();
  await expect(page.getByText("reply is waiting on you")).toHaveCount(0);
});

test("a template and a sequence can be built and run", async () => {
  app = await launch();
  const page = await app.firstWindow();
  await ensureCompany(page);
  await page.getByRole("button", { name: "Email" }).click();

  await page.getByRole("tab", { name: /Templates/ }).click();
  await page.getByRole("button", { name: "New template" }).click();
  await page.getByLabel("Name").fill("First approach");
  await page.getByLabel("Subject").fill("A question about {{lead.name}}");
  await page.getByLabel("Message").fill("Hi, this is {{company.name}}.");
  await page.getByRole("button", { name: "Add template" }).click();
  await expect(page.getByText("First approach")).toBeVisible();

  await page.getByRole("tab", { name: /Sequences/ }).click();
  await page.getByRole("button", { name: "New sequence" }).click();
  await page.getByLabel("New sequence name").fill("Schools outreach");
  await page.getByRole("button", { name: "Add", exact: true }).click();

  await page.getByRole("button", { name: "Add step" }).click();
  await expect(page.getByText("Straight away")).toBeVisible();
});

test("an unknown token is flagged rather than silently blanked", async () => {
  app = await launch();
  const page = await app.firstWindow();
  await ensureCompany(page);

  await page.getByRole("button", { name: "Email" }).click();
  await page.getByRole("tab", { name: /Templates/ }).click();
  await page.getByRole("button", { name: "New template" }).click();
  await page.getByLabel("Message").fill("Hi {{lead.nmae}}, a typo lives here.");

  // A typo would otherwise delete half a sentence in a real email.
  await expect(page.getByText(/does not know \{\{lead.nmae\}\}/)).toBeVisible();
});

test("everything survives a restart", async () => {
  app = await launch();
  const page = await app.firstWindow();
  await ensureCompany(page);

  await page.getByRole("button", { name: "Email" }).click();
  await expect(page.getByText("Introducing Unifloe")).toBeVisible();
  await expect(page.getByText("Replied")).toBeVisible();
});
