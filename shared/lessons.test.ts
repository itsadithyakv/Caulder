import { describe, expect, it } from "vitest";
import { lessonInput, voteKind, wordsOf, type Lesson } from "./lessons";

let counter = 0;
const lesson = (sample: string, over: Pick<Lesson, "kind"> & Partial<Pick<Lesson, "times">>): Lesson => ({
  id: `l${(counter += 1)}`,
  words: wordsOf(sample),
  kind: over.kind,
  times: over.times ?? 1,
  sample,
});

describe("the words of a line", () => {
  it("keeps what carries meaning, once each, plural and singular as one", () => {
    expect(wordsOf("I have to return my friends jacket")).toEqual(["friend", "jacket", "return"]);
    expect(wordsOf("Call mum tmrw at 7pm, don't forget!")).toEqual(["call", "mum"]);
    expect(wordsOf("class at 9, glass of water")).toEqual(["class", "glass", "water"]);
    expect(wordsOf("the the and or")).toEqual([]);
  });
});

describe("learning where a line goes", () => {
  it("moves a later line the way the earlier one was moved, and only between the soft kinds", () => {
    const lessons = [lesson("my friends jacket is in my room", { kind: "task" }), lesson("thoughts on the pricing page", { kind: "idea" })];
    expect(voteKind("friends jacket still in my room", lessons)).toBe("task");
    expect(voteKind("more thoughts on pricing", lessons)).toBe("idea");
    expect(voteKind("went to the gym", lessons)).toBeNull();
  });

  it("lets a word taught two ways count for neither", () => {
    const lessons = [lesson("report for the bakery", { kind: "task" }), lesson("report on what the meetup said", { kind: "note" })];
    // "Report" was moved both ways, so it says nothing; "bakery" was moved one way.
    expect(voteKind("the report", lessons)).toBeNull();
    expect(voteKind("bakery report", lessons)).toBe("task");
  });

  it("weighs a lesson given more than once above one given once, and calls a tie nothing", () => {
    const often = [lesson("loyalty card", { kind: "idea", times: 3 }), lesson("stamp sheet", { kind: "note" })];
    expect(voteKind("a loyalty card or a stamp sheet", often)).toBe("idea");
    const even = [lesson("loyalty card", { kind: "idea" }), lesson("stamp sheet", { kind: "note" })];
    expect(voteKind("a loyalty card or a stamp sheet", even)).toBeNull();
  });

  it("takes a lesson only with an answer in it", () => {
    expect(() => lessonInput.parse({ text: "something" })).toThrow(/Nothing was chosen/);
    expect(lessonInput.parse({ text: "something", kind: "task" })).toEqual({ text: "something", kind: "task" });
    expect(() => lessonInput.parse({ text: "x", kind: "private" })).toThrow();
  });
});
