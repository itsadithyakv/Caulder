import { describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MIGRATIONS, migrate } from "./migrations";

/**
 * reference/data-model.md against the schema it describes.
 *
 * It drifted once, silently and a long way: the page said thirteen tables
 * across five migrations while the database had twenty-nine across sixteen,
 * and nothing failed. A page about the schema that is wrong about the schema
 * is worse than none, because it is believed.
 *
 * So two things are checked, both cheap to keep true: every table the
 * migrations create has a heading of its own on the page, and every migration
 * has a row in its table. What each section says is still a person's job.
 */

const DOC = readFileSync(join(import.meta.dirname, "../../../reference/data-model.md"), "utf8");

/**
 * Tables and virtual tables, but not the shadow tables FTS5 keeps behind a
 * virtual table: those are SQLite's, and the page describes the index once.
 */
function tablesInSchema(): string[] {
  const db = new Database(":memory:");
  migrate(db);
  return (
    db.prepare(`SELECT name, type FROM pragma_table_list WHERE schema = 'main'`).all() as {
      name: string;
      type: string;
    }[]
  )
    .filter((row) => (row.type === "table" || row.type === "virtual") && !row.name.startsWith("sqlite_"))
    .map((row) => row.name);
}

/** Every identifier named in a `## ` heading - "## sequences, sequence_steps" is two. */
function namedInHeadings(): Set<string> {
  const names = new Set<string>();
  for (const [, heading] of DOC.matchAll(/^## (.+)$/gm)) {
    for (const word of (heading ?? "").split(/[,\s]+/)) names.add(word.replace(/`/g, ""));
  }
  return names;
}

describe("the data model page", () => {
  it("has a section for every table the migrations create", () => {
    const named = namedInHeadings();
    const missing = tablesInSchema().filter((table) => !named.has(table));
    expect(missing).toEqual([]);
  });

  it("does not describe a table that no longer exists", () => {
    const tables = new Set(tablesInSchema());
    // A heading naming a snake_case identifier that is not a table and not a
    // column path like "leads.do_not_contact" is a section left behind.
    const stale = [...namedInHeadings()].filter(
      (word) => /^[a-z]+(_[a-z]+)+$/.test(word) && !tables.has(word),
    );
    expect(stale).toEqual([]);
  });

  it("lists every migration in its table", () => {
    const rows = new Set([...DOC.matchAll(/^\| (\d+) \|/gm)].map(([, version]) => Number(version)));
    const missing = MIGRATIONS.map((m) => m.version).filter((version) => !rows.has(version));
    expect(missing).toEqual([]);
  });
});
