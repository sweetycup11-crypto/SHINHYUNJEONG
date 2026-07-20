import { getState, setState, newId, resetAll } from "./db.js";
import { subjectsSeed } from "./seedContent.js";

export async function seedDatabase() {
  await resetAll();
  const state = getState();
  const now = new Date().toISOString();

  for (const subj of subjectsSeed) {
    const subjectId = newId();
    state.subjects.push({ id: subjectId, name: subj.name, createdAt: now });

    for (const p of subj.diagnostic) {
      state.problems.push({
        id: newId(),
        subjectId,
        type: "diagnostic",
        level: p.level,
        stem: p.stem,
        choices: p.choices,
        answerIndex: p.answerIndex,
        explanation: p.explanation,
        hints: p.hints,
        createdAt: now,
      });
    }
    for (const p of subj.formative) {
      state.problems.push({
        id: newId(),
        subjectId,
        type: "formative",
        level: p.level,
        stem: p.stem,
        choices: p.choices,
        answerIndex: p.answerIndex,
        explanation: p.explanation,
        hints: p.hints,
        createdAt: now,
      });
    }
  }

  await setState(state);
  console.log(`Seeded ${state.subjects.length} subjects and ${state.problems.length} problems.`);
}

// Only seed when the database is completely empty (fresh disk / first boot).
// Safe to call on every server start: never overwrites existing subjects,
// problems, or student progress.
export async function seedIfEmpty() {
  const state = getState();
  if (state.subjects.length > 0) return false;
  await seedDatabase();
  return true;
}

// Allow `node seed.js` to keep working as a manual, explicit reset+reseed.
if (import.meta.url === `file://${process.argv[1]}`) {
  seedDatabase();
}
