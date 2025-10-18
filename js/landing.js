import { scenarios, formatPlayerRange, registerScenarios } from "./data.js";
import { fetchRemoteScenarios, saveScenarioSet } from "./firebase.js";

let draftScenario = null;
let savingScenario = false;

function renderScenarioCards() {
  const grid = document.getElementById("scenarioGrid");
  if (!grid) return;
  grid.innerHTML = "";
  scenarios.forEach((scenario) => {
    const card = document.createElement("article");
    card.className = "scenario-card scenario-card--compact";
    card.innerHTML = `
      <header class="scenario-card__header">
        <h3>${scenario.title}</h3>
        <p class="scenario-card__tagline">${scenario.tagline}</p>
      </header>
      <div class="scenario-card__grid scenario-card__grid--compact">
        <div>
          <h4>인원 & 난이도</h4>
          <p class="text-high">${formatPlayerRange(scenario.playerRange)} · ${scenario.difficulty}</p>
          <p class="helper-text">톤: ${scenario.tone} / 진행: ${scenario.duration}</p>
        </div>
        <div>
          <h4>요약</h4>
          <p>${scenario.summary}</p>
        </div>
      </div>
    `;
    grid.appendChild(card);
  });
}

function setBuilderStatus(message, variant = "info") {
  const statusEl = document.getElementById("scenarioBuilderStatus");
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.dataset.state = variant;
}

function toggleSaveButton(enabled) {
  const button = document.getElementById("saveScenarioBtn");
  if (!button) return;
  button.disabled = !enabled || savingScenario;
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function normaliseScenario(raw = {}) {
  const clone = JSON.parse(JSON.stringify(raw));
  clone.motifs = ensureArray(clone.motifs);
  clone.conflicts = ensureArray(clone.conflicts);
  clone.prompts = ensureArray(clone.prompts);
  clone.timeline = ensureArray(clone.timeline).map((item) => ({
    time: item?.time ?? "",
    description: item?.description ?? ""
  }));
  clone.evidence = clone.evidence || { physical: [], digital: [] };
  clone.evidence.physical = ensureArray(clone.evidence.physical);
  clone.evidence.digital = ensureArray(clone.evidence.digital);
  clone.characters = ensureArray(clone.characters);
  clone.roles = clone.roles || {};
  clone.roles.detective = ensureArray(clone.roles.detective);
  clone.roles.culprit = ensureArray(clone.roles.culprit);
  clone.roles.suspects = ensureArray(clone.roles.suspects);
  const normalisePersona = (persona = {}) => {
    const copy = { ...persona };
    copy.truths = ensureArray(copy.truths);
    copy.misdirections = ensureArray(copy.misdirections);
    copy.prompts = ensureArray(copy.prompts);
    if (copy.exposed !== undefined) {
      copy.exposed = ensureArray(copy.exposed);
    }
    return copy;
  };
  clone.roles.detective = clone.roles.detective.map(normalisePersona);
  clone.roles.culprit = clone.roles.culprit.map((persona) => {
    const copy = normalisePersona(persona);
    copy.exposed = ensureArray(copy.exposed);
    return copy;
  });
  clone.roles.suspects = clone.roles.suspects.map(normalisePersona);
  clone.playerRange = clone.playerRange || { min: 0, max: 0 };
  clone.playerRange.min = Number(clone.playerRange.min);
  clone.playerRange.max = Number(clone.playerRange.max);
  return clone;
}

function validateScenarioDraft(draft) {
  if (!draft) {
    return { valid: false, message: "scenario 객체를 찾을 수 없습니다." };
  }
  const requiredStrings = [
    "id",
    "title",
    "tagline",
    "difficulty",
    "tone",
    "duration",
    "summary"
  ];
  for (const key of requiredStrings) {
    if (!draft[key] || typeof draft[key] !== "string" || !draft[key].trim()) {
      return { valid: false, message: `${key} 필드는 비어 있을 수 없습니다.` };
    }
  }
  if (!/^[a-z0-9-]+$/.test(draft.id)) {
    return { valid: false, message: "id 필드는 소문자-케밥-케이스로 작성하세요." };
  }
  if (
    !draft.playerRange ||
    Number.isNaN(draft.playerRange.min) ||
    Number.isNaN(draft.playerRange.max) ||
    draft.playerRange.min <= 0 ||
    draft.playerRange.max < draft.playerRange.min
  ) {
    return { valid: false, message: "playerRange.min / max 값을 확인하세요." };
  }
  const hasTimeline = draft.timeline.length > 0 && draft.timeline.every((item) => item.time && item.description);
  if (!hasTimeline) {
    return { valid: false, message: "timeline 항목에 시간과 설명을 모두 입력하세요." };
  }
  if (!Array.isArray(draft.evidence.physical) || !Array.isArray(draft.evidence.digital)) {
    return { valid: false, message: "evidence.physical / digital 배열이 필요합니다." };
  }
  const roles = draft.roles;
  if (!roles || !roles.detective.length || !roles.culprit.length || !roles.suspects.length) {
    return { valid: false, message: "roles.detective / culprit / suspects 배열에 최소 1개 이상의 인물이 필요합니다." };
  }
  return { valid: true };
}

function renderList(items = []) {
  const validItems = items.filter((item) => typeof item === "string" && item.trim().length);
  if (!validItems.length) return "<p class=\"helper-text\">등록된 항목이 없습니다.</p>";
  return `<ul class="scenario-preview__list">${validItems
    .map((item) => `<li>${item}</li>`)
    .join("")}</ul>`;
}

function renderTimeline(items = []) {
  const validItems = items.filter((item) => item?.time && item?.description);
  if (!validItems.length) return "<p class=\"helper-text\">타임라인 정보가 없습니다.</p>";
  return `<ul class="scenario-preview__timeline">${validItems
    .map((item) => `<li><strong>${item.time}</strong> · ${item.description}</li>`)
    .join("")}</ul>`;
}

function displayDraftScenario(draft) {
  const container = document.getElementById("scenarioPreview");
  if (!container) return;
  if (!draft) {
    container.innerHTML = "<p class=\"placeholder\">프롬프트 JSON을 업로드하거나 붙여넣으면 미리보기가 표시됩니다.</p>";
    toggleSaveButton(false);
    return;
  }
  container.innerHTML = `
    <header class="scenario-preview__header">
      <h4>${draft.title}</h4>
      <p class="helper-text">ID: ${draft.id}</p>
      <p class="scenario-preview__tagline">${draft.tagline}</p>
    </header>
    <div class="scenario-preview__meta">
      <span>${formatPlayerRange(draft.playerRange)}</span>
      <span>${draft.difficulty}</span>
      <span>${draft.tone}</span>
      <span>${draft.duration}</span>
    </div>
    <p class="scenario-preview__summary">${draft.summary}</p>
    <section>
      <h5>핵심 모티프</h5>
      ${renderList(draft.motifs)}
    </section>
    <section>
      <h5>주요 갈등</h5>
      ${renderList(draft.conflicts)}
    </section>
    <section>
      <h5>추천 질문</h5>
      ${renderList(draft.prompts)}
    </section>
    <section>
      <h5>타임라인</h5>
      ${renderTimeline(draft.timeline)}
    </section>
    <section>
      <h5>증거</h5>
      <div class="scenario-preview__evidence">
        <div>
          <strong>물적 증거</strong>
          ${renderList(draft.evidence.physical)}
        </div>
        <div>
          <strong>디지털 · 기타</strong>
          ${renderList(draft.evidence.digital)}
        </div>
      </div>
    </section>
    <section>
      <h5>등장인물</h5>
      ${renderList(
        draft.characters?.map((person) =>
          person?.title ? `${person.name} · ${person.title}` : person?.name || ""
        ) || []
      )}
    </section>
    <section>
      <h5>역할 구성</h5>
      <p class="helper-text">탐정 ${draft.roles.detective.length}명 · 범인 ${draft.roles.culprit.length}명 · 용의자 ${draft.roles.suspects.length}명</p>
    </section>
  `;
  toggleSaveButton(true);
}

function applyScenarioDraft(rawScenario, sourceLabel = "업로드") {
  try {
    const scenario = rawScenario?.scenario || rawScenario;
    const normalised = normaliseScenario(scenario);
    const validation = validateScenarioDraft(normalised);
    if (!validation.valid) {
      setBuilderStatus(validation.message, "warn");
      draftScenario = null;
      displayDraftScenario(null);
      return;
    }
    draftScenario = normalised;
    displayDraftScenario(draftScenario);
    setBuilderStatus(`'${draftScenario.title}' 사건 초안을 ${sourceLabel}에서 불러왔습니다.`, "success");
  } catch (error) {
    console.warn("시나리오 초안 적용 실패", error);
    setBuilderStatus("JSON을 해석하지 못했습니다. 형식을 다시 확인해 주세요.", "warn");
    draftScenario = null;
    displayDraftScenario(null);
  }
}

function buildPromptTemplate() {
  return {
    instructions:
      "선택한 주제에 맞춰 'scenario' 객체만 채워서 유효한 JSON으로 응답하세요. 모든 텍스트는 한국어로 작성하고, 배열은 최소 2개 이상의 항목을 제공합니다. 최소 한 명의 탐정, 한 명의 범인, 세 명 이상의 용의자를 정의합니다.",
    notes:
      "각 필드는 온라인 추리 세션에서 사용됩니다. 특히 roles 섹션은 플레이어 단서 카드로 직접 사용되므로 상세한 truths / misdirections / prompts / exposed 항목을 포함해야 합니다.",
    scenario: {
      id: "custom-theme-identifier",
      title: "<사건 제목>",
      tagline: "<한 줄 소개>",
      difficulty: "<난이도 예: 중급>",
      tone: "<분위기 예: 서스펜스>",
      duration: "<예: 120분>",
      playerRange: {
        min: 4,
        max: 7
      },
      summary: "<사건 요약>",
      motifs: [
        "<주제와 관련된 주요 모티프>",
        "<두 번째 모티프>"
      ],
      conflicts: [
        "<플레이어가 토론해야 하는 갈등 질문>",
        "<두 번째 갈등 질문>"
      ],
      prompts: [
        "<토론을 유도할 질문>",
        "<두 번째 질문>"
      ],
      timeline: [
        { "time": "18:00", "description": "<사건 전개 이벤트>" },
        { "time": "18:30", "description": "<추가 이벤트>" }
      ],
      evidence: {
        physical: [
          "<물적 증거>"
        ],
        digital: [
          "<디지털 또는 기타 증거>"
        ]
      },
      characters: [
        {
          name: "<이름>",
          title: "<직함>",
          description: "<배경 설명>"
        }
      ],
      roles: {
        detective: [
          {
            name: "<탐정 이름>",
            title: "<탐정 직함>",
            briefing: "<탐정 브리핑>",
            truths: ["<핵심 단서>", "<추가 단서>"],
            misdirections: ["<혼란 정보>"],
            prompts: ["<토론 유도 질문>"]
          }
        ],
        culprit: [
          {
            name: "<범인 이름>",
            title: "<범인 직함>",
            briefing: "<범인 브리핑>",
            truths: ["<범인이 아는 진실>", "<추가 진실>"],
            misdirections: ["<흘릴 정보>"],
            prompts: ["<범인이 제시할 토론 질문>"],
            exposed: ["<들키면 위험한 단서>"]
          }
        ],
        suspects: [
          {
            name: "<용의자 이름>",
            title: "<용의자 직함>",
            summary: "<용의자 요약>",
            briefing: "<용의자 브리핑>",
            truths: ["<용의자가 가진 진실>", "<추가 진실>"],
            misdirections: ["<혼란 정보>"],
            prompts: ["<토론을 유도할 질문>"]
          }
        ]
      }
    }
  };
}

function buildPromptGuide() {
  return [
    "당신은 온라인 추리 게임을 위한 사건 세트를 작성하는 시나리오 전문가입니다.",
    "사용자가 제시한 주제만 입력하면 되도록 아래 조건을 모두 충족하는 JSON을 반환하세요.",
    "- 필수 필드: id, title, tagline, difficulty, tone, duration, playerRange(min/max), summary, motifs, conflicts, prompts, timeline(시간 + 설명), evidence.physical/digital, characters, roles.detective/culprit/suspects.",
    "- roles 섹션은 각 인물에 대한 truths / misdirections / prompts / exposed(범인만) 배열을 포함해야 합니다.",
    "- 모든 텍스트는 한국어로 작성하고, 배열은 공백 요소 없이 최소 2개 이상 채웁니다.",
    "- id는 소문자-케밥-케이스로 작성합니다.",
    "- timeline은 사건의 흐름을 4~6개 단계로 구성합니다.",
    "응답 형식: JSON 단일 객체로 반환하며, 불필요한 설명을 추가하지 마세요.",
    "템플릿 예시는 아래 JSON을 참고하세요."
  ].join("\n");
}

function downloadPromptTemplate() {
  const template = buildPromptTemplate();
  const blob = new Blob([JSON.stringify(template, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "scenario-prompt-template.json";
  document.body.appendChild(link);
  link.click();
  URL.revokeObjectURL(link.href);
  document.body.removeChild(link);
  setBuilderStatus("프롬프트 템플릿을 다운로드했습니다. 주제를 추가해 AI에게 전달하세요.", "info");
}

async function copyPromptGuide() {
  const guideField = document.getElementById("promptGuide");
  if (!guideField) return;
  try {
    if (!navigator?.clipboard?.writeText) {
      throw new Error("clipboard API not available");
    }
    await navigator.clipboard.writeText(guideField.value);
    setBuilderStatus("프롬프트 안내문을 복사했습니다.", "success");
  } catch (error) {
    console.warn("클립보드 복사 실패", error);
    setBuilderStatus("클립보드 복사에 실패했습니다. 수동으로 복사해 주세요.", "warn");
    guideField.select();
  }
}

function handlePromptUpload(event) {
  const file = event.target?.files?.[0];
  if (!file) {
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      applyScenarioDraft(parsed, "파일 업로드");
    } catch (error) {
      console.warn("프롬프트 템플릿 파싱 실패", error);
      setBuilderStatus("JSON 파일을 읽어오지 못했습니다. 형식을 확인해 주세요.", "warn");
      draftScenario = null;
      displayDraftScenario(null);
    }
  };
  reader.readAsText(file, "utf-8");
}

function handlePromptJsonParse() {
  const textField = document.getElementById("promptJsonInput");
  if (!textField) return;
  const rawText = textField.value.trim();
  if (!rawText) {
    setBuilderStatus("JSON 텍스트를 붙여넣은 뒤 불러오기 버튼을 눌러주세요.", "warn");
    return;
  }
  try {
    const parsed = JSON.parse(rawText);
    applyScenarioDraft(parsed, "텍스트 입력");
  } catch (error) {
    console.warn("텍스트 JSON 파싱 실패", error);
    setBuilderStatus("JSON 구문 오류가 있습니다. 중괄호와 따옴표를 다시 확인해 주세요.", "error");
    draftScenario = null;
    displayDraftScenario(null);
  }
}

function handlePromptJsonClear() {
  const textField = document.getElementById("promptJsonInput");
  if (!textField) return;
  textField.value = "";
  draftScenario = null;
  displayDraftScenario(null);
  toggleSaveButton(false);
  setBuilderStatus("직접 입력한 JSON을 초기화했습니다.", "info");
  const uploadInput = document.getElementById("promptUploadInput");
  if (uploadInput) {
    uploadInput.value = "";
  }
}

async function handleSaveScenario() {
  if (!draftScenario) {
    setBuilderStatus("먼저 프롬프트 JSON을 업로드해 주세요.", "warn");
    return;
  }
  const validation = validateScenarioDraft(draftScenario);
  if (!validation.valid) {
    setBuilderStatus(validation.message, "warn");
    return;
  }
  savingScenario = true;
  toggleSaveButton(true);
  try {
    await saveScenarioSet(draftScenario);
    registerScenarios([draftScenario]);
    renderScenarioCards();
    setBuilderStatus(
      `'${draftScenario.title}' 사건 세트를 Firebase에 저장했습니다. 호스트 콘솔을 새로고침하면 즉시 사용할 수 있습니다.`,
      "success"
    );
    draftScenario = null;
    const uploadInput = document.getElementById("promptUploadInput");
    if (uploadInput) {
      uploadInput.value = "";
    }
    const jsonInput = document.getElementById("promptJsonInput");
    if (jsonInput) {
      jsonInput.value = "";
    }
    displayDraftScenario(null);
  } catch (error) {
    if (error?.message === "FIREBASE_UNAVAILABLE") {
      setBuilderStatus("Firebase에 연결할 수 없습니다. 네트워크 상태를 확인하거나 페이지를 HTTPS로 호스팅한 뒤 다시 시도하세요.", "error");
    } else {
      setBuilderStatus("시나리오 저장 중 오류가 발생했습니다. 콘솔을 확인해 주세요.", "error");
    }
  } finally {
    savingScenario = false;
    toggleSaveButton(Boolean(draftScenario));
  }
}

async function hydrateRemoteScenarios() {
  try {
    const remote = await fetchRemoteScenarios();
    if (remote.length) {
      registerScenarios(remote);
      renderScenarioCards();
      setBuilderStatus(`${remote.length}개의 원격 사건 세트를 불러왔습니다.`, "info");
    }
  } catch (error) {
    console.warn("원격 사건 세트 동기화 실패", error);
  }
}

function setupScenarioBuilder() {
  const downloadBtn = document.getElementById("downloadPromptTemplate");
  const uploadInput = document.getElementById("promptUploadInput");
  const saveBtn = document.getElementById("saveScenarioBtn");
  const guideField = document.getElementById("promptGuide");
  const copyBtn = document.getElementById("copyPromptGuide");
  const parseBtn = document.getElementById("parsePromptJsonBtn");
  const clearBtn = document.getElementById("clearPromptJsonBtn");

  if (downloadBtn) {
    downloadBtn.addEventListener("click", downloadPromptTemplate);
  }
  if (uploadInput) {
    uploadInput.addEventListener("change", handlePromptUpload);
  }
  if (saveBtn) {
    saveBtn.addEventListener("click", handleSaveScenario);
  }
  if (guideField) {
    guideField.value = buildPromptGuide();
  }
  if (copyBtn) {
    copyBtn.addEventListener("click", copyPromptGuide);
  }
  if (parseBtn) {
    parseBtn.addEventListener("click", handlePromptJsonParse);
  }
  if (clearBtn) {
    clearBtn.addEventListener("click", handlePromptJsonClear);
  }
  displayDraftScenario(null);
  setBuilderStatus("템플릿을 다운로드하거나 JSON을 붙여넣어 새로운 사건 세트를 등록하세요.");
}

document.addEventListener("DOMContentLoaded", async () => {
  renderScenarioCards();
  setupScenarioBuilder();
  await hydrateRemoteScenarios();
});
