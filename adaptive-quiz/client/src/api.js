const BASE = "/api";

async function request(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `요청에 실패했습니다 (${res.status})`);
  return data;
}

function qs(params) {
  const usp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null) usp.set(k, v);
  });
  const s = usp.toString();
  return s ? `?${s}` : "";
}

export const api = {
  // subjects
  listSubjects: () => request("GET", "/subjects"),
  createSubject: (name) => request("POST", "/subjects", { name }),
  deleteSubject: (id) => request("DELETE", `/subjects/${id}`),

  // problems
  listProblems: (params) => request("GET", "/problems" + qs(params)),
  createProblem: (problem) => request("POST", "/problems", problem),
  bulkCreateProblems: (problems) => request("POST", "/problems/bulk", { problems }),
  updateProblem: (id, patch) => request("PUT", `/problems/${id}`, patch),
  deleteProblem: (id) => request("DELETE", `/problems/${id}`),

  // student session
  startStudent: (name, subjectId) => request("POST", "/students/start", { name, subjectId }),
  getProgress: (studentId, subjectId) => request("GET", "/progress" + qs({ studentId, subjectId })),

  // diagnostic
  getDiagnosticQuestions: (subjectId) => request("GET", "/diagnostic/questions" + qs({ subjectId })),
  submitDiagnostic: (studentId, subjectId, answers) =>
    request("POST", "/diagnostic/submit", { studentId, subjectId, answers }),

  // formative
  getNextRound: (studentId, subjectId) => request("GET", "/formative/next" + qs({ studentId, subjectId })),
  requestHint: (problemId, hintIndex) => request("POST", "/formative/hint", { problemId, hintIndex }),
  submitAnswer: (roundId, problemId, selectedIndex) =>
    request("POST", "/formative/answer", { roundId, problemId, selectedIndex }),

  // teacher
  getTeacherStudents: (subjectId) => request("GET", "/teacher/students" + qs({ subjectId })),
  resetStudent: (studentId, subjectId) => request("POST", "/teacher/reset-student", { studentId, subjectId }),
};
