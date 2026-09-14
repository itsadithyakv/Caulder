# What Caulder does

Six screens, five rows in the sidebar, one workspace per company.

**The sidebar is two groups and Settings.** *Plan* is Today and Calendar;
*Sell* is Contacts, Deals and Money. Import has no row: it is a button on
Contacts, with a way back, because it is something done to that list a
handful of times. A row is a claim that a thing is opened most days.

**One workspace.** The degree and the company are one calendar and one task
list, and *area* (college, company, personal, health) is the only tag. There
is no personal workspace, no mode toggle and no "which half"; a second
company gets its own workspace, and the switcher at the top of the sidebar
moves between companies.

**The screen says what it holds; the reasoning is here.** Each card carries
one line under its heading. Where a section's *why* is worth keeping it sits
behind a *Why it works this way* disclosure at the foot of the card, closed
until asked.

---

## First run

One screen: a company name and one button. The funnel shape, the logo, the
accent and the timezone are folded away under one disclosure, because the
timezone is already known and the rest is changed in Settings whenever
wanted.

### Sample data

**A look round, not a starting point.** Every screen in Caulder is about a
list you have already built, which makes an empty first launch the worst
possible introduction to it — six screens of nothing, and no way to tell what
the app is for by looking at it. So the first run offers **Look around with
sample data**: a company called *Sample company*, eight schools part-way
through a funnel, a day with a lecture, a call and the gym in it, and an invoice
paid, one open and a quote out, with a banner on every screen saying what it is and a
button to set up the real thing. The moment a real company is created the
sample company is removed, so nobody has to find it and delete it. A real
company is never seeded.

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

One workspace per company, and nothing else: the personal kind was removed in
phase 1 of PLAN.md. A workspace created as personal before that is shown as a
company with no contacts; its blocks and tasks are untouched.

A company is a **workspace**: its own contacts, funnel, templates, calendar
and money. Nothing is shared between them.

- Switch with the sidebar header or **Ctrl+K**.
- The active company is remembered across restarts.
- Rename, re-accent, archive or delete from Settings. The last company cannot
  be archived or deleted.
- **Archiving hides a workspace. Deleting ends it** — every contact, every logged
  call, the tasks, the calendar, the funnel, the templates and the money, with no undo
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

### Adding a task in one line

The line at the top of Today, reachable from any screen with **A**, and from any
application at all through the tray icon or Ctrl+Alt+A. Type it the way you
would say it — *"Task at 4pm, today, Datascience Assignment"*, *"call Oakridge
tmrw 11:30am"*, *"gym every mon wed fri 6am"*, *"submit the form by the 15th"* —
and the line under it shows what was understood before anything is written.

It is a parser, not a model (`shared/quickadd.ts`). The vocabulary for *when* is
small and regular, so it is matched rather than guessed at — and matched the
way people actually type, which is fast, lowercase and misspelt:

- **Days** — today, tomorrow and every way it gets typed (tmrw, tmr, tmw,
  2moro, tommorow, tommorrow), tonight and tonite, day after tomorrow, this
  morning / evening, later today, eod, end of the week (Friday), this weekend
  and next weekend (Saturday), end of the month, next month, weekday names (this
  Friday, coming Friday; *next* Monday means next week's, as does "Friday next
  week"), before Friday (the day before, never before today), next week, in 3
  days, in two weeks, in a fortnight, the 15th, 15 sep, sep 15, oct. 1, sep 15,
  2026, 15/9 (day first), 15.09.2026, 15-09-2026, 2026-12-01. A day already
  past this year means next year's; a day that does not exist is refused, not
  rolled over.
- **Times** — 4pm, 4 p.m., 4:30pm, 4.30, 16:00, at 16, @4, at 1630, 1500 hrs,
  4 o'clock, half past 4, quarter to 5, by 5, noon, midnight, and "in 2 hours"
  or "in 30 mins", counted from now and rounded up to five minutes. A bare
  number straight after a day is a time: "friday 5".
- **The part of the day** — morning, afternoon, evening, night, tonight — and a
  meal, which says the same thing: "at 9 in the evening", "tonight at 9" and
  "dinner at 8" need no question. It is taken out of the title only where it
  was being used as a time, so "morning run tomorrow at 6" keeps its title
  and still means six in the morning.
- **Ranges** — 4-5pm, 11-1pm, 10am-12, from 4 till 6, between 4 and 6,
  14:00-16:00, 9-10:30, and "tomorrow 9 to 5". Every am/pm pairing the words
  allow is tried and only real ranges survive, so "10:30-12:00" and "9-5"
  settle themselves, and "9-11" — a lecture or an evening — is asked. A bare
  "4-6" counts only straight after a day, because on its own it is as often
  "problems 4-6".
- **Lengths** — for 2h, 2 hours, two hours, 1h30, 1h 30m, 1 hour 30 minutes, an
  hour and a half, 1 and a half hours, half hour, a couple of hours, 90 mins.
- **How much it matters** — urgent, urgently, asap (which also means today),
  important, critical, high prio, top priority, !, !! is has-to-happen. Not
  urgent, no rush, low prio, optional, whenever, maybe, if there is time is
  if-there-is-time — and those are checked first, so "not urgent" can never be
  read as urgent. One exclamation mark on the end of a word is punctuation,
  not urgency.
- **The words around the task** — "don't forget to", "I need to", "gotta",
  "remind me to", "hey can you add a task to", "pls", "please", brackets and
  quotes are taken off; a line typed in capitals loses its shouting. "Note"
  is only a prefix with a colon, because "note the date" is a task.
- **Area** — a tag decides it outright (#college, #company, #gym). Then **your
  words**, taught in Settings: course names, codes, the company, a client, each
  pointing at an area. Then a short built-in list of words that only point one
  way (assignment, hw, midsem, viva, pset → College; client, invoice, pitch,
  standup, fundraising → Company; gym, badminton, blood test → Health;
  groceries, rent, mom, birthday → Personal), company words first, because a
  company that sells to schools says "class" and "exam" about its own work.
  Nothing matching leaves the workspace's own. The area is read only from what
  was not already understood as the when, so "gym for the semester" is the
  gym, not college.

  **And when it still guesses wrong, the area in the reading is a button**:
  one click moves it to the next of the four, without having to know that
  `#college` exists.

  Your words beat the built-in list, because they are the more specific
  thing said. They match whole words only, ignoring case, so "lab" does not
  wake inside "collaborate"; a phrase matches across any spacing; and when two
  of yours match, the longer phrase wins, so "machine learning lab" can mean
  something "lab" does not. A word only picks the area — it stays in the
  title, because "Datascience reading" with the course taken out is just
  "reading". One list for the whole app, not per workspace: a course name
  does not stop being a course in the other one.
- **Kind** — call, email, meeting and follow up are read from the verb, which
  stays in the title: calling, ring, emailing, zoom, coffee with, 1:1,
  interview, sync with, chase, f/u, check in with. "Phone" and "ring" only as
  verbs — "pay the phone bill" and "buy a ring" are not calls.

**Slips are read as the day they nearly are, and it says so.** "wensday",
"firday", "teusday", "15 septmber": the reading shows *Read "firday" as
Friday* on a line of its own, because a correction made silently is a guess
in disguise. It only corrects when nothing else named a day, and only words
typed in lowercase — "call Mondal" is a person, one letter from Monday.

**Numbers that are not times stay in the title.** "Talk about 4 things",
"reduce by 5 percent", "read pages 10-20", "exercise 4.2", "1st year
orientation", "pay 1500 rent" and a phone number all keep their numbers.

Whatever is left is the title. Filler is trimmed only from its ends, so "hand in
the form" keeps its "in the".

**Repeats.** "every monday", "mon wed fri", "mondays and thursdays", "mon-fri",
"weekdays", "weekends", "daily", "every morning" make a repeating block rather
than a task — the gym is a habit, not a thing ticked once. It is the same
block series the Day screen makes, so each occurrence is a real block. The
last day can be said ("until dec 20", "until 20/12", "for 4 weeks", "for 2
months", "until end of term", "for the semester") or it is asked, with the
current term's end offered first. A repeat needs a time; without one it asks,
and offers "only the next one, as a task" instead. Repeats go by the days of
the week, so "every month" or "every other Friday" say so plainly and add
just the next one.

**It asks rather than assumes, and only where a guess would be a coin toss.**
One question at a time, with the likely answers as buttons — or type the answer
into the line, and the question disappears on its own:

- no day and no time: *When is it due?* (Today, Tomorrow, Friday, Next week)
- "at 8" or "9:30" with no am or pm: *morning or evening?* One to six with no
  am or pm is the afternoon without asking, because nobody plans four in the
  morning.
- a time already gone today: *tomorrow at that time, or today anyway?*
- a length with no time, "study for 2h tomorrow": *at what time?* — or no time,
  just the task. The times offered follow the part of the day it mentions.
- a repeat with no time: *at what time?* — or only the next one, as a task.
- a repeat with no last day: *until when?* (End of term, 4 weeks, 12 weeks, End
  of the year).

Enter with a question open moves to its answers instead of adding.

**A task with a time makes two things.** The task is what is due and what
reaches Google Tasks on the phone; the block is the hour on the day grid, and
the thing a reminder knocks for. Both are written in one transaction
(`services/quickadd.ts`), so a block that cannot be made takes the task with it
rather than leaving it due with the hour quietly missing. A block with no length
given is an hour.

### Unpaid, first

A sent invoice past its due date sits at the top of the work column, above
overdue tasks, because money that is late is later than a call that is late.
Each row names the invoice, the contact, what is still owed and how late it
is, and opens Money.

### Overdue, then due today

Overdue comes first, in its own alert card, the oldest first.

Due-today is grouped one of two ways, decided by the day itself rather than by
which workspace you are in:

- **By kind** — calls to make, emails to send, follow-ups — while everything due
  belongs to one area. Ten calls are one sitting with the phone, and a list
  that interleaves them with emails makes you switch ten times.
- **By area** — college, company, personal, health — as soon as today spans more
  than one. A day with a reading for Friday and a client call in it is split
  the way the day actually is.

A task with no area — what one pulled in from Google Tasks arrives as — does
not count as an area of its own, so one of those beside ten company calls
cannot switch the list over and lose the batching. It gets a "No area" heading
whenever areas are shown. The rule lives in `features/today/grouping.ts`.

**Inside every heading, what has to happen comes first**, then should, then if
there is time; a task nobody set reads as the middle, not the bottom. Priority
orders the rows and never the headings, so a group does not jump up the
screen because one task in it is urgent. A task that has to happen says so on
its row; the other two levels do not, because a label on every row is a label
on nothing.

Task priority was accepted by the schema from migration 12 and never written
until this — every task marked as having to happen was saved as though nobody
had said. `repositories/tasks.test.ts` now reads it back out of a real
database.

Every row has: a tick to complete, **Tomorrow** and **Next week** to snooze, a
delete, and a link to the lead.

### Going quiet

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

### Notes, at the foot

A thought caught by **Ctrl+N** in the quick window, or written in the box at
the foot of Today, lands here. Notes have no screen of their own any more: a
note is a thing you have on a day, not a place you go.

## Leads

Called **Contacts** in the sidebar and on the screen; the table, the IPC and
the tests keep the old name.

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

Left: the facts, with an Edit button that swaps in the form, and under them the
two things Caulder did not decide: your own fields and the files attached.
Right: next steps, email, WhatsApp, then history. The history is the reason to
open a lead, and it used to sit under four other cards.

**Editing applies the record wholesale, not as a patch.** The form always
submits every field. The timeline records *which fields* changed, not a full
diff — the point is to explain later why a record looks the way it does.
A stage move is recorded separately from other edits, because the two answer
different questions.

### Next steps

Add a task against this lead: title, area, kind, and a date offered as
**Today / Tomorrow / Next week** before it is offered as a date field, because
those three cover nearly every follow-up anybody actually sets.

**Area and kind are different questions.** Kind is the verb — call, email,
follow up, meeting, to do. Area is which part of your life it belongs to —
**college, company, personal, health**. "Email the professor" and "email the
principal" are the same kind in different areas, and only one is about the
funnel. Both are chips rather than dropdowns, so every choice is visible
without opening anything; only the lead is a list, because there may be two
hundred.

The area defaults from where you are: a task written in a personal workspace is
personal, one in a company workspace or on a lead is the company's. Tasks that
existed before areas were backfilled the same way — the workspace was the only
signal there was. Every task row shows its area as a dot and a word, the hue
kept small so twelve tasks across four areas still read as a list.

A lead with nothing planned says so: *"Nothing planned. A lead with no next
step is how one goes quiet."*

### Email on a lead

Compose from scratch or start from a template — tokens are filled in **here**,
so what you approve is exactly what opens. **Open in your mail app** hands the
message to whatever handles mail on this machine, addressed to the contact,
and then asks one question: *did it go?* Yes writes an entry on the history
and moves last-contacted, the same as a logged call; no writes nothing. The
same shape as WhatsApp below it, and for the same reason: Caulder cannot see
whether it went, so it never claims it did.

A contact with no email address, or marked do not contact, says so instead
of showing a dead button.

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

Reached from the **Import** button on Leads, or with **I**. Four steps, and
nothing is written until the last one.

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

Called **Deals** in the sidebar. The funnel as a board. One column per stage, plus **Unstaged** when a deleted
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

## Money

Is the company making money? Four numbers for the month at the top: quoted,
invoiced, paid, spent. A target underneath, per month, set from the same
card. Then three lists as tabs.

- **Invoices.** A contact, a few lines, an issue date and a due date. Draft
  until you mark it sent. **Mark paid** records a payment for whatever is
  still owed, dated today; **PDF** writes the invoice to a file, attaches it
  to the contact and opens it. A paid invoice stays paid unless the payment is
  removed; void is for one that should never have existed. Draft invoices can
  be deleted, sent ones only voided, because a number once used is used.
- **Quotes.** The same document without a due date. **Accepted** makes the
  invoice, due a fortnight on, and gives the deal a value if it had none.
- **Spend.** What went out: date, what for, amount. Anything the company paid
  for. Negative is a refund.

**Paid is derived from payments, never typed**, and **overdue is worked out
when read, never stored** — a sent invoice past its due date. Every write
returns the whole overview, so a payment updates the invoice, the paid figure
and the overdue list in one read.

A contact's page lists what they have been quoted and invoiced, read-only,
with a way into Money. **Export everything** writes `quotes.csv`,
`invoices.csv`, `payments.csv` and `spend.csv` beside the rest.

No ledger, no double entry, no tax. When the founder needs those they have an
accountant, and the export is what the accountant gets.

## The built-in follow-up

When a deal moves into an open stage and nothing is planned for it, a
**Follow up** task is added, due in three days — or however many Settings says
under Reminders, where zero means never. Won and lost stages are out, because
closed is closed; a contact with any open task is out, because something is
already planned. It runs inside the same transaction as the move, so a move
that rolls back leaves no task behind. This is the one rule the rule builder
was ever used for, built in.

## Your own fields

Settings &rarr; Your own fields. Text, number, date, or one of a list. They
appear on every lead under the details Caulder already knows about, and save on
blur so they behave like the built-in ones.

Per company, because two workspaces are two different businesses. **Deleting a
field deletes what people wrote in it** &mdash; a field nobody can see is not a
field, and leaving the answers behind would mean re-adding the same name
silently brings old ones back.

## Files on a lead

The proposal you actually sent. **Copied into Caulder rather than linked**: a
link is a promise the file will still be where it was, and the first tidy-up of
a Downloads folder breaks every one at once &mdash; which is exactly when you go
looking for it. Stored under a generated name with the real one in the
database, so two files called `proposal.pdf` are two files. 25 MB each.

## Reminders

Two of them, in one card in Settings, answering different questions.

**Tell me when something is overdue** is the daily digest. One desktop
notification a day, never before nine in the morning **where that company is**,
and only when something is actually overdue. Checked on a timer rather than
scheduled for 9am, because a laptop that was shut at nine would otherwise fire
at noon.

**Tell me before a block starts** is the one that knocks at ten to nine. Set
per workspace &mdash; two workspaces are two timezones and two kinds of day
&mdash; with a lead time from "as it starts" to an hour, and a single block can
ask for its own notice, or none at all, on the block itself.

Both are **off unless you ask**: an app that starts notifying you before you
have said yes has already lost the argument. And the workspace switch is a
**master switch**: while it is off a block asking for its own reminder is
ignored, because a control that keeps acting after it has been turned off is
worse than one that was never offered.

Four refusals, all in `shared/remind.ts` and all tested there:

- **Nothing about a block that has already started.** "Your lecture starts in
  minus twenty minutes" is noise, and the Now line already answers what is
  happening this minute.
- **Nothing twice.** The time it was mentioned is written on the block, so a
  restart is not a reason to hear about the same lecture again. Moving the
  block clears it, whether it was dragged here or moved in Google Calendar
  &mdash; the reminder already given was about a time that is no longer when
  this happens.
- **Nothing about a block you marked as not having happened.** That was you
  saying it is not happening; knocking afterwards is the app arguing.
- **Nothing that reaches back into yesterday.** A block at 00:05 with an
  hour's notice is mentioned from midnight, not at 23:05 the night before.
  Everything in the time-of-day layer clamps; nothing wraps.

What it says is the **real distance to the start**, not the setting. A machine
asleep through 08:50 and awake at 08:57 is told the nine o'clock lecture starts
in three minutes, because saying ten would be reading a setting back at you.

The check runs every thirty seconds rather than every five minutes like the
digest: ten to nine has to mean ten to nine, or the number in the setting is
decoration. A workspace that has not switched reminders on is not read at all.

## WhatsApp

Selling to schools in India, a principal answers on WhatsApp. Caulder's only
outbound path was email through a file bridge, which is the channel that gets
read least.

**The renderer never sees a URL.** It passes a lead id and a body of text; main
reads the phone number out of the database and builds the `wa.me` address
itself. The `attachments.open` pattern, and it matters more here because this
one ends in a browser.

**Sending is confirmed, never assumed.** Caulder cannot know whether the
message went — the window that opens is somebody else's — so it asks afterwards
and writes the timeline entry only if the answer is yes. One extra click on
something you were doing anyway, and the going-quiet list stays true. Same
standard as *"ticking a task is not proof the call happened"*.

A WhatsApp message **is** contact, so it moves `last_contacted_at` — the same
reason a call does and a note does not.

Templates carry a channel. A WhatsApp template is plain text with no subject
line, and it is offered here and never in the email composer.

## Do not contact

One flag on a contact, enforced where the reaching-out happens rather than by
hiding a button: opening an email and opening WhatsApp both refuse it in the
main process, whatever the screen shows. A flag only the screen respects is
not a flag.

Marked on the lead and on the board card, in the danger colour and bold —
acting on that card by mistake is the one error here that reaches a real
person.

## Settings

Eight cards in four groups, with a rail on the left to jump between them.
The groups are the four questions somebody arrives with:

| Group | Cards |
| --- | --- |
| **Workspace** | Companies (with each one's currency), pipeline stages, your own fields, email templates |
| **Planning** | Your words, reminders |
| **Desk** | Quick add from anywhere, Google Calendar and Tasks |
| **The app** | Appearance, your data |

Inside a group the cards pour into columns, because they differ in height by
a lot and a grid would leave a hole under the short one.

### Email templates

`{{lead.name}}`, `{{lead.greeting}}`, `{{lead.contact}}`, `{{lead.city}}`,
`{{company.name}}`. An unknown token is left exactly as written and flagged in
the editor, so a typo shows up here rather than in a real email.
`{{lead.greeting}}` falls back to "there" when no contact is known. A template
carries a channel: a WhatsApp template is plain text with no subject line and
is offered by the WhatsApp button, never the email one.

### Your words

What the quick-add line should know about this particular life: course names,
course codes, the company, a client, the gym you go to — each pointing at
College, Company, Personal or Health. Type the word, pick the area, **Teach
it**. One list for the whole app.

A word it already knows, in any case, is refused with where it already points
("CS301" is already a word for College), and moving one is removing it and
teaching it again — deliberate, so a word cannot quietly change meaning. How
the words are matched is under [Adding a task in one line](#adding-a-task-in-one-line).

Today's line reads the list as it opens and the capture window re-reads it
every time it comes back to the front, so a word taught a minute ago is
already understood there.

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
| `T` `D` `L` `P` `M` `I` `S` | Today, Calendar, Contacts, Deals, Money, Import, Settings |
| `/` | Jump to the lead search |
| `N` | Add a lead |
| `Ctrl + K` | Switch company |
| `?` | The shortcut list |
| `Esc` | Close whatever is open |
| `Ctrl + Alt + A` | The quick window, from any app (changeable in Settings) |
| `Ctrl + T`, `Ctrl + N` | In the quick window: a task, a note |

The `?` list reads the from-anywhere key live, so it shows the key actually
held — or says it is off — rather than a default somebody changed.

Every handler checks whether you are typing first — including
`isContentEditable`, not just the tag name. A shortcut that eats a letter
mid-sentence is worse than no shortcut.

---

## The day

A grid of hours for one day, and blocks laid on it. A list says what is
outstanding; it does not say whether it fits, and nine tasks against four hours
is the ordinary reason a day goes wrong.

A block is **not** a task. A task is *due on* a day; a block *occupies part of*
one. They are linked rather than merged — a block can point at a task, so the
timetable and Today are one body of work seen two ways — but a task with a
start time would still be a list, and a block in a list is just a row.

**A block can repeat.** Most of a student's week is the same week again — a
Tuesday lecture, the gym on Monday and Thursday, a club until the end of term —
and a planner that asks you to retype your own timetable every seven days is
one nobody uses twice. Pick the days and an end date on the same form.

Every occurrence is written as its own block rather than computed at read time.
The trade is rows for predictability: moving one week later is just dragging
that one, the Google sync needs no idea repeats exist, and Today and the
breakdown work unchanged. Ending a repeat clears the future and **leaves the
past standing** — the Tuesdays you sat through are history, not part of a rule
you have since cancelled.

**Overlap is allowed and drawn, never refused.** A day where two things clash
is a day worth seeing clash; rejecting the second one does not remove the
clash, it just means you keep it somewhere that cannot help you. Overlapping
blocks are packed into side-by-side columns by `shared/day.ts`, which groups
them into *transitive* clusters — A over B and B over C puts all three at one
width even where A and C never touch, because a width that changed halfway down
a stack would read as two separate stretches rather than one contended one.

Two smaller decisions worth stating:

- **A double-booked hour is counted twice** in the breakdown. Nobody plans two
  things at once meaning to do half of each, and quietly halving them would
  make a broken morning look like a light one.
- **Only today has a cursor part-way along it.** A day already past is entirely
  spent and one still ahead is entirely unspent; the two answers are opposite
  and neither is guessable from the blocks, so the service decides it.

### The week

The same screen, read seven days wide. The day grid answers "does this
afternoon fit"; the week answers the one it cannot &mdash; **where is the
space**. Two hours to write a proposal are found by looking across a week, and
pressing the next-day arrow six times is not looking.

- **A drag can cross a column**, which is the whole reason it earns its keep:
  moving Thursday's gym to Friday is one gesture rather than a form and two
  dates. Resizing is not offered here &mdash; the columns are a seventh of the
  width and an eight-pixel grip in one is a promise the mouse cannot keep, so
  that stays on the day.
- **Overlap is worked out inside a day, never across the week.** Tuesday at
  nine and Wednesday at nine are not competing for anything, and laying the
  week out as one list would halve the width of both.
- **The hour rail is the same one.** Both views draw from `features/day/grid.ts`,
  so an hour is the same height in both &mdash; the first thing anybody does
  with a week view is compare it against the day they just left.
- Every heading opens that day on its own, and carries what is planned on it,
  so a heavy Thursday is visible before you go looking.

The payload is deliberately thinner than seven days: no tasks, notes
or breakdown. Those are answers to questions you ask about one
day.

Blocks carry their kind in the fill and nothing else. There is no coloured rule
down the edge — against a soft surface a flat bar reads as a stray line rather
than as a marker, which is the same reason it came off the sidebar and the
alert cards.

## Notes

A thought, caught before it goes. Deliberately **not** an activity: an activity
must belong to a lead, and the whole value of catching a thought is that it
belongs to nothing yet. Making it pick an owner first is how the thought is
lost.

A note is also the other half of the quick window (see **The tray, and quick
add from anywhere**): Ctrl+N switches it to a note, Ctrl+Enter keeps it,
Escape throws it away.

## The tray, and quick add from anywhere

Caulder has an icon in the tray, by the clock. **Click it** and a small window
opens just above it, ready for a task — the same line as Today's, reading
the same way and asking the same questions — and gone again a moment after
the task goes in, or as soon as you click away. **Right-click** for the rest:
Add a task, Write a note, Open Caulder, Quit Caulder. The key is shown beside
Add a task, so the menu is also where you find out it exists.

**Ctrl+Alt+A opens the same window from any app**, where you are looking.
It is on from the start, because a key you have to find and switch on is a
key nobody uses — and it was chosen by trying the candidates on a real
machine: Ctrl+Alt+Space, the obvious one, was already held there by another
app. "A" is the key that opens quick add inside Caulder, so this is the same
key, from everywhere. In the window, **Ctrl+T** and **Ctrl+N** move between a
task and a note. The tray always opens on a task; the key opens whichever you
used last.

Settings, under **Quick add from anywhere**, shows the key as it actually
stands — held, or refused and why, because another app may have got there
first and believing in a key you do not have is worse than having none. A
new key can be claimed there, or the default put back, or it can be turned
off; off stays off across restarts rather than the default coming back.
Trying a key that turns out to be taken keeps the one that worked.

**Closing the window leaves Caulder in the tray**, the way Claude and most tray
apps do: the icon, the key and the reminders are all useless once the process
has gone. The first time, the icon says where it went. Opening Caulder again —
from the Start menu, say — brings the window back, and so does clicking a
reminder. A switch in the same Settings card turns this off, and then closing
the window quits Caulder outright — the quick window included,
rather than leaving the process running with nothing on screen.

**A second launch leaves at once.** It hands over to the running copy and
exits without running the quit handlers, which assume an app that finished
starting. It used to quit the ordinary way, before it was ready; a shutdown
handler then touched the global-shortcut API, which throws before "ready", and
the copy sat behind an error dialog — one stray process every time Caulder was
opened while it was already in the tray. `e2e/tray.spec.ts` now launches that
second copy and requires it to exit with code 0.

The tray icon is its own file, cut in close around the mark: the app icon's
tile is right for a taskbar button and far too much tile for a slot sixteen
pixels wide. `scripts/tray.py` derives every size the tray asks for from
`resources/icon.png`.

**Notifications are signed Caulder.** Windows labels a notification with the
app's AppUserModelID, not its window title, and unset that was Electron's
default — reminders arrived as "electron.app.Electron" with no mark.
`electron/main/identity.ts` sets the ID to the installer's own appId,
`app.paperkite.caulder`, so the Start menu shortcut and the running app agree.
It also registers the name and mark against that ID for the current user,
under `HKCU\Software\Classes\AppUserModelId`, because a copy run without the
installer's shortcut — from the project, or a portable build — has nowhere
else for Windows to read them from and would show the bare ID. Each
notification carries the mark too, from `resources/tray/notify.png`, cut the
same way as the tray icon.

## Google Calendar and Tasks

Two-way, for the day's blocks and for tasks, through a script that runs inside
your own Google account.

**Setting it up is five steps and they are written on the card**, in Google's
own words, rather than linked to. Three of them have a correct answer that
looks wrong, which is exactly why they are spelled out: you add two services by
hand, you run a function in order to be *asked* for permission, and you set the
deployment's access to "Anyone" — which is safe because the URL is unguessable
and nothing happens without the key, and which is necessary because Caulder is
not signed in to Google at all. That is the whole point of the arrangement.

What the sync will and will not do:

- **A block Caulder made is Caulder's; an event you made in Calendar is yours.**
  When both sides changed, the owner wins and the screen says how many times
  that happened. Last-write-wins is what quietly destroys whichever side was
  edited first.
- **Deleting here deletes there.** Once the row is gone nothing is left to say
  the event should go too, so a deletion writes a tombstone that outlives it —
  and the tombstone is cleared only after Google has actually been told.
- **A tick is never undone.** A task completed on either side stays completed.
  Having Google reopen something you finished is the one behaviour that would
  end anybody's trust in this immediately.
- **All-day events are ignored.** A block occupies hours; an all-day event has
  none to occupy, and turning one into a midnight-to-midnight block would fill
  the grid with something nobody put there.
- **Only a window is looked at** — a fortnight back, six weeks forward — and
  anything outside it is untouched. Google's silence about March is not a claim
  that March is empty.
- **A task list is read to the end before anything is deleted.** Google returns
  a page at a time, and the first version of this read one page and treated
  everything it had not seen as deleted — so a list of a hundred and one tasks
  would have lost its tail on every sync. The script now follows the pages and
  says whether it finished; nothing is dropped on an unfinished answer.
- **A completed task is never deleted here**, however complete the listing.
  Google prunes finished tasks out of a list after a while; obeying that would
  delete the record that you did the thing.
- **Two workspaces cannot share a calendar or list.** Each would see the
  other's items as somebody else's, adopt them, push the copies back, and adopt
  those in turn. It is refused rather than warned about, because by the time
  the loop is visible there are already four of everything.

**Keeping it in step** is a switch, off until asked for. On, it syncs every ten
minutes and about half a minute after anything changes here — so a task written
in Caulder is on the phone before the phone is back in a pocket. When it starts
failing it slows down rather than hammering Google, and after about two hours of
that it stops and leaves the reason on the Settings card. An automatic sync
without that story is one that quietly shows stale data forever.

## Priority, and what to do now

Three levels, named rather than numbered — everybody's one-to-five scale drifts
within a week. **Has to happen**, **should happen**, **if there is time**,
defaulted by kind so nobody sets one twice a day: a class and a meeting are
things you turn up to, a break is what gives way.

**When two things clash, Caulder says which to be at — unless they are equal,
and then it refuses.** It does not know whether the client or the exam matters
more once you have called both "has to happen", and an app that guesses at that
and presents it as advice is worse than one that says nothing. The lesser of
two is dimmed on the grid; two equals are both marked as clashing and left to
you.

The **Now line** at the top of Today is the point of all of it: what you should
be at this minute, what it is losing to or clashing with, and what is next.

## Semesters

A **timetable** goes in as one action. Each row is a class — its days, its time,
its length — and one button turns the week into a term. Every row becomes its
own repeat, so a single lecture can move later without disturbing the rest, and
"the Tuesday lecture is at ten now" edits that run alone and **only from today
forward**. The nine o'clocks already sat through happened at nine; rewriting
them would be falsifying a record to tidy a rule.
