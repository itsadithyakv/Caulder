import { describe, expect, it } from "vitest";
import { lessonInput, voteArea, voteKind, wordsOf, type Lesson } from "./lessons";

let counter = 0;
const lesson = (sample: string, over: Partial<Pick<Lesson, "area" | "kind" | "times">>): Lesson => ({
  id: `l${(counter += 1)}`,
  words: wordsOf(sample),
  area: over.area ?? null,
  kind: over.kind ?? null,
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

describe("learning which part of life a line is", () => {
  it("reads a later line the way the earlier one was corrected", () => {
    const lessons = [lesson("I have to return my friends jacket", { area: "personal" })];
    expect(voteArea("give rahul his jacket back", lessons)).toBe("personal");
    expect(voteArea("send the client the deck", lessons)).toBeNull();
  });

  it("gives no answer for a word corrected two ways, and takes the other words instead", () => {
    const lessons = [lesson("write the client report", { area: "company" }), lesson("write the lab report", { area: "college" })];
    expect(voteArea("finish the report", lessons)).toBeNull();
    expect(voteArea("lab report due", lessons)).toBe("college");
    expect(voteArea("report for the client", lessons)).toBe("company");
  });

  it("weighs a lesson given twice over one given once", () => {
    const lessons = [lesson("gym with rahul", { area: "personal", times: 3 }), lesson("gym with the team", { area: "company" })];
    // "gym" is taught two ways and counts for neither; "rahul" and "team" decide.
    expect(voteArea("gym rahul", lessons)).toBe("personal");
    expect(voteArea("gym team", lessons)).toBe("company");
    expect(voteArea("gym", lessons)).toBeNull();
  });

  it("leaves a word you taught outright to Your words", () => {
    const lessons = [lesson("unifloe invoice is late", { area: "personal" })];
    expect(voteArea("unifloe invoice", lessons, ["unifloe", "invoice"])).toBeNull();
    expect(voteArea("unifloe is late", lessons, ["unifloe"])).toBe("personal");
  });

  it("needs a tie broken, or says nothing", () => {
    const lessons = [lesson("jacket", { area: "personal" }), lesson("jacket", { area: "company" })];
    expect(voteArea("the jacket", lessons)).toBeNull();
  });
});

describe("learning where a line goes", () => {
  it("moves a later line the way the earlier one was moved, and only between the soft kinds", () => {
    const lessons = [lesson("my friends jacket is in my room", { kind: "task" }), lesson("thoughts on the pricing page", { kind: "idea" })];
    expect(voteKind("friends jacket still in my room", lessons)).toBe("task");
    expect(voteKind("more thoughts on pricing", lessons)).toBe("idea");
    expect(voteKind("went to the gym", lessons)).toBeNull();
  });

  it("takes a lesson only with an answer in it", () => {
    expect(() => lessonInput.parse({ text: "something" })).toThrow(/Nothing was chosen/);
    expect(lessonInput.parse({ text: "something", area: "personal" })).toEqual({ text: "something", area: "personal", kind: null });
    expect(() => lessonInput.parse({ text: "x", kind: "private" })).toThrow();
  });
});
