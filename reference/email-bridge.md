# The Apps Script bridge

## The constraint

Apps Script runs in Google's cloud. Caulder runs offline on a PC. **Neither can
call the other.**

So the handover is files: Caulder writes an outbox, the script sends it and
writes a log, and Caulder reads the log back. The whole design turns on making
a file exchange safe to repeat, because it will be — the same log gets imported
twice, files arrive out of order, and somebody pastes the same outbox in again.

Caulder never sends anything. It has no SMTP, no OAuth and no network calls.

## The join key

Caulder generates a UUID `message_id` per queued email. **Apps Script must echo
it back untouched.** Every status update matches on it.

Nothing matches on address, subject or timestamp: all three are ambiguous, and
all three can be edited by the person sending.

## The two files

**Outbox** — Caulder writes, the script reads:

```
message_id, lead_id, to_email, subject, body_html, scheduled_for
```

**Log** — the script writes, Caulder reads:

```
message_id, status, sent_at, provider_message_id, thread_id, opened_at, replied_at, error
```

Both are CSV, written and parsed with exceljs. Bodies routinely contain commas,
quotes and newlines; hand-rolled CSV gets those wrong in a way nobody notices
until a spreadsheet opens shifted by one column.

**Log columns are matched by name, not position**, because a spreadsheet
somebody has opened and re-saved will not keep its column order. Only
`message_id` and `status` are required.

## The status ladder

```
queued → exported → sent → opened → replied
```

with `failed` and `skipped` as side exits.

**It never goes backwards.** An `opened` row arriving after a `replied` row is
ignored rather than losing the reply. That single rule is what makes importing
the same file twice harmless and out-of-order arrival a non-event.

`failed` and `skipped` rank *below* `sent` on purpose, so a message reported
failed and later reported sent ends up sent.

Statuses Caulder does not recognise are skipped rather than guessed at — the
script is someone else's code and may grow one this build has never heard of.

**Every status stamps its own timestamp**, falling back to the time the row was
read when the log omits one. Without that, a `replied` row with no `replied_at`
would set the status but leave the date null, and every later comparison
against it — *has this been answered since?* — silently never matches, because
a SQL comparison with NULL is unknown, not false.

## Retry

Five attempts, with capped exponential backoff: 2, 4, 8, 16, 32, then 60
minutes. Only the last is terminal; the rest go back to the queue with a time
before which the next export must not pick them up.

A terminal failure writes an `email_failed` entry on the lead's history with
the reason the script gave.

## Idempotency, both directions

- **Re-importing a log** is harmless: every row is an upsert keyed on
  `message_id`, and the ladder never regresses. The file's SHA-256 is recorded,
  so Caulder can say *"you have already read this one"* rather than leaving you
  wondering why nothing changed.
- **Re-sending an outbox** is prevented on the script side, which keeps a
  `Sent` sheet of ids it has already processed. Caulder also marks a message
  `exported` on write, so a second export of the same queue is empty.

## Ordering of the export

The file is written **first**, and only then are the messages marked exported.
A message marked exported for a file that failed to write would never be sent
and never be noticed.

## Sequences over the bridge

A step's `offset_days` counts from the previous step **actually being sent** —
which is only known when the log comes back. Counting from queue time would
collapse a three-week cadence into whichever day the export ran.

A `replied` row stops the cadence and drops anything still queued for it. A
lead reaching a won or lost stage does the same.

## The manual-bridge risk, and what is done about it

The plan named this: the bridge is manual, and half of it is easy to forget.
Somebody exports an outbox and never imports the log, and the app quietly shows
statuses that are weeks out of date.

**Today warns about it.** Comparing the newest outbox batch against the newest
log batch is enough to say so, with a button straight to the import.

---

# Setting up the script

Caulder ships `resources/appsscript/Caulder.gs`. **Settings → Email → Save the
Apps Script** writes it wherever you choose.

1. Create a Google Sheet with three tabs named exactly **Outbox**, **Log**,
   **Sent**.
2. Extensions → Apps Script, and paste the file in.
3. Set `SENDER` to the address you send from, or leave it blank to use the
   account running the script.
4. Run `processOutbox` once by hand and grant the permissions it asks for.
5. Triggers → add a time-driven trigger on `processOutbox`, hourly.
6. Optionally add a second hourly trigger on `checkReplies`.

Then, each time round:

- Caulder → **Export the outbox**, and paste its rows under the Outbox header.
- Let the trigger run.
- Download the **Log** tab as CSV, and Caulder → **Import a log**.

## Sending through Zoho instead of Gmail

`sendOne()` is the only function to change. Replace its body with a
`UrlFetchApp` call to the Zoho Mail API and return the ids it gives back.
Everything else in the script — and everything in Caulder — stays identical,
because the contract is the two CSV files and the `message_id`, not the
provider.

## What the script does

- Reads unprocessed Outbox rows, skipping any id already in the `Sent` sheet.
  A file pasted in twice is an ordinary mistake, and sending a lead the same
  email twice is not.
- Sends each one, appending a `sent` row with the provider message and thread
  ids, or a `failed` row with the error. **Failures are reported, never
  swallowed** — silence would mean it never went and nobody knew.
- A row with no address becomes `skipped` with a reason rather than being
  dropped.
- Stops after `MAX_PER_RUN` (50 by default). Gmail's own daily quota still
  applies.
- `checkReplies` looks at the threads it started and appends a `replied` row
  for any that now has a message from somebody else.

## The Google side, in short

Nothing in Caulder depends on Gmail specifically. What the bridge needs from
whatever sends the mail is exactly three things: **echo the `message_id`**,
**report a status per message**, and **do not send the same id twice**.
