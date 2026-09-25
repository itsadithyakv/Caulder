import { describe, expect, it } from "vitest";
import { isSecret, monthDayOf, readLifeFact } from "./lifefacts";
import { expand } from "./slang";
import { readCapture } from "./capture";

/**
 * The things a life is made of, told to the line: about you, the people in
 * it, where things are, what was lent - and a password, which is never one.
 */

const contacts = [{ name: "Orchids School", person: "Rahul" }];
const read = (line: string) => readLifeFact(expand(line), contacts);

describe("about you", () => {
  it.each([
    ["my blood group is O+", "Blood group: O+"],
    ["i'm allergic to peanuts", "Allergic to: peanuts"],
    ["my shoe size is 9", "Shoe size: 9"],
    ["i prefer window seats", "Prefers: window seats"],
    ["my car number is KA 01 AB 1234", "Car number: KA 01 AB 1234"],
    ["my favourite restaurant is toit", "Favourite restaurant: toit"],
    ["i am vegetarian", "Diet: vegetarian"],
    ["i can't eat mushrooms", "Doesn't eat: mushrooms"],
    ["our pin code is 560034", "Pin code: 560034"],
  ])("%s", (line, fact) => {
    expect(read(line)).toMatchObject({ kind: "me", page: "About me", fact });
  });

  it("keeps the day of an anniversary", () => {
    expect(read("our anniversary is 12 june")).toMatchObject({ page: "About me", fact: "Anniversary: 12 June", date: { month: 6, day: 12 } });
  });
});

describe("the people in it", () => {
  it.each([
    ["mummy's birthday is on 15 march", "Mummy", "Birthday: 15 March"],
    ["my mom's birthday is 2nd feb", "Mom", "Birthday: 2 February"],
    ["arjun likes filter coffee", "Arjun", "Likes: filter coffee"],
    ["meera just got engaged", "Meera", "News: got engaged"],
    ["dad's shirt size is XL", "Dad", "Shirt size: XL"],
    ["priya works at infosys", "Priya", "Works at: infosys"],
    ["anil moved to pune", "Anil", "Lives in: pune"],
  ])("%s", (line, page, fact) => {
    expect(read(line)).toMatchObject({ kind: "person", page, fact, trail: [{ title: "Me" }, { title: "People" }] });
  });

  it("leaves a contact's to their history", () => {
    expect(read("rahul's daughter is called anya")).toBeNull();
    expect(read("rahul likes the proposal")).toBeNull();
  });
});

describe("where things are, and what was lent", () => {
  it.each([
    ["the spare key is under the plant pot", "Where things are", "Spare key: under the plant pot"],
    ["i parked on level 3, spot B12", "Where things are", "Parked: level 3, spot B12"],
    ["passport is in the top drawer", "Where things are", "Passport: in the top drawer"],
    ["kept my passport in the top drawer", "Where things are", "Passport: in the top drawer"],
    ["lent my drill to arjun", "Lent and borrowed", "Drill: lent to Arjun"],
    ["arjun returned the drill", "Lent and borrowed", "Drill: back from Arjun"],
    ["got my drill back from arjun", "Lent and borrowed", "Drill: back from Arjun"],
  ])("%s", (line, page, fact) => {
    expect(read(line)).toMatchObject({ page, fact });
  });
});

describe("what is not a fact about a life", () => {
  it("is left for the task, the journal and the rest", () => {
    for (const line of [
      "my exam is on friday",
      "my head is killing me",
      "my day was good",
      "the meeting is at the office",
      "my flight is at 6",
      "my laptop is broken",
      "i love this song",
      "i need to buy milk",
      "move sofa to the bedroom",
      "everyone likes pizza",
      "call mom tomorrow",
      "the gym is at 7",
      "my mom is coming home",
      "i put up the shelves",
    ]) {
      expect(read(line), line).toBeNull();
    }
  });

  it("never keeps a password, a PIN or a card number", () => {
    for (const line of ["my wifi password is hunter22", "my atm pin is 1234", "card number: 4111 1111 1111 1111", "the otp is 482910"]) {
      expect(isSecret(expand(line)), line).toBe(true);
    }
    expect(isSecret("our pin code is 560034")).toBe(false);
    expect(isSecret("need to change my wifi password")).toBe(false);
  });
});

describe("a day of the year", () => {
  it.each([
    ["15 march", { month: 3, day: 15 }],
    ["march 15th", { month: 3, day: 15 }],
    ["the 3rd of october", { month: 10, day: 3 }],
    ["15/03", { month: 3, day: 15 }],
    ["32 march", null],
  ])("%s", (said, date) => {
    expect(monthDayOf(said)).toEqual(date);
  });
});

describe("read all the way through", () => {
  const clock = { today: "2026-09-25", now: 10 * 60 };
  const known = { contacts: [{ id: "c1", name: "Orchids School", person: "Rahul" }], hobbies: [] };

  it("is a memory on its page under Remembered - never the task or the note it used to be", () => {
    expect(readCapture("mummy's birthday is on 15 march", known, clock)).toMatchObject({
      kind: "memory",
      topic: "Mummy",
      fact: "Birthday: 15 March",
      branch: { section: "remembered" },
      trail: [{ title: "Me" }, { title: "People" }],
    });
    expect(readCapture("remember: the spare key is under the plant pot", known, clock)).toMatchObject({
      kind: "memory",
      topic: "Where things are",
      fact: "Spare key: under the plant pot",
    });
    expect(readCapture("i'm allergic to peanuts", known, clock)).toMatchObject({ kind: "memory", topic: "About me" });
  });

  it("locks a password away, and keeps a tradesman's number as a contact", () => {
    expect(readCapture("my wifi password is hunter22", known, clock).kind).toBe("private");
    expect(readCapture("the plumber's number is 98450 12345", known, clock).ask).toMatchObject({
      do: "contact",
      name: "Plumber",
      phone: "98450 12345",
    });
  });
});
