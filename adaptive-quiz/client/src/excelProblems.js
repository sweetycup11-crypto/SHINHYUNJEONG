import ExcelJS from "exceljs/dist/exceljs.bare.min.js";

const HEADERS = ["유형", "단계", "단원", "문제", "보기1", "보기2", "보기3", "보기4", "보기5", "정답", "해설", "힌트1", "힌트2", "ID"];

async function triggerXlsxDownload(wb, filename) {
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const TEMPLATE_GUIDE_LINES = [
  ["문제 업로드 안내"],
  [""],
  ["유형: '진단평가' 또는 '형성평가' 중 하나를 입력하세요."],
  ["단계: 1~10 사이의 정수를 입력하세요 (문제 난이도)."],
  ["단원: 선택 사항입니다. 같은 과목 안에서 문제를 묶어보고 싶을 때 단원 이름을 자유롭게 적으세요(예: '1단원: 몰과 화학양론'). 비워두면 단원 없이 등록됩니다."],
  ["문제: 문제 지문을 입력하세요."],
  ["보기1~보기4: 필수 선택지입니다. 보기5는 선택 사항입니다(5지선다일 때만 입력)."],
  ["정답: 정답 선택지를 A, B, C, D, E 중 하나로 입력하거나, 몇 번째 보기인지 숫자(1~5)로 입력하세요."],
  ["해설: 학생이 제출한 뒤 보여줄 해설입니다."],
  ["힌트1, 힌트2: 선택 사항입니다 (최대 2개, 비워두면 힌트 없이 등록됩니다)."],
  ["ID: 새 문제를 추가할 때는 비워두세요. 이 칸이 비어 있으면 새 문제로 추가됩니다."],
  [""],
  ["'문제' 시트의 2행부터 실제 데이터를 입력한 뒤, 교사 모드 > 문제 관리 > 엑셀 업로드에서 이 파일을 업로드하세요."],
];

export async function downloadProblemTemplate() {
  const wb = new ExcelJS.Workbook();

  const ws = wb.addWorksheet("문제");
  ws.addRow(HEADERS);
  ws.addRow([
    "형성평가",
    3,
    "1단원: 몰과 화학양론",
    "다음 중 산소 원소를 나타내는 원소기호는?",
    "O",
    "Os",
    "So",
    "OX",
    "",
    "A",
    "산소의 원소기호는 O이다.",
    "알파벳 한 글자로 이루어진 원소기호를 찾아보세요.",
    "",
    "",
  ]);
  ws.columns.forEach((col) => {
    col.width = 18;
  });

  const guideWs = wb.addWorksheet("설명");
  guideWs.addRows(TEMPLATE_GUIDE_LINES);
  guideWs.getColumn(1).width = 90;

  await triggerXlsxDownload(wb, "문제_업로드_양식.xlsx");
}

const EXPORT_GUIDE_LINES = [
  ["문제 수정 안내"],
  [""],
  ["이 파일은 현재 등록된 문제를 내려받은 것입니다. 맨 오른쪽 'ID' 열은 지우거나 바꾸지 마세요."],
  ["내용을 수정한 뒤 그대로 업로드하면, 새 문제로 추가되지 않고 해당 ID의 기존 문제가 수정됩니다."],
  ["행을 통째로 지우고 업로드해도 그 문제가 자동으로 삭제되지는 않습니다 — 삭제는 화면에서 '삭제' 버튼으로 해주세요."],
  ["새 문제를 추가하고 싶으면 맨 아래에 새 행을 추가하고 ID 칸은 비워두세요."],
  [""],
  ["나머지 컬럼(유형/단계/문제/보기/정답/해설/힌트) 작성 방법은 업로드 양식 파일의 '설명' 시트를 참고하세요."],
];

export async function downloadProblemsExport(problems) {
  const wb = new ExcelJS.Workbook();

  const ws = wb.addWorksheet("문제");
  ws.addRow(HEADERS);
  for (const p of problems) {
    ws.addRow([
      p.type === "diagnostic" ? "진단평가" : "형성평가",
      p.level,
      p.unit || "",
      p.stem,
      p.choices[0] || "",
      p.choices[1] || "",
      p.choices[2] || "",
      p.choices[3] || "",
      p.choices[4] || "",
      String.fromCharCode(65 + p.answerIndex),
      p.explanation || "",
      p.hints?.[0] || "",
      p.hints?.[1] || "",
      p.id,
    ]);
  }
  ws.columns.forEach((col) => {
    col.width = 18;
  });

  const guideWs = wb.addWorksheet("설명");
  guideWs.addRows(EXPORT_GUIDE_LINES);
  guideWs.getColumn(1).width = 90;

  await triggerXlsxDownload(wb, "문제_내보내기.xlsx");
}

function normalizeType(value) {
  const s = String(value ?? "").trim();
  if (["진단평가", "진단", "diagnostic"].includes(s)) return "diagnostic";
  if (["형성평가", "형성", "formative"].includes(s)) return "formative";
  return null;
}

function parseAnswerIndex(value, choiceCount) {
  const s = String(value ?? "").trim().toUpperCase();
  if (/^[A-E]$/.test(s)) {
    const idx = s.charCodeAt(0) - 65;
    return idx < choiceCount ? idx : null;
  }
  const n = Number(s);
  if (Number.isInteger(n) && n >= 1 && n <= choiceCount) return n - 1;
  return null;
}

function cellText(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "object" && "text" in value) return String(value.text).trim();
  if (typeof value === "object" && "result" in value) return String(value.result).trim();
  return String(value).trim();
}

// Reads an .xlsx File and returns { payloads, errors } where payloads are
// ready to send to the create/update APIs (still missing subjectId, added by
// caller). Each payload carries an `id` when the row's ID column was filled
// in (i.e. it came from an export) so the caller can update instead of
// create. Errors reference the original spreadsheet row number.
export async function parseProblemExcel(file) {
  const wb = new ExcelJS.Workbook();
  const buffer = await file.arrayBuffer();
  await wb.xlsx.load(buffer);

  const ws = wb.worksheets[0];
  if (!ws) return { payloads: [], errors: [{ row: null, error: "시트를 찾을 수 없습니다." }] };

  const headerRow = ws.getRow(1);
  const headerIndex = {};
  headerRow.eachCell((cell, colNumber) => {
    headerIndex[cellText(cell.value)] = colNumber;
  });

  const get = (row, key) => (headerIndex[key] ? cellText(row.getCell(headerIndex[key]).value) : "");

  const payloads = [];
  const errors = [];

  for (let rowNumber = 2; rowNumber <= ws.rowCount; rowNumber++) {
    const row = ws.getRow(rowNumber);
    const stem = get(row, "문제");
    const typeRaw = get(row, "유형");
    const levelRaw = get(row, "단계");
    const id = get(row, "ID") || null;
    if (!stem && !typeRaw && !levelRaw && !id) continue; // skip fully blank rows

    const type = normalizeType(typeRaw);
    const level = Number(levelRaw);
    const unit = get(row, "단원");
    const choices = ["보기1", "보기2", "보기3", "보기4", "보기5"].map((k) => get(row, k)).filter(Boolean);
    const answerIndex = parseAnswerIndex(get(row, "정답"), choices.length);
    const explanation = get(row, "해설");
    const hints = ["힌트1", "힌트2"].map((k) => get(row, k)).filter(Boolean);

    if (!type) {
      errors.push({ row: rowNumber, error: "유형을 '진단평가' 또는 '형성평가'로 입력해주세요." });
      continue;
    }
    if (!Number.isInteger(level) || level < 1 || level > 10) {
      errors.push({ row: rowNumber, error: "단계는 1~10 사이의 정수여야 합니다." });
      continue;
    }
    if (!stem) {
      errors.push({ row: rowNumber, error: "문제 내용이 비어 있습니다." });
      continue;
    }
    if (choices.length < 4) {
      errors.push({ row: rowNumber, error: "보기(선택지)는 최소 4개 필요합니다." });
      continue;
    }
    if (answerIndex === null) {
      errors.push({ row: rowNumber, error: "정답은 A~E 또는 보기 번호(1~5)로 입력해주세요." });
      continue;
    }

    payloads.push({
      row: rowNumber,
      id,
      payload: { type, level, unit, stem, choices, answerIndex, explanation, hints },
    });
  }

  return { payloads, errors };
}
