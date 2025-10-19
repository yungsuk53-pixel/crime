import { scenarios, formatPlayerRange, registerScenarios, SCENARIO_GENERATION_GUIDE } from "./data.js";
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
  clone.evidence.physical = ensureArray(clone.evidence.physical).map((item) => {
    if (typeof item === "string") {
      return { display: item, time: null, visualElements: [] };
    }
    return {
      display: item.display || "",
      time: item.time || null,
      visualElements: ensureArray(item.visualElements || [])
    };
  });
  clone.evidence.digital = ensureArray(clone.evidence.digital).map((item) => {
    if (typeof item === "string") {
      return { display: item, time: null, visualElements: [] };
    }
    return {
      display: item.display || "",
      time: item.time || null,
      visualElements: ensureArray(item.visualElements || [])
    };
  });
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
  const hasValidEvidence = draft.evidence.physical.every((item) => item.display) && draft.evidence.digital.every((item) => item.display);
  if (!hasValidEvidence) {
    return { valid: false, message: "evidence 항목에 display 필드가 필요합니다." };
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
          ${renderList(draft.evidence.physical.map((item) => `${item.display}${item.time ? ` (${item.time})` : ""}${item.visualElements.length ? ` - ${item.visualElements.join(", ")}` : ""}`))}
        </div>
        <div>
          <strong>디지털 · 기타</strong>
          ${renderList(draft.evidence.digital.map((item) => `${item.display}${item.time ? ` (${item.time})` : ""}${item.visualElements.length ? ` - ${item.visualElements.join(", ")}` : ""}`))}
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
      "아래 시나리오 구조에 맞춰 고품질 범죄 추리 게임을 만들어주세요. visual 증거를 포함하여 HTML 코드 또는 이미지 생성 프롬프트를 제공하세요.",
    scenario: {
      id: "unique-kebab-case-id",
      title: "매력적이고 기억에 남는 제목",
      tagline: "30자 이내의 극적인 한 줄 소개",
      difficulty: "초급|중급|고급",
      tone: "장르/분위기 (예: 네오 누아르, 미스터리 코미디)",
      duration: "120분",
      playerRange: {
        min: 4,
        max: 7
      },
      summary: "사건의 배경, 상황, 핵심 미스터리를 포함한 200자 내외의 요약",
      motifs: [
        "이야기를 특별하게 만드는 독특한 요소",
        "플레이어의 흥미를 끄는 설정"
      ],
      conflicts: [
        "등장인물 간의 이해관계 충돌",
        "사건 해결의 핵심이 되는 질문"
      ],
      prompts: [
        "플레이어가 토론에서 다뤄야 할 핵심 질문",
        "범인을 찾기 위해 반드시 해결해야 할 의문"
      ],
      timeline: [
        { time: "HH:MM", description: "사건 전후의 중요한 시간대별 사건" }
      ],
      evidence: {
        physical: [
          "구체적인 물리적 증거 (예: 찢어진 영수증, 특정 위치의 지문)"
        ],
        digital: [
          "디지털 증거 (예: 문자 메시지, CCTV 타임스탬프, 통화 기록)"
        ],
        visual: [
          {
            type: "image|document|chart|receipt|letter|message|map|diagram",
            title: "증거 이름",
            description: "증거 설명",
            html: "<!-- 시각적 증거를 표현할 HTML 코드 -->",
            imagePrompt: "이미지 생성 AI를 위한 상세한 프롬프트 (선택사항)"
          }
        ]
      },
      characters: [
        {
          name: "캐릭터 이름",
          title: "구체적인 직책/역할",
          description: "이 캐릭터의 배경과 사건과의 관계"
        }
      ],
      roles: {
        detective: [
          {
            name: "탐정 이름",
            title: "탐정 직함",
            briefing: "플레이어에게 주어지는 역할 설명 및 목표",
            truths: ["구체적이고 확인 가능한 정보", "사건 해결에 도움이 되는 결정적 단서"],
            misdirections: ["다른 사람을 의심하게 만드는 정보"],
            prompts: ["이 단계에서 취해야 할 구체적 행동"]
          }
        ],
        culprit: [
          {
            name: "범인 이름",
            title: "범인 직함",
            briefing: "범인 브리핑 및 목표",
            truths: ["범인이 알고 있는 진실"],
            misdirections: ["다른 사람을 의심하게 만드는 정보", "자신의 알리바이를 강화하는 정보"],
            prompts: ["다른 플레이어에게 물어봐야 할 질문"],
            exposed: ["들킬 위험이 있는 약점이나 증거"]
          }
        ],
        suspects: [
          {
            name: "용의자 이름",
            title: "용의자 직함",
            summary: "용의자 배경",
            briefing: "용의자 브리핑",
            truths: ["이 캐릭터가 알고 있는 진실"],
            misdirections: ["다른 사람을 의심하게 만드는 정보"],
            prompts: ["토론을 유도할 질문"]
          }
        ]
      }
    }
  };
}

function buildPromptGuide() {
  // data.js에서 가져온 고품질 프롬프트 가이드 사용
  return SCENARIO_GENERATION_GUIDE;
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
