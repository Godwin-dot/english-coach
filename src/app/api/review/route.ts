import { NextRequest, NextResponse } from "next/server";
import {
  CardNotFoundError,
  getDueCards,
  submitCardReview,
} from "@/domain/cards";
import { SubmitReviewInputSchema } from "@/schemas/card";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(getDueCards(), {
    headers: { "Cache-Control": "no-store" },
  });
}

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

  const parsed = SubmitReviewInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "La note ou l’identifiant de la carte est invalide.", details: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json(
      submitCardReview(
        parsed.data.cardId,
        parsed.data.rating,
        parsed.data.duration_s,
      ),
    );
  } catch (error) {
    if (error instanceof CardNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    throw error;
  }
}
