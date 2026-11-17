export type EnglishAccent = "en-US" | "en-GB";

export type SpeechToken = {
  text: string;
  isWord: boolean;
  startChar: number;
  endChar: number;
};

export type SpeechSentence = {
  text: string;
  startChar: number;
  endChar: number;
};

const wordPattern = /[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu;
const premiumVoicePattern = /natural|online|neural|google|premium|enhanced/iu;
const roboticVoicePattern = /espeak|robot|synthetic|compact/iu;

export function scoreEnglishVoice(
  voice: SpeechSynthesisVoice,
  preferredAccent: EnglishAccent = "en-US",
): number {
  const name = voice.name.toLocaleLowerCase();
  const language = voice.lang.toLocaleLowerCase();
  let score = 0;

  if (premiumVoicePattern.test(name)) score += 100;
  if (voice.localService) score += 5;
  if (language === preferredAccent.toLocaleLowerCase()) score += 40;
  else if (language.startsWith(preferredAccent.slice(0, 2).toLocaleLowerCase())) {
    score += 15;
  }
  if (voice.default) score += 3;
  if (roboticVoicePattern.test(name)) score -= 100;

  return score;
}

export function getRankedEnglishVoices(
  preferredAccent: EnglishAccent = "en-US",
): SpeechSynthesisVoice[] {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return [];
  }

  return window.speechSynthesis
    .getVoices()
    .filter((voice) => voice.lang.toLocaleLowerCase().startsWith("en"))
    .sort(
      (left, right) =>
        scoreEnglishVoice(right, preferredAccent) -
        scoreEnglishVoice(left, preferredAccent),
    );
}

export function tokenizeTextForSpeech(text: string): SpeechToken[] {
  const tokens: SpeechToken[] = [];
  let cursor = 0;

  for (const match of text.matchAll(wordPattern)) {
    const word = match[0];
    const startChar = match.index ?? 0;
    if (startChar > cursor) {
      tokens.push({
        text: text.slice(cursor, startChar),
        isWord: false,
        startChar: cursor,
        endChar: startChar,
      });
    }
    tokens.push({
      text: word,
      isWord: true,
      startChar,
      endChar: startChar + word.length,
    });
    cursor = startChar + word.length;
  }

  if (cursor < text.length) {
    tokens.push({
      text: text.slice(cursor),
      isWord: false,
      startChar: cursor,
      endChar: text.length,
    });
  }

  return tokens;
}

export function splitSentencesWithOffsets(text: string): SpeechSentence[] {
  const sentences: SpeechSentence[] = [];
  const sentencePattern = /[^.!?]+(?:[.!?]+["'”’)\]]*)?(?:\s+|$)/gu;

  for (const match of text.matchAll(sentencePattern)) {
    const value = match[0];
    const matchStart = match.index ?? 0;
    const leadingWhitespace = value.match(/^\s*/u)?.[0].length ?? 0;
    const trailingWhitespace = value.match(/\s*$/u)?.[0].length ?? 0;
    const startChar = matchStart + leadingWhitespace;
    const endChar = matchStart + value.length - trailingWhitespace;
    if (endChar > startChar) {
      sentences.push({
        text: text.slice(startChar, endChar),
        startChar,
        endChar,
      });
    }
  }

  return sentences;
}
