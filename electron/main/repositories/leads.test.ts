import { beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { migrate } from "../db/migrations";
import { createCompany, listCompanies, listStages } from "./companies";
import {
  createLead,
  deleteLead,
  deleteMany,
  findLead,
  listActivities,
  listLeads,
  logActivity,
  setLeadStage,
  setStageForMany,
  updateLead,
} from "./leads";
import { completeTask, createTask } from "./tasks";
import { shiftDay, today as todayIn } from "@shared/dates";
import {
  leadInput,
  taskInput,
  type Company,
  type LeadInput,
  type PipelineStage,
} from "@shared/domain";

/** Today in the fixture company's zone, for the tasks these tests schedule. */
const TODAY = todayIn("Asia/Kolkata", new Date("2026-09-04T06:00:00Z"));

let db: Database.Database;
let company: Company;
let stages: PipelineStage[];

/** Runs a partial form through the schema, the way the IPC layer does. */
function input(fields: Partial<LeadInput> & { name: string }): LeadInput {
  return leadInput.parse(fields);
}

beforeEach(() => {
  db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrate(db);
  company = createCompany(db, {
    name: "Unifloe",
    accent: "blue",
    timezone: "Asia/Kolkata",
  });
  stages = listStages(db, company.id);
});

describe("createLead", () => {
  it("stores a lead with only a name", () => {
    // The real source file has rows where everything but the name is missing.
    const lead = createLead(db, company.id, input({ name: "JNS Public School" }));

    expect(lead.name).toBe("JNS Public School");
    expect(lead.email).toBeNull();
    expect(lead.phone).toBeNull();
    expect(lead.tags).toEqual([]);
  });

  it("drops the lead into the first stage when none is given", () => {
    // A lead outside the funnel is invisible on the board.
    const lead = createLead(db, company.id, input({ name: "Bengaluru Public School" }));
    expect(lead.stageId).toBe(stages[0]?.id);
  });

  it("honours an explicit stage", () => {
    const target = stages[2];
    const lead = createLead(
      db,
      company.id,
      input({ name: "TRIO World School", stageId: target?.id ?? null }),
    );
    expect(lead.stageId).toBe(target?.id);
  });

  it("opens the timeline with a created entry", () => {
    const lead = createLead(db, company.id, input({ name: "JES Public School" }));
    const timeline = listActivities(db, lead.id);

    expect(timeline).toHaveLength(1);
    expect(timeline[0]?.kind).toBe("created");
  });

  it("turns blank form fields into null rather than empty strings", () => {
    // Two representations of "unset" would make every later query ambiguous.
    const lead = createLead(
      db,
      company.id,
      input({ name: "Oakridge", email: "  ", city: "" }),
    );
    expect(lead.email).toBeNull();
    expect(lead.city).toBeNull();
  });

  it("trims what it does keep", () => {
    const lead = createLead(
      db,
      company.id,
      input({ name: "  Delhi Public School  ", city: " Bengaluru " }),
    );
    expect(lead.name).toBe("Delhi Public School");
    expect(lead.city).toBe("Bengaluru");
  });

  it("refuses a lead with no name", () => {
    expect(() => input({ name: "   " })).toThrow();
  });
});

describe("listLeads", () => {
  beforeEach(() => {
    createLead(
      db,
      company.id,
      input({ name: "Alpha School", city: "Bengaluru", email: "a@example.com", value: 50 }),
    );
    createLead(
      db,
      company.id,
      input({ name: "Beta Academy", city: "Mysore", phone: "9480004094" }),
    );
    createLead(
      db,
      company.id,
      input({ name: "Gamma College", contactPerson: "Priya", value: 200 }),
    );
  });

  it("returns every lead in the company", () => {
    expect(listLeads(db, { companyId: company.id })).toHaveLength(3);
  });

  it("keeps companies apart", () => {
    const other = createCompany(db, {
      name: "PaperKite",
      accent: "rose",
      timezone: "Asia/Kolkata",
    });
    createLead(db, other.id, input({ name: "Someone else" }));

    expect(listLeads(db, { companyId: company.id })).toHaveLength(3);
    expect(listLeads(db, { companyId: other.id })).toHaveLength(1);
  });

  it("searches across name, contact, email, phone and city", () => {
    const find = (search: string) =>
      listLeads(db, { companyId: company.id, search }).map((l) => l.name);

    expect(find("alpha")).toEqual(["Alpha School"]);
    expect(find("Mysore")).toEqual(["Beta Academy"]);
    expect(find("a@example")).toEqual(["Alpha School"]);
    expect(find("9480")).toEqual(["Beta Academy"]);
    expect(find("Priya")).toEqual(["Gamma College"]);
  });

  it("searches without regard to case", () => {
    expect(listLeads(db, { companyId: company.id, search: "BETA" })).toHaveLength(1);
  });

  it("treats % and _ as characters, not wildcards", () => {
    // Without ESCAPE, a search for "%" matches every row and the box looks
    // broken in the one case a user notices.
    createLead(db, company.id, input({ name: "50% discount lead" }));

    const hits = listLeads(db, { companyId: company.id, search: "%" });
    expect(hits.map((l) => l.name)).toEqual(["50% discount lead"]);
  });

  it("filters by stage", () => {
    const target = stages[3];
    const moved = listLeads(db, { companyId: company.id })[0];
    setLeadStage(db, moved!.id, target!.id);

    const inStage = listLeads(db, { companyId: company.id, stageId: target!.id });
    expect(inStage).toHaveLength(1);
    expect(inStage[0]?.id).toBe(moved!.id);
  });

  it("filters to leads with no stage at all", () => {
    const orphan = listLeads(db, { companyId: company.id })[0];
    setLeadStage(db, orphan!.id, null);

    const none = listLeads(db, { companyId: company.id, stageId: null });
    expect(none.map((l) => l.id)).toEqual([orphan!.id]);
  });

  it("sorts by name", () => {
    const names = listLeads(db, { companyId: company.id, sort: "name" }).map(
      (l) => l.name,
    );
    expect(names).toEqual(["Alpha School", "Beta Academy", "Gamma College"]);
  });

  it("sorts by value, putting unvalued leads last", () => {
    // An unvalued lead is unknown, not worthless, so it does not sort as zero.
    const values = listLeads(db, { companyId: company.id, sort: "value" }).map(
      (l) => l.value,
    );
    expect(values).toEqual([200, 50, null]);
  });
});

describe("updateLead", () => {
  it("applies the edit", () => {
    const lead = createLead(db, company.id, input({ name: "Old name" }));
    const updated = updateLead(
      db,
      lead.id,
      input({ name: "New name", city: "Bengaluru" }),
    );

    expect(updated.name).toBe("New name");
    expect(updated.city).toBe("Bengaluru");
  });

  it("records which fields changed, not a full diff", () => {
    const lead = createLead(db, company.id, input({ name: "School" }));
    updateLead(
      db,
      lead.id,
      input({
        name: "School",
        email: "x@example.com",
        city: "Pune",
        stageId: lead.stageId,
      }),
    );

    const [latest] = listActivities(db, lead.id);
    expect(latest?.kind).toBe("field_change");
    expect(latest?.body).toBe("email, city");
  });

  it("applies the record wholesale, so an omitted field is cleared", () => {
    // The sharp edge worth knowing: update is not a patch. A caller that
    // sends a partial record clears everything it left out, including the
    // stage. The edit form therefore always sends the whole lead.
    const lead = createLead(
      db,
      company.id,
      input({ name: "School", city: "Pune", email: "x@example.com" }),
    );

    const updated = updateLead(db, lead.id, input({ name: "School" }));

    expect(updated.city).toBeNull();
    expect(updated.email).toBeNull();
    expect(updated.stageId).toBeNull();
  });

  it("writes nothing to the timeline when nothing changed", () => {
    // Opening a lead, touching nothing and saving should not leave a trace.
    const lead = createLead(db, company.id, input({ name: "School", city: "Pune" }));
    const before = listActivities(db, lead.id).length;

    updateLead(db, lead.id, input({ name: "School", city: "Pune", stageId: lead.stageId }));

    expect(listActivities(db, lead.id)).toHaveLength(before);
  });

  it("records a stage move separately from other edits", () => {
    const lead = createLead(db, company.id, input({ name: "School" }));
    updateLead(
      db,
      lead.id,
      input({ name: "School", city: "Pune", stageId: stages[4]?.id ?? null }),
    );

    const kinds = listActivities(db, lead.id).map((a) => a.kind);
    expect(kinds).toContain("stage_change");
    expect(kinds).toContain("field_change");
  });

  it("refuses to edit a lead that is gone", () => {
    expect(() => updateLead(db, "nope", input({ name: "x" }))).toThrow(
      "That lead no longer exists.",
    );
  });
});

describe("setLeadStage", () => {
  it("moves the lead and names the new stage on the timeline", () => {
    const lead = createLead(db, company.id, input({ name: "School" }));
    const target = stages[5];

    const moved = setLeadStage(db, lead.id, target!.id);
    expect(moved.stageId).toBe(target!.id);

    const [latest] = listActivities(db, lead.id);
    expect(latest?.kind).toBe("stage_change");
    expect(latest?.body).toBe(target!.name);
  });

  it("does nothing when the lead is already in that stage", () => {
    const lead = createLead(db, company.id, input({ name: "School" }));
    const before = listActivities(db, lead.id).length;

    setLeadStage(db, lead.id, lead.stageId);

    expect(listActivities(db, lead.id)).toHaveLength(before);
  });

  it("says so plainly when the lead has no stage", () => {
    const lead = createLead(db, company.id, input({ name: "School" }));
    setLeadStage(db, lead.id, null);

    const [latest] = listActivities(db, lead.id);
    expect(latest?.body).toBe("No stage");
  });
});

describe("the timeline", () => {
  it("moves the last-contacted date for a call", () => {
    const lead = createLead(db, company.id, input({ name: "School" }));
    expect(lead.lastContactedAt).toBeNull();

    logActivity(db, { leadId: lead.id, kind: "call", body: "Left a voicemail" });

    expect(findLead(db, lead.id)?.lastContactedAt).not.toBeNull();
  });

  it("does not move it for a note", () => {
    // Writing something down is not contact, and the going-cold list depends
    // on that distinction being honest.
    const lead = createLead(db, company.id, input({ name: "School" }));
    logActivity(db, { leadId: lead.id, kind: "note", body: "Found their website" });

    expect(findLead(db, lead.id)?.lastContactedAt).toBeNull();
  });

  it("returns newest first", () => {
    const lead = createLead(db, company.id, input({ name: "School" }));
    logActivity(db, { leadId: lead.id, kind: "note", body: "First" });
    logActivity(db, { leadId: lead.id, kind: "call", body: "Second" });

    const bodies = listActivities(db, lead.id).map((a) => a.body);
    expect(bodies[0]).toBe("Second");
    expect(bodies.at(-1)).toBeNull(); // the created entry
  });

  it("refuses to log against a lead that is gone", () => {
    expect(() => logActivity(db, { leadId: "nope", kind: "note", body: "x" })).toThrow(
      "That lead no longer exists.",
    );
  });
});

describe("deleteLead", () => {
  it("takes the timeline with it", () => {
    const lead = createLead(db, company.id, input({ name: "School" }));
    logActivity(db, { leadId: lead.id, kind: "note", body: "something" });

    deleteLead(db, lead.id);

    expect(findLead(db, lead.id)).toBeNull();
    const left = db.prepare(`SELECT COUNT(*) AS n FROM activities`).get() as { n: number };
    expect(left.n).toBe(0);
  });

  it("refuses to delete something that is not there", () => {
    expect(() => deleteLead(db, "nope")).toThrow("That lead no longer exists.");
  });
});

describe("company lead counts", () => {
  it("counts only that company's leads", () => {
    const other = createCompany(db, {
      name: "PaperKite",
      accent: "teal",
      timezone: "Asia/Kolkata",
    });
    createLead(db, company.id, input({ name: "One" }));
    createLead(db, company.id, input({ name: "Two" }));
    createLead(db, other.id, input({ name: "Three" }));

    const counts = new Map(listCompanies(db).map((c) => [c.name, c.leadCount]));
    expect(counts.get("Unifloe")).toBe(2);
    expect(counts.get("PaperKite")).toBe(1);
  });
});

describe("cascades", () => {
  it("deletes leads and their timeline when the company is deleted", () => {
    const lead = createLead(db, company.id, input({ name: "School" }));
    logActivity(db, { leadId: lead.id, kind: "note", body: "x" });

    db.prepare(`DELETE FROM companies WHERE id = ?`).run(company.id);

    const leads = db.prepare(`SELECT COUNT(*) AS n FROM leads`).get() as { n: number };
    const acts = db.prepare(`SELECT COUNT(*) AS n FROM activities`).get() as { n: number };
    expect(leads.n).toBe(0);
    expect(acts.n).toBe(0);
  });

  it("keeps the lead when its stage is deleted", () => {
    // Losing a column on the board must not lose the people in it.
    const lead = createLead(db, company.id, input({ name: "School" }));
    db.prepare(`DELETE FROM pipeline_stages WHERE id = ?`).run(lead.stageId);

    const after = findLead(db, lead.id);
    expect(after).not.toBeNull();
    expect(after?.stageId).toBeNull();
  });
});

describe("the table's columns", () => {
  it("carries the soonest open task, so the list can show what is next", () => {
    const lead = createLead(db, company.id, leadInput.parse({ name: "Next" }));
    createTask(
      db,
      company.id,
      taskInput.parse({ leadId: lead.id, title: "Later", dueOn: "2026-09-20", kind: "call" }),
    );
    createTask(
      db,
      company.id,
      taskInput.parse({ leadId: lead.id, title: "Sooner", dueOn: "2026-09-04", kind: "meeting" }),
    );

    const [row] = listLeads(db, { companyId: company.id });
    expect(row?.nextTaskDue).toBe("2026-09-04");
    expect(row?.nextTaskKind).toBe("meeting");
    expect(row?.nextTaskTitle).toBe("Sooner");
  });

  it("ignores a task that is already done", () => {
    const lead = createLead(db, company.id, leadInput.parse({ name: "Done" }));
    const task = createTask(
      db,
      company.id,
      taskInput.parse({ leadId: lead.id, title: "Call", dueOn: "2026-09-04" }),
    );
    completeTask(db, task.id);

    const [row] = listLeads(db, { companyId: company.id });
    expect(row?.nextTaskDue).toBeNull();
  });

  it("says nothing rather than nothing-planned-yet for a lead with no tasks", () => {
    createLead(db, company.id, leadInput.parse({ name: "Bare" }));
    const [row] = listLeads(db, { companyId: company.id });
    expect(row?.nextTaskDue).toBeNull();
    expect(row?.nextTaskKind).toBeNull();
  });
});

describe("sorting a column both ways", () => {
  beforeEach(() => {
    createLead(db, company.id, leadInput.parse({ name: "Alpha", value: 100 }));
    createLead(db, company.id, leadInput.parse({ name: "Bravo", value: 300 }));
    createLead(db, company.id, leadInput.parse({ name: "Charlie" })); // no value
  });

  it("reverses by name", () => {
    const asc = listLeads(db, { companyId: company.id, sort: "name", direction: "asc" });
    const desc = listLeads(db, { companyId: company.id, sort: "name", direction: "desc" });

    expect(asc.map((l) => l.name)).toEqual(["Alpha", "Bravo", "Charlie"]);
    expect(desc.map((l) => l.name)).toEqual(["Charlie", "Bravo", "Alpha"]);
  });

  it("keeps an unvalued lead last in BOTH directions", () => {
    // Unknown is not the same as worthless. Reversing the sort must not
    // promote every lead nobody has valued yet to the top of the list.
    const desc = listLeads(db, { companyId: company.id, sort: "value", direction: "desc" });
    const asc = listLeads(db, { companyId: company.id, sort: "value", direction: "asc" });

    expect(desc.map((l) => l.name)).toEqual(["Bravo", "Alpha", "Charlie"]);
    expect(asc.map((l) => l.name)).toEqual(["Alpha", "Bravo", "Charlie"]);
  });

  it("keeps a lead with nothing planned last in both directions", () => {
    const withTask = listLeads(db, { companyId: company.id })[0];
    if (!withTask) throw new Error("expected a lead");
    createTask(
      db,
      company.id,
      taskInput.parse({ leadId: withTask.id, title: "Call", dueOn: "2026-09-04" }),
    );

    for (const direction of ["asc", "desc"] as const) {
      const rows = listLeads(db, { companyId: company.id, sort: "next", direction });
      expect(rows[0]?.id).toBe(withTask.id);
      expect(rows[rows.length - 1]?.nextTaskDue).toBeNull();
    }
  });

  it("defaults each column to the end somebody actually wants first", () => {
    // No direction given: name goes A-Z, value goes biggest-first.
    expect(listLeads(db, { companyId: company.id, sort: "name" })[0]?.name).toBe("Alpha");
    expect(listLeads(db, { companyId: company.id, sort: "value" })[0]?.name).toBe("Bravo");
  });
});

describe("acting on a selection", () => {
  it("moves every selected lead in one transaction", () => {
    const stages = listStages(db, company.id);
    const target = stages[2];
    if (!target) throw new Error("expected a seeded funnel");

    const a = createLead(db, company.id, leadInput.parse({ name: "A" }));
    const b = createLead(db, company.id, leadInput.parse({ name: "B" }));
    createLead(db, company.id, leadInput.parse({ name: "C" }));

    expect(setStageForMany(db, company.id, [a.id, b.id], target.id)).toBe(2);

    const rows = new Map(listLeads(db, { companyId: company.id }).map((l) => [l.name, l]));
    expect(rows.get("A")?.stageId).toBe(target.id);
    expect(rows.get("B")?.stageId).toBe(target.id);
    expect(rows.get("C")?.stageId).not.toBe(target.id);
  });

  it("writes a stage change on each lead's timeline, as a single move would", () => {
    const stages = listStages(db, company.id);
    const target = stages[1];
    if (!target) throw new Error("expected a seeded funnel");

    const a = createLead(db, company.id, leadInput.parse({ name: "A" }));
    setStageForMany(db, company.id, [a.id], target.id);

    const kinds = listActivities(db, a.id).map((entry) => entry.kind);
    expect(kinds).toContain("stage_change");
  });

  it("counts only what actually moved", () => {
    const stages = listStages(db, company.id);
    const first = stages[0];
    if (!first) throw new Error("expected a seeded funnel");

    // Created leads already start in the first stage, so this moves nothing.
    const a = createLead(db, company.id, leadInput.parse({ name: "A" }));
    expect(setStageForMany(db, company.id, [a.id], first.id)).toBe(0);
  });

  it("will not reach into another company's leads", () => {
    const other = createCompany(db, { name: "Other", accent: "teal", timezone: "UTC" });
    const theirs = createLead(db, other.id, leadInput.parse({ name: "Theirs" }));
    const mine = createLead(db, company.id, leadInput.parse({ name: "Mine" }));

    // A selection held on screen while the workspace changed underneath.
    expect(deleteMany(db, company.id, [mine.id, theirs.id])).toBe(1);
    expect(listLeads(db, { companyId: other.id }).map((l) => l.name)).toEqual(["Theirs"]);
  });

  it("deletes every selected lead and its timeline", () => {
    const a = createLead(db, company.id, leadInput.parse({ name: "A" }));
    const b = createLead(db, company.id, leadInput.parse({ name: "B" }));
    createLead(db, company.id, leadInput.parse({ name: "C" }));

    expect(deleteMany(db, company.id, [a.id, b.id])).toBe(2);
    expect(listLeads(db, { companyId: company.id }).map((l) => l.name)).toEqual(["C"]);
    expect(listActivities(db, a.id)).toEqual([]);
  });

  it("does nothing at all for an empty selection", () => {
    expect(setStageForMany(db, company.id, [], null)).toBe(0);
    expect(deleteMany(db, company.id, [])).toBe(0);
  });
});

describe("sorting the leads table both ways", () => {
  beforeEach(() => {
    const stages = listStages(db, company.id);
    createLead(db, company.id, leadInput.parse({ name: "Bravo", value: 200, stageId: stages[1]?.id }));
    createLead(db, company.id, leadInput.parse({ name: "alpha", value: 100, stageId: stages[0]?.id }));
    createLead(db, company.id, leadInput.parse({ name: "Charlie", stageId: stages[2]?.id }));
  });

  const names = (sort: "name" | "value" | "next", direction: "asc" | "desc") =>
    listLeads(db, { companyId: company.id, sort, direction }).map((lead) => lead.name);

  it("sorts by name regardless of case, both ways", () => {
    expect(names("name", "asc")).toEqual(["alpha", "Bravo", "Charlie"]);
    expect(names("name", "desc")).toEqual(["Charlie", "Bravo", "alpha"]);
  });

  it("keeps an unvalued lead last whichever way the arrow points", () => {
    // Unknown is not the same as worthless, so it never leads an ascending
    // sort by value - which is the reading that would put it first.
    expect(names("value", "desc")).toEqual(["Bravo", "alpha", "Charlie"]);
    expect(names("value", "asc")).toEqual(["alpha", "Bravo", "Charlie"]);
  });

  it("keeps a lead with nothing planned last, whichever way", () => {
    const [first] = listLeads(db, { companyId: company.id, sort: "name", direction: "asc" });
    if (!first) throw new Error("no leads");
    createTask(
      db,
      company.id,
      taskInput.parse({ leadId: first.id, title: "Call", dueOn: TODAY }),
    );

    expect(names("next", "asc")[0]).toBe(first.name);
    expect(names("next", "desc")[0]).toBe(first.name);
  });
});

describe("the next step on a row", () => {
  it("is the soonest open task, not just any of them", () => {
    const lead = createLead(db, company.id, leadInput.parse({ name: "A" }));
    createTask(
      db,
      company.id,
      taskInput.parse({ leadId: lead.id, title: "Later", dueOn: shiftDay(TODAY, 9) }),
    );
    createTask(
      db,
      company.id,
      taskInput.parse({ leadId: lead.id, title: "Sooner", dueOn: shiftDay(TODAY, 2), kind: "call" }),
    );

    const [row] = listLeads(db, { companyId: company.id });
    expect(row?.nextTaskTitle).toBe("Sooner");
    expect(row?.nextTaskDue).toBe(shiftDay(TODAY, 2));
    expect(row?.nextTaskKind).toBe("call");
  });

  it("goes back to nothing once the task is done", () => {
    const lead = createLead(db, company.id, leadInput.parse({ name: "A" }));
    const task = createTask(
      db,
      company.id,
      taskInput.parse({ leadId: lead.id, title: "Call", dueOn: TODAY }),
    );
    completeTask(db, task.id);

    const [row] = listLeads(db, { companyId: company.id });
    expect(row?.nextTaskDue).toBeNull();
    expect(row?.nextTaskTitle).toBeNull();
  });

  it("never shows another lead's task", () => {
    const a = createLead(db, company.id, leadInput.parse({ name: "A" }));
    createLead(db, company.id, leadInput.parse({ name: "B" }));
    createTask(db, company.id, taskInput.parse({ leadId: a.id, title: "Call A", dueOn: TODAY }));

    const rows = listLeads(db, { companyId: company.id, sort: "name", direction: "asc" });
    expect(rows[0]?.nextTaskTitle).toBe("Call A");
    expect(rows[1]?.nextTaskTitle).toBeNull();
  });
});
