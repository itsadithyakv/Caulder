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
