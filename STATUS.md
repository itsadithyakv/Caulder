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

- **Understanding, on this machine** (PLAN.md, part five). **Phase 19 was
  done on 26 September 2026.**
  - all-MiniLM-L6-v2 (int8, 23 MB) runs through `onnxruntime-node` in a
    utility process.
  - It reads pages, memories, contacts, tasks and notes into migration 46's
    vectors, working through a queue that triggers fill. It never reads the
    journal or private lines.
  - It is on by default, switched in Settings > This computer >
    Understanding.
  - **Measured:**
    - the model loads in 112 ms;
    - a line is read in 1.5 ms;
    - a batch of 32 is read in 29 ms.
  - **Packaged:** the 0.4.5 installer is 132.7 MB; 0.4.4 was 109.3 MB.
    `smoke:packaged` passes all 11 checks, "reads for meaning" among them.
    The first start of a new build was once slower than 60 seconds while
    Windows looked the runtime over, so the check waits 90.
  - **Not done:** nothing uses the vectors yet. The measuring stick moved to
    the start of phase 20, which gives the quick line its second opinion.
  - **Get the model with `npm run fetch-model`.** It is pinned and checked,
    and kept out of git. Without it everything else works and its tests are
    skipped.

## Known problems

Most important first. Each names the place to fix. From a second pass on 25
September 2026: code swept for unwired calls, the documents checked against
the code, and 85 realistic lines put through the quick line. Items marked
*read, not run* were found by reading the code.

### Fixed on 25 September 2026

1. **Do not contact now stops what was scheduled.** `stopBarredMail`
   (`services/mail.ts`) cancels a contact's waiting mail when it is marked,
   and again on each mail pass for anything the script could not be reached
   about. `dueAccountEmails` never picks up mail to a marked contact. Today
   offers no Call for one.
2. **Ctrl+K in a page's editor starts a link and nothing else**:
   `src/lib/shortcuts.ts` leaves it alone when the editor has already acted,
   as Escape does. Checked in a window by `e2e/writing.spec.ts`.
3. **The quick line's misfires**:
   - "book train tickets" ticks nothing. What a line hangs off (Reading)
     can name a habit but never says it was done.
   - A when inside what a heading says ("atomic habits: 1% better every
     day") makes no task.
   - "did i go to gym this week" is a question, answered from habits,
     hours, hobby time and done tasks across home and company. Nothing is
     ticked.
   - Thanks said first is the journal.
   - "last night" and "this morning" are heard on money.
   - "kal kya hai" is a question about tomorrow.
4. **Your data card** says what connections send, rather than that nothing
   is sent.

### Also fixed on 25 September 2026

- **The journal's `@` offers every company's contacts again.** Pages in your
  home reach every company (`reachFrom`, `repositories/links.ts`); a company's
  pages still reach only their own company. The journal had lost this in
  0.4.5, which was committed without the e2e suite.
- **A fact about a contact's life is a memory**, on their page under People,
  which links to the contact once. Before, it went on their history, where
  "what's amma's bp tablet" had nothing to answer from. What a contact *likes*
  still goes on their history: for a client that is where a deal stands.
  "bp tablet", "thyroid pills" and the like are now facts too.
- **Plain facts and ideas with no marker word**:
  - "honey never spoils" and "the eiffel tower grows 15cm in summer" are
    facts;
  - "could partner with…", "we should try…", "how about a…" and "an app
    that…" are ideas.
  - Only those shapes: "the server never responds" is still a note. The
    wider middle is phase 20's.

### Flaky

- `services/journal-lock.test.ts` can time out (5 s) in a full parallel run,
  because the passcode's key is slow to make on purpose (scrypt 2^17). It
  passes alone. It wants a longer timeout.

### Dependencies

- `npm audit` reports four, none from `onnxruntime-node`:
  - Electron (high: use-after-free fixes in newer releases);
  - `extract-zip` (high, through Electron's packaging);
  - `exceljs` via `uuid` (moderate).
- Updating Electron is the one that matters, and is a change of its own.

### Built underneath, now on a screen (26 September 2026)

- **Payments:** Record a payment (part payments too) and take one back, from
  an invoice's row; *Mark paid* stays the one click.
- **Tasks:** edited from a pencil on the row, on Today and on a contact.
- **Repeats:** "Save every one from here" changes the name, time, length and
  kind from that day on; past ones are left alone.
- **Terms:** removed from the Timetable dialog. They are kept in your home
  now, where the line reads them.
- **Drive backups:** listed on the Data card when asked. They cannot be
  opened from there (the script sends no link), and restoring means
  downloading one into the backups folder first.
- **Going quiet:** set in Settings > Reminders, 3 to 90 days.
- **Deals:** a line of totals (open, value, weighted by stage) in the
  company's currency.
- **"Ask the AI instead"** was removed: the Ask switch replaced it.
- `e2e/askline.spec.ts` was broken since 0.4.5 by the same switch, and is
  mended.

### Still missing underneath

10. The `campaigns` table cannot be filled from anywhere; leads, import and
    spend still carry the plumbing. Keep it, or take it out? Needs a
    decision.
12. Ctrl+K cannot find products or deals, which part two promised. That
    needs a migration that recreates the search triggers.

### Smaller

14. An invoice can be deleted whatever its status; the draft-only rule lives
    only on the screen (`repositories/money.ts`).
15. Class, Study and Admin share one grey on the Calendar (`day.css`).
16. Money and dates follow the computer's locale, not the company's.
17. Coverage: no e2e test for WhatsApp, do-not-contact or the built-in
    follow-up; no unit test for `services/scheduler.ts` or custom fields.
18. Dead ends: `day.setHabit`, `life.lookBackLocal`, `activeCompanyGet`,
    `.modeswitch*` and `.nm-*` CSS.

### Documents out of date

19. features.md: the keyboard table (no J, Y, R, A; the quick-window key is
    Ctrl+Win+A), the Settings table (no mail accounts, lessons, desk widget,
    Ember), the order of Today's sections, "queued email".
20. README: campaigns, "bridge file formats", and its table of documents.
21. PLAN.md, part one: the Tour listed as removed; "the count is four"
    (there are twelve in `package.json`, six of them CodeMirror).
    `CLAUDE.md` and `architecture.md` are correct.
22. `shared/email.ts` opens with "Caulder never sends anything".

## Next

1. Commit the 0.4.5 version. The package is built and passes
   `smoke:packaged`.
2. Phase 20:
   - first the measuring stick;
   - then the line's second opinion.
3. Decide on campaigns (item 10). Ctrl+K for products and deals (item 12)
   needs a migration.
