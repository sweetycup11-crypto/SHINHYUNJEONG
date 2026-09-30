// 생기부(세특) 문장 초안: 학생 기록 → 근거 요약 → AI 초안 (학생 1명 / 반 전체)
// 학생 이름·학번은 AI에 보내지 않고, 게임 기록 요약만 보낸다. 서버: api/saenggibu.js
import { api } from './api.js';
import { esc } from './board.js';
import { saveBlob } from './excel.js';
import { EMPTY_SLOT_LABEL } from './game.js';

const CHUNK = 5; // 서버 한 번 요청에 보내는 학생 수 (api/saenggibu.js 의 LIMITS.students 와 같게)
const PREF_KEY = 'cs-remarks-pref';

function loadPref() {
  try { return JSON.parse(localStorage.getItem(PREF_KEY)) || {}; } catch { return {}; }
}
function savePref(p) {
  try { localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch { /* 무시 */ }
}

const accuracy = (a) => {
  const total = a.correct + a.wrong;
  return total ? Math.round((100 * a.correct) / total) : null;
};

// 한 학생의 기록(rows)으로 근거 요약 만들기. sets: 교사의 세트 목록(카테고리 이름용)
export function buildEvidence(rows, sets) {
  const list = [...rows].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const first = list[0];
  const last = list[list.length - 1];
  const setNames = [...new Set(list.map((a) => a.set_name))];
  const cats = new Set();
  for (const name of setNames) {
    const set = sets.find((s) => s.name === name);
    set?.rows.forEach((r) => cats.add(r.category));
  }
  const wrongWords = (a) => new Set((a.wrong_list || []).filter((w) => w.placed !== EMPTY_SLOT_LABEL).map((w) => w.word));
  const answerOf = new Map();
  for (const a of list) for (const w of a.wrong_list || []) answerOf.set(w.word, w.answer);

  // 처음(마지막 판 이전)에는 틀렸는데 마지막 판에서는 틀리지 않은 개념
  const earlier = new Set(list.slice(0, -1).flatMap((a) => [...wrongWords(a)]));
  const lastWrong = wrongWords(last);
  const improved = list.length > 1 && last.finished
    ? [...earlier].filter((w) => !lastWrong.has(w)).map((w) => `${w}(${answerOf.get(w)})`)
    : [];
  const stillConfused = [];
  for (const w of last.wrong_list || []) {
    if (w.placed === EMPTY_SLOT_LABEL) continue;
    const s = `${w.word}(정답: ${w.answer}, 잘못 넣은 칸: ${w.placed})`;
    if (!stillConfused.includes(s)) stillConfused.push(s);
  }

  return {
    sets: setNames,
    categories: [...cats],
    attempts: list.length,
    days: new Set(list.map((a) => a.created_at.slice(0, 10))).size,
    first_accuracy: accuracy(first),
    latest_accuracy: accuracy(last),
    faster: list.length > 1 && first.finished && last.finished && last.elapsed_sec < first.elapsed_sec * 0.8,
    finished_all: !!last.finished,
    improved: improved.slice(0, 12),
    still_confused: stillConfused.slice(0, 12),
  };
}

// 교사에게 보여 줄 근거 요약 (숫자 포함)
function evidenceHTML(ev) {
  const li = (t) => `<li>${t}</li>`;
  return `<ul class="evidence">
    ${li(`활동: ${ev.sets.map(esc).join(', ')} · ${ev.attempts}회 참여${ev.days > 1 ? ` (${ev.days}일에 걸쳐)` : ''}`)}
    ${ev.first_accuracy !== null ? li(`배치 정확도: 처음 ${ev.first_accuracy}% → 최근 ${ev.latest_accuracy}%${ev.faster ? ' · 해결 시간 단축' : ''}`) : ''}
    ${ev.improved.length ? li(`처음엔 틀렸다가 바르게 분류한 개념: ${ev.improved.map(esc).join(', ')}`) : ''}
    ${ev.still_confused.length ? li(`최근에도 헷갈린 개념: ${ev.still_confused.map(esc).join(', ')}`) : ''}
    ${ev.attempts < 2 ? li('<span class="text-warn">참여가 1회뿐이라 성장 근거가 부족해요.</span>') : ''}
  </ul>`;
}

// 서버에 CHUNK명씩 나눠 보내기. onProgress(done, total)
async function generate(items, { subject, length }, onProgress) {
  const out = new Map();
  for (let i = 0; i < items.length; i += CHUNK) {
    const chunk = items.slice(i, i + CHUNK);
    try {
      const { results } = await api.generateRemarks({
        subject, length,
        students: chunk.map((it) => ({ id: it.id, ...it.evidence, teacher_note: it.note || '' })),
      });
      for (const r of results) out.set(r.id, r);
      for (const it of chunk) if (!out.has(it.id)) out.set(it.id, { id: it.id, error: '결과가 비어 있어요.' });
    } catch (e) {
      for (const it of chunk) out.set(it.id, { id: it.id, error: e.message });
      if (/로그인|설정되지|쓸 수 없어요/.test(e.message)) {
        // 다시 시도해도 같은 오류라서 나머지는 보내지 않는다
        for (const rest of items.slice(i + CHUNK)) out.set(rest.id, { id: rest.id, error: e.message });
        onProgress?.(items.length, items.length);
        break;
      }
    }
    onProgress?.(Math.min(i + CHUNK, items.length), items.length);
  }
  return out;
}

function openModal(html) {
  const box = document.createElement('div');
  box.className = 'modal-overlay';
  box.innerHTML = `<div class="modal wide" role="dialog" aria-modal="true">${html}</div>`;
  const close = () => { box.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  box.addEventListener('click', (e) => { if (e.target === box) close(); });
  document.body.appendChild(box);
  box.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
  return { el: box.querySelector('.modal'), close };
}

const prefFields = (pref) => `
  <div class="remark-prefs">
    <label>과목 <input name="subject" maxlength="40" placeholder="예: 통합과학, 화학Ⅰ" value="${esc(pref.subject || '')}" /></label>
    <label>분량
      <select name="length">
        <option value="auto" ${!['short', 'long'].includes(pref.length) ? 'selected' : ''}>자동 (참여 횟수에 맞춰 1~4문장)</option>
        <option value="short" ${pref.length === 'short' ? 'selected' : ''}>짧게 (1~2문장)</option>
        <option value="long" ${pref.length === 'long' ? 'selected' : ''}>길게 (3~4문장)</option>
      </select>
    </label>
  </div>`;
const readPref = (el) => {
  const pref = { subject: el.querySelector('[name=subject]').value.trim(), length: el.querySelector('[name=length]').value };
  savePref(pref);
  return pref;
};
const DISCLAIMER = `<p class="note">AI가 게임 기록만 보고 쓴 <b>초안</b>이에요. 세특은 교사의 관찰을 바탕으로 써야 하니, 사실과 맞는지 확인하고 고쳐 쓰세요.
  학생 이름·학번은 AI에 보내지 않아요.${api.mode === 'demo' ? ' <b>체험 모드에서는 AI 대신 예시 문장이 나와요.</b>' : ''}</p>`;

// ---------- 학생 1명 ----------

export function openStudentRemark({ student, rows, sets, filterName }) {
  const evidence = buildEvidence(rows, sets);
  const pref = loadPref();
  const { el } = openModal(`
    <h2 class="panel-title">생기부 문장 초안 — 학번 ${esc(student.no)}${student.name ? ` ${esc(student.name)}` : ''}</h2>
    <p class="note">${filterName ? `세트 ‘${esc(filterName)}’ 기록` : '이 수업의 모든 세트 기록'}을 근거로 써요.</p>
    <h3 class="sub-title">근거 요약</h3>
    ${evidenceHTML(evidence)}
    ${prefFields(pref)}
    <label class="memo-label">교사 관찰 메모 (선택)
      <textarea name="note" maxlength="300" rows="2" placeholder="예: 모둠 활동에서 친구에게 개념 차이를 설명해 줌"></textarea>
      <small>메모도 AI에 보내져요. 이름·학번 등 개인정보는 쓰지 마세요.</small>
    </label>
    ${DISCLAIMER}
    <p class="save-status" role="status"></p>
    <textarea class="remark-output" rows="5" placeholder="여기에 초안이 나와요. 직접 고칠 수 있어요." hidden></textarea>
    <div class="btn-row">
      <button type="button" class="btn" data-go>AI로 초안 만들기</button>
      <button type="button" class="btn ghost" data-copy hidden>복사</button>
      <button type="button" class="btn ghost" data-close>닫기</button>
    </div>`);

  const status = el.querySelector('.save-status');
  const output = el.querySelector('.remark-output');
  const go = el.querySelector('[data-go]');
  go.addEventListener('click', async () => {
    const p = readPref(el);
    go.disabled = true;
    status.className = 'save-status';
    status.textContent = 'AI가 문장을 쓰는 중이에요… (10~30초)';
    const res = await generate([{ id: '1', evidence, note: el.querySelector('[name=note]').value }], p);
    const r = res.get('1');
    go.disabled = false;
    go.textContent = '다시 만들기';
    if (r.error) {
      status.className = 'save-status bad';
      status.textContent = r.error;
      return;
    }
    status.className = 'save-status ok';
    status.textContent = r.evidence_note ? `참고: ${r.evidence_note}` : '초안을 만들었어요. 확인하고 고쳐 쓰세요.';
    output.hidden = false;
    output.value = r.text;
    el.querySelector('[data-copy]').hidden = false;
  });
  el.querySelector('[data-copy]').addEventListener('click', async (e) => {
    try { await navigator.clipboard.writeText(output.value); e.target.textContent = '복사했어요!'; } catch { output.select(); }
  });
}

// ---------- 반 전체 ----------

export function openClassRemarks({ cls, students, rowsByStudent, sets, filterName }) {
  const pref = loadPref();
  const n = students.length;
  const { el } = openModal(`
    <h2 class="panel-title">반 전체 생기부 문장 초안</h2>
    <p class="note">${esc(cls.name)} · 학생 ${n}명 · ${filterName ? `세트 ‘${esc(filterName)}’ 기록` : '모든 세트 기록'} 기준.
      다 만들면 CSV(엑셀)로 받을 수 있어요.</p>
    ${prefFields(pref)}
    ${DISCLAIMER}
    ${api.mode === 'demo' ? '' : `<p class="note">AI 사용료는 운영자 계정에서 나가요. 학생 1명당 대략 10~30원이에요.</p>`}
    <p class="save-status" role="status"></p>
    <progress class="remark-progress" max="${n}" value="0" hidden></progress>
    <div class="remark-list"></div>
    <div class="btn-row">
      <button type="button" class="btn" data-go>${n}명 초안 만들기</button>
      <button type="button" class="btn ghost" data-csv hidden>CSV 다운로드</button>
      <button type="button" class="btn ghost" data-close>닫기</button>
    </div>`);

  const items = students.map((s, i) => ({ id: String(i + 1), student: s, evidence: buildEvidence(rowsByStudent.get(s.no), sets) }));
  let results = new Map();
  const status = el.querySelector('.save-status');
  const bar = el.querySelector('.remark-progress');
  const go = el.querySelector('[data-go]');

  function renderList() {
    el.querySelector('.remark-list').innerHTML = `<ol class="remark-results">${items.map((it) => {
      const r = results.get(it.id);
      return `<li><b>${esc(it.student.no)}${it.student.name ? ` ${esc(it.student.name)}` : ''}</b>
        ${r?.error ? `<span class="text-bad">${esc(r.error)}</span>` : `<p>${esc(r?.text || '')}</p>`}
        ${r?.evidence_note ? `<small class="text-warn">${esc(r.evidence_note)}</small>` : ''}</li>`;
    }).join('')}</ol>`;
  }

  go.addEventListener('click', async () => {
    const p = readPref(el);
    // 처음이면 전체, 다시 누르면 실패한 학생만
    const todo = results.size ? items.filter((it) => results.get(it.id)?.error) : items;
    if (!todo.length) return;
    go.disabled = true;
    bar.hidden = false;
    bar.max = todo.length;
    status.className = 'save-status';
    status.textContent = `AI가 문장을 쓰는 중이에요… 0/${todo.length}`;
    const got = await generate(todo, p, (done, total) => {
      bar.value = done;
      status.textContent = `AI가 문장을 쓰는 중이에요… ${done}/${total}`;
    });
    for (const [k, v] of got) results.set(k, v);
    const failed = items.filter((it) => results.get(it.id)?.error).length;
    status.className = `save-status ${failed ? 'bad' : 'ok'}`;
    status.textContent = failed ? `${n - failed}명 완료, ${failed}명 실패했어요. [실패한 학생 다시 만들기]를 눌러 보세요.` : `${n}명 모두 만들었어요. 확인하고 고쳐 쓰세요.`;
    go.disabled = false;
    go.textContent = failed ? '실패한 학생 다시 만들기' : '완료';
    go.disabled = !failed;
    el.querySelector('[data-csv]').hidden = false;
    renderList();
  });

  el.querySelector('[data-csv]').addEventListener('click', () => {
    const cell = (v) => {
      let s = String(v ?? '');
      if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
      return `"${s.replace(/"/g, '""')}"`;
    };
    const lines = [['학번', '이름', '세특 초안', '참고'].map(cell).join(',')];
    for (const it of items) {
      const r = results.get(it.id) || {};
      lines.push([it.student.no, it.student.name || '', r.text || '', r.error || r.evidence_note || ''].map(cell).join(','));
    }
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    saveBlob(blob, `${cls.name}_세특초안_${new Date().toISOString().slice(0, 10)}.csv`.replace(/[\\/:*?"<>|]/g, '_'));
  });
}
