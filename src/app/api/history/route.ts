import { NextResponse } from "next/server";
import { getFullHistory } from "@/domain/history";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(getFullHistory(), {
    headers: { "Cache-Control": "no-store" },
  });
}
