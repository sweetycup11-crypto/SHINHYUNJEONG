// 결과 대시보드: 요약 / 문항(단어)별 오답률 순위 / 혼동 쌍 / 학생별 기록 / CSV / 삭제
import { api } from './api.js';
import { esc } from './board.js';
import { saveBlob } from './excel.js';
import { EMPTY_SLOT_LABEL } from './game.js';

const TOP_N = 15; // 순위 표에 처음 보여 줄 줄 수

export async function showDashboard(el, { cls, sets }) {
  let attempts = [];
  let filter = ''; // 세트 이름 ('' = 전체)
  let showAllWords = false;

  async function load() {
    el.innerHTML = '<p class="note">결과를 불러오는 중…</p>';
    try {
      attempts = await api.listAttempts(cls.id);
    } catch (e) {
      el.innerHTML = `<p class="form-error">${esc(e.message)}</p>`;
      return;
    }
    render();
  }

  function render() {
    const setNames = [...new Set(attempts.map((a) => a.set_name))].sort((a, b) => a.localeCompare(b, 'ko'));
    if (filter && !setNames.includes(filter)) filter = '';
    const rows = filter ? attempts.filter((a) => a.set_name === filter) : attempts;

    if (!attempts.length) {
      el.innerHTML = `<p class="empty-note">아직 학생 기록이 없어요. 학생이 수업 코드 <b>${esc(cls.code)}</b>로 입장해 게임을 끝내면 여기에 나타나요.</p>
        <button type="button" class="btn ghost small" id="btn-refresh">새로고침</button>`;
      el.querySelector('#btn-refresh').addEventListener('click', load);
      return;
    }

    // 세트가 여러 개인데 '전체'를 볼 때만 단어 아래에 세트 이름을 표시
    const multi = !filter && setNames.length > 1;
    const words = wordStats(rows, sets, !filter);
    const wrongWords = words.filter((w) => w.wrongAttempts > 0);
    const pairs = confusionPairs(rows, !filter);
    const students = studentStats(rows);
    const students1 = new Set(rows.map((a) => a.student_no)).size;
    const avg = rows.length ? Math.round(rows.reduce((s, a) => s + a.score, 0) / rows.length) : 0;
    const accuracy = rows.length
      ? Math.round(100 * rows.reduce((s, a) => s + a.correct, 0) / Math.max(1, rows.reduce((s, a) => s + a.correct + a.wrong, 0)))
      : 0;
    const shownWords = showAllWords ? wrongWords : wrongWords.slice(0, TOP_N);

    el.innerHTML = `
      <div class="filter-row">
        <label>세트
          <select id="set-filter">
            <option value="">전체 세트</option>
            ${setNames.map((n) => `<option ${n === filter ? 'selected' : ''}>${esc(n)}</option>`).join('')}
          </select>
        </label>
        <button type="button" class="btn small ghost" id="btn-refresh">새로고침</button>
        <button type="button" class="btn small" id="btn-csv">CSV 다운로드</button>
      </div>

      <section class="kpi-row" aria-label="요약">
        <div class="kpi"><span>참여 학생</span><b>${students1}<small>명</small></b></div>
        <div class="kpi"><span>전체 시도</span><b>${rows.length}<small>회</small></b></div>
        <div class="kpi"><span>평균 점수</span><b>${avg}<small>점</small></b></div>
        <div class="kpi"><span>배치 정확도</span><b>${accuracy}<small>%</small></b></div>
      </section>
      <p class="note">배치 정확도 = 정답 배치 ÷ (정답 + 오답 배치). 학생이 틀렸다가 고쳐 넣은 것도 오답 1번으로 세요.</p>

      <section class="panel">
        <h2 class="panel-title">문항(단어)별 오답률 순위</h2>
        <p class="note">오답률 = 그 단어를 한 번 이상 틀린 시도 ÷ 그 세트의 전체 시도</p>
        ${wrongWords.length ? `
          <div class="table-scroll"><table class="data-table rank-table">
            <thead><tr><th class="num">순위</th><th>단어</th><th>정답 카테고리</th><th>오답률</th><th class="num">틀린 횟수</th></tr></thead>
            <tbody>${shownWords.map((w, i) => `
              <tr>
                <td class="num">${i + 1}</td>
                <td class="word-cell"><b>${esc(w.word)}</b>${multi ? `<small class="sub">${esc(w.setName)}</small>` : ''}</td>
                <td>${esc(w.category)}</td>
                <td title="${esc(w.word)}: ${w.attempts}번 시도 중 ${w.wrongAttempts}번 틀림">
                  <div class="meter-cell">
                    <span class="meter"><span class="meter-fill" style="width:${Math.max(2, w.rate * 100)}%"></span></span>
                    <span class="meter-val">${Math.round(w.rate * 100)}%</span>
                  </div>
                </td>
                <td class="num">${w.wrongEvents}</td>
              </tr>`).join('')}</tbody>
          </table></div>
          ${wrongWords.length > TOP_N ? `<button type="button" class="btn small ghost" id="btn-all-words">${showAllWords ? '상위 ' + TOP_N + '개만 보기' : `틀린 단어 모두 보기 (${wrongWords.length}개)`}</button>` : ''}
          ${words.length > wrongWords.length ? `<p class="note">한 번도 틀리지 않은 단어: ${words.length - wrongWords.length}개</p>` : ''}
        ` : '<p class="empty-note">틀린 단어가 없어요.</p>'}
      </section>

      <section class="panel">
        <h2 class="panel-title">혼동 쌍 — 어떤 단어를 어느 칸에 잘못 넣었나</h2>
        ${pairs.length ? `
          <div class="table-scroll"><table class="data-table">
            <thead><tr><th>단어</th><th>잘못 넣은 칸</th><th>정답 칸</th><th class="num">횟수</th><th class="num">학생 수</th></tr></thead>
            <tbody>${pairs.slice(0, TOP_N).map((p) => `
              <tr>
                <td class="word-cell"><b>${esc(p.word)}</b>${multi ? `<small class="sub">${esc(p.setName)}</small>` : ''}</td>
                <td><span class="tag bad">${esc(p.placed)}</span></td>
                <td><span class="tag ok">${esc(p.answer)}</span></td>
                <td class="num">${p.count}</td>
                <td class="num">${p.students}</td>
              </tr>`).join('')}</tbody>
          </table></div>
          ${pairs.length > TOP_N ? `<p class="note">상위 ${TOP_N}개만 표시했어요. 전체는 CSV로 받을 수 있어요.</p>` : ''}
        ` : '<p class="empty-note">다른 카테고리 칸에 잘못 넣은 기록이 없어요.</p>'}
        <p class="note">카테고리가 열리지 않은 빈 칸에 놓은 경우는 규칙 실수라서 여기에서 뺐어요.</p>
      </section>

      <section class="panel">
        <h2 class="panel-title">학생별 기록</h2>
        <div class="table-scroll">
          <table class="data-table">
            <thead><tr><th>학번</th><th>이름</th><th class="num">시도</th><th class="num">최고</th><th class="num">최근</th><th>최근 일시</th><th></th></tr></thead>
            <tbody>${students.map((s) => `
              <tr>
                <td>${esc(s.no)}</td><td>${esc(s.name || '')}</td>
                <td class="num">${s.count}</td><td class="num"><b>${s.best}</b></td><td class="num">${s.latest}</td>
                <td class="nowrap">${fmtDate(s.latestAt)}</td>
                <td><button type="button" class="btn small danger" data-del-student="${esc(s.no)}">삭제</button></td>
              </tr>`).join('')}</tbody>
          </table>
        </div>
      </section>

      <section class="panel danger-zone">
        <h2 class="panel-title">기록 삭제</h2>
        <p class="note">이 수업의 학생 기록을 모두 지워요. 지우기 전에 CSV로 받아 두세요.</p>
        <button type="button" class="btn danger" id="btn-delete-all">이 수업 기록 모두 삭제</button>
      </section>`;

    el.querySelector('#set-filter').addEventListener('change', (e) => { filter = e.target.value; showAllWords = false; render(); });
    el.querySelector('#btn-refresh').addEventListener('click', load);
    el.querySelector('#btn-csv').addEventListener('click', () => downloadCsv(cls, rows, filter));
    el.querySelector('#btn-all-words')?.addEventListener('click', () => { showAllWords = !showAllWords; render(); });
    el.querySelectorAll('[data-del-student]').forEach((b) => b.addEventListener('click', async () => {
      const no = b.dataset.delStudent;
      if (!confirm(`학번 ${no} 학생의 이 수업 기록을 모두 삭제할까요?`)) return;
      try { await api.deleteAttempts(cls.id, no); await load(); } catch (e) { alert(e.message); }
    }));
    el.querySelector('#btn-delete-all').addEventListener('click', async () => {
      const typed = prompt(`정말 모두 지우려면 수업 코드 ${cls.code} 를 입력하세요.`);
      if (typed === null) return;
      if (typed.trim().toUpperCase() !== cls.code) return alert('수업 코드가 달라요. 삭제하지 않았어요.');
      try { await api.deleteAttempts(cls.id); await load(); } catch (e) { alert(e.message); }
    });
  }

  await load();
}

// ---------- 집계 ----------

// 단어별: 몇 번의 시도에 나왔고(attempts), 그중 몇 번 틀렸는지(wrongAttempts), 총 틀린 횟수(wrongEvents)
function wordStats(rows, sets, keyBySet) {
  const byId = new Map(sets.map((s) => [s.id, s]));
  const byName = new Map(sets.map((s) => [s.name, s]));
  const map = new Map();
  const get = (setName, word, category) => {
    const key = (keyBySet ? setName + '\u0000' : '') + word;
    if (!map.has(key)) map.set(key, { word, category, setName, attempts: 0, wrongAttempts: 0, wrongEvents: 0 });
    return map.get(key);
  };
  for (const a of rows) {
    const set = byId.get(a.set_id) || byName.get(a.set_name);
    const wrongWords = new Set();
    for (const w of a.wrong_list || []) {
      get(a.set_name, w.word, w.answer).wrongEvents++;
      wrongWords.add(w.word);
    }
    // 세트가 남아 있으면 세트의 모든 단어를, 지워졌으면 틀린 단어만 센다
    const all = set ? set.rows.map((r) => [r.word, r.category]) : [...wrongWords].map((w) => [w, get(a.set_name, w, '').category]);
    for (const [word, category] of all) {
      const item = get(a.set_name, word, category);
      item.attempts++;
      if (wrongWords.has(word)) item.wrongAttempts++;
    }
  }
  return [...map.values()]
    .map((w) => ({ ...w, rate: w.attempts ? w.wrongAttempts / w.attempts : 0 }))
    .sort((a, b) => b.rate - a.rate || b.wrongEvents - a.wrongEvents || a.word.localeCompare(b.word, 'ko'));
}

// 혼동 쌍: (단어, 잘못 넣은 칸) 별 횟수와 학생 수
function confusionPairs(rows, keyBySet) {
  const map = new Map();
  for (const a of rows) {
    for (const w of a.wrong_list || []) {
      if (w.placed === EMPTY_SLOT_LABEL) continue;
      const key = [keyBySet ? a.set_name : '', w.word, w.placed].join('\u0000');
      if (!map.has(key)) map.set(key, { word: w.word, placed: w.placed, answer: w.answer, setName: a.set_name, count: 0, who: new Set() });
      const p = map.get(key);
      p.count++;
      p.who.add(a.student_no);
    }
  }
  return [...map.values()].map((p) => ({ ...p, students: p.who.size })).sort((a, b) => b.count - a.count || b.students - a.students);
}

// 학생별: 시도 횟수, 최고 점수, 최근 점수
function studentStats(rows) {
  const map = new Map();
  for (const a of [...rows].sort((x, y) => x.created_at.localeCompare(y.created_at))) {
    if (!map.has(a.student_no)) map.set(a.student_no, { no: a.student_no, name: '', count: 0, best: 0, latest: 0, latestAt: '' });
    const s = map.get(a.student_no);
    s.count++;
    s.best = Math.max(s.best, a.score);
    s.latest = a.score;
    s.latestAt = a.created_at;
    if (a.student_name) s.name = a.student_name;
  }
  return [...map.values()].sort((a, b) => a.no.localeCompare(b.no, 'ko', { numeric: true }));
}

function fmtDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ---------- CSV ----------

// 엑셀에서 수식으로 실행되지 않도록 =,+,-,@ 로 시작하는 값 앞에 ' 를 붙이고, 따옴표로 감싼다
function csvCell(v) {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return `"${s.replace(/"/g, '""')}"`;
}

function downloadCsv(cls, rows, filter) {
  const header = ['일시', '학번', '이름', '세트', '점수', '걸린 시간(초)', '이동 수', '정답 수', '오답 수', '단어 수', '모두 분류', '틀린 단어(단어→놓은 칸/정답)'];
  const lines = [header.map(csvCell).join(',')];
  for (const a of rows) {
    lines.push([
      new Date(a.created_at).toLocaleString('ko-KR'), a.student_no, a.student_name || '', a.set_name,
      a.score, a.elapsed_sec, a.moves, a.correct, a.wrong, a.total_words, a.finished ? '예' : '아니오',
      (a.wrong_list || []).map((w) => `${w.word}→${w.placed}/${w.answer}`).join('; '),
    ].map(csvCell).join(','));
  }
  // 엑셀에서 한글이 깨지지 않도록 BOM(﻿)을 앞에 붙인다
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const date = new Date().toISOString().slice(0, 10);
  saveBlob(blob, `${cls.name}${filter ? '_' + filter : ''}_결과_${date}.csv`.replace(/[\\/:*?"<>|]/g, '_'));
}
