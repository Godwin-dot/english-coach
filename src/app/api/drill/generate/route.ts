import { NextRequest, NextResponse } from "next/server";
import { generateDrillExercise } from "@/domain/drill";
import {
  getErrorMessage,
  MissingApiKeyError,
  MissingModelError,
} from "@/llm/errors";
import { GenerateDrillInputSchema } from "@/schemas/drill";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  let body: unknown = {};
  const rawBody = await request.text();
  if (rawBody.trim()) {
    try {
      body = JSON.parse(rawBody) as unknown;
    } catch {
      return NextResponse.json(
        { error: "Le corps de la requête doit être un JSON valide." },
        { status: 400 },
      );
    }
  }
  const parsed = GenerateDrillInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Le thème ou le niveau CEFR est invalide.", details: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json(await generateDrillExercise(parsed.data), {
      headers: { "Cache-Control": "no-store" },
    });
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
