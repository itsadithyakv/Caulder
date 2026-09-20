import { describe, expect, it } from "vitest";
import { aside, clearDay, greet, partOf, remembered, taskExample } from "./voice";
import { parseQuick } from "./quickadd";

const WEDNESDAY = "2026-09-23";
const FRIDAY = "2026-09-25";

/** Open the app over and over, remembering what was said, the way the window does. */
function openings(times: number, moment: { hour: number; day: string; due?: number; late?: number }, name: string | null = "Adithyakrishnan Vinod") {
  let seen: string[] = [];
  const said: string[] = [];
  for (let turn = 0; turn < times; turn += 1) {
    const hello = greet({ ...moment, seen, seed: turn * 31 + 7 });
    seen = remembered(seen, hello.key);
    said.push(hello.say(name));
  }
  return said;
}

describe("hello", () => {
  it("uses the first name only, and the line does not change when the name arrives", () => {
    const said = openings(60, { hour: 9, day: WEDNESDAY, due: 2 });
    expect(said.every((line) => line.includes("Adithyakrishnan"))).toBe(true);
    expect(said.every((line) => !line.includes("Vinod"))).toBe(true);

    const hello = greet({ hour: 9, day: WEDNESDAY, due: 2, seen: [], seed: 4 });
    expect(hello.say("Adi")).toContain("Adi");
    expect(hello.say(null)).toBe(hello.key);
  });

  it("reads whole without a name - no stray comma, no gap, no empty greeting", () => {
    for (const name of [null, "", "   "]) {
      for (const hour of [2, 9, 14, 18, 22]) {
        for (const line of openings(70, { hour, day: WEDNESDAY, late: 1 }, name)) {
          expect(line).toMatch(/^[A-Z].*[.?]$/);
          expect(line).not.toMatch(/^,|\s,|,\s*[.?!]|\s[.?!]|\s{2}/);
          expect(line.length).toBeLessThanOrEqual(48);
        }
      }
    }
  });

  it("does not repeat itself until it has said everything it could", () => {
    const said = openings(40, { hour: 9, day: WEDNESDAY, due: 2 });
    expect(new Set(said).size).toBe(40);

    // Run out, and the first thing said comes round again before anything newer does.
    const all = openings(200, { hour: 9, day: WEDNESDAY, due: 2 });
    const pool = new Set(all).size;
    expect(pool).toBeGreaterThan(50);
    expect(all[pool]).toBe(all[0]);
    expect(all[pool + 1]).toBe(all[1]);
  });

  it("knows the hour: nobody is wished a good morning at night", () => {
    expect(openings(80, { hour: 22, day: WEDNESDAY, due: 1 }).some((line) => /[Mm]orning|Coffee|Fresh page|lunch/.test(line))).toBe(false);
    expect(openings(80, { hour: 8, day: WEDNESDAY, due: 1 }).some((line) => /Good morning/.test(line))).toBe(true);
    expect(openings(80, { hour: 2, day: WEDNESDAY, due: 1 }).some((line) => /Still up/.test(line))).toBe(true);
    expect(openings(80, { hour: 8, day: WEDNESDAY, due: 1 }).some((line) => /Still up|Winding down|Good evening/.test(line))).toBe(false);
    expect([0, 4, 5, 11, 12, 16, 17, 20, 21, 23].map(partOf)).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4, 4]);
  });

  it("knows the day, and the date", () => {
    expect(openings(80, { hour: 10, day: FRIDAY, due: 1 }).some((line) => line.includes("Friday"))).toBe(true);
    expect(openings(80, { hour: 10, day: WEDNESDAY, due: 1 }).some((line) => /Friday|Monday|Sunday|Saturday|Tuesday/.test(line))).toBe(false);
    expect(openings(80, { hour: 10, day: "2027-01-01", due: 1 }).some((line) => /Happy new year/.test(line))).toBe(true);
    expect(openings(80, { hour: 10, day: "2027-01-01", due: 1 }).some((line) => /New month/.test(line))).toBe(false);
    expect(openings(80, { hour: 10, day: "2026-10-01", due: 1 }).some((line) => /New month/.test(line))).toBe(true);
    expect(openings(80, { hour: 10, day: WEDNESDAY, due: 1 }).some((line) => /New month|new year/.test(line))).toBe(false);
  });

  it("looks at the list before it speaks", () => {
    const behind = openings(80, { hour: 10, day: WEDNESDAY, due: 3, late: 2 });
    const clear = openings(80, { hour: 10, day: WEDNESDAY });
    const full = openings(80, { hour: 10, day: WEDNESDAY, due: 8 });
    expect(behind.some((line) => /slipped|catching up/.test(line))).toBe(true);
    expect(clear.some((line) => /Suspicious|Clean slate/.test(line))).toBe(true);
    expect(full.some((line) => /Busy one|Full plate/.test(line))).toBe(true);
    // Never told the list is empty when it is not, or that things slipped when none did.
    expect(full.some((line) => /Suspicious|slipped/.test(line))).toBe(false);
    expect(clear.some((line) => /slipped|Busy one/.test(line))).toBe(false);
  });
});

describe("the aside, and a clear day", () => {
  function run<T extends { key: string }>(times: number, next: (seen: string[], seed: number) => T): T[] {
    let seen: string[] = [];
    return Array.from({ length: times }, (_, turn) => {
      const said = next(seen, turn * 17 + 5);
      seen = remembered(seen, said.key);
      return said;
    });
  }

  it("says every aside once before any of them twice", () => {
    const said = run(200, aside);
    const pool = new Set(said.map((each) => each.key)).size;
    expect(pool).toBeGreaterThan(70);
    expect(new Set(said.slice(0, pool).map((each) => each.key)).size).toBe(pool);
    expect(said[pool]?.key).toBe(said[0]?.key);
  });

  it("keeps an aside to a line or two, and names whose words they are", () => {
    for (const each of run(90, aside)) {
      expect(each.says).toMatch(/[.?!]$/);
      expect(each.says.length).toBeLessThanOrEqual(90);
      if (each.by !== undefined) expect(each.by.length).toBeGreaterThan(3);
    }
    expect(run(90, aside).filter((each) => each.by).length).toBeGreaterThan(15);
  });

  it("has more than a fortnight of clear days in it", () => {
    const said = run(14, clearDay);
    expect(new Set(said.map((each) => each.says)).size).toBe(14);
    for (const each of said) expect(each.says.length).toBeLessThanOrEqual(48);
  });

  it("only ever shows an example the line can really read", () => {
    const shown = run(18, taskExample).map((each) => each.says);
    expect(new Set(shown).size).toBe(18);
    const clock = { today: "2026-09-20", now: 9 * 60 };
    for (const says of shown) {
      const read = parseQuick(says, clock);
      expect(read.task.title.length, says).toBeGreaterThan(2);
      // An example that made the line ask a question back would be teaching the slow way.
      expect(read.questions.map((each) => each.id), says).toEqual([]);
    }
    // And the ones that show off a time, a repeat or a length are read as exactly that.
    expect(parseQuick("call mum tmrw 7pm", clock).task).toMatchObject({ day: "2026-09-21", time: "19:00" });
    expect(parseQuick("gym every mon wed fri 6am until dec", clock).task.repeat).toBeTruthy();
    expect(parseQuick("guitar practice at 8pm for 30 min", clock).task.minutes).toBe(30);
  });

  it("remembers most recent last, once each, and not for ever", () => {
    expect(remembered(["a", "b", "c"], "a")).toEqual(["b", "c", "a"]);
    const long = Array.from({ length: 700 }, (_, index) => `line ${index}`);
    expect(remembered(long, "new")).toHaveLength(600);
    expect(remembered(long, "new").at(-1)).toBe("new");
  });
});
