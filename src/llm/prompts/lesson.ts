import type { CEFRLevel } from "@/schemas/lesson";

export function lessonPrompts(
  topic: string,
  cefrLevel: CEFRLevel,
): { systemPrompt: string; userPrompt: string } {
  return {
    systemPrompt: [
      "You are a thoughtful English teacher for a French-speaking learner.",
      "Return only one valid JSON object that matches the requested schema.",
      "Write natural English suitable for the requested CEFR level and translate it faithfully into French.",
      "The English passage must contain between 120 and 180 words.",
      "Choose five useful words that occur in the English passage. Give each word its contextual French translation, accurate IPA pronunciation, a natural English example, and its French translation.",
      "Write three comprehension questions in English, each with exactly four answer options, one correct answer index from 0 to 3, and an explanation in French.",
    ].join(" "),
    userPrompt: JSON.stringify({
      topic,
      cefrLevel,
      requiredShape: {
        content_en: "English passage, 120-180 words",
        content_fr: "Faithful French translation",
        keywords: [
          {
            term: "word from the passage",
            translation: "contextual French meaning",
            phonetic: "IPA",
            example: "Natural English sentence",
            example_fr: "French translation of the example",
          },
        ],
        quiz: [
          {
            question: "English comprehension question",
            options: ["Option A", "Option B", "Option C", "Option D"],
            answer_index: 0,
            explanation: "French explanation",
          },
        ],
      },
    }),
  };
}

export function buildImportLessonPrompts({
  text,
  title,
  cefrLevel,
}: {
  text: string;
  title?: string;
  cefrLevel: CEFRLevel;
}): { systemPrompt: string; userPrompt: string } {
  return {
    systemPrompt: [
      "You are a thoughtful English teacher for a French-speaking learner.",
      "Analyze the authentic English source without rewriting, shortening, or changing its meaning; the source itself must be preserved verbatim by the application.",
      "Return only one valid JSON object with exactly these top-level keys: title_en, translation_fr, key_vocab, quiz.",
      "Use the supplied title exactly when one is provided; otherwise write a clear English title of at most 160 characters.",
      "Translate the full source faithfully and fluently into French.",
      "Select 2 to 8 useful or challenging words or short expressions from the source for the learner's CEFR level. Each term must be at most 80 characters. Give a contextual French meaning, an example sentence copied from the source, and a short French mnemonic (an empty string is acceptable).",
      "Write 2 to 5 precise comprehension questions based only on the source. Each needs 2 to 4 answer options, correct_index as a zero-based JSON number, and explanation_fr as a French string (an empty string is acceptable).",
      'Follow this complete JSON example and preserve its exact key names: {"title_en":"The Tidal Archive","translation_fr":"Les marées déposent leurs archives sur le rivage.","key_vocab":[{"term":"tidal archive","translation":"archive des marées","example_sentence":"The tide left a tidal archive on the shore.","mnemonic":"Imaginez la marée qui classe ses souvenirs."},{"term":"shore","translation":"rivage","example_sentence":"The tide left a tidal archive on the shore.","mnemonic":""}],"quiz":[{"question_en":"What did the tide leave on the shore?","options":["A tidal archive","A wooden boat"],"correct_index":0,"explanation_fr":"Le texte dit que la marée a laissé une archive."},{"question_en":"Where was the archive left?","options":["On the shore","In a forest"],"correct_index":0,"explanation_fr":"L’archive est laissée sur le rivage."}]}',
    ].join(" "),
    userPrompt: JSON.stringify({
      cefrLevel,
      title: title || null,
      sourceText: text,
      requiredShape: {
        title_en: "Clear English title",
        translation_fr: "Faithful, natural French translation of the full text",
        key_vocab: [
          {
            term: "One to three words taken from the source",
            translation: "Contextual French meaning",
            example_sentence: "An unchanged sentence excerpt from the source",
            example_sentence_fr: "French translation of the example sentence",
            mnemonic: "Concise French memory aid",
          },
        ],
        quiz: [
          {
            question_en: "Precise question about the source",
            options: ["Option A", "Option B", "Option C"],
            correct_index: 0,
            explanation_fr: "Brief explanation grounded in the source",
          },
        ],
      },
      exampleJson: {
        title_en: "The Tidal Archive",
        translation_fr: "Les marées déposent leurs archives sur le rivage.",
        key_vocab: [
          {
            term: "tidal archive",
            translation: "archive des marées",
            example_sentence: "The tide left a tidal archive on the shore.",
            mnemonic: "Imaginez la marée qui classe ses souvenirs.",
          },
          {
            term: "shore",
            translation: "rivage",
            example_sentence: "The tide left a tidal archive on the shore.",
            mnemonic: "",
          },
        ],
        quiz: [
          {
            question_en: "What did the tide leave on the shore?",
            options: ["A tidal archive", "A wooden boat"],
            correct_index: 0,
            explanation_fr: "Le texte dit que la marée a laissé une archive.",
          },
          {
            question_en: "Where was the archive left?",
            options: ["On the shore", "In a forest"],
            correct_index: 0,
            explanation_fr: "L’archive est laissée sur le rivage.",
          },
        ],
      },
    }),
  };
}
