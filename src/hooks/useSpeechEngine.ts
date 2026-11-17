"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getRankedEnglishVoices,
  type EnglishAccent,
} from "@/lib/speech";

export type SpeechRate = 0.75 | 1 | 1.2;
export type SpeechStatus = "idle" | "playing" | "paused";

export type SpeechEngine = {
  status: SpeechStatus;
  activeSourceId: string | null;
  activeCharIndex: number | null;
  rate: SpeechRate;
  accent: EnglishAccent;
  selectedVoiceURI: string;
  availableVoices: SpeechSynthesisVoice[];
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

function isSpeechRate(value: string | null): value is `${SpeechRate}` {
  return value === "0.75" || value === "1" || value === "1.2";
}

function isEnglishAccent(value: string | null): value is EnglishAccent {
  return value === "en-US" || value === "en-GB";
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
  const playbackRef = useRef<Playback | null>(null);
  const generationRef = useRef(0);
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

  const clearFallback = useCallback(() => {
    if (fallbackTimeoutRef.current) clearTimeout(fallbackTimeoutRef.current);
    if (fallbackIntervalRef.current) clearInterval(fallbackIntervalRef.current);
    fallbackTimeoutRef.current = null;
    fallbackIntervalRef.current = null;
  }, []);

  const stop = useCallback(() => {
    generationRef.current += 1;
    clearFallback();
    playbackRef.current = null;
    currentCharRef.current = 0;
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setStatus("idle");
    setActiveSourceId(null);
    setActiveCharIndex(null);
  }, [clearFallback]);

  const startPlayback = useCallback(
    (playback: Playback, startAt: number, nextRate?: SpeechRate) => {
      if (
        typeof window === "undefined" ||
        !("speechSynthesis" in window) ||
        startAt >= playback.text.length
      ) {
        stop();
        return;
      }

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
      utterance.rate = nextRate ?? settings.rate;
      if (selectedVoice) utterance.voice = selectedVoice;

      playbackRef.current = playback;
      const generation = generationRef.current + 1;
      generationRef.current = generation;
      playbackStartedAtRef.current = Date.now();
      currentCharRef.current = playback.offset + startAt;
      boundaryReceivedRef.current = false;
      setActiveSourceId(playback.sourceId);
      setActiveCharIndex(playback.offset + startAt);
      setStatus("playing");

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
        setStatus("idle");
        setActiveSourceId(null);
        setActiveCharIndex(null);
      };
      utterance.onerror = (event) => {
        if (generationRef.current !== generation) return;
        if (event.error === "canceled" || event.error === "interrupted") return;
        clearFallback();
        playbackRef.current = null;
        setStatus("idle");
        setActiveSourceId(null);
        setActiveCharIndex(null);
      };

      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);

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
            ((playback.text.length - startAt) * 55) / playbackSettingsRef.current.rate,
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
    [clearFallback, stop],
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

  const pause = useCallback(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    clearFallback();
    window.speechSynthesis.pause();
    setStatus("paused");
  }, [clearFallback]);

  const resume = useCallback(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const playback = playbackRef.current;
    if (playback) {
      startPlayback(
        playback,
        Math.max(0, currentCharRef.current - playback.offset),
      );
    } else {
      window.speechSynthesis.resume();
      setStatus("playing");
    }
  }, [startPlayback]);

  const setRate = useCallback(
    (nextRate: SpeechRate) => {
      playbackSettingsRef.current.rate = nextRate;
      setRateState(nextRate);
      writePreference(rateKey, String(nextRate));
      const playback = playbackRef.current;
      if (playback && status !== "idle") {
        startPlayback(
          playback,
          Math.max(0, currentCharRef.current - playback.offset),
          nextRate,
        );
      }
    },
    [startPlayback, status],
  );

  const setAccent = useCallback(
    (nextAccent: EnglishAccent) => {
      playbackSettingsRef.current.accent = nextAccent;
      playbackSettingsRef.current.selectedVoiceURI = "";
      setAccentState(nextAccent);
      setSelectedVoiceURIState("");
      writePreference(accentKey, nextAccent);
      writePreference(voiceKey, "");
      const playback = playbackRef.current;
      if (playback && status !== "idle") {
        startPlayback(
          playback,
          Math.max(0, currentCharRef.current - playback.offset),
        );
      }
    },
    [startPlayback, status],
  );

  const setSelectedVoiceURI = useCallback(
    (uri: string) => {
      playbackSettingsRef.current.selectedVoiceURI = uri;
      setSelectedVoiceURIState(uri);
      writePreference(voiceKey, uri);
      const playback = playbackRef.current;
      if (playback && status !== "idle") {
        startPlayback(
          playback,
          Math.max(0, currentCharRef.current - playback.offset),
        );
      }
    },
    [startPlayback, status],
  );

  useEffect(() => {
    const savedRate = readPreference(rateKey);
    const savedAccent = readPreference(accentKey);
    const savedVoice = readPreference(voiceKey) ?? "";
    const nextRate = isSpeechRate(savedRate) ? Number(savedRate) as SpeechRate : 1;
    const nextAccent = isEnglishAccent(savedAccent) ? savedAccent : "en-US";
    playbackSettingsRef.current = {
      rate: nextRate,
      accent: nextAccent,
      selectedVoiceURI: savedVoice,
    };
    setRateState(nextRate);
    setAccentState(nextAccent);
    setSelectedVoiceURIState(savedVoice);

    const refreshVoices = () => {
      setAvailableVoices(getRankedEnglishVoices(playbackSettingsRef.current.accent));
    };
    refreshVoices();
    window.speechSynthesis?.addEventListener("voiceschanged", refreshVoices);
    const delayedRefresh = setTimeout(refreshVoices, 250);
    setMounted(true);

    return () => {
      clearTimeout(delayedRefresh);
      window.speechSynthesis?.removeEventListener("voiceschanged", refreshVoices);
    };
  }, []);

  useEffect(
    () => () => {
      clearFallback();
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    },
    [clearFallback],
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
    speak,
    pause,
    resume,
    stop,
    setRate,
    setAccent,
    setSelectedVoiceURI,
  };
}
