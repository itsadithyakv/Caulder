import { beforeEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";

/**
 * The founder's own half of the brain (PLAN.md, part four, phase 14): the
 * rebuild that let the brain have more sections, the journal and the day's
 * record, studies with exams and an average, hobbies against their time,
 * goals, and time set aside on the Calendar for a page.
 */

vi.mock("./secrets", () => ({
  isSealed: (value: unknown) => typeof value === "object" && value !== null && "$secret" in value,
  sealSecret: (text: string) => ({ $secret: `sealed:${text}`, last4: text.slice(-4) }),
  openSecret: (sealed: { $secret: string }) => sealed.$secret.replace(/^sealed:/, ""),
}));

const { MIGRATIONS, migrate } = await import("../db/migrations");
const brain = await import("./brain");
const life = await import("./life");
const { dueSoon } = await import("./deadlines");
const { makeTasks } = await import("./steps");
const { createCompany } = await import("../repositories/companies");
const { createLead } = await import("../repositories/leads");
const { createTask } = await import("../repositories/tasks");
const { createNote, listNotes } = await import("../repositories/notes");
const { createBlock, listBlocks, setOutcome } = await import("../repositories/blocks");
const { leadInput, taskInput } = await import("@shared/domain");

// 18 September 2026, 11:30 in Kolkata.
const now = new Date("2026-09-18T06:00:00.000Z");
const today = "2026-09-18";

let db: Database.Database;
let companyId: string;

beforeEach(() => {
  db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrate(db);
  companyId = createCompany(db, { name: "Unifloe", accent: "blue", timezone: "Asia/Kolkata" }).id;
});

function write(section: string, template: string, title: string, body = "", fields: Record<string, unknown> = {}) {
  const page = brain.newPage(db, companyId, section, template, now);
  return brain.savePage(db, page.id, { title, body, fields, baseRevision: page.revision }, now);
}

describe("migration 30", () => {
  it("rebuilds the pages without losing a revision, a link or a task that points at them", () => {
    const old = new Database(":memory:");
    old.pragma("foreign_keys = ON");
    for (const migration of MIGRATIONS.filter((m) => m.version <= 29)) {
      old.exec(migration.sql);
      old.pragma(`user_version = ${migration.version}`);
    }
    const company = createCompany(old, { name: "Unifloe", accent: "blue", timezone: "Asia/Kolkata" });
    const at = "2026-04-01T00:00:00.000Z";
    old.prepare(
      `INSERT INTO brain_pages (id, company_id, section, template, title, body, fields, revision, created_at, updated_at)
       VALUES ('p1', ?, 'plan', 'page', 'The plan', 'See [[Pricing|page:00000000-0000-4000-8000-000000000002]]', '{}', 2, ?, ?),
              ('00000000-0000-4000-8000-000000000002', ?, 'plan', 'page', 'Pricing', '', '{}', 1, ?, ?)`,
    ).run(company.id, at, at, company.id, at, at);
    old.prepare(`INSERT INTO brain_revisions (id, page_id, revision, title, body, fields, edited_at) VALUES ('r1', 'p1', 1, 'The plan', '', '{}', ?), ('r2', 'p1', 2, 'The plan', 'x', '{}', ?)`).run(at, at);
    old.prepare(`INSERT INTO brain_links (company_id, from_page, to_kind, to_id, label, created_at) VALUES (?, 'p1', 'page', '00000000-0000-4000-8000-000000000002', 'Pricing', ?)`).run(company.id, at);
    const task = createTask(old, company.id, taskInput.parse({ title: "Price it", dueOn: "2026-04-02" }));
    old.prepare(`UPDATE tasks SET page_id = 'p1' WHERE id = ?`).run(task.id);
    expect(() =>
      old.prepare(`INSERT INTO brain_pages (id, company_id, section, template, title, created_at, updated_at) VALUES ('x', ?, 'journal', 'entry', 'x', ?, ?)`).run(company.id, at, at),
    ).toThrow(/CHECK/);

    migrate(old);

    expect(old.pragma("foreign_keys", { simple: true })).toBe(1);
    expect((old.prepare(`SELECT COUNT(*) AS n FROM brain_revisions WHERE page_id = 'p1'`).get() as { n: number }).n).toBe(2);
    expect((old.prepare(`SELECT COUNT(*) AS n FROM brain_links WHERE from_page = 'p1'`).get() as { n: number }).n).toBe(1);
    expect((old.prepare(`SELECT page_id FROM tasks WHERE id = ?`).get(task.id) as { page_id: string }).page_id).toBe("p1");
    expect(old.pragma("foreign_key_check")).toEqual([]);

    // A new section is welcome now, and search still indexes a page.
    old.prepare(`INSERT INTO brain_pages (id, company_id, section, template, title, body, fields, created_at, updated_at) VALUES ('j1', ?, 'journal', 'entry', 'A day', 'Quiet morning', '{"day":"2026-04-02"}', ?, ?)`).run(company.id, at, at);
    expect(old.prepare(`SELECT COUNT(*) AS n FROM brain_search WHERE brain_search MATCH 'quiet'`).get()).toEqual({ n: 1 });
    // One entry a day, which the database holds to.
    expect(() =>
      old.prepare(`INSERT INTO brain_pages (id, company_id, section, template, title, fields, created_at, updated_at) VALUES ('j2', ?, 'journal', 'entry', 'Again', '{"day":"2026-04-02"}', ?, ?)`).run(company.id, at, at),
    ).toThrow(/UNIQUE/);
    // Deleting a page still takes its revisions, and still leaves a task standing.
    old.prepare(`DELETE FROM brain_pages WHERE id = 'p1'`).run();
    expect((old.prepare(`SELECT COUNT(*) AS n FROM brain_revisions WHERE page_id = 'p1'`).get() as { n: number }).n).toBe(0);
    expect((old.prepare(`SELECT page_id FROM tasks WHERE id = ?`).get(task.id) as { page_id: string | null }).page_id).toBeNull();
  });
});

describe("the journal", () => {
  it("has one entry a day, titled with the day, and none for a day still to come", () => {
    const first = life.journalEntry(db, companyId, null, now);
    expect(first).toMatchObject({ section: "journal", template: "entry", title: "Friday 18 September 2026", fields: { day: today } });
    expect(life.journalEntry(db, companyId, today, now).id).toBe(first.id);
    // Making one from the section opens today's too.
    expect(brain.newPage(db, companyId, "journal", "entry", now).id).toBe(first.id);
    expect(() => life.journalEntry(db, companyId, "2026-09-19", now)).toThrow("days that have happened");
  });

  it("keeps the day through an edit, and saves a mood at once", () => {
    const entry = life.journalEntry(db, companyId, null, now);
    const saved = brain.savePage(db, entry.id, { title: entry.title, body: "Good call with Oakridge.", fields: {}, baseRevision: entry.revision }, now);
    expect(saved.fields["day"]).toBe(today);
    expect(life.setMood(db, entry.id, "good", now).fields).toMatchObject({ day: today, mood: "good" });
    expect(() => life.setMood(db, entry.id, "ecstatic", now)).toThrow("not one of the moods");
    expect(life.setMood(db, entry.id, null, now).fields["mood"]).toBeUndefined();
  });

  it("reads a month back with the run of days written and the same day a month ago", () => {
    for (const day of ["2026-08-18", "2026-09-16", "2026-09-17"]) life.journalEntry(db, companyId, day, now);
    life.setMood(db, life.journalEntry(db, companyId, "2026-09-17", now).id, "great", now);
    const month = life.journalMonth(db, companyId, null, now);
    expect(month.month).toBe("2026-09");
    expect(month.entries.map((entry) => entry.day)).toEqual(["2026-09-16", "2026-09-17"]);
    expect(month.entries[1]?.mood).toBe("great");
    // Nothing yet today: the run still counts from yesterday.
    expect(month.run).toBe(2);
    expect(month.onThisDay).toEqual([{ label: "A month ago", entry: expect.objectContaining({ day: "2026-08-18" }) }]);
    expect(life.journalMonth(db, companyId, "2026-08", now).entries).toHaveLength(1);
  });

  it("takes a caught note into the entry for the day it was caught", () => {
    const note = createNote(db, companyId, "The principal said yes to a pilot.", "2026-09-17");
    const entry = brain.fileNote(db, note.id, "journal", now);
    expect(entry).toMatchObject({ template: "entry", fields: { day: "2026-09-17" } });
    expect(entry.body).toContain("The principal said yes to a pilot.");
    expect(listNotes(db, companyId)).toHaveLength(0);
  });

  it("puts beside an entry what Caulder saw happen that day, in the company's own day", () => {
    const lead = createLead(db, companyId, leadInput.parse({ name: "Oakridge School" }));
    const done = createTask(db, companyId, taskInput.parse({ title: "Send the deck", dueOn: today, area: "company" }));
    // 23:00 on the 17th in Kolkata is still the 17th; 00:30 on the 18th is not.
    db.prepare(`UPDATE tasks SET status = 'done', completed_at = '2026-09-17T17:30:00.000Z' WHERE id = ?`).run(done.id);
    const late = createTask(db, companyId, taskInput.parse({ title: "Read chapter 4", dueOn: today, area: "college" }));
    db.prepare(`UPDATE tasks SET status = 'done', completed_at = '2026-09-17T19:00:00.000Z' WHERE id = ?`).run(late.id);
    db.prepare(
      `INSERT INTO calls (id, company_id, lead_id, outcome, created_at) VALUES ('c1', ?, ?, 'spoke', '2026-09-17T09:00:00.000Z')`,
    ).run(companyId, lead.id);
    const lecture = createBlock(db, companyId, { day: "2026-09-17", startsAt: "09:00", minutes: 90, title: "Lecture", kind: "class" });
    createBlock(db, companyId, { day: "2026-09-17", startsAt: "14:00", minutes: 60, title: "Gym", kind: "personal" });
    const skipped = createBlock(db, companyId, { day: "2026-09-17", startsAt: "18:00", minutes: 60, title: "Study", kind: "study" });
    setOutcome(db, skipped.id, "skipped");
    createNote(db, companyId, "Pricing idea", "2026-09-17");
    const written = write("plan", "page", "Pricing", "Per school.");
    db.prepare(`UPDATE brain_revisions SET edited_at = '2026-09-17T10:00:00.000Z' WHERE page_id = ?`).run(written.id);

    const record = life.dayRecord(db, companyId, "2026-09-17", now);
    expect(record.tasksDone.map((task) => task.title)).toEqual(["Send the deck"]);
    expect(record.calls).toEqual([{ leadId: lead.id, name: "Oakridge School", spoke: true }]);
    expect(record.kept).toEqual([
      { kind: "class", minutes: 90 },
      { kind: "personal", minutes: 60 },
    ]);
    expect(record.notes.map((note) => note.body)).toEqual(["Pricing idea"]);
    expect(record.pages.map((page) => page.title)).toEqual(["Pricing"]);
    expect(lecture.day).toBe("2026-09-17");

    // Today, only what has already ended counts as kept: it is 11:30.
    createBlock(db, companyId, { day: today, startsAt: "09:00", minutes: 60, title: "Morning", kind: "focus" });
    createBlock(db, companyId, { day: today, startsAt: "15:00", minutes: 60, title: "Afternoon", kind: "focus" });
    expect(life.dayRecord(db, companyId, today, now).kept).toEqual([{ kind: "focus", minutes: 60 }]);
  });
});

describe("studies", () => {
  it("links an exam to its course, reaches Today with it, and leaves once it has happened", () => {
    const course = write("studies", "course", "Data structures", "", { code: "CS2101", credits: 4, status: "taking", gradePoints: 9 });
    const exam = brain.newLinkedPage(db, course.id, "exam", now);
    expect(exam.body).toContain(`|page:${course.id}]]`);
    brain.savePage(db, exam.id, { title: "Midterm", body: exam.body, fields: { examOn: "2026-10-05", at: "09:30, LT-2" }, baseRevision: exam.revision }, now);
    write("studies", "course", "Economics", "", { credits: 2, status: "done", gradePoints: 7 });
    write("studies", "course", "Dropped one", "", { credits: 3, status: "dropped", gradePoints: 2 });
    // An exam whose title names the course's code belongs to it too.
    write("studies", "exam", "CS2101 final", "", { examOn: "2026-12-01" });

    const studies = life.studiesOverview(db, companyId, now);
    expect(studies.exams.map((row) => [row.title, row.course?.title, row.daysLeft])).toEqual([
      ["Midterm", "Data structures", 17],
      ["CS2101 final", "Data structures", 74],
    ]);
    expect(studies.courses[0]).toMatchObject({ title: "Data structures", nextExam: { title: "Midterm", on: "2026-10-05" } });
    // (9 × 4 + 7 × 2) / 6, the dropped course left out.
    expect(studies.average).toEqual({ value: 8.33, credits: 6, courses: 2 });

    expect(dueSoon(db, companyId, "2026-09-18").map((deadline) => [deadline.title, deadline.what])).toEqual([
      ["Midterm", "Exam, 09:30, LT-2"],
    ]);
    expect(dueSoon(db, companyId, "2026-10-06").some((deadline) => deadline.title === "Midterm")).toBe(false);
  });

  it("makes a course's assignments college tasks, and an exam's revision due the day before it", () => {
    const course = write("studies", "course", "Data structures", "## Assignments\n\n- [ ] Problem set 3 (by 2026-09-25)\n- [ ] Read chapter 5");
    const made = makeTasks(db, course.id, null, now);
    expect(made.steps.map((step) => step.task?.dueOn)).toEqual(["2026-09-25", "2026-09-25"]);
    const areas = db.prepare(`SELECT area FROM tasks WHERE page_id = ?`).all(course.id) as { area: string }[];
    expect(areas.map((row) => row.area)).toEqual(["college", "college"]);

    const exam = write("studies", "exam", "Midterm", "## To revise\n\n- [ ] Trees", { examOn: "2026-10-05" });
    expect(makeTasks(db, exam.id, null, now).steps[0]?.task?.dueOn).toBe("2026-10-04");
    const goal = write("goals", "life-goal", "Run 10 km", "- [ ] Buy shoes", { area: "health" });
    makeTasks(db, goal.id, null, now);
    expect(db.prepare(`SELECT area FROM tasks WHERE page_id = ?`).get(goal.id)).toEqual({ area: "health" });
  });
});

describe("time for a page", () => {
  it("sets a repeat aside on the Calendar tied to the page, and says what it got", () => {
    const hobby = write("hobbies", "hobby", "Guitar", "", { hoursWanted: 3, status: "doing-it" });
    // Friday 11:30: a 10:00 start is past, so the first is next Friday; an 18:00 one is tonight.
    const time = life.makeTime(db, hobby.id, { weekdays: [5], startsAt: "18:00", minutes: 60, until: "2026-10-16" }, now);
    expect(time.series).toEqual([
      expect.objectContaining({ weekdays: [5], startsAt: "18:00", minutes: 60, fromDay: today, untilDay: "2026-10-16", active: true }),
    ]);
    expect(time.next).toEqual({ day: today, startsAt: "18:00", minutes: 60 });
    expect(time.wantedWeekly).toBe(180);
    const tonight = listBlocks(db, companyId, today)[0];
    expect(tonight).toMatchObject({ title: "Guitar", kind: "personal", pageId: hobby.id, pageTitle: "Guitar" });

    const morning = life.makeTime(db, hobby.id, { weekdays: [5], startsAt: "10:00", minutes: 30, until: "2026-10-16" }, now);
    expect(morning.series.find((series) => series.startsAt === "10:00")?.fromDay).toBe("2026-09-19");

    // Four weeks on, three Fridays happened and one was skipped.
    const fridays = ["2026-09-18", "2026-09-25", "2026-10-02", "2026-10-09"];
    const skip = listBlocks(db, companyId, "2026-10-02").find((block) => block.startsAt === "18:00");
    if (skip) setOutcome(db, skip.id, "skipped");
    const later = life.pageTime(db, hobby.id, new Date("2026-10-10T06:00:00.000Z"));
    expect(fridays).toHaveLength(4);
    expect(later.planned).toBe(4 * 60 + 3 * 30);
    expect(later.kept).toBe(3 * 60 + 3 * 30);
    expect(life.hobbiesOverview(db, companyId, new Date("2026-10-10T06:00:00.000Z"))[0]).toMatchObject({ title: "Guitar", keptMinutes: 270 });

    // Stopping keeps what happened and takes what is still to come.
    const series = later.series.find((each) => each.startsAt === "18:00");
    const stopped = life.stopTime(db, series?.id, new Date("2026-10-10T06:00:00.000Z"));
    expect(stopped.series.find((each) => each.startsAt === "18:00")?.active).toBe(false);
    expect(listBlocks(db, companyId, "2026-10-16").filter((block) => block.startsAt === "18:00")).toHaveLength(0);
    expect(listBlocks(db, companyId, "2026-10-09").filter((block) => block.startsAt === "18:00")).toHaveLength(1);
  });

  it("refuses an end before the start", () => {
    const course = write("studies", "course", "Data structures");
    expect(() => life.makeTime(db, course.id, { weekdays: [1], startsAt: "09:00", minutes: 60, until: "2026-09-01" }, now)).toThrow(
      "last day",
    );
  });
});

describe("goals", () => {
  it("are read with how far along each is, open ones first, soonest first", () => {
    write("goals", "life-goal", "Read 12 books", "", { area: "personal", target: 12, progress: 3, unit: "books", byOn: "2026-12-31" });
    write("goals", "life-goal", "Run 10 km", "", { area: "health", byOn: "2026-11-01" });
    write("goals", "life-goal", "Learn to swim", "", { done: true });
    expect(life.goalsOverview(db, companyId, now).map((goal) => [goal.title, goal.percent, goal.daysLeft])).toEqual([
      ["Run 10 km", null, 44],
      ["Read 12 books", 25, 104],
      ["Learn to swim", 100, null],
    ]);
  });
});
