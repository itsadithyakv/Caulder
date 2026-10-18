import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const STYLES_DIR = join(import.meta.dirname, ".");
const tokensCss = readFileSync(join(STYLES_DIR, "tokens.css"), "utf8");

/**
 * Returns the body of the first block whose selector line contains `needle`,
 * matched by counting braces so nested rules do not end it early.
 */
function blockAfter(css: string, needle: string): string {
  const at = css.indexOf(needle);
  if (at === -1) throw new Error(`Selector not found in tokens.css: ${needle}`);

  const open = css.indexOf("{", at);
  if (open === -1) throw new Error(`No opening brace after: ${needle}`);

  let depth = 0;
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === "{") depth += 1;
    else if (css[i] === "}") {
      depth -= 1;
      if (depth === 0) return css.slice(open + 1, i);
    }
  }
  throw new Error(`Unbalanced braces after: ${needle}`);
}

/** Custom-property declarations in a block, as name -> value. Comments stripped. */
function declarations(block: string): Map<string, string> {
  const withoutComments = block.replace(/\/\*[\s\S]*?\*\//g, "");
  const found = new Map<string, string>();
  const pattern = /(--[a-z0-9-]+)\s*:\s*([^;]+);/gi;

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(withoutComments)) !== null) {
    const name = match[1];
    const value = match[2];
    if (name && value) found.set(name, value.trim().replace(/\s+/g, " "));
  }
  return found;
}

const light = declarations(blockAfter(tokensCss, ":root {"));
const darkSystem = declarations(
  blockAfter(tokensCss, ':root:not([data-theme="light"])'),
);
const darkExplicit = declarations(blockAfter(tokensCss, ':root[data-theme="dark"]'));

describe("dark mode is declared twice and the copies agree", () => {
  // The whole point: a token present in only one of the two blocks shows up as
  // a light patch in dark mode for exactly one of the two ways a user can pick
  // dark. This is the bug the convention exists to prevent.
  it("defines the same token names in both dark blocks", () => {
    expect([...darkExplicit.keys()].sort()).toEqual([...darkSystem.keys()].sort());
  });

  it("gives every token the same value in both dark blocks", () => {
    for (const [name, value] of darkSystem) {
      expect(darkExplicit.get(name), `${name} differs between the dark blocks`).toBe(
        value,
      );
    }
  });

  it("only overrides tokens that the light block actually defines", () => {
    for (const name of darkSystem.keys()) {
      expect(light.has(name), `${name} is dark-only; add it to :root too`).toBe(true);
    }
  });
});

describe("theme-dependent tokens are overridden for dark", () => {
  // Anything whose value is a literal colour must be restated for dark. The
  // classic miss is --bg, which in a derived palette silently keeps its light
  // value and leaks a pale page into dark mode.
  const COLOUR_VALUE = /^(#[0-9a-f]{3,8}|rgba?\(|color-mix\()/i;

  const mustOverride = [...light.entries()]
    .filter(([name, value]) => COLOUR_VALUE.test(value) && !name.startsWith("--shadow"))
    .map(([name]) => name);

  it.each(mustOverride)("%s has a dark value", (name) => {
    expect(darkSystem.has(name)).toBe(true);
  });

  it("overrides --bg explicitly", () => {
    expect(darkSystem.get("--bg")).toBeDefined();
    expect(darkSystem.get("--bg")).not.toBe(light.get("--bg"));
  });

  it("overrides every shadow, since relief inverts between themes", () => {
    for (const name of light.keys()) {
      if (!name.startsWith("--shadow")) continue;
      expect(darkSystem.has(name), `${name} has no dark value`).toBe(true);
    }
  });
});

describe("tokens.css is the only place colour is defined", () => {
  const others = readdirSync(STYLES_DIR).filter(
    (file) => file.endsWith(".css") && file !== "tokens.css",
  );

  it.each(others)("%s declares no :root custom property", (file) => {
    const css = readFileSync(join(STYLES_DIR, file), "utf8");
    // A feature stylesheet may position a shared surface; it may not restyle
    // one, and it may never mint a new token.
    const rootBlocks = css.match(/:root[^{]*\{[^}]*--[a-z0-9-]+\s*:/gi);
    expect(rootBlocks, `${file} defines a :root token`).toBeNull();
  });
});

describe("the notebook face is declared like every other colour", () => {
  // The personal blocks sit after the theme blocks at the same specificity, so
  // anything the light personal block sets and a dark one forgets WINS in dark
  // mode: a coffee-cream surface under cream text. The rule the base palette
  // follows, enforced for the face too.
  const personalLight = declarations(blockAfter(tokensCss, ':root[data-face="notebook"] {'));
  const personalDarkSystem = declarations(
    blockAfter(tokensCss, ':root[data-face="notebook"]:not([data-theme="light"])'),
  );
  const personalDarkExplicit = declarations(
    blockAfter(tokensCss, ':root[data-face="notebook"][data-theme="dark"]'),
  );

  /** Radii are the same in both themes on purpose; everything else is colour. */
  const themed = [...personalLight.keys()].filter(
    (name) => !name.startsWith("--radius-") && name !== "--face-wash",
  );

  it("re-declares every themed token in both dark blocks", () => {
    for (const name of themed) {
      expect(personalDarkSystem.has(name), `${name} missing from the system dark block`).toBe(true);
      expect(personalDarkExplicit.has(name), `${name} missing from the explicit dark block`).toBe(true);
    }
  });

  it("gives the two dark copies the same values", () => {
    expect([...personalDarkExplicit.keys()].sort()).toEqual([...personalDarkSystem.keys()].sort());
    for (const [name, value] of personalDarkSystem) {
      expect(personalDarkExplicit.get(name), name).toBe(value);
    }
  });

  it("does not borrow a status colour as decoration", () => {
    // The mistake this palette replaced: the face was mixed from --warn, the
    // amber that means "going cold", which is how it came to look muddy.
    for (const block of [personalLight, personalDarkSystem, personalDarkExplicit]) {
      for (const value of block.values()) {
        expect(value).not.toMatch(/var\(--(warn|danger|ok)/);
      }
    }
  });
});

describe("every variable a stylesheet reads", () => {
  // The legend dots for a block's kind went grey on 11 October 2026: the tokens were
  // renamed with the kinds and two rules went on reading the old names. A variable
  // nobody defines is not an error to a browser; it is no colour at all.
  it("is defined, in the tokens or beside where it is used", () => {
    const sheets = readdirSync(STYLES_DIR)
      .filter((name) => name.endsWith(".css"))
      .map((name) => ({ name, css: readFileSync(join(STYLES_DIR, name), "utf8").replace(/\/\*[\s\S]*?\*\//g, "") }));
    const defined = new Set(sheets.flatMap(({ css }) => [...css.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((match) => match[1])));
    // And what a component sets on its own element: `style={{ "--ring-to": ... }}`.
    const SRC = join(STYLES_DIR, "..");
    for (const file of readdirSync(SRC, { recursive: true, encoding: "utf8" }).filter((name) => name.endsWith(".tsx"))) {
      for (const match of readFileSync(join(SRC, file), "utf8").matchAll(/["'`](--[a-z0-9-]+)["'`]/g)) defined.add(match[1]);
    }
    const undefinedOnes = sheets.flatMap(({ name, css }) =>
      [...css.matchAll(/var\((--[a-z0-9-]+)\s*\)/g)].filter((match) => !defined.has(match[1])).map((match) => `${name}: ${match[1]}`),
    );
    // With a fallback - var(--x, 4px) - it is meant to be set from a component, and is not listed.
    expect(undefinedOnes).toEqual([]);
  });
});

describe("no container has one edge heavier or more coloured than the rest", () => {
  // The owner's rule, 13 October 2026: a card with a thick coloured bar down one side is the look
  // of something generated, and says nothing a tint or a full edge does not. A quotation's bar in
  // written text is the one exception - it is how a quotation is set, not a container.
  const QUOTES = /\.(?:prose__quote|cm-md-quote)\b/;
  it("has no thick border on one side, and no inset bar, in any stylesheet", () => {
    const found: string[] = [];
    for (const name of readdirSync(STYLES_DIR).filter((each) => each.endsWith(".css"))) {
      const css = readFileSync(join(STYLES_DIR, name), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
      for (const rule of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const selector = (rule[1] ?? "").trim();
        const body = rule[2] ?? "";
        if (QUOTES.test(selector)) continue;
        // A drawn triangle is three borders, two of them transparent: not an edge.
        if (/border-(?:top|bottom|left|right):\s*\d+px\s+solid\s+transparent/.test(body)) continue;
        const side = /border-(?:left|right|inline-start|inline-end):\s*([2-9]|\d{2,})px\s+solid\s+(?!transparent)/.exec(body);
        const bar = /box-shadow:[^;]*inset\s+-?[1-9]\d*px\s+0(?:px)?\s+0/.exec(body);
        if (side || bar) found.push(`${name}: ${selector.split("\n").pop()}`);
      }
    }
    expect(found).toEqual([]);
  });
});
