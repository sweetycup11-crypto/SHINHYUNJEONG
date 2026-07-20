import { useEffect, useState } from "react";
import { api } from "../../api.js";
import { clearSession, loadSession, saveSession } from "../../session.js";
import StudentEntry from "./StudentEntry.jsx";
import Diagnostic from "./Diagnostic.jsx";
import Formative from "./Formative.jsx";
import GrowthReport from "./GrowthReport.jsx";

export default function StudentApp() {
  const [session, setSession] = useState(() => loadSession());
  const [diagnosticDone, setDiagnosticDone] = useState(null);
  const [view, setView] = useState("quiz"); // 'quiz' | 'report'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!session) return;
    setLoading(true);
    setError("");
    api
      .getProgress(session.studentId, session.subjectId)
      .then((progress) => setDiagnosticDone(!!progress.diagnostic))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [session]);

  function handleStart(newSession) {
    saveSession(newSession);
    setSession(newSession);
    setView("quiz");
  }

  function handleSwitchStudent() {
    clearSession();
    setSession(null);
    setDiagnosticDone(null);
  }

  if (!session) {
    return <StudentEntry onStart={handleStart} />;
  }

  return (
    <div className="stack">
      <div className="card row between">
        <div>
          <strong>{session.studentName}</strong>
          <span className="muted"> · {session.subjectName}</span>
        </div>
        <div className="row">
          <button className="btn secondary sm" onClick={() => setView(view === "report" ? "quiz" : "report")}>
            {view === "report" ? "학습으로 돌아가기" : "성장 리포트 보기"}
          </button>
          <button className="btn secondary sm" onClick={handleSwitchStudent}>
            다른 학생/과목으로
          </button>
        </div>
      </div>

      {error && <div className="error-box">{error}</div>}
      {loading && <p className="muted">불러오는 중...</p>}

      {!loading && view === "report" && (
        <GrowthReport studentId={session.studentId} subjectId={session.subjectId} />
      )}

      {!loading && view === "quiz" && diagnosticDone === false && (
        <Diagnostic
          session={session}
          onComplete={() => setDiagnosticDone(true)}
        />
      )}

      {!loading && view === "quiz" && diagnosticDone === true && (
        <Formative session={session} />
      )}
    </div>
  );
}
