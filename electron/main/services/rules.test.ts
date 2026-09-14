import { beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { migrate } from "../db/migrations";
import { createCompany, listStages } from "../repositories/companies";
import { createLead, setLeadStage } from "../repositories/leads";
import { listTasksForLead } from "../repositories/tasks";
import { setFollowUpDays } from "./outreach";
import { leadInput, type Company, type PipelineStage } from "@shared/domain";

/**
 * The one rule, built in. Restraint is most of it: a follow-up that fires
 * twice, or on something the person did not do, is worse than none.
 */

const TZ = "Asia/Kolkata";

let db: Database.Database;
let company: Company;
let stages: PipelineStage[];

beforeEach(() => {
  db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrate(db);
  company = createCompany(db, { name: "Unifloe", accent: "blue", timezone: TZ });
  stages = listStages(db, company.id);
});

const titles = (leadId: string) =>
  listTasksForLead(db, leadId)
    .filter((task) => task.status === "open")
    .map((task) => task.title);

describe("the built-in follow-up", () => {
  it("adds one when a deal moves into an open stage with nothing planned", () => {
    const lead = createLead(db, company.id, leadInput.parse({ name: "A" }));
    const contacted = stages[1];
    if (!contacted) throw new Error("expected a seeded funnel");
    setLeadStage(db, lead.id, contacted.id);
    expect(titles(lead.id)).toEqual(["Follow up"]);
  });

  it("leaves a deal alone when something is already planned", () => {
    const lead = createLead(db, company.id, leadInput.parse({ name: "A" }));
    const first = stages[1];
    const second = stages[2];
    if (!first || !second) throw new Error("expected a seeded funnel");
    setLeadStage(db, lead.id, first.id);
    // The follow-up from the first move is the thing already planned.
    setLeadStage(db, lead.id, second.id);
    expect(titles(lead.id)).toEqual(["Follow up"]);
  });

  it("does nothing for a closed stage", () => {
    const lead = createLead(db, company.id, leadInput.parse({ name: "A" }));
    const won = stages.find((stage) => stage.kind === "won");
    if (!won) throw new Error("expected a won stage");
    setLeadStage(db, lead.id, won.id);
    expect(titles(lead.id)).toEqual([]);
  });

  it("does nothing when written rather than moved", () => {
    const lead = createLead(db, company.id, leadInput.parse({ name: "A" }));
    const contacted = stages[1];
    if (!contacted) throw new Error("expected a seeded funnel");
    setLeadStage(db, lead.id, contacted.id, { followUp: false });
    expect(titles(lead.id)).toEqual([]);
  });

  it("is off at zero days, and the setting refuses nonsense", () => {
    setFollowUpDays(db, 0);
    const lead = createLead(db, company.id, leadInput.parse({ name: "A" }));
    const contacted = stages[1];
    if (!contacted) throw new Error("expected a seeded funnel");
    setLeadStage(db, lead.id, contacted.id);
    expect(titles(lead.id)).toEqual([]);
    expect(() => setFollowUpDays(db, -1)).toThrow();
    expect(() => setFollowUpDays(db, 2.5)).toThrow();
  });
});
