# The Microsoft Store listing

*What goes into Partner Center, written down so a submission is pasting
rather than composing. Written 5 October 2026 for 0.5.0. It promises only
what is built: when Market and Make land (PLAN.md, phases 26 and 27), the
description gains them and not before.*

How the package is built and tried is in [operations.md](operations.md),
under *The Microsoft Store*.

## Properties

| | |
| --- | --- |
| **Name** | Caulder |
| **Category** | Productivity |
| **Price** | Free. No trial, no add-ons. |
| **Markets** | All |
| **Privacy policy URL** | `https://itsadithyakv.github.io/Caulder/privacy.html` (`docs/privacy.md`; GitHub Pages has to be switched on first) |
| **Support contact** | `https://github.com/itsadithyakv/Caulder/issues` |
| **Website** | `https://github.com/itsadithyakv/Caulder` |

## Short description

> One app to run a one-person company and the life around it. Everything
> stays on your computer: no account, no cloud, no ads.

## Description

> **Caulder is where a one-person company is run - and the life around it.
> Everything you put in it stays on your computer. There is no account, no
> cloud and no ads, and it is free.**
>
> Most founders run on a calendar, a spreadsheet of contacts, a notes app, an
> invoice template and a to-do list that do not know about each other.
> Caulder is one place for all of it, built around one line you type the way
> you would say it.
>
> **One line for anything.** Type "call Priya tomorrow 4pm", "chai and
> samosa 60", "sharks are older than trees" or "rough day, but shipped it".
> Caulder works out whether it is a task, money spent, something to
> remember or your journal, says where it is going, and puts it there. Ask
> it "what's on friday" or "did I go to the gym this week" and it answers
> from what it holds. From any other app, one key opens the line.
>
> **Your day.** Today shows what is due, what is late and who has gone
> quiet, beside your habits and your journal. The Calendar is your week in
> blocks.
>
> **Your customers.** Contacts with their whole history, a deals board, a
> call prompter that reads your script, email and WhatsApp from templates,
> quotes, invoices as PDFs, payments, what you spend and how long the money
> lasts.
>
> **Your brain.** Pages for everything the company knows, linked to each
> other and drawn as a map. Memories - the small facts you tell it - filed
> where they belong and found by what they mean, by a small model that runs
> on your own computer.
>
> **You.** A journal you can lock with a passcode, goals, habits, hobbies and
> what you are reading.
>
> **Local, and yours.**
> - One file on your computer holds everything. Back it up to any folder -
>   OneDrive, Dropbox and Google Drive folders are offered by name.
> - Nothing leaves your computer unless you connect something yourself:
>   your own Google account for calendar and email, or an AI of your choice
>   to ask questions of your own data. Both are optional.
> - Export everything, any time, as spreadsheets and plain documents.
>
> **Free.** Caulder is made by one college student in India. Everything
> works, always. If it earns its place in your day, there is a way to say
> thanks in Settings.
>
> And Ember, a small flame who lives on the line, keeps you company.

## What's new in this version

> The first version in the Store.

## Product features

Up to twenty, a line each:

1. Type anything in one line: tasks, money, memories and your journal are sorted for you
2. Everything stays on your computer - no account, no cloud, no ads
3. Today: what is due, what is late, and who has gone quiet
4. A weekly calendar of blocks, with repeats
5. Contacts, each with its whole history
6. A deals board with your own stages
7. Quotes, invoices as PDFs, payments, spend and runway
8. A call prompter that reads your script
9. Email and WhatsApp from your own templates
10. A company brain: linked pages, drawn as a map
11. Memories found by what they mean, by a model that runs on your computer
12. A journal you can lock with a passcode
13. Habits, goals, hobbies and a reading shelf
14. Search everything with Ctrl+K
15. Open the quick line from any app with one key
16. Optional: your own Google Calendar, Tasks and Gmail
17. Optional: ask an AI of your choice about your own data
18. Backups on every launch, copied to any folder you choose
19. Export everything as spreadsheets and documents
20. Light and dark

## Search terms

Seven at most: `founder`, `solo business`, `crm`, `planner`, `journal`,
`invoice`, `offline`.

## Screenshots

At least four, 1366 x 768 or larger, in light. Taken from the sample
company (*Look around with sample data*), which is a studio with clients
in eight cities and reads well to anybody:

1. **Today**, with the quick line reading a typed line - the headline.
2. **A contact**, with history, next steps and money.
3. **Deals**, the board.
4. **Money**, the month and the invoices.
5. **The brain's Map.**
6. **The journal**, or Life.

`shots/` is where they are kept; it is not in git.

## Age rating

The IARC questionnaire: no violence, no sexual content, no gambling, no
drugs, no bad language. The app does not share the user's location. Users
cannot talk to each other inside it. It makes no purchases. Under **does the
app access the internet**: yes, only for what the person connects (and the
update check, which a Store copy never makes).

## Generative AI

Caulder shows text an AI wrote only when the person has connected an AI of
their own and asked it something (Ask). The Store's policy asks for a way to
report that output: **Settings > Your data > Report a problem** opens an
issue with a report the person reads first, and the support contact above
takes it.

## The restricted capability

electron-builder declares `runFullTrust`, as every packaged desktop app has
to. The submission asks why:

> Caulder is a desktop (Win32) application packaged as MSIX. It needs full
> trust to keep its database in the package's own LocalState folder, to
> register a system-wide shortcut that opens its quick-entry window, to show
> a tray icon, and to copy backups to a folder the user chooses.

## Notes for certification

> Caulder needs no account and no sign-in. On first launch, choose "Look
> around with sample data" to see every screen with data in it, or type a
> company name and choose "Create company". Google and AI connections are
> optional and can be skipped ("Skip this for now"). All data is stored in
> the app's LocalState folder. While Caulder is not the active window, a small
> glowing dot rests by the clock; pointing at it shows a flame character, and
> clicking it opens Caulder. It can be turned off in Settings > This computer
> > Ember > On the taskbar > Hidden.

## Before each submission

1. `npm run fetch-model`, then `npm run verify`.
2. Bump the version in `package.json`: each submission needs a higher one.
3. `npm run package:store`, then install and try it, then run the Windows
   App Certification Kit on it (operations.md).
4. Upload the `.appx`, paste what changed into *What's new*.
