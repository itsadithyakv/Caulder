import { test, expect, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { passSetup } from "./nav";

/**
 * Ember, alive in a real window.
 *
 * The physics is in shared/body.test.ts and her temper in
 * shared/ember.test.ts. What needs a window is everything they cannot see:
 * that she comes out of her own door, that a poke lands on the right part of
 * her, that she can be picked up and put on a card and stands on it, that she
 * splats on a wall, that a fall out of the window brings her back through her
 * door, and that the fire really goes out for a marshmallow.
 *
 * Every other spec keeps her indoors (see the test-run switch in
 * electron/main/index.ts), so she cannot walk in front of their buttons. This
 * one lets her out.
 */

test.describe.configure({ mode: "serial" });

let userDataDir: string;
let app: ElectronApplication;
let page: Page;

const her = () => page.locator(".ember-body");

test.beforeAll(async () => {
  userDataDir = mkdtempSync(join(tmpdir(), "caulder-ember-"));
  app = await electron.launch({
    args: [".", `--user-data-dir=${userDataDir}`],
    env: { ...process.env, ELECTRON_ENABLE_LOGGING: "0" },
  });
  page = await app.firstWindow();
  await page.waitForSelector(".firstrun, .sidebar");
  if (await page.locator(".firstrun").isVisible()) {
    await page.getByLabel("Company name").fill("Unifloe");
    await page.getByRole("button", { name: "Create company" }).click();
    await passSetup(page);
  }
  await page.evaluate(() => localStorage.setItem("caulder.ember.out", "on"));
  await page.reload();
  await page.waitForSelector(".sidebar");
});

test.afterAll(async () => {
  await app?.close();
  rmSync(userDataDir, { recursive: true, force: true });
});

/** She is standing somewhere, and not in the middle of anything. */
async function settled(): Promise<void> {
  await expect(her()).toHaveAttribute("data-out", "yes", { timeout: 8_000 });
  await expect(her()).not.toHaveAttribute("data-feet", "", { timeout: 8_000 });
  await expect(her().locator(".ember")).toHaveAttribute("data-trick", "none", { timeout: 8_000 });
}

/** Where on her to click, as a share of her height: she walks, so read her box right before. */
async function poke(share: number): Promise<void> {
  const box = await her().boundingBox();
  if (!box) throw new Error("Ember is not out.");
  await page.mouse.click(box.x + box.width / 2, box.y + box.height * share);
}

async function grab(): Promise<{ x: number; y: number }> {
  const box = await her().boundingBox();
  if (!box) throw new Error("Ember is not out.");
  const at = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  await page.mouse.move(at.x + 8, at.y + 8, { steps: 2 });
  await expect(her()).toHaveAttribute("data-pose", "held");
  return at;
}

test("she comes out of her own front door, onto the quick line", async () => {
  await expect(page.locator("[data-ember-door]")).toBeVisible();
  await settled();
  // On the line's top edge - once the page has finished sliding in, which it
  // does under her feet, and she rides it.
  await expect
    .poll(async () => {
      const line = (await page.locator(".today__quick").boundingBox())?.y ?? 0;
      return Math.abs(Number(await her().getAttribute("data-feet")) - line);
    })
    .toBeLessThanOrEqual(2);
});

test("a poke on the head bonks her, and she says so", async () => {
  await poke(0.2);
  await expect(her().locator(".ember")).toHaveAttribute("data-trick", "bonk");
  await expect(page.locator(".ember-say")).toHaveText("Ow!");
  await settled();
});

test("a poke in the belly makes her giggle", async () => {
  await poke(0.6);
  await expect(her().locator(".ember")).toHaveAttribute("data-trick", "giggle");
  await expect(page.locator(".ember-say")).toHaveText("Hehehe!");
  await settled();
});

test("picked up and put on a card, she stands on it", async () => {
  const card = page.locator(".today__grid .card").first();
  const box = await card.boundingBox();
  if (!box) throw new Error("Nowhere to put her.");
  await grab();
  // Held over the card, a little above it, still, then let go: a drop.
  await page.mouse.move(box.x + box.width / 2, box.y - 60, { steps: 10 });
  await page.waitForTimeout(200);
  await page.mouse.up();

  await expect(her()).not.toHaveAttribute("data-feet", "", { timeout: 5_000 });
  await expect(page.locator(".ember-thump")).toHaveCount(0);
  // Feet on the card's top edge. Polled: she re-reads where the cards are
  // five times a second, so a card that has just moved is a moment ahead of her.
  await expect
    .poll(async () => Math.abs(Number(await her().getAttribute("data-feet")) - ((await card.boundingBox())?.y ?? 0)))
    .toBeLessThanOrEqual(2);
  await expect(page.locator(".ember-body")).toHaveCount(1);
});

test("a double-click sends her home with a leap", async () => {
  await her().dblclick();
  await expect(her()).toHaveAttribute("data-pose", "flying");
  const line = (await page.locator(".today__quick").boundingBox())?.y ?? 0;
  await expect(her()).toHaveAttribute("data-feet", String(Math.round(line)), { timeout: 6_000 });
  await settled();
});

test("thrown hard at the wall, she splats flat against it, sticks, and peels off", async () => {
  const size = await page.evaluate(() => ({ w: window.innerWidth }));
  const from = await grab();
  // A flick: a long way in almost no time, at whichever wall is further off -
  // she wanders, and a flick at a wall she is standing next to is a nudge.
  await page.mouse.move(from.x < size.w / 2 ? size.w - 150 : 150, from.y - 20, { steps: 3 });
  await page.mouse.up();
  await expect(her()).toHaveAttribute("data-pose", "splat");
  await expect(page.locator(".ember-say")).toHaveText(/splat/i);
  await expect(her()).not.toHaveAttribute("data-pose", "splat", { timeout: 3_000 });
  await settled();
});

test("dropped over nothing, the wings come out, fail, and she comes back out of her door", async () => {
  const size = await page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }));
  await grab();
  await page.mouse.move(size.w - 40, size.h - 50, { steps: 10 });
  await page.waitForTimeout(200);
  await page.mouse.up();

  await expect(her()).toHaveAttribute("data-pose", /icarus|plunge/);
  await expect(her()).toHaveAttribute("data-out", "no", { timeout: 6_000 });
  await expect(page.locator("[data-ember-door]")).toHaveAttribute("data-state", "open", { timeout: 4_000 });
  await settled();
});

/**
 * Opens her book: right-click on her. Once more if the first missed - she
 * walks, and a right-click aimed where she was a moment ago can land on the
 * line behind her.
 */
async function openBook() {
  const book = page.getByRole("menu", { name: "Ask Ember for a move" });
  for (let attempt = 0; attempt < 3 && !(await book.isVisible()); attempt += 1) {
    const box = await her().boundingBox();
    if (!box) throw new Error("Ember is not out.");
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: "right" });
    await book.waitFor({ state: "visible", timeout: 1_500 }).catch(() => undefined);
  }
  await expect(book).toBeVisible();
  return book;
}

test("right-clicked, she opens her book: what she knows, what she does not yet, and what it takes", async () => {
  const book = await openBook();
  // Every dance, costume and way home, known or not.
  await expect(book.getByRole("menuitem")).toHaveCount(20 + 37 + 5);
  await expect(book.getByText("Dance · 1 of 20")).toBeVisible();
  await expect(book.getByText(/Give her a habit to feed on/)).toBeVisible();
  // What she learns next, and how far off it is.
  await expect(book.getByRole("list", { name: "What she learns next" })).toContainText("level 2");

  await book.getByRole("menuitem", { name: "The dab" }).click();
  await expect(book).toHaveCount(0);
  await expect(her().locator(".ember")).toHaveAttribute("data-trick", "dance");
  await expect(page.locator(".ember-say")).toHaveText("Dab!");
  await settled();

  // Asked for something she has not learned: a shake of the head, and what it takes.
  const again = await openBook();
  await again.getByRole("menuitem", { name: /^6-7/ }).click();
  await expect(her().locator(".ember")).toHaveAttribute("data-trick", "nope");
  await expect(page.locator(".ember-say")).toHaveText("Not yet! Level 5.");
  await settled();
});

test("a habit ticked is a marshmallow: it flies from the box you ticked into her mouth", async () => {
  await page.evaluate(async () => {
    const workspace = await window.caulder.companies.list();
    // A habit is yours, kept in your home.
    await window.caulder.habits.add(workspace.homeCompanyId ?? workspace.activeCompanyId ?? "", { name: "Run", area: "health", weekdays: [1, 2, 3, 4, 5, 6, 7] });
  });
  await page.reload();
  await page.waitForSelector(".sidebar");
  await settled();

  await page.getByRole("checkbox", { name: "Run" }).click();
  await expect(page.locator(".ember-way__mallow")).not.toHaveCSS("display", "none");
  await expect(her().locator(".ember")).toHaveAttribute("data-trick", "gulp", { timeout: 4_000 });
  await expect(page.locator(".ember-say")).toHaveText("Nom!");
  await settled();
  // Still on her own line. Ticking re-draws the cards, and when cards were
  // known by their place on the page the one she stood on changed under her.
  await expect
    .poll(async () => Math.abs(Number(await her().getAttribute("data-feet")) - ((await page.locator(".today__quick").boundingBox())?.y ?? 0)))
    .toBeLessThanOrEqual(2);

  // Ticking the habit scrolled the page, and she went up out of sight with
  // her line. Back up to her, the way a person would.
  await page.evaluate(() => {
    for (const element of document.querySelectorAll("*")) if (element.scrollTop > 0) element.scrollTop = 0;
  });
  await settled();
  const book = await openBook();
  await expect(book.getByText("1 of 1 habit fed to her today")).toBeVisible();
  await page.keyboard.press("Escape");
});

test("reaching a level teaches her something, and it arrives as a present she opens", async () => {
  // A hundred XP of tasks done: level two, which teaches her three things.
  await page.evaluate(async () => {
    const workspace = await window.caulder.companies.list();
    const companyId = workspace.activeCompanyId ?? "";
    const today = new Date().toLocaleDateString("en-CA");
    for (let n = 0; n < 10; n += 1) {
      const task = await window.caulder.tasks.create(companyId, {
        title: `Thing ${n}`,
        dueOn: today,
        kind: "follow_up",
        priority: null,
        leadId: null,
        area: null,
        notes: null,
      });
      await window.caulder.tasks.complete(task.id);
    }
  });
  await page.reload();
  await page.waitForSelector(".sidebar");

  await expect(page.locator(".ember-way__gift")).not.toHaveCSS("display", "none", { timeout: 15_000 });
  await expect(page.locator(".ember-say")).toHaveText("Ooh! A present!", { timeout: 8_000 });
  await expect(page.locator(".ember-say")).toHaveText(/^New: /, { timeout: 12_000 });
  await settled();

  const book = await openBook();
  await expect(book.getByText("Dance · 2 of 20")).toBeVisible();
  await expect(book.getByRole("menuitem", { name: "The floss" })).not.toHaveAttribute("data-locked", "yes");
  await page.keyboard.press("Escape");
  // Level two taught her three things: every present opened before going on.
  await expect(her()).toHaveAttribute("data-gifts", "0", { timeout: 30_000 });
  await settled();
});

test("she is never bare: a scarf and sneakers, and you can dress her from her book", async () => {
  const flame = her().locator(".ember");
  await expect(flame).toHaveAttribute("data-shoes", "sneakers");
  await expect(her().locator(".ember__wear").first()).toBeAttached();

  const book = await openBook();
  const beanie = book.getByRole("menuitemcheckbox", { name: /^Beanie/ });
  await beanie.click();
  await expect(page.locator(".ember-say")).toHaveText("How do I look?");
  await settled();

  const again = await openBook();
  await expect(again.getByRole("menuitemcheckbox", { name: /^Beanie/ })).toHaveAttribute("aria-checked", "true");
  await expect(again.getByText(/You dressed her/)).toBeVisible();
  await again.getByRole("button", { name: "Let her choose" }).click();
  await expect(page.locator(".ember-say")).toHaveText("My pick!");
  await settled();
});

/** Drops her on a card below her line, and returns which way she took back up. */
async function strandAndWatch(): Promise<string> {
  const card = page.locator(".today__grid .card").first();
  const box = await card.boundingBox();
  if (!box) throw new Error("Nowhere to put her.");
  await grab();
  await page.mouse.move(box.x + box.width / 2, box.y - 60, { steps: 10 });
  await page.waitForTimeout(200);
  await page.mouse.up();

  // She has a think, then sets off the hard way.
  await expect(her()).not.toHaveAttribute("data-journey", "", { timeout: 6_000 });
  const way = (await her().getAttribute("data-journey")) ?? "";
  // And ends up standing on her own line.
  await expect
    .poll(
      async () => {
        const line = (await page.locator(".today__quick").boundingBox())?.y ?? 0;
        const feet = await her().getAttribute("data-feet");
        return feet ? Math.abs(Number(feet) - line) : 999;
      },
      { timeout: 15_000 },
    )
    .toBeLessThanOrEqual(2);
  await settled();
  return way;
}

test("dropped below her line, she gets herself back up the hard way - a different way each time", async () => {
  const first = await strandAndWatch();
  expect(["rope", "web", "magic", "spring", "rocket"]).toContain(first);
  const second = await strandAndWatch();
  expect(second).not.toBe(first);
});

test("climbing back up the rope, there is a rope", async () => {
  // Round the list to the rope: five ways, taken in turn.
  for (let tries = 0; tries < 5; tries += 1) {
    const card = page.locator(".today__grid .card").first();
    const box = await card.boundingBox();
    if (!box) throw new Error("Nowhere to put her.");
    await grab();
    await page.mouse.move(box.x + box.width / 2, box.y - 60, { steps: 10 });
    await page.waitForTimeout(200);
    await page.mouse.up();
    await expect(her()).not.toHaveAttribute("data-journey", "", { timeout: 6_000 });
    if ((await her().getAttribute("data-journey")) === "rope") {
      // A rope hanging straight down is a line with no width, which a
      // visibility check calls hidden; ask whether it is drawn instead.
      await expect(page.locator(".ember-way__line--rope").first()).not.toHaveCSS("display", "none", { timeout: 4_000 });
      await expect(her()).toHaveAttribute("data-pose", /climb|slip/, { timeout: 4_000 });
      await expect(page.locator(".ember-say")).toHaveText("Easy.", { timeout: 10_000 });
      await settled();
      return;
    }
    await expect(her()).toHaveAttribute("data-journey", "", { timeout: 15_000 });
    await settled();
  }
  throw new Error("She never took the rope.");
});

test("poked too often, she goes up in flames, and a marshmallow puts it out", async () => {
  for (let n = 0; n < 10; n += 1) {
    await poke(0.6);
    await page.waitForTimeout(60);
  }
  const fire = page.getByRole("alertdialog", { name: /on fire/ });
  await expect(fire).toBeVisible();
  await expect(her().locator(".ember")).toHaveAttribute("data-fury", "yes");

  await page.getByRole("button", { name: "Give her a marshmallow" }).click();
  await expect(fire).toHaveCount(0);
  await expect(her().locator(".ember")).toHaveAttribute("data-trick", "munch");
  await expect(her().locator(".ember")).not.toHaveAttribute("data-fury", "yes");
  await settled();
});

test("with play switched off a click is only a click, and switched out of the app she is gone", async () => {
  await page.getByRole("button", { name: /^Settings/ }).click();
  await expect(page.getByRole("heading", { name: "Ember", exact: true })).toBeVisible();
  await page.getByRole("switch", { name: "Poking, and her temper" }).click();
  await expect(page.getByRole("switch", { name: "Poking, and her temper" })).toHaveAttribute("aria-checked", "false");

  await page.getByRole("button", { name: /^Today/ }).click();
  await settled();
  await poke(0.2);
  await page.waitForTimeout(300);
  await expect(her().locator(".ember")).toHaveAttribute("data-trick", "none");

  await page.getByRole("button", { name: /^Settings/ }).click();
  await page.getByRole("switch", { name: "Ember in the app" }).click();
  await page.getByRole("button", { name: /^Today/ }).click();
  await expect(page.locator("[data-ember-door]")).toHaveCount(0);
  await expect(her()).toHaveAttribute("data-out", "no");
});
