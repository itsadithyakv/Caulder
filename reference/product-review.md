# Product review

*Written 14 September 2026, against the working tree at that date. Unlike the
other files in this folder it is an opinion at a point in time, not a
description of shipped behaviour, and it is meant to be argued with.*

## What Caulder is for

One person, running a small company that sells to schools in India while doing
a degree. The company half is outreach: a list of schools, a funnel, follow-up
tasks, email through the person's own Google account, WhatsApp to a principal.
The personal half is the week around that: lectures, the gym, a club, revision.
The claim the app makes is that these are one Tuesday, and that the reason a
follow-up slips is not that the CRM forgot it but that the afternoon went.

That claim is right, and the Today screen is the proof of it. It is the one
screen in the app that answers a question nobody else's product answers: *what
should I be at, this minute, given everything.*

## What is genuinely good

- **Local-first, no account, instant.** One SQLite file, works on a train, the
  data is the user's. For a student this is the right trade and it is rare.
- **The quick-add line.** "call Oakridge tmrw 11:30am" becomes a task and a
  block, misspellings and all, and it asks only where a guess would be a coin
  toss. This is the best feature in the app and the one that would survive a
  rewrite of everything else.
- **The unglamorous parts are done properly.** Import normalisers exist
  because the real file needed each one; the dedupe rule refuses to merge on
  an email alone because one address really did sit against seven schools;
  due dates are calendar days in the company's timezone; history is
  append-only; sample data is a real import batch with a real undo.
- **Craft.** One token file, two themes that cannot drift, an accessibility
  floor that is measured, 1,037 unit tests and 24 windowed suites, and a
  reference folder that explains every decision.

## Where it falls short as a product

### 1. The email bridge is the most important feature and the weakest one

Every outbound email leaves through a CSV the user exports, a script they
deployed to Google with access set to *Anyone*, and a log CSV they must
remember to import back. The app has a whole Today section whose only job is
to nag about the log not having come back. A solo founder will do this twice
and then go back to Gmail and a spreadsheet, because Gmail sends the email.

Either the app talks to Gmail itself, or it stops pretending to send and
becomes a tracker with a *Log that I sent it* button, a `mailto:` link and the
WhatsApp link it already has. The half-way house is the worst of both.

### 2. It is two products stapled together, and the second is the thinner one

Day, Week, Timetable, Focus and Review are a planner and a habit tracker. They
compete with Google Calendar, which the app already syncs to, and with a dozen
focus apps. The only part of the personal half that earns its place is what
feeds Today: the blocks, so the Now line can say what is on. Focus (an app
blocklist, Windows only, a door rather than a lock) and Review (streaks, and
an admission that it assumes every block was kept) are each a screen, a
settings card and a vocabulary, for a payoff the user could get elsewhere.

### 3. The numbers outrun the data

The Forecast fits a Beta prior, a survival curve and per-signal likelihood
ratios, and prints an 80% interval, from a sample of two closed deals. The
sample workspace says "3 deals likely to close, 80% chance of 2 to 5" on the
strength of one win and one loss. Review refuses to draw a trend under four
weeks; Forecast should hold itself to the same standard and show one sentence
until there are thirty closed deals. Marketing has the same problem in a
different coat: campaign return, maturity and shrinkage, for a founder whose
"campaign" is forty cold emails.

### 4. The workspace model doubles an axis the app already has

Tasks carry an *area* (college, company, personal, health). A workspace is
*also* company or personal, chosen at creation and never changed. So a student
with one company must create a second workspace to see their own week, cross
between the two with a toggle, and read a paragraph explaining why the choice
is permanent. One workspace, with areas doing the tagging and the *Sell* group
appearing once there are leads, would remove the mode toggle, the
last-used-on-each-side memory, the locked kind, and a screenful of docs.

### 5. Too many concepts for one person

Workspace, kind, mode, accent, area, task kind, priority, block, block kind,
repeat, term, template, sequence, rule, campaign, source, qualified stage,
stage kind, saved view, custom field, your words, the widget and its three
levels, the tray, the capture key. Each is defended in the reference with a
good paragraph. The paragraphs are the symptom: a product whose every feature
needs defending has too many.

### 6. Onboarding asks for the desk before it has earned it

On first launch the app claims a global hotkey, puts an icon in the tray,
keeps running when the window closes, and offers a widget that can be parented
onto the Windows wallpaper through an undocumented shell message. That is
engineering for its own sake. A student installing a CRM expects a window.

### 7. One machine, one operating system

A founder lives on a laptop and a phone, and the WhatsApp replies arrive on the
phone. The leads never leave the laptop; only blocks and tasks reach Google.
Local-only is a real privacy feature, and it also means the CRM is invisible
from the bus.

### 8. The app explained itself instead of showing

Twelve sidebar rows, a forecast pinned under them on every screen, a subtitle
under every title, and the reasoning behind each section written under its
heading in the voice of the reference folder. Lovely to read once; furniture
on the fortieth visit. This is the part this pass addressed.

## What changed in this pass

- The sidebar is two groups and Settings: eight rows. Forecast and Marketing
  are tabs on Pipeline, Review is a tab on Day, Import is a button on Leads.
  Every screen keeps its route and its key.
- The forecast footer and the page subtitles are gone.
- Rationale copy moved behind a closed *Why it works this way* disclosure, or
  was cut, on Today, Focus, Forecast, Marketing, Import, Settings and first
  run. First run asks for a name and a kind; the looks are folded away.
- Settings is four groups with a jump rail.
- On a lead, next steps, email and history come first; fields and files sit
  under the facts as flat sections rather than cards inside a card.
- Four shared primitives (`Card`, `EmptyState`, `Explain`, `ErrorLine`) and
  one hook (`useResource`), documented in design-language.md. Forty-three
  hand-written error coercions became one helper.
- Bugs found by the audit and fixed: the Day/Week tabs and both weekday
  pickers had no selected style; the Google auto-sync toggle used a class
  that did not exist; three screens stored a load error and never showed it;
  first run promised the sample could be removed from Settings, which it
  cannot; the Notes empty state told the user to set a key that is on by
  default; a plain function was named like a hook; a dead ref on the board.

## What did not change, and should

- The email bridge (§1) and the workspace model (§4) are untouched. Both are
  product decisions, not tidy-ups.
- The primitives are used where this pass touched; most screens still build
  cards, empty states and fetches by hand. The rule is that a touched screen
  moves onto them.
- The Queue tab lists every message while its badge counts the waiting ones.
  The list is the history and the badge is the alarm, which is defensible, but
  the tab is called *Queue*.
- The WhatsApp entry on a lead's history stores the template with its tokens
  unfilled rather than what was sent.
- Turning a note into a task deletes the note with no confirmation and no
  undo.
- Forecast and Marketing still print their numbers at any sample size.

## Verdict

As a tool for its author it is excellent and unusually well reasoned. As a
product for solo founders and students broadly, it is over-featured where it
is easy to add and under-built where it is hard: the two things that would
make somebody leave a spreadsheet and Google Calendar, an email path that
sends and a view from the phone, are the two it does not have, while it has a
wallpaper widget, a survival curve and an app blocker.

The product inside it is: Today, Leads with import, the board, the day grid
with Google sync, Notes, and Settings. That product is about half the code and
would be easier to explain in one sentence than the current one is in a
folder.
