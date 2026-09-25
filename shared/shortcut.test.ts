import { describe, expect, it } from "vitest";
import { DEFAULT_CAPTURE_SHORTCUT, sayShortcut } from "./domain";

describe("the quick key", () => {
  it("is Ctrl and the Windows key, with A - a key, because modifiers alone cannot be claimed", () => {
    expect(DEFAULT_CAPTURE_SHORTCUT).toBe("Ctrl+Super+A");
    expect(DEFAULT_CAPTURE_SHORTCUT.split("+").at(-1)).toMatch(/^[A-Z]$/);
  });

  it("is said the way it is written on the keyboard", () => {
    expect(sayShortcut("Ctrl+Super+A")).toBe("Ctrl+Win+A");
    expect(sayShortcut("CommandOrControl+Shift+Space")).toBe("Ctrl+Shift+Space");
    expect(sayShortcut("Control+Meta+K")).toBe("Ctrl+Win+K");
    expect(sayShortcut("Ctrl+Alt+A")).toBe("Ctrl+Alt+A");
  });
});
