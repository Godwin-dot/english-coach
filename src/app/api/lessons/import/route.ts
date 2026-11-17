import { NextRequest, NextResponse } from "next/server";
import { importCustomLesson } from "@/domain/lessons";
import { getErrorMessage, MissingApiKeyError, MissingModelError } from "@/llm/errors";
import { ImportLessonInputSchema } from "@/schemas/lesson";

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

  const parsed = ImportLessonInputSchema.safeParse(body);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return NextResponse.json(
      {
        error: firstIssue?.message ?? "Le texte importé est invalide.",
        details: parsed.error.issues,
      },
      { status: 400 },
    );
  }

  try {
    const lesson = await importCustomLesson(parsed.data);
    return NextResponse.json({ lesson }, { status: 201 });
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
