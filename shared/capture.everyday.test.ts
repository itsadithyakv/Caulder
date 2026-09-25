import { describe, expect, it } from "vitest";
import { readCapture } from "./capture";
import { parseQuick } from "./quickadd";
import { rephrase } from "./rephrase";
import { readListItem } from "./lists";

/**
 * The lines people really type, a hundred ways, read the way they mean.
 * Each case here was read wrongly once; this is what keeps it read rightly.
 * Wednesday 23 September 2026, two in the afternoon.
 */

const CLOCK = { today: "2026-09-23", now: 14 * 60 };
const KNOWN = {
  contacts: [
    { id: "c1", name: "Orchids School", person: "Rahul" },
    { id: "c2", name: "MS PUC College", person: "Rajesh" },
  ],
  hobbies: [
    { id: "h1", title: "Guitar" },
    { id: "h2", title: "Gym" },
  ],
  habits: [
    { id: "b1", name: "Meditate" },
    { id: "b2", name: "Drink water" },
  ],
  tasks: [{ id: "t1", title: "Gym" }],
  blocks: [],
  pages: [
    { id: "p1", title: "Guitar", section: "hobbies" },
    { id: "p2", title: "Gym", section: "hobbies" },
  ],
};
const read = (line: string) => readCapture(line, KNOWN, CLOCK);
const task = (line: string) => parseQuick(line, CLOCK).task;

describe("how a day is said", () => {
  it("is the journal when a feeling comes first, whatever day it mentions", () => {
    expect(read("feeling anxious about tomorrow").kind).toBe("journal");
    expect(read("so tired").kind).toBe("journal");
    expect(read("i'm really excited for the trip next week").kind).toBe("journal");
    // Not every "i'm" is a feeling: a plan is still a plan.
    expect(read("i'm going to the dentist tomorrow at 10").kind).toBe("task");
  });

  it("knows more of the ways a day is summed up", () => {
    expect(read("great day, finally shipped the feature").kind).toBe("journal");
    expect(read("couldn't sleep").kind).toBe("journal");
  });

  it("takes a night's sleep as the day looked back on, not an hour on the calendar", () => {
    const slept = read("slept at 2am again");
    expect(slept.kind).toBe("journal");
    expect(slept.effects.some((effect) => effect.do === "block")).toBe(false);
  });
});

describe("what was done", () => {
  it("ticks a habit said in the past tense it does not share a stem with", () => {
    expect(read("drank 3l water").effects).toContainEqual({ do: "tick", habit: { id: "b2", name: "Drink water" } });
  });

  it("does not finish the gym for a run, a ride or a swim", () => {
    const run = read("went for a 5k run");
    expect(run.effects.some((effect) => effect.do === "finish")).toBe(false);
    // A lift still is a day at the gym.
    expect(read("hit a pr on the bench press, 60kg").effects).toContainEqual({ do: "finish", task: { id: "t1", title: "Gym" } });
  });
});

describe("a thing to do", () => {
  it("is a task for a contact when it tells you to do something, even with no day", () => {
    expect(read("send proposal to orchids school")).toMatchObject({ kind: "task", contact: { id: "c1" } });
    // Something that happened is still their history.
    expect(read("meeting with rahul went well, they want a demo").kind).toBe("contact");
  });

  it("is a chore said by its name alone", () => {
    expect(read("laundry").kind).toBe("task");
    expect(read("groceries").kind).toBe("task");
    expect(read("the dishes").kind).toBe("task");
  });

  it("keeps a clean title when a when was taken out of the middle", () => {
    expect(task("placement drive on 5th oct, prepare resume")).toMatchObject({ title: "Placement drive, prepare resume", day: "2026-10-05" });
  });

  it("settles seven to eleven by what the thing is, and still asks when nothing settles it", () => {
    expect(task("dentist appointment thursday 10:30").time).toBe("10:30");
    expect(task("investor call at 11 tomorrow").time).toBe("11:00");
    expect(task("party at 9 on saturday").time).toBe("21:00");
    expect(parseQuick("call mum at 9", CLOCK).questions.map((q) => q.id)).toEqual(["meridiem"]);
  });

  it("puts a class for your body under health, not college", () => {
    expect(task("yoga class at 7am mon wed fri").area).toBe("health");
    expect(task("lab class at 9am").area).toBe("college");
  });

  it("reads the day of the month, and every second one, the way it can", () => {
    expect(task("first of every month pay rent")).toMatchObject({ title: "Pay rent", day: "2026-10-01" });
    expect(parseQuick("first of every month pay rent", CLOCK).notes.join(" ")).toMatch(/just the next one/);
    expect(task("every 2nd saturday haircut").title).toBe("Haircut");
  });
});

describe("what was not done", () => {
  it("is the day, and finishes nothing, ticks nothing and takes no hour", () => {
    for (const line of ["skipped gym today", "I didn't go to the gym today", "couldn't finish the report today", "bunked the gym"]) {
      const reading = read(line);
      expect(reading.kind, line).toBe("journal");
      expect(reading.effects, line).toEqual([]);
    }
  });
});

describe("the hour of waking", () => {
  it("is the morning, even at five", () => {
    expect(task("wake up at 5 tomorrow")).toMatchObject({ time: "05:00" });
    expect(task("alarm at 6:30 tomorrow")).toMatchObject({ time: "06:30" });
    // And an hour said bare about anything else is still the afternoon.
    expect(task("call mum at 5 tomorrow")).toMatchObject({ time: "17:00" });
  });
});

describe("said the plain way first", () => {
  it("drops what is said to nobody, only at the ends", () => {
    expect(task("bro remind me tmrw to pay rent fr")).toMatchObject({ title: "Pay rent", day: "2026-09-24" });
    expect(rephrase("call bro tonight")).toBe("call bro tonight");
    // Nor is it when it is who the line is about.
    expect(rephrase("call bro")).toBe("call bro");
    expect(task("bhai kal presentation hai yaar")).toMatchObject({ title: "Presentation", day: "2026-09-24" });
  });

  it("writes out what is said at work and online", () => {
    expect(task("lowkey need to finish the deck tn")).toMatchObject({ title: "Finish the deck", day: "2026-09-23" });
    expect(task("wfh tmrw").title).toBe("Work from home");
    // Forgotten, it is still to do - unless the line is about the day it was forgotten.
    expect(task("deadass forgot to pay rent").title).toBe("Pay rent");
    expect(rephrase("forgot to call mom yesterday, felt bad")).toBe("forgot to call mom yesterday, felt bad");
  });

  it("turns money lent or owed into the thing to do about it", () => {
    expect(task("rahul owes me 500").title).toBe("Get 500 back from rahul");
    expect(task("lent arjun 2000").title).toBe("Get 2000 back from arjun");
    expect(task("i owe priya ₹300").title).toBe("Pay priya back 300");
  });

  it("reads Hinglish: when, where, and what to do", () => {
    expect(task("kal subah gym jaana hai")).toMatchObject({ title: "Go to gym", day: "2026-09-24" });
    expect(task("aaj raat 10 baje padhai")).toMatchObject({ title: "Study", day: "2026-09-23", time: "22:00" });
    expect(task("mummy ko call karna hai").title).toBe("Call mummy");
    // Said of something done, "kal" is yesterday.
    expect(rephrase("kal gym gaya tha")).toMatch(/yesterday/);
    // And an English line with a Kal in it is left alone.
    expect(rephrase("meet Kal Penn tomorrow")).toBe("meet Kal Penn tomorrow");
  });
});

describe("the lists people keep", () => {
  it("files an item on the page for its kind, and a book on the shelf", () => {
    expect(readListItem("movie to watch: interstellar")).toEqual({ kind: "page", page: "Watchlist", under: "Films and shows", says: "interstellar" });
    expect(readListItem("gift idea for mom: saree")).toMatchObject({ page: "Gift ideas", says: "For mom: saree" });
    expect(readListItem("podcast rec from arjun: huberman on sleep")).toMatchObject({ page: "Podcasts", says: "huberman on sleep (from arjun)" });
    expect(readListItem("book rec from rahul: atomic habits")).toEqual({ kind: "book", title: "atomic habits" });
    expect(readListItem("quote: the obstacle is the way")).toMatchObject({ page: "Quotes" });
    expect(readListItem("“Simplify, simplify.” - Thoreau")).toMatchObject({ page: "Quotes", says: "“Simplify, simplify.” - Thoreau" });
    expect(readListItem("https://example.com/habits read later")).toMatchObject({ page: "Read later" });
  });

  it("takes a list item before the contact it mentions, and hangs the page where it belongs", () => {
    expect(read("book rec from rahul: atomic habits")).toMatchObject({ kind: "command", ask: { do: "book", status: "to-read", titles: ["atomic habits"] } });
    const film = read("movie to watch: interstellar");
    expect(film).toMatchObject({ kind: "memory", topic: "Watchlist", text: "interstellar" });
    expect(film.trail.map((step) => step.title)).toEqual(["Me", "Hobbies", "Films and shows"]);
  });

  it("is never a line that only mentions a film", () => {
    expect(readListItem("watched interstellar last night, loved it")).toBeNull();
    expect(readListItem("buy a gift for mom")).toBeNull();
  });
});

describe("a contact's details", () => {
  it("sets the number or the address of somebody who is already a contact", () => {
    expect(read("rahul's number is 98765 43210")).toMatchObject({
      kind: "command",
      ask: { do: "update", contact: { id: "c1" }, phone: "98765 43210", email: null },
    });
    expect(read("rajesh email rajesh@mspuc.edu")).toMatchObject({ ask: { do: "update", contact: { id: "c2" }, email: "rajesh@mspuc.edu" } });
    // Somebody new is a new contact, as before.
    expect(read("add contact meera 9988776655").ask?.do).toBe("contact");
  });
});

describe("not fooled by the lines that look like something else", () => {
  it("does not take a plan or an order for a feeling", () => {
    expect(read("i'm good to go for the 3pm demo").kind).not.toBe("journal");
    expect(read("i am fine with the deadline friday").kind).not.toBe("journal");
    expect(read("feeling like pizza tonight, order dominos").kind).toBe("task");
    expect(read("i'm really excited for the trip next week").kind).toBe("journal");
  });

  it("does not take a mention for a list item, or a note about a chore for the chore", () => {
    expect(read("movie to watch with rahul tonight").kind).toBe("task");
    expect(read("quote the client 50k for the website").kind).toBe("task");
    expect(read("laundry detergent is almost out").kind).toBe("note");
  });

  it("does not take any number near a name for their number", () => {
    expect(read("rajesh number 2 son is getting married").ask).toBeNull();
    expect(read("call rahul on 9876543210 tomorrow at 4").kind).toBe("task");
  });

  it("settles the evening before the morning, and asks when the thing goes either way", () => {
    expect(task("office party at 8").time).toBe("20:00");
    expect(parseQuick("gym at 8", CLOCK).questions.map((q) => q.id)).toEqual(["meridiem"]);
  });

  it("keeps titles clean: no adverb in front, no verb left hanging, no capital on a link", () => {
    expect(task("really need to finish the report today").title).toBe("Finish the report");
    expect(task("bro's birthday is on friday").title).toBe("Bro's birthday");
    expect(task("https://docs.google.com/xyz send to rajesh tomorrow").title).toMatch(/^https:/);
  });

  it("reads spending said the short way, and money owed to the company", () => {
    expect(read("uber 340").ask).toEqual({ do: "spend", amount: 340, what: "Uber", daysAgo: 0 });
    expect(read("room 101").ask).toBeNull();
    expect(task("the client owes us 50000 for september").title).toMatch(/^Chase the client for 50000/);
  });

  it("reads a priority said first as a task, and a day looked back on as the journal", () => {
    expect(read("urgent: fix the payment bug").kind).toBe("task");
    expect(read("ate healthy today").kind).toBe("journal");
    expect(read("made dinner for everyone").kind).toBe("journal");
  });
});
