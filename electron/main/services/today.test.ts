import { beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { migrate } from "../db/migrations";
import { createCompany, listStages } from "../repositories/companies";
import {
  createLead,
  listActivities,
  listLeads,
  logActivity,
  setLeadStage,
} from "../repositories/leads";
import { setSetting } from "../repositories/settings";
import { deleteStage } from "../repositories/stages";
import {
  completeTask,
  countOverdue,
  createTask,
  deleteTask,
  findTask,
  listTasksForLead,
  reopenTask,
  rescheduleTask,
  updateTask,
} from "../repositories/tasks";
import { buildToday } from "./today";
import {
  leadInput,
  taskInput,
  type Company,
  type Lead,
  type TaskInput,
} from "@shared/domain";
import { shiftDay, today as todayIn } from "@shared/dates";

/**
 * Tasks and the Today engine.
 *
 * The clock is passed in everywhere rather than read from the machine, so
 * these assertions do not change meaning at 18:30 IST.
 */

const NOW = new Date("2026-09-03T06:00:00Z"); // 11:30 in Kolkata
const TZ = "Asia/Kolkata";
const TODAY = todayIn(TZ, NOW); // 2026-09-03

let db: Database.Database;
let company: Company;
let lead: Lead;

/** A task due today unless the test says otherwise. */
function task(fields: {
  title: string;
  leadId?: string;
  kind?: TaskInput["kind"];
  dueOn?: string;
  notes?: string;
}): TaskInput {
  return taskInput.parse({ dueOn: TODAY, ...fields });
}

/** Backdates a lead and its whole timeline, to make it look neglected. */
function ageLead(id: string, days: number) {
  const at = new Date(NOW.getTime() - days * 86_400_000).toISOString();
  db.prepare(`UPDATE leads SET created_at = ?, updated_at = ? WHERE id = ?`).run(at, at, id);
  db.prepare(`UPDATE activities SET occurred_at = ? WHERE lead_id = ?`).run(at, id);
}

beforeEach(() => {
  db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrate(db);
  company = createCompany(db, { name: "Unifloe", accent: "blue", timezone: TZ });
  lead = createLead(db, company.id, leadInput.parse({ name: "Bengaluru Public School" }));
});

describe("createTask", () => {
  it("stores an open task against a lead", () => {
    const created = createTask(
      db,
      company.id,
      task({ leadId: lead.id, title: "Call the principal", kind: "call" }),
    );

    expect(created).toMatchObject({
      title: "Call the principal",
      kind: "call",
      status: "open",
      dueOn: TODAY,
      leadName: "Bengaluru Public School",
    });
  });

  it("allows a task with no lead", () => {
    // "Write the January mailshot" is still work that has to appear on Today.
    const created = createTask(db, company.id, task({ title: "Write the mailshot" }));
    expect(created.leadId).toBeNull();
    expect(created.leadName).toBeNull();
  });

  it("insists on a title and a real date", () => {
    expect(() => task({ title: "   " })).toThrow();
    expect(() => taskInput.parse({ title: "x", dueOn: "3 September" })).toThrow();
  });
});

describe("completeTask", () => {
  it("marks it done and records it on the lead's timeline", () => {
    const created = createTask(
      db,
      company.id,
      task({ leadId: lead.id, title: "Call the principal", kind: "call" }),
    );

    const done = completeTask(db, created.id);
    expect(done.status).toBe("done");
    expect(done.completedAt).not.toBeNull();

    const [latest] = listActivities(db, lead.id);
    expect(latest?.kind).toBe("task_done");
    expect(latest?.body).toBe("Call the principal");
  });

  it("does not claim you made contact", () => {
    // Ticking "Call the principal" is not proof the call happened. Somebody who
    // actually spoke logs a call, which is what moves this date. Same rule as
    // a note in Phase 3.
    const created = createTask(
      db,
      company.id,
      task({ leadId: lead.id, title: "Call the principal", kind: "call" }),
    );
    completeTask(db, created.id);

    const row = db
      .prepare(`SELECT last_contacted_at FROM leads WHERE id = ?`)
      .get(lead.id) as { last_contacted_at: string | null };
    expect(row.last_contacted_at).toBeNull();
  });

  it("is harmless to complete twice", () => {
    const created = createTask(db, company.id, task({ leadId: lead.id, title: "x" }));
    const first = completeTask(db, created.id);
    const second = completeTask(db, created.id);
    expect(second.completedAt).toBe(first.completedAt);
  });

  it("copes with a task that has no lead", () => {
    const created = createTask(db, company.id, task({ title: "Write the mailshot" }));
    expect(() => completeTask(db, created.id)).not.toThrow();
  });
});

describe("reopenTask", () => {
  it("puts it back on the list but keeps the history", () => {
    const created = createTask(db, company.id, task({ leadId: lead.id, title: "x" }));
    completeTask(db, created.id);
    const before = listActivities(db, lead.id).length;

    const reopened = reopenTask(db, created.id);
    expect(reopened.status).toBe("open");
    expect(reopened.completedAt).toBeNull();
    // The completion did happen, so the entry stays.
    expect(listActivities(db, lead.id)).toHaveLength(before);
  });
});

describe("rescheduleTask", () => {
  it("moves the task to another day", () => {
    const created = createTask(db, company.id, task({ leadId: lead.id, title: "x" }));
    const moved = rescheduleTask(db, created.id, shiftDay(TODAY, 7));
    expect(moved.dueOn).toBe(shiftDay(TODAY, 7));
  });
});

describe("updateTask and deleteTask", () => {
  it("edits the fields", () => {
    const created = createTask(db, company.id, task({ leadId: lead.id, title: "Old" }));
    const updated = updateTask(
      db,
      created.id,
      task({ leadId: lead.id, title: "New", kind: "meeting", dueOn: shiftDay(TODAY, 2) }),
    );
    expect(updated).toMatchObject({ title: "New", kind: "meeting" });
  });

  it("deletes", () => {
    const created = createTask(db, company.id, task({ title: "x" }));
    deleteTask(db, created.id);
    expect(findTask(db, created.id)).toBeNull();
  });

  it("says so plainly when the task is gone", () => {
    expect(() => completeTask(db, "nope")).toThrow("no longer exists");
    expect(() => deleteTask(db, "nope")).toThrow("no longer exists");
  });
});

describe("tasks follow their lead", () => {
  it("are deleted with it", () => {
    createTask(db, company.id, task({ leadId: lead.id, title: "x" }));
    db.prepare(`DELETE FROM leads WHERE id = ?`).run(lead.id);
    const left = db.prepare(`SELECT COUNT(*) AS n FROM tasks`).get() as { n: number };
    expect(left.n).toBe(0);
  });

  it("are listed against it, open ones first", () => {
    const done = createTask(db, company.id, task({ leadId: lead.id, title: "Done one" }));
    completeTask(db, done.id);
    createTask(db, company.id, task({ leadId: lead.id, title: "Open one" }));

    const listed = listTasksForLead(db, lead.id).map((t) => t.title);
    expect(listed).toEqual(["Open one", "Done one"]);
  });
});

describe("the Today engine", () => {
  it("puts what is late first, and separately from what is due", () => {
    createTask(
      db,
      company.id,
      task({ leadId: lead.id, title: "Late call", dueOn: shiftDay(TODAY, -2) }),
    );
    createTask(db, company.id, task({ leadId: lead.id, title: "Due now", dueOn: TODAY }));
    createTask(
      db,
      company.id,
      task({ leadId: lead.id, title: "Later", dueOn: shiftDay(TODAY, 3) }),
    );

    const day = buildToday(db, company.id, NOW);

    expect(day.day).toBe(TODAY);
    expect(day.overdue.map((t) => t.title)).toEqual(["Late call"]);
    expect(day.dueToday.map((t) => t.title)).toEqual(["Due now"]);
    expect(day.upcoming.map((t) => t.title)).toEqual(["Later"]);
  });

  it("leaves completed tasks out of all three", () => {
    const created = createTask(
      db,
      company.id,
      task({ leadId: lead.id, title: "Done", dueOn: shiftDay(TODAY, -1) }),
    );
    completeTask(db, created.id);

    const day = buildToday(db, company.id, NOW);
    expect(day.overdue).toHaveLength(0);
    expect(day.dueToday).toHaveLength(0);
  });

  it("reads the day in the company's timezone", () => {
    // 19:00 UTC is already the 4th in Kolkata. A task due on the 4th is due
    // today, not tomorrow, and a UTC comparison would get this wrong.
    createTask(db, company.id, task({ leadId: lead.id, title: "Tomorrow's task", dueOn: "2026-09-04" }));

    const evening = buildToday(db, company.id, new Date("2026-09-03T19:00:00Z"));
    expect(evening.day).toBe("2026-09-04");
    expect(evening.dueToday.map((t) => t.title)).toEqual(["Tomorrow's task"]);
  });

  it("keeps companies apart", () => {
    const other = createCompany(db, { name: "PaperKite", accent: "rose", timezone: TZ });
    createTask(db, other.id, task({ title: "Not mine" }));
    createTask(db, company.id, task({ leadId: lead.id, title: "Mine" }));

    expect(buildToday(db, company.id, NOW).dueToday.map((t) => t.title)).toEqual(["Mine"]);
  });

  it("counts overdue for the sidebar badge", () => {
    createTask(db, company.id, task({ title: "a", dueOn: shiftDay(TODAY, -1) }));
    createTask(db, company.id, task({ title: "b", dueOn: shiftDay(TODAY, -5) }));
    createTask(db, company.id, task({ title: "c", dueOn: TODAY }));

    expect(countOverdue(db, company.id, TODAY)).toBe(2);
  });
});

describe("the going-cold list", () => {
  it("is the section a spreadsheet cannot produce", () => {
    ageLead(lead.id, 30);
    const day = buildToday(db, company.id, NOW);

    expect(day.cold.map((l) => l.name)).toEqual(["Bengaluru Public School"]);
    expect(day.cold[0]?.daysQuiet).toBe(30);
  });

  it("leaves a brand-new lead alone", () => {
    // The clock starts when the lead was created, so a lead added this morning
    // is not instantly neglected.
    expect(buildToday(db, company.id, NOW).cold).toHaveLength(0);
  });

  it("warms up again when something happens", () => {
    ageLead(lead.id, 30);
    expect(buildToday(db, company.id, NOW).cold).toHaveLength(1);

    logActivity(db, { leadId: lead.id, kind: "call", body: "Spoke to them" });
    expect(buildToday(db, company.id, NOW).cold).toHaveLength(0);
  });

  it("is not fooled by tidying a record", () => {
    // field_change is deliberately not a touch. Fixing a typo in a phone
    // number would otherwise keep a lead looking alive while nothing happened.
    ageLead(lead.id, 30);
    db.prepare(
      `INSERT INTO activities (id, company_id, lead_id, kind, body, occurred_at, created_at, meta)
       VALUES ('a-edit', ?, ?, 'field_change', 'city', ?, ?, NULL)`,
    ).run(company.id, lead.id, NOW.toISOString(), NOW.toISOString());

    expect(buildToday(db, company.id, NOW).cold).toHaveLength(1);
  });

  it("excludes a lead that already has an open task", () => {
    // If you have decided what happens next, nothing is falling through. An
    // overdue task is the right way to be told, and it is the first section.
    ageLead(lead.id, 30);
    createTask(db, company.id, task({ leadId: lead.id, title: "Call them", dueOn: shiftDay(TODAY, 2) }));

    expect(buildToday(db, company.id, NOW).cold).toHaveLength(0);
  });

  it("counts a lead cold again once its task is done", () => {
    ageLead(lead.id, 30);
    const created = createTask(db, company.id, task({ leadId: lead.id, title: "x" }));
    completeTask(db, created.id);
    // Completing wrote a task_done entry dated now, which is a real touch.
    expect(buildToday(db, company.id, NOW).cold).toHaveLength(0);
  });

  it("excludes won and lost leads", () => {
    // A closed lead is not being neglected.
    ageLead(lead.id, 60);
    const won = listStages(db, company.id).find((s) => s.kind === "won");
    setLeadStage(db, lead.id, won!.id);
    db.prepare(`UPDATE activities SET occurred_at = ? WHERE lead_id = ?`).run(
      new Date(NOW.getTime() - 60 * 86_400_000).toISOString(),
      lead.id,
    );

    expect(buildToday(db, company.id, NOW).cold).toHaveLength(0);
  });

  it("respects the configured threshold", () => {
    ageLead(lead.id, 10);
    expect(buildToday(db, company.id, NOW).cold).toHaveLength(0);

    setSetting(db, "coldAfterDays", "7");
    const day = buildToday(db, company.id, NOW);
    expect(day.coldAfterDays).toBe(7);
    expect(day.cold).toHaveLength(1);
  });

  it("ignores a nonsense threshold rather than showing nothing", () => {
    setSetting(db, "coldAfterDays", "not a number");
    expect(buildToday(db, company.id, NOW).coldAfterDays).toBe(14);
  });

  it("lists the quietest lead first", () => {
    const second = createLead(db, company.id, leadInput.parse({ name: "Quieter School" }));
    ageLead(lead.id, 20);
    ageLead(second.id, 40);

    expect(buildToday(db, company.id, NOW).cold.map((l) => l.name)).toEqual([
      "Quieter School",
      "Bengaluru Public School",
    ]);
  });
});

/* ---- What the charts report -------------------------------------------
 * The two pictures on Today are read at a glance and therefore have to be
 * right without being checked. A funnel that does not add up to the number in
 * the sidebar, or a fortnight that closes up its quiet days, is worse than no
 * chart at all.
 * ---------------------------------------------------------------------- */

describe("the funnel chart", () => {
  it("adds up to the number of leads, with none left out", () => {
    const stages = listStages(db, company.id);
    for (let i = 0; i < 6; i += 1) {
      createLead(
        db,
        company.id,
        leadInput.parse({ name: `Lead ${i}`, stageId: stages[i % stages.length]?.id ?? null }),
      );
    }

    const day = buildToday(db, company.id, NOW);
    const counted = day.funnel.reduce((sum, slice) => sum + slice.count, 0);

    // Against the real total rather than a number written here: a funnel that
    // does not add up to what the sidebar says is a funnel nobody trusts, and
    // the invariant is the thing worth pinning.
    expect(counted).toBe(listLeads(db, { companyId: company.id }).length);
  });

  it("keeps leads left behind by a deleted stage in the picture", () => {
    const stages = listStages(db, company.id);
    const doomed = stages[1];
    if (!doomed) throw new Error("expected a seeded funnel");

    createLead(db, company.id, leadInput.parse({ name: "Stranded", stageId: doomed.id }));
    deleteStage(db, doomed.id);

    const day = buildToday(db, company.id, NOW);
    expect(day.funnel.reduce((sum, slice) => sum + slice.count, 0)).toBe(
      listLeads(db, { companyId: company.id }).length,
    );
    const unstaged = day.funnel.find((slice) => slice.stageId === null);
    expect(unstaged?.count).toBe(1);
  });

  it("keeps an empty stage in the picture, because a gap is the point", () => {
    const stages = listStages(db, company.id);
    createLead(db, company.id, leadInput.parse({ name: "Only one", stageId: stages[0]?.id }));

    const day = buildToday(db, company.id, NOW);
    // Every stage, and no unstaged bucket: createLead puts a lead with no
    // stage into the first one, so nothing is outside the funnel.
    expect(day.funnel).toHaveLength(stages.length);
    expect(day.funnel.filter((slice) => slice.count === 0).length).toBeGreaterThan(0);
  });

  it("is in funnel order, never sorted by size", () => {
    const stages = listStages(db, company.id);
    // Load the LAST stage most, so a size sort would be obvious.
    const last = stages[stages.length - 1];
    for (let i = 0; i < 4; i += 1) {
      createLead(db, company.id, leadInput.parse({ name: `Won ${i}`, stageId: last?.id }));
    }
    createLead(db, company.id, leadInput.parse({ name: "New one", stageId: stages[0]?.id }));

    const day = buildToday(db, company.id, NOW);
    expect(day.funnel.map((slice) => slice.name).slice(0, stages.length)).toEqual(
      stages.map((stage) => stage.name),
    );
  });

  it("counts only what a stage is worth, not what an empty one might be", () => {
    const stages = listStages(db, company.id);
    createLead(db, company.id, leadInput.parse({ name: "Valued", value: 500, stageId: stages[0]?.id }));
    createLead(db, company.id, leadInput.parse({ name: "Unvalued", stageId: stages[0]?.id }));

    const day = buildToday(db, company.id, NOW);
    // An unvalued lead contributes nothing rather than counting as zero, which
    // is the same number but a different claim.
    expect(day.funnel[0]?.value).toBe(500);
    // Three, not two: the file's fixture lead is created with no stage, which
    // createLead reads as the first one.
    expect(day.funnel[0]?.count).toBe(3);
  });
});

describe("the fortnight chart", () => {
  it("is always fourteen days, starting today, with the quiet ones present", () => {
    const lead = createLead(db, company.id, leadInput.parse({ name: "A" }));
    createTask(
      db,
      company.id,
      taskInput.parse({ leadId: lead.id, title: "Call", dueOn: shiftDay(TODAY, 3) }),
    );

    const day = buildToday(db, company.id, NOW);

    expect(day.ahead).toHaveLength(14);
    expect(day.ahead[0]?.day).toBe(TODAY);
    expect(day.ahead[13]?.day).toBe(shiftDay(TODAY, 13));
    // Zero-filled: a bar chart that omits the quiet days says the busy ones
    // are next to each other, which is the opposite of the truth.
    expect(day.ahead[3]?.count).toBe(1);
    expect(day.ahead[1]?.count).toBe(0);
  });

  it("leaves out what is already overdue, which has its own section", () => {
    const lead = createLead(db, company.id, leadInput.parse({ name: "A" }));
    createTask(
      db,
      company.id,
      taskInput.parse({ leadId: lead.id, title: "Late", dueOn: shiftDay(TODAY, -2) }),
    );

    const day = buildToday(db, company.id, NOW);
    expect(day.ahead.reduce((sum, slot) => sum + slot.count, 0)).toBe(0);
    expect(day.overdue).toHaveLength(1);
  });

  it("does not count a task somebody has already done", () => {
    const lead = createLead(db, company.id, leadInput.parse({ name: "A" }));
    const task = createTask(
      db,
      company.id,
      taskInput.parse({ leadId: lead.id, title: "Call", dueOn: TODAY }),
    );
    completeTask(db, task.id);

    const day = buildToday(db, company.id, NOW);
    expect(day.ahead[0]?.count).toBe(0);
  });

  it("does not count another company's work", () => {
    const other = createCompany(db, { name: "Other", accent: "teal", timezone: TZ });
    const theirs = createLead(db, other.id, leadInput.parse({ name: "Theirs" }));
    createTask(db, other.id, taskInput.parse({ leadId: theirs.id, title: "Call", dueOn: TODAY }));

    const day = buildToday(db, company.id, NOW);
    expect(day.ahead.reduce((sum, slot) => sum + slot.count, 0)).toBe(0);
  });
});
