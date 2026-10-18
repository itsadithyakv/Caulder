# Caulder

The one app a one-person company is run from, on your own computer: who you
are selling to and how to reach them, what each deal is worth, your money,
your time, and what the company knows.

- **Contacts and outreach.** A list with import, a page for each contact with
  its history, and every way of writing to them from one place: email through
  your own Gmail or another account, WhatsApp, LinkedIn and Instagram. Tick
  several and write to all of them, each by name. Today says who you reached
  and who is still waiting to hear from you.
- **Deals and money.** A board by stage, quotes, invoices, payments, spend,
  running costs and runway.
- **Your time.** Today, a calendar with the whole day in it, tasks and notes.
- **One line for any of it.** "call Priya tomorrow 4pm", "Priya wants the
  invoice by the 5th", "figma 1,200", "our GST number is …" - it says where
  each will go before it goes there.
- **The company's brain.** Pages, memories, a map of how they link, filing
  deadlines, documents, people, metrics, a data room, and your own AI asked
  from what is written down.

Local-only by design: a single SQLite file on this machine, no cloud, no
account, works offline. Google - calendar, tasks, Gmail, and your contacts as
a spreadsheet you can edit on your phone - goes through a script that runs in
your own account, if you want it. Ask uses whichever AI you connect, if you
connect one. Nothing personal lives here: Caulder is the company's
([PLAN.md](PLAN.md), part seven).

## Running it

```bash
npm install
npm run dev
```

`npm install` rebuilds `better-sqlite3` against Electron's Node ABI afterwards.
`npm run dev` opens the window with hot reload.

| Command | What it does |
| --- | --- |
| `npm run dev` | Development, with hot reload |
| `npm run build` | Builds main, preload and renderer into `out/` |
| `npm start` | Runs the built app |
| `npm run verify` | **The gate**: typecheck, lint, test, dead-code. Four steps, in order. |
| `npm run test:e2e` | Builds, then drives the real window with Playwright |
| `npm run package` | Produces a Windows installer in `release/` |
| `npm run smoke:packaged` | Drives the packaged binary on a clean profile |

`test:e2e` is deliberately outside `verify`, so that gate stays the four steps
the sibling projects use. It launches the actual Electron binary against a
throwaway `--user-data-dir`, so it never touches your real database.

Stop any preview server before building. A process holding files open in `out/`
makes the build fail in confusing ways on Windows.

## Where things live

```
electron/main/      app lifecycle, database, repositories, services, IPC handlers
electron/preload/   the contextBridge surface, and the only thing the UI can call
src/                the renderer: shell, features, primitives, styles
shared/             types and schemas imported by BOTH sides, so they cannot drift
assets/             the logo, as supplied; everything else derives from it
resources/          fonts, the app icon, and the Apps Script file to paste into Google
reference/          what this app is and how it works
e2e/                Playwright suites, one per area
scripts/            standalone checks run by hand
```

`shared/` matters most. The import column contract, the domain schemas, the
line's reader and the sheet's rules are declared there once and consumed by
both processes, so the two can never disagree.

Where everything lives, feature by feature, is
[reference/feature-map.md](reference/feature-map.md); where things stand
today is [STATUS.md](STATUS.md).

## Documentation

Everything about how Caulder works lives in **[reference/](reference/)**:

| | |
| --- | --- |
| [architecture.md](reference/architecture.md) | The stack, the two processes, and why each choice was made |
| [data-model.md](reference/data-model.md) | Every table and column, and the rules the schema enforces |
| [features.md](reference/features.md) | What the app actually does, screen by screen |
| [design-language.md](reference/design-language.md) | Tokens, the flat look and its rules, both themes |
| [operations.md](reference/operations.md) | Building, packaging, backups, troubleshooting |
| [product-review.md](reference/product-review.md) | A dated, opinionated review of how well it works as a product |

The first five describe shipped behaviour. Anything dated — status, progress,
what is coming next — belongs in [PLAN.md](PLAN.md) or in Git history, and new material
goes into a section of one of them rather than into a new file. The review is
the one exception: it is an opinion at a point in time, and says so.
