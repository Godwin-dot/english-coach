import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { KokoroTTS } from "kokoro-js";
import type { KokoroVoiceId } from "@/lib/speech";

export type KokoroServerStatus = "unloaded" | "loading" | "ready" | "error";

type KokoroGlobal = typeof globalThis & {
  __kokoroTTSPromise?: Promise<KokoroTTS>;
  __kokoroTTSStatus?: KokoroServerStatus;
  __kokoroTaskQueue?: Promise<void>;
  __kokoroAudioInFlight?: Map<string, Promise<Buffer>>;
};

const kokoroGlobal = globalThis as KokoroGlobal;
const cacheDirectory = path.join(process.cwd(), "data", "tts-cache");

function getWavCachePath(voice: string, speed: number, text: string): string {
  const hash = createHash("sha256")
    .update(`${voice}|${speed}|${text}`)
    .digest("hex")
    .slice(0, 24);
  return path.join(cacheDirectory, `${hash}.wav`);
}

export function enqueueKokoroTask<T>(task: () => Promise<T>): Promise<T> {
  const previous = kokoroGlobal.__kokoroTaskQueue ?? Promise.resolve();
  const result = previous.then(task, task);
  kokoroGlobal.__kokoroTaskQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

export function getKokoroStatus(): KokoroServerStatus {
  return kokoroGlobal.__kokoroTTSStatus ?? "unloaded";
}

function getKokoro(): Promise<KokoroTTS> {
  if (!kokoroGlobal.__kokoroTTSPromise) {
    kokoroGlobal.__kokoroTTSStatus = "loading";
    kokoroGlobal.__kokoroTTSPromise = KokoroTTS.from_pretrained(
      "onnx-community/Kokoro-82M-v1.0-ONNX",
      { dtype: "q4" },
    )
      .catch((q4Error: unknown) => {
        console.warn("Kokoro q4 model is unavailable; falling back to q8.", q4Error);
        return KokoroTTS.from_pretrained(
          "onnx-community/Kokoro-82M-v1.0-ONNX",
          { dtype: "q8" },
        );
      })
      .then((model) => {
        kokoroGlobal.__kokoroTTSStatus = "ready";
        return model;
      })
      .catch((error: unknown) => {
        kokoroGlobal.__kokoroTTSStatus = "error";
        kokoroGlobal.__kokoroTTSPromise = undefined;
        throw error;
      });
  }

  return kokoroGlobal.__kokoroTTSPromise;
}

export async function warmupKokoro(): Promise<void> {
  await getKokoro();
}

export async function synthesizeKokoroWav({
  text,
  voice,
  speed,
}: {
  text: string;
  voice: KokoroVoiceId;
  speed: number;
}): Promise<Buffer> {
  mkdirSync(cacheDirectory, { recursive: true });
  const cachePath = getWavCachePath(voice, speed, text);
  if (existsSync(cachePath)) {
    return readFileSync(cachePath);
  }

  const hash = path.basename(cachePath, ".wav");
  const inFlight = (kokoroGlobal.__kokoroAudioInFlight ??= new Map());
  const existingRequest = inFlight.get(hash);
  if (existingRequest) {
    return existingRequest;
  }

  const request = enqueueKokoroTask(async () => {
    if (existsSync(cachePath)) {
      return readFileSync(cachePath);
    }

    const model = await getKokoro();
    const audio = await model.generate(text, { voice, speed });
    const wav = Buffer.from(await audio.toBlob().arrayBuffer());
    writeFileSync(cachePath, wav);
    return wav;
  });
  inFlight.set(hash, request);
  try {
    return await request;
  } finally {
    if (inFlight.get(hash) === request) {
      inFlight.delete(hash);
    }
  }
}
