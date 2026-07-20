import { useState } from "react";
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

  return (
    <div>
      <div className="tabs">
        {TABS.map((t) => (
          <button key={t.key} className={tab === t.key ? "active" : ""} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === "subjects" && <SubjectManager />}
      {tab === "problems" && <ProblemManager />}
      {tab === "students" && <StudentOverview />}
    </div>
  );
}
