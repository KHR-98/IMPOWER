create extension if not exists pgcrypto;

create table if not exists org_departments (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists account_roles (
  code text primary key check (code in ('user', 'sub_admin', 'admin', 'master')),
  label_ko text not null,
  description_ko text,
  sort_order integer not null default 0,
  is_active boolean not null default true
);

create table if not exists account_users (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  display_name text not null,
  password_hash text,
  kakao_id text unique,
  role text not null references account_roles(code),
  department_id uuid not null references org_departments(id),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists account_users_department_id_idx on account_users(department_id);

create table if not exists geo_zones (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null check (type in ('entry', 'tbm')),
  latitude double precision not null,
  longitude double precision not null,
  radius_m integer not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists work_rosters (
  id uuid primary key default gen_random_uuid(),
  work_date date not null,
  username text not null references account_users(username),
  is_scheduled boolean not null,
  shift_type text not null default 'day' check (shift_type in ('day', 'late', 'weekend')),
  allow_lunch_out boolean not null default false,
  source_row_key text,
  synced_at timestamptz not null default now(),
  unique (work_date, username)
);

create index if not exists work_rosters_work_date_username_idx
  on work_rosters (work_date, username);

create table if not exists attendance_daily_records (
  id uuid primary key default gen_random_uuid(),
  work_date date not null,
  username text not null references account_users(username),
  display_name text not null,
  check_in_at timestamptz,
  check_in_lat double precision,
  check_in_lng double precision,
  check_in_accuracy_m double precision,
  check_in_zone_id uuid references geo_zones(id),
  check_in_mdm_verified boolean,
  check_in_camera_test text,
  tbm_at timestamptz,
  tbm_lat double precision,
  tbm_lng double precision,
  tbm_accuracy_m double precision,
  tbm_zone_id uuid references geo_zones(id),
  tbm_morning_at timestamptz,
  tbm_morning_lat double precision,
  tbm_morning_lng double precision,
  tbm_morning_accuracy_m double precision,
  tbm_morning_zone_id uuid references geo_zones(id),
  lunch_register_at timestamptz,
  lunch_register_lat double precision,
  lunch_register_lng double precision,
  lunch_register_accuracy_m double precision,
  lunch_register_zone_id uuid references geo_zones(id),
  lunch_register_mdm_verified boolean,
  lunch_register_camera_test text,
  lunch_out_at timestamptz,
  lunch_out_lat double precision,
  lunch_out_lng double precision,
  lunch_out_accuracy_m double precision,
  lunch_out_zone_id uuid references geo_zones(id),
  lunch_in_at timestamptz,
  lunch_in_lat double precision,
  lunch_in_lng double precision,
  lunch_in_accuracy_m double precision,
  lunch_in_zone_id uuid references geo_zones(id),
  lunch_in_mdm_verified boolean,
  lunch_in_camera_test text,
  tbm_afternoon_at timestamptz,
  tbm_afternoon_lat double precision,
  tbm_afternoon_lng double precision,
  tbm_afternoon_accuracy_m double precision,
  tbm_afternoon_zone_id uuid references geo_zones(id),
  tbm_checkout_at timestamptz,
  tbm_checkout_lat double precision,
  tbm_checkout_lng double precision,
  tbm_checkout_accuracy_m double precision,
  tbm_checkout_zone_id uuid references geo_zones(id),
  check_out_at timestamptz,
  check_out_lat double precision,
  check_out_lng double precision,
  check_out_accuracy_m double precision,
  check_out_zone_id uuid references geo_zones(id),
  check_out_mdm_verified boolean,
  check_out_camera_test text,
  corrected_by_admin boolean not null default false,
  correction_note text,
  updated_at timestamptz not null default now(),
  unique (work_date, username)
);

create index if not exists attendance_daily_records_work_date_username_idx
  on attendance_daily_records (work_date, username);

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

create index if not exists attendance_events_daily_record_id_idx
  on attendance_events(attendance_daily_record_id);

create index if not exists attendance_events_action_type_idx
  on attendance_events(action_type);

create table if not exists audit_attendance_logs (
  id uuid primary key default gen_random_uuid(),
  target_record_id uuid not null references attendance_daily_records(id) on delete cascade,
  action_type text not null,
  before_json jsonb,
  after_json jsonb,
  reason text not null,
  actor_name text not null,
  created_at timestamptz not null default now()
);

create table if not exists config_global_settings (
  id uuid primary key default gen_random_uuid(),
  check_in_start text not null,
  check_in_end text not null,
  tbm_start text not null,
  tbm_end text not null,
  tbm_afternoon_start text not null default '13:35',
  tbm_afternoon_end text not null default '13:45',
  tbm_checkout_start text not null default '16:30',
  tbm_checkout_end text not null default '16:45',
  check_out_start text not null,
  check_out_end text not null,
  late_check_in_start text not null default '09:00',
  late_check_in_end text not null default '11:00',
  late_check_out_start text not null default '19:30',
  late_check_out_end text not null default '21:00',
  max_gps_accuracy_m integer not null,
  google_sheet_id text,
  google_sheet_tab_name text,
  created_at timestamptz not null default now()
);

create table if not exists config_department_settings (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null unique references org_departments(id) on delete cascade,
  day_check_in_start text not null default '06:00',
  day_check_in_end text not null default '08:30',
  day_tbm_start text not null default '06:00',
  day_tbm_end text not null default '08:30',
  day_tbm_afternoon_start text not null default '13:35',
  day_tbm_afternoon_end text not null default '13:45',
  day_tbm_checkout_start text not null default '16:30',
  day_tbm_checkout_end text not null default '16:45',
  day_check_out_start text not null default '16:30',
  day_check_out_end text not null default '18:00',
  late_check_in_start text not null default '09:00',
  late_check_in_end text not null default '11:00',
  late_check_out_start text not null default '19:30',
  late_check_out_end text not null default '21:00',
  updated_at timestamptz not null default now()
);

create table if not exists config_attendance_windows (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references org_departments(id) on delete cascade,
  shift_type text not null check (shift_type in ('day', 'late', 'weekend')),
  action_type text not null references attendance_event_types(code),
  window_start text not null,
  window_end text not null,
  is_enabled boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (department_id, shift_type, action_type)
);

create index if not exists config_attendance_windows_department_id_idx
  on config_attendance_windows(department_id);

create index if not exists config_attendance_windows_shift_type_idx
  on config_attendance_windows(shift_type);

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
create or replace view "권한 정의" as select * from account_roles;
create or replace view "계정" as select * from account_users;
create or replace view "출결구역" as select * from geo_zones;
create or replace view "출결대상자" as select * from work_rosters;
create or replace view "출결 일자정리표" as select * from attendance_daily_records;
create or replace view "출퇴근 이벤트 종류" as select * from attendance_event_types;
create or replace view "출결버튼클릭시간" as select * from attendance_events;
create or replace view "출결 정정기록" as select * from audit_attendance_logs;
create or replace view "전체 데이터 설정" as select * from config_global_settings;
create or replace view "부서별 근무시간" as select * from config_department_settings;
create or replace view "부서별 버튼활성화시간" as select * from config_attendance_windows;
