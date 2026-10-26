# Working on Caulder

Caulder is a local-first Electron desktop app: the one app a one-person
company is run from - contacts and outreach, deals, money, the calendar and
tasks, and the company's brain - with one quick line that takes any of it.
One SQLite file, no server, no account.

**It is the company's, and nothing else's, and it is plain** (PLAN.md,
part seven). The journal, Life, habits, goals and the rest of the personal
half were taken out on 10 October 2026, and so were Ember the mascot, the
jokes and quotations on Today, and anything else there to amuse. A request
for one of them is answered from "Removed on purpose" in the feature map,
not with a screen. Copy says what is so, in a sentence, and stops.

## Read before building

1. **[STATUS.md](STATUS.md)** - what is committed, what is in flight, what is
   broken right now.
2. **[reference/feature-map.md](reference/feature-map.md)** - every feature,
   where its code lives, what it touches, and **"The spine"**: the one
   existing way to do each common thing (parse a line, search, link, log
   history, remember a fact, send context to an AI). Search it for the noun
   before writing anything new. Also read **"Removed on purpose"**.
3. **[PLAN.md](PLAN.md)** - what is planned, by dated part and phase.
4. `reference/architecture.md`, `data-model.md`, `features.md` and
   `design-language.md` when the change touches them.

If a request looks like something the feature map already lists, extend that
feature and say so; do not build a parallel one.

## Rules of the codebase

- `shared/` is pure: types, Zod schemas and functions, imported by both
  processes. It never imports from `electron/` or `src/`.
- The window reaches main only through `window.caulder` (`shared/ipc.ts` →
  `electron/main/ipc/` via `handle()` → `electron/preload/index.ts`). Input is
  validated in `ipc/` with Zod as well as in the form.
- Migrations are appended to `electron/main/db/migrations.ts` and never edited
  or renumbered. Migration 20's trigger SQL is frozen.
- The quick line has one parser: `readCapture` and `parseQuick`, and six
  kinds. To add one, follow "Adding a kind to the line" in the feature map -
  which starts by asking whether it is a kind at all.
- Runtime dependencies are thirteen: six CodeMirror packages for the page
  editor, and `better-sqlite3`, `electron-updater`, `exceljs`, `koffi`,
  `nodemailer`, `onnxruntime-node` (the model on this machine), `zod`.
  Adding one is a decision for PLAN.md, not a convenience.
- Nothing leaves the machine unless the person set it up; anything that acts
  on its own is off until switched on.
- Colour lives only in `src/styles/tokens.css`.
- Errors are sentences the person reads.

## Checking work

- `npm run verify` is typecheck, lint, unit tests and knip. Run it before
  calling anything done. `reference/data-model.md` is held to the schema by a
  test, so a migration without its section there fails the gate.
- The e2e suite launches Electron about 40 times and takes the screen. Run one
  spec (`npx playwright test e2e/<name>.spec.ts` after `npm run build`), or
  run the whole suite in the background and say so.
- `npm run smoke:packaged` is the only check that catches a missing native
  module or resource in the packaged build.
- The model understanding reads with is not in git: `npm run fetch-model`
  puts it in `resources/model` (pinned, checked by SHA-256). Without it the
  tests that need it are skipped, the app runs without understanding, and a
  package ships without it - so fetch it before `npm run package`.

## Keep the documents true

In the same change as the code:
- a feature added, moved or removed updates `reference/feature-map.md`;
- a table changed updates `reference/data-model.md`;
- a phase finished or a problem found or fixed updates `STATUS.md` and, when
  planned, PLAN.md;
- anything that sends something new off the computer updates
  `docs/privacy.md`, which is the published privacy page.

Documents are written in plain, calm British English, in the voice of the
existing ones.
