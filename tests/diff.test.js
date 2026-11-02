import assert from "node:assert/strict";
import test from "node:test";
import { buildDiffSummary, diffWords } from "../js/diff.js";

test("word-level diff marks exact matches", () => {
  const result = diffWords(
    "The manager wants to conduct an interview.",
    "The manager wants to conduct an interview."
  );
  assert.equal(result.score, 100);
  assert.equal(result.wrong, 0);
  assert.equal(result.missing, 0);
  assert.equal(result.extra, 0);
});

test("word-level diff distinguishes missing and extra words", () => {
  const result = diffWords(
    "The government passed new legislation yesterday.",
    "The government passed a new law yesterday quickly"
  );
  assert.equal(result.score, 83);
  assert.equal(result.wrong, 1);
  assert.equal(result.missing, 0);
  assert.equal(result.extra, 2);
  assert.ok(result.unmatchedExpected.includes("legislation"));
  assert.ok(result.unmatchedActual.includes("law"));
  assert.deepEqual(buildDiffSummary(result).missedExpectedWords.includes("legislation"), true);
});

test("punctuation and capitalization do not reduce the score", () => {
  const result = diffWords(
    "It's a small industry, after all.",
    "it’s a small industry, after-all!"
  );
  assert.equal(result.score, 100);
});
