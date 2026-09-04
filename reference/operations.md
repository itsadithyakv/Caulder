# Operations

## Getting it running

```bash
npm install
npm run dev
```

`npm install` runs `electron-builder install-app-deps` afterwards, which
rebuilds `better-sqlite3` against Electron's Node ABI. Skipping that is the
usual cause of *"was compiled against a different Node.js version"* on first
launch.

`npm run dev` starts electron-vite with hot reload on the renderer. The main
process restarts on its own changes.

## Every command

| | |
| --- | --- |
| `npm run dev` | Development, with hot reload |
| `npm run build` | Compile main, preload and renderer into `out/` |
| `npm start` | Run the built output without packaging |
| `npm run verify` | **The gate.** Typecheck, lint, test, dead-code — in that order |
| `npm test` | Unit tests once |
| `npm run test:watch` | Unit tests, watching |
| `npm run test:e2e` | Builds, then drives a real Electron window |
| `npm run package` | Builds, then the NSIS installer into `release/` |
| `npm run smoke:packaged` | Drives the **packaged binary** on a clean profile |

`verify` is four steps in order and all four must pass. `typecheck` covers
three TypeScript projects: `node` (main + shared), `web` (renderer + shared),
and `e2e` — which has its own project because `page.evaluate` bodies run in the
browser and need DOM types that the main process has no business with.

## Building an installer

```bash
npm run package
```

Produces `release/Caulder Setup 0.1.0.exe` — a per-user NSIS installer, around
100 MB, that lets the user choose the install directory. `release/win-unpacked/`
holds the same app unpacked, which is what the smoke test drives.

Then:

```bash
npm run smoke:packaged
```

This is the only check that exercises the *packaged* binary rather than
`electron .` against source. It launches on a throwaway profile and asserts the
app opens on first run, creates its database, ships `Caulder.gs`, and reads and
writes through the native SQLite module. A missing native prebuild or a
resource the packager left behind shows up here and nowhere else.

### What ships

- `out/**` and `package.json`, packed into `app.asar`.
- `better-sqlite3` prebuilds, unpacked (a native module cannot load from
  inside an asar).
- `resources/appsscript/Caulder.gs`, as an `extraResource`.
- The app icon, from `resources/icon.png`, which electron-builder converts to
  the `.ico` stamped onto the executable and the installer.

The import template is **not** shipped — it is generated at runtime from the
same column list the parser validates against, so it cannot drift.

## Where things live

On Windows, under `%APPDATA%\Caulder`:

```
caulder.db          the database — this is the one to copy
caulder.db-wal      write-ahead log
caulder.db-shm      shared memory
backups/            caulder-YYYYMMDD-HHMMSS.db, ten kept
```

Settings shows the exact path, and can open the backups folder.

## Backups

- **Automatic**: one on every launch, *before* any migration touches the file.
  The ten most recent are kept.
- **On demand**: Settings → Your data → Back up now.

Both write a plain copy — but the on-demand one **checkpoints the WAL first**.
WAL keeps recent commits in `caulder.db-wal`, not in `caulder.db`, so copying
the main file of an open database produces a backup missing exactly the work
you most want kept. The launch backup runs before the connection opens, so it
is safe without one.

The launch backup **never throws**: losing access to your leads is worse than
one missing copy. The on-demand one fails loudly, because you pressed a button
and silence would be worse.

## Restore

Settings → Your data → Restore, on any listed backup.

1. The current database is **copied aside first**, as
   `caulder-before-restore-*.db`, so restoring the wrong file is itself
   undoable.
2. The connection is closed, because SQLite holds the file open and swapping it
   underneath a live handle corrupts both.
3. The `-wal` and `-shm` sidecars are removed. A stale `-wal` beside a restored
   file is how a restore silently half-applies.
4. The backup is copied over, the connection reopens, and the window reloads —
   everything on screen describes data that no longer exists.

## Restoring by hand

With Caulder **closed**, copy a `caulder.db` over the one in `%APPDATA%\Caulder`
and delete any `-wal` and `-shm` beside it. That is all a restore is. An
**Export everything** folder contains exactly such a copy, with a README saying
the same thing.

## Export everything

Settings → Your data → Export everything, into a folder you choose:

```
leads.csv  history.csv  tasks.csv  emails.csv  templates.csv
caulder.db
README.txt
```

The CSVs are for reading; `caulder.db` is the one that gets the app back
exactly as it was. CSVs lose the links between records, and putting a
spreadsheet back is not the same as putting the app back.

Exports are **per company**. The database copy, unavoidably, holds all of them.

## Replacing the logo

`assets/caulderLogo.png` is the source of truth. Replace it, then:

```bash
python scripts/logo.py
```

That regenerates the two theme copies the UI paints and the icon
electron-builder stamps onto the executable, so the three cannot drift.
It needs Pillow, which is not a project dependency — `pip install pillow`.
See [design-language.md](design-language.md#the-mark).

## Adding a migration

Append to `MIGRATIONS` in `electron/main/db/migrations.ts` with the next
version number. They are forward-only and applied in one transaction, gated on
`PRAGMA user_version`.

There is no down-migration. Restoring the pre-migration backup is the way back,
and one is taken automatically before any migration runs.

Two SQLite constraints worth knowing before writing one:

- **A `CHECK` constraint cannot be altered** without rebuilding the table, so
  enumerations worth their salt are declared complete up front.
- **`ALTER TABLE` cannot drop or retype a column** in older SQLite. Adding is
  cheap; changing is a table rebuild.

## Adding an IPC channel

1. Add the channel name and its signature to `shared/ipc.ts`.
2. Handle it in `electron/main/ipc/index.ts` — parse the input there, then
   delegate to a repository or service.
3. Expose it in `electron/preload/index.ts`.

The `CaulderApi` type is shared, so missing any of the three is a type error
rather than a runtime surprise.

## Troubleshooting

**`window.caulder` is undefined.** The preload path must end in `.mjs`.
`package.json` is `"type": "module"`, so electron-vite emits ESM, and Electron
loads an ESM preload only when the extension says so. Pointing at `.js` fails
silently.

**"compiled against a different Node.js version".** Run
`npx electron-builder install-app-deps`.

**The app will not start a second time.** It holds a single-instance lock; the
second launch hands focus to the first and exits. Two processes writing one
SQLite file is a corruption risk.

**A test passes alone and fails in the suite.** Almost always
millisecond-resolution timestamps: two events written in one transaction share
a millisecond. Both known cases are documented — the activity ordering in
[data-model.md](data-model.md#activities) and the reply comparison in
[email-bridge.md](email-bridge.md#the-status-ladder).
