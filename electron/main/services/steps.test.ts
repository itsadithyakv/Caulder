import { beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { migrate } from "../db/migrations";
import { createCompany } from "../repositories/companies";
import { createLead } from "../repositories/leads";
import { completeTask, findTask } from "../repositories/tasks";
import { decisionLog, newPage, savePage } from "./brain";
import { addPerson } from "./people";
import { makeTasks, pageTasks } from "./steps";
import { deadlinesBetween } from "./deadlines";
import { leadInput, type Company } from "@shared/domain";

/**
 * A meeting's action items as tasks, once each, with owners; a playbook run
 * as tasks, again each time; and the decision log.
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

function page(section: string, template: string, title: string, body: string, fields: Record<string, string> = {}) {
  const made = newPage(db, company.id, section, template, now);
  return savePage(db, made.id, { title, body, fields, baseRevision: made.revision }, now);
}

describe("a meeting's action items", () => {
  it("become tasks once each, owned by who was @-named, due a week after the meeting unless they say", () => {
    const asha = addPerson(db, company.id, { name: "Asha Rao", kind: "founder" }, now).person;
    const meeting = page(
      "meetings",
      "meeting",
      "Founder check-in",
      [
        "## Action items",
        "- [ ] Send the proposal @Asha",
        "- [ ] Fix the website @Ravi (by 2026-10-02)",
        "- [x] Book the hall",
      ].join("\n"),
      { heldOn: "2026-09-16" },
    );

    const tasks = makeTasks(db, meeting.id, null, now);
    expect(tasks.mode).toBe("actions");
    const [proposal, website, hall] = tasks.steps;
    expect(proposal?.task).toMatchObject({ dueOn: "2026-09-23", done: false });
    expect(website?.task).toMatchObject({ dueOn: "2026-10-02" });
    expect(hall?.task).toBeNull();

    const task = findTask(db, proposal?.task?.id ?? "");
    expect(task?.title).toBe("Send the proposal (Asha Rao)");
    // Today's row says which page made it, and opens it.
    expect(task).toMatchObject({ pageId: meeting.id, pageTitle: "Founder check-in" });
    const owned = db.prepare(`SELECT person_id, page_id FROM tasks WHERE id = ?`).get(task?.id);
    expect(owned).toEqual({ person_id: asha.id, page_id: meeting.id });
    // Ravi is not on the team; his name is kept in the title all the same.
    expect(findTask(db, website?.task?.id ?? "")?.title).toBe("Fix the website (Ravi)");

    // Made once: pressing again has nothing to do.
    expect(() => makeTasks(db, meeting.id, null, now)).toThrow("task already");
    completeTask(db, proposal?.task?.id ?? "");
    expect(pageTasks(db, meeting.id).steps[0]?.task?.done).toBe(true);

    // An item added later is the only one made next time.
    savePage(
      db,
      meeting.id,
      { title: "Founder check-in", body: `${meeting.body}\n- [ ] Call the bank (day 1)`, fields: { heldOn: "2026-09-16" }, baseRevision: meeting.revision },
      now,
    );
    const again = makeTasks(db, meeting.id, null, now);
    expect(again.steps.at(-1)?.task?.dueOn).toBe(today);
    expect(again.runs.tasks).toBe(3);
  });

  it("are refused on a page that is neither a meeting nor a playbook", () => {
    const idea = page("ideas", "idea", "An idea", "- [ ] Try it");
    expect(() => pageTasks(db, idea.id)).toThrow("Only steps on a meeting");
  });
});

describe("a playbook", () => {
  it("runs as tasks every time, for a contact when one is named", () => {
    const school = createLead(db, company.id, leadInput.parse({ name: "Oakridge" }));
    const playbook = page(
      "playbooks",
      "playbook",
      "Onboarding a school",
      "## Steps\n- [ ] Send the welcome pack\n- [x] Book the first session (day 7)",
    );

    const first = makeTasks(db, playbook.id, school.id, now);
    expect(first).toMatchObject({ mode: "run", runs: { tasks: 2, open: 2 } });
    const titles = db
      .prepare(`SELECT title, due_on, lead_id FROM tasks WHERE page_id = ? ORDER BY due_on`)
      .all(playbook.id);
    expect(titles).toEqual([
      { title: "Send the welcome pack - Oakridge", due_on: today, lead_id: school.id },
      { title: "Book the first session - Oakridge", due_on: "2026-09-25", lead_id: school.id },
    ]);

    expect(makeTasks(db, playbook.id, null, now).runs).toEqual({ tasks: 4, open: 4 });
  });
});

describe("the decision log", () => {
  it("lists decisions newest first with what was decided, and a day to look again reaches the calendar", () => {
    page("decisions", "decision", "Price per school", "## Context\n\nToo cheap.\n\n## What we decided\n\nCharge ₹15,000 a workshop.\n\n## What else we considered\n\nPer seat.", {
      decidedOn: "2026-08-02",
      decidedBy: "Asha and Ravi",
      revisitOn: "2026-12-01",
    });
    page("decisions", "decision", "Hire an intern", "## What we decided\n\nOne sales intern from October.", {
      decidedOn: "2026-09-12",
    });

    expect(decisionLog(db, company.id)).toEqual([
      expect.objectContaining({ title: "Hire an intern", decidedOn: "2026-09-12", summary: "One sales intern from October." }),
      expect.objectContaining({
        title: "Price per school",
        decidedBy: "Asha and Ravi",
        revisitOn: "2026-12-01",
        summary: "Charge ₹15,000 a workshop.",
      }),
    ]);
    expect(
      deadlinesBetween(db, company.id, "2026-12-01", "2026-12-01", today).map((deadline) => [deadline.title, deadline.what]),
    ).toEqual([["Price per school", "Look at the decision again"]]);
  });
});
