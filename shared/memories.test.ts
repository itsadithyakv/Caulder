import { describe, expect, it } from "vitest";
import { comingUp, groupMemories, matches, memoriesOf, onThisDay, recall, resurface, sayComing, type Memory, fuseRecall } from "./memories";

/**
 * Memories read back: the newer answer to the same thing, what comes round,
 * what was kept on this day, and what answers a question.
 */

const page = (id: string, title: string, lines: string[]) =>
  memoriesOf({ id, title, section: "remembered", body: `Part of [[Me|page:me]].\n\n${lines.join("\n")}\n` });

const where = page("w", "Where things are", [
  "- **Parked: level 1, spot A4** · parked on level 1 _(2026-09-01)_",
  "- **Spare key: under the plant pot** · the spare key is under the plant pot _(2026-06-12)_",
  "- **Parked: level 3, spot B12** · i parked on level 3, spot B12 _(2026-09-24)_",
]);
const mummy = page("m", "Mummy", ["- **Birthday: 15 March** · mummy's birthday is on 15 march _(2026-01-02)_"]);
const priya = page("p", "Priya", ["- **Birthday: 27 September** · priya's birthday is 27 sep _(2026-03-01)_", "- **Likes: filter coffee** · priya likes filter coffee _(2025-09-25)_"]);
const all: Memory[] = [...where, ...mummy, ...priya];

describe("the newer answer", () => {
  it("is what is true now; the one before is kept, as earlier", () => {
    expect(where.map((memory) => [memory.fact, memory.current])).toEqual([
      ["Parked: level 1, spot A4", false],
      ["Spare key: under the plant pot", true],
      ["Parked: level 3, spot B12", true],
    ]);
    expect(where[0]?.key).toBe("parked");
  });
});

describe("what comes round", () => {
  it("is the birthdays and anniversaries in the next month, soonest first, into next year when this one has gone", () => {
    expect(comingUp(all, "2026-09-25")).toEqual([{ pageId: "p", pageTitle: "Priya", what: "Birthday", day: "2026-09-27", inDays: 2 }]);
    expect(comingUp(all, "2027-03-10")).toMatchObject([{ pageTitle: "Mummy", day: "2027-03-15", inDays: 5 }]);
    expect(sayComing({ pageId: "p", pageTitle: "Priya", what: "Birthday", day: "2026-09-27", inDays: 2 })).toBe("Priya's birthday is in 2 days");
    expect(sayComing({ pageId: "a", pageTitle: "About me", what: "Anniversary", day: "2026-09-25", inDays: 0 })).toBe("Your anniversary is today");
  });
});

describe("brought back", () => {
  it("is what was kept on this day in an earlier year", () => {
    expect(onThisDay(all, "2026-09-25").map((memory) => memory.fact)).toEqual(["Likes: filter coffee"]);
  });

  it("is a birthday this week first, then the same memory all day", () => {
    expect(resurface(all, "2026-09-25").coming?.pageTitle).toBe("Priya");
    const later = resurface(all, "2026-11-04");
    expect(later.coming).toBeNull();
    expect(later.memory).not.toBeNull();
    expect(resurface(all, "2026-11-04").memory?.raw).toBe(later.memory?.raw);
  });

  it("is nothing for a brain with nothing old enough", () => {
    expect(resurface(page("n", "New", ["- just said _(2026-09-24)_"]), "2026-09-25")).toEqual({ memory: null, coming: null });
  });
});

describe("found again", () => {
  it("answers a question with the current memory first", () => {
    expect(recall(all, "parked")[0]?.fact).toBe("Parked: level 3, spot B12");
    expect(recall(all, "spare key")[0]?.fact).toBe("Spare key: under the plant pot");
    expect(recall(all, "mummys birthday")[0]?.fact).toBe("Birthday: 15 March");
    expect(recall(all, "priya likes")[0]?.fact).toBe("Likes: filter coffee");
    expect(recall(all, "the")).toEqual([]);
  });

  it("matches every word searched for, in any order", () => {
    expect(matches(where[2]!, "b12 level")).toBe(true);
    expect(matches(where[2]!, "level 7")).toBe(false);
    expect(groupMemories(all, "birthday").map((group) => group.pageTitle).sort()).toEqual(["Mummy", "Priya"]);
  });
});

describe("recall by words and by meaning, as one", () => {
  const memory = (says: string, current = true) =>
    ({ pageId: "p", pageTitle: "P", section: "ideas", day: "2026-09-20", fact: null, says, raw: `- ${says}`, key: null, current }) as const;

  it("puts first what both found, keeps what either found, and what is true now before what was", () => {
    const a = memory("parked on level 3");
    const b = memory("parked near gate 2");
    const c = memory("the car is in bay 14");
    const old = memory("parked at the mall", false);
    expect(fuseRecall([a, b, old], [c, b]).map((each) => each.says)).toEqual([
      "parked near gate 2",
      "parked on level 3",
      "the car is in bay 14",
      "parked at the mall",
    ]);
  });
});
