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
  /**
   * Rebuilds a table other tables point at. Run with foreign keys off, as
   * SQLite's own recipe for it says: dropping the old table would otherwise
   * cascade into everything that refers to it.
   */
  rebuilds?: true;
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

/**
 * A company's own face, why deals are lost, and what you are aiming at.
 *
 * ALTER TABLE ADD COLUMN rather than a rebuild: all three are additions, and
 * SQLite adds a column cheaply. The CHECK constraints that cannot be altered
 * are all on tables this leaves alone.
 */
const M007_IDENTITY = `
  -- A small PNG data URL, downscaled in the renderer before it gets here.
  -- Stored in the row rather than beside the database so it travels with a
  -- backup and an export without a second file to lose.
  ALTER TABLE companies ADD COLUMN logo TEXT;

  -- What you are aiming at, per company. Null means no target set, which is
  -- different from a target of zero.
  ALTER TABLE companies ADD COLUMN goal_value INTEGER;
  ALTER TABLE companies ADD COLUMN goal_period TEXT;

  -- Why a deal was lost. The forecast knows THAT you lose; this is the only
  -- way it could ever know why, and it is the question a solo founder most
  -- wants answered at the end of a quarter.
  ALTER TABLE leads ADD COLUMN loss_reason TEXT;
  ALTER TABLE leads ADD COLUMN closed_at TEXT;
`;

/**
 * Rules, files, saved views and custom fields.
 *
 * One migration rather than four, because they arrived together and a
 * half-applied set of four would be a database in a state no version number
 * describes. Every table here is new, so nothing has to be rebuilt.
 */
const M008_WORKBENCH = `
  -- "When this happens, do that." The one piece of automation a person
  -- working alone actually needs: the process they already follow, written
  -- down so it does not depend on them remembering it at 6pm.
  CREATE TABLE rules (
    id               TEXT PRIMARY KEY,
    company_id       TEXT NOT NULL REFERENCES companies (id) ON DELETE CASCADE,

    -- What starts it. A stage being entered, a lead being created, or a lead
    -- going quiet for a number of days.
    trigger          TEXT NOT NULL CHECK (trigger IN (
                       'stage_entered', 'lead_created', 'went_quiet'
                     )),
    -- The stage, for stage_entered. Deleting the stage deletes the rule:
    -- a rule about a stage that no longer exists cannot fire and should not
    -- sit in the list pretending it might.
    trigger_stage_id TEXT REFERENCES pipeline_stages (id) ON DELETE CASCADE,
    trigger_days     INTEGER,

    -- What it does. Only tasks for now, and the column is here so adding a
    -- second kind later does not need a table rebuild - a CHECK cannot be
    -- altered, so this one is declared with room in it.
    action           TEXT NOT NULL CHECK (action IN ('create_task')),
    task_title       TEXT NOT NULL,
    task_kind        TEXT NOT NULL,
    task_offset_days INTEGER NOT NULL DEFAULT 0,

    is_active        INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at       TEXT NOT NULL
  );

  CREATE INDEX rules_company ON rules (company_id, is_active);
  CREATE INDEX rules_stage   ON rules (trigger_stage_id);

  -- Files that belong to a lead: the proposal you actually sent, the
  -- brochure, the signed order. Copied into the app's own folder rather than
  -- linked, so moving the original does not leave a dead reference - and
  -- recorded by relative path so the whole folder can be moved with the
  -- database.
  CREATE TABLE attachments (
    id         TEXT PRIMARY KEY,
    company_id TEXT NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
    lead_id    TEXT NOT NULL REFERENCES leads (id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    file       TEXT NOT NULL,
    bytes      INTEGER NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE INDEX attachments_lead ON attachments (lead_id, created_at DESC);

  -- A filter worth keeping. "Bengaluru, no next step" is a question you ask
  -- every week, and retyping it every week is how people stop asking it.
  CREATE TABLE saved_views (
    id         TEXT PRIMARY KEY,
    company_id TEXT NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    query      TEXT NOT NULL,
    position   INTEGER NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE UNIQUE INDEX saved_views_name ON saved_views (company_id, name COLLATE NOCASE);

  -- Fields the app could not have known about. A school CRM wants "board" and
  -- "student count"; a studio wants "referred by". Defined per company,
  -- because two workspaces are two different businesses.
  CREATE TABLE custom_fields (
    id         TEXT PRIMARY KEY,
    company_id TEXT NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    kind       TEXT NOT NULL CHECK (kind IN ('text', 'number', 'date', 'choice')),
    -- A JSON array, for 'choice'. Free-form and never queried, so JSON is the
    -- right shape rather than a second table.
    choices    TEXT,
    position   INTEGER NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE UNIQUE INDEX custom_fields_name ON custom_fields (company_id, name COLLATE NOCASE);

  -- One row per lead per field that has a value. Absent means unset, which is
  -- different from empty - and a sparse table says that without a sentinel.
  CREATE TABLE custom_values (
    lead_id  TEXT NOT NULL REFERENCES leads (id) ON DELETE CASCADE,
    field_id TEXT NOT NULL REFERENCES custom_fields (id) ON DELETE CASCADE,
    value    TEXT NOT NULL,
    PRIMARY KEY (lead_id, field_id)
  );
`;

/**
 * The personal side: a workspace that plans a day rather than a funnel.
 *
 * The kind column is the hinge. Until now the "mode" picked on first run was
 * read once to seed a set of stages and then thrown away, so nothing could
 * ever ask what sort of workspace it was looking at. Everything else here
 * hangs off being able to ask that.
 *
 * Existing rows backfill to 'solo', which is what they have always been.
 */
const M009_PERSONAL = `
  -- 'solo' is the outreach workspace this app started as. 'personal' plans a
  -- day and has no funnel at all. 'team' is deliberately not built yet, and is
  -- absent from the CHECK for that reason: a value nothing can produce is a
  -- promise the schema cannot keep.
  ALTER TABLE companies ADD COLUMN kind TEXT NOT NULL DEFAULT 'solo';

  -- Part of a day, rather than a day. A task is DUE ON a day; a block OCCUPIES
  -- some of one, so it needs a clock and a length that tasks have never had.
  --
  -- starts_at is 'HH:MM' and stays a string for the same reason due_on is one:
  -- nine o'clock is nine o'clock, and storing it as an instant means it moves
  -- when the machine's timezone does.
  CREATE TABLE blocks (
    id          TEXT PRIMARY KEY,
    company_id  TEXT NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
    day         TEXT NOT NULL,
    starts_at   TEXT NOT NULL,
    minutes     INTEGER NOT NULL CHECK (minutes > 0),
    title       TEXT NOT NULL,
    -- Free text, not a CHECK. The LOSS_REASONS precedent: SQLite cannot alter
    -- a CHECK without rebuilding the table, and the first invented kind would
    -- force exactly that.
    kind        TEXT,
    notes       TEXT,

    -- "Work on: call the principal." Nulls rather than cascades, so deleting
    -- the task empties the link and leaves the hour you set aside standing.
    task_id     TEXT REFERENCES tasks (id) ON DELETE SET NULL,

    -- Which side owns it. 'caulder' blocks are ours to push; 'google' ones are
    -- mirrors of an event and are theirs. Ownership is what settles a conflict
    -- later, which is why it is a column and not a guess.
    source      TEXT NOT NULL DEFAULT 'caulder',
    external_id TEXT,
    etag        TEXT,
    -- Changed here and not yet pushed.
    is_dirty    INTEGER NOT NULL DEFAULT 0 CHECK (is_dirty IN (0, 1)),

    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
  );

  CREATE INDEX blocks_day  ON blocks (company_id, day, starts_at);
  CREATE INDEX blocks_task ON blocks (task_id);
  -- One local row per Google event. A repeated sync updates rather than
  -- duplicates, which is the whole of what makes re-syncing safe.
  CREATE UNIQUE INDEX blocks_external ON blocks (company_id, external_id)
    WHERE external_id IS NOT NULL;

  -- A thought, caught before it goes. Deliberately not an activity: an
  -- activity must belong to a lead (activities.lead_id is NOT NULL) and the
  -- whole point of a quick note is that it belongs to nothing yet.
  CREATE TABLE notes (
    id         TEXT PRIMARY KEY,
    company_id TEXT NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
    body       TEXT NOT NULL,
    -- The day it was caught, so a day can show what was on your mind during it.
    day        TEXT NOT NULL,
    is_pinned  INTEGER NOT NULL DEFAULT 0 CHECK (is_pinned IN (0, 1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX notes_recent ON notes (company_id, is_pinned DESC, created_at DESC);

  -- A stretch you said you would spend on one thing.
  CREATE TABLE focus_sessions (
    id         TEXT PRIMARY KEY,
    company_id TEXT NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
    block_id   TEXT REFERENCES blocks (id) ON DELETE SET NULL,
    intent     TEXT NOT NULL,
    started_at TEXT NOT NULL,
    -- When it was meant to end, and when it did. Both, because stopping early
    -- is the fact worth keeping.
    ends_at    TEXT NOT NULL,
    ended_at   TEXT,
    outcome    TEXT,
    -- How many times you clicked past the panel. Counted so the summary is
    -- honest rather than flattering.
    breaches   INTEGER NOT NULL DEFAULT 0
  );

  CREATE INDEX focus_recent ON focus_sessions (company_id, started_at DESC);

  -- What to hold at arm's length while a session is running. Matched against
  -- the foreground executable's path, case-insensitively.
  CREATE TABLE focus_blocklist (
    id         TEXT PRIMARY KEY,
    company_id TEXT NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
    pattern    TEXT NOT NULL,
    label      TEXT,
    created_at TEXT NOT NULL
  );

  CREATE UNIQUE INDEX focus_blocklist_pattern
    ON focus_blocklist (company_id, pattern COLLATE NOCASE);

  -- closed_at has existed since migration 7 and nothing has ever written it.
  -- The forecast has been using updated_at as the close date instead, which
  -- any later logged call bumps - so every time-to-close figure has been
  -- reading longer than it was. Backfilled from the timeline: the last move
  -- into a won or lost stage is the real answer, and updated_at is the
  -- fallback only where no such entry exists.
  UPDATE leads SET closed_at = COALESCE(
    (SELECT MAX(a.occurred_at)
       FROM activities a
       JOIN pipeline_stages s
         ON s.id = json_extract(a.meta, '$.stageId')
      WHERE a.lead_id = leads.id
        AND a.kind = 'stage_change'
        AND s.kind IN ('won', 'lost')),
    updated_at
  )
  WHERE closed_at IS NULL
    AND stage_id IN (SELECT id FROM pipeline_stages WHERE kind IN ('won', 'lost'));
`;

/**
 * The Google link.
 *
 * Caulder still calls nothing on its own behalf. It talks to a script running
 * in the user's OWN Google account, which is what makes this possible without
 * a Cloud project, a client secret shipped in a binary, or Google's review -
 * Calendar and Tasks are sensitive scopes, and an unverified desktop client's
 * sign-in expires every seven days.
 *
 * The connection itself is not in here. It lives in the OS credential store,
 * because a web-app URL plus its secret is a bearer capability: anyone holding
 * both can read and write that calendar.
 */
const M010_GOOGLE = `
  -- Which calendar and which list this workspace is tied to. Per workspace
  -- rather than per machine, so two personal workspaces do not pour into one
  -- calendar and mangle each other.
  ALTER TABLE companies ADD COLUMN google_calendar_id TEXT;
  ALTER TABLE companies ADD COLUMN google_tasklist_id TEXT;

  -- The join key on the task side. Nothing is ever matched on a title.
  ALTER TABLE tasks ADD COLUMN external_id TEXT;
  -- Set when a task changes here and cleared once it has been sent, so a sync
  -- knows which side moved without having to guess from timestamps.
  ALTER TABLE tasks ADD COLUMN is_dirty INTEGER NOT NULL DEFAULT 0;

  CREATE UNIQUE INDEX tasks_external ON tasks (company_id, external_id)
    WHERE external_id IS NOT NULL;

  -- What was deleted here while offline.
  --
  -- Without this, deleting a block simply stops it being pushed and the event
  -- lives on in the calendar forever - the row is gone, so there is nothing
  -- left to say "and remove that one". The tombstone is the only record that
  -- the deletion happened, and it is dropped once Google has been told.
  CREATE TABLE google_tombstones (
    id          TEXT PRIMARY KEY,
    company_id  TEXT NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
    kind        TEXT NOT NULL CHECK (kind IN ('event', 'task')),
    external_id TEXT NOT NULL,
    created_at  TEXT NOT NULL
  );

  CREATE INDEX google_tombstones_company ON google_tombstones (company_id, kind);

  -- What the last sync did, and over what range.
  --
  -- synced_from/synced_to are not decoration: absence from Google's answer
  -- only means "deleted" inside the window that was actually asked about, and
  -- this is where that window is remembered.
  CREATE TABLE google_sync (
    company_id     TEXT PRIMARY KEY REFERENCES companies (id) ON DELETE CASCADE,
    last_synced_at TEXT,
    synced_from    TEXT,
    synced_to      TEXT,
    pushed         INTEGER NOT NULL DEFAULT 0,
    pulled         INTEGER NOT NULL DEFAULT 0,
    conflicts      INTEGER NOT NULL DEFAULT 0,
    last_error     TEXT
  );
`;

/**
 * Repeating blocks.
 *
 * The app is for a student founder, and most of a student's week is the same
 * week again: a Tuesday lecture, the gym on Monday and Thursday, a club that
 * meets until the end of term. Without this the day planner asks somebody to
 * type their own timetable in every seven days, which is a thing nobody does
 * twice.
 *
 * Occurrences are written as ordinary blocks rather than computed at read
 * time. Editing one Tuesday because a lecture moved is then just editing a
 * block, and the Google sync needs no idea repeats exist at all - each
 * occurrence is a real block and becomes a real event.
 */
const M011_REPEATS = `
  CREATE TABLE block_series (
    id         TEXT PRIMARY KEY,
    company_id TEXT NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
    title      TEXT NOT NULL,
    kind       TEXT,
    notes      TEXT,
    starts_at  TEXT NOT NULL,
    minutes    INTEGER NOT NULL CHECK (minutes > 0),
    -- ISO weekday numbers, comma separated: '1,3,5' is Monday, Wednesday and
    -- Friday. A tiny list that is never queried on, so a string rather than a
    -- table of its own.
    weekdays   TEXT NOT NULL,
    from_day   TEXT NOT NULL,
    until_day  TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE INDEX block_series_company ON block_series (company_id);

  -- Nulls rather than cascades. Ending a repeat should clear the future and
  -- leave what already happened standing: the Tuesdays you actually sat
  -- through are history, not part of a rule you have since cancelled.
  ALTER TABLE blocks ADD COLUMN series_id TEXT
    REFERENCES block_series (id) ON DELETE SET NULL;

  CREATE INDEX blocks_series ON blocks (series_id);
`;

/**
 * Knowing what to be at, and whether it happened.
 *
 * Three small columns and one table, and between them they are the foundation
 * for the whole Review screen. The one worth explaining is `outcome`.
 *
 * Null means nobody said, and a null in the past counts as kept. That is the
 * low-friction choice - nothing to tick, nothing to remember - and it has a
 * cost that has to be admitted on screen rather than buried here: the record
 * flatters you unless you mark what did not happen. Every number derived from
 * it says "kept unless you said otherwise" in those words.
 */
const M012_PRIORITY = `
  -- A term. Six classes and a date range, so a new semester is one action
  -- rather than deleting forty-five blocks by hand.
  CREATE TABLE terms (
    id         TEXT PRIMARY KEY,
    company_id TEXT NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    from_day   TEXT NOT NULL,
    until_day  TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE INDEX terms_company ON terms (company_id, from_day DESC);

  -- 'must' | 'should' | 'spare'. Null means "whatever this kind of block
  -- usually is", which is how nobody has to set it twice a day. Free text
  -- rather than a CHECK for the reason the kind column already is: SQLite
  -- cannot alter one without rebuilding the table.
  ALTER TABLE blocks ADD COLUMN priority TEXT;
  ALTER TABLE tasks  ADD COLUMN priority TEXT;

  -- Null | 'skipped' | 'moved'. See above.
  ALTER TABLE blocks ADD COLUMN outcome TEXT;

  -- Which repeats are worth a streak. Only these ever ask anything of you.
  ALTER TABLE block_series ADD COLUMN is_habit INTEGER NOT NULL DEFAULT 0;

  -- Nulls rather than cascades: ending a term must not delete the timetable
  -- it held. Last semester happened.
  ALTER TABLE block_series ADD COLUMN term_id TEXT
    REFERENCES terms (id) ON DELETE SET NULL;

  CREATE INDEX blocks_outcome ON blocks (company_id, day, outcome);
`;

/**
 * Reminders: saying something before a block starts.
 *
 * A timetable that never speaks is a picture of a plan. Three columns, and
 * the interesting one is the pair of nulls.
 *
 * `companies.remind_minutes` null means reminders are off for this workspace,
 * which is the master switch and the default - the same rule every other
 * thing in Caulder that acts on its own follows. A number is how long before
 * a block starts to say so.
 *
 * `blocks.remind_minutes` null means "whatever the workspace says", so
 * nobody sets a lead time twice a day. A number overrides it for this one
 * block, and -1 means never - a value rather than a second column, because
 * "follow the default" and "specifically not" are different answers to one
 * question and belong in one field.
 */
const M013_REMINDERS = `
  ALTER TABLE companies ADD COLUMN remind_minutes INTEGER;

  ALTER TABLE blocks ADD COLUMN remind_minutes INTEGER;

  -- When it was said, so it is said once. Cleared whenever the block moves,
  -- because a lecture dragged to the afternoon is owed a new reminder and
  -- the old one was about a time that is no longer happening.
  ALTER TABLE blocks ADD COLUMN reminded_at TEXT;

  CREATE INDEX blocks_remind ON blocks (company_id, day, reminded_at);
`;

/**
 * Marketing: what outreach costs, and what it brings back.
 *
 * `value` is revenue. Until now there has been no money-OUT anywhere in the
 * schema at all, so the app could say what a lead was worth and had no idea
 * what any of them cost — which is the one question that decides where the
 * next rupee goes.
 *
 * Three decisions inside it are worth reading:
 *
 *  - **`channel` is free TEXT, not a CHECK.** The `LOSS_REASONS` precedent:
 *    SQLite cannot alter a CHECK without rebuilding the table, and the first
 *    invented channel would force exactly that.
 *  - **`leads.campaign_id` is ON DELETE SET NULL.** CASCADE would delete
 *    people. Third instance of a rule `reference/data-model.md` already
 *    states. Orphaned leads then fall back to grouping under their `source`
 *    string, so they demote rather than vanish.
 *  - **`budget` and `amount` are nullable and non-zero respectively.** "None
 *    recorded" and "zero" are different statements, and a campaign nobody has
 *    entered spend for must not report a cost per lead of zero and top the
 *    table.
 */
const M014_MARKETING = `
  CREATE TABLE campaigns (
    id          TEXT PRIMARY KEY,
    company_id  TEXT NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    channel     TEXT,
    starts_on   TEXT NOT NULL,
    -- Null means ongoing, which is not the same as ending today.
    ends_on     TEXT,
    -- Null means none set, which is not the same as a budget of nothing.
    budget      INTEGER,
    is_archived INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL,
    CHECK (ends_on IS NULL OR ends_on >= starts_on)
  );

  CREATE INDEX campaigns_company ON campaigns (company_id, is_archived, starts_on DESC);

  -- Carries company_id like every other table holding user data, which also
  -- makes the total for a workspace one indexed scan.
  CREATE TABLE campaign_spend (
    id          TEXT PRIMARY KEY,
    company_id  TEXT NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
    campaign_id TEXT NOT NULL REFERENCES campaigns (id) ON DELETE CASCADE,
    spent_on    TEXT NOT NULL,
    amount      INTEGER NOT NULL CHECK (amount <> 0),
    note        TEXT,
    created_at  TEXT NOT NULL
  );

  CREATE INDEX campaign_spend_campaign ON campaign_spend (campaign_id, spent_on);
  CREATE INDEX campaign_spend_company  ON campaign_spend (company_id, spent_on);

  ALTER TABLE leads ADD COLUMN campaign_id TEXT
    REFERENCES campaigns (id) ON DELETE SET NULL;

  -- The flag that stops everything else here becoming a liability. Enforced
  -- where the reaching-out happens, not hidden in the UI.
  ALTER TABLE leads ADD COLUMN do_not_contact INTEGER NOT NULL DEFAULT 0;

  CREATE INDEX leads_campaign ON leads (company_id, campaign_id);

  -- Which stage counts as qualified. Until somebody says, "qualified" is null
  -- rather than zero: inventing it from stage position would be the app
  -- deciding what the funnel means.
  ALTER TABLE companies ADD COLUMN qualified_stage_id TEXT
    REFERENCES pipeline_stages (id) ON DELETE SET NULL;

  ALTER TABLE companies ADD COLUMN currency TEXT NOT NULL DEFAULT 'INR';

  ALTER TABLE email_templates ADD COLUMN channel TEXT NOT NULL DEFAULT 'email';

  -- The timeline has to be able to say a WhatsApp message went, and its kind
  -- is a CHECK. Third rebuild, same wholesale copy as M006 - activities are
  -- append-only, so there is nothing to reconcile, only to move.
  CREATE TABLE activities_new (
    id          TEXT PRIMARY KEY,
    company_id  TEXT NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
    lead_id     TEXT NOT NULL REFERENCES leads (id) ON DELETE CASCADE,
    kind        TEXT NOT NULL CHECK (kind IN (
                  'created', 'note', 'call', 'meeting', 'whatsapp',
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
`;

/**
 * Areas of life, and the coffee accent.
 *
 * `tasks.area` is which part of a day a task belongs to - college, the
 * company, personal, health - kept apart from `kind`, which is the verb.
 * Backfilled from the only signal there was before: a task in a personal
 * workspace was personal, one in an outreach workspace was the company's.
 * That is a guess, and a reasonable one; nothing is lost by it, because the
 * column did not exist.
 *
 * The accent line moves personal workspaces onto the coffee accent - but only
 * those still on blue, which is the default and the one nobody chose. A
 * workspace somebody deliberately made teal stays teal.
 */
const M015_AREAS = `
  ALTER TABLE tasks ADD COLUMN area TEXT;

  UPDATE tasks SET area = CASE
      WHEN (SELECT kind FROM companies c WHERE c.id = tasks.company_id) = 'personal'
        THEN 'personal'
      ELSE 'company'
    END;

  CREATE INDEX tasks_area ON tasks (company_id, area, status);

  UPDATE companies SET accent = 'coffee' WHERE kind = 'personal' AND accent = 'blue';
`;

/**
 * Your words: what the quick-add line should know about this one life.
 *
 * Course names, the company, the gym - each pointing at an area. Global
 * rather than per workspace, deliberately: "Datascience" is a college word
 * whichever workspace it is typed into, and "Oakridge" typed into the
 * personal one is still the company's.
 *
 * Unique ignoring case, so "CS301" and "cs301" cannot both be taught and
 * disagree. The database says so rather than the screen, because the screen
 * is not the only thing that will ever write here.
 */
const M016_WORDS = `
  CREATE TABLE area_words (
    id         TEXT PRIMARY KEY,
    word       TEXT NOT NULL,
    area       TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE UNIQUE INDEX area_words_word ON area_words (word COLLATE NOCASE);
`;

/**
 * Migration 17: money.
 *
 * Quotes, invoices, payments and a spend ledger: the four numbers a month a
 * founder needs, and nothing an accountant would recognise. See PLAN.md,
 * phase 3.
 *
 *  - **Lines are rows, not JSON.** A quote is a few lines and a total is a sum
 *    over them; putting the lines in a text column would make the total a
 *    thing the app computes on the way out and cannot query.
 *  - **Money is whole units of the workspace's currency**, the same rule as
 *    `leads.value` and `campaign_spend.amount`: an INTEGER, never a float.
 *  - **Paid is derived from payments**, never typed. An invoice is paid when
 *    what came in covers what was asked; marking it paid by hand records a
 *    payment for the remainder, so the ledger always adds up.
 *  - **Overdue is not a status.** It is a sent invoice past its due date,
 *    worked out when read, so nothing has to run at midnight.
 *  - **`spend` replaces `campaign_spend`** for anything the person enters
 *    from here on: the campaign is optional, because most of what a founder
 *    spends is not a campaign. What was already recorded is copied across so
 *    the ledger is complete; the old table stays until phase 4.
 */
const M017_MONEY = `
  CREATE TABLE quotes (
    id         TEXT PRIMARY KEY,
    company_id TEXT NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
    lead_id    TEXT NOT NULL REFERENCES leads (id) ON DELETE CASCADE,
    number     INTEGER NOT NULL,
    status     TEXT NOT NULL CHECK (status IN ('draft', 'sent', 'accepted', 'declined')),
    issued_on  TEXT NOT NULL,
    notes      TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (company_id, number)
  );

  CREATE INDEX quotes_company ON quotes (company_id, issued_on DESC);
  CREATE INDEX quotes_lead    ON quotes (lead_id);

  CREATE TABLE quote_lines (
    id          TEXT PRIMARY KEY,
    quote_id    TEXT NOT NULL REFERENCES quotes (id) ON DELETE CASCADE,
    position    INTEGER NOT NULL,
    description TEXT NOT NULL,
    quantity    REAL NOT NULL CHECK (quantity > 0),
    unit_price  INTEGER NOT NULL CHECK (unit_price >= 0)
  );

  CREATE INDEX quote_lines_quote ON quote_lines (quote_id, position);

  CREATE TABLE invoices (
    id         TEXT PRIMARY KEY,
    company_id TEXT NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
    lead_id    TEXT NOT NULL REFERENCES leads (id) ON DELETE CASCADE,
    -- The quote it came from, if it came from one. Deleting the quote leaves
    -- the invoice: the money is owed whatever the paperwork did.
    quote_id   TEXT REFERENCES quotes (id) ON DELETE SET NULL,
    number     INTEGER NOT NULL,
    status     TEXT NOT NULL CHECK (status IN ('draft', 'sent', 'paid', 'void')),
    issued_on  TEXT NOT NULL,
    due_on     TEXT NOT NULL,
    -- Set when the payments cover the total; cleared if one is removed.
    paid_on    TEXT,
    notes      TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (company_id, number),
    CHECK (due_on >= issued_on)
  );

  CREATE INDEX invoices_company ON invoices (company_id, status, due_on);
  CREATE INDEX invoices_lead    ON invoices (lead_id);

  CREATE TABLE invoice_lines (
    id          TEXT PRIMARY KEY,
    invoice_id  TEXT NOT NULL REFERENCES invoices (id) ON DELETE CASCADE,
    position    INTEGER NOT NULL,
    description TEXT NOT NULL,
    quantity    REAL NOT NULL CHECK (quantity > 0),
    unit_price  INTEGER NOT NULL CHECK (unit_price >= 0)
  );

  CREATE INDEX invoice_lines_invoice ON invoice_lines (invoice_id, position);

  CREATE TABLE payments (
    id         TEXT PRIMARY KEY,
    company_id TEXT NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
    invoice_id TEXT NOT NULL REFERENCES invoices (id) ON DELETE CASCADE,
    amount     INTEGER NOT NULL CHECK (amount > 0),
    paid_on    TEXT NOT NULL,
    note       TEXT,
    created_at TEXT NOT NULL
  );

  CREATE INDEX payments_invoice ON payments (invoice_id, paid_on);
  CREATE INDEX payments_company ON payments (company_id, paid_on);

  CREATE TABLE spend (
    id          TEXT PRIMARY KEY,
    company_id  TEXT NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
    spent_on    TEXT NOT NULL,
    amount      INTEGER NOT NULL CHECK (amount <> 0),
    what        TEXT NOT NULL,
    -- Optional: most of what a founder spends is not a campaign.
    campaign_id TEXT REFERENCES campaigns (id) ON DELETE SET NULL,
    created_at  TEXT NOT NULL
  );

  CREATE INDEX spend_company ON spend (company_id, spent_on DESC);

  INSERT INTO spend (id, company_id, spent_on, amount, what, campaign_id, created_at)
  SELECT s.id, s.company_id, s.spent_on, s.amount,
         COALESCE(s.note, c.name, 'Spend'), s.campaign_id, s.created_at
  FROM campaign_spend s
  LEFT JOIN campaigns c ON c.id = s.campaign_id;
`;

/**
 * Migration 18: the deletion pass. See PLAN.md, phase 4.
 *
 * Everything phases 1 and 2 hid comes out of the schema: the email queue and
 * the bridge, sequences, rules, saved views, focus, and the campaign spend
 * that migration 17 already copied into `spend`. `campaigns` stays as a label
 * table because `leads.campaign_id` and `spend.campaign_id` point at it.
 * Settings the widget and the mail provider wrote are cleared.
 */
const M018_DELETION = `
  DROP TABLE IF EXISTS focus_blocklist;
  DROP TABLE IF EXISTS focus_sessions;
  DROP TABLE IF EXISTS rules;
  DROP TABLE IF EXISTS saved_views;
  DROP TABLE IF EXISTS enrollments;
  DROP TABLE IF EXISTS sequence_steps;
  DROP TABLE IF EXISTS sequences;
  DROP TABLE IF EXISTS email_messages;
  DROP TABLE IF EXISTS sync_batches;
  DROP TABLE IF EXISTS campaign_spend;
  DELETE FROM settings WHERE key IN ('widgetLevel', 'widgetOpen', 'mailProvider', 'syncFolder');
`;


/**
 * Email that Caulder sends through the Google script. See PLAN.md, phase 5.
 *
 * One row per message, with its one optional follow-up as columns rather than
 * a second row: there is never more than one, and a follow-up means nothing
 * apart from the message it follows. `settled` says nothing more can happen
 * to it; `forgotten` says the script has been told it may drop its copy.
 */
const M019_EMAILS = `
  CREATE TABLE emails (
    id                TEXT PRIMARY KEY,
    company_id        TEXT NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
    lead_id           TEXT NOT NULL REFERENCES leads (id) ON DELETE CASCADE,
    to_email          TEXT NOT NULL,
    subject           TEXT NOT NULL,
    body              TEXT NOT NULL,
    send_at           TEXT,
    status            TEXT NOT NULL
                      CHECK (status IN ('scheduled', 'sent', 'replied', 'failed', 'cancelled')),
    sent_at           TEXT,
    replied_at        TEXT,
    error             TEXT,
    follow_up_days    INTEGER CHECK (follow_up_days BETWEEN 1 AND 60),
    follow_up_body    TEXT,
    follow_up_status  TEXT
                      CHECK (follow_up_status IN ('waiting', 'sent', 'skipped', 'cancelled', 'failed')),
    follow_up_sent_at TEXT,
    follow_up_error   TEXT,
    settled           INTEGER NOT NULL DEFAULT 0 CHECK (settled IN (0, 1)),
    forgotten         INTEGER NOT NULL DEFAULT 0 CHECK (forgotten IN (0, 1)),
    created_at        TEXT NOT NULL,
    updated_at        TEXT NOT NULL
  );

  CREATE INDEX emails_lead    ON emails (lead_id, created_at DESC);
  CREATE INDEX emails_work    ON emails (settled, forgotten, updated_at);
  CREATE INDEX emails_replies ON emails (company_id, status, replied_at);
`;

/**
 * The company brain, and search over everything. See PLAN.md, phase 6.
 *
 * Pages hold their template's fields as JSON, because the fields are defined
 * in shared/brain.ts and change with it, and nothing queries them by column.
 * A secret field is stored as `{"$secret": "<encrypted>"}` inside that JSON,
 * so it travels with its revisions and never reaches the search index, which
 * only reads a field's text and numbers.
 *
 * Search is FTS5, kept current by triggers rather than by every place that
 * writes a lead or a note remembering to. `search_map` gives each indexed row
 * a stable integer id, which is what FTS5 keys on; the source tables' own
 * rowids can change under VACUUM. Every trigger runs the same "refresh this
 * row" step, so an insert, an edit and a delete cannot disagree about what
 * the index should hold.
 *
 * FROZEN: the SQL this builds is migration 20. A later change to what is
 * indexed is a later migration that drops and recreates the triggers.
 */
const M020_SOURCES: {
  kind: string;
  table: string;
  when: string;
  title: string;
  body: string;
  columns: string;
}[] = [
  {
    kind: "page",
    table: "brain_pages",
    when: "t.is_archived = 0",
    title: "t.title",
    body: `t.body || ' ' || COALESCE((SELECT group_concat(value, ' ') FROM json_each(t.fields)
             WHERE type IN ('text', 'integer', 'real')), '')`,
    columns: "title, body, fields, is_archived",
  },
  {
    kind: "contact",
    table: "leads",
    when: "1",
    title: "t.name",
    body: `concat_ws(' ', t.contact_person, t.email, t.phone, t.alt_phone, t.city,
             t.location, t.website, t.source, t.notes)`,
    columns: "name, contact_person, email, phone, alt_phone, city, location, website, source, notes",
  },
  {
    kind: "note",
    table: "notes",
    when: "1",
    title: "''",
    body: "t.body",
    columns: "body",
  },
  {
    kind: "history",
    table: "activities",
    when: `t.body IS NOT NULL AND t.kind NOT IN ('created', 'stage_change', 'field_change',
             'imported', 'import_undone', 'task_done')`,
    title: "''",
    body: "t.body",
    columns: "body, kind",
  },
  {
    kind: "invoice",
    table: "invoices",
    when: "1",
    title: `'INV-' || printf('%04d', t.number)`,
    body: `concat_ws(' ', (SELECT name FROM leads WHERE id = t.lead_id), t.notes,
             (SELECT group_concat(description, ' ') FROM invoice_lines WHERE invoice_id = t.id))`,
    columns: "number, notes, lead_id",
  },
];

function m020Refresh(source: (typeof M020_SOURCES)[number], id: string): string {
  const { kind, table, when, title, body } = source;
  return `
    DELETE FROM brain_search
      WHERE rowid = (SELECT id FROM search_map WHERE kind = '${kind}' AND ref_id = ${id});
    DELETE FROM search_map WHERE kind = '${kind}' AND ref_id = ${id};
    INSERT INTO search_map (kind, ref_id, company_id)
      SELECT '${kind}', t.id, t.company_id FROM ${table} t WHERE t.id = ${id} AND (${when});
    INSERT INTO brain_search (rowid, title, body)
      SELECT m.id, ${title}, ${body}
      FROM ${table} t JOIN search_map m ON m.kind = '${kind}' AND m.ref_id = t.id
      WHERE t.id = ${id};`;
}

function m020Triggers(): string {
  const parts: string[] = [];
  for (const source of M020_SOURCES) {
    const { kind, table, when, title, body, columns } = source;
    parts.push(`
  CREATE TRIGGER search_${kind}_insert AFTER INSERT ON ${table} BEGIN${m020Refresh(source, "NEW.id")}
  END;
  CREATE TRIGGER search_${kind}_update AFTER UPDATE OF ${columns} ON ${table} BEGIN${m020Refresh(source, "NEW.id")}
  END;
  CREATE TRIGGER search_${kind}_delete AFTER DELETE ON ${table} BEGIN${m020Refresh(source, "OLD.id")}
  END;
  INSERT INTO search_map (kind, ref_id, company_id)
    SELECT '${kind}', t.id, t.company_id FROM ${table} t WHERE ${when};
  INSERT INTO brain_search (rowid, title, body)
    SELECT m.id, ${title}, ${body}
    FROM ${table} t JOIN search_map m ON m.kind = '${kind}' AND m.ref_id = t.id;`);
  }

  const invoice = M020_SOURCES.find((source) => source.kind === "invoice");
  if (!invoice) throw new Error("Migration 20 lost its invoice source.");
  // An invoice's lines are part of its text, and they are written after it.
  parts.push(`
  CREATE TRIGGER search_invoice_line_insert AFTER INSERT ON invoice_lines BEGIN${m020Refresh(invoice, "NEW.invoice_id")}
  END;
  CREATE TRIGGER search_invoice_line_update AFTER UPDATE OF description ON invoice_lines BEGIN${m020Refresh(invoice, "NEW.invoice_id")}
  END;
  CREATE TRIGGER search_invoice_line_delete AFTER DELETE ON invoice_lines BEGIN${m020Refresh(invoice, "OLD.invoice_id")}
  END;`);

  return parts.join("\n");
}

const M020_BRAIN = `
  -- Who a contact is to the company. Deals shows prospects and customers.
  ALTER TABLE leads ADD COLUMN relationship TEXT NOT NULL DEFAULT 'prospect'
    CHECK (relationship IN ('prospect', 'customer', 'vendor', 'partner', 'advisor',
                            'investor', 'accountant', 'candidate'));
  UPDATE leads SET relationship = 'customer'
    WHERE stage_id IN (SELECT id FROM pipeline_stages WHERE kind = 'won');
  CREATE INDEX leads_relationship ON leads (company_id, relationship);

  CREATE TABLE brain_pages (
    id          TEXT PRIMARY KEY,
    company_id  TEXT NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
    section     TEXT NOT NULL CHECK (section IN (
                  'company', 'plan', 'products', 'money', 'tax', 'people', 'customers',
                  'playbooks', 'legal', 'tools', 'decisions', 'meetings', 'metrics',
                  'documents', 'ideas')),
    template    TEXT NOT NULL,
    title       TEXT NOT NULL,
    body        TEXT NOT NULL DEFAULT '',
    fields      TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(fields)),
    is_pinned   INTEGER NOT NULL DEFAULT 0 CHECK (is_pinned IN (0, 1)),
    is_archived INTEGER NOT NULL DEFAULT 0 CHECK (is_archived IN (0, 1)),
    -- Bumped on every save; an edit made on an older one is refused.
    revision    INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
  );

  CREATE INDEX brain_pages_section ON brain_pages (company_id, section, is_archived, updated_at DESC);
  CREATE INDEX brain_pages_recent  ON brain_pages (company_id, updated_at DESC);
  -- The pages a company has one of.
  CREATE UNIQUE INDEX brain_pages_single ON brain_pages (company_id, template)
    WHERE template IN ('profile', 'brand', 'lean-plan', 'cap-table', 'accountant');

  CREATE TABLE brain_revisions (
    id        TEXT PRIMARY KEY,
    page_id   TEXT NOT NULL REFERENCES brain_pages (id) ON DELETE CASCADE,
    revision  INTEGER NOT NULL,
    title     TEXT NOT NULL,
    body      TEXT NOT NULL,
    fields    TEXT NOT NULL,
    edited_at TEXT NOT NULL,
    -- Who wrote it, once there are two founders (phase 12).
    edited_by TEXT,
    UNIQUE (page_id, revision)
  );

  CREATE TABLE search_map (
    id         INTEGER PRIMARY KEY,
    kind       TEXT NOT NULL,
    ref_id     TEXT NOT NULL,
    company_id TEXT NOT NULL,
    UNIQUE (kind, ref_id)
  );

  CREATE INDEX search_map_company ON search_map (company_id);

  CREATE VIRTUAL TABLE brain_search USING fts5(
    title, body,
    tokenize = 'unicode61 remove_diacritics 2',
    prefix = '2 3'
  );

  -- Before the cascade, so the rows go while search_map can still find them.
  CREATE TRIGGER search_company_delete BEFORE DELETE ON companies BEGIN
    DELETE FROM brain_search
      WHERE rowid IN (SELECT id FROM search_map WHERE company_id = OLD.id);
    DELETE FROM search_map WHERE company_id = OLD.id;
  END;
${m020Triggers()}
`;

/**
 * Links between pages and contacts, and where the Map left its dots. See
 * PLAN.md, phase 7, and shared/links.ts for how a link is written.
 *
 * `brain_links` is derived: every save of a page replaces that page's rows
 * with what its text now links to. A link always starts on a page; it may end
 * on a page or a contact. The target has no foreign key because it can be
 * either, so a trigger on each removes the rows pointing at something
 * deleted - the words stay in the text that linked to it.
 */
const M021_LINKS = `
  CREATE TABLE brain_links (
    id         INTEGER PRIMARY KEY,
    company_id TEXT NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
    from_page  TEXT NOT NULL REFERENCES brain_pages (id) ON DELETE CASCADE,
    to_kind    TEXT NOT NULL CHECK (to_kind IN ('page', 'contact')),
    to_id      TEXT NOT NULL,
    -- The words the link was written with, for a target since deleted.
    label      TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (from_page, to_kind, to_id)
  );

  CREATE INDEX brain_links_to      ON brain_links (to_kind, to_id);
  CREATE INDEX brain_links_company ON brain_links (company_id);

  -- Where each dot was left, so the Map is the same map tomorrow.
  CREATE TABLE map_positions (
    company_id TEXT NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
    node       TEXT NOT NULL,
    x          REAL NOT NULL,
    y          REAL NOT NULL,
    pinned     INTEGER NOT NULL DEFAULT 0 CHECK (pinned IN (0, 1)),
    PRIMARY KEY (company_id, node)
  );

  CREATE TRIGGER links_page_gone AFTER DELETE ON brain_pages BEGIN
    DELETE FROM brain_links WHERE to_kind = 'page' AND to_id = OLD.id;
    DELETE FROM map_positions WHERE company_id = OLD.company_id AND node = 'page:' || OLD.id;
  END;

  CREATE TRIGGER links_contact_gone AFTER DELETE ON leads BEGIN
    DELETE FROM brain_links WHERE to_kind = 'contact' AND to_id = OLD.id;
    DELETE FROM map_positions WHERE company_id = OLD.company_id AND node = 'contact:' || OLD.id;
  END;
`;

/**
 * Deals apart from contacts (product-review.md, second review; PLAN.md).
 *
 * A contact used to be its own single deal: the stage and the value sat on
 * `leads`, so a school that bought twice could not be shown. Now a contact has
 * deals, the board shows deals, and a quote or an invoice belongs to one.
 *
 * Every contact that was on the board - a prospect or a customer - or that has
 * a quote or an invoice gets one deal carrying the stage, value, loss reason
 * and close date it had, named after it and dated when it was. Its quotes and
 * invoices point at that deal. Nothing moves on screen.
 *
 * The old columns on `leads` stay, unread: `stage_id` is a foreign key, and
 * dropping it would mean rebuilding the table everything else points at.
 */
const M022_DEALS = `
  CREATE TABLE deals (
    id          TEXT PRIMARY KEY,
    company_id  TEXT NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
    lead_id     TEXT NOT NULL REFERENCES leads (id) ON DELETE CASCADE,
    title       TEXT NOT NULL,
    stage_id    TEXT REFERENCES pipeline_stages (id) ON DELETE SET NULL,
    value       INTEGER CHECK (value IS NULL OR value >= 0),
    loss_reason TEXT,
    closed_at   TEXT,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
  );

  CREATE INDEX deals_lead  ON deals (lead_id, updated_at DESC);
  CREATE INDEX deals_stage ON deals (company_id, stage_id);

  INSERT INTO deals (id, company_id, lead_id, title, stage_id, value, loss_reason, closed_at,
                     created_at, updated_at)
  SELECT
    lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' ||
      substr(lower(hex(randomblob(2))), 2) || '-' ||
      substr('89ab', 1 + (abs(random()) % 4), 1) || substr(lower(hex(randomblob(2))), 2) || '-' ||
      lower(hex(randomblob(6))),
    l.company_id, l.id, l.name, l.stage_id, l.value, l.loss_reason, l.closed_at,
    l.created_at, l.updated_at
  FROM leads l
  WHERE l.relationship IN ('prospect', 'customer')
     OR EXISTS (SELECT 1 FROM quotes q WHERE q.lead_id = l.id)
     OR EXISTS (SELECT 1 FROM invoices i WHERE i.lead_id = l.id);

  ALTER TABLE quotes   ADD COLUMN deal_id TEXT REFERENCES deals (id) ON DELETE SET NULL;
  ALTER TABLE invoices ADD COLUMN deal_id TEXT REFERENCES deals (id) ON DELETE SET NULL;

  UPDATE quotes   SET deal_id = (SELECT d.id FROM deals d WHERE d.lead_id = quotes.lead_id);
  UPDATE invoices SET deal_id = (SELECT d.id FROM deals d WHERE d.lead_id = invoices.lead_id);

  CREATE INDEX quotes_deal   ON quotes (deal_id);
  CREATE INDEX invoices_deal ON invoices (deal_id);
`;

/**
 * Calls made from the prompter: how each went, how interested they were, the
 * script and the answers. The history keeps a readable line for each; this is
 * the part something can count.
 *
 * `interest` only exists for a call where somebody spoke, which the CHECK
 * holds as well as the input schema.
 */
const M023_CALLS = `
  CREATE TABLE calls (
    id          TEXT PRIMARY KEY,
    company_id  TEXT NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
    lead_id     TEXT NOT NULL REFERENCES leads (id) ON DELETE CASCADE,
    deal_id     TEXT REFERENCES deals (id) ON DELETE SET NULL,
    script_id   TEXT REFERENCES brain_pages (id) ON DELETE SET NULL,
    activity_id TEXT REFERENCES activities (id) ON DELETE SET NULL,
    outcome     TEXT NOT NULL
                CHECK (outcome IN ('no_answer', 'busy', 'voicemail', 'wrong_number', 'spoke')),
    interest    INTEGER
                CHECK (interest IS NULL OR (interest BETWEEN 1 AND 5 AND outcome = 'spoke')),
    notes       TEXT,
    answers     TEXT NOT NULL DEFAULT '[]',
    started_at  TEXT,
    seconds     INTEGER CHECK (seconds IS NULL OR seconds >= 0),
    created_at  TEXT NOT NULL
  );

  CREATE INDEX calls_lead    ON calls (lead_id, created_at DESC);
  CREATE INDEX calls_company ON calls (company_id, created_at DESC);
  CREATE INDEX calls_script  ON calls (script_id);
`;

/**
 * Runway: what is in the bank, typed with the day it was true, one row each
 * time so the figure can be seen changing. And a spend row that paid a
 * running cost says which, so the burn does not count that cost twice - once
 * as a running cost and again as spending.
 */
const M024_RUNWAY = `
  CREATE TABLE cash_balances (
    id         TEXT PRIMARY KEY,
    company_id TEXT NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
    amount     INTEGER NOT NULL,
    as_of      TEXT NOT NULL,
    note       TEXT,
    created_at TEXT NOT NULL
  );

  CREATE INDEX cash_balances_company ON cash_balances (company_id, as_of DESC, created_at DESC);

  ALTER TABLE spend ADD COLUMN cost_page_id TEXT REFERENCES brain_pages (id) ON DELETE SET NULL;
  CREATE INDEX spend_cost_page ON spend (cost_page_id);
`;

/**
 * Products and pricing (PLAN.md, phase 8).
 *
 * What a company sells was a page in the brain, which was right while it was
 * only prose and wrong the moment a quote line wanted to pick one: a price
 * has to be a number something can multiply, and a price that changed has to
 * be two rows rather than an edited sentence. So each product page becomes a
 * product, its text becomes the product's notes, its price becomes the first
 * row of its price book, and the page goes - its links and its search rows
 * with it, by the triggers migration 20 and 21 put there.
 *
 * `prices` is a book rather than a column because a price has a life: a tier,
 * a shape (once, monthly) and the days it applied. What was actually charged
 * is not here at all - that is on the invoice lines, which now say which
 * product they were, so the history is what happened rather than what was
 * meant to happen.
 */
const M025_PRODUCTS = `
  CREATE TABLE products (
    id         TEXT PRIMARY KEY,
    company_id TEXT NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    kind       TEXT NOT NULL DEFAULT 'service'
               CHECK (kind IN ('service', 'good', 'subscription')),
    -- What one of it is: a seat, a month, a workshop, an hour.
    unit       TEXT,
    status     TEXT NOT NULL DEFAULT 'live'
               CHECK (status IN ('idea', 'building', 'live', 'retired')),
    cost       INTEGER CHECK (cost IS NULL OR cost >= 0),
    tax_rate   REAL CHECK (tax_rate IS NULL OR (tax_rate >= 0 AND tax_rate <= 100)),
    -- HSN or SAC, for an Indian invoice.
    code       TEXT,
    notes      TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX products_company ON products (company_id, name COLLATE NOCASE);

  CREATE TABLE prices (
    id         TEXT PRIMARY KEY,
    company_id TEXT NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
    product_id TEXT NOT NULL REFERENCES products (id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    amount     INTEGER NOT NULL CHECK (amount >= 0),
    recurrence TEXT NOT NULL DEFAULT 'once'
               CHECK (recurrence IN ('once', 'monthly', 'quarterly', 'yearly')),
    valid_from TEXT,
    valid_to   TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX prices_product ON prices (product_id, valid_from DESC);

  INSERT INTO products (id, company_id, name, kind, unit, status, cost, tax_rate, code, notes,
                        created_at, updated_at)
  SELECT
    lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' ||
      substr(lower(hex(randomblob(2))), 2) || '-' ||
      substr('89ab', 1 + (abs(random()) % 4), 1) || substr(lower(hex(randomblob(2))), 2) || '-' ||
      lower(hex(randomblob(6))),
    p.company_id, p.title,
    CASE WHEN json_extract(p.fields, '$.billing') IN ('monthly', 'yearly') THEN 'subscription' ELSE 'service' END,
    json_extract(p.fields, '$.unit'),
    CASE json_extract(p.fields, '$.status')
      WHEN 'idea' THEN 'idea' WHEN 'building' THEN 'building' WHEN 'retired' THEN 'retired' ELSE 'live' END,
    CAST(json_extract(p.fields, '$.cost') AS INTEGER),
    json_extract(p.fields, '$.taxRate'),
    json_extract(p.fields, '$.hsn'),
    NULLIF(TRIM(p.body), ''),
    p.created_at, p.updated_at
  FROM brain_pages p
  WHERE p.template = 'product';

  INSERT INTO prices (id, company_id, product_id, name, amount, recurrence, valid_from,
                      created_at, updated_at)
  SELECT
    lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' ||
      substr(lower(hex(randomblob(2))), 2) || '-' ||
      substr('89ab', 1 + (abs(random()) % 4), 1) || substr(lower(hex(randomblob(2))), 2) || '-' ||
      lower(hex(randomblob(6))),
    r.company_id, r.id, 'Standard',
    CAST(json_extract(p.fields, '$.price') AS INTEGER),
    CASE json_extract(p.fields, '$.billing')
      WHEN 'monthly' THEN 'monthly' WHEN 'yearly' THEN 'yearly' ELSE 'once' END,
    substr(p.created_at, 1, 10),
    r.created_at, r.updated_at
  FROM brain_pages p
  JOIN products r ON r.company_id = p.company_id AND r.name = p.title
  WHERE p.template = 'product' AND json_extract(p.fields, '$.price') IS NOT NULL;

  DELETE FROM brain_pages WHERE template = 'product';

  ALTER TABLE quote_lines   ADD COLUMN product_id TEXT REFERENCES products (id) ON DELETE SET NULL;
  ALTER TABLE invoice_lines ADD COLUMN product_id TEXT REFERENCES products (id) ON DELETE SET NULL;

  CREATE INDEX quote_lines_product   ON quote_lines (product_id);
  CREATE INDEX invoice_lines_product ON invoice_lines (product_id);
`;

/**
 * Deadlines and documents (PLAN.md, phase 9).
 *
 * An obligation is something the company has to do by a date, again and
 * again: a GST return, advance tax, the annual filings. It is one row with a
 * rule, not a row per occurrence; `obligation_done` records each occurrence
 * that was done, keyed by the day it was due, which is also how "what was
 * filed for which period" is answered.
 *
 * `documents` replaces `attachments`. A file is no longer only something
 * hanging off a contact: a certificate, a contract, a pitch deck belong to the
 * company, may belong to a contact or a page as well, have a category, and
 * may expire. A document can also be only a record of where the file is, for
 * the ones that live in a drawer or somebody else's drive.
 *
 * Three moves come with it: every attachment becomes a document of its
 * contact, keeping its id and its stored file; every "document" page becomes
 * a document; and every "filing" page becomes a one-off obligation, done on
 * the day it says it was filed. The pages go, and their links and search rows
 * with them.
 */
const M026_DEADLINES = `
  CREATE TABLE documents (
    id         TEXT PRIMARY KEY,
    company_id TEXT NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    category   TEXT NOT NULL DEFAULT 'other'
               CHECK (category IN ('certificate', 'contract', 'agreement', 'invoice-sent',
                                   'invoice-received', 'statement', 'pitch-deck', 'identity', 'other')),
    -- The stored file's name in the app's folder, or NULL for one that is
    -- only written down with where it is.
    file       TEXT,
    bytes      INTEGER CHECK (bytes IS NULL OR bytes >= 0),
    location   TEXT,
    expires_on TEXT,
    -- A contact's files go with the contact, as attachments did.
    lead_id    TEXT REFERENCES leads (id) ON DELETE CASCADE,
    page_id    TEXT REFERENCES brain_pages (id) ON DELETE SET NULL,
    notes      TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX documents_company ON documents (company_id, category, name COLLATE NOCASE);
  CREATE INDEX documents_lead    ON documents (lead_id, created_at DESC);
  CREATE INDEX documents_expiry  ON documents (company_id, expires_on);

  CREATE TABLE obligations (
    id          TEXT PRIMARY KEY,
    company_id  TEXT NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
    title       TEXT NOT NULL,
    kind        TEXT NOT NULL DEFAULT 'filing'
                CHECK (kind IN ('filing', 'payment', 'renewal', 'other')),
    -- {"every": "once", "on"} | {"every": "month", "day"} | {"every": "year", "dates": [{month, day}]}
    rule        TEXT NOT NULL CHECK (json_valid(rule)),
    period      TEXT NOT NULL DEFAULT 'none'
                CHECK (period IN ('none', 'month-before', 'quarter-before', 'fy-before', 'year-before')),
    remind_days INTEGER NOT NULL DEFAULT 7 CHECK (remind_days BETWEEN 0 AND 90),
    amount      INTEGER CHECK (amount IS NULL OR amount >= 0),
    notes       TEXT,
    -- Which preset it came from, so a preset is never added twice.
    preset_id   TEXT,
    starts_on   TEXT NOT NULL,
    ends_on     TEXT,
    page_id     TEXT REFERENCES brain_pages (id) ON DELETE SET NULL,
    lead_id     TEXT REFERENCES leads (id) ON DELETE SET NULL,
    document_id TEXT REFERENCES documents (id) ON DELETE SET NULL,
    is_active   INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
  );

  CREATE INDEX obligations_company ON obligations (company_id, is_active);
  CREATE UNIQUE INDEX obligations_preset ON obligations (company_id, preset_id) WHERE preset_id IS NOT NULL;

  CREATE TABLE obligation_done (
    id            TEXT PRIMARY KEY,
    obligation_id TEXT NOT NULL REFERENCES obligations (id) ON DELETE CASCADE,
    due_on        TEXT NOT NULL,
    done_on       TEXT NOT NULL,
    note          TEXT,
    amount        INTEGER CHECK (amount IS NULL OR amount >= 0),
    created_at    TEXT NOT NULL,
    UNIQUE (obligation_id, due_on)
  );

  -- Attachments become their contact's documents, keeping id and file.
  INSERT INTO documents (id, company_id, name, category, file, bytes, lead_id, created_at, updated_at)
  SELECT id, company_id, name, 'other', file, bytes, lead_id, created_at, created_at FROM attachments;

  DROP TABLE attachments;

  -- A document page was a record of where a file is: a document without one.
  INSERT INTO documents (id, company_id, name, category, location, expires_on, notes, created_at, updated_at)
  SELECT p.id, p.company_id, p.title,
         CASE json_extract(p.fields, '$.category')
           WHEN 'certificate' THEN 'certificate' WHEN 'contract' THEN 'contract'
           WHEN 'agreement' THEN 'agreement' WHEN 'invoice-received' THEN 'invoice-received'
           WHEN 'pitch-deck' THEN 'pitch-deck' ELSE 'other' END,
         NULLIF(TRIM(json_extract(p.fields, '$.where')), ''),
         json_extract(p.fields, '$.expiresOn'),
         NULLIF(TRIM(p.body), ''),
         p.created_at, p.updated_at
  FROM brain_pages p
  WHERE p.template = 'document';

  -- A filing page was one occurrence of an obligation: once, done when filed.
  INSERT INTO obligations (id, company_id, title, kind, rule, period, notes, starts_on, created_at, updated_at)
  SELECT p.id, p.company_id, p.title, 'filing',
         json_object('every', 'once', 'on',
           COALESCE(json_extract(p.fields, '$.dueOn'), json_extract(p.fields, '$.filedOn'), substr(p.created_at, 1, 10))),
         'none',
         NULLIF(TRIM(
           COALESCE('For the period: ' || NULLIF(TRIM(json_extract(p.fields, '$.period')), ''), '') ||
           CASE WHEN TRIM(p.body) <> '' AND NULLIF(TRIM(json_extract(p.fields, '$.period')), '') IS NOT NULL
                THEN char(10) || char(10) ELSE '' END ||
           TRIM(p.body)), ''),
         COALESCE(json_extract(p.fields, '$.dueOn'), json_extract(p.fields, '$.filedOn'), substr(p.created_at, 1, 10)),
         p.created_at, p.updated_at
  FROM brain_pages p
  WHERE p.template = 'filing';

  INSERT INTO obligation_done (id, obligation_id, due_on, done_on, created_at)
  SELECT
    lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' ||
      substr(lower(hex(randomblob(2))), 2) || '-' ||
      substr('89ab', 1 + (abs(random()) % 4), 1) || substr(lower(hex(randomblob(2))), 2) || '-' ||
      lower(hex(randomblob(6))),
    p.id, json_extract(o.rule, '$.on'), json_extract(p.fields, '$.filedOn'), p.updated_at
  FROM brain_pages p
  JOIN obligations o ON o.id = p.id
  WHERE p.template = 'filing' AND json_extract(p.fields, '$.filedOn') IS NOT NULL;

  DELETE FROM brain_pages WHERE template IN ('document', 'filing');
`;

/**
 * People and hiring (PLAN.md, phase 10).
 *
 * `people` is everybody - founders, employees, interns, freelancers, advisors
 * and candidates - because a candidate who is hired becomes one of the others
 * without being written out twice. `openings` are the roles being hired for.
 * `tasks.person_id` ties the tasks onboarding makes to the person, so their
 * page can say how far along it is.
 *
 * Founder, teammate and open-role pages become rows, keeping their ids, and
 * go. People are searchable, by the same refresh-this-row triggers as the
 * rest of the index.
 *
 * FROZEN once released.
 */
const M027_PEOPLE = `
  CREATE TABLE openings (
    id         TEXT PRIMARY KEY,
    company_id TEXT NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
    title      TEXT NOT NULL,
    status     TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'paused', 'filled')),
    pay        TEXT,
    notes      TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX openings_company ON openings (company_id, status);

  CREATE TABLE people (
    id             TEXT PRIMARY KEY,
    company_id     TEXT NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
    name           TEXT NOT NULL,
    kind           TEXT NOT NULL
                   CHECK (kind IN ('founder', 'employee', 'intern', 'freelancer', 'advisor', 'candidate')),
    role           TEXT,
    email          TEXT,
    phone          TEXT,
    -- The contact they are, when they are one: a candidate who came in as a
    -- lead, an advisor who is also an investor.
    lead_id        TEXT REFERENCES leads (id) ON DELETE SET NULL,
    starts_on      TEXT,
    ends_on        TEXT,
    pay            INTEGER CHECK (pay IS NULL OR pay >= 0),
    pay_per        TEXT CHECK (pay_per IS NULL OR pay_per IN ('month', 'hour', 'day', 'project', 'year')),
    -- A percentage, vesting monthly from starts_on after the cliff.
    equity         REAL CHECK (equity IS NULL OR (equity >= 0 AND equity <= 100)),
    vesting_months INTEGER CHECK (vesting_months IS NULL OR vesting_months BETWEEN 1 AND 120),
    cliff_months   INTEGER CHECK (cliff_months IS NULL OR cliff_months BETWEEN 0 AND 60),
    owns           TEXT,
    opening_id     TEXT REFERENCES openings (id) ON DELETE SET NULL,
    stage          TEXT CHECK (stage IS NULL OR stage IN ('applied', 'talking', 'interview', 'offer', 'hired', 'declined')),
    onboarded_on   TEXT,
    notes          TEXT,
    created_at     TEXT NOT NULL,
    updated_at     TEXT NOT NULL
  );

  CREATE INDEX people_company ON people (company_id, kind);
  CREATE INDEX people_opening ON people (opening_id);

  ALTER TABLE tasks ADD COLUMN person_id TEXT REFERENCES people (id) ON DELETE SET NULL;
  CREATE INDEX tasks_person ON tasks (person_id);

  -- Founder pages: the role, what they own, equity, and the vesting sentence,
  -- which cannot be read as months and so goes to the notes.
  INSERT INTO people (id, company_id, name, kind, role, email, starts_on, equity, owns, notes, created_at, updated_at)
  SELECT p.id, p.company_id, p.title, 'founder',
         NULLIF(TRIM(json_extract(p.fields, '$.role')), ''),
         NULLIF(TRIM(json_extract(p.fields, '$.email')), ''),
         CASE WHEN json_extract(p.fields, '$.startedOn') GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
              THEN json_extract(p.fields, '$.startedOn') END,
         CASE WHEN json_type(p.fields, '$.equity') IN ('integer', 'real')
                   AND json_extract(p.fields, '$.equity') BETWEEN 0 AND 100
              THEN json_extract(p.fields, '$.equity') END,
         NULLIF(TRIM(json_extract(p.fields, '$.owns')), ''),
         NULLIF(TRIM(
           COALESCE('Vesting: ' || NULLIF(TRIM(json_extract(p.fields, '$.vesting')), '') || char(10) || char(10), '') ||
           TRIM(p.body, ' ' || char(9) || char(10) || char(13)),
           ' ' || char(9) || char(10) || char(13)), ''),
         p.created_at, p.updated_at
  FROM brain_pages p
  WHERE p.template = 'founder';

  -- Teammate pages: how they work here, the role, pay and dates.
  INSERT INTO people (id, company_id, name, kind, role, email, starts_on, ends_on, pay, pay_per, notes, created_at, updated_at)
  SELECT p.id, p.company_id, p.title,
         CASE json_extract(p.fields, '$.kind')
           WHEN 'intern' THEN 'intern' WHEN 'freelancer' THEN 'freelancer' WHEN 'advisor' THEN 'advisor'
           ELSE 'employee' END,
         NULLIF(TRIM(json_extract(p.fields, '$.role')), ''),
         NULLIF(TRIM(json_extract(p.fields, '$.email')), ''),
         CASE WHEN json_extract(p.fields, '$.startsOn') GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
              THEN json_extract(p.fields, '$.startsOn') END,
         CASE WHEN json_extract(p.fields, '$.endsOn') GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
              THEN json_extract(p.fields, '$.endsOn') END,
         CASE WHEN json_type(p.fields, '$.pay') IN ('integer', 'real') AND json_extract(p.fields, '$.pay') >= 0
              THEN CAST(ROUND(json_extract(p.fields, '$.pay')) AS INTEGER) END,
         CASE json_extract(p.fields, '$.payPer')
           WHEN 'month' THEN 'month' WHEN 'hour' THEN 'hour' WHEN 'project' THEN 'project' END,
         NULLIF(NULLIF(TRIM(p.body, ' ' || char(9) || char(10) || char(13)), ''), '## What we agreed'),
         p.created_at, p.updated_at
  FROM brain_pages p
  WHERE p.template = 'teammate';

  -- Open-role pages: the title, whether it is open, and the pay range.
  INSERT INTO openings (id, company_id, title, status, pay, notes, created_at, updated_at)
  SELECT p.id, p.company_id, p.title,
         CASE json_extract(p.fields, '$.status') WHEN 'paused' THEN 'paused' WHEN 'filled' THEN 'filled' ELSE 'open' END,
         NULLIF(TRIM(json_extract(p.fields, '$.pay')), ''),
         NULLIF(NULLIF(TRIM(p.body, ' ' || char(9) || char(10) || char(13)), ''),
                '## What they will do' || char(10) || char(10) || char(10) || '## Who we are looking for'),
         p.created_at, p.updated_at
  FROM brain_pages p
  WHERE p.template = 'opening';

  DELETE FROM brain_pages WHERE template IN ('founder', 'teammate', 'opening');

  -- Search: a person by name, with their role, contact details, what they
  -- own and their notes.
  CREATE TRIGGER search_person_insert AFTER INSERT ON people BEGIN
    INSERT INTO search_map (kind, ref_id, company_id) VALUES ('person', NEW.id, NEW.company_id);
    INSERT INTO brain_search (rowid, title, body)
      SELECT m.id, NEW.name, concat_ws(' ', NEW.role, NEW.email, NEW.phone, NEW.owns, NEW.notes)
      FROM search_map m WHERE m.kind = 'person' AND m.ref_id = NEW.id;
  END;
  CREATE TRIGGER search_person_update AFTER UPDATE OF name, role, email, phone, owns, notes ON people BEGIN
    DELETE FROM brain_search WHERE rowid = (SELECT id FROM search_map WHERE kind = 'person' AND ref_id = NEW.id);
    INSERT INTO brain_search (rowid, title, body)
      SELECT m.id, NEW.name, concat_ws(' ', NEW.role, NEW.email, NEW.phone, NEW.owns, NEW.notes)
      FROM search_map m WHERE m.kind = 'person' AND m.ref_id = NEW.id;
  END;
  CREATE TRIGGER search_person_delete AFTER DELETE ON people BEGIN
    DELETE FROM brain_search WHERE rowid = (SELECT id FROM search_map WHERE kind = 'person' AND ref_id = OLD.id);
    DELETE FROM search_map WHERE kind = 'person' AND ref_id = OLD.id;
  END;

  INSERT INTO search_map (kind, ref_id, company_id) SELECT 'person', id, company_id FROM people;
  INSERT INTO brain_search (rowid, title, body)
    SELECT m.id, t.name, concat_ws(' ', t.role, t.email, t.phone, t.owns, t.notes)
    FROM people t JOIN search_map m ON m.kind = 'person' AND m.ref_id = t.id;
`;

/**
 * Decisions, meetings and metrics (PLAN.md, phase 11).
 *
 * `tasks.page_id` and `tasks.source_step` say which page made a task and
 * from which step: a meeting's action item becomes a task once, and the page
 * can say which are done. `metrics` are the numbers the company watches -
 * worked out from what Caulder holds, or written down - and `metric_values`
 * the readings of the ones written down. Metric pages become metrics, their
 * "now" the first reading, and go.
 *
 * `metrics.source` is not checked here: the derived metrics are a list in
 * code, and adding one should not need a migration.
 *
 * FROZEN once released.
 */
const M028_METRICS = `
  ALTER TABLE tasks ADD COLUMN page_id TEXT REFERENCES brain_pages (id) ON DELETE SET NULL;
  ALTER TABLE tasks ADD COLUMN source_step TEXT;
  CREATE INDEX tasks_page ON tasks (page_id);

  CREATE TABLE metrics (
    id         TEXT PRIMARY KEY,
    company_id TEXT NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    kind       TEXT NOT NULL DEFAULT 'count' CHECK (kind IN ('count', 'money', 'percent')),
    unit_label TEXT,
    source     TEXT NOT NULL DEFAULT 'manual',
    target     REAL,
    direction  TEXT NOT NULL DEFAULT 'up' CHECK (direction IN ('up', 'down')),
    notes      TEXT,
    position   INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE INDEX metrics_company ON metrics (company_id, position);
  -- A derived metric once per company: two "Paid in" cards would be one number twice.
  CREATE UNIQUE INDEX metrics_source ON metrics (company_id, source) WHERE source <> 'manual';

  CREATE TABLE metric_values (
    id         TEXT PRIMARY KEY,
    metric_id  TEXT NOT NULL REFERENCES metrics (id) ON DELETE CASCADE,
    on_day     TEXT NOT NULL,
    value      REAL NOT NULL,
    note       TEXT,
    created_at TEXT NOT NULL,
    UNIQUE (metric_id, on_day)
  );

  -- Metric pages: what the unit said decides money, a percentage or a count.
  WITH m AS (
    SELECT p.*, TRIM(COALESCE(json_extract(p.fields, '$.unit'), '')) AS unit
      FROM brain_pages p WHERE p.template = 'metric'
  ), k AS (
    SELECT m.*,
           CASE
             WHEN m.unit LIKE '%₹%' OR m.unit LIKE '%$%' OR lower(m.unit) LIKE '%inr%'
                  OR lower(m.unit) LIKE '%rupee%' OR lower(m.unit) LIKE '%usd%' OR lower(m.unit) IN ('rs', 'rs.')
               THEN 'money'
             WHEN instr(m.unit, '%') > 0 OR lower(m.unit) LIKE '%percent%' THEN 'percent'
             ELSE 'count'
           END AS kind
      FROM m
  )
  INSERT INTO metrics (id, company_id, name, kind, unit_label, target, notes, created_at, updated_at)
  SELECT k.id, k.company_id, k.title, k.kind,
         CASE WHEN k.kind = 'count' THEN NULLIF(k.unit, '') END,
         CASE WHEN json_type(k.fields, '$.target') IN ('integer', 'real') THEN json_extract(k.fields, '$.target') END,
         NULLIF(NULLIF(TRIM(k.body, ' ' || char(9) || char(10) || char(13)), ''),
                '## Why it matters' || char(10) || char(10) || char(10) || '## How it is counted'),
         k.created_at, k.updated_at
    FROM k;

  INSERT INTO metric_values (id, metric_id, on_day, value, created_at)
  SELECT
    lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' ||
      substr(lower(hex(randomblob(2))), 2) || '-' ||
      substr('89ab', 1 + (abs(random()) % 4), 1) || substr(lower(hex(randomblob(2))), 2) || '-' ||
      lower(hex(randomblob(6))),
    p.id,
    CASE WHEN json_extract(p.fields, '$.asOf') GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
         THEN json_extract(p.fields, '$.asOf') ELSE substr(p.updated_at, 1, 10) END,
    json_extract(p.fields, '$.current'),
    p.updated_at
  FROM brain_pages p
  WHERE p.template = 'metric' AND json_type(p.fields, '$.current') IN ('integer', 'real');

  DELETE FROM brain_pages WHERE template = 'metric';
`;

/**
 * Two founders (PLAN.md, phase 12).
 *
 * A revision says who wrote it (`edited_by`, there since migration 20) and
 * whether it was written at the same time as another (`concurrent`). A page
 * says who wrote it last, and where it stands with the shared brain:
 * `sync_revision` is the shared log's revision it matches, `sync_dirty` that
 * it has changed here since. A company says which shared brain it is, where
 * in the log it has read to, and - encrypted by the OS, like the Google
 * connection - how to reach it.
 *
 * Marking a page to send is the database's job, by trigger, so no way of
 * changing a page can forget to: a change made here leaves `sync_revision`
 * alone and marks the page; a change arriving from the other founder moves
 * `sync_revision` in the same statement and does not. A shared page deleted
 * here leaves a tombstone, which is what tells the other side.
 *
 * FROZEN once released.
 */
const M029_SHARING = `
  ALTER TABLE brain_revisions ADD COLUMN concurrent INTEGER NOT NULL DEFAULT 0 CHECK (concurrent IN (0, 1));

  ALTER TABLE brain_pages ADD COLUMN updated_by TEXT;
  ALTER TABLE brain_pages ADD COLUMN sync_revision INTEGER;
  ALTER TABLE brain_pages ADD COLUMN sync_dirty INTEGER NOT NULL DEFAULT 0 CHECK (sync_dirty IN (0, 1));

  ALTER TABLE companies ADD COLUMN brain_key TEXT;
  ALTER TABLE companies ADD COLUMN brain_name TEXT;
  ALTER TABLE companies ADD COLUMN brain_role TEXT CHECK (brain_role IS NULL OR brain_role IN ('owner', 'member'));
  ALTER TABLE companies ADD COLUMN brain_connection TEXT;
  ALTER TABLE companies ADD COLUMN brain_cursor INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE companies ADD COLUMN brain_synced_at TEXT;
  ALTER TABLE companies ADD COLUMN brain_error TEXT;

  CREATE TABLE brain_tombstones (
    company_id    TEXT NOT NULL,
    page_id       TEXT NOT NULL,
    sync_revision INTEGER,
    deleted_at    TEXT NOT NULL,
    PRIMARY KEY (company_id, page_id)
  );

  CREATE TRIGGER brain_dirty_update
    AFTER UPDATE OF section, template, title, body, fields, is_archived ON brain_pages
    WHEN NEW.sync_revision IS OLD.sync_revision
  BEGIN
    UPDATE brain_pages SET sync_dirty = 1 WHERE id = NEW.id;
  END;

  CREATE TRIGGER brain_dirty_insert AFTER INSERT ON brain_pages
    WHEN NEW.sync_revision IS NULL
  BEGIN
    UPDATE brain_pages SET sync_dirty = 1 WHERE id = NEW.id;
  END;

  -- Only for a page the shared brain already has, and only while the company
  -- is still here: a company deleted takes its pages with it, and has no
  -- shared brain left to tell.
  CREATE TRIGGER brain_tombstone AFTER DELETE ON brain_pages
    WHEN OLD.sync_revision IS NOT NULL
     AND EXISTS (SELECT 1 FROM companies WHERE id = OLD.company_id AND brain_key IS NOT NULL)
  BEGIN
    INSERT OR REPLACE INTO brain_tombstones (company_id, page_id, sync_revision, deleted_at)
    VALUES (OLD.company_id, OLD.id, OLD.sync_revision, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
  END;

  CREATE TRIGGER brain_tombstones_company AFTER DELETE ON companies
  BEGIN
    DELETE FROM brain_tombstones WHERE company_id = OLD.id;
  END;
`;


/**
 * A life, not only a company (PLAN.md, part four, phase 14).
 *
 * The brain gains the founder's own sections - studies, hobbies, goals and a
 * journal - and `brain_pages.section` was a CHECK listing the fifteen
 * company ones. SQLite cannot alter a CHECK, so the table is rebuilt, and
 * rebuilt without one: a section is checked where every other enumeration
 * added since is, in shared/brain.ts, so this is the last time a new section
 * costs a rebuild.
 *
 * Seven tables point at `brain_pages` and three of them cascade, so the
 * rebuild runs with foreign keys off (SQLite's own twelve-step recipe; the
 * runner does it for a step marked so): dropping the old table must not take
 * every revision and link with it. Rows are copied wholesale, ids and all,
 * so every reference still lands. The table's indexes and triggers go with
 * it and are made again exactly as they were, beside two new rules:
 *
 *  - **One journal entry a day**, a unique index on the entry's day.
 *  - **Time set aside for a page** - a course's study hours, a hobby's
 *    evenings - is `page_id` on a repeat and on its blocks, cleared rather
 *    than deleted when the page goes: the hours happened either way.
 */
const M030_LIFE = `
  CREATE TABLE brain_pages_new (
    id            TEXT PRIMARY KEY,
    company_id    TEXT NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
    -- Checked in shared/brain.ts rather than here; see the note above.
    section       TEXT NOT NULL,
    template      TEXT NOT NULL,
    title         TEXT NOT NULL,
    body          TEXT NOT NULL DEFAULT '',
    fields        TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(fields)),
    is_pinned     INTEGER NOT NULL DEFAULT 0 CHECK (is_pinned IN (0, 1)),
    is_archived   INTEGER NOT NULL DEFAULT 0 CHECK (is_archived IN (0, 1)),
    revision      INTEGER NOT NULL DEFAULT 1,
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL,
    updated_by    TEXT,
    sync_revision INTEGER,
    sync_dirty    INTEGER NOT NULL DEFAULT 0 CHECK (sync_dirty IN (0, 1))
  );

  INSERT INTO brain_pages_new (
    id, company_id, section, template, title, body, fields, is_pinned, is_archived,
    revision, created_at, updated_at, updated_by, sync_revision, sync_dirty
  )
  SELECT
    id, company_id, section, template, title, body, fields, is_pinned, is_archived,
    revision, created_at, updated_at, updated_by, sync_revision, sync_dirty
  FROM brain_pages;

  DROP TABLE brain_pages;
  ALTER TABLE brain_pages_new RENAME TO brain_pages;

  CREATE INDEX brain_pages_section ON brain_pages (company_id, section, is_archived, updated_at DESC);
  CREATE INDEX brain_pages_recent  ON brain_pages (company_id, updated_at DESC);
  CREATE UNIQUE INDEX brain_pages_single ON brain_pages (company_id, template)
    WHERE template IN ('profile', 'brand', 'lean-plan', 'cap-table', 'accountant');
  CREATE UNIQUE INDEX brain_pages_journal_day ON brain_pages (company_id, json_extract(fields, '$.day'))
    WHERE template = 'entry';

  CREATE TRIGGER brain_dirty_update
    AFTER UPDATE OF section, template, title, body, fields, is_archived ON brain_pages
    WHEN NEW.sync_revision IS OLD.sync_revision
  BEGIN
    UPDATE brain_pages SET sync_dirty = 1 WHERE id = NEW.id;
  END;

  CREATE TRIGGER brain_dirty_insert AFTER INSERT ON brain_pages
    WHEN NEW.sync_revision IS NULL
  BEGIN
    UPDATE brain_pages SET sync_dirty = 1 WHERE id = NEW.id;
  END;

  CREATE TRIGGER brain_tombstone AFTER DELETE ON brain_pages
    WHEN OLD.sync_revision IS NOT NULL
     AND EXISTS (SELECT 1 FROM companies WHERE id = OLD.company_id AND brain_key IS NOT NULL)
  BEGIN
    INSERT OR REPLACE INTO brain_tombstones (company_id, page_id, sync_revision, deleted_at)
    VALUES (OLD.company_id, OLD.id, OLD.sync_revision, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
  END;

  CREATE TRIGGER links_page_gone AFTER DELETE ON brain_pages BEGIN
    DELETE FROM brain_links WHERE to_kind = 'page' AND to_id = OLD.id;
    DELETE FROM map_positions WHERE company_id = OLD.company_id AND node = 'page:' || OLD.id;
  END;

  CREATE TRIGGER search_page_delete AFTER DELETE ON brain_pages BEGIN
    DELETE FROM brain_search
      WHERE rowid = (SELECT id FROM search_map WHERE kind = 'page' AND ref_id = OLD.id);
    DELETE FROM search_map WHERE kind = 'page' AND ref_id = OLD.id;
  END;

  CREATE TRIGGER search_page_insert AFTER INSERT ON brain_pages BEGIN
    DELETE FROM brain_search
      WHERE rowid = (SELECT id FROM search_map WHERE kind = 'page' AND ref_id = NEW.id);
    DELETE FROM search_map WHERE kind = 'page' AND ref_id = NEW.id;
    INSERT INTO search_map (kind, ref_id, company_id)
      SELECT 'page', t.id, t.company_id FROM brain_pages t WHERE t.id = NEW.id AND (t.is_archived = 0);
    INSERT INTO brain_search (rowid, title, body)
      SELECT m.id, t.title, t.body || ' ' || COALESCE((SELECT group_concat(value, ' ') FROM json_each(t.fields)
             WHERE type IN ('text', 'integer', 'real')), '')
      FROM brain_pages t JOIN search_map m ON m.kind = 'page' AND m.ref_id = t.id
      WHERE t.id = NEW.id;
  END;

  CREATE TRIGGER search_page_update AFTER UPDATE OF title, body, fields, is_archived ON brain_pages BEGIN
    DELETE FROM brain_search
      WHERE rowid = (SELECT id FROM search_map WHERE kind = 'page' AND ref_id = NEW.id);
    DELETE FROM search_map WHERE kind = 'page' AND ref_id = NEW.id;
    INSERT INTO search_map (kind, ref_id, company_id)
      SELECT 'page', t.id, t.company_id FROM brain_pages t WHERE t.id = NEW.id AND (t.is_archived = 0);
    INSERT INTO brain_search (rowid, title, body)
      SELECT m.id, t.title, t.body || ' ' || COALESCE((SELECT group_concat(value, ' ') FROM json_each(t.fields)
             WHERE type IN ('text', 'integer', 'real')), '')
      FROM brain_pages t JOIN search_map m ON m.kind = 'page' AND m.ref_id = t.id
      WHERE t.id = NEW.id;
  END;

  ALTER TABLE block_series ADD COLUMN page_id TEXT REFERENCES brain_pages (id) ON DELETE SET NULL;
  ALTER TABLE blocks ADD COLUMN page_id TEXT REFERENCES brain_pages (id) ON DELETE SET NULL;
  CREATE INDEX blocks_page ON blocks (page_id, day) WHERE page_id IS NOT NULL;
`;


/**
 * Habits (PLAN.md, part four): the small things done most days - read,
 * exercise, no phone after ten - ticked on Today, with a streak. A habit is
 * its name, the area it belongs to and the days it is for; a tick is a day.
 * Nothing else is kept: the streak, the best run and the last twelve weeks
 * are worked out from the ticks when asked.
 *
 * Not `block_series.is_habit`, which was a repeat's hours counted by the
 * Review screen phase 1 removed: a habit here has no time of day, because
 * "read twenty pages" is done whenever it is done.
 */
const M031_HABITS = `
  CREATE TABLE habits (
    id          TEXT PRIMARY KEY,
    company_id  TEXT NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    area        TEXT,
    -- ISO weekday numbers it is for: '1,2,3,4,5,6,7' is every day.
    weekdays    TEXT NOT NULL DEFAULT '1,2,3,4,5,6,7',
    position    INTEGER NOT NULL DEFAULT 0,
    archived_at TEXT,
    created_at  TEXT NOT NULL
  );

  CREATE INDEX habits_company ON habits (company_id, archived_at, position);

  CREATE TABLE habit_checks (
    habit_id   TEXT NOT NULL REFERENCES habits (id) ON DELETE CASCADE,
    day        TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (habit_id, day)
  );
`;


/**
 * One connected brain (PLAN.md, part four, phase 16): a link written in a
 * page reaches a product, a person or a document, not only a page or a
 * contact. `brain_links.to_kind` was a CHECK of the two, so the table is
 * rebuilt without one - the kinds are checked in shared/links.ts - and every
 * link is copied across as it was. Nothing points at `brain_links`, so no
 * foreign keys need switching off; the two triggers that mention it are
 * dropped first and made again, and three more clear a link, and a dot's
 * place on the Map, when a product, a person or a document goes.
 */
const M032_LINKS = `
  DROP TRIGGER links_page_gone;
  DROP TRIGGER links_contact_gone;

  CREATE TABLE brain_links_new (
    id         INTEGER PRIMARY KEY,
    company_id TEXT NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
    from_page  TEXT NOT NULL REFERENCES brain_pages (id) ON DELETE CASCADE,
    -- page, contact, product, person or document: checked in shared/links.ts.
    to_kind    TEXT NOT NULL,
    to_id      TEXT NOT NULL,
    label      TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (from_page, to_kind, to_id)
  );

  INSERT INTO brain_links_new (id, company_id, from_page, to_kind, to_id, label, created_at)
    SELECT id, company_id, from_page, to_kind, to_id, label, created_at FROM brain_links;

  DROP TABLE brain_links;
  ALTER TABLE brain_links_new RENAME TO brain_links;

  CREATE INDEX brain_links_to      ON brain_links (to_kind, to_id);
  CREATE INDEX brain_links_company ON brain_links (company_id);

  CREATE TRIGGER links_page_gone AFTER DELETE ON brain_pages BEGIN
    DELETE FROM brain_links WHERE to_kind = 'page' AND to_id = OLD.id;
    DELETE FROM map_positions WHERE company_id = OLD.company_id AND node = 'page:' || OLD.id;
  END;

  CREATE TRIGGER links_contact_gone AFTER DELETE ON leads BEGIN
    DELETE FROM brain_links WHERE to_kind = 'contact' AND to_id = OLD.id;
    DELETE FROM map_positions WHERE company_id = OLD.company_id AND node = 'contact:' || OLD.id;
  END;

  CREATE TRIGGER links_product_gone AFTER DELETE ON products BEGIN
    DELETE FROM brain_links WHERE to_kind = 'product' AND to_id = OLD.id;
    DELETE FROM map_positions WHERE company_id = OLD.company_id AND node = 'product:' || OLD.id;
  END;

  CREATE TRIGGER links_person_gone AFTER DELETE ON people BEGIN
    DELETE FROM brain_links WHERE to_kind = 'person' AND to_id = OLD.id;
    DELETE FROM map_positions WHERE company_id = OLD.company_id AND node = 'person:' || OLD.id;
  END;

  CREATE TRIGGER links_document_gone AFTER DELETE ON documents BEGIN
    DELETE FROM brain_links WHERE to_kind = 'document' AND to_id = OLD.id;
    DELETE FROM map_positions WHERE company_id = OLD.company_id AND node = 'document:' || OLD.id;
  END;
`;

/**
 * Your life in check (PLAN.md, part four, phase 17): the vision board. A
 * picture is made smaller in the window and kept here, in the database,
 * so a backup carries it and nothing else on the disk needs finding. A goal
 * a tile is tied to can go; the tile stays, untied.
 */
const M033_VISION = `
  CREATE TABLE vision_tiles (
    id           TEXT PRIMARY KEY,
    company_id   TEXT NOT NULL REFERENCES companies (id) ON DELETE CASCADE,
    words        TEXT,
    picture      BLOB,
    picture_type TEXT CHECK (picture_type IS NULL OR picture_type IN ('image/webp', 'image/jpeg', 'image/png')),
    width        INTEGER,
    height       INTEGER,
    goal_id      TEXT REFERENCES brain_pages (id) ON DELETE SET NULL,
    area         TEXT,
    position     INTEGER NOT NULL,
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL,
    CHECK (words IS NOT NULL OR picture IS NOT NULL),
    CHECK ((picture IS NULL) = (picture_type IS NULL))
  );

  CREATE INDEX vision_tiles_company ON vision_tiles (company_id, position);
`;

/**
 * The journal's passcode (PLAN.md, after 0.3). A day that is over is sealed
 * with the journal's public key: its words move here as ciphertext and leave
 * the page, its earlier versions and the search index. Opening one needs the
 * passcode. Deleting the page takes its box with it.
 */
const M034_JOURNAL_LOCK = `
  CREATE TABLE journal_sealed (
    page_id   TEXT PRIMARY KEY REFERENCES brain_pages (id) ON DELETE CASCADE,
    box       TEXT NOT NULL,
    sealed_at TEXT NOT NULL
  );
`;

/**
 * Anywhere, not only India (after 0.3): a company says which country it is
 * in, as an ISO code, and its money, its phone numbers and its filing
 * calendar follow. Null for every company made before - they keep what they
 * had, and the filing calendar's old guess from the currency still holds
 * for them until a country is chosen.
 */
const M035_COUNTRY = `
  ALTER TABLE companies ADD COLUMN country TEXT;
`;

export const MIGRATIONS: readonly Migration[] = [
  { version: 1, name: "companies, stages, settings", sql: M001_COMPANIES },
  { version: 2, name: "leads, activities", sql: M002_LEADS },
  { version: 3, name: "import batches", sql: M003_IMPORTS },
  { version: 4, name: "tasks", sql: M004_TASKS },
  { version: 5, name: "email, sequences, sync", sql: M005_EMAIL },
  { version: 6, name: "bounced", sql: M006_BOUNCED },
  { version: 7, name: "company logo, loss reasons, goals", sql: M007_IDENTITY },
  { version: 8, name: "rules, attachments, views, custom fields", sql: M008_WORKBENCH },
  { version: 9, name: "workspace kinds, blocks, notes, focus", sql: M009_PERSONAL },
  { version: 10, name: "google calendar and tasks", sql: M010_GOOGLE },
  { version: 11, name: "repeating blocks", sql: M011_REPEATS },
  { version: 12, name: "priority, outcomes, terms", sql: M012_PRIORITY },
  { version: 13, name: "reminders", sql: M013_REMINDERS },
  { version: 14, name: "campaigns, spend, do-not-contact", sql: M014_MARKETING },
  { version: 15, name: "task areas, coffee accent", sql: M015_AREAS },
  { version: 16, name: "your words", sql: M016_WORDS },
  { version: 17, name: "money", sql: M017_MONEY },
  { version: 18, name: "the deletion pass", sql: M018_DELETION },
  { version: 19, name: "email through the script", sql: M019_EMAILS },
  { version: 20, name: "the brain", sql: M020_BRAIN },
  { version: 21, name: "links and the map", sql: M021_LINKS },
  { version: 22, name: "deals apart from contacts", sql: M022_DEALS },
  { version: 23, name: "calls", sql: M023_CALLS },
  { version: 24, name: "running costs and runway", sql: M024_RUNWAY },
  { version: 25, name: "products and pricing", sql: M025_PRODUCTS },
  { version: 26, name: "deadlines and documents", sql: M026_DEADLINES },
  { version: 27, name: "people and hiring", sql: M027_PEOPLE },
  { version: 28, name: "decisions, meetings and metrics", sql: M028_METRICS },
  { version: 29, name: "two founders", sql: M029_SHARING },
  { version: 30, name: "a life, not only a company", sql: M030_LIFE, rebuilds: true },
  { version: 31, name: "habits", sql: M031_HABITS },
  { version: 32, name: "links to everything", sql: M032_LINKS },
  { version: 33, name: "the vision board", sql: M033_VISION },
  { version: 34, name: "the journal's passcode", sql: M034_JOURNAL_LOCK },
  { version: 35, name: "a company's country", sql: M035_COUNTRY },
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

  // A newer build has already changed this file. Opening it here would mean
  // writing to tables this build does not know the shape of.
  if (from > LATEST_VERSION) {
    throw new Error(
      `This database was last opened by a newer version of Caulder (schema ${from}; this version knows up to ${LATEST_VERSION}). Install the newer version, or restore a backup made by this one.`,
    );
  }
  const pending = MIGRATIONS.filter((m) => m.version > from).sort(
    (a, b) => a.version - b.version,
  );

  const applied: string[] = [];

  for (const migration of pending) {
    // Foreign keys can only be switched outside a transaction, so this comes
    // before BEGIN and goes back to what it was whatever happens.
    const keys = db.pragma("foreign_keys", { simple: true });
    if (migration.rebuilds) db.pragma("foreign_keys = OFF");
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
    } finally {
      if (migration.rebuilds) db.pragma(`foreign_keys = ${keys === 1 ? "ON" : "OFF"}`);
    }
  }

  return { from, to: currentVersion(db), applied };
}

export const LATEST_VERSION = MIGRATIONS.reduce(
  (highest, m) => Math.max(highest, m.version),
  0,
);
