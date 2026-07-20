import { useEffect, useState } from "react";
import { api } from "../../api.js";

const DIRECTION_LABEL = {
  up: { text: "단계 상승! 🎉", cls: "good" },
  down: { text: "단계 하강", cls: "bad" },
  stay: { text: "단계 유지", cls: "warn" },
};

export default function Formative({ session }) {
  const [round, setRound] = useState(null);
  const [qIndex, setQIndex] = useState(0);
  const [selected, setSelected] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [hints, setHints] = useState([]); // revealed hint texts for current question
  const [hintsExhausted, setHintsExhausted] = useState(false);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    loadRound();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function resetQuestionState() {
    setSelected(null);
    setFeedback(null);
    setHints([]);
    setHintsExhausted(false);
  }

  async function loadRound() {
    setError("");
    setSummary(null);
    resetQuestionState();
    try {
      const r = await api.getNextRound(session.studentId, session.subjectId);
      setRound(r);
      setQIndex(r.answered ? r.answered.length : 0);
    } catch (e) {
      setError(e.message);
    }
  }

  if (error) return <div className="error-box">{error}</div>;
  if (!round) return <p className="muted">형성평가 문제를 불러오는 중...</p>;

  if (summary) {
    const dir = DIRECTION_LABEL[summary.direction];
    return (
      <div className="card stack">
        <h2>라운드 결과</h2>
        <div className="stat-row">
          <div className="stat-box">
            <div className="value">{summary.correctCount} / {summary.totalCount}</div>
            <div className="label">이번 라운드 정답</div>
          </div>
          <div className="stat-box">
            <div className="value">{summary.fromLevel} → {summary.toLevel}단계</div>
            <div className="label">
              <span className={`tag ${dir.cls}`}>{dir.text}</span>
            </div>
          </div>
          {summary.levelUpBonus > 0 && (
            <div className="stat-box">
              <div className="value">+{summary.levelUpBonus}</div>
              <div className="label">단계 상승 보너스 점수</div>
            </div>
          )}
        </div>
        <button className="btn" onClick={loadRound}>
          다음 라운드 시작
        </button>
      </div>
    );
  }

  const q = round.problems[qIndex];
  if (!q) return <p className="muted">라운드를 불러오는 중...</p>;

  async function handleHint() {
    setBusy(true);
    try {
      const res = await api.requestHint(q.id, hints.length);
      setHints((prev) => [...prev, res.hint]);
      if (res.hintIndex + 1 >= res.totalHints) setHintsExhausted(true);
    } catch {
      setHintsExhausted(true);
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmit() {
    if (selected === null) return;
    setBusy(true);
    setError("");
    try {
      const res = await api.submitAnswer(round.roundId, q.id, selected);
      setFeedback(res);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  function handleNextQuestion() {
    if (feedback.roundSummary) {
      setSummary(feedback.roundSummary);
      return;
    }
    setQIndex((i) => i + 1);
    resetQuestionState();
  }

  return (
    <div className="card stack">
      <div>
        <div className="row between">
          <span className="tag">형성평가 · {round.level}단계 라운드</span>
          <span className="muted">문제 {qIndex + 1} / {round.problems.length} · 이 문제는 {q.level}단계</span>
        </div>
        <div className="progress-bar" style={{ marginTop: 8 }}>
          <div style={{ width: `${((qIndex + 1) / round.problems.length) * 100}%` }} />
        </div>
      </div>

      <h3>{q.stem}</h3>
      {q.image && <img src={q.image} alt="문제 이미지" className="problem-image" />}

      <div className="choice-list">
        {q.choices.map((choice, i) => {
          let cls = "";
          if (feedback) {
            if (i === feedback.correctIndex) cls = "correct";
            else if (i === selected) cls = "incorrect";
          } else if (i === selected) {
            cls = "selected";
          }
          return (
            <div
              key={i}
              className={`choice ${cls}`}
              onClick={() => !feedback && setSelected(i)}
            >
              <span className="choice-letter">{String.fromCharCode(65 + i)}</span>
              <span>{choice}</span>
            </div>
          );
        })}
      </div>

      {hints.map((h, i) => (
        <div className="hint-box" key={i}>
          힌트 {i + 1}: {h}
        </div>
      ))}

      {feedback && (
        <div className={`error-box`} style={{
          background: feedback.correct ? "var(--good-bg)" : "var(--bad-bg)",
          color: feedback.correct ? "var(--good)" : "var(--bad)",
          borderColor: feedback.correct ? "var(--good)" : "var(--bad)",
        }}>
          <strong>{feedback.correct ? "정답입니다!" : "오답입니다."}</strong>
          {feedback.pointsEarned > 0 && <span> (+{feedback.pointsEarned}점)</span>}
          <div style={{ marginTop: 6 }}>{feedback.explanation}</div>
        </div>
      )}

      {error && <div className="error-box">{error}</div>}

      <div className="row">
        {!feedback && (
          <button className="btn secondary" onClick={handleHint} disabled={busy || hintsExhausted}>
            힌트 보기
          </button>
        )}
        {!feedback ? (
          <button className="btn" onClick={handleSubmit} disabled={selected === null || busy}>
            제출하기
          </button>
        ) : (
          <button className="btn" onClick={handleNextQuestion}>
            {feedback.roundSummary ? "라운드 결과 보기" : "다음 문제"}
          </button>
        )}
      </div>
    </div>
  );
}
