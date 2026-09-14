# Data model

One SQLite file, WAL mode, foreign keys on. Twenty-five tables across eighteen
forward-only migrations.

Every table that holds a workspace's data reaches `companies` by cascade, so a
workspace is a clean partition and deleting a company deletes its world. Most
carry `company_id` themselves; `custom_values`, `quote_lines` and
`invoice_lines` reach it through the rows they belong to. Two tables are app-wide
on purpose and carry no company at all: `settings` and `area_words`.

IDs are UUID text. Timestamps are ISO-8601 UTC strings; due dates are
`YYYY-MM-DD` calendar days, and times of day are `HH:MM` strings — nine o'clock
is nine o'clock, and an instant would move when the machine's timezone did.

## Migrations

| Version | Name | Adds |
| --- | --- | --- |
| 1 | companies, stages, settings | `companies`, `pipeline_stages`, `settings` |
| 2 | leads, activities | `leads`, `activities` |
| 3 | import batches | `import_batches`, `leads.import_batch_id` |
| 4 | tasks | `tasks` |
| 5 | email, sequences, sync | `email_templates`, `email_messages`, `sequences`, `sequence_steps`, `enrollments`, `sync_batches` |
| 6 | bounced | Rebuilds `email_messages` for a `bounced` status and `bounced_at`, and `activities` for `email_bounced` |
| 7 | company logo, loss reasons, goals | `companies.logo`, `goal_value`, `goal_period`; `leads.loss_reason`, `leads.closed_at` |
| 8 | rules, attachments, views, custom fields | `rules`, `attachments`, `saved_views`, `custom_fields`, `custom_values` |
| 9 | workspace kinds, blocks, notes, focus | `companies.kind`, `blocks`, `notes`, `focus_sessions`, `focus_blocklist`; backfills `leads.closed_at` |
| 10 | google calendar and tasks | `companies.google_calendar_id`, `google_tasklist_id`; `tasks.external_id`, `tasks.is_dirty`; `google_tombstones`, `google_sync` |
| 11 | repeating blocks | `block_series`, `blocks.series_id` |
| 12 | priority, outcomes, terms | `terms`; `blocks.priority`, `tasks.priority`, `blocks.outcome`; `block_series.is_habit`, `block_series.term_id` |
| 13 | reminders | `companies.remind_minutes`, `blocks.remind_minutes`, `blocks.reminded_at` |
| 14 | campaigns, spend, do-not-contact | `campaigns`, `campaign_spend`, `leads.campaign_id`, `leads.do_not_contact`, `companies.qualified_stage_id`, `companies.currency`, `email_templates.channel`, and a third `activities` rebuild for the `whatsapp` kind |
| 15 | task areas, coffee accent | `tasks.area`, backfilled from the workspace kind; personal workspaces still on the default blue move to coffee |
| 16 | your words | `area_words` |
| 17 | money | `quotes`, `quote_lines`, `invoices`, `invoice_lines`, `payments`, `spend` (with `campaign_spend` copied into it) |
| 18 | the deletion pass | drops `focus_sessions`, `focus_blocklist`, `rules`, `saved_views`, `enrollments`, `sequence_steps`, `sequences`, `email_messages`, `sync_batches`, `campaign_spend`; clears the widget and mail-provider settings |

Each migration is one transaction, gated on `PRAGMA user_version`, with a
backup taken before any of them runs. Additions use `ALTER TABLE ADD COLUMN`;
the three rebuilds (6 twice, 14 once) exist because SQLite cannot alter a
`CHECK`, and each copies every row across wholesale.

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

Columns added since, each nullable where "not set" means something different
from zero:

- **`kind`** — `solo` (the outreach workspace) or `personal` (a day, no
  funnel). `team` is reserved and deliberately absent from what the app can
  write: a value nothing can produce is a promise the schema cannot keep.
- **`logo`** — a small PNG data URL, downscaled in the window first. In the
  row rather than beside the database, so it travels with a backup.
- **`goal_value`, `goal_period`** — null is "no target", not a target of zero.
- **`remind_minutes`** — null is reminders **off** for this workspace, the
  master switch and the default; a number is how long before a block to say so.
- **`google_calendar_id`, `google_tasklist_id`** — per workspace, so two
  workspaces cannot pour into one calendar and adopt each other's items.
- **`qualified_stage_id`** and **`currency`** — see campaigns below.

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
- **`closed_at`** is written when a lead enters a won or lost stage and cleared
  when it leaves one. It says when a deal closed. It was added in
  migration 7 and nothing wrote it until 9, which backfilled it from the last
  move into a closed stage — `updated_at` had been standing in, and any call
  logged on a won deal bumps that, so every time-to-close read long.
- `loss_reason` is free text with a suggested list; `campaign_id` and
  `do_not_contact` are under campaigns below.

Indexed on `(company_id, stage_id)`, `(company_id, name COLLATE NOCASE)`,
`(company_id, updated_at DESC)` and `(company_id, campaign_id)`.

## activities

The timeline. **Append-only**: rows are never updated, and are deleted only
when their lead goes or an import is undone. A correction is a new entry.

`lead_id`, `kind`, `body`, `occurred_at`, `meta`.

The `kind` vocabulary was declared complete up front, because SQLite cannot
alter a `CHECK` without rebuilding the table. It did not stay complete: a
bounce (migration 6) and a WhatsApp message (14) each needed a kind, and each
cost a rebuild. Both copied every row across unchanged — the table is
append-only, so there is nothing to reconcile, only to move.

```
created  note  call  meeting  whatsapp  stage_change  field_change
email_queued  email_sent  email_opened  email_replied  email_failed
email_bounced  task_done  imported  import_undone
```

`whatsapp` counts as contact and moves `last_contacted_at`, like a call; a note
does not.

Ordered by `occurred_at DESC, created_at DESC, rowid DESC`. **The rowid matters**:
timestamps are millisecond-resolution and entries written in one transaction
routinely share a millisecond, so without it the history displays in an
arbitrary order.

## tasks

What drives Today. `lead_id` (**nullable** — "write the January mailshot" is
still work), `title`, `kind`, `status`, `due_on`, `notes`, `completed_at`.

- `kind` is `call`, `email`, `follow_up`, `meeting` or `todo` — the verb.
- **`area`** is which part of a life it belongs to — `college`, `company`,
  `personal`, `health` — kept apart from the verb. Free text underneath, so a
  fifth area never needs a rebuild. Migration 15 backfilled it from the only
  signal there was: a personal workspace's task was personal, an outreach
  one's was the company's.
- **`priority`** is `must`, `should` or `spare`; null reads as `should`.
  Caulder's alone — Google Tasks has no such field.
- `external_id` and `is_dirty` are the Google join key and the "changed here,
  not yet sent" flag. Unique per workspace where set.
- `due_on` is a calendar day. See
  [architecture.md](architecture.md#dates-and-timezones).

Indexed on `(company_id, status, due_on)`, `(lead_id, status, due_on)` and
`(company_id, area, status)`.

## import_batches

What makes undo possible. `filename`, `file_type`, `mapping` JSON, row counts,
`before_image` JSON, `undone_at`.

**`before_image` is the half that matters.** Deleting what a batch created is
easy; an import that merged into thirty existing leads is otherwise
unrecoverable, so the prior values of every updated lead are stored here.

## email_templates

`name` (unique per company, case-insensitively), `subject`, `body`, `channel`.
Bodies use `{{lead.name}}`-style tokens — see [features.md](features.md#templates).

`channel` is `email` or `whatsapp`. A WhatsApp template has no subject line,
and is offered by the WhatsApp button, never the email one.

## settings

A tiny key-value table, app-wide rather than per-company. Keys are constrained
in `SETTING_KEYS` in `shared/domain.ts`, so a typo becomes a type error rather
than a silently orphaned row: `activeCompanyId`, `coldAfterDays`, `followUpDays`,
`notify`, `defaulted`, `captureShortcut`, `keepInTray`, `trayNoticed`,
`googleConnection`, `googleAuto`.

**`googleConnection` is ciphertext.** The Google web-app URL and its key are a
bearer capability — anyone holding both can read and write that calendar — so
they are encrypted with the OS credential store before they are written, and
never handed back to the window.

**`captureShortcut` has three states, and two of them look alike.** Never set
means the default, Ctrl+Alt+A. Set to an empty string means deliberately off,
and stays off — telling those two apart is the whole reason the row is read
raw rather than as "a key or nothing". `keepInTray` is likewise yes until it
is set to `0`.

Anything that belongs to one workspace goes on its `companies` row or its own
table, never in here.

## area_words

The words the quick-add line has been taught — "Datascience" is College,
"Oakridge" is Company. `word`, `area`, `created_at`.

**No `company_id`**, deliberately — with `settings`, the only table that is
app-wide. A course name is a course name in whichever workspace it is typed,
and a per-workspace list would mean teaching every word twice to a person who
has two.

**`UNIQUE (word COLLATE NOCASE)`**, so "CS301" and "cs301" cannot both exist
and point in different directions — which one won would be down to the order
the rows came back in. The repository checks first so it can say where the
word already points; the index is there so anything else that writes here
meets the same rule. Spaces inside a phrase are collapsed on the way in, so two
spacings of one phrase are one row.

`area` is one of the four task areas, checked at the bridge rather than by a
CHECK, for the reason `channel` is free text: a fifth area should not need a
table rebuild. Not in the CSV export — it is not per-workspace — but in the
`caulder.db` copy that ships beside it, and in every backup.

## campaigns

A label table. Campaigns were once a report of their own (migration 14); the
report, its verdicts and its spend ledger went in migration 18, and what
remains is the name a lead or a spend line can carry. Nothing creates one
from the interface any more, and the rows that exist keep their names on the
Money screen's spend list. Both references to it are `SET NULL`.

## quotes, quote_lines, invoices, invoice_lines, payments, spend

Money, at bare bones: the four numbers a month a founder needs and nothing an
accountant would recognise. See PLAN.md, phase 3.

- **Lines are rows, not JSON.** A total is a sum over lines, and a sum the
  database can compute is one the export can carry.
- **Money is whole units of the workspace's currency**, an INTEGER, the same
  rule as `leads.value`. Quantities are REAL, because half a day is a real
  quantity.
- **Numbers are per company**, `MAX + 1` inside the insert's transaction, with
  `UNIQUE (company_id, number)` behind it. A number is never reused.
- **Paid is derived from `payments`, never typed.** An invoice is paid when
  the payments cover the total and stops being paid if one is removed;
  `paid_on` follows. "Mark paid" records a payment for the remainder.
- **Overdue is not a status.** It is a sent invoice past `due_on`, worked out
  when read, so nothing runs at midnight and nothing goes stale.
- **A quote cascades to its lines; an invoice does not cascade to its quote.**
  `invoices.quote_id` is `SET NULL`: the money is owed whatever happened to
  the paperwork.
- **`spend.campaign_id` is optional**, because most of what a founder spends
  is not a campaign. Migration 17 copies `campaign_spend` across so the
  ledger is complete, and migration 18 drops the old table.

## leads.do_not_contact

One flag, enforced where the reaching-out happens rather than hidden in the UI:
`openMail` and `openWhatsApp` in `services/outreach.ts` both refuse a contact
marked with it, whatever the screen shows. A flag only the screen respects is
not a flag.

## attachments, custom_fields, custom_values

The two things on a lead that Caulder did not decide: the files attached to
it and the fields invented for it.

- **`attachments`** stores the file under a generated name with the real one
  in the row, so two files called `proposal.pdf` are two files. An invoice
  PDF lands here too.
- **`custom_fields`** are per company, `UNIQUE (company_id, name)`.
  `custom_values` is one answer per lead per field, and **deleting a field
  cascades to its values**: a field nobody can see is not a field, and
  leaving the answers behind would mean re-adding the same name silently
  brings old ones back.

## blocks

Part of a day. A task is **due on** a day; a block **occupies** some of one,
so it has a clock and a length a task has never had.

`day`, `starts_at` (`HH:MM`), `minutes` (`CHECK > 0`), `title`, `kind`,
`notes`, `priority`, `outcome`, `remind_minutes`, `reminded_at`, `task_id`,
`series_id`, and the Google columns `source`, `external_id`, `etag`,
`is_dirty`.

- **`kind` and `priority` are free text**, not `CHECK`s — the first invented
  kind would otherwise force a rebuild. Null priority means "whatever this
  kind of block usually is", so nobody sets it twice a day.
- **`outcome` is null, `skipped` or `moved`, and a null in the past counts as
  kept.** Nothing to tick — and the cost of that is admitted on the Review
  screen in words: the record flatters you unless you mark what did not
  happen.
- **`remind_minutes`** — null follows the workspace, a number overrides it for
  this block, `-1` is never. One field rather than two, because "follow the
  default" and "specifically not" are answers to one question.
  **`reminded_at`** is written so a restart does not repeat a reminder, and
  cleared on every move, because the reminder given was about a time that is
  no longer when this happens.
- **`source`** says which side owns it: `caulder` blocks are ours to push,
  `google` ones mirror an event. Ownership, not timestamps, settles a conflict.
  `(company_id, external_id)` is unique where set, which is what makes a
  repeated sync update rather than duplicate.
- `task_id` nulls rather than cascades: deleting the task leaves the hour you
  set aside standing.

## block_series, terms

Most of a student's week is the same week again. **Occurrences are written as
ordinary blocks**, not computed when read, so moving one Tuesday is editing a
block and the Google sync needs no idea repeats exist.

- `block_series` — `title`, `kind`, `starts_at`, `minutes`, `weekdays` (ISO
  numbers, `'1,3,5'`), `from_day`, `until_day`, `is_habit`, `term_id`. Only a
  habit is counted for a streak, and streaks count scheduled occurrences, not
  calendar days.
- `terms` — `name`, `from_day`, `until_day`. A new semester is one action.
- **`blocks.series_id` and `block_series.term_id` both null rather than
  cascade.** Ending a repeat clears the future and leaves the past; ending a
  term does not delete the timetable it held. Last semester happened.

## notes

A thought caught before it goes: `body`, `day`, `is_pinned`. **Not an
activity**, because `activities.lead_id` is `NOT NULL` and the point of a quick
note is that it belongs to nothing yet.

## google_tombstones, google_sync

- **`google_tombstones`** — what was deleted here and not yet in Google. Once
  a block's row is gone nothing else is left to say its event should go too.
  A tombstone is dropped only after Google has been told, never before.
- **`google_sync`** — one row per workspace: what the last sync did, and
  **over what range**. Absence from Google's answer means "deleted" only
  inside the window actually asked about, and `synced_from`/`synced_to` are
  where that window is remembered. Without it, one narrow query wipes
  history.

The connection itself is not in either table — see `googleConnection` under
settings.

## The cascade map

```
companies ─┬─ pipeline_stages ─┬─(SET NULL)── leads.stage_id
           │                   └─(SET NULL)── companies.qualified_stage_id
           ├─ leads ─┬─ activities
           │         ├─ tasks ──(SET NULL)── blocks.task_id
           │         ├─ attachments
           │         ├─ custom_values
           │         ├─ quotes ─┬─ quote_lines
           │         │          └─(SET NULL)── invoices.quote_id
           │         └─ invoices ─┬─ invoice_lines
           │                      └─ payments
           ├─ import_batches ──(SET NULL)── leads.import_batch_id
           ├─ campaigns ─┬─(SET NULL)── spend.campaign_id
           │             └─(SET NULL)── leads.campaign_id
           ├─ spend, payments (also by company_id)
           ├─ email_templates
           ├─ custom_fields ── custom_values
           ├─ blocks
           ├─ block_series ──(SET NULL)── blocks.series_id
           ├─ terms ──(SET NULL)── block_series.term_id
           ├─ notes
           └─ google_tombstones, google_sync

settings, area_words      app-wide; no company
```

Seven edges are `SET NULL` on purpose, so that tidying up never loses
something that happened. On the selling side it is people and money: losing a
column, a campaign or an import batch must not delete the leads in it, and
deleting a quote must not delete the invoice that was raised from it - the
money is owed whatever the paperwork did. On the day side it is history:
deleting a task leaves its hour, and ending a repeat or a term leaves the
blocks already lived. `companies.qualified_stage_id` just goes back to "not
set" when its stage is deleted.

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
