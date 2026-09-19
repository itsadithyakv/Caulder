# Architecture

## The stack

| Concern | Choice | Version |
| --- | --- | --- |
| Shell | Electron, frameless window with a custom title bar | 38 |
| Build | electron-vite | 5 |
| UI | React, TypeScript strict | 19 / 5.9 |
| Database | better-sqlite3, WAL, synchronous, main process only | 13 |
| Validation | Zod | 4 |
| Spreadsheets | exceljs (xlsx **and** csv) | 4.4 |
| Icons | lucide-react | 1.x |
| Styling | Plain CSS with custom properties | — |
| Tests | Vitest (unit), Playwright (a real window) | 4 / 1.6 |
| Dead code | knip | 5 |
| Packaging | electron-builder, NSIS | 26 |

Runtime dependencies are three: `better-sqlite3`, `exceljs` and `zod`.
Everything else is a build or test tool, or - like React, lucide and
`d3-force` - bundled into the window at build time, which is why they are
dev dependencies.

`d3-force` (with its three small parts) lays out the brain's Map. It is the
one library chosen for a picture: a hand-written force simulation is where
the jitter bugs live.

`better-sqlite3` is the one native module. It has to be unpacked from the
asar &mdash; see `electron-builder.yml`.

### What is deliberately absent

- **No Tailwind, no CSS-in-JS.** One token file, plain stylesheets. This
  matches the sibling projects and keeps colour in one place.
- **No router.** Eight screens and no deep linking, so navigation is a union
  type and `useState` in `App.tsx`. A screen asked to open one thing - a
  contact from Today, a page from search - is handed a one-time request it
  clears once it has acted.
- **No Markdown library.** A brain page's text is parsed by
  `shared/markdown.ts` into a small tree and drawn as elements, never as an
  HTML string, so nothing written on a page can become markup and there is
  no sanitiser to configure. It covers what founders' notes use and nothing
  more.
- **No data-fetching library.** Each screen owns a small hook over the IPC
  bridge. Against a local SQLite file there is nothing to cache.
- **No date library.** `shared/dates.ts` is fifty lines of `Intl` plus day
  arithmetic in UTC.
- **No form library.** Zod for validation, `useState` for the rest.
- **No table library.** The leads table is hand-rolled; a few hundred rows do
  not need virtualisation.
- **No drag-and-drop library.** The board uses the browser's own drag events,
  with a Move menu as the keyboard path.

### Why Electron rather than Tauri

Tauri would ship a far smaller binary, and Rust is installed on the target
machine — but `cl.exe` is not on PATH, and Tauri's SQL plugin forces every
query through an async bridge. Caulder is transaction-heavy: imports that
commit-or-roll-back thousands of rows, undo of a whole batch, dedupe passes.
Synchronous SQLite in an Electron main process makes that logic short and
obvious. The cost is a ~100 MB install, which is irrelevant for a personal tool.

## Two processes

```
┌─ main (Node) ──────────────────────┐        ┌─ renderer (Chromium) ───────┐
│  index.ts        window, lifecycle │        │  App.tsx      shell, routes │
│  db/             connection, WAL,  │        │  features/    one per screen│
│                  migrations, backup│        │  components/  primitives    │
│  repositories/   one per aggregate │  IPC   │  lib/         hooks, format │
│  services/       import, today,    │ ◄────► │  styles/      tokens first  │
│                  pipeline, gsync,  │        │                             │
│                  outreach, export  │        │  window.caulder is the ONLY │
│  ipc/           165 typed channels │        │  way out. No Node here.     │
└────────────────────────────────────┘        └─────────────────────────────┘
                    ▲
                    │  preload/index.ts — contextBridge, nothing else
```

- `contextIsolation: true`, `nodeIntegration: false`, **`sandbox: true`** in
  both windows. The renderer reaches the outside world through
  `window.caulder` and nowhere else.
- The preload is built as **CommonJS, `index.cjs`**, because Electron runs an
  ESM preload only with the sandbox off. Pointing the `preload` option at a
  file that is not there fails *silently* — the bridge never loads and
  `window.caulder` is undefined.
- **No window leaves the app.** Every web contents is guarded as it is created
  (`electron/main/links.ts`): navigation away is refused, new windows are
  refused, and a link is handed to the operating system only if it is
  `https:` or `mailto:`.
- **The renderer names things; main finds them.** A backup is restored by its
  file name, a folder is opened by `"database"`, `"backups"` or `"logs"`, a
  file on a contact by its id. No path from the window reaches `shell` or the
  file system.
- **Faults are written down.** `electron/main/log.ts` keeps a capped log;
  the IPC wrapper, the background jobs, crashed windows and a screen's error
  boundary all write to it. A sentence meant for the person is not logged.
- A **single-instance lock**: a second launch hands focus to the first and
  exits, because two processes writing one SQLite file is a corruption risk.

## The contract between them

`shared/` is imported by **both** sides, so a handler and its caller cannot
drift apart.

| File | Holds |
| --- | --- |
| `shared/ipc.ts` | Channel names and the full `CaulderApi` type |
| `shared/domain.ts` | Every record type and input schema: companies, leads, tasks, blocks, notes, money, settings keys |
| `shared/email.ts` | Email and WhatsApp templates, and the tokens they may contain |
| `shared/import.ts` | The import column contract and preview result types |
| `shared/data.ts` | Backup and export result types |
| `shared/errors.ts` | What a failure looks like after crossing the bridge — see below (pure) |
| `shared/normalise.ts` | Spreadsheet-cell normalisation (pure) |
| `shared/paste.ts` | Finding the table inside a pasted chat reply (pure) |
| `shared/render.ts` | Template token substitution (pure) |
| `shared/dates.ts` | Calendar-day and `HH:MM` helpers (pure) |
| `shared/day.ts` | Laying out a day: overlapping blocks packed side by side (pure) |
| `shared/repeat.ts` | Which days a repeating block falls on (pure) |
| `shared/priority.ts` | The three priority levels, the clash rule, and what to be at now (pure) |
| `shared/remind.ts` | When a reminder is due, and what it says (pure) |
| `shared/quickadd.ts` | The one-line task parser and the questions it asks (pure) |
| `shared/gsync.ts` | The Google sync's decisions — what to push, pull, adopt or drop — with no network (pure) |
| `shared/script.ts` | The script's version, and checking a pasted URL and key (pure) |
| `shared/brain.ts` | The brain's sections, templates and fields, checking a page's fields, and the *write these down first* list (pure) |
| `shared/markdown.ts` | A page's text as a tree of blocks, and flipping a tick box (pure) |
| `shared/diff.ts` | Two versions of a page, line by line (pure) |
| `shared/search.ts` | What a search result is (types) |
| `shared/links.ts` | How a link is written in a page, reading links out, and the `[[` being typed (pure) |
| `shared/map.ts` | What the Map draws: dot kinds, sizes, neighbourhoods, replay and filters (pure) |
| `shared/mail.ts` | Email through the script: the send input, and how a report from the script moves a message (pure) |

`shared/` may not import from `electron/` or `src/`. Everything in it is either
a type, a Zod schema, or a pure function.

## Layering inside main

```
ipc/         parses renderer input, then delegates. No business logic.
             handle.ts is what every handler registers through; the brain's,
             the deals' and the calls' handlers are in brain.ts, deals.ts and
             calls.ts, the rest still in index.ts.
services/    anything spanning more than one aggregate: import, today,
             pipeline, Google sync, outreach, invoices, export.
repositories/ one module per aggregate. Plain functions over a Db handle.
db/          connection, migrations, backup.
```

Every repository function takes its `Db` explicitly rather than reaching for a
singleton. That is what lets the whole suite run against `:memory:`.

**Renderer input is validated in `ipc/` as well as in the form.** The renderer
is our own code, but it is the untrusted side of this boundary by construction,
and a bad value reaching SQLite is far harder to diagnose than a rejected call.

## Two shapes of IPC reply

Not arbitrary — each fits how the caller uses the result.

- **Return the whole collection**: companies, stages, templates.
  These are short lists where a mutation can reorder or renumber several rows.
  Replacing the list outright removes a class of bug where positions drift out
  of step with the screen.
- **Return the one record**: leads, tasks, blocks. These lists run to
  thousands of rows and are filtered server-side; re-sending them on every edit
  would be wasteful. The caller patches the row it holds.

**Today and the board are rebuilt, never patched.** Completing an overdue call
empties one list and can add its lead to another. Recomputing is both simpler
and always right.

## Errors across the bridge

Whatever a handler throws reaches the window as a string Electron builds
itself: `Error invoking remote method 'words:add': ` followed by the thrown
value's `toString()`. For a plain `Error` that put bookkeeping in front of
every sentence the app could show. For a `ZodError` it was worse — its
message is the whole issue list as JSON — so a schema refusing a long title
arrived as a screenful of braces.

Fixed once on each side, in `shared/errors.ts`, so no screen has to know:

- **Main** registers every handler through `handle()` in `ipc/handle.ts`, never
  `ipcMain.handle` directly. It passes anything thrown through
  `readableError`, which turns a `ZodError` into its first issue's message.
  This is why every schema states its own sentence for each way input goes
  wrong: that sentence is what the person reads.
- **The preload** routes every call through `invoke()`, which takes the
  wrapper and the error's name back off with `ipcMessage`. A `catch` in the
  window therefore gets the sentence main threw, as `error.message`.

`src/lib/errors.ts`'s `messageOf` strips again anyway; on a message with no
wrapper it changes nothing. `e2e/hardening.spec.ts` reads all three kinds —
a repository's `Error`, a schema's `ZodError`, a boundary check — straight off
`error.message` in a real window.

## A contact and its deals

A contact has deals, and most screens still want one line per contact: a
stage in the table, a value to sort by, a reason to call. That line is the
contact's **main deal** - its open deal touched last, or the last deal
touched - and it is worked out in the query, never stored. `MAIN_DEAL(lead)`
in `repositories/main-deal.ts` is a correlated subquery that the contacts
list, the contact, Today's *Going quiet* and the export all join through, so
there is no denormalised copy to fall out of step when a deal moves.

Writes go the other way: `repositories/deals.ts` owns every stage move, and
the contact's own stage setter only picks the main deal (or makes one) and
hands over. The history entry, the follow-up, *won makes a customer* and the
close date live in that one place.

## Search, kept by the database

`Ctrl + K` searches pages, contacts, notes, history entries and invoices
through one SQLite FTS5 index. The index is not written by the code that
writes a contact or a note: **triggers** on those tables keep it, created by
migration 20. Every trigger runs the same "refresh this row" step - remove what
the index holds for the row, then put back what the row now says if it still
qualifies - so an insert, an edit, an archive and a delete cannot disagree,
and an import of a thousand rows is findable the moment it commits.

FTS5 keys its rows on an integer, and the source tables are keyed on text ids
whose own rowids SQLite may renumber under `VACUUM`. `search_map` gives each
indexed row a stable integer instead. What is typed becomes a query in
`repositories/search.ts`: every word quoted and made a prefix, so nothing typed
can be read as FTS5's query language.

## The Map

`src/features/brain/MapCanvas.tsx` draws the Map on a canvas, not in SVG, so a
few thousand dots stay smooth, and keeps its frame outside React: a frame is a
function of the simulation and a few refs, and React only hands over the
graph. What the graph is - kinds, neighbourhoods, replay - is pure, in
`shared/map.ts`; main builds it from `brain_links` in
`repositories/links.ts`.

- **The simulation runs on the window's own thread,** a tick a frame, and
  stops once settled. PLAN.md asked for a worker; the page's security policy
  allows scripts only from the app's own files, and a worker loaded from
  `file://` is exactly what Chromium is strictest about, while the graphs a
  founder builds are hundreds of dots, not hundreds of thousands. Under
  reduced motion the ticks run before the first frame instead.
- **Positions are kept** a moment after the map stops moving or a dot is
  dropped, and a map opened again starts from them with almost no heat, which
  is what makes it the same map tomorrow.
- **Colours are read from the theme** at draw time and read again when the
  theme changes, so the canvas never holds a colour of its own.

## Secrets inside the database

Brain pages hold a few values that should not sit readable in a copied
database: the PAN, the TAN, bank account numbers. `services/secrets.ts`
encrypts each with `safeStorage`, like the Google key, and stores it inside the
page's field JSON as `{"$secret", "last4"}`. The window only ever receives the
mask built from `last4`; showing a value is its own call, and copying one
happens in main so the window never holds it for that. The search triggers read
only a field's text and numbers, so a sealed value never reaches the index.

## Dates and timezones

A due date is a **calendar day** (`YYYY-MM-DD`), not an instant, and "today" is
computed in the company's timezone.

Stored as a timestamp and compared in UTC, every task would read as due
*yesterday* after 18:30 IST — which is exactly when somebody checks what is
left to do. `shared/dates.ts` is the only place that conversion happens.

`shiftDay` does its arithmetic in UTC on purpose: local-time arithmetic lands
on the wrong date twice a year, because one day is not always 24 hours.

Event timestamps (`occurred_at`, `sent_at`) *are* instants, stored as ISO-8601
UTC strings.

A **time of day** is the same argument one level down: `HH:MM`, a string, never
an instant. Nine o'clock is nine o'clock, and a block stored as a timestamp
would move because the machine's timezone did. All of it clamps to the day
rather than wrapping — a meeting dragged past midnight stops at midnight
instead of reappearing at the top of the same morning.

## The outbound requests

Caulder makes no network calls of its own. Everything is a local SQLite file.

There are two exceptions, both off until the founder sets them up, and the
app works fully with both off. The Google link is the first, and it is still not Caulder calling
Google: it calls **a script running in the user's own Google account**, which
then does the work there — the calendar and task sync, and sending email
through Gmail. That is not a workaround, it is the only shape that works.
Calendar, Tasks and Gmail are sensitive or restricted scopes, so a desktop
client signing in directly would need Google's review, and until it had one its
refresh tokens would expire every seven days — a sign-in that breaks weekly,
forever.

Consequences, all of them load-bearing:

- **Off until set up**, and everything works with it off. Email falls back to
  opening the machine's own mail app.
- **Email waits in the script, not on the laptop.** A scheduled message and its
  follow-up are held by the script and sent by its own timer, so they go out
  with Caulder closed. Caulder asks what happened and tells it what to forget;
  the rules for how a report moves a message are pure, in `shared/mail.ts`.
- **The script is tested here too.** `services/script.test.ts` loads the real
  `Caulder.gs` into a sandbox with stand-ins for Gmail, properties, the lock
  and triggers, and drives it through `doPost` and its timer. The other half,
  `e2e/mail.spec.ts`, plays the script from inside the main process with an
  `https` protocol handler — `net.fetch` asks those before the network — so
  the real windows send, schedule, cancel and hear back with no Google account.
- **The URL and key are a bearer capability**, so they live in the OS
  credential store (`safeStorage`), never in the settings table as text. If the
  OS will not encrypt, Caulder refuses to store rather than keeping them
  readable — see `services/credentials.ts`.
- **The renderer never receives them.** It sends them once and afterwards can
  only ask whether a connection exists. Same rule as `documents.open`.
- **Requests have a deadline** and a sync is always something asked for, never
  something a screen waits on to draw.

The reconciling lives in `shared/gsync.ts` with no network in it, so the cases
that can destroy work are testable. Three rules govern it: **nothing is matched
on a title or a time** (the join is an id, as with `message_id`); **ownership
settles a conflict, not recency**; and **absence means deletion only inside the
window that was actually asked about**, which is why `google_sync` records that
window and why a sync of this week cannot touch a plan for next March.

### Ask the brain

The second is whichever AI service the founder connects (`services/ask.ts`),
with their own key. The same rules as the Google key: sealed by the OS
credential store and refused rather than kept readable (`aiConnection`),
never handed back to the window - which can only ask whether one is kept, and
its last four characters - and checked with the service before it is kept, by
listing its models, so a mistyped key or a wrong address fails at once rather
than on the first question.

**Three request shapes cover every service**: Gemini's
(`:generateContent`, with the documents as `systemInstruction`), Anthropic's
(`/messages`, with the documents as a cached system block) and OpenAI's
(`/chat/completions`), which OpenRouter, Groq, Ollama, LM Studio and most
others also speak - so "another service" is an address and a key, not new
code. `shared/ask.ts` holds the services, their steps and what each one does
with what is sent; each carries a default context size, because a free tier
that allows 12,000 tokens a minute and a model with a million-token window
cannot be sent the same thing.

**Model names are read, never hard-coded.** Connecting lists the service's
models, keeps the list (`aiModels`) and picks one to start on by pattern -
Gemini's newest plain Flash, OpenAI's newest flagship GPT, the first Opus
Anthropic lists, a `:free` model on OpenRouter - so a new model generation
needs no release. The founder can pick another from the list or type a name.

What goes with a question is the **dossier** (`services/dossier.ts`): the
brain, the contacts with their deals, calls, notes and history, the money,
running costs and runway, as four Markdown documents, with registration and
account numbers masked. The same documents *Export for an AI* writes, so
what the founder can read is what was sent. They go in the system prompt,
marked for prompt caching, so a follow-up in the same sitting costs a
fraction of the first question; the conversation so far goes as messages.
When the whole dossier is longer than the chosen size allows it is rebuilt
with only the contacts the question is about - named in it, found for it by
the search index, then the most recently touched - and anything still too
long is cut with a note where. Every answer says what was sent.

The model is told to answer only from the documents, to say when they do not
say, and to name pages and contacts in `[[double brackets]]`, which the
window turns into the same links a page uses (`linkAnswer` in
`shared/ask.ts`). It cannot change anything: there are no tools.

The suite never reaches any of them: `services/ask.test.ts` replaces
`net.fetch` and plays Gemini, an OpenAI-style service and Anthropic in turn,
and `e2e/ask.spec.ts` answers as Gemini from an `https` protocol handler in
the main process, the way the email suite plays the script.

## One kind of workspace

Every workspace is a company. `companies.kind` still accepts `personal`,
because personal workspaces made before PLAN.md's first phase are still in
people's files: one opens as a company with no contacts, and its blocks and
tasks are untouched. Nothing creates one any more. `team` was never built: it
needs sync, accounts and conflict resolution, and a value the app cannot
produce has no business in a picker.

The sample company is a workspace of its own for the same reason a real one
is: it can be looked around and then removed whole, by the cascade, without
touching anything else.

## Migrations

`PRAGMA user_version` gates a forward-only list applied in one transaction. The
database is copied aside **before** any migration runs. If a migration throws,
the transaction rolls back and the app opens with a plain explanation rather
than a stack trace.

There is no down-migration. Restoring a backup is the way back.

## Testing

- **Vitest** runs every repository and service against an in-memory SQLite
  database, with the clock injected so assertions do not change meaning at
  18:30 IST.
- **Playwright** drives the real Electron window: first run, restart
  persistence, the import wizard, the board, money, the Google link, restore.
  Native file dialogs are stubbed in the main process; everything after the
  dialog is the real path.
- **`scripts/smoke-packaged.mjs`** drives the *packaged binary* on a clean
  profile. It is the only check that would catch a missing native module or a
  resource the packager left behind.

`npm run verify` is four steps in order: typecheck, lint, test, dead-code.
