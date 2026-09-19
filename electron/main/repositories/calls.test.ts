import { beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { MIGRATIONS, migrate } from "../db/migrations";
import { createCompany, listStages } from "./companies";
import { createLead, findLead, listActivities } from "./leads";
import { createDeal, listDeals } from "./deals";
import { createTask, findTask, listTasksForLead } from "./tasks";
import { findCall, lastScriptId, listCalls, listScripts, logCall } from "./calls";
import { callContext, startScript } from "../services/calls";
import { newPage, savePage } from "../services/brain";
import { searchEverything } from "./search";
import { leadInput, taskInput, type Company } from "@shared/domain";

/**
 * Calls: scripts as pages, and everything hanging up writes, together.
 */

let db: Database.Database;
let company: Company;

const stage = (name: string) => {
  const found = listStages(db, company.id).find((s) => s.name === name);
  if (!found) throw new Error(`No stage called ${name}`);
  return found.id;
};

// A minute ahead of the clock, so what a call writes is the newest thing on the history.
const now = new Date(Date.now() + 60_000);

beforeEach(() => {
  db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrate(db);
  company = createCompany(db, { name: "Unifloe", accent: "blue", timezone: "Asia/Kolkata" });
});

describe("call scripts", () => {
  it("start from a tone, as pages in Playbooks, and the prompter lists them", () => {
    const warm = startScript(db, company.id, "warm", now);
    expect(warm).toMatchObject({ title: "Warm call script", tone: "warm", caller: null });
    expect(warm.body).toContain("## Questions to ask");
    expect(() => startScript(db, company.id, "shouty", now)).toThrow("Pick a tone");

    // A blank one from the Playbooks button is the professional script.
    const plain = newPage(db, company.id, "playbooks", "call-script", now);
    expect(plain.body).toContain("Good [morning / afternoon]");
    savePage(
      db,
      plain.id,
      { title: "Schools", body: plain.body, fields: { tone: "direct", caller: "Asha" }, baseRevision: plain.revision },
      new Date(now.getTime() + 1000),
    );

    expect(listScripts(db, company.id).map((script) => [script.title, script.tone, script.caller])).toEqual([
      ["Schools", "direct", "Asha"],
      ["Warm call script", "warm", null],
    ]);
    // Only call scripts: an ordinary playbook is not one.
    newPage(db, company.id, "playbooks", "playbook", now);
    expect(listScripts(db, company.id)).toHaveLength(2);
  });

  it("opens the prompter on the script used last, with the company's one-liner", () => {
    const school = createLead(db, company.id, leadInput.parse({ name: "Oakridge" }));
    const profile = newPage(db, company.id, "company", "profile", now);
    savePage(
      db,
      profile.id,
      { title: profile.title, body: "", fields: { oneLiner: "Attendance that takes itself." }, baseRevision: profile.revision },
      now,
    );
    const first = startScript(db, company.id, "warm", now);
    const second = startScript(db, company.id, "direct", now);

    expect(callContext(db, school.id)).toMatchObject({ lastScriptId: null, oneLiner: "Attendance that takes itself." });
    logCall(db, company.id, { leadId: school.id, outcome: "no_answer", scriptId: first.id }, now);
    const context = callContext(db, school.id);
    expect(context.lastScriptId).toBe(first.id);
    expect(context.scripts.map((script) => script.id)).toContain(second.id);
    expect(context.deals).toHaveLength(1);
    expect(context.calls.map((call) => call.outcome)).toEqual(["no_answer"]);
    expect(lastScriptId(db, company.id)).toBe(first.id);
  });
});

describe("logging a call", () => {
  it("records a miss without calling it contact, and plans the next try", () => {
    const school = createLead(db, company.id, leadInput.parse({ name: "Oakridge" }));
    const call = logCall(
      db,
      company.id,
      { leadId: school.id, outcome: "no_answer", next: { title: "Call Oakridge again", dueOn: "2026-09-18" } },
      now,
    );

    expect(call).toMatchObject({ outcome: "no_answer", interest: null, dealTitle: "Oakridge" });
    expect(findLead(db, school.id)?.lastContactedAt).toBeNull();
    expect(listActivities(db, school.id)[0]).toMatchObject({ kind: "call", body: "Didn't pick up" });
    expect(listTasksForLead(db, school.id)).toMatchObject([
      { title: "Call Oakridge again", kind: "call", dueOn: "2026-09-18", status: "open" },
    ]);
    // Nothing moved: a missed call is not news.
    expect(listDeals(db, school.id)[0]?.stageId).toBe(stage("New"));
  });

  it("records a conversation: interest, answers, notes to keep, the deal moved and the task ticked", () => {
    const school = createLead(db, company.id, leadInput.parse({ name: "Oakridge", notes: "Principal prefers mornings." }));
    const task = createTask(db, company.id, taskInput.parse({ leadId: school.id, title: "Call Oakridge", kind: "call", dueOn: "2026-09-17" }));

    const call = logCall(
      db,
      company.id,
      {
        leadId: school.id,
        taskId: task.id,
        outcome: "spoke",
        interest: 4,
        notes: "Wants a demo for the staff.",
        answers: [
          { question: "How many students?", answer: "900" },
          { question: "Who decides?", answer: "" },
        ],
        keepInMind: "Principal prefers mornings.\nBudget meeting in October.",
        next: { title: "Follow up with Oakridge", dueOn: "2026-09-19" },
        stageId: stage("Interested"),
        seconds: 250,
      },
      now,
    );

    expect(call).toMatchObject({ interest: 4, notes: "Wants a demo for the staff.", seconds: 250 });
    expect(call.answers).toEqual([{ question: "How many students?", answer: "900" }]);
    const lead = findLead(db, school.id);
    expect(lead?.lastContactedAt).toBe(now.toISOString());
    expect(lead?.notes).toBe("Principal prefers mornings.\nBudget meeting in October.");
    expect(lead?.stageId).toBe(stage("Interested"));
    expect(findTask(db, task.id)?.status).toBe("done");

    const kinds = listActivities(db, school.id).map((entry) => entry.kind);
    expect(kinds).toEqual(expect.arrayContaining(["call", "field_change", "task_done", "stage_change"]));
    const logged = listActivities(db, school.id).find((entry) => entry.kind === "call");
    expect(logged?.body).toBe(
      "Spoke to them · Interested (4 of 5) · 4 min\n\nWants a demo for the staff.\n\nHow many students?\n→ 900",
    );

    // The one follow-up asked for, not a second from the move.
    expect(listTasksForLead(db, school.id).filter((t) => t.status === "open")).toMatchObject([
      { title: "Follow up with Oakridge", kind: "follow_up" },
    ]);
    // And search finds it by what was said.
    expect(searchEverything(db, company.id, "staff demo").some((hit) => hit.kind === "history")).toBe(true);
  });

  it("loses the deal with a reason when they said no, and leaves notes it was not given", () => {
    const school = createLead(db, company.id, leadInput.parse({ name: "Oakridge", notes: "Keep" }));
    logCall(
      db,
      company.id,
      { leadId: school.id, outcome: "spoke", interest: 1, stageId: stage("Lost"), lossReason: "Not a fit" },
      now,
    );
    expect(listDeals(db, school.id)[0]).toMatchObject({ stageId: stage("Lost"), lossReason: "Not a fit" });
    expect(findLead(db, school.id)?.notes).toBe("Keep");
    const history = listActivities(db, school.id);
    expect(history.some((entry) => entry.kind === "field_change" && entry.body === "notes")).toBe(false);
    expect(history.some((entry) => entry.body === "Lost because: Not a fit")).toBe(true);
  });

  it("goes on the deal it was about, and refuses somebody else's", () => {
    const school = createLead(db, company.id, leadInput.parse({ name: "Oakridge" }));
    const [first] = listDeals(db, school.id);
    createDeal(db, school.id, { title: "Renewal", stageId: stage("Contacted"), value: null });
    const other = createLead(db, company.id, leadInput.parse({ name: "Beacon" }));
    const [theirs] = listDeals(db, other.id);

    const call = logCall(
      db,
      company.id,
      { leadId: school.id, dealId: first!.id, outcome: "spoke", interest: 3, stageId: stage("Contacted") },
      now,
    );
    expect(call.dealTitle).toBe("Oakridge");
    expect(listDeals(db, school.id).find((deal) => deal.id === first!.id)?.stageId).toBe(stage("Contacted"));

    expect(() => logCall(db, company.id, { leadId: school.id, dealId: theirs!.id, outcome: "busy" }, now)).toThrow(
      "not this contact's",
    );
    const elsewhere = createCompany(db, { name: "PaperKite", accent: "teal", timezone: "Asia/Kolkata" });
    expect(() => logCall(db, elsewhere.id, { leadId: school.id, outcome: "busy" }, now)).toThrow("not in this company");
  });

  it("writes nothing at all when a part fails", () => {
    const school = createLead(db, company.id, leadInput.parse({ name: "Oakridge" }));
    const before = listActivities(db, school.id).length;
    expect(() =>
      logCall(db, company.id, { leadId: school.id, outcome: "spoke", interest: 3, stageId: "not-a-stage" }, now),
    ).toThrow();
    expect(listActivities(db, school.id)).toHaveLength(before);
    expect(listCalls(db, school.id)).toEqual([]);
    expect(findLead(db, school.id)?.lastContactedAt).toBeNull();
  });

  it("keeps a call whose script has gone, and loses the call with its contact", () => {
    const school = createLead(db, company.id, leadInput.parse({ name: "Oakridge" }));
    const script = startScript(db, company.id, "warm", now);
    const call = logCall(db, company.id, { leadId: school.id, outcome: "voicemail", scriptId: script.id }, now);

    db.prepare(`DELETE FROM brain_pages WHERE id = ?`).run(script.id);
    expect(findCall(db, call.id)?.scriptId).toBeNull();
    expect(logCall(db, company.id, { leadId: school.id, outcome: "busy", scriptId: script.id }, now).scriptId).toBeNull();

    db.prepare(`DELETE FROM leads WHERE id = ?`).run(school.id);
    expect(findCall(db, call.id)).toBeNull();
  });

  it("will not store interest for a call nobody answered, even by hand", () => {
    const school = createLead(db, company.id, leadInput.parse({ name: "Oakridge" }));
    expect(() =>
      db
        .prepare(
          `INSERT INTO calls (id, company_id, lead_id, outcome, interest, created_at) VALUES ('x', ?, ?, 'no_answer', 3, ?)`,
        )
        .run(company.id, school.id, now.toISOString()),
    ).toThrow(/CHECK/);
  });
});

describe("the calls migration", () => {
  it("adds the table to a database from before it", () => {
    const old = new Database(":memory:");
    old.pragma("foreign_keys = ON");
    for (const migration of MIGRATIONS.filter((m) => m.version <= 22)) {
      old.exec(migration.sql);
      old.pragma(`user_version = ${migration.version}`);
    }
    migrate(old);
    const columns = (old.prepare(`PRAGMA table_info(calls)`).all() as { name: string }[]).map((c) => c.name);
    expect(columns).toEqual(expect.arrayContaining(["outcome", "interest", "answers", "script_id", "deal_id"]));
  });
});
