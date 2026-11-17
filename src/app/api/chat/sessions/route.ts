import { NextResponse } from "next/server";
import { listChatSessions } from "@/domain/chat";

export const dynamic = "force-dynamic";

export function GET() {
  try {
    return NextResponse.json(
      { sessions: listChatSessions() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("Chat sessions could not be loaded.", error);
    return NextResponse.json(
      { error: "Impossible de charger les conversations." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
