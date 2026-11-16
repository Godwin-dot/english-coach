import { NextRequest, NextResponse } from "next/server";
import { closeChatSession } from "@/domain/chat";
import { getErrorMessage } from "@/llm/errors";
import { ChatCloseSessionInputSchema } from "@/schemas/chat";

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

  const parsed = ChatCloseSessionInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "La clôture de la conversation est invalide.", details: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    closeChatSession(parsed.data);
    return NextResponse.json(
      { success: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: getErrorMessage(error) },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
