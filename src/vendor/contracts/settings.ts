import { z } from "zod";

export const LLMSettings = z.object({
  provider: z.enum(["openrouter", "anthropic", "openai"]).default("openrouter"),
  keySource: z.enum(["platform", "user"]).default("platform"),
  codingModel: z.string(),
  visionModel: z.string(),
});
export const SpeechSettings = z.object({
  provider: z.literal("sarvam").default("sarvam"),
  sttModel: z.string().default("saaras:v4"),
  ttsModel: z.string().default("bulbul:v3"),
  ttsEnabled: z.boolean().default(false),
});
export const UserSettings = z.object({ llm: LLMSettings, speech: SpeechSettings });
export type UserSettings = z.infer<typeof UserSettings>;

/** Normalised model catalog entry (from OpenRouter or Sarvam). */
export const ModelInfo = z.object({
  id: z.string(),
  name: z.string(),
  provider: z.string(),
  contextLength: z.number().nullable(),
  inputModalities: z.array(z.string()),
  supportsTools: z.boolean(),
  /** USD per 1M tokens */
  promptUsdPerM: z.number().nullable(),
  completionUsdPerM: z.number().nullable(),
  recommended: z.boolean().default(false),
});
export type ModelInfo = z.infer<typeof ModelInfo>;
