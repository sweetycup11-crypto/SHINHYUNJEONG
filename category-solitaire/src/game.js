// 게임 규칙과 상태 관리 (화면과 분리된 순수 로직)
//
// 카드 위치:
//   columns[i] : 카드 열. 배열의 마지막 카드가 맨 위(앞면)
//   stock      : 뒷면 카드 더미. 마지막 카드가 맨 위
//   waste      : 더미에서 넘긴 카드. 마지막 카드가 맨 위(앞면)
//   slots[i]   : 위쪽 카테고리 칸. category가 null이면 아직 열리지 않은 빈 칸
//
// 카드를 꺼내는 위치(src)는 { from: 'col', index } 또는 { from: 'waste' } 로 나타낸다.

export const EMPTY_SLOT_LABEL = '(빈 칸)';

// 배열을 무작위로 섞는다 (피셔-예이츠)
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 세트 행 목록에서 카테고리 순서(처음 나온 순서)를 뽑는다
export function categoriesOf(rows) {
  const list = [];
  for (const r of rows) if (!list.includes(r.category)) list.push(r.category);
  return list;
}

// 새 게임 상태를 만든다
export function createGame(set, settings) {
  const categories = categoriesOf(set.rows);
  const cards = {};
  let n = 0;

  for (const r of set.rows) {
    const id = 'w' + n++;
    cards[id] = { id, type: 'word', text: r.word, category: r.category, explanation: r.explanation || '' };
  }
  if (settings.shuffleCategories) {
    for (const c of categories) {
      const id = 'c' + n++;
      cards[id] = { id, type: 'category', text: c, category: c };
    }
  }

  // 카드 열에 솔리테어처럼 계단식(1장, 2장, 3장…)으로 나누고 나머지는 더미로
  const deck = shuffle(Object.keys(cards));
  const colCount = settings.columns;
  const columns = Array.from({ length: colCount }, () => []);
  for (let row = 0; row < colCount && deck.length; row++) {
    for (let c = row; c < colCount && deck.length; c++) columns[c].push(deck.pop());
  }

  const wordCount = set.rows.length;
  const totalByCategory = {};
  for (const r of set.rows) totalByCategory[r.category] = (totalByCategory[r.category] || 0) + 1;

  // 카테고리 카드 섞기를 끄면 칸이 처음부터 열려 있다
  const slots = categories.map((c) => ({
    category: settings.shuffleCategories ? null : c,
    placed: [],
  }));

  return {
    setName: set.name,
    cards,
    columns,
    stock: deck,
    waste: [],
    slots,
    totalByCategory,
    stats: {
      correct: 0,
      wrong: 0,
      categoryOpened: 0,
      moves: 0,
      wordCount,
      totalCards: Object.keys(cards).length,
      minMoves: Object.keys(cards).length, // 모든 카드를 한 번씩만 옮기는 경우
    },
    wrongLog: [], // { word, placed, answer }
  };
}

// 위치(src)의 맨 위 카드 id (없으면 null)
export function topCardId(state, src) {
  const pile = src.from === 'col' ? state.columns[src.index] : state.waste;
  return pile.length ? pile[pile.length - 1] : null;
}

function popFrom(state, src) {
  return (src.from === 'col' ? state.columns[src.index] : state.waste).pop();
}

// 뒷면 더미를 탭: 한 장 넘기기, 다 넘겼으면 처음부터 다시
export function flipStock(state) {
  if (state.stock.length) {
    state.waste.push(state.stock.pop());
    return 'flip';
  }
  if (state.waste.length) {
    state.stock = state.waste.reverse();
    state.waste = [];
    return 'recycle';
  }
  return 'none';
}

// 카드를 카테고리 칸에 놓는다
// 반환값 result: 'correct' | 'category' | 'wrong' | 'invalid'
export function placeOnSlot(state, src, slotIndex) {
  const id = topCardId(state, src);
  if (!id) return { result: 'invalid' };
  const card = state.cards[id];
  const slot = state.slots[slotIndex];

  if (card.type === 'category') {
    // 카테고리 카드는 빈 칸에만 놓을 수 있다 (감점 없이 되돌아감)
    if (slot.category) return { result: 'invalid', message: '카테고리 카드는 빈 칸에 놓아요' };
    popFrom(state, src);
    slot.category = card.category;
    state.stats.moves++;
    state.stats.categoryOpened++;
    return { result: 'category', card };
  }

  state.stats.moves++;
  if (slot.category === card.category) {
    popFrom(state, src);
    slot.placed.push(id);
    state.stats.correct++;
    const complete = slot.placed.length === state.totalByCategory[slot.category];
    return { result: 'correct', card, complete };
  }

  // 오답: 카드는 제자리에 두고 기록만 남긴다
  state.stats.wrong++;
  state.wrongLog.push({
    word: card.text,
    placed: slot.category || EMPTY_SLOT_LABEL,
    answer: card.category,
  });
  return {
    result: 'wrong',
    card,
    message: slot.category ? '다른 카테고리예요' : '먼저 카테고리 카드로 칸을 열어요',
  };
}

// 카드를 다른 카드 열로 옮긴다 (밑에 깔린 카드를 꺼내기 위한 이동)
export function moveToColumn(state, src, colIndex) {
  if (src.from === 'col' && src.index === colIndex) return false;
  const id = popFrom(state, src);
  if (!id) return false;
  state.columns[colIndex].push(id);
  state.stats.moves++;
  return true;
}

// 모든 단어 카드를 분류했는가
export function isFinished(state) {
  return state.stats.correct === state.stats.wordCount;
}

// 아직 분류하지 못한 단어 카드 (시간 초과로 끝났을 때 결과 표시용)
export function unplacedWords(state) {
  const placed = new Set(state.slots.flatMap((s) => s.placed));
  return Object.values(state.cards).filter((c) => c.type === 'word' && !placed.has(c.id));
}
