import { NextRequest, NextResponse } from "next/server";
import { generateTargetedMistakeQuiz, NoRelevantMistakesError } from "@/domain/mistakes";
import {
  getErrorMessage,
  MissingApiKeyError,
  MissingModelError,
} from "@/llm/errors";
import { GenerateMistakeQuizInputSchema } from "@/schemas/mistakes";

export const dynamic = "force-dynamic";

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

  const parsed = GenerateMistakeQuizInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "La catégorie demandée est invalide.", details: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const category = parsed.data.category?.trim() || undefined;
    return NextResponse.json(await generateTargetedMistakeQuiz(category), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof NoRelevantMistakesError || error instanceof MissingApiKeyError || error instanceof MissingModelError) {
      return NextResponse.json(
        { error: getErrorMessage(error) },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: getErrorMessage(error) },
      { status: 502 },
    );
  }
}
