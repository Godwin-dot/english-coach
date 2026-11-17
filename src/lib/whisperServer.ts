import {
  pipeline,
  type AutomaticSpeechRecognitionPipeline,
} from "@huggingface/transformers";

export type WhisperStatus = "unloaded" | "loading" | "ready" | "error";

const sampleRate = 16_000;
const maxSamples = sampleRate * 30;

type WhisperGlobal = typeof globalThis & {
  __whisperPipelinePromise?: Promise<AutomaticSpeechRecognitionPipeline>;
  __whisperStatus?: WhisperStatus;
  __whisperTaskQueue?: Promise<void>;
};

const whisperGlobal = globalThis as WhisperGlobal;

function getWhisperPipeline(): Promise<AutomaticSpeechRecognitionPipeline> {
  if (!whisperGlobal.__whisperPipelinePromise) {
    whisperGlobal.__whisperStatus = "loading";
    whisperGlobal.__whisperPipelinePromise = pipeline(
      "automatic-speech-recognition",
      "onnx-community/whisper-tiny.en",
      { dtype: "q8" },
    )
      .then((model) => {
        whisperGlobal.__whisperStatus = "ready";
        return model;
      })
      .catch((error: unknown) => {
        whisperGlobal.__whisperStatus = "error";
        whisperGlobal.__whisperPipelinePromise = undefined;
        throw error;
      });
  }
  return whisperGlobal.__whisperPipelinePromise;
}

export function getWhisperStatus(): WhisperStatus {
  return whisperGlobal.__whisperStatus ?? "unloaded";
}

export function enqueueWhisperTask<T>(task: () => Promise<T>): Promise<T> {
  const previous = whisperGlobal.__whisperTaskQueue ?? Promise.resolve();
  const result = previous.then(task, task);
  whisperGlobal.__whisperTaskQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

export async function warmupWhisper(): Promise<void> {
  await getWhisperPipeline();
}

export async function transcribeFloat32Audio(
  audioData: Float32Array,
): Promise<{ text: string }> {
  if (
    audioData.length === 0 ||
    audioData.length > maxSamples ||
    !audioData.every(Number.isFinite)
  ) {
    throw new Error("Le flux audio doit contenir jusqu’à 30 secondes de PCM valide.");
  }

  return enqueueWhisperTask(async () => {
    const model = await getWhisperPipeline();
    const result = await model(audioData);
    const text = Array.isArray(result)
      ? result.map((segment) => segment.text).join(" ")
      : result.text;
    return { text: text.trim() };
  });
}
