import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import StudentApp from "./pages/student/StudentApp.jsx";
import TeacherApp from "./pages/teacher/TeacherApp.jsx";

function App() {
  return (
    <div className="app-shell">
      <header className="top-header">
        <div className="brand">과목 자유형 적응 학습</div>
        <nav className="mode-switch">
          <NavLink to="/student" className={({ isActive }) => (isActive ? "active" : "")}>
            학생 모드
          </NavLink>
          <NavLink to="/teacher" className={({ isActive }) => (isActive ? "active" : "")}>
            교사 모드
          </NavLink>
        </nav>
      </header>
      <main className="app-main">
        <Routes>
          <Route path="/" element={<Navigate to="/student" replace />} />
          <Route path="/student" element={<StudentApp />} />
          <Route path="/teacher" element={<TeacherApp />} />
          <Route path="*" element={<Navigate to="/student" replace />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
