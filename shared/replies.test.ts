import { describe, expect, it } from "vitest";
import { readHeaders, repliesAmong, sinceDay, type InboxHeaders, type SentMessage } from "./replies";

const SENT: SentMessage = { id: "e1", messageId: "<abc@unifloe.in>", to: "priya@kettle.example", sentAt: "2026-10-05T09:00:00.000Z" };

const heard = (over: Partial<InboxHeaders>): InboxHeaders => ({
  from: "priya@kettle.example",
  date: "2026-10-06T11:30:00.000Z",
  answers: [],
  auto: false,
  ...over,
});

describe("reading a message's headers", () => {
  it("takes who it is from, when, and what it answers - and nothing else", () => {
    const read = readHeaders(
      [
        'From: "Priya Nair" <Priya@Kettle.example>',
        "Date: Tue, 6 Oct 2026 17:00:00 +0530 (IST)",
        "Message-ID: <reply1@kettle.example>",
        "In-Reply-To: <abc@unifloe.in>",
        "References: <first@unifloe.in>",
        " <abc@unifloe.in>",
        "",
      ].join("\r\n"),
    );
    expect(read).toEqual({
      from: "priya@kettle.example",
      date: "2026-10-06T11:30:00.000Z",
      answers: ["<abc@unifloe.in>", "<first@unifloe.in>"],
      auto: false,
    });
  });

  it("reads a bare address, and one with no name", () => {
    expect(readHeaders("From: office@brightside.example\r\n").from).toBe("office@brightside.example");
    expect(readHeaders("From: <office@brightside.example>\r\n").from).toBe("office@brightside.example");
  });

  it("knows a machine's answer from a person's", () => {
    expect(readHeaders("From: a@b.example\r\nAuto-Submitted: auto-replied\r\n").auto).toBe(true);
    expect(readHeaders("From: a@b.example\r\nAuto-Submitted: no\r\n").auto).toBe(false);
    expect(readHeaders("From: MAILER-DAEMON@mx.zoho.com\r\n").auto).toBe(true);
    expect(readHeaders("From: news@b.example\r\nPrecedence: bulk\r\n").auto).toBe(true);
    expect(readHeaders("From: a@b.example\r\n").auto).toBe(false);
  });

  it("gives no date rather than a wrong one", () => {
    expect(readHeaders("From: a@b.example\r\nDate: sometime last week\r\n").date).toBeNull();
    expect(readHeaders("From: a@b.example\r\n").date).toBeNull();
  });
});

describe("who answered", () => {
  it("finds a reply by the message it names, whoever it is from", () => {
    // Answered from a colleague's address: the thread still says what it answers.
    const found = repliesAmong([SENT], [heard({ from: "accounts@kettle.example", answers: ["<abc@unifloe.in>"] })]);
    expect([...found]).toEqual([["e1", "2026-10-06T11:30:00.000Z"]]);
  });

  it("finds one from the address written to, even in a thread of its own", () => {
    expect([...repliesAmong([SENT], [heard({})])]).toEqual([["e1", "2026-10-06T11:30:00.000Z"]]);
  });

  it("is not fooled by something they sent before being written to", () => {
    expect(repliesAmong([SENT], [heard({ date: "2026-10-04T08:00:00.000Z" })]).size).toBe(0);
  });

  it("does not count an out-of-office or a bounce, so a follow-up still goes", () => {
    expect(repliesAmong([SENT], [heard({ auto: true, answers: ["<abc@unifloe.in>"] })]).size).toBe(0);
  });

  it("keeps the first answer when there are several", () => {
    const found = repliesAmong([SENT], [heard({ date: "2026-10-08T10:00:00.000Z" }), heard({ date: "2026-10-06T10:00:00.000Z" })]);
    expect(found.get("e1")).toBe("2026-10-06T10:00:00.000Z");
  });

  it("counts a fresh message against the latest thing sent to them before it", () => {
    const second: SentMessage = { id: "e2", messageId: "<def@unifloe.in>", to: "priya@kettle.example", sentAt: "2026-10-07T09:00:00.000Z" };
    const found = repliesAmong([SENT, second], [heard({ date: "2026-10-08T10:00:00.000Z" })]);
    expect([...found.keys()]).toEqual(["e2"]);
  });

  it("matches nobody else's mail, and nothing without a date", () => {
    expect(repliesAmong([SENT], [heard({ from: "stranger@elsewhere.example" })]).size).toBe(0);
    expect(repliesAmong([SENT], [heard({ date: null, answers: ["<abc@unifloe.in>"] })]).size).toBe(0);
  });

  it("allows for a server's clock being a little behind", () => {
    const found = repliesAmong([SENT], [heard({ date: "2026-10-05T08:59:10.000Z", answers: ["<abc@unifloe.in>"] })]);
    expect(found.has("e1")).toBe(true);
  });
});

describe("how far back to ask", () => {
  it("asks from the day before the oldest message, the way a mail server reads a day", () => {
    expect(sinceDay("2026-10-05T09:00:00.000Z")).toBe("4-Oct-2026");
    expect(sinceDay("2026-01-01T00:30:00.000Z")).toBe("31-Dec-2025");
  });
});
