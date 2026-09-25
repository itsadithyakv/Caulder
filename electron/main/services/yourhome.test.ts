import { beforeEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";

vi.mock("electron", () => ({ Notification: class {}, nativeTheme: { shouldUseDarkColorsForSystemIntegratedUI: false }, net: {}, safeStorage: {} }));
vi.mock("../identity", () => ({ markFile: () => "" }));

const { migrate } = await import("../db/migrations");
const { createCompany, homeCompanyId } = await import("../repositories/companies");
const { createTask } = await import("../repositories/tasks");
const { newPage, savePage } = await import("./brain");
const { addHabit } = await import("./habits");
const { completeTask } = await import("../repositories/tasks");
const { seedDemo } = await import("./demo");
const { dayRecord, jot } = await import("./life");
const { ensureHome } = await import("./yourhome");
const { taskInput } = await import("@shared/domain");

/**
 * Your own things in a home of their own: made once, your pages and habits
 * moved into it, the company's left where they are, and never the sample's.
 */

const NOW = new Date("2026-09-25T06:00:00Z");
let db: Database.Database;

beforeEach(() => {
  db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrate(db);
});

const company = (name: string) => createCompany(db, { name, accent: "blue", timezone: "Asia/Kolkata" }).id;
function page(companyId: string, section: string, title: string, body: string, template = "page"): string {
  const made = newPage(db, companyId, section, template, NOW);
  savePage(db, made.id, { title, body, fields: made.fields, secrets: {}, baseRevision: made.revision }, NOW);
  return made.id;
}
const whose = (id: string) => (db.prepare(`SELECT company_id FROM brain_pages WHERE id = ?`).get(id) as { company_id: string }).company_id;

describe("a home of your own", () => {
  it("is made once, and your things move into it while the company's stay", () => {
    const unifloe = company("Unifloe");
    const me = page(unifloe, "goals", "Me", "Everything of mine.\n");
    const guitar = page(unifloe, "hobbies", "Guitar", `Part of [[Me|page:${me}]].\n`, "hobby");
    const where = page(unifloe, "remembered", "Where things are", "- **Parked: level 3** · parked on level 3 _(2026-09-24)_\n");
    const trivia = page(unifloe, "ideas", "Random knowledge", "- **Honey** · honey never spoils _(2026-09-20)_\n");
    const pitch = page(unifloe, "ideas", "Pricing idea", "Charge yearly.\n", "idea");
    const plan = page(unifloe, "plan", "The plan", "Grow.\n");
    jot(db, unifloe, "a good day", NOW);
    addHabit(db, unifloe, { name: "Read" }, NOW);
    const practise = createTask(db, unifloe, taskInput.parse({ title: "Practise scales", kind: "todo", dueOn: "2026-09-26" }));
    db.prepare(`UPDATE tasks SET page_id = ? WHERE id = ?`).run(guitar, practise.id);

    const { home, moved } = ensureHome(db);
    expect(home).not.toBeNull();
    expect(moved).toBeGreaterThan(0);
    expect(homeCompanyId(db)).toBe(home);
    expect(db.prepare(`SELECT name, kind, timezone FROM companies WHERE id = ?`).get(home)).toEqual({ name: "Me", kind: "personal", timezone: "Asia/Kolkata" });

    // Yours, moved.
    for (const id of [me, guitar, where, trivia]) expect(whose(id)).toBe(home);
    expect(db.prepare(`SELECT COUNT(*) AS n FROM brain_pages WHERE company_id = ? AND section = 'journal'`).get(home)).toEqual({ n: 1 });
    expect(db.prepare(`SELECT company_id FROM habits`).get()).toEqual({ company_id: home });
    expect(db.prepare(`SELECT company_id FROM tasks WHERE id = ?`).get(practise.id)).toEqual({ company_id: home });
    // The company's, left.
    expect(whose(pitch)).toBe(unifloe);
    expect(whose(plan)).toBe(unifloe);

    // And once only.
    expect(ensureHome(db)).toEqual({ home, moved: 0 });
    expect(db.prepare(`SELECT COUNT(*) AS n FROM companies WHERE kind = 'personal'`).get()).toEqual({ n: 1 });
  });

  it("waits while there is only the sample company, and never takes the sample's pages", () => {
    const sample = company("Sample company");
    seedDemo(db, sample, NOW);
    expect(ensureHome(db)).toEqual({ home: null, moved: 0 });

    const real = company("Unifloe");
    const { home, moved } = ensureHome(db);
    expect(home).not.toBeNull();
    expect(moved).toBe(0);
    // The sample's hobby is still the sample's, and goes when the sample does.
    expect(db.prepare(`SELECT COUNT(*) AS n FROM brain_pages WHERE company_id = ?`).get(home)).toEqual({ n: 0 });
    expect(homeCompanyId(db)).toBe(home);
    expect(real).not.toBe(home);
  });

  it("is where the journal's day is read across every company", () => {
    const unifloe = company("Unifloe");
    const { home } = ensureHome(db);
    const call = createTask(db, unifloe, taskInput.parse({ title: "Call Oakridge", kind: "call", dueOn: "2026-09-25" }));
    completeTask(db, call.id);
    const day = new Date().toISOString().slice(0, 10);
    expect(dayRecord(db, home!, day).tasksDone.map((task) => task.title)).toContain("Call Oakridge");
    // A company's own day is still its own.
    expect(dayRecord(db, unifloe, day).tasksDone.map((task) => task.title)).toEqual(["Call Oakridge"]);
  });
});
