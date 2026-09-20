// Smoke-tests the PACKAGED binary, not the dev build.
//
// The plan's Phase 8 criterion is an installer that runs on a clean profile
// and creates its database on first launch. Everything else in the suite runs
// `electron .` against source, which would not catch a missing native module
// or a resource the packager left behind.
import { _electron as electron } from "@playwright/test";
import { mkdtempSync, existsSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const exe = join(root, "release/win-unpacked/Caulder.exe");

// The version the app will ask the script for, read from where the app reads
// it. Written here as a number it went stale the first time the script grew.
const scriptVersion = /SCRIPT_VERSION = (\d+);/.exec(readFileSync(join(root, "shared/script.ts"), "utf8"))?.[1];

if (!existsSync(exe)) {
  console.log("No packaged build found. Run `npm run package` first.");
  process.exit(1);
}
const dir = mkdtempSync(join(tmpdir(), "caulder-smoke-"));

let app;
let failed = false;

function check(label, ok) {
  console.log(`${ok ? "ok  " : "FAIL"}  ${label}`);
  if (!ok) failed = true;
}

try {
  app = await electron.launch({
    executablePath: exe,
    args: [`--user-data-dir=${dir}`],
  });

  const page = await app.firstWindow();
  await page.waitForSelector(".firstrun, .sidebar", { timeout: 30000 });

  // A clean profile lands on first run rather than a blank window.
  check("opens on the first-run screen", await page.locator(".firstrun").isVisible());

  await page.getByLabel("Company name").fill("Unifloe");
  await page.getByRole("button", { name: "Create company" }).click();
  await page.waitForSelector(".sidebar", { timeout: 15000 });

  check("creates a company", await page.getByText("Unifloe").first().isVisible());
  check("writes its database", existsSync(join(dir, "caulder.db")));

  // Then the setup guide, which a person can skip; the e2e suite does the same.
  const skip = page.getByRole("button", { name: "Skip this for now" });
  if (await skip.count()) await skip.click();

  // A genuine first run can offer the tour, a fixed overlay across the whole
  // window. Dismissing it is exactly what a person does, and without it every
  // sidebar click below is intercepted by the scrim.
  await page.waitForTimeout(700);
  if (await page.locator(".tour").count()) await page.keyboard.press("Escape");
  const nav = page.getByLabel("Main");

  // The Apps Script must survive packaging: it is an extraResource, not code,
  // so nothing else would notice it missing. Copy the script reads it from
  // beside the executable; the clipboard is put back as it was afterwards.
  const before = await app.evaluate(({ clipboard }) => clipboard.readText());
  try {
    await app.evaluate(({ clipboard }) => clipboard.writeText(""));
    await nav.getByRole("button", { name: "Settings" }).click();
    await page.getByRole("button", { name: "Copy the script" }).first().click();
    await page.waitForTimeout(800);
    const copied = await app.evaluate(({ clipboard }) => clipboard.readText());
    check("ships the Apps Script, at the version this build expects", Boolean(scriptVersion) && copied.includes(`var SCRIPT_VERSION = ${scriptVersion};`));
  } finally {
    await app.evaluate(({ clipboard }, text) => clipboard.writeText(text), before);
  }

  // Contacts exercise better-sqlite3's native binding under the packager's
  // rebuild, which is the thing most likely to break in a package.
  await nav.getByRole("button", { name: "Contacts" }).click();
  await page.getByRole("button", { name: "Add a contact" }).first().click();
  await page.getByLabel("Name").fill("Bengaluru Public School");
  await page.getByRole("button", { name: "Add contact" }).click();
  await page.waitForTimeout(800);
  check(
    "reads and writes through the native module",
    await page.getByRole("heading", { name: "Bengaluru Public School" }).isVisible(),
  );

  // Your level is worked out across a dozen tables on every read: if a query
  // broke under the package, Today would lose its first line.
  await nav.getByRole("button", { name: "Today" }).click();
  await page.waitForTimeout(800);
  check("works out your level on Today", await page.getByRole("button", { name: /^Level 1, 0 XP/ }).isVisible());

  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.waitForTimeout(500);
  check("renderer reported no errors", errors.length === 0);
} catch (error) {
  console.log("FAIL  " + String(error));
  failed = true;
} finally {
  await app?.close();
  // A launch backup lands here on the second run; report what the profile got.
  if (existsSync(dir)) console.log("profile:", readdirSync(dir).join(", "));
  rmSync(dir, { recursive: true, force: true });
}

process.exit(failed ? 1 : 0);
