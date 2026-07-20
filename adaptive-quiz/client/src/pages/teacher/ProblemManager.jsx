import { useEffect, useState } from "react";
import { api } from "../../api.js";
import { downloadProblemTemplate, parseProblemExcel } from "../../excelProblems.js";

const LEVELS = Array.from({ length: 10 }, (_, i) => i + 1);

function emptyForm(type, level) {
  return {
    id: null,
    type,
    level,
    stem: "",
    choices: ["", "", "", ""],
    answerIndex: 0,
    explanation: "",
    hints: [],
  };
}

const BULK_EXAMPLE = `[
  {
    "type": "formative",
    "level": 3,
    "stem": "문제 내용을 입력하세요",
    "choices": ["보기1", "보기2", "보기3", "보기4"],
    "answerIndex": 0,
    "explanation": "해설 내용",
    "hints": ["힌트1", "힌트2"]
  }
]`;

export default function ProblemManager() {
  const [subjects, setSubjects] = useState([]);
  const [subjectId, setSubjectId] = useState("");
  const [type, setType] = useState("formative");
  const [levelFilter, setLevelFilter] = useState("all");
  const [problems, setProblems] = useState([]);
  const [form, setForm] = useState(emptyForm("formative", 1));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [bulkResult, setBulkResult] = useState(null);
  const [showBulk, setShowBulk] = useState(false);
  const [excelBusy, setExcelBusy] = useState(false);
  const [excelResult, setExcelResult] = useState(null);
  const [excelInputKey, setExcelInputKey] = useState(0);

  useEffect(() => {
    api.listSubjects().then((list) => {
      setSubjects(list);
      if (list.length && !subjectId) setSubjectId(list[0].id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function refreshProblems() {
    if (!subjectId) return;
    api
      .listProblems({ subjectId, type })
      .then(setProblems)
      .catch((e) => setError(e.message));
  }

  useEffect(refreshProblems, [subjectId, type]);

  useEffect(() => {
    setForm(emptyForm(type, 1));
  }, [type, subjectId]);

  function startEdit(p) {
    setForm({
      id: p.id,
      type: p.type,
      level: p.level,
      stem: p.stem,
      choices: [...p.choices],
      answerIndex: p.answerIndex,
      explanation: p.explanation || "",
      hints: [...(p.hints || [])],
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEdit() {
    setForm(emptyForm(type, form.level));
  }

  function updateChoice(i, value) {
    setForm((f) => {
      const choices = [...f.choices];
      choices[i] = value;
      return { ...f, choices };
    });
  }

  function addChoice() {
    setForm((f) => (f.choices.length >= 5 ? f : { ...f, choices: [...f.choices, ""] }));
  }

  function removeChoice() {
    setForm((f) => {
      if (f.choices.length <= 4) return f;
      const choices = f.choices.slice(0, -1);
      return { ...f, choices, answerIndex: Math.min(f.answerIndex, choices.length - 1) };
    });
  }

  function updateHint(i, value) {
    setForm((f) => {
      const hints = [...f.hints];
      hints[i] = value;
      return { ...f, hints };
    });
  }

  function addHint() {
    setForm((f) => (f.hints.length >= 2 ? f : { ...f, hints: [...f.hints, ""] }));
  }

  function removeHint(i) {
    setForm((f) => ({ ...f, hints: f.hints.filter((_, idx) => idx !== i) }));
  }

  async function handleSubmitForm(e) {
    e.preventDefault();
    if (!subjectId) return;
    setBusy(true);
    setError("");
    const payload = {
      subjectId,
      type: form.type,
      level: Number(form.level),
      stem: form.stem.trim(),
      choices: form.choices.map((c) => c.trim()),
      answerIndex: Number(form.answerIndex),
      explanation: form.explanation.trim(),
      hints: form.hints.map((h) => h.trim()).filter(Boolean),
    };
    try {
      if (form.id) {
        await api.updateProblem(form.id, payload);
      } else {
        await api.createProblem(payload);
      }
      setForm(emptyForm(type, form.level));
      refreshProblems();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id) {
    if (!confirm("이 문제를 삭제할까요?")) return;
    try {
      await api.deleteProblem(id);
      refreshProblems();
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleBulkUpload() {
    setError("");
    setBulkResult(null);
    let parsed;
    try {
      parsed = JSON.parse(bulkText);
    } catch {
      setError("올바른 JSON 형식이 아닙니다.");
      return;
    }
    if (!Array.isArray(parsed)) {
      setError("최상위는 배열([...])이어야 합니다.");
      return;
    }
    const problemsPayload = parsed.map((p) => ({ ...p, subjectId }));
    try {
      const res = await api.bulkCreateProblems(problemsPayload);
      setBulkResult(res);
      refreshProblems();
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleExcelFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    setExcelBusy(true);
    setError("");
    setExcelResult(null);
    try {
      const { payloads, errors: parseErrors } = await parseProblemExcel(file);
      let created = [];
      let uploadErrors = [];
      if (payloads.length) {
        const res = await api.bulkCreateProblems(payloads.map((p) => ({ ...p.payload, subjectId })));
        created = res.created;
        uploadErrors = res.errors.map((e) => ({
          row: payloads[e.index]?.row ?? null,
          error: e.error,
        }));
      }
      const allErrors = [
        ...parseErrors.map((e) => ({ row: e.row, error: e.error })),
        ...uploadErrors,
      ].sort((a, b) => (a.row ?? 0) - (b.row ?? 0));
      setExcelResult({ createdCount: created.length, errors: allErrors });
      refreshProblems();
    } catch (err) {
      setError(err.message || "엑셀 파일을 읽는 중 오류가 발생했습니다.");
    } finally {
      setExcelBusy(false);
      setExcelInputKey((k) => k + 1); // reset file input so the same file can be re-selected
    }
  }

  const visibleProblems = problems
    .filter((p) => levelFilter === "all" || p.level === Number(levelFilter))
    .sort((a, b) => a.level - b.level);

  return (
    <div className="stack">
      <div className="card">
        <div className="grid-2">
          <div>
            <label>과목</label>
            <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>문제 세트 유형</label>
            <select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="diagnostic">진단평가</option>
              <option value="formative">형성평가</option>
            </select>
          </div>
        </div>
        {!subjects.length && (
          <p className="muted" style={{ marginTop: 10 }}>
            먼저 '과목 관리' 탭에서 과목을 추가하세요.
          </p>
        )}
      </div>

      {subjectId && (
        <>
          <div className="card">
            <h3>{form.id ? "문제 수정" : "새 문제 추가"}</h3>
            <form className="stack" onSubmit={handleSubmitForm}>
              <div className="grid-2">
                <div>
                  <label>단계 (1~10, 난이도)</label>
                  <select value={form.level} onChange={(e) => setForm((f) => ({ ...f, level: Number(e.target.value) }))}>
                    {LEVELS.map((lv) => (
                      <option key={lv} value={lv}>
                        {lv}단계
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label>유형</label>
                  <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>
                    <option value="diagnostic">진단평가</option>
                    <option value="formative">형성평가</option>
                  </select>
                </div>
              </div>

              <div>
                <label>문제 내용</label>
                <textarea
                  value={form.stem}
                  onChange={(e) => setForm((f) => ({ ...f, stem: e.target.value }))}
                  placeholder="문제를 입력하세요"
                  required
                  style={{ fontFamily: "inherit" }}
                />
              </div>

              <div>
                <div className="row between">
                  <label>선택지 (정답에 라디오 버튼 체크)</label>
                  <div className="row">
                    <button type="button" className="btn secondary sm" onClick={addChoice} disabled={form.choices.length >= 5}>
                      선택지 추가
                    </button>
                    <button type="button" className="btn secondary sm" onClick={removeChoice} disabled={form.choices.length <= 4}>
                      선택지 제거
                    </button>
                  </div>
                </div>
                <div className="stack">
                  {form.choices.map((c, i) => (
                    <div className="row" key={i}>
                      <input
                        type="radio"
                        name="answerIndex"
                        checked={Number(form.answerIndex) === i}
                        onChange={() => setForm((f) => ({ ...f, answerIndex: i }))}
                      />
                      <input
                        type="text"
                        value={c}
                        onChange={(e) => updateChoice(i, e.target.value)}
                        placeholder={`선택지 ${String.fromCharCode(65 + i)}`}
                        required
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label>해설</label>
                <textarea
                  value={form.explanation}
                  onChange={(e) => setForm((f) => ({ ...f, explanation: e.target.value }))}
                  placeholder="정답 제출 후 학생에게 보여줄 해설"
                  style={{ fontFamily: "inherit" }}
                />
              </div>

              <div>
                <div className="row between">
                  <label>힌트 (최대 2개)</label>
                  <button type="button" className="btn secondary sm" onClick={addHint} disabled={form.hints.length >= 2}>
                    힌트 추가
                  </button>
                </div>
                <div className="stack">
                  {form.hints.map((h, i) => (
                    <div className="row" key={i}>
                      <input type="text" value={h} onChange={(e) => updateHint(i, e.target.value)} placeholder={`힌트 ${i + 1}`} />
                      <button type="button" className="btn danger sm" onClick={() => removeHint(i)}>
                        제거
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {error && <div className="error-box">{error}</div>}

              <div className="row">
                <button className="btn" type="submit" disabled={busy}>
                  {form.id ? "수정 저장" : "문제 추가"}
                </button>
                {form.id && (
                  <button type="button" className="btn secondary" onClick={cancelEdit}>
                    취소
                  </button>
                )}
              </div>
            </form>
          </div>

          <div className="card">
            <h3>엑셀로 문제 업로드</h3>
            <p className="muted">
              양식을 내려받아 문제를 채운 뒤 업로드하면 현재 선택된 과목(
              {subjects.find((s) => s.id === subjectId)?.name})에 한 번에 여러 문제가 추가됩니다.
            </p>
            <div className="row">
              <button type="button" className="btn secondary" onClick={downloadProblemTemplate}>
                양식 다운로드
              </button>
              <label className="btn" style={{ cursor: "pointer" }}>
                {excelBusy ? "업로드하는 중..." : "엑셀 파일 선택"}
                <input
                  key={excelInputKey}
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleExcelFile}
                  disabled={excelBusy}
                  style={{ display: "none" }}
                />
              </label>
            </div>
            {excelResult && (
              <p className="muted" style={{ marginTop: 10 }}>
                생성됨: {excelResult.createdCount}개
                {excelResult.errors.length > 0 && ` · 오류: ${excelResult.errors.length}개`}
              </p>
            )}
            {excelResult && excelResult.errors.length > 0 && (
              <div className="error-box" style={{ marginTop: 6 }}>
                {excelResult.errors.map((e, i) => (
                  <div key={i}>{e.row ? `${e.row}행: ` : ""}{e.error}</div>
                ))}
              </div>
            )}
          </div>

          <div className="card">
            <div className="row between">
              <h3 style={{ margin: 0 }}>일괄 업로드 (JSON, 고급)</h3>
              <button className="btn secondary sm" onClick={() => setShowBulk((v) => !v)}>
                {showBulk ? "닫기" : "열기"}
              </button>
            </div>
            {showBulk && (
              <div className="stack" style={{ marginTop: 12 }}>
                <p className="muted">
                  아래 형식의 JSON 배열을 붙여넣으면 현재 선택된 과목({subjects.find((s) => s.id === subjectId)?.name})에
                  한 번에 여러 문제를 추가합니다. subjectId는 자동으로 채워집니다.
                </p>
                <textarea
                  rows={10}
                  value={bulkText}
                  onChange={(e) => setBulkText(e.target.value)}
                  placeholder={BULK_EXAMPLE}
                />
                <div className="row">
                  <button className="btn" onClick={handleBulkUpload}>
                    업로드
                  </button>
                  <button className="btn secondary" onClick={() => setBulkText(BULK_EXAMPLE)}>
                    예시 채우기
                  </button>
                </div>
                {bulkResult && (
                  <p className="muted">
                    생성됨: {bulkResult.created.length}개
                    {bulkResult.errors.length > 0 && ` · 오류: ${bulkResult.errors.length}개`}
                  </p>
                )}
                {bulkResult && bulkResult.errors.length > 0 && (
                  <div className="error-box">
                    {bulkResult.errors.map((e, i) => (
                      <div key={i}>#{e.index}: {e.error}</div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="card">
            <div className="row between">
              <h3 style={{ margin: 0 }}>
                문제 목록 ({visibleProblems.length}개)
              </h3>
              <select value={levelFilter} onChange={(e) => setLevelFilter(e.target.value)} style={{ width: 140 }}>
                <option value="all">전체 단계</option>
                {LEVELS.map((lv) => (
                  <option key={lv} value={lv}>
                    {lv}단계
                  </option>
                ))}
              </select>
            </div>
            {visibleProblems.length === 0 && <p className="muted">문제가 없습니다.</p>}
            <div className="stack" style={{ marginTop: 10 }}>
              {visibleProblems.map((p) => (
                <div key={p.id} className="card" style={{ margin: 0, boxShadow: "none" }}>
                  <div className="row between">
                    <span className="tag">{p.level}단계</span>
                    <div className="row">
                      <button className="btn secondary sm" onClick={() => startEdit(p)}>
                        수정
                      </button>
                      <button className="btn danger sm" onClick={() => handleDelete(p.id)}>
                        삭제
                      </button>
                    </div>
                  </div>
                  <p style={{ marginTop: 8, fontWeight: 600 }}>{p.stem}</p>
                  <ul className="muted" style={{ margin: 0, paddingLeft: 20 }}>
                    {p.choices.map((c, i) => (
                      <li key={i} style={{ color: i === p.answerIndex ? "var(--good)" : undefined }}>
                        {c} {i === p.answerIndex && "(정답)"}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
