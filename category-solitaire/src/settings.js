// 게임 설정 기본값과 점수 계산
// ④단계에서 교사가 수업 코드별로 화면에서 바꾼 값이 이 기본값을 덮어씁니다.

export const DEFAULT_SETTINGS = {
  columns: 4,               // 카드 열 개수 (3~7)
  shuffleCategories: true,  // 카테고리 카드 섞기 (켬: 어려움 / 끔: 칸이 처음부터 열림)
  timeLimitOn: false,       // 시간 제한 사용 여부
  timeLimitSec: 300,        // 시간 제한(초)
  theme: 'blue',            // 색상 테마: blue / green / purple / orange
  score: {
    correct: 10,            // 단어 카드 정답 배치 가점
    wrong: 5,               // 단어 카드 오답 배치 감점
    category: 2,            // 카테고리 카드로 칸 열기 가점
    secPerCard: 6,          // 기준 시간 = 카드 수 × 이 값(초)
    timeBonusPerSec: 0.2,   // 기준 시간보다 1초 빠를 때마다 보너스
    extraMovePenalty: 1,    // 최소 이동 수를 넘는 이동 1번당 감점
    extraMoveCap: 20,       // 추가 이동 감점의 최대치
  },
};

export const THEMES = {
  blue: '파랑',
  green: '초록',
  purple: '보라',
  orange: '주황',
};

// 기본값 위에 부분 설정을 덮어써서 완전한 설정 객체를 만든다
export function mergeSettings(partial = {}) {
  return {
    ...DEFAULT_SETTINGS,
    ...partial,
    score: { ...DEFAULT_SETTINGS.score, ...(partial.score || {}) },
  };
}

// 게임 중 화면에 보이는 점수 (정답·오답·카테고리만 반영)
export function liveScore(stats, s) {
  return stats.correct * s.correct + stats.categoryOpened * s.category - stats.wrong * s.wrong;
}

// 게임 종료 시 최종 점수와 항목별 내역
export function finalScore(stats, s) {
  const base = liveScore(stats, s);
  const refSec = stats.totalCards * s.secPerCard;
  // 모든 카드를 분류했을 때만 시간 보너스를 준다 (시간 초과로 끝나면 0)
  const timeBonus = stats.finished
    ? Math.round(Math.max(0, refSec - stats.elapsedSec) * s.timeBonusPerSec)
    : 0;
  const extraMoves = Math.max(0, stats.moves - stats.minMoves);
  const movePenalty = Math.min(s.extraMoveCap, extraMoves * s.extraMovePenalty);
  const total = Math.max(0, base + timeBonus - movePenalty);
  return { base, refSec, timeBonus, extraMoves, movePenalty, total };
}
