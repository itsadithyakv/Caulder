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
