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
 *
 * The same stand-in reads a line in AI mode, drafts the brief and tidies a
 * page, by what it is told it is doing - so what Caulder sends for each, and
 * what it does with what comes back, is what is tested.
 */

test.describe.configure({ mode: "serial" });

const KEY = "AIzaSyE2E0123456789abcdefghijklWXYZ";
const SCHOOL = "Oakridge International School";

let userDataDir: string;
let app: ElectronApplication;
let page: Page;

type Seen = {
  path: string;
  key: string | null;
  body: { contents?: { parts: { text: string }[] }[]; systemInstruction?: { parts: { text: string }[] } } | null;
};

async function installGemini() {
  await app.evaluate(async ({ app: electronApp, protocol }, { key, school }) => {
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
      const asked = body as { contents?: { parts: { text: string }[] }[]; systemInstruction?: { parts: { text: string }[] } };
      const told = asked.systemInstruction?.parts[0]?.text ?? "";
      const last = asked.contents?.at(-1)?.parts[0]?.text ?? "";
      const say = (text: string) =>
        Response.json({
          candidates: [{ content: { parts: [{ text }] }, finishReason: "STOP" }],
          usageMetadata: { promptTokenCount: 320, candidatesTokenCount: 30 },
        });
      // A line to read, in AI mode: what it is, as JSON.
      if (told.startsWith("You read one line")) {
        // A free tier that has run out for the minute.
        if (/courier/i.test(last)) return Response.json({ error: { code: 429, message: "Quota exceeded." } }, { status: 429 });
        if (/anil/i.test(last)) {
          const then = { title: "Send Anil a quote", day: null };
          return say(
            JSON.stringify(
              last.includes("You asked")
                ? { kind: "new_contact", person: "Anil", company: "Brightside Labs", happened: "Wants a quote for 40 seats.", then }
                : { kind: "new_contact", person: "Anil", happened: "Wants a quote for 40 seats.", then },
            ),
          );
        }
        return say(JSON.stringify({ kind: "task", contact: school, title: "Send Oakridge the quote", day: null, time: null }));
      }
      if (told.startsWith("You write a brief")) return say("- Sells timetabling to schools.\n- Bills yearly.");
      if (told.startsWith("You tidy one page")) return say("- Sells timetabling to schools.\n- Bills every year, in advance.");
      const turns = (asked.contents ?? []).length;
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
  }, { key: KEY, school: SCHOOL });
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
  const before = (await seen()).length;
  await box.fill("When should I call Oakridge?");
  // Said before it is sent: what this question takes with it - and nothing has gone yet.
  await expect(page.getByText(/Sending: the company in brief, Calls in the last 30 days, Oakridge International School - about [\d,]+ tokens\./)).toBeVisible();
  expect((await seen()).length).toBe(before);
  await box.press("Enter");

  const thread = page.getByRole("list", { name: "Questions and answers" });
  await expect(thread).toContainText("the principal is busiest after");
  await thread.getByText("What was sent").click();
  await expect(thread).toContainText("To Google Gemini (Gemini 2.5 Flash)");
  await expect(thread).toContainText("the company in brief, Calls in the last 30 days, Oakridge International School");
  await expect(thread).toContainText("1 of 1 contacts, the ones the question is about.");

  const first = (await seen()).at(-1);
  expect(first?.path).toBe("/v1beta/models/gemini-2.5-flash:generateContent");
  expect(first?.body?.systemInstruction?.parts[0]?.text).toContain("> The principal answers before ten.");
  // What the question needs, and not the company: no read-me, no funnel.
  expect(first?.body?.systemInstruction?.parts[0]?.text).not.toContain("read me first");
  expect(first?.body?.systemInstruction?.parts[0]?.text).not.toContain("## The funnel");
  expect(first?.body?.contents).toEqual([{ role: "user", parts: [{ text: "When should I call Oakridge?" }] }]);

  // And the whole company when the answer needed more.
  await thread.getByRole("button", { name: "Ask again with the whole company" }).click();
  await expect(thread.getByText("When should I call Oakridge?")).toHaveCount(2);
  await expect.poll(async () => (await seen()).at(-1)?.body?.systemInstruction?.parts[0]?.text ?? "").toContain("Unifloe: read me first");
  await page.getByRole("button", { name: "Start over" }).click();
  await box.fill("When should I call Oakridge?");
  await box.press("Enter");
  await expect(thread).toContainText("the principal is busiest after");

  await box.fill("And after that?");
  await page.getByRole("button", { name: "Ask", exact: true }).click();
  await expect(thread).toContainText("send the pilot plan");
  expect((await seen()).at(-1)?.body?.contents).toHaveLength(3);
  await expect(thread.getByText("5,000 from the cache")).toBeAttached();

  // The contact the answer named opens.
  await thread.getByRole("button", { name: SCHOOL }).click();
  await expect(page.getByRole("heading", { name: SCHOOL })).toBeVisible();
});

test("the mark on the line is AI mode: a line is read by the AI, shown, and kept by Enter", async () => {
  await goTo(page, "Today");
  const line = page.getByLabel("Anything, in one line");
  const mark = page.getByRole("button", { name: "AI mode" });
  await expect(mark).toHaveAttribute("aria-pressed", "false");
  await mark.click();
  await expect(mark).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("[data-ai-mode]")).toContainText("Enter sends each line to Google Gemini");

  // A line the AI reads its own way: shown first, and only then kept.
  const before = (await seen()).length;
  await line.fill("need to get that quote thing over to the oakridge lot by fri");
  await expect(page.locator(".quickadd__ai")).toContainText("Enter has Google Gemini read it");
  expect((await seen()).length).toBe(before);
  await line.press("Enter");
  await expect(page.locator(".quickadd__ai")).toContainText("Read by Google Gemini");
  await expect(page.locator(".quickadd__read")).toContainText("Send Oakridge the quote");
  // The line, today and names - not what is noted about anybody.
  const read = (await seen()).at(-1);
  expect(read?.body?.systemInstruction?.parts[0]?.text).toContain(`${SCHOOL} | -`);
  expect(read?.body?.systemInstruction?.parts[0]?.text).not.toContain("The principal answers before ten.");
  expect(read?.body?.contents?.at(-1)?.parts[0]?.text).toBe("need to get that quote thing over to the oakridge lot by fri");
  await line.press("Enter");
  await expect(page.locator(".quickadd__added")).toContainText("Send Oakridge the quote");

  // Somebody it does not know, from nowhere: it asks, and reads again with the answer.
  await line.fill("anil wants a quote for 40 seats");
  await line.press("Enter");
  const where = page.getByRole("textbox", { name: "Where is Anil from?" });
  await expect(where).toBeVisible();
  await line.press("Enter");
  await expect(where).toBeFocused();
  await where.fill("Brightside Labs");
  await where.press("Enter");
  await expect(page.locator(".quickadd__read")).toContainText("New contact: Anil at Brightside Labs");
  expect((await seen()).at(-1)?.body?.contents?.at(-1)?.parts[0]?.text).toContain("The founder answered: Brightside Labs");
  await line.press("Enter");
  await expect(page.locator(".quickadd__added")).toContainText("New contact: Anil at Brightside Labs");

  // Something to write is answered where it was asked, with what it needs.
  await line.fill("draft a short note to oakridge about the pilot");
  await expect(page.getByRole("button", { name: "Ask", exact: true })).toBeVisible();
  await line.press("Enter");
  await expect(page.locator(".quickadd__answer")).toContainText("the principal is busiest after");
  await expect(page.locator(".quickadd__read")).toContainText("Answered by Google Gemini");
  await page.locator(".quickadd__answer").getByRole("button", { name: "Done" }).click();

  // The AI cannot read one - over its limit: it says so, and Enter keeps the line as it was read here.
  await line.fill("courier the samples tomorrow");
  await line.press("Enter");
  await expect(page.locator(".quickadd .field__error")).toContainText("too many questions for now");
  await expect(page.locator(".quickadd .field__error")).toContainText("Enter keeps the line as this computer read it.");
  await line.press("Enter");
  await expect(page.locator(".quickadd__added")).toContainText("Courier the samples");

  // Off again, and the line is read here: nothing is sent for it.
  await mark.click();
  await expect(mark).toHaveAttribute("aria-pressed", "false");
  const after = (await seen()).length;
  await line.fill("call the bank tomorrow");
  await line.press("Enter");
  await expect(page.locator(".quickadd__added")).toContainText("Call the bank");
  expect((await seen()).length).toBe(after);
});

test("the company in brief is drafted by the AI, kept by hand, and then goes with every question", async () => {
  await goTo(page, "Brain");
  const card = page.locator(".card", { has: page.getByRole("heading", { name: "The company in brief" }) });
  await expect(card).toContainText("put together from the profile and the catalogue");
  await card.getByRole("button", { name: "Draft it with Google Gemini" }).click();
  const draft = card.getByLabel("The drafted brief");
  await expect(draft).toHaveValue("- Sells timetabling to schools.\n- Bills yearly.");
  await expect(card).toContainText("Nothing is kept until you keep it.");
  // Changed by hand before it is kept.
  await draft.fill("- Sells timetabling to schools in Karnataka.\n- Bills yearly.");
  await card.getByRole("button", { name: "Keep it" }).click();
  await expect(card).toContainText("Kept on the page “Company in brief”");
  await expect(card).toContainText("Sells timetabling to schools in Karnataka.");

  const box = page.getByLabel("Ask the brain");
  await box.fill("What did Oakridge say?");
  await box.press("Enter");
  await expect(page.getByRole("list", { name: "Questions and answers" })).toContainText("the principal is busiest after");
  expect((await seen()).at(-1)?.body?.systemInstruction?.parts[0]?.text).toContain("Sells timetabling to schools in Karnataka.");

  // The page it is kept on can be tidied: only that page goes, and it is kept whole or not at all.
  await card.getByRole("button", { name: "Open the page" }).click();
  await expect(page.getByRole("heading", { name: "Company in brief" })).toBeVisible();
  // What the AI drafted says so on the page - and that line is Caulder's note, not sent with anything.
  await expect(page.locator(".bpage__card")).toContainText("Drafted by Google Gemini");
  await page.getByRole("button", { name: "More" }).click();
  await page.getByRole("menuitem", { name: /Tidy with the AI/ }).click();
  const tidied = page.getByRole("region", { name: "The page, tidied" });
  await expect(tidied).toContainText("Bills every year, in advance.");
  const sent = (await seen()).at(-1);
  expect(sent?.body?.contents?.at(-1)?.parts[0]?.text).toContain("# Company in brief");
  expect(JSON.stringify(sent?.body)).not.toContain(SCHOOL);
  expect(JSON.stringify(sent?.body)).not.toContain("Drafted by");
  await expect(tidied).not.toContainText("Drafted by");
  await tidied.getByRole("button", { name: "Keep the tidied page" }).click();
  await expect(tidied).toHaveCount(0);
  await expect(page.locator(".bpage__card")).toContainText("Bills every year, in advance.");
  await expect(page.locator(".bpage__card")).toContainText("Tidied by Google Gemini");
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
    .getByRole("radiogroup", { name: "The most it is sent at once" })
    .getByRole("radio", { name: "A short copy" })
    .click();
  await expect(page.getByText(/About 15,000 tokens/)).toBeVisible();

  // What goes with a question: what it needs, unless the whole company is chosen.
  const scope = page.getByRole("radiogroup", { name: "What goes with a question" });
  await expect(scope.getByRole("radio", { name: "What the question needs" })).toBeChecked();
  await scope.getByRole("radio", { name: "The whole company, every time" }).click();
  await expect(page.getByText(/Every contact and every page with every question/)).toBeVisible();
  await scope.getByRole("radio", { name: "What the question needs" }).click();

  // And it can be taken away again.
  await page.getByRole("button", { name: "Disconnect" }).click();
  await expect(page.getByRole("radio", { name: /Google Gemini/ })).toBeVisible();
  await goTo(page, "Brain");
  // With nothing connected the box is not there: connecting is offered once, on Today.
  await expect(page.getByLabel("Ask the brain")).toHaveCount(0);
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
    "03 Unifloe - running the company.md",
  ]);
  const sales = readFileSync(join(target, folder ?? "", "02 Unifloe - customers and sales.md"), "utf8");
  expect(sales).toContain(`### ${SCHOOL}`);
});
