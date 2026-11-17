"use client";

import type { SpeechEngine, SpeechRate } from "@/hooks/useSpeechEngine";
import { KOKORO_VOICES } from "@/lib/speech";

const rates: SpeechRate[] = [0.75, 1, 1.2];

function AudioRateControls({
  engine,
  visibleRates,
}: {
  engine: SpeechEngine;
  visibleRates: SpeechRate[];
}) {
  return (
    <div
      role="group"
      aria-label="Vitesse de lecture"
      className="flex min-h-11 items-center gap-1 rounded-full border border-white/[0.08] bg-[#0A0A0A] p-1"
    >
      {visibleRates.map((rate) => (
        <button
          key={rate}
          type="button"
          aria-pressed={engine.rate === rate}
          onClick={() => engine.setRate(rate)}
          className={`min-h-9 min-w-11 rounded-full px-2 font-mono text-xs tabular-nums transition-colors duration-150 active:scale-[0.985] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-white ${
            engine.rate === rate
              ? "bg-[#171717] font-medium text-[#EDEDED]"
              : "text-zinc-400 hover:bg-[#111111] hover:text-zinc-200"
          }`}
        >
          {rate}x
        </button>
      ))}
    </div>
  );
}

function AudioSettingsControls({
  engine,
  visibleRates,
}: {
  engine: SpeechEngine;
  visibleRates: SpeechRate[];
}) {
  return (
    <>
      <AudioRateControls engine={engine} visibleRates={visibleRates} />
      <div
        role="group"
        aria-label="Moteur vocal"
        className="flex min-h-11 items-center gap-1 rounded-full border border-white/[0.08] bg-[#0A0A0A] p-1"
      >
        <button
          type="button"
          aria-pressed={engine.engineMode === "browser"}
          onClick={() => engine.setEngineMode("browser")}
          className={`min-h-9 rounded-full px-3 text-xs transition-colors duration-150 active:scale-[0.985] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-white ${
            engine.engineMode === "browser"
              ? "bg-[#171717] font-medium text-[#EDEDED]"
              : "text-zinc-400 hover:bg-[#111111] hover:text-zinc-200"
          }`}
        >
          Navigateur
        </button>
        <button
          type="button"
          aria-pressed={engine.engineMode === "kokoro"}
          onClick={() => engine.setEngineMode("kokoro")}
          className={`min-h-9 rounded-full px-3 text-xs transition-colors duration-150 active:scale-[0.985] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-white ${
            engine.engineMode === "kokoro"
              ? "bg-[#171717] font-medium text-[#EDEDED]"
              : "text-zinc-400 hover:bg-[#111111] hover:text-zinc-200"
          }`}
        >
          <span
            aria-hidden="true"
            className={`mr-1.5 inline-block size-1.5 rounded-full ${
              engine.kokoroStatus === "ready"
                ? "bg-emerald-400"
                : engine.kokoroStatus === "loading"
                  ? "bg-[#FBBF24]"
                  : "bg-zinc-500"
            }`}
          />
          Kokoro Studio (Local)
        </button>
      </div>
      {engine.engineMode === "kokoro" && engine.kokoroStatus !== "ready" ? (
        <div className="flex min-h-11 min-w-0 items-center gap-3 text-xs text-zinc-300">
          {engine.kokoroStatus === "loading" ? (
            <span>Chargement de Kokoro Studio (Local)…</span>
          ) : engine.kokoroStatus === "error" ? (
            <>
              <span>Kokoro Studio (Local) indisponible. Le navigateur est disponible.</span>
              <button
                type="button"
                onClick={engine.initKokoroModel}
                className="min-h-11 shrink-0 rounded-full border border-white/[0.12] bg-[#0A0A0A] px-3 text-xs text-[#EDEDED] transition-colors duration-150 hover:border-white/[0.22] hover:bg-[#141414] active:scale-[0.985] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                Réessayer
              </button>
            </>
          ) : (
            <span>            Modèle local, environ 80 Mo.</span>
          )}
        </div>
      ) : null}
      <label className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/[0.08] px-3 text-xs text-zinc-400">
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
      <label className="inline-flex min-h-11 min-w-0 max-w-full items-center gap-2 rounded-full border border-white/[0.08] px-3 text-xs text-zinc-400">
        Voix
        <select
          aria-label="Voix anglaise"
          value={
            engine.engineMode === "kokoro"
              ? KOKORO_VOICES.some(
                  (voice) => voice.id === engine.selectedVoiceURI,
                )
                ? engine.selectedVoiceURI
                : engine.accent === "en-GB"
                  ? "bf_emma"
                  : "af_heart"
              : engine.availableVoices.some(
                    (voice) => voice.voiceURI === engine.selectedVoiceURI,
                  )
                ? engine.selectedVoiceURI
                : ""
          }
          onChange={(event) => engine.setSelectedVoiceURI(event.target.value)}
          className="min-h-9 min-w-0 max-w-[190px] bg-transparent text-xs text-zinc-100 outline-none focus-visible:text-white"
        >
          {engine.engineMode === "kokoro" ? (
            KOKORO_VOICES.map((voice) => (
              <option key={voice.id} value={voice.id}>
                {voice.label}
              </option>
            ))
          ) : (
            <>
              <option value="">Recommandée</option>
              {engine.availableVoices.map((voice) => (
                <option key={voice.voiceURI} value={voice.voiceURI}>
                  {voice.name} · {voice.lang}
                </option>
              ))}
            </>
          )}
        </select>
      </label>
    </>
  );
}

export function AudioPlayerBar({
  engine,
  text = "",
  sourceId = "",
  compact = false,
  mode = "full",
  rates: visibleRates = rates,
  className = "",
}: {
  engine: SpeechEngine;
  text?: string;
  sourceId?: string;
  compact?: boolean;
  mode?: "full" | "compact";
  rates?: SpeechRate[];
  className?: string;
}) {
  const isCurrentSource = engine.activeSourceId === sourceId;
  const isPlaying = isCurrentSource && engine.status === "playing";
  const isPaused = isCurrentSource && engine.status === "paused";

  if (compact) {
    return (
      <div
        className={`flex w-full min-w-0 flex-wrap items-center gap-2 rounded-xl border border-white/[0.08] bg-[#0A0A0A] px-3 py-2 ${className}`}
        aria-label="Réglages audio partagés"
      >
        <AudioSettingsControls engine={engine} visibleRates={rates} />
        {engine.status !== "idle" ? (
          <button
            type="button"
            onClick={engine.stop}
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/[0.12] bg-[#0A0A0A] px-3 text-xs text-zinc-300 transition-colors duration-150 hover:border-white/[0.22] hover:bg-[#141414] active:scale-[0.985] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            Arrêter
          </button>
        ) : null}
      </div>
    );
  }

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
      className={`flex min-w-0 flex-wrap items-center gap-2 rounded-xl border border-white/[0.08] bg-[#0A0A0A] px-3 py-2 ${className}`}
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
        className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-[#EDEDED] px-4 text-sm font-medium text-[#0A0A0A] transition-colors duration-150 hover:bg-white active:scale-[0.985] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-40"
      >
        <span aria-hidden="true">{isPlaying ? "Ⅱ" : "▶"}</span>
        {isPlaying ? "Pause" : isPaused ? "Reprendre" : "Écouter"}
      </button>

      {isCurrentSource && engine.status !== "idle" ? (
        <button
          type="button"
          onClick={engine.stop}
          className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/[0.12] bg-[#0A0A0A] px-3 text-xs text-zinc-300 transition-colors duration-150 hover:border-white/[0.22] hover:bg-[#141414] active:scale-[0.985] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          Arrêter
        </button>
      ) : null}
      {mode !== "full" ? (
        <AudioRateControls engine={engine} visibleRates={visibleRates} />
      ) : null}

      {mode === "full" ? (
        <AudioSettingsControls engine={engine} visibleRates={visibleRates} />
      ) : null}
    </div>
  );
}
