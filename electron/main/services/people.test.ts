import { beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { MIGRATIONS, migrate } from "../db/migrations";
import { createCompany } from "../repositories/companies";
import { createLead } from "../repositories/leads";
import { completeTask, findTask } from "../repositories/tasks";
import { brainHome, newPage, savePage, search } from "./brain";
import {
  addOpening,
  addPerson,
  buildPeople,
  editOpening,
  hire,
  moveCandidate,
  onboard,
  personDetail,
  removeOpening,
  removePerson,
} from "./people";
import { dueSoon } from "./deadlines";
import { listPeople } from "../repositories/people";
import { leadInput, type Company } from "@shared/domain";
import { ONBOARDING } from "@shared/people";

/**
 * People: the team with their terms, a candidate moved along and hired,
 * onboarding run as tasks, and the dates a person brings to Today - and the
 * move from the founder, teammate and open-role pages the brain used to hold.
 */

let db: Database.Database;
let company: Company;
// 18 September 2026, late morning in Bengaluru.
const now = new Date("2026-09-18T06:00:00.000Z");
const today = "2026-09-18";

beforeEach(() => {
  db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrate(db);
  company = createCompany(db, { name: "Unifloe", accent: "blue", timezone: "Asia/Kolkata" });
});

describe("the team", () => {
  it("lists founders first, with their vesting worked out for today", () => {
    addPerson(db, company.id, { name: "Ravi", kind: "employee", role: "Operations", pay: 40000, payPer: "month" }, now);
    addPerson(
      db,
      company.id,
      { name: "Asha", kind: "founder", equity: 48, vestingMonths: 48, cliffMonths: 12, startsOn: "2025-01-15", owns: "Sales" },
      now,
    );

    const overview = buildPeople(db, company.id, now);
    expect(overview.people.map((person) => person.name)).toEqual(["Asha", "Ravi"]);
    expect(overview.people[0]?.vesting).toMatchObject({ vested: 20, cliffOn: "2026-01-15" });
    expect(overview.people[1]).toMatchObject({ status: "current", pay: 40000, payPer: "month", stage: null });
  });

  it("refuses a contact or a role from another company", () => {
    const other = createCompany(db, { name: "Elsewhere", accent: "blue", timezone: "Asia/Kolkata" });
    const theirs = createLead(db, other.id, leadInput.parse({ name: "Not ours" }));
    expect(() => addPerson(db, company.id, { name: "X", leadId: theirs.id }, now)).toThrow("not in this company");
  });

  it("brings an end date and a vesting cliff to Today while they are near", () => {
    addPerson(db, company.id, { name: "Kiran", kind: "freelancer", startsOn: "2026-06-01", endsOn: "2026-10-10" }, now);
    addPerson(db, company.id, { name: "Neha", kind: "intern", startsOn: "2026-06-01", endsOn: "2027-06-01" }, now);
    addPerson(
      db,
      company.id,
      { name: "Advisor Anil", kind: "advisor", equity: 1, vestingMonths: 24, cliffMonths: 6, startsOn: "2026-04-01" },
      now,
    );

    expect(
      dueSoon(db, company.id, today)
        .filter((deadline) => deadline.source === "person")
        .map((deadline) => [deadline.title, deadline.what, deadline.dueOn]),
    ).toEqual([
      ["Advisor Anil", "Vesting cliff", "2026-10-01"],
      ["Kiran", "Contract ends", "2026-10-10"],
    ]);
  });

  it("can be found from search, and counted on the brain's rail", () => {
    addPerson(db, company.id, { name: "Priya Nair", kind: "employee", role: "Designer", notes: "Figma, brand" }, now);
    const hits = search(db, company.id, "figma");
    expect(hits.map((hit) => [hit.kind, hit.title, hit.section])).toEqual([["person", "Priya Nair", "people"]]);
    expect(brainHome(db, company.id, now).counts.people).toBe(1);
  });

  it("answers the checklist's founder items from the table", () => {
    const one = addPerson(db, company.id, { name: "Asha", kind: "founder", owns: "Sales", equity: 50 }, now);
    addPerson(db, company.id, { name: "Ravi", kind: "founder", owns: "Product" }, now);
    const done = () =>
      brainHome(db, company.id, now)
        .checklist.filter((item) => item.section === "people" && item.done)
        .map((item) => item.id);
    expect(done()).toEqual(["founders"]);
    removePerson(db, one.person.id);
    // Ravi alone owns something and has no equity written down.
    expect(done()).toEqual(["founders"]);
  });
});

describe("hiring", () => {
  it("moves a candidate along, hires them as what they join as, and fills the role", () => {
    const role = addOpening(db, company.id, { title: "Sales intern", pay: "₹15,000 a month" }, now).openings[0];
    const candidate = addPerson(
      db,
      company.id,
      { name: "Meera", kind: "candidate", openingId: role?.id, notes: "Good on the phone" },
      now,
    ).person;
    expect(candidate.stage).toBe("applied");
    expect(buildPeople(db, company.id, now).openings[0]?.inPlay).toBe(1);

    const moved = moveCandidate(db, candidate.id, "offer", now);
    expect(moved.people.find((person) => person.id === candidate.id)?.stage).toBe("offer");
    expect(() => moveCandidate(db, candidate.id, "hired", now)).toThrow("Hire them from their page");

    const hired = hire(db, candidate.id, { kind: "intern", startsOn: "2026-10-01" }, now);
    expect(hired.person).toMatchObject({ kind: "intern", stage: "hired", startsOn: "2026-10-01", status: "starting", notes: "Good on the phone" });
    expect(hired.openings[0]).toMatchObject({ status: "filled", inPlay: 0 });
    expect(() => hire(db, candidate.id, { kind: "employee" }, now)).toThrow("already work here");
  });

  it("keeps a role's candidates when the role goes, without the role", () => {
    const role = addOpening(db, company.id, { title: "Designer" }, now).openings[0];
    const candidate = addPerson(db, company.id, { name: "Tara", kind: "candidate", openingId: role?.id }, now).person;
    editOpening(db, role?.id ?? "", { title: "Designer", status: "paused" }, now);
    const after = removeOpening(db, role?.id ?? "", now);
    expect(after.openings).toEqual([]);
    expect(after.people.find((person) => person.id === candidate.id)).toMatchObject({ openingId: null, stage: "applied" });
  });
});

describe("onboarding", () => {
  it("turns the usual checklist for their kind into tasks, due from their start, tied to them", () => {
    const lead = createLead(db, company.id, leadInput.parse({ name: "Meera (contact)" }));
    const intern = addPerson(db, company.id, { name: "Meera", kind: "intern", startsOn: "2026-10-01", leadId: lead.id }, now).person;

    const detail = onboard(db, intern.id, null, now);
    expect(detail.tasks).toHaveLength(ONBOARDING.intern.length);
    expect(detail.tasks[0]).toMatchObject({ title: "Offer letter signed (Meera)", dueOn: "2026-10-01", done: false });
    expect(detail.tasks.at(-1)).toMatchObject({ dueOn: "2026-10-31" });
    expect(detail.person).toMatchObject({ onboardedOn: today, onboarding: { total: ONBOARDING.intern.length, done: 0 } });
    // On the contact too, like any task set on them.
    expect(findTask(db, detail.tasks[0]?.id ?? "")?.leadId).toBe(lead.id);

    completeTask(db, detail.tasks[0]?.id ?? "");
    expect(personDetail(db, intern.id, now).person.onboarding).toEqual({ total: ONBOARDING.intern.length, done: 1 });
  });

  it("can run a playbook page's steps instead, and is refused for a candidate", () => {
    const person = addPerson(db, company.id, { name: "Kiran", kind: "freelancer" }, now).person;
    const made = newPage(db, company.id, "playbooks", "playbook", now);
    savePage(
      db,
      made.id,
      { title: "Freelancer start", body: "- [ ] Send the brief\n- [ ] Review the first draft (day 5)", fields: {}, baseRevision: made.revision },
      now,
    );
    expect(buildPeople(db, company.id, now).checklists).toEqual([{ pageId: made.id, title: "Freelancer start", steps: 2 }]);

    const detail = onboard(db, person.id, made.id, now);
    expect(detail.tasks.map((task) => [task.title, task.dueOn])).toEqual([
      ["Send the brief (Kiran)", today],
      ["Review the first draft (Kiran)", "2026-09-23"],
    ]);

    const candidate = addPerson(db, company.id, { name: "Hopeful", kind: "candidate" }, now).person;
    expect(() => onboard(db, candidate.id, null, now)).toThrow("Hire them first");
  });

  it("leaves the tasks on Today when the person is deleted", () => {
    const person = addPerson(db, company.id, { name: "Ravi", kind: "employee" }, now).person;
    const detail = onboard(db, person.id, null, now);
    removePerson(db, person.id);
    expect(findTask(db, detail.tasks[0]?.id ?? "")).toMatchObject({ status: "open" });
  });
});

describe("migration 27", () => {
  it("turns founder, teammate and open-role pages into people and roles, and takes the pages away", () => {
    const old = new Database(":memory:");
    old.pragma("foreign_keys = ON");
    for (const migration of MIGRATIONS.filter((m) => m.version <= 26)) {
      old.exec(migration.sql);
      old.pragma(`user_version = ${migration.version}`);
    }
    const theirs = createCompany(old, { name: "Unifloe", accent: "blue", timezone: "Asia/Kolkata" });
    const at = "2026-04-01T00:00:00.000Z";
    const insert = old.prepare(
      `INSERT INTO brain_pages (id, company_id, section, template, title, body, fields, created_at, updated_at)
       VALUES (?, ?, 'people', ?, ?, ?, ?, ?, ?)`,
    );
    insert.run(
      "founder-1",
      theirs.id,
      "founder",
      "Asha Rao",
      "Runs the numbers.",
      JSON.stringify({ role: "CEO", owns: "Sales", equity: 60, vesting: "four years, one-year cliff", startedOn: "2025-01-15", email: "asha@unifloe.in" }),
      at,
      at,
    );
    insert.run(
      "teammate-1",
      theirs.id,
      "teammate",
      "Kiran",
      "## What we agreed\n\n",
      JSON.stringify({ kind: "freelancer", role: "Video", pay: 1500, payPer: "hour", startsOn: "2026-05-01", endsOn: "2026-11-30" }),
      at,
      at,
    );
    insert.run(
      "opening-1",
      theirs.id,
      "opening",
      "Sales intern",
      "## What they will do\n\n\n## Who we are looking for\n\n",
      JSON.stringify({ status: "paused", pay: "₹15,000" }),
      at,
      at,
    );

    migrate(old);

    const people = listPeople(old, theirs.id, "2026-09-18");
    expect(people.find((person) => person.id === "founder-1")).toMatchObject({
      name: "Asha Rao",
      kind: "founder",
      role: "CEO",
      owns: "Sales",
      equity: 60,
      startsOn: "2025-01-15",
      email: "asha@unifloe.in",
      notes: "Vesting: four years, one-year cliff\n\nRuns the numbers.",
    });
    expect(people.find((person) => person.id === "teammate-1")).toMatchObject({
      kind: "freelancer",
      pay: 1500,
      payPer: "hour",
      endsOn: "2026-11-30",
      notes: null,
    });
    const role = old.prepare(`SELECT title, status, pay, notes FROM openings WHERE id = 'opening-1'`).get();
    expect(role).toEqual({ title: "Sales intern", status: "paused", pay: "₹15,000", notes: null });

    expect(old.prepare(`SELECT COUNT(*) AS n FROM brain_pages WHERE section = 'people'`).get()).toEqual({ n: 0 });
    // Searchable from the first launch after it.
    expect(search(old, theirs.id, "asha").map((hit) => hit.kind)).toEqual(["person"]);
  });
});
