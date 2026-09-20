import { describe, expect, it } from "vitest";
import {
  linkLabelsOnly,
  linkTargets,
  linkToken,
  parseLinks,
  refreshLabels,
  unfinishedLinks,
  withLink,
  withoutLink,
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

describe("a link made on the Map", () => {
  const page = { kind: "page" as const, id: PAGE };
  const contact = { kind: "contact" as const, id: CONTACT };
  const pricing = `[[Pricing|page:${PAGE}]]`;
  const oakridge = `[[Oakridge|contact:${CONTACT}]]`;

  it("goes on a line of its own at the foot, and the next one beside it", () => {
    const once = withLink("Ship the pilot.\n", "Pricing", page);
    expect(once).toBe(`Ship the pilot.\n\n${pricing}`);
    expect(withLink(once, "Oakridge", contact)).toBe(`Ship the pilot.\n\n${pricing} · ${oakridge}`);
    expect(withLink("", "Pricing", page)).toBe(pricing);
  });

  it("is not written twice, and does not join a line that has words on it", () => {
    const text = `See ${pricing} first.`;
    expect(withLink(text, "Pricing", page)).toBe(text);
    expect(withLink(text, "Oakridge", contact)).toBe(`${text}\n\n${oakridge}`);
  });

  it("comes out of a line of links with its dot, and the emptied line goes", () => {
    const both = `Notes.\n\n${pricing} · ${oakridge}`;
    expect(withoutLink(both, page)).toBe(`Notes.\n\n${oakridge}`);
    expect(withoutLink(withoutLink(both, page), contact)).toBe("Notes.");
  });

  it("leaves its words behind in a sentence", () => {
    expect(withoutLink(`We agreed with ${oakridge} on ${pricing}.`, contact)).toBe(`We agreed with Oakridge on ${pricing}.`);
    expect(withoutLink("Nothing here.", contact)).toBe("Nothing here.");
  });
});

describe("a link begun and never finished", () => {
  it("is the words after [[, to the end of the line or the first stop", () => {
    expect(unfinishedLinks("They buy the [[Attend\nafter a call")).toEqual([{ start: 13, end: 21, words: "Attend" }]);
    expect(unfinishedLinks("Ask [[Asha]] today.")).toEqual([{ start: 4, end: 12, words: "Asha" }]);
    expect(unfinishedLinks("See [[Oak, then lunch")).toEqual([{ start: 4, end: 9, words: "Oak" }]);
  });

  it("is never a finished link, and nothing without words", () => {
    expect(unfinishedLinks(`[[Pricing|page:${PAGE}]] and [[`)).toEqual([]);
    expect(unfinishedLinks("[[ ]]")).toEqual([]);
  });
});
