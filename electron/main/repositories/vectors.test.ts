import { beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { migrate } from "../db/migrations";
import { createCompany } from "./companies";
import { createLead } from "./leads";
import { createPage } from "./brain";
import { leadInput } from "@shared/domain";
import { dequeue, keepVectors, queueSize, queued, sourceOf, vectorCount, vectorsIn } from "./vectors";

/**
 * What the model reads and keeps, without the model: the queue the triggers
 * fill, what each row is read as, and keeping and forgetting what came back.
 */

const MODEL = "test-model";
const NOW = "2026-09-25T10:00:00.000Z";
let db: Database.Database;
let home: string;

beforeEach(() => {
  db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrate(db);
  home = createCompany(db, { name: "Me", accent: "coffee", timezone: "Asia/Kolkata", kind: "personal" }).id;
});

const bytes = (fill: number) => new Int8Array(4).fill(fill);

describe("the queue", () => {
  it("is filled by writing a page, a contact, a task or a note - and never a journal page", () => {
    createPage(db, home, { section: "hobbies", template: "page", title: "Guitar", body: "Learning barre chords." }, NOW);
    createPage(db, home, { section: "journal", template: "page", title: "Thursday", body: "A private day." }, NOW);
    createLead(db, home, leadInput.parse({ name: "Oakridge School" }));
    expect(queued(db, 10).map((row) => row.kind).sort()).toEqual(["contact", "page"]);
  });
});

describe("what a row is read as", () => {
  it("reads a page as itself and each memory on it on its own, with the page's name", () => {
    const id = createPage(
      db,
      home,
      { section: "hobbies", template: "page", title: "Gym", body: "Part of [[Hobbies|page:x]].\n\nPush pull legs.\n\n- **PR: 60 kg** · bench _(2026-09-20)_" },
      NOW,
    );
    const source = sourceOf(db, "page", id);
    expect(source?.items.map((item) => [item.kind, item.text])).toEqual([
      ["page", "Gym. Push pull legs."],
      ["memory", "Gym: PR: 60 kg. bench"],
    ]);
  });

  it("reads nothing of a journal page, an archived page or a row that is gone", () => {
    const day = createPage(db, home, { section: "journal", template: "page", title: "Thursday", body: "Private." }, NOW);
    expect(sourceOf(db, "page", day)).toBeNull();
    expect(sourceOf(db, "contact", "gone")).toBeNull();
  });
});

describe("what came back", () => {
  it("is kept, replaced, and taken away when the row no longer says it", () => {
    const id = createPage(db, home, { section: "ideas", template: "page", title: "Coffee", body: "- **Beans** · ethiopian _(2026-09-20)_" }, NOW);
    const source = sourceOf(db, "page", id)!;
    keepVectors(db, id, source, MODEL, source.items.map((item) => ({ ...item, vector: bytes(1) })), NOW);
    expect(vectorCount(db, MODEL)).toBe(2);
    expect(vectorsIn(db, [home], MODEL)[0]?.vector).toEqual(bytes(1));

    // The memory is forgotten: only the page is read now, and its vector is replaced.
    db.prepare(`UPDATE brain_pages SET body = 'Only prose now.' WHERE id = ?`).run(id);
    const now = sourceOf(db, "page", id)!;
    keepVectors(db, id, now, MODEL, now.items.map((item) => ({ ...item, vector: bytes(2) })), NOW);
    expect(vectorsIn(db, [home], MODEL).map((row) => [row.kind, row.vector[0]])).toEqual([["page", 2]]);

    // Archived: nothing of it is kept.
    keepVectors(db, id, null, MODEL, [], NOW);
    expect(vectorCount(db, MODEL)).toBe(0);
  });

  it("goes the moment its row is deleted, without waiting for the queue", () => {
    const lead = createLead(db, home, leadInput.parse({ name: "Oakridge School", city: "Mysuru" }));
    const source = sourceOf(db, "contact", lead.id)!;
    expect(source.items[0]?.text).toBe("Oakridge School. Mysuru");
    keepVectors(db, lead.id, source, MODEL, source.items.map((item) => ({ ...item, vector: bytes(3) })), NOW);
    dequeue(db, "contact", lead.id);
    db.prepare(`DELETE FROM leads WHERE id = ?`).run(lead.id);
    expect(vectorCount(db, MODEL)).toBe(0);
    expect(queueSize(db)).toBe(0);
  });
});
