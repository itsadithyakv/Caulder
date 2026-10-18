import { test, expect, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { goTo, passSetup } from "./nav";

/**
 * Memories arranged by the model on this machine (PLAN.md, part five, phase
 * 21), in a real window, with the real model. The model is not in git (npm run
 * fetch-model); without it this is skipped.
 */

test.describe.configure({ mode: "serial" });

const MODEL_HERE = existsSync(join(process.cwd(), "resources", "model", "model.onnx"));

let userDataDir: string;
let app: ElectronApplication;
let page: Page;

test.beforeAll(async () => {
  test.skip(!MODEL_HERE, "The model is not on this machine: npm run fetch-model.");
  userDataDir = mkdtempSync(join(tmpdir(), "caulder-understanding-"));
  app = await electron.launch({ args: [".", `--user-data-dir=${userDataDir}`], env: { ...process.env, ELECTRON_ENABLE_LOGGING: "0" } });
  page = await app.firstWindow();
  await page.waitForSelector(".firstrun, .sidebar");
  await page.getByLabel("Company name").fill("Unifloe");
  await page.getByRole("button", { name: "Create company" }).click();
  await passSetup(page);
});

test.afterAll(async () => {
  await app?.close();
  if (userDataDir) rmSync(userDataDir, { recursive: true, force: true });
});

test("a loose memory that sounds like one of the brain's pages is offered a move, and moved on a yes", async () => {
  // What the line would have kept: a fact on the pile, and a page it belongs with.
  await page.evaluate(async () => {
    const { activeCompanyId } = await window.caulder.companies.list();
    const companyId = activeCompanyId as string;
    const remember = (topic: string, said: string) =>
      window.caulder.brain.remember({ companyId, pageId: null, topic, said, fact: null, day: "2026-09-20" });
    await remember("Coffee", "a v60 wants a medium fine grind");
    await remember("Things to remember", "ethiopian beans taste fruity");
    await remember("Things to remember", "honey never spoils");
  });

  await goTo(page, "Brain");
  await page.getByRole("navigation", { name: "Brain sections" }).getByRole("button", { name: "Memories" }).click();
  const card = page.locator(".card", { hasText: "Loose ends" });
  // The model starts in its own process the first time it is asked.
  await expect(card).toBeVisible({ timeout: 20_000 });
  await expect(card).toContainText("ethiopian beans taste fruity");
  // Honey belongs nowhere in particular, and is not offered.
  await expect(card).not.toContainText("honey");

  await card.getByRole("button", { name: "Move it to Coffee" }).click();
  await expect(card).toHaveCount(0);

  const coffee = await page.evaluate(async () => {
    const { activeCompanyId } = await window.caulder.companies.list();
    const { memories } = await window.caulder.brain.memories(activeCompanyId as string);
    return memories.filter((memory) => memory.pageTitle === "Coffee").map((memory) => memory.says);
  });
  expect(coffee).toContain("ethiopian beans taste fruity");
});
