import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";

/**
 * Looking back: the journal read by a model on this computer, or sent to the
 * connected AI only with the passcode typed again. Ollama and the service are
 * both stand-ins that record what they were sent.
 */

type Sent = { url: string; body: Record<string, unknown> | null };
const away: Sent[] = [];

vi.mock("electron", () => ({
  net: {
    fetch: async (url: string, init: { body?: string }) => {
      away.push({ url, body: init.body ? JSON.parse(init.body) : null });
      return new Response(JSON.stringify({ content: [{ type: "text", text: "## How you have changed\n\nSent away and read." }] }), { status: 200 });
    },
  },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (text: string) => Buffer.from(`sealed:${text}`),
    decryptString: (buffer: Buffer) => buffer.toString().replace(/^sealed:/, ""),
  },
}));

const { migrate } = await import("../db/migrations");
const { createCompany } = await import("../repositories/companies");
const { setSetting } = await import("../repositories/settings");
const { savePage } = await import("./brain");
const { journalEntry } = await import("./life");
const { jotPrivate } = await import("./private");
const { lockNow, resetForTests, setPasscode } = await import("./journal-lock");
const { planLookBack, readLookBack, setLocalModel } = await import("./lookback");

// Saturday 19 September 2026, in Kolkata.
const now = new Date("2026-09-19T06:00:00.000Z");
const at = (day: string) => new Date(`${day}T06:00:00.000Z`);

let db: Database.Database;
let companyId: string;
const local: Sent[] = [];

/** Ollama on this computer, with one model, answering every question the same way. */
const ollama = (async (url: string | URL | Request, init?: RequestInit) => {
  const address = String(url);
  local.push({ url: address, body: typeof init?.body === "string" ? JSON.parse(init.body) : null });
  if (address.endsWith("/api/tags")) return new Response(JSON.stringify({ models: [{ name: "llama3.2:latest" }] }));
  return new Response(JSON.stringify({ message: { content: "<think>hmm</think>## How you have changed\n\nRead here." } }));
}) as typeof fetch;

const nobodyHome = (async () => {
  throw new TypeError("fetch failed");
}) as typeof fetch;

function write(day: string, body: string, mood?: string) {
  const entry = journalEntry(db, companyId, day, at(day));
  return savePage(db, entry.id, { title: entry.title, body, fields: { ...entry.fields, ...(mood ? { mood } : {}) }, baseRevision: entry.revision }, at(day));
}

beforeEach(() => {
  db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrate(db);
  companyId = createCompany(db, { name: "Me", accent: "coffee", timezone: "Asia/Kolkata" }).id;
  local.length = 0;
  away.length = 0;
  write("2026-08-03", "## Today\n\nScared to call anyone about the pilot.", "low");
  write("2026-09-17", "## Today\n\nRang three schools. Two said yes to a demo.", "good");
  jotPrivate(db, companyId, { text: "A crush I have told nobody about.", feeling: "affection", people: [] }, at("2026-09-10"));
});

afterEach(() => resetForTests());

function connectAway() {
  const connection = { service: "anthropic", key: "sk-ant-test", baseUrl: "https://api.anthropic.com/v1" };
  setSetting(db, "aiConnection", Buffer.from(`sealed:${JSON.stringify(connection)}`).toString("base64"));
  setSetting(db, "aiModel", "claude-test");
}

describe("looking back", () => {
  it("plans a reading with the numbers, whether or not a model is there", async () => {
    const plan = await planLookBack(db, companyId, "season", now, nobodyHome);
    expect(plan).toMatchObject({ days: 2, sealed: 0, away: null, local: { found: false } });
    expect(plan.months.map((month) => [month.month, month.days, month.mood])).toEqual([
      ["2026-06", 0, null],
      ["2026-07", 0, null],
      ["2026-08", 1, 2],
      ["2026-09", 1, 4],
    ]);
  });

  it("reads on this computer, telling Ollama to take the whole part, and sends no private line", async () => {
    const reading = await readLookBack(db, companyId, { span: "season", via: "local" }, now, ollama);
    expect(reading).toMatchObject({ via: "local", model: "llama3.2:latest", days: 2, requests: 1 });
    expect(reading.text).toBe("## How you have changed\n\nRead here.");
    const chat = local.find((request) => request.url === "http://localhost:11434/api/chat");
    expect(chat?.body).toMatchObject({ model: "llama3.2:latest", stream: false, options: { num_ctx: 16384 } });
    const said = JSON.stringify(chat?.body);
    expect(said).toContain("Rang three schools");
    expect(said).toContain("Scared to call anyone");
    expect(said).not.toContain("crush");
    // The journal's own headings are not words anybody wrote.
    expect(said).not.toContain("## Today");
    expect(away).toEqual([]);
  });

  it("says what to do when Ollama is not there", async () => {
    await expect(readLookBack(db, companyId, { span: "season", via: "local" }, now, nobodyHome)).rejects.toThrow("ollama.com");
  });

  it("will only use a model at an address on this computer", async () => {
    await expect(setLocalModel(db, { address: "http://192.168.1.20:11434", model: null }, ollama)).rejects.toThrow("this computer");
    await expect(setLocalModel(db, { address: "http://127.0.0.1:11434", model: "llama3.2:latest" }, ollama)).resolves.toMatchObject({
      found: true,
      model: "llama3.2:latest",
    });
  });

  it("will not read a stretch with locked days in it while the journal is locked", async () => {
    setPasscode(db, companyId, "tiger lily", now);
    lockNow(db);
    await expect(readLookBack(db, companyId, { span: "season", via: "local" }, now, ollama)).rejects.toThrow("Unlock the journal first: 2 days");
  });

  it("sends the journal away only with the passcode typed again, open or not", async () => {
    connectAway();
    setPasscode(db, companyId, "tiger lily", now);
    await expect(readLookBack(db, companyId, { span: "season", via: "away" }, now, ollama)).rejects.toThrow("Type the passcode");
    await expect(readLookBack(db, companyId, { span: "season", via: "away", passcode: "tiger lilly" }, now, ollama)).rejects.toThrow(
      "not the passcode",
    );
    expect(away).toEqual([]);
    const reading = await readLookBack(db, companyId, { span: "season", via: "away", passcode: "tiger lily" }, now, ollama);
    expect(reading).toMatchObject({ via: "away", service: "Anthropic Claude", text: "## How you have changed\n\nSent away and read." });
    expect(away).toHaveLength(1);
    expect(JSON.stringify(away[0]?.body)).toContain("Rang three schools");
    expect(JSON.stringify(away[0]?.body)).not.toContain("crush");
  });

  it("asks for SEND from a journal with no passcode", async () => {
    connectAway();
    await expect(readLookBack(db, companyId, { span: "season", via: "away" }, now, ollama)).rejects.toThrow("Type SEND");
    await readLookBack(db, companyId, { span: "season", via: "away", confirm: "send" }, now, ollama);
    expect(away).toHaveLength(1);
  });
});
