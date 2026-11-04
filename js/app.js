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
const reasonDialog = document.querySelector("#reason-dialog");
const reasonItemName = document.querySelector("#reason-item-name");
const wordDialog = document.querySelector("#word-dialog");
const wordDialogTitle = document.querySelector("#word-dialog-title");
const wordDialogContent = document.querySelector("#word-dialog-content");
const addLookedUpWordButton = document.querySelector("#add-looked-up-word");

const store = loadStore();
const state = {
  exams: [],
  examIndex: null,
  examId: "",
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
  pendingAdd: null,
  lookupItem: null,
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

const wrongItemKindLabels = {
  word: "单词",
  phrase: "固定搭配",
  grammar: "重点语法"
};

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function highlightWrongBookTerms(text) {
  const terms = Object.values(store.wrongWords)
    .map((item) => item.word)
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  if (!terms.length) {
    return renderLookupWords(text);
  }

  const pattern = new RegExp(
    `(?<![A-Za-z])(${terms.map(escapeRegExp).join("|")})(?![A-Za-z])`,
    "gi"
  );
  let output = "";
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    output += renderLookupWords(text.slice(cursor, match.index));
    output += `<mark class="wrong-word-highlight">${renderLookupWords(match[0])}</mark>`;
    cursor = match.index + match[0].length;
  }
  output += renderLookupWords(text.slice(cursor));
  return output;
}

function renderLookupWords(text) {
  const pattern = /[A-Za-z]+(?:['’][A-Za-z]+)*/g;
  let output = "";
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    output += escapeHtml(text.slice(cursor, match.index));
    output += `<span class="lookup-word" data-action="lookup-word" data-word="${escapeHtml(match[0])}" role="button" tabindex="0">${escapeHtml(match[0])}</span>`;
    cursor = match.index + match[0].length;
  }
  output += escapeHtml(text.slice(cursor));
  return output;
}

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
  const configuredBase = window.CET6_CONFIG?.audioBaseUrl;
  const source = configuredBase
    ? new URL(
        state.data.meta.audio.replace(/^assets\//, ""),
        configuredBase
      )
    : new URL(`../${state.data.meta.audio}`, import.meta.url);
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

    <section class="exam-switcher" aria-label="选择试卷">
      <div>
        <p class="eyebrow">PAPER LIBRARY</p>
        <h2>近三年六级听力</h2>
        <p>2023-2025 年 6 月与 12 月，共 6 套，并保留 2021 年练习套。</p>
      </div>
      <label class="exam-select-field">
        <span>当前试卷</span>
        <select id="exam-select">
          ${state.exams
            .map(
              (exam) =>
                `<option value="${exam.meta.id}" ${exam.meta.id === state.data.meta.id ? "selected" : ""}>${escapeHtml(exam.meta.title)}</option>`
            )
            .join("")}
        </select>
      </label>
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
    isQuestionMode && state.phase === "quiz"
      ? 1
      : state.phase === "blind"
        ? 0
        : state.phase === "quiz"
          ? 1
          : state.phase === "dictation"
            ? 2
            : 3;

  app.innerHTML = `
    <div class="practice-top">
      <div class="practice-title">
        <p class="eyebrow">${isQuestionMode ? "QUESTION PRACTICE" : "INTENSIVE LISTENING"}</p>
        <h1>${escapeHtml(section.title)}</h1>
        <p>${escapeHtml(section.typeLabel)} · Q${questionRange(section)} · ${section.sentences.length} 句</p>
      </div>
      <button class="button-secondary" data-action="back-home">返回训练列表</button>
    </div>

    <div class="stepper" aria-label="训练步骤，可随时跳转">
      ${stepLabels
        .map((label, index) => {
          const phases = ["blind", "quiz", "dictation", "review"];
          return `
            <button
              class="step ${index === activeStep ? "active" : ""}"
              data-action="go-phase"
              data-phase="${phases[index]}"
            >${label}</button>
          `;
        })
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
                : state.phase === "dictation"
                  ? renderDictationStage(section)
                  : renderReviewStage(section)
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
        <button class="button-ghost" data-action="go-phase" data-phase="review">直接复盘</button>
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
            <button class="button" data-action="begin-dictation">进入逐句默写</button>
            <button class="button-secondary" data-action="go-phase" data-phase="review">
              查看复盘
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
                <span><strong>${option.letter}.</strong> ${renderLookupWords(option.text)}</span>
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
      lang="en"
      dir="ltr"
      inputmode="text"
      enterkeyhint="done"
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
          ? `<button class="button" data-action="next-sentence">${state.sentenceIndex === section.sentences.length - 1 ? "查看复盘" : "下一句"}</button>`
          : `<button class="button" data-action="submit-sentence">提交本句</button>`
      }
      <button class="button-ghost" data-action="go-phase" data-phase="review">进入复盘</button>
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
            <p class="translation-line lookup-context" data-context-text="${escapeHtml(sentence.text)}"><strong>原文：</strong>${highlightWrongBookTerms(sentence.text)}</p>
            <p class="translation-line"><strong>中文：</strong>${escapeHtml(sentence.translationZh)}</p>
            ${renderWrongWordCandidates(diff)}
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

function renderReviewStage(section) {
  const progress = sectionProgress(section);
  const questionAnswers = section.questions.map((question) => ({
    question,
    answer: store.quizAnswers[question.id]
  }));
  const answered = questionAnswers.filter((item) => item.answer);
  const correct = answered.filter((item) => item.answer.correct).length;
  const attemptedSentences = section.sentences.filter(
    (sentence) => store.sentenceProgress[`${section.id}:${sentence.id}`]
  );
  const average = attemptedSentences.length
    ? Math.round(
        attemptedSentences.reduce(
          (sum, sentence) =>
            sum +
            (store.sentenceProgress[`${section.id}:${sentence.id}`]?.score || 0),
          0
        ) / attemptedSentences.length
      )
    : 0;

  return `
    <div class="panel-heading">
      <div>
        <p class="eyebrow">STEP 4</p>
        <h2>篇章复盘</h2>
        <p>查看答题和逐句默写结果，也可以随时回到任意一句重新练习。</p>
      </div>
      <button class="button" data-action="resume-dictation">从第一处未完成继续</button>
    </div>

    <div class="review-metrics">
      <div class="review-metric">
        <span>答题</span>
        <strong>${answered.length ? `${correct}/${answered.length}` : "未作答"}</strong>
      </div>
      <div class="review-metric">
        <span>逐句完成</span>
        <strong>${progress.completed}/${progress.total}</strong>
      </div>
      <div class="review-metric">
        <span>平均匹配</span>
        <strong>${average}</strong>
      </div>
    </div>

    <div class="review-subsection">
      <h3>答题结果</h3>
      <div class="review-question-list">
        ${questionAnswers
          .map(({ question, answer }) => {
            const stateLabel = !answer
              ? "未作答"
              : answer.correct
                ? "正确"
                : `选择 ${answer.selected}，正确 ${question.correct}`;
            return `
              <div class="review-question ${answer ? (answer.correct ? "correct" : "wrong") : ""}">
                <span>Q${question.number}</span>
                <strong>${escapeHtml(stateLabel)}</strong>
              </div>
            `;
          })
          .join("")}
      </div>
    </div>

    <div class="review-subsection">
      <h3>逐句原文</h3>
      <div class="review-sentence-list">
        ${section.sentences
          .map((sentence) => {
            const sentenceResult = store.sentenceProgress[`${section.id}:${sentence.id}`];
            return `
              <article class="review-sentence" data-action="play-review-sentence" data-sentence-index="${sentence.index}" tabindex="0">
                <div class="review-sentence-main">
                  <span class="review-sentence-number">${sentence.index + 1}</span>
                  <div>
                    <p class="lookup-context" data-context-text="${escapeHtml(sentence.text)}">${highlightWrongBookTerms(sentence.text)}</p>
                    <small>${escapeHtml(sentence.translationZh)}</small>
                  </div>
                </div>
                <div class="review-sentence-actions">
                  <span class="status-pill">${sentenceResult ? `匹配 ${sentenceResult.score}` : "未练"}</span>
                  <button class="text-button" data-action="jump-sentence" data-sentence-index="${sentence.index}">
                    回默写
                  </button>
                </div>
              </article>
            `;
          })
          .join("")}
      </div>
    </div>
  `;
}

function renderDiffTokens(diff) {
  return diff.tokens
    .map((token) => {
      if (token.status === "correct") {
        return `<span class="diff-token diff-correct">${escapeHtml(token.expected)}</span>`;
      }
      if (token.status === "wrong") {
        return `<span class="diff-token diff-wrong"><span class="diff-actual">${escapeHtml(token.actual)}</span><span class="diff-expected"> → ${escapeHtml(token.expected)}</span></span>`;
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
  const currentSentence = getSection()?.sentences[state.sentenceIndex];
  const context = currentSentence?.text || "";

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
      ${renderGrammar(grammar, context)}
      ${
        collocations.length
          ? `<div class="analysis-section"><h3>固定搭配</h3><ul>${collocations
              .map(
                (item, index) =>
                  `<li><strong>${renderLookupWords(item.expression || item.phrase || item)}</strong>${
                    item.meaning || item.meaningZh
                      ? ` — ${escapeHtml(item.meaning || item.meaningZh)}`
                      : ""
                  }${
                    item.example
                      ? `<br><span>${renderLookupWords(item.example)}</span>`
                      : ""
                  }<div class="analysis-actions"><button class="candidate-word" data-action="add-collocation" data-index="${index}" data-context="${escapeHtml(context)}">+ 加入错词本</button></div></li>`
              )
              .join("")}</ul></div>`
          : ""
      }
      ${renderVocabularyFromAnalysis(words, context)}
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

function renderGrammar(grammar, context = "") {
  if (!grammar) return "";
  if (typeof grammar === "string") {
    return `
      <div class="analysis-section">
        <h3>复杂句与语法</h3>
        <p>${escapeHtml(grammar)}</p>
        <div class="analysis-actions">
          <button class="candidate-word" data-action="add-grammar" data-context="${escapeHtml(context)}">+ 加入错词本</button>
        </div>
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
          ? `<ul>${examples.map((example) => `<li>${renderLookupWords(example)}</li>`).join("")}</ul>`
          : ""
      }
      <div class="analysis-actions">
        <button class="candidate-word" data-action="add-grammar" data-context="${escapeHtml(context)}">+ 加入错词本</button>
      </div>
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
                      <button
                        type="button"
                        class="vocab-word"
                        data-action="lookup-word"
                        data-word="${escapeHtml(item.word)}"
                        data-context="${escapeHtml(item.context || "")}"
                      >${escapeHtml(item.word)}</button>
                      <p class="vocab-meaning">${escapeHtml(item.meaningZh || "点击单词获取释义")}</p>
                    </div>
                    <button class="text-button" data-action="remove-word" data-word="${escapeHtml(item.word)}">删除</button>
                  </div>
                  ${item.context ? `<p class="vocab-context lookup-context" data-context-text="${escapeHtml(item.context)}">${renderLookupWords(item.context)}</p>` : ""}
                  <div class="hero-meta" style="margin-top:10px">
                    <span class="meta-chip">${wrongItemKindLabels[item.kind] || "单词"}</span>
                    <span class="meta-chip">${escapeHtml(item.reason || "未记录错因")}</span>
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

function firstIncompleteSentence(section) {
  const index = section.sentences.findIndex((sentence) => {
    const progress = store.sentenceProgress[`${section.id}:${sentence.id}`];
    return !progress || progress.score < 80;
  });
  return index >= 0 ? index : 0;
}

function beginDictation(section = getSection()) {
  state.mode = "passage";
  state.questionId = null;
  state.phase = "dictation";
  state.sentenceIndex = firstIncompleteSentence(section);
  state.dictationText = "";
  state.currentDiff = null;
  render();
}

function goToPhase(phase) {
  const section = getSection();
  if (!section) return;

  if (phase === "quiz" && state.mode === "question") {
    state.phase = "quiz";
    render();
    return;
  }

  if (phase !== "quiz") {
    state.mode = "passage";
    state.questionId = null;
  }
  state.phase = phase;
  state.quizSubmitted = phase === "quiz" ? state.quizSubmitted : false;

  if (phase === "dictation") {
    state.sentenceIndex = firstIncompleteSentence(section);
    state.dictationText = "";
    state.currentDiff = null;
  }
  render();
}

function jumpToSentence(index) {
  const section = getSection();
  const sentenceIndex = Number(index);
  if (!section || !Number.isInteger(sentenceIndex) || !section.sentences[sentenceIndex]) {
    return;
  }
  state.mode = "passage";
  state.questionId = null;
  state.phase = "dictation";
  state.sentenceIndex = sentenceIndex;
  state.dictationText = "";
  state.currentDiff = null;
  render();
}

function startQuestion(questionId) {
  const question = getQuestion(questionId);
  state.route = "practice";
  state.mode = "question";
  state.sectionId = question.sectionId;
  state.questionId = questionId;
  state.phase = "quiz";
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

function renderWordLookup(data) {
  const examples = Array.isArray(data.examples) ? data.examples : [];
  const collocations = Array.isArray(data.collocations) ? data.collocations : [];
  wordDialogContent.innerHTML = `
    <div class="word-heading-row">
      <strong>${escapeHtml(data.word || state.lookupItem?.word || "")}</strong>
      ${data.partOfSpeech ? `<span>${escapeHtml(data.partOfSpeech)}</span>` : ""}
      ${data.phonetic ? `<span>/${escapeHtml(data.phonetic)}/</span>` : ""}
    </div>
    <p class="word-definition">${escapeHtml(data.meaningZh || "暂无中文释义")}</p>
    ${data.meaningEn ? `<p class="word-definition"><small>${escapeHtml(data.meaningEn)}</small></p>` : ""}
    ${
      examples.length
        ? `<ul class="word-detail-list">${examples
            .map((example) => `<li>${escapeHtml(example)}</li>`)
            .join("")}</ul>`
        : ""
    }
    ${
      collocations.length
        ? `<ul class="word-detail-list">${collocations
            .map((item) => `<li>${escapeHtml(item)}</li>`)
            .join("")}</ul>`
        : ""
    }
  `;
  state.lookupItem = {
    ...state.lookupItem,
    ...data,
    meaningZh: data.meaningZh || ""
  };
  addLookedUpWordButton.disabled = false;
}

async function lookupWordData(word, context = "") {
  const key = String(word || "").trim().toLowerCase();
  if (!key) return null;
  if (store.wordLookup[key]) {
    const cached = store.wordLookup[key];
    const entry = store.wrongWords[key];
    if (entry && !entry.meaningZh && cached.meaningZh) {
      entry.meaningZh = cached.meaningZh;
      entry.meaningEn = cached.meaningEn || "";
      entry.phonetic = cached.phonetic || "";
      saveStore(store);
    }
    return cached;
  }

  const result = await requestAi(store, {
    type: "word",
    word,
    context
  });
  if (!result || typeof result !== "object") {
    throw new Error("没有取得单词释义");
  }
  store.wordLookup[key] = result;
  const entry = store.wrongWords[key];
  if (entry) {
    entry.meaningZh = result.meaningZh || entry.meaningZh;
    entry.meaningEn = result.meaningEn || entry.meaningEn;
    entry.phonetic = result.phonetic || entry.phonetic;
  }
  saveStore(store);
  return result;
}

async function openWordLookup(word, context = "") {
  state.lookupItem = { word, context, kind: "word" };
  wordDialogTitle.textContent = word;
  wordDialogContent.innerHTML = `<p class="hint">正在查询释义…</p>`;
  addLookedUpWordButton.disabled = true;
  wordDialog.showModal();
  try {
    renderWordLookup(await lookupWordData(word, context));
  } catch (error) {
    wordDialogContent.innerHTML = `
      <p class="word-definition">${escapeHtml(error.message)}</p>
      <p class="hint">请确认 AI 接口设置后重试。</p>
    `;
    if (error.code === "CONFIG_REQUIRED") {
      showToast("请先配置 AI 接口", "error");
    }
  }
}

function queueWrongBookItem(item) {
  if (wordDialog.open) {
    wordDialog.close();
  }
  state.pendingAdd = item;
  reasonItemName.textContent = item.word;
  reasonDialog.showModal();
}

function getCurrentSentenceAnalysis() {
  const sentence = getSection()?.sentences[state.sentenceIndex];
  return sentence ? state.sentenceAnalyses[sentence.id] : null;
}

function nextSentence() {
  const section = getSection();
  if (state.sentenceIndex >= section.sentences.length - 1) {
    state.phase = "review";
    state.dictationText = "";
    state.currentDiff = null;
    render();
    return;
  } else {
    state.sentenceIndex += 1;
  }
  state.dictationText = "";
  state.currentDiff = null;
  render();
}

function selectExam(examId) {
  const exam = state.exams.find((item) => item.meta.id === examId);
  if (!exam) return;
  audioEl.pause();
  stopAt = null;
  state.data = exam;
  state.examId = exam.meta.id;
  state.route = "home";
  state.sectionId = null;
  state.questionId = null;
  state.phase = "blind";
  state.selectedAnswers = {};
  state.quizSubmitted = false;
  state.dictationText = "";
  state.currentDiff = null;
  store.lastExamId = exam.meta.id;
  saveStore(store);
  setAudioSource();
  renderHome();
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

  if (action === "lookup-word") {
    event.preventDefault();
    event.stopPropagation();
    const context =
      button.closest("[data-context-text]")?.dataset.contextText ||
      button.dataset.context ||
      "";
    await openWordLookup(button.dataset.word, context);
    return;
  }
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
  if (action === "play-review-sentence") {
    const section = getSection();
    const sentence = section?.sentences[Number(button.dataset.sentenceIndex)];
    if (sentence) {
      playRange(sentence.start - 0.08, sentence.end + 0.12);
    }
    return;
  }
  if (action === "begin-quiz") {
    state.phase = "quiz";
    state.selectedAnswers = {};
    state.quizSubmitted = false;
    render();
    return;
  }
  if (action === "go-phase") {
    goToPhase(button.dataset.phase);
    return;
  }
  if (action === "submit-quiz") {
    await submitQuiz();
    return;
  }
  if (action === "begin-dictation") {
    beginDictation();
    return;
  }
  if (action === "resume-dictation") {
    beginDictation();
    return;
  }
  if (action === "jump-sentence") {
    jumpToSentence(button.dataset.sentenceIndex);
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
    queueWrongBookItem({
      word: button.dataset.word,
      kind: "word",
      meaningZh: button.dataset.meaning || "",
      context: button.dataset.context || sentence?.text || "",
      sectionId: section?.id || ""
    });
    return;
  }
  if (action === "add-grammar") {
    const analysis = getCurrentSentenceAnalysis();
    const grammar = analysis?.grammar;
    if (!grammar) return;
    const isText = typeof grammar === "string";
    const word = isText
      ? "重点语法"
      : grammar.title || grammar.structure || "重点语法";
    const meaningZh = isText
      ? grammar
      : [grammar.structure, grammar.explanation].filter(Boolean).join("；");
    queueWrongBookItem({
      word,
      kind: "grammar",
      meaningZh,
      context: button.dataset.context || "",
      sectionId: getSection()?.id || ""
    });
    return;
  }
  if (action === "add-collocation") {
    const analysis = getCurrentSentenceAnalysis();
    const item = analysis?.collocations?.[Number(button.dataset.index)];
    if (!item) return;
    queueWrongBookItem({
      word: item.expression || item.phrase || "固定搭配",
      kind: "phrase",
      meaningZh: item.meaning || item.meaningZh || "",
      context: button.dataset.context || item.example || "",
      sectionId: getSection()?.id || ""
    });
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
});

app.addEventListener("input", (event) => {
  if (event.target.id === "dictation-input") {
    state.dictationText = event.target.value;
  }
});

app.addEventListener("change", (event) => {
  if (event.target.id === "exam-select") {
    selectExam(event.target.value);
    return;
  }
  const questionId = event.target.dataset.questionOption;
  if (questionId) {
    state.selectedAnswers[questionId] = event.target.value;
  }
});

app.addEventListener("keydown", (event) => {
  if (!["Enter", " "].includes(event.key)) return;
  const target = event.target.closest(
    '[data-action="lookup-word"], [data-action="play-review-sentence"]'
  );
  if (!target) return;
  event.preventDefault();
  target.click();
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

document.querySelector("#cancel-reason").addEventListener("click", () => {
  state.pendingAdd = null;
  reasonDialog.close();
});

reasonDialog.addEventListener("click", (event) => {
  const reasonButton = event.target.closest("[data-reason]");
  if (!reasonButton || !state.pendingAdd) return;
  const reason = reasonButton.dataset.reason;
  const item = state.pendingAdd;
  const entry = addWrongWord(store, item.word, {
    ...item,
    reason
  });
  incrementTag(store, `reason:${reason}`);
  state.pendingAdd = null;
  reasonDialog.close();
  showToast(`已加入错词本：${item.word}`);
  if (state.route === "practice" && state.phase === "review") {
    render();
  }
  if (entry && !entry.meaningZh && item.kind !== "grammar") {
    lookupWordData(item.word, item.context || "")
      .then(() => {
        if (state.route === "vocabulary") {
          renderVocabularyPage();
        } else if (state.route === "practice" && state.phase === "review") {
          render();
        }
      })
      .catch(() => {
        showToast("已收藏，可在错词本中点击单词重试获取释义", "error");
      });
  }
});

reasonDialog.addEventListener("close", () => {
  state.pendingAdd = null;
});

document
  .querySelector("#close-word-dialog")
  .addEventListener("click", () => wordDialog.close());
document
  .querySelector("#close-word-action")
  .addEventListener("click", () => wordDialog.close());

addLookedUpWordButton.addEventListener("click", () => {
  const item = state.lookupItem;
  if (!item?.word) return;
  const queued = {
    word: item.word,
    kind: "word",
    meaningZh: item.meaningZh || "",
    meaningEn: item.meaningEn || "",
    phonetic: item.phonetic || "",
    context: item.context || ""
  };
  wordDialog.close();
  queueWrongBookItem(queued);
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

function migrateLegacyProgress(exams) {
  const legacyExam = exams.find((exam) => exam.meta.id === "cet6-2021-06-set1");
  if (!legacyExam) return false;
  let migrated = false;

  for (const section of legacyExam.sections) {
    const legacySectionId = section.id.split("--").slice(1).join("--");
    for (const sentence of section.sentences) {
      const legacyKey = `${legacySectionId}:${legacySectionId}-s${sentence.index + 1}`;
      const currentKey = `${section.id}:${sentence.id}`;
      if (store.sentenceProgress[legacyKey] && !store.sentenceProgress[currentKey]) {
        store.sentenceProgress[currentKey] = store.sentenceProgress[legacyKey];
        delete store.sentenceProgress[legacyKey];
        migrated = true;
      }
    }
  }

  for (const question of legacyExam.questions) {
    const legacyKey = `q${question.number}`;
    if (store.quizAnswers[legacyKey] && !store.quizAnswers[question.id]) {
      store.quizAnswers[question.id] = store.quizAnswers[legacyKey];
      delete store.quizAnswers[legacyKey];
      migrated = true;
    }
  }

  if (migrated) {
    saveStore(store);
  }
  return migrated;
}

async function init() {
  try {
    const dataRoot = new URL("../assets/data/", import.meta.url);
    const indexResponse = await fetch(new URL("index.json", dataRoot));
    if (!indexResponse.ok) {
      throw new Error(`题库索引加载失败：${indexResponse.status}`);
    }
    state.examIndex = await indexResponse.json();
    state.exams = await Promise.all(
      state.examIndex.exams.map(async (entry) => {
        const response = await fetch(new URL(entry.dataPath, dataRoot));
        if (!response.ok) {
          throw new Error(`${entry.id} 加载失败：${response.status}`);
        }
        return response.json();
      })
    );

    const migratedLegacy = migrateLegacyProgress(state.exams);
    const savedExam = state.exams.find((exam) => exam.meta.id === store.lastExamId);
    const fallbackExam = migratedLegacy
      ? state.exams.find((exam) => exam.meta.id === "cet6-2021-06-set1")
      : state.exams.find((exam) => exam.meta.id === state.examIndex.defaultExamId);
    state.data = savedExam || fallbackExam || state.exams[0];
    state.examId = state.data.meta.id;
    store.lastExamId = state.examId;
    saveStore(store);
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
