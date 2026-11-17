import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { KOKORO_VOICES, type KokoroVoiceId } from "@/lib/speech";
import {
  getKokoroStatus,
  synthesizeKokoroWav,
  warmupKokoro,
} from "@/lib/kokoroServer";

export const runtime = "nodejs";

const voiceSchema = z.string().refine(
  (voice): voice is KokoroVoiceId =>
    KOKORO_VOICES.some((candidate) => candidate.id === voice),
  "Voix Kokoro invalide.",
);

const requestSchema = z.union([
  z.object({ action: z.literal("warmup") }).strict(),
  z
    .object({
      text: z.string().min(1).max(600),
      voice: voiceSchema,
      speed: z.number().min(0.5).max(1.5),
    })
    .strict(),
]);

export async function GET() {
  return NextResponse.json(
    { status: getKokoroStatus() },
    { headers: { "Cache-Control": "no-store" } },
  );
}

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

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Paramètres de synthèse invalides.", details: parsed.error.issues },
      { status: 400 },
    );
  }

  if ("action" in parsed.data) {
    void warmupKokoro().catch((error: unknown) => {
      console.error("Kokoro model warmup failed.", error);
    });
    return NextResponse.json(
      { status: getKokoroStatus() },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const wav = await synthesizeKokoroWav(parsed.data);
    return new Response(new Uint8Array(wav), {
      status: 200,
      headers: {
        "Content-Type": "audio/wav",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Erreur inconnue de synthèse.";
    console.error("Kokoro audio synthesis failed.", error);
    return NextResponse.json(
      { error: `La synthèse Kokoro a échoué : ${message}` },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
