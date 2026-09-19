# The plan

*Written 14 September 2026. This is the file README.md and reference/README.md
mean by "the plan": dated, about what is coming, and rewritten as it happens.
It follows the review in reference/product-review.md.*

## One sentence

Caulder is the one window a student founder keeps open: what to do today,
where the week goes, who they are selling to, what each deal is worth, and
whether the company is making money. Nothing else.

## The shape

One workspace. Five screens and Settings. No mode toggle, no second workspace,
no "which half" anywhere: the company and the degree are one calendar and one
task list, and *area* (college, company, personal, health) is the only tag.

| Row | What it answers | Built from |
| --- | --- | --- |
| **Today** | What do I do now, and next? | Today as it is, minus the charts |
| **Calendar** | Where does the week go? | Day + Week + the timetable |
| **Contacts** | Who am I talking to? | Leads, with import as a button |
| **Deals** | What is in play, and what is it worth? | Pipeline board, with a one-line total instead of a forecast |
| **Money** | Is the company making money? | Quotes, invoices, payments, spend. New. |
| Settings | Identity, stages, backups, appearance | Four cards |

That is the whole sidebar. A row is a claim that a thing is opened most days,
and each of these is.

## Navigation rules

1. **One list per row.** Every row opens on a list or a grid, never on a
   dashboard, and the primary action of that list is the one button on the
   right of the search box: Add a contact, Add a deal, Add a block, New
   invoice.
2. **A thing has one home.** A contact's page holds its history, its deals,
   its invoices and its files. Nothing about a contact lives anywhere else.
3. **Depth is at most two.** Row, then one thing on it. A deal opens on the
   contact it belongs to. There are no tabs inside tabs.
4. **The quick line is the only global control.** The `A` key and the tray
   window add a task or a note from anywhere. Everything else is reached
   through a row.
5. **The app does not explain itself.** A heading, one line under it at most,
   and an empty state that names the next action. The reasoning lives in
   `reference/`.
6. **A screen shows what the data supports.** A sum, a count and a date are
   always shown. A rate, a curve or an interval appears only past a stated
   sample size, and the screen says the size.

## What happens to every current feature

| Feature | Decision | Why |
| --- | --- | --- |
| Personal workspace, mode toggle, `kind` | **Remove.** One workspace. | Area already tags tasks; the second axis doubled it. |
| Multiple companies | **Keep**, as the switcher only. | A founder may have two companies; both are companies. |
| Today | **Keep**, drop the two charts and the agenda card. | Charts are context for a list nobody reads on the way past. The Now line already shows the hours. |
| Quick add, tray window, hotkey | **Keep.** | Best feature in the app. |
| Day, Week, Timetable, repeats | **Keep** as Calendar. | The week is where time goes. |
| Review | **Remove.** | A habit tracker inside a CRM. |
| Focus | **Remove.** | A blocker inside a CRM, Windows-only, walkable. |
| Notes | **Fold** into the quick line and the contact page. | A note is caught by `Ctrl+N` and lands in a Notes list under Today; a note about a contact is logged on the contact. No screen. |
| Leads table, detail, history, tasks | **Keep** as Contacts. | The core. |
| Import wizard | **Keep**, as a button on Contacts. | Done. |
| Pipeline board | **Keep** as Deals. | The core. |
| Forecast | **Remove** the screen. One line on Deals: open value, weighted value (stage rate × value), count. Rates appear after 30 closed deals; before that the weight is the stage's position. | Two closed deals cannot carry a survival curve. |
| Marketing, campaigns, spend | **Fold** into Money as the spend ledger with an optional campaign label. Return per campaign is a sum, not a verdict. | The money-out half is right; the judging was not. |
| Email templates, queue, sequences, Apps Script bridge | **Remove sending.** A contact page gets *Email* (opens `mailto:` with the template filled) and *WhatsApp*, each followed by one question: *Did it go?* Yes logs it and moves last-contacted. Sequences become a repeat task ("follow up in 5 days"). | The CSV round trip is the reason to leave. Gmail OAuth is a later phase, see below. |
| Rules | **Remove.** One built-in behaviour replaces them: a deal that reaches a stage with nothing planned gets a follow-up task in three days. | One rule everyone wants, no builder. |
| Custom fields | **Keep**, on the contact. | Cheap and used. |
| Saved views | **Remove.** | Search plus a stage filter covers it. |
| Attachments | **Keep**, on the contact and on the invoice. | An invoice is a file. |
| Desk widget, wallpaper level | **Remove.** | Engineering for its own sake. |
| Reminders (overdue digest, block knock) | **Keep**, one card, both off by default. | |
| Your words | **Keep**, one card. | The parser needs it. |
| Google Calendar and Tasks sync | **Keep**, one card. | The only way anything reaches the phone. |
| Target | **Move** to Money as a revenue target per month. | It is about money. |
| Tour | **Remove.** Five rows need no tour. | |
| Accent, logo, themes | **Keep**, in Settings. | |
| Data safety, backups | **Keep.** | |

## The ERP part, at bare bones

"Running the company" is four numbers a month: quoted, invoiced, paid, spent.
Money is one screen with those four at the top and three lists under it.

- **Quote.** A contact, lines (description, quantity, price), a date. Sent by
  the same *Did it go?* path as email. Accepting it creates the deal's value
  and the invoice in one click.
- **Invoice.** Number, contact, lines, due date, status: draft, sent, paid,
  overdue. Overdue invoices appear on Today under their own heading, above
  overdue tasks, because money that is late is later than a call that is
  late. A PDF is generated from one template and attached.
- **Payment.** Amount, date, against an invoice. Marks it paid.
- **Spend.** Amount, date, what for, optional campaign label. The existing
  `campaign_spend` table, renamed in the UI.

No GST return, no ledger, no double entry, no bank feed. When the founder
needs those they have an accountant; the export gives the accountant a CSV.

New tables: `quotes`, `quote_lines`, `invoices`, `invoice_lines`,
`payments`. `campaigns` stays as a label table. Currency stays per company,
display only, as now.

## Phases

Each phase ships on its own, passes `npm run verify`, and keeps every e2e
suite for what it keeps. Nothing is dropped from the database until phase 4,
so a phase can be reverted without losing anyone's rows.

### Phase 1 — One workspace, five rows — *done 14 September 2026*

Shipped as planned, with two deviations. **Email keeps its row** until phase
2 replaces the bridge: hiding it would leave messages queued from a contact
page with no way to be exported. **Saved views stay on Contacts** until phase
4; they are a chip row, not a Settings card, and cost nothing to leave.
Notes landed at the foot of Today with the whole Notes screen inside a card,
which is more than the plan asked for and is the cheapest way to keep the
feature intact. **The sample-data checkbox is gone.** The first run offers a look
round instead: a *Sample company* with a banner, removed on its own when the
real company is created, so nobody has to delete it. The sample is still eight
schools, which is one founder's field; a field-neutral sample is worth doing
before anyone else installs this.

- Remove `kind` from the UI: first run asks for a company name only. Existing
  personal workspaces are shown as companies; their blocks and tasks are
  untouched.
- Remove the mode toggle, the `W` key, the kind-locked copy and
  `otherSide`.
- Sidebar: Today, Calendar, Contacts, Deals, Settings. Money arrives in
  phase 3, so for now the row is absent rather than empty.
- Rename Leads to Contacts and Pipeline to Deals in the UI only; the tables
  and the IPC keep their names.
- Hide Focus, Review, Notes, Forecast, Marketing and Email from routes. Their
  code stays for one phase so the suites still compile.
- Notes: the `Ctrl+N` note lands in a list at the foot of Today.
- Today drops the charts and the agenda card.
- Settings drops Rules, Desk widget, saved views, the tour card and the
  target; keeps Companies, Stages, Your words, Reminders, Google, Your data,
  Appearance, Quick add.

Files: `src/app/routes.ts`, `Sidebar.tsx`, `App.tsx`, `ModeToggle.tsx`
(delete), `FirstRun.tsx`, `TodayScreen.tsx`, `SettingsScreen.tsx`,
`shared/domain.ts` (kind becomes optional and unused), the e2e suites for
personal, review, widget, workbench, marketing, forecast (delete).

### Phase 2 — Reach out without the bridge — *done 14 September 2026*

Shipped as planned, with one deviation: **the Apps Script file stays**,
because the Google Calendar and Tasks sync runs from the same file. Its
outbox half is dead code until phase 4 removes it. The queue, sequences,
exports and log imports are out of the interface; their tables and services
stay until phase 4.

- On a contact: *Email* opens `mailto:` with the chosen template rendered;
  *WhatsApp* as now. Both ask *Did it go?* and log an activity on yes.
- Templates move to Settings as one card; the subject and body are the whole
  template. Sequences, the queue, exports, log imports, `sync_batches` and
  the Apps Script file are removed from the UI.
- Today's "replies waiting", "emails ready" and "log not back" sections go.
  Follow-up is a task, as everything else is.
- The one built-in rule: a deal entering a stage with no open task gets
  "Follow up" due in three days. Settings has a single number for the days.

Files: `LeadEmail.tsx`, `LeadWhatsApp.tsx`, `EmailScreen.tsx` (delete),
`SequenceList.tsx` (delete), `services/sequences.ts`, `services/sync.ts`,
`services/pipeline.ts` (the rule), `resources/appsscript/Caulder.gs`
(delete), `reference/email-bridge.md` (delete).

### Phase 3 — Money — *done 14 September 2026*

Shipped as planned. One addition: `spend.csv` joins the three CSVs the plan
named, because the spend ledger is the one thing an accountant asks for
first. The sample company carries a paid invoice, an open one and a quote
out, so the look-around shows the screen with a shape.

- Tables and repositories for quotes, invoices, payments, with the cascade
  map in `reference/data-model.md` updated first.
- The Money screen: four numbers, then Invoices, Quotes, Spend as tabs of
  one list. Add from the list; open on the contact.
- Invoice PDF from one HTML template through Electron's `printToPDF`, saved
  as an attachment.
- Overdue invoices on Today, above overdue tasks.
- The monthly target on Money: paid this month against target.
- Export everything gains the three new CSVs.

Files: `electron/main/db/migrations.ts`, new `repositories/money.ts`,
`services/invoice.ts`, `src/features/money/*`, `TodayScreen.tsx`,
`services/export.ts`, `shared/domain.ts`, `shared/ipc.ts`.

### Phase 4 — Delete what phases 1 and 2 hid — *done 14 September 2026*

Shipped as planned, with three notes. **`campaigns` stays** as a label table,
because `leads.campaign_id` and `spend.campaign_id` point at it and dropping
it would mean rebuilding both; nothing creates one any more. **The Apps
Script file stays**, cut to its Google half, because the Calendar and Tasks
sync runs from it. **Today computed the funnel and the fortnight** for a
while after the charts went; both went in the UI pass that followed.

- Remove the screens, services, repositories, tables, IPC channels, e2e
  suites and reference sections for Focus, Review, Forecast, Marketing
  verdicts, Rules, saved views, the widget, the wallpaper call, sequences
  and the bridge. A migration drops the tables.
- `koffi` goes with the wallpaper and the foreground poll; the app has three
  runtime dependencies again.
- `reference/features.md` is rewritten to the five screens. `forecasting.md`
  and `email-bridge.md` go. `design-language.md` keeps the primitives section.

### Later, not planned

- Gmail sending, with replies seen. Done in phase 5, below — through the
  Google script Caulder already talks to, rather than OAuth.
- A read-only view from the phone. Local-first makes this a sync problem, and
  the Google sync already carries tasks and blocks; contacts and invoices
  would need the same treatment.

## Decisions that are yours

1. **Keep Focus as a timer only?** The blocker goes either way. A plain
   countdown on Today costs one button and nothing else. The plan says no.
2. **Invoices in phase 3, or quotes only?** If nobody is invoiced yet,
   quotes alone are two tables instead of five. The plan says both, because
   "is the company making money" is answered by payments, not quotes.
3. **Rename Leads to Contacts?** A school that has not been spoken to is a
   lead; one that has is a contact. The plan renames, because a deal is the
   thing that has a stage and a contact is the thing that has a phone number,
   and today one table is both.

## What "done" looks like

Five rows. A first run that asks for one name. A contact page that holds
everything about that contact. A deal that becomes a quote that becomes an
invoice that becomes a payment. Today that says what to do, what is late and
what is unpaid. Reference at about a third of its current length, because
there is a third as much to explain.

---

# Part two: email that sends itself, and the company brain

*Written 17 September 2026. Phases 1 to 4 made Caulder small; part two makes
it the place the company's memory lives. It is written for one founder or
two, on one or two laptops, with no server of Caulder's own.*

## One sentence

Everything a founder would otherwise keep in their head, a notebook, six
Google Docs and a WhatsApp chat with their co-founder — the plan, the prices,
the registrations and their deadlines, who works here and on what terms, why
a decision went the way it did — kept in one place, linked to the contacts,
deals and invoices it is about, and drawn as a map you can wander around.

## What the brain is, and is not

1. **Structured where Caulder acts on it, free-form everywhere else.** A tax
   deadline is a row, because Today has to show it. A price is a row, because
   a quote line picks it. The reasoning behind the pricing is a page, because
   nothing computes on prose. The same rule the schema already follows: a
   value only gets a column when something reads it.
2. **Linked, not filed.** Any page can point at any other page, contact,
   product, person or document with `[[` and a name. Links are what make the
   brain more than a folder, and they are what the Map draws.
3. **Dated and versioned.** Every save of a page is a revision. *What did the
   pricing page say in March* is a real question, and "we changed it" is not
   an answer.
4. **Filled in slowly, and asked for gently.** A new company gets empty
   sections with a short prompt in each, and a checklist of the dozen things
   worth writing down first. Nothing nags from Today.
5. **Private and local.** It lives in the same SQLite file as everything
   else. Registration numbers and bank details are encrypted with the same
   OS store the Google key uses and shown masked. **Passwords are never
   stored**; a tool's page says which password manager holds the login.
6. **Not accounting.** The brain remembers what the company is and what it
   owes the government and when. It does not file anything. The export gives
   the accountant what they need.

## What goes in it

Fifteen sections. Each opens on a short list of pages; each page is a title,
a few fields on top that the section defines, and free text under them.

| Section | What it holds | Structured, because | Phase |
| --- | --- | --- | --- |
| **Company** | Legal and trading name, entity type, incorporation date, registered and working addresses, registration numbers (CIN or LLPIN, PAN, TAN, GSTIN, Udyam), bank accounts (masked), the one-liner and the pitch, brand kit (logo, colours, voice) | Invoices print the legal name, address and GSTIN; the compliance presets need the entity type | 6 |
| **Plan** | A one-page plan (problem, customer, solution, channels, revenue, costs, unfair advantage), the ideal customer, market sizing, competitors, business model, this quarter's goals, milestones, risks | Goals have a quarter and a done state; everything else is prose | 6 |
| **Products and pricing** | Every product or service: what it is, unit, status (idea, building, live, retired), cost, tax rate and HSN or SAC code, and its prices — tiers, one-off or recurring, valid from and to | The quote and invoice line picker reads it; price history and margin are computed from it | 8 |
| **Money plan** | Monthly budget by category, cash in the bank (entered), runway, the revenue target that already exists, fundraising (investors as contacts, instrument, amount, terms), the cap table | Runway is cash divided by the spend the Money screen already records | 11 |
| **Tax and compliance** | Registrations and their certificates, a filing calendar made from presets for the entity type, the accountant, what was filed when and for which period | Every filing is an obligation with a due date that reaches Today, Calendar and the reminder | 9 |
| **People** | Founders (role, what each owns, equity, vesting), employees, interns and freelancers (rate, contract, start and end), open roles, candidates and where each is, onboarding checklists | Candidate status is a list with stages; an end date is an obligation; a checklist spawns tasks | 10 |
| **Customers and market** | Personas, objections and the answers that worked, FAQs, case studies and testimonials, competitor notes | Links to the contacts they came from; no columns | 6 |
| **Playbooks** | How we onboard a client, how we invoice, how we run a demo: steps and checklists | A checklist can be run, which creates its steps as tasks | 11 |
| **Legal and contracts** | Client, vendor and employment contracts, NDAs, trademarks, the privacy policy and terms | Start, end and notice period make a renewal obligation; the file is a document | 9 |
| **Tools and accounts** | Subscriptions (cost, billing cycle, renewal, owner), domains, social handles, and where each login lives | Renewals are obligations; the cost feeds the spend ledger | 9 |
| **Decisions** | Date, the decision, why, what else was considered, who decided | A dated log two founders can point at | 11 |
| **Meetings** | Founder check-ins and advisor calls: agenda, notes, action items | An action item becomes a task with an owner | 11 |
| **Metrics** | The handful of numbers that matter, with history: revenue, customers, pipeline value, cash, and anything entered by hand | Derived ones are computed from existing tables; manual ones are dated values | 11 |
| **Documents** | Every file the company has to be able to find: certificates, contracts, agreements, invoices received, pitch decks — each with a category and, where it has one, an expiry | Expiry is an obligation; a data-room export picks from here | 9 |
| **Ideas** | Product ideas, experiments, things for later | A parking lot; a note from the quick line can be filed here | 6 |

### Tax and compliance presets

A preset is data, not code: a list of obligations with a recurrence, shipped
as a file and updated without a release. Choosing an entity type offers the
matching set, every date stays editable, and the section says in one line that
the dates are a starting point to check with an accountant, because the rules
change. India first, because that is where the first user is; a *Generic* set
(income tax year end, sales tax returns, annual accounts) for everywhere else.

Examples of what the India presets start from, as written today:

| Obligation | Applies to | Recurs |
| --- | --- | --- |
| GSTR-1 | GST registered, monthly filer | 11th of the next month |
| GSTR-3B | GST registered, monthly filer | 20th of the next month |
| TDS deposit | Anyone deducting TDS | 7th of the next month |
| Advance tax | Anyone with tax payable | 15 June, 15 September, 15 December, 15 March |
| Form 11 (annual return) | LLP | 30 May |
| Form 8 (accounts and solvency) | LLP | 30 October |
| AGM, then AOC-4 and MGT-7 | Private limited company | AGM by 30 September; filings within 30 and 60 days of it |

The quarterly GST scheme, professional tax and state-specific dates are
presets the founder switches on, not guesses Caulder makes.

## Where it lives in the app

**A new row, *Brain*, in its own group, *Company*, above Settings.** The key
is `B`. It breaks the rule that a row is opened most days, on purpose: it is
the one place for everything that is not a list of work, and a thing that
cannot be found in two keystrokes is a thing nobody writes down.

- **Brain opens on a home page**: the company card (name, one-liner, entity,
  registration numbers masked), the *write these down first* checklist with a
  progress ring, the next five obligations, recently edited pages, pinned
  pages, and a small live Map.
- **A rail on the left lists the fifteen sections**, the way Settings lists
  its four groups. A section is a filter, not a level: the depth rule still
  holds — Brain, then one page.
- **A page** is its fields on top, the text under them, then *Linked here*
  (backlinks), then *History* (revisions, with a side-by-side of any two).
- **`Ctrl+K` becomes search-everything.** Pages, contacts, deals, notes,
  history entries, invoices, products and people, in one list, ranked, with
  the kind beside each result. Switching company stays in the sidebar header,
  where it already is.
- **The quick line can file.** A note caught with the tray key can be filed
  into a section later, in one click from Today's notes, instead of staying a
  loose note forever.
- **A contact gains a relationship**: prospect, customer, vendor, partner,
  advisor, investor, accountant, candidate. Deals shows prospects and
  customers only; the accountant is a contact the Tax section links to, not a
  deal.

### Write these down first

Twelve items, about fifteen minutes, each opening the page it fills:
the one-liner; entity type and incorporation date; registration numbers;
founders and who owns what; equity split; the first product and its price;
GST status (which switches on the filing presets); the bank account the
invoices print; the accountant; the tools you pay for; this quarter's three
goals; the biggest risk.

## The Map

The Obsidian-style graph, because a company is a web and it is good to see
it — and because it looks good.

- **What it draws.** Every page, contact, product, person, document and
  decision is a dot. A line is a link: a `[[link]]` in a page, and the
  references Caulder already knows — a contact on an invoice, a product on a
  quote line, a person on a role, a document on a contract. The Map is a
  picture of the `brain_links` table and nothing else.
- **How it looks.** Dots are coloured by kind, from a set checked the same way
  the area colours are (every pair separable, 3:1 on both themes, and a
  legend with words, because colour alone is not allowed to mean anything).
  Size grows with the number of links, so what the company revolves around is
  visibly the biggest thing. Labels appear as you zoom in.
- **How it moves.** A force layout settles the dots and then stops; positions
  are saved per company, so the map is the same map tomorrow instead of
  reshuffling each time it opens. Drag a dot to pin it. Under reduced motion
  it appears already settled.
- **What you can do.** Hover a dot to light up its neighbours and dim the
  rest. Click to open it. Filter by kind, by section, or by a search. A
  *local map* on every page and every contact shows just its neighbours two
  links out. A *replay* slider grows the map in the order things were
  created, which is the company's history in thirty seconds.
- **How it is built.** Canvas, not SVG, so a few thousand dots stay smooth;
  the layout runs off the main thread in a worker; the physics is `d3-force`
  (see decisions).

## Links

- **`[[` opens a picker** over every page, contact, product, person and
  document. The link is stored by id, so renaming the target never breaks it
  and the text shows the current name.
- **Links are derived on save**, parsed out of the page into `brain_links`,
  along with the structured references. Deleting a page leaves the text of a
  link as plain words rather than deleting the sentence around it.
- **Backlinks** are shown on every page and every contact: *Linked here*.

## Two founders

Caulder has no server, and part two does not add one. Three ways for two
people to share the brain, in the order they should be built:

1. **One laptop.** Works today; nothing to build.
2. **Through the Google script.** The founder who set up the script shares the
   URL and key with the other. The script keeps the brain's pages, decisions
   and obligations in a spreadsheet in the owner's Drive; each Caulder sends
   its changes and pulls the other's. Every page carries a revision number,
   so an edit made on top of an old revision becomes a second revision marked
   *edited at the same time*, never a silent overwrite. Contacts and deals
   come later, with the same rules. Each Caulder has a *This is me* name in
   Settings, so a revision says who wrote it.
3. **A brain file.** Export and import the brain as one file, for anyone who
   will not use Google.

A hosted sync service is out: accounts, a server and a bill are exactly what
local-first avoids.

## Ask the brain

Last, optional, and off by default. With the founder's own Claude API key
(stored like the Google key), a question box on Brain home searches the local
index, sends only the passages it needs — and shows which — and answers with
links to the pages it used. It never writes anything without a confirm. Most
questions (*what did we charge Oakridge*, *when is the next GST filing*) are
answered by the structured sections without it, which is why it is last.

## Data model

New tables, all company-scoped and cascading like the rest:

| Table | Columns that matter |
| --- | --- |
| `emails` | lead, to, subject, body, `send_at`, status (`scheduled`, `sent`, `replied`, `failed`, `cancelled`, `skipped`), kind (`first`, `follow_up`), parent, Gmail thread and message ids, `sent_at`, `replied_at`, error |
| `brain_pages` | section, template, title, body, `fields` (JSON), pinned, archived |
| `brain_revisions` | page, body, fields, edited at, edited by, revision number |
| `brain_links` | from kind and id, to kind and id |
| `brain_search` | an FTS5 index over pages, notes, contacts, history, invoices, products and people |
| `products`, `prices` | product: name, kind, unit, status, cost, tax rate, HSN or SAC; price: tier name, amount, one-off or recurring, valid from and to |
| `obligations`, `obligation_done` | title, kind, recurrence (the shape `shared/repeat.ts` already reads), remind days, amount, linked page, contact or document; done: the period, when, a note |
| `people`, `openings` | person: kind (founder, employee, intern, freelancer, advisor, candidate), role, contact, start and end, pay and period, equity, vesting, candidate stage; opening: title, status, page |
| `contracts` | title, party (contact), kind, start, end, notice days, value, document |
| `decisions` | decided on, title, context, decision, alternatives, decided by |
| `metrics`, `metric_values` | name, unit, source (manual or a derived key); day and value |
| `documents` | category, owner kind and id (optional), name, file, size, expiry. Replaces `attachments`, which migrates into it |

Changes to existing tables: `leads.relationship`; `quote_lines.product_id`
and `invoice_lines.product_id` (set null on delete); `companies.entity_type`.

## Phases, continued

Each phase ships on its own, passes `npm run verify`, adds its own e2e suite,
and updates `reference/` before it is called done.

**Before phase 5, a hardening pass — *done 17 September 2026*.** From the
second review in `reference/product-review.md`: restore takes a backup's name
and checks the file before touching anything; the folder button takes a
folder's name; every window refuses navigation and hands out only `https:`
and `mailto:` links; both windows run sandboxed on a CommonJS preload; export
copies the database with SQLite's backup and makes formula cells inert; a
database from a newer build is refused; faults go to a capped log, with an
error boundary round every screen; WhatsApp history keeps the message that
was sent; a note made into a task can be undone; and the end-to-end suites no
longer wait for the tour that phase 1 removed. Still open from that review:
signing, auto-update, splitting `ipc/index.ts` (begun in phase 6), and paging the contact
search.

### Phase 5 — Email through your Google script — *done 17 September 2026*

Shipped as planned, with four notes. **The follow-up is columns on the
message's row**, not a second row: there is only ever one, and it means
nothing on its own. **The follow-up is a reply-all that is checked
afterwards** — if it did not reach the contact it is reported as failed —
because reply-all on your own message is the one Gmail behaviour Caulder
relies on without being able to watch it. **The script is tested in a
sandbox here** (`services/script.test.ts`), but has not yet been run against a
real Google account from this build; the first real send is the last check.
**A reply moves last-contacted, not the stage**: an answer can be a no, so
where the contact stands stays yours to say.

Reverses phase 2's *remove sending*, because the reason for removing it is
gone: the script Caulder already calls directly for Calendar and Tasks can
send through Gmail too, with no file ever changing hands.

- **The script** gains `sendEmail`, `emailStatus` and `cancelEmail`, and a
  trigger that `setUp` installs to run every fifteen minutes. A message due
  now is sent while Caulder waits, so a mistake comes back on screen; a
  scheduled one waits in the script and goes out even with the laptop shut.
- **Replies only.** The trigger checks each sent thread for a message from
  someone else, ignores out-of-office replies and treats a bounce as a
  failure. No tracking pixel.
- **One automatic follow-up.** Chosen when sending: a template and a number of
  days. If nothing has come back by then, the script replies in the same
  thread; the moment they answer, it is cancelled.
- **Caulder** gets the `emails` table (migration 19); the contact's Email
  section sends now or later, with the follow-up choice, and lists every
  email with its state and a Cancel; *Reply received* goes on the history
  and moves the contact on; Today shows new replies. Opening your own mail
  app stays as the fallback when the script is not connected.
- **Setup for anyone.** *Copy the script* beside *Save it as a file*; a button
  that opens a new Apps Script project; the steps rewritten around the three
  places people stop, including Google's *this app isn't verified* screen for
  your own script; the key field accepts the whole log line; a `/dev` URL is
  caught and explained; Caulder checks the script's version and says when it
  needs updating; the day's remaining Gmail sends are shown (100 a day on a
  personal account).

### Phase 6 — The brain — *done 17 September 2026*

Shipped as planned, with these notes. **No `companies.entity_type` column**:
the entity type, like the rest of the company's paperwork, is a field on the
profile page, and phase 9's presets read it from there - one place to write
it, one place to read it. **Search is kept by the database**: triggers on
pages, contacts, notes, history and invoices fill the FTS5 index, through a
`search_map` table that gives each row the stable integer id FTS5 needs.
**Saves minutes apart are one version**, except a page's first and a put-back
old one, which always stand alone. **Secrets keep their last four characters**
beside the ciphertext, so a mask never needs a decryption. **The accountant is
a page** in Tax for now, with name, firm and contact details; it becomes a link
to a contact with phase 7. **A prospect whose deal is won becomes a
customer**, and nothing turns one back. **Ctrl + K works from inside a field.**
Two things came along: the end-to-end email suite found that a keyboard
request left over from earlier (pressing N, or the Contacts row) replayed
every time Contacts opened, now cleared when the screen changes; and
`ipc/index.ts` began to split, with the handler wrapper in `ipc/handle.ts` and
the brain's handlers in `ipc/brain.ts`. Not yet tried by a founder: the
templates' fields are a first guess, and the first week of use should
change them.

Brain row and home, the fifteen sections with their templates and prompts,
pages with fields, free text and revisions, pins, the *write these down
first* checklist, `Ctrl+K` search over everything (FTS5), filing a note into
a section, contact relationships, a Markdown export of the whole brain.
Company fields reach the invoice PDF.

### Phase 7 — Links and the Map — *done 17 September 2026*

Shipped as planned, with these notes. **The layout runs on the window's own
thread**, not a worker: the page only runs the app's own scripts and a
`file://` worker is where Chromium is strictest, while a founder's map is
hundreds of dots; it runs a tick a frame and stops. **A link always starts on
a page** - `brain_links` has `from_page` rather than a from kind - because
pages are the only thing links are written in. **Contacts are on the Map only
when something links to them**, with *Every contact* for the rest: an
imported list of two thousand leads is not a picture of the company.
**Products, people, documents and decisions are pages** in their sections
until phases 8 to 11 give them tables, and take their colour from the section.
**The Map has a list view**, because a canvas is not reachable by keyboard.
**Links are ids in the text** (`[[Label|page:…]]`), so the editor shows them
raw; a rich editor that hides them is left for later. The brain also started
moving on a spring - its own curves and durations in the tokens.

`[[` links and the picker, `brain_links`, backlinks on pages and contacts, the
Map (global and local), filters, pinned positions, replay.

**Before phase 8, deals apart from contacts — *done 17 September 2026*.** A
contact has deals, each with its own stage, value, loss reason and close
date; Deals shows one card per deal; a quote or an invoice belongs to a deal.
Migration 22 gave every prospect and customer, and every contact with money on
them, one deal copied from the contact, so nothing moved on the board. Notes:
**a contact is summed up by its main deal** - the open one touched last - so
the contacts table, its sort and filters, the page's header and *Going quiet*
read as they did; the rule is one SQL fragment, not a stored column. **The old
columns stay on `leads`**, unread, because dropping a column with a foreign
key means rebuilding the table. **The contact form edits the one deal** when
there is one, and steps aside when there are several. **An edited quote keeps
its deal**; only a new one falls back to the main deal. **A vendor has no
deal** until given one, which replaces the old rule that only prospects and
customers were on the board. The contact page gained a Deals card; the Money
form asks which deal only when there is a choice.

### Phase 8 — Products and pricing — *done 18 September 2026*

The catalogue and price book, the line picker on quotes and invoices, price
history from invoice lines, margin per product, a product's local map showing
who bought it.

Shipped with these notes. **Products live on Money**, as a tab beside
Running costs, not as a sidebar row: a catalogue is opened when quoting, not
every day. **Product pages became products** in migration 25 - text to notes,
price to the first row of the book - and the page went, so a product has one
home; the brain's Products section keeps the thinking around them as blank
pages, and its checklist item opens the catalogue. **What was charged is read
from invoice lines**, which carry the product, so the price book says what is
asked and the history says what was paid; drafts and voids never count.
**Margin is against today's cost**, since that is the only cost known.
**"Who bought it" is a list, not a map**: the Map's dots are pages and
contacts, and a product's buyers read better as names with amounts than as
dots around one. The dossier and *Export everything* carry the catalogue.

### Phase 9 — Tax, compliance, contracts, tools and documents — *done 18 September 2026*

Obligations with recurrence and reminders on Today, Calendar and the
notification; the presets; contracts, subscriptions and domains as renewal
obligations; `documents` replacing `attachments`, with categories and expiry.

Shipped with these notes. **An obligation is a rule, not rows**: once, a day
each month, or days each year, with the occurrences worked out when read and
one `obligation_done` row per occurrence done, keyed by its due day - which
also says which period it was for (GSTR-1 due 11 October is September's). A
new obligation starts the day it is added, so it does not arrive with years
of misses. **The presets are code**, India's picked from the profile's entity
type and GST status plus a generic set, shipped with releases rather than
fetched: a date that changes is a new release, and every added obligation is
the company's own to edit. **Contracts, registrations, trademarks and
documents are read, not copied**: their notice, end, renewal and expiry dates
become deadlines at read time, so there is nothing to keep in step; tools and
domains stay running costs (phase 7), which already renew on Today.
**Filing and document pages went** in migration 26, into one-off
obligations and documents; the Tax section keeps registrations and the
accountant as pages, with the filing calendar above them, and Documents is
the documents themselves. **Today, the day, the week, the digest, the
dossier and the export** all carry deadlines. A document is either a stored
file or a written-down place, never neither.

### Phase 10 — People and hiring — *done 18 September 2026*

The people register, founders with equity and vesting, freelancers and
interns, open roles, candidates with a stage list, onboarding checklists that
create tasks.

Shipped with these notes. **One `people` table for everybody**, candidates
included, so hiring somebody changes their kind on the same row and keeps the
interview notes; `openings` are the roles. **Vesting is months, not a
sentence**: equity, vesting months and cliff months, vesting monthly from the
start date, worked out for the day asked about - migration 27 moved each
founder page's vesting sentence to the notes, since it cannot be read as
months. **An end date is a deadline read at the time**, as contracts are in
phase 9, and so is a vesting cliff, rather than an obligation row to keep in
step. **Onboarding is a checklist run once**: the usual one for the kind of
person, or any playbook page's `- [ ]` steps with *(day N)* for when; each
step becomes a task tied to the person by `tasks.person_id`, which is how
their page counts progress - the start of phase 11's runnable playbooks.
**The stage list is fixed** (applied, talking, interviewing, offer, hired,
not this time) rather than editable like the sales funnel: hiring a handful
of people does not need its own funnel editor. **People are searchable**, and
the checklist's founder items read the table and open People. People are not
dots on the Map yet: the Map draws pages and contacts, and a person who is
also a contact is on it as the contact.

### Phase 11 — Decisions, meetings, metrics and runway — *done 18 September 2026*

The decision log, meeting notes whose action items become tasks, metrics with
history, and a runway figure on Money.

Shipped with these notes. **Decisions stay pages**, read as a log: a decision
is prose with links, a history and search, which a `decisions` table would
have had to rebuild; the log sorts them by the day decided and pulls out what
was decided, and a new *Look at it again on* date reaches Today like a
contract's. **Action items and playbook steps are the same lines** as
onboarding's: `- [ ]`, with `@name` for who, `(day N)` or `(by date)` for
when. A meeting makes each item a task once; a playbook is run as often as
it is needed, for a contact - the runnable playbooks the Playbooks row asked
for. `tasks.page_id` and `source_step` remember which page made a task.
**Metrics are mostly worked out**: nine derived from the tables that already
hold the numbers, by month, and never typed; the rest are readings written
down. Metric pages became metrics in migration 28. **The runway figure on
Money** shipped in phase 7, with running costs. Metrics are not in search
yet, and the Money plan's budget and fundraising are still pages.

### Phase 12 — Two founders — *done 18 September 2026*

*This is me*, revision authorship, and the brain synced through the Google
script with conflict revisions. Then a brain file export and import.

Shipped with these notes. **The script keeps a log**, not a copy: every change
to a page is a row in a *Caulder brain* spreadsheet in the owner's Drive, with
the page's revisions numbered there, and each Caulder reads it from where it
got to. **The co-founder never gets the owner's key**, which also reaches the
calendar and email: sharing makes an invitation to that one brain, which
reaches nothing else and which *Stop sharing* cancels; and the brain's
connection is kept per company, so the co-founder's own Google connection
stays theirs. **Edited at the same time** is both versions kept - the
other's in the history, this side's written on top, both marked, the page
saying so until somebody saves - rather than a merge nobody asked for. An
edit beats a delete. **Marking what to send is a database trigger**, so no
path that changes a page can forget. **Secrets and pins stay home.** The
script and the two Caulders are tested together: the real script runs in a
sandbox over a spreadsheet in memory, with two databases syncing through it.
**Only pages are shared**; the rows phases 8 to 11 made - the catalogue,
obligations, people, metrics, documents - and contacts and deals come later,
with the same rules, as the plan said of contacts and deals.

### Phase 13 — Data room and Ask the brain — *done 18 September 2026*

A data-room export (chosen pages and documents, zipped, with an index), a
company handbook PDF through the same printer the invoices use, and the
optional question box.

Shipped with these notes. **The question box shipped in part three** (step
4), so this phase was the two hand-overs, on one card on Brain home, *Hand it
over*. **Chosen, never everything**: sections with their page counts, kinds
of document, and four tables that are not pages (people and equity, products
and prices, six months of metrics, the filing calendar), ticked to start from
what each is for. **The data room is HTML, not Markdown**: an investor opens
`index.html` in a browser and clicks through, where a folder of `.md` files
asks them to install something. **The zip is written here**, a hundred lines
with a CRC table and `zlib`, each file compressed on its own and streamed to
disk, rather than a fourth runtime dependency; no ZIP64, so past 4 GB it says
so. **The handbook never shows equity or pay**: it is read by the team. **One
printer**: the invoice's hidden window moved to `services/print.ts`, loading
from a temp file rather than a `data:` address, which Chromium caps at 2 MB.
Pages render through the same Markdown tree the window draws, written out
escaped, so nothing a page says becomes markup in either document.

## Decisions that are yours, part two

1. **The Map's physics: `d3-force` or hand-written?** `d3-force` is small,
   well tested and the standard; it would be the fourth runtime dependency. The plan says use it — a hand-written simulation is where the
   jitter bugs live.
2. **India-first compliance presets?** The plan says yes, with a generic set
   for everyone else and every date editable.
3. **Two founders through the Google script, or a brain file only?** The plan
   says the script, because it is already there and already trusted.
4. **Ask the brain: in or out?** The plan says last and off by default.
   *In, asked for on 17 September 2026, and still off until a key is given.*
5. **Brain as its own row?** The plan says yes, in a *Company* group above
   Settings.
6. **Deals apart from contacts?** Today a contact *is* a deal, so one customer
   cannot hold two. The plan says split them before phase 8, because products
   and prices hang off deals; the second review explains why. *Split, 17
   September 2026.*

## What "done" looks like, part two

An email that goes out on its own, a reply that shows up on Today, and a
follow-up that never has to be remembered. A brain where the answer to *what
is our GSTIN*, *what do we charge for the workshop*, *when is the next
filing*, *what did we agree with the freelancer* and *why did we drop the
monthly plan* is two keystrokes away — and a Map that shows the whole company
at once, and looks good doing it.

# Part three: calls, the dossier, and asking

Asked for on 17 September 2026, and taken before phase 8.

## One sentence

Pressing **Call** opens a prompter with what to say and what to ask; hanging
up asks how it went; and everything the company knows - the brain, every
contact, deal, call and invoice - can be read back as a handful of documents
or asked about with the founder's own Claude key.

## Calls

- **A call script is a brain page**, in Playbooks, so it is searched, linked,
  versioned, exported and asked about like any other page. Its text is
  headings the prompter knows: *Opening*, *Why I'm calling*, *Questions to
  ask* (each line a question), *The pitch*, *If they say…* (each `###` an
  objection, the text under it the answer), *Closing*, *Voicemail*. Anything
  else is shown as written. A new script starts from a tone - **warm,
  professional, direct or consultative** - and is the founder's to rewrite.
  `{{lead.greeting}}`, `{{company.name}}`, `{{me.name}}` and
  `{{company.oneliner}}` are filled in; the last comes from the company
  profile.
- **The prompter** opens from the contact page, and from a call task on Today.
  Across the top: who, the number to dial (and a button that hands it to the
  computer's own dialler), a timer, the script. On the left what to keep in
  mind - the contact's notes, its deals, the last few calls. On the right the
  script, with a box beside each question for the answer, and the objections
  as a row to tap. A notes box is always open.
- **Hanging up asks how it went**: didn't pick up, busy, left a voicemail,
  wrong number, or spoke - and, having spoken, how interested on a five-step
  slider, from *not interested* to *keen*. Then the notes (the answers are
  already in them), what to keep in mind next time, the next step as a date,
  and where the deal goes, suggested from the answer and always changeable.
  Not interested suggests lost and asks why.
- **Only speaking counts as contact.** A missed call does not move *last
  contacted*; it suggests trying again tomorrow instead, which is what keeps
  the contact off *Going quiet*.
- `calls` holds the outcome, interest, script, deal, answers and length; the
  history gets a readable line, so search finds it.

## Running costs and runway

Asked for the same day: *my domain expires in July, my runway, my server
costs.* The brain already holds most of it - a **Tool** page has a cost, a
billing cycle and a renewal date, and so does a **Domain** page - so running
costs are read from those pages rather than typed twice.

- **A Running cost page** in Money, for what is not a tool: rent, salaries, a
  retainer. Amount, how often (monthly, quarterly, yearly), next due, a
  category.
- **Renewing soon on Today**: anything whose renewal or due date is within
  thirty days, soonest first, overdue ones marked. **Renewed** records the
  payment on Money's spend list and moves the date on by one cycle.
- **Money gets a Running costs tab**: every recurring cost with its monthly
  equivalent, the monthly total, and what is coming up.
- **Runway**: the founder types what is in the bank, with the date it was
  true. Burn is the monthly running costs plus the average one-off spend of
  the last three months, less the average paid in over the same months.
  Runway is cash over net burn, shown as months and a month-and-year - *about
  7 months, to April 2027* - and as "not burning" when more comes in than
  goes out. Each balance is kept, so the figure can be seen changing.

## The dossier

**Export for an AI** (Brain home and Settings) writes a folder of a few long
Markdown documents rather than one file per page: *Read me first*, *The
company* (profile, plan, products, money, tax, legal, tools), *Customers and
sales* (the funnel, every contact with its deals, calls, notes and history,
the playbooks and scripts, why deals were lost), and *People and running the
company* (people, decisions, meetings, metrics, documents, ideas). Numbers
are masked unless asked for. Written to be pasted into any assistant whole.

## Asking

Settings takes a **Claude API key**, sealed like the Google key and never
handed back to the window. Brain home gets a question box. The question and
the dossier - masked, and cut to what the question needs when it is too long,
using the search index - go to Anthropic from the main process; the answer
comes back with the pages and contacts it drew on, as links. What was sent is
listed under every answer. Nothing is written without a confirm. Off until a
key is given; everything else works without it.

## Steps

1. **Calls** - scripts, the prompter, the wrap-up, `calls`. *Done 17
   September 2026.* Notes: the prompter is one window for the whole app,
   opened from a contact's page and from a call task on Today, and saving
   ticks that task off. **A missed call is not a touch** for *Going quiet*
   either, not only for *last contacted*; a call logged by hand still is,
   since it does not say. Letter shortcuts are ignored while any dialog is
   open, so a key pressed on a prompter button cannot change the screen
   behind it. `calls.csv` joins the export.
2. **Running costs and runway.** *Done 17 September 2026.* Notes: **Paid**
   rather than *Renewed*, because it is also the word for a rent that is due.
   Today gives a monthly bill three days' notice, a quarterly one two weeks
   and a yearly one a month, so a monthly bill is not there all month. Spend
   that paid a running cost is marked (`spend.cost_page_id`) and left out of
   the one-off average, or it would be counted twice. A company younger than
   three months is averaged over the months it has had. `cash.csv` joins the
   export.
3. **The dossier** - which then carries the costs and the runway too. *Done
   17 September 2026.* Notes: four documents, not three - a *Read me first*
   leads, with the headline figures and example questions. A contact with
   nothing going on is a table row rather than a section, and each contact
   carries its last 25 history entries, so a company with a long imported
   list still reads. *Export everything* includes a masked copy.
4. **Asking.** *Done 17 September 2026.* Notes: **any service, not one** -
   Google's Gemini free with a Google account is the default, OpenAI and
   Anthropic for frontier models, OpenRouter and Groq for free ones, Ollama
   for a model on this computer, and an address and a key for anything else
   that speaks OpenAI's API. Three request shapes cover them all. **Model
   names are read from the service**, not hard-coded, and one is picked by
   pattern, so a new generation needs no release. The whole dossier goes
   with a question when it fits the chosen size, marked for prompt caching
   where the service supports it; past that, only the contacts the question
   is about go - named in it, found by search, then the most recently touched
   - and the answer says so. No retrieval of passages below that: a founder's
   company fits, and a model reading all of it answers better than one
   reading excerpts. Answers are not streamed yet; the box says the model is
   reading while it waits.
5. **A setup guide**, because both connections happen in somebody else's
   console. *Done 17 September 2026.* A new company opens on it: what Caulder
   does on its own, then Google with the Apps Script steps in Google's own
   words, then an AI with the service cards, then the contacts and the brain.
   Skippable, and in Settings under Connections afterwards. Settings itself
   moved to the foot of the sidebar, which is where it had always claimed to
   be - a sibling margin was outranking the rule that pushed it down.

# Part four: a life, not only a company

Asked for on 18 September 2026: *the idea of the app is to help students who
want to found a company - managing outreach, academics, building the product,
allocating time, learning hobbies, journaling and gamifying life to be as
productive as possible. Vision boards and things like that, to help someone
get their life in check - and other people should be able to use it too.*

## One sentence

Caulder is for a student building a company: the outreach and the product,
and also the degree, the hobbies, the journal and the person doing all of
it - so the brain holds the life as well as the company, everything in it
links to everything else, and progress is something you can see.

## What changes in the shape

- **The sidebar**: *Plan* (Today, Calendar), *Sell* (Contacts, Deals, Money),
  *Grow* (Brain, and a new **Life** row, key `L`), then Settings.
- **You, apart from the company**: *Journal* (key `J`) and *Life* (key `Y`)
  in a sidebar group of their own. Studies, hobbies, goals and the journal are
  brain pages underneath - so they link, are searched and keep a history -
  but they are the person's, so they are shown there and never in the
  company's brain. They are private: never sent to a co-founder, never in a
  data room, a handbook or the dossier an assistant reads. They live in the
  workspace, like the college tasks already do.
- **For anyone.** Grades are whatever the university writes, and an average
  is worked out from grade points on whatever scale they use; nothing assumes
  a country. The sample company shows the life half too.

## Phases, continued again

### Phase 14 — Life, and the journal — *done 18 September 2026*

- **Studies**: a course (code, term, teacher, credits, status, grade, grade
  points), an exam (its day reaches Today and the Calendar like a filing),
  class notes. Assignments are `- [ ]` lines with `(by …)`, made into college
  tasks the way a meeting's action items are. The section shows this term's
  courses with their next exam and the hours given to each, and the average.
- **Hobbies**: a hobby (status, why, hours a week wanted), shown against the
  hours actually given in the last four weeks.
- **Make time for it**, on a course, a hobby or a goal: days, a time, a
  length and an end, which is a repeat on the Calendar tied to the page. The
  page shows its time; the block opens its page.
- **The journal**: one entry a day with a mood in words and a face, the month
  as a grid, *On this day*, and under each entry *The day in Caulder* - tasks
  done, calls, time kept, notes, money in, pages written - so the facts are
  already there and the entry is the reflection. A Journal card on Today; the
  day's entry on the Calendar; a caught note can be filed into it.
- **Migration 30** rebuilds `brain_pages` without the section CHECK, the
  last time a section needs a rebuild; one journal entry a day; `page_id` on
  blocks and repeats.

Shipped with these notes. **First built inside the brain, then moved out**:
a journal filed beside the tax calendar made no sense to the person keeping
it, so the four sections left the brain's rail for *You* - Journal and Life -
while staying brain pages underneath. **The journal has no Edit button**:
it opens on today, and what is typed is kept a moment after the typing
stops, one change at a time in order; an entry is made by the first word or
face, never by opening a day. **The rebuild runs with foreign keys off**,
which the runner now does for a step marked `rebuilds`, because dropping the
old table would have cascaded into every revision and link; the triggers and
indexes are made again as they were. **An exam belongs to its course by a
link**, made when the exam is added from the course, rather than a field to
keep in step. **The average is scale-free**: grade points times credits,
whatever the university's scale. **What a page's time got is read, not
kept**: the past blocks tied to it, not skipped. The sample company has a
course and its exam, a hobby with evenings set aside, a goal and two days of
journal.

### Phase 15 — A simpler brain, and Today for all of it — *done 18 September 2026*

Asked for while phase 14 was being built: *the brain feels crowded and
complex*, and *the home page should be a mix of all of them - the company,
hobbies, consistency, quick journaling - things done often, without
friction, on the first page; and let the notes be smart about whether a thing
is the company's, outreach or personal.*

- **The brain, simpler.** The rail is Home, the Map, the sections that hold
  something, *All sections* and *Share and export*. Brain home is the company
  in a line, the box to ask it, *Write these down first* folded to what is
  left, pinned and recent pages, and the map. A section has one *New page*
  button - a menu when it has several kinds - and its prompt's first sentence
  with *More*. A page's bar is *History*, *More* (pin, archive, delete) and
  *Edit*.
- **Today for all of it.** The quick line takes anything and says where it
  will go - a task (a contact's, when one is named), a contact's history, time
  on a hobby, the journal, an idea, a note - from what Caulder knows, with
  the other places a chip away. Beside the work: the journal, habits ticked
  with their run of days, and your week.
- **Habits** (migration 31): a name, an area and its days; a tick a day;
  the run, the best run, the rate and twelve weeks worked out from the ticks.

Shipped with these notes. **The line has no model**: contacts' names, hobby
titles, the words for when and a handful of words for feelings and for
having done something are enough, and a reading that says why can be
corrected; the unsure go to a note, never nowhere. **A name matches by its
start** - *GIG International* for *GIG International School* - and a name under
three letters never does. **Time on a hobby is a block that ended now**, so a
hobby logged from the line and one set aside and kept count the same way.
**A streak counts a habit's own days**, so Monday-Wednesday-Friday is not
broken by a Tuesday, and today is not a miss until it is over. **Nothing about
a streak is stored.**

### Phase 16 — One connected brain — *done 18 September 2026*

- `[[` reaches products, people and documents too; *Linked here* on a person
  and a product. Tasks show the page that made them; a block, the page it is
  for.
- **The Map draws everything**: pages, contacts, products, people and
  documents, with the links Caulder already knows - a person who is a
  contact, a product and who bought it, a document and whose it is.
- **Obsidian's graph**: the map fills its pane with the controls floating
  over it; hovering lights a dot's neighbours with a fade; labels grow in as
  you zoom; dragging pulls the neighbours along and lets go (Shift pins);
  a Display panel for the forces and the look; orphans on or off; the local
  map one to three links deep.

Shipped with these notes. **A link can end on anything with an id**
(migration 32): `brain_links` lost the `CHECK` that kept its far end to a page
or a contact, and deleting a product, a person or a document clears the links
to it and its place on the map, as deleting a page always did. **Products,
people and documents are their own dots, not pages** - they have had tables
since phases 9 to 11 - so a page in the Products section is a page, and the
product is the product. **The map draws the links the tables already know**
- a person who is a contact, who bought a product, whose a document is - so a
company that never typed `[[` still has a map. **The founder's own pages are
on the map in one grey**, *Your own*: the six hues left for the company pass
the colour-blind checks, and a seventh did not; your own is a place, not a
kind of company thing. **Opening something where it lives goes through one
function** (`openRef`), and arriving at the screen already on show no longer
sends it home first: a person linked from a page in the brain used to land on
Brain home. **Dragging is live and springs back**; Shift pins, because a
map where every nudge pins is a map nobody dares to touch. **A fitted map is
never zoomed past 1.25**: four dots at twice their size made names shout.

### Phase 17 — Your life in check — *done 19 September 2026*

- **Life's overview**: the vision board on top, then the level, the week
  across the four areas, and achievements. (Habits came in phase 15.)
- **The vision board**: pictures and words, each tied to a goal or an area if
  wanted, reordered by dragging. Pictures are resized and kept in the
  database, so a backup carries them.
- **Goals**: pages in the Goals section with an area, a day, a target and how
  far along, drawn as a bar.
- **XP, levels and achievements, worked out rather than kept**: every point
  is something the tables already say happened - a task done, an hour kept,
  a call, a deal won, an invoice paid, an entry written, a habit ticked, a
  goal reached. Nothing is awarded for opening the app, and nothing can drift
  out of step with what happened, because nothing is stored.

Shipped with these notes. **Goals were already there** - phase 14 made them,
with an area, a day, a target and a bar - so this phase is the board, the
level and the week. **A picture is made smaller in the window**, not the main
process: a phone photo is twelve megabytes, the kept one a few hundred
kilobytes, and only that crosses. The main process checks it by its first
bytes, whatever it claims to be, and hands it back as a `data:` URL - the
window's CSP allows images from `data:` and not from `blob:`, so the preview
is one too. **The level is on Today as one line**, not a card: the day's work
is the point of Today, and a level is a glance; it reads again whenever
Today does or a habit is ticked, and says so when a level is crossed. **An
achievement's day is when the thing happened**, not when the app noticed, so
opening Caulder after a month does not date a month of them today. **The
week is XP by area**, with the time and the count in words, because an hour
kept and a task done are not the same length of bar; and the areas nothing
happened in are named rather than drawn as empty bars alone. **A break
counts for nothing**: rest is not something to farm points from.
