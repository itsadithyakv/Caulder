import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The Map's six dot colours tell six kinds of thing apart, on either theme.
 *
 * The same two gates as the area colours (areas.test.ts): every pair at least
 * 15 apart in OKLab, which is what full colour vision needs to tell two dots
 * apart, and 3:1 against every surface a dot can sit on. The legend on the Map
 * names every colour in words as well, because colour alone is not allowed to
 * mean anything; this is what makes the colour worth having at all.
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

const KINDS = ["--map-page", "--map-contact", "--map-product", "--map-person", "--map-document", "--map-decision"];

const media = block("@media (prefers-color-scheme: dark)");

const MODES = [
  {
    name: "light",
    colours: KINDS.map((token) => hex(light.get(token))),
    surfaces: {
      work: hex(light.get("--surface")),
      sunken: hex(light.get("--surface-sunken")),
      personal: hex(personalLight.get("--surface")),
    },
  },
  {
    name: "dark",
    colours: KINDS.map((token) => hex(dark.get(token))),
    surfaces: {
      work: hex(dark.get("--surface")),
      sunken: hex(dark.get("--surface-sunken")),
      personal: hex(personalDark.get("--surface")),
    },
  },
];

describe.each(MODES)("the map colours in $name", ({ colours, surfaces }) => {
  it("keeps every pair at least 15 apart", () => {
    for (let i = 0; i < colours.length; i += 1) {
      for (let j = i + 1; j < colours.length; j += 1) {
        expect(deltaE(colours[i] ?? "", colours[j] ?? ""), `${KINDS[i]} against ${KINDS[j]}`).toBeGreaterThanOrEqual(15);
      }
    }
  });

  it.each(Object.entries(surfaces))("holds 3:1 against the %s surface", (_name, surface) => {
    for (const [index, colour] of colours.entries()) {
      expect(contrast(colour, surface), KINDS[index]).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("the dark map colours", () => {
  it("are the same whether dark comes from the system or from the switch", () => {
    for (const token of KINDS) expect(media.get(token), token).toBe(dark.get(token));
  });
});
