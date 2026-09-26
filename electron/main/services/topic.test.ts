import { beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { migrate } from "../db/migrations";
import { createCompany } from "../repositories/companies";
import { readFileSync } from "node:fs";
import { newPage, savePage } from "./brain";
import { buildTopicBrief } from "./topic";

/** The words of a sealed day live in journal_sealed; the page keeps nothing readable. */
function seal(pageId: string): void {
  db.prepare(`INSERT INTO journal_sealed (page_id, box, sealed_at) VALUES (?, 'x', ?)`).run(
    pageId,
    NOW.toISOString(),
  );
}

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
    const guitar = page(work, "hobbies", "Guitar", "Six months in.");
    page(work, "hobbies", "Riptide", `${under(guitar, "Guitar")}\n\nChords: Am F C G.`);

    const brief = buildTopicBrief(db, work, "guitar", NOW);
    // It arrives either way - its Part of line names Guitar, so the index
    // returns it too - and what matters is that it is in the brief.
    expect(brief.markdown).toContain("Chords: Am F C G");
  });

  it("says where each page sits, so the reader knows what it is part of", () => {
    const guitar = page(work, "hobbies", "Guitar", "Six months in.");
    page(work, "hobbies", "Riptide", `${under(guitar, "Guitar")}\n\nChords.`);
    const brief = buildTopicBrief(db, work, "guitar", NOW);
    expect(brief.markdown).toContain("· Guitar*");
  });
});

describe("what the brief refuses to carry", () => {
  it("leaves out a journal day that is locked", () => {
    const entry = page(work, "journal", "Friday 18 September", "Guitar practice went badly.", "entry");
    seal(entry);
    const brief = buildTopicBrief(db, work, "guitar", NOW);
    expect(brief.markdown).not.toContain("went badly");
  });

  it("carries a journal day that is not locked, as a day rather than as a page", () => {
    page(work, "journal", "Thursday 17 September", "Guitar practice went well.", "entry");
    const brief = buildTopicBrief(db, work, "guitar", NOW);
    expect(brief.markdown).toContain("went well");
    expect(brief.markdown).toContain("A day in the journal");
  });

  it("never reads the table the private lines live in", () => {
    // Not "skips the private ones": the query is not written. A guard that
    // has already read the row is not a guard, which is the rule yours.ts
    // states and the reason this is asserted against the SQL itself.
    // The comments say the word, deliberately; the code must not. So the
    // comments come off before the file is read for it.
    const source = readFileSync(new URL("./topic.ts", import.meta.url), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    expect(source).not.toContain("journal_private");
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

  it("brings in what the line logged about it", () => {
    db.prepare(
      `INSERT INTO hobby_logs (id, company_id, day, topic, metric, value, unit, reps, best, created_at)
       VALUES ('l1', ?, '2026-09-19', 'guitar', 'practice', 40, 'min', NULL, 0, ?)`,
    ).run(work, NOW.toISOString());
    const brief = buildTopicBrief(db, work, "guitar", NOW);
    expect(brief.markdown).toContain("guitar practice 40min");
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

describe("by meaning as well as words (phase 22)", () => {
  it("brings a page the model found near the topic, never a journal day", () => {
    const beans = page(work, "plan", "Beans", "Ethiopian, washed, a light roast.");
    const day = page(work, "journal", "Thursday", "Worried about the launch.", "entry");
    const brief = buildTopicBrief(db, work, "coffee grinder", NOW, [beans, day]);
    expect(brief.markdown).toContain("Ethiopian, washed, a light roast.");
    expect(brief.markdown).not.toContain("Worried about the launch");
  });
});
