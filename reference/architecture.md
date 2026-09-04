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

Runtime dependencies are exactly three: `better-sqlite3`, `exceljs`, `zod`.
Everything else is a build or test tool.

### What is deliberately absent

- **No Tailwind, no CSS-in-JS.** One token file, plain stylesheets. This
  matches the sibling projects and keeps colour in one place.
- **No router.** Six screens and no deep linking, so navigation is a union type
  and `useState` in `App.tsx`.
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
│                  pipeline, sync,   │        │                             │
│                  sequences, export │        │  window.caulder is the ONLY │
│  ipc/            65 typed channels │        │  way out. No Node here.     │
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
| `shared/domain.ts` | Companies, stages, leads, activities, tasks, the board, Today |
| `shared/email.ts` | Templates, messages, the status ladder, sequences, the bridge file formats |
| `shared/import.ts` | The import column contract and preview result types |
| `shared/normalise.ts` | Spreadsheet-cell normalisation (pure) |
| `shared/render.ts` | Template token substitution (pure) |
| `shared/dates.ts` | Calendar-day helpers (pure) |
| `shared/data.ts` | Backup and export result types |

`shared/` may not import from `electron/` or `src/`. Everything in it is either
a type, a Zod schema, or a pure function.

## Layering inside main

```
ipc/         parses renderer input, then delegates. No business logic.
services/    anything spanning more than one aggregate: import, today,
             pipeline, sync, sequences, export.
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

- **Return the whole collection**: companies, stages, templates, sequences.
  These are short lists where a mutation can reorder or renumber several rows.
  Replacing the list outright removes a class of bug where positions drift out
  of step with the screen.
- **Return the one record**: leads, tasks, messages. These lists run to
  thousands of rows and are filtered server-side; re-sending them on every edit
  would be wasteful. The caller patches the row it holds.

**Today and the board are rebuilt, never patched.** Completing an overdue call
empties one list and can add its lead to another. Recomputing is both simpler
and always right.

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
  persistence, the import wizard, the board, the bridge round-trip, restore.
  Native file dialogs are stubbed in the main process; everything after the
  dialog is the real path.
- **`scripts/smoke-packaged.mjs`** drives the *packaged binary* on a clean
  profile. It is the only check that would catch a missing native module or a
  resource the packager left behind.

`npm run verify` is four steps in order: typecheck, lint, test, dead-code.
