import { StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/globals.css";

const host = document.getElementById("root");
if (!host) throw new Error("Root element is missing from index.html");

/**
 * One bundle, two windows — and each window loads only its own part of it.
 *
 * The capture box is a second BrowserWindow on this same file, told apart by
 * the hash main puts on the URL. Same preload, same database, same process - a separate app would mean a
 * second writer on one SQLite file, which is the thing the single-instance
 * lock exists to prevent.
 *
 * **The imports are dynamic, and that is the whole point of this file.** They
 * used to be static, so the widget window parsed and compiled every screen of
 * the app — the leads table, the forecast, the day grid, the marketing report
 * — to draw a pill saying "3 due". Measured, that was about 390ms between
 * asking for the widget and seeing it. Vite turns each import() below into its
 * own chunk, so a small window now loads React and itself.
 *
 * The capture box benefits most: it opens on a global shortcut, and a note
 * you have to wait to start typing is a note you forget.
 *
 * `data-window` is what the stylesheets key off, so each of them can drop the
 * shell chrome without every rule having to know which window it is in.
 */
const WINDOWS: Record<string, { attribute: string; load: () => Promise<ReactNode> }> = {
  "#capture": {
    attribute: "capture",
    load: async () => {
      const { Capture } = await import("./features/notes/Capture");
      return <Capture />;
    },
  },
};

const kind = WINDOWS[window.location.hash];
if (kind) document.documentElement.setAttribute("data-window", kind.attribute);

async function start(root: HTMLElement): Promise<void> {
  const view = kind
    ? await kind.load()
    : await import("./app/App").then(({ App }) => <App />);

  createRoot(root).render(<StrictMode>{view}</StrictMode>);
}

void start(host);
