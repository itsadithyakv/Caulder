import { describe, expect, it } from "vitest";
import { readCapture, REMEMBER_PAGE, type Known } from "./capture";
import { spendIn } from "./commands";

/**
 * One line, and where it belongs: the six places the company's line has, and
 * the lines each must claim and must leave to another.
 */

const CLOCK = { today: "2026-10-12", now: 10 * 60 }; // a Monday morning

const known: Known = {
  contacts: [
    { id: "c1", name: "Harbour Coffee Roasters", person: "Maya Ellis" },
    { id: "c2", name: "Kettle & Crumb Bakery", person: "Priya Nair" },
    { id: "c3", name: "Oakridge International School", person: null },
  ],
  pages: [
    { id: "p1", title: "Pricing", section: "plan" },
    { id: "p2", title: "Hosting", section: "tools" },
  ],
};

const read = (line: string) => readCapture(line, known, CLOCK);
const kind = (line: string) => read(line).kind;

describe("a prefix", () => {
  it("says so outright, and is taken off what is kept", () => {
    expect(read("task: the deck")).toMatchObject({ kind: "task", text: "the deck" });
    expect(read("note: wifi is down")).toMatchObject({ kind: "note", text: "wifi is down" });
    expect(read("idea: a yearly plan")).toMatchObject({ kind: "idea", text: "a yearly plan" });
    expect(read("remember: harbour pay on the 5th")).toMatchObject({ kind: "memory", text: "harbour pay on the 5th" });
  });

  it("is not a journal's any more", () => {
    // "journal:" used to be one. It is a line like any other now.
    expect(kind("journal: long day")).not.toBe("task");
  });
});

describe("something to do", () => {
  it("is a task when it starts with doing, or says it is meant", () => {
    for (const line of ["send the proposal by friday", "need to renew the domain", "dont forget the gst filing", "submit the grant form tomorrow 5pm"]) {
      expect(kind(line), line).toBe("task");
    }
  });

  it("is a task for the contact it names, when it is still to do", () => {
    expect(read("call priya tomorrow 4pm")).toMatchObject({ kind: "task", contact: { id: "c2" } });
    expect(read("send proposal to oakridge")).toMatchObject({ kind: "task", contact: { id: "c3" } });
    expect(read("i need to email maya")).toMatchObject({ kind: "task", contact: { id: "c1" } });
  });

  it("is guessed at, and says so, when only a when makes it one", () => {
    expect(read("dentist thursday 3pm")).toMatchObject({ kind: "task", soft: true });
  });
});

describe("something that happened with a contact", () => {
  it("goes on their history, as the kind of thing it was", () => {
    expect(read("called maya, she wants the walkthrough next week")).toMatchObject({ kind: "contact", contact: { id: "c1" }, logged: "call" });
    expect(read("met priya at the bakery")).toMatchObject({ kind: "contact", logged: "meeting" });
    // What stays true is kept on them, not on their history (part twelve, phase 49).
    expect(read("priya prefers whatsapp")).toMatchObject({ kind: "contact", contact: { id: "c2" }, logged: "fact", fact: "Priya prefers whatsapp" });
  });

  it("takes what you said to remember about them, without the words that said so", () => {
    expect(read("remember that harbour pay on the 5th")).toMatchObject({
      kind: "contact",
      contact: { id: "c1" },
      text: "harbour pay on the 5th",
      logged: "fact",
      fact: "Harbour pay on the 5th",
    });
  });

  it("knows a person by a first name of four letters, but not by one that is also a word", () => {
    const people: Known = { contacts: [{ id: "w", name: "Northwind", person: "Will Hart" }, { id: "m", name: "Atlas", person: "Maya Ellis" }] };
    expect(readCapture("maya seemed keen", people, CLOCK).contact).toEqual({ id: "m", name: "Atlas" });
    expect(readCapture("will send the deck on friday", people, CLOCK).contact).toBeNull();
    expect(readCapture("called will hart about the deck", people, CLOCK).contact).toEqual({ id: "w", name: "Northwind" });
  });

  it("is them even when the name is mistyped, if only one answers to it", () => {
    expect(read("oakrigde replied, they are in")).toMatchObject({ kind: "contact", contact: { id: "c3" } });
  });
});

describe("something asked for", () => {
  it("opens a contact to reach them now, when no day is said", () => {
    expect(read("email maya")).toMatchObject({ kind: "command", ask: { do: "open", how: "email", contact: { id: "c1" } } });
    expect(read("call priya")).toMatchObject({ kind: "command", ask: { do: "open", how: "call" } });
  });

  it("sets a detail on a contact who is already one", () => {
    expect(read("priya's number is 98765 43210")).toMatchObject({ kind: "command", ask: { do: "update", phone: "98765 43210" } });
  });

  it("logs money said to be spent, and goes where it is told", () => {
    expect(read("spent 500 on hosting")).toMatchObject({ kind: "command", ask: { do: "spend", amount: 500 } });
    expect(read("go to money")).toMatchObject({ kind: "command", ask: { do: "go", place: "money" } });
    expect(read("add contact rahul nair from ms puc")).toMatchObject({ kind: "command", ask: { do: "contact" } });
  });
});

describe("a sum that was not said to be spent", () => {
  it("is offered as a way to log it, never assumed", () => {
    const line = read("swiggy 320 lunch");
    expect(line.kind).not.toBe("command");
    expect(line.options).toContain("command");
    expect(line.ask).toMatchObject({ do: "spend", amount: 320, what: "Swiggy lunch" });
  });

  it("is read from either side of the thing, and with its currency on it", () => {
    expect(spendIn("figma 1200")).toMatchObject({ amount: 1200, what: "Figma" });
    expect(spendIn("320 for the cab")).toMatchObject({ amount: 320, what: "The cab" });
    expect(spendIn("domain ₹899")).toMatchObject({ amount: 899, what: "Domain" });
    expect(spendIn("ads 2k")).toMatchObject({ amount: 2000, what: "Ads" });
  });

  it("is not an hour, a count, a small number or two numbers", () => {
    for (const line of ["standup 9 am", "room 204 9", "invite 40 people", "chapter 4", "version 12 5", "call back in 20 minutes"]) {
      expect(spendIn(line), line).toBeNull();
    }
  });
});

describe("something to remember", () => {
  it("is a memory when it says to keep it, on the one page for what names none", () => {
    expect(read("remember that the landlord wants notice by the 5th")).toMatchObject({
      kind: "memory",
      text: "the landlord wants notice by the 5th",
      page: null,
      topic: REMEMBER_PAGE,
    });
    expect(kind("fyi the printer on fourth takes a3")).toBe("memory");
  });

  it("leads a fact about the company with what it is", () => {
    expect(read("our gst number is 29ABCDE1234F1Z5")).toMatchObject({ kind: "memory", fact: "Gst number: 29ABCDE1234F1Z5" });
    expect(read("the office wifi is caulder-5g")).toMatchObject({ kind: "memory", fact: "Wifi: caulder-5g" });
  });

  it("goes on the page it is about, when the brain has one", () => {
    expect(read("pricing went up for colleges after the pilot")).toMatchObject({ kind: "memory", page: { id: "p1" }, topic: null });
  });

  it("is guessed at when it is only said the way a fact is", () => {
    expect(read("razorpay settles in two working days")).toMatchObject({ kind: "memory", soft: true });
  });

  it("is not a complaint about how something is behaving", () => {
    expect(kind("the staging server is down")).toBe("note");
  });
});

describe("an idea", () => {
  it("is one floated, pitched or named", () => {
    for (const line of ["what if we charged per classroom", "we could partner with tuition centres", "a referral scheme for schools", "why not a student discount"]) {
      expect(kind(line), line).toBe("idea");
    }
  });

  it("is not asking somebody, or a thing to do said softly", () => {
    expect(kind("could you send the invoice")).not.toBe("idea");
    expect(kind("i should try the new deck on priya")).toBe("task");
  });
});

describe("something to keep safe", () => {
  it("is warned about before it is kept, and never filed as a memory", () => {
    const line = read("aws password is hunter2");
    expect(line.kind).toBe("note");
    expect(line.warn).toMatch(/sealed field/);
    expect(read("remember that the pricing page converts at 4%").warn).toBeNull();
  });
});

describe("anything else", () => {
  it("is a note, guessed, with every other place a chip away", () => {
    const line = read("signup numbers look odd this week");
    expect(line).toMatchObject({ kind: "note", soft: true });
    expect(line.options).toEqual(["task", "memory", "idea", "note"]);
  });

  it("offers the contact's history only when it names one", () => {
    expect(read("maya seemed distracted").options).toContain("contact");
  });
});

describe("what the first blind set taught (11 October 2026)", () => {
  // Classes of miss, not the lines themselves: those are never tuned against (lines.eval.test.ts).
  const accented: Known = { contacts: [{ id: "x", name: "Café Zoë", person: "Renée Dubois" }], pages: [] };

  it("knows a name typed without its accents", () => {
    expect(readCapture("renee wants the logo bigger", accented, CLOCK)).toMatchObject({ kind: "contact", contact: { id: "x" } });
    expect(readCapture("cafe zoe signed off the menu", accented, CLOCK).kind).toBe("contact");
    // And with them, as before.
    expect(readCapture("Renée wants the logo bigger", accented, CLOCK).kind).toBe("contact");
  });

  it("keeps a rule the company works by as a memory, softly", () => {
    for (const line of ["we never start without a deposit", "we don't do logos on their own", "always quote in dollars", "we only take two builds a month"]) {
      expect(read(line), line).toMatchObject({ kind: "memory", soft: true });
    }
    // Even with a when in it: it says how it is done, not that anything is due.
    expect(kind("we always send the report on fridays")).toBe("memory");
    // One person's afternoon is not a rule, and something to do still is.
    expect(kind("i never heard back about the venue")).not.toBe("memory");
    expect(kind("we need to send the report on friday")).toBe("task");
  });

  it("keeps a thing and what it comes to, written with an equals sign", () => {
    expect(read("rush fee = 25% on top")).toMatchObject({ kind: "memory", soft: true });
  });
});

describe("what the second blind set taught (11 October 2026)", () => {
  // Again by class. Each has the lines it must claim and the near ones it must leave alone.
  const studio: Known = {
    contacts: [
      { id: "s1", name: "Studio Palma", person: "Lucia Ortega" },
      { id: "s2", name: "Fieldnote Books", person: "Sam Okafor" },
      { id: "s3", name: "Harbour Coffee Roasters", person: "Maya Ellis" },
    ],
    pages: [],
  };
  const at = (line: string) => readCapture(line, studio, CLOCK);

  it("tells a word that is the thing from the doing of it by what follows", () => {
    expect(kind("quote i saw on a poster - done beats perfect")).not.toBe("task");
    expect(kind("review was fine, nothing to change")).not.toBe("task");
    // The same words giving an order.
    expect(kind("quote the bakery for the menu page")).toBe("task");
    expect(kind("review the contract")).toBe("task");
  });

  it("takes an order given about something for a task, whoever it names and whatever happened", () => {
    expect(at("get the contract signed before showing harbour the designs").kind).toBe("task");
    expect(at("send the deck maya asked for").kind).toBe("task");
    // Something that happened, with a word that is also an order in it.
    expect(at("email sent to maya about the delay").kind).toBe("contact");
    expect(at("call with harbour went well").kind).toBe("contact");
  });

  it("hears an obligation with nobody said, and something still owed", () => {
    expect(at("should probably ask maya for a case study").kind).toBe("task");
    expect(kind("must renew the ssl cert")).toBe("task");
    expect(kind("vat return for q3 - still not done")).toBe("task");
    // A thought floated is still one.
    expect(kind("should we try a referral scheme")).toBe("idea");
    expect(kind("should try a pop-up shop")).toBe("idea");
  });

  it("knows the verbs a company is run with", () => {
    for (const line of ["refund the deposit to the print shop", "raise an invoice for the audit", "top up the ad account", "open a savings account for tax", "courier the samples to pune"]) {
      expect(kind(line), line).toBe("task");
    }
    expect(kind("top priority this week is the launch")).not.toBe("command");
    expect(kind("the build is red, look at it after standup")).toBe("task");
  });

  it("knows a contact by a three-letter first name, and not by a word that is also one", () => {
    expect(at("sam wants the index redone").contact?.id).toBe("s2");
    const words: Known = { contacts: [{ id: "d", name: "Northwind", person: "Dev Anand" }], pages: [] };
    expect(readCapture("dev server is on port 5173", words, CLOCK).contact).toBeNull();
  });

  it("does not take the company's own word for itself as a contact", () => {
    expect(at("open a current account for the studio").contact).toBeNull();
    expect(at("the studio was registered in march 2021").contact).toBeNull();
    // Theirs, said as theirs.
    expect(at("studio palma signed").contact?.id).toBe("s1");
    expect(at("the harbour invoice went out").contact?.id).toBe("s3");
  });

  it("keeps something of a contact's, and a day gone by, off the task list", () => {
    expect(at("maya's anniversary is 9 june, she said so at lunch").kind).toBe("contact");
    expect(at("harbour is on the annual plan now").kind).toBe("contact");
    expect(at("harbour needs the build tonight").kind).toBe("task");
    expect(kind("the company was registered on 14 march 2021")).toBe("memory");
    expect(kind("signups halved on saturday")).toBe("note");
    // Still to come, however it is said.
    expect(kind("the review was moved to friday")).toBe("task");
  });

  it("reaches a contact now, said two more ways", () => {
    expect(at("write to maya ellis now").ask).toMatchObject({ do: "open", how: "email", contact: { id: "s3" } });
    expect(at("get sam on the phone").ask).toMatchObject({ do: "open", how: "call", contact: { id: "s2" } });
    expect(at("write to maya tomorrow about the delay").kind).toBe("task");
  });

  it("hears an idea in more than 'what if'", () => {
    for (const line of [
      "maybe a job board for local designers",
      "thinking of running a paid audit week",
      "someday: sell the starter kit as a product",
      "there might be a market for fixing abandoned shopify themes",
      "newsletter for cafe owners about getting found online",
      "onboarding kit: everything a new client needs in one zip",
      "launch a referral programme for past clients",
      "offer hosting and care as one price",
      "ek booking widget for salons",
      "charge per page instead of per project? simpler to quote",
    ]) {
      expect(kind(line), line).toBe("idea");
    }
    // An idea whoever it names, and whatever when its terms have in them.
    expect(at("white-label the menu app we made for harbour").kind).toBe("idea");
    expect(at("harbour's regulars would pay for a brew log, we could build that").kind).toBe("idea");
    expect(kind("productise the audit - flat fee, report in 3 days")).toBe("idea");
    // Not ideas: a thing that exists, a meeting, what somebody said.
    expect(kind("launch the bakery site on friday")).toBe("task");
    expect(kind("a workshop on friday at 4")).toBe("task");
    expect(at("maya said we could push the launch").kind).toBe("contact");
    expect(kind("is the invoice paid?")).not.toBe("idea");
  });

  it("keeps how the company runs as a memory, softly", () => {
    for (const line of [
      "payroll runs on the last friday of every month",
      "the newsletter goes out weekly on thursdays",
      "office hours are 9 to 5, mon-fri",
      "the illustrator charges 40 usd per hour",
      "late payment interest is 1.5% per month",
      "we stopped taking logo-only jobs last year",
      "don't start work before the deposit clears",
      "we invoice in pounds but always quote in dollars",
      "the tax year runs april to march",
      "clients get one free revision",
    ]) {
      expect(read(line), line).toMatchObject({ kind: "memory", soft: true });
    }
    // Something to do, and something that is misbehaving, are not how it runs.
    expect(kind("run payroll on the last friday of every month")).toBe("task");
    expect(kind("don't forget the deposit")).toBe("task");
    expect(kind("the newsletter is late again")).toBe("note");
    // "Late" in the name of the thing is not a complaint about it.
    expect(kind("late fee is 2% a month")).toBe("memory");
  });

  it("keeps an opinion as a note, whatever day is in it", () => {
    for (const line of [
      "fridays are useless for deep work",
      "the conference talks were worth the trip",
      "everyone at the meetup was asking about pricing pages",
      "not sure the weekly review is doing anything",
      "weird, bounce rate jumped on tuesday",
      "berlin in january is going to be grim",
    ]) {
      expect(kind(line), line).toBe("note");
    }
    expect(read("not sure the weekly review is doing anything").soft).toBeUndefined();
    // A fact is still a fact.
    expect(kind("the printer on fourth takes A3")).toBe("memory");
  });
});

describe("a short first name one letter out (part twelve, phase 47)", () => {
  it("is asked about after a word for reaching somebody", () => {
    const read = readCapture("call priyaa tmrw", known, CLOCK);
    expect(read.contact).toMatchObject({ id: "c2" });
    expect(read.doubt?.text).toMatch(/Priya|Kettle/);
  });

  it("is not a wrong letter, nor a name said without reaching for them", () => {
    expect(readCapture("call prita tmrw", known, CLOCK).contact).toBeNull();
    expect(readCapture("priyaa is great", known, CLOCK).contact).toBeNull();
  });
});

describe("a word the line has been told about (part twelve, phase 48)", () => {
  const two = { contacts: [...known.contacts, { id: "c9", name: "Priya Sharma Design", person: "Priya Sharma" }] };

  it("asks which one, and says which word it asked about", () => {
    const read = readCapture("call priya tmrw", two, CLOCK);
    expect(read.doubt).toMatchObject({ word: "priya" });
    expect(readCapture("call priyaa tmrw", known, CLOCK).doubt).toMatchObject({ word: "priyaa" });
  });

  it("asks nothing once it has been told", () => {
    const told = { ...two, names: [{ said: "priya", contact: "c9" }] };
    const read = readCapture("call priya tmrw", told, CLOCK);
    expect(read.contact).toMatchObject({ id: "c9" });
    expect(read.doubt).toBeNull();
    expect(readCapture("call pk tmrw", { ...known, names: [{ said: "pk", contact: "c2" }] }, CLOCK).contact).toMatchObject({ id: "c2" });
  });
});

describe("what stays true about a contact (part twelve, phase 49)", () => {
  it("is a fact on them: what they prefer, a number of theirs, something of theirs and what it is", () => {
    expect(read("maya prefers whatsapp over email")).toMatchObject({ kind: "contact", contact: { id: "c1" }, logged: "fact", fact: "Maya prefers whatsapp over email" });
    expect(read("harbour gst no 29ABCDE1234F1Z5")).toMatchObject({ logged: "fact", contact: { id: "c1" } });
    expect(read("priya's daughter is called aarav")).toMatchObject({ logged: "fact", contact: { id: "c2" } });
    expect(read("fyi oakridge's term starts in jan")).toMatchObject({ logged: "fact", contact: { id: "c3" }, fact: "Oakridge's term starts in jan" });
  });

  it("keeps the day a fact ends, and a birthday's next day", () => {
    expect(read("priya is on leave till the 20th")).toMatchObject({ logged: "fact", until: "2026-10-20" });
    expect(read("remember priya bday 3 may")).toMatchObject({ logged: "fact", birthday: "2027-05-03" });
  });

  it("is not an hour, nor something done", () => {
    expect(read("priya's call is at 4").logged).not.toBe("fact");
    expect(read("maya's team approved it").logged).not.toBe("fact");
    expect(read("ask maya if she prefers whatsapp").kind).toBe("task");
  });

  it("takes a call and what is next from one line", () => {
    const read1 = read("called priya - no answer, try again thursday");
    expect(read1).toMatchObject({ kind: "contact", contact: { id: "c2" }, logged: "call" });
    expect(read1.then).toMatchObject({ day: "2026-10-15" });
    expect(read("tried calling maya, no answer, try again monday").then).toMatchObject({ day: "2026-10-19" });
  });

  it("reads money in from a contact as their invoice paid, not a refund", () => {
    expect(read("got 2400 from harbour").ask).toEqual({ do: "paid", contact: { id: "c1", name: "Harbour Coffee Roasters" }, amount: 2400 });
    expect(read("got 2.4k from harbour").ask).toMatchObject({ do: "paid", amount: 2400 });
    expect(read("harbour paid").ask).toMatchObject({ do: "paid", amount: null });
    expect(read("maya has paid 1,200").ask).toMatchObject({ do: "paid", amount: 1200 });
  });

  // Logic pass, 23 October 2026: each of these marked an invoice paid that had not been.
  it("never reads money that has not come as money in", () => {
    for (const line of [
      "harbour hasn't paid",
      "maya still hasn't paid",
      "harbour has not paid",
      "harbour never paid",
      "remind harbour they haven't paid",
      "payment from harbour is late",
      "money from harbour still hasn't come",
      "payment from maya still pending",
    ]) {
      expect(read(line).ask?.do, line).not.toBe("paid");
    }
  });

  it("records money against the contact who paid, not another the line names", () => {
    expect(read("got 2400 from maya for the kettle job").ask).toMatchObject({ do: "paid", contact: { id: "c1" }, amount: 2400 });
    expect(read("received 5000 from priya, need to pay harbour").ask).toMatchObject({ do: "paid", contact: { id: "c2" }, amount: 5000 });
  });

  it("never sets somebody else's number or address as the contact's own", () => {
    for (const line of [
      "maya's accountant's email is acc@ledger.com",
      "maya's assistant's number is 98450 12345",
      "maya gave me sam's number 98450 12345",
      "maya said to email her boss at boss@harbour.com",
      "priya's partner's number 98450 12345",
    ]) {
      expect(read(line).ask?.do, line).not.toBe("update");
    }
    // Their own still is.
    expect(read("maya's number is 98450 12345").ask).toMatchObject({ do: "update", contact: { id: "c1" }, phone: "98450 12345" });
    expect(read("harbour email is maya@harbour.com").ask).toMatchObject({ do: "update", email: "maya@harbour.com" });
  });
});

describe("what the company pays for, and which account it is on", () => {
  const on = (line: string) => readCapture(line, known, { today: "2026-10-25", now: 600 });

  it("keeps a renewal as a running cost on its day, a domain as the domain it is", () => {
    expect(on("My unifloe.app domain expires on the 27th next year. It renews for ₹2,639.51").ask).toMatchObject({
      do: "cost",
      title: "unifloe.app",
      amount: 2640,
      on: "2027-10-27",
      domain: true,
      years: 1,
      paid: false,
    });
    expect(on("Google Workspace renews on 3 feb for 8400").ask).toMatchObject({ do: "cost", title: "Google Workspace", amount: 8400, on: "2027-02-03", domain: false });
  });

  it("keeps one paid ahead as paid, and due again when the years are up", () => {
    expect(on("I paid 20000 for the domain for 5 years. Starting today.").ask).toMatchObject({
      do: "cost",
      title: "Domain",
      amount: 20000,
      on: "2026-10-25",
      domain: true,
      years: 5,
      paid: true,
    });
    // A sum that is not for years is still only money spent.
    expect(on("paid 2400 for the cab").ask).toMatchObject({ do: "spend", amount: 2400 });
  });

  it("leaves what is not the company's spending to the readings it was", () => {
    expect(on("my passport expires in march").ask).toBeNull();
    expect(on("renew the domain on friday").kind).toBe("task");
  });

  it("knows the account a service was bought with, and the one it changed from", () => {
    expect(on("I purchased the domain with adithya@gmail.com").ask).toEqual({ do: "account", title: "Domain", email: "adithya@gmail.com", was: null, domain: true });
    expect(on("i use resend with studio@gmail.com").ask).toMatchObject({ do: "account", title: "Resend", email: "studio@gmail.com" });
    expect(on("I changed leaflet's google drive permission email from leafletapp@gmail.com to adithya@gmail.com").ask).toMatchObject({
      do: "account",
      title: "Leaflet google drive",
      email: "adithya@gmail.com",
      was: "leafletapp@gmail.com",
    });
    // Somebody with an email is still somebody.
    expect(on("add contact zoya zoya@kiln.studio").ask).toMatchObject({ do: "contact", email: "zoya@kiln.studio" });
  });
});
