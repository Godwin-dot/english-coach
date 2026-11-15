import { z } from "zod";
import type { LLMProviderName } from "@/domain/llm-config";
import { LLMProviderError } from "./errors";
import { getHttpStatus, parseStructuredResponse } from "./response";
import type { LLMProvider } from "./provider";

const OpenRouterResponseSchema = z.object({
  choices: z.array(
    z.object({
      message: z.object({
        content: z.string(),
      }),
    }),
  ),
});

export class OpenRouterProvider implements LLMProvider {
  readonly provider: LLMProviderName = "openrouter";

  constructor(
    private readonly apiKey: string,
    readonly model: string,
  ) {}

  async generateStructuredJSON<T>(
    systemPrompt: string,
    userPrompt: string,
    schema: z.ZodType<T>,
  ): Promise<T> {
    let response: Response;
    try {
      response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          "X-Title": "English Coach",
          ...(process.env.OPENROUTER_SITE_URL
            ? { "HTTP-Referer": process.env.OPENROUTER_SITE_URL }
            : {}),
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          response_format: { type: "json_object" },
        }),
        signal: AbortSignal.timeout(45_000),
      });
    } catch (error) {
      const retryableNetworkError =
        error instanceof TypeError ||
        (error instanceof Error &&
          ["AbortError", "TimeoutError"].includes(error.name));
      throw new LLMProviderError("Impossible de joindre OpenRouter.", {
        retryable: retryableNetworkError,
        cause: error,
      });
    }

    if (!response.ok) {
      const status = response.status;
      const responseBody = await response.text();
      let apiMessage = responseBody;
      try {
        const body: unknown = JSON.parse(responseBody);
        if (typeof body === "object" && body !== null && "error" in body) {
          const apiError = body.error;
          if (typeof apiError === "string") {
            apiMessage = apiError;
          } else if (
            typeof apiError === "object" &&
            apiError !== null &&
            "message" in apiError &&
            typeof apiError.message === "string"
          ) {
            apiMessage = apiError.message;
          }
        }
      } catch {
        // Keep the response body as the diagnostic when it is not JSON.
      }
      throw new LLMProviderError(
        `OpenRouter a répondu avec le statut HTTP ${status}${apiMessage ? ` : ${apiMessage}` : "."}`,
        { status, retryable: status === 429 || status >= 500 },
      );
    }

    let responseJson: unknown;
    try {
      responseJson = await response.json();
    } catch (error) {
      throw new LLMProviderError("OpenRouter a renvoyé une réponse invalide.", {
        cause: error,
      });
    }

    const parsedResponse = OpenRouterResponseSchema.safeParse(responseJson);
    if (!parsedResponse.success) {
      throw new LLMProviderError("OpenRouter a renvoyé un résultat vide.", {
        cause: parsedResponse.error,
      });
    }

    return parseStructuredResponse(
      parsedResponse.data.choices[0]?.message.content ?? "",
      schema,
    );
  }
}
