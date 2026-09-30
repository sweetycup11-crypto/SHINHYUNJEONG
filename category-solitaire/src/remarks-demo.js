// 체험 모드용 예시 세특 문장 (AI 없이 근거로 틀에 맞춰 만듦 — 화면·형식 확인용)
export function demoRemark(ev, note) {
  const cats = ev.categories.slice(0, 2).join('과 ') || '개념';
  const parts = [`${cats} 개념을 분류하는 활동에 ${ev.attempts > 1 ? '여러 차례 스스로 참여하며' : '참여하며'} 개념의 기준을 확인함.`];
  if (ev.improved.length) parts.push(`처음에 혼동하던 ${ev.improved.slice(0, 2).map((w) => w.split('(')[0]).join(', ')}의 범주를 반복 학습을 통해 바르게 구분하게 됨.`);
  else if (ev.latest_accuracy !== null && ev.first_accuracy !== null && ev.latest_accuracy > ev.first_accuracy) parts.push('반복할수록 분류의 정확도가 높아짐.');
  if (ev.still_confused.length) parts.push(`${ev.still_confused[0].split('(')[0]}에 대한 보완이 기대됨.`);
  if (note) parts.push(note.trim().replace(/\.?$/, '.'));
  return parts.join(' ');
}
