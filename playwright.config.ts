import { defineConfig } from "@playwright/test";

/**
 * Drives the real Electron binary, so there is no browser to install and no
 * dev server to start. `npm run test:e2e` builds first, because these launch
 * the packaged entry point in out/.
 *
 * Kept out of `npm run verify`: that gate is the same four steps the other
 * projects use, and a windowed test does not belong in it.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false, // one SQLite file per run; parallel windows would race
  workers: 1,
  retries: 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
});
