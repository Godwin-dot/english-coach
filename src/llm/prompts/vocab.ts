import type { CEFRLevel } from "@/schemas/lesson";

const discoveryAngles = [
  "everyday errands, city life, and making plans",
  "workplace collaboration, tools, and problem-solving",
  "travel, local culture, and navigating new places",
  "food, health, routines, and personal choices",
  "nature, science, and describing change",
  "feelings, relationships, and precise descriptions",
] as const;

export function buildDiscoverVocabPrompts({
  count,
  cefrLevel,
  interests,
  excludedTerms,
}: {
  count: number;
  cefrLevel: CEFRLevel;
  interests: string[];
  excludedTerms: string[];
}): { systemPrompt: string; userPrompt: string } {
  const discoveryAngle =
    discoveryAngles[Math.floor(Math.random() * discoveryAngles.length)];

  return {
    systemPrompt: [
      "You are an expert English vocabulary coach for French-speaking learners.",
      "Return only one valid JSON object matching the requested schema.",
      `Generate exactly ${count} useful, varied English words or very short expressions, each one or two words maximum, for a CEFR ${cefrLevel} learner.`,
      "Never use a clause, sentence, inflected definition, or punctuation-ending phrase as a term.",
      "Create a balanced mix of indispensable general vocabulary, at least one phrasal verb, a precise adjective, and a term naturally related to the learner's interests when possible.",
      `For this batch, use a fresh thematic angle centered on ${discoveryAngle}; do not make all terms synonyms or from the same narrow topic.`,
      "Choose practical terms that are different from the excluded list, and avoid obvious substitutions or spelling variants of excluded terms.",
      "Write concise French translations and natural, complete English example sentences with faithful French translations.",
      "Set part_of_speech to a concise French label such as nom, verbe, adjectif, adverbe, or verbe à particule. Make mnemonic a short, useful French memory cue.",
    ].join(" "),
    userPrompt: JSON.stringify({
      count,
      cefrLevel,
      interests,
      excludedTerms,
      requiredShape: {
        words: Array.from({ length: count }, () => ({
          term: "One isolated English word or expression of at most 2 words",
          translation: "Concise French meaning",
          part_of_speech: "Short French grammatical category",
          example_sentence: "Natural, complete English example using this term",
          example_translation: "Faithful French translation of the example",
          mnemonic: "Short French memory cue",
        })),
      },
    }),
  };
}
