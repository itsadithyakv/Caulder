import { beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { migrate } from "../db/migrations";
import { createCompany } from "../repositories/companies";
import { groupMemories, memoriesOf, trailsOf, underOf } from "@shared/memories";
import { newPage, savePage } from "./brain";
import { allMemories, editMemory, forgetMemory } from "./memories";

let db: Database.Database;
let home: string;
let work: string;
const NOW = new Date("2026-09-20T06:00:00Z");

function page(companyId: string, section: string, title: string, body: string): string {
  const made = newPage(db, companyId, section, "page", NOW);
  savePage(db, made.id, { title, body, fields: {}, secrets: {}, baseRevision: made.revision }, NOW);
  return made.id;
}

beforeEach(() => {
  db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrate(db);
  work = createCompany(db, { name: "Unifloe", accent: "blue", timezone: "Asia/Kolkata" }).id;
  home = createCompany(db, { name: "Me", accent: "coffee", timezone: "Asia/Kolkata", kind: "personal" }).id;
});

describe("what the line was told to remember", () => {
  it("is read back from the lines the line wrote, and nothing else on the page", () => {
    const found = memoriesOf({
      id: "p",
      title: "Bench Press",
      section: "ideas",
      body: "Part of [[Gym|page:g]].\n\n- **PR: 45 kg × 3** · hit a pr on the bench _(2026-09-18)_\n- felt heavy today _(2026-09-20)_\n- a bullet somebody wrote by hand\n\n## Notes\nfree text _(not a date)_\n",
    });
    expect(found).toEqual([
      {
        pageId: "p",
        pageTitle: "Bench Press",
        section: "ideas",
        day: "2026-09-18",
        fact: "PR: 45 kg × 3",
        says: "hit a pr on the bench",
        raw: "- **PR: 45 kg × 3** · hit a pr on the bench _(2026-09-18)_",
        key: "pr",
        current: true,
      },
      {
        pageId: "p",
        pageTitle: "Bench Press",
        section: "ideas",
        day: "2026-09-20",
        fact: null,
        says: "felt heavy today",
        raw: "- felt heavy today _(2026-09-20)_",
        key: null,
        current: true,
      },
    ]);
  });

  it("is the company's own: another company's pages are not read with it", () => {
    const facts = page(work, "remembered", "Things to remember", "- **GST number: 29ABCDE1234F1Z5** · our gst number is 29ABCDE1234F1Z5 _(2026-09-20)_\n");
    page(work, "customers", "Harbour Coffee", "- pay on the 5th _(2026-09-19)_\n");
    page(home, "ideas", "Pitch", "- said at the offsite _(2026-09-20)_\n");
    page(work, "ideas", "No memories here", "Just a page.\n");

    const { companyId, memories } = allMemories(db, work);
    expect(companyId).toBe(work);
    expect(memories.map((each) => each.pageTitle).sort()).toEqual(["Harbour Coffee", "Things to remember"]);
    expect(memories.find((each) => each.pageId === facts)).toMatchObject({ fact: "GST number: 29ABCDE1234F1Z5", day: "2026-09-20" });
  });

  it("says where each page hangs, the whole way up, from what the pages themselves say", () => {
    const me = page(home, "plan", "Me", "Everything of mine.\n");
    const hobbies = page(home, "ideas", "Hobbies", `Part of [[Me|page:${me}]].\n`);
    const reading = page(home, "ideas", "Reading", `Part of [[Hobbies|page:${hobbies}]].\n`);
    const book = page(home, "ideas", "Red Rising", `Part of [[Reading|page:${reading}]].\n\n- loved chapter 25 _(2026-09-19)_\n`);
    const loose = page(home, "ideas", "Random knowledge", "- Honey never spoils _(2026-09-20)_\n");

    const { trails } = allMemories(db, home);
    expect(trails[book]).toEqual(["Me", "Hobbies", "Reading"]);
    expect(trails[loose]).toEqual([]);
    // Only the pages with memories on are answered for.
    expect(Object.keys(trails).sort()).toEqual([book, loose].sort());
  });

  it("stops where a loop comes round, rather than going round it for ever", () => {
    const trails = trailsOf([
      { id: "a", title: "A", body: "Part of [[B|page:b]]." },
      { id: "b", title: "B", body: "Part of [[A|page:a]]." },
      { id: "c", title: "C", body: "Part of [[Gone|page:deleted]]." },
    ]);
    expect(trails).toEqual({ a: ["B"], b: ["A"], c: [] });
  });

  it("finds everything under a page however far down, by title, and walks a loop once", () => {
    const pages = [
      { id: "gym", title: "Gym", body: "Part of [[Hobbies|page:hub]]." },
      { id: "hub", title: "Hobbies", body: "" },
      { id: "chest", title: "Chest", body: "Part of [[Gym|page:gym]]." },
      { id: "bench", title: "Bench Press", body: "Part of [[Chest|page:chest]].\n\n- PR _(2026-09-20)_" },
      { id: "back", title: "back", body: "Part of [[Gym|page:gym]]." },
      { id: "riptide", title: "Riptide", body: "Part of [[Guitar|page:guitar]]." },
      { id: "x", title: "X", body: "Part of [[Y|page:y]]." },
      { id: "y", title: "Y", body: "Part of [[X|page:x]]." },
    ];
    expect(underOf(pages, "gym").map((page) => page.title)).toEqual(["back", "Bench Press", "Chest"]);
    expect(underOf(pages, "hub").map((page) => page.title)).toEqual(["back", "Bench Press", "Chest", "Gym"]);
    expect(underOf(pages, "bench")).toEqual([]);
    expect(underOf(pages, "x").map((page) => page.title)).toEqual(["Y"]);
  });

  it("groups by what they are about, newest first, and narrows to a search", () => {
    const memories = [
      ...memoriesOf({ id: "a", title: "Random knowledge", section: "ideas", body: "- **Honey** · Honey never spoils _(2026-09-10)_\n- **Shivajinagar** · was called black pally _(2026-09-20)_\n" }),
      ...memoriesOf({ id: "b", title: "Riptide", section: "ideas", body: "- three chords, had fun _(2026-09-15)_\n" }),
    ];
    const groups = groupMemories(memories);
    expect(groups.map((group) => group.pageTitle)).toEqual(["Random knowledge", "Riptide"]);
    expect(groups[0]?.memories.map((each) => each.fact)).toEqual(["Shivajinagar", "Honey"]);

    expect(groupMemories(memories, "honey").flatMap((group) => group.memories.map((each) => each.fact))).toEqual(["Honey"]);
    expect(groupMemories(memories, "riptide")).toHaveLength(1);
    expect(groupMemories(memories, "nothing like this")).toEqual([]);
  });
});

describe("a memory changed or let go", () => {
  const body = "Part of [[Me|page:me]].\n\n- **Parked: level 1** · parked on level 1 _(2026-09-01)_\n- **Spare key: under the pot** · the spare key is under the pot _(2026-09-02)_\n";

  it("is said differently in its place, keeping its day, and the page's history has what it said", () => {
    const where = page(home, "remembered", "Where things are", body);
    const raw = "- **Spare key: under the pot** · the spare key is under the pot _(2026-09-02)_";
    const after = editMemory(db, { pageId: where, raw, fact: "Spare key: with Meera", says: "gave meera the\nspare key" }, NOW);
    expect(after.map((memory) => memory.raw)).toEqual([
      "- **Parked: level 1** · parked on level 1 _(2026-09-01)_",
      "- **Spare key: with Meera** · gave meera the spare key _(2026-09-02)_",
    ]);
    expect(db.prepare(`SELECT COUNT(*) AS n FROM brain_revisions WHERE page_id = ?`).get(where)).toMatchObject({ n: expect.any(Number) });
  });

  it("is taken off its page, and the page stays", () => {
    const where = page(home, "remembered", "Where things are", body);
    const after = forgetMemory(db, { pageId: where, raw: "- **Parked: level 1** · parked on level 1 _(2026-09-01)_" }, NOW);
    expect(after.map((memory) => memory.fact)).toEqual(["Spare key: under the pot"]);
    expect(allMemories(db, home).memories).toHaveLength(1);
  });

  it("is refused when the line has changed on its page since", () => {
    const where = page(home, "remembered", "Where things are", body);
    expect(() => forgetMemory(db, { pageId: where, raw: "- something else _(2026-09-01)_" }, NOW)).toThrow("changed on its page");
  });
});
