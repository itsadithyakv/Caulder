import { describe, expect, it } from "vitest";
import { diffLines } from "./diff";

const kinds = (before: string, after: string) =>
  diffLines(before, after).map((line) => `${line.kind[0]} ${line.text}`);

describe("comparing two versions", () => {
  it("marks nothing when nothing changed", () => {
    expect(kinds("a\nb", "a\nb")).toEqual(["s a", "s b"]);
  });

  it("shows a changed line as removed then added, in place", () => {
    expect(kinds("price\n4000\nmonthly", "price\n4500\nmonthly")).toEqual([
      "s price",
      "r 4000",
      "a 4500",
      "s monthly",
    ]);
  });

  it("finds lines added and removed in the middle", () => {
    expect(kinds("a\nb\nc\nd", "a\nc\nx\nd")).toEqual(["s a", "r b", "s c", "a x", "s d"]);
  });

  it("handles a page written from nothing, and one emptied", () => {
    expect(kinds("", "one\ntwo")).toEqual(["r ", "a one", "a two"]);
    expect(kinds("one", "")).toEqual(["r one", "a "]);
  });
});
