import { describe, expect, it } from "vitest";
import { AI_SERVICES, chatModels, connectInput, linkAnswer, pickModel, serviceOf } from "./ask";
import { parseLinks } from "./links";

describe("an answer's links", () => {
  const C1 = "11111111-1111-4111-8111-111111111111";
  const C2 = "22222222-2222-4222-8222-222222222222";
  const P1 = "33333333-3333-4333-8333-333333333333";
  const references = [
    { kind: "contact" as const, id: C1, name: "Oakridge" },
    { kind: "page" as const, id: P1, name: "Pricing" },
    { kind: "contact" as const, id: C2, name: "Pricing" },
  ];

  it("become links for the names Caulder knows, a page before a contact, and words otherwise", () => {
    const linked = linkAnswer("Call [[oakridge]] about [[Pricing]], not [[Nobody]].", references);
    expect(linked).toBe(`Call [[Oakridge|contact:${C1}]] about [[Pricing|page:${P1}]], not Nobody.`);
    expect(parseLinks(linked).map((link) => [link.kind, link.id])).toEqual([
      ["contact", C1],
      ["page", P1],
    ]);
  });

  it("leaves a link that already says where it goes alone", () => {
    expect(linkAnswer(`See [[Pricing|page:${P1}]].`, references)).toBe(`See [[Pricing|page:${P1}]].`);
  });
});

describe("the services", () => {
  it("start with free Gemini, and each says how to connect it and what happens to what is sent", () => {
    expect(AI_SERVICES[0]?.id).toBe("gemini");
    for (const service of AI_SERVICES) {
      expect(service.steps.length, service.id).toBeGreaterThanOrEqual(2);
      expect(service.privacy.length, service.id).toBeGreaterThan(20);
      if (service.id !== "custom") expect(service.baseUrl, service.id).toMatch(/^https?:\/\//);
    }
    expect(serviceOf("ollama")).toMatchObject({ key: "none", free: true });
    expect(serviceOf("nope")).toBeNull();
  });

  it("need a key where the service does, and an address for another service", () => {
    expect(connectInput.parse({ service: "ollama" })).toEqual({ service: "ollama", key: "", baseUrl: "" });
    expect(() => connectInput.parse({ service: "openai", key: "sk-1" })).toThrow("Paste the OpenAI API key");
    expect(connectInput.parse({ service: "custom", baseUrl: "https://api.mistral.ai/v1" }).baseUrl).toBe(
      "https://api.mistral.ai/v1",
    );
    expect(() => connectInput.parse({ service: "custom", baseUrl: "api.mistral.ai" })).toThrow("https://");
  });
});

describe("which model to start on", () => {
  it("lists only models that answer in text", () => {
    expect(chatModels(["gpt-5", "text-embedding-3-large", "tts-1", "dall-e-3", "gpt-5", "gpt-realtime"])).toEqual(["gpt-5"]);
  });

  it("picks Gemini's newest plain Flash, whatever it is called this year", () => {
    expect(pickModel("gemini", ["gemini-2.0-flash", "gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.5-flash-lite"])).toBe(
      "gemini-2.5-flash",
    );
    expect(pickModel("gemini", ["gemini-2.5-flash", "gemini-3-flash", "gemini-3-pro"])).toBe("gemini-3-flash");
    expect(pickModel("gemini", ["gemini-3-flash-preview", "gemini-3-pro-preview"])).toBe("gemini-3-flash-preview");
  });

  it("picks the flagship for paid services, a free one on OpenRouter, and the first otherwise", () => {
    expect(pickModel("openai", ["gpt-4o", "gpt-4.1", "gpt-5-mini", "gpt-5"])).toBe("gpt-5");
    expect(pickModel("openai", ["gpt-4o-mini", "gpt-4o"])).toBe("gpt-4o");
    expect(pickModel("anthropic", ["claude-sonnet-5", "claude-opus-5", "claude-haiku-4-5-20251001"])).toBe("claude-opus-5");
    expect(pickModel("openrouter", ["anthropic/claude-opus-5", "meta-llama/llama-3.3-70b:free", "google/gemini-2.5-flash:free"])).toBe(
      "google/gemini-2.5-flash:free",
    );
    expect(pickModel("groq", ["gemma2-9b-it", "llama-3.3-70b-versatile"])).toBe("llama-3.3-70b-versatile");
    expect(pickModel("ollama", ["qwen3:14b", "llama3.1:8b"])).toBe("llama3.1:8b");
    expect(pickModel("custom", [])).toBeNull();
  });
});
