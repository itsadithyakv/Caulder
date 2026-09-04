import type { Db } from "./connection";

/**
 * Forward-only migrations gated on PRAGMA user_version.
 *
 * There is no server and no operator, so this has to be safe unattended: each
 * step runs inside its own transaction, and a step that throws rolls back
 * whole rather than leaving a half-migrated file. A backup is taken before the
 * runner is called; see backup.ts.
 *
 * Rules for adding one: append, never edit a shipped step, and never renumber.
 * A released migration has already run on the user's only copy of their data.
 */

type Migration = {
  version: number;
  name: string;
  sql: string;
};

const M001_COMPANIES = `
  CREATE TABLE companies (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    accent      TEXT NOT NULL DEFAULT 'blue',
    timezone    TEXT NOT NULL,
    is_archived INTEGER NOT NULL DEFAULT 0 CHECK (is_archived IN (0, 1)),
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
  );

  -- Two live companies may not share a name; an archived one may keep its
  -- name so the history stays readable.
  CREATE UNIQUE INDEX companies_name_live
    ON companies (name COLLATE NOCASE)
    WHERE is_archived = 0;

  CREATE TABLE pipeline_stages (
    id         TEXT PRIMARY KEY,
    company_id TEXT NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    position   INTEGER NOT NULL,
    kind       TEXT NOT NULL CHECK (kind IN ('open', 'won', 'lost')),
    created_at TEXT NOT NULL
  );

  CREATE INDEX pipeline_stages_company ON pipeline_stages (company_id, position);
  CREATE UNIQUE INDEX pipeline_stages_name
    ON pipeline_stages (company_id, name COLLATE NOCASE);

  -- Key-value, app-wide rather than per-company: which company is open, where
  -- the sync folder is. Keys are constrained in shared/domain.ts.
  CREATE TABLE settings (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`;

const M002_LEADS = `
  CREATE TABLE leads (
    id                TEXT PRIMARY KEY,
    company_id        TEXT NOT NULL REFERENCES companies (id) ON DELETE CASCADE,

    -- A lead keeps its place in the funnel, but losing a stage must not lose
    -- the lead, so this nulls rather than cascades.
    stage_id          TEXT REFERENCES pipeline_stages (id) ON DELETE SET NULL,

    -- Only the name is required. The real source file has rows where every
    -- other field is missing, and a lead with just a name is still worth
    -- chasing.
    name              TEXT NOT NULL,
    contact_person    TEXT,
    email             TEXT,
    phone             TEXT,
    alt_phone         TEXT,
    location          TEXT,
    city              TEXT,
    pin               TEXT,
    source            TEXT,
    website           TEXT,

    -- Whole currency units. Money in a float is a bug waiting to happen, and
    -- nobody tracks paise on a lead.
    value             INTEGER,

    tags              TEXT,
    notes             TEXT,
    last_contacted_at TEXT,
    created_at        TEXT NOT NULL,
    updated_at        TEXT NOT NULL
  );

  CREATE INDEX leads_company_stage   ON leads (company_id, stage_id);
  CREATE INDEX leads_company_name    ON leads (company_id, name COLLATE NOCASE);
  CREATE INDEX leads_company_updated ON leads (company_id, updated_at DESC);

  -- Append-only. Rows are never updated, and are deleted only when their lead
  -- goes or an import is undone. The timeline is the record of what happened,
  -- so a correction is a new entry, not an edit.
  --
  -- The kind vocabulary is complete from the start even though Phase 3 writes
  -- only some of it: SQLite cannot alter a CHECK constraint without rebuilding
  -- the table, and rebuilding a table of history is not worth doing later.
  CREATE TABLE activities (
    id          TEXT PRIMARY KEY,
    company_id  TEXT NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
    lead_id     TEXT NOT NULL REFERENCES leads (id) ON DELETE CASCADE,
    kind        TEXT NOT NULL CHECK (kind IN (
                  'created', 'note', 'call', 'meeting',
                  'stage_change', 'field_change',
                  'email_queued', 'email_sent', 'email_opened',
                  'email_replied', 'email_failed',
                  'task_done', 'imported', 'import_undone'
                )),
    body        TEXT,
    occurred_at TEXT NOT NULL,
    created_at  TEXT NOT NULL,
    meta        TEXT
  );

  CREATE INDEX activities_lead    ON activities (lead_id, occurred_at DESC);
  CREATE INDEX activities_company ON activities (company_id, occurred_at DESC);
`;

const M003_IMPORTS = `
  -- One row per committed import. This is what makes undo possible, so it
  -- keeps enough to reverse itself: which leads it created (via the column
  -- below), and what the leads it updated looked like beforehand.
  CREATE TABLE import_batches (
    id             TEXT PRIMARY KEY,
    company_id     TEXT NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
    filename       TEXT NOT NULL,
    file_type      TEXT NOT NULL CHECK (file_type IN ('xlsx', 'csv')),

    -- The header-to-field mapping the user chose, so a later import of the
    -- same shape of file can offer it back.
    mapping        TEXT NOT NULL,

    row_count      INTEGER NOT NULL,
    created_count  INTEGER NOT NULL,
    updated_count  INTEGER NOT NULL,
    skipped_count  INTEGER NOT NULL,

    -- The prior values of every lead this batch updated, as JSON. Without it
    -- undo could delete what the batch created but not put back what it
    -- overwrote, which is the half that actually loses work.
    before_image   TEXT NOT NULL,

    created_at     TEXT NOT NULL,
    undone_at      TEXT
  );

  CREATE INDEX import_batches_company ON import_batches (company_id, created_at DESC);

  -- Nulls rather than cascades: undoing an import is a deliberate act through
  -- the service, and deleting the batch row must never take leads with it.
  ALTER TABLE leads ADD COLUMN import_batch_id TEXT
    REFERENCES import_batches (id) ON DELETE SET NULL;

  CREATE INDEX leads_batch ON leads (import_batch_id);
`;

const M004_TASKS = `
  CREATE TABLE tasks (
    id           TEXT PRIMARY KEY,
    company_id   TEXT NOT NULL REFERENCES companies (id) ON DELETE CASCADE,

    -- Nullable: most tasks belong to a lead, but "write the January mailshot"
    -- is still work that has to appear on Today.
    lead_id      TEXT REFERENCES leads (id) ON DELETE CASCADE,

    title        TEXT NOT NULL,
    kind         TEXT NOT NULL CHECK (kind IN ('call', 'email', 'follow_up', 'meeting', 'todo')),
    status       TEXT NOT NULL CHECK (status IN ('open', 'done')),

    -- A calendar day, YYYY-MM-DD, not a timestamp. Being due is a question
    -- about the date where the user is, and an instant compared in UTC reads
    -- as yesterday every evening in Asia/Kolkata.
    due_on       TEXT NOT NULL,

    notes        TEXT,
    completed_at TEXT,
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL
  );

  -- The Today screen's main query: open tasks for a company, by date.
  CREATE INDEX tasks_due  ON tasks (company_id, status, due_on);
  CREATE INDEX tasks_lead ON tasks (lead_id, status, due_on);
`;

const M005_EMAIL = `
  CREATE TABLE email_templates (
    id         TEXT PRIMARY KEY,
    company_id TEXT NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    subject    TEXT NOT NULL,
    body       TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE UNIQUE INDEX email_templates_name
    ON email_templates (company_id, name COLLATE NOCASE);

  -- One row per email Caulder has queued.
  --
  -- message_id is the join key for the whole bridge. Caulder generates it,
  -- Apps Script echoes it back untouched, and every status update matches on
  -- it. Nothing matches on address, subject or timestamp: all three are
  -- ambiguous, and all three can be edited by the person sending.
  CREATE TABLE email_messages (
    id                  TEXT PRIMARY KEY,
    company_id          TEXT NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
    lead_id             TEXT NOT NULL REFERENCES leads (id) ON DELETE CASCADE,
    message_id          TEXT NOT NULL,

    to_email            TEXT NOT NULL,
    subject             TEXT NOT NULL,
    body                TEXT NOT NULL,

    status              TEXT NOT NULL CHECK (status IN (
                          'queued', 'exported', 'sent', 'opened', 'replied',
                          'failed', 'skipped'
                        )),

    scheduled_for       TEXT NOT NULL,
    attempt_count       INTEGER NOT NULL DEFAULT 0,
    next_attempt_at     TEXT,

    provider_message_id TEXT,
    thread_id           TEXT,
    sent_at             TEXT,
    opened_at           TEXT,
    replied_at          TEXT,
    failure             TEXT,

    -- Set when the message was produced by a sequence step, so a reply can
    -- stop the rest of the cadence.
    enrollment_id       TEXT,
    step_id             TEXT,

    created_at          TEXT NOT NULL,
    updated_at          TEXT NOT NULL
  );

  -- The join key has to be unique or an echoed log row could match two
  -- messages, which is the one failure the whole design is built to avoid.
  CREATE UNIQUE INDEX email_messages_key ON email_messages (message_id);
  CREATE INDEX email_messages_queue ON email_messages (company_id, status, scheduled_for);
  CREATE INDEX email_messages_lead  ON email_messages (lead_id, created_at DESC);

  -- A cadence: "day 0 introduce, day 3 nudge, day 10 last try".
  CREATE TABLE sequences (
    id         TEXT PRIMARY KEY,
    company_id TEXT NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    is_active  INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL
  );

  CREATE UNIQUE INDEX sequences_name ON sequences (company_id, name COLLATE NOCASE);

  -- offset_days is the cadence primitive, lifted from Unifloe's
  -- EmailAutomationRule.schedule.offsetDays. Counted from the previous step
  -- actually being sent, not from enrolment, so a delayed send does not
  -- collapse the rest of the sequence into one day.
  CREATE TABLE sequence_steps (
    id          TEXT PRIMARY KEY,
    sequence_id TEXT NOT NULL REFERENCES sequences (id) ON DELETE CASCADE,
    template_id TEXT NOT NULL REFERENCES email_templates (id) ON DELETE CASCADE,
    position    INTEGER NOT NULL,
    offset_days INTEGER NOT NULL,
    created_at  TEXT NOT NULL
  );

  CREATE INDEX sequence_steps_order ON sequence_steps (sequence_id, position);

  CREATE TABLE enrollments (
    id           TEXT PRIMARY KEY,
    company_id   TEXT NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
    sequence_id  TEXT NOT NULL REFERENCES sequences (id) ON DELETE CASCADE,
    lead_id      TEXT NOT NULL REFERENCES leads (id) ON DELETE CASCADE,
    status       TEXT NOT NULL CHECK (status IN ('active', 'finished', 'stopped')),
    /** Why it stopped: 'replied', 'closed', 'manual', or null while running. */
    stopped_for  TEXT,
    next_step    INTEGER NOT NULL DEFAULT 0,
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL
  );

  -- A lead is in a given sequence once. Re-enrolling restarts the same row.
  CREATE UNIQUE INDEX enrollments_lead ON enrollments (sequence_id, lead_id);
  CREATE INDEX enrollments_active ON enrollments (company_id, status);

  -- Every outbox written and every log read back, with a hash of the file so
  -- importing the same log twice is recognised rather than reprocessed.
  CREATE TABLE sync_batches (
    id          TEXT PRIMARY KEY,
    company_id  TEXT NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
    direction   TEXT NOT NULL CHECK (direction IN ('outbox', 'log')),
    filename    TEXT NOT NULL,
    file_hash   TEXT NOT NULL,
    row_count   INTEGER NOT NULL,
    applied     INTEGER NOT NULL DEFAULT 0,
    ignored     INTEGER NOT NULL DEFAULT 0,
    unmatched   INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL
  );

  CREATE INDEX sync_batches_company ON sync_batches (company_id, created_at DESC);
`;

/* ---------------------------------------------------------------------------
 * 6. Bounced.
 *
 * A bounce is not a send failure. A send failure is the script never getting
 * the message out; a bounce is it going out cleanly and coming back hours
 * later because the address does not exist. They need different statuses
 * because they need different answers - one is retried, the other means the
 * address is wrong and no amount of retrying will fix it.
 *
 * `status` is a CHECK constraint, and SQLite cannot alter one. The table has
 * to be rebuilt, which is why the enumerations elsewhere in this schema were
 * declared complete up front. Rows are copied wholesale, so nothing is lost.
 * ------------------------------------------------------------------------- */

const M006_BOUNCED = `
  CREATE TABLE email_messages_new (
    id                  TEXT PRIMARY KEY,
    company_id          TEXT NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
    lead_id             TEXT NOT NULL REFERENCES leads (id) ON DELETE CASCADE,
    message_id          TEXT NOT NULL,

    to_email            TEXT NOT NULL,
    subject             TEXT NOT NULL,
    body                TEXT NOT NULL,

    status              TEXT NOT NULL CHECK (status IN (
                          'queued', 'exported', 'sent', 'opened', 'replied',
                          'failed', 'skipped', 'bounced'
                        )),

    scheduled_for       TEXT NOT NULL,
    attempt_count       INTEGER NOT NULL DEFAULT 0,
    next_attempt_at     TEXT,

    provider_message_id TEXT,
    thread_id           TEXT,
    sent_at             TEXT,
    opened_at           TEXT,
    replied_at          TEXT,
    failure             TEXT,

    -- When the address came back undeliverable, so the queue can say how long
    -- a broken address has been sitting there unfixed.
    bounced_at          TEXT,

    enrollment_id       TEXT,
    step_id             TEXT,

    created_at          TEXT NOT NULL,
    updated_at          TEXT NOT NULL
  );

  INSERT INTO email_messages_new (
    id, company_id, lead_id, message_id, to_email, subject, body, status,
    scheduled_for, attempt_count, next_attempt_at, provider_message_id,
    thread_id, sent_at, opened_at, replied_at, failure, bounced_at,
    enrollment_id, step_id, created_at, updated_at
  )
  SELECT
    id, company_id, lead_id, message_id, to_email, subject, body, status,
    scheduled_for, attempt_count, next_attempt_at, provider_message_id,
    thread_id, sent_at, opened_at, replied_at, failure, NULL,
    enrollment_id, step_id, created_at, updated_at
  FROM email_messages;

  DROP TABLE email_messages;
  ALTER TABLE email_messages_new RENAME TO email_messages;

  CREATE UNIQUE INDEX email_messages_key ON email_messages (message_id);
  CREATE INDEX email_messages_queue ON email_messages (company_id, status, scheduled_for);
  CREATE INDEX email_messages_lead  ON email_messages (lead_id, created_at DESC);

  -- The timeline needs to be able to say a message bounced, and its kind is a
  -- CHECK too. Same rebuild, same wholesale copy - activities are append-only
  -- so there is nothing to reconcile, only to move.
  CREATE TABLE activities_new (
    id          TEXT PRIMARY KEY,
    company_id  TEXT NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
    lead_id     TEXT NOT NULL REFERENCES leads (id) ON DELETE CASCADE,
    kind        TEXT NOT NULL CHECK (kind IN (
                  'created', 'note', 'call', 'meeting',
                  'stage_change', 'field_change',
                  'email_queued', 'email_sent', 'email_opened',
                  'email_replied', 'email_failed', 'email_bounced',
                  'task_done', 'imported', 'import_undone'
                )),
    body        TEXT,
    occurred_at TEXT NOT NULL,
    created_at  TEXT NOT NULL,
    meta        TEXT
  );

  INSERT INTO activities_new
    SELECT id, company_id, lead_id, kind, body, occurred_at, created_at, meta
    FROM activities;

  DROP TABLE activities;
  ALTER TABLE activities_new RENAME TO activities;

  CREATE INDEX activities_lead    ON activities (lead_id, occurred_at DESC);
  CREATE INDEX activities_company ON activities (company_id, occurred_at DESC);

  -- Which provider the Apps Script is set up against. Only ever used to show
  -- the right instructions; Caulder itself sends through none of them.
  INSERT OR IGNORE INTO settings (key, value) VALUES ('mailProvider', 'gmail');
`;

export const MIGRATIONS: readonly Migration[] = [
  { version: 1, name: "companies, stages, settings", sql: M001_COMPANIES },
  { version: 2, name: "leads, activities", sql: M002_LEADS },
  { version: 3, name: "import batches", sql: M003_IMPORTS },
  { version: 4, name: "tasks", sql: M004_TASKS },
  { version: 5, name: "email, sequences, sync", sql: M005_EMAIL },
  { version: 6, name: "bounced", sql: M006_BOUNCED },
];

export function currentVersion(db: Db): number {
  const row = db.pragma("user_version", { simple: true });
  return typeof row === "number" ? row : 0;
}

type MigrationResult = {
  from: number;
  to: number;
  applied: string[];
};

/**
 * Brings the database up to the newest version. Returns which steps ran so the
 * caller can log a real answer rather than "done".
 */
export function migrate(db: Db): MigrationResult {
  const from = currentVersion(db);
  const pending = MIGRATIONS.filter((m) => m.version > from).sort(
    (a, b) => a.version - b.version,
  );

  const applied: string[] = [];

  for (const migration of pending) {
    // exec cannot run inside better-sqlite3's transaction() helper because the
    // SQL contains its own statement separators, so the transaction is driven
    // by hand here.
    db.exec("BEGIN");
    try {
      db.exec(migration.sql);
      // pragma does not accept a bound parameter, and version is a number from
      // this module's own literal list, never user input.
      db.pragma(`user_version = ${migration.version}`);
      db.exec("COMMIT");
      applied.push(`${migration.version}: ${migration.name}`);
    } catch (error) {
      db.exec("ROLLBACK");
      throw new Error(
        `Migration ${migration.version} (${migration.name}) failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  return { from, to: currentVersion(db), applied };
}

export const LATEST_VERSION = MIGRATIONS.reduce(
  (highest, m) => Math.max(highest, m.version),
  0,
);
