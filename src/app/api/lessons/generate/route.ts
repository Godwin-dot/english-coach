import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { createAndSaveLesson } from "@/domain/lessons";
import { GenerateLessonInputSchema } from "@/schemas/lesson";
import { getErrorMessage, MissingApiKeyError, MissingModelError } from "@/llm/errors";

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

  const parsed = GenerateLessonInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Thème ou niveau invalide.", details: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const lesson = await createAndSaveLesson(
      parsed.data.topic,
      parsed.data.cefrLevel,
    );
    return NextResponse.json(lesson, { status: 201 });
  } catch (error) {
    if (
      error instanceof MissingApiKeyError ||
      error instanceof MissingModelError
    ) {
      return NextResponse.json(
        { error: getErrorMessage(error), code: error.code },
        { status: 400 },
      );
    }
    return NextResponse.json(
      { error: getErrorMessage(error), code: "LLM_GENERATION_FAILED" },
      { status: 502 },
    );
  }
}
