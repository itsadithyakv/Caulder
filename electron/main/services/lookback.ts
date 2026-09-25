import type { Db } from "../db/connection";
import { serviceOf } from "@shared/ask";
import { today as todayIn } from "@shared/dates";
import {
  DEFAULT_LOCAL_ADDRESS,
  isOnThisComputer,
  journalContext,
  journalNumbers,
  localModelInput,
  lookBackInput,
  notesContext,
  partInstructions,
  partsOf,
  readingInstructions,
  spanStart,
  type ReadDay,
  type LocalModel,
  type LookBackMonth,
  type LookBackPlan,
  type LookBackReading,
  type LookBackSpan,
} from "@shared/lookback";
import { getSetting, setSetting } from "../repositories/settings";
import { askState, completeAway } from "./ask";
import { checkPasscode, lockState } from "./journal-lock";
import { journalDays } from "./journalread";

/**
 * Looking back (`shared/lookback.ts`): the journal read by a model, on this
 * computer unless you say otherwise and type your passcode to mean it.
 *
 * Nothing here writes anything: not the reading, not what was sent, not
 * that a reading happened. The only thing kept is which local model to use.
 */

type Fetch = typeof fetch;

/** A part a model on a laptop can read in one go, with room to answer: Ollama is told to take this much. */
const LOCAL_PART = 24_000;
const LOCAL_CONTEXT_TOKENS = 16_384;
/** The connected AI takes a year of journal at once, nearly always. */
const AWAY_PART = 150_000;
/** A laptop's model can be slow; a part that takes longer than this is not coming. */
const LOCAL_TIMEOUT_MS = 15 * 60 * 1000;

const QUESTION = "Please write the reading now.";
const PART_QUESTION = "Please write the notes for this part now.";

function storedLocal(db: Db): { address: string; model: string | null } {
  try {
    const parsed = JSON.parse(getSetting(db, "lookBackLocal") ?? "{}") as { address?: unknown; model?: unknown };
    const address = typeof parsed.address === "string" && isOnThisComputer(parsed.address) ? parsed.address : DEFAULT_LOCAL_ADDRESS;
    return { address, model: typeof parsed.model === "string" && parsed.model ? parsed.model : null };
  } catch {
    return { address: DEFAULT_LOCAL_ADDRESS, model: null };
  }
}

/** Whether Ollama is answering on this computer, and which models it has. Asks nothing of anybody else. */
export async function localModel(db: Db, fetcher: Fetch = fetch): Promise<LocalModel> {
  const { address, model } = storedLocal(db);
  try {
    const response = await fetcher(`${address.replace(/\/+$/, "")}/api/tags`, { signal: AbortSignal.timeout(2000) });
    if (!response.ok) return { address, found: false, models: [], model: null };
    const body = (await response.json()) as { models?: { name?: unknown }[] };
    const models = (body.models ?? []).map((each) => each.name).filter((name): name is string => typeof name === "string");
    return { address, found: true, models, model: model && models.includes(model) ? model : (models[0] ?? null) };
  } catch {
    return { address, found: false, models: [], model: null };
  }
}

export async function setLocalModel(db: Db, raw: unknown, fetcher: Fetch = fetch): Promise<LocalModel> {
  const input = localModelInput.parse(raw);
  const address = input.address || DEFAULT_LOCAL_ADDRESS;
  if (!isOnThisComputer(address)) {
    throw new Error("Looking back only uses a model on this computer: the address has to start http://localhost.");
  }
  setSetting(db, "lookBackLocal", JSON.stringify({ address, model: input.model }));
  return localModel(db, fetcher);
}

/** Every workspace, as the journal's own day record counts them: your life is not one company's. */
function everywhere(db: Db): string[] {
  return (db.prepare(`SELECT id FROM companies WHERE is_archived = 0`).all() as { id: string }[]).map((row) => row.id);
}

function byMonth(rows: { m: string; n: number }[]): Map<string, number> {
  return new Map(rows.map((row) => [row.m, row.n]));
}

/** The months of a span in numbers: the journal's, and what got done around it. */
function monthsOf(db: Db, from: string, to: string, days: readonly ReadDay[]): LookBackMonth[] {
  const scope = everywhere(db);
  const within = scope.map(() => "?").join(", ");
  const until = `${to}T23:59:59.999Z`;
  const count = (sql: string, ...params: unknown[]) => byMonth(db.prepare(sql).all(...params) as { m: string; n: number }[]);
  const tasks = count(
    `SELECT substr(completed_at, 1, 7) AS m, COUNT(*) AS n FROM tasks
      WHERE company_id IN (${within}) AND status = 'done' AND completed_at >= ? AND completed_at <= ? GROUP BY m`,
    ...scope,
    from,
    until,
  );
  const calls = count(
    `SELECT substr(created_at, 1, 7) AS m, COUNT(*) AS n FROM calls
      WHERE company_id IN (${within}) AND created_at >= ? AND created_at <= ? GROUP BY m`,
    ...scope,
    from,
    until,
  );
  const habits = count(
    `SELECT substr(c.day, 1, 7) AS m, COUNT(*) AS n FROM habit_checks c JOIN habits h ON h.id = c.habit_id
      WHERE h.company_id IN (${within}) AND c.day >= ? AND c.day <= ? GROUP BY m`,
    ...scope,
    from,
    to,
  );
  const contacts = count(
    `SELECT substr(created_at, 1, 7) AS m, COUNT(*) AS n FROM leads
      WHERE company_id IN (${within}) AND created_at >= ? AND created_at <= ? GROUP BY m`,
    ...scope,
    from,
    until,
  );
  const journal = journalNumbers(days);

  const months: LookBackMonth[] = [];
  for (let month = from.slice(0, 7); month <= to.slice(0, 7); month = nextMonth(month)) {
    const written = journal.get(month);
    months.push({
      month,
      days: written?.days ?? 0,
      words: written?.words ?? 0,
      mood: written?.mood ?? null,
      tasksDone: tasks.get(month) ?? 0,
      calls: calls.get(month) ?? 0,
      habitsKept: habits.get(month) ?? 0,
      contactsAdded: contacts.get(month) ?? 0,
    });
  }
  return months;
}

function nextMonth(month: string): string {
  const [year, m] = month.split("-").map(Number) as [number, number];
  return m === 12 ? `${year + 1}-01` : `${year}-${String(m + 1).padStart(2, "0")}`;
}

function timezoneOf(db: Db, companyId: string): string {
  const row = db.prepare(`SELECT timezone FROM companies WHERE id = ?`).get(companyId) as { timezone: string } | undefined;
  if (!row) throw new Error("That workspace no longer exists.");
  return row.timezone;
}

function labelOf(id: string | null): string {
  return (id ? serviceOf(id)?.label : null) ?? "your AI";
}

function spanOf(value: unknown): LookBackSpan {
  return value === "month" || value === "season" || value === "year" || value === "all" ? value : "season";
}

/** What a reading of a span would take and send, before one is asked for. */
export async function planLookBack(db: Db, companyId: string, rawSpan: unknown, now: Date = new Date(), fetcher: Fetch = fetch): Promise<LookBackPlan> {
  const span = spanOf(rawSpan);
  const to = todayIn(timezoneOf(db, companyId), now);
  const from = spanStart(span, to);
  const { days, sealed } = journalDays(db, companyId, from, to);
  const first = from ?? days[0]?.day ?? to;
  const months = monthsOf(db, first, to, days);
  const lock = lockState(db);
  const ask = askState(db);
  return {
    span,
    from,
    to,
    days: days.length,
    // What one request would carry: the days and the numbers beside them.
    characters: journalContext(days, months).length,
    months,
    local: await localModel(db, fetcher),
    away: ask.connected
      ? { service: labelOf(ask.service), model: ask.model, onThisComputer: ask.baseUrl !== null && isOnThisComputer(ask.baseUrl) }
      : null,
    passcode: lock.set,
    open: lock.open,
    sealed,
  };
}

async function askOllama(address: string, model: string, system: string, context: string, question: string, fetcher: Fetch): Promise<string> {
  let response: Response;
  try {
    response = await fetcher(`${address.replace(/\/+$/, "")}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model,
        stream: false,
        messages: [
          { role: "system", content: `${system}\n\n${context}` },
          { role: "user", content: question },
        ],
        // Ollama reads only its default few thousand tokens unless told, and cuts the rest without saying.
        options: { num_ctx: LOCAL_CONTEXT_TOKENS },
      }),
      signal: AbortSignal.timeout(LOCAL_TIMEOUT_MS),
    });
  } catch {
    throw new Error(`Ollama stopped answering at ${address}. Is it still running?`);
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Ollama could not read it (${response.status}${detail ? `: ${detail.slice(0, 160)}` : ""}).`);
  }
  const body = (await response.json()) as { message?: { content?: unknown } };
  const text = typeof body.message?.content === "string" ? body.message.content : "";
  return text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
}

/**
 * A reading, asked for. On this computer it takes the journal open; sent
 * away it takes the passcode typed again as well - or SEND, for a journal
 * with no passcode - because once it has gone it cannot be called back.
 */
export async function readLookBack(db: Db, companyId: string, raw: unknown, now: Date = new Date(), fetcher: Fetch = fetch): Promise<LookBackReading> {
  const input = lookBackInput.parse(raw);
  const to = todayIn(timezoneOf(db, companyId), now);
  const from = spanStart(input.span, to);
  const { days, sealed } = journalDays(db, companyId, from, to);
  if (sealed > 0) throw new Error(`Unlock the journal first: ${sealed === 1 ? "a day" : `${sealed} days`} in that stretch ${sealed === 1 ? "is" : "are"} locked.`);
  if (days.length === 0) throw new Error("Nothing is written in that stretch yet.");
  const months = monthsOf(db, from ?? days[0]?.day ?? to, to, days);

  let ask: (system: string, context: string, question: string) => Promise<string>;
  let service: string;
  let model: string;
  let budget: number;

  if (input.via === "local") {
    const local = await localModel(db, fetcher);
    if (!local.found) throw new Error(`Ollama is not answering at ${local.address}. Start it, or install it from ollama.com.`);
    if (!local.model) throw new Error("Ollama has no models yet. In a terminal, run: ollama pull llama3.2");
    const chosen = local.model;
    ask = (system, context, question) => askOllama(local.address, chosen, system, context, question, fetcher);
    service = "Ollama, on this computer";
    model = chosen;
    budget = LOCAL_PART;
  } else {
    const state = askState(db);
    if (!state.connected) throw new Error("Connect an AI in Settings first, or use a model on this computer.");
    // The connected AI may itself be on this computer; anywhere else, it is a decision.
    if (!(state.baseUrl !== null && isOnThisComputer(state.baseUrl))) {
      if (lockState(db).set) checkPasscode(db, input.passcode);
      else if ((input.confirm ?? "").trim().toUpperCase() !== "SEND") throw new Error("Type SEND to send your journal.");
    }
    ask = async (system, context, question) => (await completeAway(db, system, context, question)).text;
    service = labelOf(state.service);
    model = state.models.find((option) => option.id === state.model)?.label ?? state.model ?? "";
    budget = AWAY_PART;
  }

  const reading = await readParts(ask, partsOf(days, budget), days, months, from, to);
  return { ...reading, via: input.via, service, model, days: days.length };
}

async function readParts(
  ask: (system: string, context: string, question: string) => Promise<string>,
  parts: { label: string; text: string }[],
  days: readonly ReadDay[],
  months: readonly LookBackMonth[],
  from: string | null,
  to: string,
): Promise<{ text: string; characters: number; requests: number }> {
  if (parts.length <= 1) {
    const context = journalContext(days, months);
    const text = await ask(readingInstructions(from, to), context, QUESTION);
    if (!text) throw new Error("The model sent back nothing. Try again, or another model.");
    return { text, characters: context.length, requests: 1 };
  }
  // Too long for one go: notes on each part, in order, then a reading of the notes.
  const notes: { label: string; text: string }[] = [];
  let characters = 0;
  for (const part of parts) {
    characters += part.text.length;
    notes.push({ label: part.label, text: await ask(partInstructions(part.label), part.text, PART_QUESTION) });
  }
  const context = notesContext(notes, months);
  const text = await ask(readingInstructions(from, to), context, QUESTION);
  if (!text) throw new Error("The model sent back nothing. Try again, or another model.");
  return { text, characters: characters + context.length, requests: parts.length + 1 };
}
