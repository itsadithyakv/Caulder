# What Caulder does

Ten screens, eight rows in the sidebar, one workspace per company.

**The sidebar is four groups and Settings.** *Plan* is Today and Calendar;
*You* is the Journal and Life, the founder's own; *Sell* is Contacts, Deals
and Money; *Company* is the Brain. Import has no row: it is a button on
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

### The setup guide

A real company opens on it; a look round with sample data does not. Caulder
itself needs no setting up - one file on this machine, nothing to sign in to -
so the guide is about the two things that live in somebody else's console,
and it says so first:

1. **Google: your calendar, your tasks, your email.** Why it is a script in
   your own account rather than a sign-in, then the steps in the order
   Google's own menus say them - copy the script, open Apps Script, add the
   Calendar and Tasks services, run *setUp* and allow it, deploy as a web app
   *Execute as me / Anyone*, paste the URL and the key. The same card as
   Settings, with its steps already open.
2. **An AI, to ask the brain.** The services, what each costs, and the steps
   for the one picked. Gemini is free and first.
3. **Your contacts.** Import a spreadsheet or paste a list, or add one by
   hand.
4. **What the company knows.** The brain's *write these down first*, and what
   the company pays for, which is what makes renewals appear on Today and the
   runway add up.

*Skip this for now* and *Done, take me to Today* both leave; **Settings →
Connections** has the cards again and a way back to the guide. Settings sits
at the foot of the sidebar, under everything else.

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

- Switch with the sidebar header. (**Ctrl + K** is search.)
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

The home screen, and the reason the app is worth opening: the first screen
for all of it. One line at the top that takes anything; the work in the order
it needs attention, each section only when it has something in it; and beside
it the life half of the day - **your level** in one line (the level, the XP
to the next, a thin bar, and what the last seven days added; it moves the
moment a task is done or a habit ticked, says *Up to level 4* for a moment
when one is crossed, and opens Life), **Journal** (how today felt, in one
press, and its first words), **Habits** (today's ticked in one press, each
with its run of days) and **Your week** (the next exam, the hobbies' time this
week against what they are wanted, the goal whose day is nearest) - then
replies, the contacts going quiet, what is coming, and notes.

### The line that takes anything

On Today the quick line is **smart**: type anything, and it says where it
will go before it goes, from what Caulder already knows - the contacts' names,
the hobbies, the words that say when (`shared/capture.ts`, no model). Under
it, **Goes to** has its guess pressed and every other sensible place a click
away; **Keep** (or Enter) puts it there.

- **A task** - a when, or an instruction: *finish the DBMS assignment by
  Friday*, *submit the form*. Everything below about tasks applies. Naming a
  contact - *call Oakridge tmrw 11am* - makes it that contact's task.
- **A contact's history** - a contact named with something that happened:
  *Called Oakridge, they want a demo next week* is logged on them as a call
  (a meeting for *met*, a note otherwise), which moves *last contacted* the way
  logging it on their page does.
- **Time on a hobby** - a hobby named with a length or a verb of doing it:
  *guitar 40 min* is kept on the Calendar as forty minutes that ended now, and
  counts for the hobby like time set aside and kept. Without a length it asks.
- **The journal** - the first person, a feeling, a day looked back on: *rough
  morning but shipped the pricing page* goes under *Today* in today's entry,
  made if there is none.
- **An idea** - *what if…*, or *idea:* - is a page in the brain's Ideas.
- **A note** - anything it is unsure of, kept at the foot of Today to file
  later: nothing is lost by the line being unsure.
- A prefix says so outright: *journal:*, *idea:*, *note:*, *task:*.

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

### Things to pay for

Between the late invoices and the late tasks: running costs that renew soon,
or should have already - a domain a month ahead, a quarterly bill two weeks
ahead, a monthly one three days ahead, so a monthly bill is not on Today all
month. Each says what it costs and when (*renews in 3 days*, *was due 2 days
ago*), opens its page, and has **Paid** (see *Running costs and runway*
under Money). An overdue one turns the card to the alert tone.

### Deadlines

After the things to pay for: filings and payments from the filing calendar,
a contract's notice day and end, a registration's or trademark's renewal, a
document's expiry, and the day somebody's contract, internship or job ends or
their vesting cliff arrives - anything late, and anything inside its notice. A
filing shows as many days ahead as it asks for (five for GSTR-1, a month for
the income tax return); a date on a page or a document shows from a month
ahead to a week after. Each row says what it is for (*For Aug 2026*) and how
near it is (*due in 3 days*, *2 days late*). A filing has **Done**, which
marks that one done today; the next comes round on its own. The rest open
their page, or the brain's Documents. Anything late turns the card to the
alert tone. See *Deadlines* under the company brain.

### Overdue, then due today

Overdue comes first, in its own alert card, the oldest first.

A call task with a contact on it has a **Call** button, which opens the
prompter (see *Calls*); saving the call ticks the task off.

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

- **Only contacts with an open main deal are in.** A closed deal is not
  being neglected, and a contact with no deal - an accountant, a vendor - is
  somebody you know, not a sale going cold.
- **A lead with any open task is out**, whatever its date. If you have already
  decided what happens next, nothing is falling through — an overdue task is
  the right way to hear about it, and it is already section 4.
- **Editing a field is not a touch.** Fixing a typo in a phone number cannot
  make a lead look alive. Nor is a call from the prompter that nobody
  answered: ringing is not hearing from them. (A call logged by hand in the
  history still counts, since it does not say.)

The clock starts at the lead's creation, so a new lead is never instantly cold.

### Replies

Replies to email sent from Caulder in the last seven days, newest first, at the
top of the side column. Each opens its contact. Out-of-office answers never
appear here: the script does not count them as replies.

### Notes, at the foot

A thought caught by **Ctrl+N** in the quick window, or written in the box at
the foot of Today, lands here. Notes have no screen of their own any more: a
note is a thing you have on a day, not a place you go.

A note worth keeping can be **filed in the brain**: pick a section (Ideas by
default) and it becomes a page there, titled with its first line. The page is
written before the note goes, and *Undo* puts the note back, pinned if it
was.

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
Right: next steps, deals, email, WhatsApp, money, then history. The history is
the reason to open a lead, and it used to sit under four other cards. **Call**,
at the top beside *Edit details*, opens the prompter (see *Calls*); it is off
for a contact marked do not contact.

**Who they are.** Every contact has a relationship: prospect (the default),
customer, vendor, partner, advisor, investor, accountant or candidate. It is
on the form and the page, and the list filters by it. A new prospect or
customer starts with a deal; anybody else starts without one, so an
accountant is never a stale deal. A prospect whose deal is won becomes a
customer; nothing turns a customer back.

**Deals.** What is being sold to this contact, one row each: the title, the
value, the stage as a picker, and a delete. A school that buys twice has two.
Click a title to rename it or change its value; **Add a deal** starts another,
in the first stage. Moving one into a lost stage asks why, with the usual
reasons and a skip. Deleting a deal leaves its quotes and invoices with the
contact.

The contact is summed up by its **main deal** - its open deal touched last,
or the last one touched when none is open. That is the stage in the page's
header, the stage and value in the table, what the table sorts and filters
by, and what *Going quiet* reads. With one deal, the form's Stage and Value
edit it, and a deal named after the contact follows a rename. With several,
the form says so and leaves them to the Deals card.

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
so what you approve is exactly what goes.

**With the Google script connected**, Caulder sends it:

- **Now or later.** *Now* sends while you wait, so a mistake — a used-up daily
  quota, a bad address — comes back on the screen. *Later* takes a day and a
  time up to sixty days ahead; the script holds the message and sends it with
  your laptop shut.
- **With one follow-up, if you want it.** Pick a template and a number of days.
  If nobody has replied by then, the script sends it in the same thread; the
  moment they answer, it is dropped.
- **Every message is listed** under the composer: scheduled, sent, replied, or
  why it did not go, with the follow-up's state under it and *Cancel* while
  anything is still waiting. *Check for replies* asks the script now rather
  than at the next ten-minute check.
- **The history says what happened**, once each: the email as sent, the
  reply, a bounce, the follow-up. A send and a reply both move last-contacted.
- **The address is never the window's to give.** The page names the contact;
  main reads the contact's own email.

**Without it**, *Open in your mail app* hands the message to whatever handles
mail on this machine and then asks one question: *did it go?* Yes writes an
entry on the history and moves last-contacted; no writes nothing. The same
shape as WhatsApp, and for the same reason: Caulder cannot see whether it went,
so it never claims it did. With the script connected this stays on offer as
*Open in my mail app instead*.

A contact with no email address, or marked do not contact, says so instead
of showing a dead button; if the script is missing or too old, the section
says so and what to do.

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

Called **Deals** in the sidebar. The funnel as a board: **one card per deal**,
so a contact with two deals has two cards. One column per stage, plus
**Unstaged** when a deleted stage has left deals behind.

Each column shows a count and a value total. Cards show the deal, then the
contact when the deal is called something else, the contact person and city,
the value, when you last spoke, and **whether a next step is set** — the drift
signal from Today, surfaced where the work is looked at. Opening a card opens
its contact, where the deal is listed.

Move a card by dragging it, or with the **Move menu** on the card. The menu is
not a fallback: it is faster than dragging across seven columns and it is the
keyboard path. Every move writes a stage-change entry on the contact's
history — the stage, or "Deal: Stage" once there is more than one deal — so
the board explains itself later.

A vendor or an advisor is a contact, not a deal, and has no card unless you
give them a deal. Winning a prospect's deal makes them a customer.

A move into an open stage plans a follow-up when nothing is planned for the
contact (see *The built-in follow-up*); a move into a lost stage asks why.

Columns render at most 100 cards; the count above is always the true total,
because Won and Lost grow without limit.

### Editing the funnel

In Settings: rename inline (applied on blur, so a half-typed name is not
rejected), reorder with up/down, change what a stage *means*, add and delete.

Deleting a stage **never deletes deals** — they fall into Unstaged. The last
stage cannot be deleted.

---

## Calls

**Call** on a contact's page, or on a call task on Today, opens the prompter
over the whole window.

- **Across the top**: who, the number in large type, **Dial** (which hands the
  number to whatever places calls on this computer - Phone Link, Teams, a
  softphone - and starts the clock), a copy button, the other number if there
  is one, and the clock itself. Dialling from a phone instead? *Start the
  clock* does the same without dialling.
- **On the left, before you speak**: *Keep in mind* (the contact's notes,
  editable), the deals - pick which one the call is about when there are
  several - and the last five calls with how they went.
- **On the right, the script**, filled in for this contact: the opening, why
  you are calling, the questions (each with a box for the answer, ticked once
  answered), the pitch, *If they say…* as a row of objections to tap for the
  answer, the close, and the voicemail tucked away until needed. A fill-in
  still in square brackets - `[your number]` - is highlighted so the gap is
  seen before it is read out.
- **Along the bottom**, notes as you talk, and **End the call** (Ctrl + Enter
  from the notes).

Ending the call turns the same window into the wrap-up:

- **How did it go**: didn't pick up, busy, left a voicemail, wrong number, or
  spoke to them. Having spoken, **how interested** on a five-step slider - not
  interested, unlikely, maybe, interested, keen.
- The notes and the answers, and **Keep in mind next time**.
- **The next step**, suggested from the outcome - call again tomorrow after a
  miss, follow up in two days when they were keen, a week when they were
  lukewarm, nothing after a no - and **where the deal goes**: nowhere after a
  miss; on from the first stage after a conversation; to *Interested* (or
  whatever stage has that in its name) when they were; to lost, with a reason
  to pick, when they were not. Won and lost deals are left alone and nothing
  moves backwards. Every suggestion can be changed.
- **Save the call** writes all of it at once. Only a conversation counts as
  contact; a missed call does not move *last contacted*.

Closing with anything typed asks first. Letter shortcuts are ignored while
the prompter (or any dialog) is open, so a key pressed on a button cannot
change the screen behind it.

### Call scripts

A script is a page in **Brain → Playbooks**. *Add a call script* offers four
starting points - **warm, professional, direct, consultative** - each a
complete script with objections and a voicemail, and each the founder's to
rewrite. The prompter offers the same four when there is no script yet.

The prompter recognises its parts by their headings: *Opening*, *Why I'm
calling*, *Questions to ask* (each list line a question), *The pitch*, *If
they say…* (each `###` an objection, the text under it the answer), *Closing*
and *Voicemail*. Any other heading is shown as written. It fills in
`{{lead.greeting}}`, `{{lead.name}}`, `{{lead.contact}}`, `{{lead.city}}`,
`{{company.name}}`, `{{me.name}}` (the script's *Who is calling* field) and
`{{company.oneliner}}` (from the company profile). A script's tone is a field
on the page, shown beside its name in the prompter's picker, which starts on
the script used last.

Because a script is a page, it is in search, in the export, on the Map, and
has its history like any other.

---

## Money

Is the company making money? Four numbers for the month at the top: quoted,
invoiced, paid, spent. A target underneath, per month, set from the same
card. Then three lists as tabs.

- **Invoices.** A contact, a few lines, an issue date and a due date. For a
  contact with several deals, which deal it is for; otherwise it goes on the
  contact's deal without asking. Draft
  until you mark it sent. **Mark paid** records a payment for whatever is
  still owed, dated today; **PDF** writes the invoice to a file, attaches it
  to the contact and opens it. The PDF is headed with the legal name, address
  and GSTIN from the brain's company profile, and ends with the bank account
  marked for invoices. A paid invoice stays paid unless the payment is
  removed; void is for one that should never have existed. Draft invoices can
  be deleted, sent ones only voided, because a number once used is used.
- **Quotes.** The same document without a due date. **Accepted** makes the
  invoice for the same deal, due a fortnight on, and gives the deal the
  quote's total if it had no value.
- **Spend.** What went out: date, what for, amount. Anything the company paid
  for. Negative is a refund.
- **Products.** What the company sells, what it asks, and what it has
  actually brought in. See below.
- **Running costs.** What the company pays for again and again, and how long
  the money lasts. See below.

**Paid is derived from payments, never typed**, and **overdue is worked out
when read, never stored** — a sent invoice past its due date. Every write
returns the whole overview, so a payment updates the invoice, the paid figure
and the overdue list in one read.

A row names the deal beside the contact when the deal is called something
else. A contact's page lists what they have been quoted and invoiced,
read-only, with a way into Money, and names the deal once there are two. **Export everything** writes `quotes.csv`,
`invoices.csv`, `payments.csv` and `spend.csv` beside the rest.

### Products and pricing

**The catalogue** lists every product with the price that applies today, the
margin on it against what one costs to make, and what it has been invoiced
for so far. *Add a product* takes a name - kind (a service, something made, a
subscription), where it is up to (an idea, being built, selling, retired),
what it is sold per, what one costs, the GST rate and the HSN or SAC code,
and notes are all optional - and opens it.

A product's page has four parts:

- **The facts**, editable, and a delete that leaves every invoice its lines
  and its money.
- **The price book.** What it asks, and when it asked it: a name for the
  price (*Standard*, *Schools*, *500+ students*), an amount, how often it is
  charged (once, a month, a quarter, a year), and optionally the days it
  applies. A price that changes is a new row, so what was charged before
  still makes sense. The one that applies today is marked *Now*: a dated
  price wins over an undated one while it applies, and between two dated
  ones, the one that started later. Each shows what is left after the cost.
- **What it has brought in**: how many were sold, invoiced for how much, the
  margin, and when last - from invoices that named it, drafts and voids left
  out.
- **What it was charged at** and **who bought it**, newest and biggest first,
  each contact a link. What was charged can differ from the price book, and
  that difference is the point of keeping both.

**On a quote or an invoice**, *From the catalogue* lists what is selling
(then what is being built, then retired; never an idea) with today's price,
and a pick fills a line - the first empty one, or a new one - with the
product's name and price. The line is its own from then on: change the words
or the price for this customer and the catalogue is untouched. A small chip
under the line says which product it counts as, with an × to stop counting
it. Accepting a quote carries the products to the invoice.

The brain's *first product and its price* is ticked by a priced product here,
and opens this tab. The brain's **Products and pricing** section is now for
the thinking around them - how you price, who it is for, what you will not
build - as ordinary pages; what used to be product pages became products
(PLAN.md, phase 8).

### Running costs and runway

**A running cost is a page in the brain**, not a row typed here: a **tool**
(cost, billed monthly, yearly, once or free, renews on), a **domain** (cost a
year, renews on), or a **running cost** in Money plan for anything else -
rent, salaries, a retainer - with an amount, how often (monthly, quarterly,
yearly, once), when it is next due and what kind of cost it is. *Add a
running cost*, *Add a tool* and *Add a domain* on the tab open a new page to
fill in; clicking a cost opens its page. Archiving the page stops the cost.

The tab lists every cost with what it comes to a month, the total, and when
each renews. A cost that falls soon has **Paid**, which writes it on the
spend list and moves its date on a cycle (a one-off loses its date); the page
keeps a version for the move.

**Runway** sits above the list. *Say what is in the bank* takes an amount and
the day it was true, kept each time so earlier balances can be looked back
at and deleted. From the latest, and the rate money goes out:

- **running costs** a month,
- **other spending** a month, averaged over the last three whole months (or
  as many as the company has had) and leaving out what paid a running cost,
- less **paid in** a month, averaged the same way,

gives the **burn**, and runway is the balance over it: *about 7 months*, and
the month it runs out, counted from the balance's day. Under six months it
is shown in the warning colour; with more coming in than going out it says
*Not burning*. The same line sits under the month's four figures and opens
the tab.

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

A contact's files are documents that belong to the contact, so they are also
in the brain's Documents with the contact's name beside them, and go when the
contact is deleted. An invoice PDF is filed on its contact as *Invoice sent*.

## Reminders

Two of them, in one card in Settings, answering different questions.

**Tell me when something is overdue** is the daily digest. One desktop
notification a day, never before nine in the morning **where that company is**,
and only when something is actually overdue: a task due before today, a
filing due today or late, or a contract's notice day or a document's expiry
that is today (*3 to see to in Unifloe*). Checked on a timer rather than
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
itself. The `documents.open` pattern, and it matters more here because this
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
hiding a button: sending an email, opening one in your mail app and opening
WhatsApp all refuse it in the main process, whatever the screen shows. A flag only the screen respects is
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

- **Export everything** — CSVs for contacts (with the main deal's stage and
  value), deals, history, calls, tasks, products and their prices, quotes and
  invoices (with the product each line was), payments, spend, cash balances,
  the filing calendar, each filing done and for which period, documents,
  people (with pay, equity and vesting, and the candidates), the roles being
  hired for and templates, the brain as Markdown (numbers masked),
  the whole company as four documents for an AI (`dossier/`, masked),
  plus a copy of `caulder.db` and a README explaining how to put it back. The database copy is the part that matters:
  CSVs lose the links between records. The copy is taken with SQLite's own
  backup, so it includes the newest changes, and a CSV cell that a spreadsheet
  would run as a formula is written with a leading apostrophe.
- **Back up now**, and the ten most recent backups listed with date and size.
  One is taken automatically on every launch.
- **Restore** any of them. Before anything changes, the backup is checked:
  it has to be an intact Caulder database made by this version or an older
  one. The current state is then copied aside, so restoring the wrong one is
  itself undoable, and the window reloads afterwards. A database a newer
  version has opened is refused at launch for the same reason.
- The database path is shown, with the advice to copy that file elsewhere now
  and again.
- **Open the log folder.** When something goes wrong — a screen that fails to
  draw, a database error, a background sync that breaks — Caulder writes it to
  `logs/caulder.log`. A screen that fails shows *This screen hit a problem*
  with *Reload Caulder* and *Go to Today*, and the sidebar stays.

### Appearance

Match system, Light or Dark. See [design-language.md](design-language.md).

---

## Keyboard

Single letters, so they stay out of the way while you are typing. Press **?**
for the list.

| | |
| --- | --- |
| `T` `D` `L` `P` `M` `B` `I` `S` | Today, Calendar, Contacts, Deals, Money, Brain, Import, Settings |
| `Ctrl + K` | Search everything, from anywhere, even inside a field |
| `/` | Jump to the lead search |
| `N` | Add a lead |
| `?` | The shortcut list |
| `Esc` | Close whatever is open |
| `Ctrl + Alt + A` | The quick window, from any app (changeable in Settings) |
| `Ctrl + T`, `Ctrl + N` | In the quick window: a task, a note |

The `?` list reads the from-anywhere key live, so it shows the key actually
held — or says it is off — rather than a default somebody changed.

A screen the shortcut asks for acts once. Moving to another screen clears any
request left over, so a contact opened from Today opens that contact even if
**N** was pressed earlier in the day.

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

**Due today** beside the grid starts with what falls due that day - a filing,
a contract's notice day, a certificate's expiry - as chips, done or not, with
**Done** on a filing that is not; then the tasks.

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
  so a heavy Thursday is visible before you go looking - and what falls due
  that day, green once it is done. A deadline has a day but no hour, so it
  goes on the heading rather than in the lane.

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

## You: the journal and Life

The founder's own, apart from the company: a group of its own in the
sidebar, **You**, under Today and the Calendar. See PLAN.md, part four.
Everything here stays on this computer - never shared with a co-founder,
never in a data room, a handbook or an export for an assistant.

### Journal

**Journal** (key **J**) opens on today, ready to write. There is no Edit and
no Save: what is typed is kept a moment after the typing stops, and the
corner says *Writing*, *Keeping it*, *Kept*. Above the text, **how the day
felt** - Rough, Low, Okay, Good, Great, each a face and a word - is one
press, and pressing it again takes it back. `[[` links a page, a contact, a
product, a person or a document, as anywhere in the brain.

- **An entry is made by writing in it**, a word or a face; opening a day does
  not make one. One entry a day.
- **The day in Caulder**, under the entry: the tasks done (with their area),
  the calls, the hours kept by kind (blocks not skipped, and today only the
  ones already over), the notes caught, the money paid in, the pages written
  and the contacts added - in the company's own day, so a task done at eleven
  at night is that day's.
- **The month**, beside it: a face for each day written, a dot for one
  written without a mood, the open day ringed; any day that has been can be
  opened, a day to come cannot. Under it, the run of days written - a
  sentence, not a streak to protect, and still counting while today is not
  written yet - and **On this day**: the entries a week, a month and a year
  ago.
- **Elsewhere**: a *Journal* card at the foot of Today's side - the day's
  mood in one press, and *Write about it* - and a *Journal* line at the top
  of each past day on the Calendar. A caught note filed into *Journal* joins
  the entry for the day it was caught.

### Life

**Life** (key **Y**) is habits, studies, hobbies and goals, a tab each, and an
**Overview**: the vision board, your level beside the last seven days,
achievements, and then the exams coming, how far along each goal is, and the
time the hobbies actually got - or, with none of those yet, where to start.
The pages open here, with the way back to their tab; opened from anywhere
else - search, a link, Today, the Calendar - they come here too.

- **The vision board**: pictures and words for what the year is for. *Add a
  picture* takes a photo, a PNG, a WebP, a GIF or an AVIF; so does dropping
  one on the board, or pasting one anywhere on Life while the cursor is not in
  a box. It is made smaller before it is kept - 1,400 pixels on its long side,
  as WebP - and asks for its words, an area and a goal, all optional, before
  it goes on. *Add words* makes a tile of words alone, large, on its area's
  tint. Drag a tile to move it; each tile's menu (shown on hover or focus)
  has *Change*, *Move earlier*, *Move later* and *Take it off*. A goal on a
  tile opens the goal. The pictures are in the database, so a backup carries
  them; the board is yours alone, like the rest of Life.
- **Your level**: every point is something that happened - a task done (10),
  an hour kept (15, by the minute), a call (10), a habit ticked (5), an entry
  written (10), an invoice paid (50), a deal won (100), a goal marked done
  (150). Levels start at 100, 300, 600, 1,000 - each a hundred more than the
  one before. The card shows the level, the XP to the next, what the last
  seven days added, and where it all came from. Nothing is stored and nothing
  is given for opening the app: untick a habit and its five points go.
- **The last seven days**, across college, the company, yourself and your
  health: a bar each of the XP it got, with the time kept and the things done
  in words, and a sentence naming any part of your life nothing happened in.
  Time kept is placed by what it was for - a course's or an exam's time is
  college, a hobby's personal, a goal's its own area, a task's its area -
  and otherwise by its kind: class and studying are college; deep work,
  meetings and admin the company; personal, personal; a kind called gym,
  exercise, health, workout, sport or run, health. A break is rest, and
  counts for nothing.
- **Achievements**: sixteen, from *Off the list* (a task done) and *First
  money in* to *A week written* (an entry every day for seven days), *Seven
  in a row* (a habit on seven of its days running), *All of it* (something for
  all four parts of your life in one Monday-to-Sunday week) and *A hundred
  hours*. Each earned one says the day it was earned - worked out from when
  the thing happened, so it never moves - and the next few within reach show
  how far along they are.

- **Studies**: a *course* (code, term, taught by, credits, status, grade, and
  grade points), an *exam* (on, at, counts for, result) and *class notes*.
  **Add an exam for it** and **Write class notes for it** on a course make the
  page with a link back, which is how the course knows its exams (an exam
  whose title names the course's code counts too). The tab shows the exams
  coming, each course with its next exam and the study time it got in the
  last four weeks, and **the average**: grade points weighted by credits, on
  whatever scale the university uses. An exam reaches Today and the Calendar
  a month ahead like a filing, and leaves Today the day after it.
- **Hobbies**: status, hours a week wanted, what it is working towards. The
  tab sets an average week of the last four against the hours wanted, as a
  bar, with what is set aside this week.
- **Goals**: area (college, company, personal, health), a day, and a number
  to reach with how far along it is - a bar where there is a number, a
  sentence where there is not. Done ones sink to the bottom.
- **Steps become tasks in their area.** `- [ ]` lines on a course, an exam,
  class notes, a hobby or a goal become tasks once each, as a meeting's
  action items do: college for studies, personal for a hobby, the goal's own
  area for a goal. Without a date of their own they are due a week on - the
  day before the exam for an exam's revision.
- **Habits**: a name, an area and its days - every day to start with.
  Ticked on Today, today or any day of the week before it; the tab shows each
  one's run of days and its best, how often it was kept over the last four
  weeks, and the last twelve weeks as a grid - filled for a day kept, an
  outline for one missed, nothing for a day it is not for. A day it is not
  for never breaks a run, and neither does today before it is over. *Put
  away* takes one off Today and keeps its ticks; deleting takes them too.
- **Time for it**, on a course, an exam, a hobby or a goal: days, a time, a
  length and an end - the day before the exam, the goal's day, a term for a
  course - which is a repeat on the Calendar tied to the page. It starts
  today if today's time is still to come. The card says what is set aside,
  what is next, and what the last four weeks kept of it; **Stop** ends the
  repeat and keeps what happened. On the Calendar such a block says what it
  is for, with **Open the page**.

## The company brain

Everything about the company that is not a list of work - the plan, the
prices, the registrations, who works here, why a decision went the way it
did - in one place, on its own row (**Brain**, key **B**, in a *Company*
group above Settings). See PLAN.md, part two.

### Sections, pages and templates

Fifteen sections down a rail on the left: Company, Plan, Products and
pricing, Money plan, Tax and compliance, People, Customers and market,
Playbooks, Legal and contracts, Tools and accounts, Decisions, Meetings,
Metrics, Documents, Ideas. Each opens with one paragraph on what belongs in
it, the kinds of page it offers, and the pages it has. A section is a filter,
not a level: a page is Brain, then the page. Pressing *Brain* in the sidebar while already
in it goes back to Brain home, the way *Contacts* goes back to the list.

**A page is a title, a few fields, and text.** Its template decides the
fields - a bank account has a bank, an account number and *Print on
invoices*; a risk has likelihood, impact and who watches it - and starts the
text with the questions worth answering. Fields are few on purpose: a value is
a field only when something reads it. *Add a blank page* works in every
section.

- **Some pages a company has one of**: the profile, the brand kit, the
  one-page plan, the cap table and the accountant. Their button opens the one
  that exists.
- **Read by default, edited on purpose.** *Edit* opens the fields and the text
  together; *Save* (or **Ctrl + S**) writes a version. Leaving with unsaved
  changes asks first. A page nobody has written yet opens ready to write.
- **The text is Markdown**: headings, lists, quotes, tables, bold, links to
  the web. `- [ ]` makes a step that can be ticked while reading, which saves
  at once - a playbook is followed with the page open.
- **Pin** a page to keep it on the home page; **Archive** it to take it out of
  the way and out of search; **Delete** removes it and every version.

### Numbers kept masked

The PAN, the TAN and bank account numbers are **encrypted by Windows** and
shown as `•••• 4821`. *Show* displays one for twenty seconds; *Copy* puts it
on the clipboard from the main process and wipes it after thirty. Editing a
page without touching one keeps it; *Change* and *Remove* are deliberate. If
Windows cannot encrypt, Caulder refuses to keep them rather than storing them
as text. Passwords are never stored: a tool's page says which password
manager holds the login.

### History

Every save is a version. Saves a few minutes apart count as one, so the list
is sittings rather than keystrokes. *History* lists them; any two can be
compared side by side, text and fields, and *Put the first one back* makes an
old version the newest - so nothing is lost by doing it.

### Links

**Type `[[` in a page** and a list opens at the cursor: the pages, contacts,
products, people and documents whose names contain what follows, each saying
what it is - *Product*, *Person · CEO*, a section, a city - in the colour of
its dot. Enter or Tab puts the link in; Escape closes the list and nothing
else. *Link to something* above the text does the same without typing the
brackets.

- **A link is stored by id.** In the text it reads `[[Workshop|product:…]]`;
  renaming what it points at renames the link everywhere it is shown, and
  opening a page for editing brings the words in its links up to date.
- **On the page, a link is a chip** in the colour of its dot on the Map, and
  clicking it opens the thing **where it lives**: a page in its section (or on
  Life, or the journal on its day, when it is your own), a contact on
  Contacts, a product on Money's Products tab, a person in People, a document
  in Documents. Nothing is copied into the brain to be linked.
- **Deleting what a link points at** leaves the words, struck through and no
  longer a link. Nothing else in the sentence changes.
- **Linked here**, under every page and on every contact, person and product,
  lists the pages that link to it and draws a small map of what is around it
  with its own dot ringed. *How far out* takes it one, two or three links out;
  two to start.
- **A task a page made says so.** A meeting's action items and a playbook's
  steps become tasks; on Today each says *from* the page, which opens it. A
  block of time set aside for a page says which page, the same way.
- In an export, a link to a page is a relative link to that page's file, and
  a link to anything else is its name in bold.

### The Map

**Map** on the brain's rail, and a small live copy on Brain home. It is the
whole company, not only its pages: every page, every product, everybody on
the team, the company's documents, and every contact something reaches
(*Every contact* shows the rest). Every link is a line - the ones written with
`[[`, and the ones Caulder already knows:

- a person who is also a contact, to the contact;
- a product, to each contact it was invoiced to, from the first invoice;
- a document, to the contact or the page it belongs to.

A candidate for a role is on the map only when a page is about them, and a
sent or received invoice only when a page links it: a map of every PDF is not
a picture of the company.

It works the way Obsidian's graph does.

- **The map fills its pane**, and everything else floats over it: *Find on
  the map* and the kinds top left, *Fit*, *As a list* and *Display* top
  right, *Replay* along the foot.
- **Colour says what a dot is** - Pages, Decisions, Contacts, Products,
  People, Documents, and **Your own** in grey: the journal, studies, hobbies
  and goals, which are on your map and nobody else's. The kinds are the
  legend: a colour, a word and a count each, and switching one off takes
  those dots away and fades its colour in the legend, so the legend stays
  whole.
- **Size says how linked it is.** What the company revolves around is the
  biggest thing on the screen.
- **It settles, then stops,** and every dot's place is kept, so it is the
  same map tomorrow. A map opened again only breathes; a new one finds its
  shape and zooms to fit as it does - never past a little over its own size,
  so a map of four dots is four dots, not four balloons. Under reduced motion
  it appears already settled.
- **Hover** a dot and what it is linked to stays lit while the rest fades,
  in and out rather than at once; the lines to it take the accent colour.
  Names grow in as you zoom, the busiest dots' first, and always for what is
  lit. **Click** opens it where it lives.
- **Drag** a dot and its neighbours come with it, the whole map giving way
  as you move; let go and it settles back among them. **Hold Shift as you let
  go** to pin it there instead. A dot already pinned stays where it is put;
  double-click a pinned dot to let it go. Scroll to zoom, drag the background
  to move, *Fit* to see everything again.
- **Display** is the panel of controls:
  - *Show*: dots with no lines (the orphans), every contact, and arrows the
    way links were written;
  - *Looks*: when names show, dot size, line thickness;
  - *Forces*: push apart, line length, pull to the middle - the map moves as
    they do;
  - *Back to how it started* puts them all back.

  They are kept on this computer, with the kinds switched off.
- **Find on the map** fades everything whose name does not match.
- **Replay** grows the map in the order things were made and linked; the
  slider goes back to any moment, *Back to now* returns.
- **As a list** is the same map for the keyboard and a screen reader: every
  dot, what it is, and what it is linked to, each one a button that opens it.

### Brain home

**Ask the brain** first (see below), then the company in one card (name, one-liner, entity, registration numbers
masked), then **Write these down first**: twelve things, about fifteen
minutes, with a ring that fills as they are written - the one-liner; entity
type and incorporation date; registration numbers; founders and who owns
what; the equity split; the first product and its price; GST status; the bank
account the invoices print; the accountant; the tools you pay for; this
quarter's three goals; the biggest risk. Each is ticked by the page that
answers it, never by pressing a box, and each opens that page. Beside it:
**Coming up** (the next five deadlines, or the way to set up the filing
calendar), pinned pages, the recently written ones, a small live map, and
**Export the brain** and **Export for an AI**. The rail counts what each
section holds: pages, and for Tax the filing calendar, for Documents the
documents and for People the people and roles. The founder items open People,
where founders are since phase 10.

Nothing nags from Today.

### What the brain reaches

- **Invoices print the company.** The profile's legal name, registered
  address and GSTIN head every invoice PDF, and the bank account marked
  *Print on invoices* goes underneath as *Pay to*. Without a profile, the
  workspace name is used; without a marked account, no account is printed.
- **Export the brain** writes a folder per section and a Markdown file per
  page, with an index. Registration and account numbers are masked unless
  the box to include them is ticked. *Export everything* includes the same
  folder, always masked.
- **Export for an AI** writes the dossier: four long Markdown documents -
  *Read me first*; *The company* (the month's money, runway, running costs,
  unpaid invoices, recent spending, and the Company, Plan, Products, Money
  plan, Tax - with what is late, the next ninety days of deadlines and the
  filing calendar - Legal and Tools sections); *Customers and sales* (the funnel,
  why deals were lost, the last thirty days of calls, every deal, and every
  contact with something going on - facts, what to keep in mind, deals,
  calls, money, next steps and the last 25 entries of history - with the rest
  as a table; then Customers and Playbooks, call scripts among them); and
  *People and running the company* (People - the team with their terms,
  the equity split, hiring and who has left - Decisions, Meetings, Metrics,
  Documents with every document on file, Ideas, open tasks and loose notes). Links are written as the
  names they point at, and a page's headings sit under its title. Written to
  be read in one go, or given whole to an assistant. The same masking box
  applies, and *Export everything* includes a masked copy in `dossier/`.
- **Hand it over** makes the two things the company gives to somebody who
  is not a founder, each chosen by ticking - sections of the brain with how
  many pages each has, kinds of document, and the tables that are not pages -
  starting from what each is usually for, and never ticking something with
  nothing in it. Numbers are masked unless asked for.
  - **A data room**, for an investor: one zip with an `index.html` that opens
    in any browser - the pages by section, then *People and equity*,
    *Products and prices* (with what each has brought in), *Metrics, the last
    six months* and *The filing calendar* (next due, last done), then the
    documents by kind. Every page is its own HTML file, linked to the others
    it links to and back to the index; a contact is its name in bold. A
    stored document goes into the zip; one only written down is listed with
    where it is; a stored file missing from this computer is listed as
    missing and counted. Pitch decks and statements are ticked to start with,
    identity documents are not.
  - **A handbook**, for somebody joining: one PDF through the invoices'
    printer - a cover with the logo, the one-liner and the contents, then a
    chapter a section, links between pages as links inside the PDF, *Who is
    who* (roles and what each looks after, never equity or pay) and *What we
    sell*, with page numbers at the foot.
  - Main asks where each goes and remembers it, so *Show it in its folder*
    needs no path from the window. The founder's own sections are never
    offered.

### Decisions, meetings and playbooks

- **Decisions read as a log.** The Decisions section lists every decision
  page newest first by the day decided, a month to a heading, each with what
  was decided in a line (the text under *What we decided*, or the page's
  first words) and who decided it. A decision made for now has *Look at it
  again on*, which reaches Today and the Calendar a month ahead like a
  contract's dates. The pages stay pages: a decision is prose with links and
  a history.
- **A meeting's action items become tasks.** Under a meeting's notes,
  *Action items* lists its `- [ ]` lines and what became of each - not a task
  yet, a task due on a day, done, or ticked on the page. *Make N tasks* makes
  the open ones not made yet, once each: `@Asha` makes Asha the owner (the
  first name, or the whole name run together, of somebody on the team), and
  `(by 2026-10-02)` or `(day 3)` says when; otherwise a week after the
  meeting. A line added later is the only one made next time.
- **A playbook runs as tasks.** Under a playbook, *Run it* makes every step a
  task due from today (`(day 3)` puts one three days on), for a contact if one
  is picked - onboarding a client is the same list for every client - as
  often as it is needed, and says how many it has made and how many are
  open. Onboarding somebody in People reads the same lines.

### Metrics

The **Metrics** section is a card for each number the company watches: its
name, the number now in large type, what it is set against, a year of it as a
small chart, and how near the target when there is one.

- **Worked out, or written down.** *Add a metric* offers the ones Caulder
  works out from what it already holds - paid in, invoiced, spent, paid in
  less spent, deals won, value won, new contacts, calls made and cash in the
  bank - and *Something you count yourself*: a name, a number, money or a
  percentage, what a count counts, a target and which way is good. The worked
  out ones are never typed and never stale.
- **Flows and levels.** Money in, calls and the rest are counted over each
  month, so the card shows this month so far and says last month's beside
  it, and the chart is a column a month with this one in the accent. The bank
  balance and anything written down are readings: the card shows the latest,
  with the day, and whether it went up or down on the one before - green when
  that is the good way, red when not, with an arrow and the words, never the
  colour alone - and the chart is a line with the latest as a dot.
- **The charts** are one series each, so no legend. Hovering, or the arrow
  keys once the chart has focus, reads out a month; every value is also in a
  table for a screen reader, and a metric's own page shows the year as a
  table under a larger chart.
- **A metric's page** is where one written down gets its readings - a day, a
  number, a note; a second on the same day replaces the first - and where
  any is renamed, given a target or deleted. Deleting a worked-out one loses
  nothing.
- The dossier has every metric with the last twelve months, and *Export
  everything* writes `metrics.csv`, a row a month.

### Deadlines: the filing calendar

The top of **Tax and compliance**. What the company files and pays, again and
again, each with a rule - *the 11th of every month*, *every year on 15 Jun,
15 Sep, 15 Dec and 15 Mar*, or once on a day - which period each one is for,
how many days ahead Today should show it, and what it usually costs.

- **The presets are the way in.** With nothing set up, the section opens on
  them: **India**, or **Anywhere else** for the shape of a year to set dates
  on. The Indian set is picked from the company profile's entity type and GST
  status - GSTR-1 and GSTR-3B monthly or under QRMP, CMP-08 on the
  composition scheme, advance tax, the income tax return for a company, a
  firm or a proprietor, the AGM, AOC-4, MGT-7 and DIR-3 KYC for a company,
  Forms 8 and 11 for an LLP - and ticked, with the ones only some companies
  need (TDS, GSTR-9, DPT-3, MSME-1, professional tax) offered unticked, and
  the ones for other kinds of company tucked away. One press adds them; a
  preset already added says so and is never added twice.
- **Every date is a starting point.** The government moves them, some are
  counted from a meeting rather than the calendar, and states differ, so
  every one is editable, each preset carries a line on its catch, and the
  section says to check with an accountant.
- **Coming up** lists what is late or inside its notice, with **Done**. A
  filing added today starts today, so it does not arrive with years of
  misses; *Still needed* switched off stops it coming up and keeps its
  history. The history button lists each one done - *Aug 2026, done 10 Sep* -
  with **Not done** to take it back.
- **Contracts, registrations, trademarks and documents are read, not
  copied.** A contract's *Ends* less its *Notice, days* is the day to give
  notice by; a registration's or trademark's *Renews on* is its renewal; a
  document's expiry is its own. Change the date on the page and the deadline
  moves.

### Documents

The **Documents** section is the documents themselves rather than pages:
every paper the company has to be able to find. **Add a file** copies one or
more in, and one file added opens to be described - what kind it is
(certificate, contract, agreement, invoice sent or received, statement, pitch
deck, identity, other), when it expires, a note. **Write down where one is**
is for a paper that cannot be kept here - the original certificate in the
safe, the lease with the landlord - and asks where it is instead. The list
filters by kind, opens a stored file in whatever opens that kind of file,
names the contact a document belongs to, and says when an expiry is within
two months or past. One that expires is on Today a month before.

### People and hiring

The **People** section is the people themselves: founders, employees, interns,
freelancers, advisors and candidates, in one list, each a row that opens
their page.

- **The team** lists everybody here or about to start, founders first, with
  their terms in a few words - *₹40,000 a month*, *25%, 6.25% vested* - a
  badge while onboarding is under way, and when they started or finish.
  Under it, the **equity split**: what has been given and to whom, what is
  left, and a warning in red if it adds up to more than 100%. People whose end
  date has passed fold away under *People who have left*.
- **Adding someone** asks what they are here as, and the form follows: a
  founder is asked what they own and their equity, vesting and cliff in
  months (48 and 12 are the usual); an employee, an intern or a freelancer
  their pay or rate and what per, and when a contract or internship ends;
  anybody can be linked to the contact they also are.
- **Vesting** is worked out for the day: monthly from the start date, nothing
  before the cliff, the held-back months arriving at it. A person's page
  shows a bar and says *20% of 48% vested - all of it by 15 Jan 2029*, or
  when the cliff is. The cliff day, and the day a contract, internship or job
  ends, reach Today and the Calendar a month ahead, like a contract's dates.
- **Hiring** lists each role - open, paused or filled, with its pay range -
  and its candidates, each with where they are up to (*Applied*, *Talking*,
  *Interviewing*, *Offer made*, *Not this time*) changed in place. A
  candidate's page has **Hire them**: what they are joining as, from when,
  and whether to mark the role filled. The same row carries on, notes and
  all. Deleting a role keeps its candidates, without one.
- **Onboarding** is a checklist run once for somebody new. The usual one for
  their kind - an employee's runs from the offer letter and the NDA through
  payroll and TDS to a 30-day review; a freelancer's from the agreement and
  who owns the work to reviewing the first piece - or any playbook page with
  `- [ ]` steps, where *(day 7)* at the end of a step says when. Each step
  becomes a task due that many days after the start (never before today), on
  the person's contact if they are one, so it reaches Today like any other
  work. The page shows *3 of 8 done*, and each can be ticked there too.
  Deleting a person leaves the tasks.
- People are in **search**, by name, role, contact details, what they own and
  their notes; a result opens their page. The checklist's founder items -
  *who owns what* and *the equity split* - are answered from here.

### Ask the brain

Connect an AI - in the setup guide, or **Settings → Connections** - and Brain
home has a question box. Ask anything about the company: *which deals should
I chase this week*, *how long does the money last*, *what do schools object
to on calls*. The answer comes from the dossier, the same documents as
*Export for an AI*, numbers masked.

**Any service will do**, each with its own steps on the card:

| | |
| --- | --- |
| **Google Gemini** | Free with any Google account, and the one to start with. A key from AI Studio, and that is all. |
| **OpenAI**, **Anthropic Claude** | Frontier models, paid by use with a little credit on the account. |
| **OpenRouter** | One key for hundreds of models, the ones ending `:free` at no cost. |
| **Groq** | Free and very fast open models, with a small allowance a minute. |
| **Ollama** | On this computer: free, and nothing leaves it. |
| **Another service** | Anything that speaks OpenAI's API - Mistral, DeepSeek, Together, LM Studio - as an address and a key. |

Each card says what happens to what is sent, because what is sent includes
contact details: Gemini's free tier may be used to improve Google's products
(billing on the key stops that), the paid APIs do not train on it, and Ollama
never sends it anywhere.

**The key is checked before it is kept** - by asking the service which models
it has - then sealed by Windows and never shown again beyond its last four
characters. That same list is the model picker, so a new model generation
needs no new version of Caulder; a name can also be typed. **How much it
reads** is a choice too: a short copy (about 15,000 tokens) for a local model
or a tight free tier, up to all of it however big for a million-token window.

- **It is a conversation** for as long as Brain home is open: a follow-up
  goes with the questions before it. *Start over* clears it. Enter asks;
  Shift + Enter is a new line. Three example questions sit under an empty box.
- **Answers link** to the pages and contacts they drew on, as the same chips
  a page's links are, and open them.
- **Every answer says what was sent**: the documents, how many characters,
  whether every contact went or only those the question was about (for a
  company too big to send whole), and the tokens in, out and from the cache.
- **It only answers from what is written.** When the documents do not say,
  it says so. It cannot change anything.
- Nothing is sent until a question is asked, and without a key the card says
  where to add one. Everything else in Caulder works without it.

## Search everything

**Ctrl + K**, from anywhere, even mid-sentence in a field. Pages, contacts,
notes, history entries, invoices and people in one list, best match first,
each with what it is beside it and the matched words marked. Every word typed
counts, each as the start of a word: *oak sch* finds Oakridge School. Arrows
move, Enter opens - a page in the brain, a contact (also for its history and
invoices) on Contacts, a person in People, a note on Today. With nothing typed it offers the pages
written most recently.

The index is SQLite's full-text search, kept current by the database itself,
so a contact imported a second ago is already findable. Secrets and archived
pages are never in it.

## Two founders

Caulder has no server, so two founders share the brain through the owner's
Google script, or by passing a file. See PLAN.md, phase 12.

- **This is me**, in Settings, is the name on every change made in this
  Caulder. A page says *Updated today by Asha*, and its History says who
  wrote each version. Sharing asks for it first.
- **Sharing.** On Brain home, *Two founders* > **Share it** keeps the brain in
  a spreadsheet called *Caulder brain* in the owner's Google Drive, through
  the script already connected, and sends every page there. **Copy the
  invitation** puts one line on the clipboard - the script's address and an
  invitation to this brain only, which reaches nothing else in the owner's
  Google account - for the owner to send.
- **Joining.** The co-founder pastes it into **Join with an invitation**,
  checks what it opens (the brain's name, who shared it, how many pages) and
  joins. Their own Google connection is untouched: their calendar and email
  stay theirs. What they already had joins the shared brain too.
- **Keeping in step.** Every three minutes, and whenever Brain is opened,
  each Caulder reads what the other sent and sends its own; **Bring in step
  now** does it at once. The card says when it last did, how many changes are
  waiting, and what went wrong if something did.
- **Both at once.** A page both founders changed keeps both versions: the
  other's goes into the History, this side's is written on top, and both are
  marked. The page says *Edited at the same time by both of you*, with
  **Compare them**, until somebody saves. An edit beats a delete. Secrets
  (PAN, account numbers) and pins stay on each machine.
- **Stopping.** For the owner, **Stop sharing** cancels the invitation, so
  the co-founder's Caulder can no longer reach the brain; for the co-founder
  it only stops here. The pages stay on both sides.
- **A brain file**, for anyone not using Google: **Save as a file** writes
  every page to one file; **Bring in a file** reads one back. Pages keep their
  ids, so a page both have is matched rather than doubled: a newer version
  wins, an older one is left alone, and bringing the same file in twice
  changes nothing.
- Only the brain's pages are shared so far. The catalogue, the filing
  calendar, people, metrics, documents, contacts and deals stay on each
  machine.

## Google: Calendar, Tasks and Gmail

Your day's blocks and tasks, both ways, and email sent from your own Gmail,
through one script that runs inside your own Google account.

**Setting it up is five steps and they are written on the card**, in Google's
own words, rather than linked to. *Copy the script* puts the whole file on the
clipboard and *Open Apps Script* starts a new project, so step one is a paste.
Four steps have a correct answer that looks wrong, which is exactly why they
are spelled out: you add two services by hand; you run a function in order to
be *asked* for permission; Google says *Google hasn't verified this app*,
because nobody at Google has reviewed a script you made for yourself, and the
way on is *Advanced* then *Go to Caulder (unsafe)*; and you set the deployment's
access to "Anyone" — which is safe because the URL is unguessable and nothing
happens without the key, and which is necessary because Caulder is not signed
in to Google at all.

Pasting is forgiving where people actually slip: the key box takes the whole
log line and keeps the key, and a URL ending in `/dev` — the test link, which
only works while signed in — is caught and explained rather than failing
later.

**The card knows the script's version.** A script pasted before email existed
still syncs the calendar; the card says what updating adds and how, keeping the
same URL — paste over the old file, *Manage deployments*, *New version*, and run
`setUp` once more — with *Copy the new script* and *Check again*. Once current,
it says which address email goes out from and how many sends Gmail allows
today (100 a day on a personal account).

### Email through the script

- **Sending** goes through a Gmail draft that is then sent, because that hands
  back the thread — the only reliable way to find the reply.
- **Waiting messages live in the script's own properties**, one entry each, and
  a timer that `setUp` installs runs every fifteen minutes to send what is due
  and look at threads. That is why scheduled email and follow-ups go out with
  Caulder closed. An entry holds about 9 kB, so a scheduled message and its
  follow-up together are capped at roughly 6,000 bytes; a message sent now is
  not held at all.
- **A reply** is any later message in the thread from an address that is not
  yours or one of your aliases. Out-of-office and other automatic answers are
  ignored; a message from a mail server saying it could not deliver marks the
  email *bounced*.
- **The follow-up** is a reply-all on your own message, which addresses the
  people it went to. It is checked afterwards: if it did not reach the contact,
  it is reported as failed rather than assumed sent.
- **Caulder asks what happened** every ten minutes while anything is in play —
  not behind the calendar switch, because sending an email is asking to hear
  back — and tells the script which finished messages it can forget. A thread
  is watched for thirty days. A repeated failure is logged once.
- **A message the script has lost** — usually because it was set up again as a
  new project — is marked as not sent, with that reason, rather than left
  scheduled forever.

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
