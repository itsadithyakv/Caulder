# Data model

One SQLite file, WAL mode, foreign keys on. Thirteen tables across five
forward-only migrations.

Every table that holds user data carries `company_id`, so a workspace is a
clean partition and deleting a company deletes its world. IDs are UUID text.
Timestamps are ISO-8601 UTC strings; due dates are `YYYY-MM-DD` calendar days.

## Migrations

| Version | Adds |
| --- | --- |
| 1 | `companies`, `pipeline_stages`, `settings` |
| 2 | `leads`, `activities` |
| 3 | `import_batches`, and `leads.import_batch_id` |
| 4 | `tasks` |
| 5 | `email_templates`, `email_messages`, `sequences`, `sequence_steps`, `enrollments`, `sync_batches` |

## companies

The workspace. `name`, `accent`, `timezone`, `is_archived`.

**`accent` is an id, not a hex.** Five choices, each contrast-checked in both
themes. A free colour picker cannot promise 4.5:1 against the canvas or under
white button text, and a hex in the database is a colour literal living outside
`tokens.css`.

Creating a company seeds its funnel in the same transaction — a workspace with
no stages cannot show a board, so the two are never allowed to exist apart.

Archiving is a flag, not a delete. Deleting a company would cascade to every
lead, task and message it owns.

## pipeline_stages

`company_id`, `name`, `position`, `kind`.

- `kind` is `open`, `won` or `lost`. **Won and lost are a property, not a
  name** — a company that calls its closed column something else still gets it
  excluded from the going-quiet list and stops its cadences.
- Names are unique per company, case-insensitively, so two "Contacted" columns
  cannot exist.
- `position` is contiguous from zero; it is renumbered after every change.

Default seed: New, Contacted, Interested, Meeting booked, Proposal sent, Won,
Lost.

## leads

The core record. Only `name` is `NOT NULL` — the source spreadsheet has rows
carrying nothing else, and refusing those would mean refusing most of the file.

`contact_person`, `email`, `phone`, `alt_phone`, `location`, `city`, `pin`,
`source`, `website`, `value`, `tags`, `notes`, `last_contacted_at`,
`stage_id`, `import_batch_id`.

- **`value` is an INTEGER** of whole currency units. Money in a float is a bug
  waiting to happen, and nobody tracks paise on a lead.
- **`stage_id` nulls rather than cascades.** Losing a column on the board must
  not lose the people in it; they appear in an Unstaged column instead.
- **`import_batch_id` nulls rather than cascades**, so deleting a batch row can
  never take leads with it. Undo is a deliberate act through the service.
- Blank form fields are stored as `NULL`, never `''`, so "unset" has exactly
  one representation.

Indexed on `(company_id, stage_id)`, `(company_id, name COLLATE NOCASE)` and
`(company_id, updated_at DESC)`.

## activities

The timeline. **Append-only**: rows are never updated, and are deleted only
when their lead goes or an import is undone. A correction is a new entry.

`lead_id`, `kind`, `body`, `occurred_at`, `meta`.

The `kind` vocabulary is complete from the start, even though early phases
wrote only some of it — SQLite cannot alter a `CHECK` constraint without
rebuilding the table, and rebuilding a table of history is not worth doing
later:

```
created  note  call  meeting  stage_change  field_change
email_queued  email_sent  email_opened  email_replied  email_failed
task_done  imported  import_undone
```

Ordered by `occurred_at DESC, created_at DESC, rowid DESC`. **The rowid matters**:
timestamps are millisecond-resolution and entries written in one transaction
routinely share a millisecond, so without it the history displays in an
arbitrary order.

## tasks

What drives Today. `lead_id` (**nullable** — "write the January mailshot" is
still work), `title`, `kind`, `status`, `due_on`, `notes`, `completed_at`.

- `kind` is `call`, `email`, `follow_up`, `meeting` or `todo`.
- `due_on` is a calendar day. See
  [architecture.md](architecture.md#dates-and-timezones).

Indexed on `(company_id, status, due_on)` and `(lead_id, status, due_on)`.

## import_batches

What makes undo possible. `filename`, `file_type`, `mapping` JSON, row counts,
`before_image` JSON, `undone_at`.

**`before_image` is the half that matters.** Deleting what a batch created is
easy; an import that merged into thirty existing leads is otherwise
unrecoverable, so the prior values of every updated lead are stored here.

## email_templates

`name` (unique per company, case-insensitively), `subject`, `body`. Bodies use
`{{lead.name}}`-style tokens — see [features.md](features.md#templates).

## email_messages

One row per email Caulder has queued.

**`message_id` is the join key for the whole bridge.** Caulder generates it,
Apps Script echoes it back untouched, and every status update matches on it.
It is `UNIQUE` — an echoed log row matching two messages is the one failure the
design exists to avoid. Nothing matches on address, subject or timestamp: all
three are ambiguous and all three can be edited by the person sending.

`to_email`, `subject`, `body`, `status`, `scheduled_for`, `attempt_count`,
`next_attempt_at`, `provider_message_id`, `thread_id`, `sent_at`, `opened_at`,
`replied_at`, `failure`, `enrollment_id`, `step_id`.

Status and its ladder are in [email-bridge.md](email-bridge.md#the-status-ladder).

## sequences, sequence_steps, enrollments

A cadence: "day 0 introduce, day 3 nudge, day 10 last try".

- `sequence_steps.offset_days` is the cadence primitive. It counts from the
  previous step **actually being sent**, not from enrolment.
- `enrollments` is `UNIQUE (sequence_id, lead_id)`. Re-enrolling restarts the
  same row rather than creating a second one, so running a cadence twice does
  not send two copies of every step.
- `stopped_for` records why: `replied`, `closed`, or `manual`.

## sync_batches

Every outbox written and every log read back, with `file_hash` — so importing
the same log twice is recognised and reported rather than silently reprocessed.

`direction` is `outbox` or `log`. Comparing the newest of each is how Today
knows an export has gone out with no log back.

## settings

A tiny key-value table, app-wide rather than per-company. Keys are constrained
in `shared/domain.ts`, so a typo becomes a type error rather than a silently
orphaned row: `activeCompanyId`, `syncFolder`, `coldAfterDays`.

## The cascade map

```
companies ─┬─ pipeline_stages ──(SET NULL)── leads.stage_id
           ├─ leads ─┬─ activities
           │         ├─ tasks
           │         └─ email_messages
           ├─ import_batches ──(SET NULL)── leads.import_batch_id
           ├─ email_templates ── sequence_steps
           ├─ sequences ─┬─ sequence_steps
           │             └─ enrollments
           └─ sync_batches
```

Two edges are `SET NULL` on purpose, and both are there so that tidying up
never loses a person.

## What the leads list reads that is not on a lead

The table's **Next step** column is the soonest open task per lead, read as a
correlated subquery in the same statement as the list itself. One query rather
than one per row: at a couple of thousand leads a per-row lookup is a couple of
thousand round trips, and the list is re-read on every keystroke of the search
box.

It is a separate type (`LeadListRow`) rather than a wider `Lead`, so nothing
that merely edits a lead has to invent a next step for it. Editing therefore
returns a `Lead` with no next step, and the screen merges rather than replaces
— an edit cannot change a lead's tasks, so the column it does not know about
must survive it.
