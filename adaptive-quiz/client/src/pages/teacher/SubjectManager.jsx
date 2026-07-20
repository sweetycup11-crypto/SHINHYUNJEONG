import { useEffect, useState } from "react";
import { api } from "../../api.js";

export default function SubjectManager() {
  const [subjects, setSubjects] = useState([]);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function refresh() {
    api.listSubjects().then(setSubjects).catch((e) => setError(e.message));
  }

  useEffect(refresh, []);

  async function handleAdd(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError("");
    try {
      await api.createSubject(name.trim());
      setName("");
      refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(id, subjName) {
    if (!confirm(`'${subjName}' 과목과 관련된 모든 문제·학생 기록이 삭제됩니다. 계속할까요?`)) return;
    try {
      await api.deleteSubject(id);
      refresh();
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div className="stack">
      <div className="card">
        <h3>새 과목 추가</h3>
        <form className="row" onSubmit={handleAdd}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <input
              type="text"
              placeholder="예: 물리, 영어 문법 ..."
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <button className="btn" type="submit" disabled={busy}>
            추가
          </button>
        </form>
        {error && <div className="error-box" style={{ marginTop: 10 }}>{error}</div>}
      </div>

      <div className="card">
        <h3>과목 목록</h3>
        {subjects.length === 0 && <p className="muted">등록된 과목이 없습니다.</p>}
        <table>
          <thead>
            <tr>
              <th>과목명</th>
              <th>등록일</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {subjects.map((s) => (
              <tr key={s.id}>
                <td>{s.name}</td>
                <td className="muted">{new Date(s.createdAt).toLocaleDateString()}</td>
                <td>
                  <button className="btn danger sm" onClick={() => handleDelete(s.id, s.name)}>
                    삭제
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
