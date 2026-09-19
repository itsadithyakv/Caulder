import { describe, expect, it } from "vitest";
import {
  linkLabelsOnly,
  linkTargets,
  linkToken,
  openLinkQuery,
  parseLinks,
  refreshLabels,
} from "./links";

const PAGE = "3f0c1e2a-1111-4222-8333-944455556666";
const CONTACT = "9a1e2b3c-aaaa-4bbb-8ccc-ddddeeeeffff";

describe("reading links out of a page", () => {
  it("finds pages and contacts by id, with where they sit", () => {
    const text = `See [[Pricing|page:${PAGE}]] and ask [[Oakridge|contact:${CONTACT}]].`;
    expect(parseLinks(text)).toEqual([
      { label: "Pricing", kind: "page", id: PAGE, start: 4, end: 4 + `[[Pricing|page:${PAGE}]]`.length },
      expect.objectContaining({ label: "Oakridge", kind: "contact", id: CONTACT }),
    ]);
  });

  it("ignores anything that only looks like a link", () => {
    expect(parseLinks("[[Pricing]] [[x|page:not-an-id]] [[a|file:" + PAGE + "]]")).toEqual([]);
    expect(parseLinks(`[[two\nlines|page:${PAGE}]]`)).toEqual([]);
  });

  it("lists each target once", () => {
    const text = `[[A|page:${PAGE}]] [[A again|page:${PAGE}]] [[O|contact:${CONTACT}]]`;
    expect(linkTargets(text)).toEqual([
      { kind: "page", id: PAGE, label: "A" },
      { kind: "contact", id: CONTACT, label: "O" },
    ]);
  });

  it("reads the same twice in a row", () => {
    const text = `[[A|page:${PAGE}]]`;
    expect(parseLinks(text)).toHaveLength(1);
    expect(parseLinks(text)).toHaveLength(1);
  });
});

describe("writing links", () => {
  it("keeps a label from breaking out of its token", () => {
    expect(linkToken("Price | list ]] now\n", { kind: "page", id: PAGE })).toBe(`[[Price list now|page:${PAGE}]]`);
    expect(linkToken("  ", { kind: "page", id: PAGE })).toBe(`[[Untitled|page:${PAGE}]]`);
  });

  it("brings labels up to date, and leaves unknown ones alone", () => {
    const text = `[[Old name|page:${PAGE}]] and [[Gone|contact:${CONTACT}]]`;
    expect(refreshLabels(text, { [`page:${PAGE}`]: "New name" })).toBe(
      `[[New name|page:${PAGE}]] and [[Gone|contact:${CONTACT}]]`,
    );
  });

  it("reduces links to words, current where known", () => {
    const text = `Read [[Old|page:${PAGE}]] with [[Asha|contact:${CONTACT}]].`;
    expect(linkLabelsOnly(text, { [`page:${PAGE}`]: "Pricing" })).toBe("Read Pricing with Asha.");
  });
});

describe("typing a link", () => {
  it("knows when the caret is inside an unfinished link", () => {
    const text = "We agreed with [[Oak";
    expect(openLinkQuery(text, text.length)).toEqual({ start: 15, query: "Oak" });
    expect(openLinkQuery("[[", 2)).toEqual({ start: 0, query: "" });
  });

  it("does not, once the link is closed or the line has ended", () => {
    expect(openLinkQuery("[[Oak]] then", 12)).toBeNull();
    expect(openLinkQuery("[[Oak\nmore", 10)).toBeNull();
    expect(openLinkQuery("no link here", 5)).toBeNull();
  });
});
