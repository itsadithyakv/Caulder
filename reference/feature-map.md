# Feature map

`features.md` says what Caulder does for the person using it. This file says
**where each thing lives in the code, what it writes, and what it touches** -
so that whoever changes the code next (a person or a Claude session) extends
what is there instead of building a second copy of it.

Paths are relative to the repository root. `services/x.ts` means
`electron/main/services/x.ts` and `repositories/x.ts` means
`electron/main/repositories/x.ts`. IPC channels are named in `shared/ipc.ts`,
handled in `electron/main/ipc/` (through `handle()`), and bridged in
`electron/preload/index.ts`; a preload namespace does not always match its
channel prefix (`day.createBlock` sends `blocks:create`).

Keep it true: a change that adds, moves or removes a feature updates its entry
here in the same commit. What is in flight and what is broken is in
[../STATUS.md](../STATUS.md); what is planned is in [../PLAN.md](../PLAN.md).

---

## Before you build anything

1. **Search this file for the noun.** Contact, memory, reminder, page, note,
   task, link - most of what a new request asks for is an extension of
   something below.
2. **Read "The spine".** If what you need is on the left of that table, use
   what is on the right. Every row there exists because a second version of it
   was built once, or nearly was.
3. **Read "Removed on purpose".** A request that sounds new may be a feature
   that was taken out with a reason.
4. **One parser, one index, one history, one link format.** New text input goes
   through the quick line; new findable things go into the FTS index by
   migration; things that happened to a contact go on its history; a link is a
   `[[token]]` in page text.
5. **Afterwards**, update this file, and `reference/data-model.md` if a table
   changed.

---

## The spine

The systems everything else plugs into.

| When you need to... | Use | Never |
| --- | --- | --- |
| Take a line of text from the person | The quick line: `readCapture` (`shared/capture.ts`) and `parseQuick` (`shared/quickadd.ts`). Six kinds: task, contact, memory, command, idea, note. A new kind follows the recipe under "Adding a kind to the line". | A second parser, a second input box, a reader called from `QuickAdd.tsx` beside `readCapture`. A personal kind: the journal, private lines, hobbies and habits were taken out on purpose. |
| Find things by their words | The FTS5 index `brain_search` + `search_map`, queried by `searchEverything` (`repositories/search.ts`). Kept by triggers, so writers never touch it. | `LIKE` scans in a service. Editing migration 20's trigger SQL (frozen) - a new source is a new migration that drops and recreates the triggers. |
| Find things by what they mean | `nearestTo` or, for the line, `examplesFor` + `shared/opinion.ts` (`services/understand.ts`) over the vectors the queue keeps (`repositories/vectors.ts`, migration 46). Arithmetic is `shared/understand.ts`; the model is asked only through `understand/host.ts`. | A second model, a second vector store, or calling onnxruntime anywhere but `understand/embed.ts`. |
| Work out what a line about a contact leaves to be done | `nextStepIn` (`shared/nextstep.ts`), carried as `then` on the reading. | A second place that reads "asked me to" or "she'll get back". A reminder table of its own: it is a task with `remind`. |
| Know who has been written to, and who answered | `shared/reached.ts`: `WRITTEN_KINDS`, `ANSWER_KINDS`, `REPLY_WAIT_DAYS`. Read from the history every time - by the *Reached* filter (`listLeads`) and by Today (`reachOf`). | A column or a table that says so: it would disagree with the history the day somebody logs an answer by hand. A second definition of "answered". |
| Record that something happened with a contact | `writeActivity` (`repositories/leads.ts`) - the append-only history. Its kinds are `ACTIVITY_KINDS` in `shared/domain.ts`; the table no longer checks them (migration 48). | A new log table. Editing a history entry (a correction is a new entry). |
| Link two things | A `[[Label|kind:id]]` token in page text (`shared/links.ts`). `brain_links` is rebuilt from the text on every save. Kinds: `page`, `contact`, `product`, `document`. | Writing `brain_links` directly. |
| Put a page under another | A first line `Part of [[Parent|page:id]]` (`services/remember.ts`), walked by `underOf` / `trailsOf` (`shared/memories.ts`). | A parent column. |
| Remember a fact | `remember()` (`services/remember.ts`): a dated line `- **fact** · said _(YYYY-MM-DD)_` on a page of the **company's** brain - the page named, or *Things to remember* (`REMEMBER_PAGE`). **Memories are not a table**; they are read back out of page text by `shared/memories.ts`. Something said about a contact goes on that contact's history instead. | A `memories` table beside the pages. A chain of pages worked out from what a thing is (that was `shared/branches.ts`, gone). |
| Keep the calendar's own things apart from a company | The calendar's workspace (`companies.kind = 'personal'`, `services/yourhome.ts`, `homeCompanyId`): what is on the calendar and is not a company's lives there, and Today and the Calendar read it beside the company (`withHome`). It holds no pages. | Anything personal. The journal, Life, habits, goals, the vision board and levels were taken out on 10 October 2026 (PLAN.md, part seven); see "Removed on purpose". |
| Send context to an AI | `relevantTo` (`services/relevant.ts`), which cuts `buildDossier` (`services/dossier.ts`) to the brief and what the question is about; `complete` and `asking` (`services/ask.ts`) for the request itself. For the clipboard: the topic brief (`services/topic.ts`). | Assembling documents for a model anywhere else, a second way to talk to a service, or sending the whole company where a part will do. |
| Chase money that is owed | `reminderFor`, `chaseOffer` (`shared/chase.ts`), sent through `mail:send`. Whether it was chased is read from `emails`. | A table of reminders, a second way to send, or anything that sends by itself. |
| Keep a rule the company holds to | A remembered line on its subject's page in How we work: `isRule`, `ruleSubject` (`shared/rules.ts`), written by `remember` (`services/remember.ts`). | A table of rules, a "policy" kind of record, or a second place rules are read from. A rule is a memory. |
| Move a remembered line somewhere better | `sortPlan` and `applySort` (`services/howwework.ts`), which move through `moveMemories` and `forgetMemory`. | Editing a page's body to take a line out. |
| Keep something the AI wrote | It is a draft in the window until kept: a page through `brain:save`, a line on a contact through `leads:update` (`Proposals.tsx`). | A handler that lets a service's answer write a row. `services/propose.ts` and `services/askline.ts` return text and nothing else. |
| Say who a contact is at a glance | `MAIN_DEAL(lead)` (`repositories/main-deal.ts`), worked out in the query. Stage moves only through `repositories/deals.ts`. | A stored copy of the stage on the contact. |
| Turn text in a page into tasks | `shared/steps.ts` + `services/steps.ts` (`- [ ]` lines with `@owner`, `(day N)`, `(by date)`). | A separate checklist feature. |
| Talk to Google | `callScript` in `services/gsync.ts` - the person's own Apps Script (`resources/appsscript/Caulder.gs`, version 6). A new thing the script does is a new `case` in its `handle`, a bump of `SCRIPT_VERSION` in both files, and a test in `services/script.test.ts`, which runs the real script. | OAuth from the app. |
| Keep a secret | Connections and keys: `services/credentials.ts` (safeStorage, refused rather than kept readable). Page fields: `services/secrets.ts`. The line never keeps one: `shared/secretline.ts` warns before it is filed. | A plain setting. |
| Notify the person | `services/nudges.ts` (`addReminder`) for anything asked for, and the brief with what renews; `notify.ts` (daily digest) and `remind.ts` (before a block). The brief and the block reminder are on unless switched off; the digest is off until switched on. | A fourth timer. |
| Run something in the background | `services/scheduler.ts`, or a tick in the owning service started from `electron/main/index.ts` and stopped on `before-quit`. A tick that awaits must not reschedule itself once stopped (`generation` in `services/understand.ts`). | `setInterval` in a screen. A child process started on the way out (`closeModel`). |
| Store a preference | `repositories/settings.ts` (one key per setting). | A new table for one value. |
| Handle a date | `shared/dates.ts`. A due date is a `YYYY-MM-DD` day in the company's timezone; a time is `HH:MM`. `today`, `dayOf` and `timeNow` keep one formatter per timezone. | `Date` arithmetic in local time; a date library. `new Intl.DateTimeFormat` in a loop: making one costs a thousand formats with it, and Today made six thousand. |
| Draw a list that can be long | `useShowing` and `ShowMore` (`src/lib/showing.tsx`): the first part drawn, the rest on a press or as it scrolls into view. Contacts and Today's overdue use it; the board caps its own columns in `buildBoard`. | Drawing every row: three thousand contacts froze the window for a second and a half. |
| Count something for a badge | A `COUNT(*)` of its own (`countOverdue`, `today:overdue`). | Building a whole screen's data for one number on every change of screen. |
| Fail | Throw an `Error` whose message is the sentence the person reads; Zod schemas state their own sentences. `handle()` (`ipc/handle.ts`) cleans it on the way out. | `ipcMain.handle` directly. |
| Add an IPC call | Constant and type in `shared/ipc.ts`, handler through `handle()` with Zod validation, method in `electron/preload/index.ts`. | Node in the window. |
| Change the schema | Append a step to `electron/main/db/migrations.ts` (latest: 58). Never edit or renumber one. Enums are checked in TypeScript, not SQL `CHECK`s. `reference/data-model.md` is held to the schema by `db/schema-doc.test.ts`. | A down-migration. |
| Draw a colour | A token in `src/styles/tokens.css` (a test enforces it). | A literal colour in a component. |
| Open a web address | Build it in main from the row, never from the window: `openWhatsApp`, `openProfile` (`services/outreach.ts`, with `shared/profiles.ts`), `sheet:open` (checked by `isSheetUrl`). | Handing `shell.openExternal` a string the window sent. |

---

## Screens

No router: `RouteId` is a union in `src/app/routes.ts`, held in `useState` in
`App.tsx`. Separate windows (`src/main.tsx` reads the hash): the quick window
(`Capture`) and the desk widget (`Widget`).

| Route | Label | Sidebar group | Key |
| --- | --- | --- | --- |
| `today` | Today | your time | T |
| `day` | Calendar | your time | D |
| `leads` | Contacts | the company's | L |
| `import` | Import | under Contacts | I |
| `pipeline` | Deals | the company's | P |
| `money` | Money | the company's | M |
| `brain` | Brain | the company's | B |
| `map` | Map | under Brain | - |
| `memories` | Memories | under Brain | R |
| `settings` | Settings | at the foot | S |
| `setup` | Setting up | under Settings | - |

The company and its switcher head the sidebar (`Sidebar.tsx`); under it the
rows are one list with no labels, your time first. There is no *You* group:
`journal` and `life` were routes until 10 October 2026.

Other keys: `A` add a task, `Ctrl+K` search everything, `/` search contacts,
`N` add a contact, `?` the list. Global quick window: `Ctrl+Q`
(`electron/main/capture.ts`).

---

## The company

### Companies and workspaces
One workspace per company (contacts, funnel, templates, calendar, money), plus
the hidden home workspace for your own things.
- UI: `src/app/CompanySwitcher.tsx`, `src/app/Sidebar.tsx`, `src/lib/workspace.tsx`, `src/features/onboarding/FirstRun.tsx`, company rows in `SettingsScreen.tsx`
- Logic: `shared/countries.ts`, `shared/domain.ts` · Main: `repositories/companies.ts` (seeds stages), `repositories/settings.ts`, `services/yourhome.ts`
- Tables: `companies`, `pipeline_stages`, `settings` · IPC: `companies:`, `active-company:`
- Tests: `repositories/companies.test.ts`, `services/yourhome.test.ts`, `home.test.ts`, `country.test.ts`; e2e `companies.spec.ts`, `branding.spec.ts`
- Touches: every company table cascades from it. Country sets currency, dial code and filing presets; timezone sets "today".

### Sample company
"Look around with sample data": a one-person studio with clients anywhere, in dollars, set in your own country (phase 24); a real import batch, removed when a real company is made.
- Main: `services/demo.ts` · UI: `FirstRun.tsx`, sample banner in `App.tsx` · IPC: `companies:seed-demo`, `companies:demo-batch`
- Tests: `services/demo.test.ts`; e2e `demo.spec.ts`
- Touches: reuses Import's batch undo; never moved into the home workspace.

### Contacts (leads)
The list, a contact's page, its append-only history and its tasks. A
contact's page is the one home for everything about it.
- UI: `src/features/leads/` (`LeadsScreen`, `LeadsTable`, `LeadForm`, `LeadDetail`, `Timeline`, `LeadTasks`, `useLeads`)
- Logic: `shared/domain.ts`, `shared/newperson.ts` · Main: `repositories/leads.ts` (`writeActivity`), `repositories/tasks.ts`, `repositories/main-deal.ts`
- Tables: `leads`, `activities`, `tasks` · IPC: `leads:`, `activities:`, `tasks:`
- Tests: `repositories/leads.test.ts`, `tasks.test.ts`, `electron/main/edges.test.ts`; e2e `leads.spec.ts`, `leadtable.spec.ts`
- Touches: made by Import, the quick line, the sample and the contacts sheet. Hosts deals, money, email, the message panel, save to phone, custom fields, files, backlinks, the call button. Feeds Today (reach out, going quiet), search, the dossier, export.
- The page reads in the order it is used (`LeadDetail.tsx`): next steps, the ways to write - email always, WhatsApp, LinkedIn and Instagram each only when there is a number or a profile - then the history, then deals and money.
- The facts on a contact's page are what is known, with one line for what is not and *Add a detail* (`LeadDetail.tsx`): a new contact is not a column of "Not known".

### Profiles: LinkedIn and Instagram
Two fields on a contact, each kept as one address in full whatever was typed. Imported from a *LinkedIn* or *Instagram* column, and a LinkedIn address in a *Website* column is moved across.
- Logic: `shared/profiles.ts` (`cleanProfile`, `profileLink`, `messageLink`, `profileShown`), used by `leadInput` in `shared/domain.ts` · Main: `repositories/leads.ts`, `services/import.ts`, `services/export.ts`, `services/dossier.ts`
- Tables: `leads.linkedin`, `leads.instagram` (migration 48) · Tests: `shared/profiles.test.ts`

### Write to several at once
Tick contacts in the list, *Write to them*: one message with each contact's own name in it, shown as one of them will read it, with who is left out and why. Capped at `BATCH_MOST` (50) and by what Gmail has left today. Optional follow-up if nobody answers.
- UI: `src/features/leads/SendMany.tsx`, `BulkBar` in `LeadsScreen.tsx` · Main: nothing new - it loops the same `mail:send` a contact's page uses, so do-not-contact, a missing address and the day's quota are refused in the same place.
- Not a campaign tool: no queue, no schedule across days, no tracking beyond what one email has.

### Who has been written to, and who answered
A third filter on Contacts, beside stage and relationship: **Not written to**, **No answer in 3 days**, **Answered**. Read from each contact's history, and nothing else is kept. With a stage and *Write to them* it is a second message to everybody who said nothing to the first.
- **Written to** is an email sent or a WhatsApp, LinkedIn or Instagram message said to have gone - not a call. **An answer** is a reply the mail saw, a meeting, or **They answered**, a kind of history entry put on by hand (`replied`), which is the only way Caulder knows about a reply somewhere it cannot read. It is the **last** message that counts: somebody who answered in March and not since Monday's is waiting again. Written to under three days ago is in none of the three.
- Logic: `shared/reached.ts` · Main: `listLeads` in `repositories/leads.ts` (`LAST_WRITTEN`, `ANSWERED_SINCE`; takes the clock, for tests) · UI: `Toolbar` in `LeadsScreen.tsx`, `useLeads.ts`, the *They answered* tab in `Timeline.tsx`
- Tests: `shared/reached.test.ts`, `repositories/leads.test.ts`; e2e `reached.spec.ts`

### Work through them
Tick contacts, *Work through them*: one message for all of them where Caulder cannot send it - WhatsApp, LinkedIn, Instagram - walked one contact at a time. Their own copy of the message (on the clipboard, or carried into WhatsApp), their profile opened, then *Sent it* or *Skip*. Who cannot be written to there is said before it starts, and why.
- **Sending is said, never assumed**, as on a contact's page: each goes on the history only on *Sent it*. It can be stopped at any contact; what was sent stays sent.
- UI: `src/features/leads/WorkThrough.tsx`, `BulkBar` in `LeadsScreen.tsx` · Logic: `queueFor`, `cannotReach` in `shared/reached.ts` · Main: nothing new - the same `outreach:whatsapp`, `outreach:profile` and `activities:log` a contact's page uses.
- **Under test nothing is opened outside the app**: `openOutside` in `services/outreach.ts` does not hand an address to Windows when `CAULDER_BACKGROUND` is set, so an end-to-end run can write to somebody.

### Deals and the main deal
A contact has deals; the main deal (open and touched last) sums it up in lists.
- UI: `src/features/leads/LeadDeals.tsx`, deal picker in `MoneyForms.tsx`
- Main: `repositories/deals.ts` (owns every stage move), `repositories/main-deal.ts`, `services/rules.ts`, `ipc/deals.ts`
- Tables: `deals` · IPC: `deals:` · Tests: `repositories/deals.test.ts`, `services/rules.test.ts`; e2e `pipeline.spec.ts`, `money.spec.ts`
- Touches: every move writes a history entry and may add the built-in follow-up; an accepted quote sets the value.

### Deals board (pipeline)
One card per deal by stage, drag or Move menu; the funnel is edited in Settings.
- A line above the board: open deals, their value, and the value weighted by stage (the k-th of n open stages counts k/(n+1); won and lost left out), in the company's currency. Logic `src/features/pipeline/totals.ts` + `totals.test.ts`; e2e `pipeline.spec.ts`.
- UI: `src/features/pipeline/`, `src/features/leads/StageBadge.tsx`, `src/features/settings/StageEditor.tsx`
- Main: `services/pipeline.ts` (`buildBoard`), `repositories/stages.ts` · Tables: `pipeline_stages`, `deals`
- IPC: `board:get`, `stages:`, `deals:set-stage`, `leads:set-stage-many` · Tests: `services/pipeline.test.ts`; e2e `pipeline.spec.ts`

### The built-in follow-up (what is left of Rules)
A deal moved into an open stage with nothing planned gets a follow-up task N days out (0 turns it off). The rule builder is gone.
- Main: `services/rules.ts` (called from `repositories/deals.ts`), `services/outreach.ts` · UI: days setting in `Workbench.tsx`
- IPC: `outreach:follow-up-days`, `outreach:set-follow-up-days` · Tests: `services/rules.test.ts` (no e2e)

### Import
Four steps (choose or paste, map, preview with duplicates, commit); each import is one batch that can be undone. Google Contacts comes in the same way.
- UI: `src/features/import/` · Logic: `shared/import.ts`, `normalise.ts`, `paste.ts`, `gcontacts.ts`
- Main: `services/import.ts` (exceljs), `services/gcontacts.ts` · Tables: `import_batches`, `leads`, `deals`, `activities`
- IPC: `import:` · Tests: `shared/normalise.test.ts`, `paste.test.ts`, `gcontacts.test.ts`, `services/import.test.ts`; e2e `import.spec.ts`, `paste.spec.ts`, `google.spec.ts`

### Calls
A prompter reading a script (a page in How we work) with the contact's context, a dialler handed an id, and a wrap-up that logs the outcome.
- UI: `src/features/calls/` · Logic: `shared/calls.ts` · Main: `services/calls.ts`, `repositories/calls.ts`, `services/outreach.ts` (`openDialler`), `ipc/calls.ts`
- Tables: `calls`, `activities`, `tasks`, `deals` · IPC: `calls:` · Tests: `shared/calls.test.ts`, `repositories/calls.test.ts`; e2e `calls.spec.ts`
- Touches: history, last contacted, tasks, deal stage; feeds metrics and the dossier.

### Money: quotes, invoices, payments, spend
Four numbers a month and three lists. Paid comes from payments; overdue is worked out when read.
- Payments on an invoice: *Record a payment* (part payments; amount defaults to what is owed) and *Payments* to take one back after a confirm; *Mark paid* stays the one click. `PaymentsForm` in `MoneyForms.tsx`, through `money.addPayment` / `money.deletePayment`; e2e `money.spec.ts`.
- UI: `src/features/money/` (`MoneyScreen`, `MoneyForms`), `src/features/leads/LeadMoney.tsx`
- Main: `repositories/money.ts`, `services/invoice.ts`, `invoice-html.ts`, `print.ts`
- Tables: `quotes`, `quote_lines`, `invoices`, `invoice_lines`, `payments`, `spend` · IPC: `money:`, `quotes:`, `invoices:`, `payments:`, `spend:`
- Tests: `repositories/money.test.ts`, `services/invoice-html.test.ts`; e2e `money.spec.ts`
- Touches: overdue invoices lead Today; an accepted quote makes the invoice and sets the deal's value; the PDF is filed as a document on the contact; the issuer comes from the brain's company page.

### A company's own tax rules
Part fourteen. Settings › Workspace › Tax and billing › *Rules* (`TaxRulesEditor.tsx`): every value a law could change is the company's to type - what the tax is called, its rates, what the tax number is called, the titles with and without tax, the words a document must carry when the business is not registered ("TVA non applicable, art. 293 B du CGI"), the registration threshold in words and as a sum, the tax clients withhold and its rate (India's TDS at 10%), the composition scheme's title and words, when the financial year starts, and the numbers usually printed (PAN, Udyam, ABN, SIRET). The country's are only where they start (`shared/tax.ts`, `shared/invoicerules.ts`); only what differs is kept, and *Back to the country's* clears it. A country Caulder does not know starts blank, and this is how its invoices are built. India's status is one of three: not registered, registered, composition (a bill of supply, no GST).
- Logic: `shared/taxrules.ts` (`defaultTaxRules`, `resolveTaxRules`), `shared/invoicerules.ts` · Main: `repositories/billing.ts` (`taxRules`, `setTaxRules`, `companyBilling().rules`) · IPC: `billing:tax-rules`, `billing:set-tax-rules` · Tables: `companies.tax_rules`, `companies.tax_scheme` (migration 62)
- Read by: `taxed` (the tax's name), `rateFor`, the invoice and quote PDF (titles, the words, the number label), the accountant's pack and Health (the year), numbering (the year)
- Tests: `shared/taxrules.test.ts`, `electron/main/partfourteen.test.ts`; e2e `invoices.spec.ts`

### Invoices: numbers, words, TDS, quotes and email
Part fourteen. **Numbers as the company writes them** (`numbering` in `invoice_look`, `formatInvoiceNumber`): a prefix, the year or financial year, three to five digits - "PK/26-27/0042", sixteen characters at most; the count never restarts, so a number is unique for good. Every display, search, chase and file name reads `Invoice.label`. **Numbers under the name** (`ids`): PAN, Udyam, a company number. **The amount in words** ("Rupees Sixty-Six Thousand Eighty Only", `shared/words.ts`), on by default in India. **TDS on a payment** (`payments.withheld`): *They deducted TDS* fills the rule's rate of the amount before tax; it pays the invoice but is not money in. **A quote as a PDF** in the same look (`writeQuotePdf`). **Email it** (`DocumentMailForm` in `ChaseForm.tsx`, from an invoice's or a quote's row): the words written, the PDF attached - printed in main from what was named (`sendEmailInput.attach`, `documentPdf`), sent now through Gmail (script version 8) or another account; emailing a draft marks it sent. A reminder can carry the PDF too.
- Main: `services/invoice.ts`, `services/mail.ts`, `services/mailaccounts.ts` · Script: `resources/appsscript/Caulder.gs` (`deliver` with attachments, `ATTACH_SINCE_VERSION`) · IPC: `quotes:pdf`
- Tests: `shared/words.test.ts`, `services/script.test.ts`, `electron/main/partfourteen.test.ts`; e2e `invoices.spec.ts`, `mail.spec.ts`

### Health
Part fourteen. Money › *Health* (`MoneyHealth.tsx`): a year of money in, and of what was left after spending, as the metrics' own chart draws them (`MetricChart`); the financial year's turnover, tax charged and tax withheld; for a business not registered, its turnover against the threshold as a bar, and when, at this pace, it reaches it; the next filings on the company's calendar (Deadlines). Worked out when read (`shared/health.ts`, `services/health.ts`, `money:health`); a part with nothing in it is not drawn.
- Tests: `shared/health.test.ts`; e2e `invoices.spec.ts`

### How invoices look, and where their copies go
Part fourteen. Settings › Workspace › *Invoices* (`InvoiceLookCard.tsx`): a layout (Classic, Banner, Compact), one of six inks, a logo (a PNG or JPEG kept as `invoice-logo-<company>` beside the attachments, printed from inside the page), and a closing line; *See a sample* prints a made-up invoice in the look. And a folder of the person's own: each invoice's PDF is copied there as well as filed on the contact - all in one, by year, by month or by client, named by number or number and client (`invoiceFilePath`) - and the copy is what opens. The folder is only ever chosen in the system's dialog; the window can clear it but never name one.
- Logic: `shared/invoicelook.ts` · Main: `services/invoice.ts` (`printedLook`, `writeInvoiceSample`, `keepInvoicePdf`), `invoice-html.ts` (`look`), `repositories/billing.ts` (`invoiceLook`) · IPC: `billing:invoice-look`, `billing:set-invoice-look`, `billing:invoice-logo`, `billing:invoice-folder`, `billing:invoice-sample` · Table: `companies.invoice_look` (migration 61) · Colours: `--doc-ink-*` in `tokens.css`, the same in dark, as the paper is
- Tests: `shared/invoicelook.test.ts`, `services/invoice-html.test.ts`; e2e `invoices.spec.ts`

### Tax on quotes and invoices
Part thirteen, phase 51. `shared/tax.ts` knows each country's tax by name, number label, usual rates and whether the document is titled "Tax invoice" - India, the 27 of the European Union, the UK, Switzerland, Norway, Canada, Australia, New Zealand, Singapore, the Gulf, much of Asia, Africa and Latin America - and any other country types its own. A company charges it from Settings › Workspace › *Tax and billing* (`BillingCard.tsx`): on, a usual rate, prices with tax in, its tax number, its state or province. **Each line keeps its rate** (from the product, or the client's usual); **each document keeps its treatment** when made (`treatmentFor`): `standard`; India's CGST and SGST in the company's state, or IGST in another, read from the GSTINs' first two digits; Canada's HST, or GST and QST/PST, by the client's province; an EU reverse charge to a business client elsewhere in the Union (from their VAT number); not charged to a client abroad, with the note the law asks for. `taxed` works out the subtotal, the tax by component and rate, and the total, in whole units: each line's amount, then the tax once for each rate, so it is never more than half a unit out; a label said twice (British Columbia's GST on a 5% and a 12% line) is one line. The form shows it as the file will (`DocumentForm`); the PDF says it, with the client's number and India's HSN/SAC codes from the products (`invoice.ts`, `invoice-html.ts`); Money says the quarter's tax.
- Logic: `shared/tax.ts`, `shared/billing.ts` · Main: `repositories/billing.ts`, `repositories/money.ts` (`taxFor`, `moneyOf`) · IPC: `billing:` · Tables: `companies.tax_*`, `leads.tax_*`, `*_lines.tax_rate`, `tax_treatment`/`tax_inclusive`/`tax_region` on quotes and invoices (migration 60)
- Tests: `shared/tax.test.ts`, `electron/main/partthirteen.test.ts`; e2e `tax.spec.ts`
- Rates are as they stood in 2026 and can be typed; the setting is not advice.

### A client's billing details, and payment terms
On a contact's page, folded under their money (`ClientBilling.tsx`): their tax number, country and state, their payment terms and hourly rate - kept apart from the contact's form (`billing:client`), so nothing that saves a contact can clear them. A new invoice is due by the client's terms, else the company's, else a fortnight (`termsFor`); accepting a quote uses them too (phase 53).

### A quote nobody answered
Phase 52. A sent quote with no answer for a week, or past its *Valid until* day (`quotes.valid_until`), is on Today (`listQuotesWaiting`, `Today.quotesWaiting`), with *Accepted* (which makes the invoice) and *Declined* on its row.

### The next 90 days, and who the money comes from
Phases 54 and 55, on Money (`MoneyInsights.tsx`), worked out when read in `shared/insights.ts`: three thirties of what is owed and due (late money in the first), retainers to come and running costs going out (`aheadOf`); and a *Clients* tab of each client's year - paid, owed, late, days to pay - with a line when one client is half the income or more (`clientsOf`).

### The accountant's pack
Phase 56. *For the accountant* on Money: a quarter, or a year - the country's financial year where it is not the calendar's, April to March in India, July to June in Australia (`periodDays`, `shared/accountant.ts`) - then a folder, and `accounts.xlsx` (invoices with each tax component, payments, spend, tax, a summary) and every invoice's PDF are written there (`services/accountant.ts`, `money:accountant-pack`).

### Hours to invoice
Phase 57. A block can be for a client and billed by the hour (`BlockClient.tsx`): said as it is made (`blockInput.forClient`, every one of a repeat), and after that changed apart from the block's own form (`hours:set-for`). Billable time that has happened and is on no invoice is offered on the client's page (`HoursToBill.tsx`), at the amount the invoice will come to, and made a draft invoice, a line a block at the client's rate (`repositories/hours.ts`); a deleted draft gives the hours back.

### Running costs and runway
Recurring costs read from brain pages (tool, domain, running cost), marked paid onto spend; runway from typed balances and the burn.
- **From the line** (`readCommand` and `renewalIn`, `shared/commands.ts`, the `cost` command): "Netflix 649 monthly"; "My unifloe.app domain expires on the 27th next year. It renews for 2,640" - on its day, a domain kept as a Domain page in Tools; "I paid 20000 for the domain for 5 years" - paid now through `costs:renew`, due again five years on. Said again, the page it has is brought up to date (`keepCost`, `QuickAdd.tsx`).
- **Paid ahead** (`years` on a page): a domain's cost is a year's, so a renewal pays it times the years; a running cost's amount is each payment. The month, the 90 days and the renewal all count the term (`costOf`: `each`, `years`).
- **The account it is on** (`account` on tools, domains and running costs): "I use Resend with studio@gmail.com", "changed leaflet's drive permission email from a@ to b@" (`accountIn`, the `account` command) - set on the page, and the one it was is kept, dated, at its foot. Said on Today's renewal row, in the list, and in the notice.
- **By account, or by product**: chips over the list, each offered once any cost says its account or the product it serves (`product` on tools, domains and running costs) - which login holds what, and what each product costs, across a company's products.
- **Told** with the morning brief, each its own notification: once as it comes into view (a month ahead for a yearly one) and again on its day (`sayRenewal`, `renewalsToTell` in `shared/nudges.ts`; the setting `renewalsTold`).
- UI: `src/features/money/CostsTab.tsx`, Paid on Today · Logic: `shared/costs.ts` · Main: `services/costs.ts`, `repositories/costs.ts`, `ipc/costs.ts`
- Tables: `cash_balances`, `spend`, `brain_pages` · IPC: `costs:` · Tests: `shared/costs.test.ts`, `services/costs.test.ts`; e2e `money.spec.ts`

### Products and pricing
A catalogue with a dated price book, picked onto quote and invoice lines.
- UI: `src/features/money/ProductsTab.tsx` · Logic: `shared/products.ts` · Main: `services/products.ts`, `repositories/products.ts`
- Tables: `products`, `prices` · IPC: `products:` · Tests: `shared/products.test.ts`, `services/products.test.ts`

### Email templates and the mail-app path
Per-company email and WhatsApp templates, filled by one renderer. Without the script, email opens the machine's mail app and asks whether it went.
- UI: `src/features/settings/TemplatesCard.tsx`, `TemplateList.tsx`, `src/features/leads/LeadEmail.tsx`
- Logic: `shared/email.ts`, `shared/render.ts` · Main: `repositories/email.ts`, `services/outreach.ts`
- Tables: `email_templates` · IPC: `templates:`, `outreach:email`, `outreach:email-sent` · Tests: `services/outreach.test.ts`; e2e `mail.spec.ts`
- How a template has done: a message remembers the template it started from (`emails.template_id`, migration 48), and the list says "12 sent, 3 answered" - a rate only from `RATE_FROM` (20) watched sends. `templateStats` in `repositories/mail.ts`, `sayStats` in `shared/mail.ts`, `templates:stats`; tests `repositories/mail.test.ts`.

### Mail through Gmail, and other accounts
Sends through the person's Apps Script (now or scheduled, one follow-up, replies and bounces noticed, cancel), or from another account - Zoho, Outlook, a domain of your own - over SMTP (nodemailer).
- **Replies from another account** (migration 51): a switch on each account, off until turned on (`setReplyReading`, tried before it is kept). On, `checkReplies` (`services/mailaccounts.ts`) asks the inbox every ten minutes through `services/inbox.ts` - IMAP by hand over `node:tls`, read-only (`EXAMINE`), seven named headers and never a message - and `repliesAmong` (`shared/replies.ts`) matches them to what was sent: by the Message-ID Caulder sent with (`emails.message_id`), then by the address written to. Each answer goes through the same `applyReport` the script's do, so it is on Today and the contact. An out-of-office or a bounce is not an answer.
- **A follow-up from such an account** is sent by Caulder (`sendDueFollowUps` in `services/mail.ts`): the inbox is looked at first every time, it goes in the same thread, and it waits when the inbox cannot be read. An account that does not see replies refuses one in a sentence.
- UI: `LeadEmail.tsx`, `src/features/settings/MailAccountsCard.tsx`, `GoogleCard.tsx`, replies on Today
- Logic: `shared/mail.ts`, `mailaccounts.ts` (`inboxFor`), `replies.ts`, `script.ts` · Main: `services/mail.ts`, `services/mailaccounts.ts`, `services/inbox.ts`, `repositories/mail.ts`, `services/scheduler.ts`
- Tables: `emails`, `mail_accounts` · IPC: `mail:`, `mail-accounts:`, `google:script` · Tests: `shared/mail.test.ts`, `shared/replies.test.ts`, `services/mail.test.ts`, `mailaccounts.test.ts`, `inbox.test.ts` (a stand-in mail server on this machine), `script.test.ts` (runs the real `Caulder.gs`); e2e `mail.spec.ts`

### Messages: WhatsApp, LinkedIn and Instagram
One panel for the three (`LeadMessage.tsx`, `channel` prop): write it, open the place it is sent from, and say afterwards whether it went. WhatsApp takes the message with it; LinkedIn and Instagram take nothing from outside, so theirs is put on the clipboard. Logged only on "Sent it", as its own kind on the history, and counts as contact. LinkedIn and Instagram are shown only on a contact that has that profile.
- UI: `src/features/leads/LeadMessage.tsx` · Main: `services/outreach.ts` (`openWhatsApp`, `openProfile`) · IPC: `outreach:whatsapp`, `outreach:profile` · Tests: `services/outreach.test.ts`, `shared/profiles.test.ts`; e2e through `reached.spec.ts` (WhatsApp, from a ticked list)

### Do not contact
One flag on a contact, refused in main by email, mail-app and WhatsApp; setting it stops mail already scheduled.
- Enforced in `services/outreach.ts` and `services/mail.ts` (`sendEmail`, and `stopBarredMail` from `leads:update` and each mail pass); `dueAccountEmails` skips a marked contact. Shown on the board, the call prompter, the contact, and Today's call tasks (`Task.leadDoNotContact`) · Tests: `outreach.test.ts`, `mail.test.ts`, `mailaccounts.test.ts` (no e2e)

### Google: Calendar, Tasks, Contacts, Drive
One script in the person's own account: blocks and tasks both ways, Contacts into Import, save a contact to the phone, a backup to Drive.
- UI: `src/features/settings/GoogleCard.tsx`, `src/features/onboarding/SetupScreen.tsx`, `src/features/leads/SaveToPhone.tsx`, `DataSafety.tsx`
- Logic: `shared/gsync.ts` (every sync decision, no network), `gcontacts.ts`, `script.ts` · Main: `services/gsync.ts`, `gcontacts.ts`, `gmore.ts`, `scheduler.ts`, `credentials.ts`, `repositories/google.ts`
- Tables: `google_sync`, `google_tombstones` · IPC: `google:`, `import:google` · Tests: `shared/gsync.test.ts`, `services/gmore.test.ts`, `script.test.ts`; e2e `google.spec.ts`

### Contacts as a Google Sheet
A company's contacts kept as a spreadsheet in the person's own Drive, a row a contact, to read and change on a phone. Off until linked, a company at a time. Each pass reads the sheet, takes in what was changed there, and writes the whole list back.
- Which side is right is one pure rule, a cell at a time (`planSheet` in `shared/sheet.ts`): a cell that differs from what Caulder last wrote was edited in the sheet and wins; one that matches was not, and Caulder's stands. A row typed in with a name is a new contact. Nothing is deleted by the sheet.
- What the sheet changed goes through `leadInput` and `updateLead`, like an edit on the contact's page; what it says that cannot be kept is listed on the card.
- UI: `src/features/settings/ContactsSheetCard.tsx` · Logic: `shared/sheet.ts` · Main: `services/sheetsync.ts`, `scheduler.ts` (`startSheetSync`, every ten minutes), handlers in `ipc/me.ts` · Script: `sheetRead`, `sheetWrite` (version 6)
- Tables: `sheet_links`, `sheet_rows` (migration 50) · IPC: `sheet:` · Tests: `shared/sheet.test.ts`, `services/sheetsync.test.ts`, `services/script.test.ts`
- Touches: `docs/privacy.md` says what goes. The script's old shared-brain actions and its invitation door were removed with founder sharing.

### Deadlines and documents
A filing calendar of obligations (country presets, done per occurrence) and the company's documents with expiry. Files on a contact are documents too (25 MB each).
- UI: `src/features/deadlines/` (mounted in the brain's `SectionView.tsx`), on Today and the Calendar · Logic: `shared/deadlines.ts`
- Main: `services/deadlines.ts`, `repositories/obligations.ts`, `repositories/documents.ts`, `services/files.ts`, `ipc/deadlines.ts`
- Tables: `obligations`, `obligation_done`, `documents` · IPC: `deadlines:`, `documents:` · Tests: `shared/deadlines.test.ts`, `services/deadlines.test.ts`; e2e `deadlines.spec.ts`

### Metrics
Company numbers, derived monthly (paid, invoiced, spent, won, calls, cash) or typed.
- UI: `src/features/metrics/` · Logic: `shared/metrics.ts` · Main: `services/metrics.ts`, `repositories/metrics.ts`
- Tables: `metrics`, `metric_values` · IPC: `metrics:` · Tests: `shared/metrics.test.ts`, `services/metrics.test.ts`; e2e `running.spec.ts`

### Custom fields
Per-company fields on every contact.
- UI: `Workbench.tsx`, `src/features/leads/LeadExtras.tsx` · Main: `repositories/workbench.ts` · Tables: `custom_fields`, `custom_values` · IPC: `fields:` · Tests: e2e `workbench.spec.ts` only

---

## The brain

### Pages, sections, templates and fields
Markdown pages in sections, each from a template with typed fields; steps and a decision log.
- UI: `src/features/brain/` (`BrainScreen`, `BrainHome`, `SectionsIndex`, `SectionView`, `PageView`, `PageFields`, `Markdown`, `LinkedEditor`, `editor/`, `PageTasks`, `DecisionLog`)
- Logic: `shared/brain.ts` (sections, templates, fields), `shared/markdown.ts` (no Markdown library, no HTML strings), `shared/steps.ts`
- Main: `services/brain.ts`, `repositories/brain.ts`, `services/steps.ts`, `ipc/brain.ts`
- Tables: `brain_pages`, `brain_revisions` · IPC: `brain:` · Tests: `shared/brain.test.ts`, `markdown.test.ts`, `services/brain.test.ts`; e2e `brain.spec.ts`, `writing.spec.ts`
- Touches: every save rebuilds links, refreshes search (triggers), keeps a revision, marks the page for sync.

### Revisions and history
Every save is a revision; History shows a line diff and restores. Saves within five minutes merge.
- UI: `PageHistory.tsx` · Logic: `shared/diff.ts` · Main: `repositories/brain.ts` · IPC: `brain:revisions`, `brain:restore`

### Links and the `[[` picker
- UI: `editor/completions.ts`, `LinkedEditor.tsx`, `BrainLinks.tsx` · Logic: `shared/links.ts` · Main: `repositories/links.ts`
- Tables: `brain_links` · IPC: `brain:link-targets`, `brain:backlinks` · Tests: `shared/links.test.ts`, `electron/main/links.test.ts`; e2e `maplink.spec.ts`
- Note: some Map edges are worked out, never stored (document to contact or page, product to invoiced contact) in `buildGraph`.
- Reach (`reachFrom` in `repositories/links.ts`): a company's page links within its company only, because a company's brain can be shared. (The calendar's own workspace would reach every company, but holds no pages now.) The picker and the names of links both go through it.

### The Map
A force-directed canvas of pages, contacts, products and documents; positions kept; drag a dot onto another to write a link.
- UI: `MapView.tsx`, `MapCanvas.tsx` (canvas, frame outside React), `MapOf.tsx` · Logic: `shared/map.ts` · Main: `services/map.ts`, `repositories/links.ts`
- Tables: `brain_links`, `map_positions` · IPC: `brain:map`, `brain:local-map`, `brain:connect`, `brain:disconnect`, `brain:keep-positions`, `brain:let-go` · Tests: `shared/map.test.ts`, `services/map.test.ts`

### Understanding, on this machine
A small model (all-MiniLM-L6-v2, int8, 23 MB) that reads pages, memories, contacts, tasks and notes for what they mean (PLAN.md, part five). On by default; it reads, never sends, and only offers.
- Logic: `shared/understand.ts` (WordPiece tokens, pooling, int8, nearness) · Main: `electron/main/understand/embed.ts` (the model, plain Node), `worker.ts` (its utility process, built to `out/main/understand.js`), `host.ts` (starts, restarts, times out), `services/understand.ts` (the queue job, `nearestTo`), `repositories/vectors.ts`
- UI: `src/features/settings/UnderstandCard.tsx` (This computer) · Tables: `vectors`, `embed_queue` (migration 46) · IPC: `understand:` (state, set, again) · Setting: `understandOff`
- The model is fetched, not committed: `npm run fetch-model` into `resources/model`; the installer carries it beside the executable. Without it everything else works and its tests are skipped.
- Tests: `shared/understand.test.ts`, `repositories/vectors.test.ts`, `services/understand.test.ts`, `understand/embed.test.ts` (the real model); packaged: `smoke:packaged`
- Second opinion (phase 20): `examplesFor` in `services/understand.ts` turns the nearest vectors into votes - seeds (`shared/understand-seeds.ts`), your tasks, memories, notes, idea pages, and any page of the brain as a home for a memory; never contacts. The decision is `shared/opinion.ts`. The three measured sets of lines went with the kinds they were labelled in (10 October 2026); a new blind set for the six kinds has not been written yet.
- Memories (phase 21): `saidAgain` and `belongsOn` in `shared/understand.ts` hold the measured bars; `markRepeats` runs as the queue reads a page; `relatedTo` feeds *Near in meaning* in `BrainLinks.tsx` (`understand:related`).
- Touches: the quick line (kind, where a memory goes), Memories (said again, loose ends, recall), brain pages (near in meaning). Phase 22 chooses what goes to an AI.

### Search everything (Ctrl+K)
One FTS5 index over pages, contacts, notes, history and invoices; words quoted and made prefixes; bm25 with the title weighted 8 and notes and history pushed down.
- UI: `src/features/search/SearchPalette.tsx` · Main: `repositories/search.ts`, `services/brain.ts` (`search` adds the home workspace)
- Tables: `search_map`, `brain_search` · IPC: `brain:search`
- Touches: Ask (`about`, `contactsFor`), the topic brief, line answers.

### Memories
Dated lines on pages of the company's brain, written by the quick line and listed by what they are about or by time. The newest line with the same key (text before the colon) is the current answer. Reached from the Brain's rail; `R`.
- Arranged by the model (phase 21): *said again* marks in `said_again` (migration 47), applied in `allMemories` as `earlierBy: "model"`, taken back by `understand:not-the-same`; loose ends on *Things to remember* offered to the page they belong on (`LooseEnds.tsx`, `looseEnds` / `moveMemories` / `leaveLoose`, setting `looseLeft`); recall fused with meaning (`fuseRecall`, `memoriesByMeaning`).
- UI: `src/features/brain/Memories.tsx` (route `memories`)
- Logic: `shared/memories.ts` (`memoriesOf`, `recall`, `underOf`, `trailsOf`, `groupMemories`, `RememberInput`)
- Main: `services/remember.ts` (writes), `services/memories.ts` (reads, edits, forgets through `savePage`; `pageTitles` for the line)
- Tables: `brain_pages` (no table of its own) · IPC: `brain:memories`, `brain:titles`, `brain:edit-memory`, `brain:forget-memory`, `brain:remember` - all take the company
- Tests: `shared/memories.test.ts`, `services/memories.test.ts`, `remember.test.ts`

### Where a memory is placed
- On the page the line names by its whole title (`namedPage` in `shared/capture.ts`), or the page the model says it is near.
- Otherwise on *Things to remember*, in the section `remembered`, started the first time.
- "Our GST number is …" leads the line with what it is about (`OURS`), so the newest is the answer.
- Something said to be remembered about a contact goes on the contact's history, not a page.

### Topic brief (Copy context for another AI)
Search hits for a topic, every page under them, and the matching hours, logged numbers, tasks and contacts, as one Markdown block on the clipboard.
- UI: `src/features/brain/ContextCard.tsx`, on the Brain's first page and nowhere else · Logic: `shared/topic.ts` · Main: `services/topic.ts`
- IPC: `brain:topic` · Tests: `shared/topic.test.ts`, `services/topic.test.ts`; e2e `context.spec.ts`
- By meaning too (phase 22): with understanding on, the handler adds the pages nearest the topic (`nearestTo`) to what its words found, before the pages under them are gathered.

### Ask the brain
Your own AI (Gemini, Anthropic, OpenAI, OpenRouter, Groq, Ollama, any OpenAI-style address) answers from the company's records, on the Brain's first page. Three request shapes; model names are read from the service, never hard-coded. No tools: it cannot change anything.
- UI: `src/features/brain/AskBox.tsx`, `src/features/settings/AiCard.tsx` · Logic: `shared/ask.ts` (services, budgets, scopes, `linkAnswer`)
- Main: `services/ask.ts` (`askBrain`, `previewAsk`, `complete`, `asking`), `services/relevant.ts`, `services/credentials.ts`; handlers in `ipc/costs.ts`
- Tables: `settings` (`aiConnection` sealed, `aiModel`, `aiContext`, `aiScope`, `aiLine`) · IPC: `ask:` · Tests: `shared/ask.test.ts`, `services/ask.test.ts`, `services/relevant.test.ts`; e2e `ask.spec.ts`

### What goes with a question
The company in brief, always, and then only what the question is about (PLAN.md, part ten, phase 37). The whole company when the question says "everything" or "all my contacts", when *Ask again with the whole company* is pressed, or when Settings says every time.
- **The brief** (`briefOf`): the page titled "Company in brief" when there is one, else a few lines from the profile and the catalogue; with *At a glance* under it.
- **Who**: the contacts the question names - company, person or first name (`named`) - or, naming nobody, the ones nearest in meaning. A question about deals brings the contacts with one open; one about "who" or "contacts", the fifteen last spoken to.
- **What**: the dossier's parts and the brain's sections its words point at (`needsOf` in `shared/relevant.ts`); the pages it names, means, or that hold a word of it nobody else uses (`rareWords`, through the search index). A question about nothing in particular gets what is open. A follow-up that names nothing is read with the question before it.
- **Said before and after**: `ask:preview` works it out on this machine as the question is typed ("Sending: the company in brief, Oakridge, Money now - about 900 tokens"); the answer says what went. The AI is told when it has a part and not the whole.
- The size in Settings is now the most that is ever sent at once; a whole company over it is still cut to the contacts the question bears on (`wholeOf`).
- Logic: `shared/relevant.ts` · Main: `services/relevant.ts` (`relevantTo`, `briefOf`, `partsOf`) · Tests: `services/relevant.test.ts`

### AI mode on the line
The mark at the start of the quick line is a switch (phase 38). Not pressed, a line is read by the rules on this machine and nothing leaves it. Pressed, Enter sends the line to the AI that is connected, and what it says the line is becomes the reading - shown the same way, moved by the same chips, kept by the same Enter.
- **What goes**: the line, today's date, the brief cut to 600 characters, up to 24 names it might mean ("company | person") and page titles. Never a contact's details or history. A line that looks like a password is refused before anything is sent.
- **What comes back** (`aiLine`, `readingFromAi` in `shared/ailine.ts`) is checked against what Caulder holds: a contact it names that is not one is nobody; somebody "new" who is a contact already is that contact. A task brings its own title and day (`CaptureReading.task`).
- **One Enter or two**: when the AI's reading is what the rules had - the same place, contact and days (`sameReading`) - it is kept at once. When it differs, or asks something, it is shown first.
- **It may ask** one question in words ("Where is Anil from?"), answered in the row the line's questions use, and is read again with the answer. A person from nowhere is asked about whether or not the model thought to.
- **A question, or something to write** (`isForAi`), is answered under the line through `askBrain`, with what the question needs.
- **Done here whatever the mode**: going somewhere, opening somebody, a change to what is there, and the questions the line answers from the records.
- UI: `QuickAdd.tsx` (`readWithAi`, `toggleAi`, `enter`) · Main: `services/askline.ts` · IPC: `ask:line`, `ask:set-line` · Tests: `services/ask.test.ts`; e2e `ask.spec.ts`

### Two things at once
Overlapping blocks are said, never refused (`layOut` draws them side by side). `doubleBooked` (`shared/day.ts`) names each pair and when they meet; `Clashes` (`src/features/day/Clashes.tsx`) says it on Today, at the head of the Calendar's day and per day in the week. `clashingWith` says in the block form what a time being chosen would overlap. The grid's own marking of which block gives way is `clashesIn` in `shared/priority.ts`, a different thing.
- Tests: `shared/day.test.ts`; e2e `week.spec.ts`

### Chasing an unpaid invoice, and what is owed
A late invoice is chased from the row it is on - in Money and on Today (PLAN.md, part eight, phase 34).
- **The reminder** (`reminderFor` in `shared/chase.ts`, `src/features/money/ChaseForm.tsx`): the number, the amount, when it was due and how late, what has come in; a *second reminder* the second time. Read and changed in the box, then sent through `mail:send` like any email to a contact - so history, replies and do-not-contact are what they already are. With no sender, `outreach:email` opens the computer's mail app. No attachment.
- **Whether it was chased** is `Invoice.reminded`, read by `remindersFor` (`repositories/money.ts`) from emails sent to the contact with the invoice's number in the subject. Nothing stored. `chaseOffer` offers the first once it is late, and another seven days after the last.
- **What is owed, by age** (`owedByAge`, the `Owed` line in `MoneyScreen.tsx`): not yet due, up to thirty days late, over thirty.
- Tests: `repositories/chase.test.ts`; e2e `money.spec.ts`

### A retainer
An invoice that repeats: `invoices.repeats` (migration 54), chosen on the invoice form.
- `draftRepeats` (`repositories/money.ts`), called when Today and Money are read, makes the next one as a **draft** once the last has been sent and the month, quarter or year has come round - the same contact, deal, lines and notes - and moves `repeats` on to the draft. Nothing is drafted from a draft: one waiting at a time.
- Today lists drafts that repeat as *retainer invoices to look at and send* (`Today.drafted`). Nothing is ever sent by it.
- Ends when the newest is set to No, deleted or made void.
- Tests: `repositories/chase.test.ts`; e2e `money.spec.ts`

### How we work: the rules a company keeps
The section the playbooks are in, renamed (PLAN.md, part eleven). A rule - "we never discount retainers", "we invoice on the 1st", "no calls before 10" - is a remembered line on its subject's page: *Billing and payment*, *Pricing and discounts*, *Hours and replies*, *Clients*, *Suppliers and tools*, or *Other rules*.
- **No page until there is a rule for it.** `remember` starts a subject's page (template `rules`, section `playbooks`) the first time one is said. Any page added to the section by hand is a subject too.
- **The line** reads a rule as a memory and names its page before Enter (`remembered` in `shared/capture.ts`); a page the line names, or a fact about the company ("our GST number is…"), goes where it always did. What the company does as a matter of course is a rule whatever day is in it.
- **Replaced on a yes**: when a rule on the page is about the same thing (`alike` - the words, with the numbers left out), `remember` hands it back as `like`, and the line asks *Is it instead of …?* The older one is let go through `brain:forget-memory`, and is in the page's history.
- **Read where it is used**: `RulesAside` (`src/components/`) beside a new invoice and a new quote, from `brain:rules-on`. Says nothing when there are no rules on the subject.
- **Asked in words**: "what is our policy on refunds", "how do we handle late payers" are `recall` questions (`shared/questions.ts`).
- Logic: `shared/rules.ts` · Main: `services/howwework.ts`, `services/remember.ts` · IPC: `brain:rules-on` · Tests: `services/howwework.test.ts`; e2e `quickadd.spec.ts`
- **Not the same file** as `services/rules.ts`, which is the follow-up made when a deal moves.

### Sort this page
In a page's More menu when it holds three remembered lines or more. Each line that would be better kept elsewhere is offered a home, ticked, and moved by one press.
- By what this machine can check (`sortLines`): said as a rule → its subject's page; names a contact → that contact's *Keep in mind*, with its day; on the page twice → let go.
- With an AI connected, *Ask it about the others* (`proposeSort`): only the unplaced lines go, with the subjects and the contacts' names. A subject or a contact it makes up places nothing.
- Never to a page outside How we work by its title; one transaction for all the moves.
- UI: `src/features/brain/Sorting.tsx`, `PageView.tsx` · IPC: `brain:sort-plan`, `brain:sort-apply`, `ask:propose-sort` · Tests: `services/howwework.test.ts`, `services/ask.test.ts`; e2e `quickadd.spec.ts`
- *Loose ends* (on Memories) is the other half: it moves by meaning, with the model on this machine, to pages there already are.

### The brain's sections, and what is no longer offered
Fifteen sections in four groups (`BRAIN_GROUPS`, `group` on each section in `shared/brain.ts`): what we are, how we work, where we are going, what we have learned. *All sections* lists them so; the rail still shows only the ones that hold something.
- **Kinds of page no longer offered**: milestone, competitor, fundraise, cap table, experiment. They are still kinds - `templateOf` and `templateFits` know them - so a page a company has opens as before; a section's `templates` list is only what is offered.
- The *Policy* kind in Legal is called *Published policy*: the one on a website.

### What the AI proposes
Three drafts, and nothing written by the AI (phase 39): the company in brief, a page tidied, and what the contacts' history shows.
- **The brief card** on the Brain's first page shows what goes with every question. *Draft it* sends the brief as it stands, *At a glance*, what is sold, the Company, Plan, Products, Customers, How we work and Remembered sections and the last 40 history entries - no contact's details - and the draft is edited before it is kept as the page "Company in brief".
- **Tidy with the AI**, in a page's More menu, sends that page alone and shows it beside the page as it is (`Tidied`, the History's own comparison). Kept, it is a version like any other.
- **What does the history show?** reads the contacts with three history entries or more, up to 25, and offers each fact with the entries it came from; kept, it is a line under the contact's *Keep in mind*. A fact about a name that was not sent is dropped.
- What is drafted or tidied ends with a line saying so (`draftedBy`).
- UI: `src/features/brain/Proposals.tsx`, `PageView.tsx` · Logic: `shared/propose.ts` · Main: `services/propose.ts` · IPC: `ask:brief`, `ask:propose-brief`, `ask:propose-tidy`, `ask:propose-noticed` · Tests: `services/ask.test.ts`; e2e `ask.spec.ts`

### The dossier and Export for an AI
The company as four Markdown documents (read me, the company, customers and sales, running the company), numbers masked. Written to a folder, cut to what a question needs for Ask (`services/relevant.ts`), or included in Export everything. `pages` and `contacts` cut it to the ones named; the Remembered section - what the line was told to keep - is in the fourth document.
- UI: `src/features/brain/BrainShare.tsx` · Main: `services/dossier.ts`, `services/names.ts` · IPC: `brain:dossier`, `data:export-all` · Tests: `services/dossier.test.ts`
- Phase 22: *What is it for?* leads the read-me and, with understanding on, lists what to read first (`readFirstFor`).

### Brain export
A Markdown folder of pages (`brain:export`). The brain file and live sharing between two founders were taken out on 10 October 2026, to be made again later and differently; see "Removed on purpose".
- UI: `BrainShare.tsx` · Main: `services/brain-export.ts` · `repositories/me.ts` and `ThisIsMeCard.tsx` keep the name Today greets (`me:`).

### Secrets in pages
PAN, TAN and account numbers sealed by the OS inside the fields JSON; the window only ever gets the last four.
- Main: `services/secrets.ts` · Logic: `cleanSecret`, `maskSecret` in `shared/brain.ts` · IPC: `brain:reveal`, `brain:copy-secret`
- Kept out of the search index, masked in the dossier and data room, left behind by sync.

### Data room and handbook
Chosen sections, documents and tables as zipped HTML with an index, or a printed PDF.
- UI: `src/features/dataroom/HandOverCard.tsx` · Logic: `shared/dataroom.ts` · Main: `services/dataroom.ts`, `page-html.ts`, `print.ts`, `zip.ts`
- IPC: `room:` · Tests: `services/dataroom.test.ts`, `zip.test.ts`; e2e `dataroom.spec.ts`

---

## The quick line

Classification is done **in the window**, by pure functions in `shared/`.
Main never classifies; it supplies context and carries out what the window
decided. Each decision is a rule plus a `because` sentence, and chips let the
person change it.

It was rewritten on 10 October 2026 for a company's line: **six kinds, not
ten**. The journal, private lines, time on a hobby and a report on the day
went with the personal half, and with them most of what the line used to get
wrong - one personal kind taken for another.

### The smart line on Today
Reads any line, shows what it will do and where it goes, and on Enter writes it. That is all the card does: asking your AI and copying context each live in the Brain, and only there.
- A second opinion from the model on this machine (phase 20): a reading marked `soft` (the fallbacks at the end of `readCapture`) is sent through `understand:read` after a 250 ms pause; `shared/opinion.ts` (`secondOpinion`) decides. Order: the chip pressed, a lesson, the model, the rules. Says why in `[data-opinion]`, and `[data-learnt]` when a lesson is why.
- UI: `src/features/today/QuickAdd.tsx` (`keep()` switches on the kind), `LinePanels.tsx`
- Order inside `QuickAdd.tsx`: context loaded on focus (contacts, and the brain's page titles through `brain:titles`), `cleanPaste`, `followOn`, `parseQuick`, `readCapture`, then `readQuestion` and `readEdit` (which win), then `voteKind` from lessons, then the chip the person pressed.
- Writes: tasks, blocks, reminders, contact history, new contacts, a contact's details, memories and ideas on brain pages, running costs, spend, notes, navigation.
- Tests: `shared/capture.test.ts`; e2e `hub.spec.ts`, `quickadd.spec.ts`, `today.spec.ts`

### The task parser
One line to a task: title, day, time, length, repeat, priority, kind (call, email, follow-up, meeting, todo), note, follow-up task; asks one question only where a guess is a coin toss.
- Logic: `shared/quickadd.ts` (`parseQuick`, `kindOf`; `VOCABULARY` is only the words a slip is mended towards), `shared/slips.ts` (typos), `shared/slang.ts` (`expand`), `shared/rephrase.ts`, `shared/hinglish.ts` (only through `rephrase`)
- Main: `services/quickadd.ts` (task, block and follow-up in one transaction) · IPC: `tasks:quick`
- Tests: `shared/quickadd.test.ts`, `quickadd.texted.test.ts`, `quickadd.sentences.test.ts`, `slips.test.ts`, `slang.test.ts`, `hinglish.test.ts`

### What kind a line is
`readCapture` (`shared/capture.ts`) returns one of `task`, `contact`, `memory`, `command`, `idea`, `note`, checking in a fixed order: a prefix (`task:`, `note:`, `idea:`, `remember:`); something to keep safe (a note, with a warning); something asked for; a contact named (unless the line is an idea said outright, which is one whoever it names); said to be remembered, or something of the company's and what it is; an idea; an instruction; then the guesses - a rule the company keeps, an opinion (a note), how the company runs (how often, at what rate, in what hours), a when ahead that is not looked back on, a page named, a fact said plainly, and finally `note`.
- **A word that is a thing as well as an order** ("quote", "email", "test") is read by the word after it: `ordered()` and `NOT_AN_ORDER`. An order given about something ("get the nda signed") is a task whatever else the line holds: `ORDERED`.
- **A day gone by, or a line that looks back** ("took", "doubled", "was incorporated in 2022"), is never a task by its day alone: `gone` in `whenIn`, `LOOKED_BACK`, `WAS`.
- A command is `readCommand` (`shared/commands.ts`: go somewhere, money said to be spent, add a contact - asked for outright, after the telling, or by an address - a running cost), a contact's detail set (a phone or an email, and nothing else yet), somebody new told about (`shared/newperson.ts`), or a contact opened to reach now.
- **A sum that was not said to be spent** ("swiggy 320 lunch") is offered as a chip, never assumed: `spendIn` in `shared/commands.ts`, carried on the reading as `spend`.
- **A password or a card number** is never filed as a memory: `shared/secretline.ts`, said under the line before anything is kept.
- Contacts are found by `namedContact`: whole words of the name, a person's first name from three letters unless it is also a word (`NAME_IS_A_WORD`), then a one-contact typo match. One word of a company's name said as a thing ("the studio", for Studio Palma) is not the contact: `saidAsAThing`. `shared/people.ts` is **not** involved.
- Tests: `shared/capture.test.ts`

### What a line about somebody leaves to do
A line that goes on a contact's history, or makes a new contact, can leave a next step: kept with it as their task, on the day it says, with a notification that morning.
- Three forms only (`nextStepIn` in `shared/nextstep.ts`): **they asked** ("asked me to reach out next week", "wants the invoice by the 5th"), **I promised** ("told Jonas I'd send the deck by friday"), **they promised** ("said she'll get back in a few days" - a check-in with them, in three days when no day was said). A fact with a date in it owes nothing.
- **What happened is kept as what it was** (`loggedAs`): a call, a meeting, a message on LinkedIn, WhatsApp or Instagram where the line names the place, or "They answered" when they wrote back. `shared/reached.ts` reads those kinds.
- Carried on the reading as `then` (a known contact) or on the `contact` command (somebody new, `shared/newperson.ts`); written by `keep()` in `QuickAdd.tsx` through the same `activities:log` and `tasks:quick` everything else uses. No new table, no new channel.
- Tests: `shared/nextstep.test.ts`; e2e `quickadd.spec.ts`

### When the line is not sure, it asks
One question at a time, in the row the task line's questions use (`doubt` in `QuickAdd.tsx`).
- **Where somebody is from** (`readStranger` in `shared/newperson.ts`): a line that names somebody Caulder does not know, and leaves a next step for them - "Sumanth asked me to reach out next week" - asks *Where is Sumanth from?* The answer is typed into the question's row (Enter on the line goes to it) and read back as `settled.from`: a place makes them a contact there, with what happened and their task; an empty answer, or *Only a task*, keeps the task alone, titled the way a task is (`CaptureReading.task`). Never asked of "mum", "the client" or a role, or of a line that owes nothing.
- **Who** (`findContact`, `doubtAbout` in `shared/capture.ts`): a contact found only by a slip at their name, or a name two contacts answer to. Blocks: nothing is kept until it is answered, and `readCapture` is run again with the answer (`settled.contact`, a contact's id or null for nobody).
- **A name one letter out** is asked about only in names of six letters or more (`nearName`) - looser than `shared/slips.ts`, which refuses a wrong letter, and allowed only because it asks and never assumes. A short first name with a letter added or dropped is asked about too, straight after a word for reaching somebody - "call priyaa" (part twelve, phase 47).
- **An answer is kept** (part twelve, phase 48): the word the doubt was about (`Doubt.word`) and the contact chosen go to `line_names` once the line is kept, and `findContact` reads them before anything else - "which Priya?" is not asked twice. Listed in Settings › Tune with Forget. `repositories/linenames.ts`; IPC `tune:names`, `tune:name-keep`, `tune:name-forget`.
- **When**, for a next step with no day said: tomorrow, today, in three days, next week. Does not block; the day shown stands.
- **A when said loosely** is a day (`shared/quickadd.ts`): early, mid and the end of this or next week; "in a few days"; early, mid, late and the end of a month; "sometime in november"; "after the 20th".

### How well the line reads, measured
`electron/main/understand/lines.eval.test.ts` reads three sets of 96 lines, each written by somebody who was not shown the rules, and fails if the line reads fewer right than the day it was measured. `blind-2026-10-a.json` and `-b.json` have been looked at; `blind-2026-10-c.json` is held out. `CAULDER_EVAL=1 npx vitest run electron/main/understand/lines.eval.test.ts` prints the totals by kind, and the misses of the sets that have been looked at - a held-out set's misses are counted by kind and never printed.
- **A set is never edited to make a line pass, and the rules are never tuned against a held-out set.** Once its misses are read it has been looked at: mark it `heldOut: false`, and have a new one written before the next number is believed. The numbers are in STATUS.md.
- **A rule is changed for a class of line, with a test of its own lines** - ones written for the test, and the near ones the rule must leave alone - in `shared/capture.test.ts` or `shared/commands.test.ts`. A set's own lines are not copied into those tests.
- A held-out set is measured only on lines no looked-at set already has (the third repeats three of the first, so it is counted on 93).
- **Every field, not only the kind** (part twelve, phase 45): `shared/measured/fields.test.ts` reads `lines-2026-10-a.json` (84 lines, looked at) and `lines-2026-10-b.json` (60, held out, for another founder) with the contacts, open tasks and eight weeks of blocks the app would have, in the order the line runs its readers, and scores day, time, length, repeat, contact, amount, what an edit touches and what a question asks. Same two rules; `CAULDER_EVAL=1` prints the totals.

### Your day settles the time
Part twelve, phase 46. `yourDay` (`shared/habitual.ts`) reads the shape of the person's working day from their own blocks over eight weeks - when it starts, ends and lunch is over - and goes into `parseQuick` as `context.day`, with the blocks themselves as `context.past`. An hour said bare from 7 to 11 is settled before it is asked: by what this very thing has been before (`sideBefore`: "call mum at 8" has been at 8pm), else by which side falls inside the day (`sideOf`), and the line says so. "First thing" is when the day starts, "after lunch" when lunch is over. A call or meeting with no length takes the length its kind has usually had (`usualLength`, through `usualOf`). Nothing is stored for any of it: it is counted from the blocks.
- Tests: `shared/yourday.test.ts`

### A task that comes back
Part twelve, phase 47. "Pay rent on the 1st of every month", "renew the domain every year on 3 may", "review metrics every other monday": `every` on the parsed task, `tasks.repeats` (`fortnightly`, `monthly`, `yearly`). Ticking one makes the next (`comeBack` in `repositories/tasks.ts`, the day from `nextDue` in `shared/repeat.ts`), at the same hour when it had one, and never a second open one for the same contact. It keeps the day of the month it was set on (`tasks.repeat_day`, migration 59), so the 31st comes back on the 31st after February. Undoing the tick takes the next one back; a tick in Google Tasks makes it too. Shown on the row and changed in the task form (*Comes back*). Every other week **with** an hour is a block series instead, `every: 2` on the repeat (`block_series.every_weeks`).
- Tests: `shared/repeat.test.ts`, `repositories/tasks.test.ts`, `shared/quickadd.test.ts`

### What stays true about a contact
Part twelve, phase 49. A line that starts with a contact and goes on with what stays true - "Maya prefers WhatsApp", "Sam's address is…", "Harbour GST no…", "Jonas is on leave till the 20th", "Kemi's birthday is 9 March" - is `logged: "fact"` (`factAbout` in `shared/capture.ts`), kept on the contact in `lead_facts` and shown on their page as *Known about them* (`src/features/leads/KnownAbout.tsx`), not on their history. A fact that ends keeps its day, and a task planned for them before it is warned about under the line. A birthday is a fact and a task that comes back every year. The line's questions read facts first (`factsAbout`). A line opened by something done - "called priya - no answer, try again thursday" - is the call and its next step (`OPENS_DONE`, and the try-again in `nextStepIn`). Money in from a contact - "got 2400 from harbour", "harbour paid" - marks their open invoice paid, or records a part (`paidFrom` in `repositories/money.ts`), dated by the company's day. Never when the line says it has not come ("hasn't paid", "is late", "still pending": `NOT_PAID`), and always against the contact named as paying (`payerPart`). A number or an address is set as a contact's own only when the line does not say whose else it is (`theirOwn`). A birthday said again moves the yearly task.
- Main: `repositories/facts.ts`, `money.ts` · IPC: `facts:`, `money:paid-from` · Tests: `shared/capture.test.ts`, `repositories/facts.test.ts`

### Questions, edits and the rest
Answer a question from what is stored (the day, free hours, a contact, money, memories, "did I...", and - part twelve, phase 50 - when you last spoke to somebody, what somebody owes, the next free hour, what is open for somebody); move, cancel, rename or tick off a task, a task named by its hour as well as its words ("move my 3pm to 4", "done call priya"); carry "him" or "also" over from the last line; split one line into several; suggest the usual hour; tidy a paste.
- Logic: `shared/questions.ts`, `edits.ts`, `followon.ts`, `together.ts`, `habitual.ts`, `pasteline.ts`, `lines.ts` (there is **no** `shared/smartline.ts`; `smartline.test.ts` tests these)
- Main: `services/lines.ts` (`lineContext`, `answerQuestion`, `moveTask`, `cancelTask`, `restoreTask`, `renameTask`). Answers never leave the machine; memories are answered by `recall`, from the company's.
- IPC: `lines:` · Tests: `shared/smartline.test.ts`, `services/lines.test.ts`

### How the line learns
- **Lessons**: a chip pressed before Enter stores the line's words with that choice; `voteKind` reads later lines the same way (soft kinds only: `LESSON_KINDS` - task, idea, note, memory), and the line says which line it learnt from (`learntFrom`).
- **Tune**: typo fixes asked about in Settings, one at a time.
- Logic: `shared/lessons.ts`, `shared/tune.ts` · Main: `repositories/lessons.ts`, `tune.ts` · UI: `LessonsCard.tsx`, `TuneCard.tsx`
- Tables: `line_lessons`, `line_guesses` · IPC: `lessons:`, `tune:`

### The quick window from anywhere
An always-on-top window from the tray or `Ctrl+Q`. It is `QuickAdd` without `smart`: tasks and notes only.
- UI: `src/features/notes/Capture.tsx` · Main: `electron/main/capture.ts`, `popup.ts`, `tray.ts` · IPC: `capture:`, `tray:` · Tests: `electron/main/popup.test.ts`; e2e `tray.spec.ts`

### Adding a kind to the line
Keep one parser. In this order:
0. First ask whether it is a kind at all. Six were chosen so that each is told apart by something Caulder can check; a seventh that is told apart by how a sentence sounds will cost the other six.
1. A pure reader `shared/<name>.ts` with its test, taking the line as `expand()` returns it and returning a result or null (pattern: `readCommand`, `readNewPerson`, `spendIn`). It does not call `parseQuick` or `namedContact`; `readCapture` passes in what it found.
2. `shared/capture.ts`: add to `CaptureKind`, add fields to `CaptureReading`, call the reader beside the others, add it to `options`, and place its `return reading(...)` at the right point in the order - after the prefix, the warning and what was asked for, before the instruction and the guesses.
3. Tests: lines it must claim, and lines it must leave to kinds before it, in `shared/capture.test.ts`.
4. `shared/lessons.ts`: add to `LESSON_KINDS` only if it is a guess a correction may teach; never for kinds that are found (contact, command).
5. Only if it writes somewhere new: migration, repository or service, `shared/ipc.ts`, handler, preload. Reuse `brain:remember`, `activities:log`, `notes:create` and the like when they fit.
6. `src/features/today/QuickAdd.tsx`: a label in `GOES_TO` (the compiler insists), a branch in `keep()`, a preview line, a gate in `ready` if it needs more input.
7. `LinePanels.tsx` only if it needs a panel of its own.
8. `e2e/hub.spec.ts`: type it, check the chip and preview, press Enter, check where it landed.

A new *task* kind (call, email, meeting) is not a new capture kind: it belongs in `kindOf` in `shared/quickadd.ts`.

---

## Your time

### The calendar's own workspace
`services/yourhome.ts` makes one workspace of the personal kind (at start-up and when a company is made) for what the calendar holds that is not a company's. Never in the switcher, never the active workspace. It holds no pages since migration 49.
- Tests: `services/yourhome.test.ts`

### Today
The home screen, in two columns that each answer one question. **What do I do**: the line, then what is late and due, unpaid money, renewals, deadlines and what is coming. **Who do I talk to**: *Reach out*, replies, going quiet, then notes. Rebuilt on every change, never patched.
- **Reach out** (`reachOf` in `services/today.ts`, `Today.reach`): how many people were reached today and in the last seven days - people, not messages, from the history - and the prospects nobody has reached at all, oldest first, five named and the rest counted, each with the ways there are to reach them. Out of it: anybody reached, with a task, with a message scheduled, closed, not a prospect, or marked do not contact. And one sentence on what is waiting on them (`Reach.sent`, `saySent`): "6 written to this week: 2 answered, 4 waiting - the oldest 5 days."
- Going quiet after N days (3-90, default 14), set in Settings > Reminders: `coldAfterDaysInput`, `readColdAfterDays`, `setColdAfterDays` in `services/today.ts`; IPC `today:cold-after-days`, `today:set-cold-after-days`; e2e `workbench.spec.ts`.
- **Nobody is named twice**: somebody under *Reach out* is left out of *Going quiet* (`quiet` in `TodayScreen.tsx`). A prospect nobody has written to has not gone quiet; they are still waiting.
- UI: `src/features/today/` (`TodayScreen`, `NowLine`, `TaskRow`, `TaskForm`, `grouping.ts`, `Hello`, `said.ts`) · Main: `services/today.ts`
- IPC: `today:` · Tests: `services/today.test.ts`, `src/features/today/grouping.test.ts`; e2e `today.spec.ts`, `hub.spec.ts`

### Calendar (the day)
A day and a week grid of blocks: repeating series, outcomes, reminders before a block. A block's kind is one of Deep work, Meeting, Call, Admin, Away (`BLOCK_KINDS`), each with its own colour, or whatever was typed.
- A repeating block's form offers *Save every one from here* (`blocks:updateSeries`): name, time, length and kind from that day on; past ones untouched, other fields only for the one opened.
- **A usual week** (`UsualWeek.tsx`, the button on the Calendar): the hours that are the same every week, entered as rows and put on the calendar as one repeat each, until a day. It was the Timetable; there are no terms.
- UI: `src/features/day/` · Logic: `shared/day.ts`, `repeat.ts`, `priority.ts`, `remind.ts` · Main: `services/day.ts`, `repositories/blocks.ts`
- Tables: `blocks`, `block_series` · IPC: `day:`, `week:`, `blocks:` · Tests: `services/day.test.ts`, `shared/day.test.ts`, `repeat.test.ts`, `priority.test.ts`; e2e `week.spec.ts`

### The week
At the head of the Calendar's week (phase 35): what happened in the week shown - tasks done, people reached and who answered, deals moved (a deal that closed counts) and won or lost, money invoiced and paid, hours planned and kept unless marked skipped - what has slipped as of today (this week only: overdue, going quiet, unpaid and late), and **three things for the week after**, typed there. Read from what is kept; nothing is filled in for it. The three are at the head of Today until each is ticked or the week ends, and in Monday's morning brief. A week still to come shows only its own three.
- UI: `src/features/day/WeekReview.tsx`, `src/features/today/WeekThree.tsx` · Logic: `shared/week.ts` · Main: `services/week.ts` (`weekReview`, `setWeekThings`, `markWeekThing`, `thisWeeksThings`), `sayBrief` in `shared/nudges.ts`
- Tables: `week_things` · IPC: `week:review`, `week:things`, `week:things-set`, `week:thing-done` · Tests: `services/week.test.ts`, `shared/nudges.test.ts`; e2e `week.spec.ts`

### Tasks
One list per workspace: day, time, priority, contact; completed, snoozed, reopened. *Due today* is headed by kind (`groupDue`), never by area: a task has none.
- Edited from the pencil on a row, on Today and on a contact's next steps: `TaskForm` given a `task` opens in the row's place and saves the whole task through `tasks:update`.
- Main: `repositories/tasks.ts` · Tables: `tasks` · IPC: `tasks:` · Touches: Today, contacts, pages (steps), Google Tasks.

### Notes
Quick notes on Today, beside the work, also from the quick window. There is no Notes screen.
- UI: `src/features/notes/NotesScreen.tsx` (inside Today), `Capture.tsx` · Main: `repositories/notes.ts` · Tables: `notes` · IPC: `notes:`, `capture:`

### Hello
One plain line by the hour - "Good evening, Adi." - from the name in "This is me", and under it the day in numbers ("2 things to do today, and 1 late", or "Nothing due today.").
- UI: `src/features/today/Hello.tsx` · Logic: `greet` in `shared/voice.ts` · Note: `hello` in `services/gsync.ts` is the script handshake, not this.
- `shared/voice.ts` also holds the examples the quick window shows in its empty line (`taskExample`, remembered by `said.ts`); `voice.test.ts` reads every one through `parseQuick`.

---

## Shell and the machine

### Settings
Four groups: **Workspace** (This is me, companies, your own fields, stages, templates), **Planning** (Tune, what the line has learnt, reminders), **Connections** (Google, contacts in a Google Sheet, other mail accounts, AI), **This computer** (appearance, updates, quick add from anywhere, desk widget, understanding, your data).
- UI: `src/features/settings/` · Main: `repositories/settings.ts` plus each card's own service

### Notifications
Three services: `notify.ts` (daily digest, never before 9; off until switched on), `remind.ts` (before a block: **on, ten minutes ahead**, unless switched off), `nudges.ts` (reminders asked for, always; the morning brief **on at nine** unless switched off). Both went on by default on 23 October 2026, when a call due the day before went by without a word. A click sends `nav:go`.
- Tables: `reminders` · IPC: `notify:`, `nudges:` · Tests: `shared/nudges.test.ts`, `remind.test.ts`, `services/nudges.test.ts`

### Tray
Tray icon, a quick window beside it, right-click menu, keep in tray on close. The menu carries *Open when Windows starts* as a tick (*Startup apps…* for a Store copy), built again when it changes from there or from Settings (`refreshTray`).
- Main: `electron/main/tray.ts`, `popup.ts`, `capture.ts`, `identity.ts` · e2e `tray.spec.ts`

### Opening when Windows starts
On from the first launch of an installed copy (the owner's decision, 15 October 2026; `startupSet` remembers it was decided) - never from the build folder (`win-unpacked`), and an installed copy points a stale entry at itself - and a tick on the tray icon's menu and in Settings › This computer › *Windows*, the first card there, beside *Keep Caulder in the tray* (25 October 2026: it had been inside the quick key's card). The installer's copy registers a login item with `--at-login` and, kept in the tray, opens there with no window; a notification or the tray makes the window. A Store copy cannot register itself: the package declares a startup task (`resources/appx-startup.xml`, through `customExtensionsPath`), it opens with its window, and Settings sends you to Windows' Startup apps to change it.
- Main: `electron/main/startup.ts` · IPC: `app:startup`, `app:set-startup`, `app:startup-apps` · UI: `SettingsScreen.tsx`

### Desk widget
A pill on the desktop naming the one thing worth a glance, with the mark, and a panel when the pointer rests on it for half a second (not when it passes). Three levels, one pinned behind the wallpaper with koffi.
- **What it says** is decided in `shared/widget.ts` and worded in `Widget.tsx`. The pill (`deskGlance`) names the thing, soonest first: a block starting within ten minutes, a reply, the first late task, what is on, what is next, the first task due - and "+2" for the rest. The panel: the day's date, what is left of the day with what is on now marked (`deskHours`), the late and due tasks by name with a tick each (`deskTasks`, four at most), then who replied, invoices unpaid and late, prospects waiting, people reached (`deskFacts`).
- **Clicked and dragged** (17 October 2026): a press on the pill or the panel's head opens Caulder on Today; a press that moves drags it, main following the cursor (`dragWidget`), so there is no drag region swallowing clicks. A task is ticked off from its row. At the desktop level Windows takes the clicks, so the ticks are not drawn there.
- UI: `src/features/widget/Widget.tsx`, `DeskCard.tsx` · Logic: `shared/widget.ts` · Main: `electron/main/widget.ts`, `desk.ts`, `wallpaper.ts` · IPC: `widget:` · Tests: `desk.test.ts`, `shared/widget.test.ts`; e2e `widget.spec.ts`

### Light in the background, quick in front
Measured on 25 October 2026 and kept to (STATUS.md has the numbers):
- **Drawn without the graphics card** (`app.disableHardwareAcceleration`, `electron/main/index.ts`; `--gpu` puts it back): about 180 MB in all rather than 260, and every screen settles as fast or faster.
- **The model is let go after three minutes with nothing to read** (`understand/host.ts`), and loaded again when there is; only falling over counts towards its three tries.
- **The desk widget looks for the pointer a third as often while it is far away** (`widget.ts`, `FAR_TICK`); the reading loop looks for work once a minute when idle.
- **Screens are read when first wanted** (`lazy` in `src/app/App.tsx`), then all of them in the background once Today has drawn (`warmScreens`): the window's first script is 325 kB rather than 1.2 MB.
- **A screen's arrival is quicker**: the page rises in `--dur-fast`, and sections arrive 25 ms apart, at most five (`motion.css`).

### Backups, restore and export
A backup on every launch (ten kept), on demand, a mirror folder, a Drive copy; restore checks the file and can be undone; export everything.
- The mirror is asked for on the first run (phase 24): the setup guide's first step (`onboarding/SafeCopy.tsx`) and Today's *Finish setting up* line. Folders OneDrive, Dropbox or Google Drive keep in step are found by `db/synced.ts` and offered by name (`data:synced`, `data:use-synced`, the window naming one, main working out the path).
- The copies on Drive are listed on the Data card when asked (`google.driveBackups`), never on draw. No link to open one (the script sends none); restoring one means downloading it into the backups folder, where Restore lists it.
- UI: `src/features/settings/DataSafety.tsx` · Main: `electron/main/db/backup.ts`, `services/export.ts`, `services/gmore.ts` · IPC: `data:` · Tests: `db/backup.test.ts`, `services/export.test.ts`

### Updates and the Microsoft Store
electron-updater from GitHub Releases; a Store copy never looks. What goes into Partner Center beside the package is `reference/store-listing.md`.
- UI: `UpdatesCard.tsx` · Main: `electron/main/updates.ts`, `store-home.ts` · Packaging: `electron-builder.yml` (NSIS, and the Store's .msix through the appx target), `scripts/package-store.mjs`, `scripts/smoke-packaged.mjs`
- Branding: `branding/` (the mark, icons, lockup, the Store's logos and art, link previews), written by `scripts/branding.py` from `assets/caulderLogo.png`; the app's own copies are `scripts/logo.py`'s

### Free, and who made it (part six)
About Caulder in Settings (the ways to help, Privacy, Licences), and the ask for support at the foot of Today: a month after first open, again three months after *Not now*, never after supporting or *Don't ask again*, and not while an invoice is overdue.
- UI: `src/features/settings/AboutCard.tsx`, `src/features/today/SupportAsk.tsx` · Logic: `shared/support.ts` (the ways to help in `SUPPORT`; one left empty is not shown) · Main: `services/support.ts`, `electron/main/licences.ts`
- Setting: `supportAsk` (a day, or `never`) · IPC: `app:support`, `app:support-answer`, `app:licences` · Tests: `shared/support.test.ts`, `services/support.test.ts`; e2e `support.spec.ts`
- Licences: `bundledPackages` in `electron.vite.config.ts` lists what each build bundles; `scripts/notices.mjs` (run by `npm run build`) adds the runtime dependencies and the model (`resources/licences/`) and writes `out/notices/third-party-notices.txt`, carried as `notices` beside the executable; `smoke:packaged` checks it ships.
- Privacy: `docs/privacy.md`, for GitHub Pages and the Store's privacy URL. Change it in the same commit as anything that sends something new.

### Logs and problem reports
- Main: `electron/main/log.ts`, `problem.ts` · UI: `ErrorBoundary.tsx`, `DataSafety.tsx` · IPC: `app:`

### Money and dates by region
Formatted the way they are where the company is, in English: `localeFor(country)` (`shared/countries.ts`) gives `en-IN`, `en-US`...; the workspace calls `setRegion` before anything draws, and every formatter in `src/lib/format.ts` (`formatValue`, `formatDay`, `numberText`, `dateFormatter`) reads it. Invoices, the data room, the dossier and the line's money answers take the same locale in main. A stored day is formatted with `timeZone: "UTC"`.
- A screen that builds its own Intl formatter or calls `toLocaleString()` is the parallel thing not to write: use `numberText` or `dateFormatter`.
- Tests: `src/lib/format.test.ts`

### Theme
Light, dark or system before first paint; an accent per company; colour only in `tokens.css`. See `design-language.md`.
- UI: `src/lib/theme.ts`, `src/theme-boot.ts`, `src/styles/`

### Background jobs

| Job | Where | When |
| --- | --- | --- |
| Google Calendar and Tasks | `services/scheduler.ts` | Every 10 min when switched on; 25 s after a local change; backs off on failure |
| Gmail watch | `scheduler.ts` | Every 10 min while mail is in play |
| Other accounts' scheduled mail | `scheduler.ts` | Every minute |
| Contacts as a Google Sheet | `scheduler.ts` | 40 s after start, then every 10 min, for each company linked to one |
| Daily digest | `services/notify.ts` | 5 min tick |
| Before a block | `services/remind.ts` | 30 s tick |
| Nudges | `services/nudges.ts` | 30 s tick |
| Updates | `electron/main/updates.ts` | 30 s after start, then every 6 h; never in a Store copy |
| Backup | `electron/main/db/backup.ts` | Once at launch |
| Widget hover | `electron/main/widget.ts` | 180 ms |
| Understanding | `services/understand.ts` | 20 s after start; then every 1.5 s while the queue has rows, every 30 s when it has none; only when on and the model is here |

---

## Removed on purpose

Do not rebuild these without a new decision in PLAN.md.

| Feature | Why it went |
| --- | --- |
| Focus (site blocker, foreground poll) | A blocker inside a CRM, Windows-only, walkable. `foreground.ts` went with Ember on 10 October 2026. |
| Review | A habit tracker inside a CRM. (Habits came back later as one card, not a review.) |
| Forecast screen | Two closed deals cannot carry a curve. Deals shows one line of totals. |
| Rule builder | One rule everyone wants: the built-in follow-up. |
| Saved views | Search plus a stage filter. |
| Email queue, sequences, the CSV bridge | Sending goes through the person's own script; a sequence is a follow-up task. |
| A personal mode or second workspace in the switcher | Your things live in the home workspace, which is a place, not a mode. |
| A `team` workspace kind | Needs sync, accounts and conflict resolution. |
| A Notes screen | Notes sit at the foot of Today. |
| Marketing verdicts | Spend is a ledger with an optional label; a return is a sum, not a judgement. |
| **The personal half** (10 October 2026): the journal with its passcode, private lines and Looking back; Life - studies, hobbies, the reading shelf, your year; goals and theme days; habits; the vision board; Pulse; your level, XP and achievements; personal memories and the *You* document for an AI | The owner's decision: Caulder is the complete app for a one-person company, and nothing else's. A third of the code was a second product. Migration 49 dropped its tables and deleted its pages. |
| The line's personal kinds: journal, private, hobby, done | With the personal half. Ten kinds read about half of unseen lines rightly; most misses were one personal kind taken for another. |
| Founder sharing: the shared brain, the brain file, invitations | To be made again later and differently. The script's invitation door went with it. |
| **Ember** (10 October 2026): the flame on the quick line and everything she did - moods, pastimes, tricks, dances, costumes and her closet, her book, her door, being picked up and thrown, her temper and the fire, her sounds and catchphrases, growing on the work (levels, warmth, marshmallows, presents), and her window on the taskbar, walking or as a dot | The owner's decision: professional and minimal. About 14,000 lines. The line's mode is said by its switches' pressed state, their titles and the placeholder (`shared/linemode.ts`). |
| Jokes, puns and quotations on Today, sixty ways of saying hello, and quips on a clear day | With Ember. Today says good morning and the day in numbers. |
| The flame colours of the line's modes (`--flame-*`) | With Ember. |
| **People and hiring** (11 October 2026): the team with pay, equity and vesting, roles being hired for, candidates and their stages, onboarding as tasks; a person as a kind of link, a dot on the Map, a search result and a source of deadlines; "People and equity" in the data room | The owner's decision: a one-person company has no team. To come back, if it does, as collaborators. `people` and `openings` are left in place and unread (migration 52), because `tasks.person_id` refers to them; Export everything still writes them out. An item `@`-named in a page's steps keeps the name in the task's words. |
| Asking the AI and copying context from Today's line (11 October 2026) | Each was in two places. Both stay on the Brain's first page; the line files what is typed and does nothing else. The line's own questions - "what is on tomorrow" - are answered as before, from what is stored. |
| The campaign a contact or a spend came from (11 October 2026) | Nothing could set one since migration 18. The columns stay; `source` on a contact says where they came from. |
| **A task's area** - College, Company, Personal, Health (11 October 2026, phase 32): the chip on the line's reading and `#tags`, the Area field on a task, *Due today* headed by area, **Your words** in Settings, the names Tune asked about, lessons about an area, the model's opinion of one | Four answers to a question nobody running a company is asked. `tasks.area`, `area_words`, `line_lessons.area` and the `name` rows of `line_guesses` are left in place and unread. To tell work apart, a task has a kind and a contact. |
| **The Timetable and its terms** (phase 32): a named term built from a week of classes, "until the end of term" on the line | It is *A usual week* on the Calendar: the same editor of repeating blocks, until a day, with nothing to name. `terms` is left in place and unread. |
| **Class, Studying, Break and Personal** as kinds of block (phase 32) | A working day's are Deep work, Meeting, Call, Admin and Away; migration 53 made Away of the four. Away is anything that is not work, without saying what. |
| **Alt phone, Location and PIN** on a contact's form (phase 32) | They came from the first customer's spreadsheet. Kept, imported and shown where a contact has them; the form has Role beside the contact person instead. |
| Market, Make, and money from shops online (part six, phases 26 to 28) | Never built. More breadth, when outreach and the week were the thin parts. |

Came back after being removed: the **desk widget** and its wallpaper level
(0.4.5, asked for by name) and a one-time **Today tour** (`src/components/Tour.tsx`).

Tables created by early migrations and dropped later - `focus_sessions`,
`focus_blocklist`, `rules`, `saved_views`, `sequences`, `sequence_steps`,
`enrollments`, `sync_batches`, `campaign_spend` - are history, not features.
