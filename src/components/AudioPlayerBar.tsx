"use client";

import type { SpeechEngine, SpeechRate } from "@/hooks/useSpeechEngine";

const rates: SpeechRate[] = [0.75, 1, 1.2];

export function AudioPlayerBar({
  engine,
  text,
  sourceId,
  mode = "full",
  rates: visibleRates = rates,
  className = "",
}: {
  engine: SpeechEngine;
  text: string;
  sourceId: string;
  mode?: "full" | "compact";
  rates?: SpeechRate[];
  className?: string;
}) {
  const isCurrentSource = engine.activeSourceId === sourceId;
  const isPlaying = isCurrentSource && engine.status === "playing";
  const isPaused = isCurrentSource && engine.status === "paused";

  function togglePlayback() {
    if (isPlaying) {
      engine.pause();
    } else if (isPaused) {
      engine.resume();
    } else {
      engine.speak(text, sourceId);
    }
  }

  return (
    <div
      className={`flex min-w-0 flex-wrap items-center gap-2 rounded-xl border border-white/[0.08] bg-[#0E0E11] px-3 py-2 ${className}`}
      aria-label="Lecteur vocal"
    >
      <button
        type="button"
        onClick={togglePlayback}
        disabled={!text.trim()}
        aria-label={
          isPlaying
            ? "Mettre en pause"
            : isPaused
              ? "Reprendre la lecture"
              : "Écouter"
        }
        className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-white px-4 text-sm font-medium text-zinc-950 transition-all duration-150 hover:bg-zinc-200 active:scale-[0.985] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-200 disabled:opacity-40"
      >
        <span aria-hidden="true">{isPlaying ? "Ⅱ" : "▶"}</span>
        {isPlaying ? "Pause" : isPaused ? "Reprendre" : "Écouter"}
      </button>

      {isCurrentSource && engine.status !== "idle" ? (
        <button
          type="button"
          onClick={engine.stop}
          className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/[0.1] bg-white/[0.035] px-3 text-xs text-zinc-300 transition-all duration-150 hover:bg-white/[0.08] active:scale-[0.985] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-200"
        >
          Stop
        </button>
      ) : null}

      <div
        role="group"
        aria-label="Vitesse de lecture"
        className="flex min-h-11 items-center gap-1 rounded-full border border-white/[0.07] bg-black/20 p-1"
      >
        {visibleRates.map((rate) => (
          <button
            key={rate}
            type="button"
            aria-pressed={engine.rate === rate}
            onClick={() => engine.setRate(rate)}
            className={`min-h-9 min-w-11 rounded-full px-2 text-xs tabular-nums transition-all duration-150 active:scale-[0.985] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-amber-200 ${
              engine.rate === rate
                ? "bg-white/[0.12] font-medium text-white"
                : "text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-200"
            }`}
          >
            {rate}x
          </button>
        ))}
      </div>

      {mode === "full" ? (
        <>
          <label className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/[0.07] px-3 text-xs text-zinc-400">
            Accent
            <select
              aria-label="Accent anglais"
              value={engine.accent}
              onChange={(event) =>
                engine.setAccent(event.target.value as "en-US" | "en-GB")
              }
              className="min-h-9 bg-transparent font-medium text-zinc-100 outline-none focus-visible:text-white"
            >
              <option value="en-US">US</option>
              <option value="en-GB">GB</option>
            </select>
          </label>
          <label className="inline-flex min-h-11 min-w-0 max-w-full items-center gap-2 rounded-full border border-white/[0.07] px-3 text-xs text-zinc-400">
            Voix
            <select
              aria-label="Voix anglaise"
              value={
                engine.availableVoices.some(
                  (voice) => voice.voiceURI === engine.selectedVoiceURI,
                )
                  ? engine.selectedVoiceURI
                  : ""
              }
              onChange={(event) =>
                engine.setSelectedVoiceURI(event.target.value)
              }
              className="min-h-9 min-w-0 max-w-[190px] bg-transparent text-xs text-zinc-100 outline-none focus-visible:text-white"
            >
              <option value="">Recommandée</option>
              {engine.availableVoices.map((voice) => (
                <option key={voice.voiceURI} value={voice.voiceURI}>
                  {voice.name} · {voice.lang}
                </option>
              ))}
            </select>
          </label>
        </>
      ) : null}
    </div>
  );
}
