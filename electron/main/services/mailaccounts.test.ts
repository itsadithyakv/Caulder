import { beforeEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";

/**
 * Mail from accounts that are not the Google script: kept safely, tried
 * before saving, sent, scheduled and sent later, and never asked of the script.
 *
 * The server is a stand-in that records what it was handed; Windows'
 * encryption is a stand-in that marks what it sealed, so a test can see that
 * no password is ever written as itself.
 */

let canEncrypt = true;
vi.mock("electron", () => ({
  safeStorage: {
    isEncryptionAvailable: () => canEncrypt,
    encryptString: (text: string) => Buffer.from(`sealed:${text}`),
    decryptString: (buffer: Buffer) => buffer.toString().replace(/^sealed:/, ""),
  },
}));

const scriptCalls: string[] = [];
vi.mock("./gsync", () => ({
  callScript: async (action: string) => {
    scriptCalls.push(action);
    return { emails: [], remaining: null };
  },
  hello: async () => ({ email: null, calendars: [], taskLists: [] }),
}));
vi.mock("./credentials", () => ({ isConnected: () => false }));

/** The inbox, as a stand-in: what is in it, whether it opens, and what it was asked. */
type Heard = { from: string | null; date: string | null; answers: string[]; auto: boolean };
let inbox: Heard[] = [];
let inboxRefuses: string | null = null;
const inboxAsked: { how: "try" | "read"; host: string; port: number; username: string; password: string; since?: string }[] = [];
vi.mock("./inbox", () => ({
  tryInbox: async (login: { host: string; port: number; username: string; password: string }) => {
    inboxAsked.push({ how: "try", ...login });
    if (inboxRefuses) throw new Error(inboxRefuses);
  },
  readInbox: async (login: { host: string; port: number; username: string; password: string }, since: string) => {
    inboxAsked.push({ how: "read", ...login, since });
    if (inboxRefuses) throw new Error(inboxRefuses);
    return inbox;
  },
}));

const { migrate } = await import("../db/migrations");
const { createCompany } = await import("../repositories/companies");
const { createLead } = await import("../repositories/leads");
const { listEmailsForLead, listRecentReplies } = await import("../repositories/mail");
const { createTemplate } = await import("../repositories/email");
const { leadInput } = await import("@shared/domain");
const accounts = await import("./mailaccounts");
const mail = await import("./mail");

const NOW = new Date("2026-09-23T09:00:00.000Z");
const sent: { host: string; password: string; message: Record<string, unknown> }[] = [];
let refuse: string | null = null;

let db: Database.Database;
let leadId: string;

const ZOHO = {
  label: "Zoho work",
  address: "Me@Unifloe.com",
  host: "smtp.zoho.com",
  port: 465,
  secure: true,
  username: "me@unifloe.com",
  password: "app-password-1",
};

beforeEach(() => {
  canEncrypt = true;
  refuse = null;
  sent.length = 0;
  scriptCalls.length = 0;
  inbox = [];
  inboxRefuses = null;
  inboxAsked.length = 0;
  accounts.useTransportForTests((account) => ({
    verify: async () => {
      if (refuse) throw new Error(refuse);
      return true;
    },
    sendMail: async (message) => {
      if (refuse) throw new Error(refuse);
      sent.push({ host: account.host, password: account.password, message });
      return { messageId: "x" };
    },
  }));
  db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrate(db);
  const companyId = createCompany(db, { name: "Unifloe", accent: "blue", timezone: "Asia/Kolkata" }).id;
  leadId = createLead(db, companyId, leadInput.parse({ name: "Orchids School", email: "rahul@orchids.edu" })).id;
});

describe("adding an account", () => {
  it("keeps the password sealed, never as itself, and makes the first one the default", async () => {
    const list = await accounts.addMailAccount(db, ZOHO, NOW);
    expect(list).toEqual([expect.objectContaining({ label: "Zoho work", address: "me@unifloe.com", isDefault: true })]);
    expect(JSON.stringify(list)).not.toContain("app-password-1");
    const row = db.prepare(`SELECT secret FROM mail_accounts`).get() as { secret: string };
    expect(row.secret).not.toContain("app-password-1");
    expect(Buffer.from(row.secret, "base64").toString()).toBe("sealed:app-password-1");
  });

  it("tries it first, and saves nothing the server turns down - in words that say what to do", async () => {
    refuse = "Invalid login: 535 Authentication Failed";
    await expect(accounts.addMailAccount(db, ZOHO, NOW)).rejects.toThrow(/app password/);
    refuse = "getaddrinfo ENOTFOUND smtp.zoho.co";
    await expect(accounts.addMailAccount(db, { ...ZOHO, host: "smtp.zoho.co" }, NOW)).rejects.toThrow(/Could not find smtp.zoho.co/);
    expect(accounts.listMailAccounts(db)).toEqual([]);
  });

  it("will not keep a password Windows cannot encrypt, and will not connect one address twice", async () => {
    canEncrypt = false;
    await expect(accounts.addMailAccount(db, ZOHO, NOW)).rejects.toThrow(/will not encrypt/);
    canEncrypt = true;
    await accounts.addMailAccount(db, ZOHO, NOW);
    await expect(accounts.addMailAccount(db, { ...ZOHO, address: "me@unifloe.com" }, NOW)).rejects.toThrow(/already connected/);
  });

  it("moves the default when the default is removed", async () => {
    await accounts.addMailAccount(db, ZOHO, NOW);
    const two = await accounts.addMailAccount(db, { ...ZOHO, label: "Outlook", address: "me@outlook.com" }, NOW);
    const outlook = two.find((each) => each.label === "Outlook");
    const zoho = two.find((each) => each.label === "Zoho work");
    accounts.setDefaultMailAccount(db, outlook?.id ?? "");
    expect(accounts.listMailAccounts(db)[0]?.label).toBe("Outlook");
    const left = accounts.removeMailAccount(db, outlook?.id ?? "");
    expect(left).toEqual([expect.objectContaining({ id: zoho?.id, isDefault: true })]);
  });
});

describe("sending from one", () => {
  it("sends now with the decrypted password, writes it on the contact's history, and never asks the script about it", async () => {
    const [zoho] = await accounts.addMailAccount(db, ZOHO, NOW);
    const emails = await mail.sendEmail(db, { leadId, accountId: zoho?.id, subject: "Timetables", body: "Hello Rahul", sendAt: null, followUp: null }, NOW);
    expect(sent).toEqual([
      {
        host: "smtp.zoho.com",
        password: "app-password-1",
        message: {
          from: { name: "Zoho work", address: "me@unifloe.com" },
          to: "rahul@orchids.edu",
          subject: "Timetables",
          text: "Hello Rahul",
          // Its own id, at the account's own domain, so a reply can be known by it.
          messageId: expect.stringMatching(/^<[0-9a-f-]{36}@unifloe\.com>$/),
        },
      },
    ]);
    expect(emails[0]).toMatchObject({ status: "sent", to: "rahul@orchids.edu" });
    const history = db.prepare(`SELECT kind FROM activities WHERE lead_id = ?`).all(leadId) as { kind: string }[];
    expect(history.map((row) => row.kind)).toContain("email_sent");
    // Settled at once: an account sees no reply, and the script never had it.
    await mail.syncEmails(db, NOW);
    expect(scriptCalls).toEqual([]);
  });

  it("writes nothing when the server refuses it, so the message is still there to send", async () => {
    const [zoho] = await accounts.addMailAccount(db, ZOHO, NOW);
    refuse = "Connection timeout";
    await expect(
      mail.sendEmail(db, { leadId, accountId: zoho?.id, subject: "Hi", body: "Hi", sendAt: null, followUp: null }, NOW),
    ).rejects.toThrow(/did not answer/);
    expect(listEmailsForLead(db, leadId)).toEqual([]);
  });

  it("refuses a follow-up from an account that does not see replies, and says how to get one", async () => {
    const [zoho] = await accounts.addMailAccount(db, ZOHO, NOW);
    await expect(
      mail.sendEmail(db, { leadId, accountId: zoho?.id, subject: "Hi", body: "Hi", sendAt: null, followUp: { days: 3, templateId: "t" } }, NOW),
    ).rejects.toThrow(/Switch on See replies/);
    expect(sent).toEqual([]);
  });

  it("stops one kept for later when its contact is marked do not contact afterwards", async () => {
    const [zoho] = await accounts.addMailAccount(db, ZOHO, NOW);
    const later = new Date(NOW.getTime() + 60 * 60 * 1000).toISOString();
    await mail.sendEmail(db, { leadId, accountId: zoho?.id, subject: "Later", body: "Later", sendAt: later, followUp: null }, NOW);
    // However the flag was set - the form, an import - the due pass looks again.
    db.prepare(`UPDATE leads SET do_not_contact = 1 WHERE id = ?`).run(leadId);

    const due = new Date(NOW.getTime() + 2 * 60 * 60 * 1000);
    expect(await mail.sendDueAccountMail(db, due)).toBe(0);
    expect(sent).toEqual([]);
    expect(listEmailsForLead(db, leadId).map((each) => each.status)).toEqual(["cancelled"]);
  });

  it("keeps one for later, sends it when it is due, and marks one it could not send as failed", async () => {
    const [zoho] = await accounts.addMailAccount(db, ZOHO, NOW);
    const later = new Date(NOW.getTime() + 60 * 60 * 1000).toISOString();
    await mail.sendEmail(db, { leadId, accountId: zoho?.id, subject: "Later", body: "Later", sendAt: later, followUp: null }, NOW);
    await mail.sendEmail(db, { leadId, accountId: zoho?.id, subject: "Also later", body: "x", sendAt: later, followUp: null }, NOW);
    expect(sent).toEqual([]);
    expect(await mail.sendDueAccountMail(db, NOW)).toBe(0);

    // The first goes; then the server starts refusing, and the second is failed, not lost.
    const due = new Date(NOW.getTime() + 2 * 60 * 60 * 1000);
    let first = true;
    accounts.useTransportForTests(() => ({
      verify: async () => true,
      sendMail: async (message) => {
        if (!first) throw new Error("Connection timeout");
        first = false;
        sent.push({ host: "smtp.zoho.com", password: "", message });
        return {};
      },
    }));
    expect(await mail.sendDueAccountMail(db, due)).toBe(1);
    const statuses = listEmailsForLead(db, leadId).map((each) => each.status).sort();
    expect(statuses).toEqual(["failed", "sent"]);
    expect(await mail.sendDueAccountMail(db, due)).toBe(0);
  });

  it("cancels one kept for later here, without the script", async () => {
    const [zoho] = await accounts.addMailAccount(db, ZOHO, NOW);
    const later = new Date(NOW.getTime() + 60 * 60 * 1000).toISOString();
    const [kept] = await mail.sendEmail(db, { leadId, accountId: zoho?.id, subject: "Later", body: "Later", sendAt: later, followUp: null }, NOW);
    const after = await mail.cancelEmail(db, kept?.id ?? "");
    expect(after[0]?.status).toBe("cancelled");
    expect(scriptCalls).toEqual([]);
    expect(await mail.sendDueAccountMail(db, new Date(NOW.getTime() + 2 * 60 * 60 * 1000))).toBe(0);
  });

  it("fails what was waiting to go from an account that is removed, rather than sending it from another", async () => {
    const [zoho] = await accounts.addMailAccount(db, ZOHO, NOW);
    const later = new Date(NOW.getTime() + 60 * 60 * 1000).toISOString();
    await mail.sendEmail(db, { leadId, accountId: zoho?.id, subject: "Later", body: "Later", sendAt: later, followUp: null }, NOW);
    accounts.removeMailAccount(db, zoho?.id ?? "");
    expect(listEmailsForLead(db, leadId)[0]).toMatchObject({ status: "failed", error: "The account it was to go from was removed." });
  });
});

describe("seeing replies", () => {
  const DAY = 24 * 60 * 60 * 1000;
  const later = (days: number, minutes = 0) => new Date(NOW.getTime() + days * DAY + minutes * 60_000);

  /** A Zoho account that reads its inbox, a template to follow up with, and one message sent with a follow-up after three days. */
  async function written(): Promise<{ accountId: string; emailId: string; messageId: string }> {
    const [zoho] = await accounts.addMailAccount(db, ZOHO, NOW);
    const accountId = zoho?.id ?? "";
    await accounts.setReplyReading(db, accountId, true);
    const companyId = (db.prepare(`SELECT company_id FROM leads WHERE id = ?`).get(leadId) as { company_id: string }).company_id;
    const templateId =
      createTemplate(db, companyId, { name: "Nudge", subject: "Nudge", body: "Just checking this reached you.", channel: "email" }).find(
        (each) => each.name === "Nudge",
      )?.id ?? "";
    const [email] = await mail.sendEmail(
      db,
      { leadId, accountId, subject: "Timetables", body: "Hello Rahul", sendAt: null, followUp: { days: 3, templateId } },
      NOW,
    );
    // Sending stamps the real clock; the tests keep their own, so the message is put at NOW.
    db.prepare(`UPDATE emails SET sent_at = ? WHERE id = ?`).run(NOW.toISOString(), email?.id);
    const row = db.prepare(`SELECT message_id FROM emails WHERE id = ?`).get(email?.id) as { message_id: string };
    return { accountId, emailId: email?.id ?? "", messageId: row.message_id };
  }

  const reply = (at: Date, over: Partial<Heard> = {}): Heard => ({ from: "rahul@orchids.edu", date: at.toISOString(), answers: [], auto: false, ...over });

  it("is off until switched on, and tries the inbox before it is kept", async () => {
    const [zoho] = await accounts.addMailAccount(db, ZOHO, NOW);
    expect(zoho).toMatchObject({ readsReplies: false, inboxError: null });
    expect(accounts.mailSenders(db, { ready: false, address: null })[0]?.seesReplies).toBe(false);

    inboxRefuses = "The inbox turned down that username and password.";
    await expect(accounts.setReplyReading(db, zoho?.id ?? "", true)).rejects.toThrow(/turned down/);
    expect(accounts.listMailAccounts(db)[0]?.readsReplies).toBe(false);

    inboxRefuses = null;
    const [on] = await accounts.setReplyReading(db, zoho?.id ?? "", true);
    expect(on?.readsReplies).toBe(true);
    // Zoho's inbox, found from the server it sends through, with the same sealed password.
    expect(inboxAsked.at(-1)).toMatchObject({ how: "try", host: "imap.zoho.com", port: 993, username: "me@unifloe.com", password: "app-password-1" });
    expect(accounts.mailSenders(db, { ready: false, address: null })[0]?.seesReplies).toBe(true);

    const [off] = await accounts.setReplyReading(db, zoho?.id ?? "", false);
    expect(off?.readsReplies).toBe(false);
  });

  it("does not open an inbox when nothing is being listened for", async () => {
    const [zoho] = await accounts.addMailAccount(db, ZOHO, NOW);
    await accounts.setReplyReading(db, zoho?.id ?? "", true);
    inboxAsked.length = 0;
    expect(await accounts.checkReplies(db, NOW)).toBe(0);
    expect(inboxAsked).toEqual([]);
  });

  it("finds a reply, puts it on the contact and on Today, and the follow-up does not go", async () => {
    const { emailId, messageId } = await written();
    inbox = [reply(later(1), { from: "office@orchids.edu", answers: [messageId] })];
    expect(await accounts.checkReplies(db, later(1, 10))).toBe(1);
    // Asked from the day before it was sent, so no time zone cuts a reply off.
    expect(inboxAsked.at(-1)).toMatchObject({ how: "read", since: "22-Sep-2026" });

    const [email] = listEmailsForLead(db, leadId);
    expect(email).toMatchObject({ id: emailId, status: "replied", repliedAt: later(1).toISOString() });
    expect(email?.followUp?.status).toBe("skipped");
    const kinds = (db.prepare(`SELECT kind FROM activities WHERE lead_id = ?`).all(leadId) as { kind: string }[]).map((row) => row.kind);
    expect(kinds).toContain("email_replied");
    const companyId = (db.prepare(`SELECT company_id FROM leads WHERE id = ?`).get(leadId) as { company_id: string }).company_id;
    expect(listRecentReplies(db, companyId, NOW.toISOString()).map((each) => each.emailId)).toEqual([emailId]);

    // And three days on, nothing more is sent to somebody who answered.
    sent.length = 0;
    await mail.sendDueAccountMail(db, later(4));
    expect(sent).toEqual([]);
    expect(accounts.listMailAccounts(db)[0]?.inboxError).toBeNull();
  });

  it("follows up by itself when the days are up and nobody answered - in the same thread, after looking first", async () => {
    const { messageId } = await written();
    sent.length = 0;
    inboxAsked.length = 0;

    // Not before its day.
    expect(await mail.sendDueAccountMail(db, later(2))).toBe(0);
    expect(sent).toEqual([]);

    expect(await mail.sendDueAccountMail(db, later(3, 5))).toBe(1);
    expect(inboxAsked.map((each) => each.how)).toEqual(["read"]);
    expect(sent[0]?.message).toMatchObject({
      to: "rahul@orchids.edu",
      subject: "Re: Timetables",
      text: "Just checking this reached you.",
      inReplyTo: messageId,
      references: messageId,
    });
    expect(listEmailsForLead(db, leadId)[0]?.followUp).toMatchObject({ status: "sent" });

    // Once, and only once.
    expect(await mail.sendDueAccountMail(db, later(3, 6))).toBe(0);
    expect(sent).toHaveLength(1);
  });

  it("does not follow up somebody who answered a minute ago", async () => {
    await written();
    sent.length = 0;
    inbox = [reply(later(3, 4))];
    expect(await mail.sendDueAccountMail(db, later(3, 5))).toBe(0);
    expect(sent).toEqual([]);
    expect(listEmailsForLead(db, leadId)[0]).toMatchObject({ status: "replied" });
  });

  it("does not count an out-of-office as an answer", async () => {
    const { messageId } = await written();
    sent.length = 0;
    inbox = [reply(later(1), { auto: true, answers: [messageId] })];
    expect(await mail.sendDueAccountMail(db, later(3, 5))).toBe(1);
  });

  it("waits, rather than follow up blind, when the inbox cannot be read - and says why on the account", async () => {
    await written();
    sent.length = 0;
    inboxRefuses = "imap.zoho.com did not answer, so the inbox could not be read just now.";
    expect(await mail.sendDueAccountMail(db, later(3, 5))).toBe(0);
    expect(sent).toEqual([]);
    expect(accounts.listMailAccounts(db)[0]?.inboxError).toMatch(/did not answer/);
    expect(listEmailsForLead(db, leadId)[0]?.followUp?.status).toBe("waiting");

    // It goes on the next pass that can see.
    inboxRefuses = null;
    expect(await mail.sendDueAccountMail(db, later(3, 6))).toBe(1);
    expect(accounts.listMailAccounts(db)[0]?.inboxError).toBeNull();
  });

  it("stops a waiting follow-up without unsending the message", async () => {
    const { emailId } = await written();
    const after = await mail.cancelEmail(db, emailId);
    expect(after[0]).toMatchObject({ status: "sent" });
    expect(after[0]?.followUp?.status).toBe("cancelled");
    sent.length = 0;
    await mail.sendDueAccountMail(db, later(4));
    expect(sent).toEqual([]);
  });

  it("does not follow up somebody since marked do not contact", async () => {
    await written();
    db.prepare(`UPDATE leads SET do_not_contact = 1 WHERE id = ?`).run(leadId);
    sent.length = 0;
    await mail.sendDueAccountMail(db, later(4));
    expect(sent).toEqual([]);
    expect(listEmailsForLead(db, leadId)[0]?.followUp?.status).toBe("cancelled");
  });
});
