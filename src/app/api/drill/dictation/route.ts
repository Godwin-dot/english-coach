import { NextRequest, NextResponse } from "next/server";
import {
  generateDictationExercise,
  recordDictationResult,
} from "@/domain/drill";
import {
  getErrorMessage,
  MissingApiKeyError,
  MissingModelError,
} from "@/llm/errors";
import { DictationActionInputSchema } from "@/schemas/drill";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

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

  const parsed = DictationActionInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "La requête de dictée est invalide.", details: parsed.error.issues },
      { status: 400 },
    );
  }

  if (parsed.data.action === "record") {
    const recentMistakes = recordDictationResult(parsed.data);
    return NextResponse.json(
      { ok: true, recentMistakes },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const exercise = await generateDictationExercise(parsed.data);
    return NextResponse.json(
      { exercise },
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
