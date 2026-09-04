# What Caulder does

Six screens behind a sidebar, with a company switcher pinned at the top. Every
screen is scoped to the company you are in.

---

## First run

One screen: company name, accent, timezone, and whether to start with sample
data. The timezone defaults to the machine's.

### Sample data

**On by default, one tick to decline.** Every screen in Caulder is about a list
you have already built, which makes an empty first launch the worst possible
introduction to it — six screens of nothing, and no way to tell what the app is
for by looking at it.

The sample is eight schools part-way through a funnel: a call two days overdue,
two things due today, one lead gone quiet, a signed one, a lost one, and a
completed task in somebody's history. Every date is relative to now, so it
never looks stale.

**It is a real import batch**, which means removing it is the Undo already on
the Import screen rather than a second delete path. Everything — tasks,
timelines, queued email — hangs off a lead and goes with it.

Creating a company seeds its funnel and makes it the one you are looking at.
There is no "create then select" step, because creating a workspace and staying
in the old one is never what was meant.

---

## Companies

A company is a **workspace**: its own leads, funnel, templates, sequences and
email queue. Nothing is shared between them.

- Switch with the sidebar header or **Ctrl+K**.
- The active company is remembered across restarts.
- Rename, re-accent, archive or delete from Settings. The last company cannot
  be archived or deleted.
- **Archiving hides a workspace. Deleting ends it** — every lead, every logged
  call, the tasks, the funnel, the templates and the email queue, with no undo
  short of restoring a backup. So it is confirmed by typing the company's name,
  not by a second button.
- Names are unique, case-insensitively; a duplicate is refused with a message
  saying what to do.
- **The whole app re-tints** from the active company's accent, so which
  workspace you are in is visible without reading.

---

## Today

The home screen, and the reason the app is worth opening. Five sections, in the
order they need attention. Each appears only when it has something in it.

### 1. A log has not come back yet

Shown when an outbox has been exported and no log has been read since. The
bridge is manual and half of it is easy to forget; left silent, the app would
show stale statuses and look simply wrong.

### 2. Replies waiting on you

Leads who answered an email and have heard nothing since. The warmest thing in
the app, so it outranks an overdue task: a late call still being late tomorrow
costs less than leaving a reply unanswered today.

A lead drops off this list as soon as you log a call, note or meeting, or queue
another email.

### 3. Emails ready to go

A count of messages due, and one button to the export. Caulder does not send.

### 4. Overdue, then due today

Overdue is announced with a red left edge and the oldest first. Due-today is
**grouped by kind** — calls to make, follow-ups, meetings — because calls get
made in a batch and a flat list forces context switching.

Every row has: a tick to complete, **Tomorrow** and **Next week** to snooze, a
delete, and a link to the lead.

### 5. Going quiet

Leads still in play that nothing has happened to for 14 days or more (settable
via the `coldAfterDays` setting). **This is the section a spreadsheet cannot
produce.** Three exclusions keep it honest:

- **Won and lost leads are out.** A closed lead is not being neglected.
- **A lead with any open task is out**, whatever its date. If you have already
  decided what happens next, nothing is falling through — an overdue task is
  the right way to hear about it, and it is already section 4.
- **Editing a field is not a touch.** Fixing a typo in a phone number cannot
  make a lead look alive.

The clock starts at the lead's creation, so a new lead is never instantly cold.

---

## Leads

### The table

| | |
| --- | --- |
| ☐ | Selects the row |
| **Name** | With the city beside it, on the same line |
| **Contact** | The best identifier there is — a person's name, else the email, else a number |
| **Stage** | |
| **Next step** | The soonest open task. Red once it has slipped |
| **Value** | |
| **Last touched** | |

**A row is always one line.** Cells truncate rather than wrap, and what is cut
off is in the tooltip and on the lead. Letting cells grow made a lead with a
contact, an email and a phone three lines tall and one with none a single line;
nothing lined up across rows, and a table whose rows are different heights
stops being a table and becomes a list of blocks.

**The name gives up its space first.** A long school name is still
recognisable cut short, and *"Oakridge Internatio… Bengaluru"* says more than
the whole name with the city trimmed to *"Ben…"*.

- **One search box** across name, contact, email, phone, alt phone and city.
  `%` and `_` are matched literally, so searching "50%" does not return
  everything.
- **Filter by stage**, including "No stage".
- **Sort from the column headings.** The same heading again reverses it. A new
  column starts at whichever end is worth looking at — names A–Z, but values
  biggest-first and dates most-recent-first, because nobody clicks a value
  column to find the smallest deal.
- **A missing value always sorts last, in both directions.** Unknown is not the
  same as worthless, and a lead with nothing planned is not the most urgent
  thing on the list.
- A lead with no way to reach them says **"No contact details"** rather than
  showing three empty cells.

### Working a selection

Tick rows to act on several at once; shift-click extends from the last tick.
The header box takes everything shown, and shows a dash when only some of it
is selected.

While anything is ticked, a bar **takes the toolbar's place** rather than
sitting beside it — "Add lead" should never be next to "Delete 12 leads".

- **Move to stage** applies to all of them, and writes a stage change on every
  lead's timeline exactly as a single move does.
- **Delete** asks first, and the number in the confirm button is the number
  that disappears.

Both apply **as one transaction**. Selecting forty leads and moving them is one
decision, and "eleven of them moved" is not an outcome anybody asked for.
Changing the filters clears the selection, because ids from a list you can no
longer see are not a selection any more.

### The keyboard, in the table

`↑` and `↓` move between rows, `Enter` opens one, and `Space` ticks it.

### Lead detail

Left: the facts, with an Edit button that swaps in the form. Right: next steps,
email, then history.

**Editing applies the record wholesale, not as a patch.** The form always
submits every field. The timeline records *which fields* changed, not a full
diff — the point is to explain later why a record looks the way it does.
A stage move is recorded separately from other edits, because the two answer
different questions.

### Next steps

Add a task against this lead: title, kind, and a date offered as **Today /
Tomorrow / Next week** before it is offered as a date field, because those
three cover nearly every follow-up anybody actually sets.

A lead with nothing planned says so: *"Nothing planned. A lead with no next
step is how one goes quiet."*

### Email on a lead

Compose from scratch or start from a template — tokens are filled in **here**,
so what you approve is exactly what gets queued. Or drop the lead into a
sequence. Below, every message ever sent to them with its current status.

A lead with no email address says so instead of showing a dead button.

### History

Append-only, newest first. Every entry the app can write appears here: created,
imported, notes, calls, meetings, stage changes, field edits, task completions,
and the whole email ladder from queued to replied.

The compose box on top takes a **note, call or meeting**. Logging a call or
meeting moves the last-contacted date; **a note does not** — writing something
down is not contact, and the going-quiet list depends on that distinction.

Ctrl+Enter submits; plain Enter inserts a newline, because these entries are
usually more than one line.

---

## Import

Four steps, and nothing is written until the last one.

### 1. Choose a file, paste a list, or download the template

The template is generated from the same column list the parser validates
against, so the file you download can never drift from the file Caulder
expects. Required: **Name**. Optional: Contact Person, Email, Phone, Alt Phone,
Location, City, Source, Value, Website, Notes.

Limits: 10 MB, 5000 rows.

#### Pasting a list

The other way a list arrives now is from a model, and what comes back is a
chat message rather than a file. **Paste the whole reply.** Caulder finds the
table in it and ignores the sentence before and the note after.

| Pasted | Read as |
| --- | --- |
| A markdown table | Rows, split on the pipes |
| A fenced ```` ``` ```` block | Only what is inside the fence — the fence is the model saying *this part is the data* |
| Rows copied from Excel or Google Sheets | Tab-separated |
| Anything else with commas | CSV, through the same parser a chosen file uses |

Two of those are split here and one is not, on purpose. A markdown cell cannot
contain a bare pipe and a spreadsheet cell cannot contain a tab, so neither has
quoting to get wrong. **A comma can appear inside a cell**, so CSV goes to the
real parser rather than being split by hand — that is how a spreadsheet ends up
shifted by one column and nobody notices for three weeks.

When there are several tables in a reply, the **longest** one wins, so an
example table above the real list does not get imported instead of it. A row
the model left short is padded rather than rejected. Anything that is not
table-shaped says so rather than failing quietly, and what you pasted stays in
the box.

**Copy the prompt for an AI** puts a prompt on the clipboard that names the
exact columns, built from the same list the parser validates against — so what
a model is told to produce cannot drift from what Caulder accepts. A reply that
follows it maps with no clicks at all.

From there it is the same wizard: the same column matching, the same
normalisers, the same duplicate detection, the same undo. Nothing about a
pasted list is a shortcut past the preview.

### 2. Match the columns

Caulder guesses from the headers and shows the first few values of each column,
so the choice is made against the data rather than the header. A field can only
come from one column; choosing it takes it from wherever it was.

### 3. Preview

Three groups, in the order they need attention: **duplicates** (the only rows
needing a decision), **errors**, then the rows that will simply be added. A live
tally at the top updates as you resolve things.

### 4. Commit, and undo

One transaction: an import lands whole or not at all. Afterwards it appears
under **Earlier imports** with an Undo that deletes what it created *and puts
back what it merged over*.

### What the normalisers handle

Every rule exists because the real source file contains the thing it handles.

| Input | Becomes |
| --- | --- |
| `Not mentioned`, `Not clearly mentioned`, `N/A`, `-` | `null` |
| A phone stored as a *number* | Digits, not an exponent |
| An exceljs hyperlink cell `{ text, hyperlink }` | The address |
| `9480004094 / 9141924141` | Phone + alt phone |
| `TRIO World School / Prajna Vahini listing` | Name + source |
| `Bannerghatta Road, Bengaluru – 560083` | Location, city, PIN |
| `Bengaluru – 560027 / Vishweshwarayya Layout, Bengaluru – 560056` | The last address wins for the city |
| `₹ 1,20,000` | `120000` |

### Duplicate detection

Tried in order, first hit wins:

1. **Email _and_ a similar name**
2. **Phone _and_ a similar name**
3. **Name _and_ city**

**No contact detail is ever enough on its own.** In the real file one address
sits against seven different schools and one phone number against four — both
belong to the directory the rows were scraped from, not to any school. Matching
on either alone collapses unrelated leads into one.

Names "agree" when one contains the other, so *Oakridge International School*
and *Oakridge International School Bengaluru* match. Exact equality would miss
that; a fuzzy distance would start merging schools that merely sound alike.

Rows are also checked against **earlier rows in the same file**, because the
file repeats schools that do not exist in the database yet.

### Resolving a duplicate

Four choices per row, with an apply-to-all above them:

| | |
| --- | --- |
| **Skip** | Leave the existing lead alone. The default: doing nothing is safe. |
| **Fill in blanks** | Add only what is missing; never overwrite. |
| **Use imported** | Take the sheet's values wherever it has one. |
| **Add as new** | A genuinely different lead that happens to look similar. |

Neither merge mode **ever blanks a known value**: a column your sheet does not
carry cannot erase what is already there.

---

## Pipeline

The funnel as a board. One column per stage, plus **Unstaged** when a deleted
stage has left leads behind.

Each column shows a count and a value total. Cards show name, contact, city,
value, when you last spoke, and **whether a next step is set** — the drift
signal from Today, surfaced where the work is looked at.

Move a card by dragging it, or with the **Move menu** on the card. The menu is
not a fallback: it is faster than dragging across seven columns and it is the
keyboard path. Every move writes a stage-change entry on the lead's history, so
the board explains itself later.

Reaching a **won or lost** stage stops any cadence the lead is in.

Columns render at most 100 cards; the count above is always the true total,
because Won and Lost grow without limit.

### Editing the funnel

In Settings: rename inline (applied on blur, so a half-typed name is not
rejected), reorder with up/down, change what a stage *means*, add and delete.

Deleting a stage **never deletes leads** — they fall into Unstaged. The last
stage cannot be deleted.

---

## Email

Caulder writes and queues; your Apps Script sends. The whole handover is in
[email-bridge.md](email-bridge.md).

### The bridge card

Three buttons — **Export the outbox**, **Import a log**, **Save the Apps
Script** — and a history of both directions.

### Queue

Every message with its status: Queued, Waiting on the script, Sent, Opened,
Replied, Failed (with the reason), Skipped. Colour **and** label, always both.

### Templates

`{{lead.name}}`, `{{lead.greeting}}`, `{{lead.contact}}`, `{{lead.city}}`,
`{{company.name}}`.

**An unknown token is left exactly as written** and flagged in the editor, so a
typo like `{{lead.nmae}}` shows up here instead of quietly deleting itself.

`{{lead.greeting}}` falls back to **"there"** when no contact is known, because
most imported leads have no contact name and "Hi ," reads as broken.
`{{lead.contact}}` stays literal, for the rest of a sentence where "there"
would be wrong.

### Sequences

An ordered list of steps, each a template and a number of days.

**Days count from the previous step actually being sent**, not from enrolment.
The confirmation arrives late over a file bridge; counting from queue time
would collapse a three-week cadence into whichever day the export happened to
run.

A cadence stops on a **reply**, or on the lead reaching **won or lost**.
Anything still queued is dropped — continuing to nudge somebody who has
answered is the one thing a sequence must never do.

---

## Settings

Companies, pipeline stages, **your data**, and appearance.

### Your data

Stated plainly: everything lives in one file on this machine, nothing is sent
anywhere, and that also means nothing is kept anywhere else.

- **Export everything** — CSVs for leads, history, tasks, emails and templates,
  plus a copy of `caulder.db` and a README explaining how to put it back. The
  database copy is the part that matters: CSVs lose the links between records.
- **Back up now**, and the ten most recent backups listed with date and size.
  One is taken automatically on every launch.
- **Restore** any of them. The current state is copied aside *first*, so
  restoring the wrong one is itself undoable. The window reloads afterwards.
- The database path is shown, with the advice to copy that file elsewhere now
  and again.

### Appearance

Match system, Light or Dark. See [design-language.md](design-language.md).

---

## Keyboard

Single letters, so they stay out of the way while you are typing. Press **?**
for the list.

| | |
| --- | --- |
| `T` `L` `P` `I` `E` `S` | Today, Leads, Pipeline, Import, Email, Settings |
| `/` | Jump to the lead search |
| `N` | Add a lead |
| `Ctrl + K` | Switch company |
| `?` | The shortcut list |
| `Esc` | Close whatever is open |

Every handler checks whether you are typing first — including
`isContentEditable`, not just the tag name. A shortcut that eats a letter
mid-sentence is worse than no shortcut.
