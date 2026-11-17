import { randomUUID } from "node:crypto";
import { db } from "@/db";
import { activityLog, mistakes } from "@/db/schema";
import { getLLMProvider } from "@/llm/provider";
import {
  PronunciationExerciseSchema,
  PronunciationExerciseContentOutputSchema,
  type PronunciationExercise,
  type PronunciationFocus,
} from "@/schemas/speak";
import type { CEFRLevel } from "@/schemas/lesson";

const localExercises: Record<
  PronunciationFocus,
  Omit<PronunciationExercise, "id">
> = {
  general: {
    sentence_en:
      "Could you send me the latest version before the team meeting?",
    translation_fr:
      "Peux-tu m’envoyer la dernière version avant la réunion d’équipe ?",
    phonetic_tip_fr:
      "Liez « could you » en un mouvement fluide, sans détacher les deux mots.",
    target_sounds: ["could you", "team meeting"],
  },
  "th-sounds": {
    sentence_en: "I thought the weather would be warmer this Thursday.",
    translation_fr:
      "Je pensais qu’il ferait plus chaud ce jeudi.",
    phonetic_tip_fr:
      "Le « th » de « thought » est sourd; celui de « the » et « weather » est sonore.",
    target_sounds: ["thought", "the", "weather", "Thursday"],
  },
  contractions: {
    sentence_en: "I've already told them we can't finish it tonight.",
    translation_fr:
      "Je leur ai déjà dit que nous ne pouvions pas terminer ce soir.",
    phonetic_tip_fr:
      "Prononcez les contractions comme un seul groupe : « I've » et « can't ».",
    target_sounds: ["I've", "can't", "tonight"],
  },
  vowels: {
    sentence_en: "The team needs a clear answer before Friday.",
    translation_fr:
      "L’équipe a besoin d’une réponse claire avant vendredi.",
    phonetic_tip_fr:
      "Allongez la voyelle de « team » et distinguez-la de celle de « needs ».",
    target_sounds: ["team", "needs", "clear"],
  },
  "tech-pitch": {
    sentence_en:
      "Our platform helps small teams ship reliable updates faster.",
    translation_fr:
      "Notre plateforme aide les petites équipes à publier des mises à jour fiables plus rapidement.",
    phonetic_tip_fr:
      "Placez l’accent sur « platform », « reliable » et « faster ».",
    target_sounds: ["platform", "reliable", "updates"],
  },
};

function buildPronunciationPrompts(
  cefrLevel: CEFRLevel,
  focus: PronunciationFocus,
): { systemPrompt: string; userPrompt: string } {
  return {
    systemPrompt: [
      "You are an English pronunciation coach for a French-speaking learner.",
      "Return only one valid JSON object matching the requested schema.",
      "Write one natural, useful English sentence suited to the learner's CEFR level and pronunciation focus.",
      "Provide a faithful French translation, one concise practical pronunciation tip in French, and one to four sounds or expressions to focus on.",
      "Keep the sentence between 8 and 18 spoken words.",
    ].join(" "),
    userPrompt: JSON.stringify({
      cefrLevel,
      focus,
      requiredShape: {
        sentence_en: "Natural English sentence with 8-18 words",
        translation_fr: "Faithful French translation",
        phonetic_tip_fr: "Short practical pronunciation tip in French",
        target_sounds: ["One to four sounds or expressions to practice"],
      },
    }),
  };
}

export async function generatePronunciationPrompt({
  cefrLevel,
  focus,
}: {
  cefrLevel: CEFRLevel;
  focus: PronunciationFocus;
}): Promise<PronunciationExercise> {
  const prompts = buildPronunciationPrompts(cefrLevel, focus);
  try {
    const generated = await getLLMProvider().generateStructuredJSON(
      prompts.systemPrompt,
      prompts.userPrompt,
      PronunciationExerciseContentOutputSchema,
    );
    const wordCount =
      generated.sentence_en.match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu)
        ?.length ?? 0;
    if (wordCount < 8 || wordCount > 18) {
      throw new Error("La phrase doit contenir entre 8 et 18 mots.");
    }
    return PronunciationExerciseSchema.parse({
      ...generated,
      id: randomUUID(),
    });
  } catch (error) {
    console.warn("[speak:generate] Utilisation de la phrase locale :", error);
    return PronunciationExerciseSchema.parse({
      ...localExercises[focus],
      id: randomUUID(),
    });
  }
}

export function recordPronunciationAttempt({
  sentenceEn,
  spokenText,
  accuracyPct,
}: {
  sentenceEn: string;
  spokenText: string;
  accuracyPct: number;
}): void {
  const now = new Date().toISOString();
  const score = Math.round((accuracyPct / 10) * 10) / 10;

  db.transaction((transaction) => {
    transaction
      .insert(activityLog)
      .values({
        kind: "drill_eval",
        score,
        durationS: 25,
        metaJson: JSON.stringify({
          mode: "pronunciation",
          sentenceEn,
          spokenText,
        }),
        createdAt: now,
      })
      .run();

    if (accuracyPct < 75) {
      transaction
        .insert(mistakes)
        .values({
          source: "drill",
          userText: spokenText,
          correction: sentenceEn,
          category: "Prononciation",
          explanation: `Précision de ${Math.round(accuracyPct)} % sur la phrase modèle.`,
          createdAt: now,
        })
        .run();
    }
  });
}
