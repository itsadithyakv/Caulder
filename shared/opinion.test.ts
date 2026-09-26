import { describe, expect, it } from "vitest";
import { areaOpinion, secondOpinion, type Example } from "./opinion";

/**
 * The second opinion's rules, with the model's part stood in for: examples
 * already scored. Whether the model's scores are any good is the measuring
 * stick's question (electron/main/understand/eval.test.ts); this is whether
 * the decision is made the way it says.
 */

const guess = (kind: string) => ({ kind, soft: true, page: null });
const seed = (kind: Example["kind"], score: number): Example => ({ kind, score, own: false });
const mine = (kind: Example["kind"], score: number, title?: string): Example => ({
  kind,
  score,
  own: true,
  page: title ? { id: `p-${title}`, title } : null,
});

describe("what is doubted", () => {
  it("never a reading the rules were sure of", () => {
    const sure = { kind: "note", page: null };
    expect(secondOpinion(sure, [seed("journal", 0.9), seed("journal", 0.9)])).toEqual({ kind: null, page: null, because: null });
  });

  it("nothing when no example is near enough to count", () => {
    expect(secondOpinion(guess("note"), [seed("journal", 0.2)]).kind).toBeNull();
  });
});

describe("changing the kind", () => {
  it("moves a note that was nobody's answer to the kind its neighbours agree on", () => {
    const opinion = secondOpinion(guess("note"), [seed("memory", 0.55), seed("memory", 0.5), seed("note", 0.35)]);
    expect(opinion).toMatchObject({ kind: "memory", because: "it sounds like something to remember" });
  });

  it("needs more to overrule a reading that was a real guess, than a note", () => {
    const split = [seed("journal", 0.46), seed("task", 0.44), seed("journal", 0.4)];
    expect(secondOpinion(guess("note"), split).kind).toBe("journal");
    expect(secondOpinion(guess("task"), split).kind).toBeNull();
  });

  it("leaves the reading alone when the neighbours agree with it", () => {
    expect(secondOpinion(guess("task"), [seed("task", 0.8), seed("task", 0.7)]).kind).toBeNull();
  });

  it("counts the person's own lines above the seeds", () => {
    const examples = [mine("idea", 0.5), seed("task", 0.52)];
    expect(secondOpinion(guess("note"), examples).kind).toBe("idea");
  });

  it("says where it belongs when it is near one of the person's own pages", () => {
    expect(secondOpinion(guess("note"), [mine("memory", 0.62, "Gym"), mine("memory", 0.58, "Gym")]).because).toBe(
      "it belongs with Gym",
    );
  });
});

describe("where a memory goes", () => {
  it("onto the person's own page when one is close, never a seed's", () => {
    const opinion = secondOpinion(guess("memory"), [mine(null, 0.7, "Red Rising"), seed("memory", 0.8)]);
    expect(opinion.page).toEqual({ id: "p-Red Rising", title: "Red Rising" });
    expect(secondOpinion(guess("memory"), [mine(null, 0.3, "Red Rising")]).page).toBeNull();
  });

  it("not when the rules already found its page", () => {
    const found = { kind: "memory", soft: true, page: { id: "p1", title: "Guitar" } };
    expect(secondOpinion(found, [mine(null, 0.9, "Red Rising")]).page).toBeNull();
  });
});

describe("the area of a task nothing else placed", () => {
  const task = (area: string, score: number): Example => ({ kind: "task", score, own: true, area });

  it("is where the person's nearest tasks went, when they agree", () => {
    expect(areaOpinion([task("college", 0.6), task("college", 0.5), task("company", 0.35)])).toBe("college");
  });

  it("is nothing when they do not agree, or are not near, or are only seeds", () => {
    expect(areaOpinion([task("college", 0.5), task("company", 0.49)])).toBeNull();
    expect(areaOpinion([task("college", 0.4)])).toBeNull();
    expect(areaOpinion([{ kind: "task", score: 0.9, own: false, area: "college" }])).toBeNull();
  });
});
