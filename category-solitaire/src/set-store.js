// 게임 세트 보관함
// ②단계: 이 브라우저에만 임시 저장합니다.
// ③·④단계에서 공유 데이터 저장소(교사 계정별)로 바뀌며, 이 파일의 함수 이름은 그대로 둡니다.
import { SAMPLE_SET } from './sample-set.js';

const KEY = 'cs-sets';

function readAll() {
  try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; }
}
function writeAll(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
    return true;
  } catch {
    return false; // 저장 공간이 없거나 막힌 환경
  }
}

// 샘플 세트 + 저장한 세트
export function listSets() {
  return [{ ...SAMPLE_SET, builtIn: true }, ...readAll()];
}

export function hasSet(name) {
  return name === SAMPLE_SET.name || readAll().some((s) => s.name === name);
}

// 같은 이름이 있으면 덮어쓴다
export function saveSets(sets) {
  const list = readAll();
  for (const set of sets) {
    const item = { name: set.name, rows: set.rows, updatedAt: Date.now() };
    const i = list.findIndex((s) => s.name === set.name);
    if (i >= 0) list[i] = item;
    else list.push(item);
  }
  return writeAll(list);
}

export function deleteSet(name) {
  return writeAll(readAll().filter((s) => s.name !== name));
}
