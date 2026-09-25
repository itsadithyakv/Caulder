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

Most important first. Each names the place to fix. From a second pass on 25
September 2026: code swept for unwired calls, the documents checked against
the code, and 85 realistic lines put through the quick line. Items marked
*read, not run* were found by reading the code.

### Wrong, and a person would hit it

1. **Do not contact does not stop mail already scheduled.** The flag is checked
   only when a message is made (`services/mail.ts`, `sendEmail`);
   `dueAccountEmails` (`repositories/mail.ts`) sends scheduled mail from other
   accounts without looking again, and a follow-up the Google script holds is
   not cancelled. Call from a Today task still opens the prompter for a
   flagged contact (`TodayScreen.tsx`); dialling itself is refused.
2. **Ctrl+K in a page's editor both types `[[` and opens search** (*read, not
   run*): the window's handler (`src/lib/shortcuts.ts`) runs whatever
   `defaultPrevented` says, after the editor's `Mod-k` has already acted.
3. **The quick line's early rules misfire** (about 80% of 85 realistic lines
   land right; tasks, feelings and life facts do well):
   - "book train tickets" ticks the Read habit, and so does any line with
     "book" in it.
   - "atomic habits: 1% better every day" makes a daily repeating task.
   - "did i go to gym this week" is read as a report and ticks Gym instead
     of being answered.
   - A contact named with "today" becomes a task ("grateful for amma's food
     today").
   - A fact or a debt about a contact goes to the contact, and the same line
     about a non-contact goes to a memory.
   - "zomato 450 last night" is not read as money; only "yesterday" is.
   - Trivia and ideas with no lead-in ("honey never spoils", "could partner
     with coaching centres") fall to note. Phase 20 can help with these; the
     misfires above it cannot, because they happen before the model is asked.
4. **Your data card says "Nothing is sent anywhere"** (`DataSafety.tsx`),
   which is false once Google, mail, an AI, sharing or updates are on.

### Built underneath, but no screen offers it

5. A payment cannot be recorded in part, or taken back: `money.addPayment` and
   `money.deletePayment` are never called, and only *Mark paid* exists.
6. A task has no edit form: `tasks.update` is never called, and only the line
   can rename or move a task.
7. A repeating block's whole series cannot be edited (`day.updateSeries`), and
   a term cannot be deleted (`terms.remove`).
8. Drive backups can be made but not listed or restored
   (`google.driveBackups`).
9. The going-quiet threshold (`coldAfterDays`) is read but nothing sets it,
   though features.md calls it settable.
10. The `campaigns` table cannot be filled from anywhere; leads, import and
    spend still carry the plumbing.
11. Deals has no totals line (open, weighted, count), which part one promised,
    and its column values print without a currency.
12. Ctrl+K cannot find products or deals, which part two promised.
13. The "Ask the AI instead" button in `QuickAdd.tsx` can never show: nothing
    passes `onAi`.

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

1. Package and smoke-test 0.4.5, then commit the version.
2. Fix 1 to 4 above: two are privacy and trust, two are the line doing the
   wrong thing confidently.
3. Phase 19: the model, its index and the measuring stick. The 85 lines from
   the second pass are the start of the measuring stick.
