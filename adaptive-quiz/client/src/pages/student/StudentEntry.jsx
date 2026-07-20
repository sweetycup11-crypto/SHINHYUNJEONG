import { useEffect, useState } from "react";
import { api } from "../../api.js";

export default function StudentEntry({ onStart }) {
  const [subjects, setSubjects] = useState([]);
  const [name, setName] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api
      .listSubjects()
      .then((list) => {
        setSubjects(list);
        if (list.length) setSubjectId(list[0].id);
      })
      .catch((e) => setError(e.message));
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim() || !subjectId) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await api.startStudent(name.trim(), subjectId);
      const subject = subjects.find((s) => s.id === subjectId);
      onStart({
        studentId: res.student.id,
        studentName: res.student.name,
        subjectId,
        subjectName: subject ? subject.name : "",
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="card" style={{ maxWidth: 420, margin: "40px auto" }}>
      <h2>학생 시작하기</h2>
      <p className="muted">이름(또는 학번)과 과목을 선택하면 진단평가부터 시작합니다.</p>
      {error && <div className="error-box">{error}</div>}
      {subjects.length === 0 && !error && (
        <p className="muted">등록된 과목이 없습니다. 교사 모드에서 과목을 먼저 추가해주세요.</p>
      )}
      <form className="stack" onSubmit={handleSubmit}>
        <div>
          <label htmlFor="name">이름 또는 학번</label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="예: 홍길동"
            required
          />
        </div>
        <div>
          <label htmlFor="subject">과목</label>
          <select id="subject" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <button className="btn" type="submit" disabled={submitting || !subjects.length}>
          {submitting ? "시작하는 중..." : "시작하기"}
        </button>
      </form>
    </div>
  );
}
