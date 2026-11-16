import { NextRequest, NextResponse } from "next/server";
import { recordMistakeQuizCompletion } from "@/domain/mistakes";
import { CompleteMistakeQuizInputSchema } from "@/schemas/mistakes";

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

  const parsed = CompleteMistakeQuizInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Le résultat du mini-quiz est invalide.", details: parsed.error.issues },
      { status: 400 },
    );
  }

  recordMistakeQuizCompletion(parsed.data);
  return NextResponse.json({ saved: true });
}
