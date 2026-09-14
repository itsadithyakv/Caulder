import { describe, it, expect } from "vitest";
import { groupDue } from "./grouping";
import type { Task } from "@shared/domain";

/**
 * When "Due today" splits by area, and when it keeps the call batching.
 */

let counter = 0;

function task(over: Partial<Task>): Task {
  counter += 1;
  return {
    id: `t${counter}`,
    companyId: "c",
    leadId: null,
    leadName: null,
    title: `Task ${counter}`,
    kind: "todo",
    area: "company",
    priority: null,
    status: "open",
    dueOn: "2026-09-10",
    notes: null,
    completedAt: null,
    createdAt: "2026-09-10T00:00:00.000Z",
    updatedAt: "2026-09-10T00:00:00.000Z",
    ...over,
  };
}

const titles = (tasks: Task[]) => groupDue(tasks).map((group) => group.title);

describe("one area", () => {
  it("keeps grouping by kind, so the calls stay in one sitting", () => {
    expect(
      titles([
        task({ kind: "call" }),
        task({ kind: "email" }),
        task({ kind: "call" }),
      ]),
    ).toEqual(["Calls to make", "Emails to send"]);
  });
});

describe("more than one area", () => {
  it("splits by area, in the fixed order rather than the order they came in", () => {
    expect(
      titles([
        task({ area: "health", title: "Gym" }),
        task({ area: "company", kind: "call" }),
        task({ area: "college", title: "Reading for Friday" }),
      ]),
    ).toEqual(["College", "Company", "Health"]);
  });

  it("puts an area typed by hand after the four it knows", () => {
    expect(
      titles([task({ area: "club" }), task({ area: "college" })]),
    ).toEqual(["College", "club"]);
  });

  it("gives the tasks with no area a heading of their own", () => {
    expect(
      titles([task({ area: "college" }), task({ area: "personal" }), task({ area: null })]),
    ).toEqual(["College", "Personal", "No area"]);
  });
});

describe("a task with no area", () => {
  it("does not count as an area, so one from Google Tasks cannot break the batching", () => {
    // Ten company calls and one task pulled in from Google Tasks: still one
    // real area, so still grouped by kind.
    const day = [
      ...Array.from({ length: 10 }, () => task({ kind: "call" })),
      task({ area: null, kind: "todo" }),
    ];
    expect(titles(day)).toEqual(["Calls to make", "Other"]);
  });

  it("leaves a day of nothing but unsorted tasks grouped by kind", () => {
    expect(titles([task({ area: null, kind: "email" })])).toEqual(["Emails to send"]);
  });
});

describe("nothing lost", () => {
  it("puts every task under exactly one heading either way", () => {
    const mixed = [
      task({ area: "college" }),
      task({ area: "company", kind: "call" }),
      task({ area: null }),
      task({ area: "club" }),
    ];
    const grouped = groupDue(mixed).flatMap((group) => group.tasks.map((t) => t.id));
    expect(grouped.sort()).toEqual(mixed.map((t) => t.id).sort());
  });
});

describe("inside a heading", () => {
  const order = (tasks: Task[]) =>
    groupDue(tasks).flatMap((group) => group.tasks.map((t) => t.title));

  it("puts what has to happen first and what can wait last", () => {
    expect(
      order([
        task({ title: "Tidy the drive", priority: "spare" }),
        task({ title: "Send the invoice", priority: "must" }),
        task({ title: "Draft the post", priority: "should" }),
      ]),
    ).toEqual(["Send the invoice", "Draft the post", "Tidy the drive"]);
  });

  it("reads a task nobody set as the middle, not the bottom", () => {
    // Not having said is not the same as having said it can wait.
    expect(
      order([
        task({ title: "Could wait", priority: "spare" }),
        task({ title: "Nobody said", priority: null }),
      ]),
    ).toEqual(["Nobody said", "Could wait"]);
  });

  it("keeps the arrival order among equals", () => {
    expect(
      order([task({ title: "First" }), task({ title: "Second" }), task({ title: "Third" })]),
    ).toEqual(["First", "Second", "Third"]);
  });

  it("orders the rows and never the headings", () => {
    // One urgent college task must not lift College above Company; the
    // headings stay where they always are.
    const groups = groupDue([
      task({ area: "company", title: "Routine", priority: "spare" }),
      task({ area: "college", title: "Exam form", priority: "must" }),
      task({ area: "company", title: "Call back", priority: "must" }),
    ]);
    expect(groups.map((group) => group.title)).toEqual(["College", "Company"]);
    expect(groups[1]?.tasks.map((t) => t.title)).toEqual(["Call back", "Routine"]);
  });
});
