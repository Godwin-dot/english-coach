import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import type { LLMProviderName } from "@/domain/llm-config";
import { LLMProviderError } from "./errors";
import { getHttpStatus, parseStructuredResponse } from "./response";
import type { LLMProvider } from "./provider";

export class GeminiProvider implements LLMProvider {
  readonly provider: LLMProviderName = "gemini";
  private readonly client: GoogleGenAI;

  constructor(
    private readonly apiKey: string,
    readonly model: string,
  ) {
    this.client = new GoogleGenAI({ apiKey });
  }

  async generateStructuredJSON<T>(
    systemPrompt: string,
    userPrompt: string,
    schema: z.ZodType<T>,
  ): Promise<T> {
    let response;
    try {
      response = await this.client.models.generateContent({
        model: this.model,
        contents: userPrompt,
        config: {
          systemInstruction: systemPrompt,
          responseMimeType: "application/json",
        },
      });
    } catch (error) {
      const status = getHttpStatus(error);
      throw new LLMProviderError(
        status
          ? `Gemini a répondu avec le statut HTTP ${status}.`
          : "Impossible de joindre Gemini.",
        {
          status,
          retryable:
            status === 429 ||
            (status !== undefined && status >= 500) ||
            error instanceof TypeError,
          cause: error,
        },
      );
    }

    const responseText = response.text;
    if (!responseText) {
      throw new LLMProviderError("Gemini a renvoyé une réponse vide.");
    }

    return parseStructuredResponse(responseText, schema);
  }
}
