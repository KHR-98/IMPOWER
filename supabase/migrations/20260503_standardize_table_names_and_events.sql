create extension if not exists pgcrypto;

do $$
begin
  if to_regclass('public.departments') is not null and to_regclass('public.org_departments') is null then
    alter table departments rename to org_departments;
  end if;

  if to_regclass('public.users') is not null and to_regclass('public.account_users') is null then
    alter table users rename to account_users;
  end if;

  if to_regclass('public.zones') is not null and to_regclass('public.geo_zones') is null then
    alter table zones rename to geo_zones;
  end if;

  if to_regclass('public.roster_entries') is not null and to_regclass('public.work_rosters') is null then
    alter table roster_entries rename to work_rosters;
  end if;

  if to_regclass('public.attendance_records') is not null and to_regclass('public.attendance_daily_records') is null then
    alter table attendance_records rename to attendance_daily_records;
  end if;

  if to_regclass('public.audit_logs') is not null and to_regclass('public.audit_attendance_logs') is null then
    alter table audit_logs rename to audit_attendance_logs;
  end if;

  if to_regclass('public.app_settings') is not null and to_regclass('public.config_global_settings') is null then
    alter table app_settings rename to config_global_settings;
  end if;

  if to_regclass('public.department_settings') is not null and to_regclass('public.config_department_settings') is null then
    alter table department_settings rename to config_department_settings;
  end if;

  if to_regclass('public.department_attendance_windows') is not null and to_regclass('public.config_attendance_windows') is null then
    alter table department_attendance_windows rename to config_attendance_windows;
  end if;
end $$;

alter index if exists users_department_id_idx rename to account_users_department_id_idx;
alter index if exists idx_roster_entries_work_date_username rename to work_rosters_work_date_username_idx;
alter index if exists idx_attendance_records_work_date_username rename to attendance_daily_records_work_date_username_idx;
alter index if exists department_attendance_windows_department_id_idx rename to config_attendance_windows_department_id_idx;
alter index if exists department_attendance_windows_shift_type_idx rename to config_attendance_windows_shift_type_idx;

create table if not exists account_roles (
  code text primary key check (code in ('user', 'sub_admin', 'admin', 'master')),
  label_ko text not null,
  description_ko text,
  sort_order integer not null default 0,
  is_active boolean not null default true
);

insert into account_roles (code, label_ko, description_ko, sort_order, is_active)
values
  ('master', '마스터', '전체 부서와 전체 계정을 관리합니다.', 10, true),
  ('admin', '팀장', '소속 부서의 사용자와 설정을 관리합니다.', 20, true),
  ('sub_admin', '조장', '소속 부서 데이터를 조회합니다.', 30, true),
  ('user', '대원', '출퇴근을 기록하는 일반 사용자입니다.', 40, true)
on conflict (code) do update set
  label_ko = excluded.label_ko,
  description_ko = excluded.description_ko,
  sort_order = excluded.sort_order,
  is_active = excluded.is_active;

do $$
begin
  if to_regclass('public.account_users') is not null
     and not exists (
       select 1
       from pg_constraint
       where conname = 'account_users_role_fkey'
         and conrelid = 'public.account_users'::regclass
     ) then
    alter table account_users
      add constraint account_users_role_fkey foreign key (role) references account_roles(code);
  end if;
end $$;

create table if not exists attendance_event_types (
  code text primary key check (
    code in (
      'check_in',
      'tbm_morning',
      'lunch_register',
      'lunch_out',
      'lunch_in',
      'tbm_afternoon',
      'tbm_checkout',
      'check_out'
    )
  ),
  label_ko text not null,
  sort_order integer not null default 0,
  requires_location boolean not null default true,
  requires_mdm boolean not null default false,
  is_active boolean not null default true
);

insert into attendance_event_types (code, label_ko, sort_order, requires_location, requires_mdm, is_active)
values
  ('check_in', '출근', 10, true, true, true),
  ('tbm_morning', '오전 TBM', 20, true, false, true),
  ('lunch_register', '점심 등록', 30, true, true, true),
  ('lunch_out', '점심 출문', 40, true, false, true),
  ('lunch_in', '점심 입문', 50, true, true, true),
  ('tbm_afternoon', '오후 TBM', 60, true, false, true),
  ('tbm_checkout', '퇴근 전 TBM', 70, true, false, true),
  ('check_out', '퇴근', 80, true, true, true)
on conflict (code) do update set
  label_ko = excluded.label_ko,
  sort_order = excluded.sort_order,
  requires_location = excluded.requires_location,
  requires_mdm = excluded.requires_mdm,
  is_active = excluded.is_active;

create table if not exists attendance_events (
  id uuid primary key default gen_random_uuid(),
  attendance_daily_record_id uuid not null references attendance_daily_records(id) on delete cascade,
  action_type text not null references attendance_event_types(code),
  occurred_at timestamptz not null,
  latitude double precision,
  longitude double precision,
  accuracy_m double precision,
  zone_id uuid references geo_zones(id),
  mdm_verified boolean,
  camera_test text,
  source text not null default 'daily_record_sync',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (attendance_daily_record_id, action_type)
);

create index if not exists account_users_department_id_idx on account_users(department_id);
create index if not exists work_rosters_work_date_username_idx on work_rosters(work_date, username);
create index if not exists attendance_daily_records_work_date_username_idx on attendance_daily_records(work_date, username);
create index if not exists config_attendance_windows_department_id_idx on config_attendance_windows(department_id);
create index if not exists config_attendance_windows_shift_type_idx on config_attendance_windows(shift_type);
create index if not exists attendance_events_daily_record_id_idx on attendance_events(attendance_daily_record_id);
create index if not exists attendance_events_action_type_idx on attendance_events(action_type);

insert into attendance_events (
  attendance_daily_record_id,
  action_type,
  occurred_at,
  latitude,
  longitude,
  accuracy_m,
  zone_id,
  mdm_verified,
  camera_test,
  source,
  updated_at
)
select
  record.id,
  event.action_type,
  event.occurred_at,
  event.latitude,
  event.longitude,
  event.accuracy_m,
  event.zone_id,
  event.mdm_verified,
  event.camera_test,
  'daily_record_sync',
  now()
from attendance_daily_records as record
cross join lateral (
  values
    ('check_in'::text, record.check_in_at, record.check_in_lat, record.check_in_lng, record.check_in_accuracy_m, record.check_in_zone_id, record.check_in_mdm_verified, record.check_in_camera_test),
    ('tbm_morning'::text, coalesce(record.tbm_morning_at, record.tbm_at), coalesce(record.tbm_morning_lat, record.tbm_lat), coalesce(record.tbm_morning_lng, record.tbm_lng), coalesce(record.tbm_morning_accuracy_m, record.tbm_accuracy_m), coalesce(record.tbm_morning_zone_id, record.tbm_zone_id), null::boolean, null::text),
    ('lunch_register'::text, record.lunch_register_at, record.lunch_register_lat, record.lunch_register_lng, record.lunch_register_accuracy_m, record.lunch_register_zone_id, record.lunch_register_mdm_verified, record.lunch_register_camera_test),
    ('lunch_out'::text, record.lunch_out_at, record.lunch_out_lat, record.lunch_out_lng, record.lunch_out_accuracy_m, record.lunch_out_zone_id, null::boolean, null::text),
    ('lunch_in'::text, record.lunch_in_at, record.lunch_in_lat, record.lunch_in_lng, record.lunch_in_accuracy_m, record.lunch_in_zone_id, record.lunch_in_mdm_verified, record.lunch_in_camera_test),
    ('tbm_afternoon'::text, record.tbm_afternoon_at, record.tbm_afternoon_lat, record.tbm_afternoon_lng, record.tbm_afternoon_accuracy_m, record.tbm_afternoon_zone_id, null::boolean, null::text),
    ('tbm_checkout'::text, record.tbm_checkout_at, record.tbm_checkout_lat, record.tbm_checkout_lng, record.tbm_checkout_accuracy_m, record.tbm_checkout_zone_id, null::boolean, null::text),
    ('check_out'::text, record.check_out_at, record.check_out_lat, record.check_out_lng, record.check_out_accuracy_m, record.check_out_zone_id, record.check_out_mdm_verified, record.check_out_camera_test)
) as event(action_type, occurred_at, latitude, longitude, accuracy_m, zone_id, mdm_verified, camera_test)
where event.occurred_at is not null
on conflict (attendance_daily_record_id, action_type) do update set
  occurred_at = excluded.occurred_at,
  latitude = excluded.latitude,
  longitude = excluded.longitude,
  accuracy_m = excluded.accuracy_m,
  zone_id = excluded.zone_id,
  mdm_verified = excluded.mdm_verified,
  camera_test = excluded.camera_test,
  source = excluded.source,
  updated_at = now();

create or replace function sync_attendance_events_from_daily_record()
returns trigger
language plpgsql
as $$
begin
  with current_events(action_type, occurred_at, latitude, longitude, accuracy_m, zone_id, mdm_verified, camera_test) as (
    values
      ('check_in'::text, new.check_in_at, new.check_in_lat, new.check_in_lng, new.check_in_accuracy_m, new.check_in_zone_id, new.check_in_mdm_verified, new.check_in_camera_test),
      ('tbm_morning'::text, coalesce(new.tbm_morning_at, new.tbm_at), coalesce(new.tbm_morning_lat, new.tbm_lat), coalesce(new.tbm_morning_lng, new.tbm_lng), coalesce(new.tbm_morning_accuracy_m, new.tbm_accuracy_m), coalesce(new.tbm_morning_zone_id, new.tbm_zone_id), null::boolean, null::text),
      ('lunch_register'::text, new.lunch_register_at, new.lunch_register_lat, new.lunch_register_lng, new.lunch_register_accuracy_m, new.lunch_register_zone_id, new.lunch_register_mdm_verified, new.lunch_register_camera_test),
      ('lunch_out'::text, new.lunch_out_at, new.lunch_out_lat, new.lunch_out_lng, new.lunch_out_accuracy_m, new.lunch_out_zone_id, null::boolean, null::text),
      ('lunch_in'::text, new.lunch_in_at, new.lunch_in_lat, new.lunch_in_lng, new.lunch_in_accuracy_m, new.lunch_in_zone_id, new.lunch_in_mdm_verified, new.lunch_in_camera_test),
      ('tbm_afternoon'::text, new.tbm_afternoon_at, new.tbm_afternoon_lat, new.tbm_afternoon_lng, new.tbm_afternoon_accuracy_m, new.tbm_afternoon_zone_id, null::boolean, null::text),
      ('tbm_checkout'::text, new.tbm_checkout_at, new.tbm_checkout_lat, new.tbm_checkout_lng, new.tbm_checkout_accuracy_m, new.tbm_checkout_zone_id, null::boolean, null::text),
      ('check_out'::text, new.check_out_at, new.check_out_lat, new.check_out_lng, new.check_out_accuracy_m, new.check_out_zone_id, new.check_out_mdm_verified, new.check_out_camera_test)
  ),
  deleted as (
    delete from attendance_events
    where attendance_daily_record_id = new.id
      and source = 'daily_record_sync'
      and action_type in ('check_in', 'tbm_morning', 'lunch_register', 'lunch_out', 'lunch_in', 'tbm_afternoon', 'tbm_checkout', 'check_out')
      and action_type not in (
        select current_events.action_type
        from current_events
        where current_events.occurred_at is not null
      )
    returning 1
  )
  insert into attendance_events (
    attendance_daily_record_id,
    action_type,
    occurred_at,
    latitude,
    longitude,
    accuracy_m,
    zone_id,
    mdm_verified,
    camera_test,
    source,
    updated_at
  )
  select
    new.id,
    current_events.action_type,
    current_events.occurred_at,
    current_events.latitude,
    current_events.longitude,
    current_events.accuracy_m,
    current_events.zone_id,
    current_events.mdm_verified,
    current_events.camera_test,
    'daily_record_sync',
    now()
  from current_events
  where current_events.occurred_at is not null
  on conflict (attendance_daily_record_id, action_type) do update set
    occurred_at = excluded.occurred_at,
    latitude = excluded.latitude,
    longitude = excluded.longitude,
    accuracy_m = excluded.accuracy_m,
    zone_id = excluded.zone_id,
    mdm_verified = excluded.mdm_verified,
    camera_test = excluded.camera_test,
    source = excluded.source,
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists attendance_daily_records_sync_events on attendance_daily_records;

create trigger attendance_daily_records_sync_events
after insert or update on attendance_daily_records
for each row
execute function sync_attendance_events_from_daily_record();

comment on table org_departments is '부서';
comment on table account_roles is '계정 권한 정의';
comment on table account_users is '사용자 계정';
comment on column account_users.role is '권한: user=대원, sub_admin=조장, admin=팀장, master=마스터';
comment on column account_users.is_active is 'false면 비활성 계정. 출퇴근 기록 보존을 위해 삭제 대신 사용';
comment on table geo_zones is 'GPS 인증 구역';
comment on table work_rosters is '근무 편성';
comment on table attendance_daily_records is '일자별 출퇴근 요약 기록. 신규 이벤트 확장은 attendance_events 사용';
comment on table attendance_event_types is '출퇴근 이벤트 종류';
comment on table attendance_events is '출근/TBM/점심/퇴근 등 개별 이벤트 로그. 새 이벤트 추가 시 컬럼 추가 대신 행으로 저장';
comment on table audit_attendance_logs is '출퇴근 정정 감사 로그';
comment on table config_global_settings is '전체 운영 설정';
comment on table config_department_settings is '부서별 기본 시간 설정';
comment on table config_attendance_windows is '부서별/근무유형별/액션별 허용 시간창';

create or replace view departments as select * from org_departments;
create or replace view users as select * from account_users;
create or replace view zones as select * from geo_zones;
create or replace view roster_entries as select * from work_rosters;
create or replace view attendance_records as select * from attendance_daily_records;
create or replace view audit_logs as select * from audit_attendance_logs;
create or replace view app_settings as select * from config_global_settings;
create or replace view department_settings as select * from config_department_settings;
create or replace view department_attendance_windows as select * from config_attendance_windows;

create or replace view "부서" as select * from org_departments;
create or replace view "사용자_계정" as select * from account_users;
create or replace view "GPS_인증구역" as select * from geo_zones;
create or replace view "근무편성" as select * from work_rosters;
create or replace view "출퇴근_일자별기록" as select * from attendance_daily_records;
create or replace view "출퇴근_이벤트" as select * from attendance_events;
create or replace view "출퇴근_정정로그" as select * from audit_attendance_logs;
create or replace view "전체_운영설정" as select * from config_global_settings;
create or replace view "부서별_시간설정" as select * from config_department_settings;
create or replace view "부서별_허용시간창" as select * from config_attendance_windows;
