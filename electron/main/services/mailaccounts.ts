import { randomUUID } from "node:crypto";
import { safeStorage } from "electron";
import nodemailer from "nodemailer";
import type { Db } from "../db/connection";
import { mailAccountInput, type MailAccount, type MailSender } from "@shared/mailaccounts";

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
type Transport = { verify: () => Promise<unknown>; sendMail: (message: Record<string, unknown>) => Promise<{ messageId?: string }> };
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
    ...listMailAccounts(db).map((account) => ({ id: account.id, label: account.label, address: account.address, seesReplies: false })),
  ];
}

/** Sends one message from an account, now. Throws in words a person can act on. */
export async function sendFromAccount(
  db: Db,
  accountId: string,
  message: { to: string; subject: string; body: string },
): Promise<void> {
  const row = db.prepare(`SELECT * FROM mail_accounts WHERE id = ?`).get(accountId) as Row | undefined;
  if (!row) throw new Error("That account is not connected any more.");
  if (!encryptionAvailable()) throw new Error("Windows will not decrypt the password on this machine right now, so nothing was sent.");
  let password: string;
  try {
    password = safeStorage.decryptString(Buffer.from(row.secret, "base64"));
  } catch {
    throw new Error(`The password for ${row.address} can no longer be read on this machine. Remove the account and add it again.`);
  }
  try {
    await makeTransport({ host: row.host, port: row.port, secure: row.secure === 1, username: row.username, password }).sendMail({
      from: { name: row.label, address: row.address },
      to: message.to,
      subject: message.subject,
      text: message.body,
    });
  } catch (error) {
    throw sayProblem(error, row.host);
  }
}
