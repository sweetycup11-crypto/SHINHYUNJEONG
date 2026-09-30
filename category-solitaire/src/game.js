// 게임 규칙과 상태 관리 (화면과 분리된 순수 로직)
//
// 카드 위치:
//   columns[i] : 카드 열. 배열의 마지막 카드가 맨 위
//   faceUp     : 한 번이라도 앞면이 된 카드 id (열에서 다른 카드에 덮여도 윗부분이 보인다)
//   stock      : 뒷면 카드 더미. 마지막 카드가 맨 위
//   waste      : 더미에서 넘긴 카드. 마지막 카드가 맨 위(앞면)
//   slots[i]   : 위쪽 카테고리 칸. category가 null이면 아직 열리지 않은 빈 칸
//
// 카드를 꺼내는 위치(src)는 { from: 'col', index, count } 또는 { from: 'waste' } 로 나타낸다.
// count 는 열에서 함께 잡은 카드 수 (1 = 맨 위 카드만, 2 이상 = 밑에 깔린 앞면 카드부터 맨 위까지 한 묶음).

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

  // 처음에는 각 열의 맨 위 카드만 앞면
  const faceUp = new Set(columns.filter((col) => col.length).map((col) => col[col.length - 1]));

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
    faceUp,
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

// 위치(src)에서 잡은 카드 id 목록 (아래 → 위 순서). 잡을 수 없으면 null
// 묶음은 모두 앞면 카드여야 한다.
export function pickedIds(state, src) {
  const pile = src.from === 'col' ? state.columns[src.index] : state.waste;
  const n = src.from === 'col' ? src.count || 1 : 1;
  if (!pile || n < 1 || n > pile.length) return null;
  const ids = pile.slice(-n);
  if (n > 1 && !ids.every((id) => state.faceUp.has(id))) return null;
  return ids;
}

// 잡은 카드를 꺼내고, 열에서 꺼냈다면 드러난 아래 카드를 앞면으로 뒤집는다
function takeFrom(state, src, n) {
  const pile = src.from === 'col' ? state.columns[src.index] : state.waste;
  const ids = pile.splice(pile.length - n, n);
  if (src.from === 'col' && pile.length) state.faceUp.add(pile[pile.length - 1]);
  return ids;
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
  const ids = pickedIds(state, src);
  if (!ids) return { result: 'invalid' };
  const slot = state.slots[slotIndex];
  if (ids.length > 1) return placeRunOnSlot(state, src, slot, ids);
  const id = ids[0];
  const card = state.cards[id];

  if (card.type === 'category') {
    // 카테고리 카드는 빈 칸에만 놓을 수 있다 (감점 없이 되돌아감)
    if (slot.category) return { result: 'invalid', message: '카테고리 카드는 빈 칸에 놓아요' };
    takeFrom(state, src, 1);
    slot.category = card.category;
    state.stats.moves++;
    state.stats.categoryOpened++;
    return { result: 'category', card };
  }

  state.stats.moves++;
  if (slot.category === card.category) {
    takeFrom(state, src, 1);
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

// 여러 장(묶음)을 한 번에 칸에 놓는다: 모두 맞으면 한꺼번에 쌓고, 하나라도 틀리면 모두 제자리
// 이동은 1번으로 세고, 틀린 카드마다 오답 1번
function placeRunOnSlot(state, src, slot, ids) {
  const cards = ids.map((id) => state.cards[id]);
  if (cards.some((c) => c.type === 'category')) {
    return { result: 'invalid', message: '카테고리 카드는 한 장씩 옮겨요' };
  }
  state.stats.moves++;
  const wrongCards = cards.filter((c) => c.category !== slot.category);
  if (!wrongCards.length) {
    takeFrom(state, src, ids.length);
    slot.placed.push(...ids);
    state.stats.correct += ids.length;
    const complete = slot.placed.length === state.totalByCategory[slot.category];
    return { result: 'correct', card: cards[cards.length - 1], count: ids.length, complete };
  }
  for (const c of wrongCards) {
    state.stats.wrong++;
    state.wrongLog.push({ word: c.text, placed: slot.category || EMPTY_SLOT_LABEL, answer: c.category });
  }
  return {
    result: 'wrong',
    card: wrongCards[0],
    message: slot.category ? `${ids.length}장 중 ${wrongCards.length}장이 다른 카테고리예요` : '먼저 카테고리 카드로 칸을 열어요',
  };
}

// 카드(또는 묶음)를 다른 카드 열로 옮긴다 (밑에 깔린 카드를 꺼내기 위한 이동)
export function moveToColumn(state, src, colIndex) {
  if (src.from === 'col' && src.index === colIndex) return false;
  const ids = pickedIds(state, src);
  if (!ids) return false;
  takeFrom(state, src, ids.length);
  state.columns[colIndex].push(...ids);
  for (const id of ids) state.faceUp.add(id);
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
