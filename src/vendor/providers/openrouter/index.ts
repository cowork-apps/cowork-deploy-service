import type { ModelInfo } from "../../contracts/index.js";
import { json } from "../http.js";
import type { LLMProvider } from "../interfaces.js";

const RECOMMENDED_CODING = ["anthropic/claude-opus-5", "anthropic/claude-sonnet-5", "openai/gpt-6-astra", "google/gemini-3.8-pro", "deepseek/deepseek-v4-flash-0731"];
const RECOMMENDED_VISION = ["google/gemini-3.8-flash", "anthropic/claude-sonnet-5", "openai/gpt-6-astra"];

export class OpenRouterLLM implements LLMProvider {
  id = "openrouter" as const;
  baseUrl = "https://openrouter.ai/api/v1";
  constructor(private apiKey?: string) {}

  async listModels(): Promise<ModelInfo[]> {
    const r = await json<{ data: any[] }>(`${this.baseUrl}/models`, { token: this.apiKey });
    return r.data.map((m) => ({
      id: m.id, name: m.name ?? m.id, provider: "openrouter",
      contextLength: m.context_length ?? null,
      inputModalities: m.architecture?.input_modalities ?? ["text"],
      supportsTools: (m.supported_parameters ?? []).includes("tools"),
      promptUsdPerM: m.pricing?.prompt != null ? Number(m.pricing.prompt) * 1e6 : null,
      completionUsdPerM: m.pricing?.completion != null ? Number(m.pricing.completion) * 1e6 : null,
      recommended: false,
    }));
  }

  static codingModels(all: ModelInfo[]) {
    return rank(all.filter((m) => m.supportsTools && m.inputModalities.includes("text")), RECOMMENDED_CODING);
  }
  static visionModels(all: ModelInfo[]) {
    return rank(all.filter((m) => m.inputModalities.includes("image")), RECOMMENDED_VISION);
  }
}

function rank(list: ModelInfo[], recommended: string[]) {
  const idx = (id: string) => { const i = recommended.indexOf(id); return i === -1 ? 1e9 : i; };
  return list.map((m) => ({ ...m, recommended: recommended.includes(m.id) }))
    .sort((a, b) => idx(a.id) - idx(b.id) || a.name.localeCompare(b.name));
}
