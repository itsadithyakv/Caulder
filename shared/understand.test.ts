import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  basicTokens,
  batch,
  encode,
  fromBytes,
  meanPool,
  nearest,
  normalise,
  readVocab,
  similarity,
  textHash,
  toBytes,
  wordPieces,
} from "./understand";

/**
 * The arithmetic around the model: BERT's tokens, one vector a line, and
 * keeping and comparing them. The model itself is not needed for any of it,
 * except the last check, which reads the real vocabulary when it has been
 * fetched (npm run fetch-model) and is skipped when it has not.
 */

const TOY = readVocab(["[PAD]", "[UNK]", "[CLS]", "[SEP]", "un", "##aff", "##able", "call", "rahul", "tomorrow", ",", "!", "cafe"].join("\n"));

describe("tokens", () => {
  it("lower-cases, takes accents off, and splits round every mark", () => {
    expect(basicTokens("Call Rahul, tomorrow!")).toEqual(["call", "rahul", ",", "tomorrow", "!"]);
    expect(basicTokens("Café  crème")).toEqual(["cafe", "creme"]);
    expect(basicTokens("r&d:q3")).toEqual(["r", "&", "d", ":", "q3"]);
  });

  it("finds the longest piece first, and gives up on a word it cannot finish", () => {
    expect(wordPieces("unaffable", TOY)).toEqual([4, 5, 6]);
    expect(wordPieces("unknowable", TOY)).toEqual([1]);
  });

  it("wraps a line in [CLS] and [SEP], cut to the most tokens", () => {
    expect(encode("Call Rahul, tomorrow!", TOY)).toEqual({ ids: [2, 7, 8, 10, 9, 11, 3], mask: [1, 1, 1, 1, 1, 1, 1] });
    expect(encode("call call call call", TOY, 4).ids).toEqual([2, 7, 7, 3]);
  });

  it("pads a batch to its longest line, and masks the padding", () => {
    const both = batch(["call", "call rahul tomorrow"], TOY);
    expect(both.length).toBe(5);
    expect(both.ids[0]).toEqual([2, 7, 3, 0, 0]);
    expect(both.mask[0]).toEqual([1, 1, 1, 0, 0]);
  });
});

describe("one vector a line", () => {
  it("averages the real tokens only, and scales to length one", () => {
    // Two tokens of two numbers each, and a padding token that must not count.
    const pooled = meanPool([1, 3, 3, 1, 100, 100], [1, 1, 0], 2);
    expect([...pooled]).toEqual([2, 2]);
    const unit = normalise(pooled);
    expect(similarity(unit, unit)).toBeCloseTo(1, 6);
    expect([...normalise(new Float32Array([0, 0]))]).toEqual([0, 0]);
  });
});

describe("kept small, compared quickly", () => {
  it("keeps a vector in a byte a number, and loses almost nothing by it", () => {
    const a = normalise(new Float32Array([0.3, -0.8, 0.1, 0.5]));
    const b = normalise(new Float32Array([0.25, -0.7, 0.2, 0.55]));
    const kept = similarity(fromBytes(toBytes(a)), fromBytes(toBytes(b)));
    expect(Math.abs(kept - similarity(a, b))).toBeLessThan(0.02);
  });

  it("finds the nearest first, and none under the floor", () => {
    const at = (x: number, y: number) => normalise(new Float32Array([x, y]));
    const found = nearest(at(1, 0), [
      { key: "far", vector: at(0, 1) },
      { key: "near", vector: at(1, 0.1) },
      { key: "nearer", vector: at(1, 0.01) },
    ], 5, 0.5);
    expect(found.map((each) => each.key)).toEqual(["nearer", "near"]);
  });

  it("knows unchanged text by its hash", () => {
    expect(textHash("call rahul")).toBe(textHash("call rahul"));
    expect(textHash("call rahul")).not.toBe(textHash("call rahul!"));
  });
});

const VOCAB = join(process.cwd(), "resources", "model", "vocab.txt");

describe.skipIf(!existsSync(VOCAB))("the real vocabulary", () => {
  it("gives the ids BERT gives", () => {
    const vocab = readVocab(readFileSync(VOCAB, "utf8"));
    expect(encode("Hello world", vocab).ids).toEqual([101, 7592, 2088, 102]);
    // A word it does not have whole is pieces of words it does.
    expect(encode("unaffable", vocab).ids.length).toBeGreaterThan(3);
  });
});
