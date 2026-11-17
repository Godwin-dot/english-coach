import { NextRequest, NextResponse } from "next/server";
import { deleteChatSession, getChatSessionById } from "@/domain/chat";
import { z } from "zod";

export const dynamic = "force-dynamic";

const sessionIdSchema = z.string().uuid();

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const parsedId = sessionIdSchema.safeParse(id);
  if (!parsedId.success) {
    return NextResponse.json(
      { error: "L’identifiant de conversation est invalide." },
      { status: 400 },
    );
  }

  try {
    const result = getChatSessionById(parsedId.data);
    if (!result) {
      return NextResponse.json(
        { error: "Cette conversation est introuvable." },
        { status: 404 },
      );
    }
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Chat session could not be loaded.", error);
    return NextResponse.json(
      { error: "Impossible de charger cette conversation." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const parsedId = sessionIdSchema.safeParse(id);
  if (!parsedId.success) {
    return NextResponse.json(
      { error: "L’identifiant de conversation est invalide." },
      { status: 400 },
    );
  }

  try {
    if (!deleteChatSession(parsedId.data)) {
      return NextResponse.json(
        { error: "Cette conversation est introuvable." },
        { status: 404 },
      );
    }
    return NextResponse.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Chat session could not be deleted.", error);
    return NextResponse.json(
      { error: "Impossible de supprimer cette conversation." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
