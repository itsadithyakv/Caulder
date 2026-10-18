import { beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { migrate } from "../db/migrations";
import { createCompany } from "../repositories/companies";
import { newPage, savePage } from "./brain";
import { buildTopicBrief } from "./topic";


let db: Database.Database;
let work: string;
const NOW = new Date("2026-09-20T06:00:00Z");

function page(companyId: string, section: string, title: string, body: string, template = "page"): string {
  const made = newPage(db, companyId, section, template, NOW);
  savePage(db, made.id, { title, body, fields: {}, secrets: {}, baseRevision: made.revision }, NOW);
  return made.id;
}

/** "Part of" is how a page says where it hangs, and what the trail is read from. */
const under = (id: string, title: string) => `Part of [[${title}|page:${id}]]`;

beforeEach(() => {
  db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrate(db);
  work = createCompany(db, { name: "Unifloe", accent: "blue", timezone: "Asia/Kolkata" }).id;
});

describe("what the brief finds that the search box cannot", () => {
  it("brings in a page two levels down, which the index cannot return at all", () => {
    // The case the trail rule exists for, and it is worth being exact about
    // which case that is. A page directly under Unifloe carries the line
    // "Part of [[Unifloe]]", so its own indexed body holds the word and the
    // search box finds it unaided. Its child does not: it says "Part of
    // [[Pricing]]" and never says Unifloe, so "unifloe tiers" matches nothing
    // whatsoever. Anything deeper than one level is invisible without this.
    const company = page(work, "company", "Unifloe", "The company itself.");
    const pricing = page(work, "products", "Pricing", `${under(company, "Unifloe")}\n\nWhat we charge.`);
    page(work, "products", "Tiers", `${under(pricing, "Pricing")}\n\nSilver is 4,000 a month.`);

    const brief = buildTopicBrief(db, work, "give me context about unifloe tiers", NOW);
    expect(brief.markdown).toContain("Silver is 4,000 a month");
  });

  it("finds a page one level down, which the Part of line already carried", () => {
    // Stated as its own test so the two cases cannot be confused later.
    const company = page(work, "company", "Unifloe", "The company itself.");
    page(work, "products", "Pricing", `${under(company, "Unifloe")}\n\nTier one is 4,000 a month.`);
    const brief = buildTopicBrief(db, work, "unifloe pricing", NOW);
    expect(brief.markdown).toContain("Tier one is 4,000 a month");
  });

  it("titles the brief with the topic, not the sentence that asked for it", () => {
    page(work, "company", "Unifloe", "The company.");
    const brief = buildTopicBrief(db, work, "give me context about unifloe pricing", NOW);
    expect(brief.topic).toBe("unifloe pricing");
    expect(brief.markdown.startsWith("# unifloe pricing\n")).toBe(true);
  });

  it("does not drag in a page that shares only one of the words", () => {
    // "Pricing" under Acme is not Unifloe's pricing, and a brief that pulled
    // in every page called Pricing would be worse than the search box.
    const acme = page(work, "company", "Acme", "Somebody else.");
    page(work, "products", "Pricing", `${under(acme, "Acme")}\n\nAcme charges nothing.`);
    page(work, "company", "Unifloe", "The company.");

    const brief = buildTopicBrief(db, work, "unifloe pricing", NOW);
    expect(brief.markdown).not.toContain("Acme charges nothing");
  });

  it("brings in everything hanging beneath a page that matched", () => {
    // A song does not say "guitar" anywhere, and is exactly what somebody
    // asking about guitar wants.
    const guitar = page(work, "ideas", "Guitar", "Six months in.");
    page(work, "ideas", "Riptide", `${under(guitar, "Guitar")}\n\nChords: Am F C G.`);

    const brief = buildTopicBrief(db, work, "guitar", NOW);
    // It arrives either way - its Part of line names Guitar, so the index
    // returns it too - and what matters is that it is in the brief.
    expect(brief.markdown).toContain("Chords: Am F C G");
  });

  it("says where each page sits, so the reader knows what it is part of", () => {
    const guitar = page(work, "ideas", "Guitar", "Six months in.");
    page(work, "ideas", "Riptide", `${under(guitar, "Guitar")}\n\nChords.`);
    const brief = buildTopicBrief(db, work, "guitar", NOW);
    expect(brief.markdown).toContain("· Guitar*");
  });
});

describe("the day-to-day, which the index does not hold", () => {
  it("counts the hours set aside for it in the calendar", () => {
    db.prepare(
      `INSERT INTO blocks (id, company_id, day, starts_at, minutes, title, source, created_at, updated_at)
       VALUES ('b1', ?, '2026-09-18', '19:00', 45, 'Guitar practice', 'caulder', ?, ?)`,
    ).run(work, NOW.toISOString(), NOW.toISOString());
    db.prepare(
      `INSERT INTO blocks (id, company_id, day, starts_at, minutes, title, source, created_at, updated_at)
       VALUES ('b2', ?, '2026-09-17', '19:00', 45, 'Guitar practice', 'caulder', ?, ?)`,
    ).run(work, NOW.toISOString(), NOW.toISOString());

    const brief = buildTopicBrief(db, work, "guitar", NOW);
    expect(brief.markdown).toContain("1.5 hours across 2 blocks");
  });

  it("does not count an hour that matches only one word of two", () => {
    db.prepare(
      `INSERT INTO blocks (id, company_id, day, starts_at, minutes, title, source, created_at, updated_at)
       VALUES ('b1', ?, '2026-09-18', '19:00', 45, 'Guitar practice', 'caulder', ?, ?)`,
    ).run(work, NOW.toISOString(), NOW.toISOString());
    const brief = buildTopicBrief(db, work, "guitar exam", NOW);
    expect(brief.markdown).not.toContain("Hours set aside");
  });

});

describe("when there is nothing", () => {
  it("still makes a brief, and says there is no record", () => {
    const brief = buildTopicBrief(db, work, "sailing", NOW);
    expect(brief.went).toEqual([]);
    expect(brief.markdown).toContain("Caulder holds no record of this");
  });

  it("refuses an empty topic rather than copying the whole brain", () => {
    expect(() => buildTopicBrief(db, work, "   ", NOW)).toThrow(/what the brief should be about/i);
  });

  it("refuses a topic that is only asking words", () => {
    expect(() => buildTopicBrief(db, work, "!!!", NOW)).toThrow(/word or two/i);
  });
});
