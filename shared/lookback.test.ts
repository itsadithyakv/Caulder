import { describe, expect, it } from "vitest";
import { isOnThisComputer, journalNumbers, numbersText, partsOf, spanStart, type ReadDay } from "./lookback";
import { passcodeStrength } from "./passcode";

describe("looking back", () => {
  it("knows which addresses are this computer, and which are somebody else's", () => {
    expect(isOnThisComputer("http://localhost:11434")).toBe(true);
    expect(isOnThisComputer("http://127.0.0.1:11434")).toBe(true);
    expect(isOnThisComputer("http://[::1]:11434")).toBe(true);
    expect(isOnThisComputer("http://192.168.1.20:11434")).toBe(false);
    expect(isOnThisComputer("https://localhost.example.com")).toBe(false);
    expect(isOnThisComputer("https://api.anthropic.com/v1")).toBe(false);
    expect(isOnThisComputer("not an address")).toBe(false);
  });

  it("starts a span the right number of days back", () => {
    expect(spanStart("month", "2026-09-19")).toBe("2026-08-20");
    expect(spanStart("all", "2026-09-19")).toBeNull();
  });

  it("counts days, words and the mood of each month", () => {
    const days: ReadDay[] = [
      { day: "2026-08-03", mood: "low", text: "one two three" },
      { day: "2026-08-20", mood: "great", text: "four" },
      { day: "2026-09-01", mood: null, text: "five six" },
    ];
    expect(Object.fromEntries(journalNumbers(days))).toEqual({
      "2026-08": { days: 2, words: 4, mood: 3.5 },
      "2026-09": { days: 1, words: 2, mood: null },
    });
    expect(numbersText([])).toBe("");
  });

  it("keeps a short journal in one part, and cuts a long one a month at a time", () => {
    const short: ReadDay[] = [{ day: "2026-09-01", mood: null, text: "A day." }];
    expect(partsOf(short, 1000)).toHaveLength(1);
    const long: ReadDay[] = Array.from({ length: 60 }, (_, index) => ({
      day: `2026-${index < 30 ? "08" : "09"}-${String((index % 30) + 1).padStart(2, "0")}`,
      mood: null,
      text: "word ".repeat(40),
    }));
    const parts = partsOf(long, 3000);
    expect(parts.length).toBeGreaterThan(2);
    expect(parts.every((part) => part.text.length <= 3000)).toBe(true);
    expect(parts[0]?.label).toBe("2026-08");
    expect(parts[1]?.label).toBe("2026-08, part 2");
    // Every day is in exactly one part, in order.
    expect(parts.map((part) => part.text).join("\n\n").match(/^### /gm)).toHaveLength(60);
  });
});

describe("a journal passcode", () => {
  it("needs some length, and a few words is the easy way to get it", () => {
    expect(passcodeStrength("abc")).toMatchObject({ ok: false, label: "Too short" });
    expect(passcodeStrength("12345678")).toMatchObject({ ok: false, label: "Weak" });
    expect(passcodeStrength("password")).toMatchObject({ ok: false });
    expect(passcodeStrength("aaaaaaaaaa")).toMatchObject({ ok: false });
    expect(passcodeStrength("tiger lily")).toMatchObject({ ok: true, label: "Fair" });
    expect(passcodeStrength("tiger lily at dawn")).toMatchObject({ ok: true, label: "Strong" });
    expect(passcodeStrength("Tr0ub4dor&3xyz")).toMatchObject({ ok: true });
  });
});
