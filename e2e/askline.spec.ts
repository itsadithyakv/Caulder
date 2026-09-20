import { test, expect, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { goTo, passSetup } from "./nav";

/**
 * The line on Today, asked of an AI.
 *
 * A stub service stands in for Gemini or Ollama: it speaks OpenAI's shape,
 * answers with a fixed sentence, and keeps every system prompt it was sent.
 * That last part is the point of this suite. What Caulder sends is a promise
 * made on the screen - your own pages only if you allowed it, and never a
 * locked or private journal day - and a promise about what leaves the machine
 * can only be tested by catching what left.
 *
 * Set CAULDER_SHOTS to a folder to keep a screenshot of each moment.
 */

test.describe.configure({ mode: "serial" });

let userDataDir: string;
let app: ElectronApplication;
let page: Page;
let service: Server;
let port: number;
/** Every system prompt the stub was sent, oldest first. */
const prompts: string[] = [];

async function shot(name: string) {
  const folder = process.env["CAULDER_SHOTS"];
  if (!folder) return;
  mkdirSync(folder, { recursive: true });
  await page.screenshot({ path: join(folder, `askline-${name}.png`) });
}

/** A service that speaks OpenAI's API, says one thing, and remembers what it was told. */
function stub(): Promise<number> {
  return new Promise((resolve) => {
    service = createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on("data", (chunk: Buffer) => chunks.push(chunk));
      request.on("end", () => {
        response.setHeader("content-type", "application/json");
        if (request.url?.includes("/models")) {
          response.end(JSON.stringify({ data: [{ id: "stub-one", name: "Stub One" }] }));
          return;
        }
        const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
          messages?: { role: string; content: string }[];
        };
        prompts.push(body.messages?.find((message) => message.role === "system")?.content ?? "");
        response.end(
          JSON.stringify({
            choices: [{ message: { content: "Start with the pitch deck; it is the only thing due today." } }],
            usage: { prompt_tokens: 120, completion_tokens: 14 },
          }),
        );
      });
    });
    service.listen(0, "127.0.0.1", () => resolve((service.address() as { port: number }).port));
  });
}

test.beforeAll(async () => {
  port = await stub();
  userDataDir = mkdtempSync(join(tmpdir(), "caulder-askline-"));
  app = await electron.launch({
    args: [".", `--user-data-dir=${userDataDir}`],
    env: { ...process.env, ELECTRON_ENABLE_LOGGING: "0" },
  });
  page = await app.firstWindow();
  await page.waitForSelector(".firstrun, .sidebar");
  await page.getByLabel("Company name").fill("Unifloe");
  await page.getByRole("button", { name: "Create company" }).click();
  await passSetup(page);

  // A goal and a journal day, so there is something of the founder's own to
  // send or to keep back.
  await page.evaluate(async () => {
    const { homeCompanyId } = await window.caulder.companies.list();
    const home = homeCompanyId as string;
    const blank = await window.caulder.brain.create(home, "goals", "life-goal");
    await window.caulder.brain.save(blank.id, {
      title: "Read 12 books",
      body: "",
      fields: { ...blank.fields, target: 12, progress: 5, unit: "books" },
      secrets: {},
      baseRevision: blank.revision,
    });
  });

  const connected = await page.evaluate(async (at: number) => {
    const state = await window.caulder.ask.state();
    if (!state.canEncrypt) return false;
    await window.caulder.ask.connect({ service: "custom", key: "", baseUrl: `http://127.0.0.1:${at}/v1` });
    return true;
  }, port);
  test.skip(!connected, "This machine will not encrypt a stored key, so no AI can be connected.");
});

test.afterAll(async () => {
  await app?.close();
  await new Promise<void>((done) => service?.close(() => done()));
  rmSync(userDataDir, { recursive: true, force: true });
});

test("the star turns the line into a question, and the answer lands under it", async () => {
  await goTo(page, "Today");
  // The window read the AI's state before it was connected, so it is read again.
  await page.reload();
  await page.waitForSelector(".quickadd");

  await page.getByRole("button", { name: "Ask the AI instead" }).click();
  const line = page.getByLabel("Ask the AI");
  await expect(line).toBeVisible();
  await shot("asking");

  await line.fill("What should I do first today?");
  await line.press("Enter");
  await expect(page.locator(".askline__answer")).toContainText("pitch deck");
  await expect(page.locator(".askline__question")).toContainText("What should I do first");
  await shot("answered");
});

test("your own pages stay behind until you allow them", async () => {
  // The question just asked went without them: the switch in Settings is off
  // until somebody turns it on.
  expect(prompts.length).toBeGreaterThan(0);
  expect(prompts.at(-1)).toContain('title="Today"');
  expect(prompts.at(-1)).not.toContain('title="You"');
  expect(prompts.at(-1)).not.toContain("Read 12 books");
});

test("allowed, they go - and the answer says they did", async () => {
  await page.evaluate(() => window.caulder.ask.setPersonal(true));

  const line = page.getByLabel("Ask the AI");
  await line.fill("How am I doing on my goals?");
  await line.press("Enter");
  await expect(page.locator(".askline__answer").last()).toContainText("pitch deck");

  expect(prompts.at(-1)).toContain('title="You"');
  expect(prompts.at(-1)).toContain("Read 12 books");

  await page.locator(".ask__sent summary").last().click();
  await expect(page.locator(".ask__sent").last()).toContainText("Your own pages went too");
  await shot("personal");
});

test("the star goes back to the line Caulder reads itself, and stays where it was put", async () => {
  await page.getByRole("button", { name: "Back to the line Caulder reads itself" }).click();
  await expect(page.getByLabel("Anything, in one line")).toBeVisible();
  await shot("local");

  await page.getByRole("button", { name: "Ask the AI instead" }).click();
  await page.reload();
  await page.waitForSelector(".quickadd");
  // Which line was last on the screen is remembered, so the choice is not
  // made again every time Today is opened.
  await expect(page.getByLabel("Ask the AI")).toBeVisible();
});
