"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getRankedEnglishVoices,
  KOKORO_VOICES,
  splitSentencesWithOffsets,
  type EnglishAccent,
  type SpeechEngineMode,
} from "@/lib/speech";

export type SpeechRate = 0.75 | 1 | 1.2;
export type SpeechStatus = "idle" | "playing" | "paused";
export type KokoroStatus = "unloaded" | "loading" | "ready" | "error";

export type SpeechEngine = {
  status: SpeechStatus;
  activeSourceId: string | null;
  activeCharIndex: number | null;
  rate: SpeechRate;
  accent: EnglishAccent;
  selectedVoiceURI: string;
  availableVoices: SpeechSynthesisVoice[];
  engineMode: SpeechEngineMode;
  kokoroStatus: KokoroStatus;
  initKokoroModel: () => void;
  setEngineMode: (mode: SpeechEngineMode) => void;
  speak: (text: string, sourceId?: string, charOffset?: number) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  setRate: (rate: SpeechRate) => void;
  setAccent: (accent: EnglishAccent) => void;
  setSelectedVoiceURI: (uri: string) => void;
};

type Playback = {
  text: string;
  sourceId: string | null;
  offset: number;
};

const rateKey = "ec_speech_rate";
const accentKey = "ec_speech_accent";
const voiceKey = "ec_speech_voice_uri";
const engineKey = "ec_speech_engine";
const preferencesChangedEvent = "ec-speech-prefs-changed";

function notifySpeechPreferencesChanged(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(preferencesChangedEvent));
  }
}

function isSpeechRate(value: string | null): value is `${SpeechRate}` {
  return value === "0.75" || value === "1" || value === "1.2";
}

function isEnglishAccent(value: string | null): value is EnglishAccent {
  return value === "en-US" || value === "en-GB";
}

function isEngineMode(value: string | null): value is SpeechEngineMode {
  return value === "kokoro" || value === "browser";
}

function parseKokoroStatus(value: unknown): KokoroStatus | null {
  if (
    typeof value === "object" &&
    value !== null &&
    "status" in value &&
    (value.status === "unloaded" ||
      value.status === "loading" ||
      value.status === "ready" ||
      value.status === "error")
  ) {
    return value.status;
  }
  return null;
}

function defaultKokoroVoice(accent: EnglishAccent): string {
  return accent === "en-GB" ? "bf_emma" : "af_heart";
}

function readPreference(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writePreference(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Voice playback remains usable when persistent browser storage is unavailable.
  }
}

export function useSpeechEngine(): SpeechEngine {
  const [mounted, setMounted] = useState(false);
  const [status, setStatus] = useState<SpeechStatus>("idle");
  const [activeSourceId, setActiveSourceId] = useState<string | null>(null);
  const [activeCharIndex, setActiveCharIndex] = useState<number | null>(null);
  const [rate, setRateState] = useState<SpeechRate>(1);
  const [accent, setAccentState] = useState<EnglishAccent>("en-US");
  const [selectedVoiceURI, setSelectedVoiceURIState] = useState("");
  const [availableVoices, setAvailableVoices] = useState<
    SpeechSynthesisVoice[]
  >([]);
  const [engineMode, setEngineModeState] = useState<SpeechEngineMode>("browser");
  const [kokoroStatus, setKokoroStatus] = useState<KokoroStatus>("unloaded");
  const playbackRef = useRef<Playback | null>(null);
  const generationRef = useRef(0);
  const statusRef = useRef<SpeechStatus>("idle");
  const engineModeRef = useRef<SpeechEngineMode>("browser");
  const kokoroStatusRef = useRef<KokoroStatus>("unloaded");
  const pausedRef = useRef(false);
  const playbackSettingsRef = useRef({
    rate: 1 as SpeechRate,
    accent: "en-US" as EnglishAccent,
    selectedVoiceURI: "",
  });
  const currentCharRef = useRef(0);
  const fallbackIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );
  const fallbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const playbackStartedAtRef = useRef(0);
  const boundaryReceivedRef = useRef(false);
  const kokoroWarmupControllerRef = useRef<AbortController | null>(null);
  const kokoroPollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const audioCacheRef = useRef(new Map<string, string>());
  const audioGenerationCacheRef = useRef(new Map<string, Promise<string>>());

  const updateStatus = useCallback((next: SpeechStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  const updateKokoroStatus = useCallback((next: KokoroStatus) => {
    kokoroStatusRef.current = next;
    setKokoroStatus(next);
  }, []);

  const clearFallback = useCallback(() => {
    if (fallbackTimeoutRef.current) clearTimeout(fallbackTimeoutRef.current);
    if (fallbackIntervalRef.current) clearInterval(fallbackIntervalRef.current);
    fallbackTimeoutRef.current = null;
    fallbackIntervalRef.current = null;
  }, []);

  const cleanupAudio = useCallback(() => {
    const audio = audioElementRef.current;
    if (!audio) return;
    audio.pause();
    audio.ontimeupdate = null;
    audio.onended = null;
    audio.onerror = null;
    audio.removeAttribute("src");
    audio.load();
    audioElementRef.current = null;
  }, []);

  const stop = useCallback(() => {
    generationRef.current += 1;
    clearFallback();
    cleanupAudio();
    playbackRef.current = null;
    currentCharRef.current = 0;
    pausedRef.current = false;
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    updateStatus("idle");
    setActiveSourceId(null);
    setActiveCharIndex(null);
  }, [cleanupAudio, clearFallback, updateStatus]);

  const startBrowserPlayback = useCallback(
    (playback: Playback, startAt: number, generation: number) => {
      if (
        typeof window === "undefined" ||
        !("speechSynthesis" in window) ||
        startAt >= playback.text.length
      ) {
        stop();
        return;
      }

      cleanupAudio();
      clearFallback();
      const settings = playbackSettingsRef.current;
      const voiceList = getRankedEnglishVoices(settings.accent);
      const selectedVoice =
        voiceList.find((voice) => voice.voiceURI === settings.selectedVoiceURI) ??
        voiceList[0];
      const utterance = new SpeechSynthesisUtterance(
        playback.text.slice(startAt),
      );
      utterance.lang = settings.accent;
      utterance.rate = settings.rate;
      if (selectedVoice) utterance.voice = selectedVoice;

      playbackRef.current = playback;
      playbackStartedAtRef.current = Date.now();
      currentCharRef.current = playback.offset + startAt;
      boundaryReceivedRef.current = false;
      setActiveSourceId(playback.sourceId);
      setActiveCharIndex(playback.offset + startAt);
      updateStatus(pausedRef.current ? "paused" : "playing");

      utterance.onboundary = (event) => {
        if (generationRef.current !== generation) return;
        if (event.name && event.name !== "word") return;
        const charIndex = playback.offset + startAt + event.charIndex;
        boundaryReceivedRef.current = true;
        currentCharRef.current = charIndex;
        clearFallback();
        setActiveCharIndex(charIndex);
      };
      utterance.onend = () => {
        if (generationRef.current !== generation) return;
        clearFallback();
        playbackRef.current = null;
        updateStatus("idle");
        setActiveSourceId(null);
        setActiveCharIndex(null);
      };
      utterance.onerror = (event) => {
        if (generationRef.current !== generation) return;
        if (event.error === "canceled" || event.error === "interrupted") return;
        clearFallback();
        playbackRef.current = null;
        updateStatus("idle");
        setActiveSourceId(null);
        setActiveCharIndex(null);
      };

      window.speechSynthesis.cancel();
      if (!pausedRef.current) window.speechSynthesis.speak(utterance);

      fallbackTimeoutRef.current = setTimeout(() => {
        if (
          boundaryReceivedRef.current ||
          playbackRef.current !== playback ||
          generationRef.current !== generation
        ) {
          return;
        }
        fallbackIntervalRef.current = setInterval(() => {
          if (
            boundaryReceivedRef.current ||
            playbackRef.current !== playback ||
            generationRef.current !== generation
          ) {
            clearFallback();
            return;
          }
          const elapsedMs = Date.now() - playbackStartedAtRef.current;
          const durationMs = Math.max(
            900,
            ((playback.text.length - startAt) * 55) /
              playbackSettingsRef.current.rate,
          );
          const progress = Math.min(elapsedMs / durationMs, 0.98);
          const estimatedIndex =
            startAt + Math.floor((playback.text.length - startAt) * progress);
          currentCharRef.current = playback.offset + estimatedIndex;
          setActiveCharIndex(playback.offset + estimatedIndex);
          if (progress >= 0.98) clearFallback();
        }, 80);
      }, 450);
    },
    [cleanupAudio, clearFallback, stop, updateStatus],
  );

  const generateKokoroAudio = useCallback(
    async (text: string, voice: string, speed: SpeechRate): Promise<Blob> => {
      const response = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice, speed }),
      });
      if (!response.ok) {
        const payload: unknown = await response.json().catch(() => null);
        const message =
          typeof payload === "object" &&
          payload !== null &&
          "error" in payload &&
          typeof payload.error === "string"
            ? payload.error
            : "Kokoro audio synthesis failed.";
        throw new Error(message);
      }

      const blob = await response.blob();
      if (blob.size === 0 || !blob.type.startsWith("audio/wav")) {
        throw new Error("The Kokoro API returned an invalid WAV file.");
      }
      return blob;
    },
    [],
  );

  const startKokoroPlayback = useCallback(
    async (playback: Playback, startAt: number, generation: number) => {
      const settings = playbackSettingsRef.current;
      const voice = KOKORO_VOICES.some(
        (candidate) => candidate.id === settings.selectedVoiceURI,
      )
        ? settings.selectedVoiceURI
        : defaultKokoroVoice(settings.accent);
      const sentences = splitSentencesWithOffsets(playback.text.slice(startAt));
      if (sentences.length === 0) {
        startBrowserPlayback(playback, startAt, generation);
        return;
      }

      const getAudioUrl = (text: string): Promise<string> => {
        const cacheKey = `${voice}|${settings.rate}|${text}`;
        const cachedUrl = audioCacheRef.current.get(cacheKey);
        if (cachedUrl) return Promise.resolve(cachedUrl);
        const pending = audioGenerationCacheRef.current.get(cacheKey);
        if (pending) return pending;

        const generationPromise = generateKokoroAudio(
          text,
          voice,
          settings.rate,
        )
          .then((blob) => {
            if (blob.size === 0) {
              throw new Error("Kokoro returned an empty audio file.");
            }
            const objectUrl = URL.createObjectURL(blob);
            audioCacheRef.current.set(cacheKey, objectUrl);
            if (audioCacheRef.current.size > 100) {
              const oldestKey = audioCacheRef.current.keys().next().value;
              if (oldestKey) {
                const oldestUrl = audioCacheRef.current.get(oldestKey);
                if (oldestUrl) URL.revokeObjectURL(oldestUrl);
                audioCacheRef.current.delete(oldestKey);
              }
            }
            return objectUrl;
          })
          .finally(() => {
            audioGenerationCacheRef.current.delete(cacheKey);
          });
        audioGenerationCacheRef.current.set(cacheKey, generationPromise);
        return generationPromise;
      };

      const prefetchSentences = async (startIndex: number): Promise<void> => {
        for (let index = startIndex; index < sentences.length; index += 1) {
          try {
            await getAudioUrl(sentences[index].text);
          } catch {
            return;
          }
        }
      };

      const playSentence = async (
        sentenceIndex: number,
        audioUrl?: Promise<string>,
      ): Promise<void> => {
        const sentence = sentences[sentenceIndex];
        if (!sentence || generationRef.current !== generation) return;
        const sentenceStartAt = startAt + sentence.startChar;
        try {
          const objectUrl = await (audioUrl ?? getAudioUrl(sentence.text));
          if (generationRef.current !== generation) return;

          cleanupAudio();
          const audio = new Audio(objectUrl);
          audio.playbackRate = 1;
          audioElementRef.current = audio;
          audio.ontimeupdate = () => {
            if (generationRef.current !== generation) return;
            if (!Number.isFinite(audio.duration) || audio.duration <= 0) return;
            const progress = Math.min(audio.currentTime / audio.duration, 1);
            const charIndex =
              playback.offset +
              sentenceStartAt +
              Math.min(
                Math.floor(sentence.text.length * progress),
                sentence.text.length - 1,
              );
            currentCharRef.current = charIndex;
            setActiveCharIndex(charIndex);
          };
          audio.onended = () => {
            if (generationRef.current !== generation) return;
            cleanupAudio();
            if (sentenceIndex + 1 < sentences.length) {
              void playSentence(sentenceIndex + 1);
            } else {
              playbackRef.current = null;
              updateStatus("idle");
              setActiveSourceId(null);
              setActiveCharIndex(null);
            }
          };
          audio.onerror = () => {
            if (generationRef.current !== generation) return;
            startBrowserPlayback(playback, sentenceStartAt, generation);
          };
          if (pausedRef.current) {
            updateStatus("paused");
            return;
          }
          await audio.play();
          if (generationRef.current === generation) updateStatus("playing");
        } catch {
          if (generationRef.current === generation) {
            startBrowserPlayback(playback, sentenceStartAt, generation);
          }
        }
      };

      const firstSentenceAudio = getAudioUrl(sentences[0].text);
      void prefetchSentences(1);
      void playSentence(0, firstSentenceAudio);
    },
    [cleanupAudio, generateKokoroAudio, startBrowserPlayback, updateStatus],
  );

  const startPlayback = useCallback(
    (playback: Playback, startAt: number) => {
      if (startAt >= playback.text.length) {
        stop();
        return;
      }
      generationRef.current += 1;
      const generation = generationRef.current;
      playbackRef.current = playback;
      pausedRef.current = false;
      currentCharRef.current = playback.offset + startAt;
      setActiveSourceId(playback.sourceId);
      setActiveCharIndex(playback.offset + startAt);
      updateStatus("playing");

      if (
        engineModeRef.current === "kokoro" &&
        kokoroStatusRef.current === "ready"
      ) {
        void startKokoroPlayback(playback, startAt, generation);
      } else {
        startBrowserPlayback(playback, startAt, generation);
      }
    },
    [startBrowserPlayback, startKokoroPlayback, stop, updateStatus],
  );

  const speak = useCallback(
    (text: string, sourceId?: string, charOffset = 0) => {
      const leadingWhitespace = text.length - text.trimStart().length;
      const normalized = text.trim();
      if (!normalized) return;
      startPlayback(
        {
          text: normalized,
          sourceId: sourceId ?? null,
          offset: Math.max(0, charOffset + leadingWhitespace),
        },
        0,
      );
    },
    [startPlayback],
  );

  const initKokoroModel = useCallback(() => {
    if (kokoroStatusRef.current === "ready" || kokoroStatusRef.current === "loading") {
      return;
    }
    kokoroWarmupControllerRef.current?.abort();
    if (kokoroPollTimeoutRef.current) {
      clearTimeout(kokoroPollTimeoutRef.current);
      kokoroPollTimeoutRef.current = null;
    }
    const controller = new AbortController();
    kokoroWarmupControllerRef.current = controller;
    updateKokoroStatus("loading");

    const handleError = (error: unknown) => {
      if (controller.signal.aborted) return;
      console.error("Kokoro model warmup failed.", error);
      updateKokoroStatus("error");
    };

    const pollStatus = async (): Promise<void> => {
      const response = await fetch("/api/tts", {
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error("Unable to read Kokoro model status.");
      }
      const status = parseKokoroStatus(await response.json());
      if (status === "ready") {
        updateKokoroStatus("ready");
        return;
      }
      if (status === "error") {
        throw new Error("The Kokoro model failed to initialize.");
      }
      kokoroPollTimeoutRef.current = setTimeout(() => {
        void pollStatus().catch(handleError);
      }, 750);
    };

    void fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "warmup" }),
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Unable to initialize the Kokoro model.");
        }
        const status = parseKokoroStatus(await response.json());
        if (status === "ready") {
          updateKokoroStatus("ready");
          return;
        }
        if (status === "error") {
          throw new Error("The Kokoro model failed to initialize.");
        }
        await pollStatus();
      })
      .catch(handleError);
  }, [updateKokoroStatus]);

  const setEngineMode = useCallback(
    (nextMode: SpeechEngineMode) => {
      engineModeRef.current = nextMode;
      setEngineModeState(nextMode);
      writePreference(engineKey, nextMode);
      if (nextMode === "kokoro") {
        if (
          !KOKORO_VOICES.some(
            (candidate) => candidate.id === playbackSettingsRef.current.selectedVoiceURI,
          )
        ) {
          const voice = defaultKokoroVoice(playbackSettingsRef.current.accent);
          playbackSettingsRef.current.selectedVoiceURI = voice;
          setSelectedVoiceURIState(voice);
          writePreference(voiceKey, voice);
        }
        initKokoroModel();
      }
      notifySpeechPreferencesChanged();
      const playback = playbackRef.current;
      if (playback && statusRef.current !== "idle") {
        startPlayback(
          playback,
          Math.max(0, currentCharRef.current - playback.offset),
        );
      }
    },
    [initKokoroModel, startPlayback],
  );

  const pause = useCallback(() => {
    pausedRef.current = true;
    clearFallback();
    if (audioElementRef.current) audioElementRef.current.pause();
    else if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.pause();
    }
    updateStatus("paused");
  }, [clearFallback, updateStatus]);

  const resume = useCallback(() => {
    const audio = audioElementRef.current;
    if (audio) {
      pausedRef.current = false;
      void audio.play().then(
        () => updateStatus("playing"),
        () => {
          const playback = playbackRef.current;
          if (playback) {
            startBrowserPlayback(
              playback,
              Math.max(0, currentCharRef.current - playback.offset),
              generationRef.current,
            );
          }
        },
      );
      return;
    }

    const playback = playbackRef.current;
    if (playback) {
      pausedRef.current = false;
      if (
        engineModeRef.current === "kokoro" &&
        kokoroStatusRef.current === "ready"
      ) {
        startPlayback(
          playback,
          Math.max(0, currentCharRef.current - playback.offset),
        );
      } else if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.resume();
        updateStatus("playing");
      }
    }
  }, [startBrowserPlayback, startPlayback, updateStatus]);

  const setRate = useCallback(
    (nextRate: SpeechRate) => {
      playbackSettingsRef.current.rate = nextRate;
      setRateState(nextRate);
      writePreference(rateKey, String(nextRate));
      notifySpeechPreferencesChanged();
      const playback = playbackRef.current;
      if (playback && statusRef.current !== "idle") {
        startPlayback(
          playback,
          Math.max(0, currentCharRef.current - playback.offset),
        );
      }
    },
    [startPlayback],
  );

  const setAccent = useCallback(
    (nextAccent: EnglishAccent) => {
      playbackSettingsRef.current.accent = nextAccent;
      const defaultVoice = defaultKokoroVoice(nextAccent);
      playbackSettingsRef.current.selectedVoiceURI =
        engineModeRef.current === "kokoro" ? defaultVoice : "";
      setAccentState(nextAccent);
      setSelectedVoiceURIState(playbackSettingsRef.current.selectedVoiceURI);
      writePreference(accentKey, nextAccent);
      writePreference(voiceKey, playbackSettingsRef.current.selectedVoiceURI);
      notifySpeechPreferencesChanged();
      const playback = playbackRef.current;
      if (playback && statusRef.current !== "idle") {
        startPlayback(
          playback,
          Math.max(0, currentCharRef.current - playback.offset),
        );
      }
    },
    [startPlayback],
  );

  const setSelectedVoiceURI = useCallback(
    (uri: string) => {
      playbackSettingsRef.current.selectedVoiceURI = uri;
      setSelectedVoiceURIState(uri);
      writePreference(voiceKey, uri);
      notifySpeechPreferencesChanged();
      const playback = playbackRef.current;
      if (playback && statusRef.current !== "idle") {
        startPlayback(
          playback,
          Math.max(0, currentCharRef.current - playback.offset),
        );
      }
    },
    [startPlayback],
  );

  const syncPreferences = useCallback(() => {
    const savedRate = readPreference(rateKey);
    const savedAccent = readPreference(accentKey);
    const savedVoice = readPreference(voiceKey) ?? "";
    const savedMode = readPreference(engineKey);
    const nextRate = isSpeechRate(savedRate)
      ? (Number(savedRate) as SpeechRate)
      : 1;
    const nextAccent = isEnglishAccent(savedAccent) ? savedAccent : "en-US";
    const nextMode = isEngineMode(savedMode) ? savedMode : "browser";
    playbackSettingsRef.current = {
      rate: nextRate,
      accent: nextAccent,
      selectedVoiceURI: savedVoice,
    };
    engineModeRef.current = nextMode;
    setRateState(nextRate);
    setAccentState(nextAccent);
    setSelectedVoiceURIState(savedVoice);
    setEngineModeState(nextMode);
    if (nextMode === "kokoro") initKokoroModel();
  }, [initKokoroModel]);

  useEffect(() => {
    const refreshVoices = () => {
      setAvailableVoices(getRankedEnglishVoices(playbackSettingsRef.current.accent));
    };
    const handlePreferenceChange = () => syncPreferences();
    const handleStorageChange = (event: StorageEvent) => {
      if (
        event.key === null ||
        [rateKey, accentKey, voiceKey, engineKey].includes(event.key)
      ) {
        syncPreferences();
      }
    };

    syncPreferences();
    refreshVoices();
    window.speechSynthesis?.addEventListener("voiceschanged", refreshVoices);
    const delayedRefresh = setTimeout(refreshVoices, 250);
    setMounted(true);
    window.addEventListener(preferencesChangedEvent, handlePreferenceChange);
    window.addEventListener("storage", handleStorageChange);

    return () => {
      clearTimeout(delayedRefresh);
      window.speechSynthesis?.removeEventListener("voiceschanged", refreshVoices);
      window.removeEventListener(
        preferencesChangedEvent,
        handlePreferenceChange,
      );
      window.removeEventListener("storage", handleStorageChange);
    };
  }, [syncPreferences]);

  useEffect(
    () => () => {
      clearFallback();
      cleanupAudio();
      kokoroWarmupControllerRef.current?.abort();
      kokoroWarmupControllerRef.current = null;
      if (kokoroPollTimeoutRef.current) {
        clearTimeout(kokoroPollTimeoutRef.current);
        kokoroPollTimeoutRef.current = null;
      }
      kokoroStatusRef.current = "unloaded";
      for (const objectUrl of audioCacheRef.current.values()) {
        URL.revokeObjectURL(objectUrl);
      }
      audioCacheRef.current.clear();
      audioGenerationCacheRef.current.clear();
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    },
    [cleanupAudio, clearFallback],
  );

  useEffect(() => {
    if (!mounted) return;
    setAvailableVoices(getRankedEnglishVoices(accent));
  }, [accent, mounted]);

  return {
    status,
    activeSourceId,
    activeCharIndex,
    rate,
    accent,
    selectedVoiceURI,
    availableVoices,
    engineMode,
    kokoroStatus,
    initKokoroModel,
    setEngineMode,
    speak,
    pause,
    resume,
    stop,
    setRate,
    setAccent,
    setSelectedVoiceURI,
  };
}
