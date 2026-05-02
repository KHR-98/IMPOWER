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
  departments.department_id,
  'weekend',
  windows.action_type,
  '11:30',
  '13:50',
  true,
  windows.sort_order
from (
  select id as department_id
  from org_departments
  union
  select department_id
  from config_department_settings
) as departments
cross join (
  values
    ('lunch_register'::text, 20),
    ('lunch_out'::text, 21),
    ('lunch_in'::text, 22)
) as windows(action_type, sort_order)
on conflict (department_id, shift_type, action_type) do update set
  window_start = excluded.window_start,
  window_end = excluded.window_end,
  is_enabled = true,
  sort_order = excluded.sort_order,
  updated_at = now();

update config_attendance_windows
set sort_order = 30,
    updated_at = now()
where shift_type = 'weekend'
  and action_type = 'check_out'
  and sort_order <> 30;
