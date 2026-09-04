# Caulder reference

Caulder is a desktop CRM for one person running one or more small businesses.
It replaces a spreadsheet of leads and a Google Apps Script that sends
follow-up emails but has no idea what happened to any of them.

It runs offline on a single machine. There is no server, no account and no
cloud: everything is one SQLite file in the user's app-data folder.

## What is in here

These six files describe **shipped behaviour**. Anything dated — status,
progress, what is coming next — belongs in the plan or in Git history, not
here. New material goes into a section of one of these files rather than into a
seventh file.

| File | Owns |
| --- | --- |
| [architecture.md](architecture.md) | The stack, the two processes, how they talk, and why each choice was made |
| [data-model.md](data-model.md) | Every table and column, and the rules the schema enforces |
| [features.md](features.md) | What the app actually does, screen by screen |
| [email-bridge.md](email-bridge.md) | The Apps Script handover: file formats, the status ladder, setup |
| [design-language.md](design-language.md) | Tokens, the neumorphic rules, both themes |
| [operations.md](operations.md) | Building, running, packaging, backups, where files live |

## The shape of it in one paragraph

You create a **company** — a workspace with its own leads, funnel and
templates. You **import** a spreadsheet; Caulder normalises the mess, spots
duplicates and lets you undo the whole thing. You work the **leads**: each has
an append-only history, next steps, and email. The **pipeline** is those leads
as a board. **Today** is the home screen and the reason to open the app: what is
late, who has replied, what is ready to send, what is due, and which leads are
quietly going nowhere. **Email** is written and queued in Caulder but sent by
your own Apps Script, which reports back through a pair of CSV files.

## The rules that shaped it

- **Nothing is sent from Caulder.** It queues and tracks; Apps Script sends.
- **The timeline is append-only.** A correction is a new entry, never an edit.
- **Elevation never means anything.** Status is colour plus label, always both.
- **Neumorphism is for chrome, not content.** See
  [design-language.md](design-language.md).
- **No contact detail identifies a lead on its own.** See the dedupe rules in
  [features.md](features.md#import).
- **A due date is a calendar day, not an instant.** See
  [architecture.md](architecture.md#dates-and-timezones).
