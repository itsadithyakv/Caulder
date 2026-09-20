import { describe, expect, it } from "vitest";
import { readPrivate } from "./private";

describe("the lines this was built for", () => {
  it("takes a conversation that meant something as private, and keeps who it was with", () => {
    expect(readPrivate("I spoke to julia today about this, really liked it", false)).toMatchObject({
      feeling: "joy",
      people: ["Julia"],
    });
  });

  it("takes a regret about somebody close as private", () => {
    expect(readPrivate("I did nto like how i spoke to my mum today".replace("nto", "not"), false)).toMatchObject({
      feeling: "regret",
      people: ["Mum"],
    });
  });
});

describe("what is private", () => {
  it.each([
    ["i think i have a crush on sara", "affection"],
    ["cant stop thinking about her", "affection"],
    ["i shouldn't have said that to dad", "regret"],
    ["snapped at my sister again", "regret"],
    ["felt really left out at the party", "hurt"],
    ["we broke up", "hurt"],
    ["cried after the call", "hurt"],
    ["scared i am not good enough for this", "worry"],
    ["had a fight with my brother", "anger"],
    ["had dinner with mum, felt so good", "joy"],
  ])("'%s' is %s", (line, feeling) => {
    expect(readPrivate(line, false)?.feeling).toBe(feeling);
  });

  it("keeps who it was about, by name or by what they are", () => {
    expect(readPrivate("talked to arjun for hours, felt really close", false)?.people).toEqual(["Arjun"]);
    expect(readPrivate("i miss her", false)?.people).toEqual([]);
    expect(readPrivate("argued with my girlfriend, i was unfair", false)?.people).toEqual(["Girlfriend"]);
  });
});

describe("what is not", () => {
  it.each([
    "call mom tomorrow",
    "went to the gym, felt good",
    "shipped the pricing page",
    "spoke to the client about pricing, really liked it",
    "met priya about the deck, felt good",
    "i hit a pr today, 45kg on the bench press",
    "buy a gift for dad's birthday",
    "lunch with mum on sunday",
  ])("'%s' is an ordinary line", (line) => {
    expect(readPrivate(line, false)).toBeNull();
  });

  it("leaves a good conversation with a contact on their history", () => {
    expect(readPrivate("spoke to julia today about this, really liked it", true)).toBeNull();
    // But a crush on one is still nobody's business.
    expect(readPrivate("i think i like her, julia i mean", true)?.feeling).toBe("affection");
  });
});
