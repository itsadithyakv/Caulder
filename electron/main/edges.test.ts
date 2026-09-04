import { beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { migrate } from "./db/migrations";
import { createCompany, listStages } from "./repositories/companies";
import { createLead, listLeads, updateLead, listActivities } from "./repositories/leads";
import { deleteStage, moveStage } from "./repositories/stages";
import { createTask, completeTask, rescheduleTask } from "./repositories/tasks";
import { buildToday } from "./services/today";
import { buildBoard } from "./services/pipeline";
import { leadInput, taskInput, type Company } from "@shared/domain";
import { today as todayIn, shiftDay, daysBetween, describeDue } from "@shared/dates";
import {
  clean,
  parseValue,
  phoneKey,
  splitLocation,
  splitNameAndSource,
  splitPhones,
  text,
} from "@shared/normalise";
import { render } from "@shared/render";

/**
 * The edges.
 *
 * Every case here started as something that broke, or that looked like it
 * might. Dates either side of a boundary, cells a spreadsheet should not
 * contain, search text that looks like SQL, a funnel being edited underneath
 * its own leads, and what an error message actually says to the person
 * reading it.
 */

const NOW = new Date("2026-09-03T06:00:00Z");
const TZ = "Asia/Kolkata";
const TODAY = todayIn(TZ, NOW);

let db: Database.Database;
let company: Company;

beforeEach(() => {
  db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrate(db);
  company = createCompany(db, { name: "Unifloe", accent: "blue", timezone: TZ });
});

describe("dates at the edges", () => {
  it("shifts across a month end", () => {
    expect(shiftDay("2026-01-31", 1)).toBe("2026-02-01");
    expect(shiftDay("2026-02-28", 1)).toBe("2026-03-01");
    expect(shiftDay("2026-12-31", 1)).toBe("2027-01-01");
    expect(shiftDay("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("shifts across a leap day", () => {
    expect(shiftDay("2028-02-28", 1)).toBe("2028-02-29");
    expect(shiftDay("2028-02-29", 1)).toBe("2028-03-01");
  });

  it("counts days across a DST change in a zone that has one", () => {
    // Caulder does its day arithmetic in UTC precisely so this cannot drift.
    expect(daysBetween("2026-03-28", "2026-03-30")).toBe(2);
    expect(daysBetween("2026-10-24", "2026-10-26")).toBe(2);
  });

  it("resolves today just before and just after midnight in the company zone", () => {
    // 18:29 UTC is 23:59 in Kolkata; one minute later is the next day there.
    expect(todayIn(TZ, new Date("2026-09-03T18:29:00Z"))).toBe("2026-09-03");
    expect(todayIn(TZ, new Date("2026-09-03T18:30:00Z"))).toBe("2026-09-04");
  });

  it("describes a due date without crashing on a far-future year", () => {
    expect(describeDue("2099-01-01", TODAY)).toBeTruthy();
    expect(describeDue("1999-01-01", TODAY)).toBeTruthy();
  });
});

describe("normalisers against hostile cells", () => {
  it("survives values the sheet should not contain", () => {
    expect(text(undefined)).toBe("");
    expect(text(null)).toBe("");
    expect(text([])).toBe("");
    expect(text(Number.NaN)).toBe("NaN");
    expect(text(Number.POSITIVE_INFINITY)).toBe("Infinity");
  });

  it("reads an error cell as blank rather than as the words [object Object]", () => {
    // These are the exact shapes exceljs produces for #N/A and for a formula
    // whose result is an error. Read literally they import as a lead named
    // "[object Object]" - and because that is not one of the sentinels,
    // nothing downstream catches it.
    expect(text({ error: "#N/A" })).toBe("");
    expect(text({ formula: "1/0", result: { error: "#DIV/0!" } })).toBe("");
    expect(clean({ error: "#REF!" })).toBeNull();
  });

  it("reads an object shape it does not know as blank", () => {
    expect(text({})).toBe("");
    expect(text({ nonsense: 1 })).toBe("");
  });

  it("does not turn a phone stored as a number into an exponent", () => {
    expect(text(9480004094)).toBe("9480004094");
    expect(phoneKey("9480004094")).toBe("9480004094");
    expect(phoneKey("+91 94800 04094")).toBe("9480004094");
  });

  it("splits a multi-value phone cell without losing either number", () => {
    expect(splitPhones("9480004094 / 9141924141")).toEqual({
      phone: "9480004094",
      altPhone: "9141924141",
    });
    expect(splitPhones("/")).toEqual({ phone: null, altPhone: null });
    expect(splitPhones(null)).toEqual({ phone: null, altPhone: null });
  });

  it("refuses money it cannot read rather than guessing", () => {
    expect(parseValue("")).toBeNull();
    expect(parseValue("Not mentioned")).toBeNull();
    expect(parseValue("abc")).toBeNull();
    expect(parseValue("₹ 1,20,000")).toBe(120000);
  });

  it("handles a name that is only a separator", () => {
    expect(splitNameAndSource("/")).toBeTruthy();
    expect(splitNameAndSource("")).toBeTruthy();
  });

  it("handles an address that is only dashes", () => {
    expect(splitLocation("–")).toBeTruthy();
    expect(splitLocation("")).toBeTruthy();
    expect(splitLocation(null)).toBeTruthy();
  });
});

describe("search input that looks like SQL or a wildcard", () => {
  beforeEach(() => {
    createLead(db, company.id, leadInput.parse({ name: "Fifty Percent 50% School" }));
    createLead(db, company.id, leadInput.parse({ name: "Underscore_School" }));
    createLead(db, company.id, leadInput.parse({ name: "Plain School" }));
  });

  it("treats % as a literal", () => {
    expect(listLeads(db, { companyId: company.id, search: "50%" }).map((l) => l.name)).toEqual([
      "Fifty Percent 50% School",
    ]);
  });

  it("treats _ as a literal", () => {
    expect(listLeads(db, { companyId: company.id, search: "Underscore_" }).map((l) => l.name)).toEqual([
      "Underscore_School",
    ]);
  });

  it("treats a backslash as a literal rather than an escape", () => {
    expect(listLeads(db, { companyId: company.id, search: "\\" })).toEqual([]);
  });

  it("does not execute a quote as SQL", () => {
    expect(listLeads(db, { companyId: company.id, search: "'; DROP TABLE leads; --" })).toEqual([]);
    expect(listLeads(db, { companyId: company.id })).toHaveLength(3);
  });
});

describe("values at the limits", () => {
  it("keeps a very large lead value intact", () => {
    const big = Number.MAX_SAFE_INTEGER;
    const lead = createLead(db, company.id, leadInput.parse({ name: "Big", value: big }));
    expect(lead.value).toBe(big);

    const [reread] = listLeads(db, { companyId: company.id });
    expect(reread?.value).toBe(big);
  });

  it("totals a column without losing precision on the board", () => {
    const stages = listStages(db, company.id);
    const first = stages[0];
    if (!first) throw new Error("seeded stages missing");

    for (let i = 0; i < 3; i += 1) {
      createLead(
        db,
        company.id,
        leadInput.parse({ name: `Lead ${i}`, value: 1_000_000, stageId: first.id }),
      );
    }

    const board = buildBoard(db, company.id);
    expect(board.columns[0]?.value).toBe(3_000_000);
  });
});

describe("stages under editing", () => {
  it("keeps positions contiguous after a delete", () => {
    const before = listStages(db, company.id);
    const middle = before[2];
    if (!middle) throw new Error("expected a seeded funnel");

    deleteStage(db, middle.id);

    const after = listStages(db, company.id);
    expect(after.map((s) => s.position)).toEqual(after.map((_, i) => i));
  });

  it("refuses to move the first stage above itself", () => {
    const before = listStages(db, company.id).map((s) => s.id);
    const first = before[0];
    if (!first) throw new Error("expected a seeded funnel");

    moveStage(db, first, -1);
    expect(listStages(db, company.id).map((s) => s.id)).toEqual(before);
  });

  it("refuses to move the last stage below itself", () => {
    const before = listStages(db, company.id).map((s) => s.id);
    const last = before[before.length - 1];
    if (!last) throw new Error("expected a seeded funnel");

    moveStage(db, last, 1);
    expect(listStages(db, company.id).map((s) => s.id)).toEqual(before);
  });

  it("leaves a deleted stage's leads on the board rather than losing them", () => {
    const stages = listStages(db, company.id);
    const doomed = stages[1];
    if (!doomed) throw new Error("expected a seeded funnel");

    createLead(db, company.id, leadInput.parse({ name: "Stranded", stageId: doomed.id }));
    deleteStage(db, doomed.id);

    const board = buildBoard(db, company.id);
    const unstaged = board.columns.find((c) => c.stageId === null);
    expect(unstaged?.cards.map((c) => c.name)).toEqual(["Stranded"]);
  });

  it("keeps a lead on the board even if its stage is not this company's", () => {
    const other = createCompany(db, { name: "Other", accent: "teal", timezone: TZ });
    const theirStage = listStages(db, other.id)[0];
    if (!theirStage) throw new Error("expected a seeded funnel");

    const lead = createLead(db, company.id, leadInput.parse({ name: "Cross" }));
    // Nothing in the UI offers this, but the IPC surface takes a bare id and
    // the board must not be able to lose a lead however one gets into this
    // state. Before the fix it belonged to no column at all and vanished.
    updateLead(db, lead.id, {
      ...leadInput.parse({ name: "Cross" }),
      stageId: theirStage.id,
    });

    const board = buildBoard(db, company.id);
    const names = board.columns.flatMap((c) => c.cards.map((card) => card.name));
    expect(names).toContain("Cross");
  });
});

describe("tasks under editing", () => {
  it("snoozes across a year boundary", () => {
    const lead = createLead(db, company.id, leadInput.parse({ name: "NY" }));
    const created = createTask(
      db,
      company.id,
      taskInput.parse({ leadId: lead.id, title: "Call", dueOn: "2026-12-31" }),
    );

    rescheduleTask(db, created.id, shiftDay("2026-12-31", 1));
    const day = buildToday(db, company.id, new Date("2027-01-01T06:00:00Z"));
    expect(day.dueToday.map((t) => t.title)).toContain("Call");
  });

  it("completing a task twice does not write two history entries", () => {
    const lead = createLead(db, company.id, leadInput.parse({ name: "Twice" }));
    const created = createTask(
      db,
      company.id,
      taskInput.parse({ leadId: lead.id, title: "Call", dueOn: TODAY }),
    );

    completeTask(db, created.id);
    completeTask(db, created.id);

    const done = listActivities(db, lead.id).filter((a) => a.kind === "task_done");
    expect(done).toHaveLength(1);
  });

  it("does not show a completed task on the day it was due", () => {
    const lead = createLead(db, company.id, leadInput.parse({ name: "Done" }));
    const created = createTask(
      db,
      company.id,
      taskInput.parse({ leadId: lead.id, title: "Call", dueOn: TODAY }),
    );
    completeTask(db, created.id);

    const day = buildToday(db, company.id, NOW);
    expect(day.dueToday).toHaveLength(0);
    expect(day.overdue).toHaveLength(0);
  });
});

const CTX = {
  leadName: "Bengaluru Public School",
  leadContact: "Asha",
  leadCity: "Bengaluru",
  companyName: "Unifloe",
};

describe("what an error message tells the user", () => {
  it("explains a non-whole value in words somebody can act on", () => {
    const result = leadInput.safeParse({ name: "Decimal", value: 12.5 });
    expect(result.success).toBe(false);
    if (result.success) return;
    // Zod's own text here is "Invalid input: expected int, received number",
    // which is a sentence about the schema rather than about the box.
    expect(result.error.issues[0]?.message).toBe("Value has to be a whole number.");
  });

  it("explains a negative value the same way", () => {
    const result = leadInput.safeParse({ name: "Negative", value: -1 });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues[0]?.message).toBe("Value cannot be negative.");
  });

  it("names the field, not the constraint, when a name is too long", () => {
    const result = leadInput.safeParse({ name: "Z".repeat(200) });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues[0]?.message).toBe("Keep the name under 160 characters.");
  });
});

describe("template tokens", () => {
  it("leaves an unknown token exactly as written", () => {
    expect(render("Hi {{lead.nmae}}", CTX)).toContain("{{lead.nmae}}");
  });

  it("does not loop on a token that looks like it nests", () => {
    expect(typeof render("{{lead.{{lead.name}}}}", CTX)).toBe("string");
  });

  it("survives an unclosed token", () => {
    expect(render("Hi {{lead.name", CTX)).toBe("Hi {{lead.name");
  });

  it("falls back to a greeting that reads when no contact is known", () => {
    expect(render("Hi {{lead.greeting}},", { ...CTX, leadContact: null })).toBe("Hi there,");
    expect(render("Hi {{lead.contact}},", { ...CTX, leadContact: null })).toBe("Hi ,");
  });
});
