import { NextRequest, NextResponse } from "next/server";
import { evaluateAndSaveDrill } from "@/domain/drill";
import {
  getErrorMessage,
  MissingApiKeyError,
  MissingModelError,
} from "@/llm/errors";
import { EvaluateDrillInputSchema } from "@/schemas/drill";

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

  const parsed = EvaluateDrillInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "La traduction est invalide.", details: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json(await evaluateAndSaveDrill(parsed.data), {
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
