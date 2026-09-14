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
Everything else is a build or test tool.

`better-sqlite3` is the one native module. It has to be unpacked from the
asar &mdash; see `electron-builder.yml`.

### What is deliberately absent

- **No Tailwind, no CSS-in-JS.** One token file, plain stylesheets. This
  matches the sibling projects and keeps colour in one place.
- **No router.** Ten screens and no deep linking, so navigation is a union type
  and `useState` in `App.tsx`. Which of the ten a workspace has is a property
  of the route (`in: WorkspaceKind[]`), not a condition in the sidebar.
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
│  ipc/           128 typed channels │        │  way out. No Node here.     │
└────────────────────────────────────┘        └─────────────────────────────┘
                    ▲
                    │  preload/index.ts — contextBridge, nothing else
```

- `contextIsolation: true`, `nodeIntegration: false`. The renderer reaches the
  outside world through `window.caulder` and nowhere else.
- The preload is emitted as **`index.mjs`**, because `package.json` is
  `"type": "module"`. Pointing the `preload` option at `.js` fails *silently* —
  the bridge never loads and `window.caulder` is undefined.
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

`shared/` may not import from `electron/` or `src/`. Everything in it is either
a type, a Zod schema, or a pure function.

## Layering inside main

```
ipc/         parses renderer input, then delegates. No business logic.
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

- **Main** registers every handler through `handle()` in `ipc/index.ts`, never
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

## The one outbound request

Caulder makes no network calls of its own. Email goes out through files you
move by hand, and everything else is a local SQLite file.

The Google link is the single exception, and it is still not Caulder calling
Google: it calls **a script running in the user's own Google account**, which
then does the work there. That is not a workaround, it is the only shape that
works. Calendar and Tasks are sensitive scopes, so a desktop client signing in
directly would need Google's review, and until it had one its refresh tokens
would expire every seven days — a sign-in that breaks weekly, forever.

Consequences, all of them load-bearing:

- **Off until set up**, and everything works with it off.
- **The URL and key are a bearer capability**, so they live in the OS
  credential store (`safeStorage`), never in the settings table as text. If the
  OS will not encrypt, Caulder refuses to store rather than keeping them
  readable — see `services/credentials.ts`.
- **The renderer never receives them.** It sends them once and afterwards can
  only ask whether a connection exists. Same rule as `attachments.open`.
- **Requests have a deadline** and a sync is always something asked for, never
  something a screen waits on to draw.

The reconciling lives in `shared/gsync.ts` with no network in it, so the cases
that can destroy work are testable. Three rules govern it: **nothing is matched
on a title or a time** (the join is an id, as with `message_id`); **ownership
settles a conflict, not recency**; and **absence means deletion only inside the
window that was actually asked about**, which is why `google_sync` records that
window and why a sync of this week cannot touch a plan for next March.

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
