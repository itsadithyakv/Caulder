import { beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { migrate } from "../db/migrations";
import { createCompany } from "../repositories/companies";
import { createLead, findLead } from "../repositories/leads";
import { leadInput } from "@shared/domain";
import { readCapture } from "@shared/capture";
import { readQuestion } from "@shared/questions";
import { BRAIN_SECTION_LIST } from "@shared/brain";
import { OTHER_RULES, alike, isRule, isRulePage, ruleSubject, sortLines } from "@shared/rules";
import { getPage, newPage, savePage } from "./brain";
import { applySort, rulesOn, sortPlan } from "./howwework";
import { remember } from "./remember";

/**
 * How we work (PLAN.md, part eleven): a rule the company keeps has a page of
 * its own, by its subject; what was remembered can be sorted onto those
 * pages, a line at a time and only on a yes; and the rules on a subject are
 * read back where they are used.
 */

const NOW = new Date("2026-10-13T06:00:00Z");
const CLOCK = { today: "2026-10-13", now: 600 };

let db: Database.Database;
let companyId: string;

beforeEach(() => {
  db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrate(db);
  companyId = createCompany(db, { name: "Unifloe", accent: "blue", timezone: "Asia/Kolkata" }).id;
});

const say = (said: string, topic: string | null = null, pageId: string | null = null, day = "2026-10-13") =>
  remember(db, { companyId, pageId, topic, said, fact: null, day }, NOW);

describe("what a rule is, and where it belongs", () => {
  it("knows a rule from a fact, a task and a remark", () => {
    for (const line of ["we invoice on the 1st, always", "we never discount retainers", "we don't take calls before 10", "no calls before 10", "our policy is 50% upfront", "as a rule we reply within a day", "always get the brief signed first"]) {
      expect(isRule(line), line).toBe(true);
    }
    for (const line of ["our gst number is 29ABCDE1234F1Z5", "harbour pay on the 5th", "the printer on fourth takes A3", "call maya tomorrow", "pricing page feels cluttered"]) {
      expect(isRule(line), line).toBe(false);
    }
  });

  it("puts a rule on the subject its words are about, and on a page of its own when they are about none", () => {
    expect(ruleSubject("we invoice on the 1st, always")).toBe("Billing and payment");
    expect(ruleSubject("we never discount retainers")).toBe("Pricing and discounts");
    expect(ruleSubject("we don't take calls before 10")).toBe("Hours and replies");
    expect(ruleSubject("we always get the contract signed before starting")).toBe("Clients");
    expect(ruleSubject("we never share passwords with freelancers")).toBe("Suppliers and tools");
    expect(ruleSubject("we never work with tobacco brands")).toBe(OTHER_RULES);
    expect(isRulePage("billing and payment")).toBe(true);
    expect(isRulePage("Things to remember")).toBe(false);
  });

  it("knows two rules about the same thing, whatever number changed", () => {
    expect(alike("we invoice on the 1st", "we invoice on the 15th now")).toBe(true);
    expect(alike("we never discount retainers", "retainers can be discounted 10% for a year paid up front")).toBe(true);
    expect(alike("payment terms are 15 days", "payment terms are net 30")).toBe(true);
    expect(alike("we invoice on the 1st", "we never discount retainers")).toBe(false);
    expect(alike("we reply within a day", "deposits are 50% upfront")).toBe(false);
  });
});

describe("a rule said to the line", () => {
  it("is read as a memory on its subject's page, which the line names before Enter", () => {
    const reading = readCapture("we never discount retainers", { contacts: [], pages: [] }, CLOCK);
    expect(reading).toMatchObject({ kind: "memory", page: null, topic: "Pricing and discounts", because: "it is a rule you keep" });
    // The page there already is, when there is one - and a page the line names wins.
    const pages = [{ id: "p1", title: "Pricing and discounts", section: "playbooks" }];
    expect(readCapture("we never discount retainers", { contacts: [], pages }, CLOCK)).toMatchObject({ page: { id: "p1" }, topic: null });
    // What the company does as a matter of course is a rule, whatever day is in it - and an appointment is not.
    expect(readCapture("we invoice on the 1st", { contacts: [], pages: [] }, CLOCK)).toMatchObject({ kind: "memory", topic: "Billing and payment" });
    expect(readCapture("no calls before 10", { contacts: [], pages: [] }, CLOCK)).toMatchObject({ kind: "memory", topic: "Hours and replies" });
    expect(readCapture("we meet on the 5th", { contacts: [], pages: [] }, CLOCK).kind).toBe("task");
    // What something of the company's is, is a fact and not a rule.
    expect(readCapture("our gst number is 29ABCDE1234F1Z5", { contacts: [], pages: [] }, CLOCK).topic).toBe("Things to remember");
  });

  it("starts the subject's page in How we work the first time, and adds to it after", () => {
    const first = say("we never discount retainers", "Pricing and discounts");
    expect(first).toMatchObject({ title: "Pricing and discounts", started: ["Pricing and discounts"] });
    expect(getPage(db, first.pageId)).toMatchObject({ section: "playbooks", template: "rules" });
    const second = say("rush jobs are charged at 1.5 times", "Pricing and discounts");
    expect(second).toMatchObject({ pageId: first.pageId, started: [], like: null });
    // Anything else still starts its page in Remembered.
    expect(getPage(db, say("the printer on fourth takes A3", "Things to remember").pageId).section).toBe("remembered");
  });

  it("hands back the rule it may be meant instead of, and lets nothing go by itself", () => {
    const first = say("we invoice on the 1st", "Billing and payment");
    const second = say("we invoice on the 15th now", "Billing and payment");
    expect(second.like?.says).toBe("we invoice on the 1st");
    expect(getPage(db, first.pageId).body).toContain("we invoice on the 1st");
    expect(getPage(db, first.pageId).body).toContain("we invoice on the 15th now");
  });

  it("is read back where it is used, the newest first, and says nothing where nothing was said", () => {
    say("we invoice on the 1st", "Billing and payment", null, "2026-09-01");
    say("deposits are 50% upfront, always", "Billing and payment", null, "2026-10-02");
    const shown = rulesOn(db, companyId, "Billing and payment", 1);
    expect(shown).toMatchObject({ title: "Billing and payment", total: 2, rules: [{ says: "deposits are 50% upfront, always", day: "2026-10-02" }] });
    expect(rulesOn(db, companyId, "Pricing and discounts")).toEqual({ pageId: null, title: "Pricing and discounts", rules: [], total: 0 });
    expect(() => rulesOn(db, companyId, "Things to remember")).toThrow("not a subject");
  });

  it("is what the line answers a question about a policy from", () => {
    expect(readQuestion("what is our policy on refunds", CLOCK)).toEqual({ ask: "recall", about: "refunds", label: "the rule on refunds" });
    expect(readQuestion("what's the rule about discounts?", CLOCK)).toMatchObject({ ask: "recall", about: "discounts" });
    expect(readQuestion("how do we handle late payers", CLOCK)).toMatchObject({ ask: "recall", about: "late payers" });
  });
});

describe("a page of what was remembered, sorted", () => {
  const pile = () => {
    createLead(db, companyId, leadInput.parse({ name: "Harbour Coffee Roasters", contactPerson: "Maya Ellis", notes: "Prefers email." }));
    const page = say("we invoice on the 1st, always", "Things to remember", null, "2026-09-01");
    for (const line of ["we never discount retainers", "Harbour Coffee Roasters pay on the 5th", "the printer on fourth takes A3", "The printer on fourth takes A3."]) {
      say(line, null, page.pageId);
    }
    return page.pageId;
  };

  it("offers each line a home by what can be checked here, and moves nothing", () => {
    const pageId = pile();
    const before = getPage(db, pageId).body;
    const plan = sortPlan(db, companyId, pageId);
    expect(plan.lines.map((line) => [line.says, line.to])).toEqual([
      ["we invoice on the 1st, always", { kind: "rule", subject: "Billing and payment" }],
      ["we never discount retainers", { kind: "rule", subject: "Pricing and discounts" }],
      ["Harbour Coffee Roasters pay on the 5th", { kind: "contact", id: expect.any(String), name: "Harbour Coffee Roasters" }],
      ["the printer on fourth takes A3", null],
      ["The printer on fourth takes A3.", { kind: "twice", as: "the printer on fourth takes A3" }],
    ]);
    expect(getPage(db, pageId).body).toBe(before);
  });

  it("makes the moves that were said yes to, with their days, and leaves the rest", () => {
    const pageId = pile();
    const plan = sortPlan(db, companyId, pageId);
    const moves = plan.lines.filter((line) => line.to !== null && !line.says.includes("discount")).map((line) => ({ raw: line.raw, to: line.to }));
    expect(applySort(db, companyId, { pageId, moves }, NOW)).toEqual({ moved: 3 });

    const left = getPage(db, pageId).body;
    expect(left).toContain("we never discount retainers");
    expect(left).toContain("the printer on fourth takes A3 _(");
    expect(left).not.toContain("we invoice on the 1st");
    expect(left).not.toContain("The printer on fourth takes A3.");
    // The rule, on its subject's page, with the day it was set.
    const billing = rulesOn(db, companyId, "Billing and payment");
    expect(billing.rules).toEqual([{ says: "we invoice on the 1st, always", fact: null, day: "2026-09-01" }]);
    expect(getPage(db, billing.pageId ?? "").section).toBe("playbooks");
    // The line about a contact, under their Keep in mind, after what was there.
    const lead = findLead(db, plan.lines[2]?.to?.kind === "contact" ? plan.lines[2].to.id : "");
    expect(lead?.notes).toBe("Prefers email.\nHarbour Coffee Roasters pay on the 5th (2026-10-13)");
  });

  it("leaves a rule that is home where it is, and refuses a page of another company", () => {
    const home = say("we invoice on the 1st, always", "Billing and payment");
    say("deposits are 50% upfront, always", null, home.pageId);
    say("we never discount retainers", null, home.pageId);
    expect(sortPlan(db, companyId, home.pageId).lines.map((line) => line.to)).toEqual([null, null, { kind: "rule", subject: "Pricing and discounts" }]);

    const other = createCompany(db, { name: "Other", accent: "blue", timezone: "Asia/Kolkata" }).id;
    expect(() => sortPlan(db, other, home.pageId)).toThrow("another company");
    expect(() => applySort(db, companyId, { pageId: home.pageId, moves: [] }, NOW)).toThrow("Nothing was chosen to move");
  });

  it("does not take a page somebody wrote elsewhere for a subject's page", () => {
    const page = newPage(db, companyId, "legal", "page", NOW);
    savePage(db, page.id, { title: "Billing and payment", body: "The terms in our contract.", fields: page.fields, secrets: {}, baseRevision: page.revision }, NOW);
    const pile = say("we invoice on the 1st, always", "Things to remember");
    const [line] = sortPlan(db, companyId, pile.pageId).lines;
    expect(() => applySort(db, companyId, { pageId: pile.pageId, moves: [{ raw: line?.raw ?? "", to: line?.to }] }, NOW)).toThrow("not a page in How we work");
    expect(getPage(db, pile.pageId).body).toContain("we invoice on the 1st");
  });

  it("sorts by the words alone when it is given nobody to know", () => {
    const sorted = sortLines([{ raw: "- a", says: "we never discount retainers", fact: null, day: "2026-10-13" }], () => null, { title: "Things to remember", rules: false });
    expect(sorted[0]?.to).toEqual({ kind: "rule", subject: "Pricing and discounts" });
  });
});

describe("fewer shelves", () => {
  it("files every section under one of the four things a brain is for, with How we work where the playbooks were", () => {
    expect(BRAIN_SECTION_LIST.every((section) => ["is", "works", "going", "learned"].includes(section.group))).toBe(true);
    expect(BRAIN_SECTION_LIST.find((section) => section.id === "playbooks")).toMatchObject({ label: "How we work", group: "works", templates: ["rules", "playbook", "call-script"] });
    // What is no longer offered is still a kind of page a company may already have.
    expect(BRAIN_SECTION_LIST.flatMap((section) => section.templates)).not.toEqual(expect.arrayContaining(["fundraise", "cap-table", "milestone", "competitor", "experiment"]));
    expect(() => newPage(db, companyId, "money", "cap-table", NOW)).not.toThrow();
  });
});
