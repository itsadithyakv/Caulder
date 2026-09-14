import type { CaulderApi } from "@shared/ipc";

/**
 * The preload bridge, for `page.evaluate` bodies.
 *
 * src/global.d.ts declares the same thing for the renderer, but the e2e
 * project is deliberately separate - it is the only one with DOM types - so it
 * needs its own copy rather than reaching into src for one.
 */
declare global {
  interface Window {
    caulder: CaulderApi;
  }
}

export {};
