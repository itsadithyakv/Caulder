import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Links and navigation.
 *
 * The rule is small and the failure is large: one scheme let through is a
 * program run from a link in a note. So every way a window can try to leave
 * is exercised against a stand-in for Electron's web contents.
 */

const opened: string[] = [];
vi.mock("electron", () => ({
  shell: { openExternal: (url: string) => opened.push(url) },
}));

const { guardContents, isSafeExternal, isSameDocument } = await import("./links");

type Navigate = (event: { preventDefault: () => void }, url: string) => void;
type OpenHandler = (details: { url: string }) => { action: string };

function fakeContents(current: string) {
  let navigate: Navigate = () => undefined;
  let open: OpenHandler = () => ({ action: "allow" });
  const contents = {
    getURL: () => current,
    on: (_name: string, listener: Navigate) => {
      navigate = listener;
    },
    setWindowOpenHandler: (handler: OpenHandler) => {
      open = handler;
    },
  };
  // The stand-in covers only what guardContents touches.
  guardContents(contents as unknown as Parameters<typeof guardContents>[0]);

  return {
    navigate(url: string) {
      let prevented = false;
      navigate({ preventDefault: () => (prevented = true) }, url);
      return prevented;
    },
    open: (url: string) => open({ url }),
  };
}

beforeEach(() => {
  opened.length = 0;
});

describe("which links may leave the app", () => {
  it.each(["https://example.com/page", "mailto:someone@example.com"])("lets %s out", (url) => {
    expect(isSafeExternal(url)).toBe(true);
  });

  it.each([
    "file:///C:/Windows/System32/calc.exe",
    "javascript:alert(1)",
    "http://example.com",
    "ms-settings:privacy",
    "C:\\Windows\\notepad.exe",
    "not a url",
  ])("keeps %s in", (url) => {
    expect(isSafeExternal(url)).toBe(false);
  });

  it("treats a fragment change or a reload as the same page", () => {
    expect(isSameDocument("file:///app/index.html#x", "file:///app/index.html")).toBe(true);
    expect(isSameDocument("file:///app/other.html", "file:///app/index.html")).toBe(false);
  });
});

describe("a guarded window", () => {
  const current = "file:///app/index.html";

  it("never navigates away, and sends a web link to the browser instead", () => {
    const window = fakeContents(current);
    expect(window.navigate("https://example.com")).toBe(true);
    expect(opened).toEqual(["https://example.com"]);
  });

  it("drops a navigation to anything else without opening it", () => {
    const window = fakeContents(current);
    expect(window.navigate("file:///C:/Windows/System32/calc.exe")).toBe(true);
    expect(opened).toEqual([]);
  });

  it("lets a reload through", () => {
    const window = fakeContents(current);
    expect(window.navigate(current)).toBe(false);
    expect(opened).toEqual([]);
  });

  it("opens no new windows, and hands only safe links on", () => {
    const window = fakeContents(current);
    expect(window.open("mailto:a@b.c")).toEqual({ action: "deny" });
    expect(window.open("javascript:alert(1)")).toEqual({ action: "deny" });
    expect(opened).toEqual(["mailto:a@b.c"]);
  });
});
