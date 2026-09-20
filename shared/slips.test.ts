import { describe, expect, it } from "vitest";
import { distance, isSlip, slipAt } from "./slips";

describe("how far apart two words are", () => {
  it("counts a swapped pair as one slip, not two", () => {
    expect(distance("firday", "friday")).toBe(1);
    expect(distance("meetining", "meeting")).toBe(2);
    expect(distance("same", "same")).toBe(0);
  });
});

describe("what counts as a slip", () => {
  it.each([
    ["meetining", "meeting"],
    ["meetign", "meeting"],
    ["meetng", "meeting"],
    ["emial", "email"],
    ["folow", "follow"],
    ["invocie", "invoice"],
    ["assigment", "assignment"],
    ["assignmnet", "assignment"],
    ["homewrok", "homework"],
    ["gorceries", "groceries"],
    ["mornign", "morning"],
    ["afternon", "afternoon"],
    ["improtant", "important"],
    ["oakrige", "oakridge"],
  ])("reads '%s' as a slip at '%s'", (typed, target) => {
    expect(isSlip(typed, target)).toBe(true);
  });

  it.each([
    // A letter the target does not have is another word, not a slip.
    ["finding", "funding"],
    ["glasses", "classes"],
    ["booking", "cooking"],
    ["meaning", "meeting"],
    ["heating", "meeting"],
    ["parents", "patents"],
    // One is the start of the other: two words.
    ["check", "checkup"],
    ["lecturer", "lecture"],
    ["market", "marketing"],
    // Two letters short is usually a word of its own.
    ["camping", "campaign"],
    // Real words a rule about letters cannot tell from a slip.
    ["contact", "contract"],
    ["bother", "brother"],
    ["moves", "movies"],
    // Too short to be sure of.
    ["cal", "call"],
    ["emal", "email"],
  ])("leaves '%s' alone rather than reading it as '%s'", (typed, target) => {
    expect(isSlip(typed, target)).toBe(false);
  });

  it("picks the nearest of several, and nothing for a word that is already one of them", () => {
    expect(slipAt("meetign", ["meeting", "morning", "evening"])).toBe("meeting");
    expect(slipAt("meeting", ["meeting", "meetings"])).toBeNull();
    expect(slipAt("unifloe", ["uniform", "invoice", "meeting"])).toBeNull();
  });
});
