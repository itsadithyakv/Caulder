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

`contact_person`, `email`, `phone`, `alt_phone`, `location`, `city`, `pin`,
`source`, `website`, `tags`, `notes`, `last_contacted_at`, `import_batch_id`.

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
  Playbooks; its `tone` and `caller` are fields, its parts are headings in
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
- Deleting the contact deletes its messages; the history entries they wrote
  go with the contact anyway.

## settings

A tiny key-value table, app-wide rather than per-company. Keys are constrained
in `SETTING_KEYS` in `shared/domain.ts`, so a typo becomes a type error rather
than a silently orphaned row: `activeCompanyId`, `coldAfterDays`, `followUpDays`,
`notify`, `defaulted`, `captureShortcut`, `keepInTray`, `trayNoticed`,
`googleConnection`, `googleAuto`, `googleScript`, `aiConnection`, `aiModels`,
`aiModel`, `aiContext`, `thisIsMe`.

**`thisIsMe`** is who this Caulder is, for two founders, as JSON: a `name`
written on every revision it makes, and an `id` made once, which the shared
brain knows it by.

**`aiConnection`** is the AI service Ask the brain uses - which service, its
address and its API key - ciphertext for the same reason as
`googleConnection`, and an empty string once disconnected. **`aiModels`** is
what that service offered when last asked, as JSON, so the picker needs no
network to draw; **`aiModel`** is which of them answers, and may be a name
typed by hand; **`aiContext`** is how much of the company goes with a
question (`small`, `medium`, `large` or `whole`).

**`googleScript`** is what the script said about itself when last asked — its
version, the Gmail address it sends from, today's remaining sends, and why it
cannot send if it cannot — as JSON. It is kept so a contact's page knows
whether it can send without asking Google first, and cleared on disconnect.

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
- **`page_id`** (on `blocks` and `block_series`, migration 30) is the page the
  time was set aside for from Life - a course's study hours, a hobby's
  evenings. It nulls when the page goes: the hours happened either way. What a
  page's time "got" is the sum of its past blocks not skipped, worked out when
  read.

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

## habits, habit_checks

The small things done most days, ticked on Today (PLAN.md, part four).
`habits` - `name`, `area` (college, company, personal, health, or none),
`weekdays` (ISO numbers, `'1,3,5'`), `position`, `archived_at`;
`habit_checks` - one row per `(habit_id, day)` done.

- **Nothing about a streak is stored.** The run of days, the best run and the
  last twelve weeks are worked out from the ticks when read, counting only
  the days the habit is for: a Monday-Wednesday-Friday habit is not broken by
  a Tuesday. Today not ticked yet does not break it either - the day is not
  over.
- **Archived, not deleted**, keeps the ticks; deleting takes them.
- Not `block_series.is_habit`: that was a repeat's hours, counted by a screen
  since removed. A habit here has no time of day.

## vision_tiles

The vision board on top of Life (PLAN.md, part four, phase 17): pictures and
words for what the year is for. `words` (a caption, or the whole tile),
`picture` (a `BLOB`) with `picture_type`, `width` and `height`, `goal_id` (a
page in the Goals section, `SET NULL` when it goes), `area`, `position`.

- **A picture is kept in the database**, so a backup carries it and there is
  no folder of files to lose track of. It arrives already made smaller - at
  most 1,400 pixels on its long side, WebP, 1.5 MB at the very most - and is
  checked by its first bytes before it is kept, whatever the window said it
  was. It goes back to the window as a `data:` URL, the one image source the
  window's CSP allows besides its own files.
- **A tile has a picture, words, or both**, never neither: a `CHECK` says so,
  and another that `picture` and `picture_type` come together.
- **Yours alone.** Not a page, so never synced to a co-founder, never in the
  brain's files, the data room, the handbook or the dossier.

**Your level is not a table.** XP, levels, achievements and the week across
the four areas are worked out when read (`services/progress.ts`) from
`tasks.completed_at`, kept `blocks`, `calls`, won `deals`, paid `invoices`,
journal entries, `habit_checks` and the revision where a goal was marked
done. Undo any of those and the points go with it.

## journal_sealed

The words of journal entries for days that are over, once the journal has a
passcode (after 0.3): `page_id` (cascading), `box` (JSON: ciphertext and what
opens it), `sealed_at`.

- **Two keys.** Setting a passcode makes an X25519 key pair. The public half
  is kept as it is in the `journalLock` setting and seals text without
  asking for anything; the private half is kept there too, encrypted with
  AES-256-GCM under a key made from the passcode by scrypt. Each entry is
  sealed with a throwaway key pair and HKDF, then AES-256-GCM.
- **Sealed means gone from everywhere else**: the page's `body`, every
  `brain_revisions.body` for it and so the search index are emptied. The
  title (the date) and the fields - the mood - stay, so the calendar keeps its
  faces. Links written in the entry stay in `brain_links`.
- **Today is never sealed**, and neither is a day while it is being written:
  a past day written into while the journal is open is sealed again as soon
  as it is saved, and any day that is over is sealed by the next read.
- Forgetting the passcode means those days cannot be opened; *I forgot the
  passcode* deletes the boxes and the lock, and leaves the days and moods.

## notes

A thought caught before it goes: `body`, `day`, `is_pinned`. **Not an
activity**, because `activities.lead_id` is `NOT NULL` and the point of a quick
note is that it belongs to nothing yet.

## brain_pages, brain_revisions

The brain (PLAN.md, phase 6). A page is a `section`, a `template`, a
`title`, a Markdown `body`, and `fields` - the template's fields as JSON.

- **`section` is checked in `shared/brain.ts`, not by the table.** It was a
  `CHECK` listing the company's fifteen until migration 30 rebuilt the table
  for the founder's own four - `studies`, `hobbies`, `goals`, `journal` -
  and it was rebuilt without one, so a new section never costs a rebuild
  again.
- **The founder's own sections never leave the machine**: the shared brain
  neither sends nor accepts them, the brain file leaves them out, and so do
  the data room, the handbook and the dossier. They are brain pages so that
  they link, are searched and keep a history; they are shown under *You*
  (Journal and Life), not in the brain.
- **One journal entry a day**, by a unique index on
  `(company_id, json_extract(fields, '$.day'))` for the `entry` template. The
  day is set when the entry is made and kept through every edit; an entry is
  made only when something is written, never by opening the journal.

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
- **`brain_revisions.concurrent`** marks a version written at the same time
  as another by the other founder. The page shows so while its latest version
  is marked; the next save is not, and the mark goes.
- Archiving keeps a page and takes it out of search and the home page;
  deleting takes its revisions with it.

## brain_tombstones, and the shared brain

Two founders sharing one brain through the Google script (PLAN.md, phase
12). The script keeps a log in a spreadsheet in the owner's Drive - every
change to a page a row, the page's revisions numbered there - and each
Caulder reads it from where it got to and sends what changed here.

On `companies`: `brain_key` (which brain in the log; null when not shared),
`brain_name`, `brain_role` (`owner` when the brain is in this founder's
script, `member` when it was joined by invitation), `brain_connection` (how
to reach it - the owner's key, or the invitation - encrypted by the OS like
`googleConnection`), `brain_cursor` (how far into the log this company has
read), `brain_synced_at` and `brain_error`.

On `brain_pages`: `sync_revision` (the log's revision this page matches;
null for a page the log has never had) and `sync_dirty` (changed here since).

`brain_tombstones`: `company_id`, `page_id`, `sync_revision`, `deleted_at` -
a shared page deleted here, waiting to tell the log.

- **Marking is the database's job.** A trigger marks a page dirty when its
  content, section, template or archiving changes and `sync_revision` did
  not change in the same statement; a change arriving from the log always
  moves `sync_revision`, so it is never sent straight back. A new page with
  no `sync_revision` is dirty from its first insert. No path that changes a
  page can forget to.
- **A tombstone only for a page the log has, in a company still here**:
  deleting a company takes its pages without telling anyone, and a page that
  never went up has nobody to tell.
- **The rules on arrival**: a change to a page not changed here becomes the
  page; a change to one that has changed here goes into its history, this
  side's version is written on top, and both are marked `concurrent`; an edit
  beats a delete, whichever side made which; secrets and pins never travel.
  A company's one profile or cap table meeting the other side's is renamed
  "(before sharing)" and made a plain page rather than lost.
- **Not shared yet**: products, obligations, people, metrics, documents,
  contacts and deals are rows of their own and stay on each machine.

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
