import { z } from "zod";

/**
 * Ask the brain: a question about the company, answered by whichever AI the
 * founder connects - Google's free Gemini by default, a frontier model with a
 * paid key, or one running on this computer. See PLAN.md, part three.
 */

/** The three request shapes a service can speak. Most speak OpenAI's. */
type AiApi = "gemini" | "openai" | "anthropic";

/** How much of the company goes with a question. */
export const CONTEXT_SIZES = ["small", "medium", "large", "whole"] as const;
export type ContextSize = (typeof CONTEXT_SIZES)[number];

export const CONTEXT_LABEL: Record<ContextSize, string> = {
  small: "A short copy",
  medium: "Most of it",
  large: "All of it",
  whole: "All of it, however big",
};

export const CONTEXT_HINT: Record<ContextSize, string> = {
  small: "About 15,000 tokens. For a model on this computer, or a free tier with a tight limit.",
  medium: "About 50,000 tokens.",
  large: "About 120,000 tokens: a whole company, for most. Contacts are trimmed to fit past that.",
  whole: "Up to about 800,000 tokens, for models with a million-token window. Can be slow and costly.",
};

/** Characters sent for each size, and how many contacts are written in full when the list is cut. */
export const CONTEXT_BUDGET: Record<ContextSize, { characters: number; contacts: number }> = {
  small: { characters: 60_000, contacts: 10 },
  medium: { characters: 200_000, contacts: 25 },
  large: { characters: 450_000, contacts: 40 },
  whole: { characters: 3_000_000, contacts: 500 },
};

export type AiService = {
  id: string;
  label: string;
  api: AiApi;
  /** Where its API lives. Empty for "another service", which the founder types. */
  baseUrl: string;
  /** "optional" for a service that may or may not want one. */
  key: "required" | "none" | "optional";
  /** What its keys look like, for the placeholder. */
  keyHint: string;
  /** Where to get a key, or the software. */
  link: { url: string; label: string } | null;
  /** A line under its name. */
  tagline: string;
  free: boolean;
  context: ContextSize;
  /** What to do, in order, to connect it. */
  steps: readonly string[];
  /** What happens to what is sent. Said plainly, because it includes contacts. */
  privacy: string;
};

export const AI_SERVICES = [
  {
    id: "gemini",
    label: "Google Gemini",
    api: "gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    key: "required",
    keyHint: "AIza…",
    link: { url: "https://aistudio.google.com/apikey", label: "Open Google AI Studio" },
    tagline: "Free, with a Google account. The one to start with.",
    free: true,
    context: "large",
    steps: [
      "Press **Open Google AI Studio** and sign in with any Google account.",
      "Press **Create API key**. If it asks for a project, take the one it offers or let it make one.",
      "Copy the key - it starts with *AIza* - paste it below and press **Connect**.",
    ],
    privacy:
      "Free, with limits: a handful of questions a minute and a daily cap, which is plenty for asking about one company. On the free tier Google may use what is sent to improve its products, and what is sent includes your contacts' details. Turning on billing for the key in AI Studio stops that.",
  },
  {
    id: "openai",
    label: "OpenAI",
    api: "openai",
    baseUrl: "https://api.openai.com/v1",
    key: "required",
    keyHint: "sk-…",
    link: { url: "https://platform.openai.com/api-keys", label: "Open the OpenAI platform" },
    tagline: "GPT models. Paid by use.",
    free: false,
    context: "large",
    steps: [
      "Press **Open the OpenAI platform** and sign in.",
      "Add a little credit under **Billing**. The API is paid for separately from a ChatGPT subscription.",
      "Press **Create new secret key**, copy it - it starts with *sk-* - paste it below and press **Connect**.",
    ],
    privacy: "Paid per question; one about a small company costs cents. OpenAI does not train on what is sent through its API unless you opt in.",
  },
  {
    id: "anthropic",
    label: "Anthropic Claude",
    api: "anthropic",
    baseUrl: "https://api.anthropic.com/v1",
    key: "required",
    keyHint: "sk-ant-…",
    link: { url: "https://console.anthropic.com/settings/keys", label: "Open the Anthropic Console" },
    tagline: "Claude models. Paid by use.",
    free: false,
    context: "large",
    steps: [
      "Press **Open the Anthropic Console** and sign in.",
      "Add credit under **Billing**. The API is paid for separately from a Claude subscription.",
      "Press **Create Key**, copy it - it starts with *sk-ant-* - paste it below and press **Connect**.",
    ],
    privacy: "Paid per question. Anthropic does not train on what is sent through its API.",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    api: "openai",
    baseUrl: "https://openrouter.ai/api/v1",
    key: "required",
    keyHint: "sk-or-…",
    link: { url: "https://openrouter.ai/keys", label: "Open OpenRouter" },
    tagline: "One key for hundreds of models, some of them free.",
    free: true,
    context: "medium",
    steps: [
      "Press **Open OpenRouter** and sign in.",
      "Press **Create Key**, copy it - it starts with *sk-or-* - paste it below and press **Connect**.",
      "Pick a model. The ones whose names end in *:free* cost nothing; the rest are paid from OpenRouter credit.",
    ],
    privacy:
      "What is sent passes through OpenRouter to the company behind the model you pick. Free models have tight limits, and some of the companies behind them keep what is sent.",
  },
  {
    id: "groq",
    label: "Groq",
    api: "openai",
    baseUrl: "https://api.groq.com/openai/v1",
    key: "required",
    keyHint: "gsk_…",
    link: { url: "https://console.groq.com/keys", label: "Open the Groq console" },
    tagline: "Free and very fast open models.",
    free: true,
    context: "small",
    steps: [
      "Press **Open the Groq console** and sign in.",
      "Press **Create API Key**, copy it - it starts with *gsk_* - paste it below and press **Connect**.",
    ],
    privacy:
      "Free, but the free tier takes only a little per minute, so Caulder sends a short copy of the company. Groq does not train on what is sent.",
  },
  {
    id: "ollama",
    label: "Ollama, on this computer",
    api: "openai",
    baseUrl: "http://localhost:11434/v1",
    key: "none",
    keyHint: "",
    link: { url: "https://ollama.com/download", label: "Download Ollama" },
    tagline: "Free and private: nothing leaves this computer.",
    free: true,
    context: "small",
    steps: [
      "Press **Download Ollama**, install it and open it.",
      "Download a model: in Ollama's window pick one, or in a terminal run *ollama pull llama3.1*.",
      "In Ollama's settings, raise **Context length** as far as the computer allows, so it can read more of the company.",
      "Leave the address below as it is and press **Connect**. No key is needed.",
    ],
    privacy:
      "Everything stays on this computer. Answers are slower and plainer than a hosted model's, and a small model reads only a short copy of the company.",
  },
  {
    id: "custom",
    label: "Another service",
    api: "openai",
    baseUrl: "",
    key: "optional",
    keyHint: "If it needs one",
    link: null,
    tagline: "Mistral, DeepSeek, Together, LM Studio - anything that speaks OpenAI's API.",
    free: false,
    context: "medium",
    steps: [
      "Find the service's OpenAI-compatible address in its documentation. It usually ends in */v1*.",
      "Paste the address below, and its API key if it needs one.",
      "Press **Connect**, then pick a model.",
    ],
    privacy: "Whatever that service's own terms say about what is sent to it.",
  },
] as const satisfies readonly AiService[];

export type AiServiceId = (typeof AI_SERVICES)[number]["id"];

export const DEFAULT_SERVICE: AiServiceId = "gemini";

export function serviceOf(id: unknown): AiService | null {
  return AI_SERVICES.find((service) => service.id === id) ?? null;
}

export function isContextSize(value: unknown): value is ContextSize {
  return typeof value === "string" && (CONTEXT_SIZES as readonly string[]).includes(value);
}

export type AiModelOption = { id: string; label: string };

export type AskState = {
  connected: boolean;
  service: AiServiceId | null;
  /** The address used, which for Ollama or another service may have been changed. */
  baseUrl: string | null;
  /** The key's last four characters, to tell two keys apart. Null when there is no key. */
  last4: string | null;
  model: string | null;
  /** What the service said it offers, when last asked. */
  models: AiModelOption[];
  context: ContextSize;
  /** Whether this machine will encrypt a key at all. */
  canEncrypt: boolean;
};

export const connectInput = z
  .object({
    service: z.string().refine((id) => serviceOf(id) !== null, "Pick a service."),
    key: z
      .string()
      .trim()
      .max(400)
      .refine((key) => !/\s/.test(key), "An API key has no spaces in it.")
      .default(""),
    baseUrl: z.string().trim().max(300).default(""),
  })
  .superRefine((input, context) => {
    const service = serviceOf(input.service);
    if (!service) return;
    if (service.key === "required" && input.key.length < 16) {
      context.addIssue({ code: "custom", path: ["key"], message: `Paste the ${service.label} API key.` });
    }
    const address = input.baseUrl || service.baseUrl;
    if (!/^https?:\/\/[^\s/]+/i.test(address)) {
      context.addIssue({ code: "custom", path: ["baseUrl"], message: "Give the service's address, starting with https://." });
    }
  });
export type ConnectInput = z.input<typeof connectInput>;

export const modelInput = z.string().trim().min(1, "Give the model's name.").max(200);

const turn = z.object({
  role: z.enum(["user", "assistant"]),
  text: z.string().max(40_000),
});
export type AskTurn = z.infer<typeof turn>;

export const askInput = z.object({
  question: z.string().trim().min(1, "Ask something.").max(4000, "Keep the question under 4,000 characters."),
  /** The conversation so far, oldest first, so a follow-up can say "and them?". */
  history: z.array(turn).max(20).default([]),
});
export type AskInput = z.input<typeof askInput>;

/** Something an answer can link to, by the name the documents use. */
export type AskReference = { kind: "page" | "contact"; id: string; name: string };

export type AskAnswer = {
  text: string;
  /** The service's name and the model's, for saying who answered. */
  service: string;
  model: string;
  /** What went with the question. */
  sent: {
    documents: string[];
    characters: number;
    /** How many contacts were written out in full, and how many were left out to fit. */
    contacts: number;
    leftOut: number;
  };
  references: AskReference[];
  usage: { input: number; output: number; cached: number };
};

/* ---- Which model to start on ------------------------------------------- */

function version(id: string, pattern: RegExp): number | null {
  const match = pattern.exec(id);
  return match?.[1] ? Number(match[1]) : null;
}

function newest(ids: readonly string[], pattern: RegExp): string | null {
  let best: { id: string; at: number } | null = null;
  for (const id of ids) {
    const at = version(id, pattern);
    if (at !== null && (best === null || at > best.at)) best = { id, at };
  }
  return best?.id ?? null;
}

/** Model names that are not for answering questions in text. */
const NOT_CHAT =
  /embed|tts|whisper|dall-e|davinci|babbage|moderation|audio|realtime|transcribe|image|imagen|veo|search|computer-use|aqa|guard|learnlm|live|native/i;

/** The models worth listing: the ones that answer in text. */
export function chatModels(ids: readonly string[]): string[] {
  return [...new Set(ids)].filter((id) => !NOT_CHAT.test(id)).sort((a, b) => a.localeCompare(b));
}

/**
 * The model to start on, from what the service offers. Names change every
 * few months, so this reads the list rather than trusting one: Gemini's
 * newest plain Flash (free, and quick), OpenAI's newest flagship GPT, the
 * first Opus Anthropic lists (it lists newest first), a free model on
 * OpenRouter, and otherwise whatever the service lists first.
 */
export function pickModel(serviceId: string, offered: readonly string[]): string | null {
  const ids = chatModels(offered);
  if (ids.length === 0) return null;
  switch (serviceId) {
    case "gemini":
      return (
        newest(ids, /^gemini-(\d+(?:\.\d+)?)-flash$/) ??
        newest(ids, /^gemini-(\d+(?:\.\d+)?)-flash(?!.*(?:lite|exp|thinking))/) ??
        ids.find((id) => id.includes("flash")) ??
        ids[0] ??
        null
      );
    case "openai":
      return newest(ids, /^gpt-(\d+(?:\.\d+)?)$/) ?? newest(ids, /^gpt-(\d+(?:\.\d+)?)o?$/) ?? newest(ids, /^gpt-(\d+(?:\.\d+)?)-mini$/) ?? ids[0] ?? null;
    case "anthropic":
      return offered.find((id) => id.includes("opus")) ?? offered[0] ?? null;
    case "openrouter":
      return (
        ids.find((id) => /gemini.*flash.*:free$/.test(id)) ??
        ids.find((id) => id.endsWith(":free")) ??
        ids[0] ??
        null
      );
    case "groq":
      return ids.find((id) => /llama-3\.3-70b/.test(id)) ?? ids.find((id) => /70b/.test(id)) ?? ids[0] ?? null;
    default:
      return ids[0] ?? null;
  }
}

/**
 * An answer's `[[Name]]` as links the page can open, for the names it knows:
 * `[[Oakridge]]` becomes `[[Oakridge|contact:…]]`, which the brain's Markdown
 * draws as a chip. A name it does not know stays as words.
 */
export function linkAnswer(text: string, references: readonly AskReference[]): string {
  const byName = new Map<string, AskReference>();
  // Pages last, so a page and a contact with one name open the page.
  for (const reference of [...references].sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "page" ? 1 : -1))) {
    byName.set(reference.name.trim().toLowerCase(), reference);
  }
  return text.replace(/\[\[([^[\]|\n]{1,160})\]\]/g, (_whole, name: string) => {
    const found = byName.get(name.trim().toLowerCase());
    return found ? `[[${found.name}|${found.kind}:${found.id}]]` : name.trim();
  });
}
