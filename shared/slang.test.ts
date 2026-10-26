import { describe, expect, it } from "vitest";
import { expand } from "./slang";

describe("short forms, written out", () => {
  it.each([
    ["mtg w rahul nxt wk", "meeting with rahul next week"],
    ["ask u abt pricing", "ask you about pricing"],
    ["gotta call mom b4 fri", "got to call mom before fri"],
    ["lunch w/ priya", "lunch with priya"],
    ["f/u oakridge", "follow up oakridge"],
    ["dont forget the form", "don't forget the form"],
    ["imma finish the deck", "i'm going to finish the deck"],
    ["gym evry monday", "gym every monday"],
    ["fix bug v imp", "fix bug v important"],
  ])("'%s' is '%s'", (typed, said) => {
    expect(expand(typed)).toBe(said);
  });

  it("follows the case it was typed in", () => {
    expect(expand("Mtg with Rahul")).toBe("Meeting with Rahul");
    expect(expand("CALL MOM B4 FRI")).toBe("CALL MOM BEFORE FRI");
  });

  it("reads 'ion' as 'I don't' only in front of what people don't do", () => {
    expect(expand("ion wanna forget the form")).toBe("i don't want to forget the form");
    expect(expand("ion feel great")).toBe("i don't feel great");
    expect(expand("ion exchange lab report")).toBe("ion exchange lab report");
  });

  it("leaves a capital letter that is somebody's initial, or a university", () => {
    expect(expand("U of T application")).toBe("U of T application");
    expect(expand("call W Smith")).toBe("call W Smith");
  });

  it("leaves the short forms that mean two things", () => {
    expect(expand("send the doc to the dr")).toBe("send the doc to the dr");
    expect(expand("buy 2 notebooks 4 class")).toBe("buy 2 notebooks 4 class");
  });

  it("drops what is said around a thought rather than in it", () => {
    expect(expand("btw call the bank").trim()).toBe("call the bank");
  });

  it("leaves punctuation where it was", () => {
    expect(expand("mtg w rahul, nxt wk.")).toBe("meeting with rahul, next week.");
  });
});
