const STORAGE_KEY = "cet6-intensive-listening-v1";

function emptyStore() {
  return {
    version: 1,
    aiEndpoint: "",
    lastExamId: "",
    attempts: [],
    sentenceProgress: {},
    quizAnswers: {},
    wrongWords: {},
    tagCounts: {},
    reviewArticle: null
  };
}

export function loadStore() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    return parsed && parsed.version === 1 ? { ...emptyStore(), ...parsed } : emptyStore();
  } catch {
    return emptyStore();
  }
}

export function saveStore(store) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

export function recordAttempt(store, attempt) {
  store.attempts.unshift({
    id: crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`,
    createdAt: new Date().toISOString(),
    ...attempt
  });
  store.attempts = store.attempts.slice(0, 500);

  const key = `${attempt.sectionId}:${attempt.sentenceId}`;
  const previous = store.sentenceProgress[key];
  if (!previous || attempt.score >= previous.score) {
    store.sentenceProgress[key] = {
      score: attempt.score,
      attempts: (previous?.attempts || 0) + 1,
      updatedAt: new Date().toISOString()
    };
  } else {
    store.sentenceProgress[key] = {
      ...previous,
      attempts: previous.attempts + 1,
      updatedAt: new Date().toISOString()
    };
  }
  saveStore(store);
}

export function recordQuizAnswer(store, questionId, selected, correct) {
  store.quizAnswers[questionId] = {
    selected,
    correct: selected === correct,
    updatedAt: new Date().toISOString()
  };
  saveStore(store);
}

export function addWrongWord(store, word, details = {}) {
  const normalized = String(word || "").trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  const existing = store.wrongWords[normalized];
  store.wrongWords[normalized] = {
    word: String(word).trim(),
    kind: details.kind || existing?.kind || "word",
    reason: details.reason || existing?.reason || "",
    meaningZh: details.meaningZh || existing?.meaningZh || "",
    meaningEn: details.meaningEn || existing?.meaningEn || "",
    phonetic: details.phonetic || existing?.phonetic || "",
    context: details.context || existing?.context || "",
    sectionId: details.sectionId || existing?.sectionId || "",
    count: (existing?.count || 0) + 1,
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  saveStore(store);
  return store.wrongWords[normalized];
}

export function removeWrongWord(store, word) {
  delete store.wrongWords[String(word || "").trim().toLowerCase()];
  saveStore(store);
}

export function incrementTag(store, tag) {
  store.tagCounts[tag] = (store.tagCounts[tag] || 0) + 1;
  saveStore(store);
}

export function clearLearningData(store) {
  const endpoint = store.aiEndpoint;
  Object.assign(store, emptyStore(), { aiEndpoint: endpoint });
  saveStore(store);
}

export function getSummary(exam, store) {
  const progress = exam.sections.flatMap((section) =>
    section.sentences.map(
      (sentence) => store.sentenceProgress[`${section.id}:${sentence.id}`]
    )
  ).filter(Boolean);
  const total = exam.meta.sentenceCount;
  const completed = progress.filter((item) => item.score >= 80).length;
  const masteredScores = progress.map((item) => item.score);
  const averageScore = masteredScores.length
    ? Math.round(masteredScores.reduce((sum, score) => sum + score, 0) / masteredScores.length)
    : 0;
  const questionAnswers = exam.questions
    .map((question) => store.quizAnswers[question.id])
    .filter(Boolean);

  return {
    total,
    completed,
    completionRate: total ? Math.round((completed / total) * 100) : 0,
    averageScore,
    wrongWordCount: Object.keys(store.wrongWords).length,
    quizCount: questionAnswers.length,
    quizCorrect: questionAnswers.filter((item) => item.correct).length
  };
}

export function formatRelativeDate(isoDate) {
  if (!isoDate) {
    return "";
  }
  const diff = Date.now() - new Date(isoDate).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days <= 0) return "今天";
  if (days === 1) return "昨天";
  if (days < 30) return `${days} 天前`;
  return new Date(isoDate).toLocaleDateString("zh-CN");
}
