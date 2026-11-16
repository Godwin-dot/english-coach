import { NextResponse } from "next/server";
import { getRecentMistakes } from "@/domain/drill";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(getRecentMistakes(), {
    headers: { "Cache-Control": "no-store" },
  });
}
