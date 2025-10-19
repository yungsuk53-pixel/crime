import { api } from "./api.js";
import {
  getScenarioById,
  stageLabels,
  formatPlayerRange,
  stageOrder,
  readyEligibleStages as readyStageKeys,
  getReadyVoteRequirement,
  registerScenarios
} from "./data.js";
import { fetchRemoteScenarios } from "./firebase.js";

const LOCAL_STORAGE_KEY = "crimeScenePlayerSession";
const PLAYER_RECENTS_STORAGE_KEY = "crimeScenePlayerRecentSessions";

const state = {
  session: null,
  sessionCode: null,
  player: null,
  playerRecordId: null,
  chatInterval: null,
  sessionInterval: null,
  playerInterval: null,
  rosterInterval: null,
  heartbeatInterval: null,
  countdownInterval: null,
  chatIdentity: null,
  lastRoleNotified: null,
  roster: [],
  lastRosterHash: null,
  voteInFlight: false,
  autoJoinAttempted: false,
  readyInFlight: false,
  activeView: "join",
  activeTab: "lobby",
  activeScenario: null,
  personalProfile: null
};

const dom = {
  joinView: document.getElementById("joinView"),
  playerAppView: document.getElementById("playerAppView"),
  playerAccessForm: document.getElementById("playerAccessForm"),
  accessSessionCode: document.getElementById("accessSessionCode"),
  accessPlayerName: document.getElementById("accessPlayerName"),
  roleView: document.getElementById("roleView"),
  stageTracker: document.getElementById("playerStageTracker"),
  playerStageBadge: document.getElementById("playerStageBadge"),
  readyStatus: document.getElementById("readyStatus"),
  readyToggleBtn: document.getElementById("readyToggleBtn"),
  sessionMeta: document.getElementById("playerSessionMeta"),
  scenarioTitle: document.getElementById("playerScenarioTitle"),
  scenarioTagline: document.getElementById("playerScenarioTagline"),
  scenarioSummary: document.getElementById("playerScenarioSummary"),
  scenarioConflicts: document.getElementById("playerScenarioConflicts"),
  scenarioPrompts: document.getElementById("playerScenarioPrompts"),
  scenarioTimeline: document.getElementById("playerScenarioTimeline"),
  evidencePhysical: document.getElementById("playerEvidencePhysical"),
  evidenceDigital: document.getElementById("playerEvidenceDigital"),
  lobbyStatus: document.getElementById("lobbyStatus"),
  playerRoster: document.getElementById("playerRoster"),
  chatLog: document.getElementById("playerChatLog"),
  chatForm: document.getElementById("playerChatForm"),
  chatMessage: document.getElementById("playerChatMessage"),
  chatSendBtn: document.querySelector("#playerChatForm button[type='submit']"),
  voteForm: document.getElementById("voteForm"),
  voteTarget: document.getElementById("voteTarget"),
  voteSubmit: document.querySelector("#voteForm button[type='submit']"),
  voteHelper: document.getElementById("voteHelper"),
  playerVoteStatus: document.getElementById("playerVoteStatus"),
  profileNotice: document.getElementById("profileNotice"),
  profileTimeline: document.getElementById("profileTimeline"),
  profileEvidence: document.getElementById("profileEvidence"),
  profileAlibis: document.getElementById("profileAlibis"),
  recentSessionsSection: document.getElementById("recentSessionsSection"),
  recentSessionsList: document.getElementById("recentSessionsList"),
  tabButtons: document.querySelectorAll("#playerAppView .tab-nav__btn"),
  tabPanels: document.querySelectorAll("#playerAppView .tab-panel"),
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

function renderRoster(roster = []) {
  if (!dom.playerRoster) {
    console.error('[Roster] playerRoster DOM 요소를 찾을 수 없습니다');
    return;
  }
  
  dom.playerRoster.innerHTML = "";
  roster = roster || [];
  
  if (!roster.length) {
    const placeholder = document.createElement("p");
    placeholder.className = "placeholder";
    placeholder.textContent = "아직 참가자가 없습니다.";
    dom.playerRoster.appendChild(placeholder);
    return;
  }

  const list = document.createElement("ul");
  list.className = "player-list";

  roster
    .slice()
    .sort((a, b) => {
      if (a.is_host && !b.is_host) return -1;
      if (!a.is_host && b.is_host) return 1;
      if (a.is_bot !== b.is_bot) return Number(a.is_bot) - Number(b.is_bot);
      return a.name.localeCompare(b.name, "ko-KR");
    })
    .forEach((player) => {
      const item = document.createElement("li");
      item.className = "player-list__item";
      if (player.is_host) {
        item.classList.add("player-list__item--host");
      }
      if (player.is_bot) {
        item.classList.add("player-list__item--bot");
      }

      const nameSpan = document.createElement("span");
      nameSpan.className = "player-list__name";
      // 역할이 있으면 "이름(역할)" 형식으로 표시
      if (player.role && !player.is_host && !player.is_bot) {
        nameSpan.textContent = `${player.name}(${player.role})`;
      } else {
        nameSpan.textContent = player.name;
      }

      const roleSpan = document.createElement("span");
      roleSpan.className = "player-list__role";
      roleSpan.textContent = player.is_host ? "호스트" : player.is_bot ? "봇" : "참가자";

      item.append(nameSpan, roleSpan);
      list.appendChild(item);
    });

  dom.playerRoster.appendChild(list);
}

function renderTimeline(element, entries = []) {
  if (!element) return;
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

function parseCluePackage(raw) {
  if (!raw) return null;
  try {
    return typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch (error) {
    console.warn("clue parsing failed", error);
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

  // 시간별 타임라인 추가
  const timeBasedTimeline = scenario.timeline || [];

  const evidenceEntries = [];
  const addEvidenceEntry = (display, detail, time = null, visualElements = []) => {
    if (!display) return;
    if (evidenceEntries.some((entry) => entry.display === display)) return;
    evidenceEntries.push({ display, detail, time, visualElements, alibis: [] });
  };

  const tokens = new Set();
  if (personaName) tokens.add(personaName.toLowerCase());
  if (personaTitle) tokens.add(personaTitle.toLowerCase());
  if (player.name) tokens.add(player.name.toLowerCase());

  const matchesTarget = (text = "") => {
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
    if (matchesTarget(item.display || item)) {
      const display = item.display || item;
      const time = item.time || null;
      const visualElements = item.visualElements || [];
      addEvidenceEntry(display, item.detail || item, time, visualElements);
    }
  });

  const evidence = evidenceEntries.map((entry) => entry.display);

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
    // evidence에 연결되지 않은 alibi는 별도 처리
  }

  const profile = {
    personaName,
    personaTitle,
    timeline,
    timeBasedTimeline,
    evidence: evidenceEntries,
    alibis: Array.from(alibiSet)
  };

  state.personalProfile = profile;
  return profile;
}

function renderPersonalProfile(profile) {
  if (dom.profileNotice) {
    dom.profileNotice.textContent = profile
      ? `${profile.personaTitle ? `${profile.personaTitle} · ` : ""}${profile.personaName} 시점에서 정리된 개인 정보입니다.`
      : "역할이 확정되면 개인 정보가 표시됩니다.";
  }
  renderTimeline(dom.profileTimeline, profile?.timeBasedTimeline || []);
  renderEvidenceWithAlibis(dom.profileEvidence, profile?.evidence || []);
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

function setView(viewKey) {
  const viewMap = {
    join: dom.joinView,
    app: dom.playerAppView
  };
  Object.values(viewMap).forEach((element) => {
    if (element) {
      element.classList.remove("app-view--active");
    }
  });
  const target = viewMap[viewKey] || null;
  if (target) {
    target.classList.add("app-view--active");
  }
  state.activeView = viewKey;
}

function switchTab(tabKey) {
  state.activeTab = tabKey;
  dom.tabButtons.forEach((button) => {
    const isActive = button.dataset.tab === tabKey;
    button.classList.toggle("tab-nav__btn--active", isActive);
    button.setAttribute("aria-selected", isActive ? "true" : "false");
    button.setAttribute("tabindex", isActive ? "0" : "-1");
  });
  dom.tabPanels.forEach((panel) => {
    const isActive = panel.dataset.tab === tabKey;
    panel.classList.toggle("tab-panel--active", isActive);
    panel.setAttribute("aria-hidden", isActive ? "false" : "true");
  });
}

function updateStageBadge(stageKey) {
  if (!dom.playerStageBadge) return;
  dom.playerStageBadge.textContent = stageLabels[stageKey] || "-";
  dom.playerStageBadge.dataset.stage = stageKey || "";
}

function getUnlockedRounds(cluePackage) {
  if (!cluePackage?.rounds || !cluePackage.rounds.length) return [];
  if (cluePackage.type === "culprit") {
    return cluePackage.rounds;
  }
  const currentStage = state.session?.stage || "lobby";
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

const readyEligibleStageSet = new Set(readyStageKeys);

function isReadyStage(stageKey) {
  return readyEligibleStageSet.has(stageKey);
}

function updateReadyUI() {
  if (!dom.readyStatus || !dom.readyToggleBtn) return;
  dom.readyStatus.removeAttribute("title");
  if (!state.session || !state.player) {
    dom.readyStatus.textContent = "투표 대기";
    dom.readyStatus.dataset.state = "idle";
    dom.readyToggleBtn.disabled = true;
    dom.readyToggleBtn.textContent = "턴 끝내기";
    return;
  }
  const stage = state.session.stage;
  const readyEligible = isReadyStage(stage);
  if (!readyEligible) {
    const label = stage === "lobby" ? "대기 중" : "투표 불가";
    dom.readyStatus.textContent = label;
    dom.readyStatus.dataset.state = "disabled";
    dom.readyToggleBtn.disabled = true;
    dom.readyToggleBtn.textContent = "턴 끝내기";
    return;
  }
  const isReady = Boolean(state.player.stage_ready && state.player.ready_stage === stage);
  const roster = state.roster || [];
  const eligiblePlayers = roster.filter((player) => !player.is_bot).length;
  const readyPlayers = roster.filter(
    (player) => !player.is_bot && player.stage_ready && player.ready_stage === stage
  ).length;
  const requiredCount = getReadyVoteRequirement(eligiblePlayers);
  const progressText = eligiblePlayers > 0 ? `${readyPlayers} / ${eligiblePlayers}` : "0 / 0";
  if (requiredCount > 0) {
    dom.readyStatus.title = `최소 ${requiredCount}명이 동의하면 다음 단계로 이동합니다.`;
  }
  dom.readyStatus.textContent = isReady
    ? `투표 완료 (${progressText})`
    : `투표 대기 (${progressText})`;
  dom.readyStatus.dataset.state = isReady ? "ready" : "waiting";
  dom.readyToggleBtn.disabled = state.readyInFlight;
  dom.readyToggleBtn.textContent = isReady ? "투표 취소" : "턴 끝내기";
}

async function handleReadyToggle() {
  if (!state.session || !state.player || !state.playerRecordId) {
    showToast("세션에 먼저 접속해 주세요.", "warn");
    return;
  }
  const stage = state.session.stage;
  if (!isReadyStage(stage)) {
    showToast("현재 단계에서는 턴 끝내기 투표를 할 수 없습니다.", "info");
    return;
  }
  if (state.readyInFlight) return;
  const shouldMarkReady = !(state.player.stage_ready && state.player.ready_stage === stage);
  state.readyInFlight = true;
  updateReadyUI();
  try {
    const updated = await api.update("players", state.playerRecordId, {
      stage_ready: shouldMarkReady,
      ready_stage: stage,
      last_seen: new Date().toISOString()
    });
    state.player = {
      ...state.player,
      ...updated
    };
    updateReadyUI();
    await loadRoster();
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
    updateReadyUI();
  }
}

async function handleRecentSessionClick(event) {
  const button = event.target.closest("button[data-resume-session]");
  if (!button) return;
  const sessionCode = button.dataset.resumeSession;
  const playerName = button.dataset.resumePlayer;
  if (!sessionCode || !playerName) return;

  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = "재접속 중...";
  try {
    const joined = await joinSessionWithCredentials({
      sessionCode,
      playerName,
      allowCreate: false,
      silent: true
    });
    if (joined) {
      showToast(`${playerName} 이름으로 세션에 재접속했습니다.`, "success");
    } else {
      showToast("세션에 재접속하지 못했습니다. 진행 중인지 확인해 주세요.", "warn");
      button.disabled = false;
      button.textContent = originalText;
    }
  } catch (error) {
    console.error("resume join failed", error);
    showToast("세션에 재접속하지 못했습니다.", "error");
    button.disabled = false;
    button.textContent = originalText;
  } finally {
    await refreshRecentPlayerSessions();
  }
}

function renderRoleView(player) {
  const container = dom.roleView;
  if (!container) return;
  container.innerHTML = "";

  if (!player || !state.session) {
    const placeholder = document.createElement("p");
    placeholder.className = "placeholder";
    placeholder.textContent = "세션에 접속하고 PIN을 입력하면 개인 단서가 표시됩니다.";
    container.appendChild(placeholder);
    state.personalProfile = null;
    renderPersonalProfile(null);
    return;
  }

  const stage = state.session.stage;
  if (
    !player.role ||
    player.role === "미배정" ||
    !player.clue_summary ||
    stage === "lobby"
  ) {
    const placeholder = document.createElement("p");
    placeholder.className = "placeholder";
    placeholder.textContent =
      stage === "lobby"
        ? "게임이 시작되면 역할과 단서가 공개됩니다."
        : "역할 배정을 기다리는 중입니다.";
    container.appendChild(placeholder);
    state.personalProfile = null;
    renderPersonalProfile(null);
    return;
  }

  const cluePackage = parseCluePackage(player.clue_summary);
  if (!cluePackage) {
    const placeholder = document.createElement("p");
    placeholder.className = "placeholder";
    placeholder.textContent = "개인 단서를 불러오지 못했습니다.";
    container.appendChild(placeholder);
    state.personalProfile = null;
    renderPersonalProfile(null);
    return;
  }
  const header = document.createElement("div");
  header.className = "role-view__header";

  const badge = document.createElement("span");
  badge.className = getRoleBadgeClass(player.role);
  badge.textContent = player.role || "미배정";

  const title = document.createElement("p");
  title.className = "role-view__title";
  const personaName = cluePackage?.persona?.name
    ? `${cluePackage.persona.name} · ${cluePackage.persona.title || ""}`.trim()
    : player.character;
  title.textContent = personaName || player.character || "배정 대기";

  const subtitle = document.createElement("p");
  subtitle.className = "role-view__subtitle";
  subtitle.textContent = `${player.name}${player.is_host ? " (호스트)" : ""}`;

  header.append(badge, title);
  if (subtitle.textContent) {
    header.appendChild(subtitle);
  }
  container.appendChild(header);

  const briefingBlock = document.createElement("div");
  briefingBlock.className = "role-view__section";
  const briefingTitle = document.createElement("h4");
  briefingTitle.textContent = "역할 브리핑";
  const briefingText = document.createElement("p");
  briefingText.textContent =
    cluePackage?.briefing || player.role_briefing || "브리핑 정보가 없습니다.";
  briefingBlock.append(briefingTitle, briefingText);
  container.appendChild(briefingBlock);

  if (!cluePackage) {
    const empty = document.createElement("p");
    empty.className = "placeholder";
    empty.textContent = "현재 제공 가능한 단서가 없습니다.";
    container.appendChild(empty);
    return;
  }

  const unlockedRounds = getUnlockedRounds(cluePackage);
  const totalRounds = cluePackage.rounds || [];
  const currentStageIndex = stageOrder.indexOf(stage);
  const lockedRounds = totalRounds.filter((round) => {
    if (!round.stage) return false;
    const roundIndex = stageOrder.indexOf(round.stage);
    if (cluePackage.type === "culprit") return false;
    return roundIndex !== -1 && (currentStageIndex === -1 || roundIndex > currentStageIndex);
  });

  if (unlockedRounds.length) {
    unlockedRounds.forEach((round, index) => {
      const section = document.createElement("div");
      section.className = "role-view__section";
      const heading = document.createElement("h4");
      const stageLabel = round.stage ? stageLabels[round.stage] || round.stage : null;
      const labelText = round.label || `${index + 1}차 단서`;
      heading.textContent = stageLabel ? `${labelText} · ${stageLabel}` : labelText;
      section.appendChild(heading);

      if (round.truths?.length) {
        section.appendChild(createClueList(round.truths, "clue-list--truths"));
      }
      if (round.misdirections?.length) {
        section.appendChild(
          createClueList(round.misdirections, "clue-list--misdirections")
        );
      }
      if (round.prompts?.length) {
        section.appendChild(createClueList(round.prompts, "clue-list--prompts"));
      }
      container.appendChild(section);
    });
  } else {
    if (cluePackage.truths?.length) {
      appendClueSection(
        container,
        "결정적 단서",
        createClueList(cluePackage.truths, "clue-list--truths")
      );
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

  if (lockedRounds.length) {
    const notice = document.createElement("p");
    notice.className = "helper-text";
    notice.textContent = "추가 단서는 다음 단계에서 순차적으로 공개됩니다.";
    container.appendChild(notice);
  }

  if (cluePackage.master) {
    const masterSection = document.createElement("div");
    masterSection.className = "role-view__section role-view__section--master";
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
  renderPersonalProfile(profile);
}

function updateStageTracker(stageKey) {
  const items = dom.stageTracker?.querySelectorAll(".stage-tracker__item") || [];
  items.forEach((item) => {
    item.classList.toggle("stage-tracker__item--active", item.dataset.stage === stageKey);
  });
  updateStageBadge(stageKey);
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

function formatCountdown(diffMs) {
  const totalSeconds = Math.max(0, Math.floor(diffMs / 1000));
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function buildStageHint(session) {
  switch (session.stage) {
    case "lobby":
      return "호스트가 최소 인원을 확보하면 게임이 시작됩니다.";
    case "briefing":
      return "역할 브리핑을 확인하고 핵심 갈등을 정리하세요.";
    case "clue_a":
      return "첫 번째 단서가 공개되었습니다. 중요한 사실을 팀과 공유하세요.";
    case "discussion_a":
      return "1차 토론입니다. 단서를 근거로 서로의 진술을 검증해 보세요.";
    case "clue_b":
      return "두 번째 단서가 열렸습니다. 새 정보와 모순점을 찾아보세요.";
    case "discussion_b":
      return "2차 토론입니다. 용의자 범위를 좁히고 가설을 정리하세요.";
    case "clue_c":
      return "세 번째 단서가 공개되었습니다. 결정적인 증거를 확보하세요.";
    case "final_discussion":
      return "최종 토론 단계입니다. 최종 결론을 정리하고 투표를 준비하세요.";
    case "voting":
      return "범인이라고 생각하는 인물을 선택해 투표하세요.";
    case "result":
      return "결과가 발표되었습니다. 승패와 득표를 확인하세요.";
    case "closed":
      return "세션이 종료되었습니다.";
    default:
      return "진행 상황을 주시하세요.";
  }
}

function updateCountdown(deadlineIso) {
  clearInterval(state.countdownInterval);
  const row = document.getElementById("playerCountdownRow");
  const valueEl = document.getElementById("playerCountdownValue");
  if (!row || !valueEl) return;
  if (!deadlineIso) {
    row.style.display = "none";
    return;
  }
  row.style.display = "flex";
  const tick = () => {
    const diff = new Date(deadlineIso).getTime() - Date.now();
    if (diff <= 0) {
      valueEl.textContent = "전환 준비 중";
      clearInterval(state.countdownInterval);
      return;
    }
    valueEl.textContent = `${formatCountdown(diff)} 남음`;
  };
  tick();
  state.countdownInterval = setInterval(tick, 1000);
}

function renderLobbyStatus(session, player) {
  if (!dom.lobbyStatus) return;
  if (!session) {
    dom.lobbyStatus.innerHTML = "<p class=\"placeholder\">세션에 접속하면 현재 진행 상황이 표시됩니다.</p>";
    return;
  }
  const stageLabel = stageLabels[session.stage] || session.stage || "-";
  const statusText = formatStatusText(session.status);
  const roleText = player?.role || "미배정";
  const deadline = session.stage_deadline_at;

  dom.lobbyStatus.innerHTML = `
    <div class="lobby-status__row"><span class="lobby-status__label">세션</span><span class="lobby-status__value">${session.code || "-"}</span></div>
    <div class="lobby-status__row"><span class="lobby-status__label">현재 단계</span><span class="lobby-status__value">${stageLabel}</span></div>
    <div class="lobby-status__row"><span class="lobby-status__label">세션 상태</span><span class="lobby-status__value">${statusText}</span></div>
    <div class="lobby-status__row" id="playerCountdownRow" style="${deadline ? "" : "display:none"}">
      <span class="lobby-status__label">잔여 시간</span>
      <span class="lobby-status__value" id="playerCountdownValue">${deadline ? "--:--" : "수동 진행"}</span>
    </div>
    <div class="lobby-status__row"><span class="lobby-status__label">내 역할</span><span class="lobby-status__value">${roleText}</span></div>
    <p class="lobby-status__hint">${buildStageHint(session)}</p>
  `;

  if (deadline && session.auto_stage_enabled) {
    updateCountdown(deadline);
  } else {
    clearInterval(state.countdownInterval);
  }
}

function renderSessionMeta(session, scenario) {
  if (!dom.sessionMeta || !session) return;
  const rangeText = scenario?.playerRange ? formatPlayerRange(scenario.playerRange) : "-";
  const stageLabel = stageLabels[session.stage] || session.stage || "-";
  const statusText = formatStatusText(session.status);
  let autoMeta = "수동 진행";
  if (session.auto_stage_enabled && session.stage_deadline_at) {
    const diff = new Date(session.stage_deadline_at).getTime() - Date.now();
    autoMeta = diff > 0 ? `${formatCountdown(diff)} 남음` : "전환 준비 중";
  } else if (session.stage === "lobby") {
    autoMeta = "호스트 대기";
  }
  dom.sessionMeta.innerHTML = `
    <div><strong>세션 코드</strong> · ${session.code || "-"}</div>
    <div><strong>현재 단계</strong> · ${stageLabel}</div>
    <div><strong>세션 상태</strong> · ${statusText}</div>
    <div><strong>자동 진행</strong> · ${autoMeta}</div>
    <div><strong>필요 인원</strong> · ${rangeText}</div>
    <div><strong>선택 사건</strong> · ${scenario?.title || "-"}</div>
  `;
}

function renderScenario(scenario) {
  if (!scenario) return;
  dom.scenarioTitle.textContent = scenario.title;
  dom.scenarioTagline.textContent = scenario.tagline;
  dom.scenarioSummary.textContent = scenario.summary;
  renderList(dom.scenarioConflicts, scenario.conflicts);
  renderList(dom.scenarioPrompts, scenario.prompts);
  renderTimeline(dom.scenarioTimeline, scenario.timeline);
  renderList(dom.evidencePhysical, scenario.evidence.physical);
  renderList(dom.evidenceDigital, scenario.evidence.digital);
  renderVisualEvidence(dom.evidencePhysical, scenario.evidence.visual);
}

function toggleChatAvailability(enabled) {
  dom.chatMessage.disabled = !enabled;
  dom.chatSendBtn.disabled = !enabled;
  if (!enabled) {
    dom.chatMessage.value = "";
  }
}

function loadStoredCredentials() {
  try {
    const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch (error) {
    console.warn("저장된 세션 정보를 불러오지 못했습니다.", error);
    return null;
  }
}

function persistSessionCredentials(sessionCode, playerName) {
  try {
    localStorage.setItem(
      LOCAL_STORAGE_KEY,
      JSON.stringify({ sessionCode, playerName })
    );
  } catch (error) {
    console.warn("세션 정보를 저장하지 못했습니다.", error);
  }
}

function loadRecentPlayerSessions() {
  try {
    const raw = localStorage.getItem(PLAYER_RECENTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry) => {
        if (!entry || typeof entry !== "object") return null;
        const sessionCode = (entry.sessionCode || "").toUpperCase();
        const playerName = typeof entry.playerName === "string" ? entry.playerName.trim() : "";
        if (!sessionCode || !playerName) return null;
        return {
          sessionCode,
          playerName,
          scenarioId: entry.scenarioId || null,
          updatedAt: entry.updatedAt || entry.joinedAt || null
        };
      })
      .filter(Boolean);
  } catch (error) {
    console.warn("최근 세션 목록을 불러오지 못했습니다.", error);
    return [];
  }
}

function saveRecentPlayerSessions(entries) {
  try {
    localStorage.setItem(PLAYER_RECENTS_STORAGE_KEY, JSON.stringify(entries));
  } catch (error) {
    console.warn("최근 세션 정보를 저장하지 못했습니다.", error);
  }
}

function rememberRecentPlayerSession(session, playerName) {
  if (!session?.code || !playerName) return;
  const sessionCode = session.code.toUpperCase();
  const displayName = playerName.trim();
  if (!sessionCode || !displayName) return;
  const existing = loadRecentPlayerSessions();
  const filtered = existing.filter(
    (entry) => !(entry.sessionCode === sessionCode && entry.playerName === displayName)
  );
  const updated = [
    {
      sessionCode,
      playerName: displayName,
      scenarioId: session.scenario_id || null,
      updatedAt: new Date().toISOString()
    },
    ...filtered
  ];
  saveRecentPlayerSessions(updated.slice(0, 6));
}

async function refreshRecentPlayerSessions() {
  if (!dom.recentSessionsSection || !dom.recentSessionsList) return;
  const stored = loadRecentPlayerSessions();
  if (!stored.length) {
    dom.recentSessionsSection.hidden = true;
    dom.recentSessionsList.innerHTML = "";
    return;
  }

  dom.recentSessionsSection.hidden = false;
  dom.recentSessionsList.innerHTML = "";

  const uniqueCodes = Array.from(
    new Set(stored.map((entry) => entry.sessionCode).filter(Boolean))
  );

  const codeResults = await Promise.all(
    uniqueCodes.map(async (code) => {
      try {
        const session = await findSessionByCode(code);
        return [code, session];
      } catch (error) {
        console.warn("세션 정보를 확인하지 못했습니다.", error);
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
      playerName: entry.playerName,
      scenarioId: session.scenario_id || entry.scenarioId || null,
      updatedAt: entry.updatedAt || new Date().toISOString()
    });
  });

  saveRecentPlayerSessions(validEntries);

  if (!activeEntries.length) {
    dom.recentSessionsList.innerHTML = "";
    dom.recentSessionsSection.hidden = true;
    return;
  }

  const fragment = document.createDocumentFragment();
  activeEntries.forEach(({ entry, session }) => {
    const scenario = getScenarioById(session.scenario_id);
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
    const identity = document.createElement("span");
    identity.textContent = `${entry.playerName}로 참여 중 · ${statusText}`;
    meta.append(title, line, identity);

    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn btn--primary";
    button.dataset.resumeSession = entry.sessionCode;
    button.dataset.resumePlayer = entry.playerName;
    button.textContent = "재접속";

    item.append(meta, button);
    fragment.appendChild(item);
  });

  dom.recentSessionsList.appendChild(fragment);
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

async function fetchPlayerRecord(sessionCode, playerName) {
  try {
    const data = await api.list("players", { search: sessionCode, limit: "100" });
    if (!data || !data.data) {
      console.warn('플레이어 데이터가 비어있습니다');
      return null;
    }
    const players = data.data.filter(
      (item) => item && !item.deleted && item.session_code === sessionCode && !item.is_bot
    );
    return players.find((player) => player && player.name === playerName) || null;
  } catch (error) {
    console.error(error);
    return null;
  }
}

async function createPlayerRecord(session, playerName) {
  const now = new Date().toISOString();
  const payload = {
    session_code: session.code,
    name: playerName,
    pin: "",
    role: "미배정",
    character: "-",
    clue_summary: "",
    role_briefing: "",
    status: session.status === "lobby" ? "waiting" : "active",
    is_host: false,
    is_bot: false,
    last_seen: now,
    vote_target: "",
    has_voted: false,
    stage_ready: false,
    ready_stage: session.stage
  };
  try {
    return await api.create("players", payload);
  } catch (error) {
    console.error(error);
    showToast("새 플레이어를 등록하지 못했습니다.", "error");
    return null;
  }
}

async function joinSessionWithCredentials({
  sessionCode,
  playerName,
  allowCreate = true,
  silent = false
}) {
  const upperCode = sessionCode.toUpperCase();
  const session = await findSessionByCode(upperCode);
  if (!session) {
    if (!silent) {
      showToast("일치하는 세션을 찾을 수 없습니다.", "error");
    }
    return false;
  }

  let player = await fetchPlayerRecord(upperCode, playerName);

  if (!player && !allowCreate) {
    return false;
  }

  if (!player) {
    if (session.status === "result" || session.status === "closed") {
      showToast("이미 종료된 세션입니다. 새로운 참가자를 등록할 수 없습니다.", "warn");
      return false;
    }
    player = await createPlayerRecord(session, playerName);
    if (!player) {
      return false;
    }
    if (!silent) {
      showToast(`${playerName}님이 세션에 등록되었습니다.`, "success");
    }
  } else if (!silent) {
    showToast(`${playerName}님이 세션에 재접속했습니다.`, "success");
  }

  onJoinSuccess(session, player);
  return true;
}

function onJoinSuccess(session, player) {
  state.session = session;
  state.sessionCode = session.code;
  state.player = player;
  state.playerRecordId = player.id;

  setView("app");
  switchTab("lobby");

  const scenario = getScenarioById(session.scenario_id);
  state.activeScenario = scenario || null;
  renderScenario(scenario);
  renderRoleView(player);
  renderSessionMeta(session, scenario);
  renderLobbyStatus(session, player);
  updateStageTracker(session.stage);
  updateVoteUI();
  updateReadyUI();

  toggleChatAvailability(true);
  persistSessionCredentials(session.code, player.name);
  rememberRecentPlayerSession(session, player.name);
  state.chatIdentity = {
    name: player.name,
    role: player.role || "플레이어",
    sessionCode: session.code
  };

  stopPolling();
  startPolling();
  loadChatMessages(session.code);
  loadRoster();
  sendHeartbeat();
  dom.chatMessage.focus();
  refreshRecentPlayerSessions();
}

function stopPolling() {
  clearInterval(state.chatInterval);
  clearInterval(state.sessionInterval);
  clearInterval(state.playerInterval);
  clearInterval(state.rosterInterval);
  clearInterval(state.heartbeatInterval);
  clearInterval(state.countdownInterval);
}

function startPolling() {
  if (!state.sessionCode || !state.playerRecordId) {
    return;
  }

  state.chatInterval = setInterval(() => {
    loadChatMessages(state.sessionCode);
  }, 3000);

  state.sessionInterval = setInterval(() => {
    refreshSessionState();
  }, 4000);

  state.playerInterval = setInterval(() => {
    refreshPlayerState();
  }, 4000);

  state.rosterInterval = setInterval(() => {
    loadRoster();
  }, 6000);

  state.heartbeatInterval = setInterval(() => {
    sendHeartbeat();
  }, 20000);

  // 즉시 첫 로드 실행
  refreshSessionState();
  refreshPlayerState();
  loadRoster();
}

async function refreshSessionState() {
  if (!state.sessionCode) return;
  const latest = await findSessionByCode(state.sessionCode);
  if (!latest) {
    return;
  }
  
  const stageChanged = state.session?.stage !== latest.stage;
  const deadlineChanged = state.session?.stage_deadline_at !== latest.stage_deadline_at;
  
  // 기존 세션 데이터와 병합
  state.session = {
    ...state.session,
    ...latest
  };

  const scenario = getScenarioById(latest.scenario_id);
  const previousScenarioId = state.activeScenario?.id;
  state.activeScenario = scenario || state.activeScenario;
  
  if (scenario && previousScenarioId !== scenario.id) {
    renderScenario(scenario);
    if (state.player) {
      renderRoleView(state.player);
    }
  }
  
  renderSessionMeta(state.session, scenario);
  renderLobbyStatus(state.session, state.player);
  updateStageTracker(state.session.stage);

  if (deadlineChanged && state.session.auto_stage_enabled) {
    updateCountdown(state.session.stage_deadline_at);
  }

  if (stageChanged) {
    if (state.player) {
      state.player.stage_ready = false;
      state.player.ready_stage = state.session.stage;
    }
    renderRoleView(state.player);
    updateVoteUI();
    if (state.session.stage === "result") {
      renderVoteOutcome(state.session);
    }
  }

  if (state.session.stage === "result") {
    renderVoteOutcome(state.session);
  }

  updateReadyUI();
}

async function refreshPlayerState() {
  if (!state.sessionCode || !state.player?.name) return;
  const player = await fetchPlayerRecord(state.sessionCode, state.player.name);
  if (!player) return;
  
  const roleChanged = player.role && player.role !== state.player.role;
  const clueChanged = player.clue_summary !== state.player.clue_summary;
  const voteChanged =
    player.has_voted !== state.player.has_voted || player.vote_target !== state.player.vote_target;

  // 기존 데이터와 새 데이터 병합
  state.player = {
    ...state.player,
    ...player
  };
  
  // 플레이어 레코드 ID 보존
  if (state.playerRecordId && !state.player.id) {
    state.player.id = state.playerRecordId;
  }
  
  renderRoleView(state.player);
  updateReadyUI();

  if (roleChanged && state.lastRoleNotified !== player.role) {
    state.lastRoleNotified = player.role;
    showToast(`역할이 '${player.role}'(으)로 배정되었습니다.`, "success");
  } else if (clueChanged) {
    showToast("개인 단서가 업데이트되었습니다.", "info");
  }

  if (state.chatIdentity) {
    state.chatIdentity.role = player.role || "플레이어";
  }

  if (voteChanged) {
    updateVoteUI();
  }
}

function getPlayerNameById(playerId) {
  const target = state.roster.find((item) => item.id === playerId);
  return target ? target.name : "";
}

async function loadRoster() {
  if (!state.sessionCode) {
    return;
  }
  
  try {
    const data = await api.list("players", { search: state.sessionCode, limit: "100" });
    
    if (!data || !data.data) {
      console.warn('[Roster] 데이터가 비어있습니다');
      renderRoster([]);
      return;
    }
    
    const newRoster = data.data.filter((item) => !item.deleted && item.session_code === state.sessionCode);
    
    // 로스터 해시 생성 (변경 감지용)
    const newHash = JSON.stringify(newRoster.map(p => ({ 
      id: p.id, 
      name: p.name, 
      role: p.role, 
      has_voted: p.has_voted, 
      stage_ready: p.stage_ready 
    })));
    
    // 변경된 경우에만 렌더링
    if (newHash !== state.lastRosterHash) {
      state.roster = newRoster;
      state.lastRosterHash = newHash;
      renderRoster(state.roster);
      updateReadyUI();
      updateVoteUI();
    }
  } catch (error) {
    console.error("[Roster] 로드 실패:", error);
    if (!state.roster || !state.roster.length) {
      renderRoster([]);
    }
  }
}

function populateVoteOptions() {
  if (!dom.voteTarget) return;
  const existingValue = dom.voteTarget.value;
  dom.voteTarget.innerHTML = "<option value=\"\">-- 대상을 선택하세요 --</option>";
  state.roster
    .filter((player) => player.id !== state.playerRecordId)
    .forEach((player) => {
      const option = document.createElement("option");
      option.value = player.id;
      option.textContent = player.role ? `${player.name} (${player.role})` : player.name;
      dom.voteTarget.appendChild(option);
    });
  if (existingValue) {
    dom.voteTarget.value = existingValue;
  }
}

function updateVoteStatusBanner() {
  if (!dom.playerVoteStatus) return;
  if (!state.session || state.session.stage !== "voting") {
    dom.playerVoteStatus.innerHTML = "";
    return;
  }
  const eligible = state.roster.filter((player) => !player.is_bot).length;
  const submitted = state.roster.filter((player) => player.has_voted).length;
  dom.playerVoteStatus.innerHTML = `<strong>투표 진행 상황</strong><br>${submitted} / ${eligible} 명 투표 완료`;
}

function updateVoteUI() {
  if (!dom.voteForm || !state.session) return;
  const isVoting = state.session.stage === "voting";
  populateVoteOptions();
  dom.voteTarget.disabled = !isVoting || state.player?.has_voted;
  dom.voteSubmit.disabled =
    !isVoting || state.player?.has_voted || state.voteInFlight || !state.playerRecordId;

  if (!isVoting) {
    dom.voteHelper.textContent = "투표가 시작되면 선택지가 활성화됩니다.";
    if (state.session.stage === "result") {
      renderVoteOutcome(state.session);
    }
    return;
  }

  updateVoteStatusBanner();

  if (state.player?.has_voted) {
    const targetName = getPlayerNameById(state.player.vote_target);
    dom.voteHelper.textContent = targetName
      ? `이미 '${targetName}'에게 투표했습니다. 결과 발표를 기다려 주세요.`
      : "이미 투표를 제출했습니다.";
  } else {
    dom.voteHelper.textContent = "범인이라고 생각하는 인물을 선택해 투표하세요.";
  }
}

function renderVoteOutcome(session) {
  if (!dom.playerVoteStatus || !session) return;
  if (session.stage !== "result") {
    return;
  }
  let tallyHtml = "";
  if (session.vote_summary) {
    try {
      const summary = JSON.parse(session.vote_summary);
      if (summary?.tallies) {
        tallyHtml = Object.entries(summary.tallies)
          .map(([name, count]) => `<span><span>${name}</span><span>${count}표</span></span>`)
          .join("");
        tallyHtml = `<div class="vote-result__tally">${tallyHtml}</div>`;
      } else if (typeof session.vote_summary === "string") {
        tallyHtml = `<p>${session.vote_summary}</p>`;
      }
    } catch (error) {
      tallyHtml = `<p>${session.vote_summary}</p>`;
    }
  }

  const headline =
    session.winning_side === "citizens"
      ? "시민 팀 승리!"
      : session.winning_side === "culprit"
        ? "범인 승리!"
        : "결과 발표";

  dom.playerVoteStatus.innerHTML = `
    <div class="vote-result__headline">${headline}</div>
    ${tallyHtml}
  `;
  dom.voteHelper.textContent = "결과가 발표되었습니다.";
  dom.voteTarget.disabled = true;
  dom.voteSubmit.disabled = true;
}

async function handleVoteSubmit(event) {
  event.preventDefault();
  if (!state.session || state.session.stage !== "voting") {
    showToast("투표 가능한 시간이 아닙니다.", "warn");
    return;
  }
  if (!state.player || state.player.has_voted) {
    showToast("이미 투표를 완료했습니다.", "info");
    return;
  }
  const targetId = dom.voteTarget.value;
  if (!targetId) {
    showToast("투표할 대상을 선택하세요.", "warn");
    return;
  }

  state.voteInFlight = true;
  dom.voteSubmit.disabled = true;
  try {
    await api.update("players", state.playerRecordId, {
      has_voted: true,
      vote_target: targetId,
      last_seen: new Date().toISOString()
    });
    state.player.has_voted = true;
    state.player.vote_target = targetId;
    showToast("투표가 제출되었습니다. 결과를 기다려 주세요.", "success");
    updateVoteUI();
    await loadRoster();
  } catch (error) {
    console.error(error);
    showToast("투표를 제출하지 못했습니다.", "error");
    dom.voteSubmit.disabled = false;
  } finally {
    state.voteInFlight = false;
  }
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
    meta.innerHTML = `<span>${msg.player_name} (${msg.role || "참가자"})</span><span>${timeText}</span>`;

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

async function sendHeartbeat() {
  if (!state.playerRecordId || !state.session) return;
  if (state.session.status === "result" || state.session.status === "closed") return;
  try {
    await api.update("players", state.playerRecordId, {
      last_seen: new Date().toISOString(),
      status: state.session.stage === "lobby" ? "waiting" : "active"
    });
  } catch (error) {
    console.warn("플레이어 하트비트 실패", error);
  }
}

function prefillSessionCode() {
  const params = new URLSearchParams(window.location.search);
  const sessionParam = params.get("session");
  const stored = loadStoredCredentials();
  if (sessionParam) {
    dom.accessSessionCode.value = sessionParam.toUpperCase();
  } else if (stored?.sessionCode) {
    dom.accessSessionCode.value = stored.sessionCode;
  }
  if (stored?.playerName) {
    dom.accessPlayerName.value = stored.playerName;
  }
}

async function attemptAutoJoin() {
  // 자동 참가 기능 비활성화
  // 사용자가 명시적으로 세션에 참가하도록 변경
  if (state.autoJoinAttempted) return;
  state.autoJoinAttempted = true;
  
  // 세션 코드만 미리 채워주기
  const stored = loadStoredCredentials();
  if (stored?.sessionCode) {
    dom.accessSessionCode.value = stored.sessionCode;
  }
  if (stored?.playerName) {
    dom.accessPlayerName.value = stored.playerName;
  }
  
  // 자동 참가는 하지 않음
  return;
}

async function handlePlayerAccess(event) {
  event.preventDefault();
  const sessionCode = dom.accessSessionCode.value.trim().toUpperCase();
  const playerName = dom.accessPlayerName.value.trim();

  if (!sessionCode || !playerName) {
    showToast("세션 코드와 닉네임을 모두 입력하세요.", "warn");
    return;
  }

  if (!/^[A-Z0-9]{4,12}$/.test(sessionCode)) {
    showToast("세션 코드는 영문 대문자와 숫자 4~12자로 입력하세요.", "warn");
    return;
  }

  await joinSessionWithCredentials({
    sessionCode,
    playerName,
    allowCreate: true,
    silent: false
  });
}

function attachEventListeners() {
  dom.playerAccessForm.addEventListener("submit", handlePlayerAccess);
  dom.chatForm.addEventListener("submit", handleChatSubmit);
  dom.voteForm.addEventListener("submit", handleVoteSubmit);
  if (dom.readyToggleBtn) {
    dom.readyToggleBtn.addEventListener("click", handleReadyToggle);
  }
  dom.tabButtons.forEach((button) => {
    button.addEventListener("click", () => {
      switchTab(button.dataset.tab);
    });
  });
  if (dom.recentSessionsList) {
    dom.recentSessionsList.addEventListener("click", handleRecentSessionClick);
  }
}

async function hydrateRemoteScenarios() {
  try {
    const remote = await fetchRemoteScenarios();
    if (remote.length) {
      registerScenarios(remote);
      if (state.session?.scenario_id) {
        const scenario = getScenarioById(state.session.scenario_id);
        if (scenario) {
          const previousScenarioId = state.activeScenario?.id;
          state.activeScenario = scenario;
          if (previousScenarioId !== scenario.id) {
            renderScenario(scenario);
            if (state.player) {
              renderRoleView(state.player);
            }
          }
        }
      }
      await refreshRecentPlayerSessions();
    }
  } catch (error) {
    console.warn("원격 사건 세트 로드 실패", error);
  }
}

async function initialise() {
  setView("join");
  switchTab(state.activeTab);
  updateStageBadge("lobby");
  prefillSessionCode();
  attachEventListeners();
  await refreshRecentPlayerSessions();
  toggleChatAvailability(false);
  updateVoteUI();
  updateReadyUI();
  await hydrateRemoteScenarios();
  attemptAutoJoin();
}

document.addEventListener("DOMContentLoaded", initialise);

window.addEventListener("beforeunload", () => {
  stopPolling();
});
