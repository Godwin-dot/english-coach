import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  LessonNotFoundError,
  markLessonCompleted,
} from "@/domain/lessons";

const CompleteLessonInputSchema = z.object({
  score: z.number().min(0).max(10),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: idParam } = await params;
  const lessonId = Number(idParam);
  if (!Number.isSafeInteger(lessonId) || lessonId < 1) {
    return NextResponse.json({ error: "Identifiant de leçon invalide." }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Le corps de la requête doit être un JSON valide." },
      { status: 400 },
    );
  }

  const parsed = CompleteLessonInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Le score doit être compris entre 0 et 10." },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json(
      markLessonCompleted(lessonId, parsed.data.score),
    );
  } catch (error) {
    if (error instanceof LessonNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    throw error;
  }
}
