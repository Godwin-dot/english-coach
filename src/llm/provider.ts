import { z } from "zod";
import {
  getActiveLLMModel,
  getResolvedLLMConfig,
  type LLMProviderName,
} from "@/domain/llm-config";
import {
  LLMProviderError,
  MissingApiKeyError,
  MissingModelError,
} from "./errors";
import { GeminiProvider } from "./gemini";
import { OpenRouterProvider } from "./openrouter";

export interface LLMProvider {
  readonly provider: LLMProviderName;
  readonly model: string;
  generateStructuredJSON<T>(
    systemPrompt: string,
    userPrompt: string,
    schema: z.ZodType<T>,
  ): Promise<T>;
}

class ResilientLLMProvider implements LLMProvider {
  private activeProvider: LLMProvider;

  constructor(
    private readonly primaryProvider: LLMProvider,
    private readonly fallbackProvider?: LLMProvider,
  ) {
    this.activeProvider = primaryProvider;
  }

  get provider(): LLMProviderName {
    return this.activeProvider.provider;
  }

  get model(): string {
    return this.activeProvider.model;
  }

  async generateStructuredJSON<T>(
    systemPrompt: string,
    userPrompt: string,
    schema: z.ZodType<T>,
  ): Promise<T> {
    try {
      return await this.primaryProvider.generateStructuredJSON(
        systemPrompt,
        userPrompt,
        schema,
      );
    } catch (error) {
      if (
        !this.fallbackProvider ||
        !(error instanceof LLMProviderError) ||
        !error.retryable
      ) {
        throw error;
      }

      this.activeProvider = this.fallbackProvider;
      return this.fallbackProvider.generateStructuredJSON(
        systemPrompt,
        userPrompt,
        schema,
      );
    }
  }
}

export function getLLMProvider(): LLMProvider {
  const config = getResolvedLLMConfig();
  if (!config.geminiApiKey && !config.openrouterApiKey) {
    throw new MissingApiKeyError();
  }

  if (config.provider === "gemini") {
    if (!config.geminiApiKey) {
      if (!config.openrouterApiKey) {
        throw new MissingApiKeyError();
      }
      if (!config.openrouterModel) {
        throw new MissingModelError();
      }
      return new OpenRouterProvider(
        config.openrouterApiKey,
        config.openrouterModel,
      );
    }

    if (!config.model) {
      throw new MissingModelError();
    }

    const gemini = new GeminiProvider(config.geminiApiKey, config.model);
    const openrouter = config.openrouterApiKey
      ? config.openrouterModel
        ? new OpenRouterProvider(config.openrouterApiKey, config.openrouterModel)
        : undefined
      : undefined;
    return new ResilientLLMProvider(gemini, openrouter);
  }

  if (!config.openrouterApiKey) {
    throw new MissingApiKeyError(
      "Le fournisseur OpenRouter est sélectionné, mais sa clé API est manquante.",
    );
  }

  if (!config.openrouterModel) {
    throw new MissingModelError();
  }

  return new ResilientLLMProvider(
    new OpenRouterProvider(config.openrouterApiKey, getActiveLLMModel(config)),
  );
}
