import { test, expect, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { goTo } from "./nav";

/**
 * Ask the brain and Export for an AI, in a real window.
 *
 * There is no Google AI Studio account here, so Gemini is played by a stand-in
 * in the main process: an `https` protocol handler, which `net.fetch` asks
 * before the network - the same trick as the email suite. Everything on
 * Caulder's side is real: the setup guide, the key check, the sealed
 * connection, the model list, the dossier and the screens.
 */

test.describe.configure({ mode: "serial" });

const KEY = "AIzaSyE2E0123456789abcdefghijklWXYZ";
const SCHOOL = "Oakridge International School";

let userDataDir: string;
let app: ElectronApplication;
let page: Page;

type Seen = { path: string; key: string | null; body: { contents?: unknown[]; systemInstruction?: { parts: { text: string }[] } } | null };

async function installGemini() {
  await app.evaluate(async ({ app: electronApp, protocol }, key) => {
    await electronApp.whenReady();
    const seen: unknown[] = [];
    (globalThis as Record<string, unknown>)["fakeGemini"] = seen;
    protocol.handle("https", async (request) => {
      const url = new URL(request.url);
      if (url.host !== "generativelanguage.googleapis.com") return new Response("Not here", { status: 404 });
      const body = request.method === "POST" ? JSON.parse(await request.text()) : null;
      const given = request.headers.get("x-goog-api-key");
      seen.push({ path: url.pathname, key: given, body });
      if (given !== key) {
        return Response.json(
          { error: { code: 400, message: "API key not valid. Please pass a valid API key.", status: "INVALID_ARGUMENT" } },
          { status: 400 },
        );
      }
      if (url.pathname.endsWith("/models")) {
        return Response.json({
          models: [
            { name: "models/gemini-2.5-flash", displayName: "Gemini 2.5 Flash", supportedGenerationMethods: ["generateContent"] },
            { name: "models/gemini-2.5-pro", displayName: "Gemini 2.5 Pro", supportedGenerationMethods: ["generateContent"] },
            { name: "models/text-embedding-004", displayName: "Embedding", supportedGenerationMethods: ["embedContent"] },
          ],
        });
      }
      const turns = ((body as { contents?: unknown[] }).contents ?? []).length;
      return Response.json({
        candidates: [
          {
            content: {
              parts: [
                {
                  text:
                    turns === 1
                      ? "Call [[Oakridge International School]] before ten - the principal is busiest after. Nothing says what they pay yet."
                      : "After that, send the pilot plan.",
                },
              ],
            },
            finishReason: "STOP",
          },
        ],
        usageMetadata: { promptTokenCount: 5400, candidatesTokenCount: 40, cachedContentTokenCount: turns === 1 ? 0 : 5000 },
      });
    });
  }, KEY);
}

async function seen(): Promise<Seen[]> {
  return app.evaluate(() => (globalThis as Record<string, unknown>)["fakeGemini"] as Seen[]);
}

test.beforeAll(async () => {
  userDataDir = mkdtempSync(join(tmpdir(), "caulder-ask-"));
  app = await electron.launch({
    args: [".", `--user-data-dir=${userDataDir}`],
    env: { ...process.env, ELECTRON_ENABLE_LOGGING: "0" },
  });
  await installGemini();
  page = await app.firstWindow();
  await page.getByLabel("Company name").fill("Unifloe");
  await page.getByRole("button", { name: "Create company" }).click();
});

test.afterAll(async () => {
  await app?.close();
  rmSync(userDataDir, { recursive: true, force: true });
});

test("the setup guide connects a free Gemini key, checking it first", async () => {
  // A new company lands on the guide, which says what each connection is for.
  await expect(page.getByRole("heading", { name: "Caulder is yours, Unifloe" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /An AI, to ask the brain/ })).toBeVisible();
  // Gemini is the one it starts on, and it says it is free.
  const gemini = page.getByRole("radio", { name: /Google Gemini/ });
  await expect(gemini).toBeChecked();
  await expect(gemini).toContainText("Free");
  await expect(page.getByText("Create API key")).toBeVisible();

  const key = page.getByLabel("Google Gemini API key");
  await key.fill("AIzaWrongKeyWrongKeyWrong");
  await page.getByRole("button", { name: "Connect Google Gemini" }).click();
  await expect(page.getByText("Google Gemini did not accept that key")).toBeVisible();

  await key.fill(KEY);
  await page.getByRole("button", { name: "Connect Google Gemini" }).click();
  await expect(page.getByText(/Google Gemini.*is connected/)).toBeVisible();
  // The models it offered, with the newest plain Flash chosen.
  await expect(page.getByLabel("Model", { exact: true })).toContainText("Gemini 2.5 Flash (gemini-2.5-flash)");
  await expect(page.getByLabel("Google Gemini API key")).toHaveCount(0);
  expect((await seen()).map((request) => request.path)).toEqual(["/v1beta/models", "/v1beta/models"]);

  await page.getByRole("button", { name: "Done, take me to Today" }).click();
  await expect(page.getByRole("heading", { name: "Today", level: 1 })).toBeVisible();

  await goTo(page, "Contacts");
  await page.locator(".leads__toolbar").getByRole("button", { name: "Add contact" }).click();
  await page.getByLabel("Name", { exact: true }).fill(SCHOOL);
  await page.getByLabel("Notes").fill("The principal answers before ten.");
  await page.getByRole("button", { name: "Add contact" }).click();
  await expect(page.getByRole("heading", { name: SCHOOL })).toBeVisible();
});

test("a question is answered from the company, with links, and a follow-up keeps the thread", async () => {
  await goTo(page, "Brain");
  const box = page.getByLabel("Ask the brain");
  await box.fill("When should I call Oakridge?");
  await box.press("Enter");

  const thread = page.getByRole("list", { name: "Questions and answers" });
  await expect(thread).toContainText("the principal is busiest after");
  await thread.getByText("What was sent").click();
  await expect(thread).toContainText("To Google Gemini (Gemini 2.5 Flash)");
  await expect(thread).toContainText("4 documents (Read me first, The company, Customers and sales, People and running the company)");

  const first = (await seen()).at(-1);
  expect(first?.path).toBe("/v1beta/models/gemini-2.5-flash:generateContent");
  expect(first?.body?.systemInstruction?.parts[0]?.text).toContain("> The principal answers before ten.");
  expect(first?.body?.contents).toEqual([{ role: "user", parts: [{ text: "When should I call Oakridge?" }] }]);

  await box.fill("And after that?");
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(thread).toContainText("send the pilot plan");
  expect((await seen()).at(-1)?.body?.contents).toHaveLength(3);
  await expect(thread.getByText("5,000 from the cache")).toBeAttached();

  // The contact the answer named opens.
  await thread.getByRole("button", { name: SCHOOL }).click();
  await expect(page.getByRole("heading", { name: SCHOOL })).toBeVisible();
});

test("Settings keeps the connection, and can change the model and how much it reads", async () => {
  await goTo(page, "Settings");
  await expect(page.getByText(/Google Gemini.*is connected/)).toBeVisible();
  await page.getByLabel("Model", { exact: true }).click();
  await page.getByRole("option", { name: /Gemini 2.5 Pro/ }).click();
  await expect(page.getByLabel("Model", { exact: true })).toContainText("gemini-2.5-pro");

  await page.getByLabel("Another model's name").fill("gemini-3-flash");
  await page.getByRole("button", { name: "Use it" }).click();
  await expect(page.getByLabel("Model", { exact: true })).toContainText("gemini-3-flash");

  await page
    .getByRole("radiogroup", { name: "How much of the company it reads" })
    .getByRole("radio", { name: "A short copy" })
    .click();
  await expect(page.getByText(/About 15,000 tokens/)).toBeVisible();

  // And it can be taken away again.
  await page.getByRole("button", { name: "Disconnect" }).click();
  await expect(page.getByRole("radio", { name: /Google Gemini/ })).toBeVisible();
  await goTo(page, "Brain");
  await expect(page.getByRole("button", { name: "Connect an AI in Settings" })).toBeVisible();
});

test("Export for an AI writes the company as four documents", async () => {
  const target = join(userDataDir, "dossier-out");
  mkdirSync(target, { recursive: true });
  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: [path] } as never);
  }, target);

  await goTo(page, "Brain");
  await page.getByLabel("Brain sections").getByRole("button", { name: "Share and export" }).click();
  await page.getByRole("button", { name: "Export for an AI" }).click();
  await expect(page.getByText(/4 files written to/)).toBeVisible();

  const [folder] = readdirSync(target);
  const files = readdirSync(join(target, folder ?? ""));
  expect(files).toEqual([
    "00 Unifloe - read me first.md",
    "01 Unifloe - the company.md",
    "02 Unifloe - customers and sales.md",
    "03 Unifloe - people and running the company.md",
  ]);
  const sales = readFileSync(join(target, folder ?? "", "02 Unifloe - customers and sales.md"), "utf8");
  expect(sales).toContain(`### ${SCHOOL}`);
});
