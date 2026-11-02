import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const exam = JSON.parse(
  fs.readFileSync(path.join(root, "assets/data/exam.json"), "utf8")
);

test("exam contains one complete listening set", () => {
  assert.equal(exam.sections.length, 7);
  assert.equal(exam.questions.length, 25);
  assert.equal(exam.meta.sentenceCount, 167);
  assert.equal(exam.sections.reduce((sum, section) => sum + section.sentences.length, 0), 167);
});

test("every question has four options and a valid answer", () => {
  for (const question of exam.questions) {
    assert.equal(question.options.length, 4);
    assert.ok(question.options.some((option) => option.letter === question.correct));
  }
});

test("audio file exists and is larger than a Git LFS pointer", () => {
  const audioPath = path.join(root, exam.meta.audio);
  const stats = fs.statSync(audioPath);
  assert.ok(stats.size > 20_000_000);
});
