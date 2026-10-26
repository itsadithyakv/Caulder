import { describe, expect, it } from "vitest";
import { loggedAs, nextStepIn } from "./nextstep";
import { readCapture, type Known } from "./capture";
import { parseQuick } from "./quickadd";

/**
 * What a line about somebody leaves to be done, and how sure the line is of
 * who it means (PLAN.md, part nine).
 */

const CLOCK = { today: "2026-10-13", now: 10 * 60 + 30 }; // a Tuesday
const step = (line: string, who = "Sumanth") => nextStepIn(line, who, CLOCK);

describe("what they asked for is something to do, on the day they said", () => {
  it("reads the request out of what they said", () => {
    expect(step("asked me to reach out to him next week. I messaged him on linkedin.")).toEqual({
      title: "Reach out to Sumanth",
      day: "2026-10-20",
      time: null,
      daySaid: true,
      why: "asked",
    });
    expect(step("said to call her back after the 20th", "Priya")).toMatchObject({ title: "Call Priya back", day: "2026-10-21" });
    expect(step("wants me to send the quote sometime in november", "Jonas")).toMatchObject({ title: "Send the quote to Jonas", day: "2026-11-01" });
    expect(step("said i should text him on whatsapp")).toMatchObject({ title: "Text Sumanth on whatsapp", why: "asked" });
    expect(step("asked me to check in again in a couple of weeks", "Jonas")).toMatchObject({ title: "Check in with Jonas again", day: "2026-10-27" });
  });

  it("is for tomorrow when no day was said, and says that it was not", () => {
    expect(step("asked me to follow up")).toMatchObject({ title: "Follow up with Sumanth", day: "2026-10-14", daySaid: false });
  });

  it("takes a thing wanted with a day on it, and leaves a thing wanted with none as what it is", () => {
    expect(step("wants the invoice by the 5th", "Priya")).toMatchObject({ title: "Invoice for Priya", day: "2026-11-05", why: "asked" });
    expect(step("asked for a demo next week", "Maya")).toMatchObject({ title: "Demo with Maya", day: "2026-10-20" });
    expect(step("wants a call mid november", "Nordlys Design")).toMatchObject({ title: "Call Nordlys Design", day: "2026-11-15" });
    expect(step("wants a bigger logo", "Maya")).toBeNull();
  });
});

describe("what I said I would do is the same", () => {
  it("reads my own word", () => {
    expect(step("told jonas i'd send the deck by friday", "Jonas")).toMatchObject({ title: "Send the deck to Jonas", day: "2026-10-16", why: "promised" });
    expect(step("i said i would get back to her tomorrow", "Maya")).toMatchObject({ title: "Get back to Maya", day: "2026-10-14" });
  });
});

describe("what they said they would do is waited for", () => {
  it("is a check-in on the day they said, or in three days", () => {
    expect(step("said she'll get back to me in a few days", "Maya")).toEqual({ title: "Check in with Maya", day: "2026-10-16", time: null, daySaid: true, why: "awaited" });
    expect(step("said he would confirm", "Sam")).toMatchObject({ title: "Check in with Sam", day: "2026-10-16", daySaid: false });
    // "Needs to" with nobody asked is hers to do; "needs me to" is asked of me.
    expect(step("maya needs to sign the contract by friday", "Maya")).toMatchObject({ title: "Check in with Maya", day: "2026-10-16", daySaid: true });
    expect(step("maya needs me to send the contract by friday", "Maya")).toMatchObject({ title: "Send the contract to Maya", why: "asked" });
  });

  it("is never my own promise read as theirs", () => {
    expect(step("i'll get back to her in a few days", "Maya")?.why).not.toBe("awaited");
  });
});

describe("a fact owes nothing", () => {
  it("leaves alone what merely has a date in it, or says how something went", () => {
    for (const line of ["pay on the 5th", "said the launch went well", "signed yesterday", "is on leave till mid november"]) {
      expect(step(line, "Harbour"), line).toBeNull();
    }
  });
});

describe("what kind of thing happened", () => {
  it("is a message where it says it was sent, their answer when they wrote, and a note when it cannot tell", () => {
    expect(loggedAs("asked me to reach out next week. I messaged him on linkedin.")).toBe("linkedin");
    expect(loggedAs("dm'd her on insta about the menu")).toBe("instagram");
    expect(loggedAs("whatsapped sam the quote")).toBe("whatsapp");
    expect(loggedAs("priya replied on whatsapp, wants the menu page first")).toBe("replied");
    expect(loggedAs("called maya, no answer")).toBe("call");
    expect(loggedAs("met jonas at the fair")).toBe("meeting");
    // No place named: Caulder cannot say where, and does not guess.
    expect(loggedAs("messaged him about the invoice")).toBe("note");
    expect(loggedAs("maya wants a bigger logo")).toBe("note");
  });
});

describe("the whole line, for somebody new and for somebody known", () => {
  const known: Known = {
    contacts: [
      { id: "c1", name: "RV PUC", person: "Sumanth" },
      { id: "c2", name: "Kettle & Crumb Bakery", person: "Priya Nair" },
      { id: "c3", name: "Lantern Press", person: "Priya Menon" },
      { id: "c4", name: "Harbour Coffee Roasters", person: "Maya Ellis" },
    ],
    pages: [],
  };
  const LINE = "Sumanth from RV puc asked me to reach out to him next week. I messaged him on linkedin.";

  it("makes somebody new a contact, with what happened as a LinkedIn message and the thing to do next week", () => {
    const reading = readCapture(LINE, { contacts: [], pages: [] }, CLOCK);
    expect(reading).toMatchObject({ kind: "command", logged: "linkedin" });
    expect(reading.ask).toMatchObject({
      do: "contact",
      name: "RV PUC",
      person: "Sumanth",
      then: { title: "Reach out to Sumanth", day: "2026-10-20", daySaid: true },
    });
  });

  it("puts it on the history of somebody known, and leaves the same thing to do", () => {
    expect(readCapture(LINE, known, CLOCK)).toMatchObject({
      kind: "contact",
      contact: { id: "c1" },
      logged: "linkedin",
      then: { title: "Reach out to Sumanth", day: "2026-10-20" },
      doubt: null,
    });
  });

  it("sets a number said later on the same person, by half their company's name", () => {
    expect(readCapture("Sumanth from rv, i got his number it is 9686012345", known, CLOCK).ask).toEqual({
      do: "update",
      contact: { id: "c1", name: "RV PUC" },
      phone: "9686012345",
      email: null,
    });
  });

  it("never makes a second of somebody who is a contact already", () => {
    // Nothing new said: they are opened.
    expect(readCapture("add contact sumanth from rv puc", known, CLOCK).ask).toEqual({ do: "open", contact: { id: "c1", name: "RV PUC" }, how: null });
    // Something new said: it is set on them.
    expect(readCapture("add contact sumanth from rv puc, 96860 12345", known, CLOCK).ask).toEqual({
      do: "update",
      contact: { id: "c1", name: "RV PUC" },
      phone: "96860 12345",
      email: null,
    });
    // Somebody else at the same place is somebody new.
    expect(readCapture("add contact kiran rao from rv puc", known, CLOCK).ask).toMatchObject({ do: "contact", name: "RV PUC", person: "Kiran Rao" });
  });

  it("leaves something that is plainly to do as a task, and a fact with a date as a fact", () => {
    expect(readCapture("harbour needs the build tonight", known, CLOCK).kind).toBe("task");
    expect(readCapture("maya is on leave till mid november", known, CLOCK)).toMatchObject({ kind: "contact", then: null });
    expect(readCapture("maya said the launch went well", known, CLOCK)).toMatchObject({ kind: "contact", then: null });
  });

  it("asks who, when a name took a slip to read - and reads again with the answer", () => {
    const unsure = readCapture("sumnath asked me to reach out next week", known, CLOCK);
    expect(unsure.doubt?.text).toContain("is that Sumanth, RV PUC?");
    expect(unsure.doubt?.text).toContain("sumnath");
    expect(unsure.doubt?.options).toEqual([
      { label: "Yes", contact: "c1" },
      { label: "Somebody else", contact: null },
    ]);
    // Spoken of by his name, not by the slip at it.
    expect(unsure.then?.title).toBe("Reach out to Sumanth");
    expect(readCapture("sumant said to call back friday", known, CLOCK).doubt?.options[0]).toEqual({ label: "Yes", contact: "c1" });

    const yes = readCapture("sumnath asked me to reach out next week", known, CLOCK, { contact: "c1" });
    expect(yes).toMatchObject({ kind: "contact", contact: { id: "c1" }, doubt: null });
    // And still spoken of by his name once it is settled, not by where he is.
    expect(yes.then?.title).toBe("Reach out to Sumanth");
    const no = readCapture("sumnath asked me to reach out next week", known, CLOCK, { contact: null });
    // Somebody else, then - and so somebody Caulder does not know: the next question is where from.
    expect(no).toMatchObject({ contact: null, doubt: { text: "Where is Sumnath from?" } });
    expect(readCapture("sumnath asked me to reach out next week", known, CLOCK, { contact: null, from: null })).toMatchObject({ contact: null, doubt: null });
  });

  it("asks which, when two contacts answer to the name - and not when the line says", () => {
    const which = readCapture("priya wants the invoice by the 5th", known, CLOCK);
    expect(which.doubt?.text).toBe("Which Priya?");
    expect(which.doubt?.options.map((option) => option.label)).toEqual(["Priya Nair, Kettle & Crumb Bakery", "Priya Menon, Lantern Press", "None of them"]);
    expect(readCapture("priya from lantern press wants the invoice by the 5th", known, CLOCK)).toMatchObject({ contact: { id: "c3" }, doubt: null });
    expect(readCapture("priya wants the invoice by the 5th", known, CLOCK, { contact: "c3" })).toMatchObject({ contact: { id: "c3" }, doubt: null });
  });

  it("does not take a word that is merely near a short name for it", () => {
    const short: Known = { contacts: [{ id: "s", name: "Acme", person: "Steve Hall" }], pages: [] };
    expect(readCapture("buy a stove for the office", short, CLOCK).contact).toBeNull();
  });
});

describe("somebody the line names whom Caulder does not know", () => {
  const nobody: Known = { contacts: [{ id: "c4", name: "Harbour Coffee Roasters", person: "Maya Ellis" }], pages: [] };

  it("asks where they are from, and is their task until it is told", () => {
    const reading = readCapture("Sumanth asked me to reach out next week", nobody, CLOCK);
    expect(reading.kind).toBe("task");
    expect(reading.doubt).toEqual({ text: "Where is Sumanth from?", options: [{ label: "Only a task", contact: null }], from: "Sumanth" });
    // Said the way a task is, on the day he said.
    expect(reading.task).toEqual({ title: "Reach out to Sumanth", day: "2026-10-20", time: null });
    expect(readCapture("told sumanth i'd send the deck by friday", nobody, CLOCK).doubt?.from).toBe("Sumanth");
    expect(readCapture("sumanth rao said he'll get back to me", nobody, CLOCK).doubt?.text).toBe("Where is Sumanth Rao from?");
  });

  it("makes them a contact there once it is told, with what happened and the thing to do", () => {
    const reading = readCapture("Sumanth asked me to reach out next week. I messaged him on linkedin.", nobody, CLOCK, { from: "rv puc" });
    expect(reading).toMatchObject({ kind: "command", logged: "linkedin", doubt: null });
    expect(reading.ask).toEqual({
      do: "contact",
      name: "RV PUC",
      person: "Sumanth",
      phone: null,
      email: null,
      role: null,
      source: "LinkedIn",
      happened: "Asked me to reach out next week. I messaged him on LinkedIn",
      then: { title: "Reach out to Sumanth", day: "2026-10-20", time: null, daySaid: true },
    });
  });

  it("is only a task when that is the answer, and leaves the day to be asked when none was said", () => {
    const reading = readCapture("Sumanth asked me to reach out", nobody, CLOCK, { from: null });
    expect(reading).toMatchObject({ kind: "task", doubt: null, ask: null });
    expect(reading.task).toEqual({ title: "Reach out to Sumanth", day: null, time: null });
  });

  it("does not ask about somebody known, somebody who is not a name, or a line that owes nothing", () => {
    expect(readCapture("maya asked me to reach out next week", nobody, CLOCK).doubt).toBeNull();
    for (const line of [
      "mum asked me to buy milk",
      "the client asked me to send the invoice",
      "client wants me to call back tomorrow",
      "they asked me to follow up",
      "someone said to call back",
      "Sumanth said the launch went well",
      "send sumanth the deck tomorrow",
      "the accountant said to send the receipts",
    ]) {
      expect(readCapture(line, nobody, CLOCK).doubt, line).toBeNull();
    }
  });
});

describe("a when said loosely is still a day", () => {
  const day = (line: string) => parseQuick(line, CLOCK).task.day;
  it.each([
    ["call sam early next week", "2026-10-19"],
    ["call sam mid next week", "2026-10-21"],
    ["call sam end of next week", "2026-10-23"],
    ["call sam later this week", "2026-10-16"],
    ["call sam in a few days", "2026-10-16"],
    ["call sam in a few weeks", "2026-11-03"],
    ["call sam mid november", "2026-11-15"],
    ["call sam early december", "2026-12-05"],
    ["call sam end of january", "2027-01-31"],
    ["call sam sometime in november", "2026-11-01"],
    ["call sam after the 20th", "2026-10-21"],
    ["call sam after friday", "2026-10-17"],
    // A date said outright, and a day of its own, are read as they were.
    ["call sam november 5", "2026-11-05"],
    ["call sam day after tomorrow", "2026-10-15"],
    // A part of this month that has gone is today, not last week.
    ["call sam early october", "2026-10-13"],
  ])("%s is %s", (line, expected) => {
    expect(day(line)).toBe(expected);
  });

  it("leaves the when out of the title", () => {
    expect(parseQuick("call sam early next week", CLOCK).task.title).toBe("Call sam");
    expect(parseQuick("send the deck mid november", CLOCK).task.title).toBe("Send the deck");
  });
});
