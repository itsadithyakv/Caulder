import { describe, expect, it } from "vitest";
import { readQuestion } from "./questions";
import { readEdit } from "./edits";
import { followOn } from "./followon";
import { together } from "./together";
import { alreadyOpen, clashWith, complete, completionsFrom, readyFor, usualFor } from "./habitual";
import { cleanPaste } from "./pasteline";
import { readCapture } from "./capture";
import type { LastLine, OpenTask, Timed } from "./lines";

/**
 * The quick line meaning what is already there: questions answered, tasks
 * moved and cancelled, a line carrying on from the last, several things at
 * once, your usual hour, and Tab. Wednesday 23 September 2026, two o'clock.
 */

const clock = { today: "2026-09-23", now: 14 * 60 };
const task = (id: string, title: string, dueOn: string, time: string | null = null): OpenTask => ({
  id,
  title,
  dueOn,
  time,
  minutes: time ? 60 : null,
  leadId: null,
  leadName: null,
});
const open = [
  task("g", "Go to gym", "2026-09-23", "18:00"),
  task("d", "Dentist appointment", "2026-09-25", "10:00"),
  task("r", "Call rahul about the demo", "2026-09-24"),
  task("p", "Pay rent", "2026-10-01"),
  task("k", "Pitch deck", "2026-09-26"),
  task("x", "Cancel gym membership", "2026-09-28"),
];
const last: LastLine = { taskId: "k", title: "Pitch deck", day: "2026-09-26", time: "16:00", contact: { id: "c1", name: "Rahul" } };
const edit = (line: string, lastLine: LastLine | null = last) => readEdit(line, { ...clock, open, last: lastLine });

describe("a question, answered instead of kept", () => {
  it("reads the day, the hour, the contact and the money it asks about", () => {
    expect(readQuestion("what's on tomorrow", clock)).toEqual({ ask: "day", day: "2026-09-24", label: "Tomorrow" });
    // Said in Hinglish: the day turned round, the "kya" not.
    expect(readQuestion("kal kya hai", clock)).toEqual({ ask: "day", day: "2026-09-24", label: "Tomorrow" });
    expect(readQuestion("aaj kya kya karna hai", clock)).toMatchObject({ ask: "day", day: "2026-09-23" });
    // "Did i..." is asked, and answered, never ticked; "did 45 min guitar" is still a day reported.
    expect(readQuestion("did i go to gym this week", clock)).toEqual({ ask: "did", about: "gym", from: "2026-09-21", to: "2026-09-23", label: "This week" });
    expect(readQuestion("have i meditated today", clock)).toMatchObject({ ask: "did", about: "meditated", from: "2026-09-23" });
    expect(readQuestion("did 45 min guitar", clock)).toBeNull();
    expect(readQuestion("whats on friday?", clock)).toMatchObject({ ask: "day", day: "2026-09-25" });
    expect(readQuestion("am i free at 5", clock)).toEqual({ ask: "free", day: "2026-09-23", time: "17:00", label: "Today" });
    expect(readQuestion("am i free tomorrow at 10", clock)).toMatchObject({ day: "2026-09-24", time: "10:00" });
    expect(readQuestion("rahul's number", clock)).toEqual({ ask: "contact", name: "rahul", want: "phone" });
    expect(readQuestion("what's priya's email", clock)).toMatchObject({ name: "priya", want: "email" });
    expect(readQuestion("how much did i spend this week", clock)).toMatchObject({ ask: "spent", from: "2026-09-21", to: "2026-09-23", on: null });
    expect(readQuestion("how much have i spent on food this month", clock)).toMatchObject({ from: "2026-09-01", on: "food" });
    expect(readQuestion("what did i note about red rising", clock)).toEqual({ ask: "find", topic: "red rising" });
    expect(readQuestion("when's mummy's birthday", clock)).toEqual({ ask: "when", about: "mummy's birthday" });
    expect(readQuestion("what's due", clock)).toEqual({ ask: "due", day: "2026-09-23" });
  });

  it("asks your memories where things are, what yours is, and what somebody likes", () => {
    expect(readQuestion("where did i park", clock)).toEqual({ ask: "recall", about: "parked", label: "where you parked" });
    expect(readQuestion("where is my passport", clock)).toEqual({ ask: "recall", about: "passport", label: "passport" });
    expect(readQuestion("what's my blood group", clock)).toEqual({ ask: "recall", about: "blood group", label: "your blood group" });
    expect(readQuestion("what does arjun like", clock)).toMatchObject({ ask: "recall", about: "arjun likes" });
    expect(readQuestion("who has my drill", clock)).toMatchObject({ ask: "recall", about: "drill" });
    expect(readQuestion("what is arjun's favourite food", clock)).toMatchObject({ ask: "recall", about: "arjun favourite food" });
    // And the day is still the day.
    expect(readQuestion("what's my day like", clock)).toMatchObject({ ask: "day" });
  });

  it("is never a line that only starts like a question", () => {
    for (const line of ["what if we priced it yearly", "when rahul calls ask about the demo", "find a flat in koramangala", "plan for tomorrow", "notes on the pitch"]) {
      expect(readQuestion(line, clock), line).toBeNull();
    }
  });
});

describe("a change to what is there", () => {
  it("moves a task named by any of its words, keeping its day when only an hour is said", () => {
    expect(edit("push gym to tomorrow", null)).toMatchObject({ do: "move", task: { id: "g" }, day: "2026-09-24", time: null });
    expect(edit("move dentist to 5", null)).toMatchObject({ do: "move", task: { id: "d" }, day: "2026-09-25", time: "17:00" });
    expect(edit("move the dentist to next monday", null)).toMatchObject({ day: "2026-09-28" });
    expect(edit("reschedule call with rahul to friday 4pm", null)).toMatchObject({ task: { id: "r" }, day: "2026-09-25", time: "16:00" });
    expect(edit("postpone pay rent", null)).toMatchObject({ task: { id: "p" }, day: "2026-10-02" });
    expect(edit("push pitch deck by a week", null)).toMatchObject({ day: "2026-10-03" });
  });

  it("cancels and renames", () => {
    expect(edit("cancel the dentist", null)).toMatchObject({ do: "cancel", task: { id: "d" } });
    expect(edit("gym is cancelled", null)).toMatchObject({ do: "cancel", task: { id: "g" } });
    expect(edit("rename pitch deck to investor deck", null)).toMatchObject({ do: "rename", task: { id: "k" }, title: "Investor deck" });
  });

  it("means the task just added by it and that", () => {
    expect(edit("actually 6pm")).toMatchObject({ do: "move", task: { id: "k" }, day: "2026-09-26", time: "18:00" });
    expect(edit("make it friday")).toMatchObject({ do: "move", day: "2026-09-25" });
    expect(edit("scratch that")).toMatchObject({ do: "cancel", task: { id: "k" } });
    expect(edit("call it seed deck")).toMatchObject({ do: "rename", title: "Seed deck" });
  });

  it("is nothing when nothing open is it, or the line only looks like one", () => {
    for (const line of ["cancel gym membership", "drop papa at the station", "move sofa to the bedroom", "cancel netflix", "no sugar this week"]) {
      expect(edit(line), line).toBeNull();
    }
    // Nothing open, nothing to change.
    expect(readEdit("push gym to tomorrow", { ...clock, open: [], last: null })).toBeNull();
  });
});

describe("a line carrying on from the last", () => {
  it("knows who him, her and he are", () => {
    expect(followOn("send him the deck friday", last, false)).toMatchObject({ line: "send Rahul the deck friday", day: null });
    expect(followOn("he wants a demo", last, false).line).toBe("Rahul wants a demo");
    // A line that names somebody itself means them.
    expect(followOn("send her the deck", last, true).line).toBe("send her the deck");
  });

  it("carries the day, the time and an errand on", () => {
    const milk: LastLine = { taskId: "m", title: "Buy milk", day: "2026-09-24", time: null, contact: null };
    expect(followOn("also eggs", milk, false)).toMatchObject({ line: "buy eggs", day: "2026-09-24" });
    expect(followOn("also call priya same time", last, false)).toMatchObject({ line: "call priya at 16:00", day: "2026-09-26" });
    // "Pitch deck" names a thing: "also the one-pager" is not pitching it.
    expect(followOn("also the one-pager", last, false).line).toBe("the one-pager");
  });

  it("takes nothing with no line before", () => {
    expect(followOn("send him the deck", null, false)).toEqual({ line: "send him the deck", day: null, note: null });
  });
});

describe("one line, several things", () => {
  it("splits doings, and shares a when said once", () => {
    expect(together("call rahul and email priya tomorrow")?.split).toEqual(["call rahul tomorrow", "email priya tomorrow"]);
    expect(together("call rahul tomorrow and email priya friday")?.split).toEqual(["call rahul tomorrow", "email priya friday"]);
    expect(together("remind me to call rahul and email priya friday")?.split).toEqual([
      "remind me to call rahul friday",
      "remind me to email priya friday",
    ]);
    expect(together("gym, laundry, finish deck")?.split).toEqual(["gym", "laundry", "finish deck"]);
  });

  it("keeps an errand as one, with its list", () => {
    expect(together("buy milk, eggs and bread")).toEqual({ split: null, list: { items: ["milk", "eggs", "bread"] } });
  });

  it("leaves whole what is one thing", () => {
    for (const line of ["call rahul and priya", "salt and pepper", "research and development", "call rahul and ask him about pricing", "finish the report and send it to rahul"]) {
      expect(together(line), line).toBeNull();
    }
  });
});

describe("what was done before", () => {
  const gym = (day: number, at: string, title = "Gym"): Timed => ({ title, startsAt: at, minutes: 60, day: `2026-09-${String(day).padStart(2, "0")}` });
  const timed = [gym(1, "07:00"), gym(2, "07:00", "Go to gym"), gym(3, "07:00"), gym(4, "07:00"), gym(5, "18:00")];

  it("is your usual when it has been that hour three times and most of the time", () => {
    expect(usualFor("gym tomorrow", timed)).toMatchObject({ time: "07:00", minutes: 60, of: 4, out: 5, about: "gym" });
    expect(usualFor("gym", timed.slice(0, 2))).toBeNull();
    expect(usualFor("call mum", timed)).toBeNull();
  });

  it("says a clash, the same thing already open, and the day before an exam", () => {
    const busy = [{ day: "2026-09-23", startsAt: "18:00", minutes: 60, title: "Guitar", taskId: null }];
    expect(clashWith({ title: "Meeting", day: "2026-09-23", time: "18:30", minutes: 30 }, busy)?.title).toBe("Guitar");
    expect(clashWith({ title: "Meeting", day: "2026-09-23", time: "19:00", minutes: 30 }, busy)).toBeNull();
    expect(alreadyOpen("pay rent", "2026-09-30", open)?.id).toBe("p");
    expect(alreadyOpen("pay rent", "2026-12-30", open)).toBeNull();
    expect(readyFor("CRM demo", "2026-09-28", clock.today)).toEqual({ title: "Prepare for CRM demo", day: "2026-09-27" });
    expect(readyFor("Investor pitch", "2026-09-26", clock.today)).toEqual({ title: "Prepare for investor pitch", day: "2026-09-25" });
    // Tomorrow is too soon to offer a day to get ready.
    expect(readyFor("CRM demo", "2026-09-24", clock.today)).toBeNull();
  });
});

describe("Tab", () => {
  const from = completionsFrom(
    { said: [{ title: "Go to gym", count: 12, last: "x" }, { title: "Go to goa", count: 1, last: "x" }], timed: [] },
    { contacts: [{ name: "Orchids School", person: "Rahul Verma" }], hobbies: [{ title: "Guitar" }], habits: [{ name: "Drink water" }] },
    7 * 60,
  );

  it("finishes a line said before, the most said first, and then a name", () => {
    expect(complete("go", from)).toBe(" to gym");
    expect(complete("go to g", from)).toBe("ym");
    expect(complete("call ra", from)).toBe("hul Verma");
    expect(complete("practice gu", from)).toBe("itar");
    expect(complete("dr", from)).toBe("ink water");
    expect(complete("xylophone", from)).toBeNull();
  });
});

describe("something pasted", () => {
  it("is what a message asked, and whose it was", () => {
    expect(cleanPaste("[23/09/26, 10:32 am] Rahul: can you send the deck by friday?")).toBe("send the deck by friday for Rahul");
    expect(cleanPaste("23/09/2026, 10:32 - Priya Sharma: please call me tomorrow")).toBe("call Priya tomorrow");
    expect(cleanPaste("From: Rahul Verma <rahul@x.com>\nSubject: Re: Invoice for September\nHi")).toBe("Invoice for September for Rahul Verma");
    expect(cleanPaste("just text")).toBe("just text");
  });
});

describe("somebody new, told about", () => {
  const known = { contacts: [{ id: "c1", name: "Orchids School", person: "Rahul" }], hobbies: [] };
  const read = (line: string) => readCapture(line, known, clock);

  it("is a contact, what happened, and what to do about them, in one line", () => {
    expect(read("Jyothi the principal from reva puc has accepted my linkedin connection request, i need to follow up").ask).toEqual({
      do: "contact",
      name: "Reva PUC",
      person: "Jyothi",
      phone: null,
      email: null,
      role: "Principal",
      source: "LinkedIn",
      happened: "Accepted my LinkedIn connection request",
      then: { title: "Follow up with Jyothi", day: "2026-09-24", time: null, daySaid: false },
    });
  });

  it("reads the other ways it is said", () => {
    expect(read("met anil sharma, HR head at infosys, wants a demo next week").ask).toMatchObject({
      name: "Infosys",
      person: "Anil Sharma",
      role: "HR head",
      happened: "Wants a demo next week",
      // What he wants, with a day on it, is something owed: his task (shared/nextstep.ts).
      then: { title: "Demo with Anil Sharma", daySaid: true },
    });
    expect(read("spoke to priya from GIG international, need to send her the brochure tomorrow").ask).toMatchObject({
      name: "GIG International",
      person: "Priya",
      then: { title: "Send Priya the brochure", day: "2026-09-24", daySaid: true },
    });
    expect(read("Ramesh the admin at christ academy wants the fee structure, call him monday 11am").ask).toMatchObject({
      person: "Ramesh",
      then: { title: "Call Ramesh", day: "2026-09-28", time: "11:00" },
    });
    expect(read("the principal of vidyashilp accepted my request, follow up").ask).toMatchObject({
      name: "Vidyashilp",
      person: null,
      role: "Principal",
      then: { title: "Follow up with the principal at Vidyashilp" },
    });
  });

  it("is never a parcel, a place, or somebody already kept", () => {
    expect(read("the head of admissions at dps replied, call her tomorrow").ask).toMatchObject({
      name: "DPS",
      person: null,
      role: "Head of admissions",
      then: { title: "Call the head of admissions at DPS" },
    });
    for (const line of [
      "letter from school",
      "email from hdfc bank about my card",
      "pizza from dominos",
      "got back from work late",
      "mom from home called",
      "one of them accepted",
      "the way of kings is a fantasy book in the stormlight archive series",
      "tried a new varient of lateral raises, my arms are burning",
      "drop the charger at meera's tomorrow",
      "give arjun the charger back tomorrow",
    ]) {
      const ask = read(line).ask;
      expect(ask?.do === "contact" ? ask : null, line).toBeNull();
    }
    expect(read("Rahul from orchids school wants a demo")).toMatchObject({ kind: "contact", contact: { id: "c1" } });
  });
});

describe("asked about a contact, the money and the hours left (part twelve, phase 50)", () => {
  it("reads when you last spoke to somebody", () => {
    expect(readQuestion("when did i last talk to maya", clock)).toEqual({ ask: "last", name: "maya" });
    expect(readQuestion("when was i last in touch with harbour coffee?", clock)).toEqual({ ask: "last", name: "harbour coffee" });
    expect(readQuestion("last time i spoke to jonas", clock)).toEqual({ ask: "last", name: "jonas" });
  });

  it("reads what is owed", () => {
    expect(readQuestion("how much does harbour owe me", clock)).toEqual({ ask: "owed", name: "harbour" });
    expect(readQuestion("who owes me money", clock)).toEqual({ ask: "owed", name: null });
    expect(readQuestion("what's outstanding", clock)).toEqual({ ask: "owed", name: null });
  });

  it("reads the next free hour, and how long it is to be", () => {
    expect(readQuestion("next free hour tomorrow", clock)).toMatchObject({ ask: "slot", day: "2026-09-24", minutes: 60 });
    expect(readQuestion("when am i free", clock)).toMatchObject({ ask: "slot", day: "2026-09-23", minutes: 60 });
    expect(readQuestion("find me half an hour on friday", clock)).toMatchObject({ ask: "slot", day: "2026-09-25", minutes: 30 });
  });

  it("reads what is open for somebody", () => {
    expect(readQuestion("what did i promise sam", clock)).toEqual({ ask: "promised", name: "sam" });
    expect(readQuestion("what's pending with jonas", clock)).toEqual({ ask: "promised", name: "jonas" });
  });

  it("ticks off from the line, and names a task by its hour", () => {
    expect(readEdit("done call rahul", { ...clock, open, last: null })).toMatchObject({ do: "done", task: { id: "r" } });
    expect(readEdit("the rahul call is done", { ...clock, open, last: null })).toMatchObject({ do: "done", task: { id: "r" } });
    expect(readEdit("move my 6pm to 7", { ...clock, open, last: null })).toMatchObject({ do: "move", task: { id: "g" }, time: "19:00" });
    // Nothing open is it: not an edit.
    expect(readEdit("done the tax return", { ...clock, open, last: null })).toBeNull();
  });
});
