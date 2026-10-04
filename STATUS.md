# Status

*Where Caulder stands right now. Dated, and rewritten as it changes - in the
same commit as the work, not afterwards. What is planned is in
[PLAN.md](PLAN.md); where everything lives is in
[reference/feature-map.md](reference/feature-map.md).*

**As of 5 October 2026.**

## Version

- **0.5.0** is packaged on the `general` branch (5 October 2026), as an
  installer and as the Store package: phase 25, on Electron 43. `main` is the
  base for pull requests.
  - It carries phases 20 to 24 and the fixes of 27 September on top of
    0.4.5 (`31f29d9`): the line's second opinion, memories arranged, Ask and
    export by meaning, About Caulder and the ask for support, licences,
    formats by region, the new sample, a copy off this computer, and Ember's
    fixes and clothes.
  - `npm run package` builds `Caulder Setup 0.5.0.exe` (137.3 MB; Electron
    43 is larger than 38); `smoke:packaged` passes its 12 checks.
  - `npm run package:store` builds `Caulder-0.5.0-x64.appx` (200.0 MB,
    unsigned on purpose). Opened and checked: the reserved identity at
    0.5.0.0, the model, the licences, and one binary each for SQLite, koffi
    and the ONNX runtime. Not yet installed or put through the Windows App
    Certification Kit.
  - Both leave out better-sqlite3's binaries for other platforms (14 MB).
- Checked:
  - `npm run verify`: 2,394 unit tests in 155 files, typecheck, lint and
    knip all pass.
  - The whole e2e suite was run on Electron 43 on 5 October: 238 passed,
    and Ember's 15 once her clock was set (see Known problems). It launches Electron about
    40 times, so run one spec at a time, or run it in the background and
    say so.
- Not released: nothing is published to GitHub Releases or the Store.
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
  - **Phase 20 was done on 26 September 2026.** The quick line takes a
    second opinion on the readings it only guessed at: the kind, where a
    memory goes, and a task's area.
    - On 89 labelled lines it gets 73 right against 63 by the rules alone,
      and 75 against 62 with your own things filed; 6 of 9 memories go on
      the right page. Nothing the rules had right is made wrong.
    - The thresholds were tuned on those same lines, so the gain on new
      lines will be smaller. Measure again on new lines before moving them.
  - **Phase 21 was done on 26 September 2026.**
    - A memory said again is marked on its own (migration 47).
    - Loose lines on Random knowledge or Me are offered to your existing
      pages.
    - Recall works by meaning too.
    - A brain page shows what is near it in meaning.
    - **Loose lines are not gathered into new pages:** measured, and this
      model cannot tell topics apart that way.
  - **Phase 22 was done on 26 September 2026.**
    - Ask chooses by meaning as well as words.
    - Export for an AI can add *04 you* and say what it is for.
    - The topic brief takes meaning into account.
    - Part five is done, but for suggested links drawn faint on the Map, and
      the two "later, not planned" ideas: contacts like this one, and
      duplicate contacts.
  - **Get the model with `npm run fetch-model`.** It is pinned and checked,
    and kept out of git. Without it everything else works and its tests are
    skipped.

- **Part six: one founder, one app, ready for other people** (PLAN.md,
  written 26 September 2026). Caulder is **free**, supported WinRAR's way,
  through GitHub Sponsors and UPI.
  - **Phase 23 was done on 26 September 2026.**
    - About Caulder is the last card in Settings.
    - The ask for support sits at the foot of Today (setting `supportAsk`).
    - The licences are written by every build and ship with the package.
    - The privacy page is `docs/privacy.md`.
  - **Phase 24 was done on 27 September 2026.**
    - Money and dates are written the way they are where the company is.
      Days no longer read one early in the Americas: they were formatted in
      the local clock from midnight UTC.
    - The sample is a one-person studio with clients anywhere, in dollars.
    - The first run says what Caulder is for, and the setup guide starts
      with a copy off this computer, offering OneDrive, Dropbox or Google
      Drive by name.
  - **Three things only you can do before handing it out:** enrol in GitHub
    Sponsors, choose a UPI ID (`SUPPORT` in `shared/support.ts`), and switch
    on GitHub Pages for `/docs`.
  - Phases 24 to 30 are planned: a first run for any founder, 0.5.0, Market,
    Make, money from shops online, the weekly plan, and Google with a guide.

## Known problems

### Before Caulder is handed out (26 September 2026)

- **The typeface stays Gilroy** - *decided 5 October 2026.* It is a
  commercial face (`resources/fonts`, bundled into every build), so handing
  Caulder out needs a licence from its foundry that covers an app. That is
  the author's to arrange; it is not a thing to swap out again.

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

### Fixed on 5 October 2026

- **Ember's tests failed from one to six in the morning**, when she is
  asleep behind her door: `e2e/ember.spec.ts` and the "Ember comes out"
  check in `smoke:packaged`. Both set the window's clock to mid-morning now.

- **A test that failed before half past five in the morning**:
  `services/yourhome.test.ts` took today in UTC for a company in Kolkata.
  It asks for the company's own day now.

### Fixed on 29 September 2026

- **Ember on the taskbar is a small dot by default.** Walking all day by the
  clock was distracting. She can be a dot (rests by the clock, comes out when
  pointed at, back after a moment, brighter when something waits), walking,
  or hidden: Settings > This computer > Ember > On the taskbar. The old
  on/off setting keeps its meaning; never set is now a dot.
- **The line's rules read more shapes**: ideas asked of yourself, somebody
  who could, a thing named or pitched; a day summed up or said to have been
  (Hinglish read as typed, since `expand()` rewrote it); how a thing goes,
  with its time, as a note; plain facts as memories; errands said alone;
  spends of two things; and "felt like…" is no longer a person called Felt.
  Measured on three sets:

  | | Rules before | Rules after | With the model after |
  | --- | --- | --- | --- |
  | Tuned 89 | 63 | 82 | 83 |
  | Fresh 89 (the rules were written against its misses) | 43 | 78 | 78 |
  | **Blind 90** (written without reading the rules) | **40** | **48** | **50** |

  The blind set is the honest one: about half the lines right by the rules
  alone. Nothing is broken on the tuned and fresh sets; on the blind set,
  lived in, one note ("the landing page takes 4 seconds on 3g") is moved to a
  task by a close page of the person's own.
- **A test that depended on the date**: `services/lines.test.ts` ticked a
  habit a week back from the real today. It passes its own clock now.
- **The whole e2e suite was run** (29 September): 228 passed and 6 failed
  at first. Fixed:
  - the tour said the quick key as "Ctrl Super A"; it now says "Ctrl Win A"
    through `sayShortcut`, and its spec expected the key from before 0.4.5;
  - `quickadd.spec.ts` expected "4:00 PM", where phase 24 writes "4:00 pm"
    for a company in India; it accepts either;
  - `context.spec.ts` looked for any button with "Copy" in it, and found
    "Keep a copy elsewhere" too;
  - `hub.spec.ts` and `quickadd.spec.ts` used lines the rules now read
    rightly by themselves, where they needed ones the rules only guess at;
  - `ember.spec.ts` assumed her own pick never included the beanie.
  The splat, map-link and money failures passed on a second run: flaky, like
  "dropped below her line".

### Fixed on 27 September 2026

- **Cards vanished when Ember landed on them, or was thrown hard.** The
  thump replaced the card's own entrance animation (`.anim-stagger`, fill
  `both`), and taking it off started the entrance again from nothing. The
  thump and the window's quake are now played with `element.animate()`.
- **A dark line across her flame** on one frame of her flicker: an empty row
  in `TORSO[1]`, which her ink outline filled.
- **The marshmallow screen** was a flat pink wash with a small box over the
  page. Now the page is smoked, and she is in the middle of it, furious, with
  what happened and what to do.
- **Twelve more clothes** (28 in all): a cap, a beret, headphones, a halo,
  heart shades, a monocle, a tie, a medal, a puffer vest, a cape, blue
  high-tops and gold trainers, unlocked from level 2 to 20. Her own pick now
  changes her neck and feet too.
- **The line's second opinion, measured on 89 fresh lines** (`lines.fresh.eval.ts`):
  - with 0.36 for overturning a note, rules 43 against the model 48, but two
    or three right notes made into tasks - over-fitted to the 89 it was
    tuned on;
  - `bestOverNote` is now 0.44: the fresh lines score the same (48, and 48
    lived-in), nothing is broken on either set, and the tuned set drops from
    73 and 75 to 69, the wins that only existed there;
  - the fresh set now holds the same bar as the tuned one: nothing broken.
  - The model helps least where the rules are weakest. The rules get 4 of 24
    memories and none of 11 ideas on the fresh lines; the gains left are in
    the rules, not the model's thresholds.

### Flaky

- `e2e/ember.spec.ts`, "dropped below her line": the grab can land while she
  is still on her way back, and she is never held. Passes on a second run.

- `services/journal-lock.test.ts` can time out (5 s) in a full parallel run,
  because the passcode's key is slow to make on purpose (scrypt 2^17). It
  passes alone. It wants a longer timeout.

### Dependencies

- **Electron is 43.7.7** (phase 25, 5 October 2026; it was 38.8.6). That
  clears its own high advisories and `extract-zip`'s, which 43 no longer
  uses. 43 rather than 44, the newest: 44 remakes the `clipboard` module to
  return promises, and main reads and writes the clipboard at once in six
  places (the copied number that wipes itself, the topic brief). That is the
  next update's work, on its own.
- `npm audit fix` took the rest that had a fix. Two are left, neither of
  which can be reached from Caulder:
  - `braces` (high), inside knip, which never ships and reads only this
    repository's own patterns;
  - `uuid` (moderate), inside `exceljs`: a bounds check in v3, v5 and v6
    when the caller gives a buffer, which exceljs does not do.

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

14. ~~An invoice can be deleted whatever its status.~~ Fixed in phase 25:
    `deleteInvoice` refuses anything but a draft.
15. Class, Study and Admin share one grey on the Calendar (`day.css`).
16. ~~Money and dates follow the computer's locale, not the company's.~~
    Fixed in phase 24, with days one early west of Greenwich.
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

1. **To put 0.5.0 in the Store**, which only the author can do:
   - GitHub Sponsors, a UPI ID, and GitHub Pages for the privacy URL;
   - install the Store package and try it, then run the Windows App
     Certification Kit on it (`reference/operations.md` has both, with
     Developer Mode on and an administrator's PowerShell);
   - take the screenshots, and paste `reference/store-listing.md` into
     Partner Center with the `.appx`.
2. Phase 26, Market - the first of the pillars still missing.
3. The line's rules, on the blind set's misses (29 September): hobby
   know-how said as an instruction ("deload every sixth week"), notes with a
   time ("netbanking is under maintenance till 6pm"), past days named by a
   weekday ("tuesday was a blur of meetings"), spends with the amount first
   ("swiggy 320 lunch"), and contact details in a line ("karthik ph …").
   Write a new blind set before tuning again: the blind set stops being blind
   once rules are written against it.
4. Campaigns (item 10) are settled by phase 26, Market. Ctrl+K for products
   and deals (item 12) needs a migration.
