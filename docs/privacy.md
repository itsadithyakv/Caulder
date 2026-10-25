---
title: Caulder - privacy
---

# Privacy

*Caulder, the desktop app. Written 26 September 2026; changed 10 October 2026.*

**Caulder keeps everything on your computer.** There is no Caulder account,
no Caulder server, no advertising, no analytics and no tracking. Nothing
about you is sent to the person who makes Caulder, ever.

## What stays on your computer

Everything you put into Caulder: your companies, contacts, deals, money,
tasks, calendar, notes, pages, memories and files. It is kept in one
database file in your Windows user folder (for the Microsoft Store copy, in
the app's own folder under `AppData\Local\Packages`).

- Passwords and keys you give Caulder (a mail account's app password, an AI
  service's key, the address of your Google script) are encrypted with your
  Windows account before they are stored.
- **Understanding** - the small model that reads what you write for what it
  means - runs on your computer. What it reads never leaves it.
- Backups are copies of the database, written to a folder on your computer
  that you can choose.

## What leaves your computer, and only when

Nothing leaves until you connect something yourself, with one exception: the
update check.

| What | When | Where it goes |
| --- | --- | --- |
| **The update check** | The installer copy, a little after it starts and every few hours. The Microsoft Store copy never looks: the Store updates it. | GitHub, to read which version is newest. It sends nothing about you; GitHub sees your IP address, as any website does. |
| **Google** (Calendar, Tasks, Gmail, Contacts, Drive backups) | Only after you put the Caulder script into your own Google account and connect it. | Your own Google account, through that script. Caulder has no access to Google of its own. An invoice or a quote you email from Gmail carries its PDF to the script, which sends it from your account and does not keep it. |
| **Your contacts as a Google Sheet** | Only if you switch it on, a company at a time, after Google is connected. Then every ten minutes while Caulder is open, and when you press Sync. | A spreadsheet in your own Google Drive, through the same script. It holds each contact's name, the person to ask for, email, phone, city, LinkedIn, Instagram, website, where they came from and notes, with their stage, value, next step and when you last spoke. Not their history, your money or your pages. Stopping leaves the sheet in your Drive; delete it there. |
| **Other mail accounts** | Only when you add one, and when you send from it. | That account's mail server, to send the email you wrote. A reminder about an unpaid invoice is such an email: you see it, and press send. So is an invoice or a quote you email from Money, with its PDF attached if you leave that ticked - the file goes to the client, through your account, and nowhere else. |
| **Seeing replies in another mail account** | Only if you switch it on for that account. Then every ten minutes while Caulder is open and a message you sent from it could still be answered. | That account's own mail server, which Caulder signs in to and asks who has written. It reads only who each message is from, when it was sent and which message it answers - never a subject, never the text, never an attachment - and it changes nothing in the inbox. All that is kept is that a contact replied, and when. |
| **An AI** (Ask) | Only after you connect one, and only when you ask it something. | The service you chose, with your question, a few lines about the company, and the contacts, pages and figures the question is about - or the whole company, when you ask for everything or choose that in Settings. Registration and account numbers are masked. Caulder says what will go before you send it, and what went after. With Ollama, it stays on your computer. |
| **AI mode on the quick line** | Only after you connect an AI and press the mark at the start of the line. Then each line, when you press Enter. Off until you press it; press it again and lines are read on your computer as before. | The same service, with the line you typed, today's date, a sentence about the company, the titles of your pages, and the names of up to 24 contacts it might mean - company and person, nothing else about them. A line that looks like a password or an account number is not sent. |
| **A draft from the AI** | Only when you press for one: the company in brief, a page tidied, or what your contacts' history shows. | The same service. For the brief: what the company's pages say about it and the last forty history entries, with no contact's details. To tidy a page: that page alone. For the history: the contacts with three entries or more, with their details and history. To sort a page: only the lines on it that Caulder could not place itself, with the names of your contacts. Nothing it sends back is kept, and nothing is moved, unless you say so. |
| **A problem report** | Only if you open one and send it yourself. You see all of it first, with emails, numbers and your Windows name taken out. | A GitHub issue, which is public. |

Caulder also opens other programs when you ask it to - your mail app, WhatsApp,
a contact's LinkedIn or Instagram in your browser - and what you do there is
up to them. A message you wrote for LinkedIn or Instagram is put on your
clipboard for you to paste; Caulder sends nothing to either.

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
