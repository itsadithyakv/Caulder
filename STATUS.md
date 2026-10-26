# Status

*Where Caulder stands right now. Dated, and rewritten as it changes - in the
same commit as the work, not afterwards. What is planned is in
[PLAN.md](PLAN.md); where everything lives is in
[reference/feature-map.md](reference/feature-map.md).*

**As of 14 October 2026, late.**

## Where things stand, in a paragraph

Caulder was made a company-only app today, and a plain one (PLAN.md, part
seven). The personal half is gone - journal, Life, habits, goals, the vision
board, levels - and so are founder sharing, Ember the mascot, and the jokes
and quotations on Today. What is left was made to do more: the quick line
was rewritten around six kinds, outreach gained LinkedIn, Instagram, writing
to several at once and a *Reach out* card, contacts can be kept as a Google
Sheet, and the sidebar, Today, a contact's page and the Brain's home were
rearranged. On 11 October the last of the student went too (phase 32): a
task has no area, the Timetable is *A usual week* without terms, and a
block's kinds are a working day's. And Contacts can say who has not
answered, and walk a ticked list through WhatsApp, LinkedIn or Instagram
one at a time (phase 33). **Committed by the owner as `fc38509`
("Update") on `general`**, up to the performance pass of 17 October; the
logic pass, the reminders and Ctrl+Q of 23 October are not yet.

## Version

- **1.0.0** is packaged (14 October 2026) as the Store package,
  `release/Caulder-1.0.0-x64.msix`: unsigned, for Partner Center to sign,
  with the identity it reserved; rebuilt on 23 October from a tree with
  that day's work uncommitted.
  The installer is `release/Caulder Setup 1.0.0.exe`, unsigned, so
  SmartScreen warns before it runs.
- **Installing 1.0.0 over 0.5.0 runs migrations 49 to 58 on the first
  start**, and 49 deletes the personal half (see below). The backup taken
  before migrating is the way back.
- **The first start of a build with today's change turns every Class,
  Studying, Break and Personal block into Away** (migration 53). The titles
  are untouched. Nothing else of phase 32 changes what is stored.
- **The first start of a build with today's change deletes the personal
  data**: migration 49 drops eleven tables and every personal page. The
  backup taken before every migration is the way back, and the only one.
- **The Google script must be updated to version 7** (Settings > Google
  says so, with the steps): version 6 brought the contacts sheet, version 7
  mends Google Tasks.
- **The schema is at migration 58.** 54 to 58 came on 14 October: an invoice
  that repeats, a task that comes back and every other week, who a word
  means, what stays true about a contact, the week's three things.
- Not released: nothing is published to GitHub Releases, and 1.0.0 is
  built for the Store but not uploaded.
- `shots/` (9 MB of screenshots) is untracked and deliberately left out.

## Checked, and not

- `npm run verify` passes: typecheck, lint, **1,996 unit tests**, and
  knip. (It was 2,394 tests in 155 files on 5 October; what
  went were the tests of what was removed.)
- `npm run build` succeeds, and the built app was opened on a throwaway
  profile with the sample company: every main screen draws with no error on
  the console.
- **End-to-end:** 35 specs, 199 tests. **The whole suite was run on the
  final build on 14 October**, after the design pass, in four parts: every
  spec passes but `tour.spec.ts`, whose two tests expect the tour to name
  the key that opens the line from any app - the installed Caulder was open
  on this machine and holds it. Likely, and not confirmed by closing it.
- `npm run package:store`, `npm run package` and `npm run smoke:packaged`
  pass on 1.0.0: every smoke check, the model included.
- **The quick line, measured** (`electron/main/understand/lines.eval.test.ts`):
  on 93 lines it had never been tuned against, it reads **68 right by the
  rules alone, 73%, and 72 with the model on this machine, 77%**. Earlier
  the same day, before the changes below, the number was 53 of 96, 55%.
  - By kind, by the rules: a task 27 of 29, a contact 16 of 18, a memory 8
    of 16, a note 6 of 9, a command 7 of 12, an idea 4 of 9. With the model
    an idea is 7 of 9 and a task 28 of 29; nothing else moves.
  - **A memory is the kind it reads worst**: half, and five of the eight
    missed were kept as a note. A fact said without "is" or a number in it
    does not look like one to the rules.
  - On the lines marked hard - two kinds plausible - 24 of 37; on the rest,
    44 of 56.
  - **How it was measured.** Three sets of 96, each written by a second
    model given the six kinds in plain words and not shown the rules.
    1. The first was scored (62), its misses read, three fixes made.
    2. The second was written after that and measured once: 53, the first
       honest number. Its misses were then read - which spends it - and the
       rules changed for their classes, listed under "Done since" below.
    3. The third was written by another writer, measured once after those
       changes, and its lines have not been read: that is the 68 and the
       72. It is counted on 93 lines, not 96, because its writer wrote three
       of the first set's lines again word for word, and a line the rules
       were changed beside is not unseen.
  - **What tuning is worth.** The two sets that were read now score 93 and
    90 of 96. The set that was not scores 73%. The twenty points between
    them are the rules fitting the lines they were shown, and are why only
    the last number is to be believed.
  - **What it is not.** Not a founder's own lines. The three sets come from
    the same brief and the same kind of writer, and three repeated lines
    show they are less independent than they look; a founder's real month
    of lines would be a harder and better test. And not comparable with
    September's 48 of 90, which was ten kinds on another set.

## Done since, 10 and 11 October

After part seven, in the order it happened (PLAN.md, part eight):

- **Replies from other mail accounts** - Zoho, Outlook, a domain of your
  own. A switch on each account; on, Caulder reads that inbox's headers
  (never a subject or the text, and read-only) to see who replied, and a
  follow-up can go by itself from such an account. Migration 51. **Tested
  against a stand-in mail server on this machine, not against a real Zoho
  or Outlook inbox.**
- **The desk widget says more**: the pill says the one thing that cannot
  wait; the panel says who replied, what is late or unpaid and who is
  waiting, under what is left of the day.
- **People and hiring taken out** (migration 52), the owner's choice.
- **Today's line does one thing**: asking the AI and copying context are on
  the Brain's first page only.
- **The campaign plumbing taken out** (it was item 10 below).
- **The whole end-to-end suite run, and the line measured** (phase 31,
  both above).
- **The line's rules changed for what the second set got wrong**, by class
  and never by line, each with tests of its own lines and of the near ones
  it must leave alone (`shared/capture.test.ts`, `shared/commands.test.ts`):
  - *An idea* is heard in more than "what if": "maybe a...", "thinking
    of...", "someday:", "there might be a market for...", a thing named and
    who it is for ("newsletter for cafe owners"), something proposed by
    asking ("charge per page instead of per project?") - and it is an idea
    whoever it names.
  - *How the company runs* is a memory: how often ("payroll runs on the
    last friday of every month"), at what rate ("1.5% per month"), in what
    hours, and what it does not do ("don't start before the deposit
    clears", "we stopped taking logo-only jobs").
  - *An opinion* is a note whatever day is in it ("fridays are useless for
    deep work"), and so is something over ("signups halved on saturday"). A
    day gone by is when a thing happened, not when one is due.
  - *An order* is told from the thing by the word after it ("quote the
    bakery", "quote i saw on a poster"), is a task whoever it names and
    whatever happened in it ("get the contract signed before..."), and is
    heard with nobody said ("should probably ask maya"). About thirty verbs a
    company is run with were added: refund, raise, courier, open, run.
  - *A contact* is known by a three-letter first name (Sam), and the
    company's own word for itself ("the studio") is no longer taken for a
    contact called Studio Palma.
  - *Commands*: a place said with what it is ("the deals board", "tasks");
    writing to or ringing a contact "now"; a sum said first ("640 on
    flights"), charged by the bank, or after a few words ("cab to the client
    office 280"); a contact asked for after the telling ("..., save her as a
    contact") or by their address.
  - **Not done, and still read wrongly:** setting a contact's city or the
    person there from the line (only a phone and an email can be set); a
    sum "settled" with no word for who paid whom.
- `npm run verify` after that: 1,883 unit tests in 115 files.
- **Phase 32, the last of the student** (PLAN.md, part eight):
  - **A task has no area.** College, Company, Personal and Health are gone
    from the line's reading (and `#tags` with them), the task form, *Due
    today* - which is headed by kind, always - and Settings, where **Your
    words** went and Tune asks only about slips. A lesson is about what a
    line is, and the line says which line it learnt from.
  - **The Timetable is *A usual week***: the same rows of repeating hours,
    until a day a quarter off unless told otherwise, with nothing to name.
    "Until the end of term" is no longer a way to end a repeat on the line.
  - **A block's kinds are Deep work, Meeting, Call, Admin and Away**, each
    with its own colour (that was item 15 below). Migration 53 made Away of
    Class, Studying, Break and Personal. A call made from the line sets a
    Call aside, and any other timed task an hour of Deep work.
  - **A contact's form** has Role beside the contact person
    (`leads.contact_role`, migration 53) and no Alt phone or Location; what
    a contact already has of those is kept and shown. Somebody new told
    about on the line with what they are has it as their role, not in their
    notes.
  - **The words**: the model's examples, the sample day, "Revise for..."
    the day before an exam (it is "Prepare for..." a pitch or a demo), the
    placeholders.
  - **Nothing was dropped from the file.** `tasks.area`, `area_words`,
    `terms`, `block_series.term_id`, the area on `line_lessons` and the
    name rows of `line_guesses` are left where they are, unread.
  - **Not done, and said in the plan as done-when:** a search of `src/` and
    `shared/` for class, exam and lecture still finds them - in comments
    written for a student founder, in the Hindi and the short forms the line
    expands ("clg", "asgn"), and in the task reader's list of things that
    have a time. None of it is on a screen. And the calendar's own hidden
    workspace (`services/yourhome.ts`) is still made, though with terms gone
    it holds only blocks.
  - **Lost with it:** a typo of a student's word ("assigment") is no longer
    mended; a company's ("invocie") still is.
  - **Found by looking at it:** the dots beside *How the day went* had no
    colour for Call and Away - two rules still read the old kinds' tokens.
    Fixed, and `tokens.test.ts` now fails on any variable a stylesheet reads
    that nothing defines. That was after the end-to-end run; the change is
    two lines of a stylesheet, and the screens were opened again after it.
- `npm run verify` after that: 1,817 unit tests in 113 files - fewer,
  because the tests of areas and taught words went.
- **Phase 33, who has not answered** (PLAN.md, part eight):
  - **A third filter on Contacts**: Not written to, No answer in 3 days,
    Answered. Read from each contact's history and kept nowhere else.
    Written to is an email or a message said to have gone, not a call; it
    is the last message that counts.
  - **They answered**, a new kind of entry on a contact's history, put on by
    hand: the only way Caulder can know about a reply on WhatsApp, LinkedIn
    or the phone. A reply by mail is seen as before.
  - **Work through them**, beside *Write to them* when contacts are ticked:
    one message for all of them on WhatsApp, LinkedIn or Instagram, one
    contact at a time - their copy, their profile opened, *Sent it* or
    *Skip*. Who cannot be written to there is said first, and why.
  - **Reach out on Today says what is waiting**: "6 written to this week: 2
    answered, 4 waiting - the oldest 5 days."
  - **Under test, nothing is opened outside the app**, so there is now an
    end-to-end test that writes to somebody on WhatsApp (part of item 17).
  - **Not checked:** the plan's own measure - twenty prospects on a Monday
    and the silent ones again on a Friday, in under a minute each time - has
    not been timed by a person. And "No answer" needs three days to have
    passed, so the Friday half cannot be seen in one sitting; it is tested
    with a clock that is told the day.
  - **A limit worth knowing:** a reply on WhatsApp or LinkedIn is only an
    answer once *They answered* is put on the history. Somebody who replied
    there and was not marked is written to again by "No answer".
- `npm run verify` after that: 1,832 unit tests in 114 files.

## Done on 13 October

From the owner's own example (PLAN.md, part nine):

- **A line about somebody leaves its next step.** "Sumanth from RV PUC
  asked me to reach out to him next week. I messaged him on LinkedIn." makes
  the contact, puts what happened on his history as a LinkedIn message, and
  leaves *Reach out to Sumanth* on that day with a notification that
  morning. The same when they are already a contact; when it was me who
  promised; and when it was them, which leaves a check-in.
- **A later line changes the same person**: "Sumanth from rv, I got his
  number, it is ..." sets his number.
- **Adding somebody who is a contact already never makes a second of
  them.** "Add contact Rahul Nair from MS PUC", when he is one, sets what
  the line brought that is new, or opens him. It used to make a duplicate,
  which the new "Which Rahul Nair?" question then caught in a test.
- **The line asks when it is not sure**: who, for a name spelt wrongly or
  one two contacts answer to, and nothing is kept until it is answered;
  when, for something asked for with no day, where tomorrow stands.
- **Whens said loosely are days**: "early next week", "in a few days", "mid
  november", "after the 20th".
- **The AI features were checked against a real service**, with a free
  Gemini key the owner gave for it. Connecting, a wrong key refused in a
  sentence, answers from the records with their links, a follow-up, "the
  records do not say", and a second model: all as intended. The key was used
  from the command line for those runs and is in no file. **Found:** the
  first question failed once with the service busy; a busy service is now
  asked once more. And one model the service lists refused to answer, which
  the app says in a sentence and cannot know beforehand. The setup steps said
  a Gemini key "starts with AIza"; the owner's did not, and they no longer
  say how one starts.
- **No container has one edge coloured or thicker than the rest** - the
  owner's rule. Four had: deal rows, two parts of the call prompter, the
  decision log.
- **Not done:** what part nine lists as proposed - a next step for
  everybody touched, a city or a deal's value said in passing, festivals as
  dates, a missed reminder, one Undo for one line.
- **Known to be loose:** "she'll get back" is read from the words, so "it
  will send an email" about a contact would leave a check-in too. And the
  line's measured number has not been taken again on a new set since these
  rules; the held-out set still reads 68 of 93.
- `npm run verify` after all of it: 1,865 unit tests in 115 files.

## Done on 13 October, later: the AI, and a name nobody knows

On the owner's "build all three" (PLAN.md, part ten) and "ask me where he
is from":

- **A name the line does not know is asked about.** "Sumanth asked me to
  reach out next week", with no contact of that name, asks *Where is
  Sumanth from?* Typed, he is a contact there with what happened and his
  task; left empty, it is only a task - "Reach out to Sumanth", not the
  sentence. Asked only of a line that leaves a next step.
- **A question takes what it needs, not the company** (phase 37). The
  company in brief, the contacts it names or means, and the parts its words
  point at. Said under the box before it is sent. On the sample, a question
  about one contact is under a third of what it was; a test holds that.
  "Everything", *Ask again with the whole company*, or the choice in
  Settings sends it all.
- **What the line was told to remember was never sent to the AI.** The
  Remembered section was in none of the dossier's documents. It is now -
  for the AI and for Export for an AI.
- **The mark on the line is AI mode** (phase 38). Pressed, Enter has the AI
  read the line; what it says is shown and kept as any reading is. One
  request a line. The line, today, and names go - nobody's details.
- **The AI proposes, and writes nothing** (phase 39): the company in brief
  drafted, a page tidied beside the page as it is, and what the contacts'
  history shows. Each is a draft until kept, through the page's or the
  contact's own save.
- **Not checked against a real service.** All of it is tested with a
  stand-in that says what a model would. The key the owner gave earlier
  was not used again and is in no file. Whether Gemini's readings and
  drafts are good, and whether answers are as good with less sent, is not
  known.
- **Known to be loose:** what a question's words point at is a list of
  words (`shared/relevant.ts`), so a question that uses none of them gets
  only what is open - the answer then says it was not sent, and offers the
  whole company. AI mode keeps a line at once when the AI agrees with the
  rules on where and when, so the title kept can differ in wording from the
  one shown; the line under it says what was added.
- **Not built:** "what we know about Harbour" as a draft for one contact.
- **Asked the same evening** (PLAN.md, part eleven): the brain sorted.
  Written down that night and built the next day - see 14 October.
- `npm run verify` after all of it: 1,892 unit tests in 116 files.

## Done on 14 October: the brain, sorted

On the owner's "figure them out yourself" and "I don't want unnecessary
pages... fully functional but not over complicating it" (PLAN.md, part
eleven):

- **How we work.** The section the playbooks were in is the home for the
  rules the company keeps. A rule said to the line - "we never discount
  retainers" - goes on its subject's page there, and the line says which
  before Enter. No page exists until there is a rule for it.
- **"We invoice on the 1st" was read as a task for the 1st.** It is a rule.
- **A rule replaced on a yes.** Said again another way, the line asks
  whether it is instead of the older one, after keeping it.
- **Sort this page**, in a page's More menu: each remembered line offered a
  better home - a rule to its page, a line about a contact to that contact,
  a line said twice let go - ticked, and moved in one go. An AI that is
  connected can be asked about the rest.
- **The rules beside a new invoice and a new quote**, and "what is our
  policy on refunds" answered by the line.
- **Fewer things offered.** *All sections* is in four groups; five kinds of
  page are no longer offered. Nothing a company already has was removed or
  moved.
- **A mistake of mine, mended:** I wrote the new service over
  `electron/main/services/rules.ts`, which already existed (the follow-up
  made when a deal moves). It was restored from the last commit at once,
  its tests pass, and the new service is `howwework.ts`. Nothing in this
  session's record shows that file changed since the commit, so nothing
  should be lost; if it had work in it that was never committed, that work
  is gone.
- **Known to be loose:** what makes two rules "about the same thing" is
  their words with the numbers left out, so "no calls before 10" and "no
  calls on Fridays" are asked about as if one replaced the other; the
  answer is *No, keep both*. And which subject a rule goes to is a list of
  words: one that fits none goes to *Other rules*.
- **Not built:** *Still true?* for a rule a year old (phase 44); asking why
  when a price changes; standard answers.
- `npm run verify` after all of it: 1,908 unit tests in 117 files.

## Done on 14 October, later: money that asks for itself

Phase 34 (PLAN.md, part eight), on the owner's "continue":

- **A late invoice is chased from its row**, in Money and on Today: a
  reminder written for it, read before it goes, sent as any email to a
  contact is. The row says when it was last reminded, and offers another a
  week after.
- **What is owed, by age**, above the invoices.
- **A retainer**: an invoice that repeats drafts its next one when that is
  due, and Today says a draft is waiting. One at a time, and never sent by
  itself. Migration 54.
- **Not built:** the invoice's PDF attached to the reminder - an email from
  Caulder carries no attachments yet.
- **Not checked by sending one:** the reminder was tested as far as the
  filled-in box, and its sending is the same call every other email makes.
  No real reminder has gone to a real inbox.
- **Something to know:** saying that an old, sent invoice repeats drafts
  the next one at once, because it was already due to be written.
- **The eleven specs not run since phase 32 or 33 were run**: all pass.
- `npm run verify` after all of it: 1,915 unit tests in 118 files.

## Done on 14 October, last: a design pass, clashes, Google Tasks

The owner asked for a critique of the app, then "fix all of it"; and, while
that was being done, a warning when the calendar has two things at once, and
for Google Tasks to be made sure of.

**The critique, fixed:**
- **The first screen said "Your company, and your life around it"** - the
  personal half went on 10 October. It says what the app is now.
- **One colour.** A new company was blue against a coffee app; it is coffee
  until another is chosen.
- **One place that asks to be set up**: *Finish setting up* on Today, which
  now takes your name too. Brain home no longer asks to connect an AI twice,
  and its ten questions are folded away until asked for.
- **Today's head is one line** - hello, the day, what is waiting - and
  *Right now* is one row. The work starts higher on the screen.
- **Buttons**: the brown filled style is kept for the one main action on a
  screen; *Call* on a task and *Mark paid* on an invoice are plain.
- **Money says its currency everywhere** (deal cards, the contacts table),
  nothing spent is not orange, and what is owed of one age is said once.
- **Deals**: no "next step" on a deal that is won or lost, "Not spoken to
  yet" rather than "Never contacted", a *Move* button that says what it
  does, quieter won and lost columns.
- **The contact page** is titled with the contact's name; history has three
  tabs - Note, Call or meeting, Message - with the channel as a choice
  under the last two; *Save to my phone* shows once Google is connected;
  Delete is under *More*.
- **Brain home** shows what is written first; the map card shows only once
  there is a map. *All sections* gives an empty section one line.
- **Dates inside a sentence** keep their capitals ("Wed, 21 Oct"); only
  today, tomorrow and yesterday go lower case.
- **No raw names**: a timezone is "Kolkata", not "Asia/Calcutta", and a
  country is its name, in the brief and the pickers.
- **Search snippets** no longer show Markdown; a remembered line whose lead
  repeats its words is said once.
- **Sentences cut** where they explained the app to itself; Settings'
  Workspace tab is in two labelled columns.
- **The sample contradicted itself** - "Contacted", and never spoken to.
  It does not now.
- **Measured, not changed:** the amber "24 days" is 5.5:1 against the
  card, which passes.

**Two things at once** (the owner's ask): overlapping blocks are said on
Today, at the head of the Calendar's day, per day in the week, and in the
block form while a time is chosen - "Overlaps Call with Kettle & Crumb". Said
and never refused, as the calendar has always had it.

**Google Tasks** (the owner's ask: "make sure that connecting to google tasks
works"). Three things were wrong, and are mended:
- **A task Google would not take was marked as sent and never tried
  again.** It stays to be sent, and the sync says how many did not reach
  Google and why. The calendar already did this; tasks did not.
- **A script without the Tasks API under Services could not connect at
  all** - the connection test itself failed on Tasks, with an error nobody
  could act on. It now connects, offers no lists, and says what to add.
- **Only the first twenty task lists were offered.** All of them are.
- These need **version 7 of the Google script**: Settings > Google offers
  the update, with the steps, keeping the same URL.
- **Tested against a stand-in for the script**: a task sent and its
  Google id kept, a task and a tick made in Google coming back, a refused
  task kept and sent the next time. **Not tested against a real Google
  account**, which needs the owner's.
- **Known, and left as designed:** a task ticked in Google and then
  reopened in Caulder is ticked again by the next sync - "done wins on
  either side" (`planTasks`). Said here because it will look like a fault.

- `npm run verify` after all of it: **1,920 unit tests in 119 files**.

## Done on 14 October, at the end: the notebook face

The owner did not love the look. Six looks were tried on the real app, by
laying token overrides over the built window and photographing the same five
screens in each: the coffee face as it was, an open "notebook", a dark
espresso frame, floating cards, monochrome graphite, and near-black. The
owner chose the notebook, with "the sidebar being the margin".

- **One sheet of paper**: page, sidebar and title bar the same cream.
- **Sections are ruled, not boxed** (`.card` in `primitives.css`): a line
  across the top and a small upper-case heading. List rows - invoices,
  pages, templates, mail, deadlines, a contact's deals - are ruled lines,
  not boxes. Overdue says itself with a red heading and a red rule.
- **The sidebar is the margin**, set off by a double rose rule
  (`--margin-rule`) that runs the window's full height.
- **What floats keeps its sheet**: `.card--float` on the dialogs, the
  palette, the tour and the first run.
- The face attribute is renamed `data-face="notebook"`; the coffee accent
  and Gilroy stay. Contrast is measured in `tokens.css` and the design
  language, light and dark.
- Checked: `npm run verify` (1,921 unit tests), `today.spec` and
  `brain.spec` (22 tests), and every screen photographed light and dark.
  The rest of the e2e suite was not run for this change, which is styles
  and five class names.

## Done on 14 October, at the very end: the notebook drawn in

Then "a little paper texture", headings that look drawn on, and collage -
and, while it was built, "readable, not annoying", "hand written but not
like cursive", and "I like the sticky note thing, get creative like that".
All of it is `src/styles/sketch.css`, scoped to the notebook face, with its
tokens in `tokens.css`:
- **Paper grain**, fine and still; **Segoe Print** (printed, not joined, on
  every Windows) for headings, the sidebar, tabs and notes, Gilroy for data
  and running text; section rules and the margin drawn in a wandering pen;
  a scribbled underline on the tab you are on; a highlighter on where you
  are; hand-drawn corners on buttons and fields, a drawn ring to tick.
- **Stuck on**: the sample notice as a taped sticky note, *Right now* as a
  blue strip, Money's four figures as sticky notes, Today's side panels
  pinned up, a contact's Next steps as a note, the calendar's unplanned tasks
  as small notes, the company in brief as an index card, PAID as a stamp,
  deals taped to kraft.
- **Found and fixed while doing it**: a tilted board card trapped its Move
  menu under the next card (`pipeline.spec` caught it) - a card with its menu
  open now squares up and comes to the front. The first grain had a mottle
  whose tiles showed; it was cut. Ink Free read as cursive; Segoe Print
  replaced it.
- **Checked**: `npm run verify` (1,930 unit tests); `pipeline`, `money`,
  `leads` and `today` specs (38 tests); every screen photographed light and
  dark. The rest of the e2e suite was not run for this.
- **Then Patrick Hand**, bundled on the owner's word - and taken out again
  within the hour (below).

## Done on 23 October: a logic pass

Three reviews, of money, of time and of the line, each finding were proved
with a test before it was believed. Mended, most serious first:
- **"Harbour hasn't paid" marked Harbour's invoice paid**, and so did
  "payment from maya is late". The line never reads money in from a line
  that says it has not come, and records it against the contact named as
  paying, not another the line mentions ("got 2400 from maya for the kettle
  job" was Kettle's).
- **Somebody else's number or email was written over a contact's own**
  ("maya's accountant's email is...", "maya gave me sam's number").
- **Google Calendar duplicated or dropped events at the edges of its window**
  for anyone not on UTC: the script asked Google for UTC days. Caulder now
  asks for a day more each side and plans with its own days - no script
  update needed.
- **A task ticked in Google Tasks ended its repeat**; and a refresh from
  Google made an old tick this week's, in the week's review.
- **Repeats drifted**: the 31st became the 28th for good after February, and
  29 February was lost; the same for a retainer. Migration 59 keeps the day a
  run was set on (`tasks.repeat_day`, `invoices.repeat_day`).
- **Two clients' "Send invoice" on the 1st were one run**; undoing a tick on a
  repeating task left two open; a corrected birthday kept the old date.
- **Money:** a part payment from the line was dated by UTC (the wrong month
  near midnight); a one-off running cost, paid, never counted in the burn;
  the email that delivered an invoice counted as a reminder, so the first
  chase said "second reminder" (and INV-1000 matched INV-10001).
- **Changing a filing's day** brought every past period back as late.
- **"done invoice 1042"** ticked a task about another invoice: numbers said
  are now numbers meant.
- **Not mended, and why**: a deleted draft's number is used again - on
  purpose, so the series has no gaps, which tax rules prefer; Today showing
  another workspace's invoice in this one's currency needs an invoice in the
  calendar's own workspace, which nothing makes.
- **Checked**: `npm run verify` (2,010 tests, eight new in
  `electron/main/logicpass.test.ts` and more in `capture.test.ts`, each
  failing without its mend), and **the whole end-to-end suite**: 190 passed
  first time; the four that failed were three sentences cut in the copy pass
  that specs still looked for, and the tour finding the quick key held by
  the Caulder already running. All four pass now.

## Done on 25 October, at the end: lighter and quicker

Measured before and after, on this machine, idle with a company open:
- **Memory: about 180 MB in all, from 262** (private memory). The graphics
  process held 127 MB to draw text and lists; drawn without the card it holds
  36, and every screen settled as fast or faster (Settings 44-69 ms from
  114-152). `--gpu` puts the card back.
- **The model lets go after three minutes idle**, and loads again in a second
  or two when there is something to read. The widget looks for the pointer
  every half second while it is far away, every 150 ms near. The reading loop
  wakes once a minute when idle, not twice.
- **Startup reads less**: screens load when wanted and then all in the
  background, so the first script is 325 kB from 1.2 MB.
- **Screens arrive sooner**: they were ready in tens of milliseconds and then
  took half a second to finish animating in; now about a tenth.
- **Opening when Windows starts** is a tick on the tray icon's menu, and the
  first card under Settings › This computer.
- Checked: `npm run verify`; the `tray`, `widget`, `branding`, `today`,
  `understanding`, `hub`, `money` and `brain` specs; the packaged smoke check
  (the widget drawn and pinned without the card).

## Done on 25 October, last: invoicing anywhere, by rules the company keeps

- **Rules of the company's own** in Settings: tax name, rates, number label,
  titles, the words for not registered, threshold, withholding, financial
  year, the numbers printed - the country's only where they start; a country
  Caulder does not know builds its own. Migration 62.
- **India: not registered, registered or composition** - a plain invoice, a
  tax invoice, or a bill of supply with rule 46's words.
- **Invoice numbers as the company writes them** ("PK/26-27/0042"), used by
  every screen, search, chase and file; **PAN and Udyam** under the name; the
  **amount in words**; **TDS** on a payment; **quotes as PDFs**; **email with
  the PDF attached** (the Google script is version 8: update it in Settings);
  **Health** on Money with the threshold bar and the next filings; costs **by
  product**.
- Tests: `npm run verify` (2,073); `invoices`, `tax`, `money`, `hub`, `leads`,
  `today`, `mail` specs. The e2e runs were slow at times today: the app's own
  quit takes a tenth of a second, and the process then lingered up to thirty
  seconds - Windows Defender, by every sign, which locked build folders all
  day too. Not seen in the packaged smoke check.

## Done on 25 October, later: invoices in the company's look (part fourteen)

- **How invoices look**: Classic, Banner or Compact; six inks; a logo; a
  closing line; *See a sample* in Settings. Migration 61
  (`companies.invoice_look`).
- **A copy in your own folder**: by year, month or client, named by number
  and client, and the copy is what opens. The folder is chosen only in the
  system's dialog.
- **Running costs by account**: grouped under each email on request.
- The invoice page is white whatever shows it: a dark window had shown
  through behind it.
- **Checked**: `npm run verify` (2,055 tests); `invoices.spec.ts` (new) and
  the `money` spec; the three layouts photographed.

## Done on 25 October: what renews, and which account it is on

- **Renewals from the line.** "My unifloe.app domain expires on the 27th next
  year. It renews for 2,640" is a domain in Tools that renews on 27 October
  2027; "I paid 20000 for the domain for 5 years" is paid today and due again
  in 2031. Before, the first was a task two days away: "next year" was not
  read at all, and is now a year on.
- **Paid ahead for years**, on domains and running costs: counted a month at a
  time over the term, and paid at the term's price.
- **Told**: each renewal is its own notification with the morning brief, a
  month ahead for a yearly one and again on its day. Before, only Today's card
  said it, and only to whoever opened the app.
- **The account each is on**: "I use Resend with studio@gmail.com" sets it on
  the page; a change keeps the old one, dated. Shown on Today, in the list and
  in the notice.
- The second blind set's floor is 89 from 90: one line it calls a memory, a
  co-working membership that renews on the 5th, is a running cost now, as
  asked. **Checked**: `npm run verify` (2,050 tests); `hub`, `money`, `today`,
  `quickadd` and `brain` specs (53).

## Done on 24 October: the pass before 1.0.0 goes out

- **An upgrade from 0.5.0, tried for real.** A database written by 0.5.0's own
  code (invoices part paid and late, a quote accepted, a product with a rate,
  a block, a task) was taken to migration 60 by this build: integrity and
  foreign keys clean, every total as it was, old invoices still untaxed after
  tax is switched on, and Money, Today, the PDF and hours all read it.
- **The accountant's pack** offers the country's financial year (April to
  March in India) and is checked end to end: the spreadsheet's CGST and SGST
  columns and the PDFs (`tax.spec.ts`).
- **A block is for a client from the moment it is made**, a repeat's every
  one too; before, only an open block could say so.
- **Fixed, from a review of part thirteen:**
  - tax was rounded a line at a time, up to half a unit a line out; it is
    rounded once a rate now, and a label said twice is one line (a Canadian
    invoice's GST column in the pack had lost one of them);
  - *Hours to invoice* said a different amount from the invoice it made;
  - a new invoice's line rates kept the first client's when another, in
    another province, was chosen;
  - a rate typed in Settings could not be changed again;
  - saying a contact's birthday again removed every fact with "birthday" in
    it, their wife's included;
  - a client's billing details could be read without the company;
  - a retainer on the 31st was projected on the 28th after February.
- **Known, and left:** money is kept in whole units of the currency, so an
  invoice's tax is to the whole euro or pound, not the cent - right for
  India's GST, not for a VAT invoice that has to be exact. Planned (PLAN.md).

## Done on 23 October, last: tax, and the business still done elsewhere (part thirteen)

- **Tax on quotes and invoices, by country.** About eighty known by name,
  rates and number label - India's GST split as CGST and SGST or IGST from
  the GSTINs, the EU's VAT with the reverse charge, Canada's GST/HST/QST by
  province, Australia, the UK, the Gulf and the rest - and any other country
  types its own. A company switches it on in Settings; each line keeps its
  rate and each document how it was taxed, so a change of settings never
  rewrites one sent. The form, the PDF ("Tax invoice" where the law asks,
  the client's number, HSN/SAC) and Money's quarter all say it.
- **A client's billing details** on their page: tax number, country and
  state, payment terms, hourly rate. A new invoice is due by their terms.
- **A quote nobody answered** is on Today after a week, or past its last day,
  with Accepted and Declined on its row.
- **The next 90 days and Clients** on Money; **the accountant's pack** (a
  spreadsheet and every invoice's PDF for a quarter or a year); **hours to
  invoice** from a client's page.
- Migration 60. **Checked**: `npm run verify` (2,038 tests), the new
  `tax.spec.ts` (3), and the `money`, `leads`, `today`, `week`, `quickadd` and
  `workbench` specs; the screens photographed with an Indian company and a
  client in another state.

## Done on 23 October, later: reminders that remind, and Ctrl+Q

- **The owner had no reminder of a call due the day before.** Nothing was
  broken: every notification was off until switched on, and nothing had been
  - no morning brief, no reminder before a block, and a task with a day and
  no time has nothing else to say it. Now **the morning brief is on at nine**
  unless switched off (`nudgeSettings`: never set is nine) and **a block
  reminds ten minutes before** unless switched off (new companies, and
  migration 59 for those with none set). Every task due today and every late
  one is in the brief, which still comes when the laptop opens later.
- **Windows was starting the build folder** (`release\\win-unpacked`), not
  the installed Caulder: opened once as an ordinary app, it put itself in the
  startup list, and every rebuild then changed the app under the owner.
  A copy in `win-unpacked` never registers now, and an installed copy that
  finds the entry pointing elsewhere points it at itself. **The owner's
  entry is still the build folder's until the new installer is run.**
- **The quick window's key is Ctrl+Q** (was Ctrl+Win+A), the owner's choice.
  Held by Caulder, no other app gets Ctrl+Q.
- Both packages were built into a folder of their own and copied into
  `release/`, because the owner's running Caulder was the build folder's.
  `smoke:packaged` passes on them.

## Done on 17 October, later: faster with a lot in it

Measured on a company of 3,000 contacts, 6,000 history entries and 3,000
tasks (the sample has eight contacts, and hides all of this), then mended:
- **Today's read: 276 ms to 24 ms, the week's review 251 to 28.** Every
  history row's day was worked out by making a new date formatter;
  `shared/dates.ts` now keeps one per timezone.
- **Contacts drew every row** - a 1.5 s freeze, 2.2 s to the screen - and
  **Today every overdue task**. Both draw a part and the rest on demand
  (`src/lib/showing.tsx`): Contacts 0.28 s, Today 0.09 s.
- **The sidebar's badge built the whole of Today on every change of
  screen** for one number. It is a count now (`today:overdue`).
- **The page editor (CodeMirror) loads when a page is written**, not at
  start-up: the main window's code went from 2.1 MB to 1.1 MB.
- **A quit could leave Caulder running**: a pass of the model still reading
  when the app quit scheduled another, which started a fresh model on the way
  out. Found when six processes of a test run outlived it; mended
  (`generation`, `closeModel`) and held by a test that fails without it.
- Packaged, on that company: 1.6 s to the sidebar (2.2 before), Today's read
  40-80 ms over IPC (230-300), 608 MB, and nothing left after quitting.
- **Checked**: `npm run verify` (1,998 tests), the `leads`, `today`,
  `brain` and `writing` specs (33), both packages and `smoke:packaged`.

## Done on 17 October: opening at sign-in, and the widget reworked

- **Caulder opens when Windows starts**, on from the first launch of an
  installed copy (the owner asked; it is the one thing on by itself), into
  the tray with no window. Off in Settings beside *Keep in the tray*. A Store
  copy declares a startup task in its package and opens with its window;
  Windows' Startup apps switches it.
- **The desk widget, criticised and mended.** It said "1 late" and nothing
  else, could not be clicked anywhere, opened whenever the pointer crossed
  it, said the next block three times, and counted tasks instead of naming
  them. Now: the pill has the mark and names the thing; it opens after half
  a second of resting; a press opens Caulder and a drag moves it; the panel
  is the date, the rest of the day with what is on marked, the tasks by name
  with a tick each, then the rest. A 1px edge replaced a shadow the window
  cut off.
- **Checked**: `npm run verify` (1,997 tests), the `widget` (6, one new for
  clicking and dragging) and `tray` specs, a launch with `--at-login`
  (no window; the tray brings it), both packages built and `smoke:packaged`
  passing - and leaving no login item behind.

## Done on 14 October, last of all: 1.0.0, for the Store

The owner asked for 1.0.0 as an unsigned .msix to upload to the Store.
- **The version** is 1.0.0 (`package.json`), so the package says 1.0.0.0;
  the Store wants the fourth number 0.
- **The package** is `release/Caulder-1.0.0-x64.msix` from
  `npm run package:store`. electron-builder's target is still called appx;
  the name in `electron-builder.yml` ending in .msix is what makes makeappx
  pack one. Checked inside: no signature, the reserved identity
  (`AdithyaKV.Caulder`, `CN=30ED0224-...`), the model carried.
- **The words on screen were cut** at the owner's word ("dont make the app
  feel text heavy"): about eighty hints and explanations across Settings,
  Import, the Brain, contacts, money and Today became a few words, or went.
  The desk widget's levels are held to fifty characters by
  `shared/widget.test.ts`.
- **The Store listing** (`reference/store-listing.md`) was rewritten for the
  company-only app; the old one promised the journal and Ember. Its
  screenshots in `shots/` are 0.5.0's and are to be taken again.
- **Checked**: `npm run verify` (1,996 unit tests), `smoke:packaged` on the
  package, and the `support` and `widget` specs (8 tests).
- **The margin broke under the tour**: its piece in the title bar, which sits
  above every overlay, stayed bright while the rest dimmed. It is one line
  on the shell now (`sketch.css`), and both packages were built again.

## Done on 14 October, last: the week (phase 35)

At the head of the Calendar's week, for the week shown: what happened in
it - tasks done, people reached and who answered, deals moved and won or
lost, invoiced and paid, hours planned and kept - what has slipped as of
today, and three things for the week after. The three are at the head of
Today until ticked or the week ends, and lead Monday's morning brief. Read
from what is kept, nothing filled in (migration 58, `week_things`).
- **Checked**: `npm run verify` (1,996 unit tests), `week` and `today`
  specs (17 tests, one of them new for this), and the screens photographed.
- **Phase 31 still waits on the owner** for the commit (Claude commits
  only when asked).

## Done on 14 October, late: a line that knows you (part twelve)

The owner asked how the quick line could be smarter "without ai", then said
"continue". All six phases of PLAN.md part twelve were built, in the order
recommended, with no AI anywhere - rules, and the person's own data:

| | Every field read right | |
|---|---|---|
| | Looked at (84) | Held out (60) |
| Before | 59 | 39 |
| Phases 46-47 | 72 | 49 |
| Part twelve | **84** | **58** |

The kind sets moved too, unread: the held-out one is **71 of 93** by the
rules (from 68) and **75 of 93** with the model (from 72).

- **45** - `shared/measured/fields.test.ts` and two new sets, one held out.
- **46** - your day settles the time: morning or evening from your hours,
  "first thing", "after lunch", a call's usual length.
- **47** - "half 3", "0930", "at four", "remind me *when* to *do*"; a task
  that comes back every month, year or fortnight (migration 55); every
  other week as a block series; a short name one letter out, asked.
- **50** - "done call priya" ticks it off, with Undo; "move my 3pm to 4";
  when did I last speak to, who owes, next free hour, what is open for.
- **48** - an answer to "which Priya?" is kept (migration 56) and listed in
  Tune; morning or evening learned from this very thing's past blocks.
- **49** - facts about a contact on *Known about them* (migration 57), a
  birthday as a yearly task, "on leave till" warned about, a missed call
  and its try-again from one line, money in marking the invoice paid.
- **Found on the way**: "priya's daughter is called aarav" was logged as a
  phone call; "ask maya if she prefers whatsapp" went on her history -
  "prefers" and "likes" counted as something that happened. Both mended.
- **Checked**: `npm run verify` (1,988 unit tests); `quickadd`, `today`,
  `leads`, `money` and `week` specs (73 tests). The rest of the suite was
  not run. Nothing of it reaches the network; privacy.md is unchanged.
- **Left**: an hour named on a block with no task ("move my 3pm" finds tasks
  only); a time changed before Enter is not stored (learned from blocks
  instead); the held-out field set's two misses are unread, as they should
  be.

## Done on 14 October, after that: no line through any words

Two nits from the owner. **The mark and the name** in the title bar were
centred by their boxes, and the pot - where the mark's weight is - sat 5px
low; the mark goes up 2px and the name down 3px (`shell.css`). **Text on the
ruling was hard to read in places**: a script walked every screen for text
with nothing painted between it and the page - titles, Today's hello, the
setup offers, the Calendar's date, the Contacts count, tab rows, Brain's list
and heading, Settings' group headings. Each now lies on a feathered patch of
plain page (`sketch.css`), and Brain's list is a sheet. `npm run verify`
passes, 1,931 tests (the flaky deals test passed this time); `today` and
`brain` specs pass.

## Done on 14 October, last of all: normal type, ruled paper, sheets

The owner, on the handwriting: "stick to normal fonts. Not handwritten
ones" - then an off-white page with "slightly visible blue lines that are
barely visible running horizontally", and "have containers, so that text is
still visible and that lines in the background still exist".
- **Gilroy throughout again.** Patrick Hand is gone - the font file, its
  licence, its line in `scripts/notices.mjs`, the `--font-hand` token - and
  so is every handwritten heading.
- **Ruled paper**: faint blue lines every 32px across the page
  (`--rule-line`, `--rule-gap`), over the grain, lighter than first drawn.
  The sidebar keeps the grain but not the ruling.
- **Sections are sheets again**: `.card` is a white sheet with a hairline on
  the off-white page (`--surface` #fffdf9 on `--bg` #f8f5ee), so no text sits
  on a line and the ruling shows between them. The drawn rule across a
  section's top is gone with it.
- Kept: the sticky notes, tape, pins, kraft board, index card, PAID stamp,
  the wandering margin, the tab scribble and the highlighter.
- **Checked**: `npm run verify` - 1,930 of 1,931; the one failure is
  `deals.test.ts` > "sums a contact up by its open deal touched last", which
  fails about half the time on its own and is not touched by this: two deals
  touched in the same millisecond tie, and the tie falls to their random ids.
  Raised as its own task. `today`, `pipeline` and `brain` specs (34 tests)
  pass; every screen photographed light and dark.

## Done on 10 October

See PLAN.md, part seven, for the whole of it. In short:

- **Taken out:** the personal half and its data (migration 49); founder
  sharing; Ember, entirely - the sprite, everything she did, her growing on
  the work, her taskbar window; the jokes, quotations and chatty hellos; the
  flame colours of the line's modes.
- **The line:** six kinds, each told by something Caulder can check; a sum
  offered as a spend rather than assumed; a password never filed.
- **Outreach:** LinkedIn and Instagram on a contact (migration 48); *Write
  to them* for several contacts at once; *Reach out* on Today; how a
  template has done.
- **Contacts as a Google Sheet** (migration 50, script version 6).
- **The screens:** the company heads the sidebar over one unlabelled list;
  a contact's page reads next steps, ways to write, history, then deals and
  money; nobody is named twice on Today; the Brain's home leads with what
  is written.

## In progress

Nothing is half-built. What is unfinished is listed under *Next*.

## Known problems

### Before Caulder is handed out (26 September 2026)

- **The typeface stays Gilroy** - *decided 5 October 2026.* It is a
  commercial face (`resources/fonts`, bundled into every build), so handing
  Caulder out needs a licence from its foundry that covers an app. That is
  the author's to arrange; it is not a thing to swap out again.

Most important first. Each names the place to fix. From a second pass on 25
September 2026: code swept for unwired calls, the documents checked against
the code, and 85 realistic lines put through the quick line. Items marked
*read, not run* were found by reading the code.

### Fixed on 25 September 2026

1. **Do not contact now stops what was scheduled.** `stopBarredMail`
   (`services/mail.ts`) cancels a contact's waiting mail when it is marked,
   and again on each mail pass for anything the script could not be reached
   about. `dueAccountEmails` never picks up mail to a marked contact. Today
   offers no Call for one.
2. **Ctrl+K in a page's editor starts a link and nothing else**:
   `src/lib/shortcuts.ts` leaves it alone when the editor has already acted,
   as Escape does. Checked in a window by `e2e/writing.spec.ts`.
3. **The quick line's misfires**:
   - "book train tickets" ticks nothing. What a line hangs off (Reading)
     can name a habit but never says it was done.
   - A when inside what a heading says ("atomic habits: 1% better every
     day") makes no task.
   - "did i go to gym this week" is a question, answered from habits,
     hours, hobby time and done tasks across home and company. Nothing is
     ticked.
   - Thanks said first is the journal.
   - "last night" and "this morning" are heard on money.
   - "kal kya hai" is a question about tomorrow.
4. **Your data card** says what connections send, rather than that nothing
   is sent.

### Also fixed on 25 September 2026

- **The journal's `@` offers every company's contacts again.** Pages in your
  home reach every company (`reachFrom`, `repositories/links.ts`); a company's
  pages still reach only their own company. The journal had lost this in
  0.4.5, which was committed without the e2e suite.
- **A fact about a contact's life is a memory**, on their page under People,
  which links to the contact once. Before, it went on their history, where
  "what's amma's bp tablet" had nothing to answer from. What a contact *likes*
  still goes on their history: for a client that is where a deal stands.
  "bp tablet", "thyroid pills" and the like are now facts too.
- **Plain facts and ideas with no marker word**:
  - "honey never spoils" and "the eiffel tower grows 15cm in summer" are
    facts;
  - "could partner with…", "we should try…", "how about a…" and "an app
    that…" are ideas.
  - Only those shapes: "the server never responds" is still a note. The
    wider middle is phase 20's.

### Fixed on 5 October 2026

- **Ember's tests failed from one to six in the morning**, when she is
  asleep behind her door: `e2e/ember.spec.ts` and the "Ember comes out"
  check in `smoke:packaged`. Both set the window's clock to mid-morning now.

- **A test that failed before half past five in the morning**:
  `services/yourhome.test.ts` took today in UTC for a company in Kolkata.
  It asks for the company's own day now.

### Fixed on 29 September 2026

- **Ember on the taskbar is a small dot by default.** Walking all day by the
  clock was distracting. She can be a dot (rests by the clock, comes out when
  pointed at, back after a moment, brighter when something waits), walking,
  or hidden: Settings > This computer > Ember > On the taskbar. The old
  on/off setting keeps its meaning; never set is now a dot.
- **The line's rules read more shapes**: ideas asked of yourself, somebody
  who could, a thing named or pitched; a day summed up or said to have been
  (Hinglish read as typed, since `expand()` rewrote it); how a thing goes,
  with its time, as a note; plain facts as memories; errands said alone;
  spends of two things; and "felt like…" is no longer a person called Felt.
  Measured on three sets:

  | | Rules before | Rules after | With the model after |
  | --- | --- | --- | --- |
  | Tuned 89 | 63 | 82 | 83 |
  | Fresh 89 (the rules were written against its misses) | 43 | 78 | 78 |
  | **Blind 90** (written without reading the rules) | **40** | **48** | **50** |

  The blind set is the honest one: about half the lines right by the rules
  alone. Nothing is broken on the tuned and fresh sets; on the blind set,
  lived in, one note ("the landing page takes 4 seconds on 3g") is moved to a
  task by a close page of the person's own.
- **A test that depended on the date**: `services/lines.test.ts` ticked a
  habit a week back from the real today. It passes its own clock now.
- **The whole e2e suite was run** (29 September): 228 passed and 6 failed
  at first. Fixed:
  - the tour said the quick key as "Ctrl Super A"; it now says "Ctrl Win A"
    through `sayShortcut`, and its spec expected the key from before 0.4.5;
  - `quickadd.spec.ts` expected "4:00 PM", where phase 24 writes "4:00 pm"
    for a company in India; it accepts either;
  - `context.spec.ts` looked for any button with "Copy" in it, and found
    "Keep a copy elsewhere" too;
  - `hub.spec.ts` and `quickadd.spec.ts` used lines the rules now read
    rightly by themselves, where they needed ones the rules only guess at;
  - `ember.spec.ts` assumed her own pick never included the beanie.
  The splat, map-link and money failures passed on a second run: flaky, like
  "dropped below her line".

### Fixed on 27 September 2026

- **Cards vanished when Ember landed on them, or was thrown hard.** The
  thump replaced the card's own entrance animation (`.anim-stagger`, fill
  `both`), and taking it off started the entrance again from nothing. The
  thump and the window's quake are now played with `element.animate()`.
- **A dark line across her flame** on one frame of her flicker: an empty row
  in `TORSO[1]`, which her ink outline filled.
- **The marshmallow screen** was a flat pink wash with a small box over the
  page. Now the page is smoked, and she is in the middle of it, furious, with
  what happened and what to do.
- **Twelve more clothes** (28 in all): a cap, a beret, headphones, a halo,
  heart shades, a monocle, a tie, a medal, a puffer vest, a cape, blue
  high-tops and gold trainers, unlocked from level 2 to 20. Her own pick now
  changes her neck and feet too.
- **The line's second opinion, measured on 89 fresh lines** (`lines.fresh.eval.ts`):
  - with 0.36 for overturning a note, rules 43 against the model 48, but two
    or three right notes made into tasks - over-fitted to the 89 it was
    tuned on;
  - `bestOverNote` is now 0.44: the fresh lines score the same (48, and 48
    lived-in), nothing is broken on either set, and the tuned set drops from
    73 and 75 to 69, the wins that only existed there;
  - the fresh set now holds the same bar as the tuned one: nothing broken.
  - The model helps least where the rules are weakest. The rules get 4 of 24
    memories and none of 11 ideas on the fresh lines; the gains left are in
    the rules, not the model's thresholds.

### Flaky

Nothing known. The two that were here - Ember's spec and the journal lock's
slow key - went with what they tested.

### Dependencies

- **Electron is 43.7.7** (phase 25, 5 October 2026; it was 38.8.6). That
  clears its own high advisories and `extract-zip`'s, which 43 no longer
  uses. 43 rather than 44, the newest: 44 remakes the `clipboard` module to
  return promises, and main reads and writes the clipboard at once in six
  places (the copied number that wipes itself, the topic brief). That is the
  next update's work, on its own.
- `npm audit fix` took the rest that had a fix. Two are left, neither of
  which can be reached from Caulder:
  - `braces` (high), inside knip, which never ships and reads only this
    repository's own patterns;
  - `uuid` (moderate), inside `exceljs`: a bounds check in v3, v5 and v6
    when the caller gives a buffer, which exceljs does not do.

### Built underneath, now on a screen (26 September 2026)

- **Payments:** Record a payment (part payments too) and take one back, from
  an invoice's row; *Mark paid* stays the one click.
- **Tasks:** edited from a pencil on the row, on Today and on a contact.
- **Repeats:** "Save every one from here" changes the name, time, length and
  kind from that day on; past ones are left alone.
- **Terms:** removed from the Timetable dialog. They are kept in your home
  now, where the line reads them.
- **Drive backups:** listed on the Data card when asked. They cannot be
  opened from there (the script sends no link), and restoring means
  downloading one into the backups folder first.
- **Going quiet:** set in Settings > Reminders, 3 to 90 days.
- **Deals:** a line of totals (open, value, weighted by stage) in the
  company's currency.
- **"Ask the AI instead"** was removed: the Ask switch replaced it.
- `e2e/askline.spec.ts` was broken since 0.4.5 by the same switch, and is
  mended.

### Still missing underneath

10. ~~The `campaigns` table cannot be filled from anywhere; leads, import and
    spend still carry the plumbing.~~ Taken out on 11 October. The table and
    the two columns stay, unread; Export everything still names a campaign
    on a row that has one.
12. Ctrl+K cannot find products or deals, which part two promised. That
    needs a migration that recreates the search triggers.

### Smaller

14. ~~An invoice can be deleted whatever its status.~~ Fixed in phase 25:
    `deleteInvoice` refuses anything but a draft.
15. ~~Class, Study and Admin share one grey on the Calendar.~~ Fixed in
    phase 32: five kinds, five colours.
16. ~~Money and dates follow the computer's locale, not the company's.~~
    Fixed in phase 24, with days one early west of Greenwich.
17. Coverage: no e2e test for do-not-contact or the built-in follow-up
    (WhatsApp has one since phase 33, from a ticked list); no unit test for `services/scheduler.ts` or custom fields.
18. ~~Dead ends: `day.setHabit`, `life.lookBackLocal`, `activeCompanyGet`,
    `.modeswitch*` and `.nm-*` CSS.~~ Gone on 10 October with the personal
    half; knip and a pass over the stylesheets are clean.
23. `shared/linemode.ts` still has a `life` mode, for the line in the
    calendar's own workspace. Nothing on a screen switches to that workspace
    any more, so it is likely unreachable. Left alone, not checked.
24. `shared/understand-seeds.ts` still has a few lines from a student's
    life ("print the lab record", "submit the internship form") among the
    examples the model compares a line to.

### Documents out of date

19. **`reference/features.md` and `reference/store-listing.md` describe the
    app before 10 October** - a journal, habits, Ember. Both say so at their
    head; neither is rewritten. The listing must not be pasted as it stands.
20. README: campaigns, "bridge file formats", and its table of documents.
21. PLAN.md, part one: the Tour listed as removed; "the count is four"
    (there are thirteen in `package.json`, six of them CodeMirror).
    `reference/architecture.md` and `reference/design-language.md` were not
    re-read against today's change and may name what is gone.
22. `shared/email.ts` opens with "Caulder never sends anything".

## Next

Planned in PLAN.md, **part eight** (written 10 October 2026; nothing in it is
started, and six things in it wait on the owner). In order:

1. **Phase 31 - Standing on it: 1.0.0.** Done: the whole end-to-end suite,
   the line measured, changed and measured again (55% to 73%, 77% with the
   model), 1.0.0 packaged for the Store and as an installer with its smoke
   check, the Store listing rewritten, and `branding/` made. **Left:**
   committing (nothing is), the screenshots, and rewriting `features.md`.
   **The line is better and not finished.** Three in four is enough to stop
   it holding up the rest of the plan; it is not enough to stop measuring.
   A memory is the kind to work on next. The way is the one used twice now:
   read the held-out set's misses, fix their classes, have another set
   written - by a writer given a different company, so the sets stop
   resembling each other - and believe only that.
2. ~~**Phase 32 - The last of the student.**~~ Done on 11 October, but for
   the comments (above).
3. ~~**Phase 33 - Who has not answered.**~~ Done on 11 October; not yet
   timed by a person (above).
4. **Phase 34 - Money that asks for itself**: a reminder on an unpaid
   invoice, what is owed by age.
5. **Phase 35 - The week**: what happened, what slipped, three things for
   the next one.
6. **Phase 36 - Fewer things to look at**: Settings, campaigns (item 10),
   Ctrl+K for deals and products (item 12).

Only the author can do these, whenever a build goes to the Store: the
Gilroy licence (above), GitHub Sponsors, a UPI ID and GitHub Pages for the
privacy URL; installing the Store package and running the Windows App
Certification Kit on it.
