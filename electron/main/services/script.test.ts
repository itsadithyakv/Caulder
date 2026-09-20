import { beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";

/**
 * The Apps Script itself, run here.
 *
 * It runs in somebody's Google account, where nothing can test it, and it is
 * the half of email that decides whether a message goes, to whom, and when.
 * So the real file is loaded into a sandbox with small stand-ins for the
 * Google services it touches, and driven through its own entry points: the
 * web app's doPost, and the timer's tick.
 */

const SOURCE = readFileSync(
  join(import.meta.dirname, "..", "..", "..", "resources", "appsscript", "Caulder.gs"),
  "utf8",
);

const ME = "founder@gmail.com";
const DAY = 24 * 60 * 60 * 1000;

type Message = {
  id: string;
  threadId: string;
  from: string;
  to: string;
  subject: string;
  at: number;
  headers: Record<string, string>;
};

/** One message as the script reports it. */
type View = {
  id: string;
  status: string;
  sentAt: string | null;
  repliedAt: string | null;
  error: string | null;
  followUp: { status: string; sentAt: string | null; error: string | null } | null;
};

/** Every reply the web app gives, read loosely: the assertions say what matters. */
type Reply = {
  ok: boolean;
  error?: string;
  data: View & {
    emails: View[];
    remaining: number;
    version: number;
    mail: unknown;
    mailError: string | null;
  };
};

type Script = {
  doPost: (event: { postData: { contents: string } }) => { text: string };
  setUp: () => void;
  revoke: () => void;
  tick: () => void;
};

function harness(extra: Record<string, unknown> = {}) {
  const clock = { now: Date.parse("2026-09-17T09:00:00.000Z") };
  const props = new Map<string, string>();
  const threads = new Map<string, Message[]>();
  const messages = new Map<string, Message>();
  const outbox: Message[] = [];
  const triggers: { handler: string; minutes: number }[] = [];
  const settings = { quota: 100, replyAllTo: null as string | null };
  let counter = 0;

  class FakeDate extends Date {
    constructor(...args: unknown[]) {
      if (args.length === 0) super(clock.now);
      else super(args[0] as string | number);
    }
    static override now() {
      return clock.now;
    }
  }

  function wrap(message: Message) {
    return {
      getId: () => message.id,
      getFrom: () => message.from,
      getTo: () => message.to,
      getSubject: () => message.subject,
      getDate: () => new Date(message.at),
      getHeader: (name: string) => message.headers[name] ?? "",
      getThread: () => thread(message.threadId),
      replyAll: (body: string) => {
        store({
          threadId: message.threadId,
          from: ME,
          to: settings.replyAllTo ?? message.to,
          subject: `Re: ${message.subject}`,
          body,
        });
      },
    };
  }

  function thread(id: string) {
    return {
      getId: () => id,
      getMessages: () => (threads.get(id) ?? []).map(wrap),
    };
  }

  function store(draft: { threadId?: string; from: string; to: string; subject: string; body: string }) {
    if (draft.from === ME) {
      if (settings.quota <= 0) {
        throw new Error("Service invoked too many times for one day: email.");
      }
      settings.quota -= 1;
    }
    counter += 1;
    const message: Message = {
      id: `m${counter}`,
      threadId: draft.threadId ?? `t${counter}`,
      from: draft.from,
      to: draft.to,
      subject: draft.subject,
      at: clock.now,
      headers: {},
    };
    threads.set(message.threadId, [...(threads.get(message.threadId) ?? []), message]);
    messages.set(message.id, message);
    if (draft.from === ME) outbox.push(message);
    return message;
  }

  const context = {
    Date: FakeDate,
    Logger: { log: () => undefined },
    Utilities: { getUuid: () => `uuid-${(counter += 1)}` },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (key: string) => props.get(key) ?? null,
        setProperty: (key: string, value: string) => void props.set(key, String(value)),
        deleteProperty: (key: string) => void props.delete(key),
        getProperties: () => Object.fromEntries(props),
      }),
    },
    LockService: { getScriptLock: () => ({ waitLock: () => undefined, releaseLock: () => undefined }) },
    ContentService: {
      MimeType: { JSON: "json" },
      createTextOutput: (text: string) => ({ text, setMimeType() { return this; } }),
    },
    ScriptApp: {
      getProjectTriggers: () =>
        triggers.map((trigger) => ({ getHandlerFunction: () => trigger.handler, trigger })),
      deleteTrigger: (found: { trigger: { handler: string } }) => {
        triggers.splice(triggers.indexOf(found.trigger as never), 1);
      },
      newTrigger: (handler: string) => ({
        timeBased: () => ({
          everyMinutes: (minutes: number) => ({
            create: () => void triggers.push({ handler, minutes }),
          }),
        }),
      }),
    },
    Session: {
      getEffectiveUser: () => ({ getEmail: () => ME }),
      getActiveUser: () => ({ getEmail: () => ME }),
    },
    MailApp: { getRemainingDailyQuota: () => settings.quota },
    GmailApp: {
      getAliases: () => ["hello@unifloe.in"],
      createDraft: (to: string, subject: string, body: string) => ({
        send: () => wrap(store({ from: ME, to, subject, body })),
      }),
      getThreadById: (id: string) => (threads.has(id) ? thread(id) : null),
      getMessageById: (id: string) => wrap(messages.get(id)!),
    },
    CalendarApp: {
      getDefaultCalendar: () => ({ getName: () => "Founder" }),
      getAllOwnedCalendars: () => [],
    },
    Tasks: { Tasklists: { list: () => ({ items: [] }) } },
    // Services a test stands in for itself: People and Drive, which not every script has.
    ...extra,
  };

  runInNewContext(SOURCE, context);
  const script = context as unknown as Script;

  function key(): string {
    return props.get("CAULDER_SECRET") ?? "";
  }

  function post(action: string, payload: Record<string, unknown> = {}, secret = key()) {
    const out = script.doPost({
      postData: { contents: JSON.stringify({ ...payload, action, secret }) },
    });
    return JSON.parse(out.text) as Reply;
  }

  function answer(from: string, subject: string, headers: Record<string, string> = {}) {
    const sent = outbox[outbox.length - 1]!;
    const message = store({ threadId: sent.threadId, from, to: ME, subject, body: "" });
    message.headers = headers;
  }

  return { clock, script, post, outbox, triggers, settings, props, answer };
}

let h: ReturnType<typeof harness>;

beforeEach(() => {
  h = harness();
  h.script.setUp();
});

function send(extra: Record<string, unknown> = {}) {
  return h.post("sendEmail", {
    id: "e1",
    to: "principal@oakridge.edu.in",
    subject: "A quick question",
    body: "Hello there",
    sendAt: null,
    followUp: null,
    ...extra,
  });
}

function status(ids = ["e1"], ack: string[] = []) {
  return h.post("emailStatus", { ids, ack }).data.emails[0]!;
}

describe("setting up", () => {
  it("installs one fifteen-minute timer, however often it is run", () => {
    h.script.setUp();
    expect(h.triggers).toEqual([{ handler: "tick", minutes: 15 }]);
  });

  it("says its version and who email goes out as", () => {
    const hello = h.post("hello").data;
    expect(hello.version).toBe(4);
    expect(hello.mail).toEqual({ address: ME, remaining: 100 });
    expect(hello.mailError).toBeNull();
  });

  it("says so when the timer is missing", () => {
    h.triggers.length = 0;
    expect(h.post("hello").data.mailError).toContain("run setUp once more");
  });

  it("refuses a request without the right key", () => {
    expect(h.post("hello", {}, "wrong")).toEqual({ ok: false, error: "That key is not right." });
  });

  it("stops the timer when Caulder is cut off", () => {
    h.script.revoke();
    expect(h.triggers).toEqual([]);
  });
});

describe("sending", () => {
  it("sends a message due now while Caulder waits", () => {
    const reply = send();
    expect(reply.ok).toBe(true);
    expect(reply.data.status).toBe("sent");
    expect(reply.data.sentAt).toBe("2026-09-17T09:00:00.000Z");
    expect(h.outbox.map((m) => m.to)).toEqual(["principal@oakridge.edu.in"]);
  });

  it("sends nothing twice when Caulder retries", () => {
    send();
    send();
    expect(h.outbox).toHaveLength(1);
  });

  it("holds a scheduled message until its time, then the timer sends it", () => {
    const reply = send({ sendAt: "2026-09-18T09:00:00.000Z" });
    expect(reply.data.status).toBe("scheduled");

    h.script.tick();
    expect(h.outbox).toHaveLength(0);

    h.clock.now = Date.parse("2026-09-18T09:05:00.000Z");
    h.script.tick();
    expect(h.outbox).toHaveLength(1);
    expect(status().status).toBe("sent");
  });

  it("does not keep the body once a message has gone", () => {
    send();
    const stored = [...h.props.entries()].find(([k]) => k.startsWith("caulder-mail:"))?.[1] ?? "";
    expect(stored).not.toContain("Hello there");
  });

  it("comes back with Gmail's refusal when the day's sends are used up", () => {
    h.settings.quota = 0;
    const reply = send();
    expect(reply.ok).toBe(false);
    expect(reply.error).toContain("too many times");
  });

  it("refuses a message too long to hold", () => {
    const reply = send({ sendAt: "2026-09-18T09:00:00.000Z", body: "x".repeat(9000) });
    expect(reply.ok).toBe(false);
    expect(reply.error).toContain("too long");
  });

  it("refuses something that is not an address", () => {
    expect(send({ to: "not an address" }).error).toContain("not an address");
  });
});

describe("watching for a reply", () => {
  it("notices a reply and drops the waiting follow-up", () => {
    send({ followUp: { days: 3, body: "Just checking in" } });
    h.clock.now += 60 * 60 * 1000;
    h.answer("Asha Menon <principal@oakridge.edu.in>", "Re: A quick question");
    h.script.tick();

    const after = status();
    expect(after.status).toBe("replied");
    expect(after.repliedAt).toBe("2026-09-17T10:00:00.000Z");
    expect(after.followUp?.status).toBe("skipped");
  });

  it("does not take an out-of-office for an answer", () => {
    send();
    h.clock.now += 60 * 60 * 1000;
    h.answer("principal@oakridge.edu.in", "Automatic reply: A quick question", {
      "Auto-Submitted": "auto-replied",
    });
    h.script.tick();
    expect(status().status).toBe("sent");
  });

  it("does not take a message from one of your own addresses for an answer", () => {
    send();
    h.clock.now += 60 * 60 * 1000;
    h.answer("Unifloe <hello@unifloe.in>", "Re: A quick question");
    h.script.tick();
    expect(status().status).toBe("sent");
  });

  it("reports a bounce as a failure", () => {
    send({ followUp: { days: 3, body: "Just checking in" } });
    h.clock.now += 60 * 1000;
    h.answer("Mail Delivery Subsystem <mailer-daemon@googlemail.com>", "Delivery Status Notification (Failure)");
    h.script.tick();

    const after = status();
    expect(after.status).toBe("failed");
    expect(after.error).toMatch(/^It bounced/);
    expect(after.followUp?.status).toBe("cancelled");
  });
});

describe("the follow-up", () => {
  it("goes in the same thread once the days are up, and only once", () => {
    send({ followUp: { days: 3, body: "Just checking in" } });

    h.clock.now += 2 * DAY;
    h.script.tick();
    expect(h.outbox).toHaveLength(1);

    h.clock.now += 1 * DAY;
    h.script.tick();
    h.script.tick();
    expect(h.outbox).toHaveLength(2);
    expect(h.outbox[1]?.threadId).toBe(h.outbox[0]?.threadId);
    expect(h.outbox[1]?.to).toBe("principal@oakridge.edu.in");

    const after = status();
    expect(after.status).toBe("sent");
    expect(after.followUp?.status).toBe("sent");
  });

  it("is reported, not assumed, when it did not reach the contact", () => {
    h.settings.replyAllTo = ME;
    send({ followUp: { days: 1, body: "Just checking in" } });
    h.clock.now += DAY + 1;
    h.script.tick();

    const after = status();
    expect(after.followUp?.status).toBe("failed");
    expect(after.followUp?.error).toContain("did not go to principal@oakridge.edu.in");
  });

  it("can be cancelled while it waits", () => {
    send({ followUp: { days: 1, body: "Just checking in" } });
    const cancelled = h.post("cancelEmail", { id: "e1" }).data;
    expect(cancelled.status).toBe("sent");
    expect(cancelled.followUp?.status).toBe("cancelled");

    h.clock.now += 2 * DAY;
    h.script.tick();
    expect(h.outbox).toHaveLength(1);
  });
});

describe("cancelling and forgetting", () => {
  it("stops a scheduled message from going", () => {
    send({ sendAt: "2026-09-18T09:00:00.000Z" });
    expect(h.post("cancelEmail", { id: "e1" }).data.status).toBe("cancelled");
    h.clock.now += 2 * DAY;
    h.script.tick();
    expect(h.outbox).toHaveLength(0);
  });

  it("forgets a message once Caulder says it has read the outcome", () => {
    send();
    expect(status(["e1"], ["e1"]).status).toBe("missing");
  });

  it("reports the day's remaining sends with every status", () => {
    send();
    expect(h.post("emailStatus", { ids: [], ack: [] }).data.remaining).toBe(99);
  });
});


describe("contacts and backups", () => {
  type Person = { resourceName?: string; etag?: string; names: { givenName: string; familyName: string }[]; organizations: { name: string }[] };

  /** Google Contacts, as far as the script is concerned. */
  function people() {
    const kept = new Map<string, Person>();
    let made = 0;
    return {
      kept,
      People: {
        People: {
          get: (name: string) => {
            if (name === "people/me") return { resourceName: name };
            const found = kept.get(name);
            if (!found) throw new Error("Requested entity was not found.");
            return { ...found, etag: "etag-1" };
          },
          createContact: (body: Person) => {
            const resourceName = `people/c${(made += 1)}`;
            kept.set(resourceName, { ...body, resourceName });
            return { resourceName };
          },
          updateContact: (body: Person, name: string) => {
            kept.set(name, { ...body, resourceName: name });
            return { resourceName: name };
          },
        },
      },
    };
  }

  /** A Drive with one folder's worth of files in it. */
  function drive() {
    const files: { name: string; at: number; trashed: boolean }[] = [];
    const asFile = (file: (typeof files)[number]) => ({
      getName: () => file.name,
      getSize: () => 3,
      getDateCreated: () => ({ getTime: () => file.at }),
      setTrashed: (value: boolean) => void (file.trashed = value),
    });
    const iterate = <T,>(items: T[]) => {
      let at = 0;
      return { hasNext: () => at < items.length, next: () => items[(at += 1) - 1]! };
    };
    const folder = {
      createFile: (blob: { name: string }) => {
        const file = { name: blob.name, at: files.length + 1, trashed: false };
        files.push(file);
        return asFile(file);
      },
      getFiles: () => iterate(files.filter((file) => !file.trashed).map(asFile)),
    };
    return {
      files,
      DriveApp: { getRootFolder: () => ({ getName: () => "My Drive" }), getFoldersByName: () => iterate([folder]), createFolder: () => folder },
      Utilities: {
        getUuid: () => "uuid",
        base64Decode: (data: string) => [...Buffer.from(data, "base64")],
        newBlob: (_bytes: number[], _type: string, name: string) => ({ name }),
      },
    };
  }

  const loose = (reply: unknown) => reply as { ok: boolean; error?: string; data: Record<string, unknown> };
  const rahul = { name: "MS PUC", person: "Rahul Nair", phone: "98765 43210", email: "rahul@mspuc.in" };

  it("answers everything else without the People service, and says what saving a contact needs", () => {
    expect(loose(h.post("hello")).data["contacts"]).toBe(false);
    const refused = loose(h.post("saveContact", { contact: rahul }));
    expect(refused.ok).toBe(false);
    expect(refused.error).toContain("add the People API");
  });

  it("files a person under their own name, at the company", () => {
    const google = people();
    const with_ = harness(google);
    with_.script.setUp();
    expect(loose(with_.post("hello")).data["contacts"]).toBe(true);

    const saved = loose(with_.post("saveContact", { contact: rahul }));
    expect(saved.data).toEqual({ resourceName: "people/c1", made: true });
    expect(google.kept.get("people/c1")).toMatchObject({
      names: [{ givenName: "Rahul", familyName: "Nair" }],
      organizations: [{ name: "MS PUC" }],
    });
  });

  it("updates the contact it made rather than making a second, and makes it again if it was deleted", () => {
    const google = people();
    const with_ = harness(google);
    with_.script.setUp();
    with_.post("saveContact", { contact: rahul });

    const again = loose(with_.post("saveContact", { contact: { ...rahul, person: "Rahul K Nair" }, resourceName: "people/c1" }));
    expect(again.data).toEqual({ resourceName: "people/c1", made: false });
    expect(google.kept.size).toBe(1);

    google.kept.clear();
    const remade = loose(with_.post("saveContact", { contact: rahul, resourceName: "people/c1" }));
    expect(remade.data).toMatchObject({ made: true });
  });

  it("keeps the newest ten backups in Drive, and bins the rest", () => {
    const google = drive();
    const with_ = harness(google);
    with_.script.setUp();
    for (let i = 1; i <= 12; i += 1) {
      const put = loose(with_.post("backupPut", { name: `caulder-${String(i).padStart(2, "0")}.db`, data: "YWJj" }));
      expect(put.ok).toBe(true);
    }
    expect(google.files.filter((file) => !file.trashed).map((file) => file.name)).toEqual(
      Array.from({ length: 10 }, (_each, i) => `caulder-${String(i + 3).padStart(2, "0")}.db`),
    );
    expect((loose(with_.post("backupList")).data["backups"] as unknown[]).length).toBe(10);
  });

  it("refuses a name that is not a backup file's", () => {
    const with_ = harness(drive());
    with_.script.setUp();
    const refused = loose(with_.post("backupPut", { name: "../../evil.db", data: "YWJj" }));
    expect(refused.ok).toBe(false);
    expect(refused.error).toContain("not a backup file");
  });
});
