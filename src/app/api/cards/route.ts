import { NextRequest, NextResponse } from "next/server";
import {
  addCardFromLesson,
  SourceLessonNotFoundError,
} from "@/domain/cards";
import { CreateCardInputSchema } from "@/schemas/card";

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

  const parsed = CreateCardInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Les informations de la carte sont invalides.", details: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const result = addCardFromLesson(parsed.data);
    if (result.status === "created") {
      return NextResponse.json(result, { status: 201 });
    }
    if (result.status === "daily_cap_reached") {
      return NextResponse.json(result, { status: 429 });
    }
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof SourceLessonNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    throw error;
  }
}
