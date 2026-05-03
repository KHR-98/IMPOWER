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
  invite_department org_departments%rowtype;
  next_username text := 'kakao_' || trim(p_kakao_id);
  normalized_display_name text := trim(p_display_name);
begin
  if nullif(trim(p_token_hash), '') is null or nullif(trim(p_kakao_id), '') is null or nullif(normalized_display_name, '') is null then
    raise exception '가입 정보가 올바르지 않습니다.'
      using errcode = '22023';
  end if;

  select l.*
  into invite
  from account_invite_links as l
  where l.token_hash = p_token_hash
  for update;

  if not found then
    raise exception '초대링크를 찾을 수 없습니다.'
      using errcode = 'P0001';
  end if;

  if invite.used_count >= invite.max_uses then
    raise exception '사용 인원이 모두 찬 초대링크입니다.'
      using errcode = 'P0001';
  end if;

  if invite.is_active is not true then
    raise exception '폐기된 초대링크입니다.'
      using errcode = 'P0001';
  end if;

  if invite.expires_at <= now() then
    raise exception '만료된 초대링크입니다.'
      using errcode = 'P0001';
  end if;

  select d.*
  into invite_department
  from org_departments as d
  where d.id = invite.department_id;

  if not found then
    raise exception '초대링크에 연결된 부서를 찾을 수 없습니다.'
      using errcode = 'P0001';
  end if;

  if invite_department.is_active is not true then
    raise exception '비활성 부서의 초대링크입니다.'
      using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from account_users as u
    where u.kakao_id = trim(p_kakao_id)
  ) then
    raise exception '이미 등록된 카카오 계정입니다.'
      using errcode = '23505';
  end if;

  if exists (
    select 1
    from account_users as u
    where u.username = next_username
  ) then
    raise exception '카카오 계정용 사용자명이 이미 사용 중입니다.'
      using errcode = '23505';
  end if;

  update account_invite_links as l
  set
    used_count = l.used_count + 1,
    last_used_at = now(),
    is_active = case when l.used_count + 1 >= l.max_uses then false else l.is_active end
  where l.id = invite.id
  returning l.* into invite;

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
    normalized_display_name,
    null,
    trim(p_kakao_id),
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
  from account_users as u
  join org_departments as d on d.id = u.department_id
  where u.username = next_username;
end;
$$;
