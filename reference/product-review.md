# Product review

*Written 14 September 2026, against the working tree at that date, with a
second review added on 17 September 2026 at the end. Unlike the other files in
this folder it is an opinion at a point in time, not a description of shipped
behaviour, and it is meant to be argued with.*

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

---

## Second review, 17 September 2026

*After phases 1 to 4 of PLAN.md and the flat restyle. The architecture
findings were checked against the code; line numbers are as of this date.*

### What the product is now

Five rows and Settings, one workspace, a money book, a sample company to look
around in, and a flat look in both themes. The first review's §2 (two
products), §4 (the workspace axis), §5 (too many concepts), §6 (onboarding)
and §8 (explaining itself) are answered. §1, the email path, was answered by
removing it and is reopened as phase 5. §7, one machine, is still open.

### Architecture: what holds up

- **The process split is clean.** The renderer reaches the machine only
  through `window.caulder`; `shared/` holds the contract and the pure logic;
  handlers validate and delegate. About 130 channels, and nearly every one
  parses its input (`assertId`, zod, `isDay`) before it touches anything.
- **The database is treated with care.** Forward-only migrations in a
  transaction each, a copy taken before any of them runs, foreign keys with
  deliberate `SET NULL` edges, and indexes behind every list the screens read.
- **The styling is a system, and tests hold it to that.** Every colour is a
  token, both dark blocks are compared, accents and area colours are
  contrast-checked, and one stylesheet owns each block.
- **The gate is real.** Typecheck, lint, 834 unit tests and a dead-code audit
  on every change, and eighteen suites that drive the real window.

### Architecture: what to fix

Security, in order:

1. **Reveal folder opens any path it is given.** `data:reveal-folder`
   (`electron/main/ipc/index.ts:537`) passes the renderer's string straight to
   `shell.openPath`, which will run a program as readily as open a folder.
   Take `"database" | "backups"` and resolve the path in main.
2. **Restore copies any file over the live database.**
   `data:restore` (`ipc/index.ts:548`) checks only that the argument is a
   string, and `restoreBackup` (`db/backup.ts:157`) only that the file exists.
   Take a backup's file name, resolve it inside the backups folder, check the
   SQLite header and `PRAGMA integrity_check` on it before the swap, and abort
   rather than continue when the old `-wal` cannot be removed
   (`backup.ts:183`) — the function's own comment says that is how a restore
   half-applies.
3. **Links and navigation are open.** The new-window handler
   (`electron/main/index.ts:146`) sends any scheme to `shell.openExternal`,
   nothing handles `will-navigate`, and the sandbox is off in both windows
   because the preload is built as ESM. Allow `https:` and `mailto:` only,
   deny navigation, build the preload as CommonJS and turn the sandbox on.
4. **Export copies the database without a checkpoint** (`services/export.ts:142`),
   so recent writes still in the WAL can be missing from it. Use
   `db.backup()`.
5. **The CSV export writes cells beginning with `=`, `+`, `-` or `@` as they
   are**, which a spreadsheet will run as a formula. Prefix them.
6. **An older build will open a database a newer one migrated.** Refuse when
   `user_version` is ahead of the build.

Reliability and release:

7. **Failures leave no trace.** No log file, no crash reporter, no
   `render-process-gone` handler, no error boundary in the renderer; the
   silent catches in `services/scheduler.ts` and `services/remind.ts` make a
   database error look like "sync off" or "nothing due". A small rotating log
   in the user data folder and a boundary with a Reload button cover most of
   it.
8. **The installer is unsigned and nothing updates it.** Windows will warn on
   every install, and a fix reaches nobody who does not reinstall by hand.
9. **Backup and restore, the riskiest code in the app, have no unit test.**

Structure:

10. **One channel lives in three places** — `CHANNELS`, the preload and the
    handler — and `ipc/index.ts` is 1,340 lines. A single contract table
    (name, input schema, handler) that registers the handlers and generates
    the preload surface would remove the bookkeeping and make "every input is
    validated" true by construction. Split it per domain either way.
11. **The contact search re-queries on every keystroke** with no debounce, no
    limit and three correlated subqueries per row
    (`repositories/leads.ts:147`). Debounce it and page it now; the full-text
    index in phase 6 replaces the `LIKE`.
12. **The same timezone lookup is written six times.** One helper.
13. **The end-to-end suites repeat themselves and wait on the clock.** A fixed
    700 ms pause in eight specs, `launch()` copied into eleven files, and
    relaunches that reuse one data folder against the single-instance lock —
    the likely cause of the one `leadtable` failure. A shared fixture fixes
    all three.
14. **Leftovers.** Unused CSS (`.agenda*`, `.charts`, `.today__actions`,
    `.modeswitch*`, `.page-head__actions`, `.nm-flat`, `.nm-raised`,
    `.nm-sunken`, `.section-head__count`); `.rule` and `.rulebuild` are live
    (Your words) and belong with the settings styles; `campaignId` still runs
    through import and the contact form; comments still mention the forecast,
    the marketing report and the outbox.

### UX: what works

Today, and the quick line that feeds it. A contact page that is the one home
for a contact. The board. Money's four numbers. A first run that asks for a
name. And the new look, which lets the data be the loudest thing on every
screen in both themes.

### UX: what to change

1. **A contact is a deal.** The `leads` table carries the stage and the value,
   so a school that buys twice, or two products sold to one customer, cannot
   be shown. Split deals from contacts before products and pricing land: a
   contact has deals, the board shows deals, and a quote or invoice belongs
   to one. This is the largest structural problem left in the product.
   *Done 17 September 2026; see PLAN.md.*
2. **Money reads like an American ledger.** "₹185,000" should be "₹1,85,000"
   and "Sep 14, 2026" should be "14 Sep 2026" for an Indian company, because
   `src/lib/format.ts` formats with the machine's default locale. Format by
   the company's region, set beside its currency.
3. **A new contact is a column of "Not known".** Eight of the twelve facts on a
   contact with a name and a city. Show what is known and an *Add a detail*
   control for the rest.
4. **Every task row shows three controls at rest** — Tomorrow, Next week and a
   red bin — so ten tasks are thirty buttons. Show them on hover and on
   focus; keep the tick.
5. **WhatsApp history stores the template, not the message.**
   `LeadWhatsApp.tsx:69` sends the filled-in text and `:86` logs the raw one,
   tokens and all. A bug.
6. **Making a note a task deletes the note at once**, in a second call after
   the task is created, with no undo (`NotesScreen.tsx:161`). Keep the note
   until the task exists and offer Undo.
7. **`Ctrl+K` only switches company.** It should search everything; phase 6
   does this.
8. **Money repeats itself.** The Invoices tab is followed by a card titled
   Invoices; the tab row can carry *New invoice* instead.
9. **Stages reorder with arrow buttons.** Drag, with the arrows kept as the
   keyboard path.
10. **Reminders are off and at the bottom of Settings.** Offer them once, the
    first time something goes overdue.
11. **Calendar has two unclear readings.** "6h gone" says little, and *How the
    day went* gives Class and Studying the same grey.
12. **The sample company is schools in Bengaluru.** For a founder in any
    other field, a neutral sample — a studio, a clinic, a shop — or a choice
    of one.
13. **There is still no phone view.** The Google sync carries blocks and
    tasks; contacts, deals and money never leave the laptop.

### In what order

1. **A hardening pass** — the six security fixes, the log and error boundary,
   and bugs 5 and 6 above. About a day, and before anything new. *Done the
   same day; see PLAN.md.*
2. **Phase 5**, email through the script.
3. **Deals apart from contacts, and regional formats** — before phase 8,
   because products and prices hang off deals. *Deals done 17 September
   2026; regional formats not yet.*
4. **The brain**, phases 6 onward.

### Verdict

The first review said the product inside Caulder was half the code. It is
now most of the code, and it looks like a tool somebody would pay for. What
stands between it and other founders is not features: it is an installer
Windows trusts, an update path, a log to read when something breaks, two
handlers that trust a path they should not, and a contact model that cannot
hold a second deal. Fix those and the brain has a sound place to live.
