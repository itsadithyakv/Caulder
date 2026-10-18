import { describe, it, expect } from "vitest";
import { groupDue } from "./grouping";
import type { Task } from "@shared/domain";

/**
 * How "Due today" is divided: by kind, in a fixed order, with what has to
 * happen first inside each heading.
 */

let counter = 0;

function task(over: Partial<Task>): Task {
  counter += 1;
  return {
    id: `t${counter}`,
    companyId: "c",
    leadId: null,
    leadName: null,
    leadDoNotContact: false,
    pageId: null,
    pageTitle: null,
    title: `Task ${counter}`,
    kind: "todo",
    priority: null,
    status: "open",
    dueOn: "2026-09-10",
    notes: null,
    repeats: null,
    completedAt: null,
    createdAt: "2026-09-10T00:00:00.000Z",
    updatedAt: "2026-09-10T00:00:00.000Z",
    ...over,
  };
}

const titles = (tasks: Task[]) => groupDue(tasks).map((group) => group.title);

describe("the headings", () => {
  it("groups by kind, in the fixed order rather than the order they came in", () => {
    expect(
      titles([
        task({ kind: "todo" }),
        task({ kind: "meeting" }),
        task({ kind: "follow_up" }),
        task({ kind: "email" }),
        task({ kind: "call" }),
      ]),
    ).toEqual(["Calls to make", "Emails to send", "Follow-ups", "Meetings", "Other"]);
  });

  it("keeps the calls in one sitting, however they were interleaved", () => {
    const groups = groupDue([
      task({ kind: "call", title: "Ring Oakridge" }),
      task({ kind: "email" }),
      task({ kind: "call", title: "Ring Asha" }),
    ]);
    expect(groups.map((group) => group.title)).toEqual(["Calls to make", "Emails to send"]);
    expect(groups[0]?.tasks.map((t) => t.title)).toEqual(["Ring Oakridge", "Ring Asha"]);
  });

  it("leaves out a heading with nothing under it", () => {
    expect(titles([task({ kind: "meeting" }), task({ kind: "todo" })])).toEqual(["Meetings", "Other"]);
    expect(groupDue([])).toEqual([]);
  });

  it("gives each group a key, a title and its tasks", () => {
    const call = task({ kind: "call" });
    expect(groupDue([call])).toEqual([{ key: "kind-call", title: "Calls to make", tasks: [call] }]);
  });
});

describe("nothing lost", () => {
  it("puts every task under exactly one heading", () => {
    const mixed = [
      task({ kind: "todo" }),
      task({ kind: "call" }),
      task({ kind: "email" }),
      task({ kind: "call" }),
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
    // One urgent email must not lift Emails above Calls; the headings stay
    // where they always are.
    const groups = groupDue([
      task({ kind: "call", title: "Routine", priority: "spare" }),
      task({ kind: "email", title: "Send the contract", priority: "must" }),
      task({ kind: "call", title: "Call back", priority: "must" }),
    ]);
    expect(groups.map((group) => group.title)).toEqual(["Calls to make", "Emails to send"]);
    expect(groups[0]?.tasks.map((t) => t.title)).toEqual(["Call back", "Routine"]);
  });
});
