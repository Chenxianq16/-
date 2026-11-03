import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const index = JSON.parse(
  fs.readFileSync(path.join(root, "assets/data/index.json"), "utf8")
);
const exams = index.exams.map((entry) =>
  JSON.parse(fs.readFileSync(path.join(root, "assets/data", entry.dataPath), "utf8"))
);

test("index contains the last three years of CET-6 sessions", () => {
  assert.equal(index.exams.length, 7);
  for (const session of [
    "2023-06",
    "2023-12",
    "2024-06",
    "2024-12",
    "2025-06",
    "2025-12"
  ]) {
    assert.ok(index.exams.some((exam) => exam.session === session));
  }
});

test("every exam has complete sections and questions", () => {
  for (const exam of exams) {
    assert.equal(exam.sections.length, 7);
    assert.equal(exam.questions.length, 25);
    assert.equal(
      exam.sections.reduce((sum, section) => sum + section.sentences.length, 0),
      exam.meta.sentenceCount
    );
    for (const question of exam.questions) {
      assert.equal(question.options.length, 4);
      assert.ok(question.options.some((option) => option.letter === question.correct));
    }
  }
});

test("all exam audio files are fully downloaded", () => {
  for (const exam of exams) {
    const stats = fs.statSync(path.join(root, exam.meta.audio));
    assert.ok(stats.size > 10_000_000);
  }
});
