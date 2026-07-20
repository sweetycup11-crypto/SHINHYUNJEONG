import { useEffect, useState } from "react";
import { api } from "../../api.js";

export default function GrowthReport({ studentId, subjectId }) {
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .getProgress(studentId, subjectId)
      .then(setProgress)
      .catch((e) => setError(e.message));
  }, [studentId, subjectId]);

  if (error) return <div className="error-box">{error}</div>;
  if (!progress) return <p className="muted">불러오는 중...</p>;

  const { diagnostic, formative } = progress;
  const currentLevel = formative ? formative.currentLevel : diagnostic ? diagnostic.startLevel : 1;
  const score = formative ? formative.score : 0;
  const answerLog = formative ? formative.answerLog : [];
  const correctCount = answerLog.filter((a) => a.correct).length;
  const accuracy = answerLog.length ? Math.round((correctCount / answerLog.length) * 100) : null;
  const history = formative ? [...formative.levelHistory].reverse() : [];

  return (
    <div className="stack">
      <div className="card">
        <h2>성장 리포트</h2>
        <div className="stat-row">
          {diagnostic && (
            <div className="stat-box">
              <div className="value">{diagnostic.correct} / {diagnostic.total}</div>
              <div className="label">진단평가 결과</div>
            </div>
          )}
          <div className="stat-box">
            <div className="value">{currentLevel}단계</div>
            <div className="label">현재 형성평가 단계</div>
          </div>
          <div className="stat-box">
            <div className="value">{score}점</div>
            <div className="label">누적 성장 점수</div>
          </div>
          {accuracy !== null && (
            <div className="stat-box">
              <div className="value">{accuracy}%</div>
              <div className="label">형성평가 정답률 ({answerLog.length}문제)</div>
            </div>
          )}
        </div>

        <div style={{ marginTop: 20 }}>
          <label>현재 단계 (1~10)</label>
          <div className="level-ladder" style={{ marginTop: 6 }}>
            {Array.from({ length: 10 }, (_, i) => i + 1).map((lv) => (
              <div
                key={lv}
                className={`level-step ${lv === currentLevel ? "current" : lv < currentLevel ? "done" : ""}`}
              >
                {lv}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card">
        <h3>단계 상승/하강 이력</h3>
        {history.length === 0 && <p className="muted">아직 완료한 형성평가 라운드가 없습니다.</p>}
        {history.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>시각</th>
                <th>변화</th>
                <th>이번 라운드 정답</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h, i) => (
                <tr key={i}>
                  <td className="muted">{new Date(h.timestamp).toLocaleString()}</td>
                  <td>
                    {h.fromLevel} → {h.toLevel}단계{" "}
                    {h.direction === "up" && <span className="tag good">상승</span>}
                    {h.direction === "down" && <span className="tag bad">하강</span>}
                    {h.direction === "stay" && <span className="tag warn">유지</span>}
                  </td>
                  <td>{h.correctCount} / {h.totalCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
