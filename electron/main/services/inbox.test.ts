import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { connect, createServer, type Server, type Socket } from "node:net";
import { readInbox, tryInbox, useInboxSocketForTests } from "./inbox";

/**
 * A stand-in mail server on this machine, speaking just enough IMAP: what it
 * was asked is kept, so the tests can say what Caulder never asks for.
 */

type Script = {
  password: string;
  /** Message numbers a search finds. */
  found: number[];
  /** The header block for each message number. */
  headers: Record<number, string>;
  /** Hand a block over in two pieces, the way a real connection does. */
  split?: boolean;
  /** Say nothing after the greeting, ever. */
  silent?: boolean;
};

let server: Server;
let port = 0;
let script: Script;
let asked: string[] = [];
const open = new Set<Socket>();

beforeAll(async () => {
  server = createServer((socket) => {
    open.add(socket);
    socket.on("close", () => open.delete(socket));
    socket.on("error", () => undefined);
    socket.write("* OK stand-in ready\r\n");
    let pending = "";
    socket.on("data", (chunk) => {
      pending += chunk.toString("latin1");
      for (;;) {
        const end = pending.indexOf("\r\n");
        if (end < 0) return;
        const line = pending.slice(0, end);
        pending = pending.slice(end + 2);
        const [tag, ...rest] = line.split(" ");
        const command = rest.join(" ");
        asked.push(command);
        if (script.silent) continue;
        if (/^LOGIN /.test(command)) {
          socket.write(command.endsWith(`"${script.password}"`) ? `${tag} OK logged in\r\n` : `${tag} NO [AUTHENTICATIONFAILED] Invalid credentials\r\n`);
        } else if (/^EXAMINE INBOX$/.test(command)) {
          socket.write(`* 3 EXISTS\r\n* OK [READ-ONLY]\r\n${tag} OK [READ-ONLY] examined\r\n`);
        } else if (/^SEARCH SINCE /.test(command)) {
          socket.write(`* SEARCH ${script.found.join(" ")}\r\n${tag} OK done\r\n`);
        } else if (/^FETCH /.test(command)) {
          for (const n of script.found) {
            const block = script.headers[n] ?? "";
            const head = `* ${n} FETCH (BODY[HEADER.FIELDS (FROM DATE)] {${Buffer.byteLength(block)}}\r\n`;
            if (script.split) {
              socket.write(head + block.slice(0, 10));
              socket.write(`${block.slice(10)})\r\n`);
            } else socket.write(`${head}${block})\r\n`);
          }
          socket.write(`${tag} OK fetched\r\n`);
        } else if (/^LOGOUT$/.test(command)) {
          socket.write(`* BYE\r\n${tag} OK bye\r\n`);
        } else socket.write(`${tag} BAD what\r\n`);
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = (server.address() as { port: number }).port;
  useInboxSocketForTests(() => connect(port, "127.0.0.1"));
});

afterEach(() => {
  asked = [];
  for (const socket of open) socket.destroy();
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const LOGIN = { host: "imap.stand-in.example", port: 993, username: "me@unifloe.in", password: 'app "pass" word' };

const REPLY = ["From: Priya Nair <priya@kettle.example>", "Date: Tue, 6 Oct 2026 11:30:00 +0000", "In-Reply-To: <abc@unifloe.in>", "", ""].join("\r\n");
const OTHER = ["From: news@elsewhere.example", "Date: Wed, 7 Oct 2026 08:00:00 +0000", "Precedence: bulk", "", ""].join("\r\n");

describe("reading an inbox", () => {
  it("logs in, looks, and comes back with who wrote and what they were answering", async () => {
    script = { password: LOGIN.password.replace(/"/g, '\\"'), found: [7, 8], headers: { 7: REPLY, 8: OTHER } };
    const found = await readInbox(LOGIN, "4-Oct-2026");
    expect(found).toEqual([
      { from: "priya@kettle.example", date: "2026-10-06T11:30:00.000Z", answers: ["<abc@unifloe.in>"], auto: false },
      { from: "news@elsewhere.example", date: "2026-10-07T08:00:00.000Z", answers: [], auto: true },
    ]);
  });

  it("opens the inbox read-only, asks for headers by name, and never for a message", async () => {
    script = { password: LOGIN.password.replace(/"/g, '\\"'), found: [1, 2, 3, 9], headers: { 1: REPLY, 2: REPLY, 3: REPLY, 9: REPLY } };
    await readInbox(LOGIN, "4-Oct-2026");
    expect(asked.map((each) => each.split(" ")[0])).toEqual(["LOGIN", "EXAMINE", "SEARCH", "FETCH", "LOGOUT"]);
    expect(asked).toContain("EXAMINE INBOX");
    expect(asked).toContain("SEARCH SINCE 4-Oct-2026");
    const fetch = asked.find((each) => each.startsWith("FETCH")) ?? "";
    // Runs of numbers are joined, and only named headers are asked for - peeked at, so nothing is marked read.
    expect(fetch).toBe("FETCH 1:3,9 (BODY.PEEK[HEADER.FIELDS (FROM DATE MESSAGE-ID IN-REPLY-TO REFERENCES AUTO-SUBMITTED PRECEDENCE)])");
    expect(asked.join("\n")).not.toMatch(/SELECT|STORE|SUBJECT|TEXT|RFC822|BODY\[\]|EXPUNGE|DELETE/i);
  });

  it("puts a block back together when it arrives in pieces", async () => {
    script = { password: LOGIN.password.replace(/"/g, '\\"'), found: [7], headers: { 7: REPLY }, split: true };
    const found = await readInbox(LOGIN, "4-Oct-2026");
    expect(found[0]?.from).toBe("priya@kettle.example");
  });

  it("asks for nothing more when nothing has arrived", async () => {
    script = { password: LOGIN.password.replace(/"/g, '\\"'), found: [], headers: {} };
    expect(await readInbox(LOGIN, "4-Oct-2026")).toEqual([]);
    expect(asked.some((each) => each.startsWith("FETCH"))).toBe(false);
  });

  it("says a wrong password in a sentence, with where to look", async () => {
    script = { password: "something else", found: [], headers: {} };
    await expect(tryInbox(LOGIN)).rejects.toThrow(/turned down that username and password.*IMAP Access/);
  });

  it("refuses a password it cannot carry rather than sending it wrong", async () => {
    script = { password: "x", found: [], headers: {} };
    await expect(tryInbox({ ...LOGIN, password: "pässword" })).rejects.toThrow(/character an inbox login cannot carry/);
    expect(asked.some((each) => each.startsWith("LOGIN"))).toBe(false);
  });

  it("says so when the server cannot be reached", async () => {
    useInboxSocketForTests(() => connect(1, "127.0.0.1"));
    await expect(tryInbox(LOGIN)).rejects.toThrow(/did not answer/);
    useInboxSocketForTests(() => connect(port, "127.0.0.1"));
  });
});
