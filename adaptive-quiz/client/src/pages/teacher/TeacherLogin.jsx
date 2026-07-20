import { useState } from "react";
import { api } from "../../api.js";

export default function TeacherLogin({ onSuccess }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!password) return;
    setBusy(true);
    setError("");
    try {
      await api.teacherLogin(password);
      onSuccess();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card" style={{ maxWidth: 380, margin: "40px auto" }}>
      <h2>교사 모드 로그인</h2>
      <p className="muted">교사 비밀번호를 입력하세요.</p>
      {error && <div className="error-box">{error}</div>}
      <form className="stack" onSubmit={handleSubmit}>
        <div>
          <label htmlFor="teacher-password">비밀번호</label>
          <input
            id="teacher-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            required
          />
        </div>
        <button className="btn" type="submit" disabled={busy || !password}>
          {busy ? "확인하는 중..." : "입장하기"}
        </button>
      </form>
    </div>
  );
}
