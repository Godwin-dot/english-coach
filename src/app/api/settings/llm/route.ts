import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { getPublicLLMConfig, saveLLMConfig } from "@/domain/llm-config";

const noStore = { "Cache-Control": "no-store" };

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(getPublicLLMConfig(), { headers: noStore });
}

export async function PUT(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Le corps de la requête doit être un JSON valide." },
      { status: 400, headers: noStore },
    );
  }

  try {
    return NextResponse.json(saveLLMConfig(body), { headers: noStore });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          error: "Configuration invalide.",
          details: error.issues.map(({ path, message }) => ({
            path,
            message,
          })),
        },
        { status: 400, headers: noStore },
      );
    }
    throw error;
  }
}
