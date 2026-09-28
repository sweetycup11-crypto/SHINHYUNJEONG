// 앱 시작점: 화면 전환 (시작 → 게임 → 결과)
// ①단계: 샘플 세트로 바로 플레이. 기록은 이 기기(브라우저)에만 임시 저장.
//        ③단계에서 공유 데이터 저장소로, ④단계에서 수업 코드 입장으로 바뀝니다.
import './style.css';
import { Chart, LineController, LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Filler } from 'chart.js';
import { SAMPLE_SET } from './sample-set.js';
import { DEFAULT_SETTINGS, THEMES, mergeSettings } from './settings.js';
import { categoriesOf } from './game.js';
import { startGame, esc } from './board.js';

Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Filler);

const app = document.getElementById('app');
const sets = [SAMPLE_SET];
let settings = mergeSettings(loadLocal('cs-test-settings', {}));
applyTheme();

// ---------- 브라우저 임시 저장 (접근이 막혀 있어도 게임은 동작) ----------

function loadLocal(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function saveLocal(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* 저장 불가 환경은 무시 */ }
}

function applyTheme() {
  document.documentElement.dataset.theme = settings.theme;
}

// ---------- 시작 화면 ----------

function showHome() {
  app.innerHTML = `
    <main class="page">
      <h1 class="title">카테고리 솔리테어</h1>
      <p class="lead">단어 카드를 알맞은 카테고리 칸으로 옮겨 모두 분류해 보세요.</p>

      <h2 class="section-title">게임 세트 고르기</h2>
      <div class="set-list">
        ${sets.map((set, i) => {
          const cats = categoriesOf(set.rows);
          return `<button type="button" class="set-card" data-set="${i}">
            <b>${esc(set.name)}</b>
            <span>카테고리 ${cats.length}개 · 단어 ${set.rows.length}개</span>
            <span class="set-cats">${cats.map(esc).join(' · ')}</span>
          </button>`;
        }).join('')}
      </div>

      <details class="howto" open>
        <summary>게임 방법</summary>
        <ol>
          <li>${settings.shuffleCategories
            ? '<b>카테고리 카드</b>(금색)를 찾아 위쪽 <b>빈 칸</b>에 놓으면 그 칸이 열려요.'
            : '위쪽 카테고리 칸이 처음부터 열려 있어요.'}</li>
          <li>단어 카드를 알맞은 카테고리 칸에 놓아요. 틀리면 카드가 튕겨 돌아와요.</li>
          <li>카드는 <b>끌어다 놓거나</b>, <b>카드를 탭한 뒤 칸을 탭</b>해서 옮겨요.</li>
          <li>밑에 깔린 카드가 필요하면 맨 위 카드를 다른 열로 옮기거나, 왼쪽 더미를 탭해 넘겨요.</li>
          <li>모든 단어를 분류하면 끝! 빠르고 정확할수록 점수가 높아요.</li>
        </ol>
      </details>

      <details class="test-settings">
        <summary>테스트용 설정 <small>(④단계에서 교사 설정 화면으로 옮겨져요)</small></summary>
        <form id="settings-form" class="settings-grid">
          <label>카드 열 개수
            <select name="columns">${[3, 4, 5, 6, 7].map((n) => `<option ${n === settings.columns ? 'selected' : ''}>${n}</option>`).join('')}</select>
          </label>
          <label>색상 테마
            <select name="theme">${Object.entries(THEMES).map(([k, v]) => `<option value="${k}" ${k === settings.theme ? 'selected' : ''}>${v}</option>`).join('')}</select>
          </label>
          <label class="check"><input type="checkbox" name="shuffleCategories" ${settings.shuffleCategories ? 'checked' : ''}/> 카테고리 카드 섞기 (어려움)</label>
          <label class="check"><input type="checkbox" name="timeLimitOn" ${settings.timeLimitOn ? 'checked' : ''}/> 시간 제한</label>
          <label>제한 시간(초)
            <input type="number" name="timeLimitSec" min="30" max="1800" step="10" value="${settings.timeLimitSec}"/>
          </label>
          <button type="button" id="btn-reset-settings" class="btn ghost">기본값으로</button>
        </form>
      </details>
    </main>`;

  app.querySelectorAll('[data-set]').forEach((btn) =>
    btn.addEventListener('click', () => play(sets[+btn.dataset.set])));

  const form = app.querySelector('#settings-form');
  form.addEventListener('change', () => {
    const f = new FormData(form);
    settings = mergeSettings({
      ...settings,
      columns: +f.get('columns'),
      theme: f.get('theme'),
      shuffleCategories: f.has('shuffleCategories'),
      timeLimitOn: f.has('timeLimitOn'),
      timeLimitSec: Math.min(1800, Math.max(30, +f.get('timeLimitSec') || DEFAULT_SETTINGS.timeLimitSec)),
    });
    saveLocal('cs-test-settings', settings);
    applyTheme();
    showHome();
    app.querySelector('.test-settings').open = true;
  });
  app.querySelector('#btn-reset-settings').addEventListener('click', () => {
    settings = mergeSettings();
    saveLocal('cs-test-settings', settings);
    applyTheme();
    showHome();
  });
}

// ---------- 게임 ----------

function play(set) {
  window.scrollTo(0, 0);
  startGame(app, set, settings, {
    onEnd: (result) => showResult(set, result),
    onQuit: showHome,
  });
}

// ---------- 결과 화면 ----------

function showResult(set, result) {
  const key = 'cs-history:' + set.name;
  const history = loadLocal(key, []);
  history.push({ score: result.score.total, at: Date.now() });
  saveLocal(key, history);
  const best = Math.max(...history.map((h) => h.score));
  const isBest = result.score.total === best && history.length > 1;

  // 틀린 단어: 같은 단어는 한 번만, 어디에 넣었는지 모아서 보여준다
  const wrongMap = new Map();
  for (const w of result.wrongLog) {
    if (!wrongMap.has(w.word)) wrongMap.set(w.word, { ...w, placedList: [] });
    const item = wrongMap.get(w.word);
    if (!item.placedList.includes(w.placed)) item.placedList.push(w.placed);
  }
  const { stats, score } = result;
  const sc = settings.score;

  app.innerHTML = `
    <main class="page result">
      <h1 class="title">${result.finished ? '분류 완료!' : '시간 종료'}</h1>
      <p class="lead">${esc(set.name)}</p>

      <section class="score-hero">
        <div><span>이번 점수</span><b>${score.total}</b>${isBest ? '<em>최고 기록!</em>' : ''}</div>
        <div><span>최고 점수</span><b>${best}</b></div>
      </section>

      <table class="breakdown">
        <tr><td>단어 정답 ${stats.correct}개 × ${sc.correct}</td><td>+${stats.correct * sc.correct}</td></tr>
        ${stats.categoryOpened ? `<tr><td>카테고리 칸 열기 ${stats.categoryOpened}개 × ${sc.category}</td><td>+${stats.categoryOpened * sc.category}</td></tr>` : ''}
        <tr><td>오답 ${stats.wrong}번 × ${sc.wrong}</td><td>−${stats.wrong * sc.wrong}</td></tr>
        <tr><td>시간 보너스 (기준 ${score.refSec}초, 걸린 시간 ${stats.elapsedSec}초)</td><td>+${score.timeBonus}</td></tr>
        <tr><td>추가 이동 ${score.extraMoves}번 (전체 ${stats.moves}번, 최소 ${stats.minMoves}번)</td><td>−${score.movePenalty}</td></tr>
        <tr class="total"><td>합계</td><td>${score.total}</td></tr>
      </table>

      <h2 class="section-title">틀린 단어 ${wrongMap.size ? `(${wrongMap.size}개)` : ''}</h2>
      ${wrongMap.size ? `<ul class="wrong-list">${[...wrongMap.values()].map((w) => `
        <li>
          <div class="wrong-head"><b>${esc(w.word)}</b> → 정답 <span class="tag ok">${esc(w.answer)}</span></div>
          <div class="wrong-sub">내가 놓은 칸: ${w.placedList.map((p) => `<span class="tag bad">${esc(p)}</span>`).join(' ')}</div>
          ${result.explanations[w.word]?.explanation ? `<p class="wrong-exp">${esc(result.explanations[w.word].explanation)}</p>` : ''}
        </li>`).join('')}</ul>` : '<p class="empty-note">한 번도 틀리지 않았어요! 👏</p>'}

      ${result.unplaced.length ? `
        <h2 class="section-title">분류하지 못한 단어 (${result.unplaced.length}개)</h2>
        <ul class="wrong-list">${result.unplaced.map((c) => `
          <li><div class="wrong-head"><b>${esc(c.text)}</b> → 정답 <span class="tag ok">${esc(c.category)}</span></div>
          ${c.explanation ? `<p class="wrong-exp">${esc(c.explanation)}</p>` : ''}</li>`).join('')}</ul>` : ''}

      <h2 class="section-title">내 점수 변화</h2>
      <div class="chart-box"><canvas id="history-chart" aria-label="시도 순서별 점수 그래프"></canvas></div>
      <p class="note">①단계에서는 기록이 이 기기에만 저장돼요.</p>

      <div class="actions">
        <button type="button" class="btn" id="btn-again">다시 하기</button>
        <button type="button" class="btn ghost" id="btn-home">세트 고르기</button>
      </div>
    </main>`;

  drawHistory(app.querySelector('#history-chart'), history);
  app.querySelector('#btn-again').addEventListener('click', () => play(set));
  app.querySelector('#btn-home').addEventListener('click', showHome);
  window.scrollTo(0, 0);
}

// 시도 순서대로 점수 꺾은선 그래프
function drawHistory(canvas, history) {
  const css = getComputedStyle(document.documentElement);
  const accent = css.getPropertyValue('--accent').trim();
  const ink = css.getPropertyValue('--ink-dim').trim();
  const grid = css.getPropertyValue('--line').trim();
  new Chart(canvas, {
    type: 'line',
    data: {
      labels: history.map((_, i) => `${i + 1}회`),
      datasets: [{
        data: history.map((h) => h.score),
        borderColor: accent,
        backgroundColor: accent + '22',
        pointBackgroundColor: history.map((_, i) => (i === history.length - 1 ? accent : '#fff')),
        pointBorderColor: accent,
        pointRadius: 4,
        fill: true,
        tension: 0.25,
      }],
    },
    options: {
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (c) => `${c.parsed.y}점` } },
      },
      scales: {
        x: { ticks: { color: ink }, grid: { display: false } },
        y: { beginAtZero: true, ticks: { color: ink, precision: 0 }, grid: { color: grid } },
      },
    },
  });
}

showHome();
