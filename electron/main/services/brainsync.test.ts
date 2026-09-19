import { beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { migrate } from "../db/migrations";
import { createCompany } from "../repositories/companies";
import { writeMe } from "../repositories/me";
import { getPage, newPage, pageRevisions, removePage, savePage } from "./brain";
import {
  invitationFor,
  joinBrain,
  previewInvitation,
  shareState,
  startSharing,
  stopSharing,
  syncBrain,
  type Transport,
} from "./brainsync";
import { brainFileOf, importBrainFile } from "./brainfile";
import type { Company } from "@shared/domain";

/**
 * Two founders' Caulders sharing one brain, through the real Apps Script -
 * the file in resources/appsscript, run here with a spreadsheet kept in
 * memory - so the log the script keeps and the rules each Caulder applies to
 * it are tested together, the way they meet in use.
 */

const SOURCE = readFileSync(join(import.meta.dirname, "..", "..", "..", "resources", "appsscript", "Caulder.gs"), "utf8");

class FakeSheet {
  rows: string[][] = [];
  constructor(public name: string) {}
  getName() {
    return this.name;
  }
  setName(name: string) {
    this.name = name;
  }
  getLastRow() {
    return this.rows.length;
  }
  appendRow(values: unknown[]) {
    this.rows.push(values.map(String));
  }
  getRange(first: number | string, column = 1, count = 1, width = 1) {
    if (typeof first === "string") return { setNumberFormat: () => undefined };
    const cell = (row: number, col: number) => this.rows[row]?.[col] ?? "";
    const put = (row: number, col: number, value: unknown) => {
      while (this.rows.length <= row) this.rows.push([]);
      (this.rows[row] as string[])[col] = String(value);
    };
    return {
      getValues: () =>
        Array.from({ length: count }, (_, i) => Array.from({ length: width }, (_, j) => cell(first - 1 + i, column - 1 + j))),
      setValues: (values: unknown[][]) =>
        values.forEach((row, i) => row.forEach((value, j) => put(first - 1 + i, column - 1 + j, value))),
      setValue: (value: unknown) => put(first - 1, column - 1, value),
      setNumberFormat: () => undefined,
    };
  }
}

function googleScript() {
  const props = new Map<string, string>([["CAULDER_SECRET", "owner-key"]]);
  const books = new Map<string, { id: string; sheets: FakeSheet[] }>();
  let counter = 0;
  const book = (id: string) => {
    const found = books.get(id);
    if (!found) throw new Error("No such spreadsheet");
    return {
      getId: () => found.id,
      getSheets: () => found.sheets,
      getSheetByName: (name: string) => found.sheets.find((sheet) => sheet.name === name) ?? null,
      insertSheet: (name: string) => {
        const sheet = new FakeSheet(name);
        found.sheets.push(sheet);
        return sheet;
      },
    };
  };
  const context: Record<string, unknown> = {
    Logger: { log: () => undefined },
    Utilities: { getUuid: () => `0000${(counter += 1)}-aaaa-bbbb-cccc-${String(counter).padStart(12, "0")}` },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (key: string) => props.get(key) ?? null,
        setProperty: (key: string, value: string) => void props.set(key, String(value)),
        deleteProperty: (key: string) => void props.delete(key),
        getProperties: () => Object.fromEntries(props),
      }),
    },
    LockService: { getScriptLock: () => ({ waitLock: () => undefined, releaseLock: () => undefined }) },
    ContentService: {
      MimeType: { JSON: "json" },
      createTextOutput: (text: string) => ({ text, setMimeType() { return this; } }),
    },
    SpreadsheetApp: {
      create: () => {
        const id = `book-${books.size + 1}`;
        books.set(id, { id, sheets: [new FakeSheet("Sheet1")] });
        return book(id);
      },
      openById: (id: string) => book(id),
    },
  };
  runInNewContext(SOURCE, context);
  const doPost = context["doPost"] as (event: { postData: { contents: string } }) => { text: string };

  /** A Caulder talking to this script with the owner's key, or with an invitation. */
  const transport =
    (credential: { secret?: string; invite?: string }): Transport =>
    async <T,>(action: string, payload: Record<string, unknown>) => {
      const out = doPost({ postData: { contents: JSON.stringify({ ...payload, action, ...credential }) } });
      const reply = JSON.parse(out.text) as { ok: boolean; data: T; error?: string };
      if (!reply.ok) throw new Error(reply.error);
      return reply.data;
    };

  const revisions = () => [...books.values()][0]?.sheets.find((sheet) => sheet.name === "revisions")?.rows ?? [];
  return { transport, revisions, doPost };
}

type Side = { db: Database.Database; company: Company };

function founder(name: string): Side {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrate(db);
  writeMe(db, name);
  return { db, company: createCompany(db, { name: "Unifloe", accent: "blue", timezone: "Asia/Kolkata" }) };
}

const now = new Date("2026-09-18T06:00:00.000Z");
const later = (minutes: number) => new Date(now.getTime() + minutes * 60_000);

function write(side: Side, section: string, template: string, title: string, body: string, fields: Record<string, string> = {}) {
  const made = newPage(side.db, side.company.id, section, template, now);
  return savePage(side.db, made.id, { title, body, fields, baseRevision: made.revision }, now);
}

function edit(side: Side, id: string, body: string, at: Date) {
  const page = getPage(side.db, id);
  return savePage(side.db, id, { title: page.title, body, fields: page.fields, baseRevision: page.revision }, at);
}

let script: ReturnType<typeof googleScript>;
let asha: Side;
let ravi: Side;
let owner: Transport;
let invited: Transport;

/** Asha shares her brain; Ravi joins it with the invitation she sends. */
async function share() {
  await startSharing(asha.db, asha.company.id, now, owner);
  const invitation = await invitationFor(asha.db, asha.company.id, owner);
  const invite = invitation.slice(invitation.indexOf("#") + 1);
  invited = script.transport({ invite });
  await joinBrain(ravi.db, ravi.company.id, `https://script.google.com/macros/s/x/exec#${invite}`, now, invited);
}

beforeEach(() => {
  script = googleScript();
  owner = script.transport({ secret: "owner-key" });
  asha = founder("Asha");
  ravi = founder("Ravi");
});

describe("sharing the brain", () => {
  it("needs a name first, because every change carries it", async () => {
    writeMe(asha.db, "");
    await expect(startSharing(asha.db, asha.company.id, now, owner)).rejects.toThrow("Say who you are first");
  });

  it("sends the owner's pages up, and brings them down on the co-founder's side, with who wrote them", async () => {
    const plan = write(asha, "plan", "page", "The plan", "Sell to schools.");
    await share();

    expect(shareState(asha.db, asha.company.id).shared).toMatchObject({ role: "owner", waiting: 0, error: null });
    expect(shareState(ravi.db, ravi.company.id).shared).toMatchObject({ role: "member", waiting: 0 });
    const arrived = getPage(ravi.db, plan.id);
    expect(arrived).toMatchObject({ title: "The plan", body: "Sell to schools.", updatedBy: "Asha", editedTogether: false });
    // What the co-founder sees before joining: which brain, whose, and how big.
    expect(await previewInvitation("https://script.google.com/macros/s/x/exec#abcdefabcdefabcdef", invited)).toMatchObject({
      name: "Unifloe",
      createdBy: "Asha",
      pages: 1,
    });
  });

  it("carries an edit across, and keeps it in the other side's history under its author", async () => {
    const plan = write(asha, "plan", "page", "The plan", "Sell to schools.");
    await share();

    edit(asha, plan.id, "Sell to schools in Bengaluru.", later(10));
    await syncBrain(asha.db, asha.company.id, later(11), owner);
    await syncBrain(ravi.db, ravi.company.id, later(12), invited);

    expect(getPage(ravi.db, plan.id).body).toBe("Sell to schools in Bengaluru.");
    expect(pageRevisions(ravi.db, plan.id).map((revision) => [revision.editedBy, revision.body])).toEqual([
      ["Asha", "Sell to schools in Bengaluru."],
      ["Asha", "Sell to schools."],
    ]);
    // Coming back round is not a change: Asha's page is not sent again.
    await syncBrain(asha.db, asha.company.id, later(13), owner);
    expect(shareState(asha.db, asha.company.id).shared?.waiting).toBe(0);
  });

  it("keeps both versions when both founders edit a page at the same time, and marks them", async () => {
    const plan = write(asha, "plan", "page", "The plan", "Sell to schools.");
    await share();

    edit(asha, plan.id, "Asha's version.", later(10));
    edit(ravi, plan.id, "Ravi's version.", later(10));
    await syncBrain(asha.db, asha.company.id, later(11), owner);
    await syncBrain(ravi.db, ravi.company.id, later(12), invited);

    // Ravi's side: his version stays, Asha's is in the history, both marked.
    const onRavi = getPage(ravi.db, plan.id);
    expect(onRavi).toMatchObject({ body: "Ravi's version.", editedTogether: true });
    expect(
      pageRevisions(ravi.db, plan.id)
        .slice(0, 3)
        .map((revision) => [revision.editedBy, revision.body, revision.concurrent]),
    ).toEqual([
      ["Ravi", "Ravi's version.", true],
      ["Asha", "Asha's version.", true],
      ["Ravi", "Ravi's version.", false],
    ]);

    // Asha's side ends on the same words, with her own in the history.
    await syncBrain(asha.db, asha.company.id, later(13), owner);
    const onAsha = getPage(asha.db, plan.id);
    expect(onAsha).toMatchObject({ body: "Ravi's version.", editedTogether: true, updatedBy: "Ravi" });
    expect(pageRevisions(asha.db, plan.id).some((revision) => revision.body === "Asha's version.")).toBe(true);

    // The next ordinary save clears the mark.
    edit(asha, plan.id, "Both, merged.", later(20));
    expect(getPage(asha.db, plan.id).editedTogether).toBe(false);
    // The script's log has the second one marked too.
    const marked = script.revisions().filter((row) => row[1] === plan.id && row[6] !== "");
    expect(marked).toHaveLength(1);
  });

  it("carries a delete across, but an edit beats a delete", async () => {
    const one = write(asha, "ideas", "idea", "Idea one", "A");
    const two = write(asha, "ideas", "idea", "Idea two", "B");
    await share();

    removePage(ravi.db, one.id);
    await syncBrain(ravi.db, ravi.company.id, later(5), invited);
    await syncBrain(asha.db, asha.company.id, later(6), owner);
    expect(() => getPage(asha.db, one.id)).toThrow();

    // Asha deletes idea two while Ravi changes it: Ravi's edit survives on both sides.
    removePage(asha.db, two.id);
    edit(ravi, two.id, "B, better", later(10));
    await syncBrain(ravi.db, ravi.company.id, later(11), invited);
    await syncBrain(asha.db, asha.company.id, later(12), owner);
    expect(getPage(asha.db, two.id).body).toBe("B, better");
    await syncBrain(ravi.db, ravi.company.id, later(13), invited);
    expect(getPage(ravi.db, two.id).body).toBe("B, better");
  });

  it("never sends a secret, and keeps each side's own", async () => {
    const profile = write(asha, "company", "profile", "Unifloe", "", { legalName: "Unifloe Pvt Ltd" });
    const sealed = JSON.stringify({ legalName: "Unifloe Pvt Ltd", pan: { $secret: "sealed-by-windows", last4: "234F" } });
    asha.db.prepare(`UPDATE brain_pages SET fields = ? WHERE id = ?`).run(sealed, profile.id);
    await share();

    expect(script.revisions().some((row) => row.join("").includes("sealed-by-windows"))).toBe(false);
    expect(getPage(ravi.db, profile.id).secrets).toEqual({});

    const onRavi = getPage(ravi.db, profile.id);
    savePage(ravi.db, profile.id, { title: onRavi.title, body: "", fields: { legalName: "Unifloe Private Limited" }, baseRevision: onRavi.revision }, later(5));
    await syncBrain(ravi.db, ravi.company.id, later(6), invited);
    await syncBrain(asha.db, asha.company.id, later(7), owner);
    const onAsha = getPage(asha.db, profile.id);
    expect(onAsha.fields["legalName"]).toBe("Unifloe Private Limited");
    expect(onAsha.secrets["pan"]).toContain("234F");
  });

  it("steps a co-founder's own profile aside rather than losing it, when the shared one arrives", async () => {
    write(asha, "company", "profile", "Unifloe", "Asha's profile");
    const own = write(ravi, "company", "profile", "Unifloe", "Ravi's profile");
    await share();

    const mine = getPage(ravi.db, own.id);
    expect(mine).toMatchObject({ template: "page", title: "Unifloe (before sharing)", body: "Ravi's profile" });
    const profiles = ravi.db.prepare(`SELECT body FROM brain_pages WHERE template = 'profile'`).all();
    expect(profiles).toEqual([{ body: "Asha's profile" }]);
  });

  it("reaches only the shared brain with an invitation, and nothing once the owner stops", async () => {
    await share();
    await expect(invited("sendEmail", { to: "x@y.z" })).rejects.toThrow("only reaches the shared brain");

    await stopSharing(asha.db, asha.company.id, owner);
    expect(shareState(asha.db, asha.company.id).shared).toBeNull();
    await expect(syncBrain(ravi.db, ravi.company.id, later(5), invited)).rejects.toThrow("no longer shared");
    expect(shareState(ravi.db, ravi.company.id).shared?.error).toContain("no longer shared");
  });
});

describe("your own sections", () => {
  it("never leave: a journal entry, a course and a goal stay on the founder's machine", async () => {
    const plan = write(asha, "plan", "page", "The plan", "Sell to schools.");
    const course = write(asha, "studies", "course", "Data structures", "Trees, graphs.");
    const goal = write(asha, "goals", "life-goal", "Run 10 km", "Slowly.");
    const entry = newPage(asha.db, asha.company.id, "journal", "entry", now);
    await share();

    expect(getPage(ravi.db, plan.id).title).toBe("The plan");
    for (const id of [course.id, goal.id, entry.id]) {
      expect(() => getPage(ravi.db, id)).toThrow("no longer exists");
    }
    // Nothing of theirs is waiting to go, either.
    expect(shareState(asha.db, asha.company.id).shared?.waiting).toBe(0);
    expect(script.revisions().some((row) => String(row).includes("Data structures"))).toBe(false);

    const file = brainFileOf(asha.db, asha.company.id, now);
    expect(file.pages.map((page) => page.title)).toEqual(["The plan"]);
  });
});

describe("a brain file", () => {
  it("brings pages across by id: new ones added, newer ones taken, older ones left, the same ones skipped", () => {
    const plan = write(asha, "plan", "page", "The plan", "Sell to schools.");
    write(asha, "ideas", "idea", "An idea", "Try it");
    const file = JSON.stringify(brainFileOf(asha.db, asha.company.id, now));

    expect(importBrainFile(ravi.db, ravi.company.id, file, now)).toEqual({ added: 2, updated: 0, kept: 0, same: 0 });
    expect(getPage(ravi.db, plan.id)).toMatchObject({ body: "Sell to schools.", updatedBy: "Asha" });
    expect(importBrainFile(ravi.db, ravi.company.id, file, now)).toMatchObject({ same: 2 });

    // Ravi's later edit is kept over the older file.
    edit(ravi, plan.id, "Ravi's newer plan.", later(30));
    expect(importBrainFile(ravi.db, ravi.company.id, file, now)).toMatchObject({ kept: 1, same: 1 });
    expect(getPage(ravi.db, plan.id).body).toBe("Ravi's newer plan.");

    // A newer file wins.
    edit(asha, plan.id, "Asha's newest plan.", later(60));
    const newer = JSON.stringify(brainFileOf(asha.db, asha.company.id, later(61)));
    expect(importBrainFile(ravi.db, ravi.company.id, newer, later(62))).toMatchObject({ updated: 1 });
    expect(getPage(ravi.db, plan.id).body).toBe("Asha's newest plan.");

    expect(() => importBrainFile(ravi.db, ravi.company.id, "{\"not\": \"a brain\"}", now)).toThrow("not a brain file");
  });
});
