import { describe, it, expect } from "vitest";
import { planEvents, planTasks } from "./gsync";
import type { LocalBlock, LocalTask, RemoteEvent, RemoteTask } from "./gsync";

/**
 * The sync decisions, against cases written out by hand.
 *
 * This is the suite that matters most in the whole feature. Two-way sync is
 * the one thing here that can destroy work somebody did, and every case below
 * is a way it has destroyed work in some other application.
 */

const WINDOW = { from: "2026-09-01", to: "2026-09-30" };

function block(over: Partial<LocalBlock> = {}): LocalBlock {
  return {
    id: "b1",
    day: "2026-09-07",
    startsAt: "09:00",
    minutes: 60,
    title: "Write",
    source: "caulder",
    externalId: null,
    etag: null,
    isDirty: true,
    ...over,
  };
}

function event(over: Partial<RemoteEvent> = {}): RemoteEvent {
  return {
    id: "g1",
    etag: "e1",
    caulderId: "b1",
    title: "Write",
    day: "2026-09-07",
    startsAt: "09:00",
    minutes: 60,
    ...over,
  };
}

describe("what to send", () => {
  it("sends a block that has never been sent", () => {
    const plan = planEvents([block()], [], [], WINDOW);
    expect(plan.create).toHaveLength(1);
  });

  it("leaves a block outside the window alone entirely", () => {
    // A sync of September must not upload a plan for next March. The window is
    // what was asked about, and nothing outside it is any of this run's
    // business.
    const plan = planEvents([block({ day: "2027-03-02" })], [], [], WINDOW);
    expect(plan.create).toHaveLength(0);
    expect(plan.drop).toHaveLength(0);
  });

  it("sends a change made here", () => {
    const mine = block({ externalId: "g1", etag: "e1", isDirty: true, title: "Rewrite" });
    const plan = planEvents([mine], [event()], [], WINDOW);
    expect(plan.update.map((b) => b.title)).toEqual(["Rewrite"]);
    expect(plan.conflicts).toBe(0);
  });

  it("sends nothing when neither side moved", () => {
    const mine = block({ externalId: "g1", etag: "e1", isDirty: false });
    const plan = planEvents([mine], [event()], [], WINDOW);
    expect(plan).toMatchObject({ create: [], update: [], refresh: [], drop: [] });
  });
});

describe("what to take", () => {
  it("adopts an event made in Google", () => {
    const plan = planEvents([], [event({ caulderId: null })], [], WINDOW);
    expect(plan.adopt).toHaveLength(1);
  });

  it("takes a change made there when nothing changed here", () => {
    const mine = block({ externalId: "g1", etag: "e1", isDirty: false });
    const plan = planEvents([mine], [event({ etag: "e2", startsAt: "11:00" })], [], WINDOW);
    expect(plan.refresh).toHaveLength(1);
    expect(plan.refresh[0]?.from.startsAt).toBe("11:00");
  });

  it("ignores an etag that moved without anything we store changing", () => {
    const mine = block({ externalId: "g1", etag: "e1", isDirty: false });
    const plan = planEvents([mine], [event({ etag: "e2" })], [], WINDOW);
    expect(plan.refresh).toHaveLength(0);
  });

  it("treats a missing etag as a change, not as agreement", () => {
    // Google would not say whether its copy moved. Assuming it did not is how
    // an edit made there is silently overwritten on the next push.
    const mine = block({ externalId: "g1", etag: null, isDirty: false });
    const plan = planEvents([mine], [event({ startsAt: "11:00" })], [], WINDOW);
    expect(plan.refresh).toHaveLength(1);
  });
});

describe("when both sides moved", () => {
  it("keeps ours for a block we made, and counts it", () => {
    const mine = block({ externalId: "g1", etag: "e1", isDirty: true, source: "caulder" });
    const plan = planEvents([mine], [event({ etag: "e2", title: "Theirs" })], [], WINDOW);
    expect(plan.update).toHaveLength(1);
    expect(plan.refresh).toHaveLength(0);
    expect(plan.conflicts).toBe(1);
  });

  it("keeps theirs for an event they made, and counts it", () => {
    // The half that stops this being "whoever synced last wins".
    const mirror = block({ externalId: "g1", etag: "e1", isDirty: true, source: "google" });
    const plan = planEvents([mirror], [event({ etag: "e2", title: "Theirs" })], [], WINDOW);
    expect(plan.refresh).toHaveLength(1);
    expect(plan.update).toHaveLength(0);
    expect(plan.conflicts).toBe(1);
  });
});

describe("deletion, which is where this goes wrong", () => {
  it("drops a mirror whose event was deleted in Google", () => {
    const mirror = block({ externalId: "g1", source: "google", isDirty: false });
    const plan = planEvents([mirror], [], [], WINDOW);
    expect(plan.drop).toHaveLength(1);
  });

  it("does NOT drop anything outside the window that was asked about", () => {
    // The trap. Google was asked about September and said nothing about March,
    // which is not the same as saying March is empty. An implementation that
    // reads silence as deletion erases a year of history on one narrow sync.
    const mirror = block({ day: "2027-03-02", externalId: "g1", source: "google" });
    const plan = planEvents([mirror], [], [], WINDOW);
    expect(plan.drop).toHaveLength(0);
    expect(plan.restore).toHaveLength(0);
  });

  it("puts back one of ours that was deleted there", () => {
    // We own it, so its absence in Google is a mistake to correct rather than
    // an instruction to obey.
    const mine = block({ externalId: "g1", source: "caulder", isDirty: false });
    const plan = planEvents([mine], [], [], WINDOW);
    expect(plan.restore).toHaveLength(1);
    expect(plan.drop).toHaveLength(0);
  });

  it("carries tombstones through so a deleted block deletes its event", () => {
    const plan = planEvents([], [], ["g9"], WINDOW);
    expect(plan.remove).toEqual(["g9"]);
  });

  it("adopts an event naming a block we no longer hold", () => {
    // The block is gone from here, so the event is the only copy left.
    // Skipping it because the name is unfamiliar would lose it.
    const plan = planEvents([], [event({ caulderId: "b-gone" })], [], WINDOW);
    expect(plan.adopt).toHaveLength(1);
  });
});

/* ---- Tasks -------------------------------------------------------------- */

function task(over: Partial<LocalTask> = {}): LocalTask {
  return {
    id: "t1",
    title: "Call the principal",
    dueOn: "2026-09-07",
    notes: null,
    done: false,
    externalId: null,
    isDirty: true,
    ...over,
  };
}

function remoteTask(over: Partial<RemoteTask> = {}): RemoteTask {
  return {
    id: "r1",
    title: "Call the principal",
    due: "2026-09-07",
    notes: null,
    done: false,
    ...over,
  };
}

describe("tasks", () => {
  it("sends a task that has never been sent", () => {
    expect(planTasks([task()], [], [], true).create).toHaveLength(1);
  });

  it("adopts one made in Google", () => {
    expect(planTasks([], [remoteTask()], [], true).adopt).toHaveLength(1);
  });

  it("drops one deleted in Google, when the whole list was read", () => {
    const mine = task({ externalId: "r1", isDirty: false });
    expect(planTasks([mine], [], [], true).drop).toHaveLength(1);
  });

  it("drops NOTHING when the listing stopped early", () => {
    // The bug this argument exists to prevent. Google returns a page at a
    // time; the first version read one page and treated everything it had not
    // seen as deleted, so a list of a hundred and one tasks lost its tail on
    // every single sync.
    const mine = task({ externalId: "r1", isDirty: false });
    expect(planTasks([mine], [], [], false).drop).toHaveLength(0);
  });

  it("never drops a finished task, even from a complete listing", () => {
    // Google prunes completed tasks out of a list after a while. That is
    // tidying on their side; obeying it here would delete the record that you
    // ever did the thing.
    const done = task({ externalId: "r1", done: true, isDirty: false });
    expect(planTasks([done], [], [], true).drop).toHaveLength(0);
  });

  it("never un-ticks something finished here", () => {
    // The behaviour that would end anybody's trust in this on day one.
    const mine = task({ externalId: "r1", done: true, isDirty: false });
    const plan = planTasks([mine], [remoteTask({ done: false })], [], true);
    expect(plan.update).toHaveLength(1);
    expect(plan.refresh).toHaveLength(0);
    expect(plan.conflicts).toBe(0);
  });

  it("takes a tick made in Google", () => {
    const mine = task({ externalId: "r1", done: false, isDirty: true });
    const plan = planTasks([mine], [remoteTask({ done: true })], [], true);
    expect(plan.refresh).toHaveLength(1);
    expect(plan.update).toHaveLength(0);
  });

  it("says nothing about two sides that happen to agree", () => {
    const mine = task({ externalId: "r1", isDirty: true });
    const plan = planTasks([mine], [remoteTask()], [], true);
    expect(plan).toMatchObject({ update: [], refresh: [], conflicts: 0 });
  });

  it("keeps ours and counts it when both were edited differently", () => {
    const mine = task({ externalId: "r1", title: "Ring the principal", isDirty: true });
    const plan = planTasks([mine], [remoteTask({ title: "Email the principal" })], [], true);
    expect(plan.update).toHaveLength(1);
    expect(plan.conflicts).toBe(1);
  });

  it("leaves a dateless Google task's date alone", () => {
    // Google Tasks allows no due date; Caulder requires one. Reading "none" as
    // a change would drag the task to an arbitrary day on every sync.
    const mine = task({ externalId: "r1", isDirty: false });
    const plan = planTasks([mine], [remoteTask({ due: null })], [], true);
    expect(plan.refresh).toHaveLength(0);
  });
});
