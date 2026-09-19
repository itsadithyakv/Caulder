import { defineConfig } from "@playwright/test";

/**
 * Drives the real Electron binary, so there is no browser to install and no
 * dev server to start. `npm run test:e2e` builds first, because these launch
 * the packaged entry point in out/.
 *
 * Kept out of `npm run verify`: that gate is the same four steps the other
 * projects use, and a windowed test does not belong in it.
 */
// Every spec launches Electron with `{ ...process.env }`, so setting this
// here reaches all of them without twenty edits. It tells the app to come up
// without taking focus - a suite that grabs the foreground forty times is a
// suite nobody can run while they work.
process.env["CAULDER_BACKGROUND"] = "1";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false, // one SQLite file per run; parallel windows would race
  workers: 1,
  retries: 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
});
