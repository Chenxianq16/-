import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = process.argv[2] || path.resolve(root, "../_cet6-source-data.js");
const outputDir = process.argv[3] || path.join(root, "assets/data");

const selectedPaperIds = [
  "cet6_2025.12_set1",
  "cet6_2025.06_set1",
  "cet6_2024.12_set1",
  "cet6_2024.06_set1",
  "cet6_2023.12_set1",
  "cet6_2023.06_set1",
  "cet6_2021.06_set1"
];

const m4aPaperIds = new Set(["cet6_2023.06_set1"]);

const sectionDefinitions = [
  {
    source: "Conversation One",
    id: "conversation-1",
    type: "long-conversation",
    typeLabel: "长对话",
    title: "长对话 1",
    questionStart: 1,
    questionEnd: 4
  },
  {
    source: "Conversation Two",
    id: "conversation-2",
    type: "long-conversation",
    typeLabel: "长对话",
    title: "长对话 2",
    questionStart: 5,
    questionEnd: 8
  },
  {
    source: "Passage One",
    id: "passage-1",
    type: "passage",
    typeLabel: "篇章",
    title: "篇章听力 1",
    questionStart: 9,
    questionEnd: 11
  },
  {
    source: "Passage Two",
    id: "passage-2",
    type: "passage",
    typeLabel: "篇章",
    title: "篇章听力 2",
    questionStart: 12,
    questionEnd: 15
  },
  {
    source: "Recording One",
    id: "recording-1",
    type: "lecture",
    typeLabel: "讲座/讲话",
    title: "讲座 1",
    questionStart: 16,
    questionEnd: 18
  },
  {
    source: "Recording Two",
    id: "recording-2",
    type: "lecture",
    typeLabel: "讲座/讲话",
    title: "讲座 2",
    questionStart: 19,
    questionEnd: 21
  },
  {
    source: "Recording Three",
    id: "recording-3",
    type: "lecture",
    typeLabel: "讲座/讲话",
    title: "讲座 3",
    questionStart: 22,
    questionEnd: 25
  }
];

function loadSource(filePath) {
  const source = fs.readFileSync(filePath, "utf8");
  const start = source.indexOf("[");
  const end = source.lastIndexOf("]");
  if (start < 0 || end < start) {
    throw new Error("Could not find the CET6_DATA JSON array.");
  }
  return JSON.parse(source.slice(start, end + 1));
}

function round(value) {
  return Math.round(Number(value) * 100) / 100;
}

const papers = loadSource(sourcePath);

function buildExam(paper) {
  if (!Array.isArray(paper.quiz) || paper.quiz.length !== 25) {
    throw new Error(`${paper.id} must contain 25 questions.`);
  }
  if (!Array.isArray(paper.sentences) || paper.sentences.length === 0) {
    throw new Error(`${paper.id} has no sentence data.`);
  }

  const examId = paper.id.replaceAll("_", "-").replaceAll(".", "-");
  const match = /^cet6_(\d{4})\.(\d{2})_set(\d+)$/.exec(paper.id);
  if (!match) {
    throw new Error(`Unexpected paper id: ${paper.id}`);
  }
  const [, year, month, setNumber] = match;
  const prefix = `${examId}--`;

  const questions = paper.quiz.map((question) => {
    const definition = sectionDefinitions.find(
      (section) =>
        question.number >= section.questionStart &&
        question.number <= section.questionEnd
    );
    if (!definition) {
      throw new Error(`No section mapping for ${paper.id} question ${question.number}.`);
    }
    return {
      id: `${prefix}q${question.number}`,
      number: question.number,
      sectionId: `${prefix}${definition.id}`,
      type: definition.type,
      typeLabel: definition.typeLabel,
      prompt: "根据录音选择最符合的一项",
      options: question.options,
      correct: question.correct
    };
  });

  const sections = sectionDefinitions.map((definition, sectionIndex) => {
    const sourceSentences = paper.sentences
      .filter((sentence) => sentence.section === definition.source)
      .sort((a, b) => a.start - b.start);

    if (sourceSentences.length === 0) {
      throw new Error(`No ${definition.source} sentences found for ${paper.id}.`);
    }

    const sectionId = `${prefix}${definition.id}`;
    const sentences = sourceSentences.map((sentence, index) => ({
      id: `${sectionId}--s${index + 1}`,
      index,
      speaker: sentence.speaker || "",
      text: sentence.text.trim(),
      translationZh: (sentence.zh || "").trim(),
      start: round(sentence.start),
      end: round(sentence.end)
    }));

    return {
      id: sectionId,
      type: definition.type,
      typeLabel: definition.typeLabel,
      title: definition.title,
      sourceTitle: definition.source,
      order: sectionIndex + 1,
      start: sentences[0].start,
      end: sentences.at(-1).end,
      questions: questions.filter((question) => question.sectionId === sectionId),
      sentences
    };
  });

  const duration = round(Math.max(...paper.sentences.map((sentence) => sentence.end)));
  const displayMonth = String(Number(month));
  const audioExtension = m4aPaperIds.has(paper.id) ? "m4a" : "mp3";
  return {
    meta: {
      id: examId,
      sourceId: paper.id,
      title: `${year} 年 ${displayMonth} 月六级听力（第 ${setNumber} 套）`,
      shortTitle: `${year}.${month} · 第 ${setNumber} 套`,
      session: `${year}-${month}`,
      year: Number(year),
      month: Number(month),
      setNumber: Number(setNumber),
      subtitle: `真实六级听力 · 25 题 · ${paper.sentences.length} 句逐句时间轴`,
      audio: `assets/audio/${examId}.${audioExtension}`,
      sourceAudioPath: String(paper.audio || "").replace(/^\.\.\/\.\.\//, ""),
      duration,
      sentenceCount: paper.sentences.length,
      questionCount: questions.length,
      sourceName: "CET-6 Listening Study",
      sourceUrl: "https://github.com/getfine333-ux/cet6-listening-study",
      upstreamName: "CET-6 Listening Resources & Analysis",
      upstreamUrl:
        "https://github.com/Ysoseri1224/CET-6-Listening-10-Years-Resources-and-Analysis",
      license: "CC BY 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
      downloadedAt: "2026-11-03"
    },
    sections,
    questions
  };
}

const selectedPapers = selectedPaperIds.map((id) => {
  const paper = papers.find((item) => item.id === id);
  if (!paper) {
    throw new Error(`Paper not found: ${id}`);
  }
  return buildExam(paper);
});

const examsDir = path.join(outputDir, "exams");
fs.mkdirSync(examsDir, { recursive: true });

for (const exam of selectedPapers) {
  fs.writeFileSync(
    path.join(examsDir, `${exam.meta.id}.json`),
    `${JSON.stringify(exam, null, 2)}\n`,
    "utf8"
  );
}

const index = {
  generatedAt: "2026-11-03",
  defaultExamId: selectedPapers[0].meta.id,
  exams: selectedPapers.map((exam) => ({
    id: exam.meta.id,
    title: exam.meta.title,
    shortTitle: exam.meta.shortTitle,
    session: exam.meta.session,
    year: exam.meta.year,
    month: exam.meta.month,
    setNumber: exam.meta.setNumber,
    duration: exam.meta.duration,
    sentenceCount: exam.meta.sentenceCount,
    questionCount: exam.meta.questionCount,
    dataPath: `exams/${exam.meta.id}.json`
  }))
};

fs.writeFileSync(
  path.join(outputDir, "index.json"),
  `${JSON.stringify(index, null, 2)}\n`,
  "utf8"
);

console.log(
  `Wrote ${selectedPapers.length} exams and ${selectedPapers.length} index entries to ${outputDir}`
);
