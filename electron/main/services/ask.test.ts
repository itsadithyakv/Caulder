import { beforeEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";

/**
 * Ask the brain across services, with each one played by a stand-in for
 * `net.fetch`: a connection is checked by listing models before it is kept,
 * and kept sealed; a question goes in each service's own shape with what it
 * needs of the dossier and the conversation; the whole company, when asked
 * for and too long for the size chosen, is cut to the contacts the question
 * is about; a line is read by the AI without anything being written; and a
 * draft comes back as a draft.
 */

type Sent = { url: string; method: string; headers: Record<string, string>; body: Record<string, unknown> | null };
const sent: Sent[] = [];
type Handler = (request: Sent) => { status?: number; body: unknown };
let handler: Handler = () => ({ body: {} });
let canEncrypt = true;

vi.mock("electron", () => ({
  net: {
    fetch: async (url: string, init: { method: string; headers: Record<string, string>; body?: string }) => {
      if (url.startsWith("http://localhost:9")) throw new TypeError("fetch failed");
      const request = { url, method: init.method, headers: init.headers, body: init.body ? JSON.parse(init.body) : null };
      sent.push(request);
      const reply = handler(request);
      return new Response(JSON.stringify(reply.body), { status: reply.status ?? 200 });
    },
  },
  safeStorage: {
    isEncryptionAvailable: () => canEncrypt,
    encryptString: (text: string) => Buffer.from(`sealed:${text}`),
    decryptString: (buffer: Buffer) => buffer.toString().replace(/^sealed:/, ""),
  },
}));

const { migrate } = await import("../db/migrations");
const { createCompany } = await import("../repositories/companies");
const { createLead } = await import("../repositories/leads");
const { getSetting } = await import("../repositories/settings");
const ask = await import("./ask");
const { readLine } = await import("./askline");
const { proposeBrief, proposeNoticed, proposeSort, proposeTidy } = await import("./propose");
const { remember } = await import("./remember");
const { newPage, savePage, getPage } = await import("./brain");
const { logActivity } = await import("../repositories/leads");
const { readingFromAi, sameReading, isForAi, parseAiLine } = await import("@shared/ailine");
const { readCapture } = await import("@shared/capture");
const { leadInput } = await import("@shared/domain");

const GEMINI_KEY = "AIzaSyTest0123456789abcdefghijWXYZ";

const geminiModels = {
  models: [
    { name: "models/gemini-2.0-flash", displayName: "Gemini 2.0 Flash", supportedGenerationMethods: ["generateContent"] },
    { name: "models/gemini-2.5-flash", displayName: "Gemini 2.5 Flash", supportedGenerationMethods: ["generateContent"] },
    { name: "models/gemini-2.5-flash-lite", displayName: "Gemini 2.5 Flash-Lite", supportedGenerationMethods: ["generateContent"] },
    { name: "models/gemini-2.5-pro", displayName: "Gemini 2.5 Pro", supportedGenerationMethods: ["generateContent"] },
    { name: "models/text-embedding-004", supportedGenerationMethods: ["embedContent"] },
    { name: "models/gemini-embedding-001", supportedGenerationMethods: ["embedContent"] },
  ],
};

/** A Gemini that checks its key and answers every question the same way. */
const gemini: Handler = (request) => {
  if (request.headers["x-goog-api-key"] !== GEMINI_KEY) {
    return { status: 400, body: { error: { code: 400, message: "API key not valid. Please pass a valid API key.", status: "INVALID_ARGUMENT" } } };
  }
  if (request.method === "GET") return { body: geminiModels };
  return {
    body: {
      candidates: [
        {
          content: { parts: [{ text: "thinking…", thought: true }, { text: "Call [[Oakridge]] before ten." }] },
          finishReason: "STOP",
        },
      ],
      usageMetadata: { promptTokenCount: 1200, candidatesTokenCount: 20, cachedContentTokenCount: 800 },
    },
  };
};

let db: Database.Database;
let companyId: string;

beforeEach(() => {
  sent.length = 0;
  canEncrypt = true;
  handler = gemini;
  db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  migrate(db);
  companyId = createCompany(db, { name: "Unifloe", accent: "blue", timezone: "Asia/Kolkata" }).id;
});

describe("connecting", () => {
  it("checks a Gemini key by listing its models, keeps it sealed, and starts on the newest Flash", async () => {
    expect(ask.askState(db)).toMatchObject({ connected: false, service: null, model: null, models: [] });
    const state = await ask.connect(db, { service: "gemini", key: `  ${GEMINI_KEY} ` });

    expect(state).toMatchObject({
      connected: true,
      service: "gemini",
      last4: "WXYZ",
      model: "gemini-2.5-flash",
      context: "large",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    });
    // Only models that answer in text, by their own names.
    expect(state.models).toEqual([
      { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash" },
      { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
      { id: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash-Lite" },
      { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
    ]);
    expect(sent[0]).toMatchObject({
      url: "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000",
      method: "GET",
    });
    const stored = getSetting(db, "aiConnection") ?? "";
    expect(stored).not.toContain(GEMINI_KEY);
    expect(Buffer.from(stored, "base64").toString()).toMatch(/^sealed:/);

    expect(ask.disconnect(db)).toMatchObject({ connected: false, last4: null, models: [] });
  });

  it("refuses a key the service refuses, a missing key, and a machine that will not encrypt", async () => {
    await expect(ask.connect(db, { service: "gemini", key: "AIzaWrongWrongWrongWrong" })).rejects.toThrow(
      "Google Gemini did not accept that key",
    );
    expect(ask.askState(db).connected).toBe(false);
    await expect(ask.connect(db, { service: "gemini", key: "" })).rejects.toThrow("Paste the Google Gemini API key");
    await expect(ask.connect(db, { service: "gemini", key: `${GEMINI_KEY} x` })).rejects.toThrow("no spaces");
    await expect(ask.connect(db, { service: "nobody", key: GEMINI_KEY })).rejects.toThrow("Pick a service");
    await expect(ask.connect(db, { service: "custom", key: "" })).rejects.toThrow("starting with https://");

    canEncrypt = false;
    await expect(ask.connect(db, { service: "gemini", key: GEMINI_KEY })).rejects.toThrow("will not encrypt");
  });

  it("connects Ollama with no key at its own address, and says so when it is not running", async () => {
    handler = (request) => {
      expect(request.headers["authorization"]).toBeUndefined();
      return { body: { object: "list", data: [{ id: "llama3.1:8b" }, { id: "nomic-embed-text:latest" }, { id: "qwen3:14b" }] } };
    };
    const state = await ask.connect(db, { service: "ollama", key: "ignored", baseUrl: "http://127.0.0.1:11434/v1/" });
    expect(state).toMatchObject({
      service: "ollama",
      baseUrl: "http://127.0.0.1:11434/v1",
      last4: null,
      model: "llama3.1:8b",
      context: "small",
    });
    expect(state.models.map((model) => model.id)).toEqual(["llama3.1:8b", "qwen3:14b"]);
    expect(sent[0]?.url).toBe("http://127.0.0.1:11434/v1/models");

    await expect(ask.connect(db, { service: "ollama", baseUrl: "http://localhost:9999/v1" })).rejects.toThrow(
      "Could not reach Ollama at http://localhost:9999/v1. Is it open?",
    );
    handler = () => ({ body: { data: [] } });
    await expect(ask.connect(db, { service: "ollama" })).rejects.toThrow("has no models yet");
  });

  it("changes the model and how much is sent, and reads the list again", async () => {
    await ask.connect(db, { service: "gemini", key: GEMINI_KEY });
    expect(ask.setModel(db, "gemini-2.5-pro").model).toBe("gemini-2.5-pro");
    // A model the list does not have is still the founder's to name.
    expect(ask.setModel(db, "gemini-3-pro-preview").model).toBe("gemini-3-pro-preview");
    expect(() => ask.setModel(db, " ")).toThrow("model's name");
    expect(ask.setContext(db, "whole").context).toBe("whole");
    expect(() => ask.setContext(db, "huge")).toThrow("not a size");
    expect((await ask.refreshModels(db)).models).toHaveLength(4);
  });
});

describe("asking", () => {
  it("asks Gemini with what the question needs as the instruction, the thread as turns, and leaves its thinking out", async () => {
    const school = createLead(db, companyId, leadInput.parse({ name: "Oakridge", notes: "Call before 10am." }));
    await ask.connect(db, { service: "gemini", key: GEMINI_KEY });
    sent.length = 0;

    const reply = await ask.askBrain(db, companyId, {
      question: "When should I call Oakridge?",
      history: [
        { role: "user", text: "Who is keen?" },
        { role: "assistant", text: "Nobody yet." },
      ],
    });

    expect(reply).toMatchObject({
      text: "Call [[Oakridge]] before ten.",
      service: "Google Gemini",
      model: "Gemini 2.5 Flash",
      usage: { input: 1200, output: 20, cached: 800 },
      sent: { contacts: 1, leftOut: 0, whole: false, parts: ["the company in brief", "Calls in the last 30 days", "Oakridge"] },
    });
    expect(reply.sent.documents).toEqual(["The company in brief", "Calls in the last 30 days", "Contacts"]);
    expect(reply.references).toContainEqual({ kind: "contact", id: school.id, name: "Oakridge" });

    const request = sent[0];
    expect(request?.url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent");
    const body = request?.body as {
      systemInstruction: { parts: { text: string }[] };
      contents: { role: string; parts: { text: string }[] }[];
    };
    expect(body.systemInstruction.parts[0]?.text).toContain("company brain of Unifloe");
    expect(body.systemInstruction.parts[0]?.text).toContain("> Call before 10am.");
    // Told that it has a part and not the whole, so "it was not sent" is never said as "it is not written".
    expect(body.systemInstruction.parts[0]?.text).toContain("They are not everything Caulder holds");
    expect(body.contents).toEqual([
      { role: "user", parts: [{ text: "Who is keen?" }] },
      { role: "model", parts: [{ text: "Nobody yet." }] },
      { role: "user", parts: [{ text: "When should I call Oakridge?" }] },
    ]);
  });

  it("asks an OpenAI-style service and Anthropic in their own shapes", async () => {
    handler = (request) =>
      request.method === "GET"
        ? { body: { data: [{ id: "gpt-4o" }, { id: "gpt-5" }, { id: "gpt-5-mini" }, { id: "text-embedding-3-small" }, { id: "whisper-1" }] } }
        : {
            body: {
              choices: [{ message: { role: "assistant", content: "<think>hmm</think>Chase the two proposals." } }],
              usage: { prompt_tokens: 900, completion_tokens: 12, prompt_tokens_details: { cached_tokens: 0 } },
            },
          };
    const openai = await ask.connect(db, { service: "openai", key: "sk-proj-0123456789abcdefABCD" });
    expect(openai.model).toBe("gpt-5");
    expect(openai.models.map((model) => model.id)).toEqual(["gpt-4o", "gpt-5", "gpt-5-mini"]);
    sent.length = 0;
    const answer = await ask.askBrain(db, companyId, { question: "What next?" });
    expect(answer).toMatchObject({ text: "Chase the two proposals.", service: "OpenAI", model: "gpt-5" });
    expect(sent[0]).toMatchObject({ url: "https://api.openai.com/v1/chat/completions" });
    expect(sent[0]?.headers["authorization"]).toBe("Bearer sk-proj-0123456789abcdefABCD");
    const body = sent[0]?.body as { model: string; messages: { role: string; content: string }[] };
    expect(body.model).toBe("gpt-5");
    expect(body.messages[0]?.role).toBe("system");
    expect(body.messages.at(-1)).toEqual({ role: "user", content: "What next?" });

    handler = (request) =>
      request.method === "GET"
        ? { body: { data: [{ id: "claude-opus-5", display_name: "Claude Opus 5" }, { id: "claude-sonnet-5", display_name: "Claude Sonnet 5" }] } }
        : { body: { content: [{ type: "text", text: "Yes." }], usage: { input_tokens: 5, output_tokens: 1, cache_read_input_tokens: 3 } } };
    const claude = await ask.connect(db, { service: "anthropic", key: "sk-ant-api03-0123456789abcdef" });
    expect(claude).toMatchObject({ model: "claude-opus-5", last4: "cdef" });
    sent.length = 0;
    expect(await ask.askBrain(db, companyId, { question: "Well?" })).toMatchObject({ text: "Yes.", model: "Claude Opus 5" });
    expect(sent[0]?.headers["x-api-key"]).toBe("sk-ant-api03-0123456789abcdef");
    const system = (sent[0]?.body as { system: { cache_control?: unknown }[] }).system;
    expect(system[1]?.cache_control).toEqual({ type: "ephemeral" });
  });

  it("cuts the whole company, when it is asked for, to the contacts the question is about once it is bigger than the size chosen", async () => {
    const note = "Talked about timetables and the trust. ".repeat(40);
    for (let i = 0; i < 60; i += 1) {
      createLead(db, companyId, leadInput.parse({ name: `School ${String(i).padStart(3, "0")}`, notes: note }));
    }
    const named = createLead(db, companyId, leadInput.parse({ name: "Beacon Academy", notes: "Wants the pilot." }));
    await ask.connect(db, { service: "gemini", key: GEMINI_KEY });
    ask.setContext(db, "small");
    sent.length = 0;

    const one = await ask.askBrain(db, companyId, { question: "What does Beacon Academy want?" });
    expect(one.sent).toMatchObject({ contacts: 1, leftOut: 60, whole: false });
    expect(one.sent.characters).toBeLessThan(3_000);
    sent.length = 0;

    const reply = await ask.askBrain(db, companyId, { question: "What does Beacon Academy want?", whole: true });
    expect(reply.sent.whole).toBe(true);
    expect(reply.sent.contacts).toBe(10);
    expect(reply.sent.leftOut).toBe(51);
    expect(reply.sent.characters).toBeLessThanOrEqual(62_000);
    const context = (sent[0]?.body as { systemInstruction: { parts: { text: string }[] } }).systemInstruction.parts[0]?.text ?? "";
    expect(context).toContain("### Beacon Academy");
    expect(context).toContain("left out of this copy");
    expect(reply.references).toContainEqual({ kind: "contact", id: named.id, name: "Beacon Academy" });
  });

  it("says what went wrong in words, and needs a connection first", async () => {
    await expect(ask.askBrain(db, companyId, { question: "Anything?" })).rejects.toThrow("Connect an AI in Settings");
    expect(sent).toEqual([]);

    await ask.connect(db, { service: "gemini", key: GEMINI_KEY });
    handler = () => ({ status: 429, body: { error: { code: 429, message: "Resource has been exhausted", status: "RESOURCE_EXHAUSTED" } } });
    await expect(ask.askBrain(db, companyId, { question: "Anything?" })).rejects.toThrow("free tiers allow only a few a minute");
    handler = () => ({ status: 404, body: { error: { message: "models/gemini-9 is not found" } } });
    await expect(ask.askBrain(db, companyId, { question: "Anything?" })).rejects.toThrow("does not know that model");
    // Busy is tried once more before it is said: twice busy is busy.
    handler = () => ({ status: 503, body: { error: { message: "overloaded" } } });
    const before = sent.length;
    await expect(ask.askBrain(db, companyId, { question: "Anything?" })).rejects.toThrow("busy or having trouble");
    expect(sent.length - before).toBe(2);
    // Busy for a moment, then not: the answer comes, and nobody is told.
    let tries = 0;
    handler = (request) => ((tries += 1) === 1 ? { status: 503, body: { error: { message: "overloaded" } } } : gemini(request));
    await expect(ask.askBrain(db, companyId, { question: "Anything?" })).resolves.toMatchObject({ text: "Call [[Oakridge]] before ten." });
    // A refusal is never tried again: too many questions is said at once.
    tries = 0;
    handler = () => ((tries += 1), { status: 429, body: { error: { message: "Resource has been exhausted" } } });
    await expect(ask.askBrain(db, companyId, { question: "Anything?" })).rejects.toThrow("too many questions");
    expect(tries).toBe(1);
    handler = () => ({ body: { promptFeedback: { blockReason: "SAFETY" } } });
    await expect(ask.askBrain(db, companyId, { question: "Anything?" })).rejects.toThrow("would not answer that (safety)");
    handler = () => ({ body: { candidates: [{ content: { parts: [] } }] } });
    await expect(ask.askBrain(db, companyId, { question: "Anything?" })).rejects.toThrow("empty answer");
    await expect(ask.askBrain(db, companyId, { question: "  " })).rejects.toThrow("Ask something");
  });
});

/** A Gemini that answers a request for JSON with `json`, and anything else with `text`. */
function geminiSaying(json: unknown, text = "Call [[Oakridge]] before ten."): Handler {
  return (request) => {
    if (request.method === "GET") return { body: geminiModels };
    const wantsJson = (request.body as { generationConfig?: { responseMimeType?: string } } | null)?.generationConfig?.responseMimeType === "application/json";
    return {
      body: {
        candidates: [{ content: { parts: [{ text: wantsJson ? JSON.stringify(json) : text }] } }],
        usageMetadata: { promptTokenCount: 300, candidatesTokenCount: 40 },
      },
    };
  };
}

const system = (request: Sent | undefined) =>
  (request?.body as { systemInstruction: { parts: { text: string }[] } } | null)?.systemInstruction.parts[0]?.text ?? "";

describe("what goes with a question", () => {
  it("says what would go before anything is sent, and sends the whole company every time when that is chosen", async () => {
    createLead(db, companyId, leadInput.parse({ name: "Oakridge", notes: "Call before 10am." }));
    await ask.connect(db, { service: "gemini", key: GEMINI_KEY });
    sent.length = 0;

    const preview = await ask.previewAsk(db, companyId, { question: "What did Oakridge say?" });
    expect(preview).toMatchObject({ whole: false, parts: ["the company in brief", "Oakridge"] });
    expect(preview.characters).toBeGreaterThan(0);
    // Worked out here: nothing was asked of anybody.
    expect(sent).toHaveLength(0);

    expect(ask.askState(db).scope).toBe("needed");
    expect(ask.setScope(db, "all").scope).toBe("all");
    expect((await ask.previewAsk(db, companyId, { question: "What did Oakridge say?" })).whole).toBe(true);
    expect(() => ask.setScope(db, "some")).toThrow("not a choice");
  });
});

describe("the line in AI mode", () => {
  const CLOCK = { today: "2026-10-13", now: 600 };
  const NOW = new Date("2026-10-13T05:00:00Z");

  it("is switched on only with an AI connected, and off again when it is disconnected", async () => {
    expect(() => ask.setLineMode(db, true)).toThrow("Connect an AI in Settings to use AI mode");
    await ask.connect(db, { service: "gemini", key: GEMINI_KEY });
    expect(ask.askState(db).line).toBe(false);
    expect(ask.setLineMode(db, true).line).toBe(true);
    expect(ask.disconnect(db).line).toBe(false);
    await ask.connect(db, { service: "gemini", key: GEMINI_KEY });
    expect(ask.askState(db).line).toBe(false);
  });

  it("sends the line, today and the names it might mean - and nothing else about anybody", async () => {
    createLead(db, companyId, leadInput.parse({ name: "RV PUC", contactPerson: "Sumanth", phone: "96860 12345", notes: "Met at the fair." }));
    handler = geminiSaying({ kind: "happened", contact: "RV PUC", via: "linkedin", then: { title: "Reach out to Sumanth", day: "2026-10-20" } });
    await ask.connect(db, { service: "gemini", key: GEMINI_KEY });
    sent.length = 0;

    const result = await readLine(db, companyId, { line: "sumnath asked me to reach out next week, i messaged him on linkedin" }, NOW);
    expect(result).toMatchObject({ is: "reading", service: "Google Gemini", sent: { contacts: 1 }, line: { kind: "happened", contact: "RV PUC" } });
    expect(sent).toHaveLength(1);
    const told = system(sent[0]);
    expect(told).toContain("Today is Tuesday 2026-10-13");
    expect(told).toContain("RV PUC | Sumanth");
    // A name to be matched, and no more: not their number, not what is noted about them.
    expect(told).not.toContain("96860");
    expect(told).not.toContain("Met at the fair");
    expect((sent[0]?.body as { contents: { parts: { text: string }[] }[] }).contents.at(-1)?.parts[0]?.text).toBe(
      "sumnath asked me to reach out next week, i messaged him on linkedin",
    );
    // Nothing was written by reading it.
    expect(db.prepare(`SELECT COUNT(*) AS n FROM tasks`).get()).toEqual({ n: 0 });
  });

  it("answers a line that is a question, with what the question needs, in one request", async () => {
    createLead(db, companyId, leadInput.parse({ name: "Oakridge", notes: "Call before 10am." }));
    await ask.connect(db, { service: "gemini", key: GEMINI_KEY });
    sent.length = 0;
    const result = await readLine(db, companyId, { line: "when should I call Oakridge?" }, NOW);
    expect(result).toMatchObject({ is: "answer", answer: { text: "Call [[Oakridge]] before ten.", sent: { whole: false } } });
    expect(sent).toHaveLength(1);
    expect(isForAi("draft an email to maya about the late invoice")).toBe(true);
    expect(isForAi("write to jonas now")).toBe(false);
    expect(isForAi("call maya tomorrow")).toBe(false);
  });

  it("never sends a line that looks like a password, and says what went wrong in a sentence", async () => {
    await ask.connect(db, { service: "gemini", key: GEMINI_KEY });
    sent.length = 0;
    await expect(readLine(db, companyId, { line: "the wifi password is hunter2-office" }, NOW)).rejects.toThrow("was not sent to Google Gemini");
    expect(sent).toHaveLength(0);

    handler = geminiSaying("no idea");
    await expect(readLine(db, companyId, { line: "harbour said yes" }, NOW)).rejects.toThrow("did not say what that line is");
  });

  it("puts what the AI said into the reading the line already shows, checked against what Caulder holds", () => {
    const known = {
      contacts: [
        { id: "c1", name: "RV PUC", person: "Sumanth" },
        { id: "c2", name: "Harbour Coffee Roasters", person: "Maya Ellis" },
      ],
      pages: [],
    };
    const read = (json: unknown, line: string) => readingFromAi(parseAiLine(JSON.stringify(json)) ?? (null as never), line, known, CLOCK);

    // Something that happened, and what it leaves: on his history, with his task.
    expect(read({ kind: "happened", contact: "rv puc | sumanth", via: "linkedin", then: { title: "Reach out to Sumanth", day: "2026-10-20" } }, "sumnath asked me to reach out next week")).toMatchObject({
      kind: "contact",
      contact: { id: "c1", name: "RV PUC" },
      logged: "linkedin",
      then: { title: "Reach out to Sumanth", day: "2026-10-20", daySaid: true },
      doubt: null,
      because: "read by the AI",
    });
    // A task, with its own title and day.
    expect(read({ kind: "task", contact: "Maya Ellis", title: "Send Maya the revised quote", day: "2026-10-16", time: "15:00" }, "need to get that quote thing over to maya by fri 3")).toMatchObject({
      kind: "task",
      contact: { id: "c2" },
      task: { title: "Send Maya the revised quote", day: "2026-10-16", time: "15:00" },
    });
    // Somebody new: a contact, with what happened. A contact it made up is nobody.
    expect(read({ kind: "new_contact", person: "Kiran Rao", company: "brightside labs", happened: "Asked for a demo.", then: { title: "Book a demo with Kiran", day: null } }, "kiran rao from brightside labs asked for a demo")).toMatchObject({
      kind: "command",
      ask: { do: "contact", name: "Brightside Labs", person: "Kiran Rao", happened: "Asked for a demo.", then: { title: "Book a demo with Kiran", day: "2026-10-14", daySaid: false } },
    });
    expect(read({ kind: "happened", contact: "Acme Corp" }, "acme said yes").contact).toBeNull();
    // Somebody "new" who is a contact already is that contact.
    expect(read({ kind: "new_contact", person: "Sumanth", company: "RV PUC" }, "sumanth from rv puc called")).toMatchObject({ kind: "contact", contact: { id: "c1" } });
    // Unsure: it asks, in words - and a person from nowhere is asked about whether or not it thought to.
    expect(read({ kind: "task", title: "Call Priya", ask: "Which Priya?" }, "call priya").doubt).toMatchObject({ text: "Which Priya?", open: true });
    expect(read({ kind: "new_contact", person: "Anil" }, "anil wants a quote").doubt).toMatchObject({ text: "Where is Anil from?", open: true });
    // Money, a detail, and the rest.
    expect(read({ kind: "spend", amount: 1200, what: "Figma" }, "figma was 1200").ask).toEqual({ do: "spend", amount: 1200, what: "Figma", daysAgo: 0 });
    expect(read({ kind: "update_contact", contact: "RV PUC", phone: "96860 12345" }, "sumanth's new number 96860 12345").ask).toEqual({
      do: "update",
      contact: { id: "c1", name: "RV PUC" },
      phone: "96860 12345",
      email: null,
    });
    // Kept where the rules would keep it: a rule on its subject's page, anything else with the rest.
    expect(read({ kind: "remember" }, "we never discount retainers")).toMatchObject({ kind: "memory", topic: "Pricing and discounts" });
    expect(read({ kind: "remember" }, "the printer on fourth takes A3")).toMatchObject({ kind: "memory", topic: "Things to remember" });
    // A reply that is not what was asked for is still read as far as it goes.
    expect(read({ kind: "dance", day: "next tuesday" }, "hmm")).toMatchObject({ kind: "note" });
    expect(parseAiLine("not json")).toBeNull();
  });

  it("knows when the AI read a line the way the rules did", () => {
    const known = { contacts: [{ id: "c1", name: "RV PUC", person: "Sumanth" }], pages: [] };
    const line = "Sumanth asked me to reach out next week";
    const rules = readCapture(line, known, CLOCK);
    const same = readingFromAi(parseAiLine(JSON.stringify({ kind: "happened", contact: "RV PUC", then: { title: "Write to Sumanth", day: "2026-10-20" } })) as never, line, known, CLOCK);
    const other = readingFromAi(parseAiLine(JSON.stringify({ kind: "happened", contact: "RV PUC", then: { title: "Write to Sumanth", day: "2026-10-22" } })) as never, line, known, CLOCK);
    expect(sameReading({ kind: rules.kind, reading: rules, day: null, time: null }, same)).toBe(true);
    expect(sameReading({ kind: rules.kind, reading: rules, day: null, time: null }, other)).toBe(false);
  });
});

describe("what the AI proposes", () => {
  const NOW = new Date("2026-10-13T05:00:00Z");

  it("drafts the company in brief from what is written, and writes nothing", async () => {
    const profile = newPage(db, companyId, "company", "profile", NOW);
    savePage(db, profile.id, { title: profile.title, body: "We sell timetabling to schools.", fields: profile.fields, secrets: {}, baseRevision: profile.revision }, NOW);
    createLead(db, companyId, leadInput.parse({ name: "Oakridge", phone: "98450 12345", notes: "Call before 10am." }));
    handler = geminiSaying(null, "```\n- Sells timetabling to schools.\n- Bills yearly.\n```");
    await ask.connect(db, { service: "gemini", key: GEMINI_KEY });
    sent.length = 0;
    const pagesBefore = db.prepare(`SELECT COUNT(*) AS n FROM brain_pages`).get();

    const draft = await proposeBrief(db, companyId, NOW);
    expect(draft.text).toBe("- Sells timetabling to schools.\n- Bills yearly.");
    expect(draft.sent).toMatchObject({ service: "Google Gemini", model: "Gemini 2.5 Flash", usage: { input: 300 } });
    expect(draft.sent.parts).toContain("Company");
    expect(system(sent[0])).toContain("We sell timetabling to schools.");
    // What the company says it is, not who it knows.
    expect(system(sent[0])).not.toContain("98450");
    expect(db.prepare(`SELECT COUNT(*) AS n FROM brain_pages`).get()).toEqual(pagesBefore);
  });

  it("tidies one page by sending only that page, and leaves it as it was", async () => {
    const page = newPage(db, companyId, "plan", "page", NOW);
    const body = "pricing is 999 a month\n\nwe bill yearly\n\nPricing: 999 monthly, billed every year in advance.";
    savePage(db, page.id, { title: "Pricing notes", body, fields: page.fields, secrets: {}, baseRevision: page.revision }, NOW);
    createLead(db, companyId, leadInput.parse({ name: "Oakridge", notes: "Call before 10am." }));
    handler = geminiSaying(null, "# Pricing notes\n\n## Pricing\n\n- 999 a month, billed yearly in advance.");
    await ask.connect(db, { service: "gemini", key: GEMINI_KEY });
    sent.length = 0;

    const draft = await proposeTidy(db, companyId, page.id);
    expect(draft.text).toBe("## Pricing\n\n- 999 a month, billed yearly in advance.");
    expect(draft.sent.parts).toEqual(["the page “Pricing notes”"]);
    expect(JSON.stringify(sent[0]?.body)).not.toContain("Oakridge");
    expect(getPage(db, page.id).body).toBe(body);

    const short = newPage(db, companyId, "plan", "page", NOW);
    await expect(proposeTidy(db, companyId, short.id)).rejects.toThrow("too little on this page");
  });

  it("says what the history shows, only about contacts that were sent, with where each came from", async () => {
    const late = createLead(db, companyId, leadInput.parse({ name: "Kettle & Crumb" }));
    for (const body of ["Invoice 12 paid 9 days late.", "Invoice 15 paid 14 days late.", "Chased for invoice 19."]) {
      logActivity(db, { leadId: late.id, kind: "note", body });
    }
    createLead(db, companyId, leadInput.parse({ name: "Quiet Co" }));
    handler = geminiSaying({
      facts: [
        { about: "Kettle & Crumb", fact: "Has paid late twice.", from: ["Invoice 12 paid 9 days late.", "Invoice 15 paid 14 days late."] },
        { about: "Somebody Else Ltd", fact: "Made up.", from: [] },
      ],
    });
    await ask.connect(db, { service: "gemini", key: GEMINI_KEY });
    sent.length = 0;

    const noticed = await proposeNoticed(db, companyId, NOW);
    expect(noticed.facts).toEqual([
      { leadId: late.id, about: "Kettle & Crumb", fact: "Has paid late twice.", from: ["Invoice 12 paid 9 days late.", "Invoice 15 paid 14 days late."] },
    ]);
    expect(noticed.sent.parts).toEqual(["1 contacts and their history"]);
    expect(system(sent[0])).toContain("Invoice 12 paid 9 days late.");
    expect(system(sent[0])).not.toContain("Quiet Co");
    expect(db.prepare(`SELECT notes FROM leads WHERE id = ?`).get(late.id)).toEqual({ notes: null });
  });

  it("says so when nobody has history enough to show anything", async () => {
    createLead(db, companyId, leadInput.parse({ name: "Quiet Co" }));
    await ask.connect(db, { service: "gemini", key: GEMINI_KEY });
    await expect(proposeNoticed(db, companyId, NOW)).rejects.toThrow("No contact has enough history yet");
  });
});

describe("a page sorted with the AI's help", () => {
  const NOW = new Date("2026-10-13T05:00:00Z");

  it("asks only about the lines the rules here could not place, and moves nothing", async () => {
    const harbour = createLead(db, companyId, leadInput.parse({ name: "Harbour Coffee Roasters", phone: "98450 12345" }));
    const say = (said: string, pageId: string | null = null) =>
      remember(db, { companyId, pageId, topic: pageId ? null : "Things to remember", said, fact: null, day: "2026-10-13" }, NOW);
    const page = say("we never discount retainers");
    say("fifty percent before any work starts", page.pageId);
    say("the roasters want everything by email", page.pageId);
    say("the printer on fourth takes A3", page.pageId);
    const before = getPage(db, page.pageId).body;
    handler = geminiSaying({
      lines: [
        { n: 1, to: "rule", subject: "Billing and payment" },
        { n: 2, to: "contact", contact: "Harbour Coffee Roasters" },
        { n: 3, to: "rule", subject: "A subject it made up" },
      ],
    });
    await ask.connect(db, { service: "gemini", key: GEMINI_KEY });
    sent.length = 0;

    const draft = await proposeSort(db, companyId, page.pageId);
    expect(draft.lines.map((line) => [line.says, line.to, line.by])).toEqual([
      ["we never discount retainers", { kind: "rule", subject: "Pricing and discounts" }, "rules"],
      ["fifty percent before any work starts", { kind: "rule", subject: "Billing and payment" }, "ai"],
      ["the roasters want everything by email", { kind: "contact", id: harbour.id, name: "Harbour Coffee Roasters" }, "ai"],
      // A subject there is not is nowhere to put anything: it stays.
      ["the printer on fourth takes A3", null, "rules"],
    ]);
    // The three it could not place went, with names - not the rule it placed itself, and nobody's number.
    const asked = (sent[0]?.body as { contents: { parts: { text: string }[] }[] }).contents.at(-1)?.parts[0]?.text ?? "";
    expect(asked.split("\n")).toEqual(["1. fifty percent before any work starts", "2. the roasters want everything by email", "3. the printer on fourth takes A3"]);
    expect(system(sent[0])).toContain("Harbour Coffee Roasters | -");
    expect(system(sent[0])).not.toContain("98450");
    expect(draft.sent?.parts[0]).toBe("3 lines of the page “Things to remember”");
    expect(getPage(db, page.pageId).body).toBe(before);
  });

  it("asks nobody when the rules placed every line", async () => {
    const page = remember(db, { companyId, pageId: null, topic: "Things to remember", said: "we never discount retainers", fact: null, day: "2026-10-13" }, NOW);
    await ask.connect(db, { service: "gemini", key: GEMINI_KEY });
    sent.length = 0;
    expect((await proposeSort(db, companyId, page.pageId)).sent).toBeNull();
    expect(sent).toHaveLength(0);
  });
});
