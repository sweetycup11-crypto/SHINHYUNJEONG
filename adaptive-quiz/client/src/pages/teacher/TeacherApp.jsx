import { useEffect, useState } from "react";
import { api, clearTeacherPassword, getTeacherPassword } from "../../api.js";
import TeacherLogin from "./TeacherLogin.jsx";
import SubjectManager from "./SubjectManager.jsx";
import ProblemManager from "./ProblemManager.jsx";
import StudentOverview from "./StudentOverview.jsx";

const TABS = [
  { key: "subjects", label: "과목 관리" },
  { key: "problems", label: "문제 관리" },
  { key: "students", label: "학생 현황" },
];

export default function TeacherApp() {
  const [tab, setTab] = useState("subjects");
  const [unlocked, setUnlocked] = useState(null); // null = checking, false = locked, true = unlocked

  useEffect(() => {
    function handleInvalid() {
      setUnlocked(false);
    }
    window.addEventListener("teacher-auth-invalid", handleInvalid);
    return () => window.removeEventListener("teacher-auth-invalid", handleInvalid);
  }, []);

  useEffect(() => {
    const stored = getTeacherPassword();
    if (!stored) {
      setUnlocked(false);
      return;
    }
    api
      .teacherLogin(stored)
      .then(() => setUnlocked(true))
      .catch(() => setUnlocked(false));
  }, []);

  function handleLogout() {
    clearTeacherPassword();
    setUnlocked(false);
  }

  if (unlocked === null) {
    return <p className="muted">확인하는 중...</p>;
  }

  if (!unlocked) {
    return <TeacherLogin onSuccess={() => setUnlocked(true)} />;
  }

  return (
    <div>
      <div className="row between">
        <div className="tabs" style={{ marginBottom: 0, flex: 1 }}>
          {TABS.map((t) => (
            <button key={t.key} className={tab === t.key ? "active" : ""} onClick={() => setTab(t.key)}>
              {t.label}
            </button>
          ))}
        </div>
        <button className="btn secondary sm" onClick={handleLogout}>
          로그아웃
        </button>
      </div>
      {tab === "subjects" && <SubjectManager />}
      {tab === "problems" && <ProblemManager />}
      {tab === "students" && <StudentOverview />}
    </div>
  );
}
