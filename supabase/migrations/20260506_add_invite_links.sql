create table if not exists account_invite_links (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  token_encrypted text not null,
  label text not null,
  department_id uuid not null references org_departments(id),
  max_uses integer not null check (max_uses between 1 and 200),
  used_count integer not null default 0 check (used_count >= 0),
  expires_at timestamptz not null,
  is_active boolean not null default true,
  link_type text not null default 'standard' check (link_type in ('initial', 'standard')),
  created_by text not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create index if not exists account_invite_links_department_id_idx
  on account_invite_links(department_id);

create index if not exists account_invite_links_active_expires_idx
  on account_invite_links(is_active, expires_at);

create or replace function create_account_user_from_invite_link(
  p_token_hash text,
  p_kakao_id text,
  p_display_name text
)
returns table (
  username text,
  display_name text,
  role text,
  is_active boolean,
  department_id uuid,
  department_code text,
  department_name text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  invite account_invite_links%rowtype;
  next_username text := 'kakao_' || p_kakao_id;
begin
  if nullif(trim(p_token_hash), '') is null or nullif(trim(p_kakao_id), '') is null or nullif(trim(p_display_name), '') is null then
    return;
  end if;

  update account_invite_links
  set
    used_count = used_count + 1,
    last_used_at = now(),
    is_active = case when used_count + 1 >= max_uses then false else is_active end
  where token_hash = p_token_hash
    and is_active = true
    and expires_at > now()
    and used_count < max_uses
  returning * into invite;

  if not found then
    return;
  end if;

  insert into account_users (
    username,
    display_name,
    password_hash,
    kakao_id,
    role,
    department_id,
    is_active
  )
  values (
    next_username,
    trim(p_display_name),
    null,
    p_kakao_id,
    'user',
    invite.department_id,
    true
  );

  return query
  select
    u.username,
    u.display_name,
    u.role,
    u.is_active,
    u.department_id,
    d.code,
    d.name
  from account_users u
  join org_departments d on d.id = u.department_id
  where u.username = next_username;
end;
$$;

comment on table account_invite_links is '부서별 카카오 신규 가입 초대링크. token_hash로 검증하고 token_encrypted는 활성 링크 복사용으로만 사용';
comment on column account_invite_links.max_uses is '초대링크로 가입 가능한 최대 인원';
comment on column account_invite_links.used_count is '초대링크로 가입 완료된 인원 수';
