import { describe, expect, it } from "vitest";
import { parseInline, parseMarkdown, plainText, toggleTick } from "./markdown";

describe("blocks", () => {
  it("reads headings, paragraphs and rules", () => {
    expect(parseMarkdown("# Plan\n\nWe sell\nto schools.\n\n---")).toEqual([
      { kind: "heading", level: 1, inline: [{ kind: "text", text: "Plan" }] },
      { kind: "paragraph", inline: [{ kind: "text", text: "We sell\nto schools." }] },
      { kind: "rule" },
    ]);
  });

  it("caps headings at three levels", () => {
    expect(parseMarkdown("##### Deep")[0]).toMatchObject({ kind: "heading", level: 3 });
  });

  it("reads lists with tick boxes and remembers each item's line", () => {
    const blocks = parseMarkdown("## Steps\n- [ ] Send the invoice\n- [x] Book the call\n- Plain");
    expect(blocks[1]).toEqual({
      kind: "list",
      ordered: false,
      items: [
        { checked: false, inline: [{ kind: "text", text: "Send the invoice" }], line: 1 },
        { checked: true, inline: [{ kind: "text", text: "Book the call" }], line: 2 },
        { checked: null, inline: [{ kind: "text", text: "Plain" }], line: 3 },
      ],
    });
  });

  it("reads numbered lists, quotes, code and tables", () => {
    const blocks = parseMarkdown(
      "1. One\n2. Two\n\n> They said yes\n\n```\n<b>raw</b>\n```\n\n| Holder | % |\n| --- | --- |\n| Asha | 60 |",
    );
    expect(blocks.map((block) => block.kind)).toEqual(["list", "quote", "code", "table"]);
    expect(blocks[2]).toEqual({ kind: "code", text: "<b>raw</b>" });
    expect(blocks[3]).toMatchObject({
      kind: "table",
      header: [[{ kind: "text", text: "Holder" }], [{ kind: "text", text: "%" }]],
      rows: [[[{ kind: "text", text: "Asha" }], [{ kind: "text", text: "60" }]]],
    });
  });
});

describe("inline", () => {
  it("reads bold, italics and code", () => {
    expect(parseInline("a **big** and _small_ `x`")).toEqual([
      { kind: "text", text: "a " },
      { kind: "strong", children: [{ kind: "text", text: "big" }] },
      { kind: "text", text: " and " },
      { kind: "em", children: [{ kind: "text", text: "small" }] },
      { kind: "text", text: " " },
      { kind: "code", text: "x" },
    ]);
  });

  it("leaves an underscore inside a word, and an unclosed marker, alone", () => {
    expect(parseInline("snake_case_name and 5 * 3")).toEqual([
      { kind: "text", text: "snake_case_name and 5 * 3" },
    ]);
  });

  it("links only to the web", () => {
    expect(parseInline("[site](https://unifloe.in)")).toEqual([
      { kind: "link", href: "https://unifloe.in", children: [{ kind: "text", text: "site" }] },
    ]);
    expect(parseInline("[bad](javascript:alert(1))")).toEqual([
      { kind: "text", text: "[bad](javascript:alert(1))" },
    ]);
    expect(parseInline("[file](file:///C:/x)")[0]).toMatchObject({ kind: "text" });
  });

  it("turns a pasted address into a link, without the full stop after it", () => {
    expect(parseInline("See https://unifloe.in/pricing.")).toEqual([
      { kind: "text", text: "See " },
      {
        kind: "link",
        href: "https://unifloe.in/pricing",
        children: [{ kind: "text", text: "https://unifloe.in/pricing" }],
      },
      { kind: "text", text: "." },
    ]);
  });
});

describe("links into the brain", () => {
  const id = "3f0c1e2a-1111-4222-8333-944455556666";

  it("reads a link by id, with the words it was written with", () => {
    expect(parseInline(`See [[Pricing|page:${id}]] today`)).toEqual([
      { kind: "text", text: "See " },
      { kind: "brainlink", target: "page", id, label: "Pricing" },
      { kind: "text", text: " today" },
    ]);
  });

  it("reads a plain [[name]] as its words, marked as not linked yet", () => {
    expect(parseInline("See [[Pricing]]")).toEqual([
      { kind: "text", text: "See " },
      { kind: "unlinked", text: "Pricing" },
    ]);
  });

  it("keeps only the words in plain text", () => {
    expect(plainText(`See [[Pricing|page:${id}]].`)).toBe("See Pricing.");
  });
});

describe("tick boxes", () => {
  it("flips one line and nothing else", () => {
    const source = "- [ ] One\n- [x] Two\n  - [ ] Three";
    expect(toggleTick(source, 0)).toBe("- [x] One\n- [x] Two\n  - [ ] Three");
    expect(toggleTick(source, 1)).toBe("- [ ] One\n- [ ] Two\n  - [ ] Three");
    expect(toggleTick(source, 2)).toBe("- [ ] One\n- [x] Two\n  - [x] Three");
    expect(toggleTick("Not a list", 0)).toBe("Not a list");
    expect(toggleTick(source, 9)).toBe(source);
  });
});

describe("plain text", () => {
  it("takes the markup off for an excerpt", () => {
    expect(plainText("## Problem\n\n- [ ] **Schools** lose [time](https://x.y)\n> quoted")).toBe(
      "Problem Schools lose time quoted",
    );
  });
});

describe("a link begun and never finished", () => {
  it("reads as its words, not as brackets", () => {
    const [block] = parseMarkdown("They buy the [[Attend");
    expect(block).toEqual({
      kind: "paragraph",
      inline: [
        { kind: "text", text: "They buy the " },
        { kind: "unlinked", text: "Attend" },
      ],
    });
  });
});
