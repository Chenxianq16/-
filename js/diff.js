function tokenize(text) {
  const normalized = String(text || "")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[—–]/g, "-");

  return normalized
    .match(/[A-Za-z]+(?:'[A-Za-z]+)?|\d+(?:[.,]\d+)*%?/g)
    ?.map((raw) => ({
      raw,
      normalized: raw.toLowerCase().replace(/[,%]$/g, "")
    })) || [];
}

function alignTokens(expected, actual) {
  const rows = expected.length + 1;
  const cols = actual.length + 1;
  const table = Array.from({ length: rows }, () => Array(cols).fill(0));

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      table[i][j] =
        expected[i - 1].normalized === actual[j - 1].normalized
          ? table[i - 1][j - 1] + 1
          : Math.max(table[i - 1][j], table[i][j - 1]);
    }
  }

  const matches = [];
  let i = expected.length;
  let j = actual.length;
  while (i > 0 && j > 0) {
    if (expected[i - 1].normalized === actual[j - 1].normalized) {
      matches.push([i - 1, j - 1]);
      i -= 1;
      j -= 1;
    } else if (table[i - 1][j] >= table[i][j - 1]) {
      i -= 1;
    } else {
      j -= 1;
    }
  }

  return matches.reverse();
}

export function diffWords(expectedText, actualText) {
  const expected = tokenize(expectedText);
  const actual = tokenize(actualText);
  const matches = alignTokens(expected, actual);
  const tokens = [];
  const usedExpected = new Set(matches.map(([index]) => index));
  const usedActual = new Set(matches.map(([, index]) => index));
  let previousExpected = -1;
  let previousActual = -1;
  let matched = 0;

  const pushUnmatchedGap = (expectedEnd, actualEnd) => {
    const missing = [];
    const extra = [];
    for (let index = previousExpected + 1; index < expectedEnd; index += 1) {
      missing.push(index);
    }
    for (let index = previousActual + 1; index < actualEnd; index += 1) {
      extra.push(index);
    }
    const replacements = Math.min(missing.length, extra.length);
    const expectedReplacementStart = missing.length - replacements;
    const actualReplacementStart = extra.length - replacements;

    for (const index of missing.slice(0, expectedReplacementStart)) {
      tokens.push({
        status: "missing",
        expected: expected[index].raw,
        actual: ""
      });
    }
    for (const index of extra.slice(0, actualReplacementStart)) {
      tokens.push({
        status: "extra",
        expected: "",
        actual: actual[index].raw
      });
    }
    for (let index = 0; index < replacements; index += 1) {
      const missingIndex = missing[expectedReplacementStart + index];
      const extraIndex = extra[actualReplacementStart + index];
      tokens.push({
        status: "wrong",
        expected: expected[missingIndex].raw,
        actual: actual[extraIndex].raw
      });
    }
  };

  for (const [expectedIndex, actualIndex] of matches) {
    pushUnmatchedGap(expectedIndex, actualIndex);
    tokens.push({
      status: "correct",
      expected: expected[expectedIndex].raw,
      actual: actual[actualIndex].raw
    });
    matched += 1;
    previousExpected = expectedIndex;
    previousActual = actualIndex;
  }
  pushUnmatchedGap(expected.length, actual.length);

  const wrong = tokens.filter((token) => token.status === "wrong").length;
  const missing = tokens.filter((token) => token.status === "missing").length;
  const extra = tokens.filter((token) => token.status === "extra").length;
  const score = expected.length ? Math.round((matched / expected.length) * 100) : 0;

  return {
    tokens,
    expected,
    actual,
    matched,
    wrong,
    missing,
    extra,
    score,
    unmatchedExpected: expected
      .filter((_, index) => !usedExpected.has(index))
      .map((token) => token.raw),
    unmatchedActual: actual
      .filter((_, index) => !usedActual.has(index))
      .map((token) => token.raw)
  };
}

export function buildDiffSummary(diff) {
  return {
    score: diff.score,
    matchedWords: diff.matched,
    wrongWords: diff.wrong,
    missingWords: diff.missing,
    extraWords: diff.extra,
    missedExpectedWords: [...new Set(diff.unmatchedExpected)].slice(0, 20),
    unexpectedInputWords: [...new Set(diff.unmatchedActual)].slice(0, 20)
  };
}
