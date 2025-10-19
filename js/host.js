import { api } from "./api.js";
import {
  scenarios,
  registerScenarios,
  getScenarioById,
  stageLabels,
  stageOrder,
  formatPlayerRange,
  getStageDurationMs,
  isReadyVoteStage,
  getReadyVoteRequirement
} from "./data.js";
import { fetchRemoteScenarios } from "./firebase.js";

const stageStatusMap = {
  lobby: "lobby",
  briefing: "in_progress",
  clue_a: "in_progress",
  discussion_a: "in_progress",
  clue_b: "in_progress",
  discussion_b: "in_progress",
  clue_c: "in_progress",
  final_discussion: "in_progress",
  voting: "voting",
  result: "result"
};

const clueRoundTemplates = [
  { stage: "clue_a", label: "1차 단서" },
  { stage: "clue_b", label: "2차 단서" },
  { stage: "clue_c", label: "3차 단서" }
];

const MIN_CLUES_PER_ROUND = 2;

function createRoundSkeleton() {
  return clueRoundTemplates.map((template) => ({
    stage: template.stage,
    label: template.label,
    truths: [],
    misdirections: [],
    prompts: []
  }));
}

function populateRoundsWithClues(
  rounds,
  { truths = [], misdirections = [], prompts = [] } = {},
  minPerRound = MIN_CLUES_PER_ROUND
) {
  if (!rounds?.length) {
    return rounds;
  }

  const sanitiseList = (list = []) =>
    list
      .filter((item) => typeof item === "string" && item.trim().length > 0)
      .map((item) => item.trim());

  const queue = [];
  const pushGroup = (type, list) => {
    sanitiseList(list).forEach((text) => {
      queue.push({ type, text });
    });
  };

  pushGroup("truths", truths);
  pushGroup("misdirections", misdirections);
  pushGroup("prompts", prompts);

  const initialQueue = [...queue];

  const ensureRoundStructure = (round) => {
    if (!Array.isArray(round.truths)) round.truths = [];
    if (!Array.isArray(round.misdirections)) round.misdirections = [];
    if (!Array.isArray(round.prompts)) round.prompts = [];
  };

  rounds.forEach(ensureRoundStructure);

  const pool = [...queue];
  const totalRounds = rounds.length;
  const basePerRound = totalRounds ? Math.floor(pool.length / totalRounds) : 0;
  const extra = totalRounds ? pool.length % totalRounds : 0;
  let pointer = 0;

  rounds.forEach((round, index) => {
    const allocation = basePerRound + (index < extra ? 1 : 0);
    for (let i = 0; i < allocation && pointer < pool.length; i += 1) {
      const next = pool[pointer++];
      round[next.type].push(next.text);
    }
  });

  const fallbackPool = initialQueue.length > 0 ? initialQueue : [];

  rounds.forEach((round, index) => {
    let total = round.truths.length + round.misdirections.length + round.prompts.length;
    const stageLabel = stageLabels[round.stage] || round.label || "단계";
    while (total < minPerRound) {
      if (fallbackPool.length > 0) {
        const fallback = fallbackPool[(index + total) % fallbackPool.length];
        round.prompts.push(`${stageLabel} 복기: ${fallback.text}`);
      } else {
        round.prompts.push(`${stageLabel} 준비 메모: 추가 단서가 준비 중입니다.`);
      }
      total += 1;
    }
  });

  return rounds;
}

const state = {
  activeScenario: scenarios[0],
  activeSession: null,
  sessionRecordId: null,
  players: [],
  hostPlayerId: null,
  hostPlayerName: "",
  hostPlayerPin: "",
  hostPlayer: null,
  activeView: "setup",
  activeTab: "progress",
  chatInterval: null,
  playerInterval: null,
  sessionInterval: null,
  stageTimerInterval: null,
  stageAutoAdvancing: false,
  chatSessionCode: null,
  chatIdentity: null,
  isAssigningRoles: false,
  readyInFlight: false
};

const HOST_STORAGE_KEY = "crimeSceneHostSession";
const HOST_RECENTS_STORAGE_KEY = "crimeSceneHostRecentSessions";

function persistHostSession(sessionCode, hostName) {
  try {
    localStorage.setItem(
      HOST_STORAGE_KEY,
      JSON.stringify({ sessionCode, hostName })
    );
  } catch (error) {
    console.warn("호스트 세션 정보를 저장하지 못했습니다.", error);
  }
}

function loadHostSessionCredentials() {
  try {
    const raw = localStorage.getItem(HOST_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.warn("호스트 세션 정보를 불러오지 못했습니다.", error);
    return null;
  }
}

function clearHostSessionCredentials() {
  try {
    localStorage.removeItem(HOST_STORAGE_KEY);
  } catch (error) {
    console.warn("호스트 세션 정보를 삭제하지 못했습니다.", error);
  }
}

function loadRecentHostSessions() {
  try {
    const raw = localStorage.getItem(HOST_RECENTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry) => {
        if (!entry || typeof entry !== "object") return null;
        const sessionCode = (entry.sessionCode || "").toUpperCase();
        const hostName = typeof entry.hostName === "string" ? entry.hostName.trim() : "";
        if (!sessionCode || !hostName) return null;
        return {
          sessionCode,
          hostName,
          scenarioId: entry.scenarioId || null,
          updatedAt: entry.updatedAt || entry.joinedAt || null
        };
      })
      .filter(Boolean);
  } catch (error) {
    console.warn("최근 호스트 세션 목록을 불러오지 못했습니다.", error);
    return [];
  }
}

function saveRecentHostSessions(entries) {
  try {
    localStorage.setItem(HOST_RECENTS_STORAGE_KEY, JSON.stringify(entries));
  } catch (error) {
    console.warn("최근 호스트 세션 정보를 저장하지 못했습니다.", error);
  }
}

function rememberRecentHostSession(sessionCode, hostName, scenarioId) {
  if (!sessionCode || !hostName) return;
  const code = sessionCode.toUpperCase();
  const displayName = hostName.trim();
  if (!code || !displayName) return;
  const existing = loadRecentHostSessions();
  const filtered = existing.filter(
    (entry) => !(entry.sessionCode === code && entry.hostName === displayName)
  );
  const updated = [
    {
      sessionCode: code,
      hostName: displayName,
      scenarioId: scenarioId || null,
      updatedAt: new Date().toISOString()
    },
    ...filtered
  ];
  saveRecentHostSessions(updated.slice(0, 6));
}

async function refreshHostResumeSessions() {
  if (!dom.hostResumeSection || !dom.hostResumeList) return;
  const stored = loadRecentHostSessions();
  if (!stored.length) {
    dom.hostResumeSection.hidden = true;
    dom.hostResumeList.innerHTML = "";
    return;
  }

  const uniqueCodes = Array.from(new Set(stored.map((entry) => entry.sessionCode).filter(Boolean)));
  const codeResults = await Promise.all(
    uniqueCodes.map(async (code) => {
      try {
        const session = await findSessionByCode(code);
        return [code, session];
      } catch (error) {
        console.warn("세션 확인 실패", error);
        return [code, null];
      }
    })
  );

  const sessionMap = new Map(codeResults);
  const activeEntries = [];
  const validEntries = [];

  stored.forEach((entry) => {
    const session = sessionMap.get(entry.sessionCode) || null;
    if (!session || session.deleted || session.status === "closed") {
      return;
    }
    activeEntries.push({ entry, session });
    validEntries.push({
      sessionCode: entry.sessionCode,
      hostName: entry.hostName,
      scenarioId: session.scenario_id || entry.scenarioId || null,
      updatedAt: entry.updatedAt || new Date().toISOString()
    });
  });

  saveRecentHostSessions(validEntries);

  if (!activeEntries.length) {
    dom.hostResumeSection.hidden = true;
    dom.hostResumeList.innerHTML = "";
    return;
  }

  dom.hostResumeSection.hidden = false;
  dom.hostResumeList.innerHTML = "";
  const fragment = document.createDocumentFragment();

  activeEntries.forEach(({ entry, session }) => {
    const scenario = getScenarioById(session.scenario_id) || state.activeScenario;
    const stageLabel = stageLabels[session.stage] || session.stage || "-";
    const statusText = formatStatusText(session.status);
    const item = document.createElement("div");
    item.className = "list-resume__item";

    const meta = document.createElement("div");
    meta.className = "list-resume__meta";
    const title = document.createElement("strong");
    title.textContent = scenario?.title || `세션 ${session.code}`;
    const line = document.createElement("span");
    line.textContent = `${session.code} · ${stageLabel}`;
    const hostLine = document.createElement("span");
    hostLine.textContent = `${entry.hostName} 호스트 · ${statusText}`;
    meta.append(title, line, hostLine);

    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn btn--primary";
    button.dataset.hostResumeSession = entry.sessionCode;
    button.dataset.hostResumeName = entry.hostName;
    button.textContent = "세션 복귀";

    item.append(meta, button);
    fragment.appendChild(item);
  });

  dom.hostResumeList.appendChild(fragment);
}

const dom = {
  setupView: document.getElementById("setupView"),
  lobbyView: document.getElementById("lobbyView"),
  gameView: document.getElementById("gameView"),
  scenarioSelect: document.getElementById("scenarioSelect"),
  scenarioDifficulty: document.getElementById("scenarioDifficulty"),
  scenarioTone: document.getElementById("scenarioTone"),
  scenarioDuration: document.getElementById("scenarioDuration"),
  scenarioPlayersRange: document.getElementById("scenarioPlayersRange"),
  scenarioTitle: document.getElementById("scenarioTitle"),
  scenarioTagline: document.getElementById("scenarioTagline"),
  scenarioSummary: document.getElementById("scenarioSummary"),
  scenarioMotifs: document.getElementById("scenarioMotifs"),
  scenarioConflicts: document.getElementById("scenarioConflicts"),
  scenarioPlayers: document.getElementById("scenarioPlayers"),
  scenarioTimeline: document.getElementById("scenarioTimeline"),
  evidencePhysical: document.getElementById("evidencePhysical"),
  evidenceDigital: document.getElementById("evidenceDigital"),
  investigationPrompts: document.getElementById("investigationPrompts"),
  suspectRoster: document.getElementById("suspectRoster"),
  stageTracker: document.getElementById("stageTracker"),
  gameStageTracker: document.querySelector("[data-tab='progress'] .stage-tracker"),
  stageSelect: document.getElementById("stageSelect"),
  stageUpdateBtn: document.getElementById("updateStageBtn"),
  startGameBtn: document.getElementById("startGameBtn"),
  beginVotingBtn: document.getElementById("beginVotingBtn"),
  closeVotingBtn: document.getElementById("closeVotingBtn"),
  endSessionBtn: document.getElementById("endSessionBtn"),
  sessionStatusBadge: document.getElementById("sessionStatusBadge"),
  stageTimerDisplay: document.getElementById("stageTimerDisplay"),
  voteStatus: document.getElementById("voteStatus"),
  resultBanner: document.getElementById("resultBanner"),
  gameReadyStatus: document.getElementById("gameReadyStatus"),
  createSessionForm: document.getElementById("createSessionForm"),
  sessionResult: document.getElementById("sessionResult"),
  hostResumeSection: document.getElementById("hostResumeSection"),
  hostResumeList: document.getElementById("hostResumeList"),
  addPlayerForm: document.getElementById("addPlayerForm"),
  playerNameInput: document.getElementById("playerNameInput"),
  addBotBtn: document.getElementById("addBotBtn"),
  assignRolesBtn: document.getElementById("assignRolesBtn"),
  resetPlayersBtn: document.getElementById("resetPlayersBtn"),
  playerTableBody: document.getElementById("playerTableBody"),
  playerStats: document.getElementById("playerStats"),
  copyPlayerLink: document.getElementById("copyPlayerLink"),
  chatStatus: document.getElementById("chatStatus"),
  chatMeta: document.getElementById("chatMeta"),
  chatLog: document.getElementById("chatLog"),
  chatForm: document.getElementById("chatForm"),
  chatMessage: document.getElementById("chatMessage"),
  chatSendBtn: document.querySelector("#chatForm button[type='submit']"),
  gameSessionStatus: document.getElementById("gameSessionStatus"),
  progressStageBadge: document.getElementById("progressStageBadge"),
  gameStageTimer: document.getElementById("gameStageTimer"),
  gameMeta: document.getElementById("gameMeta"),
  gamePlayerStatus: document.getElementById("gamePlayerStatus"),
  hostRoleView: document.getElementById("hostRoleView"),
  gameScenarioTitle: document.getElementById("gameScenarioTitle"),
  gameScenarioTagline: document.getElementById("gameScenarioTagline"),
  gameScenarioSummary: document.getElementById("gameScenarioSummary"),
  gameScenarioConflicts: document.getElementById("gameScenarioConflicts"),
  gameScenarioPrompts: document.getElementById("gameScenarioPrompts"),
  gameScenarioTimeline: document.getElementById("gameScenarioTimeline"),
  gameEvidencePhysical: document.getElementById("gameEvidencePhysical"),
  gameEvidenceDigital: document.getElementById("gameEvidenceDigital"),
  hostProfileNotice: document.getElementById("hostProfileNotice"),
  hostProfileTimeline: document.getElementById("hostProfileTimeline"),
  hostProfileEvidence: document.getElementById("hostProfileEvidence"),
  hostProfileAlibis: document.getElementById("hostProfileAlibis"),
  hostReadyToolbar: document.getElementById("hostReadyToolbar"),
  hostReadyStatus: document.getElementById("hostReadyStatus"),
  hostReadyToggleBtn: document.getElementById("hostReadyToggleBtn"),
  tabButtons: document.querySelectorAll(".tab-nav__btn"),
  tabPanels: document.querySelectorAll(".tab-panel"),
  hostVoteForm: document.getElementById("hostVoteForm"),
  hostVoteTarget: document.getElementById("hostVoteTarget"),
  hostVoteHelper: document.getElementById("hostVoteHelper"),
  hostVoteStatus: document.getElementById("hostVoteStatus"),
  toast: document.getElementById("toast")
};

function showToast(message, variant = "info") {
  if (!dom.toast) {
    console.log(message);
    return;
  }
  dom.toast.textContent = message;
  dom.toast.dataset.variant = variant;
  try {
    dom.toast.showModal();
  } catch (error) {
    dom.toast.close();
    dom.toast.showModal();
  }
  setTimeout(() => {
    if (dom.toast.open) {
      dom.toast.close();
    }
  }, 2600);
}

function updateHostReadyUI() {
  if (!dom.hostReadyStatus || !dom.hostReadyToggleBtn) return;
  dom.hostReadyStatus.removeAttribute("title");
  if (!state.activeSession || !state.hostPlayer) {
    dom.hostReadyStatus.textContent = "투표 대기";
    dom.hostReadyStatus.dataset.state = "idle";
    dom.hostReadyToggleBtn.disabled = true;
    dom.hostReadyToggleBtn.textContent = "턴 끝내기";
    return;
  }
  const stage = state.activeSession.stage;
  const readyEligible = isReadyVoteStage(stage);
  if (!readyEligible) {
    const label = stage === "lobby" ? "대기 중" : "투표 불가";
    dom.hostReadyStatus.textContent = label;
    dom.hostReadyStatus.dataset.state = "disabled";
    dom.hostReadyToggleBtn.disabled = true;
    dom.hostReadyToggleBtn.textContent = "턴 끝내기";
    return;
  }
  const isReady = Boolean(state.hostPlayer.stage_ready && state.hostPlayer.ready_stage === stage);
  const roster = state.players || [];
  const eligiblePlayers = roster.filter((player) => !player.is_bot).length;
  const readyPlayers = roster.filter(
    (player) => !player.is_bot && player.stage_ready && player.ready_stage === stage
  ).length;
  const requiredCount = getReadyVoteRequirement(eligiblePlayers);
  const progressText = eligiblePlayers > 0 ? `${readyPlayers} / ${eligiblePlayers}` : "0 / 0";
  if (requiredCount > 0) {
    dom.hostReadyStatus.title = `최소 ${requiredCount}명이 동의하면 다음 단계로 이동합니다.`;
  }
  dom.hostReadyStatus.textContent = isReady
    ? `투표 완료 (${progressText})`
    : `투표 대기 (${progressText})`;
  dom.hostReadyStatus.dataset.state = isReady ? "ready" : "waiting";
  dom.hostReadyToggleBtn.disabled = state.readyInFlight;
  dom.hostReadyToggleBtn.textContent = isReady ? "투표 취소" : "턴 끝내기";
}

async function handleHostReadyToggle() {
  if (!state.activeSession || !state.hostPlayer || !state.hostPlayerId) {
    showToast("세션에 먼저 접속해 주세요.", "warn");
    return;
  }
  const stage = state.activeSession.stage;
  if (!isReadyVoteStage(stage)) {
    showToast("현재 단계에서는 턴 끝내기 투표를 할 수 없습니다.", "info");
    return;
  }
  if (state.readyInFlight) return;
  const shouldMarkReady = !(state.hostPlayer.stage_ready && state.hostPlayer.ready_stage === stage);
  state.readyInFlight = true;
  updateHostReadyUI();
  try {
    const updated = await api.update("players", state.hostPlayerId, {
      stage_ready: shouldMarkReady,
      ready_stage: stage,
      last_seen: new Date().toISOString()
    });
    state.hostPlayer = updated;
    updateHostReadyUI();
    await loadPlayers();
    showToast(
      shouldMarkReady
        ? "턴 끝내기 투표에 참여했습니다."
        : "턴 끝내기 투표를 취소했습니다.",
      shouldMarkReady ? "success" : "info"
    );
  } catch (error) {
    console.error("ready toggle failed", error);
    showToast("턴 끝내기 투표 상태를 업데이트하지 못했습니다.", "error");
  } finally {
    state.readyInFlight = false;
    updateHostReadyUI();
  }
}

function renderHostPersonalProfile(profile) {
  if (dom.hostProfileNotice) {
    dom.hostProfileNotice.textContent = profile
      ? `${profile.personaTitle ? `${profile.personaTitle} · ` : ""}${profile.personaName} 시점에서 정리된 개인 정보입니다.`
      : "역할이 확정되면 개인 정보가 표시됩니다.";
  }
  renderTimeline(dom.hostProfileTimeline, profile?.timeBasedTimeline || []);
  renderEvidenceWithAlibis(dom.hostProfileEvidence, profile?.evidence || []);
}

function renderEvidenceWithAlibis(element, entries = []) {
  if (!element) return;
  element.innerHTML = "";
  if (!entries.length) {
    const li = document.createElement("li");
    li.textContent = "나에 대한 특이 증거가 아직 보고되지 않았습니다.";
    element.appendChild(li);
    return;
  }
  entries.forEach((entry) => {
    const li = document.createElement("li");
    let display = entry.display;
    if (entry.time) {
      display += ` (${entry.time})`;
    }
    if (entry.visualElements && entry.visualElements.length) {
      display += ` - 시각적 요소: ${entry.visualElements.join(", ")}`;
    }
    li.textContent = display;
    element.appendChild(li);
    if (entry.alibis && entry.alibis.length) {
      entry.alibis.forEach((alibi) => {
        const subLi = document.createElement("li");
        subLi.className = "evidence-alibi";
        subLi.textContent = `변명: ${alibi}`;
        element.appendChild(subLi);
      });
    }
  });
}

function renderListWithFallback(element, items = [], fallbackMessage) {
  if (!element) return;
  element.innerHTML = "";
  if (!items.length) {
    const li = document.createElement("li");
    li.textContent = fallbackMessage;
    element.appendChild(li);
    return;
  }
  items.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    element.appendChild(li);
  });
}

function renderList(element, items = []) {
  if (!element) return;
  element.innerHTML = "";
  if (!items.length) {
    const li = document.createElement("li");
    li.textContent = "등록된 항목이 없습니다.";
    element.appendChild(li);
    return;
  }
  items.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = typeof item === 'string' ? item : item.display || item;
    element.appendChild(li);
  });
}

function renderVisualEvidence(element, visualItems = []) {
  if (!element) return;
  element.innerHTML = "";
  if (!visualItems.length) return;
  
  visualItems.forEach((item) => {
    const container = document.createElement("div");
    container.className = "visual-evidence-item";
    container.style.marginBottom = "20px";
    
    if (item.title) {
      const title = document.createElement("h4");
      title.textContent = item.title;
      title.style.marginBottom = "10px";
      container.appendChild(title);
    }
    
    if (item.description) {
      const desc = document.createElement("p");
      desc.textContent = item.description;
      desc.style.fontSize = "14px";
      desc.style.color = "#666";
      desc.style.marginBottom = "10px";
      container.appendChild(desc);
    }
    
    if (item.html) {
      const htmlContainer = document.createElement("div");
      htmlContainer.className = "visual-evidence-content";
      htmlContainer.innerHTML = item.html;
      container.appendChild(htmlContainer);
    }
    
    if (item.imagePrompt && !item.html) {
      const promptInfo = document.createElement("div");
      promptInfo.style.padding = "15px";
      promptInfo.style.background = "#f5f5f5";
      promptInfo.style.border = "1px dashed #999";
      promptInfo.style.borderRadius = "4px";
      promptInfo.innerHTML = `
        <strong>🎨 이미지 생성 프롬프트:</strong><br>
        <em style="font-size: 13px; color: #555;">${item.imagePrompt}</em>
      `;
      container.appendChild(promptInfo);
    }
    
    element.appendChild(container);
  });
}

function renderTimeline(element, entries = []) {
  element.innerHTML = "";
  if (!entries.length) {
    const li = document.createElement("li");
    li.textContent = "타임라인 정보가 없습니다.";
    element.appendChild(li);
    return;
  }
  entries.forEach(({ time, description }) => {
    const li = document.createElement("li");
    li.innerHTML = `<strong>${time}</strong> · ${description}`;
    element.appendChild(li);
  });
}

function renderCharacters(characters = []) {
  dom.suspectRoster.innerHTML = "";
  if (!characters.length) {
    const empty = document.createElement("p");
    empty.textContent = "용의자 정보가 없습니다.";
    dom.suspectRoster.appendChild(empty);
    return;
  }
  characters.forEach((character) => {
    const card = document.createElement("article");
    card.className = "suspect-card";

    const header = document.createElement("div");
    header.className = "suspect-card__header";

    const name = document.createElement("span");
    name.className = "suspect-card__name";
    name.textContent = character.name;

    const meta = document.createElement("span");
    meta.className = "suspect-card__meta";
    meta.textContent = character.title;

    const description = document.createElement("p");
    description.className = "suspect-card__description";
    description.textContent = character.description || character.summary || "";

    header.append(name, meta);
    card.append(header, description);
    dom.suspectRoster.appendChild(card);
  });
}

function setView(viewKey) {
  if (!["setup", "lobby", "game"].includes(viewKey)) return;
  if (state.activeView === viewKey) return;
  const viewMap = {
    setup: dom.setupView,
    lobby: dom.lobbyView,
    game: dom.gameView
  };
  Object.values(viewMap).forEach((element) => {
    if (!element) return;
    element.classList.remove("app-view--active");
  });
  const target = viewMap[viewKey];
  if (target) {
    target.classList.add("app-view--active");
  }
  state.activeView = viewKey;
  if (viewKey === "game") {
    cloneStageTracker();
    switchTab(state.activeTab || "progress");
  }
}

function switchTab(tabKey) {
  state.activeTab = tabKey;
  dom.tabButtons.forEach((button) => {
    const isActive = button.dataset.tab === tabKey;
    button.classList.toggle("tab-nav__btn--active", isActive);
  });
  dom.tabPanels.forEach((panel) => {
    const isActive = panel.dataset.tab === tabKey;
    panel.classList.toggle("tab-panel--active", isActive);
  });
}

function cloneStageTracker() {
  if (!dom.stageTracker || !dom.gameStageTracker) return;
  dom.gameStageTracker.innerHTML = dom.stageTracker.innerHTML;
  updateStageTracker(state.activeSession?.stage || "lobby");
}

function ensureViewForStage(stageKey) {
  if (!stageKey) return;
  if (stageKey === "lobby") {
    setView("lobby");
  } else {
    setView("game");
  }
}

function formatCountdownText(diffMs) {
  if (diffMs <= 0) {
    return "전환 준비 중";
  }
  const totalSeconds = Math.max(0, Math.floor(diffMs / 1000));
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds} 남음`;
}

function updateStageTimerDisplay() {
  const wrappers = [dom.stageTimerDisplay, dom.gameStageTimer];
  wrappers.forEach((wrapper) => {
    if (!wrapper) return;
    const labelEl = wrapper.querySelector(".stage-timer__label");
    const timeEl = wrapper.querySelector(".stage-timer__time");

    if (!state.activeSession) {
      if (labelEl) labelEl.textContent = "자동 진행";
      if (timeEl) timeEl.textContent = "대기 중";
      return;
    }

    const { stage, stage_deadline_at, auto_stage_enabled } = state.activeSession;
    if (labelEl) {
      labelEl.textContent = `자동 진행 · ${stageLabels[stage] || stage}`;
    }

    if (!auto_stage_enabled || getStageDurationMs(stage) === 0 || !stage_deadline_at) {
      if (timeEl) timeEl.textContent = "수동 제어";
      return;
    }

    const diff = new Date(stage_deadline_at).getTime() - Date.now();
    if (timeEl) {
      timeEl.textContent = formatCountdownText(diff);
    }
  });
}

function startStageTimerLoop() {
  clearInterval(state.stageTimerInterval);
  updateStageTimerDisplay();
  if (!state.activeSession) return;
  state.stageTimerInterval = setInterval(async () => {
    updateStageTimerDisplay();
    if (!state.activeSession?.auto_stage_enabled) {
      return;
    }
    if (state.stageAutoAdvancing) {
      return;
    }
    const deadline = state.activeSession.stage_deadline_at;
    if (!deadline) {
      return;
    }
    const diff = new Date(deadline).getTime() - Date.now();
    if (diff <= 0) {
      state.stageAutoAdvancing = true;
      try {
        await autoAdvanceStage();
      } catch (error) {
        console.error("자동 단계 전환 실패", error);
      } finally {
        state.stageAutoAdvancing = false;
        updateStageTimerDisplay();
      }
    }
  }, 1000);
}

async function ensureStageSchedule() {
  if (!state.activeSession || !state.sessionRecordId) return;
  const { stage, auto_stage_enabled: autoEnabled, stage_deadline_at: deadline, stage_started_at: startedAt } =
    state.activeSession;
  const durationMs = getStageDurationMs(stage);
  if (durationMs <= 0) return;
  if (autoEnabled && deadline) return;
  const now = new Date();
  const startIso = startedAt || now.toISOString();
  const deadlineIso = new Date(now.getTime() + durationMs).toISOString();
  try {
    const updated = await api.update("sessions", state.sessionRecordId, {
      auto_stage_enabled: true,
      stage_started_at: startIso,
      stage_deadline_at: deadlineIso,
      last_activity: now.toISOString()
    });
    state.activeSession = {
      ...state.activeSession,
      ...updated
    };
    updateSessionMeta();
    updateStageTimerDisplay();
    startStageTimerLoop();
  } catch (error) {
    console.warn("단계 타이머 재설정 실패", error);
  }
}

async function autoAdvanceStage() {
  if (!state.activeSession) return;
  const currentStage = state.activeSession.stage;
  if (currentStage === "result" || currentStage === "lobby") {
    return;
  }
  if (currentStage === "verdict") {
    await handleBeginVoting(true);
    return;
  }
  if (currentStage === "voting") {
    await handleCloseVoting(true);
    return;
  }
  const currentIndex = stageOrder.indexOf(currentStage);
  if (currentIndex === -1) return;
  const nextStage = stageOrder[currentIndex + 1];
  if (!nextStage) return;
  await transitionToStage(nextStage, { silent: true });
}

async function transitionToStage(stageKey, options = {}) {
  if (!state.activeSession || !state.sessionRecordId) return null;
  const now = new Date();
  const startIso = options.startIso || now.toISOString();
  let deadlineIso = null;
  if (options.deadlineIso !== undefined) {
    deadlineIso = options.deadlineIso;
  } else {
    const durationMs = getStageDurationMs(stageKey);
    if (durationMs > 0) {
      deadlineIso = new Date(now.getTime() + durationMs).toISOString();
    }
  }
  const payload = {
    stage: stageKey,
    status: options.status || stageStatusMap[stageKey] || state.activeSession.status,
    stage_started_at: startIso,
    stage_deadline_at: deadlineIso,
    auto_stage_enabled:
      options.autoStageEnabled !== undefined
        ? options.autoStageEnabled
        : getStageDurationMs(stageKey) > 0 && stageKey !== "result",
    last_activity: now.toISOString(),
    ...(options.extra || {})
  };

  if (!deadlineIso) {
    payload.stage_deadline_at = null;
  }

  const updated = await api.update("sessions", state.sessionRecordId, payload);
  state.activeSession = {
    ...state.activeSession,
    ...updated
  };
  updateStageTracker(stageKey);
  updateSessionMeta();
  updateResultBanner();
  updateControlStates();
  updateVoteStatus();
  updateStageTimerDisplay();
  await resetPlayerReadiness(stageKey);
  
  // 토론 단계로 전환 시 봇들이 단서 공유
  if (stageKey === "discussion") {
    setTimeout(() => {
      sendBotClueMessages();
    }, 2000); // 2초 후 봇 메시지 전송
  }
  
  if (!options.silent) {
    showToast(`현재 단계가 '${stageLabels[stageKey] || stageKey}'(으)로 전환되었습니다.`, "info");
  }
  startStageTimerLoop();
  return updated;
}

function populateScenarioSelect() {
  dom.scenarioSelect.innerHTML = "";
  scenarios.forEach((scenario) => {
    const option = document.createElement("option");
    option.value = scenario.id;
    option.textContent = scenario.title;
    dom.scenarioSelect.appendChild(option);
  });
  dom.scenarioSelect.value = state.activeScenario.id;
  renderScenario(state.activeScenario);
}

async function hydrateRemoteScenarios() {
  try {
    const remoteScenarios = await fetchRemoteScenarios();
    if (remoteScenarios.length) {
      registerScenarios(remoteScenarios);
      populateScenarioSelect();
      showToast(`${remoteScenarios.length}개의 추가 사건 세트를 불러왔습니다.`, "info");
    }
  } catch (error) {
    console.warn("원격 사건 세트 로드 실패", error);
  }
}

function renderScenario(scenario) {
  if (!scenario) return;
  const scenarioChanged =
    state.activeSession && state.activeSession.scenario_id !== scenario.id;
  state.activeScenario = scenario;
  if (dom.scenarioDifficulty) {
    dom.scenarioDifficulty.textContent = `난이도 · ${scenario.difficulty}`;
  }
  if (dom.scenarioTone) {
    dom.scenarioTone.textContent = `톤 · ${scenario.tone}`;
  }
  if (dom.scenarioDuration) {
    dom.scenarioDuration.textContent = `진행 · ${scenario.duration}`;
  }
  if (dom.scenarioPlayersRange) {
    dom.scenarioPlayersRange.textContent = `필수 ${formatPlayerRange(scenario.playerRange)}`;
  }
  if (dom.scenarioTitle) dom.scenarioTitle.textContent = scenario.title;
  if (dom.scenarioTagline) dom.scenarioTagline.textContent = scenario.tagline;
  if (dom.scenarioSummary) dom.scenarioSummary.textContent = scenario.summary;
  if (dom.scenarioPlayers) {
    dom.scenarioPlayers.textContent = `${formatPlayerRange(scenario.playerRange)} 권장`;
  }
  renderList(dom.scenarioMotifs, scenario.motifs);
  renderList(dom.scenarioConflicts, scenario.conflicts);
  renderList(dom.evidencePhysical, scenario.evidence.physical);
  renderList(dom.evidenceDigital, scenario.evidence.digital);
  renderVisualEvidence(dom.evidencePhysical, scenario.evidence.visual);
  renderList(dom.investigationPrompts, scenario.prompts);
  renderTimeline(dom.scenarioTimeline, scenario.timeline);
  renderCharacters(scenario.characters || scenario.roles?.suspects || []);

  if (dom.gameScenarioTitle) dom.gameScenarioTitle.textContent = scenario.title;
  if (dom.gameScenarioTagline) dom.gameScenarioTagline.textContent = scenario.tagline;
  if (dom.gameScenarioSummary) dom.gameScenarioSummary.textContent = scenario.summary;
  renderList(dom.gameScenarioConflicts, scenario.conflicts);
  renderList(dom.gameScenarioPrompts, scenario.prompts);
  renderTimeline(dom.gameScenarioTimeline, scenario.timeline);
  renderList(dom.gameEvidencePhysical, scenario.evidence.physical);
  renderList(dom.gameEvidenceDigital, scenario.evidence.digital);
  renderVisualEvidence(dom.gameEvidencePhysical, scenario.evidence.visual);

  if (scenarioChanged) {
    resetAssignmentsOnScenarioChange();
  }
  updatePlayerStats();
  updateControlStates();
}

function updateStageTracker(stageKey) {
  const toggleItems = (container) => {
    if (!container) return;
    const items = container.querySelectorAll(".stage-tracker__item");
    items.forEach((item) => {
      item.classList.toggle(
        "stage-tracker__item--active",
        item.dataset.stage === stageKey
      );
    });
  };
  toggleItems(dom.stageTracker);
  toggleItems(dom.gameStageTracker);
  if (dom.stageSelect && dom.stageSelect.value !== stageKey) {
    dom.stageSelect.value = stageKey;
  }
  if (dom.progressStageBadge) {
    dom.progressStageBadge.textContent = stageLabels[stageKey] || stageKey;
  }
}

function setSessionResult(content) {
  dom.sessionResult.innerHTML = content;
}

function updateSessionResultDisplay() {
  if (!dom.sessionResult) return;
  if (!state.activeSession) {
    setSessionResult("세션을 생성하면 코드가 표시됩니다.");
    return;
  }
  const code = state.activeSession.code;
  const hostPin = state.hostPlayerPin;
  let content = `
    <div><strong>세션 코드</strong> <span class="badge">${code}</span></div>
  `;
  if (hostPin) {
    content += `
      <div><strong>호스트 PIN</strong> <span class="badge badge--tone">${hostPin}</span></div>
    `;
  }
  content += `<p class="helper-text">플레이어는 세션 코드와 닉네임만으로 입장합니다.</p>`;
  setSessionResult(content);
}

function formatStatusText(status) {
  switch (status) {
    case "lobby":
      return "대기 중";
    case "in_progress":
      return "진행 중";
    case "voting":
      return "투표 중";
    case "result":
      return "결과 발표";
    case "closed":
      return "종료";
    default:
      return status || "-";
  }
}

function updateSessionMeta() {
  if (!state.activeSession) {
    if (dom.chatMeta) dom.chatMeta.innerHTML = "";
    if (dom.sessionStatusBadge) dom.sessionStatusBadge.textContent = "대기실";
    if (dom.gameMeta) dom.gameMeta.innerHTML = "";
    if (dom.gameSessionStatus) dom.gameSessionStatus.textContent = "-";
    if (dom.progressStageBadge) dom.progressStageBadge.textContent = "-";
    ensureViewForStage("lobby");
    updateStageTimerDisplay();
    return;
  }
  const {
    code,
    stage,
    scenario_id,
    host_name,
    player_count,
    status,
    winning_side,
    stage_deadline_at,
    auto_stage_enabled
  } = state.activeSession;
  const scenario = getScenarioById(scenario_id);
  const diff = stage_deadline_at ? new Date(stage_deadline_at).getTime() - Date.now() : null;
  const autoMeta = auto_stage_enabled && stage_deadline_at ? formatCountdownText(diff) : "수동 제어";
  if (dom.chatMeta) {
    dom.chatMeta.innerHTML = `
      <div><strong>세션 코드</strong><br>${code || "-"}</div>
      <div><strong>현재 단계</strong><br>${stageLabels[stage] || stage || "-"}</div>
      <div><strong>세션 상태</strong><br>${formatStatusText(status)}</div>
      <div><strong>자동 진행</strong><br>${autoMeta}</div>
      <div><strong>선택 사건</strong><br>${scenario?.title || "-"}</div>
      <div><strong>호스트</strong><br>${host_name || "-"}</div>
      <div><strong>등록 플레이어</strong><br>${player_count ?? state.players.length}</div>
      ${winning_side ? `<div><strong>승리</strong><br>${winning_side === "citizens" ? "시민" : "범인"}</div>` : ""}
    `;
  }
  if (dom.gameMeta) {
    dom.gameMeta.innerHTML = `
      <div><strong>세션</strong> · ${code || "-"}</div>
      <div><strong>현재 단계</strong> · ${stageLabels[stage] || stage || "-"}</div>
      <div><strong>상태</strong> · ${formatStatusText(status)}</div>
      <div><strong>자동 진행</strong> · ${autoMeta}</div>
      <div><strong>참가자</strong> · ${player_count ?? state.players.length}명</div>
      <div><strong>호스트</strong> · ${host_name || "-"}</div>
    `;
  }
  if (dom.sessionStatusBadge) {
    dom.sessionStatusBadge.textContent = formatStatusText(status);
  }
  if (dom.gameSessionStatus) {
    dom.gameSessionStatus.textContent = formatStatusText(status);
  }
  ensureViewForStage(stage);
  updateStageTracker(stage);
  updateStageTimerDisplay();
}

function updateResultBanner() {
  if (!state.activeSession || !dom.resultBanner) {
    return;
  }
  const { winning_side, vote_summary } = state.activeSession;
  if (!winning_side) {
    dom.resultBanner.innerHTML = "";
    return;
  }
  let summaryText = "";
  try {
    if (vote_summary) {
      const parsed = JSON.parse(vote_summary);
      if (parsed && parsed.tallies) {
        const lines = Object.entries(parsed.tallies)
          .map(([name, count]) => `${name} : ${count}표`)
          .join("<br>");
        summaryText = lines;
      }
    }
  } catch (error) {
    summaryText = vote_summary;
  }
  const winner = winning_side === "citizens" ? "시민 팀 승리" : "범인 승리";
  dom.resultBanner.innerHTML = `
    <div class="result-banner__badge">${winner}</div>
    ${summaryText ? `<p>${summaryText}</p>` : ""}
  `;
}

function updateControlStates() {
  const hasSession = Boolean(state.activeSession);
  const status = state.activeSession?.status || "lobby";
  const rolesAssigned = Boolean(state.activeSession?.roles_assigned);
  const playersCount = state.players.length;
  const range = state.activeScenario?.playerRange;
  const minReached = range ? playersCount >= range.min : playersCount > 0;

  if (dom.stageUpdateBtn) {
    dom.stageUpdateBtn.disabled = !hasSession;
  }

  const addPlayerSubmit = dom.addPlayerForm?.querySelector("button[type='submit']");
  if (addPlayerSubmit) {
    addPlayerSubmit.disabled = !hasSession || status !== "lobby";
  }

  if (dom.addBotBtn) {
    dom.addBotBtn.disabled = !hasSession || status !== "lobby";
  }

  if (dom.resetPlayersBtn) {
    dom.resetPlayersBtn.disabled = !hasSession || playersCount === 0;
  }

  if (dom.assignRolesBtn) {
    dom.assignRolesBtn.disabled = !hasSession || !rolesAssigned;
  }

  if (dom.copyPlayerLink) {
    dom.copyPlayerLink.disabled = !hasSession;
  }

  if (dom.startGameBtn) {
    dom.startGameBtn.disabled =
      !hasSession || status !== "lobby" || !minReached || state.isAssigningRoles;
  }

  if (dom.beginVotingBtn) {
    dom.beginVotingBtn.disabled =
      !hasSession || status !== "in_progress" || state.activeSession.stage !== "verdict";
  }

  if (dom.closeVotingBtn) {
    dom.closeVotingBtn.disabled = !hasSession || status !== "voting";
  }

  if (dom.endSessionBtn) {
    dom.endSessionBtn.disabled = !hasSession || status === "closed";
  }

  if (dom.chatMessage) {
    dom.chatMessage.disabled = !hasSession;
  }
  if (dom.chatSendBtn) {
    dom.chatSendBtn.disabled = !hasSession;
  }
}

async function registerHostPlayer(sessionRecord, hostName) {
  const pin = createPin();
  const now = new Date().toISOString();
  const record = await api.create("players", {
    session_code: sessionRecord.code,
    name: hostName,
    pin,
    role: "미배정",
    character: "-",
    clue_summary: "",
    role_briefing: "",
    status: "waiting",
    is_host: true,
    is_bot: false,
    last_seen: now,
    vote_target: "",
    has_voted: false,
    stage_ready: false,
    ready_stage: sessionRecord.stage || "lobby"
  });
  state.hostPlayerId = record.id;
  state.hostPlayerName = record.name;
  state.hostPlayerPin = pin;
  return record;
}

async function handleCreateSession(event) {
  event.preventDefault();
  const formData = new FormData(event.target);
  const hostName = (formData.get("hostName") || "").trim();
  let customCode = (formData.get("customSessionCode") || "").trim();

  if (!hostName) {
    showToast("호스트 이름을 입력해 주세요.", "warn");
    return;
  }

  const selectedScenario = getScenarioById(dom.scenarioSelect.value);

  let sessionCode;
  let custom = false;

  if (customCode) {
    if (!/^[a-zA-Z0-9]{4,12}$/.test(customCode)) {
      showToast("세션 코드는 영문과 숫자 4~12자로 입력해 주세요.", "warn");
      return;
    }
    customCode = customCode.toUpperCase();
    const exists = await findSessionByCode(customCode);
    if (exists) {
      showToast("이미 사용 중인 세션 코드입니다.", "error");
      return;
    }
    sessionCode = customCode;
    custom = true;
  } else {
    let generated;
    let tries = 0;
    do {
      generated = generateSessionCode();
      // eslint-disable-next-line no-await-in-loop
      const exists = await findSessionByCode(generated);
      if (!exists) {
        sessionCode = generated;
        break;
      }
      tries += 1;
    } while (tries < 5);
    if (!sessionCode) {
      showToast("세션 코드를 생성하지 못했습니다. 다시 시도해 주세요.", "error");
      return;
    }
  }

  try {
    const now = new Date().toISOString();
    const record = await api.create("sessions", {
      code: sessionCode,
      host_name: hostName,
      scenario_id: selectedScenario.id,
      stage: "lobby",
      status: "lobby",
      custom_code: custom,
      player_count: 0,
      roles_assigned: false,
      last_activity: now,
      started_at: null,
      ended_at: null,
      winning_side: "",
      vote_summary: "",
      stage_started_at: null,
      stage_deadline_at: null,
      auto_stage_enabled: false
    });

    state.activeSession = record;
    state.sessionRecordId = record.id;
    state.hostPlayerName = hostName;
    const hostPlayer = await registerHostPlayer(record, hostName);
    state.players = [hostPlayer];

    updateSessionResultDisplay();
    persistHostSession(sessionCode, hostName);
  rememberRecentHostSession(sessionCode, hostName, selectedScenario.id);
  await refreshHostResumeSessions();
    showToast("세션이 생성되었습니다. 대기실에서 플레이어를 기다리세요.", "success");
    ensureViewForStage("lobby");
    updateStageTracker("lobby");
    updateSessionMeta();
    updateResultBanner();
    updateControlStates();

    ensureChatPolling(sessionCode);
    state.chatIdentity = {
      name: hostName,
      role: "호스트",
      sessionCode
    };
    if (dom.chatStatus) {
      dom.chatStatus.textContent = `${hostName}님이 호스트로 접속했습니다. 채팅 입력 시 역할이 표시됩니다.`;
    }

    loadPlayers();
    startPlayerPolling();
    startSessionPolling();
    startStageTimerLoop();
  } catch (error) {
    console.error(error);
    showToast("세션 생성 중 문제가 발생했습니다.", "error");
  }
}

async function handleHostResumeClick(event) {
  const button = event.target.closest("button[data-host-resume-session]");
  if (!button) return;
  const sessionCode = button.dataset.hostResumeSession;
  const hostName = button.dataset.hostResumeName;
  if (!sessionCode || !hostName) return;

  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = "복귀 중...";
  try {
    const success = await resumeHostSession(sessionCode, hostName);
    if (!success) {
      button.disabled = false;
      button.textContent = originalText;
    }
  } catch (error) {
    console.error("host resume failed", error);
    showToast("세션을 불러오지 못했습니다.", "error");
    button.disabled = false;
    button.textContent = originalText;
  } finally {
    await refreshHostResumeSessions();
  }
}

async function resumeHostSession(sessionCode, hostName, { silent = false } = {}) {
  if (!sessionCode) return false;
  try {
    const code = sessionCode.toUpperCase();
    const session = await findSessionByCode(code);
    if (!session || session.deleted || session.status === "closed") {
      if (!silent) {
        showToast("세션이 종료되었거나 더 이상 진행 중이 아닙니다.", "warn");
      }
      if (loadHostSessionCredentials()?.sessionCode === code) {
        clearHostSessionCredentials();
      }
      const remaining = loadRecentHostSessions().filter((entry) => entry.sessionCode !== code);
      saveRecentHostSessions(remaining);
      await refreshHostResumeSessions();
      return false;
    }

    state.activeSession = session;
    state.sessionRecordId = session.id;
    const identity = hostName || session.host_name || state.hostPlayerName || "호스트";
    state.hostPlayerName = identity;
    const scenario = getScenarioById(session.scenario_id) || state.activeScenario;
    if (scenario) {
      dom.scenarioSelect.value = scenario.id;
      renderScenario(scenario);
      state.activeScenario = scenario;
    }

    ensureViewForStage(session.stage);
    updateStageTracker(session.stage);
    updateSessionMeta();
    updateResultBanner();
    updateControlStates();

    toggleChatAvailability(true);
    ensureChatPolling(session.code);
    state.chatIdentity = {
      name: identity,
      role: "호스트",
      sessionCode: session.code
    };
    if (dom.chatStatus) {
      dom.chatStatus.textContent = `${identity}님이 호스트로 접속했습니다. 채팅 입력 시 역할이 표시됩니다.`;
    }

    await loadPlayers();
    await ensureStageSchedule();
    startPlayerPolling();
    startSessionPolling();
    startStageTimerLoop();
    updateStageTimerDisplay();
    updateSessionResultDisplay();

    persistHostSession(session.code, identity);
    rememberRecentHostSession(session.code, identity, session.scenario_id);
    await refreshHostResumeSessions();

    if (!silent) {
      showToast("기존 세션으로 복귀했습니다.", "success");
    }
    return true;
  } catch (error) {
    console.warn("호스트 세션 복귀 실패", error);
    if (!silent) {
      showToast("세션을 불러오지 못했습니다.", "error");
    }
    return false;
  }
}

async function resumeHostSessionFromStorage() {
  // 자동 재연결 비활성화
  // 호스트가 명시적으로 세션을 선택하도록 변경
  const stored = loadHostSessionCredentials();
  if (!stored?.sessionCode) {
    return false;
  }
  
  // 자동으로 재연결하지 않고, 사용자가 선택할 수 있도록 목록만 표시
  // clearHostSessionCredentials(); // 저장된 정보는 유지
  return false;
}

function startPlayerPolling() {
  clearInterval(state.playerInterval);
  if (!state.activeSession) return;
  state.playerInterval = setInterval(() => {
    if (state.activeSession) {
      loadPlayers();
    }
  }, 5000);
}

async function refreshActiveSession() {
  if (!state.activeSession?.code) return;
  try {
    const latest = await findSessionByCode(state.activeSession.code);
    if (!latest) return;
    const prevStage = state.activeSession.stage;
    const prevDeadline = state.activeSession.stage_deadline_at;
    state.activeSession = latest;
    await ensureStageSchedule();
    updateSessionMeta();
    updateResultBanner();
    updateControlStates();
    if (latest.status === "closed") {
      clearHostSessionCredentials();
    }
    if (latest.stage !== prevStage) {
      updateStageTracker(latest.stage);
      updateVoteStatus();
      const hostPlayer = state.players.find((player) => player.id === state.hostPlayerId);
      if (hostPlayer) {
        renderHostRoleView(hostPlayer);
      }
    }
    if (latest.stage_deadline_at !== prevDeadline) {
      startStageTimerLoop();
    } else {
      updateStageTimerDisplay();
    }
  } catch (error) {
    console.warn("세션 정보 동기화 실패", error);
  }
}

function startSessionPolling() {
  clearInterval(state.sessionInterval);
  if (!state.activeSession?.code) return;
  refreshActiveSession();
  state.sessionInterval = setInterval(() => {
    refreshActiveSession();
  }, 5000);
}

async function findSessionByCode(code) {
  try {
    const data = await api.list("sessions", { search: code, limit: "1" });
    if (!data || !data.data) {
      console.warn('세션 데이터가 비어있습니다');
      return null;
    }
    const match = data.data.find(
      (item) => item && item.code && item.code.toLowerCase() === code.toLowerCase() && !item.deleted
    );
    return match || null;
  } catch (error) {
    console.error('세션 검색 중 오류:', error);
    return null;
  }
}

function generateSessionCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let result = "";
  for (let i = 0; i < 6; i += 1) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

async function handleStageUpdate() {
  if (!state.activeSession || !state.sessionRecordId) {
    showToast("먼저 세션을 생성하거나 불러오세요.", "warn");
    return;
  }
  const stageKey = dom.stageSelect.value;
  const status = stageStatusMap[stageKey] || state.activeSession.status;
  try {
    await transitionToStage(stageKey, { status, silent: true });
    showToast(`현재 단계가 '${stageLabels[stageKey] || stageKey}'(으)로 변경되었습니다.`, "success");
  } catch (error) {
    console.error(error);
    showToast("단계를 업데이트하지 못했습니다.", "error");
  }
}

async function handleStartGame() {
  if (!state.activeSession || state.activeSession.stage !== "lobby") {
    showToast("이미 게임이 시작되었거나 세션이 없습니다.", "warn");
    return;
  }
  const range = state.activeScenario?.playerRange;
  if (range && state.players.length < range.min) {
    showToast(`최소 ${range.min}명 이상이 있어야 게임을 시작할 수 있습니다.`, "warn");
    return;
  }
  state.isAssigningRoles = true;
  updateControlStates();
  try {
    const now = new Date().toISOString();
    await transitionToStage("briefing", {
      status: "in_progress",
      silent: true,
      extra: {
        started_at: now,
        roles_assigned: false,
        winning_side: "",
        vote_summary: ""
      }
    });
    updateSessionMeta();
    startSessionPolling();
    await assignRoles();
    showToast("역할이 랜덤 배정되었고 게임이 시작되었습니다!", "success");
    updateControlStates();
  } catch (error) {
    console.error(error);
    showToast("게임 시작 중 오류가 발생했습니다.", "error");
  } finally {
    state.isAssigningRoles = false;
    updateControlStates();
  }
}

function buildCluePackage(persona, type) {
  const rounds = createRoundSkeleton();
  const base = {
    type,
    persona: {
      name: persona.name,
      title: persona.title || ""
    },
    briefing: persona.briefing || persona.summary || "",
    // 개인별 정보 추가
    timeline: persona.timeline || [],
    suggestedQuestions: persona.suggestedQuestions || [],
    keyConflicts: persona.keyConflicts || [],
    visualEvidence: persona.visualEvidence || []
  };

  if (type === "culprit") {
    populateRoundsWithClues(rounds, {
      misdirections: persona.misdirections || [],
      prompts: persona.prompts || []
    });
    base.master = {
      truths: persona.truths || [],
      exposed: persona.exposed || []
    };
  } else {
    populateRoundsWithClues(rounds, {
      truths: persona.truths || [],
      misdirections: persona.misdirections || [],
      prompts: persona.prompts || []
    });
    if (persona.exposed?.length) {
      base.exposed = persona.exposed;
    }
  }

  base.rounds = rounds;
  return JSON.stringify(base);
}

async function assignRoles() {
  if (!state.activeSession) {
    showToast("세션을 먼저 생성하세요.", "warn");
    return;
  }
  const rolesConfig = state.activeScenario?.roles;
  if (!rolesConfig) {
    showToast("역할 정보를 찾을 수 없습니다.", "error");
    return;
  }
  const range = state.activeScenario?.playerRange;
  if (range && state.players.length < range.min) {
    showToast("최소 인원이 충족되지 않았습니다.", "warn");
    return;
  }

  const players = shuffle(state.players);
  if (players.length < 2) {
    showToast("역할을 배정할 플레이어가 부족합니다.", "error");
    return;
  }

  const detectivePersona = rolesConfig.detective?.[0];
  const culpritPersona = rolesConfig.culprit?.[0];
  const suspectPersonas = rolesConfig.suspects || [];
  if (!detectivePersona || !culpritPersona || !suspectPersonas.length) {
    showToast("역할 데이터가 충분하지 않습니다.", "error");
    return;
  }

  const detectivePlayer = players.shift();
  const culpritPlayer = players.shift();

  const now = new Date().toISOString();
  const updates = [];

  updates.push(
    api.update("players", detectivePlayer.id, {
      role: "탐정",
      character: `${detectivePersona.name} · ${detectivePersona.title}`,
      role_briefing: detectivePersona.briefing || "",
      clue_summary: buildCluePackage(detectivePersona, "detective"),
      status: "active",
      has_voted: false,
      vote_target: "",
      last_seen: now
    })
  );

  updates.push(
    api.update("players", culpritPlayer.id, {
      role: "범인",
      character: `${culpritPersona.name} · ${culpritPersona.title}`,
      role_briefing: culpritPersona.briefing || "",
      clue_summary: buildCluePackage(culpritPersona, "culprit"),
      status: "active",
      has_voted: false,
      vote_target: "",
      last_seen: now
    })
  );

  players.forEach((player, index) => {
    const persona = suspectPersonas[index % suspectPersonas.length];
    updates.push(
      api.update("players", player.id, {
        role: "용의자",
        character: `${persona.name} · ${persona.title}`,
        role_briefing: persona.briefing || persona.summary || "",
        clue_summary: buildCluePackage(persona, "suspect"),
        status: "active",
        has_voted: false,
        vote_target: "",
        last_seen: now
      })
    );
  });

  try {
    await Promise.all(updates);
    const updatedSession = await api.update("sessions", state.sessionRecordId, {
      roles_assigned: true,
      last_activity: now
    });
    state.activeSession = {
      ...state.activeSession,
      ...updatedSession
    };
    loadPlayers();

    // 봇 채팅 메시지 추가
    const botPlayers = state.players.filter(player => player.is_bot);
    for (const bot of botPlayers) {
      const cluePackage = parseCluePackage(bot.clue_summary);
      if (!cluePackage) continue;

      let message = "";
      if (bot.role === "탐정") {
        message = `나는 탐정이고, ${cluePackage.briefing || "수사를 시작합니다"}`;
      } else if (bot.role === "범인") {
        message = `나는 범인이고, ${cluePackage.briefing || "계획을 실행합니다"}`;
      } else if (bot.role === "용의자") {
        message = `나는 용의자이고, ${cluePackage.briefing || "알리바이를 준비합니다"}`;
      }

      if (message) {
        await api.create("chat_messages", {
          session_code: state.activeSession.code,
          player_name: bot.name,
          role: bot.role,
          message,
          sent_at: new Date().toISOString()
        });
      }
    }
  } catch (error) {
    console.error(error);
    showToast("역할 배정 중 오류가 발생했습니다.", "error");
  }
}

async function handleBeginVoting(auto = false) {
  if (!state.activeSession) return;
  const validStages = ["clue_a", "discussion_a", "clue_b", "discussion_b", "clue_c", "final_discussion"];
  if (!validStages.includes(state.activeSession.stage)) {
    if (!auto) {
      showToast("게임이 진행 중일 때만 투표를 시작할 수 있습니다.", "warn");
    }
    return;
  }
  try {
    await Promise.all(
      state.players.map((player) =>
        api.update("players", player.id, {
          has_voted: false,
          vote_target: ""
        })
      )
    );
    await transitionToStage("voting", {
      status: "voting",
      silent: auto
    });
    if (!auto) {
      showToast("최후 투표가 시작되었습니다.", "success");
    }
    updateControlStates();
    loadPlayers();
  } catch (error) {
    console.error(error);
    if (!auto) {
      showToast("투표를 시작하지 못했습니다.", "error");
    }
  }
}

function computeVoteOutcome(players) {
  const votes = new Map();
  const nameMap = new Map();
  players.forEach((player) => {
    nameMap.set(player.id, player.name);
  });

  players
    .filter((player) => player.vote_target)
    .forEach((player) => {
      const target = player.vote_target;
      votes.set(target, (votes.get(target) || 0) + 1);
    });

  let topTarget = null;
  let topVotes = 0;
  votes.forEach((count, target) => {
    if (count > topVotes) {
      topTarget = target;
      topVotes = count;
    }
  });

  const culprit = players.find((player) => player.role === "범인");
  const winningSide = topTarget && culprit && topTarget === culprit.id ? "citizens" : "culprit";

  const tallies = {};
  votes.forEach((count, target) => {
    tallies[nameMap.get(target) || target] = count;
  });

  return {
    winningSide,
    tallies,
    chosenId: topTarget,
    culpritId: culprit?.id || null,
    culpritName: culprit?.name || "",
    votesCast: Array.from(votes.values()).reduce((sum, value) => sum + value, 0)
  };
}

async function handleCloseVoting(auto = false) {
  if (!state.activeSession || state.activeSession.stage !== "voting") {
    if (!auto) {
      showToast("투표 중일 때만 결과를 발표할 수 있습니다.", "warn");
    }
    return;
  }
  try {
    await loadPlayers();
    const outcome = computeVoteOutcome(state.players);
    const now = new Date().toISOString();
    await transitionToStage("result", {
      status: "result",
      silent: auto,
      autoStageEnabled: false,
      extra: {
        ended_at: now,
        winning_side: outcome.winningSide,
        vote_summary: JSON.stringify({
          tallies: outcome.tallies,
          culprit: outcome.culpritName,
          chosenId: outcome.chosenId
        })
      }
    });
    if (!auto) {
      showToast(
        outcome.winningSide === "citizens"
          ? "범인을 검거했습니다! 시민 팀 승리"
          : "범인이 승리했습니다!",
        outcome.winningSide === "citizens" ? "success" : "warn"
      );
    }
    updateControlStates();
    updateResultBanner();
  } catch (error) {
    console.error(error);
    if (!auto) {
      showToast("투표 결과 계산 중 오류가 발생했습니다.", "error");
    }
  }
}

async function handleEndSession() {
  if (!state.activeSession) {
    showToast("종료할 세션이 없습니다.", "warn");
    return;
  }
  if (state.activeSession.status === "closed") {
    showToast("이미 종료된 세션입니다.", "info");
    return;
  }
  const confirmed = confirm(
    "게임을 즉시 종료하시겠습니까? 모든 플레이어가 결과 화면으로 이동합니다."
  );
  if (!confirmed) {
    return;
  }
  try {
    const now = new Date().toISOString();
    await transitionToStage("result", {
      status: "closed",
      silent: true,
      autoStageEnabled: false,
      extra: {
        ended_at: now,
        last_activity: now,
        winning_side: "",
        vote_summary: "호스트가 게임을 중단했습니다."
      }
    });
    clearHostSessionCredentials();
    await loadPlayers();
    showToast("게임을 중도 종료했습니다. 모든 플레이어에게 결과 화면이 표시됩니다.", "warn");
    updateControlStates();
    updateResultBanner();
  } catch (error) {
    console.error("manual end session failed", error);
    showToast("게임을 중단하지 못했습니다. 다시 시도해 주세요.", "error");
  }
}

async function handleAddPlayer(event) {
  event.preventDefault();
  if (!state.activeSession) {
    showToast("먼저 세션을 생성한 뒤 플레이어를 추가하세요.", "warn");
    return;
  }
  if (state.activeSession.stage !== "lobby") {
    showToast("게임이 시작된 후에는 새로운 플레이어를 추가할 수 없습니다.", "warn");
    return;
  }
  const range = state.activeScenario?.playerRange;
  if (range && state.players.length >= range.max) {
    showToast("최대 인원을 초과할 수 없습니다.", "warn");
    return;
  }
  const name = dom.playerNameInput.value.trim();
  if (!name) {
    showToast("플레이어 닉네임을 입력하세요.", "warn");
    return;
  }
  if (state.players.some((player) => player.name === name)) {
    showToast("이미 동일한 닉네임이 존재합니다.", "warn");
    return;
  }

  const pin = createPin();
  const now = new Date().toISOString();
  try {
    await api.create("players", {
      session_code: state.activeSession.code,
      name,
      pin,
      role: "미배정",
      character: "-",
      clue_summary: "",
      role_briefing: "",
      status: "waiting",
      is_host: false,
      is_bot: false,
      last_seen: now,
      vote_target: "",
      has_voted: false,
      stage_ready: false,
      ready_stage: state.activeSession.stage
    });
    showToast(`${name} 플레이어가 추가되었습니다. PIN은 ${pin} 입니다.`, "success");
    dom.playerNameInput.value = "";
    await markRolesUnassigned();
    loadPlayers();
  } catch (error) {
    console.error(error);
    showToast("플레이어를 추가하지 못했습니다.", "error");
  }
}

function createPin() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function handleAddBot() {
  if (!state.activeSession) {
    showToast("세션을 먼저 생성하세요.", "warn");
    return;
  }
  if (state.activeSession.stage !== "lobby") {
    showToast("게임이 시작된 후에는 봇을 추가할 수 없습니다.", "warn");
    return;
  }
  const range = state.activeScenario?.playerRange;
  if (range && state.players.length >= range.max) {
    showToast("최대 인원을 초과할 수 없습니다.", "warn");
    return;
  }
  const botNumber = state.players.filter((player) => player.is_bot).length + 1;
  const name = `BOT-${String(botNumber).padStart(2, "0")}`;
  const now = new Date().toISOString();
  try {
    await api.create("players", {
      session_code: state.activeSession.code,
      name,
      pin: "BOT",
      role: "미배정",
      character: "봇 참가자",
      clue_summary: "",
      role_briefing: "봇은 자동으로 정보가 요약되어 공유됩니다.",
      status: "waiting",
      is_host: false,
      is_bot: true,
      last_seen: now,
      vote_target: "",
      has_voted: false,
      stage_ready: false,
      ready_stage: state.activeSession.stage
    });
    showToast(`${name} 봇이 추가되었습니다.`, "success");
    await markRolesUnassigned();
    loadPlayers();
  } catch (error) {
    console.error(error);
    showToast("봇을 추가하지 못했습니다.", "error");
  }
}

async function markRolesUnassigned() {
  if (!state.sessionRecordId) return;
  try {
    const updated = await api.update("sessions", state.sessionRecordId, {
      roles_assigned: false,
      last_activity: new Date().toISOString()
    });
    state.activeSession = {
      ...state.activeSession,
      ...updated
    };
  } catch (error) {
    console.warn("roles_assigned 갱신 실패", error);
  }
}

async function resetAssignmentsOnScenarioChange() {
  if (!state.players.length || !state.activeSession) return;
  try {
    await Promise.all(
      state.players.map((player) =>
        api.update("players", player.id, {
          role: "미배정",
          character: "-",
          clue_summary: "",
          role_briefing: "",
          has_voted: false,
          vote_target: ""
        })
      )
    );
    await markRolesUnassigned();
    showToast("사건 세트 변경으로 역할이 초기화되었습니다.", "info");
    loadPlayers();
  } catch (error) {
    console.warn("시나리오 변경 초기화 실패", error);
  }
}

async function loadPlayers() {
  if (!state.activeSession) return;
  try {
    const data = await api.list("players", { search: state.activeSession.code, limit: "100" });
    const players = (data?.data || []).filter(
      (item) => !item.deleted && item.session_code === state.activeSession.code
    );
    state.players = players;
    const hostPlayer = players.find((player) => player.is_host);
    if (hostPlayer) {
      state.hostPlayerId = hostPlayer.id;
      state.hostPlayerName = hostPlayer.name;
      state.hostPlayer = hostPlayer;
      if (!state.hostPlayerPin && hostPlayer.pin) {
        state.hostPlayerPin = hostPlayer.pin;
      }
      renderHostRoleView(hostPlayer);
    } else {
      state.hostPlayer = null;
      renderHostRoleView(null);
    }
    updateSessionResultDisplay();
    renderPlayers(players);
    renderGamePlayerStatus(players);
    renderReadyAggregates(players);
    await checkAndHandleStageReadyAdvance();
    updatePlayerStats();
    updateVoteStatus();
    updateHostReadyUI();
    updateHostVoteUI();
    if (state.sessionRecordId) {
      try {
        const updated = await api.update("sessions", state.sessionRecordId, {
          player_count: players.length,
          last_activity: new Date().toISOString()
        });
        // 기존 세션 데이터와 업데이트된 데이터 병합
        state.activeSession = {
          ...state.activeSession,
          ...updated
        };
        updateSessionMeta();
        updateResultBanner();
        updateControlStates();
        updateStageTimerDisplay();
      } catch (error) {
        console.warn("세션 플레이어 수 업데이트 실패", error);
      }
    }
  } catch (error) {
    console.error(error);
    showToast("플레이어 목록을 불러오지 못했습니다.", "error");
  }
}

function renderPlayers(players = []) {
  if (!dom.playerTableBody) return;
  dom.playerTableBody.innerHTML = "";
  if (!players.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 4;
    cell.className = "empty";
    cell.textContent = "플레이어가 입장하면 자동으로 목록이 채워집니다.";
    row.appendChild(cell);
    dom.playerTableBody.appendChild(row);
    return;
  }

  players
    .slice()
    .sort((a, b) => {
      if (a.is_host && !b.is_host) return -1;
      if (!a.is_host && b.is_host) return 1;
      if (a.is_bot !== b.is_bot) return Number(a.is_bot) - Number(b.is_bot);
      return a.name.localeCompare(b.name, "ko-KR");
    })
    .forEach((player) => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${player.name}</td>
        <td>${formatPlayerStatus(player)}</td>
        <td>${formatReadyStatus(player)}</td>
        <td>${player.is_host ? "호스트" : player.is_bot ? "봇" : "플레이어"}</td>
      `;
      if (player.is_host) {
        row.classList.add("player-row--host");
      }
      dom.playerTableBody.appendChild(row);
    });
}

function formatPlayerStatus(player) {
  if (player.is_bot) return "봇";
  switch (player.status) {
    case "waiting":
      return "대기";
    case "active":
      return player.has_voted ? "투표 완료" : "활성";
    case "disconnected":
      return "오프라인";
    case "eliminated":
      return "탈락";
    default:
      return player.status || "-";
  }
}

function formatReadyStatus(player) {
  if (player.is_bot) return "-";
  if (!player.stage_ready) return "대기";
  if (player.ready_stage) {
    return `준비 (${stageLabels[player.ready_stage] || player.ready_stage})`;
  }
  return "준비";
}

function getRoleBadgeClass(role) {
  switch (role) {
    case "탐정":
      return "role-badge role-badge--detective";
    case "범인":
      return "role-badge role-badge--culprit";
    case "용의자":
      return "role-badge role-badge--suspect";
    default:
      return "role-badge";
  }
}

function parseCluePackage(raw) {
  if (!raw) return null;
  try {
    return typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch (error) {
    console.warn("clue parse fail", error);
    return null;
  }
}

function flattenScenarioPersonas(scenario) {
  if (!scenario?.roles) return [];
  const personas = [];
  const { detective = [], culprit = [], suspects = [] } = scenario.roles;
  detective.forEach((persona) => {
    personas.push({ data: persona, type: "detective", label: "탐정" });
  });
  culprit.forEach((persona) => {
    personas.push({ data: persona, type: "culprit", label: "범인" });
  });
  suspects.forEach((persona) => {
    personas.push({ data: persona, type: "suspect", label: "용의자" });
  });
  return personas;
}

function gatherPersonaLines(persona) {
  const results = [];
  const pushLines = (items, label) => {
    (items || []).forEach((item) => {
      if (typeof item !== "string") return;
      const trimmed = item.trim();
      if (!trimmed) return;
      results.push({ text: trimmed, label });
    });
  };
  pushLines(persona?.truths, "진실");
  pushLines(persona?.misdirections, "혼선");
  pushLines(persona?.prompts, "프롬프트");
  pushLines(persona?.exposed, "노출 위험");
  if (persona?.master) {
    pushLines(persona.master.truths, "비밀 진실");
    pushLines(persona.master.exposed, "폭로 경고");
  }
  return results;
}

function buildPersonalProfile(player, cluePackage) {
  if (!player || !cluePackage || !state.activeScenario) {
    return null;
  }

  const scenario = state.activeScenario;
  const characterParts = (player.character || "").split(" · ");
  const personaName = (cluePackage.persona?.name || characterParts[0] || player.name || "").trim();
  const personaTitle = (cluePackage.persona?.title || characterParts[1] || "").trim();
  const personas = flattenScenarioPersonas(scenario);
  const selfEntry = personas.find((entry) => entry.data.name === personaName) || null;

  const timelineSet = new Set();
  const addLines = (lines) => {
    (lines || []).forEach((line) => {
      if (typeof line !== "string") return;
      const trimmed = line.trim();
      if (!trimmed) return;
      timelineSet.add(trimmed);
    });
  };

  if (cluePackage.briefing) {
    addLines([cluePackage.briefing]);
  }
  if (selfEntry?.data?.briefing) {
    addLines([selfEntry.data.briefing]);
  }
  addLines(selfEntry?.data?.truths);
  addLines(selfEntry?.data?.timeline);
  if (cluePackage.master?.truths) {
    addLines(cluePackage.master.truths);
  }
  (cluePackage.rounds || []).forEach((round) => {
    addLines(round.truths);
  });
  const timeline = Array.from(timelineSet);

  const evidenceEntries = [];
  const addEvidenceEntry = (display, detail) => {
    if (!display) return;
    if (evidenceEntries.some((entry) => entry.display === display)) return;
    evidenceEntries.push({ display, detail, alibis: [] });
  };

  const tokens = new Set();
  if (personaName) tokens.add(personaName.toLowerCase());
  if (personaTitle) tokens.add(personaTitle.toLowerCase());
  if (player.name) tokens.add(player.name.toLowerCase());

  const matchesTarget = (text = "") => {
    if (typeof text !== 'string') return false;
    const lower = text.toLowerCase();
    for (const token of tokens) {
      if (token && lower.includes(token)) {
        return true;
      }
    }
    return false;
  };

  personas.forEach((entry) => {
    if (entry.data.name === personaName) {
      return;
    }
    const lines = gatherPersonaLines(entry.data);
    lines.forEach(({ text, label }) => {
      if (matchesTarget(text)) {
        const display = `${entry.data.name} (${entry.label}) · ${label}: ${text}`;
        addEvidenceEntry(display, text);
      }
    });
  });

  const scenarioEvidence = [
    ...(scenario.evidence?.physical || []),
    ...(scenario.evidence?.digital || [])
  ];
  scenarioEvidence.forEach((item) => {
    if (matchesTarget(item)) {
      addEvidenceEntry(`공용 증거: ${item}`, item);
    }
  });

  const alibiSet = new Set();
  const addAlibiLines = (lines) => {
    (lines || []).forEach((line) => {
      if (typeof line !== "string") return;
      const trimmed = line.trim();
      if (!trimmed) return;
      alibiSet.add(trimmed);
    });
  };

  addAlibiLines(selfEntry?.data?.misdirections);
  (cluePackage.rounds || []).forEach((round) => {
    addAlibiLines(round.misdirections);
  });

  const detailSet = new Set(
    evidenceEntries
      .map((entry) => entry.detail)
      .filter((detail) => typeof detail === "string" && detail.trim())
  );

  let addedCounter = 0;
  detailSet.forEach((detail) => {
    if (addedCounter >= 3) {
      return;
    }
    const trimmed = detail.length > 80 ? `${detail.slice(0, 77)}...` : detail;
    const alibi = `"${trimmed}" 라는 의심에는 상황은 인정하되 사건과 무관함을 강조하세요. 예) "맞아요, 그런 일이 있었지만 범행과는 아무 관련이 없어요."`;
    alibiSet.add(alibi);
    // 해당 entry에 alibi 추가
    const entry = evidenceEntries.find(e => e.detail === detail);
    if (entry) {
      entry.alibis.push(alibi);
    }
    addedCounter += 1;
  });

  if (!alibiSet.size) {
    const defaultAlibi = "행동의 이유를 침착하게 설명하고, 당시 알리바이나 증인을 준비해 두라고 팀에 공유하세요.";
    alibiSet.add(defaultAlibi);
    // evidence가 없으면 별도 처리, 하지만 여기서는 추가하지 않음
  }

  const profile = {
    personaName,
    personaTitle,
    timeline,
    evidence: evidenceEntries,
    alibis: Array.from(alibiSet)
  };

  return profile;
}

function createClueList(items = [], modifier = "") {
  const list = document.createElement("ul");
  list.className = `clue-list ${modifier}`.trim();
  if (!items.length) {
    const li = document.createElement("li");
    li.textContent = "제공된 단서가 없습니다.";
    list.appendChild(li);
    return list;
  }
  items.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    list.appendChild(li);
  });
  return list;
}

function getUnlockedRounds(cluePackage) {
  if (!cluePackage?.rounds || !cluePackage.rounds.length) return [];
  if (cluePackage.type === "culprit") {
    return cluePackage.rounds;
  }
  const currentStage = state.activeSession?.stage || "lobby";
  const currentIndex = stageOrder.indexOf(currentStage);
  if (currentIndex === -1) {
    return cluePackage.rounds;
  }
  return cluePackage.rounds.filter((round) => {
    if (!round.stage) return true;
    const roundIndex = stageOrder.indexOf(round.stage);
    return roundIndex === -1 || roundIndex <= currentIndex;
  });
}

function appendClueSection(container, title, listElement) {
  const section = document.createElement("div");
  section.className = "role-view__section";
  const heading = document.createElement("h4");
  heading.textContent = title;
  section.append(heading, listElement);
  container.appendChild(section);
}

function renderHostRoleView(player) {
  const container = dom.hostRoleView;
  if (!container) return;
  container.innerHTML = "";
  const stage = state.activeSession?.stage;
  if (
    !player ||
    !state.activeSession ||
    stage === "lobby" ||
    !player.role ||
    player.role === "미배정" ||
    !player.clue_summary
  ) {
    const placeholder = document.createElement("p");
    placeholder.className = "placeholder";
    placeholder.textContent = "게임 시작 후 역할과 단서가 표시됩니다.";
    container.appendChild(placeholder);
    renderHostPersonalProfile(null);
    return;
  }

  const cluePackage = parseCluePackage(player.clue_summary);
  const header = document.createElement("div");
  header.className = "role-view__header";
  const badge = document.createElement("span");
  badge.className = getRoleBadgeClass(player.role);
  badge.textContent = player.role || "미배정";
  const title = document.createElement("p");
  title.className = "role-view__title";
  const personaName = cluePackage?.persona?.name ? `${cluePackage.persona.name} · ${cluePackage.persona.title || ""}`.trim() : player.character;
  title.textContent = personaName || player.character || "배정 대기";
  const subtitle = document.createElement("p");
  subtitle.className = "role-view__subtitle";
  subtitle.textContent = `${player.name}${player.is_host ? " (호스트)" : ""}`;
  header.append(badge, title, subtitle);
  container.appendChild(header);

  const briefingBlock = document.createElement("div");
  briefingBlock.className = "role-view__section";
  const briefingTitle = document.createElement("h4");
  briefingTitle.textContent = "역할 브리핑";
  const briefingText = document.createElement("p");
  briefingText.textContent = cluePackage?.briefing || player.role_briefing || "브리핑 정보가 없습니다.";
  briefingBlock.append(briefingTitle, briefingText);
  container.appendChild(briefingBlock);

  const rounds = getUnlockedRounds(cluePackage);
  if (rounds.length) {
    rounds.forEach((round, index) => {
      const section = document.createElement("div");
      section.className = "role-view__section";
      const heading = document.createElement("h4");
      heading.textContent = round.label || `${index + 1}차 단서`;
      section.appendChild(heading);
      if (round.truths?.length) {
        section.appendChild(createClueList(round.truths, "clue-list--truths"));
      }
      if (round.misdirections?.length) {
        section.appendChild(createClueList(round.misdirections, "clue-list--misdirections"));
      }
      if (round.prompts?.length) {
        section.appendChild(createClueList(round.prompts, "clue-list--prompts"));
      }
      container.appendChild(section);
    });
  } else if (cluePackage) {
    if (cluePackage.truths?.length) {
      appendClueSection(container, "결정적 단서", createClueList(cluePackage.truths, "clue-list--truths"));
    }
    if (cluePackage.misdirections?.length) {
      appendClueSection(
        container,
        "혼동 정보",
        createClueList(cluePackage.misdirections, "clue-list--misdirections")
      );
    }
    if (cluePackage.exposed?.length) {
      appendClueSection(
        container,
        "노출 위험",
        createClueList(cluePackage.exposed, "clue-list--exposed")
      );
    }
  }

  if (cluePackage?.master) {
    const masterSection = document.createElement("div");
    masterSection.className = "role-view__section";
    const heading = document.createElement("h4");
    heading.textContent = "범인 전용 준비 자료";
    masterSection.appendChild(heading);
    if (cluePackage.master.truths?.length) {
      masterSection.appendChild(
        createClueList(cluePackage.master.truths, "clue-list--truths")
      );
    }
    if (cluePackage.master.exposed?.length) {
      masterSection.appendChild(
        createClueList(cluePackage.master.exposed, "clue-list--exposed")
      );
    }
    container.appendChild(masterSection);
  }

  const profile = buildPersonalProfile(player, cluePackage);
  renderHostPersonalProfile(profile);
}

function renderGamePlayerStatus(players = []) {
  if (!dom.gamePlayerStatus) return;
  if (!players.length) {
    dom.gamePlayerStatus.innerHTML = "<p class=\"placeholder\">플레이어를 기다리는 중입니다.</p>";
    return;
  }
  const rows = players
    .slice()
    .sort((a, b) => {
      if (a.is_host && !b.is_host) return -1;
      if (!a.is_host && b.is_host) return 1;
      if (a.is_bot !== b.is_bot) return Number(a.is_bot) - Number(b.is_bot);
      return a.name.localeCompare(b.name, "ko-KR");
    })
    .map((player) => {
      const tag = player.is_host ? "호스트" : player.is_bot ? "봇" : "플레이어";
      const statusText = formatPlayerStatus(player);
      const readyText = formatReadyStatus(player);
      return `
        <div class="lobby-status__row">
          <span class="lobby-status__label">${player.name} · ${tag}</span>
          <span class="lobby-status__value">${statusText} · ${readyText}</span>
        </div>
      `;
    })
    .join("");
  dom.gamePlayerStatus.innerHTML = rows;
}

function renderReadyAggregates(players = []) {
  if (!dom.gameReadyStatus) return;
  if (!state.activeSession) {
    dom.gameReadyStatus.innerHTML = "";
    return;
  }
  const stage = state.activeSession.stage;
  if (!isStageReadySkipEligible(stage)) {
    dom.gameReadyStatus.innerHTML =
      "<p class=\"placeholder\">이 단계에서는 턴 끝내기 투표를 사용할 수 없습니다.</p>";
    return;
  }
  const eligiblePlayers = players.filter((player) => !player.is_bot).length;
  if (!eligiblePlayers) {
    dom.gameReadyStatus.innerHTML = "<p class=\"placeholder\">플레이어를 기다리는 중입니다.</p>";
    return;
  }
  const readyPlayers = players.filter(
    (player) => !player.is_bot && player.stage_ready && player.ready_stage === stage
  );
  const readyNames = readyPlayers.map((player) => player.name).join(", ");
  const requiredCount = getReadyVoteRequirement(eligiblePlayers);
  const requirementMet = requiredCount > 0 && readyPlayers.length >= requiredCount;
  const helperTexts = [];
  if (requiredCount > 0) {
    helperTexts.push(
      requirementMet
        ? "필요 투표 수가 충족되어 전환을 준비합니다."
        : `다음 단계로 이동하려면 최소 ${requiredCount}명이 동의해야 합니다.`
    );
  }
  if (readyNames) {
    helperTexts.push(`동의한 플레이어: ${readyNames}`);
  }
  dom.gameReadyStatus.innerHTML = `
    <strong>${stageLabels[stage] || stage}</strong><br>
    ${readyPlayers.length} / ${eligiblePlayers} 명이 '턴 끝내기'에 투표했습니다.
    ${helperTexts.map((text) => `<p class="helper-text">${text}</p>`).join("")}
  `;
}

function isStageReadySkipEligible(stageKey) {
  return isReadyVoteStage(stageKey);
}

async function resetPlayerReadiness(stageKey) {
  if (!state.players?.length) return;
  const targets = state.players.filter((player) => !player.is_bot);
  if (!targets.length) return;
  const now = new Date().toISOString();
  await Promise.allSettled(
    targets.map((player) =>
      api.update("players", player.id, {
        stage_ready: false,
        ready_stage: stageKey,
        last_seen: now
      })
    )
  );
  targets.forEach((player) => {
    player.stage_ready = false;
    player.ready_stage = stageKey;
  });
  renderReadyAggregates(state.players);
}

async function checkAndHandleStageReadyAdvance() {
  if (!state.activeSession) return;
  const stage = state.activeSession.stage;
  if (!isStageReadySkipEligible(stage)) return;
  if (state.stageAutoAdvancing) return;
  const eligiblePlayers = state.players.filter((player) => !player.is_bot);
  if (!eligiblePlayers.length) return;
  const readyPlayers = eligiblePlayers.filter(
    (player) => player.stage_ready && player.ready_stage === stage
  );
  const requiredCount = getReadyVoteRequirement(eligiblePlayers.length);
  if (!requiredCount || readyPlayers.length < requiredCount) {
    return;
  }
  const currentIndex = stageOrder.indexOf(stage);
  if (currentIndex === -1) return;
  const nextStage = stageOrder[currentIndex + 1];
  if (!nextStage) return;

  state.stageAutoAdvancing = true;
  try {
    await transitionToStage(nextStage, { silent: true });
    showToast(
      `턴 끝내기 투표가 충족되어 '${stageLabels[stage] || stage}' 단계를 종료합니다.`,
      "info"
    );
    await loadPlayers();
  } catch (error) {
    console.error("턴 끝내기 투표 처리 중 오류", error);
  } finally {
    state.stageAutoAdvancing = false;
  }
}

function updatePlayerStats() {
  const players = state.players || [];
  const humanCount = players.filter((player) => !player.is_bot).length;
  const botCount = players.filter((player) => player.is_bot).length;
  const totalCount = players.length;
  const range = state.activeScenario?.playerRange;
  if (dom.playerStats) {
    dom.playerStats.innerHTML = `
      <strong>총 ${totalCount}명</strong> · 실제 ${humanCount}명 / 봇 ${botCount}명<br>
      필요 인원: ${formatPlayerRange(range)}
    `;
  }
}

function updateVoteStatus() {
  if (!dom.voteStatus) return;
  if (!state.activeSession || state.activeSession.stage !== "voting") {
    dom.voteStatus.innerHTML = "";
    return;
  }
  const eligible = state.players.filter((player) => !player.is_bot).length;
  const submitted = state.players.filter((player) => player.has_voted).length;
  dom.voteStatus.innerHTML = `<strong>투표 진행 상황</strong><br>${submitted} / ${eligible} 명 투표 완료`;
  
  // 모든 플레이어가 투표를 완료하면 자동으로 결과 단계로 전환
  if (eligible > 0 && submitted >= eligible && !state.autoVoteCompleteTriggered) {
    state.autoVoteCompleteTriggered = true;
    setTimeout(async () => {
      try {
        await transitionToStage("result");
        showToast("모든 투표가 완료되어 결과 단계로 전환되었습니다.", "success");
      } catch (error) {
        console.error("자동 투표 완료 처리 실패:", error);
      } finally {
        state.autoVoteCompleteTriggered = false;
      }
    }, 1500);
  }
}

async function handleResetPlayers() {
  if (!state.activeSession) {
    showToast("세션을 먼저 생성하세요.", "warn");
    return;
  }
  if (!state.players.length) {
    showToast("삭제할 플레이어가 없습니다.", "warn");
    return;
  }
  if (!confirm("모든 플레이어를 초기화하시겠습니까?")) {
    return;
  }

  try {
    await Promise.all(state.players.map((player) => api.remove("players", player.id)));
    const updatedSession = await api.update("sessions", state.sessionRecordId, {
      roles_assigned: false,
      player_count: 0,
      last_activity: new Date().toISOString()
    });
    state.activeSession = {
      ...state.activeSession,
      ...updatedSession
    };
    showToast("플레이어 목록이 초기화되었습니다.", "success");
    state.players = [];
    renderPlayers([]);
    updatePlayerStats();
    updateControlStates();
    updateSessionMeta();
    updateResultBanner();
  } catch (error) {
    console.error(error);
    showToast("플레이어 초기화에 실패했습니다.", "error");
  }
}

function shuffle(array) {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

async function sendBotClueMessages() {
  if (!state.activeSession) return;
  
  const currentStage = state.activeSession.stage;
  // discussion 단계에서만 실행
  if (!currentStage || !currentStage.includes("discussion")) return;
  
  const bots = state.players.filter(p => p.is_bot && p.clue_summary);
  
  for (const bot of bots) {
    try {
      // 봇의 단서 패키지 파싱
      const cluePackage = parseCluePackage(bot.clue_summary);
      if (!cluePackage) continue;
      
      let messagesToSend = [];
      
      // 1. 현재 단계에 맞는 단서 가져오기
      if (cluePackage.rounds && cluePackage.rounds.length > 0) {
        const currentRound = cluePackage.rounds.find(r => r.stage === currentStage);
        if (currentRound) {
          // truths, misdirections, prompts 모두 공유
          if (currentRound.truths && currentRound.truths.length > 0) {
            messagesToSend.push(...currentRound.truths);
          }
          if (currentRound.misdirections && currentRound.misdirections.length > 0) {
            messagesToSend.push(...currentRound.misdirections);
          }
        }
      }
      
      // 2. rounds가 없으면 기본 단서 사용
      if (messagesToSend.length === 0) {
        if (cluePackage.truths && cluePackage.truths.length > 0) {
          messagesToSend.push(...cluePackage.truths.slice(0, 2)); // 처음 2개만
        }
        if (cluePackage.misdirections && cluePackage.misdirections.length > 0) {
          messagesToSend.push(cluePackage.misdirections[0]); // 첫 번째만
        }
      }
      
      // 3. 시각적 증거도 텍스트로 공유
      if (cluePackage.visualEvidence && cluePackage.visualEvidence.length > 0) {
        cluePackage.visualEvidence.forEach(evidence => {
          messagesToSend.push(`[증거: ${evidence.title}] ${evidence.description}`);
        });
      }
      
      // 4. 메시지 전송 (각 메시지를 개별적으로)
      for (const message of messagesToSend) {
        await api.create("chat_messages", {
          session_code: state.activeSession.code,
          player_name: bot.name,
          role: bot.character || bot.role, // 배역 이름 사용
          message: message,
          sent_at: new Date().toISOString()
        });
        
        // 메시지 간 간격 (0.5-1.5초)
        await new Promise(resolve => setTimeout(resolve, 500 + Math.random() * 1000));
      }
      
      // 봇 간 간격 (1-2초)
      await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 1000));
      
    } catch (error) {
      console.error(`봇 ${bot.name} 단서 공유 실패:`, error);
    }
  }
  
  // 채팅 새로고침
  if (state.chatSessionCode) {
    loadChatMessages(state.chatSessionCode);
  }
}

function ensureChatPolling(sessionCode) {
  if (state.chatSessionCode === sessionCode && state.chatInterval) {
    return;
  }
  clearInterval(state.chatInterval);
  state.chatSessionCode = sessionCode;
  if (!sessionCode) return;
  loadChatMessages(sessionCode);
  state.chatInterval = setInterval(() => {
    loadChatMessages(sessionCode);
  }, 3000);
}

async function loadChatMessages(sessionCode) {
  if (!sessionCode) return;
  try {
    const data = await api.list("chat_messages", {
      search: sessionCode,
      limit: "50",
      sort: "sent_at"
    });
    const messages = (data.data || [])
      .filter((item) => !item.deleted && item.session_code === sessionCode)
      .sort((a, b) => new Date(a.sent_at || 0) - new Date(b.sent_at || 0));
    renderChatMessages(messages);
  } catch (error) {
    console.error(error);
  }
}

function renderChatMessages(messages = []) {
  dom.chatLog.innerHTML = "";
  if (!messages.length) {
    const empty = document.createElement("div");
    empty.className = "chat-message";
    empty.innerHTML = "<em>아직 메시지가 없습니다.</em>";
    dom.chatLog.appendChild(empty);
    return;
  }
  messages.forEach((msg) => {
    const item = document.createElement("div");
    item.className = "chat-message";
    const meta = document.createElement("div");
    meta.className = "chat-message__meta";
    const time = new Date(msg.sent_at || Date.now());
    const timeText = time.toLocaleTimeString("ko-KR", {
      hour: "2-digit",
      minute: "2-digit"
    });
    // 배역 이름만 표시 (역할 표시 제거)
    meta.innerHTML = `<span>${msg.role || msg.player_name}</span><span>${timeText}</span>`;

    const text = document.createElement("p");
    text.className = "chat-message__text";
    text.textContent = msg.message;

    item.append(meta, text);
    dom.chatLog.appendChild(item);
  });
  dom.chatLog.scrollTop = dom.chatLog.scrollHeight;
}

async function handleChatSubmit(event) {
  event.preventDefault();
  if (!state.chatIdentity) {
    showToast("먼저 세션에 접속해 주세요.", "warn");
    return;
  }
  const message = dom.chatMessage.value.trim();
  if (!message) return;
  try {
    await api.create("chat_messages", {
      session_code: state.chatIdentity.sessionCode,
      player_name: state.chatIdentity.name,
      role: state.chatIdentity.role,
      message,
      sent_at: new Date().toISOString()
    });
    dom.chatMessage.value = "";
    loadChatMessages(state.chatIdentity.sessionCode);
  } catch (error) {
    console.error(error);
    showToast("메시지를 전송하지 못했습니다.", "error");
  }
}

function copyPlayerLink() {
  if (!navigator.clipboard) {
    showToast("이 브라우저에서는 클립보드 복사가 지원되지 않습니다.", "warn");
    return;
  }
  const base = new URL(window.location.href);
  base.pathname = base.pathname.replace("host.html", "player.html");
  base.search = "";
  if (state.activeSession?.code) {
    base.searchParams.set("session", state.activeSession.code);
  }
  navigator.clipboard
    .writeText(base.toString())
    .then(() => showToast("플레이어 입장 링크가 복사되었습니다.", "success"))
    .catch(() => showToast("링크 복사에 실패했습니다.", "error"));
}

function attachEventListeners() {
  dom.scenarioSelect.addEventListener("change", () => {
    const scenario = getScenarioById(dom.scenarioSelect.value);
    renderScenario(scenario);
  });

  dom.createSessionForm.addEventListener("submit", handleCreateSession);
  if (dom.hostResumeList) {
    dom.hostResumeList.addEventListener("click", handleHostResumeClick);
  }

  if (dom.stageUpdateBtn) {
    dom.stageUpdateBtn.addEventListener("click", handleStageUpdate);
  }
  if (dom.startGameBtn) {
    dom.startGameBtn.addEventListener("click", handleStartGame);
  }
  if (dom.beginVotingBtn) {
    dom.beginVotingBtn.addEventListener("click", handleBeginVoting);
  }
  if (dom.closeVotingBtn) {
    dom.closeVotingBtn.addEventListener("click", handleCloseVoting);
  }
  if (dom.endSessionBtn) {
    dom.endSessionBtn.addEventListener("click", handleEndSession);
  }
  if (dom.addPlayerForm) {
    dom.addPlayerForm.addEventListener("submit", handleAddPlayer);
  }
  if (dom.addBotBtn) {
    dom.addBotBtn.addEventListener("click", handleAddBot);
  }
  if (dom.assignRolesBtn) {
    dom.assignRolesBtn.addEventListener("click", assignRoles);
  }
  if (dom.resetPlayersBtn) {
    dom.resetPlayersBtn.addEventListener("click", handleResetPlayers);
  }

  dom.chatForm.addEventListener("submit", handleChatSubmit);
  if (dom.copyPlayerLink) {
    dom.copyPlayerLink.addEventListener("click", copyPlayerLink);
  }
  if (dom.hostReadyToggleBtn) {
    dom.hostReadyToggleBtn.addEventListener("click", handleHostReadyToggle);
  }
  if (dom.hostVoteForm) {
    dom.hostVoteForm.addEventListener("submit", handleHostVoteSubmit);
  }
  dom.tabButtons.forEach((button) => {
    button.addEventListener("click", () => {
      switchTab(button.dataset.tab);
    });
  });
}

async function initialise() {
  populateScenarioSelect();
  attachEventListeners();
  await refreshHostResumeSessions();
  cloneStageTracker();
  switchTab("progress");
  setView("setup");
  toggleChatAvailability(false);
  if (dom.stageUpdateBtn) {
    dom.stageUpdateBtn.disabled = true;
  }
  if (dom.addBotBtn) {
    dom.addBotBtn.disabled = true;
  }
  if (dom.assignRolesBtn) {
    dom.assignRolesBtn.disabled = true;
  }
  if (dom.resetPlayersBtn) {
    dom.resetPlayersBtn.disabled = true;
  }
  if (dom.startGameBtn) {
    dom.startGameBtn.disabled = true;
  }
  if (dom.beginVotingBtn) {
    dom.beginVotingBtn.disabled = true;
  }
  if (dom.closeVotingBtn) {
    dom.closeVotingBtn.disabled = true;
  }
  if (dom.endSessionBtn) {
    dom.endSessionBtn.disabled = true;
  }
  updateSessionResultDisplay();
  await hydrateRemoteScenarios();
  await refreshHostResumeSessions();
  await resumeHostSessionFromStorage();
  updateHostReadyUI();
  updateHostVoteUI();
}

function toggleChatAvailability(enabled) {
  if (dom.chatMessage) {
    dom.chatMessage.disabled = !enabled;
  }
  if (dom.chatSendBtn) {
    dom.chatSendBtn.disabled = !enabled;
  }
}

document.addEventListener("DOMContentLoaded", initialise);

window.addEventListener("beforeunload", () => {
  clearInterval(state.chatInterval);
  clearInterval(state.playerInterval);
  clearInterval(state.sessionInterval);
  clearInterval(state.stageTimerInterval);
});

// 투표 관련 함수들
function populateHostVoteOptions() {
  if (!dom.hostVoteTarget) return;
  const existingValue = dom.hostVoteTarget.value;
  dom.hostVoteTarget.innerHTML = "<option value=\"\">-- 대상을 선택하세요 --</option>";
  state.players
    .filter((player) => player.id !== state.hostPlayerId)
    .forEach((player) => {
      const option = document.createElement("option");
      option.value = player.id;
      option.textContent = player.name;
      dom.hostVoteTarget.appendChild(option);
    });
  if (existingValue) {
    dom.hostVoteTarget.value = existingValue;
  }
}

function updateHostVoteUI() {
  if (!dom.hostVoteForm || !state.activeSession) return;
  const isVoting = state.activeSession.stage === "voting";
  populateHostVoteOptions();
  dom.hostVoteTarget.disabled = !isVoting || (state.hostPlayer && state.hostPlayer.has_voted);
  dom.hostVoteForm.querySelector("button[type='submit']").disabled =
    !isVoting || (state.hostPlayer && state.hostPlayer.has_voted) || state.voteInFlight || !state.hostPlayerId;

  if (!isVoting) {
    if (dom.hostVoteHelper) dom.hostVoteHelper.textContent = "투표가 시작되면 선택지가 활성화됩니다.";
    if (state.activeSession.stage === "result") {
      renderHostVoteOutcome(state.activeSession);
    }
    return;
  }

  updateHostVoteStatusBanner();

  if (state.hostPlayer && state.hostPlayer.has_voted) {
    const targetName = getPlayerNameById(state.hostPlayer.vote_target);
    if (dom.hostVoteHelper) dom.hostVoteHelper.textContent = targetName
      ? `이미 '${targetName}'에게 투표했습니다. 결과 발표를 기다려 주세요.`
      : "이미 투표를 제출했습니다.";
  } else {
    if (dom.hostVoteHelper) dom.hostVoteHelper.textContent = "범인이라고 생각하는 인물을 선택해 투표하세요.";
  }
}

function updateHostVoteStatusBanner() {
  if (!dom.hostVoteStatus) return;
  if (!state.activeSession || state.activeSession.stage !== "voting") {
    if (dom.hostVoteStatus) dom.hostVoteStatus.innerHTML = "";
    return;
  }
  const eligible = state.players.filter((player) => !player.is_bot).length;
  const submitted = state.players.filter((player) => player.has_voted).length;
  if (dom.hostVoteStatus) dom.hostVoteStatus.innerHTML = `<strong>투표 진행 상황</strong><br>${submitted} / ${eligible} 명 투표 완료`;
}

function renderHostVoteOutcome(session) {
  if (!dom.hostVoteStatus || !session) return;
  if (session.stage !== "result") {
    return;
  }
  let tallyHtml = "";
  let winningSide = session.winning_side;
  if (session.vote_summary) {
    try {
      const summary = JSON.parse(session.vote_summary);
      if (summary?.tallies) {
        tallyHtml = Object.entries(summary.tallies)
          .map(([name, count]) => `<span><span>${name}</span><span>${count}표</span></span>`)
          .join("");
        tallyHtml = `<div class="vote-result__tally">${tallyHtml}</div>`;
        // 승패 결정: 기권한 사람(투표하지 않은 사람)의 표를 제외하고 다수결로 결정
        if (!winningSide) {
          const entries = Object.entries(summary.tallies);
          if (entries.length > 0) {
            const [votedName] = entries.reduce((max, curr) => curr[1] > max[1] ? curr : max);
            const culprit = state.players.find(p => p.role === "범인");
            if (culprit && votedName === culprit.name) {
              winningSide = "citizens";
            } else {
              winningSide = "culprit";
            }
          }
        }
      } else if (typeof session.vote_summary === "string") {
        tallyHtml = `<p>${session.vote_summary}</p>`;
      }
    } catch (error) {
      tallyHtml = `<p>${session.vote_summary}</p>`;
    }
  }

  const headline =
    winningSide === "citizens"
      ? "시민 팀 승리!"
      : winningSide === "culprit"
        ? "범인 승리!"
        : "결과 발표";

  if (dom.hostVoteStatus) dom.hostVoteStatus.innerHTML = `
    <div class="vote-result__headline">${headline}</div>
    ${tallyHtml}
  `;
  if (dom.hostVoteHelper) dom.hostVoteHelper.textContent = "결과가 발표되었습니다.";
  if (dom.hostVoteTarget) dom.hostVoteTarget.disabled = true;
  const submitBtn = dom.hostVoteForm ? dom.hostVoteForm.querySelector("button[type='submit']") : null;
  if (submitBtn) submitBtn.disabled = true;
}

async function handleHostVoteSubmit(event) {
  event.preventDefault();
  if (!state.activeSession || state.activeSession.stage !== "voting") {
    showToast("투표 가능한 시간이 아닙니다.", "warn");
    return;
  }
  if (!state.hostPlayer || state.hostPlayer.has_voted) {
    showToast("이미 투표를 완료했습니다.", "info");
    return;
  }
  const targetId = dom.hostVoteTarget.value;
  if (!targetId) {
    showToast("투표할 대상을 선택하세요.", "warn");
    return;
  }

  state.voteInFlight = true;
  const submitBtn = dom.hostVoteForm ? dom.hostVoteForm.querySelector("button[type='submit']") : null;
  if (submitBtn) submitBtn.disabled = true;
  try {
    await api.update("players", state.hostPlayerId, {
      has_voted: true,
      vote_target: targetId,
      last_seen: new Date().toISOString()
    });
    state.hostPlayer.has_voted = true;
    state.hostPlayer.vote_target = targetId;
    showToast("투표가 제출되었습니다. 결과를 기다려 주세요.", "success");
    updateHostVoteUI();
    await loadPlayers();
  } catch (error) {
    console.error(error);
    showToast("투표를 제출하지 못했습니다.", "error");
    if (submitBtn) submitBtn.disabled = false;
  } finally {
    state.voteInFlight = false;
  }
}

function getPlayerNameById(playerId) {
  const player = state.players.find(p => p.id === playerId);
  return player ? player.name : null;
}
