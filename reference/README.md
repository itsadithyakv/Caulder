# Caulder reference

Caulder is a desktop planner and CRM for a student founder — one person
running a company while doing a degree. It started as a replacement for a
spreadsheet of leads and a Google Apps Script that sent follow-ups and had no
idea what happened to any of them, and it grew the other half because a
follow-up does not slip when the CRM forgets it. It slips when the afternoon
goes.

So it holds the timetable, the gym, the club and the studying alongside the
funnel, and the two halves are one day rather than two apps.

It runs offline on a single machine. There is no server, no account and no
cloud: everything is one SQLite file in the user's app-data folder. Google
Calendar and Tasks sync through a script running in the user's own account,
off unless switched on.

## What is in here

Five of these files describe **shipped behaviour**. Anything dated — status,
progress, what is coming next — belongs in [../PLAN.md](../PLAN.md) or in Git history, not
here. New material goes into a section of one of those files rather than into a
new one. The sixth, the product review, is the exception: an opinion at a
point in time, dated, and meant to be argued with.

| File | Owns |
| --- | --- |
| [architecture.md](architecture.md) | The stack, the two processes, how they talk, and why each choice was made |
| [data-model.md](data-model.md) | Every table and column, and the rules the schema enforces |
| [features.md](features.md) | What the app actually does, screen by screen |
| [design-language.md](design-language.md) | Tokens, the flat look and its rules, both themes |
| [operations.md](operations.md) | Building, running, packaging, backups, where files live |
| [product-review.md](product-review.md) | What it is for, how well it does it, and what should change |

## The shape of it in one paragraph

You create a **company**, which is a workspace: its contacts, deals,
calendar and tasks. A second company gets its own, and the switcher moves
between them.

Selling: you **import** a spreadsheet (from a button on Contacts) and Caulder
normalises the mess, spots duplicates and lets you undo the whole thing. You
work the **contacts**, each with an append-only history, next steps and email.
**Deals** is those contacts as a board. **Money** is quotes, invoices, payments
and spend: four numbers a month and three lists. Email goes out from a contact's
page through your own Gmail, now or later, with replies noticed and one
automatic follow-up; WhatsApp opens in your own app.

Planning: the **calendar** is a grid of hours, readable a week at a time,
built from a timetable you enter once a term and repeated until it ends.
Notes are caught by the quick window and sit at the foot of Today.

Remembering: the **brain** holds what the company is - the profile and its
registration numbers (masked), the plan, prices, people, decisions,
playbooks - as pages in fifteen sections, each with a history, linked to each
other and to contacts with `[[`, and drawn as a map you can wander round. Its
legal name, address, GSTIN and bank account print on invoices. **Ctrl + K** searches all
of it, and the contacts, notes and invoices too.

**Today** is the home screen and the reason to open the app. It leads with the
hours — what you should be at this minute — then what is late, who has
replied, what is ready to send, what is due, and which leads are quietly going
nowhere.

## The rules that shaped it

- **Nothing is sent from Caulder.** It opens your own mail app or WhatsApp
  and asks afterwards whether it went; only a yes reaches the history.
- **The timeline is append-only.** A correction is a new entry, never an edit.
- **Elevation never means anything.** Status is colour plus label, always both.
- **Only what floats has a shadow.** Surfaces are flat and bordered; see
  [design-language.md](design-language.md).
- **No contact detail identifies a lead on its own.** See the dedupe rules in
  [features.md](features.md#import).
- **A due date is a calendar day, not an instant.** See
  [architecture.md](architecture.md#dates-and-timezones).
- **A number that cannot be said is null, never zero.** No spend recorded is
  not a spend of nothing, and no median observed is not a median of zero.
- **Where two things genuinely tie, Caulder refuses to rank them.** See the
  clash rule in [features.md](features.md).
- **Anything that acts on its own is off until switched on** — notifications,
  reminders, the Google sync.
