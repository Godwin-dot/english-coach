import { NextResponse } from "next/server";
import { z } from "zod";
import { getLLMProvider } from "@/llm/provider";
import {
  LLMProviderError,
  MissingApiKeyError,
  MissingModelError,
} from "@/llm/errors";

const TestResponseSchema = z.object({ ok: z.literal(true) });

export async function POST() {
  try {
    const provider = getLLMProvider();
    await provider.generateStructuredJSON(
      "Return a small JSON object with the boolean property ok set to true.",
      "Return exactly {\"ok\":true}.",
      TestResponseSchema,
    );
    return NextResponse.json(
      { ok: true, provider: provider.provider, model: provider.model },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message =
      error instanceof MissingApiKeyError || error instanceof MissingModelError
        ? error.message
        : error instanceof LLMProviderError
          ? error.message
          : "Le test de connexion a échoué.";
    const status =
      error instanceof MissingApiKeyError || error instanceof MissingModelError
        ? 400
        : 502;
    return NextResponse.json(
      {
        ok: false,
        error: message,
        ...(error instanceof MissingApiKeyError
          ? { code: error.code }
          : error instanceof MissingModelError
            ? { code: error.code }
            : error instanceof LLMProviderError
              ? { code: error.code, status: error.status }
              : {}),
      },
      { status, headers: { "Cache-Control": "no-store" } },
    );
  }
}
