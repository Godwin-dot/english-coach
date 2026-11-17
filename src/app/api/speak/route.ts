import { NextRequest, NextResponse } from "next/server";
import {
  generatePronunciationPrompt,
  recordPronunciationAttempt,
} from "@/domain/speak";
import { SpeakActionInputSchema } from "@/schemas/speak";

export const runtime = "nodejs";
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

  const parsed = SpeakActionInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "La requête de prononciation est invalide.", details: parsed.error.issues },
      { status: 400 },
    );
  }

  if (parsed.data.action === "record") {
    try {
      recordPronunciationAttempt(parsed.data);
      return NextResponse.json({ ok: true });
    } catch (error) {
      console.error("Pronunciation attempt recording failed.", error);
      return NextResponse.json(
        { error: "Impossible d’enregistrer cette tentative." },
        { status: 500 },
      );
    }
  }

  try {
    const exercise = await generatePronunciationPrompt(parsed.data);
    return NextResponse.json(
      { exercise },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Pronunciation exercise generation failed.", error);
    return NextResponse.json(
      { error: "Impossible de préparer un exercice de prononciation." },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
