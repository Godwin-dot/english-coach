"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type STTMode = "whisper" | "browser";
export type WhisperStatus = "unloaded" | "loading" | "ready" | "error";

type SpeechSegment = { transcript: string };
type SpeechResult = ArrayLike<SpeechSegment> & { isFinal: boolean };
type SpeechResultEvent = { results: ArrayLike<SpeechResult> };
type SpeechErrorEvent = { error: string };

type BrowserSpeechRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onerror: ((event: SpeechErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type BrowserSpeechRecognitionConstructor = new () => BrowserSpeechRecognition;
type SpeechRecognitionWindow = Window & {
  SpeechRecognition?: BrowserSpeechRecognitionConstructor;
  webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
};

type AudioCapture = {
  stream: MediaStream;
  context: AudioContext;
  source: MediaStreamAudioSourceNode;
  processor: ScriptProcessorNode;
  mute: GainNode;
  sampleRate: number;
  chunks: Float32Array[];
  sampleCount: number;
};

const STT_MODE_KEY = "ec_stt_engine";
const TARGET_SAMPLE_RATE = 16_000;
const MAX_CAPTURE_SECONDS = 30;
const MAX_AUDIO_SAMPLES = TARGET_SAMPLE_RATE * MAX_CAPTURE_SECONDS;

function isWhisperStatus(value: unknown): value is WhisperStatus {
  return (
    value === "unloaded" ||
    value === "loading" ||
    value === "ready" ||
    value === "error"
  );
}

function getErrorMessage(body: unknown): string {
  if (
    typeof body === "object" &&
    body !== null &&
    "error" in body &&
    typeof body.error === "string"
  ) {
    return body.error;
  }
  return "La requête audio n’a pas abouti.";
}

function downsample(
  chunks: Float32Array[],
  sampleCount: number,
  sourceRate: number,
): Float32Array {
  const source = new Float32Array(sampleCount);
  let offset = 0;
  for (const chunk of chunks) {
    source.set(chunk.subarray(0, sampleCount - offset), offset);
    offset += chunk.length;
    if (offset >= sampleCount) break;
  }

  if (sourceRate === TARGET_SAMPLE_RATE) {
    return source.subarray(0, MAX_AUDIO_SAMPLES);
  }

  const outputLength = Math.min(
    MAX_AUDIO_SAMPLES,
    Math.floor((source.length * TARGET_SAMPLE_RATE) / sourceRate),
  );
  const output = new Float32Array(outputLength);
  for (let index = 0; index < outputLength; index += 1) {
    const position = (index * sourceRate) / TARGET_SAMPLE_RATE;
    const leftIndex = Math.floor(position);
    const rightIndex = Math.min(leftIndex + 1, source.length - 1);
    const fraction = position - leftIndex;
    output[index] =
      source[leftIndex] * (1 - fraction) + source[rightIndex] * fraction;
  }
  return output;
}

function releaseCapture(capture: AudioCapture): void {
  capture.processor.onaudioprocess = null;
  capture.source.disconnect();
  capture.processor.disconnect();
  capture.mute.disconnect();
  capture.stream.getTracks().forEach((track) => track.stop());
  void capture.context.close().catch(() => undefined);
}

export function useSpeechRecognition() {
  const [sttMode, setSttModeState] = useState<STTMode>("whisper");
  const [whisperStatus, setWhisperStatus] =
    useState<WhisperStatus>("unloaded");
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [listening, setListening] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [error, setError] = useState("");
  const [browserSupported, setBrowserSupported] = useState(false);
  const mountedRef = useRef(false);
  const captureRef = useRef<AudioCapture | null>(null);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const startInProgressRef = useRef(false);
  const captureTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warmupControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    const speechWindow = window as SpeechRecognitionWindow;
    setBrowserSupported(
      Boolean(
        speechWindow.SpeechRecognition ||
          speechWindow.webkitSpeechRecognition,
      ),
    );

    try {
      const savedMode = window.localStorage.getItem(STT_MODE_KEY);
      if (savedMode === "whisper" || savedMode === "browser") {
        setSttModeState(savedMode);
      }
    } catch {
      // The local Whisper default remains available when storage is disabled.
    }

    const controller = new AbortController();
    void fetch("/api/stt", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Impossible de lire l’état de Whisper.");
        const body: unknown = await response.json();
        if (
          typeof body !== "object" ||
          body === null ||
          !("status" in body) ||
          !isWhisperStatus(body.status)
        ) {
          throw new Error("L’état du moteur Whisper est invalide.");
        }
        if (mountedRef.current) setWhisperStatus(body.status);
      })
      .catch(() => {
        if (mountedRef.current) setWhisperStatus("error");
      });

    return () => {
      mountedRef.current = false;
      controller.abort();
      warmupControllerRef.current?.abort();
      if (captureTimerRef.current) clearTimeout(captureTimerRef.current);
      captureTimerRef.current = null;
      if (captureRef.current) {
        releaseCapture(captureRef.current);
        captureRef.current = null;
      }
      recognitionRef.current?.stop();
      recognitionRef.current = null;
    };
  }, []);

  const setSttMode = useCallback((mode: STTMode) => {
    setSttModeState(mode);
    setError("");
    setInterimTranscript("");
    try {
      window.localStorage.setItem(STT_MODE_KEY, mode);
    } catch {
      // Keep the selected engine for the current page when storage is unavailable.
    }
  }, []);

  const warmupWhisper = useCallback(async () => {
    warmupControllerRef.current?.abort();
    const controller = new AbortController();
    warmupControllerRef.current = controller;
    setWhisperStatus("loading");
    setError("");

    try {
      const response = await fetch("/api/stt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "warmup" }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(getErrorMessage(await response.json()));

      const initialBody: unknown = await response.json();
      if (
        typeof initialBody !== "object" ||
        initialBody === null ||
        !("status" in initialBody) ||
        !isWhisperStatus(initialBody.status)
      ) {
        throw new Error("L’état du moteur Whisper est invalide.");
      }
      if (mountedRef.current) setWhisperStatus(initialBody.status);
      if (initialBody.status === "ready") return;

      for (let attempt = 0; attempt < 120; attempt += 1) {
        const statusResponse = await fetch("/api/stt", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!statusResponse.ok) {
          throw new Error("Impossible de lire l’état de Whisper.");
        }
        const statusBody: unknown = await statusResponse.json();
        if (
          typeof statusBody !== "object" ||
          statusBody === null ||
          !("status" in statusBody) ||
          !isWhisperStatus(statusBody.status)
        ) {
          throw new Error("L’état du moteur Whisper est invalide.");
        }
        if (mountedRef.current) setWhisperStatus(statusBody.status);
        if (statusBody.status === "ready") return;
        if (statusBody.status === "error") {
          throw new Error("Whisper n’a pas pu charger son modèle local.");
        }
        await new Promise((resolve) => setTimeout(resolve, 750));
      }
      throw new Error("Le chargement de Whisper prend trop de temps.");
    } catch (caught) {
      if (controller.signal.aborted) return;
      if (mountedRef.current) {
        setWhisperStatus("error");
        setError(
          caught instanceof Error
            ? caught.message
            : "Impossible de charger le modèle Whisper.",
        );
      }
    }
  }, []);

  const stopListening = useCallback(async () => {
    if (sttMode === "browser") {
      recognitionRef.current?.stop();
      return;
    }

    const capture = captureRef.current;
    if (!capture) return;
    captureRef.current = null;
    if (captureTimerRef.current) clearTimeout(captureTimerRef.current);
    captureTimerRef.current = null;
    setListening(false);
    releaseCapture(capture);

    const audio = downsample(
      capture.chunks,
      capture.sampleCount,
      capture.sampleRate,
    );
    if (audio.length === 0) {
      setError("Aucun son n’a été capté. Vérifiez le microphone et réessayez.");
      return;
    }

    setIsTranscribing(true);
    setError("");
    try {
      const requestBody = new ArrayBuffer(audio.byteLength);
      new Float32Array(requestBody).set(audio);
      const response = await fetch("/api/stt", {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: requestBody,
      });
      const body: unknown = await response.json();
      if (!response.ok) throw new Error(getErrorMessage(body));
      if (
        typeof body !== "object" ||
        body === null ||
        !("text" in body) ||
        typeof body.text !== "string"
      ) {
        throw new Error("La réponse de transcription est invalide.");
      }
      if (mountedRef.current) {
        const text = body.text.trim();
        setTranscript(text);
        setInterimTranscript("");
        setWhisperStatus("ready");
        if (!text) {
          setError(
            "Aucune parole claire n’a été détectée. Rapprochez le microphone et réessayez.",
          );
        }
      }
    } catch (caught) {
      if (!mountedRef.current) return;
      setWhisperStatus("error");
      setError(
        caught instanceof Error
          ? `${caught.message} Vous pouvez réessayer ou choisir le moteur Navigateur.`
          : "La transcription locale a échoué. Réessayez ou choisissez le moteur Navigateur.",
      );
    } finally {
      if (mountedRef.current) setIsTranscribing(false);
    }
  }, [sttMode]);

  const startListening = useCallback(async () => {
    if (startInProgressRef.current || listening || isTranscribing) return;
    startInProgressRef.current = true;
    setIsStarting(true);
    const finishStarting = () => {
      startInProgressRef.current = false;
      if (mountedRef.current) setIsStarting(false);
    };
    setError("");
    setTranscript("");
    setInterimTranscript("");

    if (sttMode === "browser") {
      const speechWindow = window as SpeechRecognitionWindow;
      const RecognitionConstructor =
        speechWindow.SpeechRecognition ??
        speechWindow.webkitSpeechRecognition;
      if (!RecognitionConstructor) {
        finishStarting();
        setError("La reconnaissance vocale du navigateur n’est pas disponible.");
        return;
      }

      const recognition = new RecognitionConstructor();
      recognition.lang = "en-US";
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.onresult = (event) => {
        const finalParts: string[] = [];
        const interimParts: string[] = [];
        for (let index = 0; index < event.results.length; index += 1) {
          const result = event.results[index];
          const text = result[0]?.transcript?.trim() ?? "";
          if (!text) continue;
          if (result.isFinal) finalParts.push(text);
          else interimParts.push(text);
        }
        if (mountedRef.current) {
          setTranscript(finalParts.join(" "));
          setInterimTranscript(interimParts.join(" "));
        }
      };
      recognition.onerror = (event) => {
        if (!mountedRef.current) return;
        finishStarting();
        setListening(false);
        setError(
          event.error === "not-allowed"
            ? "Autorisez l’accès au microphone pour utiliser la reconnaissance du navigateur."
            : "La reconnaissance du navigateur a échoué. Vérifiez le microphone et réessayez.",
        );
      };
      recognition.onend = () => {
        if (mountedRef.current) setListening(false);
        recognitionRef.current = null;
      };
      recognitionRef.current = recognition;
      try {
        recognition.start();
        setListening(true);
      } catch {
        recognitionRef.current = null;
        setError("La reconnaissance du navigateur n’a pas pu démarrer.");
      }
      finishStarting();
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      finishStarting();
      setError(
        "L’accès au microphone est indisponible. Utilisez une connexion sécurisée ou le moteur Navigateur.",
      );
      return;
    }

    let stream: MediaStream | null = null;
    let context: AudioContext | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      if (!mountedRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        startInProgressRef.current = false;
        return;
      }

      try {
        context = new AudioContext({ sampleRate: TARGET_SAMPLE_RATE });
      } catch {
        context = new AudioContext();
      }
      await context.resume();
      const source = context.createMediaStreamSource(stream);
      const processor = context.createScriptProcessor(4096, 1, 1);
      const mute = context.createGain();
      mute.gain.value = 0;
      const capture: AudioCapture = {
        stream,
        context,
        source,
        processor,
        mute,
        sampleRate: context.sampleRate,
        chunks: [],
        sampleCount: 0,
      };
      processor.onaudioprocess = (event) => {
        if (captureRef.current !== capture) return;
        const input = event.inputBuffer.getChannelData(0);
        const chunk = input.slice();
        const remainingSamples =
          Math.ceil(
            (MAX_CAPTURE_SECONDS * capture.sampleRate),
          ) - capture.sampleCount;
        if (remainingSamples > 0) {
          const boundedChunk = chunk.subarray(0, remainingSamples);
          capture.chunks.push(boundedChunk);
          capture.sampleCount += boundedChunk.length;
        }
      };
      source.connect(processor);
      processor.connect(mute);
      mute.connect(context.destination);
      captureRef.current = capture;
      setListening(true);
      finishStarting();
      captureTimerRef.current = setTimeout(
        () => void stopListening(),
        MAX_CAPTURE_SECONDS * 1000,
      );
    } catch (caught) {
      stream?.getTracks().forEach((track) => track.stop());
      if (context) await context.close().catch(() => undefined);
      if (mountedRef.current) {
        finishStarting();
        setListening(false);
        setError(
          caught instanceof Error && caught.name === "NotAllowedError"
            ? "Autorisez l’accès au microphone pour enregistrer votre voix."
            : "Impossible de démarrer l’enregistrement. Vérifiez le microphone et réessayez.",
        );
      }
    }
  }, [isTranscribing, listening, sttMode, stopListening]);

  return {
    sttMode,
    setSttMode,
    whisperStatus,
    transcript,
    interimTranscript,
    listening,
    isTranscribing,
    isStarting,
    error,
    browserSupported,
    startListening,
    stopListening,
    warmupWhisper,
    clearTranscript: () => {
      setTranscript("");
      setInterimTranscript("");
      setError("");
    },
  };
}
