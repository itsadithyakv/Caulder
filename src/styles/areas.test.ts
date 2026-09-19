import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The four area colours tell four identities apart, on either face.
 *
 * They were first picked by eye, and failed: the company dot followed the
 * accent, which on the personal face is coffee, and sat 5.6 from a caramel
 * "personal" in OKLab - under a third of what full colour vision needs to
 * tell two dots apart. The screen looked fine until two of them were side by
 * side. These are the two hard gates from the data-viz palette check, run on
 * every surface the dots can land on, so a later edit cannot undo it quietly.
 */

const css = readFileSync(join(import.meta.dirname, "tokens.css"), "utf8").replace(
  /\/\*[\s\S]*?\*\//g,
  "",
);

function block(needle: string): Map<string, string> {
  const at = css.indexOf(needle);
  if (at === -1) throw new Error(`missing block ${needle}`);
  let depth = 0;
  const open = css.indexOf("{", at);
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === "{") depth += 1;
    if (css[i] === "}" && --depth === 0) {
      const body = css.slice(open + 1, i);
      return new Map([...body.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1] ?? "", (m[2] ?? "").trim()]));
    }
  }
  throw new Error(`unbalanced ${needle}`);
}

const light = block(":root {");
const dark = block(':root[data-theme="dark"]');
const personalLight = block(':root[data-face="personal"] {');
const personalDark = block(':root[data-face="personal"][data-theme="dark"]');

const AREAS = ["--area-college", "--area-company", "--area-personal", "--area-health"];

function hex(value: string | undefined): string {
  if (!value || !/^#[0-9a-f]{6}$/i.test(value)) throw new Error(`not a hex: ${value}`);
  return value;
}

function linear(h: string): [number, number, number] {
  const channel = (i: number) => {
    const s = parseInt(h.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return [channel(0), channel(1), channel(2)];
}

function oklab(h: string): [number, number, number] {
  const [r, g, b] = linear(h);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** OKLab distance x100, the scale the palette check uses. */
function deltaE(a: string, b: string): number {
  const [l1, a1, b1] = oklab(a);
  const [l2, a2, b2] = oklab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2) * 100;
}

function contrast(a: string, b: string): number {
  const lum = (h: string) => {
    const [r, g, bl] = linear(h);
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const MODES = [
  {
    name: "light",
    colours: AREAS.map((token) => hex(light.get(token))),
    surfaces: { work: hex(light.get("--surface")), personal: hex(personalLight.get("--surface")) },
  },
  {
    name: "dark",
    colours: AREAS.map((token) => hex(dark.get(token))),
    surfaces: { work: hex(dark.get("--surface")), personal: hex(personalDark.get("--surface")) },
  },
];

describe.each(MODES)("the area colours in $name", ({ name: mode, colours, surfaces }) => {
  it("keeps every pair at least 15 apart, which is what full colour vision needs", () => {
    for (let i = 0; i < colours.length; i += 1) {
      for (let j = i + 1; j < colours.length; j += 1) {
        const a = colours[i] ?? "";
        const b = colours[j] ?? "";
        expect(deltaE(a, b), `${AREAS[i]} against ${AREAS[j]}`).toBeGreaterThanOrEqual(15);
      }
    }
  });

  it.each(Object.entries(surfaces))("holds 3:1 against the %s surface", (_face, surface) => {
    for (const [index, colour] of colours.entries()) {
      expect(contrast(colour, surface), AREAS[index]).toBeGreaterThanOrEqual(3);
    }
  });

  it("does not borrow the accent, which changes with the workspace", () => {
    // A dot that takes whatever colour the workspace is could never be checked
    // against the other three.
    for (const token of AREAS) {
      const source = (mode === "light" ? light : dark).get(token) ?? "";
      expect(source).not.toMatch(/var\(/);
    }
  });
});

