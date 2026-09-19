import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * One block, one stylesheet.
 *
 * Twice now a new component took a class name another file already owned, and
 * both times every behavioural test passed while the screen was wrong. `.mode`
 * belonged to the funnel picker and the workspace toggle rendered stacked;
 * `.fortnight` belonged to Today's chart, and the Focus chart's bars ran out
 * of their card - while its rules, loading later, quietly restyled Today's
 * chart as well. Nothing but a screenshot caught either.
 *
 * So: a block's own root rule - `.name`, with no element or modifier - may be
 * declared in exactly one stylesheet. Extending a block elsewhere with an
 * element or modifier is allowed; restating its root is how two components
 * end up sharing one.
 */

const DIR = import.meta.dirname;
const sheets = readdirSync(DIR).filter((file) => file.endsWith(".css"));

/** Block names whose bare root rule appears in this stylesheet. */
function rootsIn(css: string): Set<string> {
  const roots = new Set<string>();
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
  // Every selector list that opens a rule.
  for (const match of withoutComments.matchAll(/([^{}]+)\{/g)) {
    for (const part of (match[1] ?? "").split(",")) {
      const selector = part.trim();
      const bare = /^\.([a-z][a-z0-9-]*)(?::[a-z-]+(?:\([^)]*\))?)*$/.exec(selector);
      if (bare?.[1] && !bare[1].includes("--")) roots.add(bare[1]);
    }
  }
  return roots;
}

describe("a block's root rule lives in one stylesheet", () => {
  const owners = new Map<string, string[]>();
  for (const sheet of sheets) {
    for (const root of rootsIn(readFileSync(join(DIR, sheet), "utf8"))) {
      owners.set(root, [...(owners.get(root) ?? []), sheet]);
    }
  }

  it("found blocks to check at all", () => {
    // Guards against the pattern silently matching nothing.
    expect(owners.size).toBeGreaterThan(50);
  });

  it("declares no block root in two files", () => {
    const shared = [...owners.entries()]
      .filter(([, files]) => files.length > 1)
      .map(([block, files]) => `.${block} in ${files.join(" and ")}`);
    expect(shared).toEqual([]);
  });
});

describe("every entrance a component asks for exists", () => {
  // Three dialogs asked for `anim-dialog`, which was never written - the real
  // one is `anim-modal` - so they arrived with no entrance at all. An
  // animation class exists for nothing but its rule, so one without a rule
  // is always a bug, and a silent one.
  const motion = readFileSync(join(DIR, "motion.css"), "utf8");
  const defined = new Set([...motion.matchAll(/\.(anim-[a-z-]+)/g)].map((m) => m[1]));

  const source = join(DIR, "..");
  const files = (readdirSync(source, { recursive: true }) as string[]).filter((file) =>
    file.endsWith(".tsx"),
  );

  it("finds an animation rule for every anim- class in the components", () => {
    const missing: string[] = [];
    for (const file of files) {
      const text = readFileSync(join(source, file), "utf8");
      for (const [name] of text.matchAll(/\banim-[a-z]+(?:-[a-z]+)*\b/g)) {
        if (!defined.has(name)) missing.push(`${name} in ${file}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
