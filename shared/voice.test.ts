import { describe, expect, it } from "vitest";
import { greet, remembered, taskExample } from "./voice";
import { parseQuick } from "./quickadd";

describe("hello", () => {
  it("uses the first name only", () => {
    expect(greet(9, "Adithyakrishnan Vinod")).toBe("Good morning, Adithyakrishnan.");
    expect(greet(9, "  Adi  ")).toBe("Good morning, Adi.");
  });

  it("reads whole without a name - no stray comma, no gap", () => {
    for (const name of [null, "", "   "]) {
      expect(greet(9, name)).toBe("Good morning.");
      expect(greet(14, name)).toBe("Good afternoon.");
      expect(greet(22, name)).toBe("Good evening.");
    }
  });

  it("knows the hour: nobody is wished a good morning at night", () => {
    const said = [0, 4, 5, 11, 12, 16, 17, 23].map((hour) => greet(hour, null));
    expect(said).toEqual([
      "Good evening.",
      "Good evening.",
      "Good morning.",
      "Good morning.",
      "Good afternoon.",
      "Good afternoon.",
      "Good evening.",
      "Good evening.",
    ]);
  });

  it("says the same thing however often it is asked, and nothing else", () => {
    expect(new Set(Array.from({ length: 50 }, () => greet(10, "Adi"))).size).toBe(1);
  });
});

describe("the example in an empty line", () => {
  function run<T extends { key: string }>(times: number, next: (seen: string[], seed: number) => T): T[] {
    let seen: string[] = [];
    return Array.from({ length: times }, (_, turn) => {
      const said = next(seen, turn * 17 + 5);
      seen = remembered(seen, said.key);
      return said;
    });
  }

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
    expect(parseQuick("call the supplier tmrw 11am", clock).task).toMatchObject({ day: "2026-09-21", time: "11:00" });
    expect(parseQuick("team standup every mon wed fri 10am until dec", clock).task.repeat).toBeTruthy();
    expect(parseQuick("pricing review at 3pm for 30 min", clock).task.minutes).toBe(30);
  });

  it("shows every example once before any of them twice", () => {
    const shown = run(19, taskExample).map((each) => each.says);
    expect(shown[18]).toBe(shown[0]);
  });

  it("remembers most recent last, once each, and not for ever", () => {
    expect(remembered(["a", "b", "c"], "a")).toEqual(["b", "c", "a"]);
    const long = Array.from({ length: 700 }, (_, index) => `line ${index}`);
    expect(remembered(long, "new")).toHaveLength(600);
    expect(remembered(long, "new").at(-1)).toBe("new");
  });
});
