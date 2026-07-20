// Scoring & level-adaptation rules.
// See README.md "채점/적응형 규칙" section for the rationale behind these numbers.

export const POINTS_PER_CORRECT = 10; // base points for any correct answer
export const LEVEL_BONUS_PER_STEP = 2; // extra points per difficulty level of the problem
export const LEVEL_UP_BONUS = 30; // bonus when a round pushes the student up a level

export function pointsForCorrectAnswer(level) {
  return POINTS_PER_CORRECT + level * LEVEL_BONUS_PER_STEP;
}

// Diagnostic score -> starting formative level.
// ratio of correct answers is scaled onto the 1-10 ladder and rounded,
// then clamped so every student lands somewhere on the ladder.
export function computeStartLevel(correct, total) {
  if (!total) return 1;
  const ratio = correct / total;
  const level = Math.round(ratio * 10);
  return Math.min(10, Math.max(1, level || (ratio > 0 ? 1 : 1)));
}

// Round outcome -> next level.
// 4/4 correct -> level up, <=2/4 correct -> level down, otherwise stay.
// Math.min/max naturally enforce the level 1 / level 10 floor & ceiling rules.
export function nextLevel(currentLevel, correctCount) {
  if (correctCount === 4) return Math.min(10, currentLevel + 1);
  if (correctCount <= 2) return Math.max(1, currentLevel - 1);
  return currentLevel;
}

export function roundDirection(currentLevel, newLevel) {
  if (newLevel > currentLevel) return "up";
  if (newLevel < currentLevel) return "down";
  return "stay";
}
