import { beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { migrate } from "../db/migrations";
import { createCompany } from "./companies";
import { createLead } from "./leads";
import { createTemplate } from "./email";
import { applyReport, recordEmail, templateStats } from "./mail";
import { leadInput } from "@shared/domain";
import { RATE_FROM, sayStats } from "@shared/mail";

/**
 * How a template has done: what went, what could be watched for a reply, and
 * what was answered - a count, and a rate only once there is enough to mean
 * one.
 */

const NOW = new Date("2026-10-10T06:00:00Z");
let db: Database.Database;
let companyId: string;
let leadId: string;
let hello: string;
let sent = 0;

/** One message from a template, in whatever state. */
function message(templateId: string | null, status: "sent" | "replied" | "scheduled" | "failed", accountId: string | null = null): void {
  const id = `e${(sent += 1)}`;
  recordEmail(
    db,
    { id, accountId, templateId, companyId, leadId, to: "maya@harbour.example", subject: "Hello", body: "Hi", sendAt: null, followUpDays: null, followUpBody: null },
    { id, status: status === "replied" ? "sent" : status, sentAt: status === "scheduled" || status === "failed" ? null : NOW.toISOString(), repliedAt: null, error: null, followUp: null },
    NOW,
  );
  if (status === "replied") applyReport(db, { id, status: "replied", sentAt: NOW.toISOString(), repliedAt: NOW.toISOString(), error: null, followUp: null }, NOW);
}

beforeEach(() => {
  sent = 0;
  db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrate(db);
  companyId = createCompany(db, { name: "Northwind", accent: "coffee", timezone: "Asia/Kolkata" }).id;
  leadId = createLead(db, companyId, leadInput.parse({ name: "Harbour Coffee", email: "maya@harbour.example" })).id;
  hello = createTemplate(db, companyId, { name: "First hello", subject: "Hello", body: "Hi {{lead.greeting}}", channel: "email" }).find((each) => each.name === "First hello")?.id ?? "";
});

describe("how a template has done", () => {
  it("counts what went and what was answered, and nothing that never went", () => {
    message(hello, "sent");
    message(hello, "sent");
    message(hello, "replied");
    message(hello, "scheduled");
    message(hello, "failed");
    message(null, "replied");
    expect(templateStats(db, companyId)).toEqual([{ templateId: hello, sent: 3, watched: 3, replied: 1 }]);
  });

  it("counts apart what went from an account that cannot see a reply", () => {
    db.prepare(
      `INSERT INTO mail_accounts (id, label, address, host, port, secure, username, secret, created_at)
       VALUES ('acc', 'Zoho', 'me@zoho.example', 'smtp.zoho.example', 465, 1, 'me', 'x', ?)`,
    ).run(NOW.toISOString());
    message(hello, "sent", "acc");
    message(hello, "replied");
    expect(templateStats(db, companyId)).toEqual([{ templateId: hello, sent: 2, watched: 1, replied: 1 }]);
  });

  it("is another company's own business", () => {
    message(hello, "sent");
    const other = createCompany(db, { name: "Second", accent: "teal", timezone: "Asia/Kolkata" }).id;
    expect(templateStats(db, other)).toEqual([]);
  });

  it("keeps the message when its template is deleted, and stops counting it", () => {
    message(hello, "sent");
    db.prepare(`DELETE FROM email_templates WHERE id = ?`).run(hello);
    expect((db.prepare(`SELECT COUNT(*) AS n FROM emails`).get() as { n: number }).n).toBe(1);
    expect(templateStats(db, companyId)).toEqual([]);
  });
});

describe("said in words", () => {
  it("is a count, and a rate only once there are enough sends to mean one", () => {
    expect(sayStats(undefined)).toBeNull();
    expect(sayStats({ templateId: "t", sent: 0, watched: 0, replied: 0 })).toBeNull();
    expect(sayStats({ templateId: "t", sent: 4, watched: 4, replied: 3 })).toBe("4 sent, 3 answered");
    expect(sayStats({ templateId: "t", sent: RATE_FROM, watched: RATE_FROM, replied: 5 })).toBe(`${RATE_FROM} sent, 5 answered (25% of ${RATE_FROM})`);
  });

  it("says so when nothing sent could have been seen answered", () => {
    expect(sayStats({ templateId: "t", sent: 6, watched: 0, replied: 0 })).toBe("6 sent, from an account that cannot see replies");
  });
});
