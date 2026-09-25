import { beforeEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";

vi.mock("electron", () => ({ Notification: class {}, nativeTheme: { shouldUseDarkColorsForSystemIntegratedUI: false } }));
vi.mock("../identity", () => ({ markFile: () => "" }));

const { migrate } = await import("../db/migrations");
const { createCompany } = await import("../repositories/companies");
const { createLead } = await import("../repositories/leads");
const { addSpend } = await import("../repositories/money");
const { quickAdd } = await import("./quickadd");
const { answerQuestion, cancelTask, lineContext, moveTask, renameTask, restoreTask } = await import("./lines");
const { leadInput } = await import("@shared/domain");
const { newPage, savePage } = await import("./brain");
const { addHabit, tickHabit } = await import("./habits");

let db: Database.Database;
let home: string;

beforeEach(() => {
  db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrate(db);
  home = createCompany(db, { name: "Me", accent: "coffee", timezone: "Asia/Kolkata", kind: "personal" }).id;
});

const add = (title: string, day: string, time: string | null = null, remind = false) =>
  quickAdd(db, home, { title, day, time, minutes: null, kind: "todo", area: null, priority: null, leadId: null, notes: null, followUp: null, repeat: null, remind }).task!;
const hourOf = (taskId: string) =>
  db.prepare(`SELECT day, starts_at, minutes, title FROM blocks WHERE task_id = ?`).get(taskId) as
    | { day: string; starts_at: string; minutes: number; title: string }
    | undefined;

describe("what the line is told", () => {
  it("has the open tasks with their hours, the hours ahead, and what was typed before", () => {
    const gym = add("Go to gym", "2026-09-24", "07:00");
    add("Go to gym", "2026-09-22", "07:00");
    add("Pay rent", "2026-10-01");
    const context = lineContext(db, home, "2026-09-23");
    expect(context.open.find((task) => task.id === gym.id)).toMatchObject({ title: "Go to gym", time: "07:00", minutes: 60 });
    expect(context.busy.map((hour) => hour.day)).toEqual(["2026-09-24"]);
    expect(context.said[0]).toMatchObject({ title: "Go to gym" });
    expect(context.said[0]!.count).toBeGreaterThanOrEqual(2);
    expect(context.timed.map((hour) => hour.day)).toEqual(["2026-09-22"]);
  });
});

describe("a task moved", () => {
  it("takes its hour with it, and keeps the hour when only a day is said", () => {
    const gym = add("Go to gym", "2026-09-23", "18:00", true);
    moveTask(db, gym.id, { day: "2026-09-24", time: null, minutes: null });
    expect(hourOf(gym.id)).toMatchObject({ day: "2026-09-24", starts_at: "18:00" });
    const reminder = db.prepare(`SELECT day, time FROM reminders WHERE task_id = ?`).get(gym.id);
    expect(reminder).toEqual({ day: "2026-09-24", time: "18:00" });

    moveTask(db, gym.id, { day: "2026-09-24", time: "07:00", minutes: null });
    expect(hourOf(gym.id)).toMatchObject({ day: "2026-09-24", starts_at: "07:00", minutes: 60 });
  });

  it("is given an hour when it had none and a time is said", () => {
    const rent = add("Pay rent", "2026-09-30");
    const { time } = moveTask(db, rent.id, { day: "2026-10-01", time: "10:00", minutes: 30 });
    expect(time).toBe("10:00");
    expect(hourOf(rent.id)).toMatchObject({ day: "2026-10-01", starts_at: "10:00", minutes: 30, title: "Pay rent" });
  });
});

describe("a task cancelled, and put back", () => {
  it("goes with its hour, and comes back as it was", () => {
    const dentist = add("Dentist", "2026-09-25", "10:00", true);
    const snapshot = cancelTask(db, dentist.id);
    expect(snapshot).toMatchObject({ title: "Dentist", dueOn: "2026-09-25", block: { startsAt: "10:00", minutes: 60 }, reminder: { time: "10:00" } });
    expect(db.prepare(`SELECT COUNT(*) AS n FROM tasks`).get()).toEqual({ n: 0 });
    expect(db.prepare(`SELECT COUNT(*) AS n FROM blocks`).get()).toEqual({ n: 0 });

    const back = restoreTask(db, home, snapshot);
    expect(back).toMatchObject({ title: "Dentist", dueOn: "2026-09-25", status: "open" });
    expect(hourOf(back.id)).toMatchObject({ day: "2026-09-25", starts_at: "10:00" });
    expect(db.prepare(`SELECT time FROM reminders WHERE task_id = ?`).get(back.id)).toEqual({ time: "10:00" });
  });

  it("refuses a task that is not there any more", () => {
    expect(() => cancelTask(db, "nope")).toThrow("no longer exists");
  });
});

describe("a task renamed", () => {
  it("is called the new thing on the Calendar too", () => {
    const deck = add("Pitch deck", "2026-09-26", "15:00");
    expect(renameTask(db, deck.id, "Investor deck").title).toBe("Investor deck");
    expect(hourOf(deck.id)?.title).toBe("Investor deck");
    expect(() => renameTask(db, deck.id, "  ")).toThrow();
  });
});

describe("a question, answered from what is kept", () => {
  it("says what is on a day, in the order of the day", () => {
    add("Buy milk", "2026-09-24");
    add("Dentist", "2026-09-24", "10:00");
    const answer = answerQuestion(db, home, { ask: "day", day: "2026-09-24", label: "Tomorrow" });
    expect(answer.say).toBe("Tomorrow: 2 things.");
    expect(answer.items.map((item) => item.label)).toEqual(["Dentist", "Buy milk"]);
    expect(answerQuestion(db, home, { ask: "day", day: "2026-09-29", label: "Tuesday" }).say).toBe("Nothing on tuesday yet.");
  });

  it("says whether something was done, from your habits and the company's tasks alike, and ticks nothing", () => {
    const company = createCompany(db, { name: "Unifloe", accent: "blue", timezone: "Asia/Kolkata" }).id;
    const gym = addHabit(db, home, { name: "Gym", weekdays: [1, 2, 3, 4, 5, 6, 7] }).habits[0]!;
    tickHabit(db, gym.id, "2026-09-21", true);
    tickHabit(db, gym.id, "2026-09-22", true);
    const call = quickAdd(db, company, { title: "Call Rahul", day: "2026-09-22", time: null, minutes: null, kind: "call", area: null, priority: null, leadId: null, notes: null, followUp: null, repeat: null, remind: false }).task!;
    // Finished at 11pm in Kolkata on the 22nd, which is still the 22nd there.
    db.prepare(`UPDATE tasks SET status = 'done', completed_at = '2026-09-22T17:30:00.000Z' WHERE id = ?`).run(call.id);

    const week = { from: "2026-09-21", to: "2026-09-23", label: "This week" };
    // Asked in the company: your gym is still found, in your home.
    expect(answerQuestion(db, company, { ask: "did", about: "gym", ...week }).say).toBe("Yes - 2 days this week.");
    expect(answerQuestion(db, company, { ask: "did", about: "call rahul", ...week }).items).toEqual([{ label: "Call Rahul", detail: "2026-09-22" }]);
    expect(answerQuestion(db, company, { ask: "did", about: "swim", ...week }).say).toBe("Not that Caulder can see, this week.");
    const ticks = db.prepare(`SELECT COUNT(*) AS n FROM habit_checks`).get() as { n: number };
    expect(ticks.n).toBe(2);
  });

  it("says whether an hour is free", () => {
    add("Guitar", "2026-09-23", "17:00");
    expect(answerQuestion(db, home, { ask: "free", day: "2026-09-23", time: "17:30", label: "Today" }).say).toBe("Not free at 5:30 PM: Guitar.");
    expect(answerQuestion(db, home, { ask: "free", day: "2026-09-23", time: "19:00", label: "Today" }).say).toBe("Free at 7 PM, today.");
  });

  it("finds a contact's number, and says when there is none", () => {
    createLead(db, home, leadInput.parse({ name: "Orchids School", contactPerson: "Rahul Verma", phone: "98765 43210" }));
    expect(answerQuestion(db, home, { ask: "contact", name: "rahul", want: "phone" }).say).toBe("Rahul Verma: 98765 43210");
    expect(answerQuestion(db, home, { ask: "contact", name: "rahul", want: "email" }).say).toBe("Orchids School has no email saved.");
    expect(answerQuestion(db, home, { ask: "contact", name: "zed", want: "any" }).say).toBe("No contact called zed.");
  });

  it("adds up what was spent, on something or on everything", () => {
    addSpend(db, home, { spentOn: "2026-09-22", amount: 340, what: "Uber" });
    addSpend(db, home, { spentOn: "2026-09-23", amount: 250, what: "Lunch" });
    addSpend(db, home, { spentOn: "2026-09-23", amount: -500, what: "Refund" });
    addSpend(db, home, { spentOn: "2026-09-10", amount: 999, what: "Uber" });
    const week = answerQuestion(db, home, { ask: "spent", from: "2026-09-21", to: "2026-09-23", label: "This week", on: null });
    expect(week.say).toMatch(/590 this week, over 2 things\./);
    const uber = answerQuestion(db, home, { ask: "spent", from: "2026-09-01", to: "2026-09-23", label: "This month", on: "uber" });
    expect(uber.say).toMatch(/1,339 on uber this month/);
  });

  it("says what is due and what is late", () => {
    add("Pay rent", "2026-09-23");
    add("Old thing", "2026-09-20");
    const answer = answerQuestion(db, home, { ask: "due", day: "2026-09-23" });
    expect(answer.say).toBe("1 due today, 1 late.");
    expect(answer.items.map((item) => item.label)).toEqual(["Pay rent", "Old thing"]);
  });

  it("finds when something is, from the tasks", () => {
    add("Mummy's birthday", "2026-10-15");
    expect(answerQuestion(db, home, { ask: "when", about: "mummy's birthday" }).say).toBe("“Mummy's birthday” is on 2026-10-15.");
  });
});

describe("a question answered from what you told it to remember", () => {
  const remembered = (title: string, body: string) => {
    const made = newPage(db, home, "remembered", "page", new Date());
    savePage(db, made.id, { title, body, fields: {}, secrets: {}, baseRevision: made.revision }, new Date());
  };

  it("says where you parked - the latest, not the one before", () => {
    remembered("Where things are", "- **Parked: level 1** · parked on level 1 _(2026-09-01)_\n- **Parked: level 3, spot B12** · parked on level 3 _(2026-09-24)_\n");
    const answer = answerQuestion(db, home, { ask: "recall", about: "parked", label: "where you parked" });
    expect(answer.say).toBe("Parked: level 3, spot B12");
    expect(answer.items[1]).toMatchObject({ label: "Parked: level 1", detail: "Where things are, 2026-09-01 - said before, since changed" });
    expect(answerQuestion(db, home, { ask: "recall", about: "passport", label: "passport" }).say).toBe("Nothing remembered about passport yet.");
  });

  it("finds a birthday on the person's page before any task", () => {
    remembered("Mummy", "- **Birthday: 15 March** · mummy's birthday is on 15 march _(2026-01-02)_\n");
    expect(answerQuestion(db, home, { ask: "when", about: "mummy's birthday" }).say).toBe("Mummy · Birthday: 15 March");
  });
});
