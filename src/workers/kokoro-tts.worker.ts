import { KokoroTTS } from "kokoro-js";

type WorkerRequest =
  | { type: "load" }
  | {
      type: "generate";
      requestId: string;
      text: string;
      voice: string;
      speed: number;
    };

type WorkerResponse =
  | { type: "progress"; progress: number }
  | { type: "ready" }
  | { type: "audio"; requestId: string; blob: Blob }
  | { type: "error"; requestId?: string; message: string };

const workerScope = self as unknown as {
  postMessage: (message: WorkerResponse) => void;
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
};
let modelPromise: Promise<KokoroTTS> | null = null;
let progress = 0;

function post(message: WorkerResponse): void {
  workerScope.postMessage(message);
}

function loadModel(): Promise<KokoroTTS> {
  if (!modelPromise) {
    progress = 0;
    modelPromise = KokoroTTS.from_pretrained(
      "onnx-community/Kokoro-82M-v1.0-ONNX",
      {
        dtype: "q8",
        device: "wasm",
        progress_callback: (detail) => {
          if (detail.status === "progress") {
            progress = Math.max(progress, Math.round(detail.progress));
            post({ type: "progress", progress });
          }
        },
      },
    ).then((model) => {
      post({ type: "progress", progress: 100 });
      post({ type: "ready" });
      return model;
    }).catch((error: unknown) => {
      modelPromise = null;
      throw error;
    });
  }
  return modelPromise;
}

workerScope.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  if (request.type === "load") {
    try {
      await loadModel();
    } catch (error) {
      post({
        type: "error",
        message: error instanceof Error ? error.message : "Kokoro model failed to load.",
      });
    }
    return;
  }

  try {
    const model = await loadModel();
    const audio = await model.generate(request.text, {
      voice: request.voice as keyof typeof model.voices,
      speed: request.speed,
    });
    post({
      type: "audio",
      requestId: request.requestId,
      blob: audio.toBlob(),
    });
  } catch (error) {
    post({
      type: "error",
      requestId: request.requestId,
      message: error instanceof Error ? error.message : "Kokoro audio generation failed.",
    });
  }
};
