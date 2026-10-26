import { test, expect, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { goTo, openBrainSection, passSetup } from "./nav";

/**
 * Linking on the Map with the mouse, in a real window: drag from a dot's +
 * onto another and the link is written into the page; Undo takes it back;
 * Alt and drag does the same from the dot itself; click the line and it can
 * be taken out.
 *
 * Two pages, pinned either side of the middle, so where they are on screen is
 * known: the map fits two dots at 1.25x, centred.
 *
 * Set CAULDER_SHOTS to a folder to keep a screenshot of each moment.
 */

test.describe.configure({ mode: "serial" });

let userDataDir: string;
let app: ElectronApplication;
let page: Page;
let ids: { company: string; pricing: string; plan: string };

async function shot(name: string) {
  const folder = process.env["CAULDER_SHOTS"];
  if (!folder) return;
  mkdirSync(folder, { recursive: true });
  await page.screenshot({ path: join(folder, `maplink-${name}.png`) });
}

/** The map fits two dots 240 apart at its largest zoom, 1.25: 150px either side of the middle. */
async function dots() {
  const box = await page.locator(".mapcanvas__canvas").boundingBox();
  if (!box) throw new Error("No map.");
  const middle = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  return { pricing: { x: middle.x - 150, y: middle.y }, plan: { x: middle.x + 150, y: middle.y }, middle };
}

/** The + beside a dot of radius `r` (in the map's units) at 1.25x: 12px out past its edge, up and to the right. */
const grip = (at: { x: number; y: number }, r: number) => {
  const out = (r * 1.25 + 12) * Math.SQRT1_2;
  return { x: at.x + out, y: at.y - out };
};

const bodyOf = (id: string) => page.evaluate(async (pageId) => (await window.caulder.brain.page(pageId)).body, id);

test.beforeAll(async () => {
  userDataDir = mkdtempSync(join(tmpdir(), "caulder-maplink-"));
  app = await electron.launch({
    args: [".", `--user-data-dir=${userDataDir}`],
    env: { ...process.env, ELECTRON_ENABLE_LOGGING: "0" },
  });
  page = await app.firstWindow();
  await page.waitForSelector(".firstrun, .sidebar");
  await page.getByLabel("Company name").fill("Unifloe");
  await page.getByRole("button", { name: "Create company" }).click();
  await passSetup(page);
  await expect(page.getByRole("button", { name: /Company: Unifloe/ })).toBeVisible();

  ids = await page.evaluate(async () => {
    const company = (await window.caulder.companies.list()).activeCompanyId as string;
    const made = async (title: string) => {
      const blank = await window.caulder.brain.create(company, "plan", "page");
      const saved = await window.caulder.brain.save(blank.id, {
        title,
        body: "",
        fields: blank.fields,
        secrets: {},
        baseRevision: blank.revision,
      });
      return saved.id;
    };
    const pricing = await made("Pricing");
    const plan = await made("Pilot plan");
    await window.caulder.brain.keepPositions(company, [
      { key: `page:${pricing}`, x: -120, y: 0, pinned: true },
      { key: `page:${plan}`, x: 120, y: 0, pinned: true },
    ]);
    return { company, pricing, plan };
  });
});

test.afterAll(async () => {
  await app?.close();
  rmSync(userDataDir, { recursive: true, force: true });
});

test("drag from a dot's + onto another, and the link is written in the page", async () => {
  await goTo(page, "Brain");
  await openBrainSection(page, "Map");
  const map = page.getByRole("img", { name: /The map: 2 dots and 0 links/ });
  await expect(map).toBeVisible();
  // The camera eases to fit; let it arrive.
  await page.waitForTimeout(1200);

  const at = await dots();
  await page.mouse.move(at.pricing.x, at.pricing.y);
  const plus = grip(at.pricing, 4);
  await page.mouse.move(plus.x, plus.y, { steps: 3 });
  await shot("grip");
  await page.mouse.down();
  await page.mouse.move(at.plan.x, at.plan.y, { steps: 12 });
  await shot("dragging");
  await page.mouse.up();

  await expect(page.locator(".mapview__notice")).toContainText("Linked Pricing to Pilot plan, at the foot of the page.");
  await expect(page.getByRole("img", { name: /The map: 2 dots and 1 links/ })).toBeVisible();
  expect(await bodyOf(ids.pricing)).toBe(`[[Pilot plan|page:${ids.plan}]]`);
  await shot("linked");

  // Undo takes it straight back out.
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByRole("img", { name: /The map: 2 dots and 0 links/ })).toBeVisible();
  expect(await bodyOf(ids.pricing)).toBe("");
});

test("Alt and drag links from the dot itself; a click on the line takes it out", async () => {
  await page.waitForTimeout(600);
  const at = await dots();
  await page.keyboard.down("Alt");
  await page.mouse.move(at.plan.x, at.plan.y);
  await page.mouse.down();
  await page.mouse.move(at.pricing.x, at.pricing.y, { steps: 12 });
  await page.mouse.up();
  await page.keyboard.up("Alt");

  await expect(page.locator(".mapview__notice")).toContainText("Linked Pilot plan to Pricing");
  await expect(page.getByRole("img", { name: /The map: 2 dots and 1 links/ })).toBeVisible();
  expect(await bodyOf(ids.plan)).toBe(`[[Pricing|page:${ids.pricing}]]`);

  // The line runs through the middle of the map.
  await page.waitForTimeout(600);
  await page.mouse.move(at.middle.x - 20, at.middle.y);
  await page.mouse.click(at.middle.x, at.middle.y);
  const picked = page.getByRole("dialog", { name: "A link" });
  await expect(picked).toContainText("Pilot plan");
  await expect(picked).toContainText("Pricing");
  await shot("picked");
  await picked.getByRole("button", { name: "Take the link out" }).click();

  await expect(page.locator(".mapview__notice")).toContainText("Took the link between Pilot plan and Pricing out");
  await expect(page.getByRole("img", { name: /The map: 2 dots and 0 links/ })).toBeVisible();
  expect(await bodyOf(ids.plan)).toBe("");
});

test("a drag that ends on nothing links nothing", async () => {
  const at = await dots();
  await page.mouse.move(at.pricing.x, at.pricing.y);
  const plus = grip(at.pricing, 4);
  await page.mouse.move(plus.x, plus.y, { steps: 3 });
  await page.mouse.down();
  await page.mouse.move(at.middle.x, at.middle.y - 120, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  await expect(page.getByRole("img", { name: /The map: 2 dots and 0 links/ })).toBeVisible();
  expect(await bodyOf(ids.pricing)).toBe("");
});
