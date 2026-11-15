import { inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { settings } from "@/db/schema";

export const LLMProviderNameSchema = z.enum(["gemini", "openrouter"]);
export type LLMProviderName = z.infer<typeof LLMProviderNameSchema>;

const SaveLLMConfigSchema = z.object({
  provider: LLMProviderNameSchema,
  model: z.string().trim().max(160).optional(),
  openrouterModel: z.string().trim().max(200).optional(),
  geminiApiKey: z.string().trim().max(1000).optional(),
  openrouterApiKey: z.string().trim().max(1000).optional(),
});

export type SaveLLMConfigInput = z.infer<typeof SaveLLMConfigSchema>;

export type ResolvedLLMConfig = {
  provider: LLMProviderName;
  model: string;
  openrouterModel: string;
  geminiApiKey: string;
  openrouterApiKey: string;
};

export type PublicLLMConfig = {
  provider: LLMProviderName;
  model: string;
  openrouterModel: string;
  hasGeminiKey: boolean;
  geminiKeyMask: string | null;
  hasOpenrouterKey: boolean;
  openrouterKeyMask: string | null;
};

function readSettingValue(
  values: Map<string, string>,
  key: string,
): unknown | undefined {
  const rawValue = values.get(key);
  return rawValue === undefined ? undefined : JSON.parse(rawValue);
}

function readStringSetting(
  values: Map<string, string>,
  key: string,
  fallback: string,
): string {
  const storedValue = readSettingValue(values, key);
  if (storedValue === undefined || storedValue === "") {
    return fallback;
  }
  if (typeof storedValue !== "string") {
    throw new Error(`The ${key} setting must be a string.`);
  }
  return storedValue;
}

function maskApiKey(apiKey: string): string | null {
  if (!apiKey) {
    return null;
  }
  if (apiKey.length <= 7) {
    return "••••";
  }
  return `${apiKey.slice(0, 4)}••••${apiKey.slice(-3)}`;
}

function getStoredSettings(): Map<string, string> {
  return new Map(
    db
      .select()
      .from(settings)
      .where(
        inArray(settings.key, [
          "llm_provider",
          "llm_model",
          "gemini_api_key",
          "openrouter_api_key",
          "openrouter_model",
        ]),
      )
      .all()
      .map(({ key, value }) => [key, value]),
  );
}

export function getResolvedLLMConfig(): ResolvedLLMConfig {
  const values = getStoredSettings();
  const storedProvider = readSettingValue(values, "llm_provider");
  const envProvider = process.env.LLM_PROVIDER;
  const providerCandidate = storedProvider || envProvider || "gemini";
  const provider = LLMProviderNameSchema.parse(providerCandidate);

  return {
    provider,
    model: readStringSetting(
      values,
      "llm_model",
      process.env.LLM_MODEL ?? "",
    ),
    openrouterModel: readStringSetting(
      values,
      "openrouter_model",
      process.env.OPENROUTER_MODEL ?? "",
    ),
    geminiApiKey: readStringSetting(
      values,
      "gemini_api_key",
      process.env.GEMINI_API_KEY ?? "",
    ),
    openrouterApiKey: readStringSetting(
      values,
      "openrouter_api_key",
      process.env.OPENROUTER_API_KEY ?? "",
    ),
  };
}

export function getPublicLLMConfig(): PublicLLMConfig {
  const config = getResolvedLLMConfig();

  return {
    provider: config.provider,
    model: config.model,
    openrouterModel: config.openrouterModel,
    hasGeminiKey: Boolean(config.geminiApiKey),
    geminiKeyMask: maskApiKey(config.geminiApiKey),
    hasOpenrouterKey: Boolean(config.openrouterApiKey),
    openrouterKeyMask: maskApiKey(config.openrouterApiKey),
  };
}

export function saveLLMConfig(input: unknown): PublicLLMConfig {
  const parsed = SaveLLMConfigSchema.parse(input);
  const current = getResolvedLLMConfig();
  const publicConfig = getPublicLLMConfig();
  const settingsToSave: Array<[string, string]> = [
    ["llm_provider", JSON.stringify(parsed.provider)],
  ];

  if (parsed.model) {
    settingsToSave.push(["llm_model", JSON.stringify(parsed.model)]);
  }
  if (parsed.openrouterModel) {
    settingsToSave.push([
      "openrouter_model",
      JSON.stringify(parsed.openrouterModel),
    ]);
  }

  if (
    parsed.geminiApiKey &&
    parsed.geminiApiKey !== current.geminiApiKey &&
    parsed.geminiApiKey !== publicConfig.geminiKeyMask
  ) {
    settingsToSave.push([
      "gemini_api_key",
      JSON.stringify(parsed.geminiApiKey),
    ]);
  }
  if (
    parsed.openrouterApiKey &&
    parsed.openrouterApiKey !== current.openrouterApiKey &&
    parsed.openrouterApiKey !== publicConfig.openrouterKeyMask
  ) {
    settingsToSave.push([
      "openrouter_api_key",
      JSON.stringify(parsed.openrouterApiKey),
    ]);
  }

  db.transaction((transaction) => {
    for (const [key, value] of settingsToSave) {
      transaction
        .insert(settings)
        .values({ key, value })
        .onConflictDoUpdate({
          target: settings.key,
          set: { value },
        })
        .run();
    }
  });

  return getPublicLLMConfig();
}

export function getActiveLLMModel(config = getResolvedLLMConfig()): string {
  return config.provider === "gemini" ? config.model : config.openrouterModel;
}

export function hasAnyLLMApiKey(config = getResolvedLLMConfig()): boolean {
  return Boolean(config.geminiApiKey || config.openrouterApiKey);
}
