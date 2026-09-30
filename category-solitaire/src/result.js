// 게임 결과 화면 (학생·교사 공용)
import { Chart, LineController, LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Filler } from 'chart.js';
import { esc } from './board.js';

Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Filler);

// 서버에 보낼 결과 값 (supabase/schema.sql 의 submit_attempt 와 같은 이름)
export function toAttemptPayload(result) {
  return {
    score: result.score.total,
    elapsed_sec: result.stats.elapsedSec,
    moves: result.stats.moves,
    correct: result.stats.correct,
    wrong: result.stats.wrong,
    finished: result.finished,
    wrong_list: result.wrongLog.map((w) => ({ word: w.word, placed: w.placed, answer: w.answer })),
  };
}

// app에 결과 화면을 그린다.
// save: 기록을 저장하고 { best, history } 를 돌려주는 함수 (없으면 저장하지 않는 연습 플레이)
export function showResult(app, { set, result, settings, save, onAgain, onBack, backLabel }) {
  const { stats, score } = result;
  const sc = settings.score;

  // 틀린 단어: 같은 단어는 한 번만, 어디에 넣었는지 모아서 보여준다
  const wrongMap = new Map();
  for (const w of result.wrongLog) {
    if (!wrongMap.has(w.word)) wrongMap.set(w.word, { ...w, placedList: [] });
    const item = wrongMap.get(w.word);
    if (!item.placedList.includes(w.placed)) item.placedList.push(w.placed);
  }

  app.innerHTML = `
    <main class="page result">
      <h1 class="title">${result.finished ? '분류 완료!' : '시간 종료'}</h1>
      <p class="lead">${esc(set.name)}</p>

      <section class="score-hero">
        <div><span>이번 점수</span><b>${score.total}</b><em id="best-badge"></em></div>
        <div><span>최고 점수</span><b id="best-score">${save ? '…' : '-'}</b></div>
      </section>
      <p class="coin-status" id="coin-status" aria-live="polite"></p>
      <p class="save-status" id="save-status" role="status">${save ? '기록을 저장하는 중…' : '연습 플레이라서 기록은 저장되지 않아요.'}</p>

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

      ${save ? `
        <h2 class="section-title">내 점수 변화</h2>
        <div class="chart-box"><canvas id="history-chart" aria-label="시도 순서별 점수 꺾은선 그래프"></canvas></div>
        <p class="note" id="history-note"></p>` : ''}

      <div class="actions">
        <button type="button" class="btn" id="btn-again">다시 하기</button>
        <button type="button" class="btn ghost" id="btn-back">${esc(backLabel)}</button>
      </div>
    </main>`;

  app.querySelector('#btn-again').addEventListener('click', onAgain);
  app.querySelector('#btn-back').addEventListener('click', onBack);
  window.scrollTo(0, 0);

  if (save) runSave();

  // 저장 → 최고 점수와 그래프 표시. 실패하면 다시 시도 버튼
  async function runSave() {
    const status = app.querySelector('#save-status');
    status.className = 'save-status';
    status.textContent = '기록을 저장하는 중…';
    try {
      const { best, history, coins_earned: earned, coins, showCoins } = await save();
      app.querySelector('#best-score').textContent = best;
      if (showCoins && typeof earned === 'number') {
        app.querySelector('#coin-status').textContent = `🪙 +${earned} 코인 (모은 코인 ${coins})`;
      }
      if (score.total === best && history.length > 1) app.querySelector('#best-badge').textContent = '최고 기록!';
      status.textContent = '기록을 저장했어요.';
      status.classList.add('ok');
      drawHistory(app.querySelector('#history-chart'), history);
      app.querySelector('#history-note').textContent = `이 세트를 ${history.length}번 했어요${history.length >= 50 ? ' (최근 50번까지 표시)' : ''}.`;
    } catch (e) {
      status.innerHTML = `${esc(e.message)} <button type="button" class="btn small" id="btn-retry">다시 저장</button>`;
      status.classList.add('bad');
      status.querySelector('#btn-retry').addEventListener('click', runSave);
    }
  }
}

// 시도 순서대로 점수 꺾은선 그래프 (한 계열이라 범례 없음, 마우스를 올리면 점수 표시)
function drawHistory(canvas, history) {
  if (!canvas) return;
  const css = getComputedStyle(document.documentElement);
  const accent = css.getPropertyValue('--accent').trim();
  const ink = css.getPropertyValue('--ink-dim').trim();
  const grid = css.getPropertyValue('--line').trim();
  const surface = css.getPropertyValue('--panel').trim();
  Chart.getChart(canvas)?.destroy();
  new Chart(canvas, {
    type: 'line',
    data: {
      labels: history.map((_, i) => `${i + 1}회`),
      datasets: [{
        data: history.map((h) => h.score),
        borderColor: accent,
        borderWidth: 2,
        backgroundColor: accent + '1f',
        pointBackgroundColor: history.map((_, i) => (i === history.length - 1 ? accent : surface)),
        pointBorderColor: accent,
        pointBorderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 6,
        pointHitRadius: 14,
        fill: true,
        tension: 0.25,
      }],
    },
    options: {
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (c) => `${c.parsed.y}점` } },
      },
      scales: {
        x: { ticks: { color: ink }, grid: { display: false }, border: { color: grid } },
        y: { beginAtZero: true, ticks: { color: ink, precision: 0 }, grid: { color: grid }, border: { display: false } },
      },
    },
  });
}
