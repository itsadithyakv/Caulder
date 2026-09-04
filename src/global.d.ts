import type { CaulderApi } from "@shared/ipc";

declare global {
  interface Window {
    /** Injected by electron/preload/index.ts via contextBridge. */
    caulder: CaulderApi;
  }
}

export {};
