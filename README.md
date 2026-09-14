# Caulder

A planner and a CRM in one desktop app, for somebody running a company while
doing a degree. It holds the timetable, the gym, the club, the client meetings
and the studying alongside the leads, the funnel, the outreach and what any of
it cost — because that is one Tuesday, not two.

It tells you what to be at right now, what to chase today, what a campaign
brought back, and how the weeks actually went.

Local-only by design: a single SQLite file on this machine, no cloud, no
account, works offline. Google Calendar and Tasks sync through a script that
runs in your own account, if you want it.

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

`shared/` matters most. The import column contract, the domain schemas and the
bridge file formats are declared there once and consumed by both processes, so
the file you download and the file the parser expects can never disagree.

## Documentation

Everything about how Caulder works lives in **[reference/](reference/)**:

| | |
| --- | --- |
| [architecture.md](reference/architecture.md) | The stack, the two processes, and why each choice was made |
| [data-model.md](reference/data-model.md) | Every table and column, and the rules the schema enforces |
| [features.md](reference/features.md) | What the app actually does, screen by screen |
| [design-language.md](reference/design-language.md) | Tokens, the neumorphic rules, both themes |
| [operations.md](reference/operations.md) | Building, packaging, backups, troubleshooting |
| [product-review.md](reference/product-review.md) | A dated, opinionated review of how well it works as a product |

The first five describe shipped behaviour. Anything dated — status, progress,
what is coming next — belongs in [PLAN.md](PLAN.md) or in Git history, and new material
goes into a section of one of them rather than into a new file. The review is
the one exception: it is an opinion at a point in time, and says so.
