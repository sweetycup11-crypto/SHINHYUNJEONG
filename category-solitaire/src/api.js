// 데이터 저장소 연결
//
// 환경 변수 VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY 가 있으면 Supabase(공유 저장소)를 쓰고,
// 없으면 "체험 모드"로 이 브라우저에만 저장합니다. 두 방식 모두 아래 함수 이름이 같습니다.
//
// ※ VITE_SUPABASE_ANON_KEY 는 원래 공개되어도 되는 키입니다.
//   실제 보호는 supabase/schema.sql 의 행 수준 보안(RLS) 규칙이 맡습니다.
//   절대 service_role 키를 넣지 마세요.
import { createClient } from '@supabase/supabase-js';
import { SAMPLE_SET } from './sample-set.js';
import { priceOf } from './card-backs.js';

const URL_ = import.meta.env.VITE_SUPABASE_URL;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// 서버 오류 코드 → 화면에 보여 줄 문구
const MESSAGES = {
  CLASS_NOT_FOUND: '수업 코드를 찾을 수 없어요. 선생님께 코드를 다시 확인해 주세요.',
  SET_NOT_AVAILABLE: '이 세트는 지금 공개되어 있지 않아요.',
  INVALID_STUDENT_NO: '학번은 숫자·영문·하이픈(-)으로 20자 이내로 입력해 주세요.',
  INVALID_STUDENT_NAME: '이름은 20자 이내로 입력해 주세요.',
  INVALID_RESULT: '결과를 저장하지 못했어요. (기록 값이 올바르지 않음)',
  TOO_FAST: '잠시 후 다시 시도해 주세요.',
  SHOP_OFF: '지금은 상점을 쓸 수 없어요. (선생님이 상점을 껐어요)',
  INVALID_PIN: '비밀번호는 숫자 4자리예요.',
  INVALID_ITEM: '없는 상품이에요.',
};

function friendly(err) {
  const raw = err?.message || String(err);
  const code = Object.keys(MESSAGES).find((k) => raw.includes(k));
  if (code) return new Error(MESSAGES[code]);
  if (/Invalid login credentials/i.test(raw)) return new Error('이메일 또는 비밀번호가 맞지 않아요.');
  if (/Email not confirmed/i.test(raw)) return new Error('메일함에서 가입 인증 링크를 먼저 눌러 주세요.');
  if (/User already registered/i.test(raw)) return new Error('이미 가입된 이메일이에요. 로그인해 주세요.');
  if (/Password should be at least/i.test(raw)) return new Error('비밀번호는 6자 이상이어야 해요.');
  if (/rate limit/i.test(raw)) return new Error('요청이 너무 많아요. 잠시 후 다시 시도해 주세요.');
  if (/Failed to fetch|NetworkError|network/i.test(raw)) return new Error('인터넷 연결을 확인해 주세요.');
  return new Error(raw);
}

// 헷갈리는 글자(0/O, 1/I/L)를 뺀 6자리 수업 코드
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function makeClassCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (b) => CODE_CHARS[b % CODE_CHARS.length]).join('');
}

// 학번 형식 (서버의 검사와 같게)
export const STUDENT_NO_RE = /^[0-9A-Za-z-]{1,20}$/;

// =====================================================================
// Supabase (공유 저장소)
// =====================================================================
function supabaseApi() {
  const sb = createClient(URL_, KEY, { auth: { flowType: 'pkce', persistSession: true, detectSessionInUrl: true } });
  const must = ({ data, error }) => {
    if (error) throw friendly(error);
    return data;
  };
  const uid = async () => (await sb.auth.getUser()).data.user?.id;
  // 교사가 가입 인증·비밀번호 재설정 메일의 링크를 누르면 돌아올 주소
  const redirectTo = () => location.origin + location.pathname;

  return {
    mode: 'supabase',

    // ---------- 교사 계정 ----------
    async getTeacher() {
      const { data } = await sb.auth.getSession();
      const u = data.session?.user;
      return u ? { id: u.id, email: u.email } : null;
    },
    onAuthChange(cb) {
      sb.auth.onAuthStateChange((event, session) => cb(event, session?.user ? { id: session.user.id, email: session.user.email } : null));
    },
    async signUp(email, password) {
      const data = must(await sb.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo() } }));
      return { needsConfirm: !data.session };
    },
    async signIn(email, password) {
      must(await sb.auth.signInWithPassword({ email, password }));
    },
    async signOut() {
      await sb.auth.signOut();
    },
    async sendPasswordReset(email) {
      must(await sb.auth.resetPasswordForEmail(email, { redirectTo: redirectTo() }));
    },
    async updatePassword(password) {
      must(await sb.auth.updateUser({ password }));
    },

    // ---------- 게임 세트 ----------
    async listSets() {
      const rows = must(await sb.from('game_sets').select('id, name, rows, updated_at').order('name'));
      return rows.map((s) => ({ id: s.id, name: s.name, rows: s.rows, updatedAt: s.updated_at }));
    },
    async saveSets(sets) {
      const teacher_id = await uid();
      const now = new Date().toISOString();
      must(await sb.from('game_sets').upsert(
        sets.map((s) => ({ teacher_id, name: s.name, rows: s.rows, updated_at: now })),
        { onConflict: 'teacher_id,name' },
      ));
    },
    async deleteSet(id) {
      must(await sb.from('game_sets').delete().eq('id', id));
    },

    // ---------- 수업 ----------
    async listClasses() {
      const rows = must(await sb.from('classes').select('id, name, code, settings, created_at, class_sets(set_id)').order('created_at'));
      return rows.map((c) => ({
        id: c.id, name: c.name, code: c.code, settings: c.settings || {}, createdAt: c.created_at,
        setIds: c.class_sets.map((x) => x.set_id),
      }));
    },
    async createClass(name) {
      const teacher_id = await uid();
      // 코드가 우연히 겹치면 새 코드로 다시 시도
      for (let i = 0; i < 5; i++) {
        const { data, error } = await sb.from('classes').insert({ teacher_id, name, code: makeClassCode() }).select().single();
        if (!error) return { ...data, setIds: [] };
        if (error.code !== '23505') throw friendly(error);
      }
      throw new Error('수업 코드를 만들지 못했어요. 다시 시도해 주세요.');
    },
    async updateClass(id, patch) {
      must(await sb.from('classes').update(patch).eq('id', id));
    },
    async deleteClass(id) {
      must(await sb.from('classes').delete().eq('id', id));
    },
    async setClassSets(classId, setIds) {
      must(await sb.from('class_sets').delete().eq('class_id', classId));
      if (setIds.length) must(await sb.from('class_sets').insert(setIds.map((set_id) => ({ class_id: classId, set_id }))));
    },

    // ---------- 결과 ----------
    async listAttempts(classId) {
      // 한 번에 최대 1000행씩 나눠 받기
      const all = [];
      for (let from = 0; ; from += 1000) {
        const rows = must(await sb.from('attempts').select('*').eq('class_id', classId)
          .order('created_at').range(from, from + 999));
        all.push(...rows);
        if (rows.length < 1000) break;
      }
      return all;
    },
    // 학생 기록을 지울 때 그 학생(들)의 코인·상점 기록도 함께 지운다
    async deleteAttempts(classId, studentNo) {
      for (const table of ['attempts', 'student_wallets']) {
        let q = sb.from(table).delete().eq('class_id', classId);
        if (studentNo) q = q.eq('student_no', studentNo);
        must(await q);
      }
    },
    async listWallets(classId) {
      const rows = must(await sb.from('student_wallets')
        .select('student_no, coins, owned, equipped, pin_hash, pin_locked_until').eq('class_id', classId));
      return rows.map(({ pin_hash, ...w }) => ({ ...w, has_pin: !!pin_hash }));
    },
    async resetPin(classId, studentNo) {
      must(await sb.from('student_wallets').update({ pin_hash: null, pin_fails: 0, pin_locked_until: null })
        .eq('class_id', classId).eq('student_no', studentNo));
    },

    // ---------- 학생 ----------
    async enterClass(code) {
      const d = must(await sb.rpc('student_enter', { p_code: code }));
      return { className: d.class_name, settings: d.settings || {}, sets: d.sets };
    },
    async submitAttempt({ code, studentNo, studentName, setId, result }) {
      return must(await sb.rpc('submit_attempt', {
        p_code: code, p_student_no: studentNo, p_student_name: studentName || null, p_set_id: setId, p_result: result,
      }));
    },
    async getWallet(code, studentNo) {
      return must(await sb.rpc('student_wallet', { p_code: code, p_student_no: studentNo }));
    },
    // 결과에 error 가 있으면 비밀번호 틀림·코인 부족 등 (화면에서 안내)
    async shopAction({ code, studentNo, pin, action, item }) {
      return must(await sb.rpc('shop_action', { p_code: code, p_student_no: studentNo, p_pin: pin, p_action: action, p_item: item }));
    },
  };
}

// =====================================================================
// 체험 모드 (이 브라우저에만 저장, 로그인 없이 교사 화면 사용)
// =====================================================================
function demoApi() {
  const KEY_DB = 'cs-demo-db';
  const load = () => {
    let db;
    try { db = JSON.parse(localStorage.getItem(KEY_DB)); } catch { db = null; }
    if (!db) {
      // 처음 실행: 샘플 세트와 체험 수업을 만들어 둔다
      const setId = crypto.randomUUID();
      db = {
        sets: [{ id: setId, name: SAMPLE_SET.name, rows: SAMPLE_SET.rows, updatedAt: new Date().toISOString() }],
        classes: [{ id: crypto.randomUUID(), name: '체험 수업', code: 'DEMO23', settings: {}, createdAt: new Date().toISOString(), setIds: [setId] }],
        attempts: [],
        nextId: 1,
      };
      // 예전 버전에서 브라우저에 저장했던 세트가 있으면 옮겨 온다
      try {
        for (const s of JSON.parse(localStorage.getItem('cs-sets')) || []) {
          if (!db.sets.some((x) => x.name === s.name)) db.sets.push({ id: crypto.randomUUID(), name: s.name, rows: s.rows, updatedAt: new Date().toISOString() });
        }
      } catch { /* 없으면 무시 */ }
      save(db);
    }
    return db;
  };
  const save = (db) => {
    try { localStorage.setItem(KEY_DB, JSON.stringify(db)); } catch { throw new Error('브라우저에 저장하지 못했어요.'); }
  };
  const teacher = { id: 'demo', email: '체험 교사' };

  return {
    mode: 'demo',

    async getTeacher() { return teacher; },
    onAuthChange() {},
    async signUp() { return { needsConfirm: false }; },
    async signIn() {},
    async signOut() {},
    async sendPasswordReset() {},
    async updatePassword() {},

    async listSets() {
      return load().sets.slice().sort((a, b) => a.name.localeCompare(b.name, 'ko'));
    },
    async saveSets(sets) {
      const db = load();
      const now = new Date().toISOString();
      for (const s of sets) {
        const old = db.sets.find((x) => x.name === s.name);
        if (old) Object.assign(old, { rows: s.rows, updatedAt: now });
        else db.sets.push({ id: crypto.randomUUID(), name: s.name, rows: s.rows, updatedAt: now });
      }
      save(db);
    },
    async deleteSet(id) {
      const db = load();
      db.sets = db.sets.filter((s) => s.id !== id);
      for (const c of db.classes) c.setIds = c.setIds.filter((x) => x !== id);
      for (const a of db.attempts) if (a.set_id === id) a.set_id = null;
      save(db);
    },

    async listClasses() { return load().classes; },
    async createClass(name) {
      const db = load();
      let code;
      do code = makeClassCode(); while (db.classes.some((c) => c.code === code));
      const c = { id: crypto.randomUUID(), name, code, settings: {}, createdAt: new Date().toISOString(), setIds: [] };
      db.classes.push(c);
      save(db);
      return c;
    },
    async updateClass(id, patch) {
      const db = load();
      Object.assign(db.classes.find((c) => c.id === id), patch);
      save(db);
    },
    async deleteClass(id) {
      const db = load();
      db.classes = db.classes.filter((c) => c.id !== id);
      db.attempts = db.attempts.filter((a) => a.class_id !== id);
      db.wallets = (db.wallets || []).filter((w) => w.class_id !== id);
      save(db);
    },
    async setClassSets(classId, setIds) {
      const db = load();
      db.classes.find((c) => c.id === classId).setIds = setIds;
      save(db);
    },

    async listAttempts(classId) { return load().attempts.filter((a) => a.class_id === classId); },
    async deleteAttempts(classId, studentNo) {
      const db = load();
      const hit = (x) => x.class_id === classId && (!studentNo || x.student_no === studentNo);
      db.attempts = db.attempts.filter((a) => !hit(a));
      db.wallets = (db.wallets || []).filter((w) => !hit(w));
      save(db);
    },
    async listWallets(classId) {
      return (load().wallets || []).filter((w) => w.class_id === classId)
        .map(({ pin, ...w }) => ({ ...w, has_pin: !!pin }));
    },
    async resetPin(classId, studentNo) {
      const db = load();
      const w = (db.wallets || []).find((x) => x.class_id === classId && x.student_no === studentNo);
      if (w) Object.assign(w, { pin: null, pin_fails: 0, pin_locked_until: null });
      save(db);
    },

    async enterClass(code) {
      const db = load();
      const c = db.classes.find((x) => x.code === code.trim().toUpperCase());
      if (!c) throw friendly(new Error('CLASS_NOT_FOUND'));
      return {
        className: c.name,
        settings: c.settings,
        sets: db.sets.filter((s) => c.setIds.includes(s.id)).map(({ id, name, rows }) => ({ id, name, rows })),
      };
    },
    async submitAttempt({ code, studentNo, studentName, setId, result }) {
      const db = load();
      const c = db.classes.find((x) => x.code === code.trim().toUpperCase());
      if (!c) throw friendly(new Error('CLASS_NOT_FOUND'));
      const set = db.sets.find((s) => s.id === setId && c.setIds.includes(s.id));
      if (!set) throw friendly(new Error('SET_NOT_AVAILABLE'));
      const no = studentNo.trim();
      if (!STUDENT_NO_RE.test(no)) throw friendly(new Error('INVALID_STUDENT_NO'));
      db.attempts.push({
        id: db.nextId++, class_id: c.id, set_id: set.id, set_name: set.name,
        student_no: no, student_name: (studentName || '').trim() || null,
        ...result, total_words: set.rows.length, created_at: new Date().toISOString(),
      });
      const earned = Math.floor(result.score / 10);
      const w = demoWallet(db, c.id, no);
      w.coins += earned;
      save(db);
      const mine = db.attempts.filter((a) => a.class_id === c.id && a.student_no === no && a.set_id === set.id).slice(-50);
      return {
        best: Math.max(...mine.map((a) => a.score)), history: mine.map((a) => ({ score: a.score, at: a.created_at })),
        coins_earned: earned, coins: w.coins,
      };
    },
    async getWallet(code, studentNo) {
      const db = load();
      const c = db.classes.find((x) => x.code === code.trim().toUpperCase());
      if (!c) throw friendly(new Error('CLASS_NOT_FOUND'));
      const w = (db.wallets || []).find((x) => x.class_id === c.id && x.student_no === studentNo.trim());
      return w ? publicWallet(w) : { coins: 0, owned: ['default'], equipped: 'default', has_pin: false };
    },
    // supabase/schema.sql 의 shop_action 과 같은 규칙 (체험 모드용)
    async shopAction({ code, studentNo, pin, action, item }) {
      const db = load();
      const c = db.classes.find((x) => x.code === code.trim().toUpperCase());
      if (!c) throw friendly(new Error('CLASS_NOT_FOUND'));
      if (c.settings?.shopOn === false) throw friendly(new Error('SHOP_OFF'));
      if (!/^[0-9]{4}$/.test(pin)) throw friendly(new Error('INVALID_PIN'));
      const price = priceOf(item);
      if (price === undefined || !['buy', 'equip'].includes(action)) throw friendly(new Error('INVALID_ITEM'));
      const w = demoWallet(db, c.id, studentNo.trim());
      const locked = w.pin_locked_until && new Date(w.pin_locked_until) > new Date();
      if (locked) return { error: 'PIN_LOCKED', minutes: Math.ceil((new Date(w.pin_locked_until) - new Date()) / 60000) };
      const hash = await sha256(pin);
      if (!w.pin) {
        w.pin = hash;
      } else if (w.pin !== hash) {
        const fails = w.pin_fails + 1;
        w.pin_fails = fails >= 5 ? 0 : fails;
        w.pin_locked_until = fails >= 5 ? new Date(Date.now() + 10 * 60000).toISOString() : null;
        save(db);
        return { error: 'WRONG_PIN', tries_left: Math.max(0, 5 - fails) };
      } else {
        w.pin_fails = 0;
        w.pin_locked_until = null;
      }
      if (action === 'buy' && !w.owned.includes(item)) {
        if (w.coins < price) { save(db); return { error: 'NOT_ENOUGH_COINS', coins: w.coins, price }; }
        w.coins -= price;
        w.owned.push(item);
        w.equipped = item;
      } else if (w.owned.includes(item)) {
        w.equipped = item;
      } else {
        save(db);
        return { error: 'NOT_OWNED' };
      }
      save(db);
      return publicWallet(w);
    },
  };
}

// ---------- 체험 모드 지갑 도우미 ----------
function demoWallet(db, classId, studentNo) {
  db.wallets = db.wallets || [];
  let w = db.wallets.find((x) => x.class_id === classId && x.student_no === studentNo);
  if (!w) {
    w = { class_id: classId, student_no: studentNo, coins: 0, owned: ['default'], equipped: 'default', pin: null, pin_fails: 0, pin_locked_until: null };
    db.wallets.push(w);
  }
  return w;
}
const publicWallet = (w) => ({ coins: w.coins, owned: [...w.owned], equipped: w.equipped, has_pin: !!w.pin });
async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

export const api = URL_ && KEY ? supabaseApi() : demoApi();
