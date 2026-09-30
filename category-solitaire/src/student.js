// 학생 화면: 수업 코드 + 학번으로 입장 → 공개된 세트 고르기 → 게임 → 결과 저장
import { api, STUDENT_NO_RE } from './api.js';
import { mergeSettings } from './settings.js';
import { categoriesOf } from './game.js';
import { esc } from './board.js';
import { showResult, toAttemptPayload } from './result.js';
import { showShop } from './shop.js';

const EMPTY_WALLET = { coins: 0, owned: ['default'], equipped: 'default', has_pin: false };

// 마지막으로 입력한 수업 코드·학번을 이 기기에 기억 (편의 기능, 실패해도 무관)
const REMEMBER_KEY = 'cs-student';
function remembered() {
  try { return JSON.parse(localStorage.getItem(REMEMBER_KEY)) || {}; } catch { return {}; }
}
function remember(v) {
  try { localStorage.setItem(REMEMBER_KEY, JSON.stringify(v)); } catch { /* 무시 */ }
}

let session = null; // { code, studentNo, studentName, className, settings, sets, wallet, pin }

// ctx: { app, runGame(set, settings, handlers), applyTheme(theme), goTeacher() }
export function showStudentEntry(ctx, prefillCode = '') {
  const { app } = ctx;
  const last = remembered();
  ctx.applyTheme('blue');
  app.innerHTML = `
    <main class="page">
      <h1 class="title">카테고리 솔리테어</h1>
      <p class="lead">단어 카드를 알맞은 카테고리 칸으로 분류하는 게임이에요.</p>
      ${api.mode === 'demo' ? '<p class="demo-banner">체험 모드: 기록이 이 브라우저에만 저장돼요. 체험 수업 코드는 <b>DEMO23</b> 이에요.</p>' : ''}

      ${prefillCode ? `<p class="notice">수업 코드 <b>${esc(prefillCode.toUpperCase())}</b>로 들어왔어요. 학번을 입력하세요.</p>` : ''}
      <form class="panel entry-form" id="entry-form" novalidate>
        <label>수업 코드
          <input name="code" required autocomplete="off" autocapitalize="characters" maxlength="6"
            placeholder="예: AB12CD" value="${esc(prefillCode || last.code || '')}" />
        </label>
        <label>학번
          <input name="studentNo" required inputmode="numeric" autocomplete="off" maxlength="20"
            placeholder="예: 10315" value="${esc(last.studentNo || '')}" />
        </label>
        <label><span>이름 <small>(선택)</small></span>
          <input name="studentName" autocomplete="off" maxlength="20" value="${esc(last.studentName || '')}" />
        </label>
        <p class="note">학번과 점수가 선생님께 전달돼요. 이름은 쓰지 않아도 돼요.</p>
        <p class="form-error" id="entry-error" role="alert"></p>
        <button type="submit" class="btn full">입장하기</button>
      </form>

      <button type="button" class="link-btn" id="btn-teacher">교사이신가요? 교사 화면으로</button>
    </main>`;

  app.querySelector('#btn-teacher').addEventListener('click', ctx.goTeacher);
  // QR 코드(입장 주소)로 들어오면 코드가 채워져 있으니 학번 칸부터
  if (prefillCode) app.querySelector('[name="studentNo"]').focus();
  const form = app.querySelector('#entry-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(form);
    const code = String(f.get('code')).trim().toUpperCase();
    const studentNo = String(f.get('studentNo')).trim();
    const studentName = String(f.get('studentName')).trim();
    const err = app.querySelector('#entry-error');
    if (!/^[A-Z0-9]{6}$/.test(code)) return (err.textContent = '수업 코드 6자리를 입력해 주세요.');
    if (!STUDENT_NO_RE.test(studentNo)) return (err.textContent = '학번을 확인해 주세요. (숫자·영문·하이픈, 20자 이내)');
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = '확인하는 중…';
    try {
      const cls = await api.enterClass(code);
      // 지갑(코인·카드 뒷면)을 못 불러와도 게임은 할 수 있게
      const wallet = await api.getWallet(code, studentNo).catch(() => EMPTY_WALLET);
      session = { code, studentNo, studentName, ...cls, wallet };
      remember({ code, studentNo, studentName });
      showSetList(ctx);
    } catch (ex) {
      err.textContent = ex.message;
      btn.disabled = false;
      btn.textContent = '입장하기';
    }
  });
}

// 공개된 세트 목록
function showSetList(ctx) {
  const { app } = ctx;
  const settings = mergeSettings(session.settings);
  ctx.applyTheme(settings.theme);
  app.innerHTML = `
    <main class="page">
      <button type="button" class="back-link" id="btn-exit">← 나가기</button>
      <h1 class="title">${esc(session.className)}</h1>
      <p class="lead">학번 ${esc(session.studentNo)}${session.studentName ? ` · ${esc(session.studentName)}` : ''}</p>
      ${settings.shopOn ? `
        <div class="wallet-bar">
          <span>🪙 <b>${session.wallet.coins}</b> 코인</span>
          <button type="button" class="btn small" id="btn-shop">🛒 카드 뒷면 상점</button>
        </div>` : ''}

      <h2 class="section-title">게임 세트 고르기</h2>
      ${session.sets.length ? `<div class="set-list">
        ${session.sets.map((set, i) => {
          const cats = categoriesOf(set.rows);
          return `<button type="button" class="set-card" data-set="${i}">
            <b>${esc(set.name)}</b>
            <span>카테고리 ${cats.length}개 · 단어 ${set.rows.length}개</span>
          </button>`;
        }).join('')}
      </div>` : '<p class="empty-note">아직 공개된 세트가 없어요. 선생님께 알려 주세요.</p>'}

      ${howToHTML(settings)}
    </main>`;

  app.querySelector('#btn-exit').addEventListener('click', () => { session = null; showStudentEntry(ctx); });
  app.querySelector('#btn-shop')?.addEventListener('click', () => showShop(ctx, session, () => showSetList(ctx)));
  app.querySelectorAll('[data-set]').forEach((b) =>
    b.addEventListener('click', () => play(ctx, session.sets[+b.dataset.set])));
}

function play(ctx, set) {
  const settings = mergeSettings(session.settings);
  // 상점에서 고른 카드 뒷면 (상점을 끈 수업은 기본)
  settings.cardBack = settings.shopOn ? session.wallet.equipped : 'default';
  const s = session;
  ctx.runGame(set, settings, {
    onQuit: () => showSetList(ctx),
    onEnd: (result) => showResult(ctx.app, {
      set, result, settings,
      save: async () => {
        const r = await api.submitAttempt({
          code: s.code, studentNo: s.studentNo, studentName: s.studentName, setId: set.id,
          result: toAttemptPayload(result),
        });
        if (typeof r.coins === 'number') s.wallet = { ...s.wallet, coins: r.coins };
        return { ...r, showCoins: settings.shopOn };
      },
      onAgain: () => play(ctx, set),
      onBack: () => showSetList(ctx),
      backLabel: '세트 고르기',
    }),
  });
}

export function howToHTML(settings) {
  return `
    <details class="howto">
      <summary>게임 방법</summary>
      <ol>
        <li>${settings.shuffleCategories
          ? '<b>카테고리 카드</b>(금색 ★)를 찾아 <b>빈 칸</b>에 놓으면 그 칸이 열려요.'
          : '카테고리 칸이 처음부터 열려 있어요.'}</li>
        <li>단어 카드를 알맞은 카테고리 칸에 놓아요. 틀리면 카드가 튕겨 돌아와요.</li>
        <li>카드는 <b>끌어다 놓거나</b>, <b>카드를 탭한 뒤 칸을 탭</b>해서 옮겨요.</li>
        <li>밑에 깔린 카드가 필요하면 맨 위 카드를 같은 카테고리 카드 위(또는 빈 열)로 옮기거나, 더미를 탭해 넘겨요.</li>
        <li>${settings.timeLimitOn ? `제한 시간은 ${Math.round(settings.timeLimitSec / 60 * 10) / 10}분이에요. ` : ''}모든 단어를 분류하면 끝! 빠르고 정확할수록 점수가 높아요.</li>
      </ol>
    </details>`;
}
