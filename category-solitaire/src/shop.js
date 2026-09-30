// 학생 상점: 게임 점수로 모은 코인으로 카드 뒷면 디자인을 산다
import { api } from './api.js';
import { esc } from './board.js';
import { CARD_BACKS, priceOf } from './card-backs.js';


// session: student.js 의 입장 정보 { code, studentNo, wallet, pin? } — 구매 결과로 wallet 이 바뀐다
export function showShop(ctx, session, onBack) {
  const { app } = ctx;
  let busy = false;

  function render(message = '', kind = '') {
    const w = session.wallet;
    app.innerHTML = `
      <main class="page">
        <button type="button" class="back-link" id="btn-back">← 세트 고르기</button>
        <h1 class="title">카드 뒷면 상점</h1>
        <p class="lead">게임 점수의 1/10이 코인으로 쌓여요. 산 디자인은 게임의 뒷면 카드에 적용돼요.</p>
        <p class="coin-balance" aria-live="polite">🪙 <b>${w.coins}</b> 코인</p>
        <p class="save-status ${kind}" role="status">${message}</p>
        <ul class="shop-grid">
          ${CARD_BACKS.map((b) => {
            const owned = w.owned.includes(b.id);
            const equipped = w.equipped === b.id;
            const short = !owned && w.coins < b.price;
            const button = equipped
              ? '<button type="button" class="btn small" disabled>사용 중</button>'
              : owned
                ? `<button type="button" class="btn small ghost" data-equip="${b.id}">사용하기</button>`
                : `<button type="button" class="btn small ${short ? 'ghost' : ''}" data-buy="${b.id}">🪙 ${b.price}</button>`;
            return `
              <li class="shop-item ${equipped ? 'equipped' : ''}">
                <span class="back-sample" data-back="${b.id}" aria-hidden="true"></span>
                <b>${esc(b.name)}</b>
                <span class="shop-state">${equipped ? '✔ 사용 중' : owned ? '보유' : short ? `${b.price - w.coins}코인 더 필요` : ''}</span>
                ${button}
              </li>`;
          }).join('')}
        </ul>
        <p class="note">상점 비밀번호를 잊으면 선생님께 초기화를 부탁하세요.</p>
      </main>`;

    app.querySelector('#btn-back').addEventListener('click', onBack);
    app.querySelectorAll('[data-buy]').forEach((b) => b.addEventListener('click', () => act('buy', b.dataset.buy)));
    app.querySelectorAll('[data-equip]').forEach((b) => b.addEventListener('click', () => act('equip', b.dataset.equip)));
  }

  async function act(action, item) {
    if (busy) return;
    const w = session.wallet;
    if (action === 'buy' && w.coins < priceOf(item)) {
      return render(`코인이 ${priceOf(item) - w.coins}개 더 필요해요. 게임을 더 해 보세요!`, 'bad');
    }
    const pin = session.pin || (await askPin(!w.has_pin));
    if (!pin) return;
    busy = true;
    try {
      const r = await api.shopAction({ code: session.code, studentNo: session.studentNo, pin, action, item });
      if (r.error) {
        if (r.error === 'WRONG_PIN') session.pin = null;
        return render(shopErrorText(r), 'bad');
      }
      session.wallet = r;
      session.pin = pin; // 이 화면을 쓰는 동안만 기억 (새로고침하면 다시 물어봄)
      const name = CARD_BACKS.find((b) => b.id === item)?.name;
      render(action === 'buy' ? `‘${name}’ 디자인을 샀어요! 다음 게임부터 적용돼요.` : `이제 ‘${name}’ 디자인을 사용해요.`, 'ok');
    } catch (e) {
      render(e.message, 'bad');
    } finally {
      busy = false;
    }
  }

  render();
}

function shopErrorText(r) {
  switch (r.error) {
    case 'WRONG_PIN':
      return r.tries_left > 0
        ? `비밀번호가 틀렸어요. (${r.tries_left}번 더 틀리면 10분 동안 잠겨요)`
        : '비밀번호를 5번 틀려서 10분 동안 잠겼어요.';
    case 'PIN_LOCKED': return `비밀번호를 여러 번 틀려서 잠겼어요. ${r.minutes}분 뒤에 다시 해 주세요.`;
    case 'NOT_ENOUGH_COINS': return `코인이 ${r.price - r.coins}개 더 필요해요.`;
    case 'NOT_OWNED': return '아직 사지 않은 디자인이에요.';
    default: return '처리하지 못했어요. 다시 시도해 주세요.';
  }
}

// 4자리 비밀번호 입력 창. isNew면 새로 정하기(두 번 입력). 취소하면 null
function askPin(isNew) {
  return new Promise((resolve) => {
    const box = document.createElement('div');
    box.className = 'modal-overlay';
    box.innerHTML = `
      <form class="modal" role="dialog" aria-modal="true" aria-labelledby="pin-title" novalidate>
        <h2 id="pin-title" class="panel-title">${isNew ? '상점 비밀번호 정하기' : '상점 비밀번호'}</h2>
        <p class="note">${isNew
          ? '처음이에요! 친구가 내 코인을 쓰지 못하게 숫자 4자리를 정해 주세요. 꼭 기억하세요.'
          : '처음에 정한 숫자 4자리를 입력하세요.'}</p>
        <label>비밀번호 (숫자 4자리)
          <input name="pin" type="password" inputmode="numeric" autocomplete="off" maxlength="4" pattern="[0-9]{4}" required />
        </label>
        ${isNew ? `<label>한 번 더
          <input name="pin2" type="password" inputmode="numeric" autocomplete="off" maxlength="4" pattern="[0-9]{4}" required />
        </label>` : ''}
        <p class="form-error" role="alert"></p>
        <div class="btn-row">
          <button type="button" class="btn ghost" data-cancel>취소</button>
          <button type="submit" class="btn">확인</button>
        </div>
      </form>`;
    const form = box.querySelector('form');
    const done = (v) => { box.remove(); resolve(v); };
    box.querySelector('[data-cancel]').addEventListener('click', () => done(null));
    box.addEventListener('keydown', (e) => { if (e.key === 'Escape') done(null); });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const f = new FormData(form);
      const pin = String(f.get('pin'));
      const err = form.querySelector('.form-error');
      if (!/^[0-9]{4}$/.test(pin)) return (err.textContent = '숫자 4자리를 입력해 주세요.');
      if (isNew && pin !== f.get('pin2')) return (err.textContent = '두 번 입력한 숫자가 달라요.');
      done(pin);
    });
    document.body.appendChild(box);
    form.querySelector('[name="pin"]').focus();
  });
}
