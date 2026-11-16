import { NextRequest, NextResponse } from "next/server";
import { processChatTurn } from "@/domain/chat";
import {
  getErrorMessage,
  MissingApiKeyError,
  MissingModelError,
} from "@/llm/errors";
import { ChatTurnInputSchema } from "@/schemas/chat";

export const dynamic = "force-dynamic";

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

  const parsed = ChatTurnInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Le tour de conversation est invalide.", details: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json(await processChatTurn(parsed.data), {
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
