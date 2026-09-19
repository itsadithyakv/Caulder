import { describe, expect, it } from "vitest";
import { planEmailChange, sendEmailInput, type EmailProgress, type RemoteEmail } from "./mail";

/**
 * How a message's state moves when the script reports on it.
 *
 * The cases that matter are the ones where the same report arrives twice, a
 * report arrives late, or the script has lost the message - each of which
 * would otherwise write the wrong thing to a contact's history.
 */

const NOW = new Date("2026-09-17T10:00:00.000Z");

const scheduled: EmailProgress = {
  status: "scheduled",
  sentAt: null,
  repliedAt: null,
  error: null,
  followUpStatus: "waiting",
  followUpSentAt: null,
  followUpError: null,
};

function remote(over: Partial<RemoteEmail>): RemoteEmail {
  return {
    id: "m1",
    status: "sent",
    sentAt: "2026-09-17T09:00:00.000Z",
    repliedAt: null,
    error: null,
    followUp: { status: "waiting", sentAt: null, error: null },
    ...over,
  };
}

describe("a message going out", () => {
  it("records the send once, and keeps watching", () => {
    const change = planEmailChange(scheduled, remote({}), NOW);
    expect(change.events).toEqual(["sent"]);
    expect(change.next.status).toBe("sent");
    expect(change.settled).toBe(false);

    const again = planEmailChange(change.next, remote({}), NOW);
    expect(again.events).toEqual([]);
  });

  it("records both the send and the reply when both happened between looks", () => {
    const change = planEmailChange(
      scheduled,
      remote({
        status: "replied",
        repliedAt: "2026-09-17T09:30:00.000Z",
        followUp: { status: "skipped", sentAt: null, error: null },
      }),
      NOW,
    );
    expect(change.events).toEqual(["sent", "replied"]);
    expect(change.next.followUpStatus).toBe("skipped");
    expect(change.settled).toBe(true);
  });

  it("never goes back from replied to sent", () => {
    const replied: EmailProgress = {
      ...scheduled,
      status: "replied",
      sentAt: "2026-09-17T09:00:00.000Z",
      repliedAt: "2026-09-17T09:30:00.000Z",
      followUpStatus: "skipped",
    };
    const change = planEmailChange(replied, remote({}), NOW);
    expect(change.next.status).toBe("replied");
    expect(change.events).toEqual([]);
  });

  it("tells a bounce from any other failure", () => {
    const sent = { ...scheduled, status: "sent" as const, sentAt: "2026-09-17T09:00:00.000Z" };
    expect(
      planEmailChange(sent, remote({ status: "failed", error: "It bounced: Undeliverable" }), NOW)
        .events,
    ).toEqual(["bounced"]);
    expect(
      planEmailChange(scheduled, remote({ status: "failed", sentAt: null, error: "Quota" }), NOW)
        .events,
    ).toEqual(["failed"]);
  });
});

describe("the follow-up", () => {
  const sent: EmailProgress = { ...scheduled, status: "sent", sentAt: "2026-09-10T09:00:00.000Z" };

  it("is recorded once when it goes, and then the message can settle later", () => {
    const report = remote({
      sentAt: "2026-09-10T09:00:00.000Z",
      followUp: { status: "sent", sentAt: "2026-09-14T09:00:00.000Z", error: null },
    });
    const change = planEmailChange(sent, report, NOW);
    expect(change.events).toEqual(["follow_up_sent"]);
    expect(change.settled).toBe(false);
    expect(planEmailChange(change.next, report, NOW).events).toEqual([]);
  });

  it("reports its own failure without failing the message", () => {
    const change = planEmailChange(
      sent,
      remote({
        sentAt: "2026-09-10T09:00:00.000Z",
        followUp: { status: "failed", sentAt: null, error: "Did not go to them" },
      }),
      NOW,
    );
    expect(change.events).toEqual(["follow_up_failed"]);
    expect(change.next.status).toBe("sent");
    expect(change.next.followUpError).toBe("Did not go to them");
  });

  it("does not come back once it has been cancelled here", () => {
    const cancelled: EmailProgress = { ...sent, followUpStatus: "cancelled" };
    const change = planEmailChange(cancelled, remote({ sentAt: sent.sentAt }), NOW);
    expect(change.next.followUpStatus).toBe("cancelled");
  });
});

describe("a message the script no longer has", () => {
  it("has failed if it was still waiting to go", () => {
    const change = planEmailChange(scheduled, remote({ status: "missing" }), NOW);
    expect(change.next.status).toBe("failed");
    expect(change.next.followUpStatus).toBe("cancelled");
    expect(change.events).toEqual(["failed"]);
    expect(change.settled).toBe(true);
  });

  it("is simply settled if it had already gone", () => {
    const sent: EmailProgress = { ...scheduled, status: "sent", sentAt: "2026-09-17T09:00:00.000Z", followUpStatus: null };
    const change = planEmailChange(sent, remote({ status: "missing" }), NOW);
    expect(change.next).toEqual(sent);
    expect(change.events).toEqual([]);
    expect(change.settled).toBe(true);
  });
});

describe("settling", () => {
  it("stops watching a sent message after thirty days", () => {
    const old: EmailProgress = { ...scheduled, status: "sent", sentAt: "2026-08-01T09:00:00.000Z", followUpStatus: null };
    const change = planEmailChange(old, remote({ sentAt: old.sentAt, followUp: null }), NOW);
    expect(change.settled).toBe(true);
  });
});

describe("what a person can ask for", () => {
  it("needs a subject and a message", () => {
    expect(() =>
      sendEmailInput.parse({ leadId: "l", subject: " ", body: "Hi", sendAt: null, followUp: null }),
    ).toThrow("subject");
  });

  it("keeps a follow-up between one and sixty days", () => {
    const base = { leadId: "l", subject: "Hello", body: "Hi", sendAt: null };
    expect(() =>
      sendEmailInput.parse({ ...base, followUp: { days: 0, templateId: "t" } }),
    ).toThrow("at least a day");
    expect(() =>
      sendEmailInput.parse({ ...base, followUp: { days: 61, templateId: "t" } }),
    ).toThrow("at most 60 days");
  });

  it("refuses a send time that is not a date", () => {
    expect(() =>
      sendEmailInput.parse({ leadId: "l", subject: "Hello", body: "Hi", sendAt: "soon", followUp: null }),
    ).toThrow("not a date");
  });
});
