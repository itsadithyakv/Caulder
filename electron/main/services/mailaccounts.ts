import { randomUUID } from "node:crypto";
import { safeStorage } from "electron";
import nodemailer from "nodemailer";
import type { Db } from "../db/connection";
import { inboxFor, INBOX_PORT, mailAccountInput, type MailAccount, type MailSender } from "@shared/mailaccounts";
import { WATCH_DAYS } from "@shared/mail";
import { repliesAmong, sinceDay } from "@shared/replies";
import { applyReport, watchedAccountEmails } from "../repositories/mail";
import { readInbox, tryInbox } from "./inbox";

/**
 * Mail accounts that are not the Google script (shared/mailaccounts.ts).
 *
 * The password is encrypted by the operating system before it is written and
 * decrypted only here, at the moment of sending; it never goes back to the
 * window. If Windows will not encrypt, the account is refused rather than
 * kept readable - the same rule as the Google connection.
 *
 * An account is tried before it is saved: a wrong password found when the
 * account is added costs a second, found when a message will not go it costs
 * the message.
 *
 * **Reading replies** is switched on for one account at a time
 * (`setReplyReading`), tried before it is kept, and done by `checkReplies`:
 * the inbox's headers since the oldest message still listened for, matched
 * by shared/replies.ts, and each answer reported through the same
 * `applyReport` a reply seen by the Google script goes through.
 */

type Row = {
  id: string;
  label: string;
  address: string;
  host: string;
  port: number;
  secure: number;
  username: string;
  secret: string;
  is_default: number;
  imap_host: string | null;
  imap_port: number | null;
  imap_checked_at: string | null;
  imap_error: string | null;
  created_at: string;
};

const toAccount = (row: Row): MailAccount => ({
  id: row.id,
  label: row.label,
  address: row.address,
  host: row.host,
  port: row.port,
  secure: row.secure === 1,
  username: row.username,
  isDefault: row.is_default === 1,
  readsReplies: row.imap_host !== null,
  inboxCheckedAt: row.imap_checked_at,
  inboxError: row.imap_error,
  createdAt: row.created_at,
});

function encryptionAvailable(): boolean {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

export function listMailAccounts(db: Db): MailAccount[] {
  return (db.prepare(`SELECT * FROM mail_accounts ORDER BY is_default DESC, created_at`).all() as Row[]).map(toAccount);
}

/** How an account connects, for nodemailer: a separate function so a test can hand in its own transport. */
type Transport = { verify: () => Promise<unknown>; sendMail: (message: Record<string, unknown>) => Promise<unknown> };
let makeTransport = (account: { host: string; port: number; secure: boolean; username: string; password: string }): Transport =>
  nodemailer.createTransport({
    host: account.host,
    port: account.port,
    secure: account.secure,
    auth: { user: account.username, pass: account.password },
    // A server that does not answer should be an error in seconds, not a window that hangs.
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  });

/** For tests only. */
export function useTransportForTests(make: typeof makeTransport): void {
  makeTransport = make;
}

/** What a mail server says, in words a person can act on. */
function sayProblem(error: unknown, host: string): Error {
  const message = error instanceof Error ? error.message : String(error);
  if (/auth|credentials|535|534|password|username/i.test(message)) {
    return new Error(
      "The server turned down that username and password. Most providers want an app password here, not the account's own - make one in the provider's security settings.",
    );
  }
  if (/ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(message)) return new Error(`Could not find ${host}. Check the server name.`);
  if (/ETIMEDOUT|timeout|ECONNREFUSED|ECONNRESET/i.test(message)) {
    return new Error(`${host} did not answer on that port. Check the port, and whether it wants SSL from the start (465) or not (587).`);
  }
  return new Error(`The mail server said: ${message}`);
}

export async function addMailAccount(db: Db, raw: unknown, now: Date = new Date()): Promise<MailAccount[]> {
  const input = mailAccountInput.parse(raw);
  if (!encryptionAvailable()) {
    throw new Error("Windows will not encrypt stored secrets on this machine, so Caulder will not keep the password. Nothing has been saved.");
  }
  const clash = db.prepare(`SELECT 1 FROM mail_accounts WHERE address = ? COLLATE NOCASE`).get(input.address);
  if (clash) throw new Error(`${input.address} is already connected.`);

  try {
    await makeTransport({ ...input }).verify();
  } catch (error) {
    throw sayProblem(error, input.host);
  }

  const first = db.prepare(`SELECT 1 FROM mail_accounts LIMIT 1`).get() === undefined;
  const secret = safeStorage.encryptString(input.password).toString("base64");
  db.prepare(
    `INSERT INTO mail_accounts (id, label, address, host, port, secure, username, secret, is_default, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(randomUUID(), input.label, input.address, input.host, input.port, input.secure ? 1 : 0, input.username, secret, first ? 1 : 0, now.toISOString());
  return listMailAccounts(db);
}

export function removeMailAccount(db: Db, id: string): MailAccount[] {
  db.transaction(() => {
    const was = db.prepare(`SELECT is_default FROM mail_accounts WHERE id = ?`).get(id) as { is_default: number } | undefined;
    // Messages waiting to go from it will not go: said on each, before the link to it is lost, rather than
    // sent from somewhere else unasked.
    db.prepare(
      `UPDATE emails SET status = 'failed', error = 'The account it was to go from was removed.', settled = 1, updated_at = ?
        WHERE account_id = ? AND status = 'scheduled'`,
    ).run(new Date().toISOString(), id);
    db.prepare(`DELETE FROM mail_accounts WHERE id = ?`).run(id);
    if (was?.is_default === 1) {
      db.prepare(`UPDATE mail_accounts SET is_default = 1 WHERE id = (SELECT id FROM mail_accounts ORDER BY created_at LIMIT 1)`).run();
    }
  })();
  return listMailAccounts(db);
}

export function setDefaultMailAccount(db: Db, id: string): MailAccount[] {
  db.transaction(() => {
    if (!db.prepare(`SELECT 1 FROM mail_accounts WHERE id = ?`).get(id)) throw new Error("That account is not connected any more.");
    db.prepare(`UPDATE mail_accounts SET is_default = CASE WHEN id = ? THEN 1 ELSE 0 END`).run(id);
  })();
  return listMailAccounts(db);
}

/**
 * Everywhere a message can go from: the Google script first when it is
 * connected (it is the one that sees replies), then each account, the default
 * one first among them.
 */
export function mailSenders(db: Db, script: { ready: boolean; address: string | null }): MailSender[] {
  const first: MailSender[] = script.ready
    ? [{ id: null, label: "Gmail, through the script", address: script.address ?? "your Gmail", seesReplies: true }]
    : [];
  return [
    ...first,
    ...listMailAccounts(db).map((account) => ({
      id: account.id,
      label: account.label,
      address: account.address,
      seesReplies: account.readsReplies,
    })),
  ];
}

/** Whether a reply to a message from this account would be seen. */
export function accountReadsReplies(db: Db, accountId: string): boolean {
  const row = db.prepare(`SELECT imap_host FROM mail_accounts WHERE id = ?`).get(accountId) as { imap_host: string | null } | undefined;
  return row !== undefined && row.imap_host !== null;
}

/** The account's password, decrypted for the moment it is needed. Throws a sentence when it cannot be read. */
function passwordOf(row: Row, doing: string): string {
  if (!encryptionAvailable()) throw new Error(`Windows will not decrypt the password on this machine right now, so ${doing}.`);
  try {
    return safeStorage.decryptString(Buffer.from(row.secret, "base64"));
  } catch {
    throw new Error(`The password for ${row.address} can no longer be read on this machine. Remove the account and add it again.`);
  }
}

/** The Message-ID a message goes out with: Caulder's own, so a reply can be known by it. */
export function newMessageId(db: Db, accountId: string): string {
  const row = db.prepare(`SELECT address FROM mail_accounts WHERE id = ?`).get(accountId) as { address: string } | undefined;
  const domain = row?.address.split("@")[1] ?? "caulder.invalid";
  return `<${randomUUID()}@${domain}>`;
}

/**
 * Turns reading replies on or off for one account. On, the inbox is opened
 * once before anything is kept: an account whose provider has reading by
 * other apps switched off says so here, not silently every ten minutes.
 */
export async function setReplyReading(db: Db, id: string, on: boolean): Promise<MailAccount[]> {
  const row = db.prepare(`SELECT * FROM mail_accounts WHERE id = ?`).get(id) as Row | undefined;
  if (!row) throw new Error("That account is not connected any more.");
  if (!on) {
    db.prepare(`UPDATE mail_accounts SET imap_host = NULL, imap_port = NULL, imap_checked_at = NULL, imap_error = NULL WHERE id = ?`).run(id);
    return listMailAccounts(db);
  }
  const host = inboxFor(row.host);
  await tryInbox({ host, port: INBOX_PORT, username: row.username, password: passwordOf(row, "the inbox was not opened") });
  db.prepare(`UPDATE mail_accounts SET imap_host = ?, imap_port = ?, imap_checked_at = NULL, imap_error = NULL WHERE id = ?`).run(host, INBOX_PORT, id);
  return listMailAccounts(db);
}

/**
 * Looks in the inbox of every account that reads replies and has something
 * still listened for, and reports each answer found. An inbox that cannot be
 * read is said on its account and does not stop the others. Returns how many
 * messages were found answered.
 */
export async function checkReplies(db: Db, now: Date = new Date()): Promise<number> {
  const since = new Date(now.getTime() - WATCH_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const rows = db.prepare(`SELECT * FROM mail_accounts WHERE imap_host IS NOT NULL ORDER BY created_at`).all() as Row[];
  let answered = 0;
  for (const row of rows) {
    const watched = watchedAccountEmails(db, row.id, since);
    if (watched.length === 0) continue;
    const say = db.prepare(`UPDATE mail_accounts SET imap_checked_at = ?, imap_error = ? WHERE id = ?`);
    try {
      const inbox = await readInbox(
        { host: row.imap_host as string, port: row.imap_port ?? INBOX_PORT, username: row.username, password: passwordOf(row, "the inbox was not read") },
        sinceDay(watched[0]?.sentAt ?? since),
      );
      const replies = repliesAmong(watched, inbox);
      db.transaction(() => {
        for (const [id, repliedAt] of replies) {
          const was = watched.find((each) => each.id === id);
          applyReport(
            db,
            {
              id,
              status: "replied",
              sentAt: null,
              repliedAt,
              error: null,
              // They answered, so the follow-up that was waiting for silence does not go.
              followUp: was?.followUpWaiting ? { status: "skipped", sentAt: null, error: null } : null,
            },
            now,
          );
        }
        say.run(now.toISOString(), null, row.id);
      })();
      answered += replies.size;
    } catch (error) {
      say.run(now.toISOString(), error instanceof Error ? error.message : String(error), row.id);
    }
  }
  return answered;
}

/** Whether the last look at an account's inbox worked - a follow-up waits on one that did not. */
export function inboxInOrder(db: Db, accountId: string): boolean {
  const row = db.prepare(`SELECT imap_host, imap_error FROM mail_accounts WHERE id = ?`).get(accountId) as
    | { imap_host: string | null; imap_error: string | null }
    | undefined;
  return row !== undefined && row.imap_host !== null && row.imap_error === null;
}

/**
 * Sends one message from an account, now. Throws in words a person can act
 * on. `messageId` is the id it goes out with; `inReplyTo` puts it in the
 * thread of an earlier one, which is where a follow-up belongs.
 */
export async function sendFromAccount(
  db: Db,
  accountId: string,
  message: { to: string; subject: string; body: string; messageId?: string | null; inReplyTo?: string | null },
): Promise<void> {
  const row = db.prepare(`SELECT * FROM mail_accounts WHERE id = ?`).get(accountId) as Row | undefined;
  if (!row) throw new Error("That account is not connected any more.");
  const password = passwordOf(row, "nothing was sent");
  try {
    await makeTransport({ host: row.host, port: row.port, secure: row.secure === 1, username: row.username, password }).sendMail({
      from: { name: row.label, address: row.address },
      to: message.to,
      subject: message.subject,
      text: message.body,
      ...(message.messageId ? { messageId: message.messageId } : {}),
      ...(message.inReplyTo ? { inReplyTo: message.inReplyTo, references: message.inReplyTo } : {}),
    });
  } catch (error) {
    throw sayProblem(error, row.host);
  }
}
