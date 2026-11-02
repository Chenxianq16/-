import {
  addWrongWord,
  formatRelativeDate,
  getSummary,
  incrementTag,
  loadStore,
  recordAttempt,
  recordQuizAnswer,
  removeWrongWord,
  saveStore
} from "./storage.js";
import { diffWords } from "./diff.js";
import {
  buildArticlePayload,
  buildQuestionPayload,
  buildSentencePayload,
  requestAi,
  setAiEndpoint
} from "./ai.js";

const app = document.querySelector("#app");
const audioEl = document.querySelector("#audio");
const toastEl = document.querySelector("#toast");
const settingsDialog = document.querySelector("#settings-dialog");
const aiEndpointInput = document.querySelector("#ai-endpoint");

const store = loadStore();
const state = {
  data: null,
  route: "home",
  mode: "passage",
  sectionId: null,
  questionId: null,
  phase: "blind",
  sentenceIndex: 0,
  selectedAnswers: {},
  quizSubmitted: false,
  dictationText: "",
  currentDiff: null,
  sentenceAnalyses: {},
  questionAnalyses: {},
  loading: new Set(),
  selfTags: {},
  articleLoading: false
};

let stopAt = null;
let toastTimer = null;

const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const formatDuration = (seconds) => {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};

function showToast(message, type = "normal") {
  clearTimeout(toastTimer);
  toastEl.textContent = message;
  toastEl.className = `toast show${type === "error" ? " error" : ""}`;
  toastTimer = setTimeout(() => {
    toastEl.className = "toast";
  }, 3200);
}

function getSection(sectionId = state.sectionId) {
  return state.data?.sections.find((section) => section.id === sectionId);
}

function getQuestion(questionId = state.questionId) {
  return state.data?.questions.find((question) => question.id === questionId);
}

function sectionProgress(section) {
  const completed = section.sentences.filter((sentence) => {
    const progress = store.sentenceProgress[`${section.id}:${sentence.id}`];
    return progress?.score >= 80;
  }).length;
  return {
    completed,
    total: section.sentences.length,
    percent: Math.round((completed / section.sentences.length) * 100)
  };
}

function questionRange(section) {
  if (!section.questions.length) return "";
  return `${section.questions[0].number}-${section.questions.at(-1).number}`;
}

function setAudioSource() {
  const source = new URL(`../${state.data.meta.audio}`, import.meta.url);
  if (audioEl.src !== source.href) {
    audioEl.src = source.href;
  }
  audioEl.className = "audio-element hidden";
}

function playRange(start, end) {
  stopAt = end;
  audioEl.currentTime = Math.max(0, Number(start) || 0);
  audioEl.play().catch(() => {
    showToast("浏览器阻止了播放，请再次点击播放按钮", "error");
  });
}

function mountAudio() {
  const mount = document.querySelector("#audio-mount");
  if (mount) {
    audioEl.classList.remove("hidden");
    mount.append(audioEl);
  } else {
    audioEl.classList.add("hidden");
  }
}

function setActiveNav(route) {
  document.querySelectorAll("[data-nav]").forEach((link) => {
    link.classList.toggle("active", link.dataset.nav === route);
  });
}

function renderHome() {
  state.route = "home";
  state.sectionId = null;
  state.questionId = null;
  setActiveNav("home");
  const summary = getSummary(state.data, store);

  app.innerHTML = `
    <section class="home-hero">
      <div class="hero-copy">
        <p class="eyebrow">CET-6 INTENSIVE LISTENING</p>
        <h1>先听懂，再写对，最后看透错因。</h1>
        <p>
          用一套完整六级听力完成盲听、答题和逐句默写。每句话可无限重听，
          提交后由词级对照和 AI 分别指出“没听出来”与“没理解”的问题。
        </p>
        <div class="hero-meta">
          <span class="meta-chip">${escapeHtml(state.data.meta.title)}</span>
          <span class="meta-chip">${state.data.meta.questionCount} 题</span>
          <span class="meta-chip">${state.data.meta.sentenceCount} 句</span>
          <span class="meta-chip">${escapeHtml(state.data.meta.license)}</span>
        </div>
      </div>
      <aside class="progress-card">
        <div>
          <p class="eyebrow">LOCAL PROGRESS</p>
          <h2>本机训练进度</h2>
          <p>所有学习记录只保存在这个浏览器。</p>
        </div>
        <div class="progress-ring" style="--value:${summary.completionRate}%">
          <div>
            <strong>${summary.completionRate}%</strong>
            <span>逐句完成</span>
          </div>
        </div>
        <div class="stat-strip">
          <div class="stat">
            <strong>${summary.completed}/${summary.total}</strong>
            <span>完成句子</span>
          </div>
          <div class="stat">
            <strong>${summary.averageScore}</strong>
            <span>平均匹配</span>
          </div>
          <div class="stat">
            <strong>${summary.wrongWordCount}</strong>
            <span>错词本</span>
          </div>
        </div>
      </aside>
    </section>

    <div class="mode-switch" aria-label="训练模式">
      <button class="mode-tab ${state.mode === "passage" ? "active" : ""}" data-action="mode" data-mode="passage">
        完整篇章
      </button>
      <button class="mode-tab ${state.mode === "question" ? "active" : ""}" data-action="mode" data-mode="question">
        按题型逐题
      </button>
    </div>

    ${state.mode === "passage" ? renderPassageLibrary() : renderQuestionLibrary()}
  `;
  mountAudio();
}

function renderPassageLibrary() {
  return `
    <div class="content-heading">
      <div>
        <p class="eyebrow">PASSAGE MODE</p>
        <h2>七个听力篇章</h2>
      </div>
      <p>先盲听整段，再答题，最后逐句默写。</p>
    </div>
    <div class="section-grid">
      ${state.data.sections
        .map((section) => {
          const progress = sectionProgress(section);
          return `
            <article class="section-card">
              <div class="section-card-header">
                <span class="type-pill">${escapeHtml(section.typeLabel)}</span>
                <span class="meta-chip">Q${questionRange(section)}</span>
              </div>
              <h3>${escapeHtml(section.title)}</h3>
              <p>
                ${section.questions.length} 道题 · ${section.sentences.length} 句 ·
                ${formatDuration(section.end - section.start)} ·
                逐句完成 ${progress.completed}/${progress.total}
              </p>
              <div class="card-actions">
                <button class="button" data-action="start-passage" data-section-id="${section.id}">
                  开始篇章训练
                </button>
                <button class="button-ghost" data-action="start-passage" data-section-id="${section.id}" data-phase="dictation">
                  直接默写
                </button>
              </div>
            </article>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderQuestionLibrary() {
  const types = [
    ["long-conversation", "长对话", "Section A"],
    ["passage", "篇章听力", "Section B"],
    ["lecture", "讲座 / 讲话", "Section C"]
  ];

  return `
    <div class="content-heading">
      <div>
        <p class="eyebrow">QUESTION MODE</p>
        <h2>按六级题型逐题检测</h2>
      </div>
      <p>原卷只印选项，题干在录音中播放。</p>
    </div>
    <div class="question-groups">
      ${types
        .map(([type, label, sectionLabel]) => {
          const sections = state.data.sections.filter((section) => section.type === type);
          return `
            <article class="panel question-group">
              <div class="panel-heading">
                <div>
                  <span class="type-pill">${sectionLabel}</span>
                  <h2 style="margin-top:10px">${label}</h2>
                  <p>${sections.map((section) => section.title).join(" · ")}</p>
                </div>
                <span class="meta-chip">
                  ${sections.reduce((sum, section) => sum + section.questions.length, 0)} 题
                </span>
              </div>
              <div class="question-grid">
                ${sections
                  .flatMap((section) => section.questions)
                  .map((question) => {
                    const saved = store.quizAnswers[question.id];
                    const className = saved
                      ? saved.correct
                        ? "question-jump correct"
                        : "question-jump wrong"
                      : "question-jump";
                    return `
                      <button class="${className}" data-action="start-question" data-question-id="${question.id}">
                        ${question.number}
                      </button>
                    `;
                  })
                  .join("")}
              </div>
            </article>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderPractice() {
  const section = getSection();
  if (!section) {
    renderHome();
    return;
  }

  state.route = "practice";
  setActiveNav("home");
  const isQuestionMode = state.mode === "question";
  const stepLabels = ["1 盲听", "2 答题", "3 逐句默写", "4 复盘"];
  const activeStep =
    isQuestionMode ? 1 : state.phase === "blind" ? 0 : state.phase === "quiz" ? 1 : 2;

  app.innerHTML = `
    <div class="practice-top">
      <div class="practice-title">
        <p class="eyebrow">${isQuestionMode ? "QUESTION PRACTICE" : "INTENSIVE LISTENING"}</p>
        <h1>${escapeHtml(section.title)}</h1>
        <p>${escapeHtml(section.typeLabel)} · Q${questionRange(section)} · ${section.sentences.length} 句</p>
      </div>
      <button class="button-secondary" data-action="back-home">返回训练列表</button>
    </div>

    <div class="stepper" aria-label="训练步骤">
      ${stepLabels
        .map(
          (label, index) =>
            `<div class="step ${index === activeStep ? "active" : ""}">${label}</div>`
        )
        .join("")}
    </div>

    ${renderAudioPanel(section, isQuestionMode ? "题目对应篇章" : state.phase === "dictation" ? "当前句逐句播放" : "篇章音频")}

    <div class="training-grid">
      <section class="panel">
        ${
          isQuestionMode
            ? renderQuestionMode(section)
            : state.phase === "blind"
              ? renderBlindStage(section)
              : state.phase === "quiz"
                ? renderQuizStage(section.questions, section, false)
                : renderDictationStage(section)
        }
      </section>
      ${renderContextPanel(section, isQuestionMode)}
    </div>
  `;
  mountAudio();
}

function renderAudioPanel(section, label) {
  return `
    <section class="audio-panel" aria-label="听力播放器">
      <div class="player-row">
        <div class="player-label">
          <strong>${escapeHtml(label)}</strong>
          <span>${formatDuration(section.start)} - ${formatDuration(section.end)}</span>
        </div>
        <div id="audio-mount" class="audio-element"></div>
        <span class="time-label">可拖动定位 · 支持无限重听</span>
      </div>
    </section>
  `;
}

function renderBlindStage(section) {
  return `
    <div class="panel-heading">
      <div>
        <p class="eyebrow">STEP 1</p>
        <h2>盲听整段</h2>
        <p>原文和中文保持隐藏。先抓主旨和结构，再进入答题。</p>
      </div>
    </div>
    <div class="blind-volume">
      <strong>${escapeHtml(section.title)}</strong>
      <p>
        本段约 ${formatDuration(section.end - section.start)}，对应
        ${section.questions.length} 道题。可以反复听，不记录重听次数。
      </p>
      <div class="card-actions" style="justify-content:center">
        <button class="button" data-action="play-section">播放整段</button>
        <button class="button-secondary" data-action="begin-quiz">开始答题</button>
      </div>
    </div>
  `;
}

function renderQuizStage(questions, section, single) {
  const submitted = state.quizSubmitted;
  const answered = questions.filter((question) => state.selectedAnswers[question.id]).length;
  const correct = questions.filter(
    (question) => state.selectedAnswers[question.id] === question.correct
  ).length;

  return `
    <div class="panel-heading">
      <div>
        <p class="eyebrow">STEP 2</p>
        <h2>${single ? `第 ${questions[0].number} 题` : "篇章检测"}</h2>
        <p>
          ${
            submitted
              ? `已完成 ${questions.length} 题，答对 ${correct} 题。`
              : `已选择 ${answered}/${questions.length} 题。原卷只印选项，题干在录音中播放。`
          }
        </p>
      </div>
      ${submitted ? `<span class="type-pill">${correct}/${questions.length} 正确</span>` : ""}
    </div>
    <div class="quiz-list">
      ${questions.map((question) => renderQuestionCard(question, submitted)).join("")}
    </div>
    <div class="question-actions">
      ${
        submitted
          ? `
            <button class="button" data-action="${single ? "back-home" : "begin-dictation"}">
              ${single ? "返回训练列表" : "进入逐句默写"}
            </button>
            <button class="button-secondary" data-action="play-section">再听一遍</button>
          `
          : `<button class="button" data-action="submit-quiz">提交答案</button>`
      }
    </div>
  `;
}

function renderQuestionCard(question, submitted) {
  const selected = state.selectedAnswers[question.id] || "";
  const analysis = state.questionAnalyses[question.id];
  const loading = state.loading.has(`question:${question.id}`);

  return `
    <article class="quiz-card" id="question-${question.id}">
      <h3>${question.number}. ${escapeHtml(question.prompt)}</h3>
      <div class="option-list">
        ${question.options
          .map((option) => {
            const checked = selected === option.letter ? "checked" : "";
            const isCorrect = submitted && option.letter === question.correct;
            const isWrong =
              submitted &&
              selected === option.letter &&
              selected !== question.correct;
            const statusClass = isCorrect ? "correct" : isWrong ? "wrong" : "";
            return `
              <label class="option ${statusClass}">
                <input
                  type="radio"
                  name="question-${question.id}"
                  value="${option.letter}"
                  data-question-option="${question.id}"
                  ${checked}
                  ${submitted ? "disabled" : ""}
                >
                <span><strong>${option.letter}.</strong> ${escapeHtml(option.text)}</span>
              </label>
            `;
          })
          .join("")}
      </div>
      ${
        submitted
          ? `
            <div class="answer-line">
              正确答案 <strong>${question.correct}</strong>。
              ${selected === question.correct ? "本题答对。" : `你选择了 ${selected || "未选择"}。`}
            </div>
            <div class="question-actions">
              <button
                class="button-secondary"
                data-action="analyze-question"
                data-question-id="${question.id}"
                ${loading ? "disabled" : ""}
              >
                ${loading ? "AI 分析中…" : "让 AI 分析选项依据"}
              </button>
            </div>
            ${analysis ? renderQuestionAnalysis(analysis) : ""}
          `
          : ""
      }
    </article>
  `;
}

function renderQuestionMode(section) {
  const question =
    getQuestion() || section.questions.find((item) => item.number === section.questions[0].number);
  return renderQuizStage([question], section, true);
}

function renderQuestionAnalysis(analysis) {
  const rationale =
    analysis.rationale ||
    analysis.optionAnalysis ||
    analysis.summary ||
    "AI 没有返回选项解析。";
  const evidence = Array.isArray(analysis.evidence)
    ? analysis.evidence
    : analysis.evidence
      ? [analysis.evidence]
      : [];

  return `
    <div class="analysis-shell">
      <div class="analysis-section">
        <h3>选项依据</h3>
        <p>${escapeHtml(rationale)}</p>
        ${
          evidence.length
            ? `<ul>${evidence.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
            : ""
        }
      </div>
      ${renderVocabularyFromAnalysis(analysis.words || [], "")}
    </div>
  `;
}

function renderContextPanel(section, questionMode) {
  const progress = sectionProgress(section);
  return `
    <aside class="panel context-panel">
      <p class="eyebrow">SECTION INFO</p>
      <h2 style="font-size:18px">${escapeHtml(section.title)}</h2>
      <div class="context-stat"><span>题型</span><strong>${escapeHtml(section.typeLabel)}</strong></div>
      <div class="context-stat"><span>题目</span><strong>Q${questionRange(section)}</strong></div>
      <div class="context-stat"><span>句子</span><strong>${section.sentences.length}</strong></div>
      <div class="context-stat"><span>完成度</span><strong>${progress.percent}%</strong></div>
      <div class="progress-track" style="margin-top:12px">
        <div class="progress-fill" style="width:${progress.percent}%"></div>
      </div>
      <p class="context-note">
        ${
          questionMode
            ? "逐题模式使用本题所属的完整篇章音频。答案提交后可让 AI 解释选项依据。"
            : "提交每句默写后才能查看英文原文和中文译意。AI 错因推断需要你最终确认。"
        }
      </p>
    </aside>
  `;
}

function renderDictationStage(section) {
  const sentence = section.sentences[state.sentenceIndex];
  if (!sentence) {
    return `
      <div class="empty-state">
        <p class="eyebrow">SECTION COMPLETE</p>
        <h2>本段逐句默写已完成</h2>
        <p>可以重做任意句子，或返回训练列表。</p>
        <button class="button" data-action="back-home">返回训练列表</button>
      </div>
    `;
  }

  const diff = state.currentDiff;
  const analysis = state.sentenceAnalyses[sentence.id];
  const loading = state.loading.has(`sentence:${sentence.id}`);
  const percent = Math.round(((state.sentenceIndex + 1) / section.sentences.length) * 100);
  const selfTag = state.selfTags[sentence.id];

  return `
    <div class="panel-heading">
      <div>
        <p class="eyebrow">STEP 3</p>
        <h2>逐句盲听默写</h2>
        <p>每句可无限重听。提交前不显示原文和中文。</p>
      </div>
      <span class="type-pill">${state.sentenceIndex + 1}/${section.sentences.length}</span>
    </div>

    <div class="dictation-progress">
      <div class="progress-track">
        <div class="progress-fill" style="width:${percent}%"></div>
      </div>
      <div class="dictation-meta">
        <span>句子 ${state.sentenceIndex + 1}</span>
        <span>${formatDuration(sentence.start)} - ${formatDuration(sentence.end)}</span>
      </div>
    </div>

    <span class="speaker-label">${sentence.speaker ? `${escapeHtml(sentence.speaker)}:` : "SPEAKER"}</span>
    <textarea
      class="dictation-input"
      id="dictation-input"
      spellcheck="false"
      autocomplete="off"
      autocapitalize="sentences"
      placeholder="听到什么就写什么，可反复播放这一句…"
      ${diff ? "disabled" : ""}
    >${escapeHtml(state.dictationText)}</textarea>

    <div class="dictation-actions">
      <button class="button-secondary" data-action="play-sentence">播放本句</button>
      ${
        diff
          ? `<button class="button" data-action="next-sentence">${state.sentenceIndex === section.sentences.length - 1 ? "查看完成情况" : "下一句"}</button>`
          : `<button class="button" data-action="submit-sentence">提交本句</button>`
      }
      ${
        state.sentenceIndex > 0
          ? `<button class="button-ghost" data-action="previous-sentence">上一句</button>`
          : ""
      }
    </div>

    ${
      diff
        ? `
          <div class="result-box">
            <div class="score-line">
              <strong>${diff.score}</strong><span>词级匹配率</span>
            </div>
            <h3>逐词对照</h3>
            <div class="diff-inline">${renderDiffTokens(diff)}</div>
            <p class="translation-line"><strong>原文：</strong>${escapeHtml(sentence.text)}</p>
            <p class="translation-line"><strong>中文：</strong>${escapeHtml(sentence.translationZh)}</p>
            ${renderWrongWordCandidates(diff)}
            <div class="self-tags">
              <span class="status-pill">帮我确认错因</span>
              <button class="self-tag ${selfTag === "known" ? "active" : ""}" data-action="self-tag" data-value="known">其实认识，只是没听出来</button>
              <button class="self-tag ${selfTag === "unknown" ? "active" : ""}" data-action="self-tag" data-value="unknown">确实不认识这个词</button>
              <button class="self-tag ${selfTag === "unclear" ? "active" : ""}" data-action="self-tag" data-value="unclear">不确定</button>
            </div>
            <div class="analysis-actions">
              <button
                class="button-secondary"
                data-action="analyze-sentence"
                ${loading ? "disabled" : ""}
              >
                ${loading ? "AI 分析中…" : "AI 分析错因、语法与搭配"}
              </button>
            </div>
            ${analysis ? renderSentenceAnalysis(analysis) : ""}
          </div>
        `
        : ""
    }
  `;
}

function renderDiffTokens(diff) {
  return diff.tokens
    .map((token) => {
      if (token.status === "correct") {
        return `<span class="diff-token diff-correct">${escapeHtml(token.expected)}</span>`;
      }
      if (token.status === "wrong") {
        return `<span class="diff-token diff-wrong"><span class="diff-expected">${escapeHtml(token.expected)}</span><span class="diff-replacement"> → ${escapeHtml(token.actual)}</span></span>`;
      }
      if (token.status === "missing") {
        return `<span class="diff-token diff-missing">${escapeHtml(token.expected)}</span>`;
      }
      return `<span class="diff-token diff-extra">+${escapeHtml(token.actual)}</span>`;
    })
    .join(" ");
}

function renderWrongWordCandidates(diff) {
  const candidates = [...new Set(diff.unmatchedExpected)]
    .filter((word) => word.length > 1)
    .slice(0, 12);
  if (!candidates.length) return "";

  return `
    <div class="candidate-list" aria-label="错词候选">
      ${candidates
        .map(
          (word) =>
            `<button class="candidate-word" data-action="add-word" data-word="${escapeHtml(word)}">+ ${escapeHtml(word)}</button>`
        )
        .join("")}
    </div>
  `;
}

function renderSentenceAnalysis(analysis) {
  const errorTags = normalizeTags(analysis.errorTags);
  const knowledgeTags = normalizeTags(analysis.knowledgeTags);
  const summary = analysis.summary || "";
  const grammar = analysis.grammar;
  const collocations = Array.isArray(analysis.collocations) ? analysis.collocations : [];
  const words = Array.isArray(analysis.words) ? analysis.words : [];
  const nextStep = analysis.nextStep || analysis.practiceTip || "";

  return `
    <div class="analysis-shell">
      ${
        summary
          ? `<div class="analysis-section"><h3>AI 判断</h3><p>${escapeHtml(summary)}</p>${
              errorTags.length || knowledgeTags.length
                ? `<div class="tag-row">${errorTags
                    .map((tag) => `<span class="tag error">${escapeHtml(tag)}</span>`)
                    .join("")}${knowledgeTags
                    .map((tag) => `<span class="tag knowledge">${escapeHtml(tag)}</span>`)
                    .join("")}</div>`
                : ""
            }</div>`
          : ""
      }
      ${renderGrammar(grammar)}
      ${
        collocations.length
          ? `<div class="analysis-section"><h3>固定搭配</h3><ul>${collocations
              .map(
                (item) =>
                  `<li><strong>${escapeHtml(item.expression || item.phrase || item)}</strong>${
                    item.meaning || item.meaningZh
                      ? ` — ${escapeHtml(item.meaning || item.meaningZh)}`
                      : ""
                  }${
                    item.example
                      ? `<br><span>${escapeHtml(item.example)}</span>`
                      : ""
                  }</li>`
              )
              .join("")}</ul></div>`
          : ""
      }
      ${renderVocabularyFromAnalysis(words, "")}
      ${
        nextStep
          ? `<div class="analysis-section"><h3>下一步</h3><p>${escapeHtml(nextStep)}</p></div>`
          : ""
      }
    </div>
  `;
}

function normalizeTags(tags) {
  if (!Array.isArray(tags)) return [];
  return tags
    .map((tag) => (typeof tag === "string" ? tag : tag.label || tag.code || ""))
    .filter(Boolean);
}

function renderGrammar(grammar) {
  if (!grammar) return "";
  if (typeof grammar === "string") {
    return `
      <div class="analysis-section">
        <h3>复杂句与语法</h3>
        <p>${escapeHtml(grammar)}</p>
      </div>
    `;
  }

  const examples = Array.isArray(grammar.examples) ? grammar.examples : [];
  return `
    <div class="analysis-section">
      <h3>复杂句与语法</h3>
      ${grammar.title ? `<p><strong>${escapeHtml(grammar.title)}</strong></p>` : ""}
      ${grammar.structure ? `<p><strong>结构：</strong>${escapeHtml(grammar.structure)}</p>` : ""}
      ${grammar.explanation ? `<p>${escapeHtml(grammar.explanation)}</p>` : ""}
      ${
        examples.length
          ? `<ul>${examples.map((example) => `<li>${escapeHtml(example)}</li>`).join("")}</ul>`
          : ""
      }
    </div>
  `;
}

function renderVocabularyFromAnalysis(words, fallbackContext) {
  if (!Array.isArray(words) || !words.length) return "";
  return `
    <div class="analysis-section">
      <h3>重点词与错词收录</h3>
      <div class="word-list">
        ${words
          .map((word) => {
            const value = word.word || word.text || "";
            const meaning = word.meaningZh || word.meaning || word.definition || "";
            return `
              <div class="word-card">
                <strong>${escapeHtml(value)}${word.phonetic ? ` /${escapeHtml(word.phonetic)}/` : ""}</strong>
                <span>${escapeHtml(meaning)}</span>
                <button
                  class="candidate-word"
                  data-action="add-word"
                  data-word="${escapeHtml(value)}"
                  data-meaning="${escapeHtml(meaning)}"
                  data-context="${escapeHtml(fallbackContext)}"
                >加入错词本</button>
              </div>
            `;
          })
          .join("")}
      </div>
    </div>
  `;
}

function renderVocabularyPage() {
  state.route = "vocabulary";
  state.sectionId = null;
  state.questionId = null;
  setActiveNav("vocabulary");
  const words = Object.values(store.wrongWords).sort(
    (a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)
  );

  app.innerHTML = `
    <div class="vocab-header">
      <div>
        <p class="eyebrow">LOCAL WORD BOOK</p>
        <h1>错词本</h1>
        <p>保留错词、释义和原句，不依赖登录。</p>
      </div>
      ${
        words.length
          ? `<div class="card-actions">
              <button class="button" data-action="generate-article" ${state.articleLoading ? "disabled" : ""}>
                ${state.articleLoading ? "AI 正在生成…" : "用错词生成复习文章"}
              </button>
              <button class="button-danger" data-action="clear-vocabulary">清空错词本</button>
            </div>`
          : ""
      }
    </div>
    ${
      words.length
        ? `<div class="vocab-list">${words
            .map(
              (item) => `
                <article class="vocab-item">
                  <div class="vocab-topline">
                    <div>
                      <h2 class="vocab-word">${escapeHtml(item.word)}</h2>
                      <p class="vocab-meaning">${escapeHtml(item.meaningZh || "暂未补充释义")}</p>
                    </div>
                    <button class="text-button" data-action="remove-word" data-word="${escapeHtml(item.word)}">删除</button>
                  </div>
                  ${item.context ? `<p class="vocab-context">${escapeHtml(item.context)}</p>` : ""}
                  <div class="hero-meta" style="margin-top:10px">
                    <span class="meta-chip">出现 ${item.count} 次</span>
                    <span class="meta-chip">${formatRelativeDate(item.updatedAt)}</span>
                  </div>
                </article>
              `
            )
            .join("")}</div>`
        : `
          <div class="empty-state">
            <h2>错词本还是空的</h2>
            <p>完成逐句默写后，点击漏写或写错的词，或者把 AI 推荐的重点词加入这里。</p>
            <button class="button" data-action="back-home">开始训练</button>
          </div>
        `
    }
    ${
      store.reviewArticle
        ? `<article class="panel article-panel">
            <p class="eyebrow">AI REVIEW ARTICLE</p>
            <h2>${escapeHtml(store.reviewArticle.title || "错词复习文章")}</h2>
            <div class="article-body"><p>${escapeHtml(store.reviewArticle.article || "").replace(/\n\n/g, "</p><p>")}</p></div>
            ${
              store.reviewArticle.translationZh
                ? `<details class="article-translation">
                    <summary>查看中文参考</summary>
                    <p>${escapeHtml(store.reviewArticle.translationZh)}</p>
                  </details>`
                : ""
            }
            ${
              Array.isArray(store.reviewArticle.usedWords) &&
              store.reviewArticle.usedWords.length
                ? `<div class="tag-row">${store.reviewArticle.usedWords
                    .map((word) => `<span class="tag">${escapeHtml(word)}</span>`)
                    .join("")}</div>`
                : ""
            }
            ${
              store.reviewArticle.note
                ? `<p class="hint">${escapeHtml(store.reviewArticle.note)}</p>`
                : ""
            }
          </article>`
        : ""
    }
  `;
  mountAudio();
}

function render() {
  if (!state.data) return;
  if (state.route === "vocabulary") {
    renderVocabularyPage();
  } else if (state.route === "practice") {
    renderPractice();
  } else {
    renderHome();
  }
}

function startPassage(sectionId, phase = "blind") {
  state.route = "practice";
  state.mode = "passage";
  state.sectionId = sectionId;
  state.questionId = null;
  state.phase = phase;
  state.selectedAnswers = {};
  state.quizSubmitted = false;
  state.dictationText = "";
  state.currentDiff = null;
  const section = getSection(sectionId);
  if (phase === "dictation") {
    const firstIncomplete = section.sentences.findIndex((sentence) => {
      const progress = store.sentenceProgress[`${section.id}:${sentence.id}`];
      return !progress || progress.score < 80;
    });
    state.sentenceIndex = firstIncomplete >= 0 ? firstIncomplete : 0;
  }
  render();
}

function startQuestion(questionId) {
  const question = getQuestion(questionId);
  state.route = "practice";
  state.mode = "question";
  state.sectionId = question.sectionId;
  state.questionId = questionId;
  state.selectedAnswers = {};
  state.quizSubmitted = false;
  render();
}

async function submitQuiz() {
  const section = getSection();
  const questions = state.mode === "question" ? [getQuestion()] : section.questions;
  if (questions.some((question) => !state.selectedAnswers[question.id])) {
    showToast("还有题目没有选择答案", "error");
    return;
  }

  for (const question of questions) {
    recordQuizAnswer(
      store,
      question.id,
      state.selectedAnswers[question.id],
      question.correct
    );
  }
  state.quizSubmitted = true;
  render();
}

async function submitSentence() {
  const section = getSection();
  const sentence = section.sentences[state.sentenceIndex];
  const diff = diffWords(sentence.text, state.dictationText);
  state.currentDiff = diff;
  recordAttempt(store, {
    sectionId: section.id,
    sentenceId: sentence.id,
    score: diff.score
  });
  render();
}

async function analyzeSentence() {
  const section = getSection();
  const sentence = section.sentences[state.sentenceIndex];
  if (!state.currentDiff) {
    showToast("请先提交本句默写", "error");
    return;
  }

  const key = `sentence:${sentence.id}`;
  state.loading.add(key);
  render();

  try {
    const payload = buildSentencePayload({
      sentence,
      attempt: state.dictationText,
      diff: state.currentDiff,
      section,
      previous: section.sentences[state.sentenceIndex - 1],
      next: section.sentences[state.sentenceIndex + 1]
    });
    state.sentenceAnalyses[sentence.id] = await requestAi(store, payload);
  } catch (error) {
    if (error.code === "CONFIG_REQUIRED") {
      openSettings();
    }
    showToast(error.message, "error");
  } finally {
    state.loading.delete(key);
    render();
  }
}

async function analyzeQuestion(questionId) {
  const question = getQuestion(questionId);
  const section = getSection(question.sectionId);
  const key = `question:${question.id}`;
  state.loading.add(key);
  render();

  try {
    state.questionAnalyses[question.id] = await requestAi(
      store,
      buildQuestionPayload({
        question,
        selected: state.selectedAnswers[question.id],
        section
      })
    );
  } catch (error) {
    if (error.code === "CONFIG_REQUIRED") {
      openSettings();
    }
    showToast(error.message, "error");
  } finally {
    state.loading.delete(key);
    render();
  }
}

async function generateArticle() {
  const words = Object.values(store.wrongWords);
  if (!words.length) {
    showToast("错词本为空，暂时无法生成文章", "error");
    return;
  }

  state.articleLoading = true;
  renderVocabularyPage();
  try {
    const result = await requestAi(store, buildArticlePayload(words));
    if (!result?.article) {
      throw new Error("AI 没有返回文章内容");
    }
    store.reviewArticle = result;
    saveStore(store);
    showToast("复习文章已生成");
  } catch (error) {
    if (error.code === "CONFIG_REQUIRED") {
      openSettings();
    }
    showToast(error.message, "error");
  } finally {
    state.articleLoading = false;
    renderVocabularyPage();
  }
}

function openSettings() {
  aiEndpointInput.value = store.aiEndpoint || window.CET6_CONFIG?.aiEndpoint || "";
  settingsDialog.showModal();
}

function nextSentence() {
  const section = getSection();
  if (state.sentenceIndex >= section.sentences.length - 1) {
    state.sentenceIndex = section.sentences.length;
  } else {
    state.sentenceIndex += 1;
  }
  state.dictationText = "";
  state.currentDiff = null;
  render();
}

function previousSentence() {
  state.sentenceIndex = Math.max(0, state.sentenceIndex - 1);
  state.dictationText = "";
  state.currentDiff = null;
  render();
}

app.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const { action } = button.dataset;

  if (action === "mode") {
    state.mode = button.dataset.mode;
    renderHome();
    return;
  }
  if (action === "start-passage") {
    startPassage(button.dataset.sectionId, button.dataset.phase || "blind");
    return;
  }
  if (action === "start-question") {
    startQuestion(button.dataset.questionId);
    return;
  }
  if (action === "back-home") {
    renderHome();
    return;
  }
  if (action === "play-section") {
    const section = getSection();
    playRange(section.start, section.end);
    return;
  }
  if (action === "begin-quiz") {
    state.phase = "quiz";
    state.selectedAnswers = {};
    state.quizSubmitted = false;
    render();
    return;
  }
  if (action === "submit-quiz") {
    await submitQuiz();
    return;
  }
  if (action === "begin-dictation") {
    state.phase = "dictation";
    state.sentenceIndex = 0;
    state.dictationText = "";
    state.currentDiff = null;
    render();
    return;
  }
  if (action === "play-sentence") {
    const section = getSection();
    const sentence = section.sentences[state.sentenceIndex];
    playRange(sentence.start - 0.08, sentence.end + 0.12);
    return;
  }
  if (action === "submit-sentence") {
    await submitSentence();
    return;
  }
  if (action === "next-sentence") {
    nextSentence();
    return;
  }
  if (action === "previous-sentence") {
    previousSentence();
    return;
  }
  if (action === "analyze-sentence") {
    await analyzeSentence();
    return;
  }
  if (action === "analyze-question") {
    await analyzeQuestion(button.dataset.questionId);
    return;
  }
  if (action === "add-word") {
    const section = getSection();
    const sentence = section?.sentences[state.sentenceIndex];
    addWrongWord(store, button.dataset.word, {
      meaningZh: button.dataset.meaning || "",
      context: button.dataset.context || sentence?.text || "",
      sectionId: section?.id || ""
    });
    showToast(`已收藏 ${button.dataset.word}`);
    return;
  }
  if (action === "remove-word") {
    removeWrongWord(store, button.dataset.word);
    renderVocabularyPage();
    showToast("已删除");
    return;
  }
  if (action === "clear-vocabulary") {
    if (window.confirm("确定清空整个错词本？学习进度和其他记录会保留。")) {
      store.wrongWords = {};
      store.reviewArticle = null;
      saveStore(store);
      renderVocabularyPage();
    }
    return;
  }
  if (action === "generate-article") {
    await generateArticle();
    return;
  }
  if (action === "self-tag") {
    const section = getSection();
    const sentence = section.sentences[state.sentenceIndex];
    state.selfTags[sentence.id] = button.dataset.value;
    incrementTag(store, `self:${button.dataset.value}`);
    render();
    return;
  }
});

app.addEventListener("input", (event) => {
  if (event.target.id === "dictation-input") {
    state.dictationText = event.target.value;
  }
});

app.addEventListener("change", (event) => {
  const questionId = event.target.dataset.questionOption;
  if (questionId) {
    state.selectedAnswers[questionId] = event.target.value;
  }
});

document.addEventListener("click", (event) => {
  const nav = event.target.closest("[data-nav]");
  if (!nav) return;
  event.preventDefault();
  if (nav.dataset.nav === "vocabulary") {
    renderVocabularyPage();
  } else {
    renderHome();
  }
});

document.querySelector("#open-settings").addEventListener("click", openSettings);
document.querySelector("#save-settings").addEventListener("click", (event) => {
  event.preventDefault();
  setAiEndpoint(store, aiEndpointInput.value);
  saveStore(store);
  settingsDialog.close();
  showToast(store.aiEndpoint ? "AI 接口已保存" : "AI 接口已清空");
});

audioEl.addEventListener("timeupdate", () => {
  if (stopAt !== null && audioEl.currentTime >= stopAt) {
    audioEl.pause();
    audioEl.currentTime = stopAt;
    stopAt = null;
  }
});

audioEl.addEventListener("play", () => {
  if (stopAt === null) {
    stopAt = null;
  }
});

audioEl.addEventListener("ended", () => {
  stopAt = null;
});

async function init() {
  try {
    const response = await fetch(new URL("../assets/data/exam.json", import.meta.url));
    if (!response.ok) {
      throw new Error(`题库加载失败：${response.status}`);
    }
    state.data = await response.json();
    setAudioSource();
    document.title = `${state.data.meta.title} | CET6 精听`;
    renderHome();
  } catch (error) {
    app.innerHTML = `
      <section class="empty-state">
        <p class="eyebrow">LOAD ERROR</p>
        <h2>无法载入训练数据</h2>
        <p>${escapeHtml(error.message)}</p>
      </section>
    `;
  }
}

init();
