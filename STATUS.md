# Status

*Where Caulder stands right now. Dated, and rewritten as it changes - in the
same commit as the work, not afterwards. What is planned is in
[PLAN.md](PLAN.md); where everything lives is in
[reference/feature-map.md](reference/feature-map.md).*

**As of 25 September 2026.**

## Version

- The 0.4.5 work is committed as `3d41682` on the `general` branch (25
  September 2026): Ember and her walk, the desk widget back, your home
  workspace, Memories under You, Hinglish and rephrasing, Copy context,
  line answers and edits, lessons, other mail accounts, Google Contacts,
  nudges. `main` is the base for pull requests.
- **The release commit is still to come.** Committed, the version is 0.4.4;
  the working tree holds the bump to **0.4.5** in `package.json` and
  `package-lock.json`. Commit it as *Caulder 0.4.5: ...* once `npm run
  package` has built the installer and `smoke:packaged` passes against it.
- Checked against that commit: typecheck, lint, **2,260 unit tests in 142
  files** and knip all pass. The e2e suite was not run. It launches Electron
  about 40 times, so run one spec at a time, or run it in the background and
  say so.
- `shots/` (9 MB of screenshots) is untracked and deliberately left out.

## Done lately

See the dated phases in PLAN.md. The latest is *After 0.4, again - You apart,
memories yours, and Today about the work* (25 September 2026).

## In progress

- **Understanding, on this machine** (PLAN.md, part five): a small local model
  that helps the quick line put things where they belong, arranges memories,
  and chooses what goes to an AI. **Planned, not started; decided 25
  September 2026:** all-MiniLM-L6-v2 (int8, 23 MB) through `onnxruntime-node`
  in a utility process, on by default, repeats marked on their own, every
  other arrangement asked. Starts with phase 18.

## Known problems

Most important first. Each names the place to fix.

1. **Privacy: Today's Ask line can send your own pages with "your own pages"
   off.** `about()` in `electron/main/services/ask.ts` (around line 426)
   searches with `searchEverything`, which has no section filter
   (`repositories/search.ts`), then sends page bodies of up to 2,500
   characters. Asked from the home workspace, that can include Remembered,
   hobby, studies and goals pages, and journal days not yet sealed. Private
   lines are safe. No test covers it.
2. **Privacy: `ideas` pages go into the dossier regardless of the setting.**
   `RUNNING_SECTIONS` in `services/dossier.ts` (line 76) includes `ideas`,
   which `yours.ts` treats as personal. That means Random knowledge, Gift
   ideas and Quotes are sent when the dossier is built for the home workspace.
3. **Life facts never reach Ask**, even with "your own pages" on: `yours.ts`
   (line 35) leaves out `remembered`. It was decided on 25 September 2026 that
   they should go when the setting is on. This is fixed in phase 18.
4. `shared/email.ts` opens with "Caulder never sends anything", which is out
   of date since email through the script.
5. The `campaigns` table can no longer be filled from anywhere in the UI;
   leads and the spend list still read it as a label.
6. Coverage gaps: no e2e test for WhatsApp, do-not-contact or the built-in
   follow-up; no unit test for `services/scheduler.ts` or for custom fields;
   updates are tested only through `store-home.test.ts`.
7. PLAN.md, part one, still lists the Tour as removed. A one-time Today tour
   exists (`src/components/Tour.tsx`).

## Next

1. Package and smoke-test 0.4.5, then commit the version.
2. Phase 18: close problems 1 to 3, with tests.
3. Phase 19: the model, its index and the measuring stick.
