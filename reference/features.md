# What Caulder does

Thirteen screens, ten rows in the sidebar, one workspace per company.

**The sidebar is three groups and Settings.** *Plan* is Today and Calendar;
*You* is the Journal, Life and Memories, the founder's own, the same whichever
company is open; the company group, headed by the company itself (which is
where it is switched), is Contacts, Deals, Money and the Brain. The Brain
holds the company's knowledge and nothing of yours. Import has no row: it is a
button on Contacts, with a way back, because it is something done to that list
a handful of times. Nor does the map: it is reached from the Brain, where it
draws the company, and from Memories, where it draws yours, and it keeps a way
back to whichever sent you. A row is a claim that a thing is opened most days.

**One workspace.** The degree and the company are one calendar and one task
list, and *area* (college, company, personal, health) is the only tag. There
is no personal workspace to choose, no mode toggle and no "which half"; a
second company gets its own workspace, and the switcher at the top of the
sidebar moves between companies. Your own things are kept in a home of their
own that is never in the switcher (see **You are not a company**).

**The screen says what it holds; the reasoning is here.** Each card carries
one line under its heading. Where a section's *why* is worth keeping it sits
behind a *Why it works this way* disclosure at the foot of the card, closed
until asked.

---

## First run

One screen: a company name, **the country it is in**, and one button. The
country is guessed from the computer's language setting (*en-IN* is India),
then from a timezone only one country uses, and is one pick to correct; it
decides the currency a company starts on, the calling code a bare phone
number is dialled with, and whether the filing calendar offers India's
filings or the general set. The funnel shape, the logo, the company's colour,
the currency and the timezone are folded away under one disclosure, and all
of them can be changed in Settings. Any currency in the world can be chosen;
nothing is ever converted.

### The tour

After the setup guide, on Today, a first run gets **a five-step tour**: your
day (Today and the Calendar), the line that takes anything - with the key
that opens it from any app, and the tray icon - your own things under You,
your company, and where help is. A spotlight on each part and two sentences
beside it; Next, Back, the arrow keys, or Skip. It is shown once; `?` has
*Show me around again*.

### The setup guide

A real company opens on it; a look round with sample data does not. Caulder
itself needs no setting up - one file on this machine, nothing to sign in to -
so the guide is about the two things that live in somebody else's console,
and it says so first:

1. **Google: your calendar, your tasks, your email.** The same card as
   Settings, with its steps already open: copy the script, open Apps Script,
   add the Calendar and Tasks services, run *setUp* and allow it, deploy as a
   web app *Execute as me / Anyone*, paste the URL and the key - each step a
   sentence beside a drawing of the screen it happens on.
2. **An AI, to ask the brain.** The services, what each costs, and the steps
   for the one picked. Gemini is free and first.

Each of the two says how long it takes on its heading - *Optional - 5 min*,
*Optional - 2 min* - because the question somebody skipping has is not whether
it is worth it but whether it is worth it now.
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

One workspace per company: its own contacts, funnel, templates, calendar and
money. Nothing is shared between companies.

**You are not a company.** Plan and You in the sidebar - Today, the Calendar,
the journal and Life - are yours whichever company is chosen. Your own things
(the journal, habits, studies, hobbies, goals, the vision board and your
level, and everything the line remembers) live in one **home**, a workspace
of the personal kind called Me that Caulder makes itself the first time there
is a real company (`services/yourhome.ts`) - never while only the sample
company is being looked round. It is not in the switcher and nothing asks
which half you are in: only where things are kept is apart. Made for a file
from before, it takes your pages in the personal sections (and what the line
remembered into Ideas), habits, private lines, the shelf, the vision board,
day check-ins and themes, terms, and the hours and tasks your hobby and course
pages made - so the company's brain and map are the company's alone, and
archiving a company never takes your journal with it. Today and the Calendar
show your home and the chosen company together, the journal's day beside an
entry is every company's, so choosing a company never hides your own day, and
your level counts what you did in every company.

- **The company is chosen where its screens are**: its name, mark and count
  head Contacts, Deals, Money and Brain in the sidebar, and pressing it lists
  the companies. That is all choosing one changes. A workspace of the personal
  kind is not in the list while there is a company to choose. (**Ctrl + K** is
  search.)
- The active company is remembered across restarts.
- Rename, re-accent, archive or delete from Settings. The last company cannot
  be archived or deleted.
- **Archiving hides a workspace. Deleting ends it** — every contact, every logged
  call, the tasks, the calendar, the funnel, the templates and the money, with no undo
  short of restoring a backup. So it is confirmed by typing the company's name,
  not by a second button.
- Names are unique, case-insensitively; a duplicate is refused with a message
  saying what to do.
- **A company's colour is its mark** in the sidebar heading and its dot in the
  list. The app itself wears coffee whichever company is chosen: choosing a
  company changes what the company screens show, not the colour of your day.

---

## Today

The home screen, and the reason the app is worth opening: the first screen
for all of it. **The work comes first.** From the top:

1. **Hello and the day**, as one short header: the greeting, and under it the
   day in one line - *Saturday, 19 September · 2 things to do today, and 1
   late*, or *A clear day*.
2. **Right now**: what the calendar says you should be doing, or *Free until*
   the next thing.
3. **The line that takes anything**, whose hint names the key that opens it
   from any app, with Ember's door on its top edge.
4. **Finish setting up**, while Google or an AI is still unconnected and not
   waved away - one quiet line, not a card: *Finish setting up: Connect Google
   · Connect an AI*. Each name goes to the setup guide, and says on hover (and
   to a screen reader) what it gives; a cross skips that one, and **Skip all**
   skips the lot. Skipping is remembered on this machine; Settings has both,
   always.
5. **The work**, in the order it needs attention - late money, what is
   overdue, a deadline three days off or less, what is due today, then what
   the company pays for, replies, the contacts going quiet, deadlines further
   off, what is coming, and notes waiting to be filed - each section only when
   it has something in it.

A task shows its tick and, for a call, *Call*; moving it or deleting it comes
up when the row is pointed at or has the keyboard.

Beside the work (and under it, on a window too narrow for two columns) goes
everything that is nice to see but asks nothing of the work: the **aside** (a
joke, a pun, a tip; pressed, it tells another) and a **memory** brought back,
at the head of the column; then the life half of the day - **Habits**
(today's ticked in one press, each with its run of days), **Journal** (how
today felt, in one press, and its first words), **Your week** (the next exam,
the hobbies' time this week against what they are wanted, the goal whose day
is nearest), how the weeks have been, and **your level** in one line (the
level, the XP to the next, a thin bar, and what the last seven days added; it
moves the moment a task is done or a habit ticked, says *Up to level 4* for a
moment when one is crossed, and opens Life).

Today used to stack the aside, the memory and a large setup card above the
line, and a box for notes below it, until on a first run at 1440 by 900 the
first overdue task began at the bottom edge of the window. Nothing was taken
away but the second notes box; the rest moved beside the work, or shrank.

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
- **Something to remember** - a thing said what it is, or something about a
  page the brain has: *red rising is a book by pierce brown* starts a page for
  it, and later lines about it are added there as dated lines. A lift's
  numbers lead its line. The page is hung the whole way down - see
  **Brain, memories and the map** below. A line that opens by saying what a
  new thing is (*golden son is a book in the red rising series*) starts that
  thing, whatever page it goes on to mention; a title may begin with *The*
  when the line says what kind of thing it is.
- **A fact** - said to be one (*fun fact:*, *did you know*, *TIL*, a closing
  *interesting question* or *who knew*) or shaped like one (*Shivajinagar was
  called Blackpally*, *NASA stands for…*, *Canberra is the capital of…*). All
  of them go on one page, **Random knowledge**, in Ideas, kept without the
  words that only said it was a fact (`shared/facts.ts`). Never a line that
  opens with *I*, *my*, *it* or *this*, and never ahead of a task, a contact,
  or a page the fact is about.
- **An idea** - *what if…*, or *idea:* - is a page in the brain's Ideas.
- **A note** - anything it is unsure of, kept at the foot of Today to file
  later: nothing is lost by the line being unsure.
- A prefix says so outright: *journal:*, *idea:*, *note:*, *task:*.
- **Not done** - *skipped gym today*, *I didn't go to office*, *couldn't
  finish the report*: the journal, and it finishes no task, ticks no habit,
  logs no hobby time and takes no hour.

### Said the way it is texted

Before either reader sees a line, it is said the plain way
(`shared/slang.ts`, `shared/rephrase.ts`, `shared/hinglish.ts`), and what is
kept is the plain version:

- **Short forms and slang** that mean one thing are written out - *mtg w
  rahul nxt wk*, *wfh tmrw*, *finish the deck tn* - and what is said to nobody
  goes: *bro*, *ngl*, *lowkey*, *deadass*, *fr*, *bhai*, *yaar* at either end.
  Never where it is who the line is about: *call bro*, *bhai ko call karna*.
- **Money lent and owed** is the thing to do about it: *rahul owes me 500* is
  *Get 500 back from rahul*.
- **Forgotten** is still to do: *forgot to pay rent* is *Pay rent* - unless
  the line is about the day it was forgotten.
- **Hinglish** is turned round into English. Hindi says the verb last and who
  it is for after the name, so the one verb is found - whether it is to be
  done (*karna hai*, *jaunga*), was done (*kiya*, *gaya*, *piya*) or not
  (*nahi gaya*) - and every *ko*, *se*, *ke saath*, *ke liye*, *ke baare mein*
  and *tak* becomes the English it means. *kal subah gym jaana hai* is *Go to
  gym* tomorrow morning; *report bhejni hai client ko* is *Send report to
  client*; *paani piya* ticks *Drink water*; *aaj bahut thak gaya hu* goes in
  the journal. It reads the Hindi way of saying when - *parso*, *sade 5 baje*
  (5:30), *paune 9* (8:45), *har somvar*, *5 tarikh tak* (by the 5th) - and
  *yaad dila dena* or *bhool mat jaana* asks for a reminder. *Kal* is
  tomorrow, or yesterday in a line about something done. Only a line with a
  word that is only ever Hindi is touched: *meet Kal Penn*, *call abhi at 5*
  and *trip to gaya* are left as they were typed.

A bare hour from one to six is the afternoon - except for waking: *wake up at
5*, *alarm at 6:30* are the morning.

### It knows what is already there

The line is told what is open, the hours ahead and what was typed before
(`services/lines.ts`, `shared/lines.ts`), so a line can mean something that
exists instead of adding another:

- **Change it.** *push gym to tomorrow*, *move dentist to 5*, *reschedule the
  call with rahul to friday 4pm*, *postpone rent*, *push the deck by a week*,
  *cancel the dentist*, *gym is cancelled*, *rename deck to pitch deck*
  (`shared/edits.ts`). Every word said has to be in the task's title - *the
  dentist* is "Dentist appointment", *gym membership* is not "Go to gym" -
  and a task and its hour on the Calendar move, go and are renamed together,
  with a reminder asked for going with them. Said with only an hour, it keeps
  its day. A cancel says **Undo** until the next line. When nothing open is
  it, the line is not a change: *cancel netflix* is still a task.
- **Straight after adding one**: *actually 6pm*, *make it friday*, *scratch
  that*, *call it seed deck*. Only a line that is nothing but a when moves it:
  *no sugar this week* is its own line.
- **Carry on from the last line** (`shared/followon.ts`): after *met rahul*,
  *send him the deck friday* is Rahul's and *he wants a demo* goes on his
  history; after *buy milk*, *also eggs* is bought the same day; *same time*
  and *same day* mean the last one's. What was taken is said under the line.
- **Answer a question** (`shared/questions.ts`): *what's on tomorrow*, *am I
  free at 5*, *rahul's number*, *how much did I spend this week* (or *on food
  this month*), *what did I note about red rising*, *when's mummy's
  birthday*, *what's due*. The answer is under the line, with what it was read
  from; nothing is kept, and **Keep it instead** files the line as usual. Only
  a whole line said as a question: *what if we priced it yearly*, *find a flat*
  and *plan for tomorrow* are what they always were.
- **Several things at once** (`shared/together.ts`): *call rahul and email
  priya tomorrow* is two tasks, the when said once is both's; *gym, laundry,
  finish deck* is three; *buy milk, eggs and bread* is one errand with the
  list in its note. *call rahul and priya*, *salt and pepper* and *call rahul
  and ask him about pricing* stay whole. **One task** undoes it.
- **Your usual** (`shared/habitual.ts`): an hour this has had three times and
  most of the time is used when none is said - *gym tomorrow* is at 7 when gym
  has been at 7 - said as *your usual for gym (9 of the last 10)*, with **Not
  this time**. The same for how long.
- **A clash** with an hour already taken, **the same thing** already open
  within two weeks, and for an exam or a pitch two days off or more, **the
  day before** to revise or prepare, one click to add.
- **Tab** finishes the line: the whole of something typed before - what you
  usually do at about this hour first - or the habit, hobby, contact or page
  the last word starts. The right arrow at the end does the same; with nothing
  offered, Tab moves on as it always has.
- **Money in** - *got salary 50k*, *received 5000 from rahul*, *stipend
  credited 12000* - is kept in Money as money in. **Something paid every
  month** - *netflix 649 monthly*, *aws 3000 every month on the 5th*, *domain
  900 yearly* - is a Running cost page in the brain's Money, with its next due
  date.
- **Somebody new, told about** (`shared/newperson.ts`): *Jyothi the principal
  from reva puc has accepted my linkedin connection request, i need to follow
  up* is, on one Enter, a new contact - Jyothi at Reva PUC, *Role: Principal*
  in its notes, LinkedIn as its source - with *Accepted my LinkedIn connection
  request* on its history and *Follow up with Jyothi* as its task: tomorrow
  when no day is said, or the day that is. Also *met anil sharma, HR head at
  infosys*, *spoke to priya from GIG international, need to send her the
  brochure tomorrow*, and *the principal of vidyashilp accepted my request*
  (a contact with no name yet). Only somebody not already a contact, with a
  role, how you met, something they did or something to do about them: *letter
  from school*, *email from hdfc bank* and *pizza from dominos* are not people.
  The next line's *her* is them.
- **Family by what they are called**: *call mom* finds the contact saved as
  Mummy or Amma, and so on for dad, brother, sister and grandparents.
- **A message pasted in**: a WhatsApp line keeps what was asked and whose it
  was - *[23/09, 10:32] Rahul: can you send the deck by friday* is *send the
  deck by friday for Rahul*; *call me* from Priya is *call Priya*. An email
  keeps its subject and sender.

### It learns from being moved

Move a line to another part of life - press its area - or to another place
under **Goes to**, before you keep it, and the line keeps the lesson: the
words of that line and where you moved it (`shared/lessons.ts`,
`line_lessons`). The next line that shares those words goes there by
itself, and says why under the line: *Personal, the way you moved "give
arjun the charger back"*. Move "give arjun the charger back" to Personal
once and "drop the charger at meera's" lands in Personal too.

- It learns words, not sentences, with "friends" and "friend" as one.
- A word moved two different ways counts for neither: "report" is a client's
  and a lab's, so it decides nothing.
- Your words, taught outright, come first; lessons come next; the built-in
  guesses about everyone come last.
- Only between the soft kinds - task, journal, idea, note, memory. A prefix,
  a private line, a contact and a report on the day are said or found, not
  guessed, and are never moved by a lesson. A private line teaches nothing.
- **Settings, What the line has learnt** lists every lesson with the line it
  came from and a way to take it back. There is no model: that list is all of
  it, and nothing leaves the computer.

A clause that says a thing must be done makes the line a task wherever it
comes: *my friends jacket is in my room, have to return it* is a task, not a
note. And the people in a life - friend, roommate, cousin, neighbour,
borrowed, lent - are Personal, whichever workspace is open.

### Adding a task in one line

The line at the top of Today, reachable from any screen with **A**, and from any
application at all through the tray icon or Ctrl+Win+A. Type it the way you
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

Replies to email sent from Caulder in the last seven days, newest first, in
the work column after the things to pay for. Each opens its contact.
Out-of-office answers never appear here: the script does not count them as
replies.

### Notes, at the foot

What the line kept to file later lands here: a line started with *note:*, a
line the line could not place anywhere better, or a thought caught by
**Ctrl+N** in the quick window. Notes have no screen of their own any more: a
note is a thing you have on a day, not a place you go.

**There is no box to write in here.** There used to be - a text box with
*Keep it* and *Ctrl + Enter saves it* - but it was a second way to do what
the line at the top already does, a screen further down, so it went. The
card's one line of hint points back up: *start a line above with note:*.

With nothing to file there is no card at all, rather than an empty one with
a joke in it. A search box appears once there are six notes or more (below
that the list is its own search), and stays while a search is typed,
whatever it narrows the list to. Each note can be edited in place, made a
task for today, pinned or deleted.

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

### From Google Contacts

Import has a third source, beside a file and a pasted list: **your Google
address book, read once, when you press the button.** It is offered only when
Google is connected, and it goes through the same wizard - the same column
mapping, the same duplicate check against people already here, one
transaction, and the same undo. A second import path that skipped the preview
would be a second way to get it wrong, and this is the one source whose rows
nobody chose by hand.

**Nothing about it runs on a timer.** Calendar and tasks sync in the
background because a task is meant to reach a phone; an address book is not,
and quietly reading the people in somebody's life is not a feature. Caulder
had only ever written to Google Contacts before this, and the script said so
in as many words - that sentence is now rewritten to describe what it
actually does, rather than left standing as a promise the code had stopped
keeping.

**A person with a company becomes that company, with their name as the
contact on it.** That is the same shape `saveContact` writes in the other
direction, so somebody pushed to Google and pulled back reads as the lead
they started as rather than as a second, person-shaped one. Somebody with no
company is their own lead, which for a one-person business is exactly right.
The rows are headed with Caulder's own column names, so the mapping step has
nothing to correct.

Three things it says rather than hides:

- **Contacts with no name at all are left out, and counted.** Google keeps
  entries that are only an email address, and `Name` is the one column the
  importer requires.
- **It says when it did not reach the end.** The script follows Google's
  pages to about five thousand contacts - the importer's own row cap - and
  reports whether it finished. This is the lesson `pullTasks` has an essay
  about: a page is not a list, and an address book is the one place somebody
  is certain to have more than a hundred of something.
- **Duplicate detection needs a name and one other thing to agree** - an
  email, a number or a city - so a contact who is only a name is added again
  on a second import. That is the importer's rule, not anything about Google:
  no contact detail identifies a lead on its own, and loosening it to
  name-only would start merging people who happen to share one. Almost every
  real address-book entry has a number, and those are caught.

It needs script version 5. An older script answers "this script does not do
pullContacts", which is true and useless, so Caulder turns that into the
sentence that says where the new one is.

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

Four groups, the four questions somebody arrives with, and a row of links
to them along the top that stays in view and shows which group is being
read:

| Group | Narrow column | Wide column | Across the foot |
| --- | --- | --- | --- |
| **Workspace** | This is me, Companies, your own fields | Pipeline stages, email templates | |
| **Planning** | Your words | Reminders | |
| **Connections** | Two connections, at a glance | Google | Ask the brain: connect an AI, and whether it may read your own pages |
| **This computer** | Appearance, updates | Quick add from anywhere | Your data |

Each group is laid out, not poured: a narrow column and a wide one, the cards
shared between them so the two end on the same line, and the last card in
each stretched to meet it. A card that is a screen of its own - the AI's, and
your data - runs across the whole group underneath, with its two halves side
by side: the services beside the steps for the one chosen; what to do with
your data beside the backups kept. On a narrow window each group is one
column.

**Two connections** says whether Google and an AI are connected, keeps up as
either card beside it changes, and opens the setup guide.

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

**Ctrl+Win+A opens the same window from any app**, where you are looking.
It is on from the start, because a key you have to find and switch on is a
key nobody uses. Ctrl and the Windows key sit together under one hand;
Ctrl+Alt+A came first and was awkward, and Ctrl+Alt+Space, the obvious one,
was already held by another app on a real machine. Ctrl and the Windows key
on their own cannot be a system-wide key - Windows needs a key with the
modifiers - so "A" stays, being the key that opens quick add inside Caulder,
so this is the same
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

The tray icon is the mark on transparency at every size the tray asks for,
and on a dark taskbar it is the copy with the ink lifted, switching when
Windows does; a notification's mark does the same. `scripts/logo.py` makes
all of them from `assets/caulderLogo.png`.

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

## The desk widget

A second window that **rests as a pill and opens when the pointer is on it**,
saying what is on now, what is next and what is late. Switched on in Settings
> Your computer, off until it is: it is the one part of Caulder that puts
something on screen you did not open. It comes back on the next launch at the
level and in the place it was left.

**The window resizes, the contents do not hide.** A full-size window with a
pill drawn inside it is still a full-size hole over the desktop underneath,
and the widget is a transparent window over somebody's wallpaper. Open, it is
as tall as what is in it and no taller - `deskFit` in
`electron/main/desk.ts` holds the page's own measurement between 96px and
372px, because a fixed panel draws 300px of empty card on a quiet Sunday and
that reads as broken rather than as quiet.

**It opens away from the nearest edges.** A pill left in the bottom right
grows up and to the left, sharing the corner it already had, so the pill does
not appear to jump. The obvious version - grow down and right - puts the panel
off the screen for the corner people actually leave it in. `deskOpen` is
worked out by hand in `desk.test.ts` on a 1920x1040 work area.

### Three levels, and what the first one costs

| Level | Where it sits |
| --- | --- |
| **In front** | Above your other windows, draggable, hover to open. The default. |
| **On the desktop** | Part of the wallpaper, behind your windows and your icons. |
| **An ordinary window** | In the stack, covered by whatever you are working in. |

**The desktop level cannot be clicked or dragged**, and Settings says so
before it is chosen rather than leaving somebody to discover it. A window
parented to the desktop is behind the icons, and Windows sends every click
there to the desktop instead. Move it while it is in front, then send it
back. Nothing on the widget is a control for the same reason: a button that
works at two levels out of three is worse than no button.

That level is a real Win32 call, through `koffi` - a fourth runtime
dependency, loaded only when somebody asks for the level and failing soft with
a reason the card prints. Four things it cost, none of them visible from the
API:

- **The desktop is a different shape on different Windows.** Windows 10 spawns
  a top-level `WorkerW` behind the icons; Windows 11 22H2 and later hold
  `SHELLDLL_DefView` directly under `Progman` with no such sibling. Both are
  tried, and the 10 branch checks the candidate is *visible* - this machine
  carries a couple of hundred top-level windows with several invisible
  `WorkerW`s among them.
- **Windows refuses to make a topmost window the child of anything**, so
  always-on-top comes off first. That is what makes the call possible, not
  tidiness.
- **`GetParent` is the wrong question.** For a `WS_POPUP` window it answers
  with the owner, and reads back 0 after a `SetParent` that entirely
  succeeded. `GetAncestor(GA_PARENT)` is the one that answers, and it is what
  decides whether the card says "pinned" or "Windows would not".
- **A window parented to Progman does not close cleanly**, and the app hangs
  on quit with nothing on screen to explain itself. It detaches before the
  window goes and again on `before-quit`. `e2e/widget.spec.ts` pins it and
  then quits, so a missing detach fails the suite rather than the user.

**Hover is watched from the real cursor, in main**, not from the DOM. Three
reasons, each found the hard way: an element with `-webkit-app-region: drag`
gets no mouse events at all, so the draggable pill can never fire
`mouseenter`; a window can be moved out from under a stationary pointer with
no DOM event; and at the desktop level the window is behind everything and
unfocusable, where pointer events cannot be leaned on. One mechanism, both
directions. The hit test grows by 12px once the panel is open, so a pointer
resting on its edge does not shut and open it on every tremor.

Measured while building it, and worth knowing before changing any of it:
**`moved` is not emitted for a programmatic `setBounds` on Windows**, only
for a real drag - which is what lets the pill remember where it was dragged
to without its own growing and shrinking counting as a move.


## You: the journal and Life

The founder's own, apart from the company: a group of its own in the
sidebar, **You**, under Today and the Calendar. See PLAN.md, part four.
Everything here stays on this computer - never shared with a co-founder,
never in a data room, a handbook or an export for an assistant.

### Journal

**Journal** (key **J**) opens on today, ready to write. There is no Edit and
no Save: what is typed is kept a moment after the typing stops, and the
corner says *Writing*, *Keeping it*, *Kept*. Above the text, **how the day
felt** is one quiet row - *How was it?* and five faces, the chosen one with
its word - one press, and pressing it again takes it back.

**Two ways to write it**, one switch in the heading, remembered on this
computer:

- **Guided** asks three things, a box each - what happened, something to be
  glad of, tomorrow's one thing - and what each asks changes from day to day
  (*Who made today easier?*, *What went better than expected?*); the same day
  always asks the same. Tab moves to the next box. Under Tomorrow, **Make it
  tomorrow's task** puts each line on tomorrow's list in the company chosen,
  and says when it has.
- **Free** is the whole page at once.

Both write the same text underneath - `## Today`, `## Grateful for`,
`## Tomorrow` - so switching never loses a word. A day written before the
parts, or with more on it (another heading, lines above Today), reads its
loose words as its Today, and Guided says when there is more than its three
parts and offers to show it all. It is written like any page (see *Writing a
page*): `@` links a page or contact, `/` offers lists and steps and, here,
*What I did today* - the tasks ticked and calls made, from Caulder - and *A
question* to write to.

**A passcode can lock the journal** (*Passcode* in the journal's heading).
Writing never asks for it. A day that is over is locked, and so is today as it
is written when *Lock today as I write it* is on - it is ticked when the
passcode is set, and the menu turns it off again. Reading a locked day asks
once, and stays open for a quarter of an hour of use, until *Lock now*, or
until the computer is locked, its lid closed or it goes to sleep. Locked is
real, not a screen over the words: each day is encrypted with the journal's
public key, and only the private key - itself encrypted with the passcode -
opens it, so the words are not in the database, its backups or search, and
deleted words are overwritten in the file rather than left behind. The mood
stays visible, so the calendar keeps its faces.

- **Today, locked, still takes words**: *Or add to today without unlocking*
  under the passcode field, and a journal line from Today's line, are sealed
  as they are kept and read with the rest once it is open - in Today's part,
  as any added line is.
- **A new passcode needs some length** - eight characters, and not one of
  the first anybody would try - and a meter under the field says how strong
  it is. A few words is the easy way. A passcode set before still opens.
- **A recovery key** is made with the passcode: twenty-five letters and
  numbers, shown once, to be written on paper, with no button to copy it.
  *I forgot the passcode* asks for it and a new passcode, and every day stays
  as it was. *Make a new recovery key* (with the journal open) replaces it.
  Without either, *I do not have the key either* erases what was locked to
  take the lock off, which the screen says before a passcode is set.
- **Search the journal**, beside the month: every entry and private line,
  locked days included while the journal is open. It is done in memory and
  kept nowhere; while it is locked, it says the locked days were not searched.
- **Out of screenshots**: with a passcode, the journal's window shows as
  blank in screenshots, recordings and shared screens.
- *Change the passcode* and *Take the passcode off* (every day is opened and
  kept as it was) are in the same menu.

**Looking back**, under the search, is a reading of your journal over the last
month, three months, year or all of it: how you have changed, work and
ambition, what kept coming up, what went well, and a few questions for the
months ahead. Beside it, worked out on this computer, are the numbers for each
month - days written, words, mood, tasks done, calls, habits kept, contacts
added. It is read by a model on this computer, through Ollama: nothing leaves.
If the AI connected in Settings is elsewhere, *Send to ... instead* says who
will receive how many days, and asks for the passcode again (SEND, for a
journal without one) before anything goes. The reading is not kept anywhere,
and private lines are never part of it.

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
**Overview**: your level beside the last seven days, achievements, your theme
days, and then the exams coming, each goal with its line, and the time the
hobbies actually got - or, with none of those yet, where to start.
**Goals** is where ambition lives: the vision board on top, because it is what
the goals are for, then your goals under their areas, then - when the
company's Plan in the Brain has any goals or milestones - a short list of
**the company's goals**, read-only here, each opening in the Brain.
**Show levels and XP** (Settings › Appearance, on to start with) puts your
level and achievements away when switched off: the Overview keeps the last
seven days without its XP, and Today's level line goes. The points are still
counted, so switching it back on loses nothing.
The pages open here, with the way back to their tab; opened from anywhere
else - search, a link, Today, the Calendar - they come here too.

- **The vision board** (on Goals): pictures and words for what the year is
  for. *Add a picture* takes a photo, a PNG, a WebP, a GIF or an AVIF; so does dropping
  one on the board, or pasting one anywhere on Goals while the cursor is not in
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
  bar, with what is set aside this week; under it the last half year a day at
  a time, and the last **eight weeks as bars** against a dashed line at the
  hours wanted - a week over it darker, the week still going lighter.
- **Goals**: area (college, company, personal, health), a day, and a number
  to reach. On the tab they sit under a heading for each area, those without
  one last; the Overview keeps them in one list. Each is a small card that is
  kept up with in a press:
  - **+1** (or **−1** for a goal that counts down, a weight to lose) moves it;
    **Update** adds some or says where it stands now, with a word about it if
    you like ("Dune"). Each is a check-in, kept with its day; the page's *So
    far* follows the latest. **Undo** takes the last one back.
  - **How it is doing, in words**: *2 weeks ahead*, *5 days behind*, *On pace*,
    *Just set* on the day it was made - measured in days of the pace it
    needs, which is how people think of it - and *at this pace, 14 Nov*.
  - **Its line**: where it has been (solid, a dot a check-in, each saying its
    day and value when pointed at), the pace to stay on (dashed, straight from
    where it started to the target on its day), and where it is heading at
    the rate so far (dotted). Drawn from the day after the goal was set.
  - **Reached**, it asks to be **marked reached** - an edit of the page, which
    is what counts it towards your level. Done ones sink to the bottom, ticked,
    without a chart.
- **Theme days** (on the Overview): a day of your week given to one thing -
  Mondays for studies, Tuesdays for guitar. Press a day and pick a hobby, a
  course, a goal, an area, or type your own words (*Deep work*, *Rest*); *Free
  it* takes it off. A focus, not a lock: Today says *Guitar day* beside the
  date, the Calendar heads the day with it, and a hobby with days of its own
  counts them - *Tue and Sat are its days · 3 of 4 kept in four weeks*.
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

**Type `@` in a page** - or `[[`, or select some words and press *Link* on
the bar (Ctrl+K) - and a list opens at the cursor: the pages, contacts,
products, people and documents whose names contain what follows, each saying
what it is - *Product*, *Person · CEO*, a section, a city - in the colour of
its dot. Enter or Tab puts the link in, as a chip with its name; Escape closes
the list and nothing else. `@` counts only at the start of a word, so an
email address is not a mention.

A link begun and never picked - Enter pressed after the list had closed -
shows as its words with a dashed line under them, never as brackets; in the
editor a click on it opens the list again to finish it.

#### Writing a page

A page, and the journal, are written in text that looks like what it will be
while it is typed, as Obsidian's live preview does: a heading is a heading,
**bold** is bold, a bullet is a dot, a step is a box to tick, a link is a
chip. The marks (`##`, `**`, `- [ ]`) come back on the line the cursor is on,
so they can be edited like any other character; the page is kept as the same
markdown it always was, so search, links, history, the journal's lock, the
co-founder's copy and exports read it unchanged.

- **Select words** and a small bar comes up over them: Bold, Italic, Heading,
  Bullets, Steps to tick, Link. Ctrl+B, Ctrl+I and Ctrl+K do the same.
- **`/` at the start of a line** offers what a line can be - Heading, Small
  heading, Bullets, Numbered, Checklist, Quote, Divider, Link - in that order,
  then whatever the screen adds.
- **Markdown still works as typed**: `## ` starts a heading, `- ` a list,
  `- [ ] ` a step; Enter carries a list on, and Backspace at a bullet's start
  takes the bullet off.
- **A chip is one character** to the cursor: arrows step over it, Backspace
  takes it whole, Ctrl+click opens what it points at. The link's id is never
  on screen.

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

It works the way Obsidian's graph does - and links can be made on it with
the mouse, not only typed.

- **To link two things, drag one onto the other.** Hover a dot and a small
  **+** appears at its shoulder; drag from it and a dashed line follows the
  pointer, and the dot it would join is ringed. Let go on it and they are
  linked. Holding **Alt** and dragging the dot itself does the same. A link is
  words in a page, so it is written into one - the page dragged from, or the
  page dropped on when the drag began at a contact, a product, a person or a
  document - on a line at the foot of the page, and the next one made there
  joins that line: `[[Pricing|page:…]] · [[Oakridge|contact:…]]`. It reads and
  edits like any link, and is a version in the page's history. Two things
  neither of which is a page cannot be linked - the ring goes grey and the
  pointer says so - and two already linked, either way round, are left as
  they are. A journal day that is locked is refused until the journal is
  opened. What was done is said at the foot of the map, with **Undo**.
- **Click a line** to take a link out. It lights up under the pointer; a click
  names its two ends and offers *Take the link out*. On the line at the foot
  the link goes, with the dot beside it; in a sentence the words stay and only
  the link goes. The lines Caulder draws itself - a person who is a contact,
  who bought what, whose a document is - are not written anywhere, and do not
  light up. *Link again* puts one back.

- **The map fills its pane**, and everything else floats over it: *Find on
  the map* and the kinds top left, *Fit*, *As a list* and *Display* top
  right, *Replay* along the foot.
- **Colour says what a dot is** - Pages, Decisions, Contacts, Products,
  People, Documents, and **Your own** in grey: studies, hobbies, goals and
  (when *Journal days* is on) the journal, which are on your map and nobody
  else's. The kinds are the
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
  lit. A long name is cut short with an ellipsis, and where two would run
  into each other only the busier dot's is drawn; the other shows on hover.
  The dot hovered, the page's own and whatever *Find* matches always show
  their whole name. **Click** opens it where it lives.
- **Drag** a dot and its neighbours come with it, the whole map giving way
  as you move; let go and it settles back among them. **Hold Shift as you let
  go** to pin it there instead. A dot already pinned stays where it is put;
  double-click a pinned dot to let it go. Scroll to zoom, drag the background
  to move, *Fit* to see everything again.
- **Display** is the panel of controls:
  - *Show*: dots with no lines (the orphans), every contact, journal days,
    and arrows the way links were written. Journal days are off to begin
    with - a dot a day buries everything else - and *As a list* follows the
    same switch; a day that links to something is still in that thing's
    *Linked here*;
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

### Brain, memories and the map

Three words for three things. The **brain** is the pages. A **memory** is a
dated line the quick line writes on one of them. The **map** is the shape the
pages make - and the shape is nothing but *Part of* links, one from each page
to the page above it. Memories are kept in your own workspace whichever
company is open, so this is your brain and your map, not a company's.

What the line is told is hung the whole way down, and every level is a real
page that can be opened, written on, renamed and linked (`shared/branches.ts`
works the chain out; `services/remember.ts` keeps it, in one transaction):

    Me > Hobbies > Reading > Fantasy books > Stormlight Archive series > The Way Of Kings

- **Me**, then the hub of the section (**Hobbies**, **Studies**); what is part
  of nothing - a fact, an idea - hangs off Me.
- The **hobby** it is part of: one of your hobbies when one fits (a song named
  with *on the piano* hangs off Piano), otherwise one is started under its
  plain name - Reading, Films and shows, Music, Gaming, Cooking, Gym - as a
  hobby, so Life counts its hours. A level the line made is never taken for
  the hobby, whatever word is in its title.
- Then only what the line gives grounds for: a **genre** it names, kept to its
  hobby (*Sci-fi books* and *Sci-fi films* are two pages); a **series** it
  names or that Caulder knows the book is of (*The Lightning Thief* is Percy
  Jackson); who a **song** is by; the part of the body a **lift** works (Bench
  Press is part of Chest, which is part of Gym). The word said first decides
  what a thing is: *a movie in the ... trilogy* is a film.
- Levels are found by title and started only when missing, and never above a
  level that is already there - a genre mentioned after the series exists is
  not given a page with nothing under it. A page that already says what it is
  part of is never moved; one that hangs off nothing is hung the next time
  something is said about it. The journal is never a level and never written
  on.

The quick line says the chain before it keeps anything (*under Hobbies >
Reading > Red Rising series*), Memories says it on each group, a hobby's page
on Life lists everything under it however far down, and the map draws it.

### Memories

A row of its own under *You*, after Life - not on the company Brain's rail,
because memories are yours and the Brain is the company's. Everything the line
on Today was told to remember, read back out of the pages it was written on (a
memory is a dated line at the foot of a page, `shared/memories.ts`): grouped
by what each is about, the most recently added to first, searchable, and each
group says where its page hangs and opens it. A page opens right there, with
the way back to Memories, and so does a page it links to; a **Remembered**
page found anywhere else - search, a link - opens here too. **See them on your
map** goes straight to your side of the map. Memories are kept in your own
workspace whichever company is open, so this shows the same thing in every
company, and says so. The journal is never read for it.

- **What a life is made of** (`shared/lifefacts.ts`) goes on its own page in
  **Remembered**, a personal section that never leaves the machine: *my blood
  group is O+*, *i'm allergic to peanuts*, *my car number is…* on **About
  me**; *mummy's birthday is 15 march*, *arjun likes filter coffee*, *meera
  just got engaged*, *dad's shirt size is XL* on a page for each person under
  **People**; *the spare key is under the plant pot*, *i parked on level 3,
  spot B12* on **Where things are**; *lent my drill to arjun*, *arjun returned
  the drill* on **Lent and borrowed**. What it is about leads the line -
  **Blood group: O+** - so a later memory about the same thing is the newer
  answer, and the one before is shown as *earlier*. Somebody already a contact
  keeps theirs on their history. *My exam is on friday* is still a task and *my
  head is killing me* still the journal.
- **A password is never a memory.** *My wifi password is…*, a PIN, a card or
  account number, an OTP go to **Private**, locked behind the journal's
  passcode. *The plumber's number is…* is a new contact.
- **Coming up**: a birthday or an anniversary told to it, in the next month,
  at the top of Memories; on Today when it is within the week; and as a
  Windows notification on the day and the day before, at the brief's hour or
  nine, whatever the reminder switches say - it was asked for.
- **On this day**: what was kept on this day in an earlier year, or failing
  that an earlier month. Today brings one memory back under the greeting, the
  same one all day - a birthday this week first, then one from this day, then
  one from a while ago.
- **By what** or **Timeline**, and a search that finds every word in any order.
- **Edit** and **Forget** each memory where it is, on its page, through the
  page's history - so what it said before can still be seen there.
- **Asked** in the line on Today: *where did i park*, *where is my passport*,
  *what's my blood group*, *what does arjun like*, *who has my drill*, *when's
  mummy's birthday* are answered from memories, the current one first.

The **Map** has the same two sides. Opened from Memories, with a company
open, a pair of tabs above it chooses between the company's map and **Yours**
- your own workspace's pages, where Red Rising hangs off Reading - and it
opens on Yours. The Map on the Brain's rail is the company's alone, with no
tabs. With your own workspace open they are one map and the tabs are not
drawn. A page opened from either knows which workspace it is in, so its links
and what links to it are its own.

### Brain home

**Ask the brain** first (see below), then the company in one card (name, one-liner, entity, registration numbers
masked), then **Tell Caulder about the company**: twelve questions, about
fifteen minutes, with a ring that fills as they are answered. Each is a
question in plain words with what Caulder does with the answer under it, and
they come in four steps - the basics (what it does; what kind of company and
since when; registration and tax numbers), who and what you sell (founders and
what each looks after; who owns how much; what you sell and its price), money
in and out (GST or VAT status; the bank account customers pay into; the
accountant; the software you pay for) and where it is going (three goals for
the quarter; the biggest risk). Only the step you are on is open; **All 12**
shows the rest. What each line says Caulder does with an answer is checked
against the code, not hoped. Each is ticked by the page that
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
  company too big to send whole), whether your own pages went, and the tokens
  in, out and from the cache.

#### Your own pages, only if you say so

The dossier is the company. The other half of Caulder - the journal, goals,
habits, hobbies, courses, and the lines you asked it to remember - is **off**
until a switch on the AI card turns it on, because it is the half you would
mind a stranger reading. On, a question about you gets an answer about you:
*how am I doing on my goals*, *what did I say I would do about the invoice*.

**Two things never leave, whatever the switch says.** A journal day that is
locked - sealing empties the page, and the page is checked again anyway - and
anything the line took as private, which lives in a table of its own that
nothing in the AI path reads. That second one matters most: until a passcode
exists those lines are plain text, so a guard written as "skip what is sealed"
would hand them over. The day's own readings - what a quiet day was, the pulse
- stay out too, because the screen that collects them says they never leave
this computer. `electron/main/services/yours.test.ts` is mostly about this.

#### The same line on Today

The line on Today has a **star at its left, and the star is a switch**. Grey,
and Caulder reads the line itself - a task, a journal line, time on a hobby.
Coloured, and the line is a question, answered by the AI underneath it. One
control, because two boxes on one screen is a choice nobody wants to make
twice a minute; and colour is the whole signal, so where a line is going is
answered by looking.

A question from the line is **not** the whole company. It goes with today -
what is in the hours, what is late, what is due, the dates coming - and with
whatever the words point at, found the same way Ctrl+K finds it and written
out in full. Plus your own pages, if you have allowed them. A few thousand
characters rather than a hundred thousand, so it is quick and costs nothing
on a free tier asked forty times a day. The answer is a sentence or two, links
to what it drew on, and says what went. The switch stays where it was put.
- **It only answers from what is written.** When the documents do not say,
  it says so. It cannot change anything.
- Nothing is sent until a question is asked, and without a key the card says
  where to add one. Everything else in Caulder works without it.

## Context for another AI

The quick line has three modes, and the flame at its head says which. Type a
topic in the violet one and **everything Caulder holds about it goes on the
clipboard**, written out in full, to paste into any chat. The same thing sits
on Brain home as a card, for when you have come looking for it rather than
happened upon it.

**It is not the search results.** Search answers *where is the word*; a brief
answers *what is known*. Three things make the difference:

- **It follows the shape of the brain, not just the text.** Everything hanging
  under a page that matched comes too, so *guitar* brings the songs filed
  under it and *reading* brings the shelf, none of which say the word.
- **A page two levels down is found at all.** A page directly under Unifloe
  carries the line `Part of [[Unifloe]]`, so the index can find it; its own
  child says `Part of [[Pricing]]` and never says Unifloe, so *unifloe tiers*
  matches nothing whatsoever in the search box. A page counts when the words
  it matched plus the names of every page above it cover what was typed.
- **It reads the sentence, not just the words.** *Give me context about
  unifloe pricing* is a brief about unifloe pricing: the asking words are
  thrown away, because the index joins words with AND and *give* would find
  nothing.

It also brings what the index does not hold: the hours set aside for it in the
calendar, the numbers the line logged about it, and the tasks with its name on.

**What never goes.** A journal day you have locked, and anything the line took
as private - the same two rules the connected AI has, for the same reason, and
the private table is not read at all rather than read and skipped.
Registration and account numbers are masked.

**And the paste says so.** It opens by explaining what Caulder is, because the
chat window it lands in has never heard of it, and warns that these are one
person's own notes rather than a document. It closes by naming what went in
and what was held back, and tells the reader not to read silence as absence -
without which an AI handed a brief answers confidently about a gap that is a
gap on purpose.

The words never reach the window: main puts them on the clipboard and the
screen is told only how many characters and what kinds of thing went in.

## Ember

The flame at the head of the quick line is a mascot, and her colour is the
mode. **A flame test** - copper burns green, potassium violet, a gas ring
blue, plain fire orange:

| | |
| --- | --- |
| **Orange** | The line goes into the company. |
| **Blue** | The line goes into your own day. |
| **Green** | The line is a question for the AI Caulder is connected to. |
| **Violet** | The line is a topic, and its context leaves for another AI. |

Colour is never the only signal: each switch keeps its pressed state and its
title, and the line's placeholder changes with the mode.

**She lives in the app, on Today.** Her front door stands on the top edge of
the quick line, and Today is the only screen she is on - the rest of the app
is for working in. She comes out of it when Caulder opens, wanders the line, stops, looks
about, breaks into a run now and then, and goes back in between one and six,
when the door's little window dims and a z drifts out. Knock on it and she
answers; in the small hours she opens it just far enough to ask for five more
minutes.

**She has a body** (`shared/body.ts`): one physics step, sixty times a second,
whether she is walking the line, standing on a card, held, or flying across
the window. Cartoon physics on purpose - heavy gravity, bounces that keep more
speed than anything real would, walls she splats against - and two springs
that overshoot: her squash, so every landing flattens her and she wobbles back
through her own shape like a jelly, and her tilt, so she leans into a walk,
tumbles when thrown and rocks herself upright after landing the wrong way up.
Her walk squashes on every footfall. A one-pixel ink outline stands her off
the page - drawn as pixels, an ink twin of every layer of her grown by one,
rather than by a filter, which measured as the most expensive thing about
her - and a shadow on whatever is under her shrinks as she goes up.

**What she costs.** Measured with Chromium's own counters, wandering the line
she takes a few hundred milliseconds of main-thread time every six seconds
and drops no frames. Her movement is a transform on her outer box, which the
GPU does; anything that loops inside her drawing steps rather than eases, so
she repaints only when a frame of her changes; and indoors she checks four
times a second instead of sixty.

She watches the pointer, and one that sits beside her long enough gets
noticed. She reads, plays an electric guitar with her eyes shut, dances under
a disco ball, skates, listens to music, drinks tea, goes running, stretches,
dresses up, swings a pickaxe at a block of stone until the chips fly, sits
with her hands behind her head under a blocky tree while a leaf comes down,
and now and then mopes in bed under her own raincloud - one pastime in four
stretches of resting, in a fixed order that alternates loud things and quiet
ones.

She is a **thirty-two by thirty-two pixel sprite**, shown at sixty-four, so
every sprite pixel is exactly two screen pixels. Three body frames are cycled
about eight times a second, which is how she burns; her face, wardrobe and
pastimes are separate sprites laid over it. Her own moves glide from pose to
pose rather than cutting between them, spinning the short way round, so a
somersault is one turn. Under reduced motion she stands still beside her door.

### Out on the taskbar

When Caulder is not the window in front, Ember walks the **seam between the
taskbar and everything above it** - the bottom of the work area, which is the
top edge of a bottom taskbar, and the bottom of the screen when the taskbar is
at the top, on a side, or hidden. She ambles, stops now and then, turns round
at the ends, and stands still for her pastimes.

**She is for something.** She holds up what is waiting for you, one thing at a
time: a **bell** when a block starts within ten minutes, a **letter** when
somebody has replied, **papers** when something is overdue. Click her and
Caulder comes forward on Today, where all three are. Everything she carries is
a row Caulder already has; an empty day, and she just gets on with her life.

- **There is only one of her.** Switch to Caulder and she comes inside, onto
  the quick line; switch away and she is back on the taskbar.
- **She never costs a click.** Her window lets every click through to whatever
  is underneath, except while the pointer is actually on her.
- **She keeps out of the way** of anything full-screen - a film, a slide deck,
  a game - by asking Windows what is in front.
- **Settings → This computer → Ember** puts her away. Under reduced motion
  she stands still and holds on one drawing.

### Click her, poke her, throw her

**Click her and the line becomes a question for the AI**, cursor in it. The
obvious thing to want from the character on the line is to talk to her.

**Poking** (on in Settings unless switched off) answers differently depending
on where it lands, which is what makes it exploring rather than repeating: the
head bonks her, the belly tickles, the feet trip her, and five in a row makes
her dizzy. In costume, the belly is where the costume's own move lives.

**Drag her anywhere.** She hangs from where you grabbed her and swings behind
your hand. Every card's top edge is somewhere she can stand, and she wanders
whichever one she is put on; the card dents under her when she lands, and a
hard enough landing shakes the window. A flick throws her: she tumbles,
bounces off cards, and splats flat on a wall or the ceiling, sticks there a
moment too long, and peels off. Take the card away from under her and she
hangs in the air long enough to say "Uh oh." Dropped over nothing, she grows
wings, flaps, fails, and falls out of the bottom of the window head first,
whistling - and a moment later her door bursts open and she stumbles out. A
double-click sends her home with a leap, and after a while on somebody else's
card she goes home by herself.

**Her temper.** Pokes, throws, bumps and drops all add up and cool off by
themselves. Past one line she is cross (a scowl and steam); past the next she
goes up in flames and takes the screen with her: the window turns red and
pixel flames climb the bottom of it until you **give her a marshmallow**,
which she toasts on her own head and eats. Escape counts as a marshmallow.

### Getting back up

Put her down on a card below her line and she stands there a moment, looks
up at it, says "Hmm.", and gets herself back the hard way - a different way
each time, and every one with a beat that goes wrong (`shared/ascent.ts`):

- **The rope.** A grappling hook, thrown up and straight back down onto her
  head; thrown again, and it catches. She climbs hand over hand, from behind
  - you see her back, not her face - slips halfway and whips round to look at
  you, then carries on, flops over the edge, and says "Easy."
- **The web.** "Thwip!", and she is yanked up so hard she overshoots, flips,
  and lands. "Nailed it."
- **Magic.** "Abracadabra!" - and she reappears two steps to the left.
  "...huh." "Alakazam!" works. Ta-da, and a bow.
- **A pogo spring,** squashed down with everything she has, then BOING.
- **A rocket** that sputters out halfway, relights, and weaves her home.

### Dances

Twenty: the dab, the robot, the floss, 6-7, a headspin, disco point, the
moonwalk, the chicken dance, the griddy, the worm, the Carlton, the macarena,
the sprinkler, the horse dance, jumping jacks, an Irish jig, the twist, the
running man, Cossack kicks and the ninja run - head down, both arms straight
out behind her - over a drum machine, when she has been asked. Once she knows
the ninja run, it is also how she runs anywhere fast. Ticking a task off gets
the next one she knows, and she breaks into one on her own now and then.

### Keeping her warm

Ember is the reason to keep your habits (`shared/growth.ts`). Everything she
has is **worked out from what you did, never banked**: undoing a tick undoes
what it earned, and opening the app earns nothing.

- **Your habits feed her.** Tick a habit and a marshmallow flies from the box
  to her; she catches it and says "Nom!". How many you have kept over the last
  five days, the recent ones counting most, is **how warm she is**: blazing,
  she walks faster, breaks into runs more often and rests less; low, she
  slows down, stops running and mutters "Hungry..."; down to embers, she sits
  by her door, says "So... cold...", and waits for you. One tick and she
  brightens on the spot. **She never dies, sulks
  or tells you off.** A pet that punishes you gets switched off, and then it
  motivates nothing.
- **Your level teaches her things.** The XP everything you do already earns
  now has somewhere to go: every level from the second teaches her a dance, a
  costume, something to wear, and every third one a new way back up. The
  things people ask for come first (the floss and Superman at level 2, the
  moonwalk and the ninja run at 3, 6-7 at 5, Shah Rukh Khan at 6), and the
  ladder runs to level 25.
- **Your streaks earn the special costumes**, on the longest run you have
  ever had on any habit: Bruce Lee at 3 days, Usain Bolt at 7, Neil Armstrong
  at 14, Ronaldo at 21, Michael Jackson at 30, Mike Tyson at 60, and Zeus at
  100.
- **Something new arrives as a present.** It drops onto her line, she walks
  over, opens it, and shows you what she learned.

**Right-click her for her book**: how warm she is, how many habits are fed
today, your level, your best run, and the next three things she will learn
with how far off each is. Below that are her dances, costumes, clothes and ways
home. Anything she knows is a click away. Anything she does not know is still
listed, with what unlocks it, and clicking it gets a shake of the head and
"Not yet! Level 5."

### Her clothes

She is never naked. **Every morning she dresses herself**: a knitted scarf and
white sneakers, and most days one extra thing on her head or face, the same
all day (`shared/closet.ts`). Her wardrobe has sixteen things across six
places - head, face, neck, body, back and feet: a scarf, a bow tie, a bandana,
sneakers, boots, red kicks, a beanie, a bow, a flower, a party hat, a
sweatband, a crown, shades, round specs, a hoodie and a backpack. She starts
with the scarf, the sneakers and the beanie, and the rest come up the ladder.

Dress her yourself from **Her clothes** in her book. Clicking something puts it
on, and takes off whatever was in the same place; clicking it again takes it
off. She changes in a puff of smoke and asks "How do I look?". She keeps what
you chose until you click **Let her choose**. In a costume her own clothes are
put away, and a pastime's own hat wins its place: a nightcap in bed, a cap on
a run, reading glasses over her shades.

### Her ways

- **She says hello**, the first time she comes out each day: "Morning!",
  "Afternoon!", "Evening!", or "Up late?" after ten at night. The greeting is
  bubble-only; she makes no sound on her own.
- **She has a favourite dance**, picked once from what she knows and kept.
  It is marked with a star in her book.
- **Left alone** for three minutes, with nobody moving the pointer or typing,
  she gets bored, does her favourite dance to nobody, and asks "...anyone
  there?"
- **The day every habit is fed**, she dances and says so, once.

### Tricks and the wardrobe

Between pastimes she does something funny of her own accord: trips over
nothing, waves, does a somersault, dances. Every move squashes and stretches -
flattened before a jump, long on the way up, a pancake on landing and a wobble
after - and a bonk on the head flattens her like a pancake before she springs
back up far too tall. **Clearing the last overdue thing gets the moonwalk**: a
puff of smoke, a fedora, white socks, eight steps backwards, a spin and the
kick.

Twice in every fourteen pastimes she dresses up, as one of the costumes she
knows, from a wardrobe of **thirty-seven**, each with its own move: Michael Jackson, Zeus (a thunderbolt,
then he trips on his robe), Superman, Shah Rukh Khan (the arms), Einstein (the
tongue), Mike Tyson (a combination, then a pigeon), Rajinikanth (the
sunglasses), Napoleon (on tiptoe), Batman, Sachin Tendulkar, Cleopatra, Donald
Trump, A. P. J. Abdul Kalam (a launch), Newton (an apple), Elvis, Cristiano
Ronaldo, Neil Armstrong, Bruce Lee, MS Dhoni (the helicopter shot), Lincoln (a
hat that keeps growing), Freddie Mercury, Shakespeare, Usain Bolt, Beethoven,
Chaplin, Caesar, Bob Ross, Marie Curie, Frida Kahlo, and a Viking, a pirate, a
boy wizard, a great detective, a plumber, a space knight, a cowboy and a hero
in green.

**On somebody's day she is them all day**, the way a search page draws its
logo for a birthday: Einstein on 14 March, the Moon landing on 20 July, MJ on
29 August. Hover over her and the caption says whose day it is and why. A
costume that followed the calendar with no explanation was taken out once, as
a bug; a doodle is different because it says why.

### Her voice

Every sound is synthesised in the app: a bonk is a falling square wave, a
whoosh is noise swept through a filter, and Beethoven gets his four notes. The
catchphrases ("Hee-hee!", "Hiyaaaa!", "Siuuuuu!", "Mind it!", "I'm Batman.")
are said by the machine's own voice, bent for whoever she is being, and shown
in a speech bubble over her so they land with the sound off.

**She only makes a sound because of something you did**: a poke, a throw, a
task finished. What she does on her own is silent. **Ember in the app**, **Her sounds** and **Poking, and her temper** each have
their own switch in Settings.

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

**Each step is a sentence and a picture.** The sticking point was never the
instruction - it is finding one word on a screen built for programmers - so
the four steps that happen in Google's console each carry a small drawing of
that screen with the one thing to press ringed and named: *Untitled project*,
the **+** beside *Services*, the *setUp* dropdown, *Advanced* inside the
warning, *Who has access: Anyone*, and the line the key is printed on. They
are drawn in Caulder's own tokens rather than photographed, because a
screenshot is stale the week Google moves a menu and cannot follow the theme.
Nothing in them is read aloud: the step beside each says the same thing in a
sentence.

**Two answers look wrong, and are answered under the steps** rather than
inside them, so that following the guide stays short and stopping to worry has
somewhere to go. Google says *Google hasn't verified this app* because nobody
at Google has reviewed a script you made for yourself, and the way on is
*Advanced* then *Go to Caulder (unsafe)*. The deployment's access is set to
"Anyone" because Caulder is not signed in to Google at all - the URL is
unguessable and nothing happens without the key. Adding two services by hand
and running a function in order to be *asked* for permission are spelled out
in the steps themselves.

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

### Reminders and notifications

Caulder sends Windows notifications of three kinds (`shared/nudges.ts`,
`services/nudges.ts`); clicking one brings Caulder to where it is about.

- **A reminder you asked for.** A line that says *remind me*, *don't let me
  forget*, *ping me* or *set a reminder* - "remind me in 20 mins to check the
  oven" - keeps a reminder against the task (`reminders`). It arrives at the
  time the line said, or at the start of that day without one (the morning
  brief's hour, or nine), once, and never for a task already done. The line
  says so before Enter: *A Windows notification at 2:20 PM.* It is sent
  whatever the reminder switches say, because it was asked for in so many
  words - unlike a block's notice, which stays behind its workspace's switch.
- **The journal**, at the hour picked in Settings, Reminders - only on a day
  with nothing written yet, and a different line each day.
- **The morning brief**, at the hour picked: the must-dos by name, then how
  many more and how many are late, across every workspace. Nothing on a day
  with nothing.

Both daily ones are off until switched on, and each is sent once a day, still
arriving if Caulder is opened a little after its hour. **Send a test
notification** in Settings shows one at once, and says what to check -
Focus assist, and Caulder under Windows' notification settings - if it does
not appear.

### Other mail accounts

**Settings, Other mail accounts** connects Zoho (zoho.com or zoho.in),
Outlook or Microsoft 365, Yahoo, iCloud, Gmail without the script, or any
SMTP server. Pick the provider, give the address and an app password - each
preset says where that provider makes one - and it is tried against the
server before anything is saved, so a wrong password or server is said
there, in plain words, and not when a message will not go.

- The password is encrypted by Windows the moment it is saved and never
  shown again; if Windows will not encrypt, the account is not saved.
- On a contact, **From** picks the account when there is more than one. The
  script comes first when it is ready, because only it sees replies.
- These accounts only send. A message from one is written on the contact's
  history like any other, but no reply is watched for, a follow-up cannot be
  asked for (it is said why), and one scheduled for later is sent by Caulder
  when it is due - so Caulder has to be running then. Removing an account
  marks what was waiting to go from it as not sent, rather than sending it
  from somewhere else.

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
