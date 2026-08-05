-- 열람 전용(viewer) 역할 추가.
-- viewer는 전체 부서 현황을 조회만 하고, 출결 기록·설정 변경 등 쓰기는 코드 레이어에서 계속 막는다.
-- account_users.role 은 account_roles(code) 를 FK 로 참조하므로, 먼저 account_roles 의
-- code CHECK 제약을 넓히고 viewer 행을 넣어야 viewer 계정을 저장할 수 있다.

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'account_roles_code_check'
      and conrelid = 'public.account_roles'::regclass
  ) then
    alter table account_roles drop constraint account_roles_code_check;
  end if;
end $$;

alter table account_roles
  add constraint account_roles_code_check
  check (code in ('user', 'viewer', 'sub_admin', 'admin', 'master'));

insert into account_roles (code, label_ko, description_ko, sort_order, is_active)
values
  ('viewer', '뷰어', '전체 부서 현황을 조회만 하는 열람 전용 계정입니다.', 50, true)
on conflict (code) do update set
  label_ko = excluded.label_ko,
  description_ko = excluded.description_ko,
  sort_order = excluded.sort_order,
  is_active = excluded.is_active;
