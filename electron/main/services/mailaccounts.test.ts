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

const { migrate } = await import("../db/migrations");
const { createCompany } = await import("../repositories/companies");
const { createLead } = await import("../repositories/leads");
const { listEmailsForLead } = await import("../repositories/mail");
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
        message: { from: { name: "Zoho work", address: "me@unifloe.com" }, to: "rahul@orchids.edu", subject: "Timetables", text: "Hello Rahul" },
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

  it("refuses a follow-up, which needs the script to see a reply", async () => {
    const [zoho] = await accounts.addMailAccount(db, ZOHO, NOW);
    await expect(
      mail.sendEmail(db, { leadId, accountId: zoho?.id, subject: "Hi", body: "Hi", sendAt: null, followUp: { days: 3, templateId: "t" } }, NOW),
    ).rejects.toThrow(/Google script/);
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
