import { Fragment, useEffect, useState } from "react";
import { api } from "../../api.js";

export default function StudentOverview() {
  const [subjects, setSubjects] = useState([]);
  const [subjectId, setSubjectId] = useState("all");
  const [rows, setRows] = useState([]);
  const [expanded, setExpanded] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.listSubjects().then(setSubjects);
  }, []);

  function refresh() {
    api
      .getTeacherStudents(subjectId === "all" ? undefined : subjectId)
      .then(setRows)
      .catch((e) => setError(e.message));
  }

  useEffect(refresh, [subjectId]);

  async function handleReset(row) {
    if (!confirm(`${row.studentName} 학생의 '${row.subjectName}' 진행 상황을 모두 초기화할까요?`)) return;
    try {
      await api.resetStudent(row.studentId, row.subjectId);
      refresh();
    } catch (e) {
      setError(e.message);
    }
  }

  const rowKey = (r) => `${r.studentId}::${r.subjectId}`;

  return (
    <div className="stack">
      <div className="card">
        <div className="row between">
          <h3 style={{ margin: 0 }}>학생 현황</h3>
          <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} style={{ width: 180 }}>
            <option value="all">전체 과목</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        {error && <div className="error-box" style={{ marginTop: 10 }}>{error}</div>}
        {rows.length === 0 && <p className="muted" style={{ marginTop: 10 }}>아직 응시한 학생이 없습니다.</p>}

        {rows.length > 0 && (
          <table style={{ marginTop: 10 }}>
            <thead>
              <tr>
                <th>학생</th>
                <th>과목</th>
                <th>진단평가</th>
                <th>현재 단계</th>
                <th>누적 점수</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const key = rowKey(r);
                const isOpen = expanded === key;
                return (
                  <Fragment key={key}>
                    <tr>
                      <td>{r.studentName}</td>
                      <td>{r.subjectName}</td>
                      <td>
                        {r.diagnostic ? `${r.diagnostic.correct}/${r.diagnostic.total} → ${r.diagnostic.startLevel}단계` : "미응시"}
                      </td>
                      <td>{r.currentLevel ?? "-"}단계</td>
                      <td>{r.score}점</td>
                      <td>
                        <div className="row">
                          <button className="btn secondary sm" onClick={() => setExpanded(isOpen ? null : key)}>
                            {isOpen ? "닫기" : "상세보기"}
                          </button>
                          <button className="btn danger sm" onClick={() => handleReset(r)}>
                            초기화
                          </button>
                        </div>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={6}>
                          <StudentDetail row={r} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function StudentDetail({ row }) {
  const history = [...row.levelHistory].reverse();
  const answerLog = [...row.answerLog].reverse().slice(0, 20);
  return (
    <div className="stack" style={{ padding: "8px 0" }}>
      <div>
        <strong>단계 이력</strong>
        {history.length === 0 && <p className="muted">아직 완료한 라운드가 없습니다.</p>}
        {history.length > 0 && (
          <ul style={{ margin: "6px 0", paddingLeft: 20 }}>
            {history.map((h, i) => (
              <li key={i} className="muted">
                {new Date(h.timestamp).toLocaleString()} · {h.fromLevel}→{h.toLevel}단계 ({h.direction}) · {h.correctCount}/{h.totalCount} 정답
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <strong>최근 정답/오답 이력 (최대 20개)</strong>
        {answerLog.length === 0 && <p className="muted">아직 푼 문제가 없습니다.</p>}
        {answerLog.length > 0 && (
          <ul style={{ margin: "6px 0", paddingLeft: 20 }}>
            {answerLog.map((a, i) => (
              <li key={i} className="muted">
                {new Date(a.timestamp).toLocaleString()} · {a.level}단계 ·{" "}
                <span className={a.correct ? "tag good" : "tag bad"}>{a.correct ? "정답" : "오답"}</span>{" "}
                {a.pointsEarned > 0 && `(+${a.pointsEarned}점)`}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
