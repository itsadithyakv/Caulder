# The Microsoft Store listing

*What goes into Partner Center, written down so a submission is pasting
rather than composing. Rewritten 14 October 2026 for 1.0.0, the company-only
Caulder, from [feature-map.md](feature-map.md). It promises only what is
built. Kept short on purpose, as the app is.*

How the package is built and tried is in [operations.md](operations.md),
under *The Microsoft Store*.

## Properties

| | |
| --- | --- |
| **Name** | Caulder |
| **Category** | Productivity |
| **Price** | Free. No trial, no add-ons. |
| **Markets** | All |
| **Privacy policy URL** | `https://itsadithyakv.github.io/Caulder/privacy.html` (`docs/privacy.md`, published by GitHub Pages since 26 October 2026) |
| **Support contact** | `https://github.com/itsadithyakv/Caulder/issues` |
| **Website** | `https://github.com/itsadithyakv/Caulder` |

## Short description

> Run a one-person company from one app. Contacts, deals, money, your week
> and what the company knows - all on your computer. No account, no cloud.

## Description

> **Caulder is the one app a one-person company is run from.** Everything
> stays on your computer: no account, no cloud, no ads, and it is free.
>
> **One line for anything.** Type "call Priya tomorrow 4pm", "Priya wants
> the invoice by the 5th", "got 2400 from Harbour" or "our GST number is …"
> and Caulder files it: a task, a payment, something to remember. Ask it
> "what's on friday" or "what does Harbour owe" and it answers. One key
> opens it from any app.
>
> **Your week.** Today shows what is due, what is late, who to reach and
> who has gone quiet. The Calendar is your week in blocks, with a review of
> what happened and three things for the next one.
>
> **Your customers.** Contacts with their whole history, a deals board,
> email, WhatsApp, LinkedIn and Instagram from your own templates, and a
> call prompter.
>
> **Your money.** Quotes, invoices as PDFs, payments, retainers, reminders
> for late invoices, spend and runway.
>
> **Your company's brain.** Pages for everything the company knows, linked
> and drawn as a map, searched by meaning with a small model that runs on
> your own computer.
>
> **Yours.** One file holds everything, backed up on every launch to any
> folder you choose. Connect Google or an AI of your own only if you want
> to. Export everything at any time.

## What's new in this version

> The first version in the Store.

## Product features

Up to twenty, a line each:

1. One line for tasks, money, contacts and things to remember
2. Everything stays on your computer - no account, no cloud, no ads
3. Today: what is due, what is late, who to reach
4. A weekly calendar of blocks, with repeats
5. A weekly review, and three things for next week
6. Contacts, each with its whole history
7. A deals board with your own stages
8. Quotes, invoices as PDFs, payments and retainers
9. Reminders for late invoices, and what is owed by age
10. Spend, running costs and runway
11. Email, WhatsApp, LinkedIn and Instagram from your own templates
12. A call prompter that reads your script
13. A company brain: linked pages, drawn as a map
14. Search by meaning, with a model on your computer
15. Search everything with Ctrl+K
16. Open the quick line from any app with one key
17. Optional: your own Google Calendar, Tasks, Gmail and Sheets
18. Optional: ask an AI of your choice about your company
19. Backups on every launch, copied to any folder you choose
20. Light and dark

## Search terms

Seven at most: `founder`, `solo business`, `crm`, `freelancer`, `invoice`,
`planner`, `offline`.

## Store logos

From `branding/store/` (`branding/README.md` says which is which): the
300, 150 and 71 squares, box art, poster art and hero art.

## Screenshots

At least four, 1366 x 768 or larger, in light. Taken from the sample
company (*Look around with sample data*):

1. **Today**, with the quick line reading a typed line - the headline.
2. **A contact**, with history, next steps and money.
3. **Deals**, the board.
4. **Money**, the month and the invoices.
5. **The Calendar's week**, with the review at its head.
6. **The brain's Map.**

`shots/` is where they are kept; it is not in git. The ones there are from
0.5.0 and show what was removed: take them again.

## Age rating

The IARC questionnaire: no violence, no sexual content, no gambling, no
drugs, no bad language. The app does not share the user's location. Users
cannot talk to each other inside it. It makes no purchases. Under **does the
app access the internet**: yes, only for what the person connects (and the
update check, which a Store copy never makes).

## Generative AI

Caulder shows text an AI wrote only when the person has connected an AI of
their own and used it (Ask, AI mode on the line, a draft in the Brain). The
Store's policy asks for a way to report that output: **Settings > Your data
> Report a problem** opens an issue with a report the person reads first,
and the support contact above takes it.

## The restricted capability

electron-builder declares `runFullTrust`, as every packaged desktop app has
to. The submission asks why:

> Caulder is a desktop (Win32) application packaged as MSIX. It needs full
> trust to keep its database in the package's own LocalState folder, to
> register a system-wide shortcut that opens its quick-entry window, to show
> a tray icon and a small desktop widget, and to copy backups to a folder
> the user chooses.

## Notes for certification

> Caulder needs no account and no sign-in. On first launch, choose "Look
> around with sample data" to see every screen with data in it, or type a
> company name and choose "Create company". Google and AI connections are
> optional and can be skipped. All data is stored in the app's LocalState
> folder.

## Before each submission

1. `npm run fetch-model`, then `npm run verify`.
2. Bump the version in `package.json`: each submission needs a higher one.
3. `npm run package:store`, then `npm run smoke:packaged`; install and try
   it, and run the Windows App Certification Kit on it (operations.md).
4. Upload `release/Caulder-<version>-x64.msix`, paste what changed into
   *What's new*.
