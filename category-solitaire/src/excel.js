// 엑셀(.xlsx) 읽기·검사·내려받기
// 양식: A열 카테고리 / B열 단어 / C열 해설(선택), 시트 하나 = 게임 세트 하나(시트 이름 = 세트 이름)
import readXlsxFile from 'read-excel-file/browser';
import writeXlsxFile from 'write-excel-file/browser';

// 검사 기준 (필요하면 숫자만 바꾸면 됩니다)
export const LIMITS = {
  maxWordLength: 40,        // 단어(카드) 최대 글자 수 — 넘으면 오류
  longWordWarn: 20,         // 이보다 길면 카드 글자가 많이 작아진다는 주의
  maxCategoryLength: 20,    // 카테고리 이름 최대 글자 수 — 넘으면 오류
  minCategories: 2,         // 카테고리 최소 개수
  manyCategoriesWarn: 8,    // 이보다 많으면 화면에서 가로 스크롤이 생긴다는 주의
  manyWordsWarn: 60,        // 이보다 많으면 한 판이 길어진다는 주의
  maxExplanationLength: 300,
  maxFileSizeMB: 5,
};

const HEADER = ['카테고리', '단어', '해설(선택)'];

// 셀 값을 깔끔한 문자열로: 숫자·날짜도 글자로 바꾸고, 앞뒤 공백 제거,
// 맥에서 만든 파일의 한글 자모 분리(NFD)를 합친다(NFC)
function cellText(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) v = v.toLocaleDateString('ko-KR');
  return String(v).normalize('NFC').replace(/\s+/g, ' ').trim();
}

// 첫 줄이 제목 줄(카테고리/단어)인지
function isHeaderRow(cells) {
  return /카테고리|category|kategorie/i.test(cells[0]) || /단어|word|wort/i.test(cells[1]);
}

// 시트 하나를 검사해 { name, rows, errors, warnings, categories } 로 돌려준다
export function validateSheet(name, data) {
  const setName = cellText(name) || '이름 없는 세트';
  const rows = [];
  const errors = [];
  const warnings = [];
  const seen = new Map(); // 소문자 단어 → { row, category }
  let headerChecked = false;

  data.forEach((raw, i) => {
    const rowNo = i + 1; // 엑셀의 행 번호
    const cells = [cellText(raw[0]), cellText(raw[1]), cellText(raw[2])];
    if (!cells[0] && !cells[1] && !cells[2]) return; // 빈 줄은 건너뜀
    if (!headerChecked) {
      headerChecked = true;
      if (isHeaderRow(cells)) return;
    }
    const [category, word, explanation] = cells;

    if (!category && !word) return errors.push(`${rowNo}행: 해설만 있고 카테고리와 단어가 비어 있어요.`);
    if (!category) return errors.push(`${rowNo}행: ‘${word}’의 카테고리(A열)가 비어 있어요.`);
    if (!word) return errors.push(`${rowNo}행: ‘${category}’의 단어(B열)가 비어 있어요.`);
    if (word.length > LIMITS.maxWordLength) {
      errors.push(`${rowNo}행: ‘${word.slice(0, 15)}…’ 단어가 너무 길어요 (${LIMITS.maxWordLength}자 이하).`);
    } else if (word.length > LIMITS.longWordWarn) {
      warnings.push(`${rowNo}행: ‘${word}’ — 길어서 카드 글자가 작게 보여요.`);
    }
    if (category.length > LIMITS.maxCategoryLength) {
      errors.push(`${rowNo}행: 카테고리 ‘${category.slice(0, 15)}…’ 이름이 너무 길어요 (${LIMITS.maxCategoryLength}자 이하).`);
    }
    if (explanation.length > LIMITS.maxExplanationLength) {
      warnings.push(`${rowNo}행: 해설이 ${LIMITS.maxExplanationLength}자를 넘어 결과 화면에서 길게 보여요.`);
    }

    const key = word.toLocaleLowerCase('ko-KR');
    const prev = seen.get(key);
    if (prev) {
      errors.push(prev.category === category
        ? `${rowNo}행: ‘${word}’ — ${prev.row}행과 같은 단어예요. 한 줄을 지워 주세요.`
        : `${rowNo}행: ‘${word}’ — ${prev.row}행에도 있어요 (카테고리 ‘${prev.category}’ / ‘${category}’). 정답이 둘이 되니 하나만 남겨 주세요.`);
      return;
    }
    seen.set(key, { row: rowNo, category });
    rows.push({ category, word, explanation });
  });

  // 카테고리별 단어 수
  const counts = new Map();
  for (const r of rows) counts.set(r.category, (counts.get(r.category) || 0) + 1);
  const categories = [...counts].map(([category, count]) => ({
    category, count, words: rows.filter((r) => r.category === category).map((r) => r.word),
  }));

  if (!rows.length && !errors.length) errors.push('단어가 하나도 없어요.');
  else if (categories.length < LIMITS.minCategories) errors.push(`카테고리가 ${LIMITS.minCategories}개 이상 있어야 분류 게임이 돼요.`);
  if (categories.length > LIMITS.manyCategoriesWarn) warnings.push(`카테고리가 ${categories.length}개예요. 휴대폰에서는 카테고리 칸을 옆으로 밀어서 봐야 해요.`);
  if (rows.length > LIMITS.manyWordsWarn) warnings.push(`단어가 ${rows.length}개예요. 한 판이 오래 걸릴 수 있어요.`);
  for (const c of categories) {
    if (c.count === 1) warnings.push(`카테고리 ‘${c.category}’에 단어가 1개뿐이에요.`);
    if (seen.has(c.category.toLocaleLowerCase('ko-KR'))) warnings.push(`‘${c.category}’ — 카테고리 이름과 같은 단어가 있어 헷갈릴 수 있어요.`);
  }

  // 오류가 있으면 오류부터 고치도록 주의 사항은 숨긴다
  return { name: setName, rows, errors, warnings: errors.length ? [] : warnings, categories };
}

// 업로드한 파일을 읽어 시트별 검사 결과 목록을 돌려준다
export async function readWorkbook(file) {
  if (!/\.xlsx$/i.test(file.name)) {
    throw new Error('.xlsx 파일만 올릴 수 있어요. 엑셀에서 [다른 이름으로 저장] → [Excel 통합 문서(*.xlsx)]로 저장해 주세요.');
  }
  if (file.size > LIMITS.maxFileSizeMB * 1024 * 1024) {
    throw new Error(`파일이 너무 커요 (${LIMITS.maxFileSizeMB}MB 이하).`);
  }
  let sheets;
  try {
    sheets = await readXlsxFile(file);
  } catch {
    throw new Error('엑셀 파일을 읽지 못했어요. 파일이 손상되었거나 암호가 걸려 있지 않은지 확인해 주세요.');
  }
  const results = sheets
    .filter((s) => s.data.some((row) => row.some((v) => cellText(v))))
    .map((s) => validateSheet(s.sheet, s.data));
  if (!results.length) throw new Error('내용이 있는 시트가 없어요.');

  // 같은 파일 안에서 시트 이름이 겹치는지
  const names = new Set();
  for (const r of results) {
    if (names.has(r.name)) r.errors.push(`같은 이름의 시트가 또 있어요. 시트 이름을 다르게 바꿔 주세요.`);
    names.add(r.name);
  }
  return results;
}

// ---------- 내려받기 ----------

const COLUMNS = [{ width: 18 }, { width: 24 }, { width: 60 }];
const headerRow = () => HEADER.map((value) => ({ value, fontWeight: 'bold', backgroundColor: '#DCE6F7' }));

// 엑셀 시트 이름 규칙: 31자 이하, \ / ? * [ ] : 사용 불가
function safeSheetName(name, used) {
  let base = name.replace(/[\\/?*[\]:]/g, ' ').trim().slice(0, 31) || '세트';
  let n = 2;
  let out = base;
  while (used.has(out)) out = base.slice(0, 28) + ' ' + n++;
  used.add(out);
  return out;
}

// 만든 파일을 원하는 이름으로 내려받게 한다
export function saveBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// 빈 양식
export async function downloadTemplate() {
  const blob = await writeXlsxFile([
    { sheet: '세트1', data: [headerRow()], columns: COLUMNS, stickyRowsCount: 1 },
  ]).toBlob();
  saveBlob(blob, '카테고리솔리테어_빈양식.xlsx');
}

// 게임 세트들을 엑셀로 (세트마다 시트 하나)
export async function downloadSets(sets, fileName) {
  const used = new Set();
  const blob = await writeXlsxFile(sets.map((set) => ({
    sheet: safeSheetName(set.name, used),
    data: [headerRow(), ...set.rows.map((r) => [
      { value: r.category }, { value: r.word }, { value: r.explanation || '', wrap: true },
    ])],
    columns: COLUMNS,
    stickyRowsCount: 1,
  }))).toBlob();
  saveBlob(blob, fileName.replace(/[\\/:*?"<>|]/g, '_'));
}
