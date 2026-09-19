import { test, expect, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { goTo, passSetup } from "./nav";

/**
 * Email through the Google script, in a real window.
 *
 * There is no Google account here, so the script is played by a stand-in
 * inside the main process: an `https` protocol handler, which `net.fetch`
 * consults before the network. Everything on Caulder's side of the request
 * is real - the URL check, the key, the stored connection, the service, the
 * table and the screens. The script's own behaviour is tested against the real
 * file in electron/main/services/script.test.ts.
 */

test.describe.configure({ mode: "serial" });

const URL = "https://script.google.com/macros/s/AKfycbTestDeployment/exec";
const LEAD_EMAIL = "asha@oakridge.example.com";

let userDataDir: string;
let app: ElectronApplication;
let page: Page;

type Call = { action: string; to?: string; sendAt?: string | null };

/**
 * Plays the script. State lives on the main process's global so a test can
 * change how it answers - an older version, a reply arriving - between steps.
 */
async function installScript() {
  await app.evaluate(async ({ app: electronApp, protocol }) => {
    // The protocol module is only usable once the app is ready, and launch
    // hands the app over before that.
    await electronApp.whenReady();

    type Job = {
      id: string;
      status: string;
      sentAt: string | null;
      repliedAt: string | null;
      followUp: { status: string; sentAt: null; error: null } | null;
    };
    const fake = {
      version: 3,
      calls: [] as unknown[],
      jobs: new Map<string, Job>(),
      replied: new Set<string>(),
    };
    (globalThis as Record<string, unknown>)["fakeScript"] = fake;

    const view = (job: Job) => ({ ...job, error: null });

    protocol.handle("https", async (request) => {
      if (!request.url.startsWith("https://script.google.com/")) {
        return new Response("Not here", { status: 404 });
      }
      const body = JSON.parse(await request.text()) as Record<string, unknown>;
      if (body["secret"] !== "the-key") {
        return Response.json({ ok: false, error: "That key does not match this script." });
      }
      fake.calls.push({ action: body["action"], to: body["to"], sendAt: body["sendAt"] });
      const now = new Date().toISOString();

      switch (body["action"]) {
        case "hello":
          return Response.json({
            ok: true,
            data:
              fake.version < 2
                ? { email: "founder@gmail.com", calendars: [], taskLists: [] }
                : {
                    email: "founder@gmail.com",
                    calendars: [],
                    taskLists: [],
                    version: fake.version,
                    mail: { address: "founder@gmail.com", remaining: 99 },
                    mailError: null,
                  },
          });
        case "sendEmail": {
          const job: Job = {
            id: String(body["id"]),
            status: body["sendAt"] ? "scheduled" : "sent",
            sentAt: body["sendAt"] ? null : now,
            repliedAt: null,
            followUp: body["followUp"] ? { status: "waiting", sentAt: null, error: null } : null,
          };
          fake.jobs.set(job.id, job);
          return Response.json({ ok: true, data: view(job) });
        }
        case "cancelEmail": {
          const job = fake.jobs.get(String(body["id"]))!;
          if (job.status === "scheduled") job.status = "cancelled";
          if (job.followUp?.status === "waiting") job.followUp.status = "cancelled";
          return Response.json({ ok: true, data: view(job) });
        }
        case "emailStatus": {
          const ids = body["ids"] as string[];
          const emails = ids.map((id) => {
            const job = fake.jobs.get(id);
            if (!job) return { id, status: "missing", sentAt: null, repliedAt: null, error: null, followUp: null };
            if (fake.replied.has(id) && job.status === "sent") {
              job.status = "replied";
              job.repliedAt = now;
              if (job.followUp?.status === "waiting") job.followUp.status = "skipped";
            }
            return view(job);
          });
          return Response.json({ ok: true, data: { emails, remaining: 98 } });
        }
        default:
          return Response.json({ ok: false, error: `No such action: ${String(body["action"])}` });
      }
    });
  });
}

async function scriptCalls(): Promise<Call[]> {
  return app.evaluate(
    () => ((globalThis as Record<string, unknown>)["fakeScript"] as { calls: Call[] }).calls,
  );
}

async function openContact() {
  await goTo(page, "Contacts");
  await page.locator(".leadrow__name", { hasText: /Oakridge/ }).click();
  await expect(page.getByRole("heading", { name: "Oakridge" })).toBeVisible();
}

test.beforeAll(async () => {
  userDataDir = mkdtempSync(join(tmpdir(), "caulder-mail-"));
  app = await electron.launch({
    args: [".", `--user-data-dir=${userDataDir}`],
    env: { ...process.env, ELECTRON_ENABLE_LOGGING: "0" },
  });
  await installScript();
  page = await app.firstWindow();

  await page.waitForSelector(".firstrun, .sidebar");
  await page.getByLabel("Company name").fill("Unifloe");
  await page.getByRole("button", { name: "Create company" }).click();
  await passSetup(page);
  await expect(page.getByRole("button", { name: /Company: Unifloe/ })).toBeVisible();
});

test.afterAll(async () => {
  await app?.close();
  rmSync(userDataDir, { recursive: true, force: true });
});

test("without the script, a contact's email opens the mail app and says why", async () => {
  await goTo(page, "Contacts");
  await page.getByRole("button", { name: "Add a contact" }).click();
  await page.getByLabel("Name").fill("Oakridge");
  await page.getByLabel("Contact person").fill("Asha");
  await page.getByLabel("Email").fill(LEAD_EMAIL);
  await page.getByRole("button", { name: "Add contact" }).click();
  await expect(page.getByRole("heading", { name: "Oakridge" })).toBeVisible();

  await expect(page.getByText(/Connect Google in Settings.*opens your own mail app/)).toBeVisible();
  await page.getByRole("button", { name: "Write one" }).click();
  await expect(page.getByRole("button", { name: "Open in your mail app" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Send", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
});

test("a test URL is caught, and the whole setUp line is accepted as the key", async () => {
  await goTo(page, "Settings");

  const url = page.getByLabel("Web app URL");
  const key = page.getByLabel("Key", { exact: true });

  // The /dev link only works while signed in to Google, so it would connect
  // for nobody. Caught here rather than as a mysterious failure later.
  await url.fill(URL.replace(/exec$/, "dev"));
  await key.fill("the-key");
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(page.getByText(/test URL/)).toBeVisible();

  await url.fill(URL);
  await key.fill("Info   Your Caulder key: the-key");
  await page.getByRole("button", { name: "Connect", exact: true }).click();

  await expect(
    page.getByText(/Email goes out from founder@gmail\.com, with 99 sends left today/),
  ).toBeVisible();
});

test("an email sent now goes to the contact's own address and onto the history", async () => {
  await openContact();
  await expect(page.getByText(/Sends from founder@gmail\.com, 99 more today/)).toBeVisible();

  await page.getByRole("button", { name: "Write one" }).click();
  await page.getByLabel("Subject").fill("Timetables for Oakridge");
  await page.getByLabel("Message").fill("Hello Asha, a quick question about next term.");
  await page.getByRole("button", { name: "Send", exact: true }).click();

  const list = page.getByRole("list", { name: "Emails to this contact" });
  const row = list.locator(".mailrow", { hasText: "Timetables for Oakridge" });
  await expect(row.getByText("Sent", { exact: true })).toBeVisible();
  await expect(row.getByText("Sent today. No reply yet.")).toBeVisible();
  await expect(page.locator(".timeline__list").getByText("Email sent")).toBeVisible();

  const sends = (await scriptCalls()).filter((call) => call.action === "sendEmail");
  expect(sends.at(-1)).toMatchObject({ to: LEAD_EMAIL, sendAt: null });
});

test("a scheduled email with a follow-up is listed, and can be cancelled", async () => {
  const id = await page.evaluate(async () => (await window.caulder.companies.list()).activeCompanyId);
  await page.evaluate(
    (company) =>
      window.caulder.email.createTemplate(company!, {
        name: "Gentle nudge",
        subject: "Following up",
        body: "Hi {{lead.greeting}}, any thoughts?",
        channel: "email",
      }),
    id,
  );
  // The template list is read when the section opens.
  await openContact();

  await page.getByRole("button", { name: "Write one" }).click();
  await page.getByLabel("Subject").fill("Next term, in writing");
  await page.getByLabel("Message").fill("Hello Asha, as promised.");
  await page.getByRole("button", { name: "Later", exact: true }).click();
  await expect(page.getByLabel("Send at")).toBeVisible();
  await page.getByLabel("Follow up if they do not reply").check();
  await expect(page.getByLabel(/After how many days/)).toHaveValue("4");
  await page.getByRole("button", { name: "Schedule" }).click();

  const row = page
    .getByRole("list", { name: "Emails to this contact" })
    .locator(".mailrow", { hasText: "Next term, in writing" });
  await expect(row.getByText("Scheduled", { exact: true })).toBeVisible();
  await expect(row.getByText(/Follow-up 4 days after it goes/)).toBeVisible();

  const sends = (await scriptCalls()).filter((call) => call.action === "sendEmail");
  expect(sends.at(-1)?.sendAt).toMatch(/T\d\d:\d\d:00\.000Z$/);

  await row.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(row.getByText("Cancelled", { exact: true })).toBeVisible();
  await expect(row.getByText("Follow-up cancelled.")).toBeVisible();
  await expect(row.getByRole("button")).toHaveCount(0);

  // Nothing went, so the history says nothing about it.
  await expect(page.locator(".timeline__list").getByText("Email sent")).toHaveCount(1);
});

test("a reply shows on the contact and on Today", async () => {
  await app.evaluate(() => {
    const fake = (globalThis as Record<string, unknown>)["fakeScript"] as {
      jobs: Map<string, { status: string }>;
      replied: Set<string>;
    };
    for (const [id, job] of fake.jobs) if (job.status === "sent") fake.replied.add(id);
  });

  await openContact();
  await page.getByRole("button", { name: "Check for replies" }).click();

  const row = page
    .getByRole("list", { name: "Emails to this contact" })
    .locator(".mailrow", { hasText: "Timetables for Oakridge" });
  await expect(row.getByText("Replied", { exact: true })).toBeVisible();
  await expect(page.locator(".timeline__list").getByText("Reply received")).toBeVisible();

  await goTo(page, "Today");
  const replies = page.locator(".card", { has: page.getByRole("heading", { name: "Replies" }) });
  await expect(replies.getByText("Oakridge", { exact: true })).toBeVisible();
  await expect(replies.getByText("Re: Timetables for Oakridge")).toBeVisible();

  await replies.getByRole("button", { name: /Oakridge/ }).click();
  await expect(page.getByRole("heading", { name: "Oakridge" })).toBeVisible();
});

test("an older script is explained on Settings, and a contact falls back to the mail app", async () => {
  await app.evaluate(() => {
    ((globalThis as Record<string, unknown>)["fakeScript"] as { version: number }).version = 1;
  });

  await goTo(page, "Settings");
  await expect(page.getByText(/Your script is version 1\. Version 3 sends email/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy the new script" })).toBeVisible();
  await expect(page.getByText(/Deploy › Manage deployments/)).toBeVisible();

  await openContact();
  await expect(page.getByText(/older version that cannot send email/)).toBeVisible();
  // What was already sent stays listed; only sending is held back.
  await expect(page.getByRole("list", { name: "Emails to this contact" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Check for replies" })).toHaveCount(0);
});
