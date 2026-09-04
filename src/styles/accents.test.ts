import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ACCENT_IDS } from "@shared/domain";

const tokensCss = readFileSync(join(import.meta.dirname, "tokens.css"), "utf8");

type Preset = { accent: string; strong: string };

/**
 * The accent rules are marked off with @accents comments in tokens.css and
 * read back region by region. Parsing by selector shape instead would be
 * brittle, since a dark rule's selector ends with the same attribute the light
 * one uses.
 */
function region(name: string): string {
  const start = tokensCss.indexOf(`/* @accents:${name} */`);
  expect(start, `missing region marker @accents:${name}`).toBeGreaterThan(-1);

  const rest = tokensCss.slice(start);
  const nextMarker = rest.indexOf("/* @accents:", 1);
  return nextMarker === -1 ? rest : rest.slice(0, nextMarker);
}

function presets(regionName: string): Map<string, Preset> {
  const found = new Map<string, Preset>();
  const pattern = /\[data-accent="([a-z]+)"\][^{]*\{([^}]*)\}/g;

  let match: RegExpExecArray | null;
  const body = region(regionName);

  while ((match = pattern.exec(body)) !== null) {
    const id = match[1];
    const decls = match[2];
    if (!id || !decls) continue;

    const accent = /--accent:\s*([^;]+);/.exec(decls)?.[1]?.trim();
    const strong = /--accent-strong:\s*([^;]+);/.exec(decls)?.[1]?.trim();
    if (accent && strong) found.set(id, { accent, strong });
  }
  return found;
}

const light = presets("light");
const darkSystem = presets("dark-system");
const darkExplicit = presets("dark-explicit");

describe("every accent a company can pick is fully defined", () => {
  // ACCENT_IDS is what the picker offers and what the database stores. An id
  // offered with no CSS behind it silently falls back to the default accent,
  // so the company looks like it did not save.
  it.each([...ACCENT_IDS])("%s has a light preset", (id) => {
    expect(light.has(id)).toBe(true);
  });

  it.each([...ACCENT_IDS])("%s has a dark preset under prefers-color-scheme", (id) => {
    expect(darkSystem.has(id)).toBe(true);
  });

  it.each([...ACCENT_IDS])("%s has a dark preset under [data-theme]", (id) => {
    expect(darkExplicit.has(id)).toBe(true);
  });

  it("defines no accent the app does not offer", () => {
    // A stale preset is dead CSS the picker can never reach.
    expect([...light.keys()].sort()).toEqual([...ACCENT_IDS].sort());
  });
});

describe("the two dark accent copies agree", () => {
  it.each([...ACCENT_IDS])("%s matches across both dark regions", (id) => {
    expect(darkExplicit.get(id)).toEqual(darkSystem.get(id));
  });

  it("uses a different value in dark than in light", () => {
    // A dark rule that repeats the light hex means the accent was never
    // lightened for a dark ground and will fail contrast on --surface.
    for (const id of ACCENT_IDS) {
      expect(darkSystem.get(id)?.accent).not.toBe(light.get(id)?.accent);
    }
  });
});

describe("accents change brand colour and nothing else", () => {
  // Semantic colour must be unreachable from an accent preset, or won and
  // overdue would mean different colours in different companies.
  const FORBIDDEN = ["--ok", "--warn", "--danger", "--info", "--bg", "--ink"];

  const bodies = ["light", "dark-system", "dark-explicit"].flatMap((name) =>
    [...region(name).matchAll(/\[data-accent="[a-z]+"\][^{]*\{([^}]*)\}/g)].map(
      (m) => m[1] ?? "",
    ),
  );

  it("declares only --accent and --accent-strong", () => {
    for (const body of bodies) {
      const declared = [...body.matchAll(/(--[a-z-]+)\s*:/g)].map((m) => m[1]);
      expect(declared.sort()).toEqual(["--accent", "--accent-strong"]);
    }
  });

  it.each(FORBIDDEN)("never touches %s", (token) => {
    for (const body of bodies) {
      expect(body.includes(`${token}:`)).toBe(false);
    }
  });

  it("found the presets at all", () => {
    // Guards against the regexes silently matching nothing, which would make
    // every test above pass vacuously.
    expect(bodies.length).toBe(ACCENT_IDS.length * 3);
  });
});

describe("accents apply beyond the root element", () => {
  // The swatches and the switcher dots each preview a different accent on one
  // screen, so a rule scoped only to :root would leave them all default.
  it("uses a bare attribute selector for the light region", () => {
    expect(region("light")).toMatch(/^\[data-accent="blue"\]/m);
  });

  // Each dark rule needs two selectors: one for the root itself wearing the
  // attribute, and one for a descendant wearing it. Miss the descendant form
  // and every swatch turns the active company's colour in dark mode.
  it.each(["dark-system", "dark-explicit"])("%s covers root and descendant", (name) => {
    const body = region(name);

    for (const id of ACCENT_IDS) {
      const attribute = `\\[data-accent="${id}"\\]`;
      // Root-attached: the attribute is welded to what precedes it, which is
      // the closing paren of :not(...) or a closing bracket.
      expect(body, `${id} has no root selector`).toMatch(
        new RegExp(`[^\\s]${attribute}`),
      );
      // Descendant: the attribute follows whitespace.
      expect(body, `${id} has no descendant selector`).toMatch(
        new RegExp(`\\s${attribute}`),
      );
    }
  });
});
