// 모두 분류했을 때의 축하 애니메이션
// ① 칸에 쌓인 카드들이 가운데로 날아와 뒤집히고 ② 두 더미로 나뉘어 촤라락 섞인 뒤
// ③ 사방으로 흩어지며 색종이가 터진다. 화면을 누르면 바로 건너뛴다.
// 끝나면 Promise가 풀린다. (움직임 줄이기 설정이면 짧은 축하 문구만 보여 준다)

const CONFETTI_COLORS = ['#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff', '#9b5de5', '#ff9f43', '#ffffff'];
const MAX_CARDS = 24;

// origins: [{ el: 칸 요소, texts: [카드 글자…] }], back: 카드 뒷면 디자인 id
export function celebrate({ origins, back = 'default' }) {
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const overlay = document.createElement('div');
  overlay.className = 'celebrate';
  overlay.dataset.back = back;
  overlay.innerHTML = `<div class="cel-banner" role="status">
      <b>모두 분류 완료!</b><span>화면을 누르면 결과로 넘어가요</span></div>`;
  document.body.appendChild(overlay);
  const banner = overlay.querySelector('.cel-banner');

  const running = [];
  const anim = (el, frames, opts) => {
    // 나중 단계 애니메이션이 시작 전에 앞 단계를 덮지 않도록 기본은 forwards
    const a = el.animate(frames, { fill: 'forwards', ...opts });
    running.push(a);
    return a;
  };

  return new Promise((resolve) => {
    let done = false;
    const timers = [];
    const finish = () => {
      if (done) return;
      done = true;
      timers.forEach(clearTimeout);
      overlay.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 250, fill: 'both' }).finished
        .catch(() => {})
        .finally(() => { running.forEach((a) => a.cancel()); overlay.remove(); resolve(); });
    };
    const later = (ms, fn) => timers.push(setTimeout(fn, ms));
    overlay.addEventListener('pointerdown', finish);

    if (reduced || typeof overlay.animate !== 'function') {
      banner.classList.add('show');
      later(1400, finish);
      return;
    }

    // ---------- 카드 만들기: 칸 위치에서 앞면(단어)으로 시작 ----------
    const W = Math.min(64, Math.max(48, window.innerWidth / 7));
    const H = W * 4 / 3;
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    const picks = pickCards(origins, MAX_CARDS);
    const cards = picks.map(({ rect, text }, i) => {
      const el = document.createElement('div');
      el.className = 'cel-card';
      el.style.width = W + 'px';
      el.style.height = H + 'px';
      el.innerHTML = `<div class="cel-face cel-front"><span>${esc(text)}</span></div><div class="cel-face cel-back"></div>`;
      overlay.appendChild(el);
      const x0 = rect.left + rect.width / 2 - W / 2;
      const y0 = rect.top + rect.height / 2 - H / 2;
      return { el, x0, y0, i };
    });
    const n = cards.length;
    const at = (x, y, rot = 0, flip = 180, scale = 1) =>
      `translate(${x}px, ${y}px) rotate(${rot}deg) rotateY(${flip}deg) scale(${scale})`;
    const px = cx - W / 2;
    const py = cy - H / 2;

    // ① 가운데로 모이며 뒤집기 (한 장씩 시간차)
    const GATHER = 650;
    cards.forEach((c) => {
      anim(c.el, [
        { transform: at(c.x0, c.y0, 0, 0) },
        { transform: at((c.x0 + px) / 2, Math.min(c.y0, py) - 60, (c.i % 2 ? 1 : -1) * 25, 90, 1.1), offset: 0.5 },
        { transform: at(px, py - c.i * 0.6, 0, 180) },
      ], { duration: GATHER, delay: c.i * 25, easing: 'cubic-bezier(.3,.7,.3,1)', fill: 'both' });
      // 반쯤 돌았을 때(옆면이 보일 때) 앞면 → 뒷면으로 바꾼다
      later(c.i * 25 + GATHER / 2, () => c.el.classList.add('flipped'));
    });
    const t1 = GATHER + n * 25;

    // ② 두 더미로 나눈 뒤 번갈아 끼워 넣는 리플 셔플을 두 번
    const SPLIT = 260;
    const RIFFLE = 14;
    const shuffleRound = (start) => {
      cards.forEach((c) => {
        const left = c.i % 2 === 0;
        const sx = px + (left ? -W * 0.9 : W * 0.9);
        const tilt = left ? -12 : 12;
        const order = Math.floor(c.i / 2);
        anim(c.el, [
          { transform: at(px, py - c.i * 0.6, 0, 180) },
          { transform: at(sx, py - order * 1.2, tilt, 180) },
        ], { duration: SPLIT, delay: start, easing: 'ease-out' });
        anim(c.el, [
          { transform: at(sx, py - order * 1.2, tilt, 180) },
          { transform: at(px, py - c.i * 0.6 - 18, 0, 180), offset: 0.6 },
          { transform: at(px, py - c.i * 0.6, 0, 180) },
        ], { duration: 220, delay: start + SPLIT + 80 + (n - c.i) * RIFFLE, easing: 'ease-in' });
      });
      return start + SPLIT + 80 + n * RIFFLE + 240;
    };
    const t2 = shuffleRound(t1);
    const t3 = shuffleRound(t2);

    // ③ 사방으로 흩어지며 빙글빙글 + 색종이 + 축하 문구
    const radius = Math.min(window.innerWidth, window.innerHeight) * 0.42;
    cards.forEach((c) => {
      const ang = (c.i / n) * Math.PI * 2 - Math.PI / 2;
      const tx = px + Math.cos(ang) * radius;
      const ty = py + Math.sin(ang) * radius;
      const spin = (c.i % 2 ? 1 : -1) * (360 + (c.i % 5) * 45);
      anim(c.el, [
        { transform: at(px, py - c.i * 0.6, 0, 180) },
        { transform: at(tx, ty, spin, 180, 1.05) },
      ], { duration: 700, delay: t3 + c.i * 12, easing: 'cubic-bezier(.2,.9,.3,1.2)' });
    });
    later(t3 + 150, () => {
      banner.classList.add('show');
      burstConfetti(overlay, cx, cy, anim);
    });
    later(t3 + 2300, finish);
  });
}

// 칸마다 골고루 최대 max장을 고른다 (칸 이름 카드도 한 장씩 포함)
function pickCards(origins, max) {
  const pools = origins.map(({ el, texts }) => ({ rect: el.getBoundingClientRect(), texts: [...texts] }));
  const out = [];
  let k = 0;
  while (out.length < max && pools.some((p) => p.texts.length)) {
    const p = pools[k % pools.length];
    if (p.texts.length) out.push({ rect: p.rect, text: p.texts.shift() });
    k++;
  }
  // 카드가 너무 적으면 같은 카드를 한 번 더 써서 12장은 채운다
  for (let i = 0; out.length && out.length < 12; i++) out.push({ ...out[i] });
  return out;
}

function burstConfetti(overlay, cx, cy, anim) {
  const count = window.innerWidth < 500 ? 70 : 110;
  for (let i = 0; i < count; i++) {
    const bit = document.createElement('i');
    bit.className = 'cel-confetti';
    bit.style.background = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
    if (i % 3 === 0) bit.style.borderRadius = '50%';
    overlay.appendChild(bit);
    const ang = Math.random() * Math.PI * 2;
    const dist = 120 + Math.random() * Math.max(window.innerWidth, window.innerHeight) * 0.45;
    const dx = Math.cos(ang) * dist;
    const dy = Math.sin(ang) * dist;
    const fall = 160 + Math.random() * 220;
    const turn = (Math.random() - 0.5) * 1080;
    anim(bit, [
      { transform: `translate(${cx}px, ${cy}px) rotate(0deg) scale(.4)`, opacity: 1 },
      { transform: `translate(${cx + dx}px, ${cy + dy}px) rotate(${turn / 2}deg) scale(1)`, opacity: 1, offset: 0.45 },
      { transform: `translate(${cx + dx * 1.1}px, ${cy + dy + fall}px) rotate(${turn}deg) scale(1)`, opacity: 0 },
    ], { duration: 1600 + Math.random() * 900, easing: 'cubic-bezier(.15,.8,.35,1)' });
  }
}

const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
