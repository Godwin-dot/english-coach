export type DictationToken = {
  type: "correct" | "substitution" | "missing" | "extra";
  expected?: string;
  actual?: string;
};

export type DictationEvaluation = {
  accuracyPct: number;
  scoreOutOf10: number;
  tokens: DictationToken[];
};

function normalizeWords(text: string): string[] {
  return (
    text
      .normalize("NFC")
      .toLocaleLowerCase("en")
      .replace(/[’‘]/gu, "'")
      .match(/[\p{L}\p{N}]+(?:'[\p{L}\p{N}]+)*/gu) ?? []
  );
}

export function evaluateDictation(
  expectedEn: string,
  userAttempt: string,
): DictationEvaluation {
  const expected = normalizeWords(expectedEn);
  const actual = normalizeWords(userAttempt);
  const rows = expected.length + 1;
  const columns = actual.length + 1;
  const lcs = Array.from({ length: rows }, () => new Uint16Array(columns));

  for (let expectedIndex = expected.length - 1; expectedIndex >= 0; expectedIndex -= 1) {
    for (let actualIndex = actual.length - 1; actualIndex >= 0; actualIndex -= 1) {
      lcs[expectedIndex][actualIndex] =
        expected[expectedIndex] === actual[actualIndex]
          ? lcs[expectedIndex + 1][actualIndex + 1] + 1
          : Math.max(
              lcs[expectedIndex + 1][actualIndex],
              lcs[expectedIndex][actualIndex + 1],
            );
    }
  }

  const matches: Array<[number, number]> = [];
  let expectedIndex = 0;
  let actualIndex = 0;
  while (expectedIndex < expected.length && actualIndex < actual.length) {
    if (expected[expectedIndex] === actual[actualIndex]) {
      matches.push([expectedIndex, actualIndex]);
      expectedIndex += 1;
      actualIndex += 1;
    } else if (lcs[expectedIndex + 1][actualIndex] >= lcs[expectedIndex][actualIndex + 1]) {
      expectedIndex += 1;
    } else {
      actualIndex += 1;
    }
  }

  const tokens: DictationToken[] = [];
  let previousExpected = 0;
  let previousActual = 0;
  const appendGap = (expectedEnd: number, actualEnd: number) => {
    const expectedGap = expected.slice(previousExpected, expectedEnd);
    const actualGap = actual.slice(previousActual, actualEnd);
    const pairedCount = Math.min(expectedGap.length, actualGap.length);
    for (let index = 0; index < pairedCount; index += 1) {
      tokens.push({
        type: "substitution",
        expected: expectedGap[index],
        actual: actualGap[index],
      });
    }
    for (let index = pairedCount; index < expectedGap.length; index += 1) {
      tokens.push({ type: "missing", expected: expectedGap[index] });
    }
    for (let index = pairedCount; index < actualGap.length; index += 1) {
      tokens.push({ type: "extra", actual: actualGap[index] });
    }
  };

  for (const [matchedExpected, matchedActual] of matches) {
    appendGap(matchedExpected, matchedActual);
    tokens.push({
      type: "correct",
      expected: expected[matchedExpected],
      actual: actual[matchedActual],
    });
    previousExpected = matchedExpected + 1;
    previousActual = matchedActual + 1;
  }
  appendGap(expected.length, actual.length);

  const correctCount = matches.length;
  const denominator = Math.max(expected.length, actual.length);
  const accuracyPct =
    denominator === 0 ? 100 : (correctCount / denominator) * 100;
  return {
    accuracyPct,
    scoreOutOf10: accuracyPct / 10,
    tokens,
  };
}
