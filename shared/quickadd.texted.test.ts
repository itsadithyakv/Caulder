import { describe, it, expect } from "vitest";
import { parseQuick } from "./quickadd";

/**
 * The line, typed the way a text message is: short forms, slips, no "at".
 * Same fixed clock as quickadd.test.ts - Thursday 10 September 2026, ten in
 * the morning.
 */

const NOW = { today: "2026-09-10", now: 10 * 60 };
const parse = (text: string, answers = {}) => parseQuick(text, NOW, answers);

describe("typed the way it would be texted", () => {
  it("reads the line this was built for", () => {
    const { task, notes } = parse("meetining today 4 with rahul from ms puc for unifloe");
    expect(task).toMatchObject({
      title: "Meeting with rahul from ms puc for unifloe",
      day: "2026-09-10",
      time: "16:00",
      kind: "meeting",
    });
    expect(notes.join(" ")).toContain("Read “meetining” as meeting.");
  });

  it.each([
    ["mtg w rahul nxt wk", "Meeting with rahul", "2026-09-17"],
    ["ask u abt pricing tmrw", "Ask you about pricing", "2026-09-11"],
    ["gotta submit the form b4 mon", "Submit the form", "2026-09-13"],
    ["pay rent tomoz", "Pay rent", "2026-09-11"],
    ["call mom todya", "Call mom", "2026-09-10"],
    ["gym sundy", "Gym", "2026-09-13"],
    ["meeting day after", "Meeting", "2026-09-12"],
    ["1. call mom tmrw", "Call mom", "2026-09-11"],
    ["rmb to call mom tmrw", "Call mom", "2026-09-11"],
    ["remnd me to call mom tmrw", "Call mom", "2026-09-11"],
  ])("reads '%s'", (text, title, day) => {
    expect(parse(text).task).toMatchObject({ title, day });
  });

  it("leaves 'the day after the exam' about the exam", () => {
    expect(parse("revise the day after the exam").task.day).toBeNull();
  });

  it("never mends a name it was not built to know, or a word that is a word", () => {
    // Unifloe is a company, and a slip at nothing at all.
    expect(parse("deck for unifloe friday").task.title).toBe("Deck for unifloe");
    expect(parse("contact the vendor friday").task.title).toBe("Contact the vendor");
    expect(parse("camping trip friday").task.title).toBe("Camping trip");
    expect(parse("check in with oakridge monday").task.title).toBe("Check in with oakridge");
  });

  it("mends the first word of a line, capital or not, and no other capital", () => {
    expect(parse("Meetining tmrw 3pm").task.title).toBe("Meeting");
    expect(parse("call Meetining tmrw").task.title).toBe("Call Meetining");
  });
});

describe("times, however they are typed", () => {
  it.each([
    ["lecture 430pm", "16:30"],
    ["lecture at 430", "16:30"],
    ["lecture 4;30pm", "16:30"],
    ["lecture at four", "16:00"],
    ["lecture at four thirty", "16:30"],
    ["lecture four pm", "16:00"],
    ["lecture 5ish", "17:00"],
    ["lecture at midnite", "00:00"],
    ["lecture tmrw eve at 6", "18:00"],
  ])("reads '%s' as %s", (text, time) => {
    const { task } = parse(text);
    expect(task.time).toBe(time);
    expect(task.title).toBe("Lecture");
  });

  it("reads a bare hour after a day when the sentence carries on", () => {
    expect(parse("lecture today 4 with rahul").task).toMatchObject({ title: "Lecture with rahul", time: "16:00" });
  });

  it("takes 'sharp' with the time it was said about", () => {
    expect(parse("standup at 5 sharp").task).toMatchObject({ title: "Standup", time: "17:00" });
  });

  it("reads a range with the day after it, but not a count", () => {
    expect(parse("lecture 4 to 6 tmrw").task).toMatchObject({ time: "16:00", minutes: 120, day: "2026-09-11" });
    expect(parse("problems 4 to 6 tmrw").task).toMatchObject({ title: "Problems 4 to 6", time: null });
  });

  it("reads the hour after a day it had to mend", () => {
    expect(parse("gym firday 5 with sam").task).toMatchObject({ title: "Gym with sam", day: "2026-09-11", time: "17:00" });
    expect(parse("call mom tongiht 8").task).toMatchObject({ title: "Call mom", time: "20:00" });
  });

  it("does not read a price, a number word or a count as a time", () => {
    expect(parse("sell at 250 today").task.time).toBeNull();
    expect(parse("look at one option today").task.time).toBeNull();
    expect(parse("read today 4 pages").task.time).toBeNull();
  });

  it("leaves 24/7 in the title", () => {
    expect(parse("24/7 support doc friday").task.title).toBe("24/7 support doc");
  });

  it("reads lengths with the units mistyped", () => {
    expect(parse("revise for 45 minuts tmrw 4pm").task.minutes).toBe(45);
    expect(parse("revise for 2 hourse tmrw 4pm").task.minutes).toBe(120);
    expect(parse("call in half hr").task.time).toBe("10:30");
  });
});

describe("repeats, priorities and tags, mistyped", () => {
  it("reads a mistyped 'every' and 'daily', and a timetable's shorthand", () => {
    expect(parse("gym evry monday 6am").task.repeat?.weekdays).toEqual([1]);
    expect(parse("gym dialy 6am").task.repeat?.weekdays).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(parse("gym MWF 6am").task.repeat?.weekdays).toEqual([1, 3, 5]);
  });

  it("reads a month on its own as the end of it", () => {
    expect(parse("gym every monday 6am until dec").task.repeat?.until).toBe("2026-12-31");
  });

  it.each([
    ["fix bug v imp", "must"],
    ["fix bug very important", "must"],
    ["fix bug urgnt", "must"],
    ["fix bug hi pri", "must"],
    ["fix bug low pri", "spare"],
    ["fix bug not that urgent", "spare"],
  ])("reads '%s' as %s", (text, priority) => {
    const { task } = parse(text);
    expect(task.priority).toBe(priority);
    expect(task.title).toBe("Fix bug");
  });

  it("reads a tag generously, and leaves somebody's own tag alone", () => {
    expect(parse("essay friday #colege").task.area).toBe("college");
    expect(parse("deck friday #wrk").task.area).toBe("company");
    expect(parse("run friday #hea").task.area).toBe("health");
    expect(parse("gig friday #sidegig").task.area).toBe("sidegig");
  });

  it("reads the area from a word with a slip in it, and spells it properly", () => {
    expect(parse("assigment due friday").task).toMatchObject({ title: "Assignment", area: "college" });
    expect(parse("invocie the client friday").task.area).toBe("company");
  });
});

describe("a correction, and taking it back", () => {
  it("says what it mended, so the line can offer to keep the word", () => {
    expect(parse("meetining tmrw").corrections).toEqual([{ typed: "meetining", as: "meeting" }]);
    expect(parse("report firday").corrections).toEqual([{ typed: "firday", as: "friday" }]);
    expect(parse("meeting tmrw").corrections).toEqual([]);
  });

  it("keeps a word as typed once told to", () => {
    const kept = parse("meetining tmrw", { keep: ["meetining"] });
    expect(kept.task.title).toBe("Meetining");
    expect(kept.notes).toEqual([]);
    expect(parse("report firday", { keep: ["firday"] }).task.day).toBeNull();
  });

  it("reads a slip settled in Tune without comment, and never touches one it was told to leave", () => {
    const settled = { ...NOW, learned: { same: { meetimg: "meeting" }, keep: ["firday"] } };
    const same = parseQuick("meetimg tmrw", settled);
    expect(same.task).toMatchObject({ title: "Meeting", kind: "meeting" });
    expect(same.notes).toEqual([]);
    expect(same.corrections).toEqual([]);
    expect(parseQuick("report firday", settled).task.title).toBe("Report firday");
  });

  it("does not mend a word that was taught as one of theirs", () => {
    const taught = { ...NOW, words: [{ word: "invocie", area: "company" }] };
    expect(parseQuick("invocie review friday", taught).task.title).toBe("Invocie review");
  });
});

describe("names it does not know yet", () => {
  it("finds who and what a title names, for Tune to ask about", () => {
    expect(parse("meeting today 4 with rahul from ms puc for unifloe").unknown).toEqual(["rahul", "ms puc", "unifloe"]);
  });

  it("stops at the small words, and asks nothing once the area is known", () => {
    expect(parse("slides for the review friday").unknown).toEqual([]);
    expect(parse("invoice for unifloe friday").unknown).toEqual([]);
    expect(parse("slides for unifloe friday").unknown).toEqual(["unifloe"]);
  });

  it("knows a company by name once it is told the companies", () => {
    const told = { ...NOW, words: [{ word: "Unifloe", area: "company" }] };
    const { task, unknown } = parseQuick("slides for unifloe friday", told);
    expect(task.area).toBe("company");
    expect(unknown).toEqual([]);
  });
});
