-- =====================================================================
-- 카테고리 솔리테어 데이터베이스 (Supabase)
-- Supabase 대시보드 → SQL Editor → New query 에 이 파일 전체를 붙여 넣고 Run.
-- 여러 번 실행해도 안전하도록 작성했습니다(이미 있으면 건너뜀/교체).
--
-- 보안 원칙
--  · 교사: 로그인한 본인 데이터(세트·수업·결과)만 읽기/쓰기/삭제 (행 수준 보안, RLS)
--  · 학생: 로그인 없이 아래 두 함수만 호출 가능
--      student_enter(수업코드)          → 공개된 세트와 설정 받기
--      submit_attempt(수업코드, 학번…)   → 기록 저장 + 내 점수 기록 받기
--    학생은 테이블에 직접 접근할 수 없습니다.
-- =====================================================================

-- ---------- 테이블 ----------

-- 게임 세트 (엑셀 시트 하나 = 세트 하나)
create table if not exists public.game_sets (
  id          uuid primary key default gen_random_uuid(),
  teacher_id  uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 60),
  rows        jsonb not null check (jsonb_typeof(rows) = 'array'),   -- [{category, word, explanation}]
  updated_at  timestamptz not null default now(),
  unique (teacher_id, name)
);

-- 수업(반). code = 학생이 입력하는 6자리 수업 코드
create table if not exists public.classes (
  id          uuid primary key default gen_random_uuid(),
  teacher_id  uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 40),
  code        text not null unique check (code ~ '^[A-Z0-9]{6}$'),
  settings    jsonb not null default '{}'::jsonb,                     -- 점수·시간·열 개수·테마
  created_at  timestamptz not null default now()
);

-- 수업별로 학생에게 공개한 세트
create table if not exists public.class_sets (
  class_id  uuid not null references public.classes (id) on delete cascade,
  set_id    uuid not null references public.game_sets (id) on delete cascade,
  primary key (class_id, set_id)
);

-- 학생 기록 (개인정보 최소화: 학번 필수, 이름 선택)
create table if not exists public.attempts (
  id               bigint generated always as identity primary key,
  class_id         uuid not null references public.classes (id) on delete cascade,
  set_id           uuid references public.game_sets (id) on delete set null,
  set_name         text not null,
  student_no       text not null,
  student_name     text,
  score            integer not null,
  elapsed_sec      integer not null,
  moves            integer not null,
  correct          integer not null,
  wrong            integer not null,
  total_words      integer not null,
  finished         boolean not null,
  wrong_list       jsonb not null default '[]'::jsonb,               -- [{word, placed, answer}]
  created_at       timestamptz not null default now()
);
create index if not exists attempts_class_idx on public.attempts (class_id, created_at);
create index if not exists attempts_student_idx on public.attempts (class_id, student_no, set_id);

-- ---------- 행 수준 보안(RLS): 교사는 자기 데이터만 ----------

alter table public.game_sets  enable row level security;
alter table public.classes    enable row level security;
alter table public.class_sets enable row level security;
alter table public.attempts   enable row level security;

drop policy if exists "own sets" on public.game_sets;
create policy "own sets" on public.game_sets for all to authenticated
  using (teacher_id = (select auth.uid()))
  with check (teacher_id = (select auth.uid()));

drop policy if exists "own classes" on public.classes;
create policy "own classes" on public.classes for all to authenticated
  using (teacher_id = (select auth.uid()))
  with check (teacher_id = (select auth.uid()));

-- 공개 세트: 수업과 세트가 모두 내 것일 때만
drop policy if exists "own class sets" on public.class_sets;
create policy "own class sets" on public.class_sets for all to authenticated
  using (exists (select 1 from public.classes c where c.id = class_id and c.teacher_id = (select auth.uid())))
  with check (
    exists (select 1 from public.classes c where c.id = class_id and c.teacher_id = (select auth.uid()))
    and exists (select 1 from public.game_sets s where s.id = set_id and s.teacher_id = (select auth.uid()))
  );

-- 학생 기록: 교사는 자기 수업 기록을 보고 지울 수만 있다 (추가·수정은 학생 함수로만)
drop policy if exists "read own class attempts" on public.attempts;
create policy "read own class attempts" on public.attempts for select to authenticated
  using (exists (select 1 from public.classes c where c.id = class_id and c.teacher_id = (select auth.uid())));

drop policy if exists "delete own class attempts" on public.attempts;
create policy "delete own class attempts" on public.attempts for delete to authenticated
  using (exists (select 1 from public.classes c where c.id = class_id and c.teacher_id = (select auth.uid())));

-- 로그인한 교사(authenticated)에게 표 사용 권한 (실제 범위는 위 RLS 규칙이 제한)
grant select, insert, update, delete on public.game_sets, public.classes, public.class_sets to authenticated;
grant select, delete on public.attempts to authenticated;

-- 로그인하지 않은 사용자(anon)는 테이블에 직접 접근 불가
revoke all on public.game_sets, public.classes, public.class_sets, public.attempts from anon;

-- ---------- 학생용 함수 ----------

-- 수업 코드로 입장: 수업 이름, 설정, 공개된 세트 목록
create or replace function public.student_enter(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_class public.classes;
begin
  select * into v_class from public.classes where code = upper(trim(p_code));
  if not found then
    raise exception 'CLASS_NOT_FOUND';
  end if;

  return jsonb_build_object(
    'class_name', v_class.name,
    'settings', v_class.settings,
    'sets', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'rows', s.rows) order by s.name)
      from public.class_sets cs join public.game_sets s on s.id = cs.set_id
      where cs.class_id = v_class.id
    ), '[]'::jsonb)
  );
end;
$$;

-- 게임 결과 저장 → 이 학생의 해당 세트 점수 기록(시도 순서)과 최고 점수를 돌려준다
create or replace function public.submit_attempt(
  p_code text,
  p_student_no text,
  p_student_name text,
  p_set_id uuid,
  p_result jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_class   public.classes;
  v_set     public.game_sets;
  v_no      text := trim(coalesce(p_student_no, ''));
  v_name    text := nullif(trim(coalesce(p_student_name, '')), '');
  v_words   integer;
  v_cats    integer;
  v_score   jsonb;
  v_max     numeric;
  v_wrong   jsonb := coalesce(p_result -> 'wrong_list', '[]'::jsonb);
  v_s       integer;  -- 점수
  v_e       integer;  -- 걸린 시간(초)
  v_m       integer;  -- 이동 수
  v_c       integer;  -- 정답 수
  v_w       integer;  -- 오답 수
  v_f       boolean;  -- 모두 분류했는지
begin
  select * into v_class from public.classes where code = upper(trim(p_code));
  if not found then
    raise exception 'CLASS_NOT_FOUND';
  end if;

  select s.* into v_set
  from public.game_sets s join public.class_sets cs on cs.set_id = s.id
  where cs.class_id = v_class.id and s.id = p_set_id;
  if not found then
    raise exception 'SET_NOT_AVAILABLE';
  end if;

  if v_no !~ '^[0-9A-Za-z-]{1,20}$' then
    raise exception 'INVALID_STUDENT_NO';
  end if;
  if v_name is not null and char_length(v_name) > 20 then
    raise exception 'INVALID_STUDENT_NAME';
  end if;

  -- 너무 잦은 저장 막기 (같은 학생 3초 이내)
  if exists (select 1 from public.attempts
             where class_id = v_class.id and student_no = v_no
               and created_at > now() - interval '3 seconds') then
    raise exception 'TOO_FAST';
  end if;

  -- 결과 값 검사: 세트 크기와 수업 설정으로 가능한 최고 점수를 넘을 수 없다
  v_words := jsonb_array_length(v_set.rows);
  select count(distinct r ->> 'category') into v_cats from jsonb_array_elements(v_set.rows) r;
  v_score := coalesce(v_class.settings -> 'score', '{}'::jsonb);
  v_max := v_words * coalesce((v_score ->> 'correct')::numeric, 10)
         + v_cats * coalesce((v_score ->> 'category')::numeric, 2)
         + round(v_words * coalesce((v_score ->> 'secPerCard')::numeric, 6)
                 * coalesce((v_score ->> 'timeBonusPerSec')::numeric, 0.2));

  if jsonb_typeof(p_result) is distinct from 'object' then
    raise exception 'INVALID_RESULT';
  end if;
  v_s := (p_result ->> 'score')::integer;
  v_e := (p_result ->> 'elapsed_sec')::integer;
  v_m := (p_result ->> 'moves')::integer;
  v_c := (p_result ->> 'correct')::integer;
  v_w := (p_result ->> 'wrong')::integer;
  v_f := (p_result ->> 'finished')::boolean;

  if v_s is null or v_e is null or v_m is null or v_c is null or v_w is null or v_f is null
     or v_s not between 0 and v_max
     or v_e not between 0 and 86400
     or v_m not between 0 and 100000
     or v_c not between 0 and v_words
     or v_w not between 0 and 100000
     or jsonb_typeof(v_wrong) <> 'array' or jsonb_array_length(v_wrong) > 1000
     or exists (select 1 from jsonb_array_elements(v_wrong) w
                where jsonb_typeof(w) <> 'object'
                   or char_length(coalesce(w ->> 'word', '')) > 60
                   or char_length(coalesce(w ->> 'placed', '')) > 60
                   or char_length(coalesce(w ->> 'answer', '')) > 60)
  then
    raise exception 'INVALID_RESULT';
  end if;

  insert into public.attempts (
    class_id, set_id, set_name, student_no, student_name,
    score, elapsed_sec, moves, correct, wrong, total_words, finished, wrong_list
  ) values (
    v_class.id, v_set.id, v_set.name, v_no, v_name,
    v_s, v_e, v_m, v_c, v_w, v_words, v_f, v_wrong
  );

  return (
    select jsonb_build_object(
      'best', max(a.score),
      'history', jsonb_agg(jsonb_build_object('score', a.score, 'at', a.created_at) order by a.created_at)
    )
    from (
      select score, created_at from public.attempts
      where class_id = v_class.id and student_no = v_no and set_id = v_set.id
      order by created_at desc limit 50
    ) a
  );
exception
  when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'INVALID_RESULT';
end;
$$;

-- 함수 실행 권한: 학생(anon)과 교사(authenticated)만
revoke all on function public.student_enter(text) from public;
revoke all on function public.submit_attempt(text, text, text, uuid, jsonb) from public;
grant execute on function public.student_enter(text) to anon, authenticated;
grant execute on function public.submit_attempt(text, text, text, uuid, jsonb) to anon, authenticated;
