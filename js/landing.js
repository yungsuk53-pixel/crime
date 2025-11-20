import {
  scenarios,
  formatPlayerRange,
  registerScenarios,
  SCENARIO_GENERATION_GUIDE,
  stageLabels
} from "./data.js";
import { fetchRemoteScenarios, saveScenarioSet, uploadGraphicsAssets } from "./firebase.js";

let draftScenario = null;
let savingScenario = false;
let nanobananaPromptText = "";
let graphicsFiles = [];
let graphicsAssetsMeta = [];
let scenarioNeedsGraphics = false;
let nanobananaSlots = [];
const graphicsFileAssignments = new Map();

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

function slugify(value = "") {
  return value
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "slot";
}

function escapeHtml(text = "") {
  return text
    .toString()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getRoleGroupLabel(roleKey) {
  if (!roleKey) return "공용 증거";
  const match = ROLE_GROUP_CONFIG.find((group) => group.key === roleKey);
  return match ? match.label : "공용 증거";
}

function getFileKey(file) {
  if (!file) return "";
  const name = file.name || "unnamed";
  const size = Number.isFinite(file.size) ? file.size : 0;
  const lastModified = Number.isFinite(file.lastModified) ? file.lastModified : 0;
  return [name, size, lastModified].join("__");
}

function getSlotByKey(slotKey) {
  if (!slotKey) return null;
  return nanobananaSlots.find((slot) => slot.slotKey === slotKey) || null;
}

function buildSlotAssignmentSnapshot(slot) {
  if (!slot) return null;
  return {
    slotKey: slot.slotKey,
    context: slot.context,
    title: slot.title,
    stage: slot.stage,
    stageLabel: slot.stage && stageLabels?.[slot.stage] ? stageLabels[slot.stage] : slot.stage || "공용",
    roleGroup: slot.roleGroup || null,
    roleLabel: getRoleGroupLabel(slot.roleGroup),
    placeholder: Boolean(slot.placeholder)
  };
}

function decorateAssetWithSlotMeta(asset, slotKey) {
  const slot = getSlotByKey(slotKey);
  if (!slot) {
    return { ...asset, slotKey: slotKey || asset.slotKey || null };
  }
  return {
    ...asset,
    slotKey: slot.slotKey,
    slotAssignment: buildSlotAssignmentSnapshot(slot)
  };
}

function formatSlotLabel(slot) {
  if (!slot) {
    return "증거 미지정";
  }
  const stageLabel = slot.stage && stageLabels?.[slot.stage]
    ? stageLabels[slot.stage]
    : slot.stage === "global"
      ? "공용"
      : slot.stage || "단계";
  const prefix = slot.placeholder ? "[설계 필요] " : "";
  const roleLabel = getRoleGroupLabel(slot.roleGroup);
  return `${prefix}${roleLabel} · ${stageLabel} · ${slot.title}`.trim();
}

function pruneFileAssignments() {
  const validFileKeys = new Set(graphicsFiles.map(getFileKey));
  Array.from(graphicsFileAssignments.keys()).forEach((key) => {
    if (!validFileKeys.has(key)) {
      graphicsFileAssignments.delete(key);
    }
  });
  const validSlotKeys = new Set(nanobananaSlots.map((slot) => slot.slotKey));
  Array.from(graphicsFileAssignments.entries()).forEach(([fileKey, slotKey]) => {
    if (!slotKey || !validSlotKeys.has(slotKey)) {
      graphicsFileAssignments.delete(fileKey);
    }
  });
}

const VISUAL_STAGE_KEYS = ["clue_a", "clue_b", "clue_c"];
const HANGUL_REGEX = /[\u1100-\u11FF\u3130-\u318F\uA960-\uA97F\uAC00-\uD7FF]/;

const PLACEHOLDER_VISUAL_HINTS = [
  { pattern: /(유리|glass)/i, phrase: "깨진 유리 패널과 반사광" },
  { pattern: /(옥상|roof)/i, phrase: "옥상 난간과 젖은 발자국" },
  { pattern: /(비|빗소리|rain)/i, phrase: "빗물 웅덩이와 물방울 자국" },
  { pattern: /(정원|garden|식물)/i, phrase: "실내 정원 식물과 조명" },
  { pattern: /(혈|피|blood)/i, phrase: "혈흔과 번진 자국" },
  { pattern: /(CCTV|카메라)/i, phrase: "벽면 CCTV 모듈" },
  { pattern: /(유물|artifact|조각|조형)/i, phrase: "전시 조형물과 파손된 받침" }
];

const STAGE_PLACEHOLDER_BLUEPRINTS = {
  clue_a: {
    description: "사건 직후 현장을 넓게 보여주고 즉각적인 물증을 강조하세요.",
    shotType: "ShotType: wide-angle establishing shot from elevated corner, 24mm lens.",
    subjectFocus: (context) =>
      `SubjectFocus: ${context.personaName || "현장"}가 처음 목격하는 핵심 단서(발자국, 깨진 장식, 쓰러진 소품).`,
    keyObjects: (context) =>
      `KeyObjects & PhysicalTrace: ${context.hints.join(", ") || "흩어진 물증"}, 피해자의 소지품, 즉흥적인 흔적 1~2개.`,
    environment: (context) =>
      `Environment & SpatialClues: ${context.primaryLocation}의 구조(천장, 출입문, 감시카메라, 잠긴 통로)를 한 화면에 담으세요.`,
    lighting: "Lighting & Mood: cold midnight ambience mixed with gallery spotlights, rain reflection, cinematic noir.",
    example: (context) =>
      `예: 빗물 젖은 유리 정원 바닥에 남은 미끄러진 발자국과 깨진 패널 파편을 한 시야에 구성.`
  },
  clue_b: {
    description: "중간 단계에서 조작된 알리바이나 은폐 흔적을 근접 묘사하세요.",
    shotType: "ShotType: medium close-up with shallow depth of field, 50mm lens.",
    subjectFocus: (context) =>
      `SubjectFocus: ${context.personaName || "인물"}의 손길이 닿은 소도구나 조작 흔적(지문, 섬유, 장치).`,
    keyObjects: (context) =>
      `KeyObjects & PhysicalTrace: ${context.secondaryHint || "섬세한 물증"}, 장치 패널, 문 손잡이, 뒤틀린 조명, 유류품.`,
    environment: (context) =>
      `Environment & SpatialClues: ${context.primaryLocation} 내 특정 코너(보관실, 통로, 제어 패널)를 배경으로 배치.`,
    lighting: "Lighting & Mood: moody side lighting with sharp contrast, accent colors from exhibit LEDs.",
    example: () =>
      "예: 잠긴 문 옆 터치패드에 남은 장갑자국과 교란된 배선 클로즈업."
  },
  clue_c: {
    description: "최종 단계에서는 범인을 지목할 결정적 증거를 극근접으로 그립니다.",
    shotType: "ShotType: macro detail shot, 85mm lens, shallow focus.",
    subjectFocus: (context) =>
      `SubjectFocus: ${context.personaName || "범인"}만 알고 있는 비밀 장치나 단서의 극근접 디테일.`,
    keyObjects: () =>
      "KeyObjects & PhysicalTrace: 숨겨진 트리거, 혈흔이 묻은 공구, 파손된 키카드, 손에 쥔 미니어처 작품.",
    environment: (context) =>
      `Environment & SpatialClues: ${context.primaryLocation}의 그림자 속 일부분(바닥 틈새, 조형물 뒤)을 배경으로 둡니다.`,
    lighting: "Lighting & Mood: razor-sharp spotlight carving through darkness, high contrast to dramatize texture.",
    example: () =>
      "예: 깨진 조각상 내부에 숨겨둔 자물쇠와 묻어난 혈흔 세부 묘사."
  }
};

function containsHangul(text = "") {
  return HANGUL_REGEX.test(text);
}

function filterHangulSafeStrings(list = []) {
  return list.filter((text) => {
    if (!text) return false;
    if (!containsHangul(text)) {
      return true;
    }
    console.warn(
      `[Nanobanana] allowedEnglishText 항목에서 한글이 포함된 문구를 제거했습니다: ${text}`
    );
    return false;
  });
}

const VISUAL_FOCUS_HINTS = {
  clue_a: "Highlight the immediate physical clue (e.g., fabric stains, tool wear, body posture) with tight framing.",
  clue_b: "Emphasise environmental traces such as footprints, residue, or displaced props without adding labels.",
  clue_c: "Deliver a dramatic close-up of the decisive physical evidence—textures and lighting must explain everything.",
  global: "Showcase shared physical context (gallery wall, workshop bench, locker interior) with storytelling objects only.",
  default: "Compose the scene so viewers infer the story purely from objects, lighting, and character poses—never from text."
};

const ROLE_GROUP_CONFIG = [
  { key: "detective", label: "탐정 역할군" },
  { key: "culprit", label: "범인 역할군" },
  { key: "suspects", label: "용의자 역할군" }
];

function describeVisualFocusHint(slot) {
  const base = "Focus purely on physical cues—no captions, signage, interface chrome, or lettering of any kind.";
  const hint = VISUAL_FOCUS_HINTS[slot?.stage] || VISUAL_FOCUS_HINTS.default;
  return `${base} ${hint}`;
}

function deriveScenarioVisualHints(scenario) {
  const summary = (scenario?.summary || "") + " " + (scenario?.tone || "");
  const hints = PLACEHOLDER_VISUAL_HINTS.filter(({ pattern }) => pattern.test(summary)).map(
    (entry) => entry.phrase
  );
  if (!hints.length) {
    hints.push("피해자 주변에 흩어진 물증", "잠긴 출입구 주변 흔적");
  } else if (hints.length === 1) {
    hints.push("잠긴 출입구 주변 흔적");
  }
  return hints.slice(0, 3);
}

function summariseScenarioSnippet(scenario) {
  const summary = scenario?.summary || "";
  if (!summary) return "";
  const split = summary.split(/(?<=[.!?])\s+/)[0];
  return split?.trim() || summary.trim();
}

function buildPlaceholderBlueprintData({ scenario, personaName, roleLabel, stageKey, hints }) {
  const blueprint = STAGE_PLACEHOLDER_BLUEPRINTS[stageKey] || STAGE_PLACEHOLDER_BLUEPRINTS.clue_a;
  const context = {
    personaName,
    roleLabel,
    stageLabel: stageLabels[stageKey] || stageKey,
    summarySnippet: summariseScenarioSnippet(scenario),
    primaryLocation: scenario?.title || scenario?.tone || "사건 현장",
    hints,
    primaryHint: hints[0] || "현장 물증",
    secondaryHint: hints[1] || hints[0] || "은폐 흔적"
  };
  const descriptionParts = [
    `${context.stageLabel} 단계 증거 기획`,
    blueprint.description,
    context.summarySnippet ? `배경: ${context.summarySnippet}` : null,
    blueprint.example ? blueprint.example(context) : null
  ].filter(Boolean);
  const promptSegments = [
    blueprint.shotType,
    blueprint.subjectFocus(context),
    blueprint.keyObjects(context),
    blueprint.environment(context),
    blueprint.lighting,
    "TextBan: Text-free artwork. Leave every signage blank for HTML overlay.",
    "Use ultra realistic materials, 4K render."
  ];
  return {
    description: descriptionParts.join(" · "),
    prompt: promptSegments.join(" ")
  };
}

function listRoleGroupNames(scenario, key) {
  return ensureArray(scenario?.roles?.[key])
    .map((persona) => persona?.name)
    .filter((name) => typeof name === "string" && name.trim().length);
}

function describeRoleGroupAssetNeeds(scenario, perRoleCount) {
  if (!Number.isFinite(perRoleCount) || perRoleCount <= 0) {
    return "";
  }
  return ROLE_GROUP_CONFIG.map((group) => {
    const names = listRoleGroupNames(scenario, group.key);
    const nameSuffix = names.length ? ` (캐릭터: ${names.join(", ")})` : "";
    return `- ${group.label}${nameSuffix}: Nanobanana 이미지 ${perRoleCount}개. clue_a/b/c 단계에 골고루 배치하고 HTML 텍스트는 별도 증거에만 작성하세요.`;
  }).join("\n");
}

function buildNanobananaOverrideNote(scenario, perRoleCount, slotCount) {
  if (perRoleCount === null || perRoleCount === undefined) {
    return "";
  }
  if (perRoleCount <= 0) {
    return [
      "[사용자 지정 Nanobanana 요구]",
      "- Nanobanana 이미지는 이번 사건에서 별도로 제작하지 마세요.",
      "- 모든 시각 단서는 HTML 증거나 텍스트 기반 자료로만 제공합니다."
    ].join("\n");
  }
  const total = perRoleCount * ROLE_GROUP_CONFIG.length;
  const shortage = Math.max(0, total - slotCount);
  const roleLines = describeRoleGroupAssetNeeds(scenario, perRoleCount);
  const note = [
    "[사용자 지정 Nanobanana 요구]",
    `- 탐정·범인·용의자 역할군마다 최소 ${perRoleCount}개씩, 총 ${total}개 이상의 Nanobanana 이미지를 발주하세요.`,
    "- 모든 이미지는 clue_a/b/c 단계에 분산해 공개하고, 텍스트/캡션은 HTML 증거에만 남겨 두세요."
  ];
  if (shortage > 0) {
    note.push(`- 현재 JSON에는 Nanobanana 증거가 ${slotCount}개뿐이라 ${shortage}개를 추가 설계해야 합니다.`);
  }
  if (roleLines) {
    note.push(roleLines);
  }
  return note.join("\n");
}

function normaliseEnglishTextList(value) {
  if (Array.isArray(value)) {
    const trimmed = value.map((text) => (typeof text === "string" ? text.trim() : ""));
    return filterHangulSafeStrings(trimmed);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];
    return filterHangulSafeStrings([trimmed]);
  }
  return [];
}

function normaliseVisualEvidenceCollection(source) {
  const normaliseItem = (item = {}) => ({
    type: item?.type || "document",
    title: item?.title || "",
    description: item?.description || "",
    html: item?.html || "",
    imagePrompt: item?.imagePrompt || "",
    allowedEnglishText: normaliseEnglishTextList(item?.allowedEnglishText)
  });

  if (!source) {
    return {
      clue_a: [],
      clue_b: [],
      clue_c: []
    };
  }

  if (Array.isArray(source)) {
    return {
      clue_a: source.map(normaliseItem),
      clue_b: [],
      clue_c: []
    };
  }

  if (typeof source === "object") {
    return VISUAL_STAGE_KEYS.reduce(
      (acc, key) => {
        acc[key] = ensureArray(source[key]).map(normaliseItem);
        return acc;
      },
      {
        clue_a: [],
        clue_b: [],
        clue_c: []
      }
    );
  }

  return {
    clue_a: [],
    clue_b: [],
    clue_c: []
  };
}

function getPersonasForRoleGroup(scenario, groupKey) {
  return ensureArray(scenario?.roles?.[groupKey]).filter((persona) => persona && persona.name);
}

function generatePlaceholderSlots(scenario, perRoleTarget, slots) {
  if (!Number.isFinite(perRoleTarget) || perRoleTarget <= 0) {
    return [];
  }
  const hints = deriveScenarioVisualHints(scenario);
  const placeholders = [];
  ROLE_GROUP_CONFIG.forEach((group) => {
    const personas = getPersonasForRoleGroup(scenario, group.key);
    const personaFallback = personas.length ? personas : [{ name: group.label }];
    const existingCount = slots.filter((slot) => slot.roleGroup === group.key).length;
    const needed = Math.max(0, perRoleTarget - existingCount);
    if (!needed) {
      return;
    }
    for (let i = 0; i < needed; i += 1) {
      const persona = personaFallback[i % personaFallback.length];
      const personaName = persona?.name || group.label;
      const stageKey = VISUAL_STAGE_KEYS[i % VISUAL_STAGE_KEYS.length];
      const blueprint = buildPlaceholderBlueprintData({
        scenario,
        personaName,
        roleLabel: group.label,
        stageKey,
        hints
      });
      const placeholderKey = `placeholder-${group.key}-${slugify(personaName)}-${stageKey}-${i}`;
      placeholders.push({
        slotKey: placeholderKey,
        context: `${personaName} (${group.label})`,
        stage: stageKey,
        title: `${personaName} ${stageLabels[stageKey] || stageKey} 증거 설계`,
        description: blueprint.description,
        prompt: blueprint.prompt,
        htmlText: "",
        allowedEnglishText: [],
        roleGroup: group.key,
        placeholder: true
      });
    }
  });
  return placeholders;
}

function collectVisualEvidenceSlots(scenario) {
  const slots = [];
  const pushSlot = ({
    key,
    context,
    stage,
    title,
    description,
    html,
    prompt,
    allowedEnglishText = [],
    roleGroup = null,
    placeholder = false
  }) => {
    if (!context && !title) return;
    const hasInlineHtml = typeof html === "string" && html.trim().length > 0;
    if (hasInlineHtml) {
      return;
    }
    const htmlText = stripHtmlTags(html || "");
    const englishList = normaliseEnglishTextList(allowedEnglishText);
    slots.push({
      slotKey: key || `slot-${slots.length + 1}`,
      context,
      stage,
      title,
      description,
      prompt,
      htmlText,
      allowedEnglishText: englishList,
      roleGroup,
      placeholder
    });
  };

  ensureArray(scenario?.evidence?.visual).forEach((item, index) => {
    pushSlot({
      key: `visual-global-${index}`,
      context: "공용 증거",
      stage: "global",
      title: item.title || `공용 시각 증거 ${index + 1}`,
      description: item.description || "",
      prompt: item.imagePrompt || "",
      html: item.html || "",
      allowedEnglishText: item.allowedEnglishText,
      roleGroup: null
    });
  });

  const collectPersona = (personas = [], roleLabel, roleGroup) => {
    personas.forEach((persona, personaIndex) => {
      const personaSlug = slugify(`${persona?.name || roleLabel || "persona"}-${personaIndex}`);
      const visualMap = normaliseVisualEvidenceCollection(persona.visualEvidence);
      VISUAL_STAGE_KEYS.forEach((stageKey) => {
        ensureArray(visualMap[stageKey]).forEach((item, idx) => {
          pushSlot({
            key: `visual-${roleGroup || "shared"}-${personaSlug}-${stageKey}-${idx}`,
            context: `${persona.name || roleLabel} (${roleLabel})`,
            stage: stageKey,
            title: item.title || `${roleLabel} 증거 ${idx + 1}`,
            description: item.description || "",
            prompt: item.imagePrompt || "",
            html: item.html || "",
            allowedEnglishText: item.allowedEnglishText,
            roleGroup
          });
        });
      });
    });
  };

  collectPersona(ensureArray(scenario?.roles?.detective), "탐정", "detective");
  collectPersona(ensureArray(scenario?.roles?.culprit), "범인", "culprit");
  collectPersona(ensureArray(scenario?.roles?.suspects), "용의자", "suspects");

  return slots;
}

function buildNanobananaPromptPayload(scenario, perRoleTarget = null) {
  let slots = collectVisualEvidenceSlots(scenario);
  const summary = scenario?.summary || "";
  const normalisedPerRole = Number.isFinite(perRoleTarget)
    ? Math.max(0, Math.min(Math.trunc(perRoleTarget), 5))
    : null;
  const preferredTotal =
    normalisedPerRole !== null ? normalisedPerRole * ROLE_GROUP_CONFIG.length : null;
  if (normalisedPerRole && normalisedPerRole > 0) {
    const placeholders = generatePlaceholderSlots(scenario, normalisedPerRole, slots);
    if (placeholders.length) {
      slots = [...slots, ...placeholders];
    }
  }
  let requestedAssetCount = slots.length;
  if (normalisedPerRole !== null) {
    if (normalisedPerRole === 0) {
      requestedAssetCount = 0;
    } else if (preferredTotal > slots.length) {
      requestedAssetCount = preferredTotal;
    }
  }
  const strictTextPolicy = [
    "Only request Nanobanana assets for clues that can be explained 100% through visuals (blood spatter on fabric, residues on tools, posture in CCTV frames).",
    "Never paint letters, digits, signage, captions, UI chrome, or speech bubbles—every surface must stay completely text-free.",
    "If a clue needs wording, timelines, receipts, or chat logs, build them as HTML evidence instead of asking Nanobanana for text."
  ].join(" ");
  const visualClueRule =
    "Clues must be solvable from visual cues alone (appearance, posture, objects, lighting, environment) without any embedded narration.";
  const header =
    `Nanobanana에게 아래 사건의 시각 자산을 제작해 주세요.\n` +
    `\n사건명: ${scenario?.title || "-"}` +
    `\n톤: ${scenario?.tone || "-"}` +
    `\n요약: ${summary}` +
    `\n문자 정책: 모든 텍스트, 캡션, 타이포그래피, UI 요소는 HTML 증거에서만 처리하며, Nanobanana 이미지는 문자 없이 순수한 시각 단서로만 구성합니다.` +
    `\n텍스트 정책: ${strictTextPolicy}` +
    `\n시각 단서 정책: ${visualClueRule}` +
    `\n요청 자산: ${requestedAssetCount}개` +
    (normalisedPerRole && normalisedPerRole > 0
      ? ` (역할군당 ${normalisedPerRole}개 기준)`
      : "");

  if (!slots.length && (!normalisedPerRole || normalisedPerRole <= 0)) {
    return {
      slots,
      prompt: `${header}\n\n현재 시나리오에는 Nanobanana 그래픽 자산이 필요하지 않습니다.`
    };
  }

  const body = slots
    .map((slot, index) => {
      const stageLabel =
        slot.stage && stageLabels?.[slot.stage]
          ? stageLabels[slot.stage]
          : slot.stage && slot.stage !== "global"
            ? slot.stage
            : "";
      const basePrompt = slot.prompt || slot.description || slot.htmlText || "비어 있음";
      const noTextDirective =
        "Do not render any text, numerals, signage, UI chrome, stickers, or labels. Keep every surface natural and story-driven.";
      const enforcedPrompt = `${basePrompt} ${noTextDirective} ${visualClueRule}`;
      const focusHint = describeVisualFocusHint(slot);
      const slotPrefix = slot.placeholder ? "[설계 필요] " : "";
      const lines = [
        `${index + 1}. ${slotPrefix}${slot.context}${stageLabel ? ` · ${stageLabel}` : ""} - ${slot.title}`,
        `   - 씬 설명: ${slot.description || slot.htmlText || "상세 설명 없음"}`,
        `   - Nanobanana 프롬프트: ${enforcedPrompt}`,
        `   - 텍스트 정책: ${strictTextPolicy}`,
        `   - 텍스트/간판 삽입: 절대 금지 (모든 문자는 HTML 증거에서만 표현)` ,
        `   - 시각 단서 지시: ${visualClueRule}`,
        `   - 포커스 가이드: ${focusHint}`
      ];
      if (slot.htmlText) {
        lines.push(`   - HTML 레이아웃 참고: ${slot.htmlText}`);
      }
      return lines.join("\n");
    })
    .join("\n\n");

  const footer =
    "\n출력 규격" +
    "\n- 3:2 또는 4:3 비율, 2048px 이상 해상도" +
    "\n- 시나리오 톤을 반영한 색감" +
    "\n- 투명 배경 필요 시 PNG, 그 외 JPG" +
    "\n- 각 이미지는 개별 PNG/JPG 파일로 전달 (ZIP 번들 불가)";

  const overrideNote = buildNanobananaOverrideNote(scenario, normalisedPerRole, slots.length);
  const combinedBody = [body, overrideNote].filter(Boolean).join("\n\n");

  return {
    slots,
    requestedAssetCount,
    prompt: `${header}\n\n${combinedBody || "위 지침에 따라 Nanobanana 자산을 설계해 주세요."}${footer}`
  };
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
  clone.evidence = clone.evidence || { physical: [], digital: [], visual: [] };
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
  clone.evidence.visual = ensureArray(clone.evidence.visual).map((item) => ({
    type: item?.type || "document",
    title: item?.title || "",
    description: item?.description || "",
    html: item?.html || "",
    imagePrompt: item?.imagePrompt || "",
    allowedEnglishText: normaliseEnglishTextList(item?.allowedEnglishText)
  }));
  clone.characters = ensureArray(clone.characters);

  clone.roles = clone.roles || {};
  if (Array.isArray(clone.roles)) {
    const rolesObj = { detective: [], culprit: [], suspects: [] };
    clone.roles.forEach((role) => {
      const type = role?.clues?.type || role?.type || "suspect";
      if (type === "detective") rolesObj.detective.push(role);
      else if (type === "culprit") rolesObj.culprit.push(role);
      else rolesObj.suspects.push(role);
    });
    clone.roles = rolesObj;
  }

  const normalisePersona = (persona = {}) => {
    const copy = { ...persona };

    if (copy.clues && copy.clues.rounds && Array.isArray(copy.clues.rounds)) {
      const allTruths = [];
      const allMisdirections = [];
      const allPrompts = [];
      const allExposed = [];

      copy.clues.rounds.forEach((round) => {
        if (round.truths) allTruths.push(...ensureArray(round.truths));
        if (round.misdirections) allMisdirections.push(...ensureArray(round.misdirections));
        if (round.prompts) allPrompts.push(...ensureArray(round.prompts));
        if (round.exposed) allExposed.push(...ensureArray(round.exposed));
      });

      if (!copy.truths || !copy.truths.length) copy.truths = allTruths;
      if (!copy.misdirections || !copy.misdirections.length) copy.misdirections = allMisdirections;
      if (!copy.prompts || !copy.prompts.length) copy.prompts = allPrompts;
      if (allExposed.length && (!copy.exposed || !copy.exposed.length)) copy.exposed = allExposed;

      if (!copy.briefing && copy.clues.objective) {
        copy.briefing = copy.clues.objective;
      }
    }

    copy.truths = ensureArray(copy.truths);
    copy.misdirections = ensureArray(copy.misdirections);
    copy.prompts = ensureArray(copy.prompts);
    if (copy.exposed !== undefined || copy.clues?.type === "culprit") {
      copy.exposed = ensureArray(copy.exposed);
    }

    copy.timeline = ensureArray(copy.timeline).map((item) => ({
      time: item?.time ?? "",
      action: item?.action ?? ""
    }));
    copy.suggestedQuestions = ensureArray(copy.suggestedQuestions);
    copy.keyConflicts = ensureArray(copy.keyConflicts);
    copy.visualEvidence = normaliseVisualEvidenceCollection(copy.visualEvidence);

    return copy;
  };

  clone.roles.detective = ensureArray(clone.roles.detective).map(normalisePersona);
  clone.roles.culprit = ensureArray(clone.roles.culprit).map((persona) => {
    const copy = normalisePersona(persona);
    copy.exposed = ensureArray(copy.exposed);
    return copy;
  });
  clone.roles.suspects = ensureArray(clone.roles.suspects).map(normalisePersona);
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
  // visual 증거는 선택사항이므로 유효성 검사만 수행
  if (draft.evidence.visual && Array.isArray(draft.evidence.visual)) {
    const hasValidVisual = draft.evidence.visual.every((item) => item.type || item.title);
    if (!hasValidVisual) {
      return { valid: false, message: "visual 증거 항목에 type 또는 title이 필요합니다." };
    }
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

function stripHtmlTags(value = "") {
  if (!value) return "";
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
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
        ${draft.evidence.visual && draft.evidence.visual.length ? `
        <div>
          <strong>시각적 증거</strong>
          ${renderList(draft.evidence.visual.map((item) => `${item.title || item.type}${item.description ? ` - ${item.description}` : ""}`))}
        </div>
        ` : ""}
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

function updateGraphicsBundleStatus(message, state = "info") {
  const statusEl = document.getElementById("graphicsBundleStatus");
  if (statusEl) {
    statusEl.textContent = message;
    statusEl.dataset.state = state;
  }
}

function summariseGraphicsAssets(metaList = [], limit = 3) {
  if (!metaList.length) {
    return "";
  }
  const names = metaList
    .slice(0, limit)
    .map((asset) => asset?.originalName || asset?.path || asset?.url || "이미지 파일");
  const remainder = metaList.length > limit ? ` 외 ${metaList.length - limit}건` : "";
  return `${names.join(", ")}${remainder}`;
}

function refreshGraphicsUploadStatus() {
  if (!scenarioNeedsGraphics) {
    updateGraphicsBundleStatus("시각 자료가 없어 Nanobanana 이미지가 필요하지 않습니다.", "info");
    renderGraphicsAssignmentControls();
    return;
  }

  if (graphicsAssetsMeta.length) {
    updateGraphicsBundleStatus(
      `Nanobanana 이미지 ${graphicsAssetsMeta.length}개 연결됨 · ${summariseGraphicsAssets(graphicsAssetsMeta)}`,
      "success"
    );
    renderGraphicsAssignmentControls();
    return;
  }

  if (graphicsFiles.length) {
    const totalBytes = graphicsFiles.reduce((sum, file) => sum + (file?.size || 0), 0);
    updateGraphicsBundleStatus(
      `업로드 대기 중: ${graphicsFiles.length}개 · 총 ${formatBytes(totalBytes)} · 저장 시 자동 업로드됩니다.`,
      "info"
    );
    renderGraphicsAssignmentControls();
    return;
  }

  updateGraphicsBundleStatus(
    "필수 시각 자산이 있습니다. Nanobanana 이미지 파일(PNG/JPG)을 모두 선택해 업로드해 주세요.",
    "warn"
  );
  renderGraphicsAssignmentControls();
}

function resetGraphicsBundleTracking() {
  nanobananaPromptText = "";
  scenarioNeedsGraphics = false;
  graphicsFiles = [];
  graphicsAssetsMeta = [];
  nanobananaSlots = [];
  graphicsFileAssignments.clear();
  const promptField = document.getElementById("nanobananaPrompt");
  if (promptField) {
    promptField.value = "";
  }
  const bundleInput = document.getElementById("graphicsBundleInput");
  if (bundleInput) {
    bundleInput.value = "";
  }
  updateGraphicsBundleStatus("시나리오가 로드되면 필요한 Nanobanana 이미지와 업로드 상태가 표시됩니다.", "info");
  renderGraphicsAssignmentControls();
}

function describeAssignmentHelperText({ pendingFiles, slotCount }) {
  if (!scenarioNeedsGraphics) {
    return "시각 자산이 필요 없으면 이 영역이 비활성화됩니다.";
  }
  if (!slotCount) {
    return "Nanobanana 프롬프트에 시각 증거가 발견되지 않았습니다. JSON에 visualEvidence 항목을 포함해 주세요.";
  }
  if (!pendingFiles) {
    return `Nanobanana 증거 ${slotCount}건이 준비되었습니다. 이미지를 선택해 어떤 증거인지 지정하세요.`;
  }
  const assignedCount = graphicsFiles.reduce((count, file) => {
    const key = getFileKey(file);
    return count + (graphicsFileAssignments.has(key) ? 1 : 0);
  }, 0);
  const remaining = pendingFiles - assignedCount;
  if (remaining > 0) {
    return `파일 ${pendingFiles}개 중 ${remaining}개가 미지정입니다. 각 이미지를 해당 증거와 연결해 주세요.`;
  }
  return "모든 대기 파일이 Nanobanana 증거에 연결되었습니다. 저장하면 이 정보가 함께 업로드됩니다.";
}

function renderGraphicsAssignmentControls() {
  const mapper = document.getElementById("graphicsEvidenceMapper");
  const helper = document.getElementById("graphicsEvidenceHelper");
  const pendingList = document.getElementById("graphicsEvidenceList");
  const uploadedList = document.getElementById("graphicsUploadedList");
  if (!mapper) return;

  pruneFileAssignments();

  if (!scenarioNeedsGraphics) {
    mapper.classList.add("graphics-mapper--hidden");
    if (helper) {
      helper.textContent = "시각 자산이 필요 없으면 이 영역이 숨겨집니다.";
    }
    if (pendingList) pendingList.innerHTML = "";
    if (uploadedList) uploadedList.innerHTML = "";
    return;
  }

  mapper.classList.remove("graphics-mapper--hidden");
  const slotCount = nanobananaSlots.length;
  const pendingFiles = graphicsFiles.length;
  if (helper) {
    helper.textContent = describeAssignmentHelperText({ pendingFiles, slotCount });
  }

  if (pendingList) {
    if (!pendingFiles) {
      pendingList.innerHTML = '<p class="helper-text">이미지를 선택하면 파일별 매핑 옵션이 여기에 나타납니다.</p>';
    } else if (!slotCount) {
      pendingList.innerHTML = '<p class="helper-text helper-text--warn">시나리오에 Nanobanana 증거가 없어서 파일을 연결할 수 없습니다. 프롬프트를 다시 생성해 주세요.</p>';
    } else {
      const optionMarkupCache = nanobananaSlots.map((slot) => ({
        slotKey: slot.slotKey,
        label: escapeHtml(formatSlotLabel(slot)),
        valueAttr: escapeHtml(slot.slotKey)
      }));
      pendingList.innerHTML = graphicsFiles
        .map((file, index) => {
          const fileKey = getFileKey(file);
          const selectedSlotKey = graphicsFileAssignments.get(fileKey) || "";
          const options = ['<option value="">증거 선택</option>']
            .concat(
              optionMarkupCache.map((option) =>
                `<option value="${option.valueAttr}"${option.slotKey === selectedSlotKey ? " selected" : ""}>${option.label}</option>`
              )
            )
            .join("");
          return `
            <div class="graphics-mapper__row">
              <div class="graphics-mapper__file">
                <strong>${escapeHtml(file.name || `파일 ${index + 1}`)}</strong>
                <span>${formatBytes(file.size)}</span>
              </div>
              <label class="graphics-mapper__selector">
                <span>연결할 증거</span>
                <select class="graphics-mapper__select" data-file-key="${escapeHtml(fileKey)}">
                  ${options}
                </select>
              </label>
            </div>
          `;
        })
        .join("\n");
    }
  }

  if (uploadedList) {
    if (!graphicsAssetsMeta.length) {
      uploadedList.innerHTML = "";
    } else {
      const items = graphicsAssetsMeta
        .map((asset) => {
          const slot = asset.slotAssignment || getSlotByKey(asset.slotKey);
          const slotLabel = slot ? formatSlotLabel(slot) : "연결 정보 없음";
          return `
            <li class="graphics-mapper__uploaded-item">
              <span class="graphics-mapper__uploaded-name">${escapeHtml(asset.originalName || asset.path || "Firebase asset")}</span>
              <span class="graphics-mapper__uploaded-slot">${escapeHtml(slotLabel)}</span>
            </li>
          `;
        })
        .join("\n");
      uploadedList.innerHTML = `
        <h6>Firebase 업로드 완료</h6>
        <ul>
          ${items}
        </ul>
      `;
    }
  }
}

function handleGraphicsAssignmentChange(event) {
  const target = event.target;
  if (!target.classList?.contains("graphics-mapper__select")) {
    return;
  }
  const fileKey = target.dataset.fileKey;
  if (!fileKey) return;
  const slotKey = target.value;
  if (!slotKey) {
    graphicsFileAssignments.delete(fileKey);
  } else {
    graphicsFileAssignments.set(fileKey, slotKey);
  }
  renderGraphicsAssignmentControls();
}

function validateGraphicsAssignments() {
  if (!graphicsFiles.length) {
    return { valid: true };
  }
  if (!nanobananaSlots.length) {
    return {
      valid: false,
      message: "Nanobanana 프롬프트에서 증거 목록을 불러오지 못했습니다. JSON을 다시 로드한 뒤 시도하세요."
    };
  }
  const missingAssignments = graphicsFiles.filter((file) => {
    const key = getFileKey(file);
    return !graphicsFileAssignments.has(key);
  });
  if (missingAssignments.length) {
    return {
      valid: false,
      message: `Nanobanana 이미지 ${missingAssignments.length}개가 어떤 증거인지 지정되지 않았습니다. 각 파일에 증거를 선택해 주세요.`
    };
  }
  return { valid: true };
}

function reconcileExistingAssetAssignments() {
  if (!graphicsAssetsMeta.length) {
    return;
  }
  graphicsAssetsMeta = graphicsAssetsMeta.map((asset) => {
    if (asset.slotAssignment?.slotKey) {
      return decorateAssetWithSlotMeta(asset, asset.slotAssignment.slotKey);
    }
    if (asset.slotKey) {
      return decorateAssetWithSlotMeta(asset, asset.slotKey);
    }
    return asset;
  });
}

function refreshNanobananaPromptUI(scenario, options = {}) {
  const { preserveUploads = false, forceRegeneratePrompt = false } = options;
  if (!scenario) {
    resetGraphicsBundleTracking();
    return;
  }

  if (!preserveUploads) {
    resetGraphicsBundleTracking();
  }

  const promptField = document.getElementById("nanobananaPrompt");
  const existingAssets = scenario.assets || {};
  if (!preserveUploads) {
    const legacyBundle = existingAssets.graphicsBundle ? [existingAssets.graphicsBundle] : [];
    const assetList = ensureArray(existingAssets.graphicsAssets);
    graphicsAssetsMeta = assetList.length ? assetList : legacyBundle;
  }

  const preferredCount = getNanobananaCountPreference();
  const payload = buildNanobananaPromptPayload(scenario, preferredCount);
  nanobananaSlots = payload.slots || [];
  pruneFileAssignments();
  reconcileExistingAssetAssignments();
  const hasOverride = preferredCount !== null;
  const shouldUseExistingPrompt = existingAssets.nanobananaPrompt && !hasOverride && !forceRegeneratePrompt;

  nanobananaPromptText = shouldUseExistingPrompt ? existingAssets.nanobananaPrompt : payload.prompt;

  const existingNeedsFlag =
    typeof existingAssets.needsGraphics === "boolean" ? existingAssets.needsGraphics : payload.requestedAssetCount > 0;

  scenarioNeedsGraphics = shouldUseExistingPrompt ? existingNeedsFlag : payload.requestedAssetCount > 0;
  if ((graphicsAssetsMeta.length || graphicsFiles.length) && !scenarioNeedsGraphics) {
    scenarioNeedsGraphics = true;
  }

  if (promptField) {
    promptField.value = nanobananaPromptText;
  }

  refreshGraphicsUploadStatus();
}

function formatBytes(size = 0) {
  if (!Number(size)) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1);
  const value = size / 1024 ** exponent;
  return `${value.toFixed(1)} ${units[exponent]}`;
}

function handleGraphicsFilesChange(event) {
  const files = Array.from(event.target?.files || []);
  graphicsFiles = files;
  if (files.length) {
    graphicsFileAssignments.clear();
  }
  if (!files.length) {
    refreshGraphicsUploadStatus();
    return;
  }
  refreshGraphicsUploadStatus();
}

function applyScenarioDraft(rawScenario, sourceLabel = "업로드") {
  try {
    console.log("[시나리오 빌더] 원본 데이터:", rawScenario);
    const scenario = rawScenario?.scenario || rawScenario;
    console.log("[시나리오 빌더] 추출된 시나리오:", scenario);
    console.log("[시나리오 빌더] roles 구조 확인:", {
      hasRoles: !!scenario.roles,
      detective: scenario.roles?.detective?.length || 0,
      culprit: scenario.roles?.culprit?.length || 0,
      suspects: scenario.roles?.suspects?.length || 0,
      rolesKeys: scenario.roles ? Object.keys(scenario.roles) : []
    });
    const normalised = normaliseScenario(scenario);
    console.log("[시나리오 빌더] 정규화된 시나리오:", normalised);
    console.log("[시나리오 빌더] 정규화 후 roles:", {
      detective: normalised.roles?.detective?.length || 0,
      culprit: normalised.roles?.culprit?.length || 0,
      suspects: normalised.roles?.suspects?.length || 0
    });
    const validation = validateScenarioDraft(normalised);
    console.log("[시나리오 빌더] 유효성 검사 결과:", validation);
    if (!validation.valid) {
      setBuilderStatus(validation.message, "warn");
      draftScenario = null;
      displayDraftScenario(null);
      resetGraphicsBundleTracking();
      return;
    }
    draftScenario = normalised;
    displayDraftScenario(draftScenario);
    setBuilderStatus(`'${draftScenario.title}' 사건 초안을 ${sourceLabel}에서 불러왔습니다.`, "success");
    refreshNanobananaPromptUI(draftScenario);
  } catch (error) {
    console.error("시나리오 초안 적용 실패:", error);
    setBuilderStatus("JSON을 해석하지 못했습니다. 형식을 다시 확인해 주세요.", "warn");
    draftScenario = null;
    displayDraftScenario(null);
    resetGraphicsBundleTracking();
  }
}

function buildPromptTemplate() {
  return {
    instructions:
      "아래 시나리오 구조에 맞춰 고품질 범죄 추리 게임을 만들어주세요. visual 증거는 Nanobanana에 전달할 imagePrompt를 반드시 포함하되, 영수증/문자 등 텍스트가 필요한 자료는 모두 visualEvidence.html 필드에 인라인 스타일로 작성하고 이미지는 순수 비주얼 단서로만 구성해 주세요. Nanobanana가 생성할 이미지는 개별 파일(PNG/JPG 등)이며, 인상착의·동선·사물 배치 등 **글자 없이도 추리가 가능한 요소**를 구체적으로 묘사해야 합니다. 모든 이미지 프롬프트에는 'All text must remain in UTF-8 Hangul.' 과 같이 한글 텍스트가 깨지지 않도록 UTF-8 유지 문구를 꼭 추가하고, **이미지에는 어떤 텍스트도 넣지 말고** \"Text-free artwork, leave blank banner for HTML overlay\" 와 같은 지시를 포함해 주세요.",
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

function getTrimmedInputValue(elementId) {
  const el = document.getElementById(elementId);
  if (!el || typeof el.value !== "string") {
    return "";
  }
  return el.value.trim();
}

function getNanobananaCountPreference() {
  const input = document.getElementById("userNanobananaCount");
  if (!input || typeof input.value !== "string") {
    return null;
  }
  const trimmed = input.value.trim();
  if (trimmed === "") {
    return null;
  }
  const parsed = Number.parseInt(trimmed, 10);
  if (Number.isNaN(parsed)) {
    return null;
  }
  const clamped = Math.max(0, Math.min(parsed, 5));
  if (clamped !== parsed) {
    input.value = clamped.toString();
  }
  return clamped;
}

function describeNanobananaPreference(count) {
  if (count === null || count === undefined) {
    return "";
  }
  if (count <= 0) {
    return "**Nanobanana 시각 자료:** Nanobanana 이미지는 요청하지 않고 HTML 기반 증거만 활용해 주세요.\n\n";
  }
  const totalMinimum = count * 3;
  const perRoleText =
    "각 Nanobanana 증거는 HTML을 비워두고 imagePrompt로만 설명하며 clue_a/b/c 단계에 분산 배치합니다.";
  return (
    `**Nanobanana 시각 자료:** 탐정 · 범인 · 용의자 역할군마다 최소 ${count}개씩 Nanobanana 전용 증거를 포함해 ` +
    `총 ${totalMinimum}개 이상을 확보해 주세요. ${perRoleText}\n\n`
  );
}

function buildPromptGuide() {
  // data.js에서 가져온 고품질 프롬프트 가이드 사용
  let guide = SCENARIO_GENERATION_GUIDE;
  
  // 사용자 입력 필드 읽기
  const userTheme = getTrimmedInputValue("userTheme");
  const userPlayerCount = getTrimmedInputValue("userPlayerCount");
  const userRequirements = getTrimmedInputValue("userRequirements");
  const userNanobananaCount = getNanobananaCountPreference();
  
  // 사용자 입력이 있으면 프롬프트 앞에 추가
  if (userTheme || userPlayerCount || userRequirements || userNanobananaCount !== null) {
    let userInput = "\n\n## 🎯 사용자 요청 사항\n\n";
    if (userTheme) {
      userInput += `**주제/배경:** ${userTheme}\n\n`;
    }
    if (userPlayerCount) {
      userInput += `**추천 인원:** ${userPlayerCount}\n\n`;
    }
    if (userRequirements) {
      userInput += `**특별 요구사항:**\n${userRequirements}\n\n`;
    }
    userInput += describeNanobananaPreference(userNanobananaCount);
    userInput += "위 조건을 고려하여 시나리오를 생성해 주세요.\n\n---\n";
    guide = userInput + guide;
  }
  
  return guide;
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

async function copyNanobananaPrompt() {
  const promptField = document.getElementById("nanobananaPrompt");
  if (!promptField || !promptField.value.trim()) {
    setBuilderStatus("Nanobanana 프롬프트가 생성된 뒤 복사할 수 있습니다.", "warn");
    return;
  }
  try {
    if (!navigator?.clipboard?.writeText) {
      throw new Error("clipboard API not available");
    }
    await navigator.clipboard.writeText(promptField.value);
    setBuilderStatus("Nanobanana 그래픽 요청서를 복사했습니다.", "success");
  } catch (error) {
    console.warn("Nanobanana 프롬프트 복사 실패", error);
    setBuilderStatus("클립보드 복사에 실패했습니다. 수동으로 복사해 주세요.", "warn");
    promptField.select();
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
      resetGraphicsBundleTracking();
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
    // 제어 문자 정리: JSON 문자열 내부의 제어 문자를 이스케이프
    let cleanedText = rawText;
    
    // 마크다운 코드 블록 제거
    cleanedText = cleanedText.replace(/^```json\s*/i, '').replace(/\s*```$/i, '');
    cleanedText = cleanedText.replace(/^```\s*/i, '').replace(/\s*```$/i, '');
    
    // JSON 파싱 시도
    let parsed;
    try {
      parsed = JSON.parse(cleanedText);
    } catch (firstError) {
      console.warn("1차 파싱 실패, 제어 문자 정리 시도", firstError);
      
      // 제어 문자를 이스케이프하여 재시도
      // 문자열 값 내부의 제어 문자만 이스케이프 (JSON 구조는 유지)
      cleanedText = cleanedText.replace(/"([^"\\]*(\\.[^"\\]*)*)"/g, (match) => {
        return match
          .replace(/\n/g, '\\n')
          .replace(/\r/g, '\\r')
          .replace(/\t/g, '\\t')
          .replace(/\f/g, '\\f')
          .replace(/\b/g, '\\b');
      });
      
      parsed = JSON.parse(cleanedText);
    }
    
    applyScenarioDraft(parsed, "텍스트 입력");
  } catch (error) {
    console.error("텍스트 JSON 파싱 실패", error);
    console.error("오류 위치:", error.message);
    
    // 오류 위치 힌트 제공
    const match = error.message.match(/position (\d+)/);
    if (match) {
      const pos = parseInt(match[1]);
      const snippet = rawText.substring(Math.max(0, pos - 50), Math.min(rawText.length, pos + 50));
      console.error("오류 근처 텍스트:", snippet);
      console.error("오류 위치 마커:", ' '.repeat(Math.min(50, pos)) + '^');
    }
    
    setBuilderStatus(
      "JSON 구문 오류가 있습니다. 콘솔(F12)에서 상세 오류를 확인하세요. " +
      "문자열 내부에 줄바꿈이 있다면 \\n으로 바꿔주세요.",
      "error"
    );
    draftScenario = null;
    displayDraftScenario(null);
    resetGraphicsBundleTracking();
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
  resetGraphicsBundleTracking();
  const uploadInput = document.getElementById("promptUploadInput");
  if (uploadInput) {
    uploadInput.value = "";
  }
}

function applyUserRequirementsToPrompt() {
  const guideField = document.getElementById("promptGuide");
  if (!guideField) return;
  
  // 사용자 입력 필드 읽기
  const userTheme = getTrimmedInputValue("userTheme");
  const userPlayerCount = getTrimmedInputValue("userPlayerCount");
  const userRequirements = getTrimmedInputValue("userRequirements");
  const userNanobananaCount = getNanobananaCountPreference();
  
  // 입력이 없으면 경고
  if (!userTheme && !userPlayerCount && !userRequirements && userNanobananaCount === null) {
    setBuilderStatus("적용할 요구사항을 먼저 입력해 주세요.", "warn");
    return;
  }
  
  // 프롬프트 업데이트
  guideField.value = buildPromptGuide();
  
  // 성공 메시지
  let appliedItems = [];
  if (userTheme) appliedItems.push("주제/배경");
  if (userPlayerCount) appliedItems.push("추천 인원");
  if (userRequirements) appliedItems.push("특별 요구사항");
  if (userNanobananaCount !== null) {
    if (userNanobananaCount > 0) {
      appliedItems.push(`Nanobanana ${userNanobananaCount}개/역할군`);
    } else {
      appliedItems.push("Nanobanana 미사용");
    }
  }
  
  setBuilderStatus(
    `✅ 프롬프트에 적용되었습니다: ${appliedItems.join(", ")}. 이제 복사하거나 다운로드하여 AI에게 전달하세요.`,
    "success"
  );
}

function handleNanobananaCountInput() {
  const guideField = document.getElementById("promptGuide");
  if (guideField) {
    guideField.value = buildPromptGuide();
  }
  if (draftScenario) {
    refreshNanobananaPromptUI(draftScenario, { preserveUploads: true, forceRegeneratePrompt: true });
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
  const hasUploadedAssets = graphicsAssetsMeta.length > 0;
  const hasPendingFiles = graphicsFiles.length > 0;

  if (scenarioNeedsGraphics && !hasUploadedAssets && !hasPendingFiles) {
    setBuilderStatus("필수 시각 자산이 있으므로 Nanobanana 이미지 파일을 업로드해야 합니다.", "warn");
    return;
  }
  if (scenarioNeedsGraphics && hasPendingFiles) {
    const assignmentValidation = validateGraphicsAssignments();
    if (!assignmentValidation.valid) {
      setBuilderStatus(assignmentValidation.message, "warn");
      return;
    }
  }
  savingScenario = true;
  toggleSaveButton(true);
  try {
    if (scenarioNeedsGraphics && hasPendingFiles) {
      setBuilderStatus("Nanobanana 이미지를 업로드하는 중입니다...", "info");
      const pendingFiles = [...graphicsFiles];
      const uploads = await uploadGraphicsAssets(pendingFiles, draftScenario.id);
      graphicsAssetsMeta = uploads.map((asset, index) => {
        const fileKey = getFileKey(pendingFiles[index]);
        const slotKey = graphicsFileAssignments.get(fileKey) || null;
        return decorateAssetWithSlotMeta(asset, slotKey);
      });
      graphicsFiles = [];
      graphicsFileAssignments.clear();
      refreshGraphicsUploadStatus();
    }

    const scenarioPayload = {
      ...draftScenario,
      assets: {
        ...(draftScenario.assets || {}),
        needsGraphics: scenarioNeedsGraphics,
        nanobananaPrompt: nanobananaPromptText,
        graphicsAssets: graphicsAssetsMeta,
        graphicsBundle: null,
        updatedAt: new Date().toISOString()
      }
    };

    await saveScenarioSet(scenarioPayload);
    registerScenarios([scenarioPayload]);
    renderScenarioCards();
    setBuilderStatus(
      `'${scenarioPayload.title}' 사건 세트를 Firebase에 저장했습니다. 호스트 콘솔을 새로고침하면 즉시 사용할 수 있습니다.`,
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
    resetGraphicsBundleTracking();
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
  const applyRequirementsBtn = document.getElementById("applyUserRequirements");
  const copyNanobananaBtn = document.getElementById("copyNanobananaPrompt");
  const graphicsInput = document.getElementById("graphicsBundleInput");
  const nanobananaCountInput = document.getElementById("userNanobananaCount");
  const graphicsMapper = document.getElementById("graphicsEvidenceMapper");

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
  if (applyRequirementsBtn) {
    applyRequirementsBtn.addEventListener("click", applyUserRequirementsToPrompt);
  }
  if (copyNanobananaBtn) {
    copyNanobananaBtn.addEventListener("click", copyNanobananaPrompt);
  }
  if (graphicsInput) {
    graphicsInput.addEventListener("change", handleGraphicsFilesChange);
  }
  if (nanobananaCountInput) {
    nanobananaCountInput.addEventListener("input", handleNanobananaCountInput);
  }
  if (graphicsMapper) {
    graphicsMapper.addEventListener("change", handleGraphicsAssignmentChange);
  }
  resetGraphicsBundleTracking();
  displayDraftScenario(null);
  setBuilderStatus("템플릿을 다운로드하거나 JSON을 붙여넣어 새로운 사건 세트를 등록하세요.");
}

document.addEventListener("DOMContentLoaded", async () => {
  renderScenarioCards();
  setupScenarioBuilder();
  await hydrateRemoteScenarios();
});
