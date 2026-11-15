import { z } from "zod";
import { LLMProviderError } from "./errors";

export function parseStructuredResponse<T>(
  responseText: string,
  schema: z.ZodType<T>,
): T {
  const jsonText = responseText
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(jsonText);
  } catch (error) {
    throw new LLMProviderError("Le fournisseur a renvoyé un JSON invalide.", {
      cause: error,
    });
  }

  const validation = schema.safeParse(parsedJson);
  if (!validation.success) {
    throw new LLMProviderError(
      "La réponse du fournisseur ne respecte pas le format attendu.",
      { cause: validation.error },
    );
  }

  return validation.data;
}

export function getHttpStatus(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null || !("status" in error)) {
    return undefined;
  }

  const status = error.status;
  return typeof status === "number" ? status : undefined;
}
