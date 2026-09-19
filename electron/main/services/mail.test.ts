import { beforeEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import type { RemoteEmail } from "@shared/mail";

/**
 * Sending through the script, from Caulder's side.
 *
 * The script is replaced by a stand-in that records what it was asked and
 * answers as told, so what is checked here is Caulder's half: what it refuses
 * before asking, what it hands over, and what a report does to the contact's
 * history.
 */

const calls: { action: string; payload: Record<string, unknown> }[] = [];
let answer: (action: string, payload: Record<string, unknown>) => unknown = () => {
  throw new Error("The stand-in script was not told what to say.");
};
let connected = true;

vi.mock("./gsync", () => ({
  callScript: async (action: string, payload: Record<string, unknown>) => {
    calls.push({ action, payload });
    return answer(action, payload);
  },
  hello: async () => ({
    email: "founder@gmail.com",
    calendars: [],
    taskLists: [],
    version: 2,
    mail: { address: "founder@gmail.com", remaining: 90 },
    mailError: null,
  }),
}));
vi.mock("./credentials", () => ({ isConnected: () => connected }));

const { cancelEmail, mailState, rememberScript, sendEmail, syncEmails } = await import("./mail");
const { migrate } = await import("../db/migrations");
const { createCompany } = await import("../repositories/companies");
const { createLead } = await import("../repositories/leads");
const { createTemplate } = await import("../repositories/email");
const { listRecentReplies } = await import("../repositories/mail");
const { leadInput } = await import("@shared/domain");

const NOW = new Date("2026-09-17T09:00:00.000Z");

let db: Database.Database;
let companyId: string;
let leadId: string;

function sentView(id: string, over: Partial<RemoteEmail> = {}): RemoteEmail {
  return {
    id,
    status: "sent",
    sentAt: "2026-09-17T09:00:00.000Z",
    repliedAt: null,
    error: null,
    followUp: null,
    ...over,
  };
}

/** Answers every send with what the payload implies: sent now, or held. */
function scriptSends() {
  answer = (action, payload) => {
    if (action !== "sendEmail") throw new Error(`Unexpected ${action}`);
    const follow = payload["followUp"] ? { status: "waiting", sentAt: null, error: null } : null;
    return payload["sendAt"]
      ? { ...sentView(String(payload["id"])), status: "scheduled", sentAt: null, followUp: follow }
      : { ...sentView(String(payload["id"])), followUp: follow };
  };
}

function history(): { kind: string; body: string | null }[] {
  return db
    .prepare(`SELECT kind, body FROM activities WHERE lead_id = ? AND kind != 'created' ORDER BY occurred_at`)
    .all(leadId) as { kind: string; body: string | null }[];
}

function message(extra: Record<string, unknown> = {}) {
  return { leadId, subject: "A quick question", body: "Hello there", sendAt: null, followUp: null, ...extra };
}

beforeEach(() => {
  calls.length = 0;
  connected = true;
  db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrate(db);
  companyId = createCompany(db, { name: "Unifloe", accent: "blue", timezone: "Asia/Kolkata" }).id;
  leadId = createLead(
    db,
    companyId,
    leadInput.parse({ name: "Oakridge", email: "asha@oakridge.edu.in", contactPerson: "Asha" }),
  ).id;
  rememberScript(db, {
    email: "founder@gmail.com",
    calendars: [],
    taskLists: [],
    version: 2,
    mail: { address: "founder@gmail.com", remaining: 90 },
    mailError: null,
  });
  scriptSends();
});

describe("whether a contact's page can send", () => {
  it("says to connect Google when nothing is connected", async () => {
    connected = false;
    expect((await mailState(db)).reason).toContain("Connect Google");
  });

  it("says to update a script too old to send", async () => {
    rememberScript(db, { email: "f@gmail.com", calendars: [], taskLists: [] });
    const state = await mailState(db);
    expect(state.ready).toBe(false);
    expect(state.reason).toContain("older version");
  });

  it("is ready, and says from where, with a current script", async () => {
    expect(await mailState(db)).toEqual({
      ready: true,
      reason: null,
      address: "founder@gmail.com",
      remaining: 90,
    });
  });
});

describe("sending now", () => {
  it("hands over the contact's own address and writes the send on the history", async () => {
    const emails = await sendEmail(db, message({ to: "someone@else.com" }), NOW);

    expect(calls[0]?.payload["to"]).toBe("asha@oakridge.edu.in");
    expect(emails).toHaveLength(1);
    expect(emails[0]?.status).toBe("sent");
    expect(history()).toEqual([{ kind: "email_sent", body: "A quick question\n\nHello there" }]);

    const lead = db.prepare(`SELECT last_contacted_at FROM leads WHERE id = ?`).get(leadId) as {
      last_contacted_at: string;
    };
    expect(lead.last_contacted_at).toBe("2026-09-17T09:00:00.000Z");
  });

  it("refuses a contact marked do not contact without asking the script", async () => {
    db.prepare(`UPDATE leads SET do_not_contact = 1 WHERE id = ?`).run(leadId);
    await expect(sendEmail(db, message(), NOW)).rejects.toThrow("do not contact");
    expect(calls).toHaveLength(0);
  });

  it("refuses a contact with no address", async () => {
    db.prepare(`UPDATE leads SET email = NULL WHERE id = ?`).run(leadId);
    await expect(sendEmail(db, message(), NOW)).rejects.toThrow("no email address");
  });

  it("refuses when the script is too old, and says why", async () => {
    rememberScript(db, { email: "f@gmail.com", calendars: [], taskLists: [] });
    await expect(sendEmail(db, message(), NOW)).rejects.toThrow("older version");
    expect(calls).toHaveLength(0);
  });

  it("records nothing when the script refuses", async () => {
    answer = () => {
      throw new Error("Service invoked too many times for one day: email.");
    };
    await expect(sendEmail(db, message(), NOW)).rejects.toThrow("too many times");
    expect(db.prepare(`SELECT COUNT(*) AS n FROM emails`).get()).toEqual({ n: 0 });
  });
});

describe("sending later", () => {
  it("holds a message for its time and writes nothing yet", async () => {
    const emails = await sendEmail(db, message({ sendAt: "2026-09-18T09:00:00.000Z" }), NOW);
    expect(calls[0]?.payload["sendAt"]).toBe("2026-09-18T09:00:00.000Z");
    expect(emails[0]?.status).toBe("scheduled");
    expect(history()).toEqual([]);
  });

  it("treats a time within the next minute as now", async () => {
    await sendEmail(db, message({ sendAt: "2026-09-17T09:00:30.000Z" }), NOW);
    expect(calls[0]?.payload["sendAt"]).toBeNull();
  });

  it("refuses a time more than sixty days away", async () => {
    await expect(
      sendEmail(db, message({ sendAt: "2026-12-31T09:00:00.000Z" }), NOW),
    ).rejects.toThrow("60 days");
  });

  it("refuses to hand over more than the script can hold", async () => {
    await expect(
      sendEmail(db, message({ sendAt: "2026-09-18T09:00:00.000Z", body: "x".repeat(7000) }), NOW),
    ).rejects.toThrow("too long");
    expect(calls).toHaveLength(0);
  });
});

describe("the follow-up", () => {
  function template(channel: "email" | "whatsapp") {
    const all = createTemplate(db, companyId, {
      name: `Nudge ${channel}`,
      subject: channel === "email" ? "Following up" : "",
      body: "Hi {{lead.greeting}}, any thoughts from {{lead.name}}?",
      channel,
    });
    return all.find((t) => t.channel === channel)!.id;
  }

  it("is filled in for this contact before it is handed over", async () => {
    const id = template("email");
    const emails = await sendEmail(db, message({ followUp: { days: 4, templateId: id } }), NOW);
    expect(calls[0]?.payload["followUp"]).toEqual({
      days: 4,
      body: "Hi Asha, any thoughts from Oakridge?",
    });
    expect(emails[0]?.followUp).toEqual({ days: 4, status: "waiting", sentAt: null, error: null });
  });

  it("will not use a WhatsApp template", async () => {
    const id = template("whatsapp");
    await expect(
      sendEmail(db, message({ followUp: { days: 4, templateId: id } }), NOW),
    ).rejects.toThrow("WhatsApp template");
  });
});

describe("hearing back", () => {
  it("writes the send and the reply once each, and Today can show the reply", async () => {
    const [scheduled] = await sendEmail(db, message({ sendAt: "2026-09-18T09:00:00.000Z" }), NOW);
    const id = scheduled!.id;

    answer = () => ({
      emails: [
        sentView(id, {
          status: "replied",
          sentAt: "2026-09-18T09:00:00.000Z",
          repliedAt: "2026-09-18T11:00:00.000Z",
        }),
      ],
      remaining: 80,
    });
    await syncEmails(db, new Date("2026-09-18T12:00:00.000Z"));
    await syncEmails(db, new Date("2026-09-18T12:10:00.000Z"));

    expect(history().map((entry) => entry.kind)).toEqual(["email_sent", "email_replied"]);
    expect(listRecentReplies(db, companyId, "2026-09-11T00:00:00.000Z")).toEqual([
      {
        emailId: id,
        leadId,
        leadName: "Oakridge",
        subject: "A quick question",
        repliedAt: "2026-09-18T11:00:00.000Z",
      },
    ]);
  });

  it("tells the script to forget a settled message, and then stops asking", async () => {
    const [sent] = await sendEmail(db, message(), NOW);
    answer = () => ({
      emails: [sentView(sent!.id, { status: "replied", repliedAt: "2026-09-17T10:00:00.000Z" })],
      remaining: 80,
    });
    await syncEmails(db, NOW);

    answer = () => ({ emails: [], remaining: 80 });
    await syncEmails(db, NOW);
    expect(calls.at(-1)?.payload).toEqual({ ids: [], ack: [sent!.id] });

    calls.length = 0;
    expect(await syncEmails(db, NOW)).toBe(0);
    expect(calls).toHaveLength(0);
  });

  it("calls a waiting message the script has lost a failure", async () => {
    const [scheduled] = await sendEmail(db, message({ sendAt: "2026-09-18T09:00:00.000Z" }), NOW);
    answer = () => ({
      emails: [{ id: scheduled!.id, status: "missing", sentAt: null, repliedAt: null, error: null, followUp: null }],
      remaining: 80,
    });
    await syncEmails(db, NOW);
    expect(history().map((entry) => entry.kind)).toEqual(["email_failed"]);
  });
});

describe("cancelling", () => {
  it("stops a scheduled message", async () => {
    const [scheduled] = await sendEmail(db, message({ sendAt: "2026-09-18T09:00:00.000Z" }), NOW);
    answer = (_action, payload) => ({
      ...sentView(String(payload["id"])),
      status: "cancelled",
      sentAt: null,
    });
    const emails = await cancelEmail(db, scheduled!.id);
    expect(emails[0]?.status).toBe("cancelled");
    expect(history()).toEqual([]);
  });

  it("refuses when nothing is waiting", async () => {
    const [sent] = await sendEmail(db, message(), NOW);
    await expect(cancelEmail(db, sent!.id)).rejects.toThrow("Nothing about that email");
  });
});
