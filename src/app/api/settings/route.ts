import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { getAppSettings, updateAppSettings } from "@/domain/settings";
import { AppSettingsSchema } from "@/schemas/settings";

export function GET() {
  return NextResponse.json(getAppSettings());
}

export async function PUT(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Le corps de la requête doit être un JSON valide." },
      { status: 400 },
    );
  }

  const parsed = AppSettingsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Les réglages fournis sont invalides.", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    return NextResponse.json(updateAppSettings(parsed.data));
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: "Les réglages fournis sont invalides.", issues: error.issues },
        { status: 400 },
      );
    }
    throw error;
  }
}
