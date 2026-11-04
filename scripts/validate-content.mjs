import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = path.join(root, "assets/data");
const index = JSON.parse(fs.readFileSync(path.join(dataDir, "index.json"), "utf8"));

const assert = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

assert(index.exams.length === 7, "Expected 7 exam papers.");
assert(
  index.exams.some((exam) => exam.id === index.defaultExamId),
  "Default exam is missing from the index."
);

const sectionIds = new Set();
const questionIds = new Set();

for (const entry of index.exams) {
  const exam = JSON.parse(
    fs.readFileSync(path.join(dataDir, entry.dataPath), "utf8")
  );
  assert(exam.meta.id === entry.id, `${entry.id} has inconsistent metadata.`);
  assert(exam.sections.length === 7, `${entry.id} must have 7 sections.`);
  assert(exam.questions.length === 25, `${entry.id} must have 25 questions.`);
  assert(exam.meta.sentenceCount > 100, `${entry.id} has too few sentences.`);

  const audioPath = path.join(root, exam.meta.audio);
  assert(fs.existsSync(audioPath), `${entry.id} audio file is missing.`);
  assert(fs.statSync(audioPath).size > 5_000_000, `${entry.id} audio file is too small.`);

  for (const section of exam.sections) {
    assert(!sectionIds.has(section.id), `Duplicate section id: ${section.id}`);
    sectionIds.add(section.id);
    assert(section.questions.length > 0, `${section.id} has no questions.`);
    assert(section.sentences.length > 0, `${section.id} has no sentences.`);
    assert(section.start < section.end, `${section.id} has an invalid audio range.`);

    for (const [sentenceIndex, sentence] of section.sentences.entries()) {
      assert(sentence.text, `${section.id} sentence ${sentenceIndex + 1} has no English text.`);
      assert(
        sentence.translationZh,
        `${section.id} sentence ${sentenceIndex + 1} has no translation.`
      );
      assert(
        sentence.start >= 0,
        `${section.id} sentence ${sentenceIndex + 1} has a negative start.`
      );
      assert(
        sentence.end > sentence.start,
        `${section.id} sentence ${sentenceIndex + 1} has an invalid range.`
      );
      if (sentenceIndex > 0) {
        assert(
          sentence.start >= section.sentences[sentenceIndex - 1].start,
          `${section.id} sentence timings are out of order.`
        );
      }
    }
  }

  for (const question of exam.questions) {
    assert(!questionIds.has(question.id), `Duplicate question id: ${question.id}`);
    questionIds.add(question.id);
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
}

console.log(`Content validation passed for ${index.exams.length} exams.`);
