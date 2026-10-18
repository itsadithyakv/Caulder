import { connect as connectTls } from "node:tls";
import type { Duplex } from "node:stream";
import { INBOX_HEADERS, readHeaders, type InboxHeaders } from "@shared/replies";

/**
 * Asking a mail account for its inbox, to see who wrote back
 * (shared/replies.ts, PLAN.md part eight).
 *
 * IMAP, spoken by hand over `node:tls`: six commands, and a reader that knows
 * a server may hand a block over as a counted run of bytes. A library would
 * be a fourteenth dependency for what is, here, a login and two questions.
 *
 * Three things it never does, each by the command it chooses:
 *
 *  - **It never changes the mailbox.** The inbox is opened with `EXAMINE`,
 *    which is read-only, so nothing can be marked read, moved or deleted.
 *  - **It never reads a message.** `BODY.PEEK[HEADER.FIELDS (…)]` asks for
 *    seven named headers and nothing else: no subject, no text, no attachment.
 *  - **It never stays connected.** One look, then `LOGOUT`.
 */

type InboxLogin = { host: string; port: number; username: string; password: string };

/** The connection: TLS for real, and a plain socket to a stand-in server in the tests. */
let open = (host: string, port: number): Duplex => connectTls({ host, port, servername: host });

/** For tests only. */
export function useInboxSocketForTests(make: typeof open): void {
  open = make;
}

/** How long a whole look may take before it is given up on. */
const PATIENCE_MS = 30_000;

/** The most messages looked at in one go: the newest, which is where a reply would be. */
const MOST = 400;

type Answer = { lines: string[]; blocks: Buffer[] };

/** What a mail server says, in words a person can act on. */
function sayProblem(error: unknown, host: string): Error {
  const message = error instanceof Error ? error.message : String(error);
  if (/ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(message)) return new Error(`Could not find ${host}, the server the inbox is read from.`);
  if (/ETIMEDOUT|timed out|ECONNREFUSED|ECONNRESET|closed/i.test(message)) return new Error(`${host} did not answer, so the inbox could not be read just now.`);
  return new Error(`The mail server said: ${message}`);
}

/** A word the way IMAP wants it quoted. A password it cannot carry this way is said, not mangled. */
function quoted(text: string): string {
  if (/[^\x20-\x7e]/.test(text)) throw new Error("That password has a character an inbox login cannot carry. Make an app password with letters and numbers only.");
  return `"${text.replace(/[\\"]/g, "\\$&")}"`;
}

/** Message numbers as a server takes them: runs joined, so four hundred of them is a short line. */
function setOf(numbers: readonly number[]): string {
  const parts: string[] = [];
  let from = numbers[0] as number;
  let to = from;
  for (const n of numbers.slice(1)) {
    if (n === to + 1) {
      to = n;
      continue;
    }
    parts.push(from === to ? `${from}` : `${from}:${to}`);
    from = to = n;
  }
  parts.push(from === to ? `${from}` : `${from}:${to}`);
  return parts.join(",");
}

/**
 * One conversation with the server. Commands go one at a time, each with a
 * tag; everything the server says until it repeats the tag is that command's
 * answer.
 */
function converse(socket: Duplex): { ready: Promise<void>; ask: (command: string) => Promise<Answer>; end: () => void } {
  let buffer: Buffer = Buffer.alloc(0);
  /** Bytes still owed for a counted block the server has announced. */
  let owed = 0;
  let count = 0;
  let current: { tag: string; answer: Answer; resolve: (answer: Answer) => void; reject: (error: Error) => void } | null = null;
  let greeted: (() => void) | null = null;
  let refused: ((error: Error) => void) | null = null;
  let failure: Error | null = null;

  const ready = new Promise<void>((resolve, reject) => {
    greeted = resolve;
    refused = reject;
  });

  const fail = (error: Error) => {
    failure = failure ?? error;
    refused?.(failure);
    current?.reject(failure);
    current = null;
  };

  const line = (text: string) => {
    if (greeted) {
      if (/^\* (OK|PREAUTH)\b/i.test(text)) {
        greeted();
        greeted = refused = null;
      } else if (/^\* BYE\b/i.test(text)) fail(new Error(text.slice(6) || "the server closed the connection"));
      return;
    }
    if (!current) return;
    if (text.startsWith(`${current.tag} `)) {
      const said = text.slice(current.tag.length + 1);
      const done = current;
      current = null;
      if (/^OK\b/i.test(said)) done.resolve(done.answer);
      else done.reject(new Error(said.replace(/^(NO|BAD)\s*/i, "")));
      return;
    }
    current.answer.lines.push(text);
  };

  socket.on("data", (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk]);
    for (;;) {
      if (owed > 0) {
        if (buffer.length < owed) return;
        current?.answer.blocks.push(buffer.subarray(0, owed));
        buffer = buffer.subarray(owed);
        owed = 0;
        continue;
      }
      const end = buffer.indexOf("\r\n");
      if (end < 0) return;
      const text = buffer.subarray(0, end).toString("latin1");
      buffer = buffer.subarray(end + 2);
      // "{342}" at the end of a line: the next 342 bytes are a block, not lines.
      const block = /\{(\d+)\}$/.exec(text);
      if (block) owed = Number(block[1]);
      else line(text);
    }
  });
  socket.on("error", (error: Error) => fail(error));
  socket.on("close", () => fail(new Error("closed")));

  return {
    ready,
    ask: (command) =>
      new Promise<Answer>((resolve, reject) => {
        if (failure) return reject(failure);
        count += 1;
        const tag = `c${count}`;
        current = { tag, answer: { lines: [], blocks: [] }, resolve, reject };
        socket.write(`${tag} ${command}\r\n`);
      }),
    end: () => socket.destroy(),
  };
}

async function look<T>(login: InboxLogin, then: (ask: (command: string) => Promise<Answer>) => Promise<T>): Promise<T> {
  let socket: Duplex;
  try {
    socket = open(login.host, login.port);
  } catch (error) {
    throw sayProblem(error, login.host);
  }
  const talk = converse(socket);
  const patience = setTimeout(() => socket.destroy(new Error("timed out")), PATIENCE_MS);
  try {
    await talk.ready;
    try {
      await talk.ask(`LOGIN ${quoted(login.username)} ${quoted(login.password)}`);
    } catch (error) {
      if (error instanceof Error && /character an inbox login/.test(error.message)) throw error;
      if (error instanceof Error && /ENOTFOUND|ETIMEDOUT|timed out|ECONNRE|closed|getaddrinfo/i.test(error.message)) throw error;
      throw new Error(
        "The inbox turned down that username and password. Some providers want reading by other apps switched on first - in Zoho it is Settings, Mail Accounts, IMAP Access - and the app password is the one to use.",
      );
    }
    // Read-only: nothing this connection does can change the mailbox.
    await talk.ask("EXAMINE INBOX");
    const found = await then(talk.ask);
    await talk.ask("LOGOUT").catch(() => undefined);
    return found;
  } catch (error) {
    if (error instanceof Error && /^(The inbox turned down|That password has)/.test(error.message)) throw error;
    throw sayProblem(error, login.host);
  } finally {
    clearTimeout(patience);
    talk.end();
  }
}

/** Whether the inbox can be opened at all. Throws a sentence when it cannot. */
export async function tryInbox(login: InboxLogin): Promise<void> {
  await look(login, async () => undefined);
}

/**
 * The headers of what has arrived since a day (`sinceDay` in
 * shared/replies.ts): who each is from, when, and what it answers.
 */
export async function readInbox(login: InboxLogin, since: string): Promise<InboxHeaders[]> {
  return look(login, async (ask) => {
    const search = await ask(`SEARCH SINCE ${since}`);
    const numbers = search.lines
      .filter((each) => /^\* SEARCH\b/i.test(each))
      .flatMap((each) => each.slice(8).trim().split(/\s+/))
      .map(Number)
      .filter((n) => Number.isInteger(n) && n > 0)
      .sort((a, b) => a - b)
      .slice(-MOST);
    if (numbers.length === 0) return [];
    const fetched = await ask(`FETCH ${setOf(numbers)} (BODY.PEEK[HEADER.FIELDS (${INBOX_HEADERS.join(" ")})])`);
    return fetched.blocks.map((block) => readHeaders(block.toString("utf8")));
  });
}
