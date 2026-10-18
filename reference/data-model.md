# Data model

One SQLite file, WAL mode, foreign keys on. Twenty-five tables across eighteen
forward-only migrations.

Every table that holds a workspace's data reaches `companies` by cascade, so a
workspace is a clean partition and deleting a company deletes its world. Most
carry `company_id` themselves; `custom_values`, `quote_lines` and
`invoice_lines` reach it through the rows they belong to. Two tables are app-wide
on purpose and carry no company at all: `settings`, `area_words` and `line_guesses`.

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
| 19 | email through the script | `emails` |
| 20 | the brain | `brain_pages`, `brain_revisions`, `search_map`, `brain_search` and the triggers that fill it; `leads.relationship` |
| 21 | links and the map | `brain_links`, `map_positions`, and the triggers that clear both when a page or a contact is deleted |
| 22 | deals apart from contacts | `deals`, with one deal per contact you sell to (or who has money on them) copied from the contact; `quotes.deal_id`, `invoices.deal_id` |
| 23 | calls | `calls` |
| 24 | running costs and runway | `cash_balances`, `spend.cost_page_id` |
| 25 | products and pricing | `products`, `prices`, `quote_lines.product_id`, `invoice_lines.product_id`; turns every `product` brain page into a product with its price and takes the page away |
| 26 | deadlines and documents | `documents`, `obligations`, `obligation_done`; moves `attachments` into `documents` and drops it; turns every `document` page into a document and every `filing` page into a one-off obligation, done if it was filed, and takes the pages away |
| 27 | people and hiring | `people`, `openings`, `tasks.person_id`, and search triggers for people; turns every `founder`, `teammate` and `opening` page into a person or a role and takes the pages away |
| 28 | decisions, meetings and metrics | `metrics`, `metric_values`, `tasks.page_id`, `tasks.source_step`; turns every `metric` page into a metric with its number as the first reading, and takes the pages away |
| 29 | two founders | `brain_tombstones`; `brain_revisions.concurrent`; `brain_pages.updated_by`, `sync_revision`, `sync_dirty`; `companies.brain_key`, `brain_name`, `brain_role`, `brain_connection`, `brain_cursor`, `brain_synced_at`, `brain_error`; the triggers that mark a page to send and leave a tombstone when a shared page is deleted |
| 30 | a life, not only a company | `brain_pages` rebuilt without the section `CHECK`, run with foreign keys off; one journal entry a day (`brain_pages_journal_day`); `blocks.page_id`, `block_series.page_id` |
| 31 | habits | `habits`, `habit_checks` |
| 32 | links to everything | `brain_links` rebuilt without the `to_kind` `CHECK`; links and map places cleared when a product, a person or a document is deleted |
| 33 | the vision board | `vision_tiles` |
| 34 | the journal's passcode | `journal_sealed` |
| 35 | a company's country | `companies.country` |
| 36 | tune | `line_guesses` |
| 37 | contacts to google | `leads.google_contact` |
| 38 | goals and your week | `goal_checkins`, `day_themes` |
| 39 | private lines | `journal_private` |
| 40 | what was measured, and the shelf | `hobby_logs`, `shelf_books` |
| 41 | book covers | `shelf_books.cover` |
| 42 | what a quiet day was | `day_checkins` |
| 43 | lessons, and other mail accounts | `line_lessons`, `mail_accounts`, `emails.account_id` |
| 44 | reminders | `reminders` |
| 45 | search forgets what it is told to | `brain_search` set to `secure-delete`, and optimised |
| 46 | understanding, on this machine | `vectors`, `embed_queue`, and the triggers that fill the queue |
| 47 | said again | `said_again` |
| 48 | where a contact is found | `leads.linkedin`, `leads.instagram`, `emails.template_id`; `activities` rebuilt without the `kind` `CHECK`, run with foreign keys off, and its three search triggers made again |
| 49 | the company's, and nothing else's | drops `journal_private`, `journal_sealed`, `habits`, `habit_checks`, `hobby_logs`, `shelf_books`, `vision_tiles`, `day_checkins`, `day_themes`, `goal_checkins` and `brain_tombstones`, with the two tombstone triggers; deletes every page in the sections that were personal and every page in the calendar's own workspace; clears the settings that belonged to them and the `brain_*` columns on a company |
| 50 | contacts as a google sheet | `sheet_links`, `sheet_rows` |
| 51 | replies from other mail accounts | `mail_accounts.imap_host`, `imap_port`, `imap_checked_at`, `imap_error`; `emails.message_id` |
| 52 | one person, and no people | drops the `search_person_*` and `links_person_gone` triggers; deletes people from `brain_search`, `search_map`, `brain_links` and `map_positions`; pages filed under `people` move to `company`. **`people` and `openings` are left in place and unread** |
| 53 | a working day's blocks, and what a contact is there | `leads.contact_role`; `blocks.kind` and `block_series.kind` of `class`, `study`, `break` or `personal` become `away`. Nothing dropped: **`tasks.area`, `area_words`, `terms`, `block_series.term_id`, `line_lessons.area` and the `name` rows of `line_guesses` are left in place and unread** |
| 54 | an invoice that repeats | `invoices.repeats` (`monthly`, `quarterly`, `yearly` or null): a retainer |
| 55 | a task that comes back, and every other week | `tasks.repeats` (`fortnightly`, `monthly`, `yearly` or null); `block_series.every_weeks` (1 or 2) |
| 56 | who a word means | `line_names` |
| 57 | what stays true about a contact | `lead_facts` |
| 58 | the week's three things | `week_things` |

Each migration is one transaction, gated on `PRAGMA user_version`, with a
backup taken before any of them runs. Additions use `ALTER TABLE ADD COLUMN`;
the four rebuilds (6 twice, 14 once, 30 once) exist because SQLite cannot alter
a `CHECK`, and each copies every row across wholesale. A step that rebuilds a
table others point at is marked `rebuilds` and runs with foreign keys off -
SQLite's own twelve-step recipe - because dropping the old table would
otherwise cascade into every row that refers to it; the runner switches them
back to what they were however the step ends.

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

**`country` is where it is** (migration 35), an ISO 3166 code, null for a
company made before countries. It decides the currency a new company starts
on, the calling code a bare phone number is dialled with, and whether the
filing calendar offers India's filings or the generic set. A company with no
country is treated as India when its currency is INR or its timezone is
India's - all Caulder assumed before - and as nowhere in particular
otherwise. `currency` is any ISO 4217 code, not a short list.

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

`contact_person`, `contact_role`, `email`, `phone`, `alt_phone`, `location`,
`city`, `pin`, `source`, `website`, `linkedin`, `instagram`, `tags`, `notes`,
`last_contacted_at`, `import_batch_id`.

- **`contact_role`** (migration 53) is what the contact person is there -
  "Owner", "Head of marketing". Set on the form, and by the quick line when
  somebody new is told about with what they are.
- **`alt_phone`, `location` and `pin`** came from the first customer's
  spreadsheet. They are kept, imported and shown on a contact that has them,
  and are no longer on the form.

- **`linkedin` and `instagram`** (migration 48) are where a contact is found
  when it is not by email or phone. Each holds one address in full -
  `https://www.linkedin.com/in/priya-nair`, `https://www.instagram.com/priya.nair`
  - whatever was typed, because `shared/profiles.ts` cleans it on the way in
  and refuses what is not a profile on that site. Main builds the address it
  opens from the row with the same functions, so the window never hands it
  one. Neither is in the search index.

- **`stage_id`, `value`, `loss_reason` and `closed_at` are no longer read.**
  They moved to `deals` in migration 22 and stay on the table only because
  dropping a column that carries a foreign key means rebuilding the table.
  Nothing writes them; a contact's stage and value are its main deal's (see
  deals below).
- **`import_batch_id` nulls rather than cascades**, so deleting a batch row can
  never take leads with it. Undo is a deliberate act through the service.
- Blank form fields are stored as `NULL`, never `''`, so "unset" has exactly
  one representation.
- `campaign_id` and `do_not_contact` are under campaigns below.
- **`relationship`** says who the contact is to the company: `prospect` (the
  default), `customer`, `vendor`, `partner`, `advisor`, `investor`,
  `accountant` or `candidate`. A new prospect or customer starts with a deal;
  anybody else starts without one - an accountant is somebody you know, not a
  sale - though any contact can be given a deal. Migration 20 made every
  contact in a won stage a customer, and winning a prospect's deal still does;
  nothing ever turns a customer back.

Indexed on `(company_id, stage_id)`, `(company_id, name COLLATE NOCASE)`,
`(company_id, updated_at DESC)`, `(company_id, campaign_id)` and
`(company_id, relationship)`.

## deals

What is being sold, to whom. A contact can have several - a school that buys
a second campus, a renewal - and each has its own stage and value, and its
own card on Deals.

`company_id`, `lead_id`, `title`, `stage_id`, `value`, `loss_reason`,
`closed_at`, `created_at`, `updated_at`.

- **`lead_id` cascades.** A deal is not anything without its contact.
- **`stage_id` nulls rather than cascades.** Losing a column on the board must
  not lose the deals in it; they appear in an Unstaged column instead.
- **`value` is an INTEGER** of whole currency units, `CHECK >= 0`. Money in a
  float is a bug waiting to happen, and nobody tracks paise on a deal.
- **`closed_at`** is written when a deal enters a won or lost stage and
  cleared when it leaves one. On `leads` it was added in migration 7 and
  nothing wrote it until 9, which backfilled it from the last move into a
  closed stage - `updated_at` had been standing in, and any call logged on a
  won deal bumps that, so every time-to-close read long.
- `loss_reason` is free text with a suggested list.
- **The main deal** is how a contact is summed up in one line: its open deal
  touched last, or failing any open one, the deal touched last. The contacts
  list shows, sorts and filters by it, Going quiet reads it, and editing the
  stage or value of a contact with one deal edits that deal. The rule is one
  SQL fragment, `MAIN_DEAL` in `repositories/main-deal.ts`, used everywhere it
  is needed rather than stored, so nothing can fall out of step with it.
- **A move is written on the contact's history**, as `stage_change` with the
  deal's id in `meta`. The body is the stage's name, or "Deal: Stage" when the
  contact has several deals or the deal is not named after them.
- **Migration 22** gave each contact that was a prospect or a customer, or that
  had a quote or an invoice, one deal carrying its old stage, value, loss
  reason and close date, named after the contact. Its quotes and invoices
  went on that deal.

Indexed on `(lead_id, updated_at DESC)` and `(company_id, stage_id)`.

## calls

A call made from the prompter: how it went, and what was learnt. The history
gets a readable line for each (an `activities` row of kind `call`, pointed at
by `activity_id`); this table is the part something can count.

`lead_id`, `deal_id`, `script_id`, `activity_id`, `outcome`, `interest`,
`notes`, `answers`, `started_at`, `seconds`, `created_at`.

- **`outcome`** is `no_answer`, `busy`, `voicemail`, `wrong_number` or
  `spoke`. Only `spoke` moves the contact's `last_contacted_at`: a missed call
  is an attempt, and counting it would take a contact off *Going quiet* for
  ringing once.
- **`interest`** is 1 to 5, from *not interested* to *keen*, and only exists
  for a call where somebody spoke - the `CHECK` holds that as well as the
  input schema.
- **`answers`** is JSON, `[{question, answer}]`, the boxes beside the
  script's questions that were filled in.
- **`deal_id`, `script_id` and `activity_id` are `SET NULL`.** Deleting a deal
  or a script leaves the call; the contact going takes it.
- **A call script is a `brain_pages` row** with template `call-script`, in
  How we work (the section `playbooks`); its `tone` and `caller` are fields, its parts are headings in
  the text. See `shared/calls.ts`.
- Logging a call is one transaction with everything it implies: the call, its
  history line, the contact's notes when they were edited, the task it came
  from ticked, the next task, and the deal moved (with no follow-up of the
  move's own, since the next step was just asked for).

Indexed on `(lead_id, created_at DESC)`, `(company_id, created_at DESC)` and
`(script_id)`.

## activities

The timeline. **Append-only**: rows are never updated, and are deleted only
when their lead goes or an import is undone. A correction is a new entry.

`lead_id`, `kind`, `body`, `occurred_at`, `meta`.

The `kind` vocabulary was declared complete up front, as a `CHECK`, because
SQLite cannot alter one without rebuilding the table. It did not stay
complete: a bounce (migration 6), a WhatsApp message (14) and then LinkedIn
and Instagram (48) each needed a kind, and each cost a rebuild. The last of
those took the `CHECK` off, so the next kind is a line of TypeScript
(`ACTIVITY_KINDS` in `shared/domain.ts`) like every other enum here. Each
rebuild copied every row across unchanged, ids and all — the table is
append-only, so there is nothing to reconcile, only to move — and migration
48 made the table's three search triggers again, since dropping a table
takes its triggers with it. **`replied`** (phase 33) is the first kind added
since: "They answered", put on by hand for a reply somewhere Caulder cannot
read, and it needed no migration.

```
created  note  call  meeting  whatsapp  linkedin  instagram  stage_change
field_change  email_queued  email_sent  email_opened  email_replied
email_failed  email_bounced  task_done  imported  import_undone  replied
```

`whatsapp`, `linkedin` and `instagram` count as contact and move
`last_contacted_at`, like a call; a note does not.

Ordered by `occurred_at DESC, created_at DESC, rowid DESC`. **The rowid matters**:
timestamps are millisecond-resolution and entries written in one transaction
routinely share a millisecond, so without it the history displays in an
arbitrary order.

## tasks

What drives Today. `lead_id` (**nullable** — "write the January mailshot" is
still work), `title`, `kind`, `status`, `due_on`, `notes`, `completed_at`.

- `kind` is `call`, `email`, `follow_up`, `meeting` or `todo` — the verb.
- **`area`** is no longer read or written (PLAN.md, phase 32). It said
  which part of a life a task belonged to - `college`, `company`, `personal`,
  `health` - and a company's task is the company's. The column and its index
  stay, because migrations are not edited; a task made since has null there.
- **`priority`** is `must`, `should` or `spare`; null reads as `should`.
  Caulder's alone — Google Tasks has no such field.
- `external_id` and `is_dirty` are the Google join key and the "changed here,
  not yet sent" flag. Unique per workspace where set.
- `due_on` is a calendar day. See
  [architecture.md](architecture.md#dates-and-timezones).
- **`repeats`** (migration 55) is `fortnightly`, `monthly` or `yearly`, or
  null: a task that comes back - rent on the 1st, a birthday. Ticking it off
  makes the next one, due a fortnight, a month or a year on (the same day of
  the month, or its last day when the month is shorter), with its title,
  kind, contact, priority and notes, and - when it had an hour on the
  Calendar - the same hour on the new day. Only one is ever open: the next is
  not made when an open one of the same title and repeat is already due then.
  A week's days are not a task's repeat; they are a block series.

Indexed on `(company_id, status, due_on)`, `(lead_id, status, due_on)` and
`(company_id, area, status)`.

## week_things

Three things for a week (PLAN.md, part eight, phase 35): `company_id`,
`week_start` (its Monday), `position` (0 to 2), `text`, `done_at` (when it
was ticked, or null), `created_at`. Chosen at the head of the Calendar's week
for the week after; shown at the head of Today until each is done or the week
ends; said in Monday's morning brief. Unique on `(company_id, week_start,
position)`, so a week never has more than three; typing over one replaces
it, and an empty one is removed. Goes with the company.

## lead_facts

What stays true about a contact (PLAN.md, part twelve, phase 49):
`company_id`, `lead_id`, `text` ("Maya prefers WhatsApp over email"),
`until_day` (the day a fact that ends stops - "on leave till the 20th" - or
null), `created_at`. Said to the quick line and kept on the contact, shown
on their page as *Known about them*, and read by the line's questions - not
on their history, where a fact and a call read alike. A birthday is a fact
and, made with it, a task for that contact that comes back every year
(`tasks.repeats`). Indexed on `(lead_id, created_at)`; goes with the contact.

## line_names

Who a word on the quick line means, once the line has asked and been told
(PLAN.md, part twelve, phase 48): `company_id`, `said` (the word, as typed),
`lead_id`, `created_at`. One row per word per company - unique on `said`
ignoring case - and a second answer for the same word replaces the first.
Read before any other way of finding a name, so "pk", answered once as Priya
Nair, is her from then on. Listed in Settings, under Tune, each with Forget;
goes with the contact or the company.

## import_batches

What makes undo possible. `filename`, `file_type`, `mapping` JSON, row counts,
`before_image` JSON, `undone_at`.

**`before_image` is the half that matters.** Deleting what a batch created is
easy; an import that merged into thirty existing leads is otherwise
unrecoverable, so the prior values of every updated lead are stored here.

## email_templates

`name` (unique per company, case-insensitively), `subject`, `body`, `channel`.
Bodies use `{{lead.name}}`-style tokens — see [features.md](features.md#email-templates).

`channel` is `email` or `whatsapp`. A WhatsApp template has no subject line,
and is offered by the WhatsApp button, never the email one.

## emails

One row per message Caulder handed to the Google script (PLAN.md, phase 5):
the contact, the address it went to, subject and body, `send_at` for a
scheduled one, and what became of it — `status` is `scheduled`, `sent`,
`replied`, `failed` or `cancelled`, with `sent_at`, `replied_at` and `error`.

- **The follow-up is columns, not a row.** There is at most one, and it means
  nothing apart from the message it follows: `follow_up_days`, the body as
  filled in when it was chosen, and its own `follow_up_status` — `waiting`,
  `sent`, `skipped` (they replied first), `cancelled` or `failed`.
- **The address is copied onto the row.** The contact's email can change
  later; the row says where this message actually went.
- **Status only moves forward.** How a report from the script changes a row is
  decided in one pure function, `planEmailChange` in `shared/mail.ts`: a
  report behind what is already known changes nothing, and each event — sent,
  replied, bounced, failed, follow-up sent — reaches the history exactly once.
- **`settled`** means nothing more can happen: replied, failed or cancelled
  with no follow-up waiting, or sent more than thirty days ago. **`forgotten`**
  means the script has been told it may drop its copy. Caulder only asks the
  script about unsettled rows, and marks a row forgotten only once the script
  has answered.
- **`template_id`** (migration 48) is the template a message started from,
  so a template can say how many it sent and how many were answered. Null for
  one written from scratch and for everything sent before; deleting the
  template nulls it rather than taking the message.
- **`message_id`** (migration 51) is the Message-ID a message went out with
  when Caulder sent it itself, from an account: `<uuid@the-account's-domain>`.
  A reply names it, which is how it is known for one. Null for anything
  through the script, which keeps its own, and for everything sent before.
- Deleting the contact deletes its messages; the history entries they wrote
  go with the contact anyway.

## settings

A tiny key-value table, app-wide rather than per-company. Keys are constrained
in `SETTING_KEYS` in `shared/domain.ts`, so a typo becomes a type error rather
than a silently orphaned row: `activeCompanyId`, `coldAfterDays`, `followUpDays`,
`notify`, `defaulted`, `captureShortcut`, `keepInTray`, `trayNoticed`,
`googleConnection`, `googleAuto`, `googleScript`, `aiConnection`, `aiModels`,
`aiModel`, `aiContext`, `aiScope`, `aiLine`, `thisIsMe`, `widgetOpen`,
`widgetLevel`, `widgetSpot`.

The connection opens with `secure_delete` on (`db/connection.ts`), so deleted
content is overwritten rather than left in free pages - what migration 49
took out does not linger in the file.

**`thisIsMe`** is who this Caulder is, as JSON: a `name`, which Today greets
and every revision written here carries, and an `id` made once.

**`aiConnection`** is the AI service Ask the brain uses - which service, its
address and its API key - ciphertext for the same reason as
`googleConnection`, and an empty string once disconnected. **`aiModels`** is
what that service offered when last asked, as JSON, so the picker needs no
network to draw; **`aiModel`** is which of them answers, and may be a name
typed by hand; **`aiContext`** is the most that goes with a question
(`small`, `medium`, `large` or `whole`); **`aiScope`** is what goes within
that - `needed`, the company in brief and what the question is about, which
is also what an empty value means, or `all`, the whole company every time;
and **`aiLine`** is `on` while the quick line is in AI mode, and emptied when
the AI is disconnected.

**`googleScript`** is what the script said about itself when last asked — its
version, the Gmail address it sends from, today's remaining sends, and why it
cannot send if it cannot — as JSON. It is kept so a contact's page knows
whether it can send without asking Google first, and cleared on disconnect.

**`googleConnection` is ciphertext.** The Google web-app URL and its key are a
bearer capability — anyone holding both can read and write that calendar — so
they are encrypted with the OS credential store before they are written, and
never handed back to the window.

**`captureShortcut` has three states, and two of them look alike.** Never set
means the default, Ctrl+Win+A (`Ctrl+Super+A` to Electron). Set to an empty string means deliberately off,
and stays off — telling those two apart is the whole reason the row is read
raw rather than as "a key or nothing". `keepInTray` is likewise yes until it
is set to `0`.

**The three `widget` keys are the desk widget between launches**: whether it
was showing (`widgetOpen`, never set means no - it is the one part of Caulder
that puts something on screen you did not open), where in the stack
(`widgetLevel`, one of `desktop`, `front`, `normal`, and anything else reads
as `front` rather than throwing), and where the pill was dragged to
(`widgetSpot`, `{"x":n,"y":n}`). The spot is clamped onto a real screen on
every launch rather than only when it is moved - a widget left on a second
monitor that is now unplugged would otherwise be somewhere nobody can reach.
`shared/widget.ts` reads all three.

Anything that belongs to one workspace goes on its `companies` row or its own
table, never in here.

## area_words

**Not read or written since phase 32.** It held the words the quick-add
line had been taught, each pointing at one of a task's four areas -
"Datascience" is College, "Oakridge" is Company - and a task has no area now.
`word`, `area`, `created_at`, no `company_id`, `UNIQUE (word COLLATE NOCASE)`.
The table and its rows are left where they are, and are in the `caulder.db`
copy and every backup.

## line_guesses

What the quick-add line guessed at, kept so Settings' Tune can ask about it
later instead of the line stopping to ask there and then. `kind`, `typed`,
`meant`, `times`, `verdict`, `last_seen`, `created_at`.

A row is a **`slip`**: a word read as another - "meetining" as "meeting" -
with what it was read as in `meant`. `times` counts the lines it has turned up
in. Rows of kind **`name`** - something a title named that nothing knew, asked
about so it could be given an area - are from before phase 32, and are neither
written nor read.

`verdict` is null until answered: `same` means it is read that way from then
on without comment, and `keep` means the word is never touched again - which
is also what "Keep as typed" under the line writes, before any question is
asked. Deleting the row takes an answer back, and leaves the line free to
guess - and ask - again.

**No `company_id`**: the way somebody's
fingers slip does not change with the workspace. **`UNIQUE (kind, typed, meant)`
ignoring case**, so a second sighting adds to the count rather than the list,
and an answer once given is found again rather than asked again. Not in the CSV
export; in the `caulder.db` copy and every backup.

## line_lessons

What the quick line learns from being corrected (`shared/lessons.ts`). A line
moved to another kind before it was kept leaves one row: its `words` (plain,
sorted, space-separated - the words that carry meaning, with "friends" and
"friend" as one), the `kind` it was moved to, `times` it has been taught that,
the line it was first learnt from as `sample`, `created_at`, `last_seen`. The
same words taught the same answer again add to `times`; nothing else is kept.

A later line that shares words with a lesson is read that way - but a word
taught two different answers counts for neither. Each row is listed in
Settings with a way to take it back.

**`area`** is from when a line could be moved to another part of life as
well. It is not written since phase 32, and a row that has only an area and
no kind is not read.

## reminders

A reminder the quick line was asked for - "remind me in 20 mins to check the
oven", "don't let me forget to pay rent tomorrow" (`shared/nudges.ts`). The
`company_id` and `task_id` it belongs to, its `title`, the `day` and `time`
where that workspace is (a null `time` is the start of that day - the morning
brief's hour, or nine), `told_at` once Windows has shown it, `created_at`.

Separate from a block's own notice, which stays behind the workspace's
reminder switch: this was asked for in so many words, so it is sent whatever
that switch says. A reminder for a task done first is settled without being
sent, and deleting the task deletes it.

The morning brief keeps no rows: its hour is `briefAt` in `settings` (empty
is off), and the day it was last sent is `briefed`, so it is sent once a day.

## mail_accounts

Mail that is not the Google script: Zoho, Outlook, Yahoo, iCloud, a domain of
your own. `label`, `address` it sends as, `host`, `port`, `secure` (TLS from
the first byte, rather than STARTTLS), `username`, `is_default`, `created_at`.

**`secret` is ciphertext.** The password - an app password, for every
provider that offers one - is encrypted by the operating system before it is
written, as `googleConnection` is, and no channel hands it back to the
window. If the OS cannot encrypt, the account is not saved.

**`imap_host` is the switch for seeing replies** (migration 51), null until
the person turns it on for that account; `imap_port` goes with it. On,
Caulder asks that inbox every ten minutes for the headers of what has
arrived since the oldest message still listened for - who from, when, what
it answers; never a subject or the text - and reports each answer the way
the script's are reported. `imap_checked_at` is the last look, and
`imap_error` what went wrong with it in a sentence, null when it went. The
same password is used; nothing new is stored about the inbox, and nothing in
it is changed.

Off, an account only sends: no reply is watched for and no follow-up is
taken. Either way a message scheduled for later, and a follow-up, is sent by
Caulder when it is due, which means Caulder has to be running.
`emails.account_id` says which account a message went from - null is the
script, which is every message from before.

## campaigns

A label table. Campaigns were once a report of their own (migration 14); the
report, its verdicts and its spend ledger went in migration 18, and what
remains is the name a lead or a spend line can carry. Nothing creates one
from the interface any more, and the rows that exist keep their names on the
Money screen's spend list. Both references to it are `SET NULL`.

## products, prices

What the company sells, and what it asks for it. Both were a brain page until
migration 25, which was right while a product was prose and wrong the moment
a quote line wanted to pick one: a price has to be a number something can
multiply, and a price that changed has to be two rows rather than an edited
sentence.

`products`: `company_id`, `name`, `kind` (`service`, `good`, `subscription`),
`unit` (a seat, a month, a workshop), `status` (`idea`, `building`, `live`,
`retired`), `cost`, `tax_rate`, `code` (HSN or SAC), `notes`.

`prices`: `company_id`, `product_id`, `name` (the tier), `amount`,
`recurrence` (`once`, `monthly`, `quarterly`, `yearly`), `valid_from`,
`valid_to`.

- **A price book, not a column.** A price has a life: a tier, a shape and the
  days it applied. `currentPrice` in `shared/products.ts` picks the one that
  applies on a day - a dated price that has started beats an undated one,
  because a date is a deliberate act - and nothing is ever edited in place to
  change a price.
- **What was actually charged is not here.** It is on the invoice lines, which
  carry `product_id`, so a product can show what it asks and what people paid,
  and the two can differ. Draft and void invoices are left out of every total:
  a draft is not money, and a void never was.
- **`quote_lines.product_id` and `invoice_lines.product_id` are `SET NULL`.**
  Deleting a product leaves the lines their words and their money, because
  what was charged happened whatever the catalogue says now. A line's price is
  its own from the moment it is written.
- **`prices` cascades from its product**, since a price with nothing to price
  is nothing.
- **Migration 25** gave each `product` page a product row carrying its status,
  unit, cost, tax rate and code, its text as `notes` and its price as the
  first row of its price book, then deleted the page - its search rows and its
  links with it, by the triggers from migrations 20 and 21. A page in that
  section that was not a product stays where it is.

Indexed on `(company_id, name COLLATE NOCASE)` and `(product_id, valid_from
DESC)`, with the two line tables indexed on `product_id`.

## quotes, quote_lines, invoices, invoice_lines, payments, spend

Money, at bare bones: the four numbers a month a founder needs and nothing an
accountant would recognise. See PLAN.md, phase 3.

- **Lines are rows, not JSON.** A total is a sum over lines, and a sum the
  database can compute is one the export can carry.
- **Money is whole units of the workspace's currency**, an INTEGER, the same
  rule as `deals.value`. Quantities are REAL, because half a day is a real
  quantity.
- **Numbers are per company**, `MAX + 1` inside the insert's transaction, with
  `UNIQUE (company_id, number)` behind it. A number is never reused.
- **Paid is derived from `payments`, never typed.** An invoice is paid when
  the payments cover the total and stops being paid if one is removed;
  `paid_on` follows. "Mark paid" records a payment for the remainder.
- **A retainer is `invoices.repeats`** (migration 54), and only the newest
  invoice of a run carries it. When the next is due to be written -
  `issued_on` so many months on, and the invoice sent - `draftRepeats`
  (`repositories/money.ts`) makes a draft from it and moves `repeats` to the
  draft. Nothing is drafted from a draft, so a run has at most one waiting;
  nothing is ever sent by it. It runs when Today and Money are read.
- **Whether an invoice was chased is not stored.** `Invoice.reminded` is
  read from `emails`: those sent to its contact with its number in the
  subject (`remindersFor`, `shared/chase.ts`).
- **Overdue is not a status.** It is a sent invoice past `due_on`, worked out
  when read, so nothing runs at midnight and nothing goes stale.
- **A quote cascades to its lines; an invoice does not cascade to its quote.**
  `invoices.quote_id` is `SET NULL`: the money is owed whatever happened to
  the paperwork.
- **A quote or an invoice belongs to a deal** through `deal_id`, as well as
  to its contact. Unnamed, a new document goes on the contact's main deal and
  an edited one keeps the deal it had. Accepting a quote carries the deal to
  the invoice and gives the deal the quote's total when it had no value.
  `deal_id` is `SET NULL`: deleting a deal leaves the money with the contact.
- **`spend.campaign_id` is optional**, because most of what a founder spends
  is not a campaign. Migration 17 copies `campaign_spend` across so the
  ledger is complete, and migration 18 drops the old table.

## Running costs, and cash_balances

**A running cost is not a table.** It is read off the brain pages that
already say what something costs and when it renews: a `tool` page (`cost`,
`cycle`, `renewsOn`), a `domain` page (`cost` a year, `renewsOn`) and a
`running-cost` page in Money plan (`amount`, `cycle`, `dueOn`, `category`,
`payee`) for rent, salaries and the rest. `shared/costs.ts` says which field
is which. Archived pages are not costs. So a server bill is written down
once, beside its login and its notes, and the brain's search, export and Map
carry it.

- **Paying one** (*Paid*, on Today or Money) writes a `spend` row with
  `cost_page_id` pointing at the page, and moves the page's date on one
  cycle - saved as a page edit, so the page keeps a version. A one-off loses
  its date.
- **`spend.cost_page_id`** is `SET NULL` and exists for the burn: spending
  that paid a running cost is left out of the one-off average, because the
  running costs already count it.

`cash_balances`: `company_id`, `amount`, `as_of`, `note`, `created_at`. What
is in the bank, typed with the day it was true. A row each time rather than
one value, so the figure can be seen changing; the latest by `as_of` is the
one runway reads. `amount` is whole units and may be negative. Indexed on
`(company_id, as_of DESC, created_at DESC)`.

**Runway** is worked out when read (`services/costs.ts`): burn is the monthly
running costs plus the average monthly one-off spending, less the average
paid in, over the last three whole months - or the months since the company
was made, or this month alone for a company made this month. Runway is the
latest balance over the burn, counted from that balance's day.

## obligations, obligation_done

What the company has to do by a date, again and again: a GST return on the
11th, advance tax four times a year, the annual return in the autumn. See
PLAN.md, phase 9.

`obligations`: `company_id`, `title`, `kind` (`filing`, `payment`, `renewal`,
`other`), `rule`, `period`, `remind_days` (0 to 90), `amount`, `notes`,
`preset_id`, `starts_on`, `ends_on`, `page_id`, `lead_id`, `document_id`,
`is_active`.

`obligation_done`: `obligation_id`, `due_on`, `done_on`, `note`, `amount`,
`UNIQUE (obligation_id, due_on)`.

- **A rule, not a row per occurrence.** `rule` is JSON with a `json_valid`
  check: `{"every": "once", "on"}`, `{"every": "month", "day"}` or
  `{"every": "year", "dates": [{"month", "day"}]}`. `occurrences` in
  `shared/deadlines.ts` works out the days; a 31st falls on the last day of a
  shorter month. A monthly filing is one row, not twelve a year, and changing
  its day changes every one still to come.
- **Done is a row per occurrence, keyed by the day it was due.** The due day
  is also what says which period it was for: `period` (`month-before`,
  `quarter-before`, `fy-before`, `year-before`, or `none`) turns GSTR-1 due on
  11 October into September's. Marking it done twice is doing it once.
- **Late is worked out, never stored.** An occurrence on or after `starts_on`
  with no done row is late once its day has passed. `starts_on` defaults to
  the day the obligation is added, so a new filing does not arrive with years
  of misses; `is_active = 0` stops it coming up and keeps what was done.
- **`preset_id`** says which preset it was added from, with a unique partial
  index on `(company_id, preset_id)`, so pressing Add twice adds it once. The
  presets themselves are code (`shared/deadlines.ts`), shipped with releases.
- **`page_id`, `lead_id` and `document_id` are `SET NULL`**: a link to what an
  obligation is about, never a reason to delete one. `obligation_done`
  cascades from its obligation.
- **Not every deadline is here.** A contract's notice day and end date, a
  registration's or trademark's renewal and a document's expiry are read off
  their own rows when asked for (`services/deadlines.ts`), so changing the
  date on the contract moves the deadline with nothing to keep in step.

Indexed on `(company_id, is_active)`.

## documents

Every paper the company has to be able to find: `company_id`, `name`,
`category` (`certificate`, `contract`, `agreement`, `invoice-sent`,
`invoice-received`, `statement`, `pitch-deck`, `identity`, `other`), `file`,
`bytes`, `location`, `expires_on`, `lead_id`, `page_id`, `notes`.

- **A stored file or a written-down place, one or the other.** `file` is the
  generated name of a copy in the app's attachments folder, with the real
  name in `name`, so two files called `proposal.pdf` are two files. A paper
  in a drawer has no file and says where it is in `location` instead. The
  repository refuses a document with neither.
- **A contact's documents are the ones with `lead_id`**, and go with the
  contact (`CASCADE`), as attachments did. An invoice PDF is filed here as
  `invoice-sent`. `page_id` is `SET NULL`.
- **Deleting one deletes its file**, after the row: a row left without a file
  would be a list of things that cannot be opened.
- **Migration 26** moved every `attachments` row across with its id and
  file, turned each `document` page into a document without a file - its
  `where` field as `location`, its text as `notes` - and deleted the pages.

Indexed on `(company_id, category, name)`, `(lead_id, created_at DESC)` and
`(company_id, expires_on)`.

## people, openings

**Dormant since migration 52 (11 October 2026).** People and hiring was taken
out - a one-person company has no team - and nothing in Caulder reads or
writes these two tables now. They are still here, with whatever was in them,
because `tasks.person_id` refers to `people`: a column with a reference
cannot be dropped, and a table another still refers to cannot go without
every later write to `tasks` failing. Export everything writes them out as
`people.csv` and `roles.csv`. What follows is how they were used.

Who works here and on what terms, and who might. See PLAN.md, phase 10.

`people`: `company_id`, `name`, `kind` (`founder`, `employee`, `intern`,
`freelancer`, `advisor`, `candidate`), `role`, `email`, `phone`, `lead_id`,
`starts_on`, `ends_on`, `pay`, `pay_per` (`month`, `hour`, `day`, `project`,
`year`), `equity` (a percentage, 0 to 100), `vesting_months` (1 to 120),
`cliff_months` (0 to 60), `owns`, `opening_id`, `stage` (`applied`,
`talking`, `interview`, `offer`, `hired`, `declined`), `onboarded_on`,
`notes`.

`openings`: `company_id`, `title`, `status` (`open`, `paused`, `filled`),
`pay` (a range, as words), `notes`.

- **One table for everybody.** A candidate who is hired becomes an employee,
  an intern, a freelancer or an advisor on the same row, keeping the notes
  from the interviews; `stage` stays `hired`, which is how the role knows who
  filled it. Only a candidate has any other stage.
- **Status and vesting are worked out, never stored.** Starting, here, gone
  or a candidate is read from `kind`, `starts_on` and `ends_on` against the
  day. Equity vests monthly from `starts_on` over `vesting_months`, with
  nothing before `cliff_months` and the months it held back arriving at it
  (`vestingOf` in `shared/people.ts`); with no vesting it is all theirs from
  the start.
- **Dates reach Today by being read.** A person's `ends_on` and their cliff
  day are deadlines worked out in `services/deadlines.ts`, like a contract's,
  so there is no obligation row to keep in step.
- **`tasks.person_id`** ties the tasks onboarding makes to the person, which
  is how their page says *3 of 8 done*. `SET NULL`: deleting somebody leaves
  their tasks, because the work may still need doing.
- **`lead_id` and `opening_id` are `SET NULL`.** A person outlives the
  contact they also were; a role deleted leaves its candidates, without one.
- **Searchable.** Name, role, email, phone, what they own and their notes go
  into `brain_search` by the same triggers as the rest, as kind `person`.
- **Migration 27** made each `founder` page a founder - its vesting sentence,
  which cannot be read as months, into the notes - each `teammate` page a
  person of the kind it said, and each `opening` page a role, keeping their
  ids, then deleted the pages. A template's own starting text is not kept as
  notes.

Indexed on `(company_id, kind)`, `(opening_id)`, `openings (company_id,
status)` and `tasks (person_id)`.

## metrics, metric_values

The numbers the company watches, with their history. See PLAN.md, phase 11.

`metrics`: `company_id`, `name`, `kind` (`count`, `money`, `percent`),
`unit_label` (what a count counts: "schools"), `source`, `target`,
`direction` (`up` or `down`: which way is good), `notes`, `position`.

`metric_values`: `metric_id`, `on_day`, `value`, `note`, `UNIQUE (metric_id,
on_day)`.

- **Most metrics are not stored.** `source` is `manual` for one written down,
  or the key of a derived one - `paid-in`, `invoiced`, `spent`, `net`,
  `deals-won`, `won-value`, `new-contacts`, `calls`, `cash` - which
  `services/metrics.ts` reads by month off `payments`, `invoices` (not drafts
  or voids), `spend`, `deals` in a won stage, `leads`, `calls` and
  `cash_balances` every time it is asked. There is nothing to keep in step,
  and a payment recorded a minute ago is already in *Paid in*. The list is in
  code (`shared/metrics.ts`), so `source` is not checked by the table; a
  unique partial index keeps each derived one to once per company.
- **Flows and levels.** A flow is counted over each month, so this month is
  *so far* and is set beside last month; a level - the bank balance, or any
  reading written down - is the latest against the one before it. The bank
  balance carries from month to month until a new one is written.
- **A reading a day.** A second reading on the same day replaces the first.
  Readings cascade from their metric.
- **Migration 28** made each `metric` page a written-down metric - money if
  its unit said rupees or dollars, a percentage if it said %, otherwise a
  count of what it said - with its *Now* as the first reading on its *As of*
  day, then deleted the pages.

Indexed on `(company_id, position)`.

## tasks.page_id, tasks.source_step

Which page made a task, and from which step: a meeting's action item (made
once, so the page can say which are tasks and which are done), or a
playbook's step (made again each time it is run). `SET NULL`: deleting the
page leaves the tasks. With `tasks.person_id` from migration 27 they say who
owns an action item named with an `@`.

## leads.do_not_contact

One flag, enforced where the reaching-out happens rather than hidden in the UI:
`openMail` and `openWhatsApp` in `services/outreach.ts` and `sendEmail` in
`services/mail.ts` all refuse a contact marked with it, whatever the screen
shows. A flag only the screen respects is
not a flag.

## custom_fields, custom_values

The fields invented for a lead, rather than decided by Caulder. A lead's
files were `attachments` until migration 26; they are `documents` now.

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
- **`page_id`** (on `blocks` and `block_series`, migration 30) is a page the
  time was set aside for. Nothing sets it now - it was for a course's study
  hours and a hobby's evenings, which went with migration 49 - and it nulls
  when the page goes: the hours happened either way. What a
  page's time "got" is the sum of its past blocks not skipped, worked out when
  read.

## block_series, terms

Most of a week is the same week again. **Occurrences are written as ordinary
blocks**, not computed when read, so moving one Tuesday is editing a block and
the Google sync needs no idea repeats exist.

- `block_series` — `title`, `kind`, `starts_at`, `minutes`, `weekdays` (ISO
  numbers, `'1,3,5'`), `from_day`, `until_day`, `is_habit`, `term_id`. `is_habit`
  is no longer read: migration 49 set it to 0 everywhere. **`kind`** on a
  block and on a repeat is one of `focus`, `meeting`, `call`, `admin`, `away`,
  or whatever was typed; migration 53 made `away` of the four a student's day
  had.
- **`terms`** — `name`, `from_day`, `until_day` — **is no longer read or
  written** (phase 32): it named the span a timetable of classes ran for, and
  the Calendar's *A usual week* puts repeats in until a day without naming
  anything. `block_series.term_id` is null on every repeat made since.
- **`blocks.series_id` nulls rather than cascades.** Ending a repeat clears
  the future and leaves the past.
- **`every_weeks`** (migration 55) is 1, or 2 for a repeat every other week:
  the occurrences written are the weeks counted from the week of `from_day`
  that are even.

## notes

A thought caught before it goes: `body`, `day`, `is_pinned`. **Not an
activity**, because `activities.lead_id` is `NOT NULL` and the point of a quick
note is that it belongs to nothing yet.

## brain_pages, brain_revisions

The brain (PLAN.md, phase 6). A page is a `section`, a `template`, a
`title`, a Markdown `body`, and `fields` - the template's fields as JSON.

- **`section` is checked in `shared/brain.ts`, not by the table.** It was a
  `CHECK` until migration 30 rebuilt the table without one, so a new section
  never costs a rebuild again. That rebuild was for four personal sections -
  `studies`, `hobbies`, `goals`, `journal` - which migration 49 emptied and
  `shared/brain.ts` no longer lists; `remembered`, where the line keeps what
  it was told about the company, is the company's now.

- **Fields are JSON, not columns.** The templates are defined in
  `shared/brain.ts` and change with it, and nothing queries a field by
  column. A value leaves the JSON for a column of its own when something
  starts computing on it; products, obligations and people get their own
  tables in later phases for exactly that reason.
- **A secret is sealed inside the JSON** as `{"$secret": "…", "last4": "…"}`:
  encrypted by the operating system (`services/secrets.ts`), with the last
  four characters beside it so a page can show `•••• 4821` without
  decrypting. It travels with its revisions, and the search index never sees
  it because the triggers read only a field's text and numbers.
- **`revision`** goes up on every save, and a save that started from an older
  one is refused - the other founder, later, is why.
- **One profile, brand kit, one-page plan, cap table and accountant** per
  company, enforced by a partial unique index on `(company_id, template)`.
- **`brain_revisions`** keeps what every save wrote. Saves under five minutes
  apart are folded into one row, except the first (the template a page began
  as) and a put-back old version, which always stand alone - and only one
  person's saves fold together. `edited_by` is the "This is me" name of
  whoever wrote the version, and `brain_pages.updated_by` of whoever wrote
  the page last (both null before phase 12).
- **`brain_revisions.concurrent`** marked a version written at the same time
  as another by a second founder. Nothing writes it since founder sharing was
  taken out (migration 49); the column stays.
- Archiving keeps a page and takes it out of search and the home page;
  deleting takes its revisions with it.

## brain_links, map_positions

Links from pages to anything, and where the Map left its dots (PLAN.md,
phases 7 and 16).

- **A link is written in a page's text** as `[[Label|<kind>:<id>]]`, the kind
  one of `page`, `contact`, `product`, `person` and `document`
  (`shared/links.ts`). The id is what it means, so a
  rename never breaks it; the label is what was written, so the words survive
  if the target goes.
- **`brain_links` is derived.** Every save of a page replaces that page's rows
  with what its text links to now, keeping `created_at` for a link that was
  already there - the Map's replay grows the company in that order. Only a
  target that exists in the same company is recorded, and never the page
  itself.
- **A link always starts on a page** (`from_page`, cascading), and ends on
  any of the five (`to_kind`, `to_id`). `to_kind` has no `CHECK` since
  migration 32 - the kinds are checked where links are read out of the text -
  and the end has no foreign key because it can be any of five tables, so
  `links_page_gone`, `links_contact_gone`, `links_product_gone`,
  `links_person_gone` and `links_document_gone` remove rows pointing at
  something deleted. The text that linked to it keeps its words.
- **`map_positions`** holds each dot's last place (`node` is `<kind>:<id>`,
  the same five kinds) and whether it is pinned, so the Map is the same map
  tomorrow. The same five triggers clear a deleted thing's position; a key of
  any other shape is refused rather than stored.
- A contact is on the Map only when something reaches it - a link, a person
  who is them, a product invoiced to them, a document of theirs - unless
  *Every contact* is switched on. Those other lines are not rows here: the
  Map reads them from `people`, `invoice_lines` and `documents` each time it
  is drawn.

## search_map, brain_search

Search over everything (`Ctrl+K`). `brain_search` is an FTS5 table of
`title` and `body`; `search_map` gives each indexed row a stable integer id -
FTS5 keys on one - and says what it is (`kind`, `ref_id`) and whose
(`company_id`).

- **Triggers keep it current**, on pages, contacts, notes, history entries
  and invoices (with their lines), so no screen has to remember to. Each
  trigger runs one "refresh this row" step: delete what the index holds for
  it, then put back what the row now says, if it still qualifies. An insert,
  an edit and a delete therefore cannot disagree.
- **What is indexed:** a page's title, text and field values (not archived
  pages, not secrets); a contact's name and details; a note; a history entry
  that has words of its own (a call's notes, a sent email) but not the
  app's bookkeeping (created, stage changed, fields edited); an invoice's
  number, contact, notes and line descriptions.
- **A company's rows go first**, from a `BEFORE DELETE` trigger on
  `companies`, so the cascade that follows finds nothing left to clean.
- `search_map` is not keyed to `companies` with a foreign key on purpose: the
  cascade would remove the map rows before the index rows they point at.

## vectors, embed_queue

What the model on this machine made of each thing it read (PLAN.md, part
five): one vector a page, a memory, a contact, a task or a note, 384 bytes
each (`shared/understand.ts` says how).

- `vectors` is keyed on `(kind, ref, model)`. `ref` is the row's id, and for
  a memory its page's id with the hash of its line after `#`, since memories
  are lines, not rows. `model` is kept with each, so a new model reads
  everything again rather than comparing two kinds of vector. `text_hash` is
  what it was made from, so unchanged text is never read twice. `source_id`
  is the row the text came from, and `company_id` cascades.
- `embed_queue` is what is waiting to be read, `(kind, ref_id)` once however
  often the row changed. **Triggers fill it**, on insert and on the columns
  that are read, for `brain_pages`, `leads`, `tasks` and `notes` - a trigger
  cannot run a model, so it queues. Deleting a row deletes its vectors at
  once, by `source_id`.
- **An archived page is not read**: a queued page that has been archived has
  its vectors removed when it comes round.

## said_again

A memory the model found said again, in other words, by a newer one on the
same page (PLAN.md, part five, phase 21). The line is known by `page_id` and
the hash of its text (`line_hash`, as in `vectors.ref`); `newer_hash` is the
line that said it again, and `score` how alike they were.

- **The page is never written to.** The mark is read in beside it
  (`services/memories.ts`), and the line shows as *earlier*.
- **`undone`** is *Not the same*: the mark stays, so the same pair is not
  marked again, but it no longer counts.
- Deleting the page deletes its marks; a line edited has a new hash, and its
  old mark no longer finds it.

## sheet_links, sheet_rows

A company's contacts kept as a Google Sheet in the person's own Drive, through
their own script (PLAN.md, part seven; `shared/sheet.ts` says what a row is
and which side is right, `services/sheetsync.ts` reads and writes).

- **`sheet_links`** — one row a company that keeps one, and none for one that
  does not: that is the switch. `url` is where the spreadsheet is, as the
  script reported it; main checks it is a Google spreadsheet's address before
  opening it, and the window never sees it. `synced_at`, `count`, `changed`
  and `made` say how the last pass went; `problems` is a JSON list of
  sentences about rows that could not be taken in; `error` is why a pass
  failed, cleared by the next that works.
- **`sheet_rows`** — what Caulder last wrote for each contact: `base`, the
  cells the sheet may change, as JSON. A cell that differs from it on the
  next read was edited in the sheet and is taken in; one that matches was
  not, and Caulder's stands. Replaced whole on every pass.
- Both go with their company, and a `sheet_rows` row with its contact — so a
  contact deleted here is simply not in the next write, and its row leaves
  the sheet. The other way round never happens: a row deleted from the sheet
  comes back.
- Stopping deletes both rows' worth and nothing else. The spreadsheet stays
  in Drive, as it was last written.

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
companies ─┬─ pipeline_stages ─┬─(SET NULL)── deals.stage_id
           │                   └─(SET NULL)── companies.qualified_stage_id
           ├─ products ─┬─ prices
           │            ├─(SET NULL)── quote_lines.product_id
           │            └─(SET NULL)── invoice_lines.product_id
           ├─ leads ─┬─ activities
           │         ├─ tasks ──(SET NULL)── blocks.task_id
           │         ├─ documents (a contact's)
           │         ├─(SET NULL)── obligations.lead_id
           │         ├─(SET NULL)── people.lead_id
           │         ├─ custom_values
           │         ├─ emails
           │         ├─ deals ─┬─(SET NULL)── quotes.deal_id
           │         │         ├─(SET NULL)── invoices.deal_id
           │         │         └─(SET NULL)── calls.deal_id
           │         ├─ calls
           │         ├─ quotes ─┬─ quote_lines
           │         │          └─(SET NULL)── invoices.quote_id
           │         └─ invoices ─┬─ invoice_lines
           │                      └─ payments
           ├─ import_batches ──(SET NULL)── leads.import_batch_id
           ├─ campaigns ─┬─(SET NULL)── spend.campaign_id
           │             └─(SET NULL)── leads.campaign_id
           ├─ spend, payments (also by company_id)
           ├─ cash_balances
           ├─ documents ──(SET NULL)── obligations.document_id
           ├─ people ──(SET NULL)── tasks.person_id
           ├─ metrics ── metric_values
           ├─ openings ──(SET NULL)── people.opening_id
           ├─ obligations ── obligation_done
           ├─ email_templates
           ├─ custom_fields ── custom_values
           ├─ blocks
           ├─ block_series ──(SET NULL)── blocks.series_id
           ├─ terms ──(SET NULL)── block_series.term_id
           ├─ notes
           ├─ brain_pages ─┬─ brain_revisions
           │               ├─ brain_links (from_page)
           │               ├─(SET NULL)── calls.script_id
           │               ├─(SET NULL)── spend.cost_page_id
           │               ├─(SET NULL)── documents.page_id
           │               ├─(SET NULL)── tasks.page_id
           │               └─(SET NULL)── obligations.page_id
           ├─ map_positions
           ├─ search_map, brain_search (by trigger, before the cascade)
           └─ google_tombstones, google_sync

settings, area_words      app-wide; no company
```

Twenty-four edges are `SET NULL` on purpose, so that tidying up never loses
something that happened. On the selling side it is people and money: losing a
column must not delete the deals in it, nor a campaign or an import batch the
contacts in it; deleting a deal or a script must not delete its quotes, invoices or calls, nor
deleting a quote the invoice that was raised from it - the money is owed
whatever the paperwork did. On the day side it is history:
deleting a task leaves its hour, and ending a repeat or a term leaves the
blocks already lived. A filing outlives the page, contact or document it
pointed at, because the tax office does not care what was tidied; a person
outlives their contact and their role, and their tasks outlive them. `companies.qualified_stage_id` just goes back to "not
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
