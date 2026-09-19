import { describe, expect, it } from "vitest";
import { checkScriptUrl, normaliseScriptKey } from "./script";

/**
 * The two things a person pastes to connect Google, and the mistakes worth a
 * sentence of their own.
 */

describe("the web app URL", () => {
  it.each([
    "https://script.google.com/macros/s/AKfycbx_abc-123/exec",
    "https://script.google.com/a/unifloe.in/macros/s/AKfycbx_abc-123/exec",
    "  https://script.google.com/macros/s/AKfycbx_abc-123/exec  ",
  ])("accepts %s", (url) => {
    expect(checkScriptUrl(url)).toBeNull();
  });

  it("explains the test URL rather than refusing it blankly", () => {
    expect(checkScriptUrl("https://script.google.com/macros/s/AKfycbx_abc-123/dev")).toContain(
      "test URL",
    );
  });

  it.each([
    "https://example.com/whatever",
    "http://script.google.com/macros/s/AKfycbx/exec",
    "https://script.google.com/home/projects/123/edit",
    "https://script.google.com/macros/s/AKfycbx/exec?x=1",
    "",
  ])("refuses %s", (url) => {
    expect(checkScriptUrl(url)).toContain("Apps Script web app URL");
  });
});

describe("the key", () => {
  it.each([
    ["7f3a9c", "7f3a9c"],
    ["  7f3a9c  ", "7f3a9c"],
    ["Your Caulder key: 7f3a9c", "7f3a9c"],
    ["10:42:07 AM\tInfo\tYour Caulder key: 7f3a9c", "7f3a9c"],
    ['"7f3a9c"', "7f3a9c"],
  ])("reads %j as %s", (pasted, key) => {
    expect(normaliseScriptKey(pasted)).toBe(key);
  });
});
