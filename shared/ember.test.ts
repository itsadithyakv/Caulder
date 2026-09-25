import { describe, expect, it } from "vitest";
import {
  bother,
  BURNS_AT,
  cooled,
  CROSS_AT,
  cueTrick,
  DANCES,
  danceAt,
  doingAt,
  dressedBefore,
  faceOf,
  hatOf,
  lineMode,
  modeInfo,
  moodOf,
  pokeAt,
  pokeTrick,
  trickAt,
  writingMode,
  type EmberMood,
} from "./ember";

const at = (over: Partial<Parameters<typeof moodOf>[0]> = {}) => ({
  busy: false,
  failed: false,
  justDid: false,
  noticed: false,
  hour: 14,
  ...over,
});

describe("what the line is set to", () => {
  it("falls back to the company flame on anything it does not know", () => {
    // Browser storage from an older version, a hand-edited value, a null.
    expect(lineMode("nonsense")).toBe("work");
    expect(lineMode(null)).toBe("work");
    expect(lineMode("copy")).toBe("copy");
  });

  it("is blue in a personal workspace and orange in a company one", () => {
    expect(writingMode(true)).toBe("life");
    expect(writingMode(false)).toBe("work");
  });

  it("says why each flame is the colour it is, so the tooltip can", () => {
    // The flame test is the whole conceit; if a mode stopped explaining
    // itself the colour would just be decoration.
    expect(modeInfo("copy").detail).toContain("potassium");
    expect(modeInfo("ask").detail).toContain("copper");
  });
});

describe("Ember's mood", () => {
  it("is thinking whenever something is in flight, whatever else is true", () => {
    // The only mood that is a fact rather than a judgement, and the one the
    // person is actually waiting on.
    expect(moodOf(at({ busy: true, failed: true, justDid: true, noticed: true, hour: 3 }))).toBe("thinking");
  });

  it("is sorry before pleased, because a failure is the news", () => {
    expect(moodOf(at({ failed: true, justDid: true }))).toBe("sorry");
  });

  it("is pleased after something worked", () => {
    expect(moodOf(at({ justDid: true }))).toBe("pleased");
  });

  it("notices the pointer even in the small hours", () => {
    // Somebody hovering over her at two in the morning has plainly come to
    // say hello. Snoring through it would be a worse toy than no mascot.
    expect(moodOf(at({ noticed: true, hour: 2 }))).toBe("friendly");
  });

  it("sleeps in the small hours and not before", () => {
    expect(moodOf(at({ hour: 2 }))).toBe("asleep");
    expect(moodOf(at({ hour: 5 }))).toBe("asleep");
    // Not at half past ten. This app is for somebody who works at night on
    // purpose, and a yawning mascot then reads as an opinion about it.
    expect(moodOf(at({ hour: 22 }))).toBe("resting");
    expect(moodOf(at({ hour: 0 }))).toBe("resting");
    expect(moodOf(at({ hour: 6 }))).toBe("resting");
  });
});

describe("what she has on", () => {
  const hat = (mood: EmberMood) => hatOf({ mood, doing: "none" });

  it("wears a nightcap asleep and glasses while she reads", () => {
    expect(hat("asleep")).toBe("nightcap");
    expect(hat("thinking")).toBe("glasses");
  });

  it("takes the glasses off when she has finished reading", () => {
    expect(hat("resting")).toBe("none");
    expect(hat("pleased")).toBe("none");
  });

  it("puts a cap on to go running", () => {
    expect(hatOf({ mood: "resting", doing: "running" })).toBe("cap");
  });

  it("wears nothing in particular for her other pastimes", () => {
    // Three hats, not one per activity. A mascot in a different outfit every
    // twenty seconds is a costume parade, and the point of a hat is that it
    // means something.
    expect(hatOf({ mood: "resting", doing: "reading" })).toBe("none");
    expect(hatOf({ mood: "resting", doing: "warming" })).toBe("none");
    expect(hatOf({ mood: "resting", doing: "stretching" })).toBe("none");
  });

  it("decides by what she is doing and by nothing else", () => {
    // The rule that keeps the wardrobe explicable: every hat can be accounted
    // for by looking at her. There is deliberately no way to ask for a hat
    // because it is Saturday or December - a hat you cannot explain by
    // looking reads as a fault, and this function has no date to read.
    const mood: EmberMood = "resting";
    const doing = "running" as const;
    expect(hatOf({ mood, doing })).toBe(hatOf({ mood, doing }));
    expect(Object.keys({ mood, doing }).sort()).toEqual(["doing", "mood"]);
  });

  it("lets a mood outrank a pastime", () => {
    // Only reachable if a pastime ever outlived its mood. It cannot today -
    // pastimes only run while she is resting - so this states the precedence
    // rather than waiting for somebody to discover it.
    expect(hatOf({ mood: "asleep", doing: "running" })).toBe("nightcap");
  });
});

describe("her own life", () => {
  it("is mostly nothing, so catching her at something is an event", () => {
    expect([0, 1, 2].map(doingAt)).toEqual(["none", "none", "none"]);
  });

  it("comes round one pastime at a time, in order", () => {
    // Counted rather than drawn: a random pick repeats, and a repeat reads
    // as the animation being stuck.
    expect([3, 7, 11, 15, 19, 23, 27, 31, 35, 39, 43, 47, 51, 55, 59].map(doingAt)).toEqual([
      "reading",
      "guitar",
      "tea",
      "cosplay",
      "warming",
      "disco",
      "stretching",
      "running",
      "music",
      "cosplay",
      "moping",
      "skating",
      "tree",
      "mining",
      "reading",
    ]);
  });

  it("never goes from one loud thing straight to another", () => {
    // The order alternates in kind, so a glance up finds something different
    // rather than the same energy with another prop.
    const loud = new Set(["guitar", "disco", "skating", "running", "cosplay", "mining"]);
    const cycle = Array.from({ length: 14 }, (_, n) => doingAt(n * 4 + 3));
    cycle.forEach((one, at) => {
      const next = cycle[(at + 1) % cycle.length] as string;
      expect(loud.has(one) && loud.has(next), `${one} then ${next}`).toBe(false);
    });
  });

  it("mopes one time in fourteen, not more, and dresses up twice", () => {
    const cycle = Array.from({ length: 14 }, (_, n) => doingAt(n * 4 + 3));
    expect(cycle.filter((one) => one === "moping")).toHaveLength(1);
    expect(cycle.filter((one) => one === "cosplay")).toHaveLength(2);
  });

  it("brings out a different costume every time she dresses up", () => {
    // The two dressing-up slots are six apart in twelve. Taking the costume
    // from the slot number would only ever reach every other one; counting
    // the times she has dressed up reaches all of them in turn.
    const dressing = Array.from({ length: 60 }, (_, slot) => slot * 4 + 3).filter((tick) => doingAt(tick) === "cosplay");
    expect(dressing.map(dressedBefore)).toEqual(dressing.map((_, n) => n));
  });

  it("gives the same answer to every flame on the screen", () => {
    // They are one person. Two flames doing different things at once would
    // be two mascots.
    expect(doingAt(7)).toBe(doingAt(7));
  });

  it("does nothing at all for a tick that is not a tick", () => {
    expect(doingAt(-1)).toBe("none");
    expect(doingAt(Number.NaN)).toBe("none");
  });
});

describe("tricks", () => {
  it("finds her head, her belly and her feet", () => {
    expect(pokeAt(0.1)).toBe("head");
    expect(pokeAt(0.5)).toBe("belly");
    expect(pokeAt(0.95)).toBe("feet");
    expect(pokeAt(Number.NaN)).toBe("belly");
  });

  it("answers each place with something different", () => {
    expect(pokeTrick("head", 1, false)).toBe("bonk");
    expect(pokeTrick("belly", 1, false)).toBe("giggle");
    expect(pokeTrick("feet", 1, false)).toBe("trip");
  });

  it("does the costume's own move when poked in the belly in costume", () => {
    expect(pokeTrick("belly", 1, true)).toBe("signature");
    expect(pokeTrick("head", 1, true)).toBe("bonk");
  });

  it("gets dizzy when poked over and over, wherever", () => {
    expect(pokeTrick("head", 5, false)).toBe("dizzy");
    expect(pokeTrick("belly", 9, true)).toBe("dizzy");
  });

  it("does something of her own accord one stretch in four, never beside a pastime", () => {
    const own = Array.from({ length: 16 }, (_, tick) => trickAt(tick));
    own.forEach((trick, tick) => {
      expect(trick !== null, `tick ${tick}`).toBe(tick % 4 === 1);
      if (trick) expect(doingAt(tick)).toBe("none");
    });
    const cycle = Array.from({ length: 28 }, (_, tick) => trickAt(tick)).filter(Boolean);
    expect(cycle).toEqual(["trip", "dance", "wave", "dance", "trip", "flip", "dance"]);
  });

  it("dances for a task and does the whole routine for the last overdue one", () => {
    expect(cueTrick("done")).toBe("dance");
    expect(cueTrick("cleared")).toBe("signature");
  });

  it("goes round every dance she knows before doing one again", () => {
    const seen = Array.from({ length: DANCES.length }, (_, n) => danceAt(n));
    expect(new Set(seen).size).toBe(DANCES.length);
    expect(danceAt(DANCES.length)).toBe(danceAt(0));
    expect(danceAt(-1)).toBe("dab");
  });

  it("knows the ones everybody asks for", () => {
    for (const dance of ["dab", "floss", "sixseven", "moonwalk"] as const) expect(DANCES).toContain(dance);
  });
});

describe("her temper", () => {
  it("adds up, and cools on its own", () => {
    let temper = { heat: 0, at: 0 };
    temper = bother(temper, "chuck", 0);
    temper = bother(temper, "poke", 0);
    expect(cooled(temper, 0)).toBe(3);
    expect(cooled(temper, 4000)).toBe(2);
    expect(cooled(temper, 60_000)).toBe(0);
  });

  it("takes a proper going-over to set her alight", () => {
    // Five throws in a row is somebody doing it on purpose; one or two is
    // somebody playing.
    let temper = { heat: 0, at: 0 };
    for (let n = 0; n < 2; n += 1) temper = bother(temper, "chuck", n * 300);
    expect(cooled(temper, 600)).toBeLessThan(CROSS_AT);
    for (let n = 2; n < 5; n += 1) temper = bother(temper, "chuck", n * 300);
    expect(cooled(temper, 1500)).toBeGreaterThanOrEqual(BURNS_AT);
  });
});

describe("her face", () => {
  it("follows her mood before what she is doing", () => {
    // A pastime only runs while she is resting, so any other mood has already
    // stopped it - and the face has to agree with the mood, not the prop.
    expect(faceOf({ mood: "asleep", doing: "disco" })).toBe("shut");
    expect(faceOf({ mood: "sorry", doing: "tea" })).toBe("sad");
    expect(faceOf({ mood: "friendly", doing: "moping" })).toBe("glad");
    expect(faceOf({ mood: "thinking", doing: "guitar" })).toBe("open");
  });

  it("shuts her eyes for the guitar solo", () => {
    expect(faceOf({ mood: "resting", doing: "guitar" })).toBe("shut");
  });

  it("is happy at the disco, in her headphones and over her tea", () => {
    for (const doing of ["disco", "music", "tea"] as const) {
      expect(faceOf({ mood: "resting", doing }), doing).toBe("glad");
    }
  });

  it("frowns in bed", () => {
    expect(faceOf({ mood: "resting", doing: "moping" })).toBe("sad");
  });

  it("is just her face the rest of the time", () => {
    expect(faceOf({ mood: "resting", doing: "none" })).toBe("open");
    expect(faceOf({ mood: "resting", doing: "reading" })).toBe("open");
  });
});

describe("the cap", () => {
  it("goes on for skating as well as running", () => {
    expect(hatOf({ mood: "resting", doing: "skating" })).toBe("cap");
    expect(hatOf({ mood: "resting", doing: "running" })).toBe("cap");
    expect(hatOf({ mood: "resting", doing: "guitar" })).toBe("none");
  });
});
