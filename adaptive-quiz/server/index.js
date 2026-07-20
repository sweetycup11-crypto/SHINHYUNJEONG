import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { getState, setState, newId } from "./db.js";
import {
  computeStartLevel,
  nextLevel,
  roundDirection,
  pointsForCorrectAnswer,
  LEVEL_UP_BONUS,
} from "./scoring.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 4000;

// ---------- helpers ----------

function slugify(name) {
  const slug = String(name || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
  return slug || newId();
}

function pickRandom(arr, n) {
  const pool = [...arr];
  const picked = [];
  while (pool.length && picked.length < n) {
    const idx = Math.floor(Math.random() * pool.length);
    picked.push(pool.splice(idx, 1)[0]);
  }
  return picked;
}

function publicProblem(p) {
  return { id: p.id, level: p.level, stem: p.stem, choices: p.choices };
}

function findOrCreateStudent(state, name) {
  const id = slugify(name);
  let student = state.students.find((s) => s.id === id);
  if (!student) {
    student = { id, name: String(name).trim(), createdAt: new Date().toISOString() };
    state.students.push(student);
  }
  return student;
}

function findOrCreateProgress(state, studentId, subjectId) {
  let progress = state.formativeProgress.find(
    (p) => p.studentId === studentId && p.subjectId === subjectId
  );
  if (!progress) {
    progress = {
      id: newId(),
      studentId,
      subjectId,
      currentLevel: 1,
      score: 0,
      levelHistory: [],
      answerLog: [],
    };
    state.formativeProgress.push(progress);
  }
  return progress;
}

function getDiagnosticResult(state, studentId, subjectId) {
  return state.diagnosticResults.find(
    (d) => d.studentId === studentId && d.subjectId === subjectId
  );
}

// Choose the 4 problems for a formative round according to the spec:
// level 1  -> 4 from level 1
// level 10 -> 4 from level 10
// otherwise -> 2 from (level-1), 2 from (level or level+1)
function buildRoundProblemPool(state, subjectId, level) {
  const formative = state.problems.filter(
    (p) => p.subjectId === subjectId && p.type === "formative"
  );
  const byLevel = (lv) => formative.filter((p) => p.level === lv);

  if (level === 1) return pickRandom(byLevel(1), 4);
  if (level === 10) return pickRandom(byLevel(10), 4);

  const lower = pickRandom(byLevel(level - 1), 2);
  const upperPool = [...byLevel(level), ...byLevel(level + 1)];
  const upper = pickRandom(upperPool, 2);
  return [...lower, ...upper];
}

// ---------- Subjects ----------

app.get("/api/subjects", (req, res) => {
  const state = getState();
  res.json(state.subjects);
});

app.post("/api/subjects", async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: "과목 이름을 입력하세요." });
  const state = getState();
  const subject = { id: newId(), name: name.trim(), createdAt: new Date().toISOString() };
  state.subjects.push(subject);
  await setState(state);
  res.status(201).json(subject);
});

app.delete("/api/subjects/:id", async (req, res) => {
  const state = getState();
  const { id } = req.params;
  state.subjects = state.subjects.filter((s) => s.id !== id);
  state.problems = state.problems.filter((p) => p.subjectId !== id);
  state.diagnosticResults = state.diagnosticResults.filter((d) => d.subjectId !== id);
  state.formativeProgress = state.formativeProgress.filter((p) => p.subjectId !== id);
  state.formativeRounds = state.formativeRounds.filter((r) => r.subjectId !== id);
  await setState(state);
  res.status(204).end();
});

// ---------- Problems (teacher CRUD + bulk upload) ----------

app.get("/api/problems", (req, res) => {
  const { subjectId, type, level } = req.query;
  const state = getState();
  let items = state.problems;
  if (subjectId) items = items.filter((p) => p.subjectId === subjectId);
  if (type) items = items.filter((p) => p.type === type);
  if (level) items = items.filter((p) => p.level === Number(level));
  res.json(items);
});

function validateProblemBody(body) {
  const { subjectId, type, level, stem, choices, answerIndex, explanation, hints } = body;
  if (!subjectId || !type || !stem || !Array.isArray(choices) || choices.length < 4) {
    return "subjectId, type, stem, choices(4개 이상)는 필수입니다.";
  }
  if (!["diagnostic", "formative"].includes(type)) return "type은 diagnostic 또는 formative여야 합니다.";
  if (!Number.isInteger(level) || level < 1 || level > 10) return "level은 1~10 사이의 정수여야 합니다.";
  if (!Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex >= choices.length) {
    return "answerIndex가 유효하지 않습니다.";
  }
  if (hints && (!Array.isArray(hints) || hints.length > 2)) return "hints는 최대 2개의 배열이어야 합니다.";
  return null;
}

app.post("/api/problems", async (req, res) => {
  const error = validateProblemBody(req.body);
  if (error) return res.status(400).json({ error });
  const state = getState();
  const { subjectId, type, level, stem, choices, answerIndex, explanation, hints } = req.body;
  if (!state.subjects.find((s) => s.id === subjectId)) {
    return res.status(400).json({ error: "존재하지 않는 과목입니다." });
  }
  const problem = {
    id: newId(),
    subjectId,
    type,
    level,
    stem,
    choices,
    answerIndex,
    explanation: explanation || "",
    hints: hints || [],
    createdAt: new Date().toISOString(),
  };
  state.problems.push(problem);
  await setState(state);
  res.status(201).json(problem);
});

app.post("/api/problems/bulk", async (req, res) => {
  const { problems } = req.body;
  if (!Array.isArray(problems)) return res.status(400).json({ error: "problems 배열이 필요합니다." });
  const state = getState();
  const created = [];
  const errors = [];
  problems.forEach((p, idx) => {
    const err = validateProblemBody(p);
    if (err) {
      errors.push({ index: idx, error: err });
      return;
    }
    if (!state.subjects.find((s) => s.id === p.subjectId)) {
      errors.push({ index: idx, error: "존재하지 않는 과목입니다." });
      return;
    }
    const problem = {
      id: newId(),
      subjectId: p.subjectId,
      type: p.type,
      level: p.level,
      stem: p.stem,
      choices: p.choices,
      answerIndex: p.answerIndex,
      explanation: p.explanation || "",
      hints: p.hints || [],
      createdAt: new Date().toISOString(),
    };
    state.problems.push(problem);
    created.push(problem);
  });
  await setState(state);
  res.status(created.length ? 201 : 400).json({ created, errors });
});

app.put("/api/problems/:id", async (req, res) => {
  const state = getState();
  const problem = state.problems.find((p) => p.id === req.params.id);
  if (!problem) return res.status(404).json({ error: "문제를 찾을 수 없습니다." });
  const merged = { ...problem, ...req.body, id: problem.id, subjectId: problem.subjectId };
  const error = validateProblemBody(merged);
  if (error) return res.status(400).json({ error });
  Object.assign(problem, {
    type: merged.type,
    level: merged.level,
    stem: merged.stem,
    choices: merged.choices,
    answerIndex: merged.answerIndex,
    explanation: merged.explanation || "",
    hints: merged.hints || [],
  });
  await setState(state);
  res.json(problem);
});

app.delete("/api/problems/:id", async (req, res) => {
  const state = getState();
  state.problems = state.problems.filter((p) => p.id !== req.params.id);
  await setState(state);
  res.status(204).end();
});

// ---------- Student session ----------

app.post("/api/students/start", async (req, res) => {
  const { name, subjectId } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: "이름(또는 학번)을 입력하세요." });
  if (!subjectId) return res.status(400).json({ error: "과목을 선택하세요." });
  const state = getState();
  if (!state.subjects.find((s) => s.id === subjectId)) {
    return res.status(400).json({ error: "존재하지 않는 과목입니다." });
  }
  const student = findOrCreateStudent(state, name);
  const diagnostic = getDiagnosticResult(state, student.id, subjectId);
  await setState(state);
  res.json({ student, diagnosticCompleted: !!diagnostic });
});

app.get("/api/progress", (req, res) => {
  const { studentId, subjectId } = req.query;
  if (!studentId || !subjectId) return res.status(400).json({ error: "studentId, subjectId가 필요합니다." });
  const state = getState();
  const diagnostic = getDiagnosticResult(state, studentId, subjectId) || null;
  const formative = state.formativeProgress.find(
    (p) => p.studentId === studentId && p.subjectId === subjectId
  ) || null;
  res.json({ diagnostic, formative });
});

// ---------- Diagnostic ----------

app.get("/api/diagnostic/questions", (req, res) => {
  const { subjectId } = req.query;
  const state = getState();
  const items = state.problems.filter((p) => p.subjectId === subjectId && p.type === "diagnostic");
  res.json(items.map(publicProblem));
});

app.post("/api/diagnostic/submit", async (req, res) => {
  const { studentId, subjectId, answers } = req.body;
  if (!studentId || !subjectId || !Array.isArray(answers)) {
    return res.status(400).json({ error: "studentId, subjectId, answers가 필요합니다." });
  }
  const state = getState();
  const pool = state.problems.filter((p) => p.subjectId === subjectId && p.type === "diagnostic");
  if (!pool.length) return res.status(400).json({ error: "진단평가 문제가 없습니다." });

  let correct = 0;
  const gradedAnswers = answers.map((a) => {
    const problem = pool.find((p) => p.id === a.problemId);
    const isCorrect = !!problem && problem.answerIndex === a.selectedIndex;
    if (isCorrect) correct += 1;
    return { problemId: a.problemId, selectedIndex: a.selectedIndex, correct: isCorrect };
  });

  const startLevel = computeStartLevel(correct, pool.length);

  const existingIdx = state.diagnosticResults.findIndex(
    (d) => d.studentId === studentId && d.subjectId === subjectId
  );
  const result = {
    id: newId(),
    studentId,
    subjectId,
    total: pool.length,
    correct,
    startLevel,
    answers: gradedAnswers,
    completedAt: new Date().toISOString(),
  };
  if (existingIdx >= 0) state.diagnosticResults[existingIdx] = result;
  else state.diagnosticResults.push(result);

  const progress = findOrCreateProgress(state, studentId, subjectId);
  progress.currentLevel = startLevel;

  await setState(state);
  res.json(result);
});

// ---------- Formative ----------

app.get("/api/formative/next", async (req, res) => {
  const { studentId, subjectId } = req.query;
  if (!studentId || !subjectId) return res.status(400).json({ error: "studentId, subjectId가 필요합니다." });
  const state = getState();

  const diagnostic = getDiagnosticResult(state, studentId, subjectId);
  if (!diagnostic) return res.status(400).json({ error: "진단평가를 먼저 완료해야 합니다." });

  const progress = findOrCreateProgress(state, studentId, subjectId);

  let round = state.formativeRounds.find(
    (r) => r.studentId === studentId && r.subjectId === subjectId && !r.completed
  );

  if (!round) {
    const chosen = buildRoundProblemPool(state, subjectId, progress.currentLevel);
    if (chosen.length < 4) {
      return res.status(400).json({
        error: `현재 ${progress.currentLevel}단계 라운드를 구성할 문제가 부족합니다. 교사에게 문제 추가를 요청하세요.`,
      });
    }
    round = {
      id: newId(),
      studentId,
      subjectId,
      level: progress.currentLevel,
      problemIds: chosen.map((p) => p.id),
      answers: {},
      completed: false,
      createdAt: new Date().toISOString(),
    };
    state.formativeRounds.push(round);
    await setState(state);
  }

  const problems = round.problemIds
    .map((id) => state.problems.find((p) => p.id === id))
    .filter(Boolean)
    .map(publicProblem);

  res.json({
    roundId: round.id,
    level: round.level,
    problems,
    answered: Object.keys(round.answers),
  });
});

app.post("/api/formative/hint", (req, res) => {
  const { problemId, hintIndex } = req.body;
  const state = getState();
  const problem = state.problems.find((p) => p.id === problemId);
  if (!problem) return res.status(404).json({ error: "문제를 찾을 수 없습니다." });
  const idx = Number.isInteger(hintIndex) ? hintIndex : 0;
  const hint = problem.hints && problem.hints[idx];
  if (!hint) return res.status(404).json({ error: "더 이상 힌트가 없습니다." });
  res.json({ hint, hintIndex: idx, totalHints: problem.hints.length });
});

app.post("/api/formative/answer", async (req, res) => {
  const { roundId, problemId, selectedIndex } = req.body;
  const state = getState();
  const round = state.formativeRounds.find((r) => r.id === roundId);
  if (!round || round.completed) return res.status(400).json({ error: "유효하지 않은 라운드입니다." });
  if (!round.problemIds.includes(problemId)) return res.status(400).json({ error: "이 라운드의 문제가 아닙니다." });
  if (round.answers[problemId]) return res.status(400).json({ error: "이미 답변한 문제입니다." });

  const problem = state.problems.find((p) => p.id === problemId);
  const correct = problem.answerIndex === selectedIndex;
  round.answers[problemId] = { selectedIndex, correct };

  const progress = findOrCreateProgress(state, round.studentId, round.subjectId);
  let pointsEarned = 0;
  if (correct) pointsEarned = pointsForCorrectAnswer(problem.level);
  progress.score += pointsEarned;
  progress.answerLog.push({
    timestamp: new Date().toISOString(),
    problemId,
    level: problem.level,
    selectedIndex,
    correct,
    pointsEarned,
  });

  let roundSummary = null;
  const answeredCount = Object.keys(round.answers).length;
  if (answeredCount === round.problemIds.length) {
    const correctCount = Object.values(round.answers).filter((a) => a.correct).length;
    const fromLevel = round.level;
    const toLevel = nextLevel(fromLevel, correctCount);
    const direction = roundDirection(fromLevel, toLevel);
    let levelUpBonus = 0;
    if (direction === "up") {
      levelUpBonus = LEVEL_UP_BONUS;
      progress.score += levelUpBonus;
    }
    progress.currentLevel = toLevel;
    const historyEntry = {
      timestamp: new Date().toISOString(),
      fromLevel,
      toLevel,
      direction,
      correctCount,
      totalCount: round.problemIds.length,
      levelUpBonus,
    };
    progress.levelHistory.push(historyEntry);
    round.completed = true;
    roundSummary = historyEntry;
  }

  await setState(state);
  res.json({
    correct,
    correctIndex: problem.answerIndex,
    explanation: problem.explanation,
    pointsEarned,
    totalScore: progress.score,
    roundSummary,
  });
});

// ---------- Teacher dashboard ----------

app.get("/api/teacher/students", (req, res) => {
  const { subjectId } = req.query;
  const state = getState();

  const rows = [];
  for (const student of state.students) {
    const diagResults = state.diagnosticResults.filter(
      (d) => d.studentId === student.id && (!subjectId || d.subjectId === subjectId)
    );
    const progresses = state.formativeProgress.filter(
      (p) => p.studentId === student.id && (!subjectId || p.subjectId === subjectId)
    );
    const subjectIds = new Set([...diagResults.map((d) => d.subjectId), ...progresses.map((p) => p.subjectId)]);
    for (const sid of subjectIds) {
      const subject = state.subjects.find((s) => s.id === sid);
      const diagnostic = diagResults.find((d) => d.subjectId === sid) || null;
      const progress = progresses.find((p) => p.subjectId === sid) || null;
      rows.push({
        studentId: student.id,
        studentName: student.name,
        subjectId: sid,
        subjectName: subject ? subject.name : "(삭제된 과목)",
        diagnostic,
        currentLevel: progress ? progress.currentLevel : null,
        score: progress ? progress.score : 0,
        levelHistory: progress ? progress.levelHistory : [],
        answerLog: progress ? progress.answerLog : [],
      });
    }
  }
  res.json(rows);
});

app.post("/api/teacher/reset-student", async (req, res) => {
  const { studentId, subjectId } = req.body;
  if (!studentId || !subjectId) return res.status(400).json({ error: "studentId, subjectId가 필요합니다." });
  const state = getState();
  state.diagnosticResults = state.diagnosticResults.filter(
    (d) => !(d.studentId === studentId && d.subjectId === subjectId)
  );
  state.formativeProgress = state.formativeProgress.filter(
    (p) => !(p.studentId === studentId && p.subjectId === subjectId)
  );
  state.formativeRounds = state.formativeRounds.filter(
    (r) => !(r.studentId === studentId && r.subjectId === subjectId)
  );
  await setState(state);
  res.status(204).end();
});

// ---------- Static client (production) ----------

const clientDist = path.join(__dirname, "..", "client", "dist");
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get(/^(?!\/api).*/, (req, res) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

app.listen(PORT, () => {
  console.log(`Adaptive quiz server listening on http://localhost:${PORT}`);
});
