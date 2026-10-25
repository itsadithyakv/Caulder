import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import { readCapture, type CaptureKind, type Known } from "@shared/capture";
import { secondOpinion } from "@shared/opinion";
import { migrate } from "../db/migrations";
import { examplesFor } from "../services/understand";
import { loadReader, modelFiles, type Reader } from "./embed";

/**
 * How well the quick line reads lines it was not written against
 * (PLAN.md, part eight, phase 31).
 *
 * Three sets of ninety-six lines a founder might type, each labelled with the
 * kind a person would call it. Each was written by a second model that was
 * given the six kinds in plain words and was not shown the rules - nearer to
 * blind than anything the author of the rules could write, and not the same
 * as a founder's own.
 *
 *  - **`blind-2026-10-a.json` and `-b.json` have been looked at.** Their
 *    misses were read and the rules changed for the classes of them - the
 *    first before the second was measured, the second on 11 October 2026
 *    after it had given the line its first honest number (53 of 96). What
 *    they score now is how far those changes went, and nothing more.
 *  - **`blind-2026-10-c.json` is held out.** It was written by another
 *    writer after the rules were changed, and measured once. Its lines have
 *    not been read by whoever writes the rules, and its misses are not
 *    printed. It is the number to believe.
 *
 * **Two rules about these files, or they stop measuring anything:**
 *
 *  1. A set is not edited to make a line pass. A label that is plainly wrong
 *     is argued in STATUS.md, not changed here.
 *  2. Once a held-out set's misses are read and the rules changed for them,
 *     it has been looked at too: mark it so below, and have a new one written
 *     before the next number is believed.
 *
 * The floors are what was measured on 11 October 2026 - and, for the held-out
 * set, again on 14 October after PLAN.md part twelve (71 and 75, from 68 and
 * 72; its misses still unread). They are there so a
 * change that makes the line worse fails the gate; they are not a target. Run
 * with CAULDER_EVAL=1 to print the totals, and the misses of the sets that
 * have been looked at.
 */

type Row = { line: string; kind: CaptureKind; hard: boolean; why: string };

const WRITTEN = [
  { file: "blind-2026-10-a.json", name: "The first set", heldOut: false, floor: { rules: 93, withModel: 93 } },
  // 89, from 90, on 25 October 2026: "the co-working membership renews on the 5th and costs 9k a
  // month" was written as a memory, and is kept as a running cost on the 5th now, as the owner
  // asked (renewalIn). The set is left as it was written.
  { file: "blind-2026-10-b.json", name: "The second set", heldOut: false, floor: { rules: 89, withModel: 89 } },
  { file: "blind-2026-10-c.json", name: "The held-out set", heldOut: true, floor: { rules: 71, withModel: 75 } },
].map((set) => ({ ...set, written: JSON.parse(readFileSync(join(import.meta.dirname, set.file), "utf8")) as Row[] }));

const said = (row: Row) => row.line.toLowerCase().trim();
/**
 * What each set is measured on. A held-out set is measured only on lines no
 * set that has been looked at already has: the third set's writer wrote three
 * of the first set's lines again, word for word, and those are not unseen.
 * They are left in the file - a set is not edited - and left out of the count.
 */
const SETS = WRITTEN.map((set) => {
  const seen = new Set(WRITTEN.filter((other) => !other.heldOut).flatMap((other) => other.written.map(said)));
  return { ...set, rows: set.heldOut ? set.written.filter((row) => !seen.has(said(row))) : set.written };
});

/** What the app knew when the lines were written: the sample company's contacts, and five pages. */
const KNOWN: Known = {
  contacts: [
    { id: "c1", name: "Greenline Physio", person: null },
    { id: "c2", name: "Studio Palma", person: "Lucía Ortega" },
    { id: "c3", name: "Kettle & Crumb Bakery", person: "Priya Nair" },
    { id: "c4", name: "Harbour Coffee Roasters", person: "Maya Ellis" },
    { id: "c5", name: "Nordlys Design", person: "Jonas Berg" },
    { id: "c6", name: "Fieldnote Books", person: "Sam Okafor" },
    { id: "c7", name: "Atlas Fitness", person: "Dana Kim" },
    { id: "c8", name: "Brightside Tutoring", person: null },
  ],
  pages: [
    { id: "p1", title: "Pricing", section: "products" },
    { id: "p2", title: "Onboarding a client", section: "playbooks" },
    { id: "p3", title: "Company profile", section: "company" },
    { id: "p4", title: "Things to remember", section: "remembered" },
    { id: "p5", title: "Suppliers", section: "tools" },
  ],
};

/** Monday 12 October 2026, mid-morning: the day the lines were written for. */
const CLOCK = { today: "2026-10-12", now: 10 * 60 + 30 };

const KINDS = ["task", "contact", "memory", "command", "idea", "note"] as const;

function report(name: string, rows: readonly Row[], read: (row: Row) => CaptureKind, heldOut: boolean): number {
  const misses = rows.map((row) => ({ row, got: read(row) })).filter((each) => each.got !== each.row.kind);
  const right = rows.length - misses.length;
  if (process.env["CAULDER_EVAL"]) {
    const hard = rows.filter((row) => row.hard);
    const hardRight = hard.length - misses.filter((each) => each.row.hard).length;
    const lines = [
      `${name}: ${right} of ${rows.length} (${Math.round((right / rows.length) * 100)}%). Hard lines: ${hardRight} of ${hard.length}; the rest: ${right - hardRight} of ${rows.length - hard.length}.`,
      ...KINDS.map((kind) => {
        const of = rows.filter((row) => row.kind === kind);
        return `  ${kind}: ${of.length - misses.filter((each) => each.row.kind === kind).length} of ${of.length}`;
      }),
      // What a held-out set got wrong is counted by kind and never shown: reading it is what spends it.
      ...(heldOut
        ? KINDS.flatMap((kind) => {
            const as = misses.filter((each) => each.row.kind === kind).map((each) => each.got);
            return as.length > 0 ? [`  - ${kind} read as: ${[...new Set(as)].map((got) => `${got} x${as.filter((each) => each === got).length}`).join(", ")}`] : [];
          })
        : misses.map((each) => `  - wanted ${each.row.kind}, read ${each.got}${each.row.hard ? " (hard)" : ""}: ${each.row.line}`)),
    ];
    // warn, not log: it is the one console call the lint rules let a test make.
    console.warn(lines.join("\n"));
  }
  return right;
}

describe("the line, on lines it was not written against", () => {
  it("has three sets of ninety-six, in the six kinds, with no line in any twice or in two", () => {
    for (const set of SETS) {
      expect(set.written, set.file).toHaveLength(96);
      expect([...new Set(set.rows.map((row) => row.kind))].sort(), set.file).toEqual([...KINDS].sort());
    }
    const every = SETS.flatMap((set) => set.rows.map(said));
    expect(new Set(every).size).toBe(every.length);
    // The held-out set, less the three lines the first set already had.
    expect(SETS.map((set) => set.rows.length)).toEqual([96, 96, 93]);
  });

  for (const set of SETS) {
    it(`reads ${set.name.toLowerCase()} by the rules alone, no worse than the day it was measured`, () => {
      const right = report(`${set.name}, by the rules`, set.rows, (row) => readCapture(row.line, KNOWN, CLOCK).kind, set.heldOut);
      if (process.env["CAULDER_EVAL"]) {
        // A sum that was not said to be spent is offered as a chip and never assumed, so it is
        // counted as a miss above; this says how many of the misses the person was one press from.
        const offered = set.rows.filter((row) => {
          const reading = readCapture(row.line, KNOWN, CLOCK);
          return row.kind === "command" && reading.kind !== "command" && reading.spend !== null;
        }).length;
        console.warn(`  ${set.name}: ${offered} of the commands not read as one were offered as a spend to press.`);
      }
      expect(right).toBeGreaterThanOrEqual(set.floor.rules);
    });
  }
});

const FOLDER = join(process.cwd(), "resources", "model");
const here = existsSync(modelFiles(FOLDER).model) && existsSync(modelFiles(FOLDER).vocab);

describe.skipIf(!here)("the line with the model's second opinion", () => {
  let reader: Reader;
  beforeAll(async () => {
    reader = await loadReader(FOLDER);
  });
  afterAll(async () => {
    await reader?.release();
  });

  for (const set of SETS) {
    it(`reads ${set.name.toLowerCase()} no worse than the day it was measured`, async () => {
      // A new company: nothing of its own to compare a line with, only what ships.
      const db = new Database(":memory:");
      migrate(db);
      const kinds = new Map<string, CaptureKind>();
      for (const row of set.rows) {
        const reading = readCapture(row.line, KNOWN, CLOCK);
        const examples = reading.soft ? await examplesFor(db, (texts) => reader.read(texts), [], row.line) : [];
        kinds.set(row.line, secondOpinion(reading, examples).kind ?? reading.kind);
      }
      const right = report(`${set.name}, with the model`, set.rows, (row) => kinds.get(row.line) as CaptureKind, set.heldOut);
      expect(right).toBeGreaterThanOrEqual(set.floor.withModel);
    }, 120_000);
  }
});
