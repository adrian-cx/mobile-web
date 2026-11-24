/**
 * 国际商务导论 · 手机端题库精练 (H5 + PWA)
 * 纯前端静态运行 · 本地持久化存储 (与桌面版 & 小程序版 JSON 互通)
 */
(function () {
  "use strict";

  const QUESTION_BANK = Array.isArray(window.QUESTION_BANK) ? window.QUESTION_BANK : [];
  const STORAGE_KEY = "ib_intro_quiz_state_v1";
  const QUESTION_MAP = new Map(QUESTION_BANK.map((q) => [q.id, q]));

  // Build Chapter & Section Indexes
  const CHAPTER_LIST = [];
  const CHAPTER_SECTIONS = new Map();
  const CHAPTER_IDS = new Map();
  const SECTION_IDS = new Map();

  for (const q of QUESTION_BANK) {
    if (!CHAPTER_SECTIONS.has(q.chapter)) {
      CHAPTER_LIST.push(q.chapter);
      CHAPTER_SECTIONS.set(q.chapter, []);
      CHAPTER_IDS.set(q.chapter, []);
    }
    const secs = CHAPTER_SECTIONS.get(q.chapter);
    if (!secs.includes(q.section)) {
      secs.push(q.section);
      SECTION_IDS.set(q.section, []);
    }
    CHAPTER_IDS.get(q.chapter).push(q.id);
    SECTION_IDS.get(q.section).push(q.id);
  }

  const TOTAL_SECTIONS = Array.from(CHAPTER_SECTIONS.values()).reduce((a, b) => a + b.length, 0);
  const DISPUTED_COUNT = QUESTION_BANK.filter((q) => q.disputed).length;

  const ICONS = {
    check: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
    x: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    book: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>',
    redo: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>',
    inbox: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>'
  };

  function fisherYates(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function createDefaultState() {
    return {
      theme: "system",
      fontSize: "md", // sm | md | lg
      mode: "practice", // practice | recite | exam
      view: "all", // all | wrong | favorite | disputed
      order: "seq", // seq | random
      autoNext: false,
      sheetOpen: true,
      shuffledIds: fisherYates(QUESTION_BANK.map((q) => q.id)),
      filters: {
        chapter: "all",
        section: "all",
        type: "all",
        status: "all",
        query: ""
      },
      currentId: QUESTION_BANK[0] ? QUESTION_BANK[0].id : null,
      practiceAnswers: {},
      wrongSessionAnswers: {},
      wrongIds: [],
      favoriteIds: [],
      exam: {
        status: "idle", // idle | running | submitted
        config: {
          scope: "filtered",
          count: 50,
          random: true,
          timeLimitMin: 0
        },
        questionIds: [],
        answers: {},
        currentIndex: 0,
        elapsedSeconds: 0,
        showReport: true
      }
    };
  }

  function loadState() {
    const def = createDefaultState();
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return def;
      const parsed = JSON.parse(raw);
      const merged = {
        ...def,
        ...parsed,
        filters: { ...def.filters, ...(parsed.filters || {}) },
        exam: {
          ...def.exam,
          ...(parsed.exam || {}),
          config: { ...def.exam.config, ...((parsed.exam && parsed.exam.config) || {}) }
        }
      };
      const validSet = new Set(QUESTION_BANK.map((q) => q.id));
      const kept = (merged.shuffledIds || []).filter((id) => validSet.has(id));
      const keptSet = new Set(kept);
      const missing = QUESTION_BANK.map((q) => q.id).filter((id) => !keptSet.has(id));
      merged.shuffledIds = kept.concat(fisherYates(missing));
      merged.wrongIds = (merged.wrongIds || []).filter((id) => validSet.has(id));
      merged.favoriteIds = (merged.favoriteIds || []).filter((id) => validSet.has(id));
      if (!["sm", "md", "lg"].includes(merged.fontSize)) merged.fontSize = "md";
      if (merged.exam && Array.isArray(merged.exam.questionIds)) {
        merged.exam.questionIds = merged.exam.questionIds.filter((id) => validSet.has(id));
        if (merged.exam.status !== "idle" && merged.exam.questionIds.length === 0) {
          merged.exam.status = "idle";
        }
      }
      return merged;
    } catch (_) {
      return def;
    }
  }

  let state = loadState();
  let draftMultiSelection = new Set();
  let examTimerHandle = null;
  let toastTimer = null;
  let chapterQuery = "";
  let cardAnimDir = ""; // "" | "next" | "prev"
  let justSubmittedId = null;
  let confirmCallback = null;
  let deferredInstallPrompt = null;
  let pasteImportExpanded = false;

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn("Save state failed:", e);
    }
  }

  function showToast(msg) {
    const el = document.getElementById("toast");
    if (!el) return;
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 1900);
  }

  function triggerHaptic(ms = 10) {
    try {
      if (navigator.vibrate) navigator.vibrate(ms);
    } catch (_) {}
  }

  // =========================================================================
  // Zero-Dependency Offline-Ready Markdown Renderer
  // =========================================================================
  function escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderMarkdown(md, inline = false) {
    if (!md) return "";
    let s = String(md);
    const codeBlocks = [];
    s = s.replace(/```([\w-]*)\n([\s\S]*?)```/g, (_, lang, code) => {
      const token = `@@CB_${codeBlocks.length}@@`;
      codeBlocks.push(`<pre><code class="lang-${escapeHtml(lang)}">${escapeHtml(code)}</code></pre>`);
      return token;
    });
    s = escapeHtml(s);
    s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
    s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1 ↗</a>');
    s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/\*([^*]+)\*/g, "<em>$1</em>");
    if (!inline) {
      s = s.replace(/\n/g, "<br/>");
    }
    codeBlocks.forEach((html, idx) => {
      s = s.replace(`@@CB_${idx}@@`, html);
    });
    return s;
  }

  // =========================================================================
  // Theme & Font Size
  // =========================================================================
  function applyAppearance() {
    const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    const isDark = state.theme === "dark" || (state.theme === "system" && prefersDark);
    document.documentElement.classList.toggle("dark", isDark);
    document.documentElement.setAttribute("data-font", state.fontSize || "md");

    const sun = document.getElementById("icon-sun");
    const moon = document.getElementById("icon-moon");
    if (sun && moon) {
      sun.style.display = isDark ? "block" : "none";
      moon.style.display = isDark ? "none" : "block";
    }
    const metaTheme = document.getElementById("meta-theme-color");
    if (metaTheme) {
      metaTheme.setAttribute("content", isDark ? "#0e0e10" : "#f7f6f2");
    }
  }

  // =========================================================================
  // Core Filtering, Scoring & Navigation Logic
  // =========================================================================
  function getAnswerMapForContext() {
    if (state.mode === "practice" && state.view === "wrong") {
      return state.wrongSessionAnswers;
    }
    return state.practiceAnswers;
  }

  function getDisplayOptions(q) {
    if (q.type === "boolean") {
      return [
        { key: "对", displayKey: "A", text: "正确（对）" },
        { key: "错", displayKey: "B", text: "错误（错）" }
      ];
    }
    return (q.options || []).map((o) => ({ key: o.key, displayKey: o.key, text: o.text }));
  }

  function evaluateAnswer(q, userVal) {
    if (userVal === undefined || userVal === null || userVal === "") return false;
    if (q.type === "single" || q.type === "boolean") {
      return String(userVal).trim() === String(q.answer).trim();
    }
    if (q.type === "multiple") {
      const expected = Array.isArray(q.answer) ? q.answer.slice().sort() : String(q.answer).split("").sort();
      const actual = Array.isArray(userVal) ? userVal.slice().sort() : [];
      return expected.length === actual.length && expected.every((v, i) => v === actual[i]);
    }
    if (q.type === "fill") {
      const norm = (s) => String(s).trim().toLowerCase().replace(/\s+/g, " ");
      const accepts = Array.isArray(q.answer) ? q.answer : [q.answer];
      return accepts.some((a) => norm(a) === norm(userVal));
    }
    return false;
  }

  function formatAnswerLabel(q, val) {
    if (val === undefined || val === null || val === "" || (Array.isArray(val) && val.length === 0)) {
      return "未作答";
    }
    if (Array.isArray(val)) return val.join("、");
    if (q.type === "single") {
      const opt = (q.options || []).find((o) => o.key === val);
      return opt ? `${val} · ${opt.text}` : String(val);
    }
    return String(val);
  }

  function formatCorrectAnswer(q) {
    if (q.type === "single") return `${q.answer}${q.answerText ? " · " + q.answerText : ""}`;
    if (q.type === "multiple") return Array.isArray(q.answer) ? q.answer.join("、") : String(q.answer);
    return String(q.answerText || q.answer);
  }

  function getFilteredQuestionIds() {
    const baseIds = state.order === "random" ? state.shuffledIds : QUESTION_BANK.map((q) => q.id);
    const wrongSet = new Set(state.wrongIds);
    const favSet = new Set(state.favoriteIds);
    const ansMap = getAnswerMapForContext();
    const { chapter, section, type, status, query } = state.filters;
    const kw = (query || "").trim().toLowerCase();

    return baseIds.filter((id) => {
      const q = QUESTION_MAP.get(id);
      if (!q) return false;
      if (state.view === "wrong" && !wrongSet.has(id)) return false;
      if (state.view === "favorite" && !favSet.has(id)) return false;
      if (state.view === "disputed" && !q.disputed) return false;
      if (chapter !== "all" && q.chapter !== chapter) return false;
      if (section !== "all" && q.section !== section) return false;
      if (type !== "all" && q.type !== type) return false;

      if (status !== "all") {
        const rec = ansMap[id];
        if (status === "unanswered" && rec) return false;
        if (status === "correct" && (!rec || !rec.isCorrect)) return false;
        if (status === "wrong" && (!rec || rec.isCorrect)) return false;
      }

      if (kw) {
        const hay = [
          q.stem,
          q.section,
          q.chapter,
          q.explanation,
          ...(q.options || []).map((o) => o.text)
        ].join(" ").toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      return true;
    });
  }

  function getActiveList() {
    if (state.mode === "exam" && state.exam.status !== "idle") {
      return state.exam.questionIds;
    }
    return getFilteredQuestionIds();
  }

  function getCurrentIndexAndQuestion(list) {
    if (!list.length) return { idx: -1, q: null };
    if (state.mode === "exam" && state.exam.status !== "idle") {
      const idx = Math.max(0, Math.min(state.exam.currentIndex, list.length - 1));
      state.exam.currentIndex = idx;
      return { idx, q: QUESTION_MAP.get(list[idx]) };
    }
    let idx = list.indexOf(state.currentId);
    if (idx === -1) {
      idx = 0;
      state.currentId = list[0];
    }
    return { idx, q: QUESTION_MAP.get(list[idx]) };
  }

  function addWrong(id) {
    if (!state.wrongIds.includes(id)) state.wrongIds.push(id);
  }

  function removeWrong(id) {
    const prevList = state.view === "wrong" ? getFilteredQuestionIds() : [];
    const prevIdx = prevList.indexOf(id);
    state.wrongIds = state.wrongIds.filter((x) => x !== id);
    delete state.wrongSessionAnswers[id];
    if (state.view === "wrong" && prevIdx !== -1) {
      const nextList = getFilteredQuestionIds();
      state.currentId = nextList.length ? nextList[Math.min(prevIdx, nextList.length - 1)] : null;
    }
    saveState();
    showToast("已移出错题本");
    renderAll();
  }

  function toggleFavorite(id) {
    if (!id) return;
    triggerHaptic(8);
    if (state.favoriteIds.includes(id)) {
      const prevList = state.view === "favorite" ? getFilteredQuestionIds() : [];
      const prevIdx = prevList.indexOf(id);
      state.favoriteIds = state.favoriteIds.filter((x) => x !== id);
      if (state.view === "favorite" && prevIdx !== -1) {
        const nextList = getFilteredQuestionIds();
        state.currentId = nextList.length ? nextList[Math.min(prevIdx, nextList.length - 1)] : null;
      }
      showToast("已取消收藏");
    } else {
      state.favoriteIds.push(id);
      showToast("已收藏本题 ★");
    }
    saveState();
    renderAll();
  }

  // =========================================================================
  // Bottom Sheet Controller
  // =========================================================================
  function openSheet(id) {
    closeAllSheets(false);
    const sheet = document.getElementById(id);
    const bd = document.getElementById("backdrop");
    if (!sheet || !bd) return;
    if (id === "sheet-answers") renderAnswerSheet();
    if (id === "sheet-chapters") renderChapterSheet();
    if (id === "sheet-filters") renderFilterSheet();
    if (id === "sheet-manage") renderManageSheet();
    if (id === "sheet-install") renderInstallSheet();
    bd.classList.add("open");
    sheet.classList.add("open");
  }

  function closeAllSheets(clearConfirm = true) {
    document.querySelectorAll(".bottom-sheet.open").forEach((el) => el.classList.remove("open"));
    const bd = document.getElementById("backdrop");
    if (bd) bd.classList.remove("open");
    if (clearConfirm) confirmCallback = null;
  }

  function openConfirm(title, desc, okText, onConfirm, isDanger = false) {
    document.getElementById("confirm-title").textContent = title;
    document.getElementById("confirm-desc").textContent = desc;
    const okBtn = document.getElementById("btn-confirm-ok");
    okBtn.textContent = okText || "确定";
    okBtn.className = isDanger ? "btn btn-danger-soft" : "btn btn-primary";
    confirmCallback = onConfirm;
    openSheet("sheet-confirm");
  }

  // =========================================================================
  // Exam Timer & Workflow
  // =========================================================================
  function formatDuration(totalSec) {
    const sec = Math.max(0, Math.floor(totalSec));
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    const pad = (n) => String(n).padStart(2, "0");
    return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  }

  function updateExamBarUI() {
    const bar = document.getElementById("exam-bar");
    const badge = document.getElementById("exam-timer-badge");
    const txt = document.getElementById("exam-timer-text");
    const isRunning = state.mode === "exam" && state.exam.status === "running";
    bar.classList.toggle("show", isRunning);
    if (!isRunning) return;

    const limitSec = (state.exam.config.timeLimitMin || 0) * 60;
    if (limitSec > 0) {
      const remain = Math.max(0, limitSec - state.exam.elapsedSeconds);
      txt.textContent = `剩余 ${formatDuration(remain)}`;
      badge.classList.toggle("danger", remain <= 60);
      badge.classList.toggle("warn", remain > 60 && remain <= 300);
    } else {
      txt.textContent = `用时 ${formatDuration(state.exam.elapsedSeconds)}`;
      badge.classList.remove("warn", "danger");
    }
  }

  function syncExamTimer() {
    clearInterval(examTimerHandle);
    examTimerHandle = null;
    updateExamBarUI();
    if (state.mode === "exam" && state.exam.status === "running") {
      examTimerHandle = setInterval(() => {
        state.exam.elapsedSeconds += 1;
        const limitSec = (state.exam.config.timeLimitMin || 0) * 60;
        updateExamBarUI();
        if (state.exam.elapsedSeconds % 5 === 0) saveState();
        if (limitSec > 0 && state.exam.elapsedSeconds >= limitSec) {
          submitExam(true);
        }
      }, 1000);
    }
  }

  function startExam() {
    const cfg = state.exam.config;
    let pool = [];
    if (cfg.scope === "all") pool = QUESTION_BANK.map((q) => q.id);
    else if (cfg.scope === "wrong") pool = state.wrongIds.slice();
    else pool = getFilteredQuestionIds();

    if (!pool.length) {
      showToast("当前范围暂无可用题目");
      return;
    }
    if (cfg.random) pool = fisherYates(pool);
    const count = cfg.count === "all" ? pool.length : Math.min(Number(cfg.count), pool.length);

    state.exam.questionIds = pool.slice(0, count);
    state.exam.answers = {};
    state.exam.currentIndex = 0;
    state.exam.elapsedSeconds = 0;
    state.exam.status = "running";
    state.exam.showReport = false;
    draftMultiSelection.clear();
    saveState();
    syncExamTimer();
    renderAll();
    window.scrollTo({ top: 0, behavior: "smooth" });
    showToast(`考试开始，共 ${count} 题`);
  }

  function requestSubmitExam() {
    const total = state.exam.questionIds.length;
    const answered = state.exam.questionIds.filter((id) => {
      const v = state.exam.answers[id];
      return v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0);
    }).length;
    const unanswered = total - answered;
    const desc = unanswered > 0
      ? `已作答 ${answered} / ${total} 题，还有 ${unanswered} 题未答。交卷后将自动判分并将错题收入错题本。`
      : `全部 ${total} 题均已作答，确认立即交卷并查看成绩报告吗？`;

    openConfirm("确认交卷", desc, "立即交卷", () => submitExam(false));
  }

  function submitExam(autoTimeout = false) {
    clearInterval(examTimerHandle);
    examTimerHandle = null;
    state.exam.status = "submitted";
    state.exam.showReport = true;

    let addedWrong = 0;
    for (const id of state.exam.questionIds) {
      const q = QUESTION_MAP.get(id);
      const val = state.exam.answers[id];
      const hasVal = val !== undefined && val !== "" && !(Array.isArray(val) && val.length === 0);
      if (hasVal && !evaluateAnswer(q, val)) {
        if (!state.wrongIds.includes(id)) addedWrong += 1;
        addWrong(id);
      }
    }
    closeAllSheets();
    saveState();
    updateExamBarUI();
    renderAll();
    window.scrollTo({ top: 0, behavior: "smooth" });
    showToast(autoTimeout ? "时间到，已自动交卷" : `交卷完成，新增 ${addedWrong} 道错题`);
  }

  // =========================================================================
  // Render Top Header, Sub-Toolbar & Bottom Dock
  // =========================================================================
  function renderToolbars() {
    document.getElementById("brand-meta").textContent = `${CHAPTER_LIST.length}章 ${TOTAL_SECTIONS}节 · ${QUESTION_BANK.length}题`;

    document.querySelectorAll(".mode-seg-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.mode === state.mode);
    });

    const hideSub = state.mode === "exam" && state.exam.status !== "idle";
    const subToolbar = document.getElementById("sub-toolbar");
    subToolbar.style.display = hideSub ? "none" : "flex";

    if (!hideSub) {
      document.getElementById("cnt-all").textContent = QUESTION_BANK.length;
      document.getElementById("cnt-wrong").textContent = state.wrongIds.length;
      document.getElementById("cnt-fav").textContent = state.favoriteIds.length;
      document.getElementById("cnt-disputed").textContent = DISPUTED_COUNT;

      document.querySelectorAll(".view-pill").forEach((pill) => {
        pill.classList.toggle("active", pill.dataset.view === state.view);
      });

      const chBtn = document.getElementById("btn-open-chapters");
      const chLbl = document.getElementById("chapter-btn-label");
      const scopeName = state.filters.section !== "all"
        ? state.filters.section
        : state.filters.chapter !== "all"
          ? state.filters.chapter
          : "全部章节";
      chLbl.textContent = scopeName;
      chBtn.classList.toggle("has-active", state.filters.chapter !== "all" || state.filters.section !== "all");

      const fBtn = document.getElementById("btn-open-filters");
      const fLbl = document.getElementById("filter-btn-label");
      const activeTags = [];
      if (state.order === "random") activeTags.push("乱序");
      if (state.filters.type !== "all") activeTags.push(state.filters.type === "single" ? "单选" : "判断");
      if (state.filters.status !== "all") {
        const stMap = { unanswered: "未做", wrong: "答错", correct: "答对" };
        activeTags.push(stMap[state.filters.status] || "");
      }
      fLbl.textContent = activeTags.length ? activeTags.join("·") : "筛选·设置";
      fBtn.classList.toggle("has-active", activeTags.length > 0);

      const sBtn = document.getElementById("btn-toggle-search");
      sBtn.classList.toggle("has-active", Boolean(state.filters.query.trim()));
      const sInput = document.getElementById("search-input");
      if (document.activeElement !== sInput) {
        sInput.value = state.filters.query;
      }

      const list = getFilteredQuestionIds();
      const hasAnyFilter = state.filters.chapter !== "all" ||
        state.filters.section !== "all" ||
        state.filters.type !== "all" ||
        state.filters.status !== "all" ||
        state.filters.query.trim() !== "";
      const canResetWrongSession = state.mode === "practice" &&
        state.view === "wrong" &&
        Object.keys(state.wrongSessionAnswers).length > 0;

      const banner = document.getElementById("active-filter-banner");
      const showBanner = hasAnyFilter || state.order === "random" || canResetWrongSession;
      banner.classList.toggle("show", showBanner);
      if (showBanner) {
        document.getElementById("filter-status-text").textContent =
          `${state.order === "random" ? "随机乱序 · " : ""}当前共 ${list.length} 题`;
        document.getElementById("btn-banner-reshuffle").style.display = state.order === "random" ? "inline-block" : "none";
        document.getElementById("btn-banner-reset-wrong").style.display = canResetWrongSession ? "inline-block" : "none";
        document.getElementById("btn-banner-clear").style.display = hasAnyFilter ? "inline-block" : "none";
      }
    }

    updateExamBarUI();
    renderBottomDock();
  }

  function renderBottomDock() {
    const dock = document.getElementById("bottom-bar");
    const isExamIdle = state.mode === "exam" && state.exam.status === "idle";
    const isExamReport = state.mode === "exam" && state.exam.status === "submitted" && state.exam.showReport;
    const list = getActiveList();

    if (isExamIdle || isExamReport || !list.length) {
      dock.style.display = "none";
      return;
    }
    dock.style.display = "block";

    const { idx, q } = getCurrentIndexAndQuestion(list);
    const isFav = q ? state.favoriteIds.includes(q.id) : false;
    const isExamRunning = state.mode === "exam" && state.exam.status === "running";

    // Prev button
    document.getElementById("btn-prev").disabled = idx <= 0;

    // Fav button
    const favBtn = document.getElementById("btn-fav-dock");
    const starSvg = document.getElementById("dock-star-icon");
    favBtn.classList.toggle("starred", isFav);
    starSvg.setAttribute("fill", isFav ? "currentColor" : "none");

    // Progress indicator on Answer Sheet button
    let doneCount = 0;
    if (isExamRunning || (state.mode === "exam" && state.exam.status === "submitted")) {
      for (const id of list) {
        const v = state.exam.answers[id];
        if (v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0)) doneCount++;
      }
    } else {
      const ansMap = getAnswerMapForContext();
      for (const id of list) {
        if (ansMap[id]) doneCount++;
      }
    }
    const pct = list.length ? Math.round((doneCount / list.length) * 100) : 0;
    document.getElementById("dock-progress-text").textContent = `${idx + 1}/${list.length}`;
    document.getElementById("dock-progress-fill").style.width = `${pct}%`;

    // Contextual Next / Submit Exam button
    const nextBtn = document.getElementById("btn-next");
    const nextLbl = document.getElementById("btn-next-label");
    const nextIcon = document.getElementById("btn-next-icon");

    if (isExamRunning && idx === list.length - 1) {
      nextBtn.disabled = false;
      nextLbl.textContent = "交卷判分";
      nextIcon.style.display = "none";
      nextBtn.dataset.action = "submit-exam";
    } else {
      nextBtn.disabled = idx >= list.length - 1;
      nextLbl.textContent = "下一题";
      nextIcon.style.display = "block";
      nextBtn.dataset.action = "next";
    }
  }

  // =========================================================================
  // Render Main Question Stage / Exam Setup / Exam Report
  // =========================================================================
  function renderExamSetup(container) {
    const cfg = state.exam.config;
    const filteredCnt = getFilteredQuestionIds().length;
    const allCnt = QUESTION_BANK.length;
    const wrongCnt = state.wrongIds.length;
    const poolCnt = cfg.scope === "all" ? allCnt : cfg.scope === "wrong" ? wrongCnt : filteredCnt;
    const targetCnt = cfg.count === "all" ? poolCnt : Math.min(Number(cfg.count), poolCnt);

    container.innerHTML = `
      <div class="exam-card">
        <div class="exam-title">全真模拟考试</div>
        <div class="exam-desc">考试期间隐藏参考答案与解析，交卷后自动统计百分制得分，并将答错题自动加入错题本。</div>

        <div class="field-block">
          <span class="field-label">出题范围</span>
          <div class="chip-grid">
            <button class="choice-chip ${cfg.scope === "filtered" ? "active" : ""}" type="button" data-exam-scope="filtered">当前筛选 (${filteredCnt})</button>
            <button class="choice-chip ${cfg.scope === "all" ? "active" : ""}" type="button" data-exam-scope="all">全部题库 (${allCnt})</button>
            <button class="choice-chip ${cfg.scope === "wrong" ? "active" : ""}" type="button" data-exam-scope="wrong">错题本 (${wrongCnt})</button>
          </div>
        </div>

        <div class="field-block">
          <span class="field-label">抽取题量</span>
          <div class="chip-grid">
            ${[20, 50, 100, "all"].map((c) => `
              <button class="choice-chip ${String(cfg.count) === String(c) ? "active" : ""}" type="button" data-exam-count="${c}">
                ${c === "all" ? `全部 (${poolCnt})` : `${c} 题`}
              </button>
            `).join("")}
          </div>
        </div>

        <div class="field-block">
          <span class="field-label">出题顺序</span>
          <div class="chip-grid">
            <button class="choice-chip ${cfg.random ? "active" : ""}" type="button" data-exam-random="1">随机抽题</button>
            <button class="choice-chip ${!cfg.random ? "active" : ""}" type="button" data-exam-random="0">按原顺序</button>
          </div>
        </div>

        <div class="field-block">
          <span class="field-label">计时设置</span>
          <div class="chip-grid">
            ${[[0, "不限时"], [30, "30分钟"], [60, "60分钟"], [90, "90分钟"]].map(([m, lbl]) => `
              <button class="choice-chip ${Number(cfg.timeLimitMin) === m ? "active" : ""}" type="button" data-exam-time="${m}">${lbl}</button>
            `).join("")}
          </div>
        </div>

        <div style="margin-top:20px;padding-top:16px;border-top:1px solid var(--border);">
          <div style="font-size:13px;color:var(--text-2);margin-bottom:12px;text-align:center;">
            本场共 <strong style="color:var(--text)">${targetCnt} 题</strong> · ${cfg.timeLimitMin > 0 ? `限时 ${cfg.timeLimitMin} 分钟` : "正计时模式"}
          </div>
          <button class="btn btn-primary btn-block" id="btn-start-exam" type="button" ${poolCnt === 0 ? "disabled" : ""}>开始模拟考试</button>
        </div>
      </div>
    `;

    container.querySelectorAll("[data-exam-scope]").forEach((b) => {
      b.onclick = () => { state.exam.config.scope = b.dataset.examScope; saveState(); renderAll(); };
    });
    container.querySelectorAll("[data-exam-count]").forEach((b) => {
      b.onclick = () => { state.exam.config.count = b.dataset.examCount === "all" ? "all" : Number(b.dataset.examCount); saveState(); renderAll(); };
    });
    container.querySelectorAll("[data-exam-random]").forEach((b) => {
      b.onclick = () => { state.exam.config.random = b.dataset.examRandom === "1"; saveState(); renderAll(); };
    });
    container.querySelectorAll("[data-exam-time]").forEach((b) => {
      b.onclick = () => { state.exam.config.timeLimitMin = Number(b.dataset.examTime); saveState(); renderAll(); };
    });
    const startBtn = container.querySelector("#btn-start-exam");
    if (startBtn) startBtn.onclick = startExam;
  }

  function renderExamReport(container) {
    const ids = state.exam.questionIds;
    const total = ids.length;
    let correct = 0, wrong = 0, unanswered = 0;
    const wrongItems = [];

    ids.forEach((id, idx) => {
      const q = QUESTION_MAP.get(id);
      const val = state.exam.answers[id];
      const hasVal = val !== undefined && val !== "" && !(Array.isArray(val) && val.length === 0);
      if (!hasVal) {
        unanswered += 1;
        wrongItems.push({ idx, q, val: null, isUnanswered: true });
      } else if (evaluateAnswer(q, val)) {
        correct += 1;
      } else {
        wrong += 1;
        wrongItems.push({ idx, q, val, isUnanswered: false });
      }
    });

    const pct = total > 0 ? Math.round((correct / total) * 100) : 0;
    const score = total > 0 ? ((correct / total) * 100).toFixed(1).replace(/\.0$/, "") : "0";

    container.innerHTML = `
      <div class="exam-card">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:14px;">
          <div>
            <div class="exam-title" style="margin-bottom:2px;">考试成绩报告</div>
            <div style="font-size:12px;color:var(--text-3);">用时 ${formatDuration(state.exam.elapsedSeconds)} · 答错题已加入错题本</div>
          </div>
        </div>

        <div class="score-hero-mobile">
          <div class="score-ring" style="--pct:${pct}">
            <div class="score-ring-inner">
              <span class="score-num">${score}</span>
              <span class="score-unit">分</span>
            </div>
          </div>
          <div class="stats-4col">
            <div class="stat-cell">
              <div class="stat-val" style="color:var(--ok)">${correct}</div>
              <div class="stat-lbl">答对</div>
            </div>
            <div class="stat-cell">
              <div class="stat-val" style="color:var(--err)">${wrong}</div>
              <div class="stat-lbl">答错</div>
            </div>
            <div class="stat-cell">
              <div class="stat-val" style="color:var(--text-3)">${unanswered}</div>
              <div class="stat-lbl">未答</div>
            </div>
            <div class="stat-cell">
              <div class="stat-val">${pct}%</div>
              <div class="stat-lbl">正确率</div>
            </div>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:18px;">
          <button class="btn btn-secondary" id="btn-review-all" type="button">逐题复盘解析</button>
          <button class="btn btn-primary" id="btn-new-exam" type="button">重新组卷</button>
        </div>

        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
          <span style="font-size:14px;font-weight:700;">
            ${wrongItems.length ? `错题与未答汇总 (${wrongItems.length})` : "满分通关，全部答对！"}
          </span>
          ${unanswered > 0 ? `<button class="text-link-btn" id="btn-add-unans-wrong" type="button">未答题收入错题本</button>` : ""}
        </div>

        <div class="wrong-review-list">
          ${wrongItems.map((it) => `
            <div class="wrong-review-card">
              <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px;">
                <span style="font-size:12px;font-weight:700;color:var(--text-2);">第 ${it.idx + 1} 题 · ${escapeHtml(it.q.typeLabel)}</span>
                <button class="text-link-btn" type="button" data-jump-exam="${it.idx}">查看详解 →</button>
              </div>
              <div style="font-size:14px;font-weight:600;margin-bottom:6px;line-height:1.5;">${renderMarkdown(it.q.stem, false)}</div>
              <div style="font-size:12.5px;color:var(--text-2);">
                你的作答：<span style="color:var(--err);font-weight:600;">${it.isUnanswered ? "未作答" : escapeHtml(formatAnswerLabel(it.q, it.val))}</span>
                <br/>正确答案：<span style="color:var(--ok);font-weight:600;">${escapeHtml(formatCorrectAnswer(it.q))}</span>
              </div>
            </div>
          `).join("")}
        </div>
      </div>
    `;

    container.querySelector("#btn-review-all").onclick = () => {
      state.exam.showReport = false;
      state.exam.currentIndex = 0;
      saveState();
      renderAll();
      window.scrollTo({ top: 0, behavior: "smooth" });
    };
    container.querySelector("#btn-new-exam").onclick = () => {
      state.exam.status = "idle";
      saveState();
      renderAll();
      window.scrollTo({ top: 0, behavior: "smooth" });
    };
    const addUnansBtn = container.querySelector("#btn-add-unans-wrong");
    if (addUnansBtn) {
      addUnansBtn.onclick = () => {
        wrongItems.filter((x) => x.isUnanswered).forEach((x) => addWrong(x.q.id));
        saveState();
        showToast("已将未答题加入错题本");
        addUnansBtn.style.display = "none";
      };
    }
    container.querySelectorAll("[data-jump-exam]").forEach((btn) => {
      btn.onclick = () => {
        state.exam.currentIndex = Number(btn.dataset.jumpExam);
        state.exam.showReport = false;
        saveState();
        renderAll();
        window.scrollTo({ top: 0, behavior: "smooth" });
      };
    });
  }

  function renderQuestionCard(container) {
    const list = getActiveList();
    if (!list.length) {
      const emptyTitle = state.view === "wrong"
        ? "错题本暂无题目"
        : state.view === "favorite"
          ? "还没有收藏题目"
          : "没有找到匹配的题目";
      const emptyDesc = state.view === "wrong"
        ? "练习或模考中答错的题目会自动收录到这里，方便考前集中突击。"
        : state.view === "favorite"
          ? "刷题时点击底部工具栏的星标按钮，即可把重点题加入收藏夹。"
          : "请尝试切换章节范围、清除筛选条件或修改搜索词。";

      container.innerHTML = `
        <div class="empty-box">
          <div class="empty-icon-wrap">${ICONS.inbox}</div>
          <div class="empty-title">${emptyTitle}</div>
          <div class="empty-desc">${emptyDesc}</div>
          <button class="btn btn-primary btn-sm" id="btn-reset-empty" type="button">返回全部题库</button>
        </div>
      `;
      container.querySelector("#btn-reset-empty").onclick = () => {
        state.view = "all";
        state.filters = { chapter: "all", section: "all", type: "all", status: "all", query: "" };
        saveState();
        renderAll();
      };
      return;
    }

    const { idx, q } = getCurrentIndexAndQuestion(list);
    const isInWrongBook = state.wrongIds.includes(q.id);
    const isExamRunning = state.mode === "exam" && state.exam.status === "running";
    const isExamSubmitted = state.mode === "exam" && state.exam.status === "submitted";
    const isRecite = state.mode === "recite";

    let record = null;
    let examVal = undefined;
    if (isExamRunning || isExamSubmitted) {
      examVal = state.exam.answers[q.id];
      if (isExamSubmitted) {
        const hasVal = examVal !== undefined && examVal !== "" && !(Array.isArray(examVal) && examVal.length === 0);
        record = {
          value: examVal,
          isCorrect: hasVal ? evaluateAnswer(q, examVal) : false,
          isUnanswered: !hasVal
        };
      }
    } else if (!isRecite) {
      record = getAnswerMapForContext()[q.id] || null;
    }

    const showSolution = isRecite || isExamSubmitted || Boolean(record);
    const lockOptions = isRecite || isExamSubmitted || Boolean(record);
    const displayOpts = getDisplayOptions(q);
    const animateFeedback = justSubmittedId === q.id;
    justSubmittedId = null;

    let optionsHtml = "";
    if (q.type === "single" || q.type === "boolean" || q.type === "multiple") {
      const isMulti = q.type === "multiple";
      const correctKeys = Array.isArray(q.answer) ? q.answer : [String(q.answer)];
      const selectedKeys = isExamRunning
        ? (Array.isArray(examVal) ? examVal : (examVal !== undefined ? [examVal] : []))
        : record
          ? (Array.isArray(record.value) ? record.value : (record.value !== undefined && record.value !== null ? [record.value] : []))
          : (isMulti ? Array.from(draftMultiSelection) : []);

      optionsHtml = `
        <div class="options-stack ${q.type === "boolean" ? "boolean-row" : ""}">
          ${displayOpts.map((opt) => {
            const isChosen = selectedKeys.includes(opt.key);
            const isRight = correctKeys.includes(opt.key);
            let cls = "opt-card";
            let stateHtml = "";
            if (lockOptions) cls += " locked";

            if (showSolution) {
              if (isRight) {
                cls += " correct";
                if (animateFeedback && isChosen) cls += " anim-pop";
                stateHtml = `<span class="opt-state-icon">${ICONS.check}</span>`;
              } else if (isChosen) {
                cls += " wrong";
                if (animateFeedback) cls += " anim-shake";
                stateHtml = `<span class="opt-state-icon">${ICONS.x}</span>`;
              }
            } else if (isChosen) {
              cls += " selected";
            }

            return `
              <button class="${cls}" type="button" data-opt-key="${escapeHtml(opt.key)}">
                <span class="opt-key">${escapeHtml(opt.displayKey)}</span>
                <span class="opt-text">${renderMarkdown(opt.text, true)}</span>
                ${stateHtml}
              </button>
            `;
          }).join("")}
        </div>
      `;

      if (isMulti && !lockOptions && !isExamRunning) {
        optionsHtml += `
          <div style="margin-top:14px;">
            <button class="btn btn-primary btn-block" id="btn-submit-multi" type="button" ${draftMultiSelection.size === 0 ? "disabled" : ""}>确认提交多选答案</button>
          </div>
        `;
      }
    } else {
      const curVal = isExamRunning ? (examVal || "") : (record ? (record.value || "") : "");
      optionsHtml = `
        <div class="subj-wrap">
          ${q.type === "short"
            ? `<textarea class="subj-input" id="subj-input" rows="4" placeholder="请输入作答内容..." ${lockOptions ? "disabled" : ""}>${escapeHtml(curVal)}</textarea>`
            : `<input class="subj-input" id="subj-input" type="text" placeholder="请输入填空答案..." value="${escapeHtml(curVal)}" ${lockOptions ? "disabled" : ""} />`
          }
          ${!lockOptions ? `<button class="btn btn-primary btn-block" id="btn-submit-subj" type="button">${isExamRunning ? "保存答案" : "提交答案"}</button>` : ""}
        </div>
      `;
    }

    let expHtml = "";
    if (showSolution) {
      let panelCls = "exp-panel";
      let tagCls = "verdict-tag info";
      let tagHtml = `${ICONS.book} <span>答案与解析</span>`;

      if (record) {
        if (record.isUnanswered) {
          panelCls += " verdict-err";
          tagCls = "verdict-tag err";
          tagHtml = `${ICONS.x} <span>本题未作答</span>`;
        } else if (record.isCorrect) {
          panelCls += " verdict-ok";
          tagCls = "verdict-tag ok";
          tagHtml = `${ICONS.check} <span>回答正确</span>`;
        } else {
          panelCls += " verdict-err";
          tagCls = "verdict-tag err";
          tagHtml = `${ICONS.x} <span>答错了 · 你选 ${escapeHtml(String(record.value))}</span>`;
        }
      }

      const showRemoveWrong = isInWrongBook && !isExamRunning;
      const highlightRemove = showRemoveWrong && record && record.isCorrect;

      expHtml = `
        <div class="${panelCls}">
          <div class="exp-header">
            <span class="${tagCls}">${tagHtml}</span>
            <span class="ans-pill">答案：${escapeHtml(formatCorrectAnswer(q))}</span>
          </div>

          ${q.disputed ? `
            <div class="disputed-callout">
              <strong>† 争议口径提示：</strong>原题表述有歧义或与通行口径存在差异，请结合下方解析核对课程标准答案。
            </div>
          ` : ""}

          <div class="exp-body">${renderMarkdown(q.explanation || "暂无详细解析。", false)}</div>

          <div class="exp-actions">
            <span style="font-size:11.5px;color:var(--text-3);">${escapeHtml(q.chapter)} · 第${q.num}题</span>
            <div style="display:flex;align-items:center;gap:8px;">
              ${(!isRecite && !isExamSubmitted && record) ? `<button class="btn btn-secondary btn-sm" id="btn-redo-q" type="button">${ICONS.redo} 重做</button>` : ""}
              ${showRemoveWrong ? `
                <button class="btn ${highlightRemove ? "btn-ok" : "btn-secondary"} btn-sm" id="btn-remove-wrong" type="button">
                  ${highlightRemove ? "答对移出错题本" : "移出错题本"}
                </button>
              ` : ""}
            </div>
          </div>
        </div>
      `;
    }

    const animCls = cardAnimDir === "next" ? "anim-next" : cardAnimDir === "prev" ? "anim-prev" : "";
    cardAnimDir = "";

    container.innerHTML = `
      <article class="q-card ${animCls}">
        <div class="q-meta-bar">
          <div class="q-badges">
            <span class="q-index-pill">${idx + 1} / ${list.length}</span>
            <span class="q-type-chip">${escapeHtml(q.typeLabel)}</span>
            ${q.disputed ? `<span class="q-type-chip disputed">† 争议</span>` : ""}
          </div>
          ${isExamSubmitted ? `<button class="btn btn-secondary btn-sm" id="btn-back-report" type="button">成绩报告</button>` : ""}
        </div>

        <div class="q-section-crumb">
          <span class="q-section-name">${escapeHtml(q.section)} · 原第 ${q.num} 题</span>
        </div>

        <div class="q-stem">${renderMarkdown(q.stem, false)}</div>
        ${optionsHtml}
        ${expHtml}
      </article>
      <div class="swipe-hint">左右滑动卡片可快速切换上一题 / 下一题</div>
    `;

    if (!lockOptions) {
      container.querySelectorAll(".opt-card").forEach((btn) => {
        btn.onclick = () => handleOptionTap(q, btn.dataset.optKey);
      });
    }

    const multiBtn = container.querySelector("#btn-submit-multi");
    if (multiBtn) {
      multiBtn.onclick = () => submitAnswer(q, Array.from(draftMultiSelection));
    }

    const subjBtn = container.querySelector("#btn-submit-subj");
    if (subjBtn) {
      subjBtn.onclick = () => {
        const val = (container.querySelector("#subj-input").value || "").trim();
        if (!val) { showToast("请先输入答案"); return; }
        if (isExamRunning) {
          state.exam.answers[q.id] = val;
          saveState();
          renderAll();
          showToast("答案已保存");
        } else {
          submitAnswer(q, val);
        }
      };
    }

    const redoBtn = container.querySelector("#btn-redo-q");
    if (redoBtn) {
      redoBtn.onclick = () => {
        delete getAnswerMapForContext()[q.id];
        draftMultiSelection.clear();
        saveState();
        renderAll();
      };
    }

    const rmWrongBtn = container.querySelector("#btn-remove-wrong");
    if (rmWrongBtn) rmWrongBtn.onclick = () => removeWrong(q.id);

    const backRepBtn = container.querySelector("#btn-back-report");
    if (backRepBtn) {
      backRepBtn.onclick = () => {
        state.exam.showReport = true;
        saveState();
        renderAll();
      };
    }
  }

  function handleOptionTap(q, key) {
    const isExamRunning = state.mode === "exam" && state.exam.status === "running";
    if (q.type === "multiple") {
      triggerHaptic(6);
      if (isExamRunning) {
        const cur = Array.isArray(state.exam.answers[q.id]) ? state.exam.answers[q.id].slice() : [];
        const i = cur.indexOf(key);
        if (i >= 0) cur.splice(i, 1); else cur.push(key);
        state.exam.answers[q.id] = cur.sort();
        saveState();
        renderAll();
      } else {
        if (draftMultiSelection.has(key)) draftMultiSelection.delete(key);
        else draftMultiSelection.add(key);
        renderAll();
      }
      return;
    }

    if (isExamRunning) {
      triggerHaptic(8);
      state.exam.answers[q.id] = key;
      saveState();
      renderAll();
      if (state.autoNext) {
        const curIdx = state.exam.currentIndex;
        if (curIdx < state.exam.questionIds.length - 1) {
          setTimeout(() => navigateStep(1), 260);
        }
      }
      return;
    }

    submitAnswer(q, key);
  }

  function submitAnswer(q, value) {
    const isCorrect = evaluateAnswer(q, value);
    triggerHaptic(isCorrect ? 10 : 24);
    const map = getAnswerMapForContext();
    map[q.id] = { value, isCorrect, updatedAt: Date.now() };
    if (!isCorrect) addWrong(q.id);
    draftMultiSelection.clear();
    justSubmittedId = q.id;
    saveState();
    renderAll();

    if (state.mode === "practice" && state.autoNext && isCorrect) {
      const targetId = q.id;
      setTimeout(() => {
        if (state.mode === "practice" && state.currentId === targetId) {
          navigateStep(1);
        }
      }, 580);
    }
  }

  function navigateStep(delta) {
    const list = getActiveList();
    if (!list.length) return;
    draftMultiSelection.clear();

    if (state.mode === "exam" && state.exam.status !== "idle") {
      const nextIdx = Math.max(0, Math.min(state.exam.currentIndex + delta, list.length - 1));
      if (nextIdx !== state.exam.currentIndex) {
        cardAnimDir = delta > 0 ? "next" : "prev";
        state.exam.currentIndex = nextIdx;
        state.exam.showReport = false;
        saveState();
        renderAll();
        window.scrollTo({ top: 0, behavior: "instant" });
      }
      return;
    }

    const curIdx = list.indexOf(state.currentId);
    const nextIdx = Math.max(0, Math.min((curIdx === -1 ? 0 : curIdx) + delta, list.length - 1));
    if (list[nextIdx] !== state.currentId) {
      cardAnimDir = delta > 0 ? "next" : "prev";
      state.currentId = list[nextIdx];
      saveState();
      renderAll();
      window.scrollTo({ top: 0, behavior: "instant" });
    }
  }

  // =========================================================================
  // Render Bottom Sheets (Answer Card, Chapters, Filters, Backup, Install)
  // =========================================================================
  function renderAnswerSheet() {
    const list = getActiveList();
    const isExamRunning = state.mode === "exam" && state.exam.status === "running";
    const isExamSubmitted = state.mode === "exam" && state.exam.status === "submitted";

    document.getElementById("ans-sheet-title").textContent = isExamRunning
      ? "考试答题卡"
      : isExamSubmitted
        ? "试卷复盘卡"
        : "答题卡";
    document.getElementById("btn-sheet-submit-exam").style.display = isExamRunning ? "inline-flex" : "none";

    const body = document.getElementById("ans-sheet-body");
    if (!list.length) {
      body.innerHTML = `<div style="padding:32px 0;text-align:center;color:var(--text-3);">当前列表暂无题目</div>`;
      return;
    }

    const favSet = new Set(state.favoriteIds);
    const ansMap = getAnswerMapForContext();
    const { idx: curIdx } = getCurrentIndexAndQuestion(list);

    let done = 0, right = 0, wrong = 0;
    const cells = list.map((id, i) => {
      const q = QUESTION_MAP.get(id);
      let cls = "";
      if (isExamRunning) {
        const v = state.exam.answers[id];
        if (v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0)) {
          done++;
          cls = "answered";
        }
      } else if (isExamSubmitted) {
        const v = state.exam.answers[id];
        if (v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0)) {
          done++;
          if (evaluateAnswer(q, v)) { right++; cls = "correct"; }
          else { wrong++; cls = "wrong"; }
        }
      } else {
        const rec = ansMap[id];
        if (rec) {
          done++;
          if (rec.isCorrect) { right++; cls = "correct"; }
          else { wrong++; cls = "wrong"; }
        }
      }
      return { id, i, q, cls, isCur: i === curIdx, isFav: favSet.has(id) };
    });

    const accDenom = isExamSubmitted ? list.length : done;
    const accStr = accDenom > 0 ? `${Math.round((right / accDenom) * 100)}%` : "--";

    const statsHtml = isExamRunning
      ? `
        <div class="sheet-summary-strip">
          <div class="sheet-stat-pill"><div class="sheet-stat-num">${done}/${list.length}</div><div class="sheet-stat-txt">已作答</div></div>
          <div class="sheet-stat-pill"><div class="sheet-stat-num">${list.length - done}</div><div class="sheet-stat-txt">待作答</div></div>
          <div class="sheet-stat-pill"><div class="sheet-stat-num">${state.favoriteIds.length}</div><div class="sheet-stat-txt">已收藏</div></div>
        </div>
        <div class="legend-row">
          <span><i class="legend-dot unanswered"></i>未答</span>
          <span><i class="legend-dot answered"></i>已答</span>
          <span><i class="legend-dot fav"></i>收藏</span>
        </div>
      `
      : `
        <div class="sheet-summary-strip">
          <div class="sheet-stat-pill"><div class="sheet-stat-num">${done}/${list.length}</div><div class="sheet-stat-txt">已完成</div></div>
          <div class="sheet-stat-pill"><div class="sheet-stat-num" style="color:var(--ok)">${accStr}</div><div class="sheet-stat-txt">正确率</div></div>
          <div class="sheet-stat-pill"><div class="sheet-stat-num" style="color:var(--err)">${wrong}</div><div class="sheet-stat-txt">答错</div></div>
        </div>
        <div class="legend-row">
          <span><i class="legend-dot unanswered"></i>未做</span>
          <span><i class="legend-dot correct"></i>答对</span>
          <span><i class="legend-dot wrong"></i>答错</span>
          <span><i class="legend-dot fav"></i>收藏</span>
        </div>
      `;

    const cellBtn = (c) => {
      const classes = ["ans-cell", c.cls, c.isCur ? "current" : "", c.isFav ? "fav" : ""].filter(Boolean).join(" ");
      return `<button class="${classes}" type="button" data-jump-idx="${c.i}" data-jump-id="${c.id}">${c.i + 1}</button>`;
    };

    let gridHtml = "";
    if (state.mode !== "exam" && state.order === "seq") {
      const groups = [];
      for (const c of cells) {
        const last = groups[groups.length - 1];
        if (!last || last.sec !== c.q.section) groups.push({ sec: c.q.section, items: [c] });
        else last.items.push(c);
      }
      gridHtml = groups.map((g) => `
        <div class="sec-group-label">${escapeHtml(g.sec)}</div>
        <div class="ans-grid">${g.items.map(cellBtn).join("")}</div>
      `).join("");
    } else {
      gridHtml = `<div class="ans-grid">${cells.map(cellBtn).join("")}</div>`;
    }

    body.innerHTML = statsHtml + gridHtml;

    body.querySelectorAll(".ans-cell").forEach((btn) => {
      btn.onclick = () => {
        const targetIdx = Number(btn.dataset.jumpIdx);
        const targetId = Number(btn.dataset.jumpId);
        draftMultiSelection.clear();
        if (state.mode === "exam" && state.exam.status !== "idle") {
          state.exam.currentIndex = targetIdx;
          state.exam.showReport = false;
        } else {
          state.currentId = targetId;
        }
        saveState();
        closeAllSheets();
        renderAll();
        window.scrollTo({ top: 0, behavior: "instant" });
      };
    });

    requestAnimationFrame(() => {
      const curEl = body.querySelector(".ans-cell.current");
      if (curEl) curEl.scrollIntoView({ block: "center" });
    });
  }

  function renderChapterSheet() {
    const body = document.getElementById("chapter-list-body");
    const q = chapterQuery.trim().toLowerCase();
    const curCh = state.filters.chapter;
    const curSec = state.filters.section;
    const ansMap = state.practiceAnswers;

    const countDone = (ids) => ids.reduce((acc, id) => acc + (ansMap[id] ? 1 : 0), 0);

    const rows = [];
    if (!q) {
      const isAll = curCh === "all" && curSec === "all";
      const totalDone = Object.keys(ansMap).length;
      rows.push(`
        <button class="ch-row-btn ${isAll ? "active" : ""}" type="button" data-ch="all" data-sec="all">
          <span style="font-weight:700;">全部章节</span>
          <span class="ch-row-meta">${totalDone}/${QUESTION_BANK.length} 题</span>
        </button>
      `);
    }

    CHAPTER_LIST.forEach((ch, idx) => {
      const secs = CHAPTER_SECTIONS.get(ch) || [];
      const chMatch = !q || ch.toLowerCase().includes(q);
      const matchedSecs = q ? secs.filter((s) => chMatch || s.toLowerCase().includes(q)) : secs;
      if (!chMatch && matchedSecs.length === 0) return;

      const chIds = CHAPTER_IDS.get(ch) || [];
      const chActive = curCh === ch && curSec === "all";
      rows.push(`
        <button class="ch-row-btn is-chapter ${chActive ? "active" : ""}" type="button" data-ch="${escapeHtml(ch)}" data-sec="all">
          <span>第 ${idx + 1} 章 · ${escapeHtml(ch)}</span>
          <span class="ch-row-meta">${countDone(chIds)}/${chIds.length}</span>
        </button>
      `);

      matchedSecs.forEach((sec) => {
        const secIds = SECTION_IDS.get(sec) || [];
        const secActive = curSec === sec;
        rows.push(`
          <button class="ch-row-btn is-section ${secActive ? "active" : ""}" type="button" data-ch="${escapeHtml(ch)}" data-sec="${escapeHtml(sec)}">
            <span>${escapeHtml(sec)}</span>
            <span class="ch-row-meta">${countDone(secIds)}/${secIds.length}</span>
          </button>
        `);
      });
    });

    body.innerHTML = rows.length
      ? rows.join("")
      : `<div style="padding:28px 0;text-align:center;color:var(--text-3);font-size:13.5px;">未找到匹配的章节或小节</div>`;

    body.querySelectorAll(".ch-row-btn").forEach((btn) => {
      btn.onclick = () => {
        state.filters.chapter = btn.dataset.ch;
        state.filters.section = btn.dataset.sec;
        const list = getFilteredQuestionIds();
        if (list.length) state.currentId = list[0];
        saveState();
        closeAllSheets();
        renderAll();
        window.scrollTo({ top: 0, behavior: "instant" });
      };
    });
  }

  function renderFilterSheet() {
    const body = document.getElementById("filters-sheet-body");
    body.innerHTML = `
      <div class="field-block">
        <span class="field-label">按题型筛选</span>
        <div class="chip-grid">
          ${[["all", "全部题型"], ["single", "单选题"], ["boolean", "判断题"]].map(([val, lbl]) => `
            <button class="choice-chip ${state.filters.type === val ? "active" : ""}" type="button" data-f-type="${val}">${lbl}</button>
          `).join("")}
        </div>
      </div>

      <div class="field-block">
        <span class="field-label">按作答状态筛选</span>
        <div class="chip-grid">
          ${[["all", "全部状态"], ["unanswered", "仅看未做"], ["wrong", "仅看答错"], ["correct", "仅看答对"]].map(([val, lbl]) => `
            <button class="choice-chip ${state.filters.status === val ? "active" : ""}" type="button" data-f-status="${val}">${lbl}</button>
          `).join("")}
        </div>
      </div>

      <div class="field-block">
        <span class="field-label">出题顺序</span>
        <div class="chip-grid">
          <button class="choice-chip ${state.order === "seq" ? "active" : ""}" type="button" data-f-order="seq">章节原序</button>
          <button class="choice-chip ${state.order === "random" ? "active" : ""}" type="button" data-f-order="random">随机乱序</button>
          ${state.order === "random" ? `<button class="btn btn-secondary btn-sm" id="btn-sheet-reshuffle" type="button" style="height:38px;">重新洗牌</button>` : ""}
        </div>
      </div>

      <div class="field-block">
        <span class="field-label">题目字号大小</span>
        <div class="chip-grid">
          ${[["sm", "紧凑"], ["md", "标准 (推荐)"], ["lg", "大字护眼"]].map(([sz, lbl]) => `
            <button class="choice-chip ${state.fontSize === sz ? "active" : ""}" type="button" data-f-font="${sz}">${lbl}</button>
          `).join("")}
        </div>
      </div>

      <div class="setting-row">
        <div>
          <div class="setting-title">答对后自动跳下一题</div>
          <div class="setting-sub">练习模式下选对答案自动延迟翻页，单手刷题更顺畅</div>
        </div>
        <button class="switch ${state.autoNext ? "on" : ""}" id="sw-auto-next" type="button" aria-label="答对自动下一题"></button>
      </div>

      <div style="margin-top:16px;display:grid;grid-template-columns:1fr 1.4fr;gap:10px;">
        <button class="btn btn-secondary" id="btn-f-reset" type="button">重置筛选</button>
        <button class="btn btn-primary" type="button" data-close-sheet>完成</button>
      </div>
    `;

    body.querySelectorAll("[data-f-type]").forEach((b) => {
      b.onclick = () => { state.filters.type = b.dataset.fType; saveState(); renderFilterSheet(); renderAll(); };
    });
    body.querySelectorAll("[data-f-status]").forEach((b) => {
      b.onclick = () => { state.filters.status = b.dataset.fStatus; saveState(); renderFilterSheet(); renderAll(); };
    });
    body.querySelectorAll("[data-f-order]").forEach((b) => {
      b.onclick = () => {
        state.order = b.dataset.fOrder;
        if (state.order === "random" && state.shuffledIds.length !== QUESTION_BANK.length) {
          state.shuffledIds = fisherYates(QUESTION_BANK.map((q) => q.id));
        }
        saveState();
        renderFilterSheet();
        renderAll();
      };
    });
    const reshuffleBtn = body.querySelector("#btn-sheet-reshuffle");
    if (reshuffleBtn) {
      reshuffleBtn.onclick = () => {
        state.shuffledIds = fisherYates(QUESTION_BANK.map((q) => q.id));
        const list = getFilteredQuestionIds();
        if (list.length) state.currentId = list[0];
        saveState();
        renderAll();
        showToast("已重新随机洗牌");
      };
    }
    body.querySelectorAll("[data-f-font]").forEach((b) => {
      b.onclick = () => {
        state.fontSize = b.dataset.fFont;
        applyAppearance();
        saveState();
        renderFilterSheet();
      };
    });
    body.querySelector("#sw-auto-next").onclick = () => {
      state.autoNext = !state.autoNext;
      saveState();
      renderFilterSheet();
    };
    body.querySelector("#btn-f-reset").onclick = () => {
      state.filters = { chapter: "all", section: "all", type: "all", status: "all", query: "" };
      state.order = "seq";
      saveState();
      renderFilterSheet();
      renderAll();
      showToast("筛选已重置");
    };
    body.querySelectorAll("[data-close-sheet]").forEach((b) => {
      b.onclick = () => closeAllSheets();
    });
  }

  function renderManageSheet() {
    const body = document.getElementById("manage-sheet-body");
    const ansEntries = Object.values(state.practiceAnswers || {});
    const doneCnt = ansEntries.length;
    const rightCnt = ansEntries.filter((r) => r && r.isCorrect).length;
    const acc = doneCnt > 0 ? `${Math.round((rightCnt / doneCnt) * 100)}%` : "--";

    body.innerHTML = `
      <div class="sheet-summary-strip" style="margin-bottom:16px;">
        <div class="sheet-stat-pill"><div class="sheet-stat-num">${doneCnt}/${QUESTION_BANK.length}</div><div class="sheet-stat-txt">累计已刷</div></div>
        <div class="sheet-stat-pill"><div class="sheet-stat-num" style="color:var(--ok)">${acc}</div><div class="sheet-stat-txt">总正确率</div></div>
        <div class="sheet-stat-pill"><div class="sheet-stat-num" style="color:var(--err)">${state.wrongIds.length}</div><div class="sheet-stat-txt">错题本</div></div>
      </div>

      <div style="font-size:12.5px;color:var(--text-2);margin-bottom:12px;line-height:1.55;">
        学习进度自动保存在手机本地，刷新或离线不会丢失。清理浏览器缓存或更换设备前，可导出备份（与电脑网页版、微信小程序版格式完全互通）。
      </div>

      <button class="action-card-btn" id="btn-export-file" type="button">
        <div>
          <div style="font-weight:700;font-size:14px;">导出学习进度 (.json 文件)</div>
          <div style="font-size:12px;color:var(--text-3);margin-top:2px;">下载备份文件到手机本地文件夹</div>
        </div>
        <span style="font-size:13px;font-weight:600;color:var(--sel);">下载</span>
      </button>

      <button class="action-card-btn" id="btn-copy-json" type="button">
        <div>
          <div style="font-weight:700;font-size:14px;">复制进度 JSON 文本 (微信内推荐)</div>
          <div style="font-size:12px;color:var(--text-3);margin-top:2px;">一键复制到剪贴板，可发到文件传输助手保存</div>
        </div>
        <span style="font-size:13px;font-weight:600;color:var(--sel);">复制</span>
      </button>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">
        <button class="btn btn-secondary" id="btn-import-file" type="button">从 JSON 文件导入</button>
        <button class="btn btn-secondary" id="btn-toggle-paste" type="button">粘贴 JSON 文本恢复</button>
      </div>

      <div id="paste-import-box" style="display:${pasteImportExpanded ? "block" : "none"};margin-bottom:14px;">
        <textarea class="subj-input" id="paste-json-textarea" rows="3" placeholder="将复制的进度 JSON 粘贴在此处..."></textarea>
        <button class="btn btn-primary btn-block" id="btn-confirm-paste" type="button" style="margin-top:8px;">立即恢复进度</button>
      </div>

      <div style="border-top:1px solid var(--border);padding-top:14px;margin-top:6px;">
        <button class="action-card-btn" id="btn-clear-practice" type="button">
          <div>
            <div style="font-weight:700;font-size:14px;">仅清空刷题记录（重新刷一遍）</div>
            <div style="font-size:12px;color:var(--text-3);margin-top:2px;">保留错题本与收藏夹，仅重置已做对错状态</div>
          </div>
        </button>

        <button class="action-card-btn danger" id="btn-clear-all" type="button">
          <div>
            <div style="font-weight:700;font-size:14px;">清空全部本地数据</div>
            <div style="font-size:12px;opacity:0.85;margin-top:2px;">彻底清除刷题记录、错题本、收藏夹及模考进度</div>
          </div>
        </button>
      </div>
    `;

    body.querySelector("#btn-export-file").onclick = () => {
      try {
        const json = JSON.stringify(state, null, 2);
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `国际商务导论_学习进度_${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        showToast("已触发下载进度 JSON");
      } catch (_) {
        showToast("当前浏览器限制下载，请使用上方复制文本备份");
      }
    };

    body.querySelector("#btn-copy-json").onclick = async () => {
      const json = JSON.stringify(state);
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(json);
        } else {
          const ta = document.createElement("textarea");
          ta.value = json;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand("copy");
          ta.remove();
        }
        showToast("进度 JSON 已复制到剪贴板");
      } catch (_) {
        showToast("复制失败，请使用导出文件功能");
      }
    };

    body.querySelector("#btn-import-file").onclick = () => {
      document.getElementById("import-json-file").click();
    };

    body.querySelector("#btn-toggle-paste").onclick = () => {
      pasteImportExpanded = !pasteImportExpanded;
      renderManageSheet();
    };

    const confirmPasteBtn = body.querySelector("#btn-confirm-paste");
    if (confirmPasteBtn) {
      confirmPasteBtn.onclick = () => {
        const raw = (body.querySelector("#paste-json-textarea").value || "").trim();
        if (!raw) { showToast("请先粘贴 JSON 内容"); return; }
        applyImportedJsonString(raw);
      };
    }

    body.querySelector("#btn-clear-practice").onclick = () => {
      openConfirm(
        "仅清空刷题进度",
        "确定清空所有题目的已作答记录吗？你的错题本与收藏夹将会完整保留。",
        "确认清空",
        () => {
          state.practiceAnswers = {};
          state.wrongSessionAnswers = {};
          if (state.exam.status !== "idle") {
            state.exam.status = "idle";
            clearInterval(examTimerHandle);
          }
          draftMultiSelection.clear();
          saveState();
          closeAllSheets();
          renderAll();
          showToast("已重置刷题进度");
        }
      );
    };

    body.querySelector("#btn-clear-all").onclick = () => {
      openConfirm(
        "清空全部数据",
        "此操作将彻底清除刷题记录、错题本、收藏夹与模拟考试数据，建议先导出备份。确定继续吗？",
        "彻底清空",
        () => {
          const keepTheme = state.theme;
          const keepFont = state.fontSize;
          clearInterval(examTimerHandle);
          localStorage.removeItem(STORAGE_KEY);
          state = createDefaultState();
          state.theme = keepTheme;
          state.fontSize = keepFont;
          draftMultiSelection.clear();
          saveState();
          closeAllSheets();
          renderAll();
          showToast("全部本地记录已清空");
        },
        true
      );
    };
  }

  function applyImportedJsonString(rawText) {
    try {
      const parsed = JSON.parse(rawText);
      if (!parsed || typeof parsed !== "object") throw new Error("Invalid object");
      localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
      state = loadState();
      pasteImportExpanded = false;
      applyAppearance();
      syncExamTimer();
      closeAllSheets();
      renderAll();
      showToast("学习进度恢复成功！");
    } catch (_) {
      showToast("导入失败：JSON 内容格式无效");
    }
  }

  function renderInstallSheet() {
    const body = document.getElementById("install-sheet-body");
    const ua = navigator.userAgent || "";
    const isWeChat = /MicroMessenger/i.test(ua);
    const isIOS = /iPad|iPhone|iPod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;

    let html = "";
    if (isStandalone) {
      html += `
        <div class="disputed-callout" style="background:var(--ok-bg);border-color:var(--ok-border);color:var(--ok);margin-bottom:14px;">
          <strong>✓ 当前已在桌面独立 App 模式运行</strong>，题库与静态资源均已离线缓存，无网也能随时刷题。
        </div>
      `;
    }

    if (deferredInstallPrompt) {
      html += `
        <button class="btn btn-primary btn-block" id="btn-trigger-pwa-install" type="button" style="margin-bottom:16px;">
          一键安装到手机桌面
        </button>
      `;
    }

    if (isWeChat) {
      html += `
        <div class="disputed-callout" style="margin-bottom:14px;">
          检测到当前在<strong>微信内置浏览器</strong>中打开：如需把刷题图标添加到手机桌面，请先点右上角 <strong>···</strong> 选择「<strong>在默认浏览器中打开</strong>」。
        </div>
      `;
    }

    html += `
      <div style="font-size:13.5px;font-weight:700;margin-bottom:10px;">
        ${isIOS ? "iPhone / iPad (Safari) 添加步骤：" : "添加到手机主屏幕步骤："}
      </div>
      <div class="guide-step">
        <span class="guide-num">1</span>
        <div style="font-size:13.5px;line-height:1.55;">
          在手机系统浏览器（<strong>iPhone 请用 Safari</strong>，安卓推荐 Chrome / Edge / 系统浏览器）中打开本链接。
        </div>
      </div>
      <div class="guide-step">
        <span class="guide-num">2</span>
        <div style="font-size:13.5px;line-height:1.55;">
          点击浏览器底部或右上角的「<strong>分享</strong>」按钮（iPhone 为底部向上箭头图标）或菜单 <strong>⋮</strong>。
        </div>
      </div>
      <div class="guide-step">
        <span class="guide-num">3</span>
        <div style="font-size:13.5px;line-height:1.55;">
          选择「<strong>添加到主屏幕</strong>」（或「安装应用」），完成后即可从桌面全屏秒开，支持离线刷题！
        </div>
      </div>
    `;

    body.innerHTML = html;

    const installBtn = body.querySelector("#btn-trigger-pwa-install");
    if (installBtn) {
      installBtn.onclick = async () => {
        if (!deferredInstallPrompt) return;
        deferredInstallPrompt.prompt();
        const choice = await deferredInstallPrompt.userChoice;
        if (choice && choice.outcome === "accepted") {
          deferredInstallPrompt = null;
          document.getElementById("btn-install").classList.remove("highlight-dot");
          closeAllSheets();
          showToast("已添加到主屏幕");
        }
      };
    }
  }

  function renderAll() {
    renderToolbars();
    const stage = document.getElementById("stage");
    if (state.mode === "exam") {
      if (state.exam.status === "idle") {
        renderExamSetup(stage);
      } else if (state.exam.status === "submitted" && state.exam.showReport) {
        renderExamReport(stage);
      } else {
        renderQuestionCard(stage);
      }
    } else {
      renderQuestionCard(stage);
    }
  }

  // =========================================================================
  // Event Binding & Touch Swipe Gestures
  // =========================================================================
  function bindEvents() {
    // Mode switcher
    document.querySelectorAll(".mode-seg-btn").forEach((btn) => {
      btn.onclick = () => {
        const nextMode = btn.dataset.mode;
        if (state.mode === nextMode) return;
        state.mode = nextMode;
        draftMultiSelection.clear();
        saveState();
        syncExamTimer();
        renderAll();
        window.scrollTo({ top: 0, behavior: "instant" });
      };
    });

    // View tabs
    document.querySelectorAll(".view-pill").forEach((pill) => {
      pill.onclick = () => {
        state.view = pill.dataset.view;
        draftMultiSelection.clear();
        const list = getFilteredQuestionIds();
        if (list.length && !list.includes(state.currentId)) state.currentId = list[0];
        saveState();
        renderAll();
      };
    });

    // Header actions
    document.getElementById("btn-theme").onclick = () => {
      const isDark = document.documentElement.classList.contains("dark");
      state.theme = isDark ? "light" : "dark";
      applyAppearance();
      saveState();
      showToast(state.theme === "dark" ? "已切换深色护眼模式" : "已切换浅色纸感模式");
    };
    document.getElementById("btn-manage").onclick = () => openSheet("sheet-manage");
    document.getElementById("btn-install").onclick = () => openSheet("sheet-install");

    // Sub-toolbar filter & search
    document.getElementById("btn-open-chapters").onclick = () => {
      chapterQuery = "";
      document.getElementById("chapter-search-input").value = "";
      openSheet("sheet-chapters");
    };
    document.getElementById("chapter-search-input").oninput = (e) => {
      chapterQuery = e.target.value;
      renderChapterSheet();
    };
    document.getElementById("btn-open-filters").onclick = () => openSheet("sheet-filters");

    const searchWrap = document.getElementById("search-bar-wrap");
    const searchInput = document.getElementById("search-input");
    document.getElementById("btn-toggle-search").onclick = () => {
      const willOpen = !searchWrap.classList.contains("open");
      searchWrap.classList.toggle("open", willOpen);
      if (willOpen) setTimeout(() => searchInput.focus(), 30);
    };
    document.getElementById("btn-clear-search").onclick = () => {
      searchWrap.classList.remove("open");
      if (state.filters.query) {
        state.filters.query = "";
        saveState();
        renderAll();
      }
    };
    searchInput.oninput = (e) => {
      state.filters.query = e.target.value;
      saveState();
      renderAll();
    };

    // Active filter banner shortcuts
    document.getElementById("btn-banner-reshuffle").onclick = () => {
      state.shuffledIds = fisherYates(QUESTION_BANK.map((q) => q.id));
      const list = getFilteredQuestionIds();
      if (list.length) state.currentId = list[0];
      saveState();
      renderAll();
      showToast("已重新洗牌");
    };
    document.getElementById("btn-banner-reset-wrong").onclick = () => {
      state.wrongSessionAnswers = {};
      saveState();
      renderAll();
      showToast("错题重刷记录已重置");
    };
    document.getElementById("btn-banner-clear").onclick = () => {
      state.filters = { chapter: "all", section: "all", type: "all", status: "all", query: "" };
      searchWrap.classList.remove("open");
      saveState();
      renderAll();
    };

    // Exam top bar
    document.getElementById("btn-exam-submit-top").onclick = requestSubmitExam;
    document.getElementById("btn-sheet-submit-exam").onclick = requestSubmitExam;
    document.getElementById("btn-exam-quit").onclick = () => {
      openConfirm("退出当前模考", "退出后本场未交卷的考试进度将被放弃，确定退出吗？", "确定退出", () => {
        clearInterval(examTimerHandle);
        state.exam.status = "idle";
        saveState();
        closeAllSheets();
        updateExamBarUI();
        renderAll();
      });
    };

    // Bottom Dock actions
    document.getElementById("btn-prev").onclick = () => navigateStep(-1);
    document.getElementById("btn-next").onclick = (e) => {
      if (e.currentTarget.dataset.action === "submit-exam") {
        requestSubmitExam();
      } else {
        navigateStep(1);
      }
    };
    document.getElementById("btn-fav-dock").onclick = () => {
      const list = getActiveList();
      const { q } = getCurrentIndexAndQuestion(list);
      if (q) toggleFavorite(q.id);
    };
    document.getElementById("btn-open-sheet").onclick = () => openSheet("sheet-answers");

    // Backdrop & Sheet close buttons
    document.getElementById("backdrop").onclick = () => closeAllSheets();
    document.querySelectorAll("[data-close-sheet]").forEach((btn) => {
      btn.onclick = () => closeAllSheets();
    });
    document.getElementById("btn-confirm-ok").onclick = () => {
      const fn = confirmCallback;
      confirmCallback = null;
      if (typeof fn === "function") fn();
    };

    // File Import JSON
    const fileInput = document.getElementById("import-json-file");
    fileInput.onchange = (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        applyImportedJsonString(String(reader.result || ""));
        fileInput.value = "";
      };
      reader.readAsText(file);
    };

    // Horizontal Swipe Gesture on Stage for One-Handed Flipping
    const stageEl = document.getElementById("stage");
    let touchStartX = 0;
    let touchStartY = 0;
    let touchIgnored = false;

    stageEl.addEventListener("touchstart", (e) => {
      if (e.touches.length !== 1) { touchIgnored = true; return; }
      const target = e.target;
      if (target && target.closest("input, textarea, pre, table, .wrong-review-list")) {
        touchIgnored = true;
        return;
      }
      touchIgnored = false;
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
    }, { passive: true });

    stageEl.addEventListener("touchend", (e) => {
      if (touchIgnored || !e.changedTouches.length) return;
      if (state.mode === "exam" && (state.exam.status === "idle" || (state.exam.status === "submitted" && state.exam.showReport))) {
        return;
      }
      const dx = e.changedTouches[0].clientX - touchStartX;
      const dy = e.changedTouches[0].clientY - touchStartY;
      if (Math.abs(dx) > 58 && Math.abs(dx) > Math.abs(dy) * 1.85) {
        if (dx < 0) navigateStep(1);
        else navigateStep(-1);
      }
    }, { passive: true });

    // Persist state reliably on backgrounding / closing tab or WeChat webview
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") saveState();
    });
    window.addEventListener("pagehide", saveState);

    // Online / Offline indicator
    const syncNetworkBadge = () => {
      const badge = document.getElementById("offline-badge");
      if (badge) badge.classList.toggle("show", !navigator.onLine);
    };
    window.addEventListener("online", syncNetworkBadge);
    window.addEventListener("offline", syncNetworkBadge);
    syncNetworkBadge();

    // System dark mode live sync
    if (window.matchMedia) {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      if (mq.addEventListener) {
        mq.addEventListener("change", () => {
          if (state.theme === "system") applyAppearance();
        });
      }
    }

    // PWA Install Prompt capture
    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault();
      deferredInstallPrompt = e;
      document.getElementById("btn-install").classList.add("highlight-dot");
    });
  }

  // =========================================================================
  // Service Worker Registration (Relative Path for Any Subdirectory)
  // =========================================================================
  function registerPWA() {
    if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1")) {
      window.addEventListener("load", () => {
        navigator.serviceWorker.register("./sw.js", { scope: "./" }).catch((err) => {
          console.warn("SW registration skipped:", err);
        });
      });
    }
  }

  function init() {
    applyAppearance();
    bindEvents();
    syncExamTimer();
    renderAll();
    registerPWA();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
