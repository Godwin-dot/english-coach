import { KokoroTTS } from "kokoro-js";
import type { KokoroVoiceId } from "@/lib/speech";

export type KokoroServerStatus = "unloaded" | "loading" | "ready" | "error";

type KokoroGlobal = typeof globalThis & {
  __kokoroTTSPromise?: Promise<KokoroTTS>;
  __kokoroTTSStatus?: KokoroServerStatus;
};

const kokoroGlobal = globalThis as KokoroGlobal;

export function getKokoroStatus(): KokoroServerStatus {
  return kokoroGlobal.__kokoroTTSStatus ?? "unloaded";
}

function getKokoro(): Promise<KokoroTTS> {
  if (!kokoroGlobal.__kokoroTTSPromise) {
    kokoroGlobal.__kokoroTTSStatus = "loading";
    kokoroGlobal.__kokoroTTSPromise = KokoroTTS.from_pretrained(
      "onnx-community/Kokoro-82M-v1.0-ONNX",
      { dtype: "q8" },
    )
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
  const model = await getKokoro();
  const audio = await model.generate(text, { voice, speed });
  const blob = audio.toBlob();
  return Buffer.from(await blob.arrayBuffer());
}
