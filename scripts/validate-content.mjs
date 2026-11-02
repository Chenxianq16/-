import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataPath = path.join(root, "assets/data/exam.json");
const exam = JSON.parse(fs.readFileSync(dataPath, "utf8"));

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

assert(exam.sections.length === 7, "Expected 7 listening sections.");
assert(exam.questions.length === 25, "Expected 25 questions.");
assert(exam.meta.sentenceCount === 167, "Expected 167 transcript sentences.");
assert(new Set(exam.questions.map((question) => question.id)).size === 25, "Duplicate question id.");
assert(new Set(exam.sections.map((section) => section.id)).size === 7, "Duplicate section id.");

for (const section of exam.sections) {
  assert(section.questions.length > 0, `${section.id} has no questions.`);
  assert(section.sentences.length > 0, `${section.id} has no sentences.`);
  assert(section.start < section.end, `${section.id} has an invalid audio range.`);

  for (const [index, sentence] of section.sentences.entries()) {
    assert(sentence.text, `${section.id} sentence ${index + 1} has no English text.`);
    assert(sentence.translationZh, `${section.id} sentence ${index + 1} has no translation.`);
    assert(sentence.start >= 0, `${section.id} sentence ${index + 1} has a negative start.`);
    assert(sentence.end > sentence.start, `${section.id} sentence ${index + 1} has an invalid range.`);
    if (index > 0) {
      assert(
        sentence.start >= section.sentences[index - 1].start,
        `${section.id} sentence timings are out of order.`
      );
    }
  }
}

for (const question of exam.questions) {
  assert(question.options.length === 4, `${question.id} must have exactly 4 options.`);
  assert(
    question.options.some((option) => option.letter === question.correct),
    `${question.id} has an answer outside its options.`
  );
  assert(
    exam.sections.some((section) => section.id === question.sectionId),
    `${question.id} refers to an unknown section.`
  );
}

console.log("Content validation passed.");
