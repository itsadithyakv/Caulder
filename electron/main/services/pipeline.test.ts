import { beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { migrate } from "../db/migrations";
import { createCompany, listStages } from "../repositories/companies";
import { createLead, findLead, listActivities, setLeadStage } from "../repositories/leads";
import { createTask } from "../repositories/tasks";
import {
  createStage,
  deleteStage,
  moveStage,
  renameStage,
  setStageKind,
} from "../repositories/stages";
import { buildBoard } from "./pipeline";
import { leadInput, taskInput, type Company } from "@shared/domain";

let db: Database.Database;
let company: Company;

function lead(name: string, fields: Record<string, unknown> = {}) {
  return createLead(db, company.id, leadInput.parse({ name, ...fields }));
}

function stageNamed(name: string) {
  const stage = listStages(db, company.id).find((s) => s.name === name);
  if (!stage) throw new Error(`No stage called ${name}`);
  return stage;
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
});

describe("editing the funnel", () => {
  it("adds a stage at the end", () => {
    const stages = createStage(db, company.id, "Negotiating", "open");
    expect(stages.at(-1)).toMatchObject({ name: "Negotiating", kind: "open" });
    expect(stages.at(-1)?.position).toBe(stages.length - 1);
  });

  it("refuses a duplicate name with something you can act on", () => {
    expect(() => createStage(db, company.id, "Contacted", "open")).toThrow(
      'There is already a stage called "Contacted".',
    );
  });

  it("is not fooled by case when checking for duplicates", () => {
    expect(() => createStage(db, company.id, "contacted", "open")).toThrow("already a stage");
  });

  it("renames", () => {
    const stages = renameStage(db, stageNamed("Contacted").id, "Reached out");
    expect(stages.map((s) => s.name)).toContain("Reached out");
  });

  it("changes what a stage means", () => {
    // A company that calls its closed stage something else still needs Caulder
    // to know it is a win.
    const stages = setStageKind(db, stageNamed("Proposal sent").id, "won");
    expect(stages.find((s) => s.name === "Proposal sent")?.kind).toBe("won");
  });

  it("moves a stage along the board", () => {
    const before = listStages(db, company.id).map((s) => s.name);
    const stages = moveStage(db, stageNamed("Interested").id, -1);
    const after = stages.map((s) => s.name);

    expect(before.slice(0, 3)).toEqual(["New", "Contacted", "Interested"]);
    expect(after.slice(0, 3)).toEqual(["New", "Interested", "Contacted"]);
  });

  it("does nothing at the ends rather than failing", () => {
    const first = listStages(db, company.id)[0]!;
    expect(() => moveStage(db, first.id, -1)).not.toThrow();
    expect(listStages(db, company.id)[0]?.name).toBe("New");
  });

  it("keeps positions contiguous after a delete", () => {
    deleteStage(db, stageNamed("Interested").id);
    const positions = listStages(db, company.id).map((s) => s.position);
    expect(positions).toEqual(positions.map((_, index) => index));
  });

  it("keeps the leads when their stage goes", () => {
    // Tidying the funnel must not lose people.
    const school = lead("Bengaluru Public School");
    setLeadStage(db, school.id, stageNamed("Interested").id);

    deleteStage(db, stageNamed("Interested").id);

    const after = findLead(db, school.id);
    expect(after).not.toBeNull();
    expect(after?.stageId).toBeNull();
  });

  it("will not delete the last stage", () => {
    for (const stage of listStages(db, company.id).slice(1)) {
      deleteStage(db, stage.id);
    }
    expect(() => deleteStage(db, listStages(db, company.id)[0]!.id)).toThrow(
      "at least one stage",
    );
  });

  it("says so plainly when the stage is gone", () => {
    expect(() => renameStage(db, "nope", "x")).toThrow("no longer exists");
  });
});

describe("the board", () => {
  it("has a column per stage, in order", () => {
    const board = buildBoard(db, company.id);
    expect(board.columns.map((c) => c.name)).toEqual([
      "New",
      "Contacted",
      "Interested",
      "Meeting booked",
      "Proposal sent",
      "Won",
      "Lost",
    ]);
  });

  it("puts each lead in its own column", () => {
    lead("Alpha School");
    const beta = lead("Beta Academy");
    setLeadStage(db, beta.id, stageNamed("Interested").id);

    const board = buildBoard(db, company.id);
    const byName = new Map(board.columns.map((c) => [c.name, c]));

    expect(byName.get("New")?.cards.map((card) => card.name)).toEqual(["Alpha School"]);
    expect(byName.get("Interested")?.cards.map((card) => card.name)).toEqual(["Beta Academy"]);
  });

  it("totals the value of each column", () => {
    lead("Alpha School", { value: 45000 });
    lead("Beta Academy", { value: 120000 });
    // An unvalued lead contributes nothing rather than counting as zero.
    lead("Gamma College");

    const [first] = buildBoard(db, company.id).columns;
    expect(first?.total).toBe(3);
    expect(first?.value).toBe(165000);
  });

  it("marks a card that has a next step planned", () => {
    const alpha = lead("Alpha School");
    lead("Beta Academy");
    createTask(
      db,
      company.id,
      taskInput.parse({ leadId: alpha.id, title: "Call them", dueOn: "2026-09-10" }),
    );

    const cards = buildBoard(db, company.id).columns[0]?.cards ?? [];
    expect(cards.find((c) => c.name === "Alpha School")?.hasNextStep).toBe(true);
    expect(cards.find((c) => c.name === "Beta Academy")?.hasNextStep).toBe(false);
  });

  it("shows an Unstaged column only when something is in it", () => {
    const school = lead("Alpha School");
    expect(buildBoard(db, company.id).columns.map((c) => c.name)).not.toContain("Unstaged");

    setLeadStage(db, school.id, null);

    const columns = buildBoard(db, company.id).columns;
    expect(columns.at(-1)?.name).toBe("Unstaged");
    expect(columns.at(-1)?.stageId).toBeNull();
  });

  it("keeps a lead visible after its stage is deleted", () => {
    // The pair that matters: deleting a stage nulls its leads, and the board
    // has to give them somewhere to be seen and moved from.
    const school = lead("Bengaluru Public School");
    setLeadStage(db, school.id, stageNamed("Interested").id);
    deleteStage(db, stageNamed("Interested").id);

    const unstaged = buildBoard(db, company.id).columns.find((c) => c.name === "Unstaged");
    expect(unstaged?.cards.map((card) => card.name)).toEqual(["Bengaluru Public School"]);
  });

  it("keeps companies apart", () => {
    const other = createCompany(db, {
      name: "PaperKite",
      accent: "rose",
      timezone: "Asia/Kolkata",
    });
    lead("Mine");
    createLead(db, other.id, leadInput.parse({ name: "Not mine" }));

    const board = buildBoard(db, company.id);
    const names = board.columns.flatMap((c) => c.cards.map((card) => card.name));
    expect(names).toEqual(["Mine"]);
  });

  it("shows the people you sell to, and not the accountant", () => {
    lead("Oakridge");
    lead("Sharma & Co", { relationship: "accountant" });
    lead("Paper supplier", { relationship: "vendor" });

    const names = buildBoard(db, company.id).columns.flatMap((c) => c.cards.map((card) => card.name));
    expect(names).toEqual(["Oakridge"]);
  });

  it("makes a prospect a customer when the deal is won, and nobody else", () => {
    const prospect = lead("Oakridge");
    const investor = lead("Angel", { relationship: "investor" });

    setLeadStage(db, prospect.id, stageNamed("Won").id);
    setLeadStage(db, investor.id, stageNamed("Won").id);

    expect(findLead(db, prospect.id)?.relationship).toBe("customer");
    expect(findLead(db, investor.id)?.relationship).toBe("investor");

    // Moving a customer back does not make them a prospect again: they bought.
    setLeadStage(db, prospect.id, stageNamed("New").id);
    expect(findLead(db, prospect.id)?.relationship).toBe("customer");
  });

  it("counts every lead even where it renders only some", () => {
    // Won and Lost grow without limit; the count above a column is the truth,
    // the cards below it are the first hundred.
    const insert = db.prepare(
      `INSERT INTO leads (id, company_id, name, created_at, updated_at, tags)
       VALUES (?, ?, ?, ?, ?, '[]')`,
    );
    const deal = db.prepare(
      `INSERT INTO deals (id, company_id, lead_id, title, stage_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    const stageId = listStages(db, company.id)[0]!.id;
    const now = new Date().toISOString();
    for (let i = 0; i < 120; i += 1) {
      insert.run(`bulk-${i}`, company.id, `School ${i}`, now, now);
      deal.run(`deal-${i}`, company.id, `bulk-${i}`, `School ${i}`, stageId, now, now);
    }

    const [first] = buildBoard(db, company.id).columns;
    expect(first?.total).toBe(120);
    expect(first?.cards).toHaveLength(100);
  });
});

describe("moving a card", () => {
  it("records the move on the lead's history", () => {
    // Already the behaviour of setLeadStage; asserted here because the board is
    // now the main way somebody triggers it.
    const school = lead("Bengaluru Public School");
    setLeadStage(db, school.id, stageNamed("Meeting booked").id);

    const [latest] = listActivities(db, school.id);
    expect(latest?.kind).toBe("stage_change");
    expect(latest?.body).toBe("Meeting booked");
  });

  it("writes nothing when the card lands where it started", () => {
    const school = lead("Bengaluru Public School");
    const before = listActivities(db, school.id).length;
    setLeadStage(db, school.id, school.stageId);
    expect(listActivities(db, school.id)).toHaveLength(before);
  });
});
