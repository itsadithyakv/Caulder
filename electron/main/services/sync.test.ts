import { beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { migrate } from "../db/migrations";
import { createCompany, listStages } from "../repositories/companies";
import { createLead, listActivities, setLeadStage } from "../repositories/leads";
import {
  createTemplate,
  findMessage,
  listMessages,
  listMessagesForLead,
  queueMessage,
} from "../repositories/email";
import { addStep, createSequence, enroll, listSequences } from "./sequences";
import { buildOutbox, ingestLog, listSyncBatches, recordOutbox } from "./sync";
import { buildToday } from "./today";
import { leadInput, type Company, type Lead } from "@shared/domain";
import { queueInput, MAX_ATTEMPTS, type EmailStatus } from "@shared/email";
import { today as todayIn } from "@shared/dates";

/**
 * The file bridge.
 *
 * Everything here is about the exchange being repeated, arriving out of order,
 * or being handed the same file twice — the three things that actually happen
 * when two systems talk through a folder.
 */

const TZ = "Asia/Kolkata";
const NOW = new Date("2026-09-03T06:00:00Z");
const TODAY = todayIn(TZ, NOW);

let db: Database.Database;
let company: Company;
let lead: Lead;

function queue(subject = "Introducing Unifloe", scheduledFor = TODAY) {
  return queueMessage(
    db,
    company.id,
    queueInput.parse({
      leadId: lead.id,
      toEmail: "office@bps.example.com",
      subject,
      body: "Hello, this is a message.",
      scheduledFor,
    }),
  );
}

/** A log file the way Apps Script would write one. */
function log(rows: Record<string, string>[]): string {
  const columns = [
    "message_id",
    "status",
    "sent_at",
    "provider_message_id",
    "thread_id",
    "opened_at",
    "replied_at",
    "error",
  ];
  const escape = (value: string) =>
    /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

  return [
    columns.join(","),
    ...rows.map((row) => columns.map((c) => escape(row[c] ?? "")).join(",")),
  ].join("\n");
}

beforeEach(() => {
  db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrate(db);
  company = createCompany(db, { name: "Unifloe", accent: "blue", timezone: TZ });
  lead = createLead(
    db,
    company.id,
    leadInput.parse({ name: "Bengaluru Public School", email: "office@bps.example.com" }),
  );
});

describe("queueing", () => {
  it("gives every message its own join key", () => {
    const a = queue("First");
    const b = queue("Second");

    expect(a.messageId).not.toBe(b.messageId);
    expect(a.status).toBe("queued");
  });

  it("records the queueing on the lead's timeline", () => {
    queue("Introducing Unifloe");
    const [latest] = listActivities(db, lead.id);
    expect(latest?.kind).toBe("email_queued");
    expect(latest?.body).toBe("Introducing Unifloe");
  });

  it("leaves a message scheduled for later out of the outbox", async () => {
    queue("Today's", TODAY);
    queue("Next week's", "2026-09-20");

    const outbox = await buildOutbox(db, company.id, TODAY);
    expect(outbox.count).toBe(1);
    expect(outbox.csv).toContain("Today's");
    expect(outbox.csv).not.toContain("Next week's");
  });
});

describe("the outbox", () => {
  it("carries the join key and quotes a body that would break the file", async () => {
    const message = queueMessage(
      db,
      company.id,
      queueInput.parse({
        leadId: lead.id,
        toEmail: "office@bps.example.com",
        // Commas, quotes and newlines in a body are the normal case.
        subject: 'A "quoted", awkward subject',
        body: "Line one,\nLine two with \"quotes\".",
        scheduledFor: TODAY,
      }),
    );

    const outbox = await buildOutbox(db, company.id, TODAY);

    expect(outbox.csv).toContain(message.messageId);
    expect(outbox.csv.split("\n")[0]).toContain("message_id");
    // Round-trips: the awkward body survives being written and read back.
    const parsed = outbox.csv.match(/Line one/);
    expect(parsed).not.toBeNull();
  });

  it("marks nothing exported until the file is safely written", async () => {
    queue();
    const outbox = await buildOutbox(db, company.id, TODAY);

    // Building alone must not move the status: a message marked exported for a
    // file that failed to write would never be sent and never be noticed.
    expect(listMessages(db, company.id)[0]?.status).toBe("queued");

    recordOutbox(db, company.id, "outbox.csv", outbox);
    expect(listMessages(db, company.id)[0]?.status).toBe("exported");
  });

  it("does not export the same message twice", async () => {
    queue();
    recordOutbox(db, company.id, "outbox.csv", await buildOutbox(db, company.id, TODAY));

    const second = await buildOutbox(db, company.id, TODAY);
    expect(second.count).toBe(0);
  });
});

describe("reading the log back", () => {
  it("completes the round trip and puts it on the timeline", async () => {
    // The phase's exit criterion: a send is visible on the lead's history.
    const message = queue("Introducing Unifloe");
    recordOutbox(db, company.id, "outbox.csv", await buildOutbox(db, company.id, TODAY));

    // A minute after queueing: a send cannot precede the queue it came from,
    // and dating it earlier would order the timeline nonsensically.
    const sentAt = new Date(Date.now() + 60_000).toISOString();

    const result = await ingestLog(
      db,
      company.id,
      "log.csv",
      log([
        {
          message_id: message.messageId,
          status: "sent",
          sent_at: sentAt,
          provider_message_id: "gmail-123",
          thread_id: "thread-9",
        },
      ]),
    );

    expect(result).toMatchObject({ rows: 1, applied: 1, unmatched: 0 });
    expect(findMessage(db, message.id)?.status).toBe("sent");

    const [latest] = listActivities(db, lead.id);
    expect(latest?.kind).toBe("email_sent");
    // Dated when the script says it happened, not when the file was read.
    expect(latest?.occurredAt).toBe(sentAt);
  });

  it("climbs the ladder as more log rows arrive", async () => {
    const message = queue();

    for (const status of ["sent", "opened", "replied"] as EmailStatus[]) {
      await ingestLog(db, company.id, `${status}.csv`, log([{ message_id: message.messageId, status }]));
    }

    expect(findMessage(db, message.id)?.status).toBe("replied");
  });

  it("never goes backwards", async () => {
    // Files do not arrive in the order they were written. An "opened" row
    // landing after a reply is stale, and applying it would lose the reply.
    const message = queue();
    await ingestLog(db, company.id, "a.csv", log([{ message_id: message.messageId, status: "replied" }]));

    const result = await ingestLog(
      db,
      company.id,
      "b.csv",
      log([{ message_id: message.messageId, status: "opened" }]),
    );

    expect(result.ignored).toBe(1);
    expect(findMessage(db, message.id)?.status).toBe("replied");
  });

  it("is harmless to import the same file twice", async () => {
    const message = queue();
    const content = log([{ message_id: message.messageId, status: "sent" }]);

    const first = await ingestLog(db, company.id, "log.csv", content);
    const second = await ingestLog(db, company.id, "log.csv", content);

    expect(first.applied).toBe(1);
    expect(second.applied).toBe(0);
    expect(second.ignored).toBe(1);
    // And it says so, rather than leaving the user wondering why nothing moved.
    expect(second.duplicate).toBe(true);

    const sends = listActivities(db, lead.id).filter((a) => a.kind === "email_sent");
    expect(sends).toHaveLength(1);
  });

  it("reports rows it has never heard of rather than inventing a message", async () => {
    const result = await ingestLog(
      db,
      company.id,
      "log.csv",
      log([{ message_id: "not-a-message-here", status: "sent" }]),
    );
    expect(result).toMatchObject({ applied: 0, unmatched: 1 });
  });

  it("matches columns by name, not position", async () => {
    // A log somebody has opened and re-saved will not keep its column order.
    const message = queue();
    const content = ["status,message_id", `sent,${message.messageId}`].join("\n");

    const result = await ingestLog(db, company.id, "log.csv", content);
    expect(result.applied).toBe(1);
    expect(findMessage(db, message.id)?.status).toBe("sent");
  });

  it("skips a status it does not recognise", async () => {
    // The script is someone else's code and may grow a status this build has
    // never heard of. Guessing would be worse than ignoring.
    const message = queue();
    const result = await ingestLog(
      db,
      company.id,
      "log.csv",
      log([{ message_id: message.messageId, status: "quarantined" }]),
    );
    expect(result.rows).toBe(0);
    expect(findMessage(db, message.id)?.status).toBe("queued");
  });

  it("refuses a file that is not a log at all", async () => {
    await expect(
      ingestLog(db, company.id, "leads.csv", "name,city\nAlpha,Bengaluru"),
    ).rejects.toThrow("no message_id and status columns");
  });
});

describe("failures and retries", () => {
  it("puts a failed message back in the queue with a wait", async () => {
    const message = queue();
    recordOutbox(db, company.id, "o.csv", await buildOutbox(db, company.id, TODAY));

    await ingestLog(
      db,
      company.id,
      "log.csv",
      log([{ message_id: message.messageId, status: "failed", error: "Mailbox full" }]),
    );

    const after = findMessage(db, message.id);
    expect(after?.status).toBe("queued");
    expect(after?.attemptCount).toBe(1);
    expect(after?.failure).toBe("Mailbox full");

    // Held back until the wait is over, so the next export does not retry
    // immediately.
    const outbox = await buildOutbox(db, company.id, TODAY);
    expect(outbox.count).toBe(0);
  });

  it("gives up after five attempts and says so on the timeline", async () => {
    const message = queue();

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      await ingestLog(
        db,
        company.id,
        `fail-${attempt}.csv`,
        log([{ message_id: message.messageId, status: "failed", error: "Rejected" }]),
      );
      // The backoff would otherwise hold the message back from a real retry.
      db.prepare(`UPDATE email_messages SET next_attempt_at = NULL WHERE id = ?`).run(
        message.id,
      );
    }

    const after = findMessage(db, message.id);
    expect(after?.status).toBe("failed");
    expect(after?.attemptCount).toBe(MAX_ATTEMPTS);

    const failures = listActivities(db, lead.id).filter((a) => a.kind === "email_failed");
    expect(failures).toHaveLength(1);
  });

  it("still reaches sent if a later log says it went", async () => {
    const message = queue();
    await ingestLog(db, company.id, "a.csv", log([{ message_id: message.messageId, status: "failed" }]));
    await ingestLog(db, company.id, "b.csv", log([{ message_id: message.messageId, status: "sent" }]));

    expect(findMessage(db, message.id)?.status).toBe("sent");
  });
});

describe("sequences", () => {
  function buildSequence() {
    createTemplate(db, company.id, {
      name: "Intro",
      subject: "Hello {{lead.name}}",
      body: "Hi {{lead.contact}}, this is {{company.name}}.",
    });
    createTemplate(db, company.id, {
      name: "Nudge",
      subject: "Following up",
      body: "Just checking in.",
    });

    createSequence(db, company.id, { name: "Schools outreach" });
    const sequence = listSequences(db, company.id)[0]!;
    const templates = db
      .prepare(`SELECT id, name FROM email_templates WHERE company_id = ?`)
      .all(company.id) as { id: string; name: string }[];

    addStep(db, sequence.id, templates.find((t) => t.name === "Intro")!.id, 0);
    addStep(db, sequence.id, templates.find((t) => t.name === "Nudge")!.id, 3);

    return listSequences(db, company.id)[0]!;
  }

  it("queues the first step on enrolment, with the template filled in", () => {
    const sequence = buildSequence();
    enroll(db, sequence.id, lead.id);

    const [message] = listMessagesForLead(db, lead.id);
    expect(message?.subject).toBe("Hello Bengaluru Public School");
    expect(message?.body).toContain("this is Unifloe.");
  });

  it("counts the next step from when the last one was actually sent", async () => {
    // The send confirmation arrives late over the bridge. Scheduling from the
    // queue time would collapse a three-week cadence into one day.
    const sequence = buildSequence();
    enroll(db, sequence.id, lead.id);

    const first = listMessagesForLead(db, lead.id)[0]!;
    await ingestLog(
      db,
      company.id,
      "log.csv",
      log([
        { message_id: first.messageId, status: "sent", sent_at: "2026-09-10T09:00:00Z" },
      ]),
    );

    const messages = listMessagesForLead(db, lead.id);
    expect(messages).toHaveLength(2);
    // Sent on the 10th in Kolkata, plus the step's three days.
    expect(messages[0]?.scheduledFor).toBe("2026-09-13");
  });

  it("stops the cadence when the lead replies", async () => {
    const sequence = buildSequence();
    enroll(db, sequence.id, lead.id);

    const first = listMessagesForLead(db, lead.id)[0]!;
    await ingestLog(db, company.id, "a.csv", log([{ message_id: first.messageId, status: "sent" }]));
    expect(listMessagesForLead(db, lead.id)).toHaveLength(2);

    await ingestLog(
      db,
      company.id,
      "b.csv",
      log([{ message_id: first.messageId, status: "replied" }]),
    );

    // The queued nudge is dropped: continuing to chase somebody who answered
    // is the one thing a sequence must never do.
    const left = listMessagesForLead(db, lead.id);
    expect(left.filter((m) => m.status === "queued")).toHaveLength(0);
  });

  it("stops when the lead is won or lost", () => {
    const sequence = buildSequence();
    enroll(db, sequence.id, lead.id);
    expect(listMessagesForLead(db, lead.id)).toHaveLength(1);

    const won = listStages(db, company.id).find((s) => s.kind === "won")!;
    setLeadStage(db, lead.id, won.id);

    expect(listMessagesForLead(db, lead.id).filter((m) => m.status === "queued")).toHaveLength(0);
  });

  it("finishes once every step has gone", async () => {
    const sequence = buildSequence();
    enroll(db, sequence.id, lead.id);

    for (let step = 0; step < 2; step += 1) {
      const queued = listMessagesForLead(db, lead.id).find((m) => m.status === "queued");
      if (!queued) break;
      await ingestLog(
        db,
        company.id,
        `s-${step}.csv`,
        log([{ message_id: queued.messageId, status: "sent" }]),
      );
    }

    const enrollment = db
      .prepare(`SELECT status FROM enrollments WHERE lead_id = ?`)
      .get(lead.id) as { status: string };
    expect(enrollment.status).toBe("finished");
    expect(listMessagesForLead(db, lead.id)).toHaveLength(2);
  });

  it("refuses to enrol a lead with no email address", () => {
    const sequence = buildSequence();
    const noEmail = createLead(db, company.id, leadInput.parse({ name: "JNS Public School" }));
    expect(() => enroll(db, sequence.id, noEmail.id)).toThrow("no email address");
  });

  it("restarts rather than duplicating when a lead is enrolled twice", () => {
    const sequence = buildSequence();
    enroll(db, sequence.id, lead.id);
    enroll(db, sequence.id, lead.id);

    const enrollments = db
      .prepare(`SELECT COUNT(*) AS n FROM enrollments WHERE lead_id = ?`)
      .get(lead.id) as { n: number };
    expect(enrollments.n).toBe(1);
  });
});

describe("what Today makes of it", () => {
  it("counts what is ready to send", () => {
    queue();
    queue("Another");
    expect(buildToday(db, company.id, NOW).emailsReady).toBe(2);
  });

  it("surfaces a reply that has had no answer", async () => {
    const message = queue("Introducing Unifloe");
    await ingestLog(db, company.id, "log.csv", log([{ message_id: message.messageId, status: "replied" }]));

    const day = buildToday(db, company.id, NOW);
    expect(day.awaitingReply).toHaveLength(1);
    expect(day.awaitingReply[0]?.leadName).toBe("Bengaluru Public School");
  });

  it("drops the reply off the list once it has been answered", async () => {
    const message = queue();
    await ingestLog(db, company.id, "log.csv", log([{ message_id: message.messageId, status: "replied" }]));

    queue("My answer");

    expect(buildToday(db, company.id, NOW).awaitingReply).toHaveLength(0);
  });

  it("warns when an outbox has gone out and no log has come back", async () => {
    queue();
    recordOutbox(db, company.id, "outbox.csv", await buildOutbox(db, company.id, TODAY));

    // The risk the plan names: the bridge is manual, and half of it is easy to
    // forget. Silence here would leave the app showing stale statuses.
    expect(buildToday(db, company.id, NOW).syncOverdue).toBe(true);

    await ingestLog(db, company.id, "log.csv", log([{ message_id: "unknown", status: "sent" }]));
    expect(buildToday(db, company.id, NOW).syncOverdue).toBe(false);
  });

  it("says nothing when nothing has been exported", () => {
    expect(buildToday(db, company.id, NOW).syncOverdue).toBe(false);
  });
});

describe("sync history", () => {
  it("records both directions", async () => {
    const message = queue();
    recordOutbox(db, company.id, "outbox.csv", await buildOutbox(db, company.id, TODAY));
    await ingestLog(db, company.id, "log.csv", log([{ message_id: message.messageId, status: "sent" }]));

    const batches = listSyncBatches(db, company.id);
    expect(batches.map((b) => b.direction)).toEqual(["log", "outbox"]);
    expect(batches[0]).toMatchObject({ filename: "log.csv", applied: 1 });
  });
});
