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

See the dated phases in PLAN.md. The latest is *After 0.4.5 - The journal,
locked properly, and looking back* (25 September 2026): today locked as it is
written, locking when the computer does, a recovery key, stronger passcodes,
the journal's own search, screen capture shielded, and Looking back through
Ollama on this computer. **Not committed yet.** Checked: typecheck, lint,
knip, and the lock, private-line and Looking back unit tests. The journal-lock
e2e spec was updated and needs a run after `npm run build`.

**Phase 18, done 25 September 2026, not committed yet.** Nothing of yours
reaches an AI without the switch: `mayGoToAi` in `shared/brain.ts` is the
one check, used by `about()` in `services/ask.ts` and by the dossier. A
journal page never goes by that road, and anything in your home workspace
counts as yours whatever its section. Life facts (`remembered`) now go in
the You document when the switch is on. The full unit run passes: 2,286
tests in 144 files, with the journal work above in the same tree.

## In progress

- **Understanding, on this machine** (PLAN.md, part five): a small local model
  that helps the quick line put things where they belong, arranges memories,
  and chooses what goes to an AI. **Planned, not started; decided 25
  September 2026:** all-MiniLM-L6-v2 (int8, 23 MB) through `onnxruntime-node`
  in a utility process, on by default, repeats marked on their own, every
  other arrangement asked. Phase 18 is done; phase 19, the model itself, is
  next.

## Known problems

Most important first. Each names the place to fix.

1. `shared/email.ts` opens with "Caulder never sends anything", which is out
   of date since email through the script.
2. The `campaigns` table can no longer be filled from anywhere in the UI;
   leads and the spend list still read it as a label.
3. Coverage gaps: no e2e test for WhatsApp, do-not-contact or the built-in
   follow-up; no unit test for `services/scheduler.ts` or for custom fields;
   updates are tested only through `store-home.test.ts`.
4. PLAN.md, part one, still lists the Tour as removed. A one-time Today tour
   exists (`src/components/Tour.tsx`).

## Next

1. Package and smoke-test 0.4.5, then commit the version.
2. Commit the journal work and phase 18.
3. Phase 19: the model, its index and the measuring stick.
