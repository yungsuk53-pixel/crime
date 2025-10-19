export const stageLabels = {
  lobby: "대기실",
  briefing: "브리핑",
  clue_a: "1차 단서 공개",
  discussion_a: "1차 토론",
  clue_b: "2차 단서 공개",
  discussion_b: "2차 토론",
  clue_c: "3차 단서 공개",
  final_discussion: "최종 토론",
  voting: "최후 투표",
  result: "결과 발표"
};

export function getStageLabel(stageKey, fallbackLabel) {
  if (typeof stageKey === "string") {
    const normalized = stageKey.trim();
    if (normalized) {
      return stageLabels[normalized] || normalized;
    }
  } else if (stageKey !== null && stageKey !== undefined) {
    const stringKey = String(stageKey).trim();
    if (stringKey) {
      return stageLabels[stringKey] || stringKey;
    }
  }

  if (typeof fallbackLabel === "string") {
    const normalizedFallback = fallbackLabel.trim();
    if (normalizedFallback) {
      return normalizedFallback;
    }
  } else if (fallbackLabel !== null && fallbackLabel !== undefined) {
    const fallbackString = String(fallbackLabel).trim();
    if (fallbackString) {
      return fallbackString;
    }
  }

  return "-";
}

if (typeof window !== "undefined" && typeof window.getStageLabel !== "function") {
  window.getStageLabel = getStageLabel;
}

export const stageOrder = [
  "lobby",
  "briefing",
  "clue_a",
  "discussion_a",
  "clue_b",
  "discussion_b",
  "clue_c",
  "final_discussion",
  "voting",
  "result"
];

export const stageDurations = {
  lobby: 0,
  briefing: 5 * 60,
  clue_a: 6 * 60,
  discussion_a: 8 * 60,
  clue_b: 6 * 60,
  discussion_b: 8 * 60,
  clue_c: 6 * 60,
  final_discussion: 9 * 60,
  voting: 3 * 60,
  result: 0
};

export function getStageDurationMs(stageKey) {
  return (stageDurations[stageKey] || 0) * 1000;
}

export const readyEligibleStages = [
  "briefing",
  "clue_a",
  "discussion_a",
  "clue_b",
  "discussion_b",
  "clue_c",
  "final_discussion"
];

export const readyVoteThreshold = 0.6;

export function getReadyVoteRequirement(totalPlayers, threshold = readyVoteThreshold) {
  if (!totalPlayers) return 0;
  const clampedThreshold = Math.max(0, Math.min(threshold, 1));
  if (clampedThreshold === 0) {
    return 0;
  }
  if (clampedThreshold >= 1) {
    return totalPlayers;
  }
  const required = Math.ceil(totalPlayers * clampedThreshold);
  return Math.max(1, Math.min(required, totalPlayers));
}

export function isReadyVoteStage(stageKey) {
  return readyEligibleStages.includes(stageKey);
}

export const scenarios = [
  {
    id: "midnight-theater",
    title: "자정의 커튼콜",
    tagline: "중단된 공연 뒤편, 마지막 장면의 진실을 추격하라",
    difficulty: "중급",
    tone: "네오 누아르",
    duration: "120분",
    playerRange: { min: 4, max: 7 },
    summary:
      "대형 뮤지컬의 프리뷰 공연이 끝나고 10분 후, 주연 배우가 무대 뒤에서 의식을 잃은 채 발견됩니다. 모든 출연진은 무대 장치 리허설 중이었고, 외부인은 출입이 통제된 상황. 무대 감독인 당신은 해체되는 무대의 위험 요소와 숨겨진 경쟁을 파헤쳐야 합니다.",
    motifs: [
      "라이브 방송 준비로 모든 동선이 실시간 기록됨",
      "경쟁 극단에서 스파이를 심었다는 소문",
      "주연 배우가 계약 연장을 놓고 제작사와 갈등"
    ],
    conflicts: [
      "사건 직전 마지막으로 피해자를 본 사람은 누구인가?",
      "무대 장치가 의도적으로 조작되었는가?",
      "피해자의 백스테이지 이동 기록이 조작되었는가?"
    ],
    prompts: [
      "커튼콜 직전 피해자의 이동 경로를 아는 사람은 누구인가?",
      "삭제된 음성 메시지를 복구하거나 누가 삭제했는지 규명할 수 있는가?",
      "무대 장치 조작이 단독 범행인지 공모인지 여부"
    ],
    timeline: [
      { time: "18:30", description: "전체 출연진 무대 리허설 시작" },
      { time: "19:10", description: "피해자가 분장실에서 통화하는 모습 목격" },
      { time: "19:25", description: "조명 담당이 2막 세트를 점검 (피해자 동선과 겹침)" },
      { time: "19:40", description: "프리뷰 공연 종료, 커튼콜 진행" },
      { time: "19:45", description: "피해자가 무대 뒤 패널 존에서 의식을 잃은 채 발견" }
    ],
    evidence: {
      physical: [
        "무대 장치용 와이어가 절단된 흔적",
        "피해자의 대본에서 찢겨나간 마지막 장면의 페이지",
        "백스테이지 열쇠가 한 개 분실되어 보안 캐비넷이 강제로 열림"
      ],
      digital: [
        "무대 감시 카메라 19:20~19:30 공백 구간",
        "피해자 휴대전화 메신저에 삭제된 음성 메시지",
        "스트리밍 서버 로그에서 비인가 접속 시도 2회"
      ],
      visual: [
        {
          type: "message",
          title: "문자 메시지 기록",
          description: "피해자가 커튼콜 직전 문지후에게 보낸 메시지",
          html: "<div style='background: #f0f0f0; padding: 15px; border-radius: 10px; max-width: 300px; font-family: -apple-system, sans-serif;'><div style='background: #dcf8c6; padding: 12px; border-radius: 7px; margin-bottom: 8px;'><div style='font-size: 11px; color: #666; margin-bottom: 4px;'>발신: 한서율</div><div style='font-size: 14px;'>지후야, 대타 준비해둬. 내가 무리한 것 같아.</div><div style='text-align: right; font-size: 11px; color: #999; margin-top: 4px;'>19:35</div></div><div style='background: #fff; padding: 12px; border-radius: 7px;'><div style='font-size: 11px; color: #666; margin-bottom: 4px;'>수신: 문지후</div><div style='font-size: 14px;'>진짜요? 지금 말씀하시면...</div><div style='text-align: right; font-size: 11px; color: #999; margin-top: 4px;'>19:36</div></div></div>"
        },
        {
          type: "document",
          title: "안전 제어 패널 로그",
          description: "사건 당일 무대 안전 시스템 접근 기록",
          html: "<table style='border-collapse: collapse; width: 100%; max-width: 400px; font-size: 13px; font-family: Consolas, monospace; background: #fff; box-shadow: 0 2px 8px rgba(0,0,0,0.1);'><thead><tr style='background: #2c3e50; color: #ecf0f1;'><th style='padding: 10px; border: 1px solid #34495e; text-align: left;'>시간</th><th style='padding: 10px; border: 1px solid #34495e; text-align: left;'>계정</th><th style='padding: 10px; border: 1px solid #34495e; text-align: left;'>동작</th></tr></thead><tbody><tr><td style='padding: 8px; border: 1px solid #ddd;'>19:25:14</td><td style='padding: 8px; border: 1px solid #ddd;'>KJDY</td><td style='padding: 8px; border: 1px solid #ddd;'>시스템 체크</td></tr><tr style='background: #fff3cd;'><td style='padding: 8px; border: 1px solid #ddd;'>19:33:42</td><td style='padding: 8px; border: 1px solid #ddd; font-weight: bold; color: #d9534f;'>BDOH</td><td style='padding: 8px; border: 1px solid #ddd; font-weight: bold;'>안전잠금 해제</td></tr><tr><td style='padding: 8px; border: 1px solid #ddd;'>19:41:03</td><td style='padding: 8px; border: 1px solid #ddd;'>KJDY</td><td style='padding: 8px; border: 1px solid #ddd;'>긴급 점검</td></tr></tbody></table>"
        },
        {
          type: "receipt",
          title: "분장실 열쇠 대여 기록",
          description: "백스테이지 열쇠 대여 및 반납 내역",
          html: "<div style='font-family: monospace; background: linear-gradient(to bottom, #fff 0%, #f9f9f9 100%); padding: 20px; border: 2px solid #333; max-width: 320px; box-shadow: 2px 2px 8px rgba(0,0,0,0.1);'><div style='text-align: center; font-weight: bold; font-size: 16px; margin-bottom: 15px; border-bottom: 2px solid #000; padding-bottom: 10px;'>🔑 백스테이지 열쇠 대여</div><div style='font-size: 13px; line-height: 1.8;'><div style='display: flex; justify-content: space-between; margin: 8px 0;'><span>대여자:</span><span style='font-weight: bold;'>최리안</span></div><div style='display: flex; justify-content: space-between; margin: 8px 0;'><span>대여 시각:</span><span>18:50</span></div><div style='display: flex; justify-content: space-between; margin: 8px 0; color: #d9534f;'><span>반납 상태:</span><span style='font-weight: bold;'>미반납</span></div><div style='border-top: 1px dashed #666; margin: 15px 0; padding-top: 10px; font-size: 11px; color: #666;'>⚠️ 열쇠 #3 분실 신고됨 (19:50)</div></div></div>"
        }
      ]
    },
    characters: [
      {
        name: "한서율",
        title: "주연 배우",
        description:
          "부상 전력이 있으나 무대 복귀를 서두른 인물. 경쟁 극단에서 스카웃 제안이 있었다는 소문이 돌고 있다."
      },
      {
        name: "백도현",
        title: "조명 감독",
        description:
          "무대 안전을 총괄하지만 제작진과 잦은 충돌을 겪었다. 전날 퇴사 의사를 밝혔다."
      },
      {
        name: "문지후",
        title: "스윙 배우",
        description:
          "주연 대체 후보. 커튼콜 전 피해자와 말다툼을 벌였다. 무대 장치 조작에 능숙하다."
      },
      {
        name: "윤가빈",
        title: "제작사 홍보팀",
        description:
          "라이브 커머스 연동 프로젝트를 총괄. 공연 흥행을 위해 사건을 활용하려는 듯한 발언을 남겼다."
      },
      {
        name: "최리안",
        title: "분장 스태프",
        description:
          "분장실 키를 관리한다. 사건 직전 피해자가 누군가에게 부탁받은 듯 조용히 나간 것을 보았다."
      }
    ],
    roles: {
      detective: [
        {
          name: "김도윤",
          title: "무대 감독",
          briefing:
            "당신은 무대 전반을 통제하는 감독입니다. 안전 제어 패널과 무전 로그를 누구보다 빠르게 조회할 수 있습니다. 진실을 끄집어내기 위해 얻은 정보의 신빙성을 검토하세요.",
          truths: [
            "안전 제어 패널 로그에는 19:33에 'BDOH' 계정으로 안전잠금 해제 기록이 남아 있습니다. 이는 조명팀 전용 계정입니다.",
            "와이어 잠금 장치에서 조명팀 전용 절연 장갑 섬유가 발견되었습니다."
          ],
          misdirections: [
            "라이브 스트리밍 서버의 비인가 접속은 윤가빈이 관리하는 태블릿에서 발생한 것으로 보입니다.",
            "피해자가 커튼콜 직전 문지후에게 '대타 준비'라는 문자를 보냈습니다."
          ],
          timeline: [
            {"time": "18:30", "action": "전체 출연진과 함께 무대 리허설 참여"},
            {"time": "19:15", "action": "무대 감독실에서 안전 제어 패널 점검"},
            {"time": "19:40", "action": "커튼콜 시작, 무대 뒤에서 대기"}
          ],
          suggestedQuestions: [
            "안전 제어 패널 로그를 누가 확인했는가?",
            "와이어 잠금 장치를 누가 마지막으로 만졌는가?"
          ],
          keyConflicts: [
            "진실을 밝히는 것과 극단의 명성을 지키는 것 사이의 갈등"
          ],
          visualEvidence: {
            "clue_a": [
              {
                "type": "document",
                "title": "안전 제어 패널 로그",
                "description": "사건 당일 무대 안전 시스템 접근 기록",
                "html": "<table style='border-collapse: collapse; width: 100%; max-width: 400px; font-size: 13px; font-family: Consolas, monospace; background: #fff; box-shadow: 0 2px 8px rgba(0,0,0,0.1);'><thead><tr style='background: #2c3e50; color: #ecf0f1;'><th style='padding: 10px; border: 1px solid #34495e; text-align: left;'>시간</th><th style='padding: 10px; border: 1px solid #34495e; text-align: left;'>계정</th><th style='padding: 10px; border: 1px solid #34495e; text-align: left;'>동작</th></tr></thead><tbody><tr><td style='padding: 8px; border: 1px solid #ddd;'>19:25:14</td><td style='padding: 8px; border: 1px solid #ddd;'>KJDY</td><td style='padding: 8px; border: 1px solid #ddd;'>시스템 체크</td></tr><tr style='background: #fff3cd;'><td style='padding: 8px; border: 1px solid #ddd;'>19:33:42</td><td style='padding: 8px; border: 1px solid #ddd; font-weight: bold; color: #d9534f;'>BDOH</td><td style='padding: 8px; border: 1px solid #ddd; font-weight: bold;'>안전잠금 해제</td></tr><tr><td style='padding: 8px; border: 1px solid #ddd;'>19:41:03</td><td style='padding: 8px; border: 1px solid #ddd;'>KJDY</td><td style='padding: 8px; border: 1px solid #ddd;'>긴급 점검</td></tr></tbody></table>",
                "imagePrompt": "A digital panel log screen with highlighted suspicious entry showing BDOH account accessing safety lock system at 19:33"
              }
            ],
            "clue_b": [
              {
                "type": "receipt",
                "title": "조명 장갑 관리 대장",
                "description": "조명팀 전용 절연 장갑 대출 기록",
                "html": "<div style='font-family: monospace; background: linear-gradient(to bottom, #fff 0%, #f9f9f9 100%); padding: 20px; border: 2px solid #333; max-width: 320px; box-shadow: 2px 2px 8px rgba(0,0,0,0.1);'><div style='text-align: center; font-weight: bold; font-size: 16px; margin-bottom: 15px; border-bottom: 2px solid #000; padding-bottom: 10px;'>🧤 절연 장갑 대출 기록</div><div style='font-size: 13px; line-height: 1.8;'><div style='display: flex; justify-content: space-between; margin: 8px 0;'><span>대출자:</span><span style='font-weight: bold;'>백도현 (조명팀)</span></div><div style='display: flex; justify-content: space-between; margin: 8px 0;'><span>대출 시각:</span><span>19:20</span></div><div style='display: flex; justify-content: space-between; margin: 8px 0;'><span>용도:</span><span>와이어 점검</span></div><div style='display: flex; justify-content: space-between; margin: 8px 0; color: #d9534f;'><span>반납 상태:</span><span style='font-weight: bold;'>19:45 반납</span></div><div style='border-top: 1px dashed #666; margin: 15px 0; padding-top: 10px; font-size: 11px; color: #666;'>⚠️ 장갑에서 와이어 섬유 검출됨</div></div></div>",
                "imagePrompt": "A checkout log showing insulated gloves borrowed by lighting team member with wire fiber contamination note"
              }
            ],
            "clue_c": [
              {
                "type": "photo",
                "title": "와이어 잠금 장치 근접 촬영",
                "description": "범행 도구에서 발견된 결정적 흔적",
                "html": "<div style='background: #000; padding: 20px; border-radius: 8px; max-width: 380px; box-shadow: 0 4px 12px rgba(0,0,0,0.3);'><div style='background: #fff; padding: 15px; border-radius: 4px;'><div style='text-align: center; margin-bottom: 10px; font-weight: bold; font-size: 14px; color: #333;'>📸 범죄 현장 사진 #17</div><div style='background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); height: 150px; display: flex; align-items: center; justify-content: center; margin: 10px 0; border-radius: 4px;'><div style='color: #fff; font-size: 48px;'>🔧</div></div><div style='font-size: 12px; line-height: 1.6; color: #333; padding: 10px; background: #f8f9fa; border-left: 4px solid #d9534f;'><strong>증거 #17:</strong> 와이어 잠금 장치에서 조명 오일과 절연 장갑 섬유가 동시에 검출됨. 장갑은 조명팀 전용 장비로, 19:20에 백도현이 대출한 기록이 있음.</div><div style='text-align: right; font-size: 11px; color: #999; margin-top: 10px;'>포렌식 팀 | 2024-10-19 20:15</div></div></div>",
                "imagePrompt": "A forensic photograph showing a wire lock mechanism with highlighted areas indicating oil traces and insulated glove fibers"
              }
            ]
          }
        }
      ],
      culprit: [
        {
          name: "백도현",
          title: "조명 감독",
          briefing:
            "당신은 와이어 잠금 장치를 해제해 피해자를 낙상시킨 범인입니다. 안전 결함을 장비 탓으로 돌리고, 공연 성공을 바라는 타인의 욕심을 이용해 의심을 분산시켜야 합니다.",
          truths: [
            "당신은 19:32에 비상 패널에서 안전 잠금을 해제하고, 백스테이지 조명 스위치를 오프라인 모드로 전환했습니다.",
            "문지후와의 언쟁 직후, 최리안이 분장실 키를 찾으러 온 것을 목격했습니다. 그가 당신의 위치를 정확히 기억하지 못하길 바랍니다."
          ],
          misdirections: [
            "윤가빈이 스트리밍 흥행을 위해 위험을 감수하자고 제안했다는 이야기를 흘리십시오.",
            "피해자가 새 계약 문제로 제작사와 갈등했다는 사실을 강조해 내부 배신을 암시하십시오."
          ],
          exposed: [
            "무대 감시 카메라 공백 직후, 당신이 비상 패널에 접근했다는 로그가 남아 있습니다.",
            "안전장치 절단 흔적에서 조명팀 전용 절연 장갑 섬유가 검출되었습니다."
          ],
          timeline: [
            {"time": "18:30", "action": "조명 리허설 진행"},
            {"time": "19:32", "action": "비상 패널에서 안전 잠금 해제 (범행)"},
            {"time": "19:40", "action": "커튼콜 참관, 무대 뒤에서 대기"}
          ],
          suggestedQuestions: [
            "조명 시스템이 왜 수동 모드로 전환되었는가?",
            "안전 패널에 누가 접근했는가?"
          ],
          keyConflicts: [
            "퇴사 결정과 마지막 공연의 성공 사이의 갈등",
            "개인적인 원한과 직업적 책임감의 충돌"
          ],
          visualEvidence: {
            "clue_a": [
              {
                "type": "message",
                "title": "삭제된 문자 메시지",
                "description": "범행 직후 백도현이 삭제한 메시지 복구본",
                "html": "<div style='background: #b2c7d9; padding: 20px; border-radius: 12px; max-width: 320px; box-shadow: 0 2px 10px rgba(0,0,0,0.15);'><div style='background: #ffffff; padding: 12px 15px; border-radius: 10px; margin-bottom: 8px;'><div style='font-size: 11px; color: #888; margin-bottom: 5px; font-weight: bold;'>📱 백도현</div><div style='font-size: 14px; line-height: 1.5; color: #000;'>이제 끝났어. 더 이상 이 무대에서 일할 수 없어.</div><div style='text-align: right; font-size: 10px; color: #999; margin-top: 8px;'>19:34 (삭제됨)</div></div><div style='background: #ffe400; padding: 12px 15px; border-radius: 10px; margin-left: 30px;'><div style='font-size: 11px; color: #888; margin-bottom: 5px; font-weight: bold;'>자신에게</div><div style='font-size: 14px; line-height: 1.5; color: #000;'>한서율이 망가지면 모두가 알게 될 거야.</div><div style='text-align: right; font-size: 10px; color: #999; margin-top: 8px;'>19:34 (삭제됨)</div></div><div style='margin-top: 15px; padding: 10px; background: rgba(255,255,255,0.7); border-radius: 8px; font-size: 11px; color: #555;'>⚠️ 이 메시지는 사용자가 삭제한 후 포렌식 도구로 복구되었습니다.</div></div>",
                "imagePrompt": "A recovered deleted text message showing culprit's self-talk about ending career and targeting victim"
              }
            ],
            "clue_b": [
              {
                "type": "document",
                "title": "무대 감시 카메라 타임라인",
                "description": "19:20~19:30 사이 백도현의 동선",
                "html": "<div style='background: #2c3e50; padding: 20px; border-radius: 8px; max-width: 400px; box-shadow: 0 4px 12px rgba(0,0,0,0.2);'><div style='background: #ecf0f1; padding: 15px; border-radius: 4px;'><div style='text-align: center; margin-bottom: 15px; font-weight: bold; font-size: 15px; color: #2c3e50;'>📹 CCTV 타임라인 분석</div><div style='font-size: 12px; line-height: 2; color: #34495e;'><div style='padding: 8px; background: #fff; margin: 5px 0; border-left: 4px solid #3498db; border-radius: 2px;'><strong>19:20:</strong> 백도현, 장갑실 진입</div><div style='padding: 8px; background: #fff; margin: 5px 0; border-left: 4px solid #3498db; border-radius: 2px;'><strong>19:25:</strong> 조명 장갑 대출</div><div style='padding: 8px; background: #fff3cd; margin: 5px 0; border-left: 4px solid #f39c12; border-radius: 2px;'><strong>19:28~19:31:</strong> <span style='color: #d9534f; font-weight: bold;'>카메라 블랙아웃</span></div><div style='padding: 8px; background: #fff; margin: 5px 0; border-left: 4px solid #3498db; border-radius: 2px;'><strong>19:32:</strong> 백도현, 안전 패널 존 진입 확인</div><div style='padding: 8px; background: #fff; margin: 5px 0; border-left: 4px solid #3498db; border-radius: 2px;'><strong>19:35:</strong> 백도현, 조명실 복귀</div></div><div style='margin-top: 15px; padding: 10px; background: rgba(231,76,60,0.1); border-left: 3px solid #e74c3c; font-size: 11px; color: #c0392b;'>⚠️ 블랙아웃 구간에서 안전 패널 조작 추정</div></div></div>",
                "imagePrompt": "A CCTV timeline analysis showing culprit's movement with highlighted blackout period during crime"
              }
            ],
            "clue_c": []
          }
        }
      ],
      suspects: [
        {
          name: "한서율",
          title: "주연 배우",
          summary:
            "부상 사실을 숨긴 채 공연에 복귀한 스타. 경쟁 극단 이적설이 무성하다.",
          briefing:
            "당신은 주연 자리를 지키기 위해 무엇이든 할 각오가 되어 있습니다. 하지만 범인이 누구인지 정확히 짚어내야 당신에게 드리운 의심을 거둘 수 있습니다.",
          truths: [
            "리허설 종료 후 백도현이 와이어 안전고리를 꺼내 두 손으로 점검하는 모습을 봤습니다.",
            "무대 위에서 타이머를 맞추던 백도현이 '이제 한 번만 더 내리면 된다'고 혼잣말하는 것을 들었습니다."
          ],
          misdirections: [
            "윤가빈이 라이브 방송에 사고 장면을 그대로 내보내자고 했다는 소문을 들었습니다.",
            "문지후가 피해자에게 '다음 장면은 네가 필요 없다'고 말하는 것을 들었습니다."
          ],
          timeline: [
            {"time": "18:30", "action": "무대 리허설 참여"},
            {"time": "19:10", "action": "분장실에서 통화 (경쟁 극단 PD와)"},
            {"time": "19:40", "action": "커튼콜 진행"}
          ],
          suggestedQuestions: [
            "백도현이 와이어 안전고리를 왜 점검했는가?",
            "누가 와이어 잠금 장치를 해제했는가?"
          ],
          keyConflicts: [
            "주연 자리를 지키려는 욕심과 안전에 대한 불안"
          ],
          visualEvidence: {
            "clue_a": [
              {
                "type": "message",
                "title": "피해자가 보낸 경고 문자",
                "description": "한서율이 커튼콜 직전 문지후에게 보낸 메시지",
                "html": "<div style='background: #f0f0f0; padding: 15px; border-radius: 10px; max-width: 300px; font-family: -apple-system, sans-serif;'><div style='background: #dcf8c6; padding: 12px; border-radius: 7px; margin-bottom: 8px;'><div style='font-size: 11px; color: #666; margin-bottom: 4px;'>발신: 한서율</div><div style='font-size: 14px;'>지후야, 대타 준비해둬. 내가 무리한 것 같아.</div><div style='text-align: right; font-size: 11px; color: #999; margin-top: 4px;'>19:35</div></div><div style='background: #fff; padding: 12px; border-radius: 7px;'><div style='font-size: 11px; color: #666; margin-bottom: 4px;'>수신: 문지후</div><div style='font-size: 14px;'>진짜요? 지금 말씀하시면...</div><div style='text-align: right; font-size: 11px; color: #999; margin-top: 4px;'>19:36</div></div></div>",
                "imagePrompt": "Text message conversation showing victim warning about needing a replacement just before the incident"
              }
            ],
            "clue_b": [],
            "clue_c": [
              {
                "type": "photo",
                "title": "백도현의 혼잣말 녹음",
                "description": "리허설 중 한서율이 녹음한 오디오 파일",
                "html": "<div style='background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; border-radius: 12px; max-width: 350px; box-shadow: 0 4px 16px rgba(0,0,0,0.2);'><div style='background: #fff; padding: 15px; border-radius: 8px;'><div style='text-align: center; margin-bottom: 15px;'><div style='font-size: 32px; margin-bottom: 5px;'>🎙️</div><div style='font-weight: bold; font-size: 14px; color: #333;'>음성 녹음 파일</div></div><div style='background: #f8f9fa; padding: 15px; border-radius: 6px; margin: 10px 0;'><div style='font-size: 12px; color: #666; margin-bottom: 8px;'>녹음 시각: 19:28</div><div style='font-size: 12px; color: #666; margin-bottom: 8px;'>위치: 무대 뒤편</div><div style='background: #fff; padding: 12px; border-left: 4px solid #e74c3c; margin-top: 10px; font-style: italic; color: #555;'>\"이제 한 번만 더 내리면 된다... 모두가 알게 될 거야.\"</div><div style='font-size: 11px; color: #999; margin-top: 8px; text-align: right;'>- 백도현의 목소리로 추정</div></div></div></div>",
                "imagePrompt": "An audio recording interface showing waveform with transcript of culprit's self-talk about 'one more time'"
              }
            ]
          }
        },
        {
          name: "문지후",
          title: "스윙 배우",
          summary:
            "주연 대체 후보. 커튼콜 직전 피해자와 말다툼을 벌였다.",
          briefing:
            "당신은 대타 기회를 노리고 있었지만, 진짜 범인이 아니라는 사실을 입증해야 합니다. 동시에 자신이 본 것을 공유해야 합니다.",
          truths: [
            "백도현이 조명 테스트를 이유로 패널 존을 홀로 비우게 해 달라고 요구했습니다.",
            "와이어 교체 시간표에 백도현의 이름이 두 번 겹쳐 적혀 있는 것을 발견했습니다."
          ],
          misdirections: [
            "한서율이 무대 진입 전, 누군가와 몰래 통화하며 '이제 끝내자'고 말했습니다.",
            "스트리밍 서버 접근 기록에 홍보팀 공용 계정이 여러 번 등장했습니다."
          ],
          timeline: [
            {"time": "18:30", "action": "대기실에서 대본 복습"},
            {"time": "19:20", "action": "백도현과 조명 테스트 관련 대화"},
            {"time": "19:35", "action": "피해자에게 문자 메시지 수신"}
          ],
          suggestedQuestions: [
            "백도현이 패널 존을 왜 혼자 비우고 싶어 했는가?",
            "와이어 교체 시간표에 이름이 왜 두 번 적혀 있는가?"
          ],
          keyConflicts: [
            "대타 기회에 대한 욕심과 동료에 대한 죄책감"
          ],
          visualEvidence: {
            "clue_a": [],
            "clue_b": [
              {
                "type": "document",
                "title": "와이어 교체 시간표",
                "description": "백도현의 이름이 두 번 겹쳐 적힌 이상한 시간표",
                "html": "<div style='font-family: monospace; background: linear-gradient(to bottom, #fff 0%, #f9f9f9 100%); padding: 20px; border: 2px solid #333; max-width: 350px; box-shadow: 2px 2px 8px rgba(0,0,0,0.1);'><div style='text-align: center; font-weight: bold; font-size: 16px; margin-bottom: 15px; border-bottom: 2px solid #000; padding-bottom: 10px;'>⚙️ 와이어 교체 시간표</div><div style='font-size: 13px; line-height: 1.8;'><div style='padding: 8px; margin: 5px 0; background: #fff;'><strong>10월 18일:</strong> 김민수</div><div style='padding: 8px; margin: 5px 0; background: #fff;'><strong>10월 19일:</strong> <span style='color: #d9534f; font-weight: bold;'>백도현</span></div><div style='padding: 8px; margin: 5px 0; background: #fff3cd; border: 2px dashed #f39c12;'><strong>10월 19일:</strong> <span style='color: #d9534f; font-weight: bold;'>백도현</span> (중복)</div><div style='padding: 8px; margin: 5px 0; background: #fff;'><strong>10월 20일:</strong> 이지훈</div></div><div style='margin-top: 15px; padding: 10px; background: rgba(255,0,0,0.05); border-left: 3px solid #e74c3c; font-size: 11px; color: #c0392b;'>⚠️ 같은 날 두 번 배정된 것은 이례적임</div></div>",
                "imagePrompt": "A wire maintenance schedule showing culprit's name listed twice on the same day"
              }
            ],
            "clue_c": [
              {
                "type": "message",
                "title": "백도현의 요구 메시지",
                "description": "패널 존을 비워달라는 백도현의 요청",
                "html": "<div style='background: #b2c7d9; padding: 20px; border-radius: 12px; max-width: 320px; box-shadow: 0 2px 10px rgba(0,0,0,0.15);'><div style='background: #ffffff; padding: 12px 15px; border-radius: 10px; margin-bottom: 8px;'><div style='font-size: 11px; color: #888; margin-bottom: 5px; font-weight: bold;'>📱 백도현</div><div style='font-size: 14px; line-height: 1.5; color: #000;'>지후야, 조명 테스트 때문에 패널 존 좀 비워줄 수 있어? 혼자서 집중해서 해야 해.</div><div style='text-align: right; font-size: 10px; color: #999; margin-top: 8px;'>19:25</div></div><div style='background: #ffe400; padding: 12px 15px; border-radius: 10px; margin-left: 30px;'><div style='font-size: 11px; color: #888; margin-bottom: 5px; font-weight: bold;'>문지후</div><div style='font-size: 14px; line-height: 1.5; color: #000;'>알겠습니다. 대기실에 있을게요.</div><div style='text-align: right; font-size: 10px; color: #999; margin-top: 8px;'>19:26</div></div></div>",
                "imagePrompt": "Text message showing culprit asking suspect to clear the panel zone for lighting test"
              }
            ]
          }
        },
        {
          name: "윤가빈",
          title: "제작사 홍보팀",
          summary:
            "라이브 커머스 연동 프로젝트를 총괄. 사건을 흥행 요소로 활용하려 한다.",
          briefing:
            "당신은 홍보 성과를 위해 위험을 감수하려 하지만 살인까지 저지를 사람은 아닙니다. 대신 디지털 흔적을 통해 진범을 찾아야 합니다.",
          truths: [
            "조명 콘솔 계정 'BDOH'는 백도현만 사용하는 개인 계정입니다.",
            "19:28 이후 조명 시스템이 수동 모드로 전환되면서 와이어 센서 로그가 끊겼습니다."
          ],
          misdirections: [
            "분장실 열쇠가 사라진 시간대에 최리안이 자리를 비웠다는 보고를 받았습니다.",
            "피해자가 경쟁 극단 PD와 메시지를 주고받았다는 사실을 알아냈습니다."
          ],
          timeline: [
            {"time": "18:30", "action": "홍보팀 사무실에서 라이브 스트리밍 준비"},
            {"time": "19:15", "action": "무대 뒤에서 스트리밍 서버 점검"},
            {"time": "19:40", "action": "커튼콜 라이브 송출 모니터링"}
          ],
          suggestedQuestions: [
            "조명 콘솔 계정 'BDOH'는 누구의 계정인가?",
            "조명 시스템이 언제 수동 모드로 전환되었는가?"
          ],
          keyConflicts: [
            "홍행 성과와 윤리적 책임 사이의 갈등"
          ],
          visualEvidence: {
            "clue_a": [
              {
                "type": "document",
                "title": "조명 콘솔 계정 목록",
                "description": "조명 시스템 접근 권한이 있는 계정 리스트",
                "html": "<table style='border-collapse: collapse; width: 100%; max-width: 400px; font-size: 13px; font-family: Consolas, monospace; background: #fff; box-shadow: 0 2px 8px rgba(0,0,0,0.1);'><thead><tr style='background: #34495e; color: #ecf0f1;'><th style='padding: 10px; border: 1px solid #2c3e50; text-align: left;'>계정명</th><th style='padding: 10px; border: 1px solid #2c3e50; text-align: left;'>사용자</th><th style='padding: 10px; border: 1px solid #2c3e50; text-align: left;'>권한</th></tr></thead><tbody><tr><td style='padding: 8px; border: 1px solid #ddd;'>ADMIN</td><td style='padding: 8px; border: 1px solid #ddd;'>김도윤</td><td style='padding: 8px; border: 1px solid #ddd;'>전체</td></tr><tr style='background: #fff3cd;'><td style='padding: 8px; border: 1px solid #ddd; font-weight: bold; color: #d9534f;'>BDOH</td><td style='padding: 8px; border: 1px solid #ddd; font-weight: bold;'>백도현</td><td style='padding: 8px; border: 1px solid #ddd;'>조명/안전</td></tr><tr><td style='padding: 8px; border: 1px solid #ddd;'>TECH01</td><td style='padding: 8px; border: 1px solid #ddd;'>문지후</td><td style='padding: 8px; border: 1px solid #ddd;'>음향</td></tr><tr><td style='padding: 8px; border: 1px solid #ddd;'>PROMO</td><td style='padding: 8px; border: 1px solid #ddd;'>윤가빈</td><td style='padding: 8px; border: 1px solid #ddd;'>스트리밍</td></tr></tbody></table>",
                "imagePrompt": "A user account list showing BDOH account belongs exclusively to the lighting director"
              }
            ],
            "clue_b": [
              {
                "type": "chart",
                "title": "와이어 센서 로그 차트",
                "description": "조명 시스템 수동 모드 전환 시점",
                "html": "<div style='background: #fff; padding: 20px; border: 2px solid #ddd; border-radius: 8px; max-width: 400px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);'><div style='text-align: center; font-weight: bold; font-size: 15px; margin-bottom: 15px; color: #2c3e50;'>📊 와이어 센서 로그</div><div style='height: 180px; position: relative; background: linear-gradient(to right, #f8f9fa 0%, #f8f9fa 60%, #ffebee 60%, #ffebee 100%); border: 1px solid #ddd; border-radius: 4px; padding: 15px;'><div style='position: absolute; top: 10px; left: 10px; font-size: 11px; color: #666;'>센서 활성도</div><div style='position: absolute; bottom: 40px; left: 15px; right: 15px; height: 100px; background: linear-gradient(to top, #3498db 0%, #3498db 60%, transparent 60%); border-radius: 2px;'></div><div style='position: absolute; bottom: 40px; right: 60px; width: 100px; height: 20px; background: #e74c3c; border-radius: 2px;'></div><div style='position: absolute; bottom: 10px; left: 15px; right: 15px; display: flex; justify-content: space-between; font-size: 11px; color: #666;'><span>19:00</span><span>19:15</span><span style='color: #e74c3c; font-weight: bold;'>19:28</span><span>19:45</span></div></div><div style='margin-top: 15px; padding: 10px; background: #ffebee; border-left: 3px solid #e74c3c; font-size: 12px; color: #c0392b;'><strong>19:28:</strong> 조명 시스템이 수동 모드로 전환되면서 와이어 센서 로그가 끊김</div></div>",
                "imagePrompt": "A sensor activity chart showing system switching to manual mode at 19:28 causing log blackout"
              }
            ],
            "clue_c": []
          }
        },
        {
          name: "최리안",
          title: "분장 스태프",
          summary:
            "분장실 키를 관리하는 인물. 피해자의 마지막 동선을 확인한 증인.",
          briefing:
            "당신은 분장실과 백스테이지를 잇는 마지막 목격자입니다. 기억을 되살려 사실을 전달하는 것이 중요합니다.",
          truths: [
            "백도현이 분장실 키 캐비닛을 잠깐 열어보더니 바로 닫았습니다.",
            "피해자가 쓰러진 곳의 바닥에는 조명 오일 냄새가 강하게 났습니다."
          ],
          misdirections: [
            "한서율이 공연 직전 무릎을 붙잡고 통증을 호소하며 쉬자고 제안했습니다.",
            "문지후 가방에서 와이어 조정 렌치가 발견됐습니다."
          ],
          timeline: [
            {"time": "18:30", "action": "분장실에서 출연진 분장 작업"},
            {"time": "19:25", "action": "백도현이 키 캐비닛을 열어보는 것 목격"},
            {"time": "19:40", "action": "피해자 발견 현장에서 조명 오일 냄새 확인"}
          ],
          suggestedQuestions: [
            "백도현이 키 캐비닛을 왜 열어봤는가?",
            "조명 오일이 왜 그곳에 있었는가?"
          ],
          keyConflicts: [
            "목격자로서의 책임감과 동료들을 의심하기 싫은 마음"
          ],
          visualEvidence: {
            "clue_a": [
              {
                "type": "receipt",
                "title": "분장실 열쇠 대여 기록",
                "description": "백스테이지 열쇠 대여 및 반납 내역",
                "html": "<div style='font-family: monospace; background: linear-gradient(to bottom, #fff 0%, #f9f9f9 100%); padding: 20px; border: 2px solid #333; max-width: 320px; box-shadow: 2px 2px 8px rgba(0,0,0,0.1);'><div style='text-align: center; font-weight: bold; font-size: 16px; margin-bottom: 15px; border-bottom: 2px solid #000; padding-bottom: 10px;'>🔑 백스테이지 열쇠 대여</div><div style='font-size: 13px; line-height: 1.8;'><div style='display: flex; justify-content: space-between; margin: 8px 0;'><span>대여자:</span><span style='font-weight: bold;'>최리안</span></div><div style='display: flex; justify-content: space-between; margin: 8px 0;'><span>대여 시각:</span><span>18:50</span></div><div style='display: flex; justify-content: space-between; margin: 8px 0; color: #d9534f;'><span>반납 상태:</span><span style='font-weight: bold;'>미반납</span></div><div style='border-top: 1px dashed #666; margin: 15px 0; padding-top: 10px; font-size: 11px; color: #666;'>⚠️ 열쇠 #3 분실 신고됨 (19:50)</div></div></div>",
                "imagePrompt": "A key checkout record showing unreturned backstage key with lost report"
              }
            ],
            "clue_b": [],
            "clue_c": [
              {
                "type": "photo",
                "title": "조명 오일 흔적 분석",
                "description": "피해자 발견 현장에서 채취한 샘플",
                "html": "<div style='background: #000; padding: 20px; border-radius: 8px; max-width: 380px; box-shadow: 0 4px 12px rgba(0,0,0,0.3);'><div style='background: #fff; padding: 15px; border-radius: 4px;'><div style='text-align: center; margin-bottom: 10px; font-weight: bold; font-size: 14px; color: #333;'>🔬 포렌식 분석 보고서</div><div style='background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%); height: 120px; display: flex; align-items: center; justify-content: center; margin: 10px 0; border-radius: 4px;'><div style='color: #fff; font-size: 42px;'>🧪</div></div><div style='font-size: 12px; line-height: 1.6; color: #333; padding: 10px; background: #f8f9fa;'><div style='margin: 8px 0;'><strong>샘플 위치:</strong> 피해자 발견 현장 바닥</div><div style='margin: 8px 0;'><strong>물질:</strong> 조명 장비용 특수 오일</div><div style='padding: 10px; background: #fff; border-left: 4px solid #e74c3c; margin-top: 10px;'><strong>분석 결과:</strong> 조명팀이 사용하는 와이어 윤활유와 성분이 일치함. 최근 24시간 이내 묻은 것으로 추정.</div></div><div style='text-align: right; font-size: 11px; color: #999; margin-top: 10px;'>포렌식 연구소 | 2024-10-19 21:30</div></div></div>",
                "imagePrompt": "A forensic analysis report showing lighting oil traces matching wire lubricant used by lighting team"
              }
            ]
          }
        }
      ]
    }
  },
  {
    id: "winter-lodge",
    title: "겨울 산장의 봉인",
    tagline: "폭설로 고립된 로지, 은폐된 거래를 밝혀라",
    difficulty: "상급",
    tone: "서스펜스",
    duration: "150분",
    playerRange: { min: 5, max: 8 },
    summary:
      "폐쇄 투자 모임이 열리는 고급 산장에서 주최자가 의문사한 채 발견됩니다. 폭설로 인해 외부와 단절된 상황에서 참가자들은 서로의 비밀을 숨기고 있습니다. 제한된 통신 장비와 손상된 발전기를 복구해 탈출 시간을 확보해야 합니다.",
    motifs: [
      "지하 안전 금고가 비상시에만 열리는 구조",
      "위성 전화가 고장 나고 아날로그 무전기만 사용 가능",
      "투자 계약서 원본이 산장 어딘가에 숨겨져 있음"
    ],
    conflicts: [
      "누가 발전기 차단기를 내렸는가?",
      "주최자는 왜 개인 금고를 비우지 못했는가?",
      "산장에 침입자가 더 있었을 가능성이 있는가?"
    ],
    prompts: [
      "전력 차단이 우연인지 계획적 범행인지 구분",
      "주최자가 감추려던 거래 기록의 성격 파악",
      "무전기로 연결된 외부 인물이 있었는지 확인"
    ],
    timeline: [
      { time: "20:00", description: "투자 모임 웰컴 디너 시작" },
      { time: "21:10", description: "주최자가 개인 서재에서 마지막 통화를 함" },
      { time: "21:40", description: "전기가 5분간 끊기고 비상 발전기 가동" },
      { time: "21:55", description: "참가자 전원이 로비에 모여 주최자를 찾기 시작" },
      { time: "22:05", description: "지하 금고 앞에서 주최자 시신 발견" }
    ],
    evidence: {
      physical: [
        { display: "금고 앞 바닥에 남은 미세한 석유 얼룩", time: "22:05", visualElements: ["석유 얼룩 사진"] },
        { display: "주최자 수첩에서 찢겨나간 익명 메모", time: "21:10", visualElements: ["수첩 페이지 사진"] },
        { display: "위성 전화 배터리가 고의로 제거된 흔적", time: "21:55", visualElements: ["전화 사진"] }
      ],
      digital: [
        { display: "주최자 노트북에 암호화된 거래 기록", time: "21:10", visualElements: ["노트북 스크린샷"] },
        { display: "비상 발전기 제어 패널 로그", time: "21:40", visualElements: ["패널 로그 스크린샷"] },
        { display: "참가자 중 한 명의 스마트워치 위치 기록", time: "21:35-22:05", visualElements: ["워치 로그 스크린샷"] }
      ]
    },
    characters: [
      {
        name: "이하준",
        title: "헤지펀드 매니저",
        description: "주최자와 공동 투자 계약 파기를 두고 소송 중이었다."
      },
      {
        name: "박세은",
        title: "테크 스타트업 CEO",
        description: "주최자의 지분 회수를 조건으로 산장에 초대됐다. 발전기 구조에 익숙하다."
      },
      {
        name: "정민오",
        title: "산장 관리자",
        description: "폭설 대비를 책임졌으나 발전기 점검을 미루었다. 산장의 비밀 통로를 알고 있다."
      },
      {
        name: "개브리엘 최",
        title: "사설 탐정",
        description: "누군가에게 의뢰받아 모임에 잠입했다. 사건 직후 금고 주변에서 목격됨."
      },
      {
        name: "엘라 김",
        title: "예술품 브로커",
        description: "주최자에게 투자 사기를 당해 복수하려 했다."
      },
      {
        name: "카밀라 윤",
        title: "위성 통신 엔지니어",
        description: "위성 전화 유지보수를 맡았으나 배터리를 회수했다."
      }
    ],
    roles: {
      detective: [
        {
          name: "개브리엘 최",
          title: "사설 탐정",
          briefing:
            "당신은 의뢰를 받아 잠입한 사설 탐정입니다. 주최자가 숨기려 했던 거래 기록과 전력 차단 타이밍의 연관성을 파헤치십시오.",
          truths: [
            "발전기 차단기는 두 차례 내려갔고, 첫 번째는 21:37에 매뉴얼로 조작되었습니다.",
            "주최자의 노트북에서 'FuelReserve_BD'라는 파일이 암호화되어 있으며, 이는 이하준의 별칭과 일치합니다."
          ],
          misdirections: [
            "카밀라 윤의 작업 가방에서 위성 전화 배터리가 발견되었습니다.",
            "정민오가 비밀 통로 설계도를 숨겼다는 제보를 들었습니다."
          ]
        }
      ],
      culprit: [
        {
          name: "이하준",
          title: "헤지펀드 매니저",
          briefing:
            "당신은 몰락을 피하기 위해 주최자의 금고에서 계약 원본을 빼내려 했고, 저항하던 주최자를 살해했습니다. 폭설 속에서도 의심을 분산시켜야 합니다.",
          truths: [
            "당신은 비상 발전기 연료 탱크에 미량의 석유를 흘려 흔적을 남겼습니다.",
            "주최자의 금고 비밀번호 변경 시도를 당신이 가로막았고, 무전기로 엿들은 개브리엘이 이를 알고 있습니다."
          ],
          misdirections: [
            "전력 차단 직후 박세은이 발전기실에서 땀에 젖은 모습으로 나왔다는 이야기를 강조하십시오.",
            "주최자 수첩에서 스타트업 투자 취소 메모가 발견되었다는 사실을 부각시키십시오."
          ],
          exposed: [
            "금고 앞 석유 얼룩은 당신의 보조 연료통에서 흘러나온 것입니다.",
            "스마트워치 기록상 21:35~21:45 동안 당신은 금고 구역에 머물렀습니다."
          ]
        }
      ],
      suspects: [
        {
          name: "박세은",
          title: "스타트업 CEO",
          summary:
            "발전기 제어 패널에 익숙한 기술 창업가. 계약 복원을 원한다.",
          briefing:
            "당신은 발전기 제어를 도왔지만 살인은 저지르지 않았습니다. 대신 로그가 조작되었음을 입증해야 합니다.",
          truths: [
            "발전기 제어 패널에 'Manual Override: Manual Lever 2' 로그가 21:37에 남아 있습니다.",
            "주최자가 위성 전화로 '계약서를 지키면 다 끝난다'고 말하는 것을 들었습니다."
          ],
          misdirections: [
            "정민오가 비밀 통로의 눈을 치우지 않았다는 사실을 발표했습니다.",
            "카밀라 윤이 위성 전화 배터리를 챙긴 뒤 어딘가에 숨겼습니다."
          ]
        },
        {
          name: "정민오",
          title: "산장 관리자",
          summary:
            "산장의 모든 설비를 책임진 관리자. 폭설 대비를 총괄했다.",
          briefing:
            "당신은 설비를 지켰지만 범행을 저지르지 않았습니다. 대신 외부 침입 가능성을 입증하거나 진범을 지목해야 합니다.",
          truths: [
            "이하준이 몰래 창고에서 예비 연료통을 챙겨 나가는 것을 봤습니다.",
            "비밀 통로는 폭설로 막혀 실제로 사용할 수 없었습니다."
          ],
          misdirections: [
            "엘라 김이 주최자에게 사기를 당해 복수하려 했다는 소문이 있습니다.",
            "개브리엘 최가 금고 앞에 가장 먼저 도착했습니다."
          ]
        },
        {
          name: "엘라 김",
          title: "예술품 브로커",
          summary:
            "주최자에게 사기를 당했고 복수를 다짐했다.",
          briefing:
            "당신은 분노했지만 살인을 저지르지는 않았습니다. 대신 누가 계약서를 노렸는지 밝혀야 합니다.",
          truths: [
            "이하준이 주최자 노트북 암호를 알고 있다는 사실을 목격했습니다.",
            "주최자가 금고에서 꺼내려던 계약서는 이하준과의 공동 투자 계약서였습니다."
          ],
          misdirections: [
            "박세은이 발전기 매뉴얼을 몰래 가져갔습니다.",
            "카밀라 윤이 위성 전화 로그를 지웠다는 이야기를 들었습니다."
          ]
        },
        {
          name: "카밀라 윤",
          title: "위성 통신 엔지니어",
          summary:
            "위성 전화 유지보수를 맡았으나 배터리를 회수했다.",
          briefing:
            "당신은 통신 장비를 지켰지만, 범인을 지목할 단서를 쥐고 있습니다.",
          truths: [
            "주최자의 마지막 통화는 이하준과의 협박성 대화였습니다.",
            "비상 발전기 오프라인 전환은 조작 흔적 없이 수동으로 이뤄졌습니다."
          ],
          misdirections: [
            "정민오가 몰래 통로를 정비했다는 기록을 찾았습니다.",
            "엘라 김이 주최자 금고 비밀번호를 캐물었습니다."
          ]
        }
      ]
    }
  },
  {
    id: "seoul-cyber",
    title: "서울 사이버 포렌식",
    tagline: "도시 전역을 가로지르는 디지털 미스터리",
    difficulty: "중상급",
    tone: "테크 스릴러",
    duration: "110분",
    playerRange: { min: 3, max: 6 },
    summary:
      "수사기관과 협력하는 민간 포렌식 팀이 서울 전역에 퍼진 사이버 테러 시도에 맞섭니다. 핵심 단계는 오프라인 단서를 디지털 증거와 연결짓는 것입니다. 플레이어는 서로 다른 포지션의 분석 결과를 교차 검증해야 합니다.",
    motifs: [
      "복수의 데이터 센터에서 수집된 로그를 통합 분석",
      "도심 CCTV가 15분간 일제히 블랙아웃",
      "의심 IP가 실제론 도심 내 이동형 기기"
    ],
    conflicts: [
      "누가 데이터 센터 접근 권한을 악용했는가?",
      "블랙아웃 구간에 현장 팀이 놓친 물리적 단서는 무엇인가?",
      "협력기관 내부에 공모자가 있는가?"
    ],
    prompts: [
      "CCTV 블랙아웃을 유발한 실제 장비 확인",
      "도심 기지국 이동 기록과 용의자 동선을 매칭",
      "루트킷 설치 후 실제로 훔치려 한 데이터 파악"
    ],
    timeline: [
      { time: "14:00", description: "사이버 경찰청이 이상 로그를 감지" },
      { time: "14:25", description: "블랙아웃 구간 동안 중요 서버에 루트킷 설치" },
      { time: "14:40", description: "시내 드론 촬영 영상에서 수상한 화물차 포착" },
      { time: "15:05", description: "포렌식 팀이 현장 증거 확보" },
      { time: "15:20", description: "용의자 중 한 명이 도주 시도하다 체포" }
    ],
    evidence: {
      physical: [
        { display: "루트킷가 저장된 마이크로 SD 카드", time: "15:05", visualElements: ["SD 카드 사진"] },
        { display: "블랙아웃 구간에서 발견된 NFC 접속 장치", time: "14:25", visualElements: ["NFC 장치 사진"] },
        { display: "화물차 적재함에서 나온 은닉 서버 랙", time: "15:20", visualElements: ["서버 랙 사진"] }
      ],
      digital: [
        { display: "포렌식 이미지에서 발견된 변조 로그", time: "15:05", visualElements: ["로그 스크린샷"] },
        { display: "SNS 제보로 수집된 용의자 동선", time: "14:40", visualElements: ["SNS 스크린샷"] },
        { display: "도청된 내부 통신 녹취", time: "14:25", visualElements: ["녹취 파일"] }
      ]
    },
    characters: [
      {
        name: "차보민",
        title: "화이트해커 출신 분석가",
        description: "예전 동료가 이번 사건에 연루된 것으로 의심되어 흔들리고 있다."
      },
      {
        name: "류현우",
        title: "데이터 센터 엔지니어",
        description: "블랙아웃 직전 야근 근무표를 임의로 바꿨다."
      },
      {
        name: "미야 자키",
        title: "국제 통신사 연락 담당",
        description: "해외 통신사와 협조를 담당하지만 모회사로 정보를 흘릴 수 있는 위치다."
      },
      {
        name: "박도인",
        title: "프리랜서 드론 조종사",
        description: "사건 직후 드론 로그를 삭제하려 했다."
      },
      {
        name: "알렉스 강",
        title: "시스템 감사관",
        description: "블랙아웃 경고를 받고도 묵살한 인물."
      },
      {
        name: "신혜란",
        title: "위기 커뮤니케이션 책임자",
        description: "SNS 제보를 분류하며 내부 유출자를 추적한다."
      }
    ],
    roles: {
      detective: [
        {
          name: "차보민",
          title: "포렌식 리드",
          briefing:
            "당신은 민간 포렌식 팀 리드입니다. 루트킷 설치 타이밍과 내부 공모 정황을 밝혀내야 합니다.",
          truths: [
            "루트킷 설치 3분 전, 데이터 센터 내부망에서 관리자 계정 'ryu-admin'이 MFA 없이 접속했습니다.",
            "CCTV 블랙아웃 구간 이후, NFC 장치가 서버실 문 잠금을 해제한 기록이 남아 있습니다. 이 장치는 내부 직원만 접근 가능한 락커에서 사라졌습니다."
          ],
          misdirections: [
            "SNS 제보 사진에서 화물차를 모는 사람의 실루엣이 박도인과 유사합니다.",
            "국제 통신사에서 제공한 백업 로그가 일부 조작된 것으로 보입니다."
          ]
        }
      ],
      culprit: [
        {
          name: "류현우",
          title: "데이터 센터 엔지니어",
          briefing:
            "당신은 내부 엔지니어로서 루트킷을 설치한 범인입니다. 외부 협력자를 탓하며 내부 비리를 가리려고 합니다.",
          truths: [
            "당신은 루트킷 모듈을 설치한 뒤, 은닉 서버 랙에 퀵 배터리를 연결해 백업을 우회했습니다.",
            "내부 공모자는 없지만, 알렉스 강이 경고를 묵살한 사실을 이용해 책임을 덮어씌울 수 있습니다."
          ],
          misdirections: [
            "박도인이 드론으로 서버실 창문을 촬영했다는 사실을 강조하십시오.",
            "국제 통신사가 제공한 암호 키가 유출되었다고 주장하십시오."
          ],
          exposed: [
            "관리자 계정 'ryu-admin'은 당신의 개인 계정이며 MFA 해제는 보안팀 승인 없이 불가능합니다.",
            "NFC 장치는 당신이 관리하던 락커에서 사라졌으며, 접근 로그에 당신 카드가 찍혀 있습니다."
          ]
        }
      ],
      suspects: [
        {
          name: "미야 자키",
          title: "국제 통신사 연락 담당",
          summary:
            "해외 통신사와 협조를 담당한다. 암호 키를 관리한다.",
          briefing:
            "당신은 국제 협력 창구입니다. 내부 배신자를 색출해야 하며, 외부 유출 의혹을 해명해야 합니다.",
          truths: [
            "국제 통신사가 제공한 암호 키는 모두 사용 로그가 남으며 유출 흔적이 없습니다.",
            "블랙아웃 구간 동안 내부망 접속은 단 한 번, 관리자 계정이었습니다."
          ],
          misdirections: [
            "박도인에게서 화물차 촬영 원본을 아직 받지 못했습니다.",
            "알렉스 강이 경고 이메일을 무시했다는 보고서를 받았습니다."
          ]
        },
        {
          name: "박도인",
          title: "드론 조종사",
          summary:
            "현장 드론 촬영 데이터를 수집했다. 로그를 삭제하려 했다.",
          briefing:
            "당신은 촬영 데이터를 보유하고 있습니다. 자신의 의심을 벗고 진범을 지목해야 합니다.",
          truths: [
            "드론은 블랙아웃 직후 서버실 옥상 배기구를 촬영했고, 누군가가 긴급 배터리를 투입하는 모습이 찍혔습니다.",
            "은닉 서버 랙은 데이터 센터 내부자만 아는 비상실에 설치돼 있었습니다."
          ],
          misdirections: [
            "미야 자키가 통신사에 보고하지 않은 키를 따로 보관하고 있었습니다.",
            "차보민이 백업 로그를 재작성했다는 소문이 있습니다."
          ]
        },
        {
          name: "알렉스 강",
          title: "시스템 감사관",
          summary:
            "블랙아웃 경고를 받고도 묵살한 인물.",
          briefing:
            "당신은 경고를 묵살했지만 범인이 아닙니다. 책임을 뒤집어쓰지 않으려면 진범을 지목해야 합니다.",
          truths: [
            "경고 이메일은 류현우가 보낸 '유지보수 테스트'로 위장된 메시지였습니다.",
            "루트킷 설치 이후 백업이 중단된 사실을 차보민에게 보고했지만, 이미 늦었습니다."
          ],
          misdirections: [
            "박도인의 드론 로그가 삭제된 것은 의도적인 증거 인멸일 수 있습니다.",
            "국제 통신사 측에서 특수 장비 반입 허가를 요청했다는 기록이 있습니다."
          ]
        },
        {
          name: "신혜란",
          title: "위기 커뮤니케이션 책임자",
          summary:
            "SNS 제보를 분류하며 내부 유출자를 추적한다.",
          briefing:
            "당신은 여론 통제를 담당합니다. 내부 고발을 수집해 진범을 노출시키세요.",
          truths: [
            "익명 제보자가 '엔지니어가 서버 랙을 옮기고 있다'는 영상을 보냈습니다.",
            "블랙아웃 5분 전, 류현우가 서버실 옆 장비실에서 휴대폰을 비행기 모드로 전환했습니다."
          ],
          misdirections: [
            "미야 자키가 모회사에 사건 정보를 미리 보고했습니다.",
            "알렉스 강이 경고 시스템 테스트를 중단시키라는 지시를 내렸습니다."
          ]
        }
      ]
    }
  }
];

export function registerScenario(scenario) {
  if (!scenario || !scenario.id) {
    return;
  }
  const index = scenarios.findIndex((item) => item.id === scenario.id);
  if (index !== -1) {
    scenarios[index] = scenario;
    return;
  }
  scenarios.push(scenario);
}

export function registerScenarios(list = []) {
  list.filter(Boolean).forEach((scenario) => {
    registerScenario(scenario);
  });
}

export function getScenarioById(id) {
  return scenarios.find((scenario) => scenario.id === id) || scenarios[0];
}

export function formatPlayerRange(range) {
  if (!range) return "-";
  return `${range.min} ~ ${range.max}명`;
}

// 게임 세트 생성을 위한 AI 프롬프트 가이드
export const SCENARIO_GENERATION_GUIDE = `
# 범죄 추리 게임 시나리오 생성 가이드

🚨 **필독: 이 프롬프트를 읽고 반드시 아래 규칙을 지켜주세요!**

⛔ **가장 흔한 오류: roles를 배열로 만드는 것**
- ❌ 잘못된 예: { "roles": [{name: "탐정"}, {name: "범인"}] }
- ✅ 올바른 예: { "roles": { "detective": [{...}], "culprit": [{...}], "suspects": [{...}, {...}] } }

⚠️ **응답 형식: 순수 JSON만 반환 (설명이나 코드 블록 마커 없이)**
- 추가 텍스트, 주석, 설명문 금지
- 마크다운 코드 블록 사용 금지
- JSON 객체만 응답

## 🎯 필수 응답 형식 규칙

1. 반드시 순수 JSON만 반환 (마크다운 코드 블록이나 설명문 제외)
2. 모든 문자열은 큰따옴표 사용
3. 배열은 [] 괄호 안에 작성
4. 객체는 {} 중괄호 안에 작성
5. 마지막 항목 뒤에 쉼표 제거
6. roles 객체는 반드시 detective, culprit, suspects 배열 포함
7. **문자열 내부의 제어 문자 이스케이프 필수:**
   - 줄바꿈: \\n (실제 엔터키 금지)
   - 탭: \\t (실제 탭 키 금지)
   - 큰따옴표: \\"
   - 백슬래시: \\\\
   - 예: "설명": "첫 번째 줄\\n두 번째 줄"

## 📝 단서 작성 핵심 원칙

**단서는 구체적인 사실이어야 합니다. 메타적 지시사항이 아닙니다!**

### ✅ 좋은 단서 예시:
- "나는 오후 7시 15분에 복도에서 큰 소리를 들었다"
- "내 핸드폰에는 피해자로부터 오후 6시 30분에 온 문자가 있다"
- "사건 당일 나는 회사 건물 4층에 있었다"
- "나는 피해자가 최근 금전 문제로 고민한다는 것을 알고 있었다"

### ❌ 나쁜 단서 예시 (메타적 지시):
- "각자의 정확한 분 단위 동선을 요구하며 서로의 기억 차이를 부각시켜라" ← 이것은 단서가 아니라 게임 팁!
- "다른 플레이어들에게 압박을 가해라" ← 행동 지시
- "모순을 찾아내도록 유도하라" ← 게임 전략

### 단서 작성 체크리스트:
- [ ] "~하라", "~시켜라" 같은 명령형이 아닌가?
- [ ] 캐릭터가 알고 있는 구체적인 사실인가?
- [ ] 플레이어가 다른 사람과 공유할 수 있는 정보인가?
- [ ] 게임 진행 방식에 대한 메타적 힌트가 아닌가?

## 🎨 시각적 증거 필수 요구사항

**매우 중요: 각 캐릭터는 clue_a, clue_b, clue_c 단계마다 최소 1개씩 총 3개의 시각적 증거를 가져야 합니다!**

### 필수 할당 규칙:
- **모든 캐릭터**의 visualEvidence는 객체 형식: {clue_a: [...], clue_b: [...], clue_c: [...]}
- 각 단계(clue_a, clue_b, clue_c)마다 **최소 1개씩** 반드시 포함
- 빈 배열 금지! 모든 단계에 증거 1개 이상 필수

### HTML 스타일링 절대 규칙:
1. **반드시 인라인 스타일 사용** - style 속성에 모든 CSS 포함
2. **명확한 색상 대비** - 배경과 텍스트가 확실히 구분되게
3. **충분한 크기와 패딩** - 너무 작거나 빡빡하지 않게
4. **실제 문서처럼 디자인** - 영수증은 영수증처럼, 메시지는 메시지처럼
5. **중요 정보는 강조** - 굵게, 색상, 크기로 눈에 띄게
6. **box-shadow와 border 사용** - 입체감과 구분감 표현

### ❌ 절대 하지 말 것:
- 회색 배경에 회색 글씨 같은 저대비 조합
- 클래스명만 있고 스타일이 없는 HTML
- 너무 작은 폰트 (12px 미만)
- 단순한 텍스트만 나열
- 패딩이나 여백이 없는 답답한 레이아웃
- **빈 배열로 남겨두기** (모든 단계에 증거 필수!)

### ✅ 반드시 포함할 것:
- 배경색 (background)
- 테두리 (border)
- 패딩 (padding: 15px 이상)
- 글꼴 크기 (font-size: 13px 이상)
- 색상 강조 (중요 부분은 다른 색)
- **각 단계(clue_a/b/c)마다 최소 1개의 증거**
- 그림자 효과 (box-shadow)
- 최대 너비 (max-width: 300-400px)

## 🎮 게임 진행 시스템 이해

### 단계별 흐름
1. **lobby** (대기실) - 플레이어 입장 및 역할 배정 대기
2. **briefing** (5분) - 사건 개요 및 역할 확인
3. **clue_a** (6분) - 1차 단서 공개 및 개인 분석
4. **discussion_a** (8분) - 1차 토론 (봇이 자동으로 단서 공유)
5. **clue_b** (6분) - 2차 단서 공개
6. **discussion_b** (8분) - 2차 토론
7. **clue_c** (6분) - 3차 단서 공개 (결정적 증거)
8. **final_discussion** (9분) - 최종 토론 및 추리
9. **voting** (3분) - 범인 투표 (전원 투표 완료 시 자동 종료)
10. **result** - 결과 발표 및 승자 결정

### 핵심 메커니즘
- **역할 배정**: 각 플레이어는 고유한 persona(캐릭터)를 받음
- **정보 비대칭**: 각자 다른 단서와 알리바이를 가짐
- **고유 증거 시스템**: **각 캐릭터는 자신만 볼 수 있는 고유한 시각적 증거(visualEvidence)를 가짐**
  - 증거는 게임 시작 시 미리 할당되며, 플레이어가 역할을 받는 순간부터 확인 가능
  - 같은 증거를 여러 캐릭터가 공유하지 않음 (각자 다른 증거를 가짐)
  - **증거도 3단계에 걸쳐 점진적으로 공개됨**: clue_a(1차), clue_b(2차), clue_c(3차/결정적)
  - 예시: 
    * clue_a 단계: 탐정A는 영수증, 범인은 아무것도 없음, 용의자1은 통화 내역
    * clue_b 단계: 탐정A는 아무것도 없음, 범인은 협박 메시지, 용의자1은 아무것도 없음
    * clue_c 단계: 탐정A는 CCTV 기록, 범인은 아무것도 없음, 용의자1은 증거 사진
- **점진적 공개**: 3단계에 걸쳐 단서와 증거가 순차적으로 공개됨
- **봇 참여**: 토론 단계마다 봇이 자신의 단서를 자동으로 채팅에 공유
- **투표 시스템**: 모든 플레이어(봇 포함)가 범인 후보에게 투표
- **승리 조건**: 범인이 최다 득표 시 시민 승리, 그 외 범인 승리

## 📋 시나리오 JSON 구조

\`\`\`json
{
  "id": "unique-kebab-case-id",
  "title": "매력적이고 기억에 남는 제목",
  "tagline": "30자 이내의 극적인 한 줄 소개",
  "difficulty": "초급|중급|고급",
  "tone": "장르/분위기 (예: 네오 누아르, 미스터리 코미디, 심리 스릴러)",
  "duration": "120분",
  "playerRange": { "min": 4, "max": 7 },
  "summary": "사건의 배경, 상황, 핵심 미스터리를 포함한 200자 내외의 요약",
  "motifs": [
    "이야기를 특별하게 만드는 독특한 요소",
    "플레이어의 흥미를 끄는 설정",
    "반전의 실마리가 될 수 있는 배경"
  ],
  "conflicts": [
    "등장인물 간의 이해관계 충돌",
    "사건 해결의 핵심이 되는 질문",
    "추리를 복잡하게 만드는 모순된 증거"
  ],
  "prompts": [
    "플레이어가 토론에서 다뤄야 할 핵심 질문",
    "범인을 찾기 위해 반드시 해결해야 할 의문",
    "증거들을 연결하는 추리 포인트"
  ],
  "timeline": [
    { "time": "HH:MM", "description": "사건 전후의 중요한 시간대별 사건" }
  ],
  "evidence": {
    "physical": [
      "구체적인 물리적 증거 (예: 찢어진 영수증, 특정 위치의 지문)",
      "시각적으로 표현 가능한 증거 우선"
    ],
    "digital": [
      "디지털 증거 (예: 문자 메시지, CCTV 타임스탬프, 통화 기록)",
      "데이터로 표현 가능한 증거"
    ],
    "visual": [
      {
        "type": "image|document|chart|receipt|letter|message|map|diagram",
        "title": "증거 이름",
        "description": "증거 설명",
        "html": "<!-- 시각적 증거를 표현할 HTML 코드 -->",
        "imagePrompt": "이미지 생성 AI를 위한 상세한 프롬프트 (선택사항)"
      }
    ]
  },
  "characters": [
    {
      "name": "캐릭터 이름",
      "title": "직책/역할",
      "description": "배경 설명"
    }
  ],
  "roles": {
    "detective": [
      {
        "name": "탐정 이름",
        "title": "탐정 직함",
        "briefing": "플레이어에게 주어지는 역할 설명 및 목표",
        "truths": [
          "구체적이고 확인 가능한 진실",
          "사건 해결에 도움이 되는 결정적 단서"
        ],
        "misdirections": [
          "다른 사람을 의심하게 만드는 정보"
        ],
        "prompts": [
          "이 단계에서 취해야 할 구체적 행동"
        ],
        "timeline": [
          {"time": "18:00", "action": "이 캐릭터가 해당 시간에 한 행동"},
          {"time": "19:30", "action": "사건과 관련된 행동"}
        ],
        "suggestedQuestions": [
          "이 캐릭터가 다른 사람에게 물어봐야 할 질문"
        ],
        "keyConflicts": [
          "이 캐릭터가 경험하는 핵심 갈등이나 딜레마"
        ],
        "visualEvidence": {
          "clue_a": [
            {
              "type": "message|document|receipt",
              "title": "1차 단계에서 공개될 증거 제목",
              "description": "증거 설명",
              "html": "<div>HTML 코드</div>",
              "imagePrompt": "이미지 생성 프롬프트"
            }
          ],
          "clue_b": [
            {
              "type": "timeline|cctv|photo",
              "title": "2차 단계에서 공개될 증거 제목",
              "description": "증거 설명",
              "html": "<div>HTML 코드</div>",
              "imagePrompt": "이미지 생성 프롬프트"
            }
          ],
          "clue_c": [
            {
              "type": "forensic|contract|email",
              "title": "3차(최종) 단계에서 공개될 결정적 증거",
              "description": "증거 설명",
              "html": "<div>HTML 코드</div>",
              "imagePrompt": "이미지 생성 프롬프트"
            }
          ]
        }
      }
    ],
    "culprit": [
      {
        "name": "범인 이름",
        "title": "범인 직함",
        "briefing": "범인의 브리핑 및 목표",
        "truths": [
          "범인이 알고 있는 진실"
        ],
        "misdirections": [
          "다른 사람을 의심하게 만드는 정보",
          "자신의 알리바이를 강화하는 정보"
        ],
        "prompts": [
          "다른 플레이어에게 물어봐야 할 질문"
        ],
        "exposed": [
          "들킬 위험이 있는 약점이나 증거"
        ],
        "timeline": [
          {"time": "18:00", "action": "범인의 실제 행동 (알리바이 포함)"}
        ],
        "suggestedQuestions": [
          "의심을 피하기 위해 던져야 할 질문"
        ],
        "keyConflicts": [
          "범인이 직면한 심리적 압박이나 갈등"
        ],
        "visualEvidence": {
          "clue_a": [],
          "clue_b": [],
          "clue_c": []
        }
      }
    ],
    "suspects": [
      {
        "name": "용의자 이름",
        "title": "용의자 직함",
        "summary": "용의자 배경 요약",
        "briefing": "용의자 브리핑",
        "truths": [
          "이 캐릭터가 알고 있는 진실"
        ],
        "misdirections": [
          "다른 사람을 의심하게 만드는 정보"
        ],
        "prompts": [
          "토론을 유도할 질문"
        ],
        "timeline": [
          {"time": "18:00", "action": "용의자의 행동"}
        ],
        "suggestedQuestions": [
          "진실을 밝히기 위해 물어봐야 할 질문"
        ],
        "keyConflicts": [
          "용의자가 직면한 딜레마나 비밀"
        ],
        "visualEvidence": {
          "clue_a": [],
          "clue_b": [],
          "clue_c": []
        }
      }
    ]
  }
}
\`\`\`

## 🎨 시각적 증거 생성 가이드

⚠️ **중요: HTML 스타일링 필수 규칙**

1. **인라인 스타일만 사용** - 외부 CSS는 적용되지 않음
2. **명확한 배경색과 테두리** - 증거가 눈에 띄도록 강조
3. **충분한 패딩과 여백** - 가독성을 위해 공간 확보
4. **적절한 폰트 크기** - 최소 12px 이상
5. **색상 대비** - 텍스트와 배경의 명확한 구분
6. **최대 너비 제한** - max-width: 400px 이하 권장

**❌ 피해야 할 것:**
- 투명하거나 너무 밝은 배경색
- 회색 계열의 단조로운 디자인
- 너무 작은 폰트나 간격
- 클래스명만 지정하고 스타일 미지정
- 복잡한 SVG나 애니메이션

**✅ 권장 사항:**
- 문서 타입에 맞는 명확한 시각적 특징 (영수증 → 영수증처럼 보이게)
- 중요 정보는 굵게 또는 색상 강조
- 적절한 아이콘/이모지 사용 (📧, 📱, 🔒 등)
- 테두리와 그림자로 입체감 표현

### 증거 타입별 HTML 템플릿

#### 1. 영수증/거래 내역 ✅ 권장 스타일
\`\`\`html
<div style="font-family: 'Courier New', monospace; background: linear-gradient(to bottom, #fff 0%, #f9f9f9 100%); padding: 25px; border: 2px solid #333; max-width: 320px; box-shadow: 2px 2px 8px rgba(0,0,0,0.1);">
  <div style="text-align: center; font-weight: bold; font-size: 18px; margin-bottom: 15px; border-bottom: 2px solid #000; padding-bottom: 10px;">🏪 상호명</div>
  <div style="border-top: 1px dashed #666; padding-top: 10px;">
    <div style="margin: 8px 0; font-size: 14px;">거래일시: 2024-10-19 18:45</div>
    <div style="margin: 8px 0; font-size: 14px;">항목: 커피 2잔</div>
    <div style="margin: 8px 0; font-weight: bold; font-size: 16px; border-top: 1px solid #000; padding-top: 8px;">합계: 8,000원</div>
  </div>
</div>
\`\`\`

#### 2. 문자 메시지/카카오톡 ✅ 권장 스타일
\`\`\`html
<div style="background: #b2c7d9; padding: 20px; border-radius: 12px; max-width: 320px; box-shadow: 0 2px 10px rgba(0,0,0,0.15);">
  <div style="background: #ffffff; padding: 12px 15px; border-radius: 10px; margin-bottom: 8px; position: relative;">
    <div style="font-size: 11px; color: #888; margin-bottom: 5px; font-weight: bold;">📱 홍길동</div>
    <div style="font-size: 14px; line-height: 1.5; color: #000;">오늘 회의 꼭 참석해주세요. 중요한 안건이 있습니다.</div>
    <div style="text-align: right; font-size: 10px; color: #999; margin-top: 8px;">오후 6:30</div>
  </div>
  <div style="background: #ffe400; padding: 12px 15px; border-radius: 10px; margin-left: 30px;">
    <div style="font-size: 11px; color: #888; margin-bottom: 5px; font-weight: bold;">나</div>
    <div style="font-size: 14px; line-height: 1.5; color: #000;">알겠습니다.</div>
    <div style="text-align: right; font-size: 10px; color: #999; margin-top: 8px;">오후 6:32</div>
  </div>
</div>
\`\`\`

#### 3. 일정표/타임라인 ✅ 권장 스타일
\`\`\`html
<div style="background: #fff; border: 2px solid #4CAF50; border-radius: 8px; overflow: hidden; max-width: 400px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
  <div style="background: #4CAF50; color: #fff; padding: 12px; font-weight: bold; font-size: 16px;">📅 일정표</div>
  <table style="border-collapse: collapse; width: 100%; font-size: 14px;">
    <tr style="background: #2c3e50; color: #fff;">
      <th style="padding: 12px; border: 1px solid #34495e; text-align: left; font-size: 13px;">시간</th>
      <th style="padding: 12px; border: 1px solid #34495e; text-align: left; font-size: 13px;">일정</th>
    </tr>
    <tr style="background: #fff;">
      <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">18:00</td>
      <td style="padding: 10px; border: 1px solid #ddd;">회의실 입장</td>
    </tr>
    <tr style="background: #f9f9f9;">
      <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold;">19:00</td>
      <td style="padding: 10px; border: 1px solid #ddd;">중요 회의 시작</td>
    </tr>
  </table>
</div>
\`\`\`

#### 4. 편지/메모 ✅ 권장 스타일
\`\`\`html
<div style="background: #fffbf0; padding: 25px; border: 3px double #8b7355; max-width: 350px; box-shadow: 3px 3px 10px rgba(0,0,0,0.2); font-family: 'Georgia', serif;">
  <div style="text-align: center; font-size: 20px; font-weight: bold; margin-bottom: 15px; color: #5d4037;">✉️ 편지</div>
  <p style="margin: 0 0 12px 0; font-size: 15px; line-height: 1.6; color: #333;">친애하는 ○○에게,</p>
  <p style="margin: 12px 0; font-size: 14px; line-height: 1.8; color: #444;">이 편지를 읽을 때쯤이면 모든 것이 밝혀졌을 것입니다. 진실은...</p>
  <p style="text-align: right; margin-top: 20px; font-size: 14px; font-style: italic; color: #666;">- 발신인 이름</p>
</div>
\`\`\`

#### 5. CCTV/보안 기록 ✅ 권장 스타일
\`\`\`html
<div style="background: #1a1a1a; color: #00ff00; font-family: 'Courier New', monospace; padding: 20px; border: 3px solid #333; max-width: 350px; box-shadow: 0 0 20px rgba(0,255,0,0.3);">
  <div style="border-bottom: 2px solid #00ff00; padding-bottom: 10px; margin-bottom: 15px;">
    <div style="font-size: 16px; font-weight: bold; margin-bottom: 5px;">📹 CAMERA 01 - LOBBY</div>
    <div style="font-size: 12px; color: #0f0;">RECORDING</div>
  </div>
  <div style="font-size: 14px; line-height: 1.8;">
    <div>DATE: 2024-10-19</div>
    <div>TIME: 18:45:23</div>
    <div>LOCATION: 1F ENTRANCE</div>
  </div>
  <div style="margin-top: 15px; padding: 10px; background: #ff0000; color: #fff; font-weight: bold; text-align: center; border-radius: 4px;">
    ⚠️ MOTION DETECTED
  </div>
</div>
\`\`\`

#### 6. 통화 기록/로그 ✅ 권장 스타일
\`\`\`html
<div style="background: #fff; border: 2px solid #2196F3; border-radius: 10px; padding: 20px; max-width: 350px; box-shadow: 0 3px 10px rgba(0,0,0,0.1);">
  <div style="background: #2196F3; color: #fff; padding: 12px; margin: -20px -20px 15px -20px; border-radius: 8px 8px 0 0; font-weight: bold; font-size: 16px;">
    📞 통화 기록
  </div>
  <div style="padding: 12px; border-bottom: 1px solid #e0e0e0; display: flex; justify-content: space-between; align-items: center;">
    <div>
      <div style="font-weight: bold; font-size: 15px; color: #333;">홍길동</div>
      <div style="font-size: 12px; color: #666; margin-top: 4px;">발신 통화</div>
    </div>
    <div style="text-align: right;">
      <div style="font-size: 14px; color: #2196F3; font-weight: bold;">18:45</div>
      <div style="font-size: 12px; color: #999; margin-top: 4px;">5분 32초</div>
    </div>
  </div>
  <div style="padding: 12px; display: flex; justify-content: space-between; align-items: center;">
    <div>
      <div style="font-weight: bold; font-size: 15px; color: #333;">이영희</div>
      <div style="font-size: 12px; color: #666; margin-top: 4px;">수신 통화</div>
    </div>
    <div style="text-align: right;">
      <div style="font-size: 14px; color: #4CAF50; font-weight: bold;">19:10</div>
      <div style="font-size: 12px; color: #999; margin-top: 4px;">2분 15초</div>
    </div>
  </div>
</div>
\`\`\`

#### 6. 도표/그래프
\`\`\`html
<svg width="300" height="200" style="border: 1px solid #ccc;">
  <rect x="50" y="150" width="40" height="30" fill="#4CAF50"/>
  <rect x="110" y="120" width="40" height="60" fill="#2196F3"/>
  <text x="65" y="195" text-anchor="middle" font-size="12">A</text>
  <text x="125" y="195" text-anchor="middle" font-size="12">B</text>
</svg>
\`\`\`

#### 7. 지도/위치
\`\`\`html
<div style="position: relative; width: 300px; height: 200px; background: #e0e0e0; border: 2px solid #333;">
  <div style="position: absolute; top: 50px; left: 100px; width: 20px; height: 20px; background: red; border-radius: 50%;"></div>
  <div style="position: absolute; top: 55px; left: 125px; font-size: 12px;">사건 발생 지점</div>
</div>
\`\`\`

### 이미지 생성 프롬프트 작성법
이미지 생성 AI를 사용할 수 있는 경우:
- **스타일**: "photorealistic crime scene photograph" 또는 "documentary style evidence photo"
- **구체성**: 객체의 위치, 조명, 각도를 명확히 지정
- **맥락**: 사건과의 연관성을 드러낼 수 있는 디테일 포함
- **예시**: "A torn receipt on a wooden table, evening lighting, slight coffee stain on the corner, showing transaction time of 18:45, documentary photography style"

## ⚠️ JSON 구조 필수 요구사항

**반드시 다음을 확인하세요:**

1. **roles 객체 구조**
   - roles는 배열이 아닌 객체여야 함
   - 반드시 3개의 키 포함: detective, culprit, suspects
   - 각 키의 값은 배열이어야 함
   
2. **필수 배열 길이**
   - roles.detective: 최소 1개 이상
   - roles.culprit: 정확히 1개 (범인은 1명만)
   - roles.suspects: 최소 2개 이상 (playerRange에 맞춰 조정)

3. **각 역할 필수 필드**
   - name: 캐릭터 이름 (문자열)
   - title: 직함/역할 (문자열)
   - briefing: 역할 설명 (문자열)
   - **timeline: 시간대별 행동 배열 (최소 4개, 빈 배열 금지!)**
   - truths: 진실 단서 배열 (최소 2개)
   - misdirections: 혼동 정보 배열 (최소 1개)
   - prompts: 행동 지침 배열 (최소 1개)
   - exposed: 약점 배열 (culprit만 필수, 최소 1개)

4. **올바른 JSON 형식**
   \`\`\`
   {
     "roles": {
       "detective": [ {...} ],
       "culprit": [ {...} ],
       "suspects": [ {...}, {...} ]
     }
   }
   \`\`\`

5. **잘못된 형식 (사용 금지)**
   \`\`\`
   { "roles": [ {...} ] }  ← 이렇게 배열로 만들면 안됨!
   \`\`\`

## 🎯 고품질 시나리오 작성 체크리스트

### 0. JSON 구조 검증 (최우선 확인!)
- [ ] roles는 객체 형식인가? (roles: { detective: [...], culprit: [...], suspects: [...] })
- [ ] detective 배열에 최소 1명 이상 있는가?
- [ ] culprit 배열에 정확히 1명만 있는가?
- [ ] suspects 배열에 최소 2명 이상 있는가?
- [ ] 모든 역할에 truths(2개 이상), misdirections(1개 이상), prompts(1개 이상)가 있는가?
- [ ] culprit에 exposed 배열(1개 이상)이 있는가?

### 1. 스토리 완성도
- [ ] 사건의 동기가 명확하고 설득력 있는가?
- [ ] 범인을 찾을 수 있는 논리적 단서가 충분한가?
- [ ] 모든 캐릭터가 의심받을 수 있는 여지가 있는가?
- [ ] 반전 요소가 있으면서도 공정한가?

### 2. 밸런스
- [ ] 범인의 알리바이가 완벽하지 않으면서도 교묘한가?
- [ ] 시민들이 협력하면 범인을 찾을 수 있는가?
- [ ] 각 단계마다 의미 있는 정보가 공개되는가?
- [ ] 최종 단계(clue_c)에 결정적 증거가 포함되어 있는가?

### 3. 캐릭터 디자인
- [ ] 각 캐릭터의 동기와 배경이 명확한가?
- [ ] 캐릭터 간 관계와 갈등이 흥미로운가?
- [ ] 모든 캐릭터가 게임에 기여할 수 있는가?
- [ ] 캐릭터 수가 playerRange와 정확히 일치하는가?

### 4. 단서 설계
- [ ] truths는 **구체적인 사실**인가? (예: "창문이 깨져 있었다" ✅, "각자의 정확한 분 단위 동선을 요구하라" ❌)
- [ ] **단서에 메타적인 지시사항이 포함되지 않았는가?** ("서로의 기억 차이를 부각시켜라" 같은 것은 단서가 아님)
- [ ] misdirections가 자연스럽게 의심을 분산시키는가?
- [ ] 단서들이 서로 연결되어 있는가?
- [ ] **각 캐릭터의 timeline이 반드시 포함되어 있는가?** (빈 배열이 아닌 최소 2~3개의 시간대 행동)
- [ ] **각 캐릭터가 고유한 visualEvidence를 가지고 있는가?** (같은 증거를 여러 사람이 공유하면 안됨)

### 5. 시각적 증거 (매우 중요!)
- [ ] **각 캐릭터가 clue_a, clue_b, clue_c 단계마다 최소 1개씩의 visualEvidence를 가지고 있는가?**
- [ ] **증거가 빈 배열이 아닌가?** (예: clue_a: [], clue_b: [], clue_c: [] ❌ → 각 단계마다 최소 1개씩 필수!)
- [ ] 각 증거가 사건 해결에 실질적으로 기여하는가?
- [ ] **증거가 다른 캐릭터와 중복되지 않는가?** (예: 탐정A는 영수증, 범인은 메시지, 용의자는 사진)
- [ ] **visualEvidence가 객체 형식으로 정의되어 있는가?** (예: {clue_a: [{...}], clue_b: [{...}], clue_c: [{...}]})
- [ ] HTML에 인라인 스타일이 완전히 포함되어 있는가? (클래스명만 있으면 안됨)
- [ ] 배경색, 테두리, 패딩, 폰트 크기가 모두 명시되어 있는가?
- [ ] 색상 대비가 충분한가? (회색 배경에 회색 글씨 금지)
- [ ] 증거가 시각적으로 실제 문서처럼 보이는가?
- [ ] 중요 정보가 굵게, 색상, 크기로 강조되어 있는가?
- [ ] box-shadow나 border로 입체감이 표현되어 있는가?
- [ ] 증거 타입이 다양한가? (영수증, 메시지, 사진, 문서, 일기 등)

### 6. 게임 플레이
- [ ] 브리핑 단계에서 충분한 정보를 제공하는가?
- [ ] 토론 시간이 충분히 활용될 수 있는가?
- [ ] 봇이 공유할 단서가 적절히 분배되어 있는가?
- [ ] 투표 단계에서 결정하기 어려운 정도의 긴장감이 있는가?

## 💡 고급 디자인 팁

### 레드 헤링 (Red Herring) 디자인
- 범인이 아닌 캐릭터에게 강한 동기 부여
- 의심스러운 행동이 있지만 다른 이유가 있는 경우
- 예: "A는 사건 시각에 현장 근처에 있었지만, 실제로는 비밀 연애 상대를 만나러 간 것"

### 타임라인 트릭
- 증언 간 미묘한 시간 차이로 거짓말 노출
- CCTV나 통화 기록으로 알리바이 붕괴
- 예: "B는 7시에 있었다고 주장하지만, CCTV는 7시 15분을 기록"

### 정보 연결 고리
- 단독으로는 무의미하지만 결합하면 결정적인 단서들
- 서로 다른 캐릭터가 가진 정보를 합쳐야 진실 도출
- 예: "C는 소리를 들었고, D는 그 시각 특정 장소에 있었다는 것을 알고 있음"

### 심리적 긴장감
- 범인에게는 들킬 위험(exposed)을 단계별로 증가
- 시민들에게는 오해받을 수 있는 상황 제공
- 마지막 단계에서 극적인 반전 가능성

## 🎬 예시: 완벽한 visual 증거

\`\`\`json
{
  "type": "receipt",
  "title": "카페 영수증",
  "description": "사건 당일 오후 6시 45분에 발행된 영수증, 커피 얼룩이 있음",
  "html": "<div style='font-family: monospace; background: linear-gradient(to bottom, #fff 0%, #f9f9f9 100%); padding: 25px; border: 2px solid #333; max-width: 320px; box-shadow: 2px 2px 8px rgba(0,0,0,0.1);'><div style='text-align: center; font-weight: bold; font-size: 18px; margin-bottom: 15px; border-bottom: 2px solid #000; padding-bottom: 10px;'>☕ 코지 카페</div><div style='font-size: 13px; line-height: 1.6;'><div style='margin: 10px 0;'>날짜: 2024-10-19</div><div style='margin: 10px 0;'>시간: 18:45:32</div><div style='border-top: 1px dashed #666; border-bottom: 1px dashed #666; padding: 10px 0; margin: 10px 0;'><div style='display: flex; justify-content: space-between;'><span>아메리카노 (Hot)</span><span>4,500원</span></div><div style='display: flex; justify-content: space-between;'><span>카페라떼 (Ice)</span><span>5,000원</span></div></div><div style='display: flex; justify-content: space-between; font-weight: bold; font-size: 15px; margin-top: 10px;'><span>합계</span><span>9,500원</span></div><div style='margin-top: 10px; font-size: 11px; color: #666;'>결제: 카드 (**** 1234)</div></div><div style='position: absolute; top: 30px; right: 20px; width: 40px; height: 40px; border-radius: 50%; background: rgba(139, 69, 19, 0.2); border: 2px solid rgba(139, 69, 19, 0.4);'></div></div>",
  "imagePrompt": "A coffee-stained receipt from a cozy cafe, photographed on a wooden table, evening natural light, slightly crumpled, showing transaction details for two coffee drinks at 18:45, realistic texture, documentary photography style, shallow depth of field"
}
\`\`\`

## ✅ 최종 검증: 완전한 시나리오 구조 예시

**JSON 생성 전 반드시 이 구조를 따르세요:**

\`\`\`
{
  "id": "unique-scenario-id",
  "title": "시나리오 제목",
  "description": "간단한 설명",
  "playerRange": "4-6명",
  "difficulty": 2,
  "estimatedTime": "60분",
  "setting": "배경 설명",
  "crimeType": "살인",
  "roles": {
    "detective": [
      {
        "name": "탐정 이름",
        "title": "직함",
        "briefing": "역할 설명",
        "truths": ["진실1", "진실2", "진실3"],
        "misdirections": ["혼동1", "혼동2"],
        "prompts": ["행동지침1", "행동지침2"],
        "timeline": [
          {"time": "18:00", "action": "이 캐릭터의 행동"},
          {"time": "19:00", "action": "사건 관련 행동"}
        ],
        "suggestedQuestions": ["질문1", "질문2"],
        "keyConflicts": ["갈등1"],
        "visualEvidence": {
          "clue_a": [
            {
              "type": "document",
              "title": "1차 단서 증거",
              "description": "설명",
              "html": "<div>HTML</div>",
              "imagePrompt": "프롬프트"
            }
          ],
          "clue_b": [],
          "clue_c": []
        }
      }
    ],
    "culprit": [
      {
        "name": "범인 이름",
        "title": "직함",
        "briefing": "역할 설명",
        "truths": ["진실1", "진실2"],
        "misdirections": ["혼동1", "혼동2"],
        "prompts": ["행동지침1", "행동지침2"],
        "exposed": ["약점1", "약점2"],
        "timeline": [{"time": "18:00", "action": "범인의 실제 행동"}],
        "suggestedQuestions": ["질문1"],
        "keyConflicts": ["심리적 압박"],
        "visualEvidence": {
          "clue_a": [],
          "clue_b": [
            {
              "type": "message",
              "title": "2차 단서 증거",
              "description": "설명",
              "html": "<div>HTML</div>",
              "imagePrompt": "프롬프트"
            }
          ],
          "clue_c": []
        }
      }
    ],
    "suspects": [
      {
        "name": "용의자1 이름",
        "title": "직함",
        "briefing": "역할 설명",
        "truths": ["진실1", "진실2"],
        "misdirections": ["혼동1"],
        "prompts": ["행동지침1"],
        "timeline": [{"time": "18:00", "action": "용의자 행동"}],
        "suggestedQuestions": ["질문1"],
        "keyConflicts": ["비밀"],
        "visualEvidence": {
          "clue_a": [],
          "clue_b": [],
          "clue_c": [
            {
              "type": "receipt",
              "title": "3차(결정적) 증거",
              "description": "설명",
              "html": "<div>HTML</div>",
              "imagePrompt": "프롬프트"
            }
          ]
        }
      },
      {
        "name": "용의자2 이름",
      },
      {
        "name": "용의자2 이름",
        "title": "직함",
        "briefing": "역할 설명",
        "truths": ["진실1", "진실2"],
        "misdirections": ["혼동1"],
        "prompts": ["행동지침1"],
        "timeline": [{"time": "18:00", "action": "용의자 행동"}],
        "suggestedQuestions": ["질문1"],
        "keyConflicts": ["딜레마"],
        "visualEvidence": []
      }
    ]
  }
}
\`\`\`

**❌ 절대 하지 말아야 할 것:**
- roles를 배열로 만들기: { "roles": [{...}] } ← 이것은 오류!
- detective나 suspects 배열 비우기
- culprit 배열에 2명 이상 넣기
- truths, misdirections, prompts 중 하나라도 빈 배열로 두기
- culprit의 exposed 필드 누락

**✅ 반드시 해야 할 것:**
- roles는 객체로: { "roles": { "detective": [...], "culprit": [...], "suspects": [...] } }
- 각 배열에 최소 개수 이상의 역할 포함
- 모든 문자열에 큰따옴표 사용
- 순수 JSON만 반환 (주석이나 추가 텍스트 없이)

이 가이드를 따라 고품질의 몰입감 있는 범죄 추리 게임을 만들어보세요!
`;
