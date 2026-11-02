const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8"
};

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin") || "";
  const allowed = String(env.ALLOWED_ORIGIN || "*")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const allowOrigin = allowed.includes("*")
    ? "*"
    : allowed.includes(origin)
      ? origin
      : "";

  return {
    ...JSON_HEADERS,
    ...(allowOrigin ? { "Access-Control-Allow-Origin": allowOrigin } : {}),
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin"
  };
}

function jsonResponse(body, status, request, env) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders(request, env)
  });
}

function validateBody(body) {
  if (!body || !["sentence", "question", "article"].includes(body.type)) {
    throw new Error("Request type must be sentence, question, or article.");
  }
  if (body.type === "sentence") {
    if (!String(body.reference || "").trim()) {
      throw new Error("Sentence reference is required.");
    }
    if (String(body.reference).length > 1200) {
      throw new Error("Sentence reference is too long.");
    }
  }
  if (body.type === "question") {
    if (!Array.isArray(body.options) || body.options.length !== 4) {
      throw new Error("A question must contain four options.");
    }
    if (String(body.transcript || "").length > 30_000) {
      throw new Error("Question transcript is too long.");
    }
  }
  if (body.type === "article") {
    if (!Array.isArray(body.words) || body.words.length === 0) {
      throw new Error("At least one wrong word is required.");
    }
    if (body.words.length > 20) {
      throw new Error("No more than 20 words can be used.");
    }
  }
}

function sentenceInstructions() {
  return `
You are a careful CET-6 listening tutor working in Chinese.
Analyze the learner's dictation against the reference sentence and the local word-diff evidence.

Important epistemic rule:
- The typed text alone cannot prove whether a learner knew a word but failed to recognize its sound.
- Treat cognitive causes as hypotheses, not facts.
- Return at most two errorTags and at most two knowledgeTags.
- Do not blame the learner for punctuation, capitalization, or unimportant formatting.

Return only one valid JSON object with this shape:
{
  "summary": "short Chinese diagnosis",
  "errorTags": ["听力识别", "连读弱读", "拼写", "注意力遗漏", "其他"],
  "knowledgeTags": ["词汇", "语法", "语篇逻辑", "文化背景"],
  "grammar": {
    "title": "short title",
    "structure": "clause or phrase structure",
    "explanation": "clear Chinese explanation",
    "examples": ["one short example"]
  },
  "collocations": [
    {"expression": "English phrase", "meaning": "Chinese meaning", "example": "English example"}
  ],
  "words": [
    {
      "word": "English word",
      "phonetic": "IPA without slashes",
      "meaningZh": "contextual Chinese meaning",
      "meaningEn": "short English definition"
    }
  ],
  "nextStep": "one concrete replay or practice suggestion in Chinese"
}

Prioritize the words that were missed or written incorrectly. If the sentence has no
complex grammar, set title to "句子结构", explain the main clause, and keep examples empty.
`;
}

function questionInstructions() {
  return `
You are a CET-6 listening tutor. Explain a multiple-choice listening question in Chinese.
The transcript is the complete source context. Do not invent facts.

Return only one valid JSON object with this shape:
{
  "summary": "one-sentence result",
  "rationale": "why the correct option matches the transcript",
  "evidence": ["short transcript evidence"],
  "words": [
    {
      "word": "English word",
      "phonetic": "IPA",
      "meaningZh": "Chinese meaning",
      "meaningEn": "short English definition"
    }
  ]
}
`;
}

function articleInstructions() {
  return `
Create a CET-6 level English review article that naturally recycles the learner's
wrong words. Write for Chinese learners preparing for the CET-6 exam.

Requirements:
- 260 to 360 English words.
- Use every supplied word at least once and keep its contextual meaning.
- Do not create comprehension questions, options, or an answer key.
- Use a clear nonfiction topic and natural paragraph structure.
- Include a faithful Chinese translation.

Return only one valid JSON object with this shape:
{
  "title": "short English title",
  "article": "English article with paragraph breaks as \\n\\n",
  "translationZh": "complete Chinese translation",
  "usedWords": ["all target words actually used"],
  "note": "one short study suggestion in Chinese"
}
`;
}

function parseModelJson(text) {
  const trimmed = String(text || "").trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw new Error("The model did not return valid JSON.");
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.endsWith("/api/analyze")) {
      return jsonResponse({ error: "Not found" }, 404, request, env);
    }

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(request, env)
      });
    }

    if (request.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405, request, env);
    }

    const allowed = String(env.ALLOWED_ORIGIN || "*")
      .split(",")
      .map((item) => item.trim());
    const origin = request.headers.get("Origin") || "";
    if (!allowed.includes("*") && origin && !allowed.includes(origin)) {
      return jsonResponse({ error: "Origin not allowed" }, 403, request, env);
    }

    if (!env.DEEPSEEK_API_KEY) {
      return jsonResponse(
        {
          error: "Worker is missing DEEPSEEK_API_KEY. Configure the secret first."
        },
        500,
        request,
        env
      );
    }

    let body;
    try {
      body = await request.json();
      validateBody(body);
    } catch (error) {
      return jsonResponse({ error: error.message }, 400, request, env);
    }

    const instructions =
      body.type === "sentence"
        ? sentenceInstructions()
        : body.type === "question"
          ? questionInstructions()
          : articleInstructions();
    const apiResponse = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: env.DEEPSEEK_MODEL || "deepseek-chat",
        messages: [
          { role: "system", content: instructions },
          { role: "user", content: JSON.stringify(body) }
        ],
        response_format: { type: "json_object" },
        max_tokens: 1800,
        stream: false
      }),
      signal: AbortSignal.timeout(40_000)
    });

    const result = await apiResponse.json().catch(() => ({}));
    if (!apiResponse.ok) {
      const message =
        result.error?.message || `DeepSeek returned HTTP ${apiResponse.status}`;
      return jsonResponse({ error: message }, 502, request, env);
    }

    try {
      const text = result.choices?.[0]?.message?.content;
      const data = parseModelJson(text);
      return jsonResponse({ data }, 200, request, env);
    } catch (error) {
      return jsonResponse({ error: error.message }, 502, request, env);
    }
  }
};
