import { test, expect, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { goTo, passSetup } from "./nav";

/**
 * Two founders, in a real window.
 *
 * The owner's Google script is played by a stand-in inside the main process,
 * keeping the shared brain's log in memory the way the real one keeps it in a
 * spreadsheet (that file is tested against two databases in
 * electron/main/services/brainsync.test.ts). The co-founder is played by
 * writing into that log directly: what matters here is what the owner sees.
 *
 * Set CAULDER_SHOTS to a folder to keep a screenshot of each screen.
 */

test.describe.configure({ mode: "serial" });

const URL = "https://script.google.com/macros/s/AKfycbTestDeployment/exec";

let userDataDir: string;
let app: ElectronApplication;
let page: Page;

async function shot(name: string) {
  const folder = process.env["CAULDER_SHOTS"];
  if (!folder) return;
  mkdirSync(folder, { recursive: true });
  await page.screenshot({ path: join(folder, `sharing-${name}.png`) });
}

/** Plays the owner's script: hello, and the shared brain's log. */
async function installScript() {
  await app.evaluate(async ({ app: electronApp, protocol }) => {
    await electronApp.whenReady();
    type Row = {
      key: string;
      pageId: string;
      revision: number;
      author: string;
      editedAt: string;
      concurrentWith: number | null;
      deleted: boolean;
      payload: string;
    };
    const fake = {
      brains: new Map<string, { name: string; by: string }>(),
      invites: new Map<string, string>(),
      log: [] as Row[],
      latest(key: string, pageId: string) {
        return Math.max(0, ...this.log.filter((row) => row.key === key && row.pageId === pageId).map((row) => row.revision));
      },
      /** The co-founder saving a page: the next revision, on top of whatever they last saw. */
      pushAs(author: string, pageId: string, page: Record<string, unknown>, base?: number) {
        const key = [...this.brains.keys()][0] as string;
        const latest = this.latest(key, pageId);
        this.log.push({
          key,
          pageId,
          revision: latest + 1,
          author,
          editedAt: new Date().toISOString(),
          concurrentWith: base !== undefined && base < latest ? latest : null,
          deleted: false,
          payload: JSON.stringify(page),
        });
      },
    };
    (globalThis as Record<string, unknown>)["fakeScript"] = fake;

    protocol.handle("https", async (request) => {
      if (!request.url.startsWith("https://script.google.com/")) return new Response("Not here", { status: 404 });
      const body = JSON.parse(await request.text()) as Record<string, unknown>;
      let key = String(body["key"] ?? "");
      if (body["invite"]) {
        const invited = fake.invites.get(String(body["invite"]));
        if (!invited) return Response.json({ ok: false, error: "That invitation is not right, or the brain is no longer shared." });
        key = invited;
      } else if (body["secret"] !== "the-key") {
        return Response.json({ ok: false, error: "That key is not right." });
      }
      const ok = (data: unknown) => Response.json({ ok: true, data });

      switch (body["action"]) {
        case "hello":
          return ok({
            email: "asha@gmail.com",
            calendars: [],
            taskLists: [],
            version: 3,
            mail: { address: "asha@gmail.com", remaining: 99 },
            mailError: null,
          });
        case "brainCreate": {
          const made = `brain-${fake.brains.size + 1}`;
          fake.brains.set(made, { name: String(body["name"]), by: String(body["author"]) });
          fake.invites.set("abcdef0123456789abcdef", made);
          return ok({ key: made, name: String(body["name"]), invite: "abcdef0123456789abcdef" });
        }
        case "brainInvite":
          return ok({ invite: "abcdef0123456789abcdef" });
        case "brainClose":
          fake.invites.clear();
          return ok({ closed: true });
        case "brainInfo": {
          const brain = fake.brains.get(key);
          return ok({ key, name: brain?.name, createdBy: brain?.by, pages: new Set(fake.log.map((row) => row.pageId)).size });
        }
        case "brainPush": {
          const results = (body["changes"] as { pageId: string; baseRevision: number; deleted: boolean; payload: string; editedAt: string }[]).map(
            (change) => {
              const latest = fake.latest(key, change.pageId);
              fake.log.push({
                key,
                pageId: change.pageId,
                revision: latest + 1,
                author: String(body["author"]),
                editedAt: change.editedAt,
                concurrentWith: latest > change.baseRevision ? latest : null,
                deleted: change.deleted,
                payload: change.payload,
              });
              return { pageId: change.pageId, revision: latest + 1, concurrent: latest > change.baseRevision };
            },
          );
          return ok({ results });
        }
        case "brainPull": {
          const since = Number(body["since"]) || 0;
          const changes = fake.log.slice(since).filter((row) => row.key === key);
          return ok({ changes, cursor: fake.log.length, more: false });
        }
        default:
          return Response.json({ ok: false, error: `Caulder asked for something this script does not do: ${String(body["action"])}` });
      }
    });
  });
}

/** The co-founder saving a page in their own Caulder, arriving in the log. */
async function cofounderSaves(pageId: string, body: string, title = "The plan", base?: number) {
  await app.evaluate(
    (_electron, args) => {
      const fake = (globalThis as Record<string, unknown>)["fakeScript"] as {
        pushAs: (author: string, pageId: string, page: Record<string, unknown>, base?: number) => void;
      };
      fake.pushAs("Ravi", args.pageId, { section: "plan", template: "page", title: args.title, body: args.body, fields: {}, isArchived: false }, args.base);
    },
    { pageId, body, title, base },
  );
}

async function companyId(): Promise<string> {
  return page.evaluate(async () => (await window.caulder.companies.list()).activeCompanyId as string);
}

test.beforeAll(async () => {
  userDataDir = mkdtempSync(join(tmpdir(), "caulder-sharing-"));
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

test("sharing asks who you are first, then lives in your script, and the invitation reaches the clipboard", async () => {
  await goTo(page, "Brain");
  await page.getByLabel("Brain sections").getByRole("button", { name: "Share and export" }).click();
  await expect(page.getByRole("button", { name: "This is me, in Settings" })).toBeVisible();

  await goTo(page, "Settings");
  await page.getByLabel("Your name").fill("Asha");
  await page.getByRole("button", { name: "Save", exact: true }).first().click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  await page.getByLabel("Web app URL").fill(URL);
  await page.getByLabel("Key", { exact: true }).fill("the-key");
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(page.getByText(/asha@gmail\.com/).first()).toBeVisible();

  // A page written before sharing goes up with the rest.
  const id = await companyId();
  await page.evaluate(async (company) => {
    const made = await window.caulder.brain.create(company, "plan", "page");
    await window.caulder.brain.save(made.id, { title: "The plan", body: "Sell to schools.", fields: {}, secrets: {}, baseRevision: made.revision });
  }, id);

  await goTo(page, "Brain");
  await page.getByLabel("Brain sections").getByRole("button", { name: "Share and export" }).click();
  await page.getByRole("button", { name: "Share it" }).click();
  await expect(page.getByText(/Shared as/)).toBeVisible();
  await expect(page.getByText(/in your Google script\. In step today\./)).toBeVisible();

  await page.getByRole("button", { name: "Copy the invitation" }).click();
  await expect(page.getByText(/Copied\. Send it to your co-founder/)).toBeVisible();
  const clipboard = await app.evaluate(({ clipboard: board }) => board.readText());
  expect(clipboard).toBe(`${URL}#abcdef0123456789abcdef`);

  const sent = await app.evaluate(() => ((globalThis as Record<string, unknown>)["fakeScript"] as { log: { author: string }[] }).log);
  expect(sent.map((row) => row.author)).toEqual(["Asha"]);
  await shot("shared");
});

test("the co-founder's change arrives with their name on it", async () => {
  const pageId = await page.evaluate(async () => {
    const company = (await window.caulder.companies.list()).activeCompanyId as string;
    const pages = await window.caulder.brain.section(company, "plan", false);
    return pages[0]?.id as string;
  });
  await cofounderSaves(pageId, "Sell to schools in Bengaluru, then Mysuru.");

  await page.getByRole("button", { name: "Bring in step now" }).click();
  await page.getByLabel("Brain sections").getByRole("button", { name: /^Plan/ }).click();
  await page.getByRole("button", { name: /The plan/ }).click();
  await expect(page.getByText("Sell to schools in Bengaluru, then Mysuru.")).toBeVisible();
  await expect(page.getByText(/Updated today by Ravi/)).toBeVisible();
});

test("a page both change at once keeps both, and says so", async () => {
  const pageId = await page.evaluate(async () => {
    const company = (await window.caulder.companies.list()).activeCompanyId as string;
    return (await window.caulder.brain.section(company, "plan", false))[0]?.id as string;
  });

  // Asha edits here; Ravi, not having seen it, edits there.
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Page", { exact: true }).fill("Asha: schools first, colleges next year.");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Asha: schools first, colleges next year.")).toBeVisible();
  await cofounderSaves(pageId, "Ravi: colleges first.", "The plan", 2);

  await page.getByLabel("Brain sections").getByRole("button", { name: "Share and export" }).click();
  await page.getByRole("button", { name: "Bring in step now" }).click();
  await expect(page.getByText(/In step today\./)).toBeVisible();
  await page.getByLabel("Brain sections").getByRole("button", { name: /^Plan/ }).click();
  await page.getByRole("button", { name: /The plan/ }).click();

  await expect(page.getByText(/Edited at the same time by both of you/)).toBeVisible();
  await expect(page.getByText("Asha: schools first, colleges next year.")).toBeVisible();
  await page.getByRole("button", { name: "Compare them" }).click();
  await expect(page.getByRole("region", { name: "Page history" }).getByText("Ravi: colleges first.")).toBeVisible();
  await shot("together");
});

test("the brain saves as a file, and bringing it back in changes nothing", async () => {
  const file = join(userDataDir, "brain.json");
  await app.evaluate(({ dialog }, path) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: path });
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
  }, file);

  await page.getByLabel("Brain sections").getByRole("button", { name: "Share and export" }).click();
  await page.getByRole("button", { name: "Save as a file" }).click();
  await expect(page.getByText("Saved: 1 page.")).toBeVisible();
  expect(existsSync(file)).toBe(true);

  await page.getByRole("button", { name: "Bring in a file" }).click();
  await expect(page.getByText("1 already the same")).toBeVisible();
});
