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

## Releasing, and updates

```bash
set GH_TOKEN=<a GitHub token that can publish releases>
npm run release
```

Builds the installer and publishes it to the repository's Releases page as a
draft release, with its blockmap and `latest.yml`; publish the draft to make
it the newest. The installed app looks there (electron-updater) thirty seconds
after it starts and every six hours, downloads a newer version quietly and
puts it in when Caulder is next quit - or at once, from *Restart to update* in
Settings or the bar that appears when one is ready. Nothing is looked for in
development or under the tests. A private repository would need a token in
every copy, so releases belong in a public one.

**The installer is not code-signed yet.** Windows SmartScreen shows *Windows
protected your PC* until it is, and updates still work unsigned. Signing
needs a certificate or Microsoft's Trusted Signing, set up in
`electron-builder.yml` under `win`.

## Building an installer

```bash
npm run package
```

Produces `release/Caulder Setup <version>.exe` — a per-user NSIS installer, around
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
logs/               caulder.log, and caulder.log.1 once it passes a megabyte
```

Settings shows the exact path, and can open the backups folder and the log
folder. The log holds faults only — programming errors, anything SQLite
raised, a window or process that stopped, a screen that failed to draw — not
every message the app shows.

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

**Another copy, somewhere else** (Settings → Your data): a folder the person
chooses - one OneDrive, Google Drive or Dropbox keeps elsewhere - gets a copy
of every backup too, launch and on demand, with the ten newest kept there.
Where it is lives in `backup-folder.json` beside the database, because the
launch backup runs before the database is opened. A folder that cannot be
written to - a drive not plugged in - never stops a backup; the on-demand one
says why it was not copied.

## Reporting a problem

Settings → Your data → *Report a problem* shows the whole report before it
goes anywhere: the version, Windows, and the last sixty lines of
`logs/caulder.log` with emails, phone numbers and the Windows account name
taken out. *Copy it*, or *Open it as an issue on GitHub* with it filled in,
to send or not. Nothing is sent by Caulder itself.

## Restore

Settings → Your data → Restore, on any listed backup.

0. The window sends the backup's **file name, never a path**, and main finds
   it in the backups folder. A scratch copy is then checked: it must start
   with the SQLite header, pass `integrity_check`, and have a schema version
   this build knows. A backup that fails any of these is refused with nothing
   changed.
1. The current database is **copied aside first**, as
   `caulder-before-restore-*.db`, so restoring the wrong file is itself
   undoable.
2. The connection is closed, because SQLite holds the file open and swapping it
   underneath a live handle corrupts both.
3. The `-wal` and `-shm` sidecars are removed. A stale `-wal` beside a restored
   file is how a restore silently half-applies, so if Windows will not let one
   go, the restore stops, the old database is reopened untouched, and the
   message says to try again.
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

**`window.caulder` is undefined.** The preload is built as CommonJS,
`out/preload/index.cjs` (see `electron.vite.config.ts`), because both windows
run sandboxed and Electron runs an ESM preload only with the sandbox off. A
preload path that does not match the built file fails silently. A sandboxed
preload can only `require("electron")`, so it must import nothing from
`shared/` but types and plain functions that get bundled in.

**Something went wrong and the window said little.** Read
`%APPDATA%\Caulder\logs\caulder.log`, or Settings → Your data → Open the log
folder.

**"compiled against a different Node.js version".** Run
`npx electron-builder install-app-deps`.

**The app will not start a second time.** It holds a single-instance lock; the
second launch hands focus to the first and exits. Two processes writing one
SQLite file is a corruption risk.

**A test passes alone and fails in the suite.** Almost always
millisecond-resolution timestamps: two events written in one transaction share
a millisecond. The known case is documented: the activity ordering in
[data-model.md](data-model.md#activities).
