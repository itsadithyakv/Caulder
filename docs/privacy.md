---
title: Caulder - privacy
---

# Privacy

*Caulder, the desktop app. Written 26 September 2026.*

**Caulder keeps everything on your computer.** There is no Caulder account,
no Caulder server, no advertising, no analytics and no tracking. Nothing
about you is sent to the person who makes Caulder, ever.

## What stays on your computer

Everything you put into Caulder: your companies, contacts, deals, money,
tasks, calendar, pages, memories, journal and files. It is kept in one
database file in your Windows user folder (for the Microsoft Store copy, in
the app's own folder under `AppData\Local\Packages`).

- Passwords and keys you give Caulder (a mail account's app password, an AI
  service's key, the address of your Google script) are encrypted with your
  Windows account before they are stored.
- The journal can be locked with a passcode of your own.
- **Understanding** - the small model that reads what you write for what it
  means - runs on your computer. What it reads never leaves it, and it never
  reads the journal or a private line.
- Backups are copies of the database, written to a folder on your computer
  that you can choose.

## What leaves your computer, and only when

Nothing leaves until you connect something yourself, with one exception: the
update check.

| What | When | Where it goes |
| --- | --- | --- |
| **The update check** | The installer copy, a little after it starts and every few hours. The Microsoft Store copy never looks: the Store updates it. | GitHub, to read which version is newest. It sends nothing about you; GitHub sees your IP address, as any website does. |
| **Google** (Calendar, Tasks, Gmail, Contacts, Drive backups, a brain shared between two founders) | Only after you put the Caulder script into your own Google account and connect it. | Your own Google account, through that script. Caulder has no access to Google of its own. |
| **Other mail accounts** | Only when you add one, and when you send from it. | That account's mail server, to send the email you wrote. |
| **An AI** (Ask) | Only after you connect one, and only when you ask it something. | The service you chose, with your question and the part of your company that goes with it. Your own pages go only if you switch that on; the journal never goes. With Ollama, it stays on your computer. |
| **Book covers** | Only if you switch them on. | Open Library, with the title of each book on your shelf, once, to find its cover. |
| **A problem report** | Only if you open one and send it yourself. You see all of it first, with emails, numbers and your Windows name taken out. | A GitHub issue, which is public. |

Caulder also opens other programs when you ask it to - your mail app, WhatsApp,
your browser - and what you do there is up to them.

## The Microsoft Store

If you install Caulder from the Microsoft Store, Microsoft handles the
download and updates under its own privacy statement. Uninstalling the Store
copy removes its data folder, as Windows does for every Store app; a backup
folder you chose elsewhere is kept.

## Supporting Caulder

Caulder is free. If you support it through GitHub Sponsors or UPI, that
payment happens on GitHub or in your UPI app, under their terms. Caulder
itself never learns whether you did.

## Children

Caulder is not made for children under 13 and collects nothing from anybody.

## Questions

Open an issue at <https://github.com/itsadithyakv/Caulder/issues>. If this
page changes, the date at the top changes with it.
