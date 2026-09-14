import { describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { LATEST_VERSION, MIGRATIONS, currentVersion, migrate } from "./migrations";

/**
 * These run against an in-memory database rather than a real file, so they are
 * fast and leave nothing behind. better-sqlite3 is an N-API addon, so the same
 * binary loads under plain Node and under Electron.
 */
function freshDb() {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  return db;
}

describe("migration runner", () => {
  it("starts a new database at version 0", () => {
    expect(currentVersion(freshDb())).toBe(0);
  });

  it("brings a new database to the latest version", () => {
    const db = freshDb();
    const result = migrate(db);

    expect(result.from).toBe(0);
    expect(result.to).toBe(LATEST_VERSION);
    expect(result.applied).toHaveLength(MIGRATIONS.length);
    expect(currentVersion(db)).toBe(LATEST_VERSION);
  });

  it("does nothing on a second run", () => {
    // The runner fires on every launch, so being a no-op when already current
    // is the common case, not the edge case.
    const db = freshDb();
    migrate(db);
    const second = migrate(db);

    expect(second.applied).toEqual([]);
    expect(second.from).toBe(LATEST_VERSION);
    expect(second.to).toBe(LATEST_VERSION);
  });

  it("creates the tables Phase 2 needs", () => {
    const db = migrateFresh();
    const names = db
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`)
      .all() as { name: string }[];

    expect(names.map((row) => row.name)).toEqual(
      expect.arrayContaining(["companies", "pipeline_stages", "settings"]),
    );
  });

  it("rolls back a failed step rather than leaving a half-migrated file", () => {
    const db = freshDb();
    // A step whose second statement is invalid: the first must not survive.
    const broken = [
      {
        version: 1,
        name: "broken",
        sql: `CREATE TABLE will_not_survive (a); SELECT this_is_not_valid_sql(;`,
      },
    ];

    expect(() => {
      const from = currentVersion(db);
      const pending = broken.filter((m) => m.version > from);
      for (const m of pending) {
        db.exec("BEGIN");
        try {
          db.exec(m.sql);
          db.pragma(`user_version = ${m.version}`);
          db.exec("COMMIT");
        } catch (error) {
          db.exec("ROLLBACK");
          throw error;
        }
      }
    }).toThrow();

    const table = db
      .prepare(`SELECT name FROM sqlite_master WHERE name = 'will_not_survive'`)
      .get();
    expect(table).toBeUndefined();
    expect(currentVersion(db)).toBe(0);
  });

  it("numbers migrations uniquely and in order", () => {
    const versions = MIGRATIONS.map((m) => m.version);
    expect(new Set(versions).size).toBe(versions.length);
    expect([...versions].sort((a, b) => a - b)).toEqual(versions);
  });
});

describe("schema constraints", () => {
  it("rejects a second live company with the same name, ignoring case", () => {
    const db = migrateFresh();
    insertCompany(db, "a", "Unifloe");

    expect(() => insertCompany(db, "b", "unifloe")).toThrow(/UNIQUE/i);
  });

  it("allows reusing the name of an archived company", () => {
    // The index is partial on is_archived = 0 precisely so a name comes back
    // into circulation once the workspace using it is put away.
    const db = migrateFresh();
    insertCompany(db, "a", "Unifloe");
    db.prepare(`UPDATE companies SET is_archived = 1 WHERE id = 'a'`).run();

    expect(() => insertCompany(db, "b", "Unifloe")).not.toThrow();
  });

  it("deletes a company's stages with the company", () => {
    const db = migrateFresh();
    insertCompany(db, "a", "Unifloe");
    db.prepare(
      `INSERT INTO pipeline_stages (id, company_id, name, position, kind, created_at)
       VALUES ('s1', 'a', 'New', 0, 'open', '2026-01-01T00:00:00.000Z')`,
    ).run();

    db.prepare(`DELETE FROM companies WHERE id = 'a'`).run();

    const left = db.prepare(`SELECT COUNT(*) AS n FROM pipeline_stages`).get() as {
      n: number;
    };
    expect(left.n).toBe(0);
  });

  it("rejects a stage kind outside the three the app understands", () => {
    const db = migrateFresh();
    insertCompany(db, "a", "Unifloe");

    expect(() =>
      db
        .prepare(
          `INSERT INTO pipeline_stages (id, company_id, name, position, kind, created_at)
           VALUES ('s1', 'a', 'Maybe', 0, 'perhaps', '2026-01-01T00:00:00.000Z')`,
        )
        .run(),
    ).toThrow(/CHECK/i);
  });
});

function migrateFresh() {
  const db = freshDb();
  migrate(db);
  return db;
}

function insertCompany(db: Database.Database, id: string, name: string) {
  db.prepare(
    `INSERT INTO companies (id, name, accent, timezone, is_archived, created_at, updated_at)
     VALUES (?, ?, 'blue', 'Asia/Kolkata', 0, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`,
  ).run(id, name);
}

describe("migration 6 rebuilds two tables, and must not lose a row doing it", () => {
  // Checked at 17: migration 18 drops the email tables, so the rebuild is
  // judged on the last version that still has them.
  /**
   * The one migration so far that rewrites existing tables rather than adding
   * new ones. `status` and `kind` are CHECK constraints and SQLite cannot
   * alter one, so both tables are recreated and copied across — which is
   * exactly the shape of change that quietly drops columns nobody checked.
   *
   * So this stops at version 5, writes a row into every column that migration
   * touches, and reads all of it back afterwards.
   */
  function upTo(db: Database.Database, version: number) {
    const from = currentVersion(db);
    for (const migration of MIGRATIONS.filter((m) => m.version > from && m.version <= version)) {
      db.exec(migration.sql);
      db.pragma(`user_version = ${migration.version}`);
    }
  }

  function seedV5(db: Database.Database) {
    const now = "2026-09-01T10:00:00.000Z";
    db.prepare(
      `INSERT INTO companies (id, name, accent, timezone, is_archived, created_at, updated_at)
       VALUES ('c1', 'Unifloe', 'blue', 'Asia/Kolkata', 0, ?, ?)`,
    ).run(now, now);

    db.prepare(
      `INSERT INTO leads (id, company_id, name, created_at, updated_at)
       VALUES ('l1', 'c1', 'Oakridge', ?, ?)`,
    ).run(now, now);

    db.prepare(
      `INSERT INTO activities (id, company_id, lead_id, kind, body, occurred_at, created_at, meta)
       VALUES ('a1', 'c1', 'l1', 'email_replied', 'Re: hello', ?, ?, '{"n":1}')`,
    ).run(now, now);

    db.prepare(
      `INSERT INTO email_messages (
         id, company_id, lead_id, message_id, to_email, subject, body, status,
         scheduled_for, attempt_count, next_attempt_at, provider_message_id,
         thread_id, sent_at, opened_at, replied_at, failure,
         enrollment_id, step_id, created_at, updated_at
       ) VALUES (
         'm1', 'c1', 'l1', 'uuid-1', 'a@b.com', 'Hello', '<p>Hi</p>', 'replied',
         '2026-09-01', 2, NULL, 'prov-1', 'thread-1', ?, ?, ?, 'was failing once',
         'e1', 's1', ?, ?
       )`,
    ).run(now, now, now, now, now);
  }

  it("carries every column of an email message across the rebuild", () => {
    const db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    upTo(db, 5);
    seedV5(db);

    upTo(db, 17);

    const row = db.prepare(`SELECT * FROM email_messages WHERE id = 'm1'`).get() as Record<
      string,
      unknown
    >;

    expect(row).toMatchObject({
      company_id: "c1",
      lead_id: "l1",
      message_id: "uuid-1",
      to_email: "a@b.com",
      subject: "Hello",
      body: "<p>Hi</p>",
      status: "replied",
      attempt_count: 2,
      provider_message_id: "prov-1",
      thread_id: "thread-1",
      failure: "was failing once",
      enrollment_id: "e1",
      step_id: "s1",
    });
    // The new column exists and starts empty, rather than the row vanishing.
    expect(row["bounced_at"]).toBeNull();
  });

  it("carries the timeline across, meta and all", () => {
    const db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    upTo(db, 5);
    seedV5(db);

    upTo(db, 17);

    const row = db.prepare(`SELECT * FROM activities WHERE id = 'a1'`).get() as Record<
      string,
      unknown
    >;
    expect(row).toMatchObject({ lead_id: "l1", kind: "email_replied", body: "Re: hello" });
    expect(row["meta"]).toBe('{"n":1}');
  });

  it("accepts the new status and kind afterwards, and still refuses nonsense", () => {
    const db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    upTo(db, 17);
    seedV5Company(db);

    expect(() =>
      db
        .prepare(
          `INSERT INTO activities (id, company_id, lead_id, kind, body, occurred_at, created_at)
           VALUES ('a2', 'c1', 'l1', 'email_bounced', 'x', '2026-09-01', '2026-09-01')`,
        )
        .run(),
    ).not.toThrow();

    expect(() =>
      db
        .prepare(
          `INSERT INTO activities (id, company_id, lead_id, kind, body, occurred_at, created_at)
           VALUES ('a3', 'c1', 'l1', 'not_a_kind', 'x', '2026-09-01', '2026-09-01')`,
        )
        .run(),
    ).toThrow();
  });

  it("keeps the indexes the rebuilt tables depend on", () => {
    const db = new Database(":memory:");
    upTo(db, 17);

    const names = (
      db.prepare(`SELECT name FROM sqlite_master WHERE type = 'index'`).all() as {
        name: string;
      }[]
    ).map((r) => r.name);

    // The unique one matters most: without it an echoed log row could match
    // two messages, which is the failure the whole bridge is built to avoid.
    expect(names).toContain("email_messages_key");
    expect(names).toContain("email_messages_queue");
    expect(names).toContain("email_messages_lead");
    expect(names).toContain("activities_lead");
    expect(names).toContain("activities_company");
  });

  function seedV5Company(db: Database.Database) {
    const now = "2026-09-01T10:00:00.000Z";
    db.prepare(
      `INSERT INTO companies (id, name, accent, timezone, is_archived, created_at, updated_at)
       VALUES ('c1', 'Unifloe', 'blue', 'Asia/Kolkata', 0, ?, ?)`,
    ).run(now, now);
    db.prepare(
      `INSERT INTO leads (id, company_id, name, created_at, updated_at)
       VALUES ('l1', 'c1', 'Oakridge', ?, ?)`,
    ).run(now, now);
  }
});
