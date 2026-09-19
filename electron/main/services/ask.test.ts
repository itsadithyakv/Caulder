import { beforeEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";

/**
 * Ask the brain across services, with each one played by a stand-in for
 * `net.fetch`: a connection is checked by listing models before it is kept,
 * and kept sealed; a question goes in each service's own shape with the
 * dossier and the conversation; and a dossier too long for the size chosen is
 * cut to the contacts the question is about.
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
  it("asks Gemini with the dossier as the instruction, the thread as turns, and leaves its thinking out", async () => {
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
      sent: { contacts: 1, leftOut: 0 },
    });
    expect(reply.sent.documents).toEqual(["Read me first", "The company", "Customers and sales", "People and running the company"]);
    expect(reply.references).toContainEqual({ kind: "contact", id: school.id, name: "Oakridge" });

    const request = sent[0];
    expect(request?.url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent");
    const body = request?.body as {
      systemInstruction: { parts: { text: string }[] };
      contents: { role: string; parts: { text: string }[] }[];
    };
    expect(body.systemInstruction.parts[0]?.text).toContain("company brain of Unifloe");
    expect(body.systemInstruction.parts[0]?.text).toContain("> Call before 10am.");
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

  it("sends only the contacts a question is about when the company is bigger than the size chosen", async () => {
    const note = "Talked about timetables and the trust. ".repeat(40);
    for (let i = 0; i < 60; i += 1) {
      createLead(db, companyId, leadInput.parse({ name: `School ${String(i).padStart(3, "0")}`, notes: note }));
    }
    const named = createLead(db, companyId, leadInput.parse({ name: "Beacon Academy", notes: "Wants the pilot." }));
    await ask.connect(db, { service: "gemini", key: GEMINI_KEY });
    ask.setContext(db, "small");
    sent.length = 0;

    const reply = await ask.askBrain(db, companyId, { question: "What does Beacon Academy want?" });
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
    handler = () => ({ status: 503, body: { error: { message: "overloaded" } } });
    await expect(ask.askBrain(db, companyId, { question: "Anything?" })).rejects.toThrow("busy or having trouble");
    handler = () => ({ body: { promptFeedback: { blockReason: "SAFETY" } } });
    await expect(ask.askBrain(db, companyId, { question: "Anything?" })).rejects.toThrow("would not answer that (safety)");
    handler = () => ({ body: { candidates: [{ content: { parts: [] } }] } });
    await expect(ask.askBrain(db, companyId, { question: "Anything?" })).rejects.toThrow("empty answer");
    await expect(ask.askBrain(db, companyId, { question: "  " })).rejects.toThrow("Ask something");
  });
});
