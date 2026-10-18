import { describe, expect, it } from "vitest";
import { briefMarkdown, coveredBy, fitPieces, orderPieces, topicName, topicWords, wentIn, type TopicPiece } from "./topic";

const piece = (over: Partial<TopicPiece> = {}): TopicPiece => ({
  kind: "page",
  title: "Guitar",
  note: null,
  lines: ["Learning it."],
  ...over,
});

describe("topicWords", () => {
  it("splits on anything that is not a letter or a number", () => {
    expect(topicWords("guitar, books & tabs")).toEqual(["guitar", "books", "tabs"]);
  });

  it("drops words of one character", () => {
    // A single letter matches almost every row there is, so it is not a word
    // to search for however deliberately it was typed.
    expect(topicWords("a guitar i play")).toEqual(["guitar", "play"]);
  });

  it("keeps at most eight", () => {
    expect(topicWords("one two three four five six seven eight nine ten")).toHaveLength(8);
  });

  it("lowercases and normalises, so a pasted word matches a typed one", () => {
    expect(topicWords("GUITAR")).toEqual(["guitar"]);
  });

  it("has nothing to look for in punctuation alone", () => {
    expect(topicWords("...")).toEqual([]);
  });
});

describe("wentIn", () => {
  it("counts each kind and says it in words", () => {
    expect(
      wentIn([piece(), piece(), piece({ kind: "under" }), piece({ kind: "task" })]),
    ).toEqual(["2 pages", "1 page under them", "1 task"]);
  });

  it("is empty when nothing went in", () => {
    expect(wentIn([])).toEqual([]);
  });

  it("counts what it was given rather than what it was told", () => {
    // The summary is derived from the pieces, so it cannot drift from them.
    const cut = fitPieces([piece({ lines: ["x".repeat(500)] }), piece()], 100);
    expect(wentIn(cut.pieces)).toEqual(["2 pages"]);
  });
});

describe("orderPieces", () => {
  it("puts pages first and tasks near the end", () => {
    const ordered = orderPieces([
      piece({ kind: "task", title: "Thursday" }),
      piece({ kind: "note", title: "A note" }),
      piece({ kind: "page", title: "Guitar" }),
      piece({ kind: "under", title: "Riptide" }),
    ]);
    expect(ordered.map((one) => one.title)).toEqual(["Guitar", "Riptide", "Thursday", "A note"]);
  });
});

describe("fitPieces", () => {
  it("leaves a brief that fits entirely alone", () => {
    const result = fitPieces([piece(), piece({ title: "Riptide" })], 10_000);
    expect(result.cut).toBe(false);
    expect(result.pieces[0]?.lines).toEqual(["Learning it."]);
  });

  it("cuts the longest piece rather than every piece", () => {
    // 6 + 4 + 300 = 310 against a budget of 120: the long one loses its body
    // and the two short ones keep theirs, which is the whole point of sorting.
    const result = fitPieces(
      [
        piece({ title: "Guitar", lines: ["short"] }),
        piece({ title: "Amp", lines: ["x".repeat(300)] }),
      ],
      120,
    );
    expect(result.cut).toBe(true);
    expect(result.pieces[0]?.lines).toEqual(["short"]);
    expect(result.pieces[1]?.lines.at(-1)).toContain("Cut here");
  });

  it("keeps the heading of a piece it could not carry at all", () => {
    // Knowing a page exists and could not fit is worth more than not knowing
    // it exists, so a piece is never dropped outright.
    const result = fitPieces([piece({ title: "Guitar", lines: ["x".repeat(9_000)] })], 50);
    expect(result.pieces).toHaveLength(1);
    expect(result.pieces[0]?.title).toBe("Guitar");
  });

  it("does not change the pieces it was given", () => {
    const original = piece({ lines: ["x".repeat(400)] });
    fitPieces([original], 50);
    expect(original.lines).toEqual(["x".repeat(400)]);
  });
});

describe("briefMarkdown", () => {
  const brief = briefMarkdown({
    topic: "guitar",
    workspace: "Me",
    day: "2026-09-20",
    pieces: [
      piece({ title: "Guitar", note: "Hobby", lines: ["Six months in.", "", "- Learn Riptide"] }),
      piece({ kind: "under", title: "Riptide", note: "under Guitar", lines: ["Chords: Am F C G"] }),
    ],
  });

  it("names the topic and the day at the top", () => {
    expect(brief.markdown.startsWith("# guitar\n")).toBe(true);
    expect(brief.markdown).toContain("as of 2026-09-20");
  });

  it("says what Caulder is, because the reader has never heard of it", () => {
    expect(brief.markdown).toContain("Caulder is a desktop app");
    expect(brief.markdown).toContain("**Me**");
  });

  it("warns the reader that these are not notes written for them", () => {
    expect(brief.markdown).toContain("None of it was written for a reader");
  });

  it("tells the reader not to read silence as absence", () => {
    // Without this an AI answers confidently about a gap that is a gap on
    // purpose, which is the one failure this whole feature could cause.
    expect(brief.markdown).toContain("do not read silence as absence");
  });

  it("names what was held back, in the foot", () => {
    expect(brief.markdown).toContain("**What did not:**");
    expect(brief.markdown).toContain("masked");
  });

  it("refuses to call itself everything", () => {
    expect(brief.markdown).toContain("not everything about the topic");
  });

  it("writes each piece as a heading with its body", () => {
    expect(brief.markdown).toContain("## Guitar\n\n*Hobby*\n\nSix months in.");
    expect(brief.markdown).toContain("## Riptide\n\n*under Guitar*\n\nChords: Am F C G");
  });

  it("counts its own characters, including the foot that reports them", () => {
    expect(brief.chars).toBe(brief.markdown.length);
  });

  it("says what went in", () => {
    expect(brief.went).toEqual(["1 page", "1 page under them"]);
    expect(brief.markdown).toContain("**What went in:** 1 page, 1 page under them.");
  });

  it("says plainly when there is no record at all", () => {
    const empty = briefMarkdown({ topic: "sailing", workspace: "Me", day: "2026-09-20", pieces: [] });
    expect(empty.markdown).toContain("nothing - Caulder holds no record of this");
  });

  it("says a page has nothing on it rather than leaving a blank heading", () => {
    const blank = briefMarkdown({
      topic: "guitar",
      workspace: "Me",
      day: "2026-09-20",
      pieces: [piece({ title: "Amp", lines: [] })],
    });
    expect(blank.markdown).toContain("## Amp\n\n*(Nothing written on it yet.)*");
  });

  it("admits at the foot when it did not all fit", () => {
    const long = briefMarkdown({
      topic: "guitar",
      workspace: "Me",
      day: "2026-09-20",
      pieces: [piece({ lines: ["x".repeat(200_000)] })],
    });
    expect(long.cut).toBe(true);
    expect(long.markdown).toContain("It did not all fit");
  });
});

describe("the words that are the topic", () => {
  it("throws away the words nobody writes a page about", () => {
    // Nobody types the topic alone into a line they have been talking to all
    // week. The index joins with AND, so "give" and "context" between them
    // would find nothing at all.
    expect(topicWords("give me context about unifloe pricing")).toEqual(["unifloe", "pricing"]);
  });

  it("keeps them when throwing them away would leave nothing", () => {
    // A brief about "how" is a strange brief. Refusing to make one because
    // every word was on a list is worse than making a poor one.
    expect(topicWords("how")).toEqual(["how"]);
  });

  it("titles the brief with the topic rather than the sentence", () => {
    expect(topicName("copy all the context about my guitar")).toBe("guitar");
  });
});

describe("coveredBy", () => {
  const words = ["unifloe", "tiers"];

  it("counts a word supplied by a page above it", () => {
    // The page says "tiers" and nothing about Unifloe; the chain above it
    // does. Together they are about unifloe tiers.
    expect(coveredBy(words, new Set(["tiers"]), ["Unifloe", "Pricing"])).toBe(true);
  });

  it("refuses when a word is supplied by neither", () => {
    expect(coveredBy(words, new Set(["tiers"]), ["Acme", "Pricing"])).toBe(false);
  });

  it("counts a word the page matched itself", () => {
    expect(coveredBy(words, new Set(["tiers", "unifloe"]), [])).toBe(true);
  });

  it("is never true of no words at all", () => {
    // Otherwise every page in the brain is about the empty topic.
    expect(coveredBy([], new Set(), ["Unifloe"])).toBe(false);
  });

  it("reaches all the way up, not just to the parent", () => {
    expect(coveredBy(["reading", "rising"], new Set(["rising"]), ["Me", "Hobbies", "Reading", "Sci-fi books"])).toBe(true);
  });
});
