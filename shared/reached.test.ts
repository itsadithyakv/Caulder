import { describe, expect, it } from "vitest";
import { cannotReach, queueFor, saySent, NOBODY_SENT, REACHED, REACHED_LABEL } from "./reached";

const lead = (name: string, over: Partial<{ phone: string | null; linkedin: string | null; instagram: string | null; doNotContact: boolean }> = {}) => ({
  name,
  phone: null,
  linkedin: null,
  instagram: null,
  doNotContact: false,
  ...over,
});

describe("who can be written to where", () => {
  it("needs a number for WhatsApp and a profile for the other two", () => {
    expect(cannotReach("whatsapp", lead("A", { phone: "98765 43210" }))).toBeNull();
    expect(cannotReach("whatsapp", lead("A"))).toBe("no phone number");
    expect(cannotReach("linkedin", lead("A", { linkedin: "linkedin.com/in/a" }))).toBeNull();
    expect(cannotReach("linkedin", lead("A", { phone: "98765 43210" }))).toBe("no LinkedIn profile");
    expect(cannotReach("instagram", lead("A"))).toBe("no Instagram profile");
  });

  it("never offers somebody marked do not contact, whatever is on their page", () => {
    const barred = lead("A", { phone: "98765 43210", linkedin: "linkedin.com/in/a", doNotContact: true });
    expect(cannotReach("whatsapp", barred)).toBe("marked do not contact");
    expect(cannotReach("linkedin", barred)).toBe("marked do not contact");
  });
});

describe("the queue a walk goes through", () => {
  const picked = [
    lead("Harbour", { phone: "111 222 3333" }),
    lead("Nordlys", { linkedin: "linkedin.com/in/jonas" }),
    lead("Atlas", { phone: "444 555 6666", doNotContact: true }),
    lead("Kettle", { phone: "777 888 9999" }),
  ];

  it("keeps the order they were listed in, and says who is left out and why", () => {
    const { queue, leftOut } = queueFor("whatsapp", picked);
    expect(queue.map((each) => each.name)).toEqual(["Harbour", "Kettle"]);
    expect(leftOut.map(({ lead: each, why }) => `${each.name}: ${why}`)).toEqual(["Nordlys: no phone number", "Atlas: marked do not contact"]);
  });

  it("loses nobody: everybody ticked is in one list or the other", () => {
    for (const channel of ["whatsapp", "linkedin", "instagram"] as const) {
      const { queue, leftOut } = queueFor(channel, picked);
      expect(queue.length + leftOut.length).toBe(picked.length);
    }
  });
});

describe("what is said on Today about who was written to", () => {
  it("says nothing when nobody was", () => {
    expect(saySent(NOBODY_SENT)).toBe("");
  });

  it("counts people, who answered and who is waiting, and how long the longest has", () => {
    expect(saySent({ people: 6, answered: 2, waiting: 4, oldestDays: 5 })).toBe("6 written to this week: 2 answered, 4 waiting - the oldest 5 days.");
    expect(saySent({ people: 1, answered: 0, waiting: 1, oldestDays: 1 })).toBe("1 written to this week: 0 answered, 1 waiting - the oldest 1 day.");
  });

  it("leaves the age out when nobody is waiting, or they were written to today", () => {
    expect(saySent({ people: 2, answered: 2, waiting: 0, oldestDays: null })).toBe("2 written to this week: 2 answered, 0 waiting.");
    expect(saySent({ people: 3, answered: 0, waiting: 3, oldestDays: 0 })).toBe("3 written to this week: 0 answered, 3 waiting.");
  });
});

describe("the filter's three answers", () => {
  it("has a label for each", () => {
    expect(REACHED.map((each) => REACHED_LABEL[each])).toEqual(["Not written to", "No answer in 3 days", "Answered"]);
  });
});
