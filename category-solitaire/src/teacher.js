// 교사 화면: 로그인·가입 → 수업 목록(수업 코드) → 수업별 결과·공개 세트·설정 / 게임 세트 관리
import { api } from './api.js';
import { DEFAULT_SETTINGS, THEMES, mergeSettings } from './settings.js';
import { esc } from './board.js';
import { showSetManager } from './teacher-sets.js';
import { showDashboard } from './dashboard.js';
import { showResult } from './result.js';
import QRCode from 'qrcode';

// ctx: { app, runGame, applyTheme, goStudent() }
// path: 주소의 #/teacher 뒤 부분을 나눈 배열 (예: ['class', '<id>', 'results'])
export async function showTeacher(ctx, path) {
  const { app } = ctx;
  ctx.applyTheme('blue');

  if (path[0] === 'new-password') return showNewPassword(ctx);

  const teacher = await api.getTeacher();
  if (!teacher) return showLogin(ctx);

  const tab = path[0] === 'sets' ? 'sets' : 'classes';
  app.innerHTML = `
    <main class="page teacher">
      <header class="t-header">
        <div><b>교사 화면</b><span class="t-email">${esc(teacher.email)}</span></div>
        ${api.mode === 'demo' ? '' : '<button type="button" class="btn small ghost" id="btn-logout">로그아웃</button>'}
      </header>
      ${api.mode === 'demo' ? '<p class="demo-banner">체험 모드: 로그인 없이 이 브라우저에만 저장돼요. 실제 운영은 README의 “운영자용” 안내대로 데이터 저장소를 연결하세요.</p>' : ''}
      <nav class="tabs" aria-label="교사 메뉴">
        <a href="#/teacher" class="${tab === 'classes' ? 'active' : ''}">수업</a>
        <a href="#/teacher/sets" class="${tab === 'sets' ? 'active' : ''}">게임 세트</a>
      </nav>
      <div id="t-body"></div>
      <button type="button" class="link-btn" id="btn-student">학생 화면으로</button>
    </main>`;

  app.querySelector('#btn-logout')?.addEventListener('click', async () => {
    await api.signOut();
    location.hash = '#/teacher';
    showLogin(ctx);
  });
  app.querySelector('#btn-student').addEventListener('click', ctx.goStudent);
  const body = app.querySelector('#t-body');

  if (tab === 'sets') {
    return showSetManager(body, { onPlay: (set) => practice(ctx, set, mergeSettings(), '#/teacher/sets') });
  }
  if (path[0] === 'class' && path[1]) return showClass(ctx, body, path[1], path[2] || 'results');
  return showClassList(ctx, body);
}

// 저장하지 않는 연습 플레이 (교사가 세트·설정을 미리 확인)
function practice(ctx, set, settings, backHash) {
  const back = () => { location.hash = backHash; ctx.route(); };
  ctx.runGame(set, settings, {
    onQuit: back,
    onEnd: (result) => showResult(ctx.app, {
      set, result, settings, save: null,
      onAgain: () => practice(ctx, set, settings, backHash),
      onBack: back,
      backLabel: '교사 화면으로',
    }),
  });
}

// ---------- 로그인 / 가입 / 비밀번호 ----------

function showLogin(ctx, mode = 'login', notice = '') {
  const { app } = ctx;
  const titles = { login: '교사 로그인', signup: '교사 가입', reset: '비밀번호 찾기' };
  app.innerHTML = `
    <main class="page narrow">
      <h1 class="title">${titles[mode]}</h1>
      <p class="lead">교사 계정마다 게임 세트·수업·결과가 따로 저장돼요.</p>
      ${notice ? `<p class="notice">${notice}</p>` : ''}
      <form class="panel entry-form" id="auth-form" novalidate>
        <label>이메일 <input type="email" name="email" required autocomplete="email" /></label>
        ${mode !== 'reset' ? `<label>비밀번호 <input type="password" name="password" required minlength="6"
          autocomplete="${mode === 'signup' ? 'new-password' : 'current-password'}" /></label>` : ''}
        ${mode === 'signup' ? '<label>비밀번호 확인 <input type="password" name="password2" required minlength="6" autocomplete="new-password" /></label>' : ''}
        <p class="form-error" id="auth-error" role="alert"></p>
        <button type="submit" class="btn full">${{ login: '로그인', signup: '가입하기', reset: '재설정 메일 보내기' }[mode]}</button>
      </form>
      <div class="auth-links">
        ${mode !== 'login' ? '<button type="button" class="link-btn" data-mode="login">로그인</button>' : ''}
        ${mode !== 'signup' ? '<button type="button" class="link-btn" data-mode="signup">처음이신가요? 가입하기</button>' : ''}
        ${mode !== 'reset' ? '<button type="button" class="link-btn" data-mode="reset">비밀번호를 잊으셨나요?</button>' : ''}
        <button type="button" class="link-btn" id="btn-student">학생 화면으로</button>
      </div>
    </main>`;

  app.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => showLogin(ctx, b.dataset.mode)));
  app.querySelector('#btn-student').addEventListener('click', ctx.goStudent);
  const form = app.querySelector('#auth-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(form);
    const email = String(f.get('email') || '').trim();
    const password = String(f.get('password') || '');
    const err = app.querySelector('#auth-error');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return (err.textContent = '이메일을 확인해 주세요.');
    if (mode !== 'reset' && password.length < 6) return (err.textContent = '비밀번호는 6자 이상이어야 해요.');
    if (mode === 'signup' && password !== f.get('password2')) return (err.textContent = '비밀번호 확인이 달라요.');
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    try {
      if (mode === 'login') {
        await api.signIn(email, password);
        ctx.route();
      } else if (mode === 'signup') {
        const { needsConfirm } = await api.signUp(email, password);
        if (needsConfirm) showLogin(ctx, 'login', `<b>${esc(email)}</b>로 인증 메일을 보냈어요. 메일의 링크를 누른 뒤 로그인해 주세요.`);
        else ctx.route();
      } else {
        await api.sendPasswordReset(email);
        showLogin(ctx, 'login', '비밀번호 재설정 메일을 보냈어요. 메일의 링크를 눌러 새 비밀번호를 정해 주세요.');
      }
    } catch (ex) {
      err.textContent = ex.message;
      btn.disabled = false;
    }
  });
}

// 비밀번호 재설정 메일의 링크로 들어왔을 때
function showNewPassword(ctx) {
  const { app } = ctx;
  app.innerHTML = `
    <main class="page narrow">
      <h1 class="title">새 비밀번호 정하기</h1>
      <form class="panel entry-form" id="pw-form" novalidate>
        <label>새 비밀번호 <input type="password" name="password" required minlength="6" autocomplete="new-password" /></label>
        <p class="form-error" id="pw-error" role="alert"></p>
        <button type="submit" class="btn full">저장</button>
      </form>
    </main>`;
  const form = app.querySelector('#pw-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const pw = String(new FormData(form).get('password'));
    const err = app.querySelector('#pw-error');
    if (pw.length < 6) return (err.textContent = '비밀번호는 6자 이상이어야 해요.');
    try {
      await api.updatePassword(pw);
      location.hash = '#/teacher';
      ctx.route();
    } catch (ex) {
      err.textContent = ex.message;
    }
  });
}

// ---------- 수업 목록 ----------

async function showClassList(ctx, body) {
  body.innerHTML = '<p class="note">불러오는 중…</p>';
  let classes;
  try {
    classes = await api.listClasses();
  } catch (e) {
    body.innerHTML = `<p class="form-error">${esc(e.message)}</p>`;
    return;
  }
  body.innerHTML = `
    <p class="lead">수업(반)마다 수업 코드가 만들어져요. 학생은 수업 코드와 학번으로 입장해요.</p>
    <form class="panel inline-form" id="new-class">
      <label class="grow">새 수업 이름
        <input name="name" required maxlength="40" placeholder="예: 2학년 3반 화학" />
      </label>
      <button type="submit" class="btn">수업 만들기</button>
    </form>
    <p class="form-error" id="class-error" role="alert"></p>
    ${classes.length ? `<ul class="class-list">
      ${classes.map((c) => `
        <li>
          <a class="class-card" href="#/teacher/class/${c.id}/results">
            <span class="class-name">${esc(c.name)}</span>
            <span class="class-code" aria-label="수업 코드">${esc(c.code)}</span>
            <span class="class-meta">공개 세트 ${c.setIds.length}개${c.setIds.length ? '' : ' · <span class="text-warn">세트를 공개해 주세요</span>'}</span>
          </a>
        </li>`).join('')}
    </ul>` : '<p class="empty-note">아직 수업이 없어요. 위에서 첫 수업을 만들어 보세요.</p>'}`;

  body.querySelector('#new-class').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = String(new FormData(e.target).get('name')).trim();
    if (!name) return;
    try {
      const c = await api.createClass(name);
      location.hash = `#/teacher/class/${c.id}/sets`;
    } catch (ex) {
      body.querySelector('#class-error').textContent = ex.message;
    }
  });
}

// ---------- 수업 상세: 결과 / 공개 세트 / 설정 ----------

async function showClass(ctx, body, classId, tab) {
  body.innerHTML = '<p class="note">불러오는 중…</p>';
  let cls, sets;
  try {
    const [classes, allSets] = await Promise.all([api.listClasses(), api.listSets()]);
    cls = classes.find((c) => c.id === classId);
    sets = allSets;
  } catch (e) {
    body.innerHTML = `<p class="form-error">${esc(e.message)}</p>`;
    return;
  }
  if (!cls) {
    body.innerHTML = '<p class="form-error">수업을 찾을 수 없어요.</p><a href="#/teacher">← 수업 목록</a>';
    return;
  }

  const joinUrl = `${location.origin}${location.pathname}#/join/${cls.code}`;
  body.innerHTML = `
    <a class="back-link" href="#/teacher">← 수업 목록</a>
    <section class="class-head">
      <h1 class="title">${esc(cls.name)}</h1>
      <div class="join-box">
        <button type="button" class="qr-thumb" id="btn-qr" aria-label="입장 QR 코드 크게 보기">
          <img id="qr-small" alt="수업 ${esc(cls.code)} 입장 QR 코드" width="112" height="112" />
        </button>
        <div class="join-info">
          <span class="class-code big">${esc(cls.code)}</span>
          <div class="btn-row">
            <button type="button" class="btn small" id="btn-qr-big">QR 크게 보기</button>
            <button type="button" class="btn small ghost" id="btn-copy">입장 주소 복사</button>
          </div>
        </div>
      </div>
      <p class="note">학생이 휴대폰 카메라로 QR 코드를 찍으면 수업 코드가 채워진 채로 열려요. 학생은 학번만 입력하면 돼요.</p>
    </section>
    <nav class="tabs sub" aria-label="수업 메뉴">
      ${[['results', '결과'], ['sets', '공개 세트'], ['settings', '설정']].map(([k, v]) =>
        `<a href="#/teacher/class/${cls.id}/${k}" class="${tab === k ? 'active' : ''}">${v}</a>`).join('')}
    </nav>
    <div id="class-body"></div>`;

  // 입장 주소를 QR 코드 그림으로 (검은색·흰 바탕이 가장 잘 찍혀요)
  const qrOptions = { errorCorrectionLevel: 'M', margin: 2, color: { dark: '#000000', light: '#ffffff' } };
  QRCode.toDataURL(joinUrl, { ...qrOptions, width: 224 }).then((url) => { body.querySelector('#qr-small').src = url; });
  const openBig = () => showQrOverlay(cls, joinUrl, qrOptions);
  body.querySelector('#btn-qr').addEventListener('click', openBig);
  body.querySelector('#btn-qr-big').addEventListener('click', openBig);

  body.querySelector('#btn-copy').addEventListener('click', async (e) => {
    try {
      await navigator.clipboard.writeText(joinUrl);
      e.target.textContent = '복사했어요!';
    } catch {
      prompt('아래 주소를 복사하세요.', joinUrl);
    }
  });

  const el = body.querySelector('#class-body');
  if (tab === 'sets') return showPublishedSets(el, cls, sets);
  if (tab === 'settings') return showSettings(ctx, el, cls, sets);
  return showDashboard(el, { cls, sets });
}

// 공개 세트 고르기
function showPublishedSets(el, cls, sets) {
  if (!sets.length) {
    el.innerHTML = '<p class="empty-note">먼저 <a href="#/teacher/sets">게임 세트</a> 탭에서 세트를 만들어 주세요.</p>';
    return;
  }
  el.innerHTML = `
    <form class="panel" id="publish-form">
      <p class="lead">학생에게 보여 줄 세트를 고르세요.</p>
      <ul class="check-list">
        ${sets.map((s) => `
          <li><label class="check">
            <input type="checkbox" name="set" value="${s.id}" ${cls.setIds.includes(s.id) ? 'checked' : ''} />
            <span><b>${esc(s.name)}</b><small>카테고리 ${new Set(s.rows.map((r) => r.category)).size}개 · 단어 ${s.rows.length}개</small></span>
          </label></li>`).join('')}
      </ul>
      <p class="save-status" id="publish-status" role="status"></p>
      <button type="submit" class="btn full">저장</button>
    </form>`;
  el.querySelector('#publish-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const ids = new FormData(e.target).getAll('set');
    const status = el.querySelector('#publish-status');
    try {
      await api.setClassSets(cls.id, ids);
      cls.setIds = ids;
      status.className = 'save-status ok';
      status.textContent = `저장했어요. 학생에게 ${ids.length}개 세트가 보여요.`;
    } catch (ex) {
      status.className = 'save-status bad';
      status.textContent = ex.message;
    }
  });
}

// 수업별 설정 (점수 공식·시간 제한·열 개수·테마) + 수업 이름 변경·삭제
function showSettings(ctx, el, cls, sets) {
  const s = mergeSettings(cls.settings);
  const d = DEFAULT_SETTINGS.score;
  const num = (name, value, min, max, step, label, help) => `
    <label>${label}
      <input type="number" name="${name}" value="${value}" min="${min}" max="${max}" step="${step}" required />
      <small>${help} (기본 ${d[name] ?? DEFAULT_SETTINGS[name]})</small>
    </label>`;
  el.innerHTML = `
    <form class="panel settings-form" id="settings-form" novalidate>
      <h2 class="panel-title">수업 이름</h2>
      <label class="grow"><input name="className" value="${esc(cls.name)}" maxlength="40" required /></label>

      <h2 class="panel-title">게임 화면</h2>
      <div class="settings-grid">
        <label>카드 열 개수
          <select name="columns">${[3, 4, 5, 6, 7].map((n) => `<option ${n === s.columns ? 'selected' : ''}>${n}</option>`).join('')}</select>
          <small>화면이 좁은 폰에서는 자동으로 줄어요</small>
        </label>
        <label>색상 테마
          <select name="theme">${Object.entries(THEMES).map(([k, v]) => `<option value="${k}" ${k === s.theme ? 'selected' : ''}>${v}</option>`).join('')}</select>
        </label>
        <label class="check"><input type="checkbox" name="shuffleCategories" ${s.shuffleCategories ? 'checked' : ''}/> 카테고리 카드 섞기 (끄면 칸이 처음부터 열려 쉬워요)</label>
        <label class="check"><input type="checkbox" name="timeLimitOn" ${s.timeLimitOn ? 'checked' : ''}/> 시간 제한 사용</label>
        ${num('timeLimitSec', s.timeLimitSec, 30, 1800, 10, '제한 시간(초)', '30~1800초')}
      </div>

      <h2 class="panel-title">점수 공식</h2>
      <p class="formula" id="formula"></p>
      <div class="settings-grid">
        ${num('correct', s.score.correct, 0, 100, 1, '정답 가점', '단어 카드 1장')}
        ${num('wrong', s.score.wrong, 0, 100, 1, '오답 감점', '틀릴 때마다')}
        ${num('category', s.score.category, 0, 100, 1, '칸 열기 가점', '카테고리 카드 1장')}
        ${num('secPerCard', s.score.secPerCard, 1, 60, 1, '기준 시간(초/카드)', '기준 시간 = 카드 수 × 이 값')}
        ${num('timeBonusPerSec', s.score.timeBonusPerSec, 0, 5, 0.1, '시간 보너스(점/초)', '기준보다 1초 빠를 때마다')}
        ${num('extraMovePenalty', s.score.extraMovePenalty, 0, 10, 0.5, '추가 이동 감점', '최소보다 1번 더 옮길 때마다')}
        ${num('extraMoveCap', s.score.extraMoveCap, 0, 500, 1, '추가 이동 감점 최대', '이 이상은 깎지 않음')}
      </div>
      <p class="form-error" id="settings-error" role="alert"></p>
      <p class="save-status" id="settings-status" role="status"></p>
      <div class="btn-row">
        <button type="submit" class="btn">설정 저장</button>
        <button type="button" class="btn ghost" id="btn-defaults">기본값으로</button>
        <button type="button" class="btn ghost" id="btn-try">이 설정으로 해 보기</button>
      </div>
    </form>

    <section class="panel danger-zone">
      <h2 class="panel-title">수업 삭제</h2>
      <p class="note">수업과 이 수업의 학생 기록이 모두 지워져요. 게임 세트는 남아요.</p>
      <button type="button" class="btn danger" id="btn-delete-class">수업 삭제</button>
    </section>`;

  const form = el.querySelector('#settings-form');
  const read = () => {
    const f = new FormData(form);
    const n = (k) => Number(f.get(k));
    return {
      columns: n('columns'),
      theme: f.get('theme'),
      shuffleCategories: f.has('shuffleCategories'),
      timeLimitOn: f.has('timeLimitOn'),
      timeLimitSec: n('timeLimitSec'),
      score: {
        correct: n('correct'), wrong: n('wrong'), category: n('category'),
        secPerCard: n('secPerCard'), timeBonusPerSec: n('timeBonusPerSec'),
        extraMovePenalty: n('extraMovePenalty'), extraMoveCap: n('extraMoveCap'),
      },
    };
  };
  const showFormula = () => {
    const v = read().score;
    el.querySelector('#formula').innerHTML =
      `점수 = 정답 × <b>${v.correct}</b> + 칸 열기 × <b>${v.category}</b> − 오답 × <b>${v.wrong}</b>
       + (카드 수 × <b>${v.secPerCard}</b>초 − 걸린 시간) × <b>${v.timeBonusPerSec}</b>
       − 추가 이동 × <b>${v.extraMovePenalty}</b> (최대 <b>${v.extraMoveCap}</b>), 0점 미만은 0점`;
  };
  form.addEventListener('input', showFormula);
  showFormula();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = el.querySelector('#settings-error');
    const status = el.querySelector('#settings-status');
    err.textContent = '';
    status.textContent = '';
    const bad = [...form.querySelectorAll('input[type="number"]')].find((i) => !i.checkValidity() || i.value === '');
    if (bad) {
      bad.focus();
      return (err.textContent = `‘${bad.closest('label').firstChild.textContent.trim()}’ 값을 확인해 주세요.`);
    }
    const name = String(new FormData(form).get('className')).trim();
    if (!name) return (err.textContent = '수업 이름을 입력해 주세요.');
    try {
      const settings = read();
      await api.updateClass(cls.id, { name, settings });
      cls.name = name;
      cls.settings = settings;
      status.className = 'save-status ok';
      status.textContent = '저장했어요. 학생이 다음에 입장할 때부터 적용돼요.';
    } catch (ex) {
      err.textContent = ex.message;
    }
  });
  el.querySelector('#btn-defaults').addEventListener('click', () => {
    cls = { ...cls, settings: {} };
    showSettings(ctx, el, { ...cls, name: String(new FormData(form).get('className')) }, sets);
    el.querySelector('#settings-status').textContent = '기본값을 불러왔어요. [설정 저장]을 눌러야 적용돼요.';
  });
  el.querySelector('#btn-try').addEventListener('click', () => {
    const set = sets.find((x) => cls.setIds.includes(x.id)) || sets[0];
    if (!set) return alert('먼저 게임 세트를 만들어 주세요.');
    practice(ctx, set, mergeSettings(read()), `#/teacher/class/${cls.id}/settings`);
  });
  el.querySelector('#btn-delete-class').addEventListener('click', async () => {
    const typed = prompt(`정말 삭제하려면 수업 코드 ${cls.code} 를 입력하세요.`);
    if (typed === null) return;
    if (typed.trim().toUpperCase() !== cls.code) return alert('수업 코드가 달라요. 삭제하지 않았어요.');
    try {
      await api.deleteClass(cls.id);
      location.hash = '#/teacher';
    } catch (ex) {
      alert(ex.message);
    }
  });
}

// 교실 화면(TV·프로젝터)에 띄우는 큰 QR 코드
async function showQrOverlay(cls, joinUrl, qrOptions) {
  const url = await QRCode.toDataURL(joinUrl, { ...qrOptions, width: 1024 });
  const overlay = document.createElement('div');
  overlay.className = 'qr-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-label', '입장 QR 코드');
  overlay.innerHTML = `
    <div class="qr-sheet">
      <p class="qr-class">${esc(cls.name)}</p>
      <img src="${url}" alt="수업 ${esc(cls.code)} 입장 QR 코드" />
      <p class="qr-help">휴대폰 카메라로 찍고 <b>학번</b>을 입력하세요</p>
      <p class="qr-code">수업 코드 <b>${esc(cls.code)}</b></p>
      <div class="btn-row">
        <a class="btn ghost" href="${url}" download="${esc(cls.name)}_입장QR.png">그림으로 저장</a>
        <button type="button" class="btn" id="qr-close">닫기</button>
      </div>
    </div>`;
  const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  overlay.querySelector('#qr-close').addEventListener('click', close);
  document.addEventListener('keydown', onKey);
  document.body.appendChild(overlay);
  overlay.querySelector('#qr-close').focus();
}
