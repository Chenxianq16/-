export function getAiEndpoint(store) {
  return (
    store.aiEndpoint ||
    window.CET6_CONFIG?.aiEndpoint ||
    ""
  ).trim();
}

export function setAiEndpoint(store, endpoint) {
  store.aiEndpoint = String(endpoint || "").trim();
}

function extractJson(text) {
  const trimmed = String(text || "").trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw new Error("AI 返回的内容不是有效 JSON");
  }
}

export async function requestAi(store, payload) {
  const endpoint = getAiEndpoint(store);
  if (!endpoint) {
    const error = new Error("请先在“AI 设置”中填写 Worker 地址");
    error.code = "CONFIG_REQUIRED";
    throw error;
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    Number(window.CET6_CONFIG?.requestTimeoutMs || 45_000)
  );

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(result.error || `AI 请求失败（${response.status}）`);
    }
    if (result.data && typeof result.data === "object") {
      return result.data;
    }
    if (typeof result.output_text === "string") {
      return extractJson(result.output_text);
    }
    return result;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("AI 请求超时，请稍后重试");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export function buildSentencePayload({ sentence, attempt, diff, section, previous, next }) {
  return {
    type: "sentence",
    exam: "CET-6",
    sectionTitle: section.title,
    reference: sentence.text,
    attempt,
    diff: diff
      ? {
          score: diff.score,
          missedWords: diff.unmatchedExpected,
          unexpectedWords: diff.unmatchedActual
        }
      : null,
    context: {
      previous: previous?.text || "",
      next: next?.text || ""
    }
  };
}

export function buildQuestionPayload({ question, selected, section }) {
  return {
    type: "question",
    exam: "CET-6",
    questionNumber: question.number,
    sectionTitle: section.title,
    selected,
    correct: question.correct,
    options: question.options,
    transcript: section.sentences.map((sentence) => sentence.text).join(" ")
  };
}

export function buildArticlePayload(words) {
  return {
    type: "article",
    exam: "CET-6",
    words: words
      .map((item) => ({
        word: item.word,
        meaningZh: item.meaningZh,
        context: item.context
      }))
      .slice(0, 20)
  };
}
