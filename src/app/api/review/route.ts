import { NextRequest, NextResponse } from "next/server";
import {
  CardNotFoundError,
  getRemainingDueCards,
  getDueCards,
  InvalidDiscoveredVocabError,
  saveAndGradeDiscoveredCard,
  submitCardReview,
} from "@/domain/cards";
import { SubmitReviewInputSchema } from "@/schemas/card";

export const dynamic = "force-dynamic";

export function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  if (
    searchParams.get("mode") === "due" ||
    searchParams.get("mode") === "continuous"
  ) {
    const rawExcludedIds = searchParams.get("excludeIds") ?? "";
    const excludedIds = rawExcludedIds
      ? rawExcludedIds.split(",").map((value) => Number(value))
      : [];
    if (
      excludedIds.length > 5000 ||
      excludedIds.some((id) => !Number.isSafeInteger(id) || id < 1)
    ) {
      return NextResponse.json(
        { error: "La liste des cartes exclues est invalide." },
        { status: 400 },
      );
    }

    return NextResponse.json(
      getRemainingDueCards(excludedIds),
      { headers: { "Cache-Control": "no-store" } },
    );
  }

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
    if ("discoveryCard" in parsed.data) {
      return NextResponse.json(
        saveAndGradeDiscoveredCard({
          ...parsed.data.discoveryCard,
          rating: parsed.data.rating,
          durationS: parsed.data.duration_s,
        }),
      );
    }

    return NextResponse.json(
      submitCardReview(
        parsed.data.cardId,
        parsed.data.rating,
        parsed.data.duration_s,
        parsed.data.mode,
      ),
    );
  } catch (error) {
    if (error instanceof CardNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof InvalidDiscoveredVocabError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
