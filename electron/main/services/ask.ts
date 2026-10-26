import { net, safeStorage } from "electron";
import type { Db } from "../db/connection";
import {
  CONTEXT_BUDGET,
  askInput,
  chatModels,
  connectInput,
  isContextSize,
  isScope,
  modelInput,
  pickModel,
  serviceOf,
  type AiModelOption,
  type AiService,
  type AiServiceId,
  type AskAnswer,
  type AskPreview,
  type AskReference,
  type AskScope,
  type AskState,
  type ContextSize,
} from "@shared/ask";
import { getSetting, setSetting } from "../repositories/settings";
import { encryptionAvailable } from "./credentials";
import { relevantTo } from "./relevant";
import type { Read } from "./understand";
import { today as todayIn } from "@shared/dates";

/**
 * Ask the brain, through whichever AI service the founder connects.
 *
 * The second kind of request Caulder makes to anyone, and like the first it
 * is off until somebody sets it up. The connection - service, address and
 * key - is sealed by the operating system the way the Google key is, and the
 * key is never handed back to the window. What is sent is cut from the
 * dossier with numbers masked - the documents Export for an AI writes - to
 * what the question needs (services/relevant.ts), and the window is told
 * exactly what went.
 *
 * Three request shapes cover the services: Gemini's, Anthropic's, and
 * OpenAI's, which OpenRouter, Groq, Ollama and most others also speak.
 */

const TIMEOUT_MS = 180_000;

type Connection = { service: AiServiceId; key: string; baseUrl: string };

/* ---- The connection ------------------------------------------------------ */

function readConnection(db: Db): Connection | null {
  const stored = getSetting(db, "aiConnection");
  if (!stored || !encryptionAvailable()) return null;
  try {
    const parsed = JSON.parse(safeStorage.decryptString(Buffer.from(stored, "base64"))) as Partial<Connection>;
    const service = serviceOf(parsed.service);
    if (!service || typeof parsed.key !== "string" || typeof parsed.baseUrl !== "string") return null;
    return { service: service.id as AiServiceId, key: parsed.key, baseUrl: parsed.baseUrl };
  } catch {
    // Sealed on another machine or by another Windows user: as good as absent.
    return null;
  }
}

function readModels(db: Db): AiModelOption[] {
  try {
    const parsed: unknown = JSON.parse(getSetting(db, "aiModels") ?? "[]");
    return Array.isArray(parsed)
      ? parsed.filter((option): option is AiModelOption => typeof option?.id === "string" && typeof option?.label === "string")
      : [];
  } catch {
    return [];
  }
}

function contextOf(db: Db, service: AiService | null): ContextSize {
  const stored = getSetting(db, "aiContext");
  return isContextSize(stored) ? stored : (service?.context ?? "large");
}

function scopeOf(db: Db): AskScope {
  const stored = getSetting(db, "aiScope");
  return isScope(stored) ? stored : "needed";
}

/**
 * The connection, the model and the service, for anything that asks the AI
 * something: a question, a line to read, a draft to propose. Throws the
 * sentence the person reads when there is nothing to ask.
 */
export function asking(db: Db, what = "ask the brain"): { connection: Connection; service: AiService; model: string; label: string } {
  const connection = readConnection(db);
  if (!connection) throw new Error(`Connect an AI in Settings to ${what}.`);
  const service = serviceOf(connection.service) as AiService;
  const model = getSetting(db, "aiModel");
  if (!model) throw new Error(`Pick a ${service.label} model in Settings.`);
  return { connection, service, model, label: readModels(db).find((option) => option.id === model)?.label ?? model };
}

/** The most that goes with one request, by the size chosen. */
export function budgetOf(db: Db, service: AiService): { characters: number; contacts: number } {
  return CONTEXT_BUDGET[contextOf(db, service)];
}

export function askState(db: Db): AskState {
  const connection = readConnection(db);
  const service = connection ? serviceOf(connection.service) : null;
  return {
    connected: connection !== null,
    service: connection?.service ?? null,
    baseUrl: connection?.baseUrl ?? null,
    last4: connection && connection.key.length > 0 ? connection.key.slice(-4) : null,
    model: connection ? getSetting(db, "aiModel") || null : null,
    models: connection ? readModels(db) : [],
    context: contextOf(db, service),
    scope: scopeOf(db),
    // AI mode is only ever on with something connected to be in it.
    line: connection !== null && getSetting(db, "aiLine") === "on",
    canEncrypt: encryptionAvailable(),
  };
}

/**
 * Connects a service: asks it which models it has - which costs nothing and
 * proves the key and the address work - then keeps the connection sealed,
 * the list, and a model to start on.
 */
export async function connect(db: Db, raw: unknown): Promise<AskState> {
  const input = connectInput.parse(raw);
  const service = serviceOf(input.service) as AiService;
  if (!encryptionAvailable()) {
    throw new Error(
      "Windows will not encrypt stored secrets on this machine, so Caulder will not keep an AI connection. Nothing has been saved.",
    );
  }
  const connection: Connection = {
    service: service.id as AiServiceId,
    key: service.key === "none" ? "" : input.key,
    baseUrl: (input.baseUrl || service.baseUrl).replace(/\/+$/, ""),
  };
  const models = await listModels(connection);
  if (models.length === 0) {
    throw new Error(
      service.id === "ollama"
        ? "Ollama is running but has no models yet. Download one in Ollama, then connect again."
        : `${service.label} answered, but offered no models to ask.`,
    );
  }

  setSetting(db, "aiConnection", safeStorage.encryptString(JSON.stringify(connection)).toString("base64"));
  setSetting(db, "aiModels", JSON.stringify(models));
  setSetting(db, "aiModel", pickModel(service.id, models.map((model) => model.id)) ?? models[0]?.id ?? "");
  setSetting(db, "aiContext", service.context);
  return askState(db);
}

export function disconnect(db: Db): AskState {
  setSetting(db, "aiConnection", "");
  setSetting(db, "aiModels", "[]");
  setSetting(db, "aiModel", "");
  setSetting(db, "aiLine", "");
  return askState(db);
}

export function setModel(db: Db, raw: unknown): AskState {
  if (!readConnection(db)) throw new Error("Connect an AI first.");
  setSetting(db, "aiModel", modelInput.parse(raw));
  return askState(db);
}

export function setContext(db: Db, size: unknown): AskState {
  if (!isContextSize(size)) throw new Error("That is not a size Caulder knows.");
  setSetting(db, "aiContext", size);
  return askState(db);
}

export function setScope(db: Db, scope: unknown): AskState {
  if (!isScope(scope)) throw new Error("That is not a choice Caulder knows.");
  setSetting(db, "aiScope", scope);
  return askState(db);
}

/** The quick line in or out of AI mode. In, only with an AI connected: it is that AI the lines go to. */
export function setLineMode(db: Db, on: unknown): AskState {
  if (on === true && !readConnection(db)) throw new Error("Connect an AI in Settings to use AI mode. Gemini is free.");
  setSetting(db, "aiLine", on === true ? "on" : "");
  return askState(db);
}

export async function refreshModels(db: Db): Promise<AskState> {
  const connection = readConnection(db);
  if (!connection) throw new Error("Connect an AI first.");
  setSetting(db, "aiModels", JSON.stringify(await listModels(connection)));
  return askState(db);
}

/* ---- Talking to a service ---------------------------------------------- */

function headersFor(connection: Connection, api: AiService["api"]): Record<string, string> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (api === "gemini") headers["x-goog-api-key"] = connection.key;
  else if (api === "anthropic") {
    headers["x-api-key"] = connection.key;
    headers["anthropic-version"] = "2023-06-01";
  } else {
    if (connection.key) headers["authorization"] = `Bearer ${connection.key}`;
    // OpenRouter lists the apps that use it by these; harmless elsewhere.
    headers["x-title"] = "Caulder";
  }
  return headers;
}

type ApiError = { error?: { message?: string; status?: string } | string; message?: string };

/** The service said it was busy: worth one more try before the person is told. */
class Busy extends Error {}
/** How long to wait before asking a busy service once more. */
const BUSY_WAIT_MS = 1200;

/**
 * One request, tried again once when the service says it is busy. A free
 * tier is busy for a moment often enough that the first question after
 * connecting would otherwise fail one time in a few - measured against
 * Gemini on 13 October 2026 - and "try again shortly" is something Caulder
 * can do itself. Never for a refusal: a wrong key or too many questions is
 * said at once.
 */
async function request(connection: Connection, path: string, body?: unknown): Promise<unknown> {
  try {
    return await requestOnce(connection, path, body);
  } catch (cause) {
    if (!(cause instanceof Busy)) throw cause;
    await new Promise((resolve) => setTimeout(resolve, BUSY_WAIT_MS));
    return requestOnce(connection, path, body);
  }
}

async function requestOnce(connection: Connection, path: string, body?: unknown): Promise<unknown> {
  const service = serviceOf(connection.service) as AiService;
  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), TIMEOUT_MS);
  try {
    let response: Response;
    try {
      response = await net.fetch(`${connection.baseUrl}${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers: headersFor(connection, service.api),
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: stop.signal,
      });
    } catch (cause) {
      if (cause instanceof Error && cause.name === "AbortError") {
        throw new Error(`${service.label} did not answer in time. Try a shorter question, a smaller copy, or a quicker model.`);
      }
      throw new Error(
        service.id === "ollama"
          ? `Could not reach Ollama at ${connection.baseUrl}. Is it open?`
          : `Could not reach ${service.label} at ${connection.baseUrl}. Check the internet connection and the address.`,
      );
    }

    const text = await response.text();
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      // Handled below: a body that is not JSON is an answer nobody can use.
    }

    if (!response.ok) {
      const error = (parsed as ApiError | null)?.error;
      const message = (typeof error === "string" ? error : error?.message) ?? (parsed as ApiError | null)?.message ?? "";
      if (response.status === 401 || /api key not valid|invalid api key|incorrect api key|invalid x-api-key/i.test(message)) {
        throw new Error(`${service.label} did not accept that key. Check it and connect again.`);
      }
      if (response.status === 429) {
        throw new Error(
          `${service.label} says that is too many questions for now${
            service.free ? " - free tiers allow only a few a minute" : ""
          }. Wait a minute and ask again${service.free ? ", or send a shorter copy of the company" : ""}.`,
        );
      }
      if (response.status === 404 && path !== "/models") {
        throw new Error(`${service.label} does not know that model. Pick another in Settings.`);
      }
      if (response.status >= 500) throw new Busy(`${service.label} is busy or having trouble. Try again shortly.`);
      throw new Error(`${service.label} could not answer${message ? `: ${message}` : ` (${response.status}).`}`);
    }
    if (parsed === null) throw new Error(`${service.label} sent back something that was not an answer.`);
    return parsed;
  } finally {
    clearTimeout(timer);
  }
}

async function listModels(connection: Connection): Promise<AiModelOption[]> {
  const service = serviceOf(connection.service) as AiService;
  if (service.api === "gemini") {
    const reply = (await request(connection, "/models?pageSize=1000")) as {
      models?: { name?: string; displayName?: string; supportedGenerationMethods?: string[] }[];
    };
    const usable = (reply.models ?? []).filter(
      (model) => model.name?.startsWith("models/gemini") && model.supportedGenerationMethods?.includes("generateContent"),
    );
    const ids = chatModels(usable.map((model) => (model.name ?? "").replace(/^models\//, "")));
    return ids.map((id) => ({ id, label: usable.find((model) => model.name === `models/${id}`)?.displayName ?? id }));
  }
  if (service.api === "anthropic") {
    const reply = (await request(connection, "/models?limit=100")) as { data?: { id?: string; display_name?: string }[] };
    // Newest first, as Anthropic lists them.
    return (reply.data ?? [])
      .filter((model): model is { id: string; display_name?: string } => typeof model.id === "string")
      .map((model) => ({ id: model.id, label: model.display_name ?? model.id }));
  }
  const reply = (await request(connection, "/models")) as { data?: { id?: string; name?: string }[] };
  const listed = (reply.data ?? []).filter((model): model is { id: string; name?: string } => typeof model.id === "string");
  const ids = chatModels(listed.map((model) => model.id));
  return ids.map((id) => ({ id, label: listed.find((model) => model.id === id)?.name ?? id }));
}

type Reply = { text: string; usage: AskAnswer["usage"] };

/**
 * One request to whichever service is connected, in its own shape. `json`
 * asks for an answer that is one JSON object - said in the instructions as
 * well, since not every service has a switch for it.
 */
export async function complete(
  connection: Connection,
  model: string,
  system: string,
  context: string,
  history: { role: "user" | "assistant"; text: string }[],
  question: string,
  json = false,
): Promise<Reply> {
  const service = serviceOf(connection.service) as AiService;

  if (service.api === "gemini") {
    const reply = (await request(connection, `/models/${encodeURIComponent(model)}:generateContent`, {
      ...(json ? { generationConfig: { responseMimeType: "application/json" } } : {}),
      systemInstruction: { parts: [{ text: `${system}\n\n${context}` }] },
      contents: [
        ...history.map((turn) => ({ role: turn.role === "assistant" ? "model" : "user", parts: [{ text: turn.text }] })),
        { role: "user", parts: [{ text: question }] },
      ],
    })) as {
      candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
      promptFeedback?: { blockReason?: string };
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; cachedContentTokenCount?: number };
    };
    if (reply.promptFeedback?.blockReason) {
      throw new Error(`Gemini would not answer that (${reply.promptFeedback.blockReason.toLowerCase()}). Try asking another way.`);
    }
    const candidate = reply.candidates?.[0];
    return {
      text: (candidate?.content?.parts ?? [])
        .filter((part) => !part.thought && typeof part.text === "string")
        .map((part) => part.text)
        .join(""),
      usage: {
        input: reply.usageMetadata?.promptTokenCount ?? 0,
        output: reply.usageMetadata?.candidatesTokenCount ?? 0,
        cached: reply.usageMetadata?.cachedContentTokenCount ?? 0,
      },
    };
  }

  if (service.api === "anthropic") {
    const reply = (await request(connection, "/messages", {
      model,
      max_tokens: 4096,
      system: [
        { type: "text", text: system },
        // The documents are the same for every question in a sitting, so they
        // are cached: a follow-up costs a fraction of the first question.
        { type: "text", text: context, cache_control: { type: "ephemeral" } },
      ],
      messages: [
        ...history.map((turn) => ({ role: turn.role, content: turn.text })),
        { role: "user", content: question },
      ],
    })) as {
      content?: { type: string; text?: string }[];
      usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number };
    };
    return {
      text: (reply.content ?? [])
        .filter((block) => block.type === "text" && typeof block.text === "string")
        .map((block) => block.text)
        .join("\n\n"),
      usage: {
        input: reply.usage?.input_tokens ?? 0,
        output: reply.usage?.output_tokens ?? 0,
        cached: reply.usage?.cache_read_input_tokens ?? 0,
      },
    };
  }

  // OpenAI's shape, which most services speak. No token cap: reasoning models
  // count their thinking against it, and a cap that cuts an answer off
  // half-way is worse than a long one.
  const reply = (await request(connection, "/chat/completions", {
    model,
    messages: [
      { role: "system", content: `${system}\n\n${context}` },
      ...history.map((turn) => ({ role: turn.role, content: turn.text })),
      { role: "user", content: question },
    ],
  })) as {
    choices?: { message?: { content?: string | { type?: string; text?: string }[] | null } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } };
  };
  const content = reply.choices?.[0]?.message?.content;
  const text =
    typeof content === "string"
      ? content
      : Array.isArray(content)
        ? content.map((part) => part.text ?? "").join("")
        : "";
  return {
    // Some open models think out loud between tags before answering.
    text: text.replace(/<think>[\s\S]*?<\/think>/g, ""),
    usage: {
      input: reply.usage?.prompt_tokens ?? 0,
      output: reply.usage?.completion_tokens ?? 0,
      cached: reply.usage?.prompt_tokens_details?.cached_tokens ?? 0,
    },
  };
}

/* ---- Asking ---------------------------------------------------------------- */

function instructions(company: { name: string; currency: string }, day: string, whole: boolean): string {
  return [
    `You are the company brain of ${company.name}, answering the founder's questions inside Caulder, their own app for contacts, deals, money and company notes.`,
    whole
      ? `Answer only from the documents given, which are what Caulder holds about ${company.name} as of ${day}. If they do not say, say so plainly, and say what would need writing down. Never invent numbers, names, dates or quotes.`
      : `Answer only from the documents given: the company in brief, and the parts of what Caulder holds about ${company.name}, as of ${day}, that bear on this question. They are not everything Caulder holds. If the answer is not in them, say plainly that it was not in what was sent with this question, and that asking again with "everything" sends the whole company. Never invent numbers, names, dates or quotes.`,
    "Lead with the answer, then the detail that supports it. Keep it short: a few sentences, or a short list. Plain Markdown only; no tables unless asked.",
    `Money is in ${company.currency}. Registration and account numbers are masked; never guess them.`,
    "When you draw on a page of the brain or on a contact, name it in double square brackets exactly as the documents title it - [[Company profile]], [[Acme Ltd]] - so the founder can open it.",
    "You cannot change anything in Caulder. When a change would help, say what to change and where.",
  ].join("\n\n");
}

export async function askBrain(
  db: Db,
  companyId: string,
  raw: unknown,
  now: Date = new Date(),
  /** The model on this machine, when understanding is on: what goes is chosen by meaning as well as words (phase 22). */
  read: Read | null = null,
): Promise<AskAnswer> {
  const input = askInput.parse(raw);
  const { connection, service, model, label } = asking(db);
  const company = db.prepare(`SELECT name, currency, timezone FROM companies WHERE id = ?`).get(companyId) as
    | { name: string; currency: string; timezone: string }
    | undefined;
  if (!company) throw new Error("That company no longer exists.");
  const day = todayIn(company.timezone, now);

  const relevant = await relevantTo(db, companyId, input.question, {
    earlier: input.history.filter((turn) => turn.role === "user").map((turn) => turn.text),
    budget: budgetOf(db, service),
    whole: input.whole || scopeOf(db) === "all",
    read,
    now,
  });
  const { documents } = relevant;

  const context = documents.map((document) => `<document title="${document.title}">\n${document.text}\n</document>`).join("\n\n");
  const reply = await complete(
    connection,
    model,
    instructions(company, day, relevant.whole),
    context,
    input.history,
    input.question,
  );
  const text = reply.text.trim();
  if (text.length === 0) throw new Error(`${service.label} sent back an empty answer. Try asking another way, or another model.`);

  const pages = db
    .prepare(`SELECT id, title FROM brain_pages WHERE company_id = ? AND is_archived = 0`)
    .all(companyId) as { id: string; title: string }[];
  const leads = db.prepare(`SELECT id, name FROM leads WHERE company_id = ?`).all(companyId) as {
    id: string;
    name: string;
  }[];
  const references: AskReference[] = [
    ...pages.map((page) => ({ kind: "page" as const, id: page.id, name: page.title })),
    ...leads.map((lead) => ({ kind: "contact" as const, id: lead.id, name: lead.name })),
  ];

  return {
    text,
    service: service.label,
    model: label,
    sent: {
      documents: documents.map((document) => document.title),
      parts: relevant.parts,
      whole: relevant.whole,
      characters: context.length,
      contacts: relevant.contacts,
      leftOut: relevant.leftOut,
    },
    references,
    usage: reply.usage,
  };
}

/**
 * What would go with a question, worked out without asking anybody: said
 * under the box before the question is sent (phase 37). Nothing leaves the
 * machine for it.
 */
export async function previewAsk(db: Db, companyId: string, raw: unknown, now: Date = new Date(), read: Read | null = null): Promise<AskPreview> {
  const input = askInput.parse(raw);
  const { service } = asking(db);
  const relevant = await relevantTo(db, companyId, input.question, {
    earlier: input.history.filter((turn) => turn.role === "user").map((turn) => turn.text),
    budget: budgetOf(db, service),
    whole: input.whole || scopeOf(db) === "all",
    read,
    now,
  });
  return {
    parts: relevant.parts,
    characters: relevant.documents.reduce((sum, document) => sum + document.text.length, 0),
    whole: relevant.whole,
  };
}
