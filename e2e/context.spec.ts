import { test, expect, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { passSetup } from "./nav";

/**
 * Context for another AI: the card on the Brain's first page, which is the one
 * place it is. (Today's line had a second way in until 11 October 2026.)
 *
 * What is worth a real window here is the half the unit tests cannot reach.
 * The gathering, the trail rule and everything the brief refuses to carry are
 * checked in services/topic.test.ts against a real database. This is about
 * the bridge: that pressing Copy actually puts text
 * on the system clipboard, and - the one that matters - that the words never
 * arrive in the renderer, which is the whole reason main does the copying.
 */

test.describe.configure({ mode: "serial" });

let userDataDir: string;
let app: ElectronApplication;

async function openApp(): Promise<Page> {
  app = await electron.launch({
    args: [".", `--user-data-dir=${userDataDir}`],
    env: { ...process.env, ELECTRON_ENABLE_LOGGING: "0" },
  });
  const page = await app.firstWindow();

  await page.waitForSelector(".firstrun, .sidebar");
  if (await page.locator(".firstrun").isVisible()) {
    await page.getByLabel("Company name").fill("Unifloe");
    await page.getByRole("button", { name: "Create company" }).click();
    await passSetup(page);
  }
  return page;
}

/** What is actually on the system clipboard, read from main. */
function clipboardText(): Promise<string> {
  return app.evaluate(({ clipboard }) => clipboard.readText());
}

test.beforeAll(() => {
  userDataDir = mkdtempSync(join(tmpdir(), "caulder-context-"));
});

test.afterAll(async () => {
  await app?.close();
  rmSync(userDataDir, { recursive: true, force: true });
});

test("Today's line has no second way in: it files what is typed, and that is all", async () => {
  const page = await openApp();
  await expect(page.getByLabel("Anything, in one line")).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy context for another AI" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Ask the AI" })).toHaveCount(0);
});

test("a topic goes on the clipboard from the Brain, and says how much of it there is", async () => {
  const page = await app.firstWindow();
  await page.getByRole("button", { name: /^Brain/ }).click();
  await expect(page.getByRole("heading", { name: "Context for another AI" })).toBeVisible();

  await page.getByLabel("A topic to copy context for").fill("unifloe");
  await page.getByRole("button", { name: "Copy it" }).click();

  // The receipt, which is what the window is given instead of the words.
  await expect(page.locator(".card__hint[role='status']")).toContainText("clipboard", { timeout: 15_000 });

  const copied = await clipboardText();
  expect(copied).toContain("# unifloe");
  expect(copied).toContain("Caulder is a desktop app");
  // The load-bearing sentence: an AI told nothing about the gaps answers
  // confidently about them.
  expect(copied).toContain("do not read silence as absence");
  expect(copied).toContain("**What did not:**");
});

test("the words never reach the window", async () => {
  // The renderer gets a count and a list of what went in, and no text. This
  // is the reason main holds the clipboard call rather than handing the
  // brief over for the screen to copy, so it is asserted rather than trusted.
  const page = await app.firstWindow();
  const id = await page.evaluate(async () => (await window.caulder.companies.list()).activeCompanyId);
  const answer = await page.evaluate(
    async (companyId: string) => window.caulder.brain.topic(companyId, "unifloe"),
    id as string,
  );

  expect(Object.keys(answer).sort()).toEqual(["chars", "cut", "topic", "went"]);
  expect(JSON.stringify(answer)).not.toContain("Caulder is a desktop app");
});

test("it refuses a topic that is nothing, rather than copying the whole brain", async () => {
  const page = await app.firstWindow();
  const id = await page.evaluate(async () => (await window.caulder.companies.list()).activeCompanyId);
  const said = await page.evaluate(
    async (companyId: string) =>
      window.caulder.brain
        .topic(companyId, "   ")
        .then(() => "no error")
        .catch((cause: unknown) => (cause instanceof Error ? cause.message : String(cause))),
    id as string,
  );
  expect(said).toMatch(/what the brief should be about/i);
});
