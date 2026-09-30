// 게임 화면: 그리기 + 드래그 앤 드롭 / 탭 조작 + 타이머
import {
  createGame, flipStock, placeOnSlot, moveToColumn, topCardId, isFinished, unplacedWords,
} from './game.js';
import { liveScore, finalScore } from './settings.js';
import { celebrate } from './celebrate.js';

const DRAG_THRESHOLD = 8; // 이만큼(px) 움직여야 드래그로 본다 (그보다 작으면 탭)
const MIN_CARD_W = 56;     // 카드 최소 너비(px)

// 게임 화면을 root 안에 만들고 시작한다. 끝나면 onEnd(result)를 부른다.
export function startGame(root, set, baseSettings, { onEnd, onQuit }) {
  // 화면이 좁으면 카드가 너무 작아지지 않게 열 수를 자동으로 줄인다 (카드 최소 너비 약 56px)
  const usable = Math.min(window.innerWidth, 720) - 20;
  const maxCols = Math.max(3, Math.floor((usable + 8) / (MIN_CARD_W + 8)));
  const settings = { ...baseSettings, columns: Math.min(baseSettings.columns, maxCols) };
  const state = createGame(set, settings);
  const s = settings.score;
  let selected = null;   // 탭 방식으로 고른 카드 위치 { from, index }
  let drag = null;       // 드래그 진행 정보
  let busy = false;      // 튕김 애니메이션 중에는 조작 막기
  let ended = false;
  const startedAt = Date.now();

  root.innerHTML = `
    <div class="game" style="--cols:${settings.columns}" data-back="${esc(settings.cardBack || 'default')}">
      <header class="hud">
        <div class="hud-item"><span class="hud-label">점수</span><b id="hud-score">0</b></div>
        <div class="hud-item"><span class="hud-label" id="hud-time-label">시간</span><b id="hud-time">00:00</b></div>
        <div class="hud-item"><span class="hud-label">이동</span><b id="hud-moves">0</b></div>
        <button class="hud-quit" id="btn-quit" type="button">그만하기</button>
      </header>
      <section class="stock-row">
        <button class="pile stock" id="stock" type="button" aria-label="카드 더미 넘기기"></button>
        <div class="pile waste" id="waste"></div>
        <div class="toast" id="toast" role="status" aria-live="polite"></div>
      </section>
      <section class="slots" id="slots" aria-label="카테고리 칸"></section>
      <section class="tableau" id="tableau"></section>
    </div>`;

  const $ = (id) => root.querySelector('#' + id);
  const slotsEl = $('slots');
  const tableauEl = $('tableau');
  const wasteEl = $('waste');
  const stockEl = $('stock');

  // ---------- 그리기 ----------

  function cardHTML(id, src, extraClass = '') {
    const c = state.cards[id];
    // 열의 맨 위 카드는 같은 열에서 묶음을 골랐을 때도 함께 강조
    const isSel = selected && (src.from === 'col' ? selected.from === 'col' && selected.index === src.index : sameSrc(selected, src));
    const kind = c.type === 'category' ? 'category' : 'word';
    return `<div class="card ${kind} ${isSel ? 'selected' : ''} ${extraClass}" data-src="${srcKey(src)}" lang="${guessLang(c.text)}">
      ${kind === 'category' ? '<span class="card-badge">★<span class="badge-long"> 카테고리</span></span>' : ''}
      <span class="card-text">${esc(c.text)}</span>
    </div>`;
  }

  // 카테고리 칸: 한 줄에 최대 4개. 올려놓은 카드는 사라지지 않고 아래로 겹쳐 쌓인다
  function renderSlots() {
    slotsEl.style.setProperty('--slot-cols', Math.min(4, state.slots.length));
    slotsEl.innerHTML = state.slots.map((slot, i) => {
      if (!slot.category) {
        return `<button type="button" class="slot empty" data-slot="${i}">
          <span class="slot-empty-name">빈 칸</span><span class="slot-sub">★ 카드 놓기</span></button>`;
      }
      const total = state.totalByCategory[slot.category];
      const done = slot.placed.length === total;
      const pile = slot.placed.map((id) => `<span class="mini-card"><span class="mini-text fit">${esc(state.cards[id].text)}</span></span>`).join('');
      return `<button type="button" class="slot ${done ? 'complete' : ''}" data-slot="${i}">
        <span class="slot-head">
          <span class="slot-name fit">${esc(slot.category)}</span>
          <span class="slot-count">${done ? '✔ 완성' : `${slot.placed.length}/${total}`}</span>
        </span>
        <span class="slot-pile">${pile}</span></button>`;
    }).join('');
  }

  function renderPiles() {
    stockEl.innerHTML = state.stock.length
      ? `<div class="card back"></div><span class="pile-count">${state.stock.length}</span>`
      : `<span class="pile-empty">${state.waste.length ? '↻ 다시' : ''}</span>`;
    const w = topCardId(state, { from: 'waste' });
    wasteEl.innerHTML = w ? cardHTML(w, { from: 'waste' }) : '<span class="pile-empty"></span>';

    tableauEl.innerHTML = state.columns.map((col, i) => {
      // 밑에 깔린 카드: 뒷면이면 줄무늬, 한 번 앞면이 된 카드면 윗부분(단어)만 보이게
      // 앞면 카드를 잡으면 그 카드부터 맨 위까지 한 묶음(count장)으로 움직인다
      const backs = col.slice(0, -1).map((id, k) => {
        if (!state.faceUp.has(id)) return '<div class="back-strip"></div>';
        const c = state.cards[id];
        const count = col.length - k;
        const sel = selected && selected.from === 'col' && selected.index === i && (selected.count || 1) >= count;
        return `<div class="peek-card ${c.type === 'category' ? 'category' : ''} ${sel ? 'selected' : ''}" data-src="${srcKey({ from: 'col', index: i, count })}">
          <span class="peek-text fit">${c.type === 'category' ? '★ ' : ''}${esc(c.text)}</span></div>`;
      }).join('');
      const top = col.length ? cardHTML(col[col.length - 1], { from: 'col', index: i }) : '<div class="col-empty"></div>';
      return `<div class="col" data-col="${i}">${backs}${top}</div>`;
    }).join('');
  }

  function renderHud() {
    $('hud-score').textContent = liveScore(state.stats, s);
    $('hud-moves').textContent = state.stats.moves;
  }

  function render() {
    renderSlots();
    renderPiles();
    renderHud();
    root.querySelector('.game').classList.toggle('has-selection', !!selected);
    fitAll(root);
  }

  // ---------- 타이머 ----------

  const elapsedSec = () => Math.floor((Date.now() - startedAt) / 1000);
  if (settings.timeLimitOn) $('hud-time-label').textContent = '남은 시간';
  function tick() {
    const e = elapsedSec();
    if (settings.timeLimitOn) {
      const left = Math.max(0, settings.timeLimitSec - e);
      $('hud-time').textContent = mmss(left);
      $('hud-time').classList.toggle('warn', left <= 30);
      if (left === 0) finish(false);
    } else {
      $('hud-time').textContent = mmss(e);
    }
  }
  const timer = setInterval(tick, 250);
  tick();

  // ---------- 조작: 공통 동작 ----------

  let toastTimer;
  function toast(msg, kind = '') {
    const t = $('toast');
    t.textContent = msg;
    t.className = 'toast show ' + kind;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.className = 'toast'), 1600);
  }

  function flash(el, cls) {
    if (!el) return;
    el.classList.remove(cls);
    void el.offsetWidth; // 애니메이션 다시 시작
    el.classList.add(cls);
  }

  // src의 카드를 target(칸 또는 열)으로 옮기려고 시도한다. clone은 드래그 중인 복제 카드
  function tryMove(src, target, clone) {
    selected = null;
    if (target.type === 'col') {
      if (moveToColumn(state, src, target.index)) {
        clone?.remove();
        render();
      } else {
        bounceBack(src, clone);
      }
      return;
    }

    const res = placeOnSlot(state, src, target.index);
    const slotEl = () => slotsEl.querySelector(`[data-slot="${target.index}"]`);
    if (res.result === 'correct' || res.result === 'category') {
      clone?.remove();
      render();
      flash(slotEl(), res.complete ? 'pop-complete' : 'pop-ok');
      if (res.result === 'category') toast(`‘${res.card.text}’ 칸이 열렸어요`, 'ok');
      if (res.count > 1) toast(`${res.count}장을 한 번에 분류했어요!`, 'ok');
      if (res.complete) toast(`‘${res.card.category}’ 완성!`, 'ok');
      if (isFinished(state)) setTimeout(() => finish(true), 600);
      return;
    }

    // 오답 또는 잘못된 조작: 원래 자리로 튕겨 돌아가기
    if (res.result === 'wrong') {
      navigator.vibrate?.(120);
      flash(slotEl(), 'pop-bad');
      toast(res.message, 'bad');
    } else if (res.message) {
      toast(res.message);
    }
    renderHud();
    bounceBack(src, clone);
  }

  // 복제 카드를 원래 위치로 날려 보내고, 원래 카드를 흔든다
  function bounceBack(src, clone) {
    const origin = () => root.querySelector(`[data-src="${srcKey(src)}"]`);
    const shake = () => {
      root.querySelectorAll('.drag-origin').forEach((el) => el.classList.remove('drag-origin'));
      render();
      flash(origin(), 'shake');
    };
    if (!clone) return shake();
    busy = true;
    const r = origin()?.getBoundingClientRect();
    if (r) {
      clone.style.transition = 'left .22s ease, top .22s ease';
      clone.style.left = r.left + 'px';
      clone.style.top = r.top + 'px';
    }
    setTimeout(() => { clone.remove(); busy = false; shake(); }, r ? 230 : 0);
  }

  // ---------- 조작: 포인터(마우스·터치 공통) ----------

  // 화면 좌표 아래의 놓을 곳(칸 또는 열) 찾기
  function targetAt(x, y) {
    const el = document.elementFromPoint(x, y);
    const slot = el?.closest('[data-slot]');
    if (slot) return { type: 'slot', index: +slot.dataset.slot, el: slot };
    const col = el?.closest('[data-col]');
    if (col) return { type: 'col', index: +col.dataset.col, el: col };
    return null;
  }

  function onPointerDown(e) {
    if (busy || ended || e.button > 0) return;
    const cardEl = e.target.closest('[data-src]');
    if (!cardEl) return;
    drag = { src: parseSrc(cardEl.dataset.src), el: cardEl, x0: e.clientX, y0: e.clientY, moving: false };
  }

  function onPointerMove(e) {
    if (!drag) return;
    const dx = e.clientX - drag.x0;
    const dy = e.clientY - drag.y0;
    if (!drag.moving) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      // 드래그 시작: 카드(묶음이면 그 위 카드들까지) 복제본을 만들어 손가락을 따라가게 한다
      const r = drag.el.getBoundingClientRect();
      const parts = [drag.el];
      if ((drag.src.count || 1) > 1) {
        for (let n = drag.el.nextElementSibling; n; n = n.nextElementSibling) parts.push(n);
      }
      let clone;
      if (parts.length > 1) {
        clone = document.createElement('div');
        clone.className = 'drag-clone drag-run';
        for (const part of parts) {
          const c = part.cloneNode(true);
          c.classList.remove('selected', 'shake');
          clone.appendChild(c);
        }
        Object.assign(clone.style, { width: r.width + 'px', left: r.left + 'px', top: r.top + 'px' });
      } else {
        clone = drag.el.cloneNode(true);
        clone.classList.add('drag-clone');
        clone.classList.remove('selected', 'shake');
        Object.assign(clone.style, { width: r.width + 'px', height: r.height + 'px', left: r.left + 'px', top: r.top + 'px' });
      }
      document.body.appendChild(clone);
      parts.forEach((part) => part.classList.add('drag-origin'));
      drag.clone = clone;
      drag.left0 = r.left;
      drag.top0 = r.top;
      drag.moving = true;
      selected = null;
      root.querySelector('.game').classList.add('has-selection');
    }
    e.preventDefault();
    drag.clone.style.left = drag.left0 + dx + 'px';
    drag.clone.style.top = drag.top0 + dy + 'px';
    const t = targetAt(e.clientX, e.clientY);
    root.querySelectorAll('.drop-over').forEach((el) => el.classList.remove('drop-over'));
    t?.el.classList.add('drop-over');
  }

  function onPointerUp(e) {
    if (!drag) return;
    const d = drag;
    drag = null;
    root.querySelectorAll('.drop-over').forEach((el) => el.classList.remove('drop-over'));
    if (d.moving) {
      const t = targetAt(e.clientX, e.clientY);
      if (t && !(t.type === 'col' && d.src.from === 'col' && d.src.index === t.index)) tryMove(d.src, t, d.clone);
      else bounceBack(d.src, d.clone);
    } else {
      onCardTap(d.src);
    }
  }

  // 카드를 탭했을 때: 고르기 / 고르기 취소 / (다른 열의 카드면) 그 열로 옮기기
  function onCardTap(src) {
    if (selected && sameSrc(selected, src)) {
      selected = null;
    } else if (selected && src.from === 'col' && selected.from === 'col' && selected.index === src.index) {
      selected = src; // 같은 열에서 다른 카드를 누르면 묶음을 다시 고른다
    } else if (selected && src.from === 'col') {
      return tryMove(selected, { type: 'col', index: src.index });
    } else {
      selected = src;
    }
    render();
  }

  // 카테고리 칸이나 빈 열을 탭했을 때
  function onClick(e) {
    if (busy || ended) return;
    if (e.target.closest('#stock')) {
      selected = null;
      const r = flipStock(state);
      if (r === 'recycle') toast('더미를 처음부터 다시 넘겨요');
      render();
      return;
    }
    if (e.target.closest('[data-src]')) return; // 카드 탭은 pointerup에서 처리
    const slot = e.target.closest('[data-slot]');
    const col = e.target.closest('[data-col]');
    if (!selected) {
      if (slot) toast('먼저 아래에서 카드를 골라요');
      return;
    }
    if (slot) tryMove(selected, { type: 'slot', index: +slot.dataset.slot });
    else if (col) tryMove(selected, { type: 'col', index: +col.dataset.col });
  }

  root.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove, { passive: false });
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);
  root.addEventListener('click', onClick);
  $('btn-quit').addEventListener('click', () => {
    if (confirm('게임을 그만할까요? 이번 기록은 저장되지 않아요.')) { cleanup(); onQuit(); }
  });
  window.addEventListener('resize', onResize);
  function onResize() { fitAll(root); }

  function cleanup() {
    ended = true;
    clearInterval(timer);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerUp);
    window.removeEventListener('resize', onResize);
    document.querySelectorAll('.drag-clone').forEach((el) => el.remove());
  }

  // 게임 종료: finished=true면 모두 분류, false면 시간 초과
  function finish(finished) {
    if (ended) return;
    cleanup();
    const stats = { ...state.stats, finished, elapsedSec: Math.min(elapsedSec(), settings.timeLimitOn ? settings.timeLimitSec : Infinity) };
    const result = {
      setName: state.setName,
      finished,
      stats,
      score: finalScore(stats, s),
      wrongLog: state.wrongLog,
      unplaced: finished ? [] : unplacedWords(state),
      explanations: Object.fromEntries(Object.values(state.cards).filter((c) => c.type === 'word').map((c) => [c.text, c])),
    };
    if (!finished) return onEnd(result);
    // 모두 분류했으면 칸에 쌓인 카드로 셔플 축하 애니메이션을 보여 준 뒤 결과로 넘어간다
    const origins = state.slots.map((slot, i) => ({
      el: slotsEl.querySelector(`[data-slot="${i}"]`),
      texts: [slot.category, ...slot.placed.map((id) => state.cards[id].text)],
    })).filter((o) => o.el);
    celebrate({ origins, back: settings.cardBack || 'default' }).then(() => onEnd(result));
  }

  render();
  // 다른 화면으로 이동할 때 타이머·이벤트를 정리할 수 있게 돌려준다
  return { stop: cleanup };
}

// ---------- 도우미 함수 ----------

// 위치 ↔ 글자: 'waste', 'col:2'(맨 위 카드), 'col:2:3'(2번 열의 위에서 3장 묶음)
const srcKey = (src) => (src.from === 'col' ? `col:${src.index}${(src.count || 1) > 1 ? ':' + src.count : ''}` : 'waste');
const parseSrc = (k) => {
  if (k === 'waste') return { from: 'waste' };
  const [, index, count] = k.split(':');
  return { from: 'col', index: +index, count: +(count || 1) };
};
const sameSrc = (a, b) => a.from === b.from && a.index === b.index && (a.count || 1) === (b.count || 1);
const mmss = (sec) => `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;

export function esc(str) {
  return String(str).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

// 줄바꿈·하이픈 처리를 위해 대략적인 언어를 추정 (한글이 있으면 ko, 독일어 문자가 있으면 de)
function guessLang(text) {
  if (/[가-힣]/.test(text)) return 'ko';
  if (/[äöüßÄÖÜ]/.test(text)) return 'de';
  return 'en';
}

// 긴 단어는 칸에 들어갈 때까지 글자 크기를 줄이고, 그래도 넘치면 단어 중간에서 줄바꿈
export function fitAll(root) {
  root.querySelectorAll('.card-text, .fit').forEach((el) => {
    el.style.fontSize = '';
    el.classList.remove('break-any');
    const box = el.parentElement;
    const maxH = el.classList.contains('card-text') ? box.clientHeight - 8 : null;
    let size = parseFloat(getComputedStyle(el).fontSize);
    const min = 9;
    const overflow = () => el.scrollWidth > el.clientWidth + 1 || (maxH && el.scrollHeight > maxH);
    const base = size;
    const shrink = () => {
      while (overflow() && size > min) {
        size -= 1;
        el.style.fontSize = size + 'px';
      }
    };
    shrink();
    if (overflow()) {
      // 가장 작은 글자로도 안 들어가면 단어 중간 줄바꿈을 켜고 다시 맞춘다
      el.classList.add('break-any');
      size = base;
      el.style.fontSize = size + 'px';
      shrink();
    }
  });
}
