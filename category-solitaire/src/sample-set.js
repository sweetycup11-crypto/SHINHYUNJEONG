// 바로 테스트할 수 있는 샘플 게임 세트 (고등학교 화학)
// 엑셀 양식과 같은 구조: 카테고리 / 단어 / 해설(선택)
export const SAMPLE_SET = {
  name: '고등 화학 개념 분류',
  rows: [
    { category: '산화·환원', word: '산화수', explanation: '원자가 잃거나 얻은 전자 수를 나타낸 값. 산화되면 증가하고 환원되면 감소한다.' },
    { category: '산화·환원', word: '산화제', explanation: '자신은 환원되면서 다른 물질을 산화시키는 물질.' },
    { category: '산화·환원', word: '환원제', explanation: '자신은 산화되면서 다른 물질을 환원시키는 물질.' },
    { category: '산화·환원', word: '전자 이동', explanation: '전자를 잃는 산화와 전자를 얻는 환원은 항상 동시에 일어난다.' },
    { category: '산화·환원', word: '철의 부식', explanation: '철이 산소·물과 반응해 산화되는 대표적인 산화·환원 반응.' },

    { category: '산·염기', word: 'pH', explanation: '수용액의 산성도를 나타내는 척도. pH = −log[H₃O⁺]' },
    { category: '산·염기', word: '중화 반응', explanation: '산의 H⁺(H₃O⁺)과 염기의 OH⁻이 반응해 물이 생성되는 반응.' },
    { category: '산·염기', word: '짝산-짝염기', explanation: 'H⁺의 이동으로 서로 바뀌는 산과 염기의 쌍.' },
    { category: '산·염기', word: '브뢴스테드-로리 산', explanation: '다른 물질에 H⁺(양성자)을 내놓는 물질.' },
    { category: '산·염기', word: '지시약', explanation: 'pH에 따라 색이 변해 용액의 액성을 알려 주는 물질.' },

    { category: '화학 결합', word: '공유 결합', explanation: '비금속 원자들이 전자쌍을 공유하여 이루는 결합.' },
    { category: '화학 결합', word: '이온 결합', explanation: '양이온과 음이온 사이의 정전기적 인력에 의한 결합.' },
    { category: '화학 결합', word: '금속 결합', explanation: '금속 양이온과 자유 전자 사이의 정전기적 인력에 의한 결합.' },
    { category: '화학 결합', word: '옥텟 규칙', explanation: '원자가 가장 바깥 전자 껍질에 전자 8개를 채워 안정해지려는 경향.' },
    { category: '화학 결합', word: '전기 음성도', explanation: '공유 전자쌍을 끌어당기는 상대적인 능력. 결합의 극성을 판단할 때 쓴다.' },

    { category: '화학 평형', word: '가역 반응', explanation: '정반응과 역반응이 모두 일어날 수 있는 반응.' },
    { category: '화학 평형', word: '동적 평형', explanation: '정반응 속도와 역반응 속도가 같아 겉보기에 변화가 없는 상태.' },
    { category: '화학 평형', word: '평형 상수', explanation: '일정한 온도에서 평형 상태의 농도 관계를 나타낸 값(K).' },
    { category: '화학 평형', word: '르샤틀리에 원리', explanation: '평형 상태에 변화를 주면 그 변화를 줄이는 방향으로 평형이 이동한다.' },
    { category: '화학 평형', word: '정반응', explanation: '가역 반응에서 반응물이 생성물로 바뀌는 방향의 반응.' },
  ],
};
