import { NextRequest, NextResponse } from "next/server";
import { generateNewVocabBatch } from "@/domain/cards";
import {
  getErrorMessage,
  MissingApiKeyError,
  MissingModelError,
} from "@/llm/errors";
import { DiscoverVocabRequestSchema } from "@/schemas/card";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  let body: unknown = {};
  const rawBody = await request.text();
  if (rawBody.trim()) {
    try {
      body = JSON.parse(rawBody) as unknown;
    } catch {
      return NextResponse.json(
        { error: "Le corps de la requête doit être un JSON valide." },
        { status: 400 },
      );
    }
  }

  const parsed = DiscoverVocabRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "La liste de mots à exclure est invalide.", details: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const cards = await generateNewVocabBatch(
      parsed.data.count ?? 6,
      parsed.data.excludeTerms,
    );
    return NextResponse.json(
      { cards },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const status =
      error instanceof MissingApiKeyError || error instanceof MissingModelError
        ? 400
        : 502;
    return NextResponse.json(
      { error: getErrorMessage(error) },
      { status, headers: { "Cache-Control": "no-store" } },
    );
  }
}
