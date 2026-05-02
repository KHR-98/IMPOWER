insert into departments (code, name, is_active)
values
  ('memory_pcs', '메모리PCS', true),
  ('foundry_pcs', '파운드리PCS', true),
  ('memory', '메모리', true)
on conflict (code) do update set
  name = excluded.name,
  is_active = excluded.is_active;

with default_department as (
  select id from departments where code = 'memory_pcs'
)
insert into users (username, display_name, password_hash, role, department_id, is_active)
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

update users
set department_id = (select id from departments where code = 'memory_pcs')
where department_id is null;

insert into department_settings (
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
from departments
on conflict (department_id) do nothing;

insert into department_attendance_windows (
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
  from department_settings
  union all
  select department_id, 'day', 'tbm_morning', day_tbm_start, day_tbm_end, 20
  from department_settings
  union all
  select department_id, 'day', 'tbm_afternoon', day_tbm_afternoon_start, day_tbm_afternoon_end, 30
  from department_settings
  union all
  select department_id, 'day', 'tbm_checkout', day_tbm_checkout_start, day_tbm_checkout_end, 40
  from department_settings
  union all
  select department_id, 'day', 'check_out', day_check_out_start, day_check_out_end, 50
  from department_settings
  union all
  select department_id, 'late', 'check_in', late_check_in_start, late_check_in_end, 10
  from department_settings
  union all
  select department_id, 'late', 'check_out', late_check_out_start, late_check_out_end, 20
  from department_settings
  union all
  select department_id, 'weekend', 'check_in', day_check_in_start, day_check_in_end, 10
  from department_settings
  union all
  select department_id, 'weekend', 'check_out', day_check_out_start, day_check_out_end, 20
  from department_settings
) as copied_windows
on conflict (department_id, shift_type, action_type) do update set
  window_start = excluded.window_start,
  window_end = excluded.window_end,
  is_enabled = excluded.is_enabled,
  sort_order = excluded.sort_order,
  updated_at = now();

insert into zones (name, type, latitude, longitude, radius_m, is_active)
values
  ('정문', 'entry', 37.56652, 126.97802, 120, true),
  ('사무실 입구', 'entry', 37.56618, 126.97775, 90, true),
  ('TBM 집합장', 'tbm', 37.56674, 126.97855, 80, true)
on conflict do nothing;

insert into app_settings (
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
