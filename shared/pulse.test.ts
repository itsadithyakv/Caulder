import { describe, expect, it } from "vitest";
import { shiftDay } from "./dates";
import { readPulse, type Checkin, type DayFacts } from "./pulse";

/** Weeks of days ending today, oldest first. Each week is given as seven days of [minutes, mood]. */
const TODAY = "2026-09-20";
type Day = { minutes?: number; mood?: number | null; done?: number; checkin?: Checkin | null };

function history(weeks: Day[][]): DayFacts[] {
  const flat = weeks.flat();
  return flat.map((day, index) => ({
    day: shiftDay(TODAY, index - (flat.length - 1)),
    minutes: day.minutes ?? 0,
    done: day.done ?? 0,
    mood: day.mood ?? null,
    other: 0,
    checkin: day.checkin ?? null,
  }));
}

const week = (minutes: number, mood: number | null = 3.5, quiet = 0): Day[] =>
  Array.from({ length: 7 }, (_each, index) => (index < quiet ? {} : { minutes: Math.round(minutes / (7 - quiet)), mood }));

describe("not enough to go on", () => {
  it("says so, rather than reading four days confidently", () => {
    const pulse = readPulse(history([week(600), week(600)]));
    expect(pulse.enough).toBe(false);
    expect(pulse.notes).toEqual([]);
    expect(pulse.says).toContain("Not enough yet");
  });
});

describe("a steady stretch", () => {
  it("says steady, against their own usual and not anybody else's", () => {
    const pulse = readPulse(history([week(600), week(620), week(580), week(600), week(610)]));
    expect(pulse).toMatchObject({ enough: true, level: "fine" });
    expect(pulse.says).toContain("steady");
    expect(pulse.notes[0]).toBe("10.2 h this week, about your usual 10 h.");
  });

  it("is not alarmed by a big week from somebody whose weeks are big", () => {
    const pulse = readPulse(history([week(3000), week(3100), week(2900), week(3000), week(3050)]));
    expect(pulse.level).toBe("fine");
  });
});

describe("a heavy stretch", () => {
  it("is named as heavy after two heavy weeks, while the days still feel all right", () => {
    const pulse = readPulse(history([week(600), week(600), week(600), week(600), week(900), week(950)]));
    expect(pulse.level).toBe("heavy");
    expect(pulse.notes[0]).toContain("the second heavy week running");
    expect(pulse.says).toContain("heavy stretch");
  });

  it("is carrying a lot when the heavy weeks come with lower days", () => {
    const pulse = readPulse(history([week(600, 4), week(600, 4), week(600, 4), week(600, 4), week(900, 3.5), week(950, 2.4)]));
    expect(pulse.level).toBe("low");
    expect(pulse.notes.join(" ")).toContain("lower than they were: 2.4 of 5 this week, 3.9 before");
    expect(pulse.says).toContain("easier few days");
    // Said as what the weeks look like, never as a finding about the person.
    expect(`${pulse.says} ${pulse.notes.join(" ")}`.toLowerCase()).not.toContain("burnout");
  });

  it("notices lower days on their own, without making the work the culprit", () => {
    const pulse = readPulse(history([week(600, 4), week(600, 4), week(600, 4), week(600, 4), week(600, 2.8)]));
    expect(pulse.level).toBe("fine");
    expect(pulse.says).toContain("days have felt lower");
  });
});

describe("their own limit, learnt", () => {
  it("says nothing about one until it has seen it twice", () => {
    const once = readPulse(history([week(600), week(1200), week(200, 2.2, 4), week(600), week(600), week(600)]));
    expect(once.notes.join(" ")).not.toContain("flat weeks");
  });

  it("finds the weeks that came before the flat ones, and says when this one is about there", () => {
    const pulse = readPulse(
      history([week(600), week(1200), week(200, 2.2, 4), week(600), week(1150), week(150, 2.0, 4), week(600), week(600), week(1180)]),
    );
    expect(pulse.notes.join(" ")).toContain("Your flat weeks have come after weeks of 19.1 h or more, which is about where this one is.");
    expect(pulse.level).not.toBe("fine");
  });
});

describe("quiet days", () => {
  const busy = () => [week(600), week(600), week(600), week(600)];

  it("asks about yesterday when it had nothing on it - of somebody who is here most days", () => {
    const days = history([...busy(), [{ minutes: 60 }, { minutes: 60 }, { minutes: 60 }, { minutes: 60 }, { minutes: 60 }, {}, { minutes: 30 }]]);
    expect(readPulse(days).ask).toBe(shiftDay(TODAY, -1));
  });

  it("does not ask twice, or of somebody who is hardly ever here", () => {
    const answered = history([...busy(), [{ minutes: 60 }, { minutes: 60 }, { minutes: 60 }, { minutes: 60 }, { minutes: 60 }, { checkin: "rested" }, { minutes: 30 }]]);
    expect(readPulse(answered).ask).toBeNull();
    expect(readPulse(history([[{}, {}, {}, {}, {}, {}, { minutes: 30 }]])).ask).toBeNull();
  });

  it("says what they turned out to be, and when it follows the heaviest days", () => {
    const heavyThenScroll: Day[] = [{ minutes: 60 }, { minutes: 400 }, { checkin: "scrolled" }, { minutes: 60 }, { minutes: 420 }, { checkin: "scrolled" }, { minutes: 60 }];
    const pulse = readPulse(history([week(600), week(600), week(600), heavyThenScroll, heavyThenScroll]));
    expect(pulse.notes.join(" ")).toContain("4 of your quiet days lately went to scrolling, 4 of them the day after one of your heaviest.");
  });
});

describe("what they love", () => {
  it("says what gets their time, and when the days with it are better days", () => {
    const weeks = Array.from({ length: 8 }, () =>
      [{ minutes: 60, mood: 4.5 }, { minutes: 60, mood: 3 }, { minutes: 60, mood: 4.5 }, { minutes: 60, mood: 3 }, { minutes: 60, mood: 3 }, { minutes: 60, mood: 3 }, { minutes: 60, mood: 3 }] as Day[],
    );
    const days = history(weeks);
    const guitar = days.filter((_day, index) => index % 7 === 0 || index % 7 === 2).map((day) => day.day);
    const chess = days.slice(0, 5).map((day) => day.day);
    const pulse = readPulse(days, new Map([["Guitar", guitar], ["Chess", chess]]));
    expect(pulse.loves[0]).toBe("Guitar: 16 days in eight weeks, and your days with it are better than your days without (4.5 against 3.0).");
    expect(pulse.loves[1]).toBe("Chess: 5 days in eight weeks.");
  });
});
