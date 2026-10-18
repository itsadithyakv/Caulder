import { beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { migrate } from "../db/migrations";
import { createCompany } from "../repositories/companies";
import { createLead, listLeads, logActivity } from "../repositories/leads";
import { leadInput } from "@shared/domain";
import { hasTopic, needsOf, rareWords, sayParts, tokensIn } from "@shared/relevant";
import { newPage, savePage } from "./brain";
import { buildDossier } from "./dossier";
import { seedDemo } from "./demo";
import { BRIEF_PAGE, briefOf, partsOf, relevantTo } from "./relevant";

/**
 * What goes with a question (PLAN.md, part ten, phase 37): the company in
 * brief, and only the parts of the records the question is about. The whole
 * company goes when it is asked for, and not otherwise.
 */

const NOW = new Date("2026-10-13T06:00:00Z");
const ROOM = { characters: 450_000, contacts: 40 };

let db: Database.Database;
let companyId: string;

beforeEach(() => {
  db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrate(db);
  companyId = createCompany(db, { name: "Unifloe", accent: "blue", timezone: "Asia/Kolkata" }).id;
});

const text = (documents: readonly { text: string }[]) => documents.map((document) => document.text).join("\n");
const size = (documents: readonly { text: string }[]) => text(documents).length;

describe("what a question's words point at", () => {
  it("reads the parts of the records a question is about", () => {
    expect(needsOf("how long does the money last?")).toMatchObject({ whole: false, parts: ["Money now"], sections: ["money"], besides: "none" });
    expect(needsOf("which deals should I chase this week?")).toMatchObject({ parts: ["The funnel", "Why deals were lost", "Every deal", "Open tasks"], besides: "open" });
    expect(needsOf("what do customers object to on calls?").sections).toEqual(expect.arrayContaining(["playbooks", "customers"]));
    expect(needsOf("how do we bill retainers?").sections).toEqual(expect.arrayContaining(["remembered", "products"]));
  });

  it("sends the whole company only when that is asked for", () => {
    expect(needsOf("tell me everything about the company").whole).toBe(true);
    expect(needsOf("go through all my contacts and say who is worth a call").whole).toBe(true);
    expect(needsOf("what did Harbour say last?").whole).toBe(false);
  });

  it("gives a question about nothing in particular what is open, and says a question has a topic or has not", () => {
    expect(needsOf("hmm, what now")).toMatchObject({ parts: ["Open tasks"], besides: "none" });
    expect(needsOf("and them")).toMatchObject({ parts: ["Open tasks", "Every deal"], besides: "open" });
    expect(hasTopic("and the ones in Mysuru")).toBe(false);
    expect(hasTopic("what is overdue")).toBe(true);
  });

  it("picks out the words worth looking up, and says sizes plainly", () => {
    expect(rareWords("what did we decide about the referral scheme and the timetable")).toEqual(["timetable", "referral", "decide", "scheme"]);
    expect(tokensIn(3600)).toBe(900);
    expect(sayParts(["a", "b", "c"], 2)).toBe("a, b and 1 more");
  });
});

describe("the company in brief", () => {
  it("is put together from the profile and the catalogue until somebody writes one", () => {
    const profile = newPage(db, companyId, "company", "profile", NOW);
    savePage(db, profile.id, { title: profile.title, body: "", fields: { ...profile.fields, oneLiner: "Timetables for schools." }, secrets: {}, baseRevision: profile.revision }, NOW);
    const brief = briefOf(db, companyId, NOW);
    expect(brief).toMatchObject({ written: false, pageId: null });
    expect(brief.text).toContain("Unifloe: Timetables for schools.");
    // Said as a person says it: the city, never the name a computer keeps for the zone.
    expect(brief.text).toContain("Kolkata time");
    expect(brief.text).not.toContain("Asia/");
  });

  it("is the page of that name once there is one, and that page is not sent twice", async () => {
    const page = newPage(db, companyId, "company", "page", NOW);
    savePage(db, page.id, { title: BRIEF_PAGE, body: "- Sells timetabling to schools in Karnataka.\n- Bills yearly, in advance.", fields: page.fields, secrets: {}, baseRevision: page.revision }, NOW);
    expect(briefOf(db, companyId, NOW)).toEqual({ text: "- Sells timetabling to schools in Karnataka.\n- Bills yearly, in advance.", pageId: page.id, written: true });

    const sent = await relevantTo(db, companyId, "what is our company strategy?", { budget: ROOM, now: NOW });
    expect(sent.documents[0]).toMatchObject({ title: "The company in brief" });
    expect(text(sent.documents).match(/Bills yearly, in advance/g)).toHaveLength(1);
  });
});

describe("what goes with a question", () => {
  it("sends one contact for a question about one contact, and says what went", async () => {
    const oakridge = createLead(db, companyId, leadInput.parse({ name: "Oakridge School", contactPerson: "Priya Nair", notes: "Call before 10am." }));
    createLead(db, companyId, leadInput.parse({ name: "Beacon Academy", notes: "Wants the pilot in January." }));
    logActivity(db, { leadId: oakridge.id, kind: "call", body: "Asked for the yearly price." });

    const sent = await relevantTo(db, companyId, "What did Oakridge School say last?", { budget: ROOM, now: NOW });
    expect(sent).toMatchObject({ whole: false, contacts: 1, leftOut: 1 });
    expect(sent.parts).toEqual(["the company in brief", "Oakridge School"]);
    expect(sent.documents.map((document) => document.title)).toEqual(["The company in brief", "Contacts"]);
    expect(text(sent.documents)).toContain("Asked for the yearly price.");
    expect(text(sent.documents)).not.toContain("Wants the pilot in January.");

    // By the person's first name too, which is how they are spoken of.
    expect((await relevantTo(db, companyId, "draft a short email to priya about the price", { budget: ROOM, now: NOW })).parts).toContain("Oakridge School");
  });

  it("sends the whole company when it is asked for, or chosen", async () => {
    createLead(db, companyId, leadInput.parse({ name: "Oakridge School", notes: "Call before 10am." }));
    const asked = await relevantTo(db, companyId, "Summarise everything you know", { budget: ROOM, now: NOW });
    expect(asked).toMatchObject({ whole: true, parts: ["the whole company"], contacts: 1, leftOut: 0 });
    expect(asked.documents.map((document) => document.title)).toEqual(["Read me first", "The company", "Customers and sales", "Running the company"]);
    expect((await relevantTo(db, companyId, "What did Oakridge say?", { budget: ROOM, whole: true, now: NOW })).whole).toBe(true);
  });

  it("reads a follow-up that names nothing as being about the question before it", async () => {
    createLead(db, companyId, leadInput.parse({ name: "Oakridge School", notes: "Call before 10am." }));
    const sent = await relevantTo(db, companyId, "and when is best?", { earlier: ["What did Oakridge School say last?"], budget: ROOM, now: NOW });
    expect(sent.parts).toContain("Oakridge School");
  });

  it("sends a page the question names, and what the line was told to remember when it asks how things are done", async () => {
    const page = newPage(db, companyId, "plan", "page", NOW);
    savePage(db, page.id, { title: "Referral scheme", body: "A month free for each school referred.", fields: page.fields, secrets: {}, baseRevision: page.revision }, NOW);
    const kept = newPage(db, companyId, "remembered", "page", NOW);
    savePage(db, kept.id, { title: "Things to remember", body: "- We always invoice on the 1st _(2026-10-01)_", fields: kept.fields, secrets: {}, baseRevision: kept.revision }, NOW);

    const named = await relevantTo(db, companyId, "what is the referral scheme again", { budget: ROOM, now: NOW });
    expect(text(named.documents)).toContain("A month free for each school referred.");
    expect(named.parts).toContain("the page “Referral scheme”");
    expect(text(named.documents)).not.toContain("invoice on the 1st");

    const how = await relevantTo(db, companyId, "how do we usually bill?", { budget: ROOM, now: NOW });
    expect(text(how.documents)).toContain("We always invoice on the 1st");
  });

  it("costs under a third of the whole company for a question about one contact, on the sample", async () => {
    seedDemo(db, companyId, NOW);
    const one = listLeads(db, { companyId, sort: "name", direction: "asc" })[0];
    expect(one).toBeDefined();
    const whole = size(buildDossier(db, companyId, { secrets: false }, NOW));
    const sent = await relevantTo(db, companyId, `What should I say to ${one?.name} next?`, { budget: ROOM, now: NOW });
    expect(sent.whole).toBe(false);
    expect(size(sent.documents)).toBeLessThan(whole / 3);
    expect(text(sent.documents)).toContain(`### ${one?.name}`);
  });

  it("keeps what the line was told to remember in the dossier, where an export and the whole company find it", () => {
    const kept = newPage(db, companyId, "remembered", "page", NOW);
    savePage(db, kept.id, { title: "Things to remember", body: "- We always invoice on the 1st _(2026-10-01)_", fields: kept.fields, secrets: {}, baseRevision: kept.revision }, NOW);
    const running = buildDossier(db, companyId, { secrets: false }, NOW).find((document) => document.title === "Running the company");
    expect(partsOf(running?.text ?? "").map((part) => part.heading)).toContain("Remembered");
    expect(running?.text).toContain("We always invoice on the 1st");
  });
});
