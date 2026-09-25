import { describe, expect, it } from "vitest";
import type { BrainPageSummary } from "@shared/brain";
import { companyGoals, goalsByArea } from "./goalAreas";

const goal = (id: string, area: string | null) => ({ id, area });

describe("goalsByArea", () => {
  it("puts goals under their areas in the order tasks use, with the ones without an area last", () => {
    const groups = goalsByArea([goal("a", "health"), goal("b", null), goal("c", "college"), goal("d", "health"), goal("e", "company")]);
    expect(groups.map((group) => [group.area, group.label, group.goals.map((each) => each.id)])).toEqual([
      ["college", "College", ["c"]],
      ["company", "Company", ["e"]],
      ["health", "Health", ["a", "d"]],
      [null, "No area", ["b"]],
    ]);
  });

  it("leaves out areas with nothing in them", () => {
    expect(goalsByArea([goal("a", "personal")]).map((group) => group.area)).toEqual(["personal"]);
    expect(goalsByArea([])).toEqual([]);
  });

  it("counts an area it does not know as none, rather than losing the goal", () => {
    expect(goalsByArea([goal("a", "sailing")])).toEqual([{ area: null, label: "No area", goals: [goal("a", "sailing")] }]);
  });
});

describe("companyGoals", () => {
  const page = (id: string, template: string, extra: Partial<BrainPageSummary> = {}): BrainPageSummary => ({
    id,
    section: "plan",
    template,
    title: id,
    isPinned: false,
    isArchived: false,
    updatedAt: "2026-09-01T00:00:00.000Z",
    excerpt: "",
    ...extra,
  });

  it("keeps goals and milestones from the Plan, pinned first, and nothing else", () => {
    const kept = companyGoals([
      page("plan", "lean-plan"),
      page("revenue", "goal"),
      page("risk", "risk"),
      page("launch", "milestone", { isPinned: true }),
      page("old", "goal", { isArchived: true }),
      page("elsewhere", "goal", { section: "goals" }),
    ]);
    expect(kept.map((each) => each.id)).toEqual(["launch", "revenue"]);
  });
});
