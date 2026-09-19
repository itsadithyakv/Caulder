import { describe, expect, it } from "vitest";
import {
  CALL_TONES,
  callInput,
  callSummary,
  fillScript,
  markFillIns,
  parseScript,
  scriptPreset,
  suggestNext,
  suggestStage,
} from "./calls";
import { parseMarkdown } from "./markdown";

const context = {
  leadName: "Oakridge",
  leadContact: null,
  leadCity: "Bengaluru",
  companyName: "Unifloe",
  myName: "Asha",
  oneLiner: "Attendance that takes itself.",
};

describe("a script's parts", () => {
  it("finds every part a preset writes, for every tone", () => {
    for (const tone of CALL_TONES) {
      const kinds = parseScript(scriptPreset(tone).body).map((part) => part.kind);
      expect(kinds).toEqual(["opening", "reason", "questions", "pitch", "objections", "close", "voicemail"]);
      const parts = parseScript(scriptPreset(tone).body);
      expect(parts.find((part) => part.kind === "questions")?.questions.length).toBeGreaterThanOrEqual(4);
      expect(parts.find((part) => part.kind === "objections")?.objections.length).toBeGreaterThanOrEqual(5);
    }
  });

  it("reads questions and objections out of a script written by hand", () => {
    const parts = parseScript(
      [
        "Remember to smile.",
        "## Discovery",
        "Start broad.",
        "- [ ] Who handles fees?",
        "1. How many students?",
        "## Objections",
        "### “Too expensive”",
        "It pays for itself in a term.",
        "",
        "### Not now",
        "When should I call back?",
        "## Wrap up notes",
        "Anything else.",
      ].join("\n"),
    );
    expect(parts.map((part) => part.kind)).toEqual(["other", "questions", "objections", "other"]);
    expect(parts[1]).toMatchObject({ text: "Start broad.", questions: ["Who handles fees?", "How many students?"] });
    expect(parts[2]?.objections).toEqual([
      { said: "Too expensive", answer: "It pays for itself in a term." },
      { said: "Not now", answer: "When should I call back?" },
    ]);
    expect(parts[3]).toMatchObject({ heading: "Wrap up notes", text: "Anything else." });
  });

  it("has nothing to show for an empty page", () => {
    expect(parseScript("")).toEqual([]);
  });
});

describe("filling a script in", () => {
  it("uses the call's own words, and shows a gap rather than hiding it", () => {
    expect(fillScript("Hi {{lead.greeting}}, {{me.name}} from {{company.name}}. {{company.oneliner}}", context)).toBe(
      "Hi there, Asha from Unifloe. Attendance that takes itself.",
    );
    expect(
      fillScript("May I speak with {{lead.contact}}? {{me.name}}: {{company.oneliner}}", {
        ...context,
        myName: " ",
        oneLiner: null,
      }),
    ).toBe("May I speak with [the person you want]? [your name]: [what you do, in one line]");
  });

  it("marks fill-ins and leaves tick boxes and links alone", () => {
    expect(markFillIns("Try [day] or [day].")).toBe("Try `[day]` or `[day]`.");
    expect(markFillIns("- [ ] ask\n- [x] done")).toBe("- [ ] ask\n- [x] done");
    expect(markFillIns("See [the site](https://x.example) and [[Pricing|page:1]].")).toBe(
      "See [the site](https://x.example) and [[Pricing|page:1]].",
    );
    // What the prompter draws: the fill-in is its own piece of the line.
    const [block] = parseMarkdown(markFillIns("Call on [day]."));
    expect(block).toMatchObject({ kind: "paragraph" });
    expect(JSON.stringify(block)).toContain('"kind":"code","text":"[day]"');
  });
});

describe("what a call records", () => {
  it("keeps interest only for a call where somebody spoke, and drops empty answers", () => {
    const missed = callInput.parse({ leadId: "l", outcome: "no_answer", interest: 4, answers: [{ question: "Q", answer: " " }] });
    expect(missed).toMatchObject({ interest: null, answers: [], dealId: null, next: null });
    expect(missed.keepInMind).toBeUndefined();
    expect(missed.stageId).toBeUndefined();
    expect(callInput.parse({ leadId: "l", outcome: "spoke", interest: 4 }).interest).toBe(4);
    expect(() => callInput.parse({ leadId: "l", outcome: "spoke", interest: 6 })).toThrow();
  });

  it("reads back as one line and the notes", () => {
    expect(callSummary({ outcome: "no_answer", interest: null, notes: "", answers: [], seconds: 20 })).toBe(
      "Didn't pick up",
    );
    expect(
      callSummary({
        outcome: "spoke",
        interest: 4,
        notes: "Wants a demo.",
        answers: [{ question: "How many students?", answer: "900" }],
        seconds: 250,
      }),
    ).toBe("Spoke to them · Interested (4 of 5) · 4 min\n\nWants a demo.\n\nHow many students?\n→ 900");
  });

  it("suggests trying again after a miss, and nothing after a no", () => {
    expect(suggestNext("no_answer", null, "Oakridge")).toEqual({ title: "Call Oakridge again", days: 1 });
    expect(suggestNext("spoke", 5, "Oakridge")).toEqual({ title: "Follow up with Oakridge", days: 2 });
    expect(suggestNext("spoke", 3, "Oakridge")?.days).toBe(7);
    expect(suggestNext("spoke", 1, "Oakridge")).toBeNull();
  });
});

describe("where the deal goes", () => {
  const stages = ["New", "Contacted", "Interested", "Meeting booked", "Won", "Lost"].map((name, position) => ({
    id: name,
    name,
    position,
    kind: name === "Won" ? ("won" as const) : name === "Lost" ? ("lost" as const) : ("open" as const),
  }));

  it("stays put for a call nobody answered", () => {
    expect(suggestStage(stages, "New", "no_answer", null)).toBe("New");
    expect(suggestStage(stages, "New", "wrong_number", null)).toBe("New");
  });

  it("moves on for a conversation, further for interest, and to lost for a no", () => {
    expect(suggestStage(stages, "New", "spoke", 3)).toBe("Contacted");
    expect(suggestStage(stages, null, "spoke", 2)).toBe("Contacted");
    expect(suggestStage(stages, "New", "spoke", 4)).toBe("Interested");
    expect(suggestStage(stages, "Contacted", "spoke", 5)).toBe("Interested");
    expect(suggestStage(stages, "New", "spoke", 1)).toBe("Lost");
  });

  it("never moves backwards or reopens a closed deal", () => {
    expect(suggestStage(stages, "Meeting booked", "spoke", 5)).toBe("Meeting booked");
    expect(suggestStage(stages, "Won", "spoke", 1)).toBe("Won");
    expect(suggestStage(stages, "Lost", "spoke", 5)).toBe("Lost");
  });
});
