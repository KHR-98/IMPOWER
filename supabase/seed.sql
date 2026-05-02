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

insert into org_departments (code, name, is_active)
values
  ('memory_pcs', '메모리PCS', true),
  ('foundry_pcs', '파운드리PCS', true),
  ('memory', '메모리', true)
on conflict (code) do update set
  name = excluded.name,
  is_active = excluded.is_active;

with default_department as (
  select id from org_departments where code = 'memory_pcs'
)
insert into account_users (username, display_name, password_hash, role, department_id, is_active)
select username, display_name, password_hash, role, default_department.id, is_active
from default_department
cross join (
  values
    ('admin', '현장관리자', '$2b$10$pbXhDCtBiC3R6XScP153k.tnnM36/fEdDgkuceuxP.LhIzb3AKVHW', 'admin', true),
    ('kim', '김민수', '$2b$10$pbXhDCtBiC3R6XScP153k.tnnM36/fEdDgkuceuxP.LhIzb3AKVHW', 'user', true),
    ('park', '박지훈', '$2b$10$pbXhDCtBiC3R6XScP153k.tnnM36/fEdDgkuceuxP.LhIzb3AKVHW', 'user', true),
    ('choi', '최유진', '$2b$10$pbXhDCtBiC3R6XScP153k.tnnM36/fEdDgkuceuxP.LhIzb3AKVHW', 'user', true),
    ('lee', '이서준', '$2b$10$pbXhDCtBiC3R6XScP153k.tnnM36/fEdDgkuceuxP.LhIzb3AKVHW', 'user', true)
) as seed_users(username, display_name, password_hash, role, is_active)
on conflict (username) do nothing;

update account_users
set department_id = (select id from org_departments where code = 'memory_pcs')
where department_id is null;

insert into config_department_settings (
  department_id,
  day_check_in_start,
  day_check_in_end,
  day_tbm_start,
  day_tbm_end,
  day_tbm_afternoon_start,
  day_tbm_afternoon_end,
  day_tbm_checkout_start,
  day_tbm_checkout_end,
  day_check_out_start,
  day_check_out_end,
  late_check_in_start,
  late_check_in_end,
  late_check_out_start,
  late_check_out_end
)
select
  id,
  '06:00',
  '08:30',
  '06:00',
  '08:30',
  '13:35',
  '13:45',
  '16:30',
  '16:45',
  '16:30',
  '18:00',
  '09:00',
  '11:00',
  '19:30',
  '21:00'
from org_departments
on conflict (department_id) do nothing;

insert into config_attendance_windows (
  department_id,
  shift_type,
  action_type,
  window_start,
  window_end,
  is_enabled,
  sort_order
)
select
  department_id,
  shift_type,
  action_type,
  window_start,
  window_end,
  true,
  sort_order
from (
  select department_id, 'day'::text as shift_type, 'check_in'::text as action_type, day_check_in_start as window_start, day_check_in_end as window_end, 10 as sort_order
  from config_department_settings
  union all
  select department_id, 'day', 'tbm_morning', day_tbm_start, day_tbm_end, 20
  from config_department_settings
  union all
  select department_id, 'day', 'tbm_afternoon', day_tbm_afternoon_start, day_tbm_afternoon_end, 30
  from config_department_settings
  union all
  select department_id, 'day', 'tbm_checkout', day_tbm_checkout_start, day_tbm_checkout_end, 40
  from config_department_settings
  union all
  select department_id, 'day', 'check_out', day_check_out_start, day_check_out_end, 50
  from config_department_settings
  union all
  select department_id, 'late', 'check_in', late_check_in_start, late_check_in_end, 10
  from config_department_settings
  union all
  select department_id, 'late', 'check_out', late_check_out_start, late_check_out_end, 20
  from config_department_settings
  union all
  select department_id, 'weekend', 'check_in', day_check_in_start, day_check_in_end, 10
  from config_department_settings
  union all
  select department_id, 'weekend', 'check_out', day_check_out_start, day_check_out_end, 20
  from config_department_settings
) as copied_windows
on conflict (department_id, shift_type, action_type) do update set
  window_start = excluded.window_start,
  window_end = excluded.window_end,
  is_enabled = excluded.is_enabled,
  sort_order = excluded.sort_order,
  updated_at = now();

insert into geo_zones (name, type, latitude, longitude, radius_m, is_active)
values
  ('정문', 'entry', 37.56652, 126.97802, 120, true),
  ('사무실 입구', 'entry', 37.56618, 126.97775, 90, true),
  ('TBM 집합장', 'tbm', 37.56674, 126.97855, 80, true)
on conflict do nothing;

insert into config_global_settings (
  check_in_start,
  check_in_end,
  tbm_start,
  tbm_end,
  check_out_start,
  check_out_end,
  max_gps_accuracy_m,
  google_sheet_id,
  google_sheet_tab_name
)
values ('05:30', '10:30', '06:00', '11:00', '15:00', '23:00', 120, null, 'Roster');
