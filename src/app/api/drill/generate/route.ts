import { NextResponse } from "next/server";
import { generateDrillExercise } from "@/domain/drill";
import {
  getErrorMessage,
  MissingApiKeyError,
  MissingModelError,
} from "@/llm/errors";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    return NextResponse.json(await generateDrillExercise(), {
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
