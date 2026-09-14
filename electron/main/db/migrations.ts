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
