import { beforeEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import { migrate } from "../db/migrations";
import { createCompany } from "../repositories/companies";
import { createLead } from "../repositories/leads";
import { createPage } from "../repositories/brain";
import { leadInput } from "@shared/domain";
import { normalise, toBytes } from "@shared/understand";
import { queueSize, vectorCount } from "../repositories/vectors";
import { examplesFor, forgetSeeds, leaveLoose, looseEnds, memoriesByMeaning, nearestTo, readEverythingAgain, readQueued, relatedTo, setUnderstanding, startUnderstanding, stopUnderstanding, understandState, understandingOn, type Read } from "./understand";
import { allMemories, moveMemories, takeBackSaidAgain } from "./memories";
import { MODEL } from "@shared/understand";

/**
 * The queue worked through with a stand-in for the model: one that turns a
 * line into a vector by which of a few words it has, so "near" is something a
 * test can say. What is checked is Caulder's half - what is read, when, and
 * what is kept - not the model's.
 */

const WORDS = ["coffee", "gym", "school", "guitar"];
const asked: string[][] = [];
const read: Read = async (lines) => {
  asked.push([...lines]);
  return lines.map((line) => toBytes(normalise(Float32Array.from(WORDS, (word) => (line.toLowerCase().includes(word) ? 1 : 0.01)))));
};

let db: Database.Database;
let home: string;
const NOW = "2026-09-26T10:00:00.000Z";

beforeEach(() => {
  asked.length = 0;
  forgetSeeds();
  db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrate(db);
  home = createCompany(db, { name: "Me", accent: "coffee", timezone: "Asia/Kolkata", kind: "personal" }).id;
});

describe("the queue", () => {
  it("is read in passes, and nothing is read twice that has not changed", async () => {
    const coffee = createPage(db, home, { section: "ideas", template: "page", title: "Coffee", body: "- **Beans** · ethiopian coffee _(2026-09-20)_" }, NOW);
    createLead(db, home, leadInput.parse({ name: "Oakridge School" }));
    expect(await readQueued(db, read)).toBe(2);
    expect(queueSize(db)).toBe(0);
    expect(vectorCount(db, MODEL)).toBe(3);

    // Saved again with the same words: queued, and read without asking the model.
    db.prepare(`UPDATE brain_pages SET title = title WHERE id = ?`).run(coffee);
    asked.length = 0;
    expect(await readQueued(db, read)).toBe(1);
    expect(asked).toEqual([]);
  });

  // Quitting while a pass was reading: the model was killed under it, the pass
  // scheduled another anyway, and that one started a fresh model as the app
  // quit - so the process never went.
  it("schedules nothing more once stopped, even from a pass still reading", async () => {
    vi.useFakeTimers();
    try {
      createLead(db, home, leadInput.parse({ name: "Oakridge School" }));
      let calls = 0;
      let finish: () => void = () => undefined;
      const slow: Read = (lines) => {
        calls += 1;
        return new Promise((resolve) => {
          finish = () => resolve(lines.map(() => toBytes(normalise(Float32Array.from(WORDS, () => 1)))));
        });
      };
      startUnderstanding(() => db, slow, () => true);
      await vi.advanceTimersByTimeAsync(20_000);
      expect(calls).toBe(1);
      stopUnderstanding();
      finish();
      createLead(db, home, leadInput.parse({ name: "Harbour Coffee" }));
      await vi.advanceTimersByTimeAsync(120_000);
      expect(calls).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("finds the nearest in meaning, of the kinds asked for", async () => {
    createPage(db, home, { section: "ideas", template: "page", title: "Gym", body: "Push pull legs." }, NOW);
    createPage(db, home, { section: "ideas", template: "page", title: "Coffee", body: "Pour over." }, NOW);
    await readQueued(db, read);
    const found = await nearestTo(db, read, [home], "a new coffee grinder", { kinds: ["page"], most: 1 });
    expect(found).toHaveLength(1);
    expect(found[0]?.kind).toBe("page");
    const page = db.prepare(`SELECT title FROM brain_pages WHERE id = ?`).get(found[0]!.sourceId) as { title: string };
    expect(page.title).toBe("Coffee");
  });
});

describe("the switch", () => {
  it("is on until switched off, and says how far reading has got", () => {
    expect(understandingOn(db)).toBe(true);
    setUnderstanding(db, false);
    expect(understandState(db, true)).toEqual({ on: false, here: true, read: 0, waiting: 0 });
    setUnderstanding(db, true);
    expect(understandingOn(db)).toBe(true);
  });
});

describe("the line's neighbours", () => {
  it("are what was filed, with the pages it is on - never a contact", async () => {
    const work = createCompany(db, { name: "Unifloe", accent: "blue", timezone: "Asia/Kolkata" }).id;
    createPage(db, home, { section: "ideas", template: "page", title: "Coffee", body: "- **Beans** · ethiopian coffee _(2026-09-20)_" }, NOW);
    createPage(db, work, { section: "plan", template: "page", title: "Coffee plan", body: "Coffee for the office." }, NOW);
    createLead(db, work, leadInput.parse({ name: "Coffee Roasters" }));
    while ((await readQueued(db, read)) > 0);

    const examples = await examplesFor(db, read, [home, work], "a new coffee grinder");
    const own = examples.filter((each) => each.own);
    expect(own.map((each) => [each.kind, each.page?.title])).toEqual(expect.arrayContaining([[null, "Coffee"], ["memory", "Coffee"]]));
    // Any page of the brain is somewhere a memory can go.
    expect(own.some((each) => each.page?.title === "Coffee plan")).toBe(true);
    expect(own).toHaveLength(3);
    // And the seeds, every one, for a machine with little of its own.
    expect(examples.filter((each) => !each.own).length).toBeGreaterThan(50);
  });
});

describe("said again (phase 21)", () => {
  it("marks an older memory said again in other words, never one with other numbers, and takes the mark back", async () => {
    // The stand-in reads by keyword, so each pair below is as alike as it gets (1.0): what decides is the rule.
    createPage(db, home, {
      section: "ideas",
      template: "page",
      title: "Gym",
      // No shared lead: "PR:" on both would make the older earlier by its key, the rule that was there first.
      body: "- bench 60 kg at the gym _(2026-09-20)_\n- deadlift 100 kg at the gym _(2026-09-21)_",
    }, NOW);
    const coffee = createPage(db, home, {
      section: "ideas",
      template: "page",
      title: "Beans",
      body: "- ethiopian coffee is fruity _(2026-09-20)_\n- coffee from ethiopia tastes of fruit _(2026-09-22)_",
    }, NOW);
    while ((await readQueued(db, read)) > 0);

    const { memories } = allMemories(db, home);
    const said = (words: string) => memories.find((memory) => memory.says.includes(words));
    expect(said("bench")?.current).toBe(true);
    expect(said("deadlift")?.current).toBe(true);
    expect(said("ethiopian coffee")).toMatchObject({ current: false, earlierBy: "model" });
    expect(said("coffee from ethiopia")?.current).toBe(true);

    // Not the same: current again, and not marked again when the page is read again.
    takeBackSaidAgain(db, { pageId: coffee, raw: said("ethiopian coffee")!.raw });
    readEverythingAgain(db);
    while ((await readQueued(db, read)) > 0);
    expect(allMemories(db, home).memories.find((memory) => memory.says.includes("ethiopian coffee"))?.current).toBe(true);
  });
});

describe("recall by meaning (phase 21)", () => {
  it("finds a memory that shares no word with the question", async () => {
    createPage(db, home, { section: "ideas", template: "page", title: "Beans", body: "- ethiopian coffee is fruity _(2026-09-20)_" }, NOW);
    while ((await readQueued(db, read)) > 0);
    // "Brew" is not in the memory; the stand-in reads the question's "coffee" as the memory's.
    const found = await memoriesByMeaning(db, read, home, "what coffee do i brew");
    expect(found.map((memory) => memory.says)).toEqual(["ethiopian coffee is fruity"]);
  });
});

describe("near in meaning (phase 21)", () => {
  it("offers pages near a page by what is on them, and leaves out what is already linked", async () => {
    const coffee = createPage(db, home, { section: "ideas", template: "page", title: "Coffee", body: "Pour over, most mornings." }, NOW);
    createPage(db, home, { section: "ideas", template: "page", title: "Beans", body: "- ethiopian coffee is fruity _(2026-09-20)_" }, NOW);
    createPage(db, home, { section: "ideas", template: "page", title: "Gym", body: "Push pull legs at the gym." }, NOW);
    createPage(db, home, { section: "ideas", template: "page", title: "Coffee shop", body: `Like [[Coffee|page:${coffee}]], but a shop.` }, NOW);
    while ((await readQueued(db, read)) > 0);

    const near = relatedTo(db, coffee);
    expect(near.map((each) => each.title)).toContain("Beans");
    expect(near.find((each) => each.title === "Beans")?.why).toBe("ethiopian coffee is fruity");
    // Linked already: not offered again.
    expect(near.map((each) => each.title)).not.toContain("Coffee shop");
    expect(near.map((each) => each.title)).not.toContain("Gym");
  });
});

describe("loose ends (phase 21)", () => {
  it("offers a loose memory to the page it clearly belongs on, moves it on a yes, and leaves alone what was left", async () => {
    const pile = createPage(db, home, {
      section: "ideas",
      template: "page",
      title: "Things to remember",
      body: "- ethiopian coffee is fruity _(2026-09-20)_\n- honey never spoils _(2026-09-21)_",
    }, NOW);
    const coffee = createPage(db, home, { section: "ideas", template: "page", title: "Coffee", body: "Pour over." }, NOW);
    createPage(db, home, { section: "ideas", template: "page", title: "Gym", body: "Push pull legs." }, NOW);

    const offered = await looseEnds(db, read, home);
    // Honey is as near to one page as to the other: not offered anywhere.
    expect(offered).toEqual([
      {
        to: { pageId: coffee, title: "Coffee" },
        lines: [{ pageId: pile, pageTitle: "Things to remember", raw: "- ethiopian coffee is fruity _(2026-09-20)_", says: "ethiopian coffee is fruity" }],
      },
    ]);

    moveMemories(db, { to: coffee, lines: offered[0]!.lines.map(({ pageId, raw }) => ({ pageId, raw })) }, new Date(NOW));
    const pages = db.prepare(`SELECT title, body FROM brain_pages WHERE id IN (?, ?)`).all(pile, coffee) as { title: string; body: string }[];
    const bodyOf = (title: string) => pages.find((page) => page.title === title)?.body ?? "";
    expect(bodyOf("Coffee")).toContain("- ethiopian coffee is fruity _(2026-09-20)_");
    expect(bodyOf("Things to remember")).not.toContain("ethiopian");
    expect(await looseEnds(db, read, home)).toEqual([]);

    // Not these: a line left is never offered again.
    db.prepare(`UPDATE brain_pages SET body = body || ? WHERE id = ?`).run("\n- more coffee thoughts _(2026-09-22)_\n", pile);
    const next = await looseEnds(db, read, home);
    expect(next[0]?.lines).toHaveLength(1);
    leaveLoose(db, next[0]!.lines);
    expect(await looseEnds(db, read, home)).toEqual([]);
  });
});
