import { useEffect, useState } from "react";
import { api } from "../../api.js";

export default function Diagnostic({ session, onComplete }) {
  const [questions, setQuestions] = useState(null);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    api
      .getDiagnosticQuestions(session.subjectId)
      .then(setQuestions)
      .catch((e) => setError(e.message));
  }, [session.subjectId]);

  if (error) return <div className="error-box">{error}</div>;
  if (!questions) return <p className="muted">진단평가 문제를 불러오는 중...</p>;
  if (questions.length === 0) {
    return (
      <div className="card">
        <p>이 과목에는 아직 진단평가 문제가 없습니다. 교사에게 문의하세요.</p>
      </div>
    );
  }

  if (result) {
    return (
      <div className="card stack">
        <h2>진단평가 완료</h2>
        <div className="stat-row">
          <div className="stat-box">
            <div className="value">{result.correct} / {result.total}</div>
            <div className="label">정답 수</div>
          </div>
          <div className="stat-box">
            <div className="value">{result.startLevel}단계</div>
            <div className="label">형성평가 시작 단계</div>
          </div>
        </div>
        <p className="muted">
          진단평가 결과에 따라 {result.startLevel}단계부터 형성평가를 시작합니다.
        </p>
        <button className="btn" onClick={onComplete}>
          형성평가 시작하기
        </button>
      </div>
    );
  }

  const q = questions[index];
  const selected = answers[q.id];
  const isLast = index === questions.length - 1;

  function selectChoice(choiceIdx) {
    setAnswers((prev) => ({ ...prev, [q.id]: choiceIdx }));
  }

  async function handleNext() {
    if (selected === undefined) return;
    if (!isLast) {
      setIndex((i) => i + 1);
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const payload = questions.map((item) => ({
        problemId: item.id,
        selectedIndex: answers[item.id],
      }));
      const res = await api.submitDiagnostic(session.studentId, session.subjectId, payload);
      setResult(res);
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="card stack">
      <div>
        <div className="row between">
          <span className="tag">진단평가</span>
          <span className="muted">{index + 1} / {questions.length}</span>
        </div>
        <div className="progress-bar" style={{ marginTop: 8 }}>
          <div style={{ width: `${((index + 1) / questions.length) * 100}%` }} />
        </div>
      </div>

      <h3>{q.stem}</h3>
      {q.image && <img src={q.image} alt="문제 이미지" className="problem-image" />}
      <div className="choice-list">
        {q.choices.map((choice, i) => (
          <div
            key={i}
            className={`choice ${selected === i ? "selected" : ""}`}
            onClick={() => selectChoice(i)}
          >
            <span className="choice-letter">{String.fromCharCode(65 + i)}</span>
            <span>{choice}</span>
          </div>
        ))}
      </div>

      {error && <div className="error-box">{error}</div>}

      <button className="btn" onClick={handleNext} disabled={selected === undefined || submitting}>
        {submitting ? "제출하는 중..." : isLast ? "제출하기" : "다음"}
      </button>
    </div>
  );
}
