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
   task, habit, link - most of what a new request asks for is an extension of
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
| Take a line of text from the person | The quick line: `readCapture` (`shared/capture.ts`) and `parseQuick` (`shared/quickadd.ts`). A new kind follows the recipe under "Adding a kind to the line". | A second parser, a second input box, a reader called from `QuickAdd.tsx` beside `readCapture`. |
| Find things by their words | The FTS5 index `brain_search` + `search_map`, queried by `searchEverything` (`repositories/search.ts`). Kept by triggers, so writers never touch it. | `LIKE` scans in a service. Editing migration 20's trigger SQL (frozen) - a new source is a new migration that drops and recreates the triggers. |
| Find things by what they mean | `nearestTo` or, for the line, `examplesFor` + `shared/opinion.ts` (`services/understand.ts`) over the vectors the queue keeps (`repositories/vectors.ts`, migration 46). Arithmetic is `shared/understand.ts`; the model is asked only through `understand/host.ts`. | A second model, a second vector store, or calling onnxruntime anywhere but `understand/embed.ts`. Reading the journal or private lines. |
| Record that something happened with a contact | `writeActivity` (`repositories/leads.ts`) - the append-only history. | A new log table. Editing a history entry (a correction is a new entry). |
| Link two things | A `[[Label|kind:id]]` token in page text (`shared/links.ts`). `brain_links` is rebuilt from the text on every save. Kinds: `page`, `contact`, `product`, `person`, `document`. | Writing `brain_links` directly. |
| Put a page under another | A first line `Part of [[Parent|page:id]]` (`services/remember.ts`), walked by `underOf` / `trailsOf` (`shared/memories.ts`). | A parent column. |
| Remember a fact | `remember()` (`services/remember.ts`): a dated line `- **fact** · said _(YYYY-MM-DD)_` on a page. **Memories are not a table**; they are read back out of page text by `shared/memories.ts`. A fact about a contact's life goes on a People page that links to the contact (`about` on the remember input); what a contact *likes* stays on their history. | A `memories` table beside the pages. |
| Keep personal things apart from the company | The home workspace (`companies.kind = 'personal'`, `services/yourhome.ts`, `homeCompanyId`). Personal sections: `PERSONAL_SQL` / `isPersonalSection` in `shared/brain.ts`. | A mode toggle, a second "personal" flag, a personal workspace in the switcher. |
| Send context to an AI | Company: `buildDossier` (`services/dossier.ts`). Personal, only with `aiPersonal` on: `services/yours.ts`. Both go through `services/ask.ts`. For the clipboard: the topic brief (`services/topic.ts`). The journal, only for Looking back and only as it says: `services/lookback.ts`. | Assembling documents for a model anywhere else. |
| Say who a contact is at a glance | `MAIN_DEAL(lead)` (`repositories/main-deal.ts`), worked out in the query. Stage moves only through `repositories/deals.ts`. | A stored copy of the stage on the contact. |
| Turn text in a page into tasks | `shared/steps.ts` + `services/steps.ts` (`- [ ]` lines with `@owner`, `(day N)`, `(by date)`). | A separate checklist feature. |
| Talk to Google | `callScript` in `services/gsync.ts` - the person's own Apps Script (`resources/appsscript/Caulder.gs`). | OAuth from the app. |
| Keep a secret | Connections and keys: `services/credentials.ts` (safeStorage, refused rather than kept readable). Page fields: `services/secrets.ts`. Private lines and sealed journal days: `services/journal-lock.ts`. | A plain setting. |
| Notify the person | `services/nudges.ts` (`addReminder`) for anything asked for; `notify.ts` (daily digest) and `remind.ts` (before a block). All off until switched on. | A fourth timer. |
| Run something in the background | `services/scheduler.ts`, or a tick in the owning service started from `electron/main/index.ts` and stopped on `before-quit`. | `setInterval` in a screen. |
| Store a preference | `repositories/settings.ts` (one key per setting). | A new table for one value. |
| Handle a date | `shared/dates.ts`. A due date is a `YYYY-MM-DD` day in the company's timezone; a time is `HH:MM`. | `Date` arithmetic in local time; a date library. |
| Fail | Throw an `Error` whose message is the sentence the person reads; Zod schemas state their own sentences. `handle()` (`ipc/handle.ts`) cleans it on the way out. | `ipcMain.handle` directly. |
| Add an IPC call | Constant and type in `shared/ipc.ts`, handler through `handle()` with Zod validation, method in `electron/preload/index.ts`. | Node in the window. |
| Change the schema | Append a step to `electron/main/db/migrations.ts` (latest: 46). Never edit or renumber one. Enums are checked in TypeScript, not SQL `CHECK`s. | A down-migration. |
| Draw a colour | A token in `src/styles/tokens.css` (a test enforces it). | A literal colour in a component. |

---

## Screens

No router: `RouteId` is a union in `src/app/routes.ts`, held in `useState` in
`App.tsx`. Separate windows (`src/main.tsx` reads the hash): the quick window
(`Capture`), the desk widget (`Widget`) and Ember's walk (`Pet`).

| Route | Label | Sidebar group | Key |
| --- | --- | --- | --- |
| `today` | Today | Plan | T |
| `day` | Calendar | Plan | D |
| `journal` | Journal | You | J |
| `life` | Life | You | Y |
| `memories` | Memories | You | R |
| `leads` | Contacts | Company (switcher is the heading) | L |
| `import` | Import | under Contacts | I |
| `pipeline` | Deals | Company | P |
| `money` | Money | Company | M |
| `brain` | Brain | Company | B |
| `map` | Map | under Brain | - |
| `settings` | Settings | App | S |
| `setup` | Setting up | under Settings | - |

Other keys: `A` add a task, `Ctrl+K` search everything, `/` search contacts,
`N` add a contact, `?` the list. Global quick window: `Ctrl+Win+A`
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
"Look around with sample data": a real import batch, removed when a real company is made.
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
- Touches: made by Import, the quick line and the sample. Hosts deals, money, email, WhatsApp, save to phone, custom fields, files, backlinks, the call button. Feeds Today (going quiet), search, the dossier, export.

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
- Main: `services/import.ts` (exceljs), `services/gcontacts.ts` · Tables: `import_batches`, `leads`, `deals`, `activities`, `campaigns` (a label; nothing in the UI makes one now)
- IPC: `import:` · Tests: `shared/normalise.test.ts`, `paste.test.ts`, `gcontacts.test.ts`, `services/import.test.ts`; e2e `import.spec.ts`, `paste.spec.ts`, `google.spec.ts`

### Calls
A prompter reading a script (a Playbooks page) with the contact's context, a dialler handed an id, and a wrap-up that logs the outcome.
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

### Running costs and runway
Recurring costs read from brain pages (tool, domain, running cost), marked paid onto spend; runway from typed balances and the burn.
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

### Mail through Gmail, and other accounts
Sends through the person's Apps Script (now or scheduled, one follow-up, replies and bounces noticed, cancel). Other accounts (SMTP via nodemailer) only send.
- UI: `LeadEmail.tsx`, `src/features/settings/MailAccountsCard.tsx`, `GoogleCard.tsx`, replies on Today
- Logic: `shared/mail.ts`, `mailaccounts.ts`, `script.ts` · Main: `services/mail.ts`, `services/mailaccounts.ts`, `repositories/mail.ts`, `services/scheduler.ts`
- Tables: `emails`, `mail_accounts` · IPC: `mail:`, `mail-accounts:`, `google:script` · Tests: `shared/mail.test.ts`, `services/mail.test.ts`, `mailaccounts.test.ts`, `script.test.ts` (runs the real `Caulder.gs`); e2e `mail.spec.ts`

### WhatsApp
Main builds the `wa.me` link from a contact id; it is logged only on "it went".
- UI: `src/features/leads/LeadWhatsApp.tsx` · Main: `services/outreach.ts` · IPC: `outreach:whatsapp` · Tests: `services/outreach.test.ts` (no e2e)

### Do not contact
One flag on a contact, refused in main by email, mail-app and WhatsApp; setting it stops mail already scheduled.
- Enforced in `services/outreach.ts` and `services/mail.ts` (`sendEmail`, and `stopBarredMail` from `leads:update` and each mail pass); `dueAccountEmails` skips a marked contact. Shown on the board, the call prompter, the contact, and Today's call tasks (`Task.leadDoNotContact`) · Tests: `outreach.test.ts`, `mail.test.ts`, `mailaccounts.test.ts` (no e2e)

### Google: Calendar, Tasks, Contacts, Drive
One script in the person's own account: blocks and tasks both ways, Contacts into Import, save a contact to the phone, a backup to Drive.
- UI: `src/features/settings/GoogleCard.tsx`, `src/features/onboarding/SetupScreen.tsx`, `src/features/leads/SaveToPhone.tsx`, `DataSafety.tsx`
- Logic: `shared/gsync.ts` (every sync decision, no network), `gcontacts.ts`, `script.ts` · Main: `services/gsync.ts`, `gcontacts.ts`, `gmore.ts`, `scheduler.ts`, `credentials.ts`, `repositories/google.ts`
- Tables: `google_sync`, `google_tombstones` · IPC: `google:`, `import:google` · Tests: `shared/gsync.test.ts`, `services/gmore.test.ts`, `script.test.ts`; e2e `google.spec.ts`

### Deadlines and documents
A filing calendar of obligations (country presets, done per occurrence) and the company's documents with expiry. Files on a contact are documents too (25 MB each).
- UI: `src/features/deadlines/` (mounted in the brain's `SectionView.tsx`), on Today and the Calendar · Logic: `shared/deadlines.ts`
- Main: `services/deadlines.ts`, `repositories/obligations.ts`, `repositories/documents.ts`, `services/files.ts`, `ipc/deadlines.ts`
- Tables: `obligations`, `obligation_done`, `documents` · IPC: `deadlines:`, `documents:` · Tests: `shared/deadlines.test.ts`, `services/deadlines.test.ts`; e2e `deadlines.spec.ts`

### Metrics
Company numbers, derived monthly (paid, invoiced, spent, won, calls, cash) or typed.
- UI: `src/features/metrics/` · Logic: `shared/metrics.ts` · Main: `services/metrics.ts`, `repositories/metrics.ts`
- Tables: `metrics`, `metric_values` · IPC: `metrics:` · Tests: `shared/metrics.test.ts`, `services/metrics.test.ts`; e2e `running.spec.ts`

### People and hiring
The team (founders with vesting), openings, candidates, hiring, onboarding as tasks.
- UI: `src/features/people/` · Logic: `shared/people.ts` (staff, **not** name matching) · Main: `services/people.ts`, `repositories/people.ts`
- Tables: `people`, `openings` · IPC: `people:`, `openings:` · Tests: `shared/people.test.ts`, `services/people.test.ts`; e2e `people.spec.ts`

### Custom fields
Per-company fields on every contact.
- UI: `Workbench.tsx`, `src/features/leads/LeadExtras.tsx` · Main: `repositories/workbench.ts` · Tables: `custom_fields`, `custom_values` · IPC: `fields:` · Tests: e2e `workbench.spec.ts` only

---

## The brain

### Pages, sections, templates and fields
Markdown pages in sections, each from a template with typed fields; steps and a decision log.
- UI: `src/features/brain/` (`BrainScreen`, `BrainHome`, `SectionsIndex`, `SectionView`, `PageView`, `PageFields`, `Markdown`, `LinkedEditor`, `editor/`, `PageTasks`, `DecisionLog`)
- Logic: `shared/brain.ts` (sections, templates, fields, `PERSONAL_SQL`), `shared/markdown.ts` (no Markdown library, no HTML strings), `shared/steps.ts`
- Main: `services/brain.ts`, `repositories/brain.ts`, `services/steps.ts`, `ipc/brain.ts`
- Tables: `brain_pages`, `brain_revisions` · IPC: `brain:` · Tests: `shared/brain.test.ts`, `markdown.test.ts`, `services/brain.test.ts`; e2e `brain.spec.ts`, `writing.spec.ts`
- Touches: every save rebuilds links, refreshes search (triggers), keeps a revision, marks the page for sync.

### Revisions and history
Every save is a revision; History shows a line diff and restores. Saves within five minutes merge.
- UI: `PageHistory.tsx` · Logic: `shared/diff.ts` · Main: `repositories/brain.ts` · IPC: `brain:revisions`, `brain:restore`

### Links and the `[[` picker
- UI: `editor/completions.ts`, `LinkedEditor.tsx`, `BrainLinks.tsx` · Logic: `shared/links.ts` · Main: `repositories/links.ts`
- Tables: `brain_links` · IPC: `brain:link-targets`, `brain:backlinks` · Tests: `shared/links.test.ts`, `electron/main/links.test.ts`; e2e `maplink.spec.ts`
- Note: some Map edges are worked out, never stored (person to contact, document to contact or page, product to invoiced contact) in `buildGraph`.
- Reach (`reachFrom` in `repositories/links.ts`): a company's page links within its company only, because a company's brain can be shared. A page in your home (the journal, memories) reaches every company as well. The picker and the names of links both go through it.

### The Map
A force-directed canvas of pages, contacts, products, people and documents; positions kept; drag a dot onto another to write a link.
- UI: `MapView.tsx`, `MapCanvas.tsx` (canvas, frame outside React), `MapOf.tsx` · Logic: `shared/map.ts` · Main: `services/map.ts`, `repositories/links.ts`
- Tables: `brain_links`, `map_positions` · IPC: `brain:map`, `brain:local-map`, `brain:connect`, `brain:disconnect`, `brain:keep-positions`, `brain:let-go` · Tests: `shared/map.test.ts`, `services/map.test.ts`

### Understanding, on this machine
A small model (all-MiniLM-L6-v2, int8, 23 MB) that reads pages, memories, contacts, tasks and notes for what they mean, so later phases can find the nearest in meaning (PLAN.md, part five). On by default; it reads, never sends, and only offers.
- Logic: `shared/understand.ts` (WordPiece tokens, pooling, int8, nearness) · Main: `electron/main/understand/embed.ts` (the model, plain Node), `worker.ts` (its utility process, built to `out/main/understand.js`), `host.ts` (starts, restarts, times out), `services/understand.ts` (the queue job, `nearestTo`), `repositories/vectors.ts`
- UI: `src/features/settings/UnderstandCard.tsx` (This computer) · Tables: `vectors`, `embed_queue` (migration 46) · IPC: `understand:` (state, set, again) · Setting: `understandOff`
- The model is fetched, not committed: `npm run fetch-model` into `resources/model`; the installer carries it beside the executable. Without it everything else works and its tests are skipped.
- Tests: `shared/understand.test.ts`, `repositories/vectors.test.ts`, `services/understand.test.ts`, `understand/embed.test.ts` (the real model); packaged: `smoke:packaged`
- Second opinion (phase 20): `examplesFor` in `services/understand.ts` turns the nearest vectors into votes - seeds (`shared/understand-seeds.ts`), your tasks with their areas, memories, notes, idea pages, and your own pages as homes for a memory; never contacts or a company's pages. The decision is `shared/opinion.ts`. The measuring stick is `understand/eval.test.ts` over `understand/lines.eval.ts` (`MEASURE=all` prints every line).
- Memories (phase 21): `saidAgain` and `belongsOn` in `shared/understand.ts` hold the measured bars; `markRepeats` runs as the queue reads a page; `relatedTo` feeds *Near in meaning* in `BrainLinks.tsx` (`understand:related`).
- Touches: the quick line (kind, where a memory goes, a task's area), Memories (said again, loose ends, recall), brain pages (near in meaning). Phase 22 chooses what goes to an AI.

### Search everything (Ctrl+K)
One FTS5 index over pages, contacts, notes, history, invoices and people; words quoted and made prefixes; bm25 with the title weighted 8 and notes and history pushed down.
- UI: `src/features/search/SearchPalette.tsx` · Main: `repositories/search.ts`, `services/brain.ts` (`search` adds the home workspace)
- Tables: `search_map`, `brain_search` · IPC: `brain:search`
- Touches: Ask (`about`, `contactsFor`), the topic brief, line answers.

### Memories
Dated lines on pages, written by the quick line, listed by topic or by time on their own screen, one brought back on Today. The newest line with the same key (text before the colon) is the current answer.
- Arranged by the model (phase 21): *said again* marks in `said_again` (migration 47), applied in `allMemories` as `earlierBy: "model"`, taken back by `understand:not-the-same`; loose ends offered on the screen (`LooseEnds.tsx`, `looseEnds` / `moveMemories` / `leaveLoose`, setting `looseLeft`); recall fused with meaning (`fuseRecall`, `memoriesByMeaning`). Never a new page from a cluster - measured, and this model cannot tell topics apart that way.
- UI: `src/features/brain/Memories.tsx` (route `memories`), `src/features/today/Remember.tsx`
- Logic: `shared/memories.ts` (`memoriesOf`, `recall`, `underOf`, `trailsOf`, `groupMemories`), `shared/branches.ts`
- Main: `services/remember.ts` (writes), `services/memories.ts` (reads, edits, forgets through `savePage`), `services/nudges.ts` (birthdays)
- Tables: `brain_pages` (no table of its own) · IPC: `brain:memories`, `brain:edit-memory`, `brain:forget-memory`, `brain:remember`
- Tests: `shared/memories.test.ts`, `branches.test.ts`, `services/memories.test.ts`, `remember.test.ts`

### Where a memory is placed
Rules in the quick line decide the section and the chain of pages above a memory:
- Life facts ("my X is Y", people, where things are, lent) go to `remembered` (`shared/lifefacts.ts`). List items go to Watchlist, Gift ideas and the like (`shared/lists.ts`); trivia to Random knowledge (`shared/facts.ts`).
- Subjects (book, film, song, game, recipe, exercise, course) hang off a hobby or studies through `BRANCHES` in `shared/capture.ts` and `trailOf` / `prongsOf` in `shared/branches.ts` (genre, series, artist, body part). Anything else goes to `ideas` under `Me`.
- Existing pages are matched by exact title only.
- Tests: `shared/capture.subjects.test.ts`, `lifefacts.test.ts`, `branches.test.ts`, `facts.test.ts`, `subjects.test.ts`

### Topic brief (Copy context for another AI)
Search hits for a topic, every page under them, and the matching hours, logged numbers, tasks and contacts, as one Markdown block on the clipboard.
- UI: `src/features/brain/ContextCard.tsx`, `src/features/today/ContextLine.tsx` · Logic: `shared/topic.ts` · Main: `services/topic.ts`
- IPC: `brain:topic` · Tests: `shared/topic.test.ts`, `services/topic.test.ts`; e2e `context.spec.ts`

### Ask the brain
Your own AI (Gemini, Anthropic, OpenAI, OpenRouter, Groq, Ollama, any OpenAI-style address) answers from the dossier (Brain home) or from today plus search hits (Today's Ask line), within a chosen size. Three request shapes; model names are read from the service, never hard-coded. No tools: it cannot change anything.
- UI: `src/features/brain/AskBox.tsx`, `src/features/today/AskLine.tsx`, `src/features/settings/AiCard.tsx` · Logic: `shared/ask.ts` (services, budgets, `linkAnswer`)
- Main: `services/ask.ts` (`contactsFor`, `about`, `fit`), `services/yours.ts`, `services/credentials.ts`; handlers in `ipc/costs.ts`
- Tables: `settings` (`aiConnection` sealed, `aiModel`, `aiPersonal`, size) · IPC: `ask:` · Tests: `shared/ask.test.ts`, `services/ask.test.ts`; e2e `ask.spec.ts`, `askline.spec.ts`

### The dossier and Export for an AI
The company as four Markdown documents (read me, the company, customers and sales, people and running), numbers masked. Written to a folder, sent to Ask, or included in Export everything.
- UI: `src/features/brain/BrainShare.tsx` · Main: `services/dossier.ts`, `services/names.ts` · IPC: `brain:dossier`, `data:export-all` · Tests: `services/dossier.test.ts`

### The "You" document
The personal half sent to Ask only with `aiPersonal` on: goals, habits, hobbies, studies, pages in hobbies, studies, goals and ideas with up to 60 memories, 90 days of unsealed journal. Never private lines or sealed days.
- Main: `services/yours.ts` · Tests: `services/yours.test.ts`

### Brain export, brain file and sharing between two founders
A Markdown folder of pages; a JSON brain file; or a live share through the owner's script every three minutes, with the author on each revision and both versions kept on a clash. Personal sections, pins and secrets never travel.
- UI: `BrainShare.tsx`, `src/features/sharing/SharingCard.tsx`, `ThisIsMeCard.tsx` · Logic: `shared/share.ts`
- Main: `services/brain-export.ts`, `brainfile.ts`, `brainsync.ts`, `repositories/me.ts`, `ipc/share.ts`
- Tables: `brain_tombstones`, `companies.brain_*`, `brain_pages.sync_*` · IPC: `brain:export`, `share:`, `me:` · Tests: `services/brainsync.test.ts`; e2e `sharing.spec.ts`

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
decided. There is no model and no numeric confidence: each decision is a rule
plus a `because` sentence, and chips let the person change it.

### The smart line on Today
Reads any line, shows what it will do and where it goes, and on Enter writes it. The same card has two other modes: Ask (your AI) and Copy context (the topic brief).
- Asking your AI is only the Ask switch in `LineModes.tsx` ("Ask the AI"), drawn when an AI is connected; `QuickAdd` has no switch of its own.
- A second opinion from the model on this machine (phase 20): a reading marked `soft` (the fallbacks at the end of `readCapture`), or a task with no area, is sent through `understand:read` after a 250 ms pause; `shared/opinion.ts` (`secondOpinion`, `areaOpinion`) decides. Order: the chip pressed, a lesson, the model, the rules. Says why in `[data-opinion]`. e2e `quickadd.spec.ts` (skipped without the model).
- UI: `src/features/today/QuickAdd.tsx` (`keep()` switches on the kind), `LineModes.tsx`, `LinePanels.tsx`, `AskLine.tsx`, `ContextLine.tsx`, `Remember.tsx`
- Order inside `QuickAdd.tsx`: context loaded on focus, `cleanPaste`, `followOn`, `parseQuick`, `readCapture`, then `readQuestion` and `readEdit` (which win), then `voteKind` from lessons, then the chip the person pressed.
- Writes: tasks, blocks, reminders, contact history, new contacts, brain pages (memories, ideas, costs), journal, private lines, habit ticks, hobby time, measures, the shelf, spend, navigation.
- Tests: e2e `quickadd.spec.ts` (29 tests), `today.spec.ts`, `askline.spec.ts`, `context.spec.ts`

### The task parser
One line to a task: title, day, time, length, repeat, priority, area, kind (call, email, follow-up, meeting, todo), note, follow-up task; asks one question only where a guess is a coin toss.
- Logic: `shared/quickadd.ts` (`parseQuick`, `kindOf`, area order around line 1304), `shared/slips.ts` (typos), `shared/slang.ts` (`expand`), `shared/rephrase.ts`, `shared/hinglish.ts` (only through `rephrase`)
- Main: `services/quickadd.ts` (task, block and follow-up in one transaction) · IPC: `tasks:quick`
- Tests: `shared/quickadd.test.ts`, `quickadd.texted.test.ts`, `quickadd.sentences.test.ts`, `slips.test.ts`, `slang.test.ts`, `hinglish.test.ts`

### What kind a line is
`readCapture` (`shared/capture.ts`) returns one of `task`, `journal`, `private`, `contact`, `hobby`, `done`, `memory`, `command`, `idea`, `note`, checking rules in a fixed order (around lines 802-902): prefixes, private, secrets, life facts, commands and contact details, list items, a feeling, a named contact, a day report, a hobby, trivia, ideas, looking back, instructions, a date ahead, a named page, a new topic, feelings, and finally `note`.
- Readers: `shared/private.ts`, `lifefacts.ts`, `lists.ts`, `facts.ts`, `thoughts.ts`, `subjects.ts`, `branches.ts`, `books.ts`, `newperson.ts`, `commands.ts`
- Contacts are found by `namedContact` (whole words, family aliases like "mom", then one-contact typo match). `shared/people.ts` is **not** involved.
- Tests: all seven `shared/capture*.test.ts` files, and a test per reader

### Questions, edits and the rest
Answer a question from what is stored (the day, free hours, a contact, money, memories, "did I..."); move, cancel or rename a task; carry "him" or "also" over from the last line; split one line into several; suggest the usual hour; tidy a paste.
- Logic: `shared/questions.ts`, `edits.ts`, `followon.ts`, `together.ts`, `habitual.ts`, `pasteline.ts`, `lines.ts` (there is **no** `shared/smartline.ts`; `smartline.test.ts` tests these)
- Main: `services/lines.ts` (`lineContext`, `answerQuestion`, `moveTask`, `cancelTask`, `restoreTask`, `renameTask`). Answers never leave the machine; memories are answered by `recall`.
- IPC: `lines:` · Tests: `shared/smartline.test.ts`, `services/lines.test.ts`

### How the line learns
- **Lessons**: a chip pressed before Enter stores the line's words with that choice; `voteKind` and `voteArea` read later lines the same way (soft kinds only: `LESSON_KINDS`).
- **Tune**: typo fixes and unknown names asked about in Settings, one at a time.
- **Your words**: terms taught outright, each pointing at an area.
- Logic: `shared/lessons.ts`, `shared/tune.ts` · Main: `repositories/lessons.ts`, `tune.ts`, `words.ts` · UI: `LessonsCard.tsx`, `TuneCard.tsx`, `WordsCard.tsx`
- Tables: `line_lessons`, `line_guesses`, `area_words` · IPC: `lessons:`, `tune:`, `words:`

### The quick window from anywhere
An always-on-top window from the tray or `Ctrl+Win+A`. It is `QuickAdd` without `smart`: tasks and notes only.
- UI: `src/features/notes/Capture.tsx` · Main: `electron/main/capture.ts`, `popup.ts`, `tray.ts` · IPC: `capture:`, `tray:` · Tests: `electron/main/popup.test.ts`; e2e `tray.spec.ts`

### Adding a kind to the line
Keep one parser. In this order:
1. A pure reader `shared/<name>.ts` with its test, taking the line as `expand()` returns it and returning a result or null (pattern: `readFact`, `readListItem`, `readLifeFact`). It does not call `parseQuick` or `namedContact`; `readCapture` passes in what it found.
2. `shared/capture.ts`: add to `CaptureKind`, add fields to `CaptureReading`, call the reader beside the others, add it to `options`, and place its `return reading(...)` at the right point in the order - after prefix, private, secret and life facts, before the instruction, date-ahead and note fallbacks.
3. Tests: lines it must claim, and lines it must leave to kinds before it. Run all of `shared/capture*.test.ts`.
4. `shared/lessons.ts`: add to `LESSON_KINDS` only if it is a guess a correction may teach; never for kinds that are found (private, contact, done, command).
5. Only if it writes somewhere new: migration, repository or service, `shared/ipc.ts`, handler, preload. Reuse `brain:remember`, `life:jot`, `notes:create` and the like when they fit.
6. `src/features/today/QuickAdd.tsx`: a label in `GOES_TO` (the compiler insists), a branch in `keep()`, a preview line, a gate in `ready` if it needs more input.
7. `LinePanels.tsx` only if it needs a panel of its own.
8. `e2e/quickadd.spec.ts`: type it, check the chip and preview, press Enter, check where it landed.

A new *task* kind (call, email, meeting) is not a new capture kind: it belongs in `kindOf` in `shared/quickadd.ts`.

---

## You

### Your home workspace
`services/yourhome.ts` makes the one personal workspace (at start-up and when a company is made) and moves your own things into it: pages, blocks, tasks, `journal_private`, `habits`, `hobby_logs`, `shelf_books`, `vision_tiles`, `day_checkins`, `day_themes`, `terms`. Never in the switcher, never the active workspace.
- Tests: `services/yourhome.test.ts`, `home.test.ts`; e2e `life.spec.ts`

### Today
The home screen: the line, then what is late and due, unpaid money, renewals, deadlines, going quiet, replies; habits, journal, pulse, theme, your week, level, notes at the foot, the setup nudge. Rebuilt on every change, never patched.
- Going quiet after N days (3-90, default 14), set in Settings > Reminders: `coldAfterDaysInput`, `readColdAfterDays`, `setColdAfterDays` in `services/today.ts`; IPC `today:cold-after-days`, `today:set-cold-after-days`; e2e `workbench.spec.ts`.
- UI: `src/features/today/` (`TodayScreen`, `NowLine`, `TaskRow`, `TaskForm`, `grouping.ts`, `Hello`, `said.ts`) plus cards from `src/features/life/` · Main: `services/today.ts`
- IPC: `today:` · Tests: `services/today.test.ts`, `src/features/today/grouping.test.ts`; e2e `today.spec.ts`, `hub.spec.ts`

### Calendar (the day)
A day timetable and a week grid of blocks: repeating series, outcomes, a block tied to a habit, reminders before a block, semesters, moods.
- A repeating block's form offers *Save every one from here* (`blocks:updateSeries`): name, time, length and kind from that day on; past ones untouched, other fields only for the one opened.
- Terms are listed and removed in the Timetable dialog (`terms:delete`), in your home workspace; removing one takes its name and dates, never its classes.
- UI: `src/features/day/` · Logic: `shared/day.ts`, `repeat.ts`, `priority.ts`, `remind.ts` · Main: `services/day.ts`, `repositories/blocks.ts`, `repositories/terms.ts`
- Tables: `blocks`, `block_series`, `terms` · IPC: `day:`, `week:`, `blocks:`, `terms:` · Tests: `services/day.test.ts`, `shared/day.test.ts`, `repeat.test.ts`, `priority.test.ts`; e2e `week.spec.ts`

### Tasks
One list per workspace: day, time, priority, contact, area; completed, snoozed, reopened.
- Edited from the pencil on a row, on Today and on a contact's next steps: `TaskForm` given a `task` opens in the row's place and saves the whole task through `tasks:update`.
- Main: `repositories/tasks.ts` · Tables: `tasks` · IPC: `tasks:` · Touches: Today, contacts, pages (steps), progress, Google Tasks.

### Notes
Quick notes at the foot of Today, also from the quick window. There is no Notes screen.
- UI: `src/features/notes/NotesScreen.tsx` (inside Today), `Capture.tsx` · Main: `repositories/notes.ts` · Tables: `notes` · IPC: `notes:`, `capture:`

### Journal, private lines and the lock
Journal days are pages in a personal section (three prompts, a mood, what the day held). Private lines live in their own table. A passcode seals finished days - and today as it is written, when asked - and relocks after 15 idle minutes, when the computer locks or sleeps. A recovery key, shown once, can replace a forgotten passcode. New passcodes are held to `passcodeStrength`. Words added to a sealed entry are sealed as parts, without the passcode. The journal has its own search, which reads locked days in memory while it is open. With a passcode the window is kept out of screen capture.
- UI: `src/features/life/JournalScreen.tsx`, `JournalCalendar.tsx`, `JournalCard.tsx`, `JournalLock.tsx`, `JournalSearch.tsx`, `PrivateLines.tsx`, `DayRecordCard.tsx`
- Logic: `shared/life.ts`, `entry.ts`, `private.ts`, `passcode.ts` · Main: `services/life.ts`, `private.ts`, `journal-lock.ts`, `journalread.ts`, `leave.ts` (locks on leaving), `ipc/life.ts`
- Tables: `journal_private`, `journal_sealed` · Settings: `journalLock`, `journalLockToday` · IPC: `life:` · Tests: `services/life.test.ts`, `journal-lock.test.ts`, `private.test.ts`; e2e `journal-lock.spec.ts`
- Never read by Ask, the "You" document or the topic brief when private or sealed.

### Looking back
A reading of the journal over a month, a season, a year or everything, by a model, beside the numbers for each month (days written, words, mood, tasks done, calls, habits kept, contacts added). Ollama on this computer by default (`isOnThisComputer` holds it to a local address); the connected AI only after a warning and the passcode typed again, or SEND without one. Long journals are read a part at a time and the notes brought together. Nothing is kept; private lines never go.
- UI: `src/features/life/LookBack.tsx` (opened from the journal) · Logic: `shared/lookback.ts` · Main: `services/lookback.ts` (Ollama's `/api/chat` directly; the connected AI through `completeAway` in `services/ask.ts`)
- Setting: `lookBackLocal` · IPC: `life:lookback-*` · Tests: `shared/lookback.test.ts`, `services/lookback.test.ts`; e2e `journal-lock.spec.ts`

### Life, studies, hobbies and the shelf
The You overview. Studies (courses, grades, exams, time), hobbies (measures, a heat grid, time), terms, a reading shelf with optional Open Library covers, your year.
- UI: `src/features/life/` (`LifeScreen`, `StudiesPanel`, `HobbiesPanel`, `HobbyBoards`, `ReadingShelf`, `YourYear`, `TimeCard`) · Logic: `shared/life.ts`, `tracker.ts`, `hobbies.ts`, `books.ts`, `covers.ts`, `subjects.ts`
- Main: `services/life.ts`, `tracker.ts`, `covers.ts` · Tables: `hobby_logs`, `shelf_books`, `terms` · IPC: `life:`, `terms:`

### Goals and theme days
Goals with check-ins and charts; weekday theme days; a company goal.
- UI: `GoalsPanel.tsx`, `GoalCard.tsx`, `CompanyGoals.tsx`, `ThemeDays.tsx`, `TodayTheme.tsx` · Logic: `shared/goals.ts` · Main: `services/goals.ts`
- Tables: `goal_checkins`, `day_themes` · Tests: `services/goals.test.ts`; e2e `goals.spec.ts`

### Habits
Daily habits ticked on Today with their run of days; a habit can be tied to a block.
- UI: `HabitsCard.tsx`, `HabitsPanel.tsx` · Logic: `shared/habits.ts` · Main: `services/habits.ts` · Tables: `habits`, `habit_checks` · IPC: `habits:`

### Vision board
- UI: `VisionBoard.tsx`, `src/lib/picture.ts` · Main: `services/vision.ts` · Tables: `vision_tiles` · IPC: `vision:` · e2e `vision.spec.ts`

### Pulse
How you have been, read from what was already logged; quiet days.
- UI: `PulseCard.tsx` · Logic: `shared/pulse.ts` · Main: `services/pulse.ts` · Tables: `day_checkins`

### Levels and progress
A level, XP and achievements worked out from what was done, never from opening the app. Hidden by a setting.
- UI: `src/features/life/levels.ts`, `LevelStrip.tsx`, `ProgressCards.tsx` · Logic: `shared/progress.ts` · Main: `services/progress.ts` · IPC: `progress:`

### Ember
A flame on the quick line with physics, a wardrobe, a book of what she knows, growth fed by habits and levels; she can walk the taskbar in her own window.
- UI: `src/components/Ember.tsx`, `src/features/ember/`, `src/features/pet/Pet.tsx`, `PetCard.tsx`, `src/lib/chirp.ts`, `src/lib/emberPrefs.ts`
- Logic: `shared/ember.ts`, `growth.ts`, `ascent.ts`, `body.ts`, `closet.ts`, `wardrobe.ts`, `pet.ts` · Main: `services/embergrowth.ts`, `electron/main/pet.ts`, `electron/main/foreground.ts` (koffi, full-screen check)
- IPC: `ember:`, `pet:` · Tests: `shared/ember.test.ts` and siblings; e2e `ember.spec.ts`, `pet.spec.ts`

### Hello and the line under the day
Greeting by the name in "This is me", with a joke, pun or tip under it.
- UI: `src/features/today/Hello.tsx`, `said.ts` · Logic: `shared/voice.ts` · Note: `hello` in `services/gsync.ts` is the script handshake, not this.

---

## Shell and the machine

### Settings
Four groups: **Workspace** (This is me, companies, your own fields, stages, templates), **Planning** (your words, Tune, what the line has learnt, reminders), **Connections** (Google, other mail accounts, AI), **This computer** (appearance, updates, quick add from anywhere, desk widget, Ember, your data).
- UI: `src/features/settings/` · Main: `repositories/settings.ts` plus each card's own service

### Notifications
Three services, all off until switched on: `notify.ts` (daily digest, never before 9), `remind.ts` (before a block), `nudges.ts` (reminders asked for, the journal hour, a morning brief). A click sends `nav:go`.
- Tables: `reminders` · IPC: `notify:`, `nudges:` · Tests: `shared/nudges.test.ts`, `remind.test.ts`, `services/nudges.test.ts`

### Tray
Tray icon, a quick window beside it, right-click menu, keep in tray on close.
- Main: `electron/main/tray.ts`, `popup.ts`, `capture.ts`, `identity.ts` · e2e `tray.spec.ts`

### Desk widget
A pill on the desktop: now, next, late. Three levels, one pinned behind the wallpaper with koffi.
- UI: `src/features/widget/Widget.tsx`, `DeskCard.tsx` · Logic: `shared/widget.ts` · Main: `electron/main/widget.ts`, `desk.ts`, `wallpaper.ts` · IPC: `widget:` · Tests: `desk.test.ts`, `shared/widget.test.ts`; e2e `widget.spec.ts`

### Backups, restore and export
A backup on every launch (ten kept), on demand, a mirror folder, a Drive copy; restore checks the file and can be undone; export everything.
- The copies on Drive are listed on the Data card when asked (`google.driveBackups`), never on draw. No link to open one (the script sends none); restoring one means downloading it into the backups folder, where Restore lists it.
- UI: `src/features/settings/DataSafety.tsx` · Main: `electron/main/db/backup.ts`, `services/export.ts`, `services/gmore.ts` · IPC: `data:` · Tests: `db/backup.test.ts`, `services/export.test.ts`

### Updates and the Microsoft Store
electron-updater from GitHub Releases; a Store copy never looks.
- UI: `UpdatesCard.tsx` · Main: `electron/main/updates.ts`, `store-home.ts` · Packaging: `electron-builder.yml` (NSIS and appx), `scripts/package-store.mjs`, `scripts/smoke-packaged.mjs`

### Logs and problem reports
- Main: `electron/main/log.ts`, `problem.ts` · UI: `ErrorBoundary.tsx`, `DataSafety.tsx` · IPC: `app:`

### Theme
Light, dark or system before first paint; an accent per company; colour only in `tokens.css`. See `design-language.md`.
- UI: `src/lib/theme.ts`, `src/theme-boot.ts`, `src/styles/`

### Background jobs

| Job | Where | When |
| --- | --- | --- |
| Google Calendar and Tasks | `services/scheduler.ts` | Every 10 min when switched on; 25 s after a local change; backs off on failure |
| Gmail watch | `scheduler.ts` | Every 10 min while mail is in play |
| Other accounts' scheduled mail | `scheduler.ts` | Every minute |
| Shared brain | `scheduler.ts` | Every 3 min for a shared company |
| Daily digest | `services/notify.ts` | 5 min tick |
| Before a block | `services/remind.ts` | 30 s tick |
| Nudges | `services/nudges.ts` | 30 s tick |
| Updates | `electron/main/updates.ts` | 30 s after start, then every 6 h; never in a Store copy |
| Backup | `electron/main/db/backup.ts` | Once at launch |
| Widget hover | `electron/main/widget.ts` | 180 ms |
| Ember's walk | `electron/main/pet.ts` | 250 ms |
| Understanding | `services/understand.ts` | 20 s after start; then every 1.5 s while the queue has rows, every 30 s when it has none; only when on and the model is here |

---

## Removed on purpose

Do not rebuild these without a new decision in PLAN.md.

| Feature | Why it went |
| --- | --- |
| Focus (site blocker, foreground poll) | A blocker inside a CRM, Windows-only, walkable. `foreground.ts` now exists only for Ember's full-screen check. |
| Review | A habit tracker inside a CRM. (Habits came back later as one card, not a review.) |
| Forecast screen | Two closed deals cannot carry a curve. Deals shows one line of totals. |
| Rule builder | One rule everyone wants: the built-in follow-up. |
| Saved views | Search plus a stage filter. |
| Email queue, sequences, the CSV bridge | Sending goes through the person's own script; a sequence is a follow-up task. |
| A personal mode or second workspace in the switcher | Your things live in the home workspace, which is a place, not a mode. |
| A `team` workspace kind | Needs sync, accounts and conflict resolution. |
| A Notes screen | Notes sit at the foot of Today. |
| Marketing verdicts | Spend is a ledger with an optional label; a return is a sum, not a judgement. |

Came back after being removed: the **desk widget** and its wallpaper level
(0.4.5, asked for by name) and a one-time **Today tour** (`src/components/Tour.tsx`).

Tables created by early migrations and dropped later - `focus_sessions`,
`focus_blocklist`, `rules`, `saved_views`, `sequences`, `sequence_steps`,
`enrollments`, `sync_batches`, `campaign_spend` - are history, not features.
