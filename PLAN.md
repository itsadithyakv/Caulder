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

- Gmail through OAuth, so *Email* sends and replies are seen. Only worth
  doing once the *Did it go?* path has been used for a month and the founder
  still wants it.
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
