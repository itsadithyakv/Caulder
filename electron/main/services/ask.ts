import { net, safeStorage } from "electron";
import type { Db } from "../db/connection";
import {
  CONTEXT_BUDGET,
  askInput,
  chatModels,
  connectInput,
  isContextSize,
  modelInput,
  pickModel,
  serviceOf,
  type AiModelOption,
  type AiService,
  type AiServiceId,
  type AskAnswer,
  type AskReference,
  type AskScope,
  type AskState,
  type ContextSize,
} from "@shared/ask";
import { getSetting, setSetting } from "../repositories/settings";
import { listLeads } from "../repositories/leads";
import { searchEverything } from "../repositories/search";
import { encryptionAvailable } from "./credentials";
import { buildDossier, type DossierDocument } from "./dossier";
import { buildYours } from "./yours";
import { buildToday } from "./today";
import { pagesOf } from "../repositories/brain";
import { linkLabelsOnly } from "@shared/links";
import { MARK_CLOSE, MARK_OPEN } from "@shared/search";
import { describeDue, today as todayIn } from "@shared/dates";

/**
 * Ask the brain, through whichever AI service the founder connects.
 *
 * The second kind of request Caulder makes to anyone, and like the first it
 * is off until somebody sets it up. The connection - service, address and
 * key - is sealed by the operating system the way the Google key is, and the
 * key is never handed back to the window. What is sent is the dossier with
 * numbers masked - the same documents Export for an AI writes - and the
 * window is told exactly what went.
 *
 * Three request shapes cover the services: Gemini's, Anthropic's, and
 * OpenAI's, which OpenRouter, Groq, Ollama and most others also speak.
 */

const TIMEOUT_MS = 180_000;

/** The most the line on Today ever sends, whatever size is set for the brain. */
const LINE_BUDGET = 60_000;

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
    canEncrypt: encryptionAvailable(),
    personal: getSetting(db, "aiPersonal") === "on",
  };
}

/**
 * Whether your own pages may go with a question. Off until this says
 * otherwise; a locked or private journal day never goes either way.
 */
export function setPersonal(db: Db, on: unknown): AskState {
  setSetting(db, "aiPersonal", on === true ? "on" : "");
  return askState(db);
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

async function request(connection: Connection, path: string, body?: unknown): Promise<unknown> {
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
      if (response.status >= 500) throw new Error(`${service.label} is busy or having trouble. Try again shortly.`);
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

async function complete(
  connection: Connection,
  model: string,
  system: string,
  context: string,
  history: { role: "user" | "assistant"; text: string }[],
  question: string,
): Promise<Reply> {
  const service = serviceOf(connection.service) as AiService;

  if (service.api === "gemini") {
    const reply = (await request(connection, `/models/${encodeURIComponent(model)}:generateContent`, {
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

function size(documents: readonly DossierDocument[]): number {
  return documents.reduce((sum, document) => sum + document.text.length, 0);
}

/**
 * The contacts a question is about, for a dossier too long to send whole:
 * those named in it, those the search index finds for it, and then the ones
 * with the most recent activity, up to a limit.
 */
function contactsFor(db: Db, companyId: string, question: string, most: number): Set<string> {
  const leads = listLeads(db, { companyId, sort: "recent", direction: "desc" });
  const wanted = new Set<string>();
  const words = question.toLowerCase();
  for (const lead of leads) {
    if (wanted.size >= most) break;
    if (lead.name.length >= 3 && words.includes(lead.name.toLowerCase())) wanted.add(lead.id);
  }
  for (const hit of searchEverything(db, companyId, question, 60)) {
    if (wanted.size >= most) break;
    if (hit.leadId) wanted.add(hit.leadId);
  }
  for (const lead of leads) {
    if (wanted.size >= most) break;
    wanted.add(lead.id);
  }
  return wanted;
}

/** Cuts documents that still do not fit, and says so where each was cut. */
function fit(documents: DossierDocument[], budget: number): DossierDocument[] {
  const share = Math.floor(budget / documents.length);
  return documents.map((document) =>
    document.text.length <= share
      ? document
      : { ...document, text: `${document.text.slice(0, share)}\n\n*(Cut here: the rest was too long to send.)*` },
  );
}

/**
 * What the question is about: the pages and contacts the search index finds
 * for it, written out.
 *
 * The dossier is everything within a budget; this is the opposite - a handful
 * of things, in full, chosen by the words that were typed. It is what makes a
 * short question on Today worth asking without sending a hundred thousand
 * characters to answer it.
 */
function about(db: Db, companyId: string, question: string): DossierDocument | null {
  const hits = searchEverything(db, companyId, question, 10);
  if (hits.length === 0) return null;
  const pages = new Map(pagesOf(db, companyId).map((page) => [page.id, page]));
  const lines: string[] = [];

  for (const hit of hits) {
    if (hit.kind === "page") {
      const page = pages.get(hit.id);
      if (!page || page.is_archived === 1) continue;
      const body = linkLabelsOnly(page.body).trim().slice(0, 2500);
      lines.push(`## ${page.title}`, "", body.length > 0 ? body : "*(Nothing written on it yet.)*", "");
    } else {
      // A contact, a note, a line of history, an invoice: the matched words
      // with their marks taken off, which is what the window shows too.
      // The snippet carries the marks the window draws its highlights from.
      const said = hit.detail.split(MARK_OPEN).join("").split(MARK_CLOSE).join("");
      lines.push(`## ${hit.title}`, "", said, "");
    }
  }
  if (lines.length === 0) return null;
  return {
    file: "about.md",
    title: "What you asked about",
    text: ["# What you asked about", "", "The pages and people this question seems to be about, in full.", "", ...lines].join("\n"),
  };
}

/** The day itself: what is in the hours, what is late, what is due. */
function todayDocument(db: Db, companyId: string, now: Date): DossierDocument {
  const today = buildToday(db, companyId, now);
  const task = (item: { title: string; dueOn: string; leadName: string | null; area: string | null }) =>
    `- ${item.title}${item.leadName ? ` (${item.leadName})` : ""}${item.area ? ` #${item.area}` : ""} - ${describeDue(item.dueOn, today.day)}`;

  const lines: string[] = [`# Today, ${today.day}`, ""];
  if (today.blocks.length > 0) {
    lines.push("## In the hours today", "");
    for (const block of today.blocks) lines.push(`- ${block.startsAt} for ${block.minutes} minutes: ${block.title}`);
    lines.push("");
  }
  for (const [heading, items] of [
    ["Late", today.overdue],
    ["Due today", today.dueToday],
    ["Coming up", today.upcoming.slice(0, 10)],
  ] as const) {
    if (items.length === 0) continue;
    lines.push(`## ${heading}`, "", ...items.map(task), "");
  }
  if (today.deadlines.length > 0) {
    lines.push("## Dates coming", "", ...today.deadlines.map((deadline) => `- ${deadline.title}: ${deadline.daysLeft} days`), "");
  }
  if (today.unpaid.length > 0) lines.push(`## Money`, "", `- ${today.unpaid.length} invoices are overdue.`, "");
  if (lines.length === 2) lines.push("Nothing is due and nothing is in the hours.", "");
  return { file: "today.md", title: "Today", text: lines.join("\n") };
}

function instructions(company: { name: string; currency: string }, day: string): string {
  return [
    `You are the company brain of ${company.name}, answering the founder's questions inside Caulder, their own app for contacts, deals, money and company notes.`,
    `Answer only from the documents given, which are what Caulder holds about ${company.name} as of ${day}. If they do not say, say so plainly, and say what would need writing down. Never invent numbers, names, dates or quotes.`,
    "Lead with the answer, then the detail that supports it. Keep it short: a few sentences, or a short list. Plain Markdown only; no tables unless asked.",
    `Money is in ${company.currency}. Registration and account numbers are masked; never guess them.`,
    "When you draw on a page of the brain or on a contact, name it in double square brackets exactly as the documents title it - [[Company profile]], [[Acme Ltd]] - so the founder can open it.",
    "You cannot change anything in Caulder. When a change would help, say what to change and where.",
  ].join("\n\n");
}

/**
 * The line on Today, which is a different question from "ask the brain": it
 * is asked standing up, about now, and answered in a sentence.
 */
function lineInstructions(company: { name: string; currency: string }, day: string): string {
  return [
    `You are ${company.name}'s own assistant, answering on the Today screen of Caulder - the founder's app for their work and their life. It is ${day}.`,
    "Answer only from the documents given. If they do not say, say so in one line and say what would need writing down. Never invent numbers, names, dates or quotes.",
    "Answer in one or two sentences. No preamble, no heading, no sign-off. A list only when the answer is genuinely a list, and then three or four items at most.",
    `Money is in ${company.currency}. Registration and account numbers are masked; never guess them.`,
    "When you name a page of the brain or a contact, write it in double square brackets exactly as the documents title it - [[Guitar]], [[Acme Ltd]] - so it can be opened.",
    "A document titled You is the founder's own life - their journal, goals, habits, hobbies and courses. Use it when the question is about them. Never repeat it back unasked, and never quote the journal at them unless they asked what they wrote.",
    "You cannot change anything. When a change would help, say what to change and where, in the same sentence.",
  ].join("\n\n");
}

export async function askBrain(db: Db, companyId: string, raw: unknown, now: Date = new Date()): Promise<AskAnswer> {
  const input = askInput.parse(raw);
  const connection = readConnection(db);
  if (!connection) throw new Error("Connect an AI in Settings to ask the brain.");
  const service = serviceOf(connection.service) as AiService;
  const model = getSetting(db, "aiModel");
  if (!model) throw new Error(`Pick a ${service.label} model in Settings.`);
  const company = db.prepare(`SELECT name, currency, timezone FROM companies WHERE id = ?`).get(companyId) as
    | { name: string; currency: string; timezone: string }
    | undefined;
  if (!company) throw new Error("That company no longer exists.");
  const scope: AskScope = input.scope;
  const budget = CONTEXT_BUDGET[contextOf(db, service)];
  // The line is answered standing up: a few thousand characters, whatever
  // size is set for asking the brain, so it is quick and costs nothing on a
  // free tier even asked forty times a day.
  const room = scope === "line" ? Math.min(budget.characters, LINE_BUDGET) : budget.characters;
  const day = todayIn(company.timezone, now);

  // Your own side goes only if you have said it may, and never carries a
  // locked or private journal day. See services/yours.ts.
  const yours = getSetting(db, "aiPersonal") === "on" ? buildYours(db, companyId, now) : null;

  const allContacts = (db.prepare(`SELECT COUNT(*) AS n FROM leads WHERE company_id = ?`).get(companyId) as { n: number }).n;
  let documents: DossierDocument[];
  let contacts: number;

  if (scope === "line") {
    // Today, and whatever the words point at - rather than the company.
    const found = about(db, companyId, input.question);
    documents = [todayDocument(db, companyId, now), ...(found ? [found] : []), ...(yours ? [yours] : [])];
    contacts = 0;
  } else {
    documents = buildDossier(db, companyId, { secrets: false }, now);
    contacts = allContacts;
    if (size(documents) > room) {
      const chosen = contactsFor(db, companyId, input.question, budget.contacts);
      documents = buildDossier(db, companyId, { secrets: false, contacts: chosen }, now);
      contacts = chosen.size;
    }
    if (yours) documents = [...documents, yours];
  }
  if (size(documents) > room) documents = fit(documents, room);

  const context = documents.map((document) => `<document title="${document.title}">\n${document.text}\n</document>`).join("\n\n");
  const reply = await complete(
    connection,
    model,
    scope === "line" ? lineInstructions(company, day) : instructions(company, day),
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
    model: readModels(db).find((option) => option.id === model)?.label ?? model,
    sent: {
      documents: documents.map((document) => document.title),
      characters: context.length,
      contacts,
      leftOut: allContacts - contacts,
      personal: yours !== null,
    },
    references,
    usage: reply.usage,
  };
}
