import { beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { migrate } from "../db/migrations";
import { createCompany } from "../repositories/companies";
import { readCapture } from "@shared/capture";
import { getPage, newPage, savePage } from "./brain";
import { backlinks, wholeMap } from "./map";
import { createLead } from "../repositories/leads";
import { leadInput } from "@shared/domain";
import { allMemories } from "./memories";
import { remember } from "./remember";

let db: Database.Database;
let home: string;
let work: string;
const NOW = new Date("2026-09-20T06:00:00Z");
const CLOCK = { today: "2026-09-20", now: 10 * 60 };

type Row = { id: string; title: string; section: string; template: string; body: string; company_id: string };
const pages = () => db.prepare(`SELECT id, title, section, template, body, company_id FROM brain_pages ORDER BY created_at, rowid`).all() as Row[];
const known = () => pages().map((page) => ({ id: page.id, title: page.title, section: page.section }));

/** Said to the line, read by it, and kept - the way the window does it. */
function say(line: string) {
  const read = readCapture(line, { contacts: [], hobbies: [], pages: known() }, CLOCK);
  return remember(
    db,
    { pageId: read.page?.id ?? null, topic: read.topic, section: read.branch?.section ?? "ideas", trail: read.trail, said: read.text, fact: read.fact, day: CLOCK.today },
    NOW,
  );
}

/** The chain above a page, read back out of what the pages say they are part of. */
function above(title: string): string[] {
  const all = pages();
  const chain: string[] = [];
  let page = all.find((each) => each.title === title);
  while (page) {
    const parent = /Part of \[\[[^|\]]+\|page:([^\]]+)\]\]/.exec(page.body)?.[1];
    page = parent ? all.find((each) => each.id === parent) : undefined;
    if (page) chain.unshift(page.title);
  }
  return chain;
}

beforeEach(() => {
  db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrate(db);
  work = createCompany(db, { name: "Unifloe", accent: "blue", timezone: "Asia/Kolkata" }).id;
  home = createCompany(db, { name: "Me", accent: "coffee", timezone: "Asia/Kolkata", kind: "personal" }).id;
});

describe("kept where it belongs", () => {
  it("builds the whole way down the first time, and every level says what it is part of", () => {
    const kept = say("red rising is the first book of the red rising series");
    expect(kept).toMatchObject({ title: "Red Rising", started: ["Me", "Hobbies", "Reading", "Red Rising series", "Red Rising"] });
    expect(above("Red Rising")).toEqual(["Me", "Hobbies", "Reading", "Red Rising series"]);

    // Reading is a hobby, so Life counts its hours; the rest are plain pages. All of it is yours, not the company's.
    const all = pages();
    expect(all.find((page) => page.title === "Reading")).toMatchObject({ template: "hobby", section: "hobbies" });
    expect(all.find((page) => page.title === "Me")).toMatchObject({ template: "page", section: "goals" });
    expect(all.every((page) => page.company_id === home)).toBe(true);
    expect(all.some((page) => page.company_id === work)).toBe(false);
  });

  it("starts nothing twice: the second book of the series shares every level above it", () => {
    say("red rising is the first book of the red rising series");
    const kept = say("golden son is a book in the red rising series");
    expect(kept.started).toEqual(["Golden Son"]);
    expect(above("Golden Son")).toEqual(["Me", "Hobbies", "Reading", "Red Rising series"]);
    expect(pages().filter((page) => page.title === "Reading")).toHaveLength(1);
  });

  it("starts no level with nothing to go under it: a genre said after the series is there is not a page", () => {
    say("red rising is the first book of the red rising series");
    const kept = say("golden son is a sci-fi book in the red rising series");
    expect(kept.started).toEqual(["Golden Son"]);
    expect(above("Golden Son")).toEqual(["Me", "Hobbies", "Reading", "Red Rising series"]);
    expect(pages().some((page) => page.title === "Sci-fi books")).toBe(false);

    // Said of a book with no series yet, the genre is a level, and the next sci-fi book shares it.
    say("project hail mary is a sci-fi novel");
    say("the martian is a sci-fi book");
    expect(above("Project Hail Mary")).toEqual(["Me", "Hobbies", "Reading", "Sci-fi books"]);
    expect(above("The Martian")).toEqual(["Me", "Hobbies", "Reading", "Sci-fi books"]);
    expect(pages().filter((page) => page.title === "Sci-fi books")).toHaveLength(1);
  });

  it("branches sideways too: another hobby, a fact, a course - all under the one Me", () => {
    say("red rising is the first book of the red rising series");
    say("i learnt a new song called riptide by vance joy, had fun");
    say("fun fact: honey never spoils");
    say("dbms is a course about databases");
    expect(above("Riptide")).toEqual(["Me", "Hobbies", "Music", "Vance Joy"]);
    expect(above("Random knowledge")).toEqual(["Me"]);
    expect(above("DBMS")).toEqual(["Me", "Studies"]);
    expect(pages().filter((page) => page.title === "Me")).toHaveLength(1);
    expect(pages().filter((page) => page.title === "Hobbies")).toHaveLength(1);
  });

  it("adds the next memory under the last, on the page there is", () => {
    say("red rising is the first book of the red rising series");
    say("Read red rising book today, loved chapter 25");
    const body = pages().find((page) => page.title === "Red Rising")?.body ?? "";
    expect(body).toMatch(/^Part of \[\[Red Rising series\|page:[^\]]+\]\]\.\n\n- red rising is the first book[^\n]+\n- Read red rising book today, loved chapter 25 _\(2026-09-20\)_\n$/);
    expect(allMemories(db).memories.filter((each) => each.pageTitle === "Red Rising")).toHaveLength(2);
  });

  it("hangs a page that hung off nothing, and leaves alone one its owner already placed", () => {
    const orphan = newPage(db, home, "hobbies", "page", NOW);
    savePage(db, orphan.id, { title: "Dune", body: "My notes on it.\n", fields: {}, secrets: {}, baseRevision: orphan.revision }, NOW);
    say("dune was better the second time, loved the ending of the book");
    expect(above("Dune")).toEqual(["Me", "Hobbies", "Reading", "Dune series"]);
    expect(getPage(db, orphan.id).body).toContain("My notes on it.");

    const shelf = newPage(db, home, "hobbies", "page", NOW);
    savePage(db, shelf.id, { title: "My shelf", body: "", fields: {}, secrets: {}, baseRevision: shelf.revision }, NOW);
    const placed = newPage(db, home, "hobbies", "page", NOW);
    savePage(
      db,
      placed.id,
      { title: "Piranesi", body: `Part of [[My shelf|page:${shelf.id}]].\n`, fields: {}, secrets: {}, baseRevision: placed.revision },
      NOW,
    );
    say("piranesi is a book i keep thinking about");
    expect(above("Piranesi")).toEqual(["My shelf"]);
  });

  it("is what the map draws: every level a dot, every 'part of' a line", () => {
    say("golden son is a sci-fi book in the red rising series");
    const graph = wholeMap(db, home, false);
    const label = (key: string) => graph.nodes.find((node) => node.key === key)?.label;
    const lines = graph.links.map((link) => `${label(link.source)} > ${label(link.target)}`).sort();
    expect(lines).toEqual([
      "Golden Son > Red Rising series",
      "Hobbies > Me",
      "Reading > Hobbies",
      "Red Rising series > Sci-fi books",
      "Sci-fi books > Reading",
    ]);
    // And none of it is on the company's map.
    expect(wholeMap(db, work, false).nodes.filter((node) => node.ref === "page")).toEqual([]);
  });

  it("keeps nothing at all when any of it cannot be kept", () => {
    expect(() =>
      remember(db, { pageId: "no-such-page", topic: null, section: "hobbies", trail: [{ title: "Me", section: "goals", template: "page" }], said: "x y z", fact: null, day: "2026-09-20" }, NOW),
    ).toThrow();
    expect(pages()).toEqual([]);
  });

  it("never writes on the journal, whatever a page there is called", () => {
    const entry = newPage(db, home, "journal", "page", NOW);
    savePage(db, entry.id, { title: "Random knowledge", body: "dear diary\n", fields: {}, secrets: {}, baseRevision: entry.revision }, NOW);
    say("fun fact: honey never spoils");
    expect(getPage(db, entry.id).body).toBe("dear diary\n");
    expect(pages().filter((page) => page.title === "Random knowledge")).toHaveLength(2);
  });
});

describe("somebody who is a contact", () => {
  it("gets a page under People that links to them, once, and the line can answer from it", () => {
    const amma = createLead(db, work, leadInput.parse({ name: "Amma" }));
    const contacts = [{ id: amma.id, name: "Amma", person: null }];
    const tell = (line: string) => {
      const read = readCapture(line, { contacts, hobbies: [], pages: known() }, CLOCK);
      expect(read.kind).toBe("memory");
      expect(read.about).toEqual({ id: amma.id, name: "Amma" });
      return remember(
        db,
        { pageId: read.page?.id ?? null, topic: read.topic, section: read.branch?.section ?? "ideas", trail: read.trail, said: read.text, fact: read.fact, day: CLOCK.today, about: read.about ?? null },
        NOW,
      );
    };

    const kept = tell("amma's bp tablet is telma 40");
    tell("amma's birthday is 15 march");
    const page = getPage(db, kept.pageId);
    expect(page.title).toBe("Amma");
    expect(above("Amma")).toEqual(["Me", "People"]);
    expect(page.body.match(/\[\[Amma\|contact:/g)).toHaveLength(1);
    // The contact's own page lists it; the memory is found by asking.
    expect(backlinks(db, "contact", amma.id).map((each) => each.title)).toEqual(["Amma"]);
    expect(allMemories(db).memories.some((memory) => memory.fact === "Bp tablet: telma 40")).toBe(true);
  });
});
