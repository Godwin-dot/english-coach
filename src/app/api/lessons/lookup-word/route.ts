import { NextRequest, NextResponse } from "next/server";
import { LookupWordInputSchema, KeywordItemSchema } from "@/schemas/lesson";
import { getLLMProvider } from "@/llm/provider";
import { wordLookupPrompts } from "@/llm/prompts/word";
import {
  getErrorMessage,
  MissingApiKeyError,
  MissingModelError,
} from "@/llm/errors";

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Le corps de la requête doit être un JSON valide." },
      { status: 400 },
    );
  }

  const parsed = LookupWordInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Mot ou contexte invalide.", details: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const prompts = wordLookupPrompts(
      parsed.data.word,
      parsed.data.contextSentence,
      parsed.data.cefrLevel,
    );
    const keyword = await getLLMProvider().generateStructuredJSON(
      prompts.systemPrompt,
      prompts.userPrompt,
      KeywordItemSchema,
    );
    return NextResponse.json(keyword, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const status =
      error instanceof MissingApiKeyError || error instanceof MissingModelError
        ? 400
        : 502;
    return NextResponse.json(
      {
        error: getErrorMessage(error),
        ...(error instanceof MissingApiKeyError
          ? { code: error.code }
          : error instanceof MissingModelError
            ? { code: error.code }
            : { code: "WORD_LOOKUP_FAILED" }),
      },
      { status },
    );
  }
}
