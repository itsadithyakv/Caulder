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
| Desk widget, wallpaper level | **Removed, then asked for back** in 0.4.5 and rebuilt. | Judged engineering for its own sake; the person it is for wanted the day on the wallpaper. |
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
  runtime dependencies again. **Both came back in 0.4.5** - the widget and
  its wallpaper level were asked for by name, and koffi with them, so the
  count is four. The foreground poll stayed gone: that one was Focus, and
  Focus is not coming back. See `reference/features.md`, "The desk widget".
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

### After 0.3 — You, and the company chosen — *done 19 September 2026*

Asked for on 19 September 2026: the switcher at the top of the sidebar changed
everything, when the outreach and the rest of the company are one part of
the app; it belongs with the company's screens. And the coffee look, kept.

- **The company is chosen where its screens are**: its heading tops Contacts,
  Deals, Money and Brain, and the top of the sidebar is Plan and You.
- **Your own things have one home** - `homeCompanyId`, a workspace of the
  personal kind if there is one, otherwise the first company made - and the
  journal, Life, habits, the vision board and your level read from it
  whichever company is chosen. Nothing moved in the database: for someone
  with one company, home is that company.
- **Today and the Calendar are your home and the chosen company together**,
  merged by the main process (`withHome`), so choosing a company in the
  sidebar never hides your own day. Your level counts every company.
- **Coffee is the app's face**, set on the page so the first paint wears it;
  a company's colour is its mark. The app icon, tray and notification marks
  are the logo on transparency, with the ink lifted where Windows is dark.

### After 0.3, again — Anywhere, and ready for other people — *done 19 September 2026*

Asked for on 19 September 2026, after the product review: fix what can be
fixed, a fast tutorial, the quick window easy to find, Today less off, a
passcode on the journal for reading and not for writing, and a product for
people in any country, not only Indian student founders.

- **A five-step tour** on a first run, and back from `?`. Kept out of the test
  suite unless a spec asks for it.
- **Today, calmer**: the day in one line under the heading; the line's hint
  names the key for any app; the late things first and a far-off deadline
  after the day's work; a row's quieter actions on hover and focus; the work
  column wider and the life column lighter; notes at the foot of the work.
- **The journal's passcode** (migration 34, `journal_sealed`): a key pair, so
  a day that is over is sealed without asking and only the passcode opens it.
  Sealed means gone from the page, its history and search.
- **A company's country** (migration 35): the currency it starts on - any
  currency, not seven - the calling code for WhatsApp and the dialler, and
  India's filing calendar or the general one. India's names (PAN, GSTIN,
  IFSC, UPI, HSN or SAC, TDS) became general ones with India's in the hints,
  and invoices and Brain home print India's names for a company in India.
  The timezone can be changed.
- **Updates** through electron-updater and GitHub Releases, **another copy of
  every backup** in a folder that syncs, and **Report a problem**, read in
  full before it goes anywhere.

Not done, and why: **code signing** needs a certificate bought in the
founder's name; **a real send through Google** needs the founder's account.

### After 0.4 - Settings laid out, and links made with the mouse - *done 19 September 2026*

Asked for on 19 September 2026: Settings felt empty, with a lot of space and
nothing in it; and the Map should link things by dragging, not only by
typing `[[`.

- **Settings, laid out on purpose.** Each group is a narrow column and a wide
  one that end on the same line, and a card that is a screen of its own (the
  AI's, your data) spans the group with its halves side by side. The rail
  down the left became a row of links along the top that stays in view and
  shows where you are. *Desk* and *The app* became **This computer**; the
  setup guide's card became **Two connections**, which says what is
  connected.
- **Linking on the Map.** Drag a dot's + (or Alt and the dot) onto another:
  the link is written at the foot of the page at one end, with Undo. Click a
  line to take it out; a sentence keeps its words.

### After 0.4, again - You apart, memories yours, and Today about the work - *done 25 September 2026*

Asked for on 25 September 2026, after a review of how the company, a life and
ambition sit together: fix all of it.

- **A home of your own, never a second workspace.** Your journal, Life,
  habits, vision board and memories are kept in a workspace of the personal
  kind that Caulder makes once (`services/yourhome.ts`) and moves your things
  into - still not in the switcher, still no mode, still "you are not a
  company". So the company's brain and map are the company's alone, archiving
  a company never takes your journal with it, and the sample's pages are never
  yours. The journal's day beside an entry reads every company.
- **Memories under You**, a row of its own; the company Brain is the
  company's knowledge only, and the map is reached from each rather than from
  a row of its own.
- **Today leads with the work**: the quick line, then what is late and due.
  Finish setting up is one line; the joke, the memory and your level sit
  beside the work; the notes box went - the quick line is how things come in.
- **Goals are where ambition lives**: the vision board heads them, and levels
  and XP are a setting.
- **The map shows what matters**: journal days only when asked for, and labels
  that give way to each other instead of running together.

### After 0.4.5 - The journal, locked properly, and looking back - *done 25 September 2026*

Asked for on 25 September 2026: somewhere to write deeply private things,
locked up, and still able to read them back; and a way to see how you have
grown, by a model on this computer, or sent away only after a warning and the
passcode.

- **Today can be locked as it is written**, not at midnight - offered, ticked,
  when a passcode is set. Writing still needs nothing: a line added while the
  journal is locked is sealed as a part of its own and read with the rest.
- **It locks when you leave**: locking the computer, closing the lid or
  sleep, as well as after fifteen idle minutes. With a passcode, the journal
  is kept out of screenshots, recordings and shared screens.
- **Read back**: a search of the journal, locked days and private lines
  included while it is open, done in memory and never indexed.
- **A recovery key**, made with the passcode and shown once, opens the
  journal with a new passcode. Forgetting both is still the end of those days.
- **Stronger passcodes**: new ones need eight characters and are not the
  first anybody would try, with a meter as they are typed; a slower key is
  made from them (scrypt 2^17). Passcodes set before still open.
- **Nothing lingers**: deleted content is overwritten (`secure_delete`),
  search forgets what it is told to (migration 45), and the write-ahead log
  is folded back after a seal.
- **Looking back**: a reading of a month, a season, a year or all of it -
  how you have changed, work and ambition, what kept coming up, what went
  well - beside the numbers for each month. Read by Ollama on this computer
  by default; sent to the connected AI only after saying who gets how many
  days and the passcode typed again (SEND without one). Nothing of it is
  kept, and private lines never go.
- **A loss fixed on the way**: a note moved into a day that was already
  sealed used to seal over what was there. It is added as a part now.

---

# Part five: understanding, on this machine

*Written 25 September 2026. Planned, not started; the decisions at the end
were made the same day.*

## One sentence

A small model that runs on this computer and reads what you write for what
it *means*, so the quick line puts things where they belong, memories gather
into topics without being filed by hand, and what goes to an AI (or into an
export) is the right part, arranged and without repeats.

## What a 25 MB model is, and is not

A model that size is an **encoder**: it turns a line into a list of numbers (a
vector) so that lines meaning similar things land close together. It can tell
that "red rising book 2 was brutal" belongs beside a page called *Red Rising*,
that "my blood type is O positive" says the same as an older "Blood group: O+",
or that twelve loose lines are all about coffee.

It **cannot** write. It does not summarise, answer, or name a topic in a
sentence of its own. Anything that has to write stays with the AI the person
connects under Ask, as now. It is trained on English, so Hinglish goes through
`rephrase()` first, exactly as the rules already do.

## Where it sits: the rules first, the model second

The quick line's rules stay the source of truth. There are about 150 tests
and 400 assertions on them, and they are right about structure: dates,
times, prefixes, negation, names and commands. The model only acts where the
rules are guessing.

**It never overrides:**
- a prefix;
- a private line or a secret. It may push a line *towards* private, never away;
- a command or money;
- an edit or a question;
- a date or a time;
- a contact found by name. Names carry no meaning to an encoder.

**It is asked only at these points**, all of them already chosen by
the code as the soft places:

| Where | Today | With the model |
| --- | --- | --- |
| The kind, when the rules reach their late fallbacks (`capture.ts`, the instruction / date-ahead / page / topic / note tail) | Rule order decides; `voteKind` may swap a soft kind | Nearest lines the person has already filed vote too, with a score and a `because` ("sounds like your Gym notes") |
| Where a memory goes, when `branchOf` falls to `ideas` under Me, or `namedPage` finds no exact title | Random knowledge / Me | The nearest existing page above a threshold, offered as the destination chip |
| A task's area, after your words and lessons, before the keyword lists | `AREA_PATTERNS` | The areas of the nearest past tasks |
| Answering "what did I say about..." on the line | `recall()`: shared words | Shared words **and** meaning, merged |

The chips stay. A model's choice is shown like a rule's, and pressing another
chip still teaches a lesson.

## How it is built

- **all-MiniLM-L6-v2, int8 (23 MB), run by `onnxruntime-node` in an
  Electron utility process.**
  - Not in the window: its security policy refuses WebAssembly.
  - Not in main: main runs SQLite synchronously, and a batch of reading must
    never stall a click.
  - Main talks to the process over a `MessagePort`; if the process dies, the
    line carries on with the rules alone.
  - The window asks `understand:read` after the line pauses, the way it
    already asks `lines:answer` after 200 ms.
- **The tokenizer is ours.** MiniLM uses BERT's lower-cased WordPiece
  vocabulary, about 30,000 words. Splitting into WordPiece, mean pooling and
  normalising are pure functions in `shared/`, so only the one matrix
  multiply-heavy call needs the runtime.
- **A thirteenth runtime dependency.** `onnxruntime-node` is native, so it must be
  unpacked from the asar like `better-sqlite3` and `koffi`. Only the Windows
  x64 binary may ship, not every platform's. `architecture.md` says why it
  earns its place.
- **Vectors in SQLite.** A new migration (46 as this is written) adds `vectors`:
  - Each row is `(company_id, kind, ref, model, text_hash, vec)`, stored as
    384 bytes of int8.
  - `kind` is one of page, memory, contact, task, note, history or person.
  - A memory's `ref` is its page id plus a hash of its line, because memories
    are lines, not rows.
  - `text_hash` means unchanged text is never embedded twice.
  - `model` means changing models re-reads everything rather than mixing two
    kinds of vector.
- **Kept up to date the way search is.** Triggers on the same source tables
  add rows to an `embed_queue` table, and a scheduler job works through it
  in small batches while the app is idle. These are new triggers; migration
  20's are frozen and stay untouched.
- **No vector database.** A few thousand vectors are compared by brute force in
  memory in a few milliseconds, one company at a time. There's no
  `sqlite-vec` and no new native extension for it.
- **Pure where it can be.** Tokenising, pooling, cosine, int8 packing, the
  nearest-neighbour vote and the thresholds live in `shared/understand.ts` and
  are tested like the rest of `shared/`. Only loading the model and running it
  live in `electron/main/understand/`.
- **The model file** goes in `resources/model/`, beside the executable like
  the tray icons.
  - It is fetched by `scripts/fetch-model.mjs` against a pinned SHA-256, not
    committed.
  - `smoke:packaged` loads it from the packaged binary, the only place a
    missing resource shows up.
- **Settings > This computer > Understanding:**
  - on or off;
  - how many things it has read;
  - *Read everything again*.
  - Nothing leaves the machine, and nothing moves without a yes.

## Phases, continued

### Phase 18 - Close the two leaks first - *done 25 September 2026*

Before anything reads more, stop sending what it should not.

- **`about()`** (`services/ask.ts`) leaves out personal sections unless
  `aiPersonal` is on. Journal days are left out unless they are unsealed and
  allowed.
- **`ideas`** leaves `RUNNING_SECTIONS` for the home workspace, or is gated
  the same way.
- **Tests in `ask.test.ts`** for both, asked from the home workspace.
- **`remembered` joins `yours.ts`**, so About me, People and Where things
  are go with a question when "your own pages" is on. They still never go
  when it is off. This was decided below.

### Phase 19 - The model and its index - *done 26 September 2026, but for the measuring stick*

What was built, against what follows:
- The tokenizer, pooling, int8 packing and nearness are in `shared/understand.ts`.
  The tokenizer gives BERT's own ids for the real vocabulary.
- The model runs in `electron/main/understand/`:
  - `embed.ts` is plain Node, so it is tested against the real model;
  - `worker.ts` is the utility process;
  - `host.ts` starts it, restarts it and times it out.
- The vectors table and queue are migration 46 and
  `repositories/vectors.ts`. The journal is never read.
- The queue job is `services/understand.ts`, which reads only text that has
  changed.
- The `understand:` channels are state, set and again. "Read" and "similar"
  wait for phase 20, which is the first to call them.
- The Settings card is under This computer.
- Packaging keeps Windows x64 on the CPU only, which leaves out the other
  platforms and the GPU libraries. `smoke:packaged` waits for the card to say
  something was read.
- **Budgets, measured on this machine:**
  - the model loads in 112 ms;
  - a line is read in 1.5 ms (the budget was 30);
  - a batch of 32 is read in 29 ms.
- **The measuring stick moves to the start of phase 20.** It compares rules
  alone with rules and the model, and there is no vote to compare until
  then. What phase 19 proves is that the vectors mean something: "my blood
  type is O positive" is nearer "Blood group: O+" than "buy groceries".
- The download to fetch it is `npm run fetch-model`. It fetches from a
  pinned revision and checks each file's SHA-256.

The plan as written:

- `shared/understand.ts` holds the WordPiece tokenizer, pooling, cosine,
  int8 packing and the vote.
- `electron/main/understand/` holds the utility process, the port and
  the queue job.
- That migration and the `understand:` channels (state, read, similar,
  rebuild).
- `onnxruntime-node` in `package.json`, `asarUnpack` and a file filter in
  `electron-builder.yml`, checked in both the NSIS and the Store package.
- The Settings card.
- `smoke:packaged` starts the process in the packaged binary and embeds one
  line.
- **The measuring stick.** The lines already in the `capture*` and
  `quickadd*` test tables, about 400 with a known answer, plus 100 new ones
  written for this in Hinglish and texting shorthand, with no overlap.
  Two runs over them:
  - rules only;
  - rules plus the model.
  The model ships only where it moves wrong answers to right ones and moves
  no right answer.
- **Budgets:**
  - a line is read within 30 ms of the pause;
  - 5,000 things are read in under a minute in the background;
  - memory grows by under 60 MB.

### Phase 20 - The line gets a second opinion - *done 26 September 2026, but for recall*

*Measured again on 27 September 2026, on 89 fresh lines: the gain mostly did
not carry over, and 0.36 for overturning a note broke right readings.
`bestOverNote` went to 0.44; nothing is broken on either set. On 29 September
the rules learnt the shapes they missed, and a blind set of 90 was written
without reading them: 40 right by the rules before, 48 after, 50 with the
model. See STATUS.*

What was built:
- **Which readings count as guesses.** `readCapture` marks the fallbacks at
  its end `soft`: a when with nothing else, an unmarked fact, a new topic, a
  feeling in passing, and the note nothing else claimed. Only these are ever
  doubted.
- **The decision is `shared/opinion.ts`.** It is pure, and every threshold
  lives there.
  - `secondOpinion` decides the kind and where a memory goes. Nearest
    examples vote by closeness cubed, and your own lines count 1.5 times a
    seed.
  - Changing the rules' answer needs a clear share of the vote and one close
    example. The bar is lower over "note" and much higher over a task that
    has a when.
  - A memory goes only onto one of your own pages.
  - `areaOpinion` gives a task an area from your nearest tasks, when nothing
    else placed it.
- **The votes** come from `services/understand.ts` `examplesFor`:
  - about 75 seed lines (`shared/understand-seeds.ts`);
  - your own tasks (with their areas), memories, notes and idea pages;
  - your own pages, as places a memory can go;
  - never a contact or a company's page.
- **On the quick line.** It asks through `understand:read` after a 250 ms
  pause, only for a guess or a task with no area.
  - What you pressed and what you taught come first, then the model, then
    the rules.
  - It says why ("it sounds like an idea", "it belongs with Coffee", "College,
    like your tasks that sound like it").
- **Measured on 89 labelled lines** (`understand/lines.eval.ts`, run by
  `eval.test.ts`):
  - with nothing of your own filed, 63 right by the rules alone and 73 with
    the model;
  - with a lived-in machine, 62 and 75, and 6 of 9 memories put on the right
    page;
  - **none that the rules had right made wrong**, in either.
  - The thresholds were set on these same lines, so a fresh set will show a
    smaller gain. Measure again on new lines before tightening or loosening
    them.
- **Not done: merging `recall` with meaning.** The plan lists it among phase
  21's, and it goes there.

The plan as written:

- **First, the measuring stick** (moved here from phase 19). It uses the
  labelled lines from the tests and the 85 from the second pass on 25
  September 2026, and makes two runs over them: rules alone, and rules with
  the model. This is how the vote below earns its thresholds.

- **Kind, placement and area** at the four points in the table above. The
  votes come from:
  - the person's own filed things, which are the best teacher;
  - about twenty seed lines per kind (`shared/understand-seeds.ts`), for a
    new install with nothing filed yet.
- **One function decides** between the rule's reading and the model's votes,
  given the rule's kind, whether it was a fallback, the votes and the margin.
  It is pure, tested, and the only place a threshold lives.
- **Every existing test still passes.** Unit tests run the rules only, and the
  eval runs both.

### Phase 21 - Memories arranged - *done 26 September 2026, but the map's faint lines*

What was built, measured before each part that acts:

- **Said again**, marked without asking:
  - It is migration 47 `said_again`, applied as *said again since*, and
    **Not the same** takes it back.
  - It needs a similarity of 0.84 or more, the same page, and the same
    numbers.
  - The numbers rule is there because true repeats measured 0.60 to 0.90,
    and "bench PR 60 kg" against "deadlift PR 100 kg" measured 0.83. This
    catches about half the true repeats and none of the near misses, which
    is right for something that acts by itself. Exact keys were already
    caught by the key rule.
- **Loose ends**, always asked:
  - Lines on Random knowledge or Me are offered only to one of your
    **existing** pages. The line must be at least 0.35 alike to the page's
    title and 0.2 ahead of the next page.
  - **Loose lines are not gathered into new pages.** It was measured: lines
    on the same topic are 0.18 alike on average and lines on different
    topics 0.07, and the two overlap (at most 0.34 against 0.32). This
    model cannot find topics by clustering, and a made-up page would be
    confident nonsense.
- **Recall by meaning.** Word matches and meaning matches are fused by
  reciprocal rank (`fuseRecall`), and what is current still comes first.
- **Near in meaning** on a brain page (`relatedTo`): up to five, each with
  the line that made it near, and never what is already linked.
- **Not done:** suggested links drawn faint on the Map.

The plan as written:

- **Said again, without asking:**
  - A new line close enough to an older one is marked as the newer answer,
    even when the words differ ("blood type O positive" after "Blood group: O+").
  - Today this happens only when the text before the colon matches.
  - The Memories screen already shows only the current answer.
  - This is the one arrangement made without a yes, because it moves and
    deletes nothing. The older line stays, marked, and *Not the same*
    undoes the mark.
- **Loose ends gathered:**
  - Memories on the catch-all pages (Random knowledge, Me, the root of
    `ideas`) are grouped.
  - A group of four or more is offered as a page, named after the nearest
    existing title or the words the lines share: *Make a page "Coffee" for 6
    lines?*
  - Yes moves the lines through `savePage`, so History keeps where they were.
- **Related:**
  - A page, a memory or a contact shows its five nearest neighbours.
  - The Map can show suggested links as faint lines, and clicking one writes
    the `[[token]]`.
  - `brain_links` stays explicit: only what the person accepts is a link.
- **`recall()` merges** word overlap with meaning, by reciprocal rank.

### Phase 22 - Ready for an AI - *done 26 September 2026*

What was built:
- **Ask chooses by meaning as well as words.** `askBrain` takes the model
  when understanding is on, and adds what is nearest the question: contacts
  when the company is too big to send whole, pages for the Today line (still
  through `mayGoToAi`), and memories in the You document, nearest first.
- **04 you.** *Add yourself* on Export for an AI writes it beside the four
  company documents:
  - an index first;
  - then About me, People, Where things are and what was lent, Studies,
    Goals and habits, Interests (by their chain of pages), and Ideas and
    things learnt;
  - each fact once, as it is now, and dated;
  - never the journal or a private line.
- **"What is it for?"** leads the read-me and lists what to read first
  (`readFirstFor`). *04 you* opens with the facts nearest it. With
  understanding off, it is only said.
- **The topic brief** takes the pages nearest the topic as well as those its
  words found, before gathering what hangs under them.
- **Checked:** unit tests for each part, including privacy - a personal page
  near in meaning still does not go with the switch off. The e2e specs ask,
  askline, context and brain pass unchanged.

The plan as written:

- **Ask chooses by meaning as well as words.** `contactsFor` and `about()` add
  the nearest contacts and pages to the search hits. The "You" document sends
  the memories nearest the question instead of the 60 newest.
- **An export of you, arranged.** A fifth document, *04 you*, is written only
  when chosen, and each fact appears once: the current answer, dated. It is
  laid out as:
  - About me, then People;
  - Work and studies;
  - Interests, by their chain of pages;
  - Things to remember (where things are, what was lent);
  - a short index at the top.
- **"Export for" a purpose.** A line saying what the export is for ("planning
  my week", "a cover letter") orders and trims everything by nearness to it,
  within the chosen size.
- **The topic brief** takes meaning into account too.

### Later, not planned

- **Contacts like this one:** lookalike leads from notes and history.
- **Duplicate contacts** whose notes describe the same school. Duplicates by
  phone and email stay as they are.

## Decisions, part five - *decided 25 September 2026*

1. **The model: all-MiniLM-L6-v2, int8, 23 MB**, in a utility process
   through `onnxruntime-node`.
   - It reads word order and context, which is what a short line needs.
   - The cost is accepted: a thirteenth runtime dependency, a native one, and a
     process of its own.
   - potion-base-8M was the alternative. It is pure TypeScript with no
     dependency, but reads words and not their order.
2. **On by default.** It reads, it never sends, and it offers rather than acts.
3. **Arranging asks, except for the obvious.**
   - A repeat is marked as *said again* on its own.
   - Moving lines, making a page and writing a link always ask.
4. **Life facts go to Ask when "your own pages" is on**: `remembered` joins
   `yours.ts` in phase 18. When the setting is off, they never go.

---

# Part six: one founder, one app, ready for other people

*Written 26 September 2026, after a product pass read Caulder as somebody
who has never met its author would. Planned; phase 23 started the same day.*

## One sentence

Caulder is the one app a founder of a one-person company runs their life
and their company from - to market, make, sell and manage their time - and
it all stays on their computer, free, with a way to support the student who
built it.

## Who it is for

Founders of one-person companies, and ambitious people who want one app for
their life. Niche on purpose: it is not trying to be a general planner or a
general CRM. It no longer needs to be tailored to its author; it needs to
make sense to a founder in Berlin or Ohio as much as one in Bengaluru.

## What it promises, and how it keeps the promise

- **Local, loudly.** No account, no cloud, no ads, no tracking. Everything is
  one file on your computer. This is the first line of the Store listing and
  the reason to choose it.
- **Free, wherever there is a free way.** Every connection uses the route
  that costs nothing and keeps the data with the person:
  - Gmail and Google Calendar through the person's own Apps Script, not a
    Google sign-in (for which Google charges an app a yearly security
    review);
  - other mail through the account's own app password;
  - AI through Ollama on the same computer, or the person's own key;
  - backups to a folder that OneDrive, Google Drive or Dropbox already keeps
    in step, rather than through an API;
  - sales from other shops read from the CSV they export, not their API;
  - the Store for signing and updates, which a signing certificate would
    otherwise charge for every year.
- **Free to use, kept going by those who want to.** Like WinRAR: everything
  works, always, and Caulder says now and then that one college student in
  India made it, and how to help. See the decisions at the end.

## Where it stands against the four things

A product pass on 26 September 2026 read the app against the promise:

| | Now | Missing |
| --- | --- | --- |
| **Manage time** | Strong: Today, the Calendar, the quick line, habits, Google sync. | A weekly plan: what happened this week, and the three things that matter next. |
| **Sell** | Strong: contacts, deals, calls, mail, WhatsApp, quotes, invoices, payments, products. | Money from shops online (Razorpay, Instamojo, Gumroad, Lemon Squeezy, Stripe, PayPal) never arrives. It was shaped around calling schools. |
| **Market** | Almost nothing. `campaigns` cannot be filled (STATUS item 10); Marketing was removed. | A content calendar, launches, and the audience. |
| **Make** | Nothing as a place, though the parts exist: pages, `makeTasks`, memories, links. | A roadmap, what customers asked for (linked to them), and a changelog. |
| **You** | Strong: journal, memories, goals, habits. | Nothing to add. Levels, the vision board and Ember are found, not met on day one. |
| **Run the company** | Deadlines, documents, costs and runway, metrics. | People and hiring (with founder vesting) is for a company that hires; for one person it is collaborators. |

And against strangers using it:
- It speaks to its author: the sample company is schools in Bengaluru, and
  money and dates follow the computer's locale, not the company's (item 16).
- A Store copy loses everything when it is uninstalled, as every Store app
  does, and a backup folder is a setting, not a first question.
- No licences are shipped, although the model's Apache-2.0 licence asks for
  them, and there is no privacy page, which the Store requires.
- Setting up Google is ten steps in somebody else's editor.
- There is no phone. The answer that needs no server comes later.

## Phases, continued

### Phase 23 - Free, and who made it - *done 26 September 2026, but for three things only you can do*

What was built:
- **About Caulder**, last in Settings as a band of its own: free, no account,
  no ads, made by one college student in India; *Sponsor on GitHub*, *UPI*
  (hidden until there is an ID), *Star it on GitHub*; then *Privacy* and
  *Licences*.
- **The ask** at the foot of Today (`SupportAsk.tsx`): the setting
  `supportAsk` holds the day to ask on, or `never`. The first read sets it a
  month out by your own workspace's clock. *Not now* moves it three months;
  *Support it on GitHub* thanks and stops, trusted rather than checked; the
  cross is *Don't ask again*. Quiet while an invoice is overdue.
- **Licences.** Each build lists what it bundled (`bundledPackages` in
  `electron.vite.config.ts`). `scripts/notices.mjs`, run by `npm run build`,
  adds the runtime dependencies and theirs, and the model's notice with the
  Apache-2.0 terms (`resources/licences/`). It writes
  `out/notices/third-party-notices.txt`: 149 packages today, about 260 KB.
  The package carries it as `notices`, and `smoke:packaged` checks it.
- **Privacy.** `docs/privacy.md`, checked against every call that leaves the
  machine: the update check (installer copy only), Google through the
  person's script, mail accounts, an AI when asked, book covers when switched
  on, and a problem report sent by hand.
- **Checked:** unit tests for the ask's days and the service; e2e
  `support.spec.ts` (3 tests: nothing on the first day, Not now, Don't ask
  again).

Left open, for you:
- **Enrol in GitHub Sponsors**, and choose a UPI ID for `SUPPORT.upi`
  (`shared/support.ts`). Until then the Sponsors button opens a page that is
  not there yet.
- **Switch on GitHub Pages** for `/docs`, so the privacy URL answers. The
  repository has to be public for Pages on a free account.
- **The typeface** - *decided 5 October 2026: Gilroy stays.* It is a
  commercial face, so handing Caulder out needs a licence that covers
  putting it inside an app, arranged by the author.

The plan as written:

- **About Caulder**, a card in Settings > This computer: the version, that it
  is free with no account and no ads, that one college student in India made
  it, and the ways to help:
  - **GitHub Sponsors**, which takes no cut, pays out in India, and takes
    cards from anywhere;
  - **UPI**, for anybody in India: the ID, copied with one press;
  - a star on GitHub, or telling a friend.
- **The ask, WinRAR's way.** One line at the foot of Today, never a window
  and never in the way:
  - first a month after Caulder is first opened;
  - *Not now* asks again in three months;
  - *I have* or *Don't ask again* stops it for good;
  - not shown while an invoice is overdue: that is not the moment.
- **Licences.** The build writes the licences of everything Caulder ships -
  the runtime dependencies and what is bundled into the window - with the
  model's Apache-2.0 notice, into the package. *Licences* on About Caulder
  opens it.
- **Privacy.** `docs/privacy.md` says exactly what leaves the computer and
  when: nothing until a connection is made, but for the update check in the
  installed copy. It is published through GitHub Pages as the Store's privacy
  URL, and About Caulder links to it.

### Phase 24 - A first run for any founder - *done 27 September 2026*

What was built:
- **Money and dates by region.** `localeFor(country)` is `en-` and the
  company's country: English words, the region's ways. The workspace sets it
  before anything draws; `src/lib/format.ts` makes every formatter from it,
  and the screens that built their own now use `numberText` and
  `dateFormatter`. Invoices, the data room, the dossier and the line's money
  answers use the company's country in main.
- **Found on the way:** a stored day (midnight UTC) was formatted in the
  local clock, so the Calendar, the week, the quick line and due dates read
  one day early anywhere west of Greenwich. Now written in UTC.
- **The sample** is a one-person studio that builds small apps and sites for
  clients in eight cities, priced in dollars and set in the person's own
  country.
- **The first run** says what Caulder is for: *Your company, and your life
  around it*. It does not name Market or Make, which do not exist until
  phases 26 and 27; their screens join the first run when they do.
- **A copy somewhere else** is the setup guide's first step, and first on
  Today's *Finish setting up*. OneDrive, Dropbox and Google Drive are found
  on this computer (`db/synced.ts`) and offered by name; one copy is made at
  once.
- **Checked:** unit tests for the formats and the synced folders; e2e demo,
  companies, money, today, week and support specs, and the setup line in
  quickadd (34 tests).

The plan as written:

- Money and dates in the company's own format, set beside its currency
  (item 16).
- A sample company that is not Indian schools: a one-person studio or a small
  software product.
- A first run that names the four things - your time, what you make, what you
  sell, and you - one screen each, every one skippable.
- **A backup folder is asked for on the first run**, suggesting a folder
  OneDrive or Google Drive keeps in step. On a Store copy it says why:
  uninstalling removes the app's own folder.

### Phase 25 - Ready to hand out: 0.5.0 - *done 5 October 2026, but for what needs the author's hands*

What was built:
- **Electron 43.7.7**, from 38.8.6: its high advisories and `extract-zip`'s
  are gone. Not 44, whose `clipboard` returns promises; that is its own
  change. `npm audit fix` took what else had a fix; two are left that cannot
  be reached (STATUS, Dependencies).
- **An invoice is deleted only as a draft**, in `repositories/money.ts`, with
  a sentence saying a sent one is voided instead. A deleted draft gives its
  number back; a number that went out is never used twice.
- **The whole e2e suite on Electron 43**: 238 passed. Ember's spec, and the
  smoke test's check of her, failed from one to six in the morning, when she
  is asleep; both set the window's clock now.
- **Packaged twice**: the installer, checked by `smoke:packaged`, and the
  Store package, opened and checked for its identity, the model, the
  licences and the native modules.
- **The Store listing**, in `reference/store-listing.md`: free, the local
  promise first, twenty features, the answers Partner Center asks for, and
  notes for certification. It promises only what is built.

Left for the author, because it needs their hands and their accounts:
- installing the Store package and trying it, and the Windows App
  Certification Kit, which wants an administrator and the screen
  (`reference/operations.md` has the commands);
- the screenshots, and the submission itself in Partner Center.

The plan as written:

- Electron updated (the high advisories in STATUS).
- An invoice is deleted only as a draft, enforced in `repositories/money.ts`
  (item 14).
- The whole e2e suite run; `package`, `smoke:packaged`, `package:store`.
- The Store package installed and tried by hand (the model, the key, the
  tray, the desk widget, the journal lock, backups), then the Windows App
  Certification Kit.
- The Store listing, free: its first line is the local promise; screenshots
  of Today, the quick line, a contact and Ask.

### Phase 26 - Market - *dropped 10 October 2026; see part seven*

- **Content**: a post or a newsletter goes from idea to draft to scheduled to
  published, on a channel, and sits on its day in the Calendar. The quick
  line reads "post on linkedin about the launch friday". Caulder keeps the
  draft and opens the site to post it, as it does WhatsApp.
- **Launches**: a date and its checklist, as steps that become tasks.
- **Audience**: who signed up and where from, as contacts with a source.
- This settles item 10: a campaign becomes a launch or a channel, or goes.

### Phase 27 - Make - *dropped 10 October 2026; see part seven*

- **The roadmap**: what is being built, now, next and later, each a page
  with its steps.
- **What customers asked for**, linked to the contact and the product; the
  quick line reads "feedback from Priya: wants dark mode".
- **The changelog**: what shipped, when, and who asked for it, so they can be
  told.

### Phase 28 - Money from shops online - *dropped 10 October 2026; see part seven*

- Read the CSV that Razorpay, Instamojo, Gumroad, Lemon Squeezy, Stripe or
  PayPal exports, through the import that exists: each sale a payment, each
  buyer a contact, with the product matched. No API and no account.

### Phase 29 - The weekly plan - *moved to the front; see part seven*

- A short page once a week: what was done and what slipped, read from what
  happened rather than assumed, and the three things that matter next week.
  Review went because it assumed every block was kept; this one only reads.

### Phase 30 - Google, with a guide

- Setting up the script as a walkthrough with a picture for each step, and
  every part of Caulder saying plainly what it does without Google.

### Later, not planned

- **The quick line on a phone**, served by Caulder to a phone on the same
  Wi-Fi: no server, no account.
- People and hiring as collaborators.
- A QR code for UPI on About Caulder.

## Decisions, part six - *decided 26 September 2026*

1. **Caulder is free.** No price, no trial, no locked features, no ads.
2. **It is supported, WinRAR's way**: a line on Today now and then, and a card
   in Settings. Never a window that blocks, and never a feature held back.
3. **The ways to support work from India**: GitHub Sponsors (no cut, cards
   from anywhere) and UPI. Stripe and Buy Me a Coffee do not pay out there.
4. **Local and free come first** when choosing how anything connects, as
   listed under the promise above.

---

# Part seven: the company's, and nothing else's

*Written 10 October 2026, the day of a critical review
(reference/product-review.md, third review) and of the owner's decision that
followed it. Most of it was built the same day; what was not is listed.*

## One sentence

Caulder is the complete app for a one-person company: who you are selling to
and how to reach them, your time, your money and what the company knows - with
a quick line that takes any of it, and Ember for company. Nothing personal.

## What the review found

The plan of 14 September said five screens and nothing else. Three weeks
later there were thirteen routes, 75 tables and about 107,000 lines, and the
largest single thing in the code was the pet. The two things the app was for
were the thin ones:

- **Outreach was one contact at a time.** Ticking contacts offered a stage
  move and a delete. There was no LinkedIn or Instagram on a contact, and a
  new contact was seven rows of "Not known".
- **The line read about half of unseen lines rightly** (48 of 90 by the
  rules, 50 with the model), with ten kinds to choose between - most of the
  misses one personal kind taken for another.
- Part six had queued Market, Make and shop imports next: more breadth.

## What was decided, by the owner

1. **Caulder is a CRM with the calendar, tasks and notes, the quick line,
   Ember, and the company's brain.** Everything company-related stays: money,
   deadlines and documents, people, metrics, the data room, the Map, Ask.
2. **The personal half goes**, with its data: the journal and its lock,
   private lines, Looking back, Life (studies, hobbies, the shelf), goals and
   theme days, habits, the vision board, Pulse, and levels on a screen.
3. **Founder sharing goes for now**, to be made again later and differently.
   Standalone only.
4. **Contacts can be kept as a Google Sheet** in the person's own Drive.
5. **Each part that is left is made smarter**, and the screens reworked for
   the smaller app.

## What was built - *done 10 October 2026, but for what is listed after*

**Taken out.**
- The routes `journal` and `life`, the *You* group in the sidebar, and every
  card of the personal half on Today, the Calendar and the Brain.
- Sixteen services and their handlers, twenty shared modules, the Life and
  sharing stylesheets (about 2,400 lines), five end-to-end specs.
- **Migration 49** drops eleven tables, deletes every page in the personal
  sections and every page in the calendar's own workspace, clears the
  settings that belonged to them - the journal's passcode among them - and
  drops the two triggers a shared brain kept. The backup made before every
  migration is the way back.
- The Apps Script's shared-brain actions and its invitation door: a request
  with an invitation instead of the key is refused like any other now.

**The line, rewritten.** Six kinds - task, contact, memory, command, idea,
note - told apart by what Caulder can check: a contact's name, a page's
title, a when, a sum.
- A memory is a dated line on a page of the **company's** brain: the page the
  line names, or *Things to remember*. "Our GST number is …" is led by what
  it is, so the newest is the answer. Said about a contact, it goes on their
  history.
- A sum that was not said to be spent ("swiggy 320 lunch") is offered as a
  chip, never assumed.
- A password is never filed: the line says so before it is kept.
- A person is known by a first name of four letters ("Maya"), unless the name
  is also a word ("Will").

**Outreach.**
- **LinkedIn and Instagram** are fields on a contact (migration 48), cleaned
  to one address whatever is typed, imported from their own columns, and
  written to from the contact's page: the message goes on the clipboard, the
  profile opens, and "Sent it" puts it on the history as its own kind. The
  history's kinds were still a SQL `CHECK`; migration 48 rebuilt the table
  without it.
- **Write to several at once**: tick contacts, *Write to them*. One message,
  each contact's name in its place, shown as one of them will read it, with
  who is left out and why; capped at fifty and at what Gmail has left.
- **Reach out, on Today**: how many people were reached today and this week,
  and the prospects nobody has reached, longest waiting first.
- **How a template has done**: sent and answered, and a rate only from twenty
  sends that could be watched for a reply.
- A contact's page shows what is known, with one line for what is not.

**Today, laid out again.** Two columns, a question each: what do I do, and
who do I talk to. The people moved into the room the life half left.

**Contacts as a Google Sheet** (migration 50, script version 6). A row a
contact, read and written through the person's own script. A cell changed in
the sheet wins over the same cell changed here; a cell changed only here
stands; a row typed in with a name is a new contact; nothing is deleted by
the sheet. Off until linked, a company at a time, then every ten minutes.

**Ember, and everything there to amuse, taken out** - decided by the owner
the same evening, in three steps: first the jokes and quotations, then her
dances and the growing, then all of her.
- Today says "Good evening, Adi." and the day in numbers. The fifty-two
  jokes, nineteen quotations, sixty hellos and fourteen quips for a clear day
  are gone (`shared/voice.ts` went from 368 lines to 75).
- Ember is gone: the sprite, her moods, pastimes, tricks, dances, costumes
  and closet, her book and door, the physics, her temper, her sounds, growing
  on the work, and her window on the taskbar. About 14,000 lines, the flame
  colour tokens, two end-to-end specs, and `foreground.ts`.
- The line's mode is said by its two switches - pressed, titled - and by the
  placeholder (`shared/linemode.ts`, which was `ember.ts`).

**A pass over the screens.**
- **The sidebar**: the company heads it, because the whole app is the
  company's; under it one list with no labels - Today, Calendar, then
  Contacts, Deals, Money, Brain.
- **A contact's page**: next steps, the ways to write to them, then the
  history - which used to sit at the foot - and only then deals and money.
  WhatsApp is shown when there is a number, as LinkedIn and Instagram are
  when there is a profile; what is missing is said once, under the details.
- **Today**: nobody is named twice - somebody under Reach out is not also
  under Going quiet. The full form sits beside the line.
- **The Brain's home**: the questions and what was written first; context
  for another AI last, with examples that are a company's.

**Checked:** `npm run verify`. The numbers are in STATUS.md.

## Not done, and next

1. **A new blind set for the line.** The three measured sets were labelled in
   the ten kinds and went with them. Until ninety new lines are written
   without reading the rules, and the six kinds measured on them, the line's
   accuracy is not known - only that it has fewer ways to be wrong.
2. **The weekly plan** (was phase 29): what was done and what slipped, read
   from what happened, and the three things that matter next week.
3. **The whole end-to-end suite, and the package.** The specs for the
   screens that changed were run; the suite was not, and 0.5.0's installer is
   from before this. `smoke:packaged` lost its two checks about Ember and
   the level and has not been run since.
4. **The Store listing and `reference/features.md`** describe the app before
   this. Both say so at their head; neither is rewritten.
5. **The contact form** still carries Alt phone, Location and PIN from its
   first customer. They are kept when given and no longer asked after.
6. **Replies from other mail accounts.** Only Gmail through the script sees a
   reply. Reading an inbox over IMAP would be a fourteenth dependency, so it
   is a decision for here before it is a change.
7. **The first run asks for a company name.** Somebody with an idea and no
   company yet is the person part six forgot.

## Decisions, part seven - *decided 10 October 2026*

1. **The app is the company's.** A request for something personal is answered
   with the feature map's "Removed on purpose", not with a screen.
2. **The calendar holds the whole day** all the same: a class and the gym are
   what a call is planned around, so blocks and tasks of any area stay.
3. **The sheet never deletes**, and never wins on a cell it did not change.
4. **Fewer kinds on the line, each checkable**, before any rule is added to
   tell two apart by how a sentence sounds.
5. **Nothing is there to amuse.** No mascot, no jokes, no quotations, no
   levels. A screen says what is so and what to do, and stops.

---

# Part eight: the complete app for a one-person company

*Written 10 October 2026, the evening of part seven. Part seven took things
away; this is what is built on what is left. Nothing here is started. Six
things in it are the owner's to decide, and they are listed at the end with
what is recommended.*

## One sentence

Somebody who runs a company alone opens Caulder in the morning and it tells
them who to write to, what is owed to them and what the week is for - and
nothing in it is there for any other reason.

## The test for anything proposed from here

Three questions, in order. A thing that fails one is not built.

1. **Does it get somebody written to, a deal moved, or money in?** Or does
   it keep the record those three depend on?
2. **Does it deepen something that is already here?** A new route, a new
   table or a new kind on the line has to say why an existing one cannot
   carry it.
3. **Is it plain?** A sentence and a number. No character, no score, no
   streak, nothing that congratulates.

## Where it stands against the sentence

| | What is there | What is missing |
| --- | --- | --- |
| **Who to write to** | Reach out on Today; email, WhatsApp, LinkedIn and Instagram from a contact; one message to several; a follow-up that sends itself; how a template has done | No way to list *who has not answered*. Several-at-once is email only. A reply is only seen through Gmail. |
| **What is owed** | Quotes, invoices, part payments, unpaid invoices at the head of Today | Nothing chases an unpaid invoice: the row says it is late and stops. A retainer is typed again every month. |
| **What the week is for** | Today, the Calendar by day and week, tasks, a morning brief | No week: nothing says what was done, what slipped, or what the next five days are for. |
| **Nothing else** | The personal half, founder sharing, Ember and the jokes are gone | A student is still in the lists: a task's area is College, a block is a Class, the Calendar has a Timetable with terms. Twenty cards in Settings. |

## Phases, continued

In this order. The first two build nothing new, on purpose: half the code
went in a day, and what is left has to be shown to stand before anything is
put on top of it.

### Phase 31 - Standing on it: 1.0.0 - *packaged 14 October 2026, not committed*

*No features. About a day.*

- Commit part seven. Run the whole end-to-end suite in the background, and
  mend what it finds: about twenty-five specs have not been run since.
- **A new blind set for the line**: ninety lines a founder would type,
  written without reading the rules, labelled in the six kinds. Bring back
  the measuring test that went with the old sets (`understand/lines.eval.ts`)
  and put the number in STATUS.md. Only then tune, and only on a second set.
- Version 0.6.0. `npm run package`, `npm run smoke:packaged`.
- Rewrite `reference/features.md` and `reference/store-listing.md` from the
  feature map, and take the screenshots again.
- **Done when:** the suite passes, the smoke check passes on a package, the
  line has a measured number, and no document describes a feature that is
  gone.
- **Built as 1.0.0, not 0.6.0** (the owner's word, 14 October 2026), for
  the Store, as an unsigned .msix; `smoke:packaged` passes on it, and the
  Store listing is rewritten; the installer is built too, and
  `branding/` holds the Store's logos and art. Left: the commit, the
  screenshots and `features.md`.

### Phase 32 - The last of the student - *done 11 October 2026, but for its last line*

*What part seven left in the lists. Small, and mostly words.*

- **A task has no area.** College, Company, Personal and Health are four
  answers to a question nobody running a company is asked. The column stays
  (migrations are not edited); the form, the line's area guess
  (`areaOpinion`) and the Calendar's colour by area stop using it.
- **A block's kinds are a working day's**: Deep work, Meeting, Call, Admin,
  Away. Class and Studying become Away for blocks that already have them,
  by an appended migration. Each kind gets its own colour: Class, Study and
  Admin share one grey today (STATUS.md, item 15).
- **The Timetable becomes "A usual week"**: the same editor of repeating
  blocks, without terms. *Owner's decision 2.*
- **A contact's form** loses Alt phone, Location and PIN, which came from
  the first customer's spreadsheet, and gains **Role** beside the contact
  person. The three columns are kept and still imported.
- The words: "or you" in the Ask placeholder, the student lines among the
  model's examples (`understand-seeds.ts`), "Product design class" in the
  sample, `life` in `shared/linemode.ts` if nothing can reach it.
- **Done when:** a search of `src/` and `shared/` for class, college,
  study, exam and term finds only the migrations.
- **What was built**, in the order above: all five. Migration 53 for the
  blocks and for `leads.contact_role`; nothing dropped. The owner's
  decisions 2 and 6 were taken as recommended - *A usual week* without
  terms, and *Away* - the owner having said to carry on; either is a small
  thing to turn round.
- **What the last line still finds:** no screen and no label, but comments
  written for a student founder, the short forms and the Hindi the line
  expands, and the task reader's list of things that happen at a time
  ("lecture", "exam"). Left, because a parser's vocabulary is not a
  feature, and taking words out of it only makes it read less.
- **What it cost:** a typo of a student's word is no longer mended, and
  about seventy unit tests of areas and taught words went with them.

### Phase 33 - Who has not answered - *built 11 October 2026; its last line not yet timed*

*Outreach, from one message to a campaign you can see the end of.*

- **One more filter on Contacts: Reached.** Never written to; written to,
  no answer in N days; answered. Read from the history, which already knows.
  With the stage filter and *Write to them*, that is a second message to
  everybody who ignored the first - without a saved view or a campaign table.
- **Work through them**: tick contacts, and for WhatsApp, LinkedIn or
  Instagram - which cannot be sent for you - Caulder walks the list one at a
  time: the message on the clipboard with their name in it, their profile
  open, *Sent it* or *Skip*, and the next. Each goes on the history as it
  does from a contact's page (`openProfile`, `LeadMessage`).
- **Reach out says what is waiting on them, too**: "6 written to this week,
  2 answered, 4 waiting - the oldest nine days." One line on the card that
  is already there.
- **A reply from a mail account that is not Gmail** - *done 10 October
  2026, the owner having asked for Zoho and the like to be connected to
  outreach properly.* A switch on each account, off until turned on. On,
  Caulder asks that inbox who has written - headers only, read-only, IMAP
  spoken by hand over `node:tls` so the dependencies stay thirteen
  (migration 51, `shared/replies.ts`, `services/inbox.ts`). A reply is then
  on Today and the contact, and a follow-up goes by itself from such an
  account, in the same thread, after looking first. **Not tried against a
  real Zoho or Outlook inbox**: it is tested against a stand-in mail server
  on this machine, and the first real account is the proof.
- **Done when:** from an empty Contacts filter, somebody can write to
  twenty prospects on Monday and, on Friday, write again to exactly the ones
  who said nothing, in under a minute each time.
- **What was built:** all three, and one thing the list above did not
  foresee. An answer on WhatsApp or LinkedIn is invisible to Caulder, so
  "answered" would have meant "answered by email" - and a founder who sells
  on WhatsApp would have been told to write again to people who had said
  yes. So a contact's history has one more thing to say, by hand: *They
  answered*. `shared/reached.ts` is the one place that says what written to
  and answered mean.
- **Decided while building:** "no answer in N days" is three days, fixed -
  long enough that Monday's are Friday's and short enough to be a week's
  work; a call is reaching somebody and is not a message awaiting an answer;
  it is the last message that counts.
- **The last line has not been timed.** The walk and two of the filter's
  three answers are tested end to end, and "no answer" by a unit test with a
  clock told the day; nobody has sat down on a Monday with twenty prospects.

### Phase 34 - Money that asks for itself - *built 14 October 2026*

- **Send a reminder**, on an unpaid invoice's row in Money and on Today:
  an email to the contact from a template - the number, the amount, how late
  - with the PDF that is already filed on the contact. It goes on their
  history. A second one is offered a week after the first, never sent by
  itself.
- **What is owed, by age**: one line above the invoices - not yet due, up
  to thirty days late, over thirty - where *This month* shows only totals.
- **A retainer.** *Owner's decision 5.*
- **Done when:** every invoice on Today that is late can be chased from
  the row it is on, and the chase is on the contact's history.
- **Built** (`shared/chase.ts`, `ChaseForm.tsx`): *Send a reminder* on a
  late invoice's row, in Money and on Today. The words are written for it -
  the number, the amount, when it was due, how late, what has come in - and
  read and changed before they go. It is sent the way any email to a
  contact is, so it is on their history and a reply is seen where replies
  are. With nothing connected to send from, it opens in the computer's own
  mail app.
- **Whether an invoice was chased is read, not kept**: from the emails sent
  to its contact with its number in the subject. So a reminder written by
  hand counts, and there is no new table. The row says when it was last
  reminded, and offers another a week after.
- **What is owed, by age**, as one line above the invoices.
- **A retainer** (migration 54, `invoices.repeats`): an invoice says it
  repeats - every month, quarter or year. When the next is due to be
  written and this one has been sent, a draft is made from it and Today
  says so. Nothing is drafted from a draft, so there is never more than one
  waiting; and it is only ever a draft. Set to No on the newest one, or
  deleting the draft, ends it.
- **Not built: the PDF attached.** An email from Caulder carries no
  attachments, by either way it sends; the reminder says so. Attaching
  means changing the Google script and the other-account sender both, and
  is its own piece of work.
- **Not from a template** in Settings, as the plan had it: the words are
  written by the app and changed in the box. One fewer thing to set up.
- **The "done when" holds** for Today's rows, by test. Whether the wording
  is how the owner would chase is theirs to say.

### Phase 35 - The week - *built 14 October 2026*

*Was phase 29. No new route: it is the head of the Calendar's week.*

- **What happened**, read and never assumed: tasks done, people reached and
  who answered, deals that moved, invoiced and paid, hours kept against
  hours planned.
- **What slipped**: what is still overdue, who went quiet, what is unpaid.
- **Three things for next week**, chosen there, and shown at the head of
  Today until they are done or the week ends. Three, because a list of nine
  is the list that already exists.
- The morning brief on a Monday says the three.
- **Done when:** on a Friday the page is true without anything having been
  filled in for it.
- **Built:** `WeekReview` at the head of the Calendar's week, for whichever
  week is shown; `WeekThree` at the head of Today; Monday's brief leads with
  the three; `week_things` (migration 58). Hours kept are "kept unless you
  marked it skipped", the Calendar's own rule. A deal counts as moved when
  it closed, whether or not a stage change was written for it - the first
  screenshot said "0 deals moved, 1 won".

### Phase 36 - Fewer things to look at

- **Settings from twenty cards to about twelve.** *Your words*, *Tune* and
  *What the line has learnt* are one card about how the line reads. The
  mail accounts and templates sit together.
- **Campaigns** (STATUS.md, item 10): the table cannot be filled from
  anywhere. Take the plumbing out of contacts, import and spend; `source`
  on a contact already says where they came from.
- **Ctrl+K finds deals and products** (item 12): an appended migration that
  makes the search triggers again through `m020Refresh`.
- **The Brain's first page** stops being a form to fill in once the twelve
  questions are answered: then it is what was written lately, and Ask.
- **The desk widget** is kept (decision 3), and made to say more - *done
  10 October 2026.* It said the calendar and two counts. Now the pill says
  the one thing that cannot wait (a block within ten minutes, then a reply,
  then what is late), and the panel says the company's day under the
  calendar's: who replied, what is late, what is unpaid, who is waiting, who
  was reached. It lists what is left of the day rather than its first five
  blocks. Still nothing on it to click.
- **Done when:** nothing in Settings needs a paragraph to say what it is.

### Phase 30 - Google, with a guide - *still wanted, after these*

As written in part six. The contacts sheet makes it matter more: the sheet,
the calendar and the replies all wait on the one script.

## In what order, and why

31 before everything, because nothing else can be trusted until it is. 32
next, because it is a day and it is the requirement as stated. Then 33 and
34, which are the two that bring money in; 35 after, because a week is only
worth reading once the things it reads are being done from Caulder; 36 last,
because tidying is best done to something that has stopped moving.

## Not planned, on purpose

- **Sequences, drip campaigns, sending on a timer to a list.** The feature
  map's "Removed on purpose" has why: a sequence is a follow-up task. Phase
  33 is as near as Caulder comes, and a person presses the button each time.
- **Founder sharing and a team.** Later, and differently (part seven).
- **A phone app.** The contacts sheet is the phone, for now.
- **Market, Make, shops online.** Dropped in part seven; still dropped.
- **Mac.** Three native pieces are Windows-only in how they are packaged.
  Not until somebody with a Mac asks.

## A second cut - *done 11 October 2026*

*The owner asked for another review, deleting what was redundant.*

- **People and hiring taken out**, by the owner's choice of the four whole
  features offered (Metrics, the data room and Google Contacts import were
  kept). A one-person company has no team. Migration 52; `people` and
  `openings` are left in place and unread, because a task refers to them.
  About 3,000 lines, with the person as a kind of link, a dot on the Map, a
  search result and a source of deadlines.
- **Asking the AI and copying context were each in two places.** Both stay
  on the Brain's first page. Today's line lost its two switches and does one
  thing; the ask service lost the second, smaller way of answering that the
  line used.
- **The campaign plumbing** (STATUS.md, item 10): nothing could set a
  campaign since migration 18, and contacts, import and spend carried one
  all the same.
- **Not cut, though it was said it would be:** a task's areas (College,
  Company, Personal, Health) and the Timetable with its terms. Both run
  through the quick line's parser - an area is guessed from a line's words,
  "until the end of term" is a way of ending a repeat - and that parser has
  no measuring set at present. They stay in phase 32, after phase 31 has
  given the line a number to hold it to.

## Phase 31, so far - *11 October 2026*

- **The whole end-to-end suite passes**: 34 specs, 192 tests, in four runs.
- **The line got its first number: 53 of 96 on lines it was never tuned against.**
  Tasks and contacts are read well (24 of 30, 17 of 18); commands and ideas
  are not (2 of 14, 0 of 9); the model on this machine added nothing on this
  set. STATUS.md has how it was measured and what the number is not.
- **Three fixes came out of the first set's misses**, by class and never by
  line: a name typed without its accents is still the name; a rule the
  company works by ("we never start without a deposit") is a memory; money
  said to be spent with the sum last ("bought a desk, $240") is a spend.
- **What it changed about this plan:** the line came before phase 32.
- **The second set's misses were read and the rules changed for their
  classes** - ideas, how the company runs, opinions, orders, the company's
  own word for itself, six ways of asking for something. STATUS.md lists
  them.
- **Measured on a third set, written by another writer and not read: 68 of
  93 by the rules, 73%; 72 with the model, 77%.** From 55%. The two sets
  that were read score 93 and 90 of 96, which is what fitting looks like and
  why they are not the number.
- **What is left wrong:** a memory is read half the time (8 of 16), and
  mostly kept as a note; a command 7 of 12; an idea 4 of 9 by the rules and
  7 with the model.
- **The order from here:** the line no longer holds up the plan. Phase 32
  (the student's lists) is next, and the line gets another turn of the same
  loop - a fourth set, written for a different company - beside it rather
  than before it.
- Still to do in this phase: the commit, the screenshots and
  `features.md`. 1.0.0 is packaged and the Store listing rewritten (14
  October).

## For the owner to decide

1. **0.6.0** as the number for the first build after part seven.
   *Decided 14 October 2026: 1.0.0, the first version in the Store.*
2. **The Timetable and its terms.** Keep it as *A usual week* without
   terms, or take the editor out and leave repeats to the line ("standup
   every mon wed fri 10am"). *Recommended: keep it, without terms.* **Built
   that way on 11 October 2026, without the owner having said - still theirs
   to turn round.**
3. **The desk widget.** *Decided 10 October 2026: kept, and to be made
   better.* About 760 lines and the reason `koffi` is a dependency. It is
   plain - now, next, late - so it passes the test.
4. **Replies from other mail accounts.** *Decided 10 October 2026: yes -
   the owner wants Zoho and the like connected to outreach. Built the same
   day without a fourteenth dependency; see phase 33.*
5. **A retainer**: an invoice that drafts itself each month for a customer,
   to be looked at and sent - never sent by itself. *Decided 10 October
   2026: yes, as a draft and a line on Today.*
6. **A block for something that is not work.** Part seven decided the
   calendar holds the whole day. Phase 32 keeps that and calls every such
   block *Away*, without saying what it is. *Recommended: yes.* **Built
   that way on 11 October 2026, on the same footing as 2.**

## Decisions, part eight - *proposed 10 October 2026, not yet decided*

1. **Three questions before anything is built** (above), in that order.
2. **Nothing sends by itself except what already does**: the follow-up and
   the scheduled email, each set by hand for one message.
3. **No new route in this part.** Every phase lands on a screen that exists.
4. **A phase is done when its last line is true**, not when its list is
   ticked.

# Part nine: a line that follows through

*Written 13 October 2026, from the owner's own example.*

## The example

> Sumanth from RV PUC asked me to reach out to him next week. I messaged him
> on LinkedIn.

Typed into the line, that made a contact and put a note on his history - and
left nothing on any day. Nothing in it says "remind me" or "I need to": the
thing to do is inside what he said. That is the commonest way a thing
somebody asked for is forgotten, and the line was built to hear only the
other way of saying it.

The owner added three more, the same day: a later line about the same person
should change him, not make another ("Sumanth from rv, I got his number, it
is 96..."); the app should **ask when it has doubts**; and a name spelt
wrongly is still the name.

## What was built - *13 October 2026*

- **A line about somebody leaves its next step** (`shared/nextstep.ts`).
  Three forms, and no more: *they asked* ("asked me to reach out next
  week", "wants the invoice by the 5th"), *I promised* ("told Jonas I'd send
  the deck by Friday"), *they promised* ("said she'll get back in a few
  days" - which is waited for, so the task is to check in with them). Kept
  with the line: what happened on their history, and the thing to do as
  their task on the day said.
- **With a reminder that morning.** The owner asked for one. It is the one
  place a notification is made without the words "remind me" - because the
  line was about something somebody else is waiting for.
- **What happened is kept as what it was**: a message on LinkedIn, WhatsApp
  or Instagram where the line says so, and "They answered" when they wrote
  back - which is what *who has not answered* reads (phase 33).
- **A when said loosely is a day**: early, mid and the end of next week; in
  a few days; early, mid and late in a month; "sometime in November"; after
  the 20th. The reading says which day before anything is kept.
- **The line asks, one question at a time, when it is not sure:**
  - *who* - a name that took a wrong letter to read ("sumnath - is that
    Sumanth, RV PUC?"), or one two contacts answer to ("Which Priya?").
    Nothing is kept until it is answered, because who it is about decides
    where it goes.
  - *when* - for something asked for with no day said. Tomorrow stands
    unless another is chosen; Enter does not wait.
- **A name one letter out is still asked about**, in names of six letters
  or more. Looser than a slip at a word, and allowed only because it asks.
- **Found while checking the AI with a real key** (the owner's, a free
  Gemini one, used once and written nowhere): connecting, answering from
  the records, a follow-up and a second model all work; the first question
  after connecting failed because the service was busy for a moment. A busy
  service is now asked once more before the person is told.
- **No container has one edge coloured or thicker than the rest.** The
  owner's rule, the same day: deal rows, the call prompter's script and
  objections and the decision log lost theirs, and a test holds it.

## What it still does not do - *proposed, in this order*

1. **A next step for everybody touched.** A line that goes on a contact's
   history and leaves nothing to do, about somebody with no open task, ends
   the conversation with nothing planned - and *Going quiet* notices
   fourteen days later. Ask once, there: *Next step?* Tomorrow, in three
   days, next week, or nothing. The cheapest thing here and the most used.
2. **A name nobody knows.** *Built 13 October, the owner's wording:* "ask me
   where he is from". "Sumanth asked me to reach out next week", with no
   "from RV PUC" and no contact of that name, asks *Where is Sumanth from?*
   The answer is typed - Enter on the line goes to it - and makes him a
   contact there, with what happened and the thing to do; an empty answer
   is *only a task*. Asked only of a line that leaves a next step, which is
   what keeps "mum asked me to buy milk" a task.
3. **More said in passing.** A number and an address are set from the line.
   A city, what the person is there, and a deal's value and stage are not:
   "she is the new head of marketing", "they moved to Pune", "Harbour said
   yes at 4,800". Two of the lines the measured sets still get wrong are
   these.
4. **Waiting on them, apart from what I owe.** A check-in is a task like
   any other. Today could say the two apart: what I said I would do, and
   who said they would do something for me.
5. **The days people say.** "After Diwali", "after the holidays", "next
   quarter", "month end". A small table of public holidays by the company's
   country, kept in the app and dated.
6. **A reminder that was missed.** A notification that morning is missed
   with the lid closed. On opening, say what was to be remembered while it
   was shut - on Today, where the late things already are.
7. **One Undo for one line.** A line can now make a contact, a history
   entry and a task. Undo takes back the last task only.

Not proposed: reading WhatsApp or LinkedIn to see replies (neither allows
it), and a phone app (the contacts sheet is the phone, for now).

## For the owner to decide, part nine

1. **A reminder without being asked.** Built as above. If a notification
   for every such line is too much, it becomes a task on Today and nothing
   else - one line to change.
2. **Blocking on "who".** The line will not keep anything while it is asking
   which Priya. *Recommended: keep it so.*
3. **The order of the seven above.** *Recommended: as written.*

# Part ten: the AI, pressed for and sent little

*Written 13 October 2026, from three things the owner said that day. Built
the same day, on the owner's "build all three"; what each phase says under
**Built** is what there is.*

## What the owner said

1. **The mark at the start of the line is a switch.** Pressed, the line is
   in AI mode; not pressed, it is the reading on this machine. Today the
   mark is a drawing, and the switch that used to sit beside the line -
   *Ask the AI* - was taken out on 11 October as a duplicate of the one in
   the Brain. That was not the owner's choice, and it was the wrong call.
2. **What is sent should be what the question needs.** To draft an email,
   a few lines about the company and that contact's page - not the company.
3. **Could the AI make what is kept better?** What the company does, how
   the owner works, said well enough that the next question starts from it.

## How it stood

- Every question sent the whole company - four documents - until that is
  over a size, and only then was it cut to the contacts the question was
  about (`askBrain`, `CONTEXT_BUDGET`). On the sample company that is about
  3,500 tokens a question; at the Gemini setting it can reach about 110,000.
  Nothing is cached, so a follow-up sends it all again.
- What picks the contacts when it is cut already exists: the words of the
  question, and the model on this machine by meaning (`contactsFor`,
  `nearestTo`). It is used as a last resort, and should be the first.
- Nothing the AI says is ever written to the company's records.

## Phases

### Phase 37 - Send what the question needs - *built 13 October 2026*
- **A company in ten lines**, always sent: what it is, what it sells, where,
  in what currency, how it bills. Written once (phase 39 helps), kept as a
  page, and shown before it goes.
- **Then only what the question is about**: the contacts it names or means,
  their history, their deals and invoices; the pages near it in meaning;
  today's tasks when it asks about the day. The whole company only when
  asked for - "everything", "all my contacts" - or chosen in Settings.
- **Said before it is sent**: "Sending: the company in brief, Harbour
  Coffee Roasters, 2 pages - about 900 tokens." It says so after, today.
- **Done when:** the question about one contact costs under a third of what
  it does now on the sample, and gives the same answer.
- **Built** (`shared/relevant.ts`, `services/relevant.ts`): the brief, then
  the contacts a question names - by company, person or first name - or
  means; the parts of the dossier its words point at; the pages it names,
  means, or that hold a word nobody else uses. Said under the box before it
  is sent, and after. The AI is told it has a part and not the whole, so
  "it was not sent" is never said as "it is not written"; *Ask again with
  the whole company* is under every answer; "everything" in a question, or
  the choice in Settings, sends it all.
- **Found on the way:** what the line is told to remember ("we always
  invoice on the 1st") was in no document the AI was ever sent - the
  Remembered section was left out of the dossier. It is in now.
- **The first half of "done when" is held by a test** on the sample. **The
  second half is not checked:** whether the answers are as good with less
  has not been measured against a real service.

### Phase 38 - The mark on the line is the switch - *built 13 October 2026*
- Pressed, the line is read by the AI: who it is about, what happened, what
  it leaves to do and when - returned in the same shape the reading on this
  machine has, shown the same way, and kept on Enter as now. A question is
  answered there. Not pressed, nothing leaves the machine, as now.
- **It stays pressed or not as it was left**, and says which service it is
  talking to. With no AI connected it says how to connect one.
- **For the owner:** whether AI mode reads every line while it is on, or
  only the ones the reading here was unsure of. *Recommended: every line
  while it is on - a switch that sometimes does nothing is not a switch.*
- **Done when:** the Sumanth line reads the same pressed and not, and a line
  the rules cannot read at all is read rightly pressed.
- **Built** (`shared/ailine.ts`, `services/askline.ts`): pressed, **Enter**
  sends the line - one request a line, never one a keystroke, because a free
  tier allows a few a minute. What goes is the line, today's date, the
  company in a sentence and up to twenty-four names it might mean; nobody's
  details. What comes back is checked against what Caulder holds and put
  into the reading the rules make. When it is what was already showing - the
  same place, contact and days - it is kept at once; when it is not, it is
  shown and Enter keeps it. It may ask one question in words and is read
  again with the answer. A question, or something to write, is answered
  under the line. Going somewhere and opening somebody are done here
  whatever the mode, and a line that looks like a password is never sent.
- **Decided for the owner, as recommended:** every line while it is on.
- **Not checked:** against a real service. The stand-in in the tests says
  what a model would; whether Gemini reads the Sumanth line the same pressed
  and not is for a key to show.

### Phase 39 - The AI proposes, the owner keeps - *built 13 October 2026*
- **Write the company in brief** from what is already there - the profile,
  the products, the last months of history - as a draft on the page, to be
  edited and kept. The same for a contact: "what we know about Harbour".
- **Tidy a page**: headings, what repeats, what contradicts - shown as a
  comparison, kept or thrown away whole.
- **What the history says that no page does**: "Kettle & Crumb have paid
  late three times" - offered as a memory, with the lines it came from.
- **Never by itself.** Nothing is written until it is kept, every draft says
  what was sent to make it, and what the AI wrote is marked as such.
- **Done when:** a new company's brief can be made in one press and reads
  as true to the person whose company it is.
- **Built** (`shared/propose.ts`, `services/propose.ts`, `Proposals.tsx`):
  *The company in brief* on the Brain's first page, as it goes with every
  question, with **Draft it** - from the profile, the plan, what is sold,
  who to, what was remembered and the last forty things that happened; a
  page's **Tidy with the AI**, which sends that page alone and shows it
  beside the page; and **What does the history show?**, about the contacts
  with three entries or more, each with the entries it came from.
- **The AI has no way to write.** Each of the three hands back text. A kept
  brief and a kept page go through the page's own save, so History has what
  was there; a kept fact goes on the contact's *Keep in mind* through the
  contact's own update. What was drafted or tidied says so in its last line.
- **Not built:** "what we know about Harbour" as a draft for one contact.
- **Not checked:** whether a real brief reads as true. That is the owner's
  to say, with a key.

## Not planned
- The AI doing things by itself - sending, moving a deal, writing a record
  unasked.
- Sending the whole company by default once phase 37 is in.

# Part eleven: the brain, sorted

*Written 13 October 2026, from the owner's question. The owner then said to
decide what was left open and build it, and - the same night - "I don't
want unnecessary pages... fully functional but not over complicating it".
Phases 40 to 43 were built on 14 October with that as the rule; what each
says under **Built** is what there is.*

## What the owner said

> The brain sorting too. How can we make that whole thing more useful and
> cleaner and functional. The company brain thing. Policies and everything.

## How it stands

- **Fifteen sections and twenty-nine kinds of page.** It was laid out for a
  company with departments. A one-person company fills four or five of the
  sections, and has to choose among fifteen each time it writes something.
- **A policy has no home.** "Policy" is one kind of page, in Legal, and
  means the privacy policy on a website. How the company works - "we
  invoice on the 1st", "never discount a retainer", "no calls before ten" -
  is said to the line and lands on one page, *Things to remember*, as a
  dated list in the order it was said, beside the printer on the fourth
  floor and what a supplier is like.
- **Nothing sorts that page.** *Loose ends* offers a move when a line sounds
  like a page there already is. It never makes a home, and it needs the
  model on this machine.
- **A rule that changes is said twice.** Both lines stand, and nothing says
  which is true now.
- **What is written is read in one place: its page.** The payment terms are
  not beside the invoice when one is written, nor a pricing rule beside a
  quote. The brain is somewhere to go and look, which is why it is not
  looked at.
- **Until 13 October the AI was never sent what the line was told to
  remember.** That is mended (part ten); it is here because it shows how
  far from the rest that page had drifted.

## One sentence

**The brain is where the company's answers are, and the answer is there
when the question comes up.**

## What else a company's brain has to be able to do

Thought through on 14 October, at the owner's asking. A brain for a company
of one has seven jobs, and this is where each stands:

1. **Hold what is true now, apart from what was said when.** A rule, a
   price, a term. *Phase 40.*
2. **Take what it is told without being told where to put it.** The line
   does; rules now have somewhere to go. *Phase 40.*
3. **Sort itself when asked.** *Phase 41.*
4. **Answer where the question comes up**, not only where the answer is
   kept. *Phase 42, in part.*
5. **Be asked in words.** The line answers from what is remembered, and the
   AI from what a question needs (part ten). *Built.*
6. **Know what it does not know, and what has gone stale.** The first is the
   ten questions on the Brain's first page; the second is *phase 44, not
   built.*
7. **Be handed to somebody else** - an accountant, a buyer, whoever covers
   a month away. The dossier, the data room and Export are that. *Built.*

Two things it should do and does not, neither planned yet:

- **Ask why at the moment something changes.** A price changed, a deal
  lost, a client dropped: one line, *Why?*, kept in Decisions. The reason
  for losing a deal is asked today; nothing else is.
- **Say the same thing the same way every time.** The standard answers a
  company gives - turnaround, what is included, how to pay - kept once in
  How we work and put into a message with a press.

## Phases

### Phase 40 - How we work: a home for the rules - *built 14 October 2026*
- **One section, *How we work*,** with a page a subject: *Billing and
  payment*, *Pricing and discounts*, *Hours and replies*, *Clients*,
  *Suppliers and tools*. A rule is one line and the day it was set. The
  playbooks move in beside them: the rules, then the steps.
- **The line files a rule where it belongs**, by its words - "we always",
  "we never", "our policy is", and what it is about - and says which page
  before Enter, as it does for any memory. A rule about nothing it knows
  goes on *Other rules*, not on a page of everything.
- **A rule replaced is replaced.** Said again differently, the line asks:
  *Instead of "we invoice on the 1st"?* The new one stands; the old one is
  in the page's history, where everything a page used to say is.
- The privacy policy stays in Legal, called what it is: a *published
  policy*.
- **Done when:** ten rules said to the line over a week are on five pages,
  each readable in ten seconds, with no page called "Things to remember".
- **Built** (`shared/rules.ts`, `services/howwework.ts`): the section the
  playbooks were in is *How we work*, and a rule said to the line goes on
  its subject's page there - the line says which before Enter. **No page
  exists until a rule does**: a subject's page is started by the first rule
  on it, and the five subjects are only where rules go, not five empty
  pages. A rule is a remembered line like any other, so finding, reading
  back, rewording and letting go are what they already were.
- **A rule replaced**: kept first, then asked - *Is it instead of "we
  invoice on the 1st"?* - and the older one is let go only on a yes. Asked
  after and not before, so Enter never waits on it.
- **"We invoice on the 1st" used to be read as a task for the 1st.** What a
  company does as a matter of course - invoice, bill, charge, quote, ship,
  deliver, accept, require, offer - is a rule, whatever day is in it. "We
  meet on the 5th" is still an appointment.
- *Things to remember* is still where a fact that is not a rule goes. The
  "done when" above asked for no such page; that was wrong - the printer on
  the fourth floor has to go somewhere.

### Decided, part eleven - *14 October 2026, by the owner's leave*
- **It is called How we work.** A policy sounds like a document, and these
  are a line each.
- **Five subjects to start, and any page added to the section is one.**
- **Nothing unnecessary** - the owner's rule. So: no page before there is
  something to put on it; five kinds of page no longer offered (milestone,
  competitor, fundraise, cap table, experiment). Pages a company already
  has of those kinds are untouched and open as before. And two things
  planned here were left out as more than they are worth: the rules on the
  call prompter, and regrouping the rail.
- **Tried and put back:** retiring *Products and pricing* as a section,
  since what is sold is on Money and how it is priced is now a page of
  rules. It is where the thinking about an offer is written, the export
  and two of the tests rely on it, and retiring it means first deciding
  where that thinking goes. Left for the owner.

### Phase 41 - Sort what was remembered - *built 14 October 2026*
- ***Sort this page***, on *Things to remember* and on any long page. Each
  line is offered a home: a rule to its page in *How we work*; something
  about a contact to that contact's *Keep in mind*; a number of the
  company's - a tax number, a bank - to its field on the profile; a thing
  said twice to one line; two that disagree to a question, *which stands?*
- By the rules on this machine first. With an AI connected, the AI proposes
  for what the rules could not place - a draft, like every other in part
  ten: a list of moves, each kept or left, and nothing moved by itself.
- Built on what *Loose ends* already does, which it replaces.
- **Done when:** a page of sixty remembered lines is sorted in under five
  minutes, and nothing was moved that was not seen.
- **Built** (`Sorting.tsx`, `sortPlan`, `applySort`, `proposeSort`): *Sort
  this page*, in the More menu of any page with three remembered lines or
  more. A rule is offered its subject's page, a line that names a contact
  that contact's *Keep in mind*, a line said twice is let go. Each is
  ticked, and **Move** makes the ticked ones in one go; the page's history
  has what it said before. With an AI connected, it can be asked about the
  lines left over - only those lines go, with the subjects and the
  contacts' names.
- **Not built:** a number of the company's to its field on the profile,
  and two lines that disagree asked about. *Loose ends* was left as it is
  rather than replaced: it works by meaning, on the model here, and does a
  different half of the job.
- **Not timed:** the five minutes.

### Phase 42 - The answer where the question is - *built in part, 14 October 2026*
- **Billing rules beside a new invoice and a new quote; pricing rules
  beside a quote and a product; hours on the call prompter.** A line or
  two, in the margin, with the page one press away. A contact's *Keep in
  mind* already works this way, and is the most read thing in the app.
- **"What is our policy on refunds?"** is answered by the line, from *How we
  work*, on this machine.
- *How we work* goes to the AI with a question about how things are done,
  and with anything it is asked to write to a client.
- **Done when:** writing an invoice, the owner does not open the brain to
  check the terms.
- **Built:** the billing rules beside a new invoice, and the pricing and
  billing rules beside a new quote (`RulesAside`) - shown only when there
  are some. "What is our policy on refunds", "how do we handle late
  payers" answered by the line from what is remembered. How we work goes to
  the AI with a question about how things are done (part ten).
- **Left out, on purpose:** the call prompter and the product form. Two
  places is enough to find out whether it is read.

### Phase 43 - Fewer shelves - *built 14 October 2026, smaller than written*
- **The rail in four parts**, with the sections under them: *What we are*
  (Company, Tax and compliance, Legal, Tools, Documents), *How we work*,
  *Where we are going* (Plan, Money plan, Products, Decisions, Metrics,
  Ideas), *What we have learned* (Customers and market, Meetings).
- No page moves and nothing is migrated: the sections stay as they are
  kept, and the rail groups them. Sections with nothing in them stay out of
  the way, as now.
- **Done when:** somebody new to the app can say where a thing goes without
  reading the list.
- **Built:** *All sections* lists them under the four headings. The rail
  was left alone: it already shows only the sections that hold something,
  which is four or five, and headings over five rows are more to read, not
  less. Fewer kinds of page are offered, as decided above.

### Phase 44 - Still true?
- A rule with a price, a rate or a date in it that is a year old, and a
  page nobody has touched in a year, are asked about once on the Brain's
  first page: *Still true?* Yes, or change it.
- **Done when:** nothing in *How we work* is older than a year without
  having been looked at.

## Not planned
- The AI moving, merging or rewriting anything unasked. It proposes
  (part ten).
- More kinds of page. Twenty-nine is already more than are used.
- Folders inside sections, tags, or a second way to group pages.

## For the owner to decide, part eleven
1. **What it is called.** *How we work*, or *Policies*. *Recommended: How
   we work* - "policy" sounds like a document, and these are one line each.
2. **The subjects.** The five above, fixed, or whatever pages the owner
   makes. *Recommended: start with the five, and any page added there is a
   subject.*
3. **Whether the rail is regrouped** (phase 43). It changes where
   everything is found. *Recommended: yes, after 40 to 42 have shown that
   the four parts are the right four.*
4. **The order.** *Recommended: 40, 41, 42, 43, 44.*

# Part twelve: a line that knows you

*Written 14 October 2026, from the owner's question. The owner said "continue": built the same day, in the order recommended - 45, 46, 47, 50, 48, 49 - and with both recommendations below taken. What each phase says under **Built** is what there is.*

## What the owner said

> Think about how you can make the quick tab feature smarter, to be able to
> work with different ways people text and work on your timetable and
> memories etc smart and efficiently without ai.

## How it stands

The line already reads a great deal without an AI: short forms and slips,
Hinglish, half past and quarter to, "@4", ranges and lengths, "in two
hours", repeats by weekday, two things in one line, moving and cancelling
a task, and questions about the day, free time and a contact's number. It
learns which kind a line is from a chip pressed (lessons) and which slips
are slips (Tune). The model on this machine is asked only about a line the
rules were guessing at.

**Measured on 14 October**, 84 new lines typed the way people type, on a
Monday at ten, each scored on every field it should have read - day, time,
length, repeat, contact, amount - not only where it went. The held-out
sets (part eight) count only the kind.

| Lines | Read right |
|---|---|
| A time, said every way | 22 / 30 - and 3 more asked "morning or evening?" |
| Typed as a text | 18 / 20 |
| What happened with a contact | 7 / 8 |
| Money | 7 / 8 |
| Changing or asking about what is there | 5 / 8 |
| A fact about a contact, kept as a fact | 0 / 7 - all seven on their history |

What it misses, by cause:
- **"At 11" is asked about** - morning or evening - even for "call priya",
  and on Tuesday at 11 the person has never once been at work at 11pm.
- **"half 3"** (half past, the British way), **"0930"**, and **"at four"**
  in words are not read as times.
- **"remind me tomorrow at four to call priya"** becomes a task called
  "Four to call priya".
- **"every other monday"** and **"the 1st of every month"** are not
  repeats. Monthly and yearly repeats add only the next one.
- **"call priyaa"** - a short first name one letter out - is not Priya.
- **Facts are filed as events.** "maya prefers whatsapp", "sam's address is
  12 King St", "jonas is on leave till the 20th" go on the contact's
  history beside the calls, where nothing reads them again. "remember
  priya bday 3 may" is a one-off task called *Remember priya birthday*.
- **"called priya - no answer, try again thursday"** is a task; the call
  that happened is lost.
- **"got 2400 from harbour"** is a refund of 2,400, not Harbour's invoice
  paid.
- **Nothing ticks a task off** ("done call priya", "finished the gst
  filing"), nothing moves by the hour ("move my 3pm to 4"), and "when did I
  last talk to maya", "how much does harbour owe" and "next free hour
  tomorrow" are not questions it knows.

## One sentence

**What the app already knows about you settles what the line would
otherwise ask - and what you correct once is never asked again.**

No AI anywhere in this part: rules, and the person's own data as the
deciding vote. The model on this machine stays where it is.

## Phases

### Phase 45 - Count every field
- The 84 lines above become a test that scores day, time, length, repeat,
  contact and amount, beside the held-out sets that score the kind. A
  fourth set is written blind, for a different founder, before phase 46
  starts, and counted only at the end.
- **Done when:** every phase below is a number moving on that test.
- **Built:** `shared/measured/fields.test.ts`. The fourth set is `lines-2026-10-b.json`, sixty lines for a photographer, written before any rule changed and never read. Before part twelve: 59 of 84 and 39 of 60.

### Phase 46 - Your day settles the time
- **Morning or evening, from your own hours.** An unmarked 7 to 11 goes to
  the side of the day the person's blocks have filled over the last eight
  weeks. Asked only when both sides have been used, or neither has.
- **The words for a part of the day mean your day:** "first thing" is when
  the person's first block usually starts, "after lunch" when their lunch
  block ends, "end of day" their last block's end - with today's fixed
  times when there is no history.
- **How long, from what it usually is.** A call, a meeting or "gym" with
  no length takes the length that kind of thing has usually had
  (`usualFor` already counts it for the title).
- **Done when:** "call priya at 11" asks nothing on a working week of
  history, and the measured time lines are 29 of 30.
- **Built:** `yourDay`, `sideOf`, `usualLength` in `shared/habitual.ts`. Time lines 20 to 26 of 30 on this phase alone, and the held-out set 39 to 43.

### Phase 47 - The words it does not know yet
- "half 3", four-figure times ("0930", "1530"), hours in words ("at
  four"), and "remind me *when* to *do*" with the title taken from after
  "to".
- Repeats every other week, on a date of the month ("the 1st of every
  month", "every month on the 15th", "the last friday of the month"), and
  yearly ("every year on 3 May"). This needs a real repeat on a task, not
  only the next one: a migration, and a line in data-model.
- A short first name one letter out, when the line starts with call, email
  or meet - "call priyaa" - asked as *Priya Nair?* the first time.
- **Built:** all of it, the last day of the month too. Every other week with an hour is a block series that skips the odd weeks (`block_series.every_weeks`); without one, and monthly and yearly, a task that comes back when ticked (`tasks.repeats`, migration 55). Time lines 30 of 30, 20 of 20 held out.

### Phase 48 - Corrected once, known after
- **An answer to "Which Priya?" is kept** as that word meaning that contact,
  for that person. Typed "pk" and answered Priya Nair, "pk" is Priya Nair
  from then on. Today the answer is used once and forgotten.
- **A time changed before Enter is kept** for the phrase: moved
  "evening" from 6pm to 7:30 twice, and evening is 7:30.
- Both are listed in Settings, under Tune, each with Forget.
- **Done when:** a question the line has had answered twice is not asked a
  third time.
- **Built, a little differently:** an answer to "which one?" is kept the first time, not the second (`line_names`, migration 56) - one press is the correction, so asking again is the mistake. A time changed before Enter is not stored: morning or evening is learned from the blocks already kept (`sideBefore`), which says the same thing without a second record of it.

### Phase 49 - Facts are not events
- **A fact about a contact is kept on the contact**, under *Known about
  them* on their page, not on their history: present tense, "is", "'s ...
  is", "prefers", "likes", "lives", with the contact as who it is about,
  and no past-tense verb of something done. Questions read it back: "what
  does maya prefer", "sam's address".
- **A birthday is a birthday**: on the contact, and a reminder each year -
  not a task titled with the word "remember".
- **A fact that ends** - "on leave till the 20th" - keeps its date, and a
  task for that contact before then says so.
- **What happened, and what is next, from one line**: "called priya - no
  answer, try again thursday" is the call on her history and a task for
  Thursday, as "spoke to maya, follow up friday" already is.
- **Money in from a contact** - "got 2400 from harbour", "harbour paid" -
  marks their open invoice paid when one matches, and asks which when two
  do.
- **Built:** `lead_facts` (migration 57), *Known about them* on the contact's page, `factsAbout` read first by the questions, the birthday as a yearly task, the away warning under the line, `paidFrom` - which says which invoice it marked, records a part against the only one open, and refuses to guess between two. It found that "priya's daughter is *called* aarav" was being logged as a phone call.

### Phase 50 - Ticked, moved and asked by the line
- **Done:** "done call priya", "finished the gst filing", "did the
  harbour invoice" tick the open task they match, with Undo.
- **Moved by the hour**: "move my 3pm to 4", "push this afternoon to
  tomorrow" - blocks as well as tasks.
- **Asked**: when did I last speak to X, how much does X owe, what did I
  say I would do for X, the next free hour on a day.
- **Built:** `done` in `shared/edits.ts`, with Undo; `taskAt` for a task named by its hour (tasks, not yet blocks on their own); the four questions in `shared/questions.ts`, answered in `services/lines.ts`.

## Not planned
- A generative model, or sending a line anywhere. Part ten's AI mode stays
  a switch, off.
- Correcting whole sentences. A word is mended; a sentence is read.
- Learning without being told. Every lesson comes from an answer or a
  change the person made, and can be forgotten.

## For the owner to decide, part twelve
1. **Where a fact about a contact lives.** *Known about them* on their page,
   or a line on their brain page. *Recommended: on their page* - it is
   where you are when you need it.
2. **Real monthly and yearly repeats** (phase 47) change the tasks table.
   *Recommended: yes* - rent, retainers, GST and birthdays are monthly or
   yearly, and they are the things a one-person company forgets.
3. **The order.** *Recommended: 45, 46, 47, 50, 48, 49* - measure first;
   then the cheap rules that are most often hit; then ticking off from the
   line, used every day; then learning; then facts, which is the largest.

# Part thirteen: the business that is still done elsewhere - *built 23 October 2026*

*From the owner's question after 1.0.0: what else a one-person company needs
that is relevant. Each is something a founder does today in a spreadsheet,
an accountant's email or their head, with the data already in Caulder.
Nothing here is built; the order is a recommendation.*

## What the owner said

> Do another pass of the logic etc, what other business things you can add.
> Something that is relevant, other ways to make the app better.

## Phase 51 - Tax on the invoice
- **The gap**: products carry a tax rate and an HSN/SAC code, but a quote
  and an invoice carry no tax at all, so a GST- or VAT-registered business
  cannot send its invoices from Caulder.
- A tax rate on each line (from the product, or typed), tax-exclusive or
  inclusive; the invoice and its PDF show the taxable value and the tax -
  CGST and SGST, or IGST, in India by the client's state; VAT elsewhere.
- What was charged in a quarter, for the return: on Money and in the export.
- **Done when**: an Indian GST invoice and a UK VAT invoice from Caulder are
  ones an accountant would accept.

## Phase 52 - A quote that was not answered
- A sent quote with no answer in seven days is offered on Today, beside late
  invoices: *QUO-0004 to Harbour, sent 9 days ago*. A quote can carry the
  day it is good until, and says so when it passes.

## Phase 53 - Payment terms
- A contact's terms (on receipt, 7, 15, 30 days) set a new invoice's due day,
  and the company has a default. Today the due day is typed every time.

## Phase 54 - Money coming in
- The next 30, 60 and 90 days on Money: invoices due and retainers expected,
  against running costs going out - the forward half of runway, which looks
  only back.

## Phase 55 - Who the money comes from
- On Money: what each client paid this year, what they owe, how many days
  they take to pay, and one line when one client is most of the income
  ("62% of this year's income is Harbour").

## Phase 56 - The accountant's pack
- A quarter or a year in one folder: the invoices as PDFs, payments, spend
  by category, tax charged, as a spreadsheet and the documents. Export
  everything is the whole company; this is what an accountant asks for.

## Phase 57 - Hours to invoice
- A block can be for a contact, and billable at a rate; *Invoice the hours*
  drafts lines from the blocks not yet invoiced. For a studio or a
  consultant, the time is the product. Later than the rest: it touches the
  calendar, Google sync and money together.

## Not proposed, and why
- A pipeline forecast, sequences, marketing verdicts: removed on purpose
  (feature map, "Removed on purpose").
- E-signatures, a client portal, online payments: each needs a server or an
  account of Caulder's.

## Built
The owner said: "Do the taxs things for as many countries as you can. Add the
buisness features too." All seven were built the same day, in the order
recommended, and are in the feature map. Tax knows about eighty countries by
name, rate and number, and any other types its own. Every part is checked by
`shared/tax.test.ts`, `shared/insights.test.ts`,
`electron/main/partthirteen.test.ts` and `e2e/tax.spec.ts`.

## For the owner to decide, part thirteen
1. **Whether to build it, and the order.** *Built, in that order.* *Recommended: 51, 52, 53, then
   54 and 55 together, then 56; 57 last.* Tax first, because without it
   the money half is not usable by a registered business.
2. **Phase 36 and phase 30 first, or after.** *Recommended: 51 before both -
   it is the one a paying customer would stop over.*

3. **Money in the currency's smallest unit.** *Found in the pass before
   1.0.0 (24 October 2026).* Every amount is a whole rupee, euro or pound, so
   an invoice's tax is to the whole unit: rounded once a rate, it is never
   more than half a unit out, which India's GST allows and a VAT invoice in
   euros or pounds does not. Cents would touch every table that holds money,
   every form and the PDF - a migration of its own, not a fix. *Recommended:
   before Caulder is offered outside India.*

# Part fourteen: invoices that look like the company's, kept where it keeps things - *built 25 October 2026*

## What the owner said
"Add some customisation to invoices generation too. How they look, and their
organisation into folders if the user wants." And, of renewals: which account
each service was bought with, across PaperKite's products and Unifloe.

## Built
- **How an invoice looks**, per company: three layouts (Classic, Banner,
  Compact), six inks that print well, a logo, a closing line, and a sample
  printed from Settings - the only honest preview of a PDF.
- **Copies in a folder of the person's own**, by year, month or client, named
  by number and client; the file on the contact stays as it was.
- **Running costs by account**, and renewals that say the account (part
  twelve's notice, 25 October).

## Built later the same day
The owner: "Ok do that ones not built", then invoicing for businesses not
registered for GST, for as many countries as can be, "for the ones you cant,
allow a general builder", and "Dont hardcode any of these ... i want the user
in the future to be able to edit and configure the values themselfs".
- **Rules of the company's own** (`shared/taxrules.ts`, migration 62): every
  rate, name, title, threshold and required wording is a starting value the
  company changes in Settings; an unknown country builds its own.
- **Not registered, registered, composition** for India, each with the
  document and the words the law asks for; the exemption words of seven EU
  countries; thresholds for twenty.
- **Numbering of the company's own**, chasing read by it; **TDS** on a
  payment; **amount in words**; **quotes as PDFs**; **email with the PDF**
  (script version 8); **Health** on Money; **costs by product**.

## Not built, and why
- **A credit note** (correcting or refunding an invoice already sent, which
  GST and VAT both ask to be a document of its own): its own table, number
  series and tax. *Recommended next*.
- **Numbers that start again each year**: the invoices table keeps a number
  unique per company, and rebuilding it is not worth what a year in the label
  already says. Unique for good is unique within a year, as rule 46 asks.
- **Products as spaces of their own** (each with its marketing, tasks and
  pages): costs say their product now; the rest waits until it is asked for
  again.
