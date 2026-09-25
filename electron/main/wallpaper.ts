import type { BrowserWindow } from "electron";
import type * as Koffi from "koffi";
import { createRequire } from "node:module";

/**
 * Sinking a window into the wallpaper, behind the icons.
 *
 * Electron hands out the window handle and nothing else, so this is a real
 * Win32 call through koffi - the fourth runtime dependency, loaded only when
 * somebody actually asks for the desktop level, and failing soft with a
 * reason rather than throwing. Not Windows, no koffi, or a desktop that does
 * not hold still: the widget stays a normal window and Settings says why.
 *
 * Four things here were each learnt the hard way, and none of them is
 * obvious from the API:
 *
 *  - **The desktop is a different shape on different Windows.** Windows 10
 *    spawns a top-level `WorkerW` behind the icons; Windows 11 22H2 and later
 *    hold `SHELLDLL_DefView` directly under `Progman` with no such sibling.
 *    Both are tried, and the 10 branch checks the candidate is *visible* -
 *    this machine carries a couple of hundred top-level windows and several
 *    invisible `WorkerW`s among them, and the first version picked one.
 *  - **Windows refuses to make a topmost window the child of anything.**
 *    Dropping always-on-top first is what makes the call possible, not
 *    tidiness.
 *  - **`GetParent` is the wrong question.** For a `WS_POPUP` window it
 *    answers with the OWNER, and reads back 0 after a `SetParent` that
 *    entirely succeeded. `GetAncestor(GA_PARENT)` is the one that answers.
 *  - **A window parented to Progman does not close cleanly**, and the app
 *    hangs on quit. It has to be detached before the window goes, and before
 *    the app does.
 */

export type Attached = { ok: true } | { ok: false; reason: string };

/** Ask Progman to spawn the worker behind the icons. */
const WM_SPAWN_WORKER = 0x052c;
/** GetAncestor(GA_PARENT): the real parent, not the owner. */
const GA_PARENT = 1;

type Handle = number;
type Out = [number];

type User32 = {
  FindWindowW: (cls: string | null, name: string | null) => Handle;
  FindWindowExW: (parent: Handle, after: Handle, cls: string | null, name: string | null) => Handle;
  SendMessageTimeoutW: (
    hwnd: Handle,
    message: number,
    wParam: number,
    lParam: number,
    flags: number,
    timeout: number,
    result: Out,
  ) => number;
  IsWindowVisible: (hwnd: Handle) => boolean;
  SetParent: (child: Handle, parent: Handle) => Handle;
  GetAncestor: (hwnd: Handle, flags: number) => Handle;
  enumerate: (visit: (hwnd: Handle) => boolean) => void;
};

let loaded: User32 | null = null;
let refusal: string | null = null;

/** A 64-bit handle comes back as a number when it fits and a BigInt when not. */
function num(value: number | bigint): number {
  return typeof value === "bigint" ? Number(value) : value;
}

/**
 * Binds user32 on first use.
 *
 * Cached both ways: a machine without koffi should not pay for the attempt on
 * every level change, and it should not keep answering with a fresh error
 * object either.
 */
function user32(): User32 | null {
  if (loaded) return loaded;
  if (refusal !== null) return null;

  if (process.platform !== "win32") {
    refusal = "Only Windows has a desktop a window can be pinned to.";
    return null;
  }

  try {
    // Required rather than imported: this is the one dependency that should
    // not be loaded by a launch that never asks for it, and a detach has to
    // be able to run synchronously on the way out.
    const require = createRequire(import.meta.url);
    const koffi = require("koffi") as typeof Koffi;
    const lib = koffi.load("user32.dll");

    const find = lib.func(
      "uintptr_t __stdcall FindWindowW(const char16_t *cls, const char16_t *name)",
    ) as (cls: string | null, name: string | null) => number | bigint;
    const findIn = lib.func(
      "uintptr_t __stdcall FindWindowExW(uintptr_t parent, uintptr_t after, const char16_t *cls, const char16_t *name)",
    ) as (parent: Handle, after: Handle, cls: string | null, name: string | null) => number | bigint;
    const send = lib.func(
      "intptr_t __stdcall SendMessageTimeoutW(uintptr_t hwnd, unsigned int message, uintptr_t w, intptr_t l, unsigned int flags, unsigned int timeout, _Out_ uintptr_t *result)",
    ) as (...args: [Handle, number, number, number, number, number, Out]) => number | bigint;
    const visible = lib.func("bool __stdcall IsWindowVisible(uintptr_t hwnd)") as (
      hwnd: Handle,
    ) => boolean;
    const reparent = lib.func("uintptr_t __stdcall SetParent(uintptr_t child, uintptr_t parent)") as (
      child: Handle,
      parent: Handle,
    ) => number | bigint;
    const ancestor = lib.func("uintptr_t __stdcall GetAncestor(uintptr_t hwnd, unsigned int flags)") as (
      hwnd: Handle,
      flags: number,
    ) => number | bigint;

    const proto = koffi.proto("bool __stdcall EnumWindowsProc(uintptr_t hwnd, intptr_t lParam)");
    const enumWindows = lib.func("bool __stdcall EnumWindows(EnumWindowsProc *fn, intptr_t lParam)") as (
      fn: unknown,
      lParam: number,
    ) => boolean;

    loaded = {
      FindWindowW: (cls, name) => num(find(cls, name)),
      FindWindowExW: (parent, after, cls, name) => num(findIn(parent, after, cls, name)),
      SendMessageTimeoutW: (hwnd, message, w, l, flags, timeout, result) =>
        num(send(hwnd, message, w, l, flags, timeout, result)),
      IsWindowVisible: visible,
      SetParent: (child, parent) => num(reparent(child, parent)),
      GetAncestor: (hwnd, flags) => num(ancestor(hwnd, flags)),
      enumerate: (visit) => {
        const registered = koffi.register(
          (hwnd: number | bigint) => visit(num(hwnd)),
          koffi.pointer(proto),
        );
        try {
          enumWindows(registered, 0);
        } finally {
          // Left registered, the callback keeps the closure - and every
          // level change would add another.
          koffi.unregister(registered);
        }
      },
    };
    return loaded;
  } catch (error) {
    refusal = `Windows would not lend its desktop: ${error instanceof Error ? error.message : String(error)}`;
    return null;
  }
}

/**
 * The window the wallpaper's own children hang from, on whichever Windows
 * this is - or 0 when the desktop is not in a shape we recognise.
 */
function desktopHost(win32: User32): Handle {
  const progman = win32.FindWindowW("Progman", null);
  if (progman === 0) return 0;

  // Asks Progman to split the desktop in two, wallpaper behind and icons in
  // front. Harmless where it has already happened, and ignored on the
  // Windows versions that never do it.
  win32.SendMessageTimeoutW(progman, WM_SPAWN_WORKER, 0, 0, 0, 1000, [0]);

  // Windows 10: the icons sit under some top-level window, and the WorkerW
  // that follows it in the z-order is the wallpaper's own layer.
  let worker = 0;
  win32.enumerate((hwnd) => {
    if (win32.FindWindowExW(hwnd, 0, "SHELLDLL_DefView", null) === 0) return true;
    const next = win32.FindWindowExW(0, hwnd, "WorkerW", null);
    if (next !== 0 && win32.IsWindowVisible(next)) {
      worker = next;
      return false;
    }
    return true;
  });
  if (worker !== 0) return worker;

  // Windows 11 22H2 and later: no such sibling, and the icons are Progman's
  // own children. Joining them is the whole of it.
  if (win32.FindWindowExW(progman, 0, "SHELLDLL_DefView", null) !== 0) return progman;
  return 0;
}

/** The HWND Electron is holding, as a plain number. */
function handleOf(win: BrowserWindow): Handle {
  const buffer = win.getNativeWindowHandle();
  return buffer.length === 8 ? Number(buffer.readBigUInt64LE()) : buffer.readUInt32LE();
}

/**
 * Pins the window to the desktop, behind everything else.
 *
 * Reports rather than throws: this is a nicety on one operating system, and
 * a widget that will not appear at all because a Win32 call moved is a worse
 * outcome than one sitting in front of the windows instead.
 */
export function attachToWallpaper(win: BrowserWindow): Attached {
  const win32 = user32();
  if (!win32) return { ok: false, reason: refusal ?? "The desktop could not be reached." };

  // Before anything else. Windows will not make a topmost window a child.
  win.setAlwaysOnTop(false);

  const host = desktopHost(win32);
  if (host === 0) {
    return {
      ok: false,
      reason: "Windows did not offer a desktop to pin to. This happens with some wallpaper apps running.",
    };
  }

  const hwnd = handleOf(win);
  win32.SetParent(hwnd, host);

  // GetParent would answer with the owner and read 0 from a call that
  // worked. This is the question that means "whose child is it".
  if (win32.GetAncestor(hwnd, GA_PARENT) !== host) {
    return { ok: false, reason: "Windows accepted the window and then let it go again." };
  }
  return { ok: true };
}

/**
 * Lets the window go again.
 *
 * Called before the window closes and before the app quits, both. A window
 * still parented to Progman does not close cleanly, and the app hangs on the
 * way out with nothing on screen to say why.
 */
export function detachFromWallpaper(win: BrowserWindow): void {
  if (win.isDestroyed()) return;
  const win32 = loaded;
  if (!win32) return;
  try {
    win32.SetParent(handleOf(win), 0);
  } catch {
    // On the way out. Nothing useful is left to do about it.
  }
}
