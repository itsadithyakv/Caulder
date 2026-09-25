import { describe, expect, it } from "vitest";
import { readCommand } from "./commands";

describe("going somewhere", () => {
  it.each([
    ["go to money", "money"],
    ["open the calendar", "day"],
    ["show me my contacts", "leads"],
    ["take me to settings", "settings"],
    ["open pipeline", "pipeline"],
    ["goto brain", "brain"],
    ["open the journal", "journal"],
    ["show habits", "life"],
    ["open the money screen", "money"],
    ["Go To Today.", "today"],
  ])("'%s' goes to %s", (line, place) => {
    expect(readCommand(line)).toMatchObject({ do: "go", place });
  });

  it("only goes to a place that exists, so a thing to do stays one", () => {
    expect(readCommand("go to the gym today at 5")).toBeNull();
    expect(readCommand("open a bank account tmrw")).toBeNull();
    expect(readCommand("show rahul the deck friday")).toBeNull();
    expect(readCommand("view the apartment on saturday")).toBeNull();
  });
});

describe("what was spent", () => {
  it.each([
    ["spent 500 on hosting", 500, "Hosting"],
    ["paid rs 1,200 for the domain", 1200, "The domain"],
    ["i spent ₹2k on ads", 2000, "Ads"],
    ["bought $49 of figma", 49, "Figma"],
    ["paid 1.5 lakh to the designer", 150000, "The designer"],
    ["hosting cost 500", 500, "Hosting"],
    ["the domain came to 1,200", 1200, "Domain"],
    ["expense: 300 coffee with client", 300, "Coffee with client"],
  ])("'%s' is %d on %s", (line, amount, what) => {
    expect(readCommand(line)).toEqual({ do: "spend", amount, what, daysAgo: 0 });
  });

  it("hears the day said after a quick spend, and last night as yesterday", () => {
    expect(readCommand("zomato 450 last night")).toEqual({ do: "spend", amount: 450, what: "Zomato", daysAgo: 1 });
    expect(readCommand("uber 340 this morning")).toEqual({ do: "spend", amount: 340, what: "Uber", daysAgo: 0 });
    expect(readCommand("spent 800 on a cab last night")).toEqual({ do: "spend", amount: 800, what: "A cab", daysAgo: 1 });
  });

  it("hears yesterday, and money that came back", () => {
    expect(readCommand("spent 800 on a cab yesterday")).toEqual({ do: "spend", amount: 800, what: "A cab", daysAgo: 1 });
    expect(readCommand("got a refund of 500 from aws")).toEqual({ do: "spend", amount: -500, what: "Refund: aws", daysAgo: 0 });
  });

  it("leaves what is still to be paid a thing to do, and what is not money alone", () => {
    expect(readCommand("pay 500 for hosting tomorrow")).toBeNull();
    expect(readCommand("spend an hour on the deck")).toBeNull();
    expect(readCommand("my score was 85")).toBeNull();
    expect(readCommand("the exam cost me 3 hours")).toBeNull();
    // Nothing said about what it was for: nothing to log it as.
    expect(readCommand("spent 500")).toBeNull();
  });
});

describe("a new contact", () => {
  it("reads who, where they are, and how to reach them", () => {
    expect(readCommand("add contact rahul nair from ms puc, 98765 43210, Rahul@mspuc.in")).toEqual({
      do: "contact",
      name: "MS PUC",
      person: "Rahul Nair",
      phone: "98765 43210",
      email: "rahul@mspuc.in",
    });
  });

  it.each([
    ["new contact oakridge international", "Oakridge International", null],
    ["add a new lead: Priya Sharma, Oakridge", "Oakridge", "Priya Sharma"],
    ["save contact meera at GIG International +91 98450 12345", "GIG International", "Meera"],
    ["create client unifloe", "Unifloe", null],
  ])("reads '%s'", (line, name, person) => {
    expect(readCommand(line)).toMatchObject({ do: "contact", name, person });
  });

  it("keeps a capital a person chose, and does not take a year for a phone", () => {
    expect(readCommand("add contact deVries from ABN")).toMatchObject({ name: "ABN", person: "deVries" });
    expect(readCommand("add contact class of 2026")).toMatchObject({ phone: null });
  });

  it("is only a contact when one was asked for", () => {
    expect(readCommand("add milk to the list")).toBeNull();
    expect(readCommand("contact the vendor friday")).toBeNull();
    expect(readCommand("add contact")).toBeNull();
  });
});

describe("money that came in", () => {
  it.each([
    ["got salary 50k", -50000, "Salary"],
    ["received 5000 from rahul", -5000, "From rahul"],
    ["stipend credited 12000", -12000, "Stipend"],
    ["salary credited: 45000", -45000, "Salary"],
  ])("reads '%s'", (line, amount, what) => {
    expect(readCommand(line)).toEqual({ do: "spend", amount, what, daysAgo: 0 });
  });

  it("is never a count of something else", () => {
    expect(readCommand("got 3 marks")).toBeNull();
    expect(readCommand("made 2 friends")).toBeNull();
  });
});

describe("something paid again and again", () => {
  it.each([
    ["netflix 649 monthly", "Netflix", 649, "monthly", null],
    ["spotify 119 a month", "Spotify", 119, "monthly", null],
    ["aws 3000 every month on the 5th", "AWS", 3000, "monthly", 5],
    ["domain 900 yearly", "Domain", 900, "yearly", null],
  ])("reads '%s' as a running cost", (line, title, amount, cycle, day) => {
    expect(readCommand(line)).toEqual({ do: "cost", title, amount, cycle, day });
  });

  it("is not money coming in, and not a one-off", () => {
    expect(readCommand("salary 50000 monthly")).toBeNull();
    expect(readCommand("uber 340")).toMatchObject({ do: "spend", amount: 340 });
  });
});

describe("money in, and money paid again and again", () => {
  it.each([
    ["got salary 50k", -50000, "Salary"],
    ["received 5000 from rahul", -5000, "From rahul"],
    ["stipend credited 12000", -12000, "Stipend"],
    ["salary credited: 45000", -45000, "Salary"],
  ])("'%s' is money in", (line, amount, what) => {
    expect(readCommand(line)).toMatchObject({ do: "spend", amount, what });
  });

  it("is a running cost when it says how often", () => {
    expect(readCommand("netflix 649 monthly")).toEqual({ do: "cost", title: "Netflix", amount: 649, cycle: "monthly", day: null });
    expect(readCommand("spotify 119 a month")).toMatchObject({ title: "Spotify", cycle: "monthly" });
    expect(readCommand("aws 3000 every month on the 5th")).toEqual({ do: "cost", title: "AWS", amount: 3000, cycle: "monthly", day: 5 });
    expect(readCommand("domain 900 yearly")).toMatchObject({ cycle: "yearly" });
  });

  it("is neither for a count, or for pay that comes in", () => {
    expect(readCommand("got 3 marks")).toBeNull();
    expect(readCommand("salary 50000 monthly")).toBeNull();
    // Said once, it is still what was spent.
    expect(readCommand("uber 340")).toMatchObject({ do: "spend", amount: 340 });
  });
});
