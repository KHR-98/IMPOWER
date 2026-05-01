-- Record of the department attendance windows SQL that was applied manually.
-- Do not run this blindly against production if the manual SQL has already been applied;
-- check the current database state first.

create table if not exists department_attendance_windows (
  id uuid primary key default gen_random_uuid(),
  department_id uuid not null references departments(id) on delete cascade,
  shift_type text not null check (shift_type in ('day', 'late', 'weekend')),
  action_type text not null check (
    action_type in (
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
  window_start text not null,
  window_end text not null,
  is_enabled boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (department_id, shift_type, action_type)
);

create index if not exists department_attendance_windows_department_id_idx
  on department_attendance_windows(department_id);

create index if not exists department_attendance_windows_shift_type_idx
  on department_attendance_windows(shift_type);

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

do $$
begin
  if exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'roster_entries'
      and constraint_name = 'roster_entries_shift_type_check'
  ) then
    alter table roster_entries drop constraint roster_entries_shift_type_check;
  end if;
end $$;

alter table roster_entries
  add constraint roster_entries_shift_type_check
  check (shift_type in ('day', 'late', 'weekend'));
