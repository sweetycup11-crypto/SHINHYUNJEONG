import ExcelJS from "exceljs/dist/exceljs.bare.min.js";

const HEADERS = ["유형", "단계", "문제", "보기1", "보기2", "보기3", "보기4", "보기5", "정답", "해설", "힌트1", "힌트2"];

const GUIDE_LINES = [
  ["문제 업로드 안내"],
  [""],
  ["유형: '진단평가' 또는 '형성평가' 중 하나를 입력하세요."],
  ["단계: 1~10 사이의 정수를 입력하세요 (문제 난이도)."],
  ["문제: 문제 지문을 입력하세요."],
  ["보기1~보기4: 필수 선택지입니다. 보기5는 선택 사항입니다(5지선다일 때만 입력)."],
  ["정답: 정답 선택지를 A, B, C, D, E 중 하나로 입력하거나, 몇 번째 보기인지 숫자(1~5)로 입력하세요."],
  ["해설: 학생이 제출한 뒤 보여줄 해설입니다."],
  ["힌트1, 힌트2: 선택 사항입니다 (최대 2개, 비워두면 힌트 없이 등록됩니다)."],
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
  ]);
  ws.columns.forEach((col) => {
    col.width = 18;
  });

  const guideWs = wb.addWorksheet("설명");
  guideWs.addRows(GUIDE_LINES);
  guideWs.getColumn(1).width = 90;

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "문제_업로드_양식.xlsx";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
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
// ready to send to the bulk-create API (still missing subjectId, added by caller)
// and errors reference the original spreadsheet row number for easy fixing.
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
    if (!stem && !typeRaw && !levelRaw) continue; // skip fully blank rows

    const type = normalizeType(typeRaw);
    const level = Number(levelRaw);
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
      payload: { type, level, stem, choices, answerIndex, explanation, hints },
    });
  }

  return { payloads, errors };
}
