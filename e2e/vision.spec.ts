import { test, expect, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { goTo, passSetup } from "./nav";

/**
 * Your life in check, in a real window (PLAN.md, part four, phase 17): a
 * picture put on the vision board is made smaller and kept, words go on
 * beside it and are reordered, and your level moves on Today the moment a
 * task is done or a habit ticked - worked out, never kept.
 *
 * Set CAULDER_SHOTS to a folder to keep a screenshot of each screen.
 */

test.describe.configure({ mode: "serial" });

let userDataDir: string;
let app: ElectronApplication;
let page: Page;

async function shot(name: string) {
  const folder = process.env["CAULDER_SHOTS"];
  if (!folder) return;
  mkdirSync(folder, { recursive: true });
  await page.screenshot({ path: join(folder, `vision-${name}.png`) });
}

test.beforeAll(async () => {
  userDataDir = mkdtempSync(join(tmpdir(), "caulder-vision-"));
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
});

test.afterAll(async () => {
  await app?.close();
  rmSync(userDataDir, { recursive: true, force: true });
});

test("a picture goes on the board made smaller, with words beside it, and the tiles reorder", async () => {
  await goTo(page, "Life");
  const board = page.locator(".card", { has: page.getByRole("heading", { name: "Vision board" }) });
  await expect(board.getByText("What is this year for?")).toBeVisible();

  // A wide photo, drawn in the window itself: larger than any tile is shown.
  const png = await page.evaluate(async () => {
    const canvas = new OffscreenCanvas(1600, 900);
    const context = canvas.getContext("2d") as OffscreenCanvasRenderingContext2D;
    const sky = context.createLinearGradient(0, 0, 0, 900);
    sky.addColorStop(0, "#f7c59f");
    sky.addColorStop(1, "#2a6f97");
    context.fillStyle = sky;
    context.fillRect(0, 0, 1600, 900);
    context.fillStyle = "#1b1b1e";
    context.fillRect(700, 420, 200, 480);
    const bytes = new Uint8Array(await (await canvas.convertToBlob({ type: "image/png" })).arrayBuffer());
    let text = "";
    for (const byte of bytes) text += String.fromCharCode(byte);
    return btoa(text);
  });
  await board.getByLabel("Choose a picture").setInputFiles({ name: "kyoto.png", mimeType: "image/png", buffer: Buffer.from(png, "base64") });

  const form = page.getByRole("form", { name: "A new tile" });
  await expect(form.locator("img")).toHaveAttribute("src", /^data:image\/webp;base64,/);
  await form.getByLabel("Words under it").fill("Kyoto, in spring");
  await form.getByLabel("Area").selectOption("personal");
  await form.getByRole("button", { name: "Put it on the board" }).click();

  const tiles = page.getByRole("list", { name: "Vision board" }).getByRole("listitem");
  await expect(tiles).toHaveCount(1);
  await expect(tiles.first().getByRole("img", { name: "Kyoto, in spring" })).toBeVisible();

  // Kept at the size a tile is ever shown at, as WebP.
  const kept = await page.evaluate(async () => {
    const company = (await window.caulder.companies.list()).activeCompanyId as string;
    const [tile] = await window.caulder.vision.list(company);
    return { width: tile?.width, height: tile?.height, type: tile?.picture?.slice(0, 15) };
  });
  expect(kept).toEqual({ width: 1400, height: 788, type: "data:image/webp" });

  await board.getByRole("button", { name: "Add words" }).click();
  await page.getByRole("form", { name: "A new tile" }).getByLabel("Words", { exact: true }).fill("Ship the attendance app");
  await page.getByRole("form", { name: "A new tile" }).getByLabel("Area").selectOption("company");
  await page.getByRole("button", { name: "Put it on the board" }).click();
  await expect(tiles).toHaveCount(2);
  await expect(tiles.nth(1)).toContainText("Ship the attendance app");

  // The keyboard's way to reorder: the tile's menu.
  await tiles.nth(1).hover();
  await tiles.nth(1).getByRole("button", { name: "Tile: Ship the attendance app" }).click();
  await page.getByRole("menuitem", { name: "Move earlier" }).click();
  await expect(tiles.first()).toContainText("Ship the attendance app");
  await shot("board");
});

test("your level moves on Today as things are done, and Life says where it came from", async () => {
  await page.evaluate(async () => {
    const company = (await window.caulder.companies.list()).activeCompanyId as string;
    const today = new Date().toLocaleDateString("en-CA");
    await window.caulder.tasks.create(company, { title: "Send the proposal", dueOn: today, kind: "todo", area: "company" } as never);
    await window.caulder.habits.add(company, { name: "Gym", area: "health" });
  });
  await goTo(page, "Today");
  const strip = page.getByRole("button", { name: /^Level 1, 0 XP/ });
  await expect(strip).toBeVisible();

  await page.getByRole("button", { name: 'Mark "Send the proposal" done' }).click();
  await expect(page.getByRole("button", { name: /^Level 1, 10 XP/ })).toBeVisible();

  const habits = page.locator(".card", { has: page.getByRole("heading", { name: "Habits" }) });
  await habits.getByRole("checkbox", { name: "Gym" }).click();
  await expect(page.getByRole("button", { name: /^Level 1, 15 XP/ })).toContainText("85 XP to 2");
  await shot("today");

  await page.getByRole("button", { name: /^Level 1, 15 XP/ }).click();
  const sources = page.getByRole("list", { name: "Where it came from" });
  await expect(sources.getByRole("listitem").filter({ hasText: "Tasks done" })).toContainText("10 XP");
  await expect(sources.getByRole("listitem").filter({ hasText: "Habit ticks" })).toContainText("5 XP");

  const week = page.getByRole("list", { name: "The last seven days, by area" });
  await expect(week.getByRole("listitem").filter({ hasText: "Company" })).toContainText("1 done · 10 XP");
  await expect(page.getByText("Nothing for College or Personal this week.")).toBeVisible();

  const earned = page.getByRole("list", { name: "Achievements" }).locator(".achieve--earned");
  await expect(earned).toHaveCount(1);
  await expect(earned).toContainText("Off the list");
  await shot("life");

  // Taken back, and the points go with it.
  await goTo(page, "Today");
  await habits.getByRole("checkbox", { name: "Gym" }).click();
  await expect(page.getByRole("button", { name: /^Level 1, 10 XP/ })).toBeVisible();
});
