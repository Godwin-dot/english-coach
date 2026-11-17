import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  getWhisperStatus,
  transcribeFloat32Audio,
  warmupWhisper,
} from "@/lib/whisperServer";

export const runtime = "nodejs";
export const maxDuration = 60;

const sampleRate = 16_000;
const maxSamples = sampleRate * 30;
const maxPcmBytes = maxSamples * Float32Array.BYTES_PER_ELEMENT;
const maxJsonBytes = Math.ceil(maxPcmBytes / 3) * 4 + 128;
const warmupBodySchema = z.object({ action: z.literal("warmup") }).strict();
const pcmJsonBodySchema = z.object({ pcmBase64: z.string().min(1) }).strict();
const base64Pattern =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u;

class RequestBodyTooLargeError extends Error {}

async function readLimitedBody(
  request: NextRequest,
  maxBytes: number,
): Promise<Uint8Array> {
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        throw new RequestBodyTooLargeError();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

function validatePcmBytes(bytes: Uint8Array): Float32Array | null {
  if (
    bytes.byteLength === 0 ||
    bytes.byteLength % Float32Array.BYTES_PER_ELEMENT !== 0 ||
    bytes.byteLength > maxPcmBytes
  ) {
    return null;
  }

  const samples = new Float32Array(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength / Float32Array.BYTES_PER_ELEMENT,
  );
  return samples.every(Number.isFinite) ? samples : null;
}

export async function GET() {
  return NextResponse.json(
    { status: getWhisperStatus() },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: NextRequest) {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";

  if (contentType.includes("application/json")) {
    let bytes: Uint8Array;
    try {
      bytes = await readLimitedBody(request, maxJsonBytes);
    } catch (error) {
      if (error instanceof RequestBodyTooLargeError) {
        return NextResponse.json(
          { error: "Le flux audio ne doit pas dépasser 30 secondes." },
          { status: 413 },
        );
      }
      return NextResponse.json(
        { error: "Impossible de lire la requête audio." },
        { status: 400 },
      );
    }

    let body: unknown;
    try {
      body = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
    } catch {
      return NextResponse.json(
        { error: "Le corps de la requête doit être un JSON valide." },
        { status: 400 },
      );
    }

    const warmup = warmupBodySchema.safeParse(body);
    if (warmup.success) {
      void warmupWhisper().catch((error: unknown) => {
        console.error("Whisper model warmup failed.", error);
      });
      return NextResponse.json(
        { status: getWhisperStatus() },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    const parsed = pcmJsonBodySchema.safeParse(body);
    if (
      !parsed.success ||
      parsed.data.pcmBase64.length > maxJsonBytes ||
      !base64Pattern.test(parsed.data.pcmBase64)
    ) {
      return NextResponse.json(
        { error: "Le flux PCM base64 est invalide." },
        { status: 400 },
      );
    }

    const decoded = Buffer.from(parsed.data.pcmBase64, "base64");
    if (decoded.byteLength > maxPcmBytes) {
      return NextResponse.json(
        { error: "Le flux audio ne doit pas dépasser 30 secondes." },
        { status: 413 },
      );
    }
    const decodedBytes = Uint8Array.from(decoded);
    const audio = validatePcmBytes(decodedBytes);
    if (!audio) {
      return NextResponse.json(
        { error: "Le flux PCM doit contenir des échantillons Float32 valides à 16 kHz." },
        { status: 400 },
      );
    }
    return transcribe(audio);
  }

  if (!contentType.includes("application/octet-stream")) {
    return NextResponse.json(
      { error: "Utilisez application/octet-stream ou un JSON pcmBase64." },
      { status: 415 },
    );
  }

  let bytes: Uint8Array;
  try {
    bytes = await readLimitedBody(request, maxPcmBytes);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return NextResponse.json(
        { error: "Le flux audio ne doit pas dépasser 30 secondes." },
        { status: 413 },
      );
    }
    return NextResponse.json(
      { error: "Impossible de lire le flux audio." },
      { status: 400 },
    );
  }

  const audio = validatePcmBytes(bytes);
  if (!audio) {
    return NextResponse.json(
      { error: "Le flux PCM doit contenir des échantillons Float32 valides à 16 kHz." },
      { status: 400 },
    );
  }
  return transcribe(audio);
}

async function transcribe(audio: Float32Array) {
  try {
    const result = await transcribeFloat32Audio(audio);
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Whisper transcription failed.", error);
    return NextResponse.json(
      { error: "La transcription locale Whisper a échoué. Réessayez ou choisissez le moteur Navigateur." },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
