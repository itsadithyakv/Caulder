import { describe, expect, it } from "vitest";
import { readThought, thoughtBody } from "./thoughts";

describe("the line this was built for", () => {
  const line = "Edit on helicopter by asap rockey, grunge dark edit- here is the link of that for reference https://youtu.be/abc123";

  it("reads what it is, what it should be like, and where the reference is", () => {
    expect(readThought(line)).toEqual({
      title: "Edit on helicopter by asap rockey",
      detail: "grunge dark edit",
      links: ["https://youtu.be/abc123"],
    });
  });

  it("reads it the same with the link only spoken of", () => {
    expect(readThought("Edit on helicopter by asap rockey, grunge dark edit- here is the link of that for reference (the link attached)")).toEqual({
      title: "Edit on helicopter by asap rockey",
      detail: "grunge dark edit",
      links: [],
    });
  });

  it("makes a page of it: the detail, the reference, and the words as they were said", () => {
    const thought = readThought(line);
    const body = thoughtBody(thought ?? { title: "", detail: "", links: [] }, line);
    expect(body).toContain("Grunge dark edit");
    expect(body).toContain("Reference: https://youtu.be/abc123");
    expect(body).toContain(`_${line}_`);
  });
});

describe("a thing to make", () => {
  it.each([
    ["reel about morning routines - fast cuts, no voiceover", "Reel about morning routines", "fast cuts, no voiceover"],
    ["app for splitting rent with flatmates", "App for splitting rent with flatmates", ""],
    ["a song idea about leaving home, slow and acoustic", "A song idea about leaving home", "slow and acoustic"],
    ["poster for the college fest: neon, 90s rave", "Poster for the college fest", "neon, 90s rave"],
  ])("reads '%s'", (line, title, detail) => {
    expect(readThought(line)).toMatchObject({ title, detail });
  });

  it("keeps every link, without the full stop after it", () => {
    expect(readThought("video on sunsets, see https://a.co/1 and www.b.com/2.")?.links).toEqual(["https://a.co/1", "www.b.com/2"]);
  });
});

describe("what is not one", () => {
  it.each([
    "edit the video tomorrow",
    "post the invoice to oakridge",
    "design review friday 3pm",
    "call mom",
    "https://example.com/article",
    "felt great today",
  ])("'%s' is something else", (line) => {
    expect(readThought(line)).toBeNull();
  });
});
