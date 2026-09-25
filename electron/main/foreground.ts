import { screen } from "electron";
import type * as Koffi from "koffi";
import { createRequire } from "node:module";

/**
 * Whether the window in front is covering the whole screen.
 *
 * Ember gets out of the way of a film, a slide deck or a game, and Electron
 * cannot tell her: it knows its own windows and nothing about anybody
 * else's. So this asks Windows which window is in front and how big it is,
 * through koffi, the way `wallpaper.ts` asks where the desktop is.
 *
 * Two things it has to be careful of:
 *
 *  - **The desktop is full-screen too.** Click on the wallpaper and the
 *    window in front is `Progman` or a `WorkerW`, exactly the size of the
 *    monitor. That is the one full-screen window she should be out for, so
 *    the shell's own classes are never counted.
 *  - **Windows answers in physical pixels; Electron thinks in DIPs.** At a
 *    150% scale a full-screen window is 2880 wide against a display Electron
 *    calls 1920, so the rectangle is converted before it is compared, and
 *    compared to the display it is actually on.
 *
 * It fails towards "no". Not Windows, no koffi, a call that throws: she
 * stays out. A pet that vanishes because a Win32 signature moved is a worse
 * bug than one that is visible over a video.
 */

type Rect = { left: number; top: number; right: number; bottom: number };

type Calls = {
  front: () => number;
  rect: (hwnd: number) => Rect | null;
  className: (hwnd: number) => string;
};

/** The shell's own windows, which are full-screen by nature and never in the way. */
const SHELL = new Set(["Progman", "WorkerW", "Shell_TrayWnd", "Shell_SecondaryTrayWnd"]);

let calls: Calls | null = null;
let unavailable = false;

function num(value: number | bigint): number {
  return typeof value === "bigint" ? Number(value) : value;
}

function bind(): Calls | null {
  if (calls) return calls;
  if (unavailable || process.platform !== "win32") return null;
  try {
    const require = createRequire(import.meta.url);
    const koffi = require("koffi") as typeof Koffi;
    const lib = koffi.load("user32.dll");
    koffi.struct("PET_RECT", { left: "long", top: "long", right: "long", bottom: "long" });

    const front = lib.func("uintptr_t __stdcall GetForegroundWindow()") as () => number | bigint;
    const rect = lib.func("bool __stdcall GetWindowRect(uintptr_t hwnd, _Out_ PET_RECT *rect)") as (
      hwnd: number,
      out: Partial<Rect>,
    ) => boolean;
    const name = lib.func("int __stdcall GetClassNameW(uintptr_t hwnd, _Out_ uint8_t *buf, int max)") as (
      hwnd: number,
      buf: Buffer,
      max: number,
    ) => number;

    calls = {
      front: () => num(front()),
      rect: (hwnd) => {
        const out: Partial<Rect> = {};
        return rect(hwnd, out) ? (out as Rect) : null;
      },
      className: (hwnd) => {
        const buf = Buffer.alloc(512);
        const length = name(hwnd, buf, 256);
        return length > 0 ? buf.toString("utf16le", 0, length * 2) : "";
      },
    };
    return calls;
  } catch {
    unavailable = true;
    return null;
  }
}

export function fullScreenInFront(): boolean {
  const win32 = bind();
  if (!win32) return false;
  try {
    const hwnd = win32.front();
    if (hwnd === 0 || SHELL.has(win32.className(hwnd))) return false;
    const r = win32.rect(hwnd);
    if (!r) return false;

    const physical = { x: r.left, y: r.top, width: r.right - r.left, height: r.bottom - r.top };
    const dip = screen.screenToDipRect(null, physical);
    const display = screen.getDisplayMatching(dip).bounds;
    // A pixel either way: a borderless window can sit a pixel outside the
    // display, and the conversion from physical pixels can round.
    return (
      dip.x <= display.x + 1 &&
      dip.y <= display.y + 1 &&
      dip.x + dip.width >= display.x + display.width - 1 &&
      dip.y + dip.height >= display.y + display.height - 1
    );
  } catch {
    return false;
  }
}
