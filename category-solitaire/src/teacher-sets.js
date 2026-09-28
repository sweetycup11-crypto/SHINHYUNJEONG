// 교사 화면: 게임 세트 관리 (엑셀 업로드 → 미리보기·오류 확인 → 저장)
import { readWorkbook, downloadTemplate, downloadSets } from './excel.js';
import { api } from './api.js';
import { SAMPLE_SET } from './sample-set.js';
import { esc } from './board.js';

// 업로드한 파일의 시트별 검사 결과 ("저장 전에 해 보기" 후 돌아와도 남아 있게 바깥에 둔다)
let preview = null;

// app(교사 화면의 본문 영역)에 세트 관리 화면을 그린다. onPlay(set)로 미리 해 보기
export async function showSetManager(app, { onPlay }) {
  let sets = [];

  async function reload() {
    app.innerHTML = '<p class="note">불러오는 중…</p>';
    try {
      sets = await api.listSets();
    } catch (e) {
      app.innerHTML = `<p class="form-error">${esc(e.message)}</p>`;
      return;
    }
    render();
  }

  function render() {
    const hasSample = sets.some((s) => s.name === SAMPLE_SET.name);
    app.innerHTML = `
        <p class="lead">엑셀로 단어 카드 세트를 만들어요. 시트 하나가 게임 세트 하나예요.</p>

        <section class="panel">
          <h2 class="panel-title">1. 엑셀 양식 작성</h2>
          <table class="format-table">
            <tr><th>A열</th><th>B열</th><th>C열</th></tr>
            <tr><td>카테고리</td><td>단어</td><td>해설(선택)</td></tr>
            <tr class="dim"><td>산·염기</td><td>pH</td><td>수용액의 산성도를 나타내는 척도</td></tr>
          </table>
          <ul class="tips">
            <li><b>시트 이름이 세트 이름</b>이 돼요. 시트를 여러 개 만들면 세트도 여러 개 생겨요.</li>
            <li>첫 줄 제목(카테고리/단어/해설)은 있어도 없어도 돼요.</li>
            <li>한 단어는 한 카테고리에만 넣어 주세요. 카테고리는 2개 이상 필요해요.</li>
            <li>한글·영어·독일어(ä, ö, ü, ß) 모두 쓸 수 있어요.</li>
          </ul>
          <div class="btn-row">
            <button type="button" class="btn ghost" id="btn-template">빈 양식 받기</button>
            <button type="button" class="btn ghost" id="btn-sample">샘플 세트 엑셀 받기</button>
          </div>
        </section>

        <section class="panel">
          <h2 class="panel-title">2. 엑셀 올리기</h2>
          <label class="dropzone" id="dropzone">
            <input type="file" id="file-input" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden />
            <b>여기를 눌러 .xlsx 파일 고르기</b>
            <span>또는 파일을 이곳으로 끌어다 놓기</span>
          </label>
          <p class="form-error" id="upload-error" role="alert"></p>
          <div id="preview"></div>
        </section>

        <section class="panel">
          <h2 class="panel-title">저장된 세트 (${sets.length}개)</h2>
          <ul class="saved-list">
            ${sets.map((s, i) => `
              <li>
                <div class="saved-info">
                  <b>${esc(s.name)}</b>
                  <span>카테고리 ${new Set(s.rows.map((r) => r.category)).size}개 · 단어 ${s.rows.length}개
                  ${s.updatedAt ? ' · ' + new Date(s.updatedAt).toLocaleDateString('ko-KR') : ''}</span>
                </div>
                <div class="saved-actions">
                  <button type="button" class="btn small" data-play="${i}">해 보기</button>
                  <button type="button" class="btn small ghost" data-download="${i}">엑셀</button>
                  <button type="button" class="btn small danger" data-delete="${i}">삭제</button>
                </div>
              </li>`).join('')}
          </ul>
          ${sets.length ? '' : '<p class="note">아직 세트가 없어요. 엑셀을 올리거나 샘플 세트를 추가해 보세요.</p>'}
          ${hasSample ? '' : '<button type="button" class="btn ghost full" id="btn-add-sample">샘플 세트(고등 화학) 추가</button>'}
          ${sets.length > 1 ? '<button type="button" class="btn ghost full" id="btn-download-all">저장된 세트 모두 엑셀로 받기</button>' : ''}
          <p class="note">세트를 학생에게 보이려면 [수업] 탭에서 수업을 고른 뒤 [공개 세트]에서 선택하세요.</p>
        </section>`;

    app.querySelector('#btn-add-sample')?.addEventListener('click', () =>
      runSave([{ name: SAMPLE_SET.name, rows: SAMPLE_SET.rows }]));
    app.querySelector('#btn-template').addEventListener('click', () => runDownload(downloadTemplate));
    app.querySelector('#btn-sample').addEventListener('click', () =>
      runDownload(() => downloadSets([SAMPLE_SET], '카테고리솔리테어_샘플세트.xlsx')));
    app.querySelector('#btn-download-all')?.addEventListener('click', () =>
      runDownload(() => downloadSets(sets, '카테고리솔리테어_세트모음.xlsx')));

    // 파일 고르기 / 끌어다 놓기
    const input = app.querySelector('#file-input');
    const zone = app.querySelector('#dropzone');
    input.addEventListener('change', () => input.files[0] && handleFile(input.files[0]));
    zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('over'));
    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.classList.remove('over');
      const f = e.dataTransfer.files[0];
      if (f) handleFile(f);
    });

    // 저장된 세트 버튼
    app.querySelectorAll('[data-play]').forEach((b) => b.addEventListener('click', () => onPlay(sets[+b.dataset.play])));
    app.querySelectorAll('[data-download]').forEach((b) => b.addEventListener('click', () => {
      const s = sets[+b.dataset.download];
      runDownload(() => downloadSets([s], `${s.name}.xlsx`));
    }));
    app.querySelectorAll('[data-delete]').forEach((b) => b.addEventListener('click', () => {
      const s = sets[+b.dataset.delete];
      if (!confirm(`‘${s.name}’ 세트를 삭제할까요?\n수업에 공개된 것도 함께 사라져요. 학생 기록은 남아요.`)) return;
      api.deleteSet(s.id).then(reload, (e) => alert(e.message));
    }));

    renderPreview();
  }

  async function runSave(chosen) {
    try {
      await api.saveSets(chosen);
    } catch (e) {
      alert('저장하지 못했어요. ' + e.message);
      return false;
    }
    await reload();
    return true;
  }

  async function runDownload(fn) {
    try { await fn(); } catch { alert('파일을 만들지 못했어요. 다시 시도해 주세요.'); }
  }

  async function handleFile(file) {
    const err = app.querySelector('#upload-error');
    err.textContent = '';
    preview = null;
    app.querySelector('#preview').innerHTML = '<p class="note">파일을 읽는 중…</p>';
    try {
      preview = await readWorkbook(file);
      for (const p of preview) {
        p.overwrite = !p.errors.length && sets.some((s) => s.name === p.name);
        p.checked = !p.errors.length;
      }
    } catch (e) {
      err.textContent = e.message;
    }
    renderPreview();
  }

  // 미리보기: 시트별 요약, 카테고리별 단어 수, 오류·주의
  function renderPreview() {
    const box = app.querySelector('#preview');
    if (!preview) { box.innerHTML = ''; return; }
    const okCount = preview.filter((p) => !p.errors.length).length;
    box.innerHTML = `
      <p class="preview-summary">시트 ${preview.length}개 중 <b>${okCount}개</b> 저장 가능${okCount < preview.length ? ` · <span class="text-bad">${preview.length - okCount}개는 오류를 고쳐서 다시 올려 주세요</span>` : ''}</p>
      ${preview.map((p, i) => `
        <article class="sheet-card ${p.errors.length ? 'has-error' : ''}">
          <header class="sheet-head">
            <label class="check">
              <input type="checkbox" data-check="${i}" ${p.checked ? 'checked' : ''} ${p.errors.length ? 'disabled' : ''}/>
              <b>${esc(p.name)}</b>
            </label>
            <span class="badge ${p.errors.length ? 'bad' : p.warnings.length ? 'warn' : 'ok'}">
              ${p.errors.length ? `오류 ${p.errors.length}` : p.warnings.length ? `주의 ${p.warnings.length}` : '정상'}</span>
          </header>
          <p class="sheet-meta">카테고리 ${p.categories.length}개 · 단어 ${p.rows.length}개${p.overwrite ? ' · <span class="text-warn">같은 이름의 세트를 덮어써요</span>' : ''}</p>
          ${p.errors.length ? `<ul class="msg-list bad">${p.errors.map((m) => `<li>${esc(m)}</li>`).join('')}</ul>` : ''}
          ${p.warnings.length ? `<ul class="msg-list warn">${p.warnings.map((m) => `<li>${esc(m)}</li>`).join('')}</ul>` : ''}
          ${p.categories.length ? `
            <table class="cat-table">
              <thead><tr><th>카테고리</th><th>단어 수</th><th>단어</th></tr></thead>
              <tbody>${p.categories.map((c) => `
                <tr class="${c.count === 1 ? 'warn-row' : ''}">
                  <td>${esc(c.category)}</td><td class="num">${c.count}</td><td>${c.words.map(esc).join(', ')}</td>
                </tr>`).join('')}</tbody>
            </table>` : ''}
          ${!p.errors.length ? `<button type="button" class="btn small ghost" data-try="${i}">저장 전에 해 보기</button>` : ''}
        </article>`).join('')}
      <button type="button" class="btn full" id="btn-save" ${okCount ? '' : 'disabled'}>선택한 세트 저장</button>`;

    box.querySelectorAll('[data-check]').forEach((c) => c.addEventListener('change', () => {
      preview[+c.dataset.check].checked = c.checked;
    }));
    box.querySelectorAll('[data-try]').forEach((b) => b.addEventListener('click', () => {
      const p = preview[+b.dataset.try];
      onPlay({ name: p.name, rows: p.rows });
    }));
    box.querySelector('#btn-save')?.addEventListener('click', async (e) => {
      const chosen = preview.filter((p) => p.checked && !p.errors.length);
      if (!chosen.length) return alert('저장할 세트를 선택해 주세요.');
      e.target.disabled = true;
      e.target.textContent = '저장 중…';
      const saved = preview;
      preview = null;
      if (await runSave(chosen.map(({ name, rows }) => ({ name, rows })))) {
        app.querySelector('.saved-list')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else {
        preview = saved;
        renderPreview();
      }
    });
  }

  await reload();
}
