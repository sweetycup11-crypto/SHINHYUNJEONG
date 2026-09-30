// 생기부(세특) 문장 초안 만들기 — Vercel 서버 함수 (주소: /api/saenggibu)
//
// 보안
//  · Anthropic API 키는 서버 환경 변수 ANTHROPIC_API_KEY 에만 둔다 (VITE_ 로 시작하면 안 됨 → 화면에 노출됨)
//  · 로그인한 교사만 호출 가능: 요청의 Supabase 로그인 토큰을 확인한다
//  · (선택) AI_ALLOWED_EMAIL_DOMAINS="sen.go.kr,korea.kr" 처럼 정하면 그 메일 주소의 교사만 사용
//  · 학생 이름·학번은 받지 않는다. 게임 기록 요약(근거)만 받아 정해진 형식으로 문장을 만든다
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

export const config = { maxDuration: 120 };

export const LIMITS = { students: 5, text: 300, list: 12, subject: 40 };

// AI에게 주는 작성 규칙 (모든 요청에 같음)
export const SYSTEM_PROMPT = `당신은 대한민국 고등학교 교사가 학교생활기록부 '세부능력 및 특기사항(세특)'을 쓸 때 돕는 보조자입니다.
교사가 수업 후 형성평가로 쓰는 '개념 분류 활동'(단어 카드를 알맞은 개념 범주로 분류하는 활동)의 기록 요약을 받아, 학생별 세특 문장 초안을 씁니다.

핵심: 학생의 '성장'이 드러나게 씁니다. 다음 흐름을 따르되, 문장 수가 적으면 압축합니다.
 ① 출발점: 처음에 어려워하거나 헷갈린 점(근거가 없으면 활동에 참여한 모습)
 ② 과정: 성장을 위해 한 노력(여러 차례 반복 참여, 여러 날에 걸친 참여, 오답을 다시 확인함 등 근거에 있는 것만)
 ③ 변화: 달라진 점(헷갈리던 개념을 바로잡음, 분류가 정확해짐, 더 빠르게 해결함 등)
 ④ 기대: 아직 헷갈리는 개념이 있으면 '~에 대한 이해가 더 깊어질 것으로 기대됨'처럼 긍정적으로 마무리
 - 처음부터 정확도가 높았던 학생도 '처음부터 잘함'을 강조하기보다, 일부 헷갈리던 개념을 바로잡으며 이해를 정교하게 다듬은 변화에 초점을 둡니다.
 - '~하게 됨', '~을 바로잡음', '~에 대한 이해가 깊어짐'처럼 변화를 나타내는 표현을 씁니다.

작성 규칙
1. 제공된 근거에 있는 사실만 씁니다. 근거에 없는 활동, 태도, 동기, 진로, 발표·토론 등은 지어내지 않습니다.
2. 주어를 생략한 3인칭 관찰 서술로 쓰고, 문장은 명사형으로 끝냅니다(예: ~함, ~임, ~보임, ~됨).
3. 점수, 등수, 백분율, 횟수 같은 숫자는 쓰지 않습니다. '여러 차례', '정확도가 높아짐'처럼 표현합니다.
4. 범주(카테고리) 이름을 모두 나열하지 않습니다. 활동 주제를 한 구절로 묶어 씁니다(예: '물질의 상태와 성질에 관한 개념'). 과목이 주어지면 참고합니다.
5. 개념 이름은 성장을 보여 주는 핵심 개념 1~3개만 골라 씁니다.
6. 학생 이름, 학번, 게임·앱 이름, 학교 밖 기관·대회·사교육, 부모는 언급하지 않습니다.
7. 과장하지 않습니다(예: '탁월함', '완벽함' 금지).
8. 교사 관찰 메모가 있으면 우선 반영하되, 메모에 없는 사실을 덧붙이지 않습니다.
9. 문장 수는 학생마다 주어진 target_sentences 를 지킵니다. 한 문장은 40~90자 정도로 씁니다.
   다만 근거가 부족해 그 수를 채우려면 지어내야 한다면, 더 짧게 쓰고 evidence_note 에 알립니다.

evidence_note 에는 교사에게 알릴 점을 한 문장으로 씁니다(예: "참여가 1회뿐이라 성장 근거가 부족함"). 알릴 점이 없으면 빈 문자열입니다.`;

// 분량: 자동이면 참여 횟수(성장 근거의 양)에 맞춰 1~4문장, 교사 메모가 있으면 1문장 더 (최대 4)
export function targetSentences(student, length) {
  const a = student.attempts ?? 0;
  let n = a <= 1 ? 1 : a <= 3 ? 2 : a <= 5 ? 3 : 4;
  if (student.teacher_note) n += 1;
  n = Math.min(4, n);
  if (length === 'short') return Math.min(n, 2);
  if (length === 'long') return Math.max(n, 3);
  return n;
}

const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    results: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          text: { type: 'string' },
          evidence_note: { type: 'string' },
        },
        required: ['id', 'text', 'evidence_note'],
        additionalProperties: false,
      },
    },
  },
  required: ['results'],
  additionalProperties: false,
};

// ---------- 입력 검사 (정해진 모양의 값만 통과) ----------

const str = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const num = (v, min, max) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : null;
};
const strList = (v, max = LIMITS.list) => (Array.isArray(v) ? v.slice(0, max).map((x) => str(x, 80)).filter(Boolean) : []);

export function cleanRequest(body) {
  if (!body || typeof body !== 'object') throw new Error('요청 형식이 올바르지 않아요.');
  const students = Array.isArray(body.students) ? body.students : [];
  if (!students.length) throw new Error('학생 기록이 없어요.');
  if (students.length > LIMITS.students) throw new Error(`한 번에 ${LIMITS.students}명까지 보낼 수 있어요.`);
  return {
    subject: str(body.subject, LIMITS.subject),
    length: ['short', 'long'].includes(body.length) ? body.length : 'auto',
    students: students.map((s, i) => ({
      id: str(s?.id, 10) || String(i + 1),
      sets: strList(s?.sets, 5),
      categories: strList(s?.categories),
      attempts: num(s?.attempts, 0, 999),
      days: num(s?.days, 0, 365),
      first_accuracy: num(s?.first_accuracy, 0, 100),
      latest_accuracy: num(s?.latest_accuracy, 0, 100),
      faster: s?.faster === true,
      finished_all: s?.finished_all === true,
      improved: strList(s?.improved),          // 처음엔 틀렸다가 나중에 맞힌 개념
      still_confused: strList(s?.still_confused), // 최근에도 헷갈린 개념 (예: "산화제→환원 쪽으로 분류")
      teacher_note: str(s?.teacher_note, LIMITS.text),
    })),
  };
}

export function buildUserMessage(req) {
  const students = req.students.map((s) => ({ ...s, target_sentences: targetSentences(s, req.length) }));
  return `과목: ${req.subject || '(미지정)'}
아래 JSON의 학생마다 성장이 드러나는 세특 문장 초안을 하나씩 쓰고, 같은 id로 돌려주세요.
문장 수는 각 학생의 target_sentences 를 따릅니다.
(accuracy는 참고용 정확도(%)이며 문장에는 숫자를 쓰지 않습니다.)

${JSON.stringify(students, null, 2)}`;
}

// ---------- 교사 확인 ----------

async function verifyTeacherWithSupabase(token) {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key || !token) return null;
  const sb = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await sb.auth.getUser(token);
  return error ? null : data.user;
}

function emailAllowed(email) {
  const list = (process.env.AI_ALLOWED_EMAIL_DOMAINS || '').split(',').map((d) => d.trim().toLowerCase()).filter(Boolean);
  if (!list.length) return true;
  const domain = String(email || '').split('@')[1]?.toLowerCase();
  return !!domain && list.some((d) => domain === d || domain.endsWith('.' + d));
}

// ---------- Claude 호출 ----------

async function writeWithClaude(client, req) {
  const response = await client.beta.messages.create({
    model: 'claude-opus-5-5',
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: OUTPUT_SCHEMA } },
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildUserMessage(req) }],
  });
  if (response.stop_reason === 'refusal') throw Object.assign(new Error('AI가 이 요청에 답하지 않았어요. 메모 내용을 바꿔 다시 시도해 주세요.'), { status: 422 });
  if (response.stop_reason === 'max_tokens') throw Object.assign(new Error('답이 너무 길어 잘렸어요. 학생 수를 줄여 다시 시도해 주세요.'), { status: 502 });
  const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  const parsed = JSON.parse(text);
  const ids = new Set(req.students.map((s) => s.id));
  return parsed.results.filter((r) => ids.has(r.id));
}

// 테스트에서 가짜 교사 확인·가짜 Claude 를 넣을 수 있게 만든 처리기
export function createHandler({ verifyTeacher = verifyTeacherWithSupabase, makeClient = () => new Anthropic() } = {}) {
  return async function handler(req, res) {
    const send = (status, body) => res.status(status).json(body);
    if (req.method !== 'POST') return send(405, { error: 'POST 요청만 받아요.' });
    if (!process.env.ANTHROPIC_API_KEY) {
      return send(501, { error: 'AI 기능이 아직 설정되지 않았어요. 운영자가 Vercel 환경 변수 ANTHROPIC_API_KEY 를 넣어야 해요.' });
    }
    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const teacher = await verifyTeacher(token).catch(() => null);
    if (!teacher) return send(401, { error: '교사 로그인이 필요해요. 다시 로그인해 주세요.' });
    if (!emailAllowed(teacher.email)) return send(403, { error: '이 계정은 AI 기능을 쓸 수 없어요. 운영자에게 문의하세요.' });

    let cleaned;
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      cleaned = cleanRequest(body);
    } catch (e) {
      return send(400, { error: e.message || '요청 형식이 올바르지 않아요.' });
    }

    try {
      const results = await writeWithClaude(makeClient(), cleaned);
      return send(200, { results });
    } catch (e) {
      if (e instanceof Anthropic.RateLimitError) return send(429, { error: '요청이 많아요. 잠시 후 다시 시도해 주세요.' });
      if (e instanceof Anthropic.AuthenticationError) return send(500, { error: 'AI 키가 올바르지 않아요. 운영자에게 알려 주세요.' });
      if (e instanceof Anthropic.APIError) return send(502, { error: `AI 서버 오류(${e.status ?? '연결'})예요. 잠시 후 다시 시도해 주세요.` });
      if (e instanceof SyntaxError) return send(502, { error: 'AI 답을 읽지 못했어요. 다시 시도해 주세요.' });
      return send(e.status || 500, { error: e.message || '문장을 만들지 못했어요.' });
    }
  };
}

export default createHandler();
